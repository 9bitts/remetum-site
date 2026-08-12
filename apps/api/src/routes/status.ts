import type { FastifyInstance } from "fastify";
import {
  createStatus,
  listStatusesForUser,
  viewStatus,
} from "../services/status.js";

export async function statusRoutes(app: FastifyInstance) {
  app.get("/status", { preHandler: [app.authenticate] }, async (request) => {
    const statuses = await listStatusesForUser(request.userId!);
    return { statuses };
  });

  app.post<{
    Body: {
      type?: "text" | "image" | "video";
      content?: string;
      mediaUrl?: string;
    };
  }>("/status", { preHandler: [app.authenticate] }, async (request, reply) => {
    try {
      const type = request.body?.type ?? "text";
      const status = await createStatus({
        userId: request.userId!,
        type,
        content: request.body?.content,
        mediaUrl: request.body?.mediaUrl,
      });
      return reply.code(201).send({ status });
    } catch (err) {
      const e = err as { statusCode?: number; message: string };
      return reply.code(e.statusCode ?? 500).send({ error: e.message });
    }
  });

  app.post<{ Params: { id: string } }>(
    "/status/:id/view",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      try {
        await viewStatus(request.params.id, request.userId!);
        return { ok: true };
      } catch (err) {
        const e = err as { statusCode?: number; message: string };
        return reply.code(e.statusCode ?? 500).send({ error: e.message });
      }
    },
  );
}
