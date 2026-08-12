import type { FastifyInstance } from "fastify";
import { getLivekitUrl, livekitConfigured } from "../services/livekit.js";

export async function callRoutes(app: FastifyInstance) {
  app.get("/calls/config", { preHandler: [app.authenticate] }, async () => {
    return {
      enabled: livekitConfigured(),
      url: getLivekitUrl(),
    };
  });
}
