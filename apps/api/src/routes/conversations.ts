import type { FastifyInstance } from "fastify";
import { SOCKET_EVENTS, type ParticipantRole } from "@ebano/shared";
import {
  createGroupConversation,
  getConversationSummary,
  getOrCreateDirectConversation,
  joinByInviteCode,
  leaveConversation,
  listConversationsForUser,
  listMessages,
  removeMember,
  searchMessages,
  setMemberRole,
  updateConversationPrefs,
  updateGroup,
} from "../services/conversations.js";
import { getIo } from "../sockets/io.js";
import { prisma } from "../prisma.js";

type ErrLike = { statusCode?: number; message: string };

function sendError(
  reply: { code: (n: number) => { send: (b: unknown) => unknown } },
  err: unknown,
) {
  const e = err as ErrLike;
  return reply.code(e.statusCode ?? 500).send({ error: e.message || "Erro interno" });
}

async function notifyConversationMembers(
  conversationId: string,
  reason: "created" | "joined" | "prefs" | "left" | "updated",
  exceptUserId?: string,
) {
  const io = getIo();
  if (!io) return;
  const members = await prisma.conversationParticipant.findMany({
    where: { conversationId },
    select: { userId: true },
  });
  for (const m of members) {
    if (exceptUserId && m.userId === exceptUserId) continue;
    io.to(`user:${m.userId}`).emit(SOCKET_EVENTS.CONVERSATION_UPDATED, {
      conversationId,
      reason,
    });
  }
  if (exceptUserId && reason === "left") {
    io.to(`user:${exceptUserId}`).emit(SOCKET_EVENTS.CONVERSATION_UPDATED, {
      conversationId,
      reason,
    });
  }
}

export async function conversationRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { archived?: string } }>(
    "/conversations",
    { preHandler: [app.authenticate] },
    async (request) => {
      const archived = request.query.archived === "1";
      const conversations = await listConversationsForUser(request.userId!, {
        archived,
      });
      return { conversations };
    },
  );

  app.get<{ Params: { id: string } }>(
    "/conversations/:id",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      try {
        const conversation = await getConversationSummary(
          request.params.id,
          request.userId!,
        );
        return { conversation };
      } catch (err) {
        return sendError(reply, err);
      }
    },
  );

  app.get<{ Params: { id: string }; Querystring: { cursor?: string } }>(
    "/conversations/:id/messages",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      try {
        return await listMessages(
          request.params.id,
          request.userId!,
          request.query.cursor,
        );
      } catch (err) {
        return sendError(reply, err);
      }
    },
  );

  app.patch<{
    Params: { id: string };
    Body: {
      pinned?: boolean;
      archived?: boolean;
      muted?: boolean;
      muteMinutes?: number;
      clearChat?: boolean;
    };
  }>("/conversations/:id/prefs", { preHandler: [app.authenticate] }, async (request, reply) => {
    try {
      const conversation = await updateConversationPrefs(
        request.params.id,
        request.userId!,
        request.body ?? {},
      );
      return { conversation };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post<{ Body: { userId?: string } }>(
    "/conversations/direct",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      try {
        const otherId = request.body?.userId;
        if (!otherId) {
          return reply.code(400).send({ error: "userId é obrigatório" });
        }
        const created = await getOrCreateDirectConversation(
          request.userId!,
          otherId,
        );
        const conversation = await getConversationSummary(
          created.id,
          request.userId!,
        );
        await notifyConversationMembers(created.id, "created", request.userId!);
        return { conversation };
      } catch (err) {
        return sendError(reply, err);
      }
    },
  );

  app.post<{ Body: { name?: string; memberIds?: string[] } }>(
    "/conversations/group",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      try {
        const name = request.body?.name ?? "";
        const memberIds = request.body?.memberIds ?? [];
        const created = await createGroupConversation(
          request.userId!,
          name,
          memberIds,
        );
        const conversation = await getConversationSummary(
          created.id,
          request.userId!,
        );
        await notifyConversationMembers(created.id, "created", request.userId!);
        return reply.code(201).send({ conversation });
      } catch (err) {
        return sendError(reply, err);
      }
    },
  );

  app.post<{ Body: { inviteCode?: string } }>(
    "/conversations/join",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      try {
        const code = request.body?.inviteCode?.trim();
        if (!code) {
          return reply.code(400).send({ error: "inviteCode obrigatório" });
        }
        const created = await joinByInviteCode(request.userId!, code);
        const conversation = await getConversationSummary(
          created.id,
          request.userId!,
        );
        await notifyConversationMembers(created.id, "joined");
        return { conversation };
      } catch (err) {
        return sendError(reply, err);
      }
    },
  );

  app.post<{ Params: { id: string } }>(
    "/conversations/:id/leave",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      try {
        const conversationId = request.params.id;
        await leaveConversation(request.userId!, conversationId);
        await notifyConversationMembers(conversationId, "left", request.userId!);
        return { ok: true };
      } catch (err) {
        return sendError(reply, err);
      }
    },
  );

  app.post<{ Params: { id: string }; Body: { memberId?: string } }>(
    "/conversations/:id/members/remove",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      try {
        const memberId = request.body?.memberId;
        if (!memberId) {
          return reply.code(400).send({ error: "memberId é obrigatório" });
        }
        const conversation = await removeMember(
          request.userId!,
          request.params.id,
          memberId,
        );
        const io = getIo();
        io?.to(`user:${memberId}`).emit(SOCKET_EVENTS.CONVERSATION_UPDATED, {
          conversationId: request.params.id,
          reason: "left",
        });
        await notifyConversationMembers(request.params.id, "updated");
        return { conversation };
      } catch (err) {
        return sendError(reply, err);
      }
    },
  );

  app.post<{
    Params: { id: string };
    Body: { memberId?: string; role?: ParticipantRole };
  }>(
    "/conversations/:id/members/role",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      try {
        const memberId = request.body?.memberId;
        const role = request.body?.role;
        if (!memberId || !role) {
          return reply.code(400).send({ error: "memberId e role são obrigatórios" });
        }
        const conversation = await setMemberRole(
          request.userId!,
          request.params.id,
          memberId,
          role,
        );
        await notifyConversationMembers(request.params.id, "updated");
        return { conversation };
      } catch (err) {
        return sendError(reply, err);
      }
    },
  );

  app.patch<{
    Params: { id: string };
    Body: { name?: string; avatarUrl?: string | null };
  }>("/conversations/:id/group", { preHandler: [app.authenticate] }, async (request, reply) => {
    try {
      const conversation = await updateGroup(
        request.userId!,
        request.params.id,
        request.body ?? {},
      );
      await notifyConversationMembers(request.params.id, "updated");
      return { conversation };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get<{ Querystring: { q?: string } }>(
    "/search/messages",
    { preHandler: [app.authenticate] },
    async (request) => {
      const messages = await searchMessages(
        request.userId!,
        request.query.q ?? "",
      );
      return { messages };
    },
  );
}
