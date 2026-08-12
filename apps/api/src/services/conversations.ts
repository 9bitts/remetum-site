import { prisma } from "../prisma.js";
import { toMessage, toPublicUser } from "../lib/serialize.js";
import type { ConversationSummary, Message as SharedMessage } from "@ebano/shared";

export async function assertParticipant(conversationId: string, userId: string) {
  const participant = await prisma.conversationParticipant.findUnique({
    where: {
      conversationId_userId: { conversationId, userId },
    },
  });
  if (!participant) {
    throw Object.assign(new Error("Sem acesso a esta conversa"), { statusCode: 403 });
  }
  return participant;
}

export async function getOrCreateDirectConversation(
  currentUserId: string,
  otherUserId: string,
) {
  if (currentUserId === otherUserId) {
    throw Object.assign(new Error("Não é possível conversar consigo mesmo"), {
      statusCode: 400,
    });
  }

  const other = await prisma.user.findUnique({ where: { id: otherUserId } });
  if (!other) {
    throw Object.assign(new Error("Usuário não encontrado"), { statusCode: 404 });
  }

  const existing = await prisma.conversation.findFirst({
    where: {
      type: "direct",
      AND: [
        { participants: { some: { userId: currentUserId } } },
        { participants: { some: { userId: otherUserId } } },
      ],
    },
  });

  if (existing) return existing;

  return prisma.conversation.create({
    data: {
      type: "direct",
      participants: {
        create: [
          { userId: currentUserId, role: "member" },
          { userId: otherUserId, role: "member" },
        ],
      },
    },
  });
}

export async function createGroupConversation(
  currentUserId: string,
  name: string,
  memberIds: string[],
) {
  const uniqueMembers = [...new Set(memberIds.filter((id) => id !== currentUserId))];
  if (!name.trim()) {
    throw Object.assign(new Error("Nome do grupo é obrigatório"), { statusCode: 400 });
  }

  return prisma.conversation.create({
    data: {
      type: "group",
      name: name.trim(),
      participants: {
        create: [
          { userId: currentUserId, role: "admin" },
          ...uniqueMembers.map((userId) => ({
            userId,
            role: "member" as const,
          })),
        ],
      },
    },
  });
}

async function unreadCount(conversationId: string, userId: string) {
  return prisma.messageStatus.count({
    where: {
      userId,
      status: { in: ["sent", "delivered"] },
      message: {
        conversationId,
        senderId: { not: userId },
        deletedAt: null,
      },
    },
  });
}

export async function listConversationsForUser(
  userId: string,
): Promise<ConversationSummary[]> {
  const rows = await prisma.conversation.findMany({
    where: { participants: { some: { userId } } },
    include: {
      participants: { include: { user: true } },
      messages: {
        where: { deletedAt: null },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const summaries = await Promise.all(
    rows.map(async (row) => {
      const last = row.messages[0];
      let lastMessage: SharedMessage | null = null;
      if (last) {
        const status =
          last.senderId === userId
            ? (
                await prisma.messageStatus.findFirst({
                  where: {
                    messageId: last.id,
                    userId: { not: userId },
                  },
                  orderBy: { updatedAt: "desc" },
                })
              )?.status
            : (
                await prisma.messageStatus.findUnique({
                  where: {
                    messageId_userId: { messageId: last.id, userId },
                  },
                })
              )?.status;
        lastMessage = toMessage(last, status ?? undefined);
      }

      return {
        id: row.id,
        type: row.type,
        name: row.name,
        avatarUrl: row.avatarUrl,
        createdAt: row.createdAt.toISOString(),
        participants: row.participants.map((p) => toPublicUser(p.user)),
        lastMessage,
        unreadCount: await unreadCount(row.id, userId),
      } satisfies ConversationSummary;
    }),
  );

  return summaries.sort((a, b) => {
    const aTime = a.lastMessage?.createdAt ?? a.createdAt;
    const bTime = b.lastMessage?.createdAt ?? b.createdAt;
    return bTime.localeCompare(aTime);
  });
}

export async function getConversationSummary(
  conversationId: string,
  userId: string,
): Promise<ConversationSummary> {
  await assertParticipant(conversationId, userId);
  const list = await listConversationsForUser(userId);
  const found = list.find((c) => c.id === conversationId);
  if (!found) {
    throw Object.assign(new Error("Conversa não encontrada"), { statusCode: 404 });
  }
  return found;
}

export async function listMessages(
  conversationId: string,
  userId: string,
  cursor?: string,
  limit = 50,
) {
  await assertParticipant(conversationId, userId);

  const messages = await prisma.message.findMany({
    where: {
      conversationId,
      deletedAt: null,
      ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
  });

  const hasMore = messages.length > limit;
  const slice = hasMore ? messages.slice(0, limit) : messages;

  const statuses = await prisma.messageStatus.findMany({
    where: {
      messageId: { in: slice.map((m) => m.id) },
    },
  });

  const mapped = slice.map((m) => {
    if (m.senderId === userId) {
      const peerStatuses = statuses.filter(
        (s) => s.messageId === m.id && s.userId !== userId,
      );
      const rank = { sent: 0, delivered: 1, read: 2 } as const;
      const best = peerStatuses.reduce<"sent" | "delivered" | "read">(
        (acc, cur) => (rank[cur.status] > rank[acc] ? cur.status : acc),
        "sent",
      );
      return toMessage(m, best);
    }
    const own = statuses.find((s) => s.messageId === m.id && s.userId === userId);
    return toMessage(m, own?.status ?? undefined);
  });

  return {
    messages: mapped.reverse(),
    nextCursor: hasMore
      ? slice[slice.length - 1]?.createdAt.toISOString() ?? null
      : null,
  };
}

export async function searchMessages(userId: string, query: string) {
  const q = query.trim();
  if (q.length < 2) return [] as SharedMessage[];

  const messages = await prisma.message.findMany({
    where: {
      deletedAt: null,
      content: { contains: q, mode: "insensitive" },
      conversation: { participants: { some: { userId } } },
    },
    orderBy: { createdAt: "desc" },
    take: 40,
  });

  return messages.map((m) => toMessage(m));
}
