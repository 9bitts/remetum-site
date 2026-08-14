import type { FastifyInstance } from "fastify";
import {
  getLivekitUrl,
  livekitConfigured,
  verifyLivekitCredentials,
} from "../services/livekit.js";
import { config } from "../config.js";

export async function callRoutes(app: FastifyInstance) {
  app.get("/calls/config", { preHandler: [app.authenticate] }, async () => {
    return {
      enabled: livekitConfigured(),
      url: getLivekitUrl(),
    };
  });

  // Diagnostics only outside production
  if (!config.isProduction) {
    app.get(
      "/calls/self-test",
      { preHandler: [app.authenticate] },
      async () => verifyLivekitCredentials(),
    );
  }
}
