import type { FastifyInstance } from "fastify";
import { SOCKET_EVENTS } from "@ebano/shared";
import {
  createStatus,
  listStatusesForUser,
  viewStatus,
} from "../services/status.js";
import { getContactUserIds } from "../services/presence.js";
import { notifyStatus } from "../services/notify.js";
import { getIo } from "../sockets/io.js";
import { prisma } from "../prisma.js";

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
      const author = await prisma.user.findUnique({
        where: { id: request.userId! },
        select: { name: true },
      });
      const recipientIds = await getContactUserIds(request.userId!);
      const authorName = author?.name ?? "Alguém";
      const io = getIo();
      if (io) {
        for (const id of recipientIds) {
          io.to(`user:${id}`).emit(SOCKET_EVENTS.STATUS_NEW, {
            userId: request.userId,
            userName: authorName,
          });
        }
      }
      void notifyStatus({
        authorId: request.userId!,
        authorName,
        recipientIds,
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
