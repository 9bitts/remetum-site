import { prisma } from "../prisma.js";
import { assertParticipant, isBlockedEither } from "./conversations.js";
import { toMessage } from "../lib/serialize.js";
import type { MessageType } from "@ebano/shared";

async function loadMessage(messageId: string) {
  return prisma.message.findUnique({
    where: { id: messageId },
    include: { reactions: true, replyTo: true },
  });
}

export async function createMessage(input: {
  conversationId: string;
  senderId: string;
  content?: string;
  type: MessageType;
  mediaUrl?: string;
  durationMs?: number;
  replyToId?: string;
}) {
  await assertParticipant(input.conversationId, input.senderId);

  const participants = await prisma.conversationParticipant.findMany({
    where: { conversationId: input.conversationId },
  });

  if (participants.length === 2) {
    const other = participants.find((p) => p.userId !== input.senderId);
    if (other && (await isBlockedEither(input.senderId, other.userId))) {
      throw Object.assign(new Error("Usuário bloqueado"), { statusCode: 403 });
    }
  }

  if (input.type === "text" && !input.content?.trim()) {
    throw Object.assign(new Error("Mensagem vazia"), { statusCode: 400 });
  }
  if (
    (input.type === "image" ||
      input.type === "file" ||
      input.type === "audio" ||
      input.type === "video") &&
    !input.mediaUrl
  ) {
    throw Object.assign(new Error("Arquivo obrigatório"), { statusCode: 400 });
  }

  if (input.replyToId) {
    const parent = await prisma.message.findFirst({
      where: {
        id: input.replyToId,
        conversationId: input.conversationId,
        deletedAt: null,
      },
    });
    if (!parent) {
      throw Object.assign(new Error("Mensagem citada inválida"), {
        statusCode: 400,
      });
    }
  }

  const message = await prisma.message.create({
    data: {
      conversationId: input.conversationId,
      senderId: input.senderId,
      replyToId: input.replyToId,
      content: input.content?.trim() || null,
      type: input.type,
      mediaUrl: input.mediaUrl ?? null,
      durationMs: input.durationMs ?? null,
      statuses: {
        create: participants
          .filter((p) => p.userId !== input.senderId)
          .map((p) => ({
            userId: p.userId,
            status: "sent" as const,
          })),
      },
    },
    include: { reactions: true, replyTo: true },
  });

  return toMessage(message, "sent", input.senderId);
}

export async function editMessage(
  messageId: string,
  userId: string,
  content: string,
) {
  const existing = await prisma.message.findUnique({ where: { id: messageId } });
  if (!existing || existing.deletedAt) {
    throw Object.assign(new Error("Mensagem não encontrada"), { statusCode: 404 });
  }
  if (existing.senderId !== userId) {
    throw Object.assign(new Error("Sem permissão"), { statusCode: 403 });
  }
  if (existing.type !== "text") {
    throw Object.assign(new Error("Só texto pode ser editado"), { statusCode: 400 });
  }
  if (Date.now() - existing.createdAt.getTime() > 1000 * 60 * 15) {
    throw Object.assign(new Error("Tempo de edição esgotado"), { statusCode: 400 });
  }

  const updated = await prisma.message.update({
    where: { id: messageId },
    data: {
      content: content.trim(),
      editedAt: new Date(),
    },
    include: { reactions: true, replyTo: true },
  });

  return toMessage(updated, undefined, userId);
}

export async function deleteMessageForEveryone(messageId: string, userId: string) {
  const existing = await prisma.message.findUnique({ where: { id: messageId } });
  if (!existing || existing.deletedAt) {
    throw Object.assign(new Error("Mensagem não encontrada"), { statusCode: 404 });
  }
  if (existing.senderId !== userId) {
    throw Object.assign(new Error("Sem permissão"), { statusCode: 403 });
  }

  const updated = await prisma.message.update({
    where: { id: messageId },
    data: {
      deletedAt: new Date(),
      content: null,
      mediaUrl: null,
    },
    include: { reactions: true, replyTo: true },
  });

  return toMessage(updated, undefined, userId);
}

export async function toggleReaction(
  messageId: string,
  userId: string,
  emoji: string,
) {
  const message = await prisma.message.findUnique({ where: { id: messageId } });
  if (!message || message.deletedAt) {
    throw Object.assign(new Error("Mensagem não encontrada"), { statusCode: 404 });
  }
  await assertParticipant(message.conversationId, userId);

  const existing = await prisma.messageReaction.findUnique({
    where: {
      messageId_userId_emoji: { messageId, userId, emoji },
    },
  });

  if (existing) {
    await prisma.messageReaction.delete({
      where: {
        messageId_userId_emoji: { messageId, userId, emoji },
      },
    });
  } else {
    await prisma.messageReaction.create({
      data: { messageId, userId, emoji },
    });
  }

  const full = await loadMessage(messageId);
  return toMessage(full!, undefined, userId);
}

export async function markMessagesRead(
  conversationId: string,
  userId: string,
  messageIds: string[],
) {
  await assertParticipant(conversationId, userId);
  if (messageIds.length === 0) return [];

  const updated = await prisma.messageStatus.updateMany({
    where: {
      userId,
      messageId: { in: messageIds },
      status: { not: "read" },
      message: {
        conversationId,
        senderId: { not: userId },
      },
    },
    data: { status: "read" },
  });

  if (updated.count === 0) return [];

  return prisma.messageStatus.findMany({
    where: {
      userId,
      messageId: { in: messageIds },
      status: "read",
    },
    include: { message: true },
  });
}

export async function markDeliveredForUser(userId: string, messageIds: string[]) {
  if (messageIds.length === 0) return;
  await prisma.messageStatus.updateMany({
    where: {
      userId,
      messageId: { in: messageIds },
      status: "sent",
    },
    data: { status: "delivered" },
  });
}
