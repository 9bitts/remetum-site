import type { FastifyInstance } from "fastify";
import { config, pushEnabled } from "../config.js";
import {
  removePushSubscription,
  savePushSubscription,
} from "../services/push.js";

export async function pushRoutes(app: FastifyInstance) {
  app.get("/push/vapid-public-key", async (_request, reply) => {
    if (!pushEnabled()) {
      return reply.code(503).send({ error: "Push não configurado" });
    }
    return { publicKey: config.vapid.publicKey };
  });

  app.post<{
    Body: {
      endpoint?: string;
      keys?: { p256dh?: string; auth?: string };
    };
  }>("/push/subscribe", { preHandler: [app.authenticate] }, async (request, reply) => {
    if (!pushEnabled()) {
      return reply.code(503).send({ error: "Push não configurado" });
    }
    const endpoint = request.body?.endpoint;
    const p256dh = request.body?.keys?.p256dh;
    const auth = request.body?.keys?.auth;
    if (!endpoint || !p256dh || !auth) {
      return reply.code(400).send({ error: "Subscription inválida" });
    }

    try {
      await savePushSubscription({
        userId: request.userId!,
        endpoint,
        p256dh,
        auth,
      });
      return { ok: true };
    } catch (err) {
      const e = err as { statusCode?: number; message: string };
      return reply
        .code(e.statusCode ?? 500)
        .send({ error: e.message || "Falha ao salvar subscription" });
    }
  });

  app.post<{ Body: { endpoint?: string } }>(
    "/push/unsubscribe",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const endpoint = request.body?.endpoint;
      if (!endpoint) {
        return reply.code(400).send({ error: "endpoint obrigatório" });
      }
      await removePushSubscription(endpoint, request.userId!);
      return { ok: true };
    },
  );
}
