import { prisma } from "../prisma.js";
import { assertParticipant } from "./conversations.js";
import { toMessage } from "../lib/serialize.js";
import type { MessageType } from "@ebano/shared";

export async function createMessage(input: {
  conversationId: string;
  senderId: string;
  content?: string;
  type: MessageType;
  mediaUrl?: string;
}) {
  await assertParticipant(input.conversationId, input.senderId);

  if (input.type === "text" && !input.content?.trim()) {
    throw Object.assign(new Error("Mensagem vazia"), { statusCode: 400 });
  }
  if ((input.type === "image" || input.type === "file") && !input.mediaUrl) {
    throw Object.assign(new Error("Arquivo obrigatório"), { statusCode: 400 });
  }

  const participants = await prisma.conversationParticipant.findMany({
    where: { conversationId: input.conversationId },
  });

  const message = await prisma.message.create({
    data: {
      conversationId: input.conversationId,
      senderId: input.senderId,
      content: input.content?.trim() || null,
      type: input.type,
      mediaUrl: input.mediaUrl ?? null,
      statuses: {
        create: participants
          .filter((p) => p.userId !== input.senderId)
          .map((p) => ({
            userId: p.userId,
            status: "sent" as const,
          })),
      },
    },
  });

  return toMessage(message, "sent");
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
