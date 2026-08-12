import type { FastifyInstance } from "fastify";
import {
  getLivekitUrl,
  livekitConfigured,
  verifyLivekitCredentials,
} from "../services/livekit.js";
import { config } from "../config.js";

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

  app.get("/calls/self-test", { preHandler: [app.authenticate] }, async () => {
    return verifyLivekitCredentials();
  });
}
