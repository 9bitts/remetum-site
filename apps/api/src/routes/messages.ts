import type { FastifyInstance } from "fastify";
import { SOCKET_EVENTS } from "@ebano/shared";
import { forwardMessage } from "../services/messages.js";
import { getIo } from "../sockets/io.js";

type ErrLike = { statusCode?: number; message: string };

function sendError(
  reply: { code: (n: number) => { send: (b: unknown) => unknown } },
  err: unknown,
) {
  const e = err as ErrLike;
  return reply.code(e.statusCode ?? 500).send({ error: e.message || "Erro interno" });
}

export async function messageRoutes(app: FastifyInstance) {
  app.post<{
    Params: { id: string };
    Body: { conversationIds?: string[] };
  }>("/messages/:id/forward", { preHandler: [app.authenticate] }, async (request, reply) => {
    try {
      const conversationIds = request.body?.conversationIds ?? [];
      if (!Array.isArray(conversationIds) || conversationIds.length === 0) {
        return reply.code(400).send({ error: "conversationIds é obrigatório" });
      }

      const messages = await forwardMessage(
        request.userId!,
        request.params.id,
        conversationIds,
      );

      const io = getIo();
      if (io) {
        for (const message of messages) {
          io.to(`conversation:${message.conversationId}`).emit(
            SOCKET_EVENTS.MESSAGE_NEW,
            { message },
          );
        }
      }

      return { messages };
    } catch (err) {
      return sendError(reply, err);
    }
  });
}
