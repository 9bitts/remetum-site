import type { FastifyInstance } from "fastify";
import { sendMedia } from "../services/uploads.js";

export async function mediaRoutes(app: FastifyInstance) {
  app.get<{ Params: { id: string } }>(
    "/media/:id",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      return sendMedia(request.params.id, reply, request.userId!);
    },
  );
}
