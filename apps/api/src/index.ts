import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import authPlugin from "./plugins/auth.js";
import { healthRoutes } from "./routes/health.js";
import { authRoutes } from "./routes/auth.js";
import { conversationRoutes } from "./routes/conversations.js";
import { userRoutes } from "./routes/users.js";
import { uploadRoutes } from "./routes/uploads.js";
import { pushRoutes } from "./routes/push.js";
import { createSocketServer } from "./sockets/index.js";
import { config } from "./config.js";
import { getUploadsDir } from "./services/uploads.js";
import { mkdir } from "node:fs/promises";

async function main() {
  const app = Fastify({ logger: true });

  await app.register(cors, {
    origin: config.corsOrigin,
    credentials: true,
  });

  await app.register(cookie);
  await app.register(rateLimit, {
    global: false,
  });
  await app.register(authPlugin);

  const uploadsDir = getUploadsDir();
  await mkdir(uploadsDir, { recursive: true });
  await app.register(fastifyStatic, {
    root: uploadsDir,
    prefix: "/media/",
    decorateReply: false,
  });

  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(conversationRoutes);
  await app.register(userRoutes);
  await app.register(uploadRoutes);
  await app.register(pushRoutes);

  await app.listen({ port: config.port, host: "0.0.0.0" });

  createSocketServer(app.server, config.corsOrigin);
  app.log.info(`Remetum API listening on :${config.port}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
