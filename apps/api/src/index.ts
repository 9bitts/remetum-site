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
    global: false,
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
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
