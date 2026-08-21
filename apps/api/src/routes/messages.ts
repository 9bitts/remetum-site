import type { FastifyInstance } from "fastify";
import { SOCKET_EVENTS } from "@ebano/shared";
import { forwardMessage } from "../services/messages.js";
import { getIo } from "../sockets/io.js";
import { notifyNewMessage } from "../services/notify.js";
import { prisma } from "../prisma.js";

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
      const sender = await prisma.user.findUnique({
        where: { id: request.userId! },
        select: { name: true },
      });
      const senderName = sender?.name ?? "Alguém";
      if (io) {
        for (const message of messages) {
          io.to(`conversation:${message.conversationId}`).emit(
            SOCKET_EVENTS.MESSAGE_NEW,
            { message },
          );
        }
      }
      await Promise.all(
        messages.map((message) =>
          notifyNewMessage({
            conversationId: message.conversationId,
            senderId: request.userId!,
            senderName,
            type: message.type,
            content: message.content,
            replyToSenderId: message.replyTo?.senderId ?? null,
          }),
        ),
      );

      return { messages };
    } catch (err) {
      return sendError(reply, err);
    }
  });
}
