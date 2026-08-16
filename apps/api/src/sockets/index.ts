import type { Server as HttpServer } from "node:http";
import { Server, type Socket } from "socket.io";
import {
  SOCKET_EVENTS,
  type CallInvitePayload,
  type CallSignalPayload,
  type MessageDeletePayload,
  type MessageEditPayload,
  type MessageReactPayload,
  type MessageReadPayload,
  type MessageSendPayload,
  type TypingPayload,
} from "@ebano/shared";
import { config } from "../config.js";
import { verifyAccessToken } from "../services/tokens.js";
import { prisma } from "../prisma.js";
import { getRedis } from "../redis.js";
import {
  createCallEventMessage,
  createMessage,
  deleteMessageForEveryone,
  editMessage,
  markDeliveredForUser,
  markMessagesRead,
  toggleReaction,
  userSendsReadReceipts,
} from "../services/messages.js";
import {
  getContactUserIds,
  setUserOffline,
  setUserOnline,
  trackSocket,
  untrackSocket,
} from "../services/presence.js";
import { notifyCallEnded, notifyIncomingCall, notifyUsers } from "../services/push.js";
import { assertParticipant, isBlockedEither } from "../services/conversations.js";
import {
  callDurationMs,
  createCall,
  endCall,
  getCall,
  getRingingCallsForCallee,
  isCallMember,
  patchCall,
  scheduleRingTimeout,
  type CallRecord,
} from "../services/calls.js";
import {
  createLivekitToken,
  ensureLivekitRoom,
  getLivekitUrl,
  livekitConfigured,
} from "../services/livekit.js";
import { setIo } from "./io.js";

function parseCookies(header?: string) {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const [rawKey, ...rest] = part.trim().split("=");
    if (!rawKey) continue;
    out[rawKey] = decodeURIComponent(rest.join("="));
  }
  return out;
}

async function authenticateSocket(socket: Socket) {
  const cookies = parseCookies(socket.request.headers.cookie);
  const token = cookies[config.cookie.access];
  if (!token) throw new Error("Não autenticado");
  const payload = await verifyAccessToken(token);
  return payload.sub;
}

