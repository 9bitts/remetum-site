import { randomBytes } from "node:crypto";
import { prisma } from "../prisma.js";
import { toMessage, toPublicUser } from "../lib/serialize.js";
import type {
  ConversationSummary,
  Message as SharedMessage,
  ParticipantRole,
} from "@ebano/shared";

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

async function assertAdmin(conversationId: string, userId: string) {
  const participant = await assertParticipant(conversationId, userId);
  if (participant.role !== "admin") {
    throw Object.assign(new Error("Sem permissão de admin"), { statusCode: 403 });
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

async function unreadCount(
  conversationId: string,
  userId: string,
  after?: Date | null,
) {
  return prisma.messageStatus.count({
    where: {
      userId,
      status: { in: ["sent", "delivered"] },
      message: {
        conversationId,
        senderId: { not: userId },
        deletedAt: null,
        ...(after ? { createdAt: { gt: after } } : {}),
      },
    },
  });
}

function toSummaryParticipant(
  p: {
    role: ParticipantRole;
    user: Parameters<typeof toPublicUser>[0];
  },
): ConversationSummary["participants"][number] {
  return {
    ...toPublicUser(p.user),
    role: p.role,
  };
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
          ...(archived
            ? { archivedAt: { not: null } }
            : { archivedAt: null }),
        },
      },
    },
    include: {
      participants: { include: { user: true } },
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
      const cutoff = mine?.deletedForMeAt ?? null;
      const last = await prisma.message.findFirst({
        where: {
          conversationId: row.id,
          deletedAt: null,
          ...(cutoff ? { createdAt: { gt: cutoff } } : {}),
        },
        orderBy: { createdAt: "desc" },
        include: { reactions: true, replyTo: true },
      });

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
        myRole: mine?.role ?? "member",
        participants: row.participants.map(toSummaryParticipant),
        lastMessage,
        unreadCount: await unreadCount(row.id, userId, cutoff),
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

const DEFAULT_MUTE_MINUTES = 365 * 24 * 60;

export async function updateConversationPrefs(
  conversationId: string,
  userId: string,
  prefs: {
    pinned?: boolean;
    archived?: boolean;
    muted?: boolean;
    muteMinutes?: number;
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
    if (prefs.muted) {
      const minutes =
        typeof prefs.muteMinutes === "number" && prefs.muteMinutes > 0
          ? prefs.muteMinutes
          : DEFAULT_MUTE_MINUTES;
      data.mutedUntil = new Date(Date.now() + minutes * 60 * 1000);
    } else {
      data.mutedUntil = null;
    }
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

  return getConversationSummary(conversationId, userId);
}

export async function listMessages(
  conversationId: string,
  userId: string,
  cursor?: string,
  limit = 50,
) {
  const participant = await assertParticipant(conversationId, userId);
  const cutoff = participant.deletedForMeAt;

  const createdAtFilter: { gt?: Date; lt?: Date } = {};
  if (cutoff) createdAtFilter.gt = cutoff;
  if (cursor) createdAtFilter.lt = new Date(cursor);

  const messages = await prisma.message.findMany({
    where: {
      conversationId,
      ...(Object.keys(createdAtFilter).length > 0
        ? { createdAt: createdAtFilter }
        : {}),
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

  const memberships = await prisma.conversationParticipant.findMany({
    where: { userId },
    select: { conversationId: true, deletedForMeAt: true },
  });

  const orFilters = memberships.map((m) => ({
    conversationId: m.conversationId,
    ...(m.deletedForMeAt ? { createdAt: { gt: m.deletedForMeAt } } : {}),
  }));

  if (orFilters.length === 0) return [] as SharedMessage[];

  const messages = await prisma.message.findMany({
    where: {
      deletedAt: null,
      content: { contains: q, mode: "insensitive" },
      OR: orFilters,
    },
    include: { reactions: true, replyTo: true },
    orderBy: { createdAt: "desc" },
    take: 40,
  });

  return messages.map((m) => toMessage(m, undefined, userId));
}

export async function leaveConversation(userId: string, conversationId: string) {
  await assertParticipant(conversationId, userId);
  await prisma.conversationParticipant.delete({
    where: {
      conversationId_userId: { conversationId, userId },
    },
  });
  return { ok: true as const };
}

export async function removeMember(
  adminId: string,
  conversationId: string,
  memberId: string,
) {
  await assertAdmin(conversationId, adminId);
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
  });
  if (!conversation || conversation.type !== "group") {
    throw Object.assign(new Error("Só grupos permitem remover membros"), {
      statusCode: 400,
    });
  }
  if (memberId === adminId) {
    throw Object.assign(new Error("Use sair do grupo para remover a si mesmo"), {
      statusCode: 400,
    });
  }

  const member = await prisma.conversationParticipant.findUnique({
    where: {
      conversationId_userId: { conversationId, userId: memberId },
    },
  });
  if (!member) {
    throw Object.assign(new Error("Membro não encontrado"), { statusCode: 404 });
  }

  await prisma.conversationParticipant.delete({
    where: {
      conversationId_userId: { conversationId, userId: memberId },
    },
  });

  return getConversationSummary(conversationId, adminId);
}

export async function setMemberRole(
  adminId: string,
  conversationId: string,
  memberId: string,
  role: ParticipantRole,
) {
  await assertAdmin(conversationId, adminId);
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
  });
  if (!conversation || conversation.type !== "group") {
    throw Object.assign(new Error("Só grupos permitem alterar cargos"), {
      statusCode: 400,
    });
  }
  if (role !== "admin" && role !== "member") {
    throw Object.assign(new Error("Cargo inválido"), { statusCode: 400 });
  }

  const member = await prisma.conversationParticipant.findUnique({
    where: {
      conversationId_userId: { conversationId, userId: memberId },
    },
  });
  if (!member) {
    throw Object.assign(new Error("Membro não encontrado"), { statusCode: 404 });
  }

  await prisma.conversationParticipant.update({
    where: {
      conversationId_userId: { conversationId, userId: memberId },
    },
    data: { role },
  });

  return getConversationSummary(conversationId, adminId);
}

export async function updateGroup(
  adminId: string,
  conversationId: string,
  input: { name?: string; avatarUrl?: string | null },
) {
  await assertAdmin(conversationId, adminId);
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
  });
  if (!conversation || conversation.type !== "group") {
    throw Object.assign(new Error("Só grupos podem ser editados"), {
      statusCode: 400,
    });
  }

  const data: { name?: string; avatarUrl?: string | null } = {};
  if (input.name !== undefined) {
    const trimmed = input.name.trim();
    if (!trimmed) {
      throw Object.assign(new Error("Nome do grupo é obrigatório"), {
        statusCode: 400,
      });
    }
    data.name = trimmed;
  }
  if (input.avatarUrl !== undefined) {
    data.avatarUrl = input.avatarUrl;
  }

  if (Object.keys(data).length === 0) {
    throw Object.assign(new Error("Nada para atualizar"), { statusCode: 400 });
  }

  await prisma.conversation.update({
    where: { id: conversationId },
    data,
  });

  return getConversationSummary(conversationId, adminId);
}
