import type { Server as HttpServer } from "node:http";
import { Server, type Socket } from "socket.io";
import {
  SOCKET_EVENTS,
  type MessageReadPayload,
  type MessageSendPayload,
  type TypingPayload,
} from "@ebano/shared";
import { config } from "../config.js";
import { verifyAccessToken } from "../services/tokens.js";
import { prisma } from "../prisma.js";
import { createMessage, markMessagesRead } from "../services/messages.js";
import {
  getContactUserIds,
  setUserOffline,
  setUserOnline,
  trackSocket,
  untrackSocket,
} from "../services/presence.js";
import { notifyUsers } from "../services/push.js";
import { markDeliveredForUser } from "../services/messages.js";

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

export function createSocketServer(httpServer: HttpServer, corsOrigin: string) {
  const io = new Server(httpServer, {
    cors: {
      origin: corsOrigin,
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
      select: { messageId: true, message: { select: { conversationId: true, senderId: true } } },
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
        });

        socket.emit(SOCKET_EVENTS.MESSAGE_SENT, {
          messageId: message.id,
          clientTempId: payload.clientTempId,
          createdAt: message.createdAt,
        });

        io.to(`conversation:${payload.conversationId}`).emit(
          SOCKET_EVENTS.MESSAGE_NEW,
          {
            message,
            clientTempId: payload.clientTempId,
          },
        );

        const recipients = await prisma.conversationParticipant.findMany({
          where: {
            conversationId: payload.conversationId,
            userId: { not: userId },
          },
          select: { userId: true },
        });

        const preview =
          payload.type === "text"
            ? (payload.content ?? "").slice(0, 120)
            : payload.type === "image"
              ? "📷 Imagem"
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