export async function createSocketServer(
  httpServer: HttpServer,
  corsOrigins: string | string[],
) {
  const io = new Server(httpServer, {
    cors: {
      origin: corsOrigins,
      credentials: true,
    },
  });

  try {
    const redis = await getRedis();
    if (redis) {
      const sub = redis.duplicate();
      const adapterMod = await import("@socket.io/redis-adapter");
      const createAdapter =
        adapterMod.createAdapter ??
        (
          adapterMod as {
            default?: { createAdapter?: typeof adapterMod.createAdapter };
          }
        ).default?.createAdapter;
      if (createAdapter) {
        if (redis.status !== "ready") await redis.connect().catch(() => undefined);
        if (sub.status !== "ready") await sub.connect().catch(() => undefined);
        io.adapter(createAdapter(redis, sub));
      }
    }
  } catch (err) {
    console.error("[socket] redis adapter failed", err);
  }

  io.use(async (socket, next) => {
    try {
      const userId = await authenticateSocket(socket);
      socket.data.userId = userId;
      next();
    } catch {
      next(new Error("Unauthorized"));
    }
  });

  setIo(io);

  io.on("connection", async (socket) => {
    const userId = socket.data.userId as string;
    socket.join(`user:${userId}`);

    const count = await trackSocket(userId, socket.id);
    if (count === 1) {
      const user = await setUserOnline(userId);
      const contacts = await getContactUserIds(userId);
      for (const contactId of contacts) {
        io.to(`user:${contactId}`).emit(SOCKET_EVENTS.PRESENCE, {
          userId,
          status: "online",
          lastSeenAt: user.lastSeenAt,
        });
      }
    }

    const memberships = await prisma.conversationParticipant.findMany({
      where: { userId },
      select: { conversationId: true },
    });
    for (const m of memberships) {
      socket.join(`conversation:${m.conversationId}`);
    }

    const pending = await prisma.messageStatus.findMany({
      where: { userId, status: "sent" },
      select: {
        messageId: true,
        message: { select: { conversationId: true, senderId: true } },
      },
      take: 200,
    });
    if (pending.length > 0) {
      await markDeliveredForUser(
        userId,
        pending.map((p) => p.messageId),
      );
      for (const p of pending) {
        io.to(`user:${p.message.senderId}`).emit(SOCKET_EVENTS.MESSAGE_STATUS, {
          messageId: p.messageId,
          userId,
          status: "delivered",
          conversationId: p.message.conversationId,
        });
      }
    }

    socket.emit("ready", { socketId: socket.id, userId });

    for (const call of await getRingingCallsForCallee(userId)) {
      socket.emit(SOCKET_EVENTS.CALL_OFFER, {
        callId: call.callId,
        conversationId: call.conversationId,
        fromUserId: call.fromUserId,
        fromName: call.fromName,
        video: call.video,
        livekitUrl: getLivekitUrl(),
        group: call.group,
      });
    }

    socket.on(SOCKET_EVENTS.MESSAGE_SEND, async (payload: MessageSendPayload) => {
      try {
        if (payload.type === "call") {
          throw Object.assign(new Error("Tipo de mensagem inválido"), {
            statusCode: 400,
          });
        }
        const message = await createMessage({
          conversationId: payload.conversationId,
          senderId: userId,
          content: payload.content,
          type: payload.type,
          mediaUrl: payload.mediaUrl,
          durationMs: payload.durationMs,
          replyToId: payload.replyToId,
        });

        socket.emit(SOCKET_EVENTS.MESSAGE_SENT, {
          messageId: message.id,
          clientTempId: payload.clientTempId,
          createdAt: message.createdAt,
        });

        io.to(`conversation:${payload.conversationId}`).emit(
          SOCKET_EVENTS.MESSAGE_NEW,
          { message, clientTempId: payload.clientTempId },
        );

        const recipients = await prisma.conversationParticipant.findMany({
          where: {
            conversationId: payload.conversationId,
            userId: { not: userId },
            OR: [{ mutedUntil: null }, { mutedUntil: { lt: new Date() } }],
          },
          select: { userId: true },
        });

        const preview =
          payload.type === "text"
            ? (payload.content ?? "").slice(0, 120)
            : payload.type === "image"
              ? "📷 Imagem"
              : payload.type === "audio"
                ? "🎤 Áudio"
                : payload.type === "video"
                  ? "🎬 Vídeo"
                  : "📎 Arquivo";

        await notifyUsers(
          recipients.map((r) => r.userId),
          {
            title: "Remetum",
            body: preview || "Nova mensagem",
            url: `/app?c=${payload.conversationId}`,
          },
        );
      } catch (err) {
        socket.emit(SOCKET_EVENTS.ERROR, {
          event: SOCKET_EVENTS.MESSAGE_SEND,
          message: (err as Error).message,
          clientTempId: payload.clientTempId,
        });
      }
    });

    socket.on(SOCKET_EVENTS.MESSAGE_EDIT, async (payload: MessageEditPayload) => {
      try {
        const message = await editMessage(
          payload.messageId,
          userId,
          payload.content,
        );
        io.to(`conversation:${message.conversationId}`).emit(
          SOCKET_EVENTS.MESSAGE_UPDATED,
          { message },
        );
      } catch (err) {
        socket.emit(SOCKET_EVENTS.ERROR, {
          event: SOCKET_EVENTS.MESSAGE_EDIT,
          message: (err as Error).message,
        });
      }
    });

    socket.on(
      SOCKET_EVENTS.MESSAGE_DELETE,
      async (payload: MessageDeletePayload) => {
        try {
          const message = await deleteMessageForEveryone(
            payload.messageId,
            userId,
          );
          io.to(`conversation:${message.conversationId}`).emit(
            SOCKET_EVENTS.MESSAGE_UPDATED,
            { message },
          );
        } catch (err) {
          socket.emit(SOCKET_EVENTS.ERROR, {
            event: SOCKET_EVENTS.MESSAGE_DELETE,
            message: (err as Error).message,
          });
        }
      },
    );

    socket.on(SOCKET_EVENTS.MESSAGE_REACT, async (payload: MessageReactPayload) => {
      try {
        const message = await toggleReaction(
          payload.messageId,
          userId,
          payload.emoji,
        );
        io.to(`conversation:${message.conversationId}`).emit(
          SOCKET_EVENTS.MESSAGE_UPDATED,
          { message },
        );
      } catch (err) {
        socket.emit(SOCKET_EVENTS.ERROR, {
          event: SOCKET_EVENTS.MESSAGE_REACT,
          message: (err as Error).message,
        });
      }
    });

    socket.on(SOCKET_EVENTS.MESSAGE_READ, async (payload: MessageReadPayload) => {
      try {
        const updated = await markMessagesRead(
          payload.conversationId,
          userId,
          payload.messageIds,
        );
        const emitReceipts = await userSendsReadReceipts(userId);
        if (!emitReceipts) return;
        for (const row of updated) {
          io.to(`user:${row.message.senderId}`).emit(
            SOCKET_EVENTS.MESSAGE_STATUS,
            {
              messageId: row.messageId,
              userId,
              status: "read",
              conversationId: payload.conversationId,
            },
          );
        }
      } catch (err) {
        socket.emit(SOCKET_EVENTS.ERROR, {
          event: SOCKET_EVENTS.MESSAGE_READ,
          message: (err as Error).message,
        });
      }
    });

    socket.on(SOCKET_EVENTS.TYPING, async (payload: TypingPayload) => {
      try {
        await assertParticipant(payload.conversationId, userId);
        socket.to(`conversation:${payload.conversationId}`).emit(SOCKET_EVENTS.TYPING, {
          conversationId: payload.conversationId,
          userId,
          isTyping: payload.isTyping,
        });
      } catch {
        // ignore unauthorized typing
      }
    });

    async function publishCallMessage(
      call: CallRecord,
      event: "missed" | "rejected" | "cancelled" | "ended" | "unavailable",
    ) {
      try {
        const message = await createCallEventMessage({
          conversationId: call.conversationId,
          senderId: call.fromUserId,
          event,
          video: call.video,
          durationMs: event === "ended" ? callDurationMs(call) : null,
        });
        io.to(`conversation:${call.conversationId}`).emit(
          SOCKET_EVENTS.MESSAGE_NEW,
          { message },
        );
      } catch (err) {
        console.error("[call] failed to store call message", err);
      }
    }

    function emitEnded(
      call: CallRecord & { callId?: string },
      callId: string,
      reason: "rejected" | "cancelled" | "hangup" | "unavailable",
      userIds: string[],
    ) {
      const ended = {
        callId,
        conversationId: call.conversationId,
        reason,
      };
      for (const id of userIds) {
        io.to(`user:${id}`).emit(SOCKET_EVENTS.CALL_ENDED, ended);
      }
    }

    socket.on(SOCKET_EVENTS.CALL_INVITE, async (payload: CallInvitePayload) => {
      try {
        if (!livekitConfigured()) {
          socket.emit(SOCKET_EVENTS.ERROR, {
            event: SOCKET_EVENTS.CALL_INVITE,
            message: "Chamadas não estão configuradas",
          });
          return;
        }

        await assertParticipant(payload.conversationId, userId);
        const conversation = await prisma.conversation.findUnique({
          where: { id: payload.conversationId },
          include: { participants: { include: { user: true } } },
        });
        if (!conversation) {
          throw Object.assign(new Error("Conversa não encontrada"), {
            statusCode: 404,
          });
        }

        const others = [];
        for (const p of conversation.participants) {
          if (p.userId === userId) continue;
          if (await isBlockedEither(userId, p.userId)) continue;
          others.push(p);
        }
        if (others.length === 0) {
          throw Object.assign(new Error("Ninguém disponível para a chamada"), {
            statusCode: 400,
          });
        }

        const me = conversation.participants.find((p) => p.userId === userId);
        const call = await createCall({
          conversationId: payload.conversationId,
          fromUserId: userId,
          fromName: me?.user.name ?? "Usuário",
          video: Boolean(payload.video),
          participantIds: [userId, ...others.map((p) => p.userId)],
          group: conversation.type === "group",
        });

        const offer = {
          callId: call.callId,
          conversationId: payload.conversationId,
          fromUserId: userId,
          fromName: call.fromName,
          video: call.video,
          livekitUrl: getLivekitUrl(),
          group: call.group,
        };

        for (const id of call.ringingIds) {
          io.to(`user:${id}`).emit(SOCKET_EVENTS.CALL_OFFER, offer);
        }
        socket.emit(SOCKET_EVENTS.CALL_OFFER, offer);

        void notifyIncomingCall(call.ringingIds, {
          callId: call.callId,
          conversationId: payload.conversationId,
          fromName: offer.fromName,
          video: call.video,
        });

        scheduleRingTimeout(call.callId, () => {
          void (async () => {
            const stillRinging = await getCall(call.callId);
            if (!stillRinging || stillRinging.status !== "ringing") return;
            await endCall(call.callId);
            emitEnded(
              stillRinging,
              call.callId,
              "unavailable",
              stillRinging.participantIds,
            );
            void notifyCallEnded(stillRinging.ringingIds, {
              callId: call.callId,
              conversationId: stillRinging.conversationId,
              reason: "unavailable",
              fromName: stillRinging.fromName,
            });
            await publishCallMessage(stillRinging, "unavailable");
          })();
        });
      } catch (err) {
        socket.emit(SOCKET_EVENTS.ERROR, {
          event: SOCKET_EVENTS.CALL_INVITE,
          message: (err as Error).message,
        });
      }
    });

    socket.on(SOCKET_EVENTS.CALL_ACCEPT, async (payload: CallSignalPayload) => {
      try {
        const call = await getCall(payload.callId);
        if (!call || call.status === "ended") {
          throw Object.assign(new Error("Chamada não encontrada"), {
            statusCode: 404,
          });
        }
        if (!isCallMember(call, userId) || call.fromUserId === userId) {
          throw Object.assign(new Error("Sem permissão"), { statusCode: 403 });
        }

        const livekitUrl = getLivekitUrl();
        if (!livekitUrl) {
          throw Object.assign(new Error("LiveKit não configurado"), {
            statusCode: 503,
          });
        }

        const firstAccept = call.status === "ringing";
        const ringingIds = call.ringingIds.filter((id) => id !== userId);
        const joinedIds = call.joinedIds.includes(userId)
          ? call.joinedIds
          : [...call.joinedIds, userId];

        const updated = await patchCall(payload.callId, {
          status: "active",
          ringingIds,
          joinedIds,
          startedAt: call.startedAt ?? new Date().toISOString(),
        });
        if (!updated) {
          throw Object.assign(new Error("Chamada não encontrada"), {
            statusCode: 404,
          });
        }

        await ensureLivekitRoom(updated.roomName);

        const users = await prisma.user.findMany({
          where: { id: { in: firstAccept ? joinedIds : [userId] } },
        });

        const base = {
          callId: payload.callId,
          conversationId: updated.conversationId,
          livekitUrl,
          roomName: updated.roomName,
          video: updated.video,
        };

        for (const member of users) {
          const token = await createLivekitToken({
            roomName: updated.roomName,
            identity: member.id,
            name: member.name,
          });
          io.to(`user:${member.id}`).emit(SOCKET_EVENTS.CALL_ACCEPTED, {
            ...base,
            token,
          });
        }

        void notifyCallEnded(userId, {
          callId: payload.callId,
          conversationId: updated.conversationId,
          reason: "accepted",
        });
      } catch (err) {
        socket.emit(SOCKET_EVENTS.ERROR, {
          event: SOCKET_EVENTS.CALL_ACCEPT,
          message: (err as Error).message,
        });
      }
    });

    socket.on(SOCKET_EVENTS.CALL_REJECT, async (payload: CallSignalPayload) => {
      const call = await getCall(payload.callId);
      if (!call || !isCallMember(call, userId)) return;
      const ringingIds = call.ringingIds.filter((id) => id !== userId);
      const nobodyJoined =
        call.status === "ringing" &&
        ringingIds.length === 0 &&
        call.joinedIds.length <= 1;
      io.to(`user:${userId}`).emit(SOCKET_EVENTS.CALL_ENDED, {
        callId: payload.callId,
        conversationId: call.conversationId,
        reason: "rejected" as const,
      });
      void notifyCallEnded(userId, {
        callId: payload.callId,
        conversationId: call.conversationId,
        reason: "rejected",
        fromName: call.fromName,
      });
      if (nobodyJoined) {
        await endCall(payload.callId);
        emitEnded(call, payload.callId, "rejected", call.participantIds);
        await publishCallMessage(call, "rejected");
        return;
      }
      await patchCall(payload.callId, { ringingIds });
    });

    socket.on(SOCKET_EVENTS.CALL_CANCEL, async (payload: CallSignalPayload) => {
      const call = await getCall(payload.callId);
      if (!call || call.fromUserId !== userId) return;
      await endCall(payload.callId);
      emitEnded(call, payload.callId, "cancelled", call.participantIds);
      void notifyCallEnded(call.ringingIds, {
        callId: payload.callId,
        conversationId: call.conversationId,
        reason: "cancelled",
        fromName: call.fromName,
      });
      await publishCallMessage(call, "cancelled");
    });

    socket.on(SOCKET_EVENTS.CALL_HANGUP, async (payload: CallSignalPayload) => {
      const call = await getCall(payload.callId);
      if (!call || !isCallMember(call, userId)) return;
      const joinedIds = call.joinedIds.filter((id) => id !== userId);
      const ringingIds = call.ringingIds.filter((id) => id !== userId);
      const remaining = joinedIds.length;
      if (call.status === "active" && remaining < 2) {
        await endCall(payload.callId);
        emitEnded(call, payload.callId, "hangup", call.participantIds);
        void notifyCallEnded(
          call.participantIds.filter((id) => id !== userId),
          {
            callId: payload.callId,
            conversationId: call.conversationId,
            reason: "hangup",
            fromName: call.fromName,
          },
        );
        await publishCallMessage(
          { ...call, joinedIds, startedAt: call.startedAt },
          "ended",
        );
        return;
      }
      if (call.status === "ringing" && userId === call.fromUserId) {
        await endCall(payload.callId);
        emitEnded(call, payload.callId, "cancelled", call.participantIds);
        await publishCallMessage(call, "cancelled");
        return;
      }
      await patchCall(payload.callId, { joinedIds, ringingIds });
      io.to(`user:${userId}`).emit(SOCKET_EVENTS.CALL_ENDED, {
        callId: payload.callId,
        conversationId: call.conversationId,
        reason: "hangup" as const,
      });
    });

    socket.on(SOCKET_EVENTS.CONVERSATION_JOIN, async (conversationId: string) => {
      try {
        if (typeof conversationId !== "string" || !conversationId) return;
        await assertParticipant(conversationId, userId);
        socket.join(`conversation:${conversationId}`);
      } catch {
        socket.emit(SOCKET_EVENTS.ERROR, {
          event: SOCKET_EVENTS.CONVERSATION_JOIN,
          message: "Sem acesso a esta conversa",
        });
      }
    });

    socket.on("disconnect", async () => {
      const remaining = await untrackSocket(userId, socket.id);
      if (remaining === 0) {
        const user = await setUserOffline(userId);
        const contacts = await getContactUserIds(userId);
        for (const contactId of contacts) {
          io.to(`user:${contactId}`).emit(SOCKET_EVENTS.PRESENCE, {
            userId,
            status: "offline",
            lastSeenAt: user.lastSeenAt,
          });
        }
      }
    });
  });

  return io;
}
