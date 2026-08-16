import { prisma } from "../prisma.js";
import { assertParticipant, isBlockedEither } from "./conversations.js";
import { toMessage } from "../lib/serialize.js";
import {
  encodeCallMessage,
  type CallMessageEvent,
  type MessageType,
} from "@ebano/shared";
import { assertUsableMedia } from "./uploads.js";

async function loadMessage(messageId: string) {
  return prisma.message.findUnique({
    where: { id: messageId },
    include: { reactions: true, replyTo: true },
  });
}

const MAX_CONTENT = 4000;
const MAX_EMOJI = 16;
const MAX_FORWARD = 20;

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

  if (
    input.type !== "text" &&
    input.type !== "image" &&
    input.type !== "file" &&
    input.type !== "audio" &&
    input.type !== "video" &&
    input.type !== "call"
  ) {
    throw Object.assign(new Error("Tipo de mensagem inválido"), {
      statusCode: 400,
    });
  }
  if (input.type === "text" && !input.content?.trim()) {
    throw Object.assign(new Error("Mensagem vazia"), { statusCode: 400 });
  }
  if (input.type === "call" && !input.content?.trim()) {
    throw Object.assign(new Error("Evento de chamada inválido"), {
      statusCode: 400,
    });
  }
  if (input.content && input.content.length > MAX_CONTENT) {
    throw Object.assign(new Error("Mensagem muito longa"), { statusCode: 400 });
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
  if (input.mediaUrl) {
    await assertUsableMedia(input.mediaUrl, input.senderId);
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
  if (!content.trim() || content.length > MAX_CONTENT) {
    throw Object.assign(new Error("Conteúdo inválido"), { statusCode: 400 });
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
  const trimmed = emoji.trim();
  if (!trimmed || trimmed.length > MAX_EMOJI) {
    throw Object.assign(new Error("Emoji inválido"), { statusCode: 400 });
  }

  const message = await prisma.message.findUnique({ where: { id: messageId } });
  if (!message || message.deletedAt) {
    throw Object.assign(new Error("Mensagem não encontrada"), { statusCode: 404 });
  }
  await assertParticipant(message.conversationId, userId);

  const existing = await prisma.messageReaction.findUnique({
    where: {
      messageId_userId_emoji: { messageId, userId, emoji: trimmed },
    },
  });

  if (existing) {
    await prisma.messageReaction.delete({
      where: {
        messageId_userId_emoji: { messageId, userId, emoji: trimmed },
      },
    });
  } else {
    await prisma.messageReaction.create({
      data: { messageId, userId, emoji: trimmed },
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

export async function forwardMessage(
  userId: string,
  messageId: string,
  targetConversationIds: string[],
) {
  const original = await prisma.message.findUnique({ where: { id: messageId } });
  if (!original || original.deletedAt) {
    throw Object.assign(new Error("Mensagem não encontrada"), { statusCode: 404 });
  }
  if (original.type === "call") {
    throw Object.assign(new Error("Não é possível encaminhar este evento"), {
      statusCode: 400,
    });
  }
  await assertParticipant(original.conversationId, userId);

  const uniqueTargets = [...new Set(targetConversationIds)].slice(0, MAX_FORWARD);
  if (uniqueTargets.length === 0) {
    throw Object.assign(new Error("Nenhuma conversa de destino"), {
      statusCode: 400,
    });
  }

  const created = [];
  for (const conversationId of uniqueTargets) {
    const message = await createMessage({
      conversationId,
      senderId: userId,
      content: original.content ?? undefined,
      type: original.type,
      mediaUrl: original.mediaUrl ?? undefined,
      durationMs: original.durationMs ?? undefined,
    });
    created.push(message);
  }
  return created;
}

export async function createCallEventMessage(input: {
  conversationId: string;
  senderId: string;
  event: CallMessageEvent;
  video: boolean;
  durationMs?: number | null;
}) {
  return createMessage({
    conversationId: input.conversationId,
    senderId: input.senderId,
    type: "call",
    content: encodeCallMessage({ event: input.event, video: input.video }),
    durationMs: input.durationMs ?? undefined,
  });
}

export async function userSendsReadReceipts(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { sendReadReceipts: true },
  });
  return user?.sendReadReceipts !== false;
}
