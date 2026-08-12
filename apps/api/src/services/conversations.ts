import { randomBytes } from "node:crypto";
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

export async function isBlockedEither(a: string, b: string) {
  const block = await prisma.userBlock.findFirst({
    where: {
      OR: [
        { blockerId: a, blockedId: b },
        { blockerId: b, blockedId: a },
      ],
    },
  });
  return Boolean(block);
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
  if (await isBlockedEither(currentUserId, otherUserId)) {
    throw Object.assign(new Error("Usuário bloqueado"), { statusCode: 403 });
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
      inviteCode: randomBytes(6).toString("hex"),
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

export async function joinByInviteCode(userId: string, inviteCode: string) {
  const conversation = await prisma.conversation.findUnique({
    where: { inviteCode },
  });
  if (!conversation || conversation.type !== "group") {
    throw Object.assign(new Error("Convite inválido"), { statusCode: 404 });
  }

  await prisma.conversationParticipant.upsert({
    where: {
      conversationId_userId: {
        conversationId: conversation.id,
        userId,
      },
    },
    create: {
      conversationId: conversation.id,
      userId,
      role: "member",
    },
    update: {
      deletedForMeAt: null,
    },
  });

  return conversation;
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
  opts?: { archived?: boolean },
): Promise<ConversationSummary[]> {
  const archived = opts?.archived ?? false;
  const rows = await prisma.conversation.findMany({
    where: {
      participants: {
        some: {
          userId,
          deletedForMeAt: null,
          ...(archived
            ? { archivedAt: { not: null } }
            : { archivedAt: null }),
        },
      },
    },
    include: {
      participants: { include: { user: true } },
      messages: {
        where: { deletedAt: null },
        orderBy: { createdAt: "desc" },
        take: 1,
        include: { reactions: true, replyTo: true },
      },
    },
  });

  const myParticipation = new Map(
    (
      await prisma.conversationParticipant.findMany({
        where: { userId, conversationId: { in: rows.map((r) => r.id) } },
      })
    ).map((p) => [p.conversationId, p]),
  );

  const summaries = await Promise.all(
    rows.map(async (row) => {
      const mine = myParticipation.get(row.id);
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
        lastMessage = toMessage(last, status ?? undefined, userId);
      }

      return {
        id: row.id,
        type: row.type,
        name: row.name,
        avatarUrl: row.avatarUrl,
        inviteCode: row.type === "group" ? row.inviteCode : null,
        createdAt: row.createdAt.toISOString(),
        pinnedAt: mine?.pinnedAt?.toISOString() ?? null,
        archivedAt: mine?.archivedAt?.toISOString() ?? null,
        mutedUntil: mine?.mutedUntil?.toISOString() ?? null,
        participants: row.participants.map((p) => toPublicUser(p.user)),
        lastMessage,
        unreadCount: await unreadCount(row.id, userId),
      } satisfies ConversationSummary;
    }),
  );

  return summaries.sort((a, b) => {
    if (a.pinnedAt && !b.pinnedAt) return -1;
    if (!a.pinnedAt && b.pinnedAt) return 1;
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
  const archived = await listConversationsForUser(userId, { archived: true });
  const found =
    list.find((c) => c.id === conversationId) ??
    archived.find((c) => c.id === conversationId);
  if (!found) {
    throw Object.assign(new Error("Conversa não encontrada"), { statusCode: 404 });
  }
  return found;
}

export async function updateConversationPrefs(
  conversationId: string,
  userId: string,
  prefs: {
    pinned?: boolean;
    archived?: boolean;
    muted?: boolean;
    clearChat?: boolean;
  },
) {
  await assertParticipant(conversationId, userId);
  const data: {
    pinnedAt?: Date | null;
    archivedAt?: Date | null;
    mutedUntil?: Date | null;
    deletedForMeAt?: Date | null;
  } = {};

  if (prefs.pinned !== undefined) {
    data.pinnedAt = prefs.pinned ? new Date() : null;
  }
  if (prefs.archived !== undefined) {
    data.archivedAt = prefs.archived ? new Date() : null;
  }
  if (prefs.muted !== undefined) {
    data.mutedUntil = prefs.muted
      ? new Date(Date.now() + 1000 * 60 * 60 * 24 * 365)
      : null;
  }
  if (prefs.clearChat) {
    data.deletedForMeAt = new Date();
  }

  await prisma.conversationParticipant.update({
    where: {
      conversationId_userId: { conversationId, userId },
    },
    data,
  });

  if (prefs.clearChat && prefs.archived === undefined && prefs.pinned === undefined && prefs.muted === undefined) {
    return {
      id: conversationId,
      type: "direct",
      name: null,
      avatarUrl: null,
      inviteCode: null,
      createdAt: new Date().toISOString(),
      pinnedAt: null,
      archivedAt: null,
      mutedUntil: null,
      participants: [],
      lastMessage: null,
      unreadCount: 0,
    } satisfies ConversationSummary;
  }

  return getConversationSummary(conversationId, userId);
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
      ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}),
    },
    include: { reactions: true, replyTo: true },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
  });

  const hasMore = messages.length > limit;
  const slice = hasMore ? messages.slice(0, limit) : messages;

  const statuses = await prisma.messageStatus.findMany({
    where: { messageId: { in: slice.map((m) => m.id) } },
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
      return toMessage(m, best, userId);
    }
    const own = statuses.find((s) => s.messageId === m.id && s.userId === userId);
    return toMessage(m, own?.status ?? undefined, userId);
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
    include: { reactions: true, replyTo: true },
    orderBy: { createdAt: "desc" },
    take: 40,
  });

  return messages.map((m) => toMessage(m, undefined, userId));
}
