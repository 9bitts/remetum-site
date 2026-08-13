import type { FastifyInstance } from "fastify";
import { sendMedia } from "../services/uploads.js";

export async function mediaRoutes(app: FastifyInstance) {
  app.get<{ Params: { id: string } }>("/media/:id", async (request, reply) => {
    return sendMedia(request.params.id, reply);
  });
}
