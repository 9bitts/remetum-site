import { spawn } from "node:child_process";
import type {
  IncomingMessage,
  Server as HttpServer,
  ServerResponse,
} from "node:http";
import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import authPlugin from "./plugins/auth.js";
import { healthRoutes } from "./routes/health.js";
import { authRoutes } from "./routes/auth.js";
import { conversationRoutes } from "./routes/conversations.js";
import { messageRoutes } from "./routes/messages.js";
import { callRoutes } from "./routes/calls.js";
import { userRoutes } from "./routes/users.js";
import { uploadRoutes } from "./routes/uploads.js";
import { mediaRoutes } from "./routes/media.js";
import { pushRoutes } from "./routes/push.js";
import { statusRoutes } from "./routes/status.js";
import { config } from "./config.js";

type RequestListener = (req: IncomingMessage, res: ServerResponse) => void;

function syncSchemaInBackground(log: {
  info: (o: unknown, msg?: string) => void;
  error: (o: unknown, msg?: string) => void;
}) {
  const child = spawn(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["prisma", "db", "push", "--skip-generate"],
    {
      cwd: process.cwd(),
      env: { ...process.env, CI: "true" },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  let stderr = "";
  child.stderr?.on("data", (chunk: Buffer) => {
    stderr += chunk.toString();
  });
  child.stdout?.on("data", (chunk: Buffer) => {
    const line = chunk.toString().trim();
    if (line) log.info({ prisma: line }, "db push");
  });
  child.on("error", (err) => {
    log.error({ err }, "failed to start prisma db push");
  });
  child.on("exit", (code) => {
    if (code === 0) {
      log.info("database schema synced");
      return;
    }
    log.error({ code, stderr: stderr.slice(-2000) }, "prisma db push exited");
  });

  const timer = setTimeout(() => {
    if (child.exitCode !== null) return;
    log.error("prisma db push timed out; killing so the API stays up");
    child.kill("SIGKILL");
  }, 45_000);
  child.on("exit", () => clearTimeout(timer));
}

export async function attachApp(
  server: HttpServer,
  bootHandler: RequestListener,
) {
  let fastifyHandler: RequestListener | null = null;

  const app = Fastify({
    logger: true,
    bodyLimit: config.upload.maxBytes,
    serverFactory(handler) {
      fastifyHandler = handler;
      return server;
    },
  });

  await app.register(cors, {
    origin: (origin, cb) => {
      if (!origin) {
        cb(null, true);
        return;
      }
      if (config.corsOrigins.includes(origin)) {
        cb(null, origin);
        return;
      }
      cb(null, false);
    },
    credentials: true,
    methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
      "Accept",
    ],
    maxAge: 86400,
  });

  await app.register(cookie);
  await app.register(rateLimit, {
    global: true,
    max: 300,
    timeWindow: "1 minute",
  });
  await app.register(authPlugin);

  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(conversationRoutes);
  await app.register(messageRoutes);
  await app.register(callRoutes);
  await app.register(userRoutes);
  await app.register(mediaRoutes);
  await app.register(uploadRoutes);
  await app.register(pushRoutes);
  await app.register(statusRoutes);

  await app.ready();

  if (fastifyHandler) {
    server.off("request", bootHandler);
    server.on("request", fastifyHandler);
  }

  try {
    const { createSocketServer } = await import("./sockets/index.js");
    await Promise.race([
      createSocketServer(server, config.corsOrigins),
      new Promise<void>((_, reject) => {
        setTimeout(() => reject(new Error("socket setup timed out")), 8_000);
      }),
    ]);
  } catch (err) {
    app.log.error({ err }, "socket server failed to start; HTTP still up");
  }

  syncSchemaInBackground(app.log);
}
