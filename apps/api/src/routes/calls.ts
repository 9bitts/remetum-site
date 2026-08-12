import type { FastifyInstance } from "fastify";
import { config } from "../config.js";
import { getLivekitUrl, livekitConfigured } from "../services/livekit.js";

export async function callRoutes(app: FastifyInstance) {
  app.get("/calls/config", { preHandler: [app.authenticate] }, async () => {
    const key = config.livekit.apiKey;
    return {
      enabled: livekitConfigured(),
      url: getLivekitUrl(),
      keyPrefix: key ? key.slice(0, 6) : null,
      keyLength: key.length,
      secretLength: config.livekit.apiSecret.length,
    };
  });
}
