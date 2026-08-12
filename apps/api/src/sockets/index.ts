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
import {
  createMessage,
  deleteMessageForEveryone,
  editMessage,
  markDeliveredForUser,
  markMessagesRead,
  toggleReaction,
} from "../services/messages.js";
import {
  getContactUserIds,
  setUserOffline,
  setUserOnline,
  trackSocket,
  untrackSocket,
} from "../services/presence.js";
import { notifyUsers } from "../services/push.js";
import { assertParticipant, isBlockedEither } from "../services/conversations.js";
import { createCall, endCall, getCall, setCallStatus } from "../services/calls.js";
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

export function createSocketServer(
  httpServer: HttpServer,
  corsOrigins: string | string[],
) {
  const io = new Server(httpServer, {
    cors: {
      origin: corsOrigins,
      credentials: true,
    },
  });

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

    const count = trackSocket(userId, socket.id);
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

    socket.on(SOCKET_EVENTS.MESSAGE_SEND, async (payload: MessageSendPayload) => {
      try {
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

    socket.on(SOCKET_EVENTS.TYPING, (payload: TypingPayload) => {
      socket.to(`conversation:${payload.conversationId}`).emit(SOCKET_EVENTS.TYPING, {
        conversationId: payload.conversationId,
        userId,
        isTyping: payload.isTyping,
      });
    });

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
        if (!conversation || conversation.type !== "direct") {
          throw Object.assign(new Error("Chamadas só em conversas diretas"), {
            statusCode: 400,
          });
        }

        const other = conversation.participants.find((p) => p.userId !== userId);
        if (!other) {
          throw Object.assign(new Error("Destinatário não encontrado"), {
            statusCode: 404,
          });
        }
        if (await isBlockedEither(userId, other.userId)) {
          throw Object.assign(new Error("Usuário bloqueado"), { statusCode: 403 });
        }

        const me = conversation.participants.find((p) => p.userId === userId);
        const call = createCall({
          conversationId: payload.conversationId,
          fromUserId: userId,
          toUserId: other.userId,
          video: Boolean(payload.video),
        });

        const offer = {
          callId: call.callId,
          conversationId: payload.conversationId,
          fromUserId: userId,
          fromName: me?.user.name ?? "Usuário",
          video: call.video,
          livekitUrl: getLivekitUrl(),
        };

        io.to(`user:${other.userId}`).emit(SOCKET_EVENTS.CALL_OFFER, offer);
        // Caller also gets callId for cancel/hangup
        socket.emit(SOCKET_EVENTS.CALL_OFFER, offer);
      } catch (err) {
        socket.emit(SOCKET_EVENTS.ERROR, {
          event: SOCKET_EVENTS.CALL_INVITE,
          message: (err as Error).message,
        });
      }
    });

    socket.on(SOCKET_EVENTS.CALL_ACCEPT, async (payload: CallSignalPayload) => {
      try {
        const call = getCall(payload.callId);
        if (!call || call.status === "ended") {
          throw Object.assign(new Error("Chamada não encontrada"), {
            statusCode: 404,
          });
        }
        if (call.toUserId !== userId) {
          throw Object.assign(new Error("Sem permissão"), { statusCode: 403 });
        }

        setCallStatus(payload.callId, "active");

        const [caller, callee] = await Promise.all([
          prisma.user.findUnique({ where: { id: call.fromUserId } }),
          prisma.user.findUnique({ where: { id: call.toUserId } }),
        ]);
        if (!caller || !callee) {
          throw Object.assign(new Error("Usuário não encontrado"), {
            statusCode: 404,
          });
        }

        const livekitUrl = getLivekitUrl();
        if (!livekitUrl) {
          throw Object.assign(new Error("LiveKit não configurado"), {
            statusCode: 503,
          });
        }

        await ensureLivekitRoom(call.roomName);

        const [callerToken, calleeToken] = await Promise.all([
          createLivekitToken({
            roomName: call.roomName,
            identity: caller.id,
            name: caller.name,
          }),
          createLivekitToken({
            roomName: call.roomName,
            identity: callee.id,
            name: callee.name,
          }),
        ]);

        const base = {
          callId: payload.callId,
          conversationId: call.conversationId,
          livekitUrl,
          roomName: call.roomName,
          video: call.video,
        };

        io.to(`user:${call.fromUserId}`).emit(SOCKET_EVENTS.CALL_ACCEPTED, {
          ...base,
          token: callerToken,
        });
        io.to(`user:${call.toUserId}`).emit(SOCKET_EVENTS.CALL_ACCEPTED, {
          ...base,
          token: calleeToken,
        });
      } catch (err) {
        socket.emit(SOCKET_EVENTS.ERROR, {
          event: SOCKET_EVENTS.CALL_ACCEPT,
          message: (err as Error).message,
        });
      }
    });

    const endCallWithReason = (
      payload: CallSignalPayload,
      reason: "rejected" | "cancelled" | "hangup",
    ) => {
      const call = getCall(payload.callId);
      if (!call) return;
      if (userId !== call.fromUserId && userId !== call.toUserId) return;
      endCall(payload.callId);
      const ended = {
        callId: payload.callId,
        conversationId: call.conversationId,
        reason,
      };
      io.to(`user:${call.fromUserId}`).emit(SOCKET_EVENTS.CALL_ENDED, ended);
      io.to(`user:${call.toUserId}`).emit(SOCKET_EVENTS.CALL_ENDED, ended);
    };

    socket.on(SOCKET_EVENTS.CALL_REJECT, (payload: CallSignalPayload) => {
      endCallWithReason(payload, "rejected");
    });

    socket.on(SOCKET_EVENTS.CALL_CANCEL, (payload: CallSignalPayload) => {
      endCallWithReason(payload, "cancelled");
    });

    socket.on(SOCKET_EVENTS.CALL_HANGUP, (payload: CallSignalPayload) => {
      endCallWithReason(payload, "hangup");
    });

    socket.on("conversation:join", (conversationId: string) => {
      if (typeof conversationId === "string") {
        socket.join(`conversation:${conversationId}`);
      }
    });

    socket.on("disconnect", async () => {
      const remaining = untrackSocket(userId, socket.id);
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
