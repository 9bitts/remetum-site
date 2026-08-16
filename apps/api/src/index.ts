import { spawn } from "node:child_process";
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
import { createSocketServer } from "./sockets/index.js";
import { config } from "./config.js";

function syncSchemaInBackground(log: {
  info: (o: unknown, msg?: string) => void;
  error: (o: unknown, msg?: string) => void;
}) {
  // Never block listen/health — Railway marks the deploy failed if push hangs.
  const child = spawn(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["prisma", "db", "push", "--skip-generate"],
    {
      cwd: process.cwd(),
      env: process.env,
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
}

async function main() {
  const app = Fastify({
    logger: true,
    bodyLimit: config.upload.maxBytes,
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

  await app.listen({ port: config.port, host: "0.0.0.0" });

  createSocketServer(app.server, config.corsOrigins);
  app.log.info(`Remetum API listening on :${config.port}`);
  syncSchemaInBackground(app.log);
}

process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection]", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[uncaughtException]", err);
});

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
