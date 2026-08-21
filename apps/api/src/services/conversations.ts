import { randomBytes } from "node:crypto";
import { prisma } from "../prisma.js";
import { toMessage, toPublicUser, visibleDeliveryStatus } from "../lib/serialize.js";
import type {
  ConversationSummary,
  Message as SharedMessage,
  ParticipantRole,
} from "@ebano/shared";
import { MUTE_FOREVER_ISO, MUTE_FOREVER_MINUTES } from "@ebano/shared";
import { getIo } from "../sockets/io.js";
import { assertOwnedMedia } from "./uploads.js";

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

function directPairKey(a: string, b: string) {
  return [a, b].sort().join(":");
}

/** Join all sockets of a user into a conversation room. */
export function joinUserToConversationRoom(userId: string, conversationId: string) {
  const io = getIo();
  if (!io) return;
  void io.in(`user:${userId}`).socketsJoin(`conversation:${conversationId}`);
}

export async function joinMembersToConversationRoom(conversationId: string) {
  const members = await prisma.conversationParticipant.findMany({
    where: { conversationId },
    select: { userId: true },
  });
  for (const m of members) {
    joinUserToConversationRoom(m.userId, conversationId);
  }
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

  const pairKey = directPairKey(currentUserId, otherUserId);
  const existing = await prisma.conversation.findUnique({ where: { pairKey } });
  if (existing) return existing;

  const legacy = await prisma.conversation.findFirst({
    where: {
      type: "direct",
      pairKey: null,
      AND: [
        { participants: { some: { userId: currentUserId } } },
        { participants: { some: { userId: otherUserId } } },
      ],
    },
  });
  if (legacy) {
    try {
      return await prisma.conversation.update({
        where: { id: legacy.id },
        data: { pairKey },
      });
    } catch {
      return legacy;
    }
  }

  try {
    return await prisma.conversation.create({
      data: {
        type: "direct",
        pairKey,
        participants: {
          create: [
            { userId: currentUserId, role: "member" },
            { userId: otherUserId, role: "member" },
          ],
        },
      },
    });
  } catch {
    const raced = await prisma.conversation.findUnique({ where: { pairKey } });
    if (raced) return raced;
    throw Object.assign(new Error("Falha ao criar conversa"), { statusCode: 500 });
  }
}

export async function createGroupConversation(
  currentUserId: string,
  name: string,
  memberIds: string[],
) {
  const uniqueMembers = [...new Set(memberIds.filter((id) => id !== currentUserId))];
  if (!name.trim() || name.trim().length > 80) {
    throw Object.assign(new Error("Nome do grupo é obrigatório (máx. 80)"), {
      statusCode: 400,
    });
  }
  if (uniqueMembers.length > 100) {
    throw Object.assign(new Error("Grupo muito grande"), { statusCode: 400 });
  }

  const existingUsers = await prisma.user.findMany({
    where: { id: { in: uniqueMembers } },
    select: { id: true },
  });
  const existingIds = new Set(existingUsers.map((u) => u.id));
  const validMembers: string[] = [];
  for (const id of uniqueMembers) {
    if (!existingIds.has(id)) continue;
    if (await isBlockedEither(currentUserId, id)) continue;
    validMembers.push(id);
  }

  return prisma.conversation.create({
    data: {
      type: "group",
      name: name.trim(),
      inviteCode: randomBytes(6).toString("hex"),
      participants: {
        create: [
          { userId: currentUserId, role: "admin" },
          ...validMembers.map((userId) => ({
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

  joinUserToConversationRoom(userId, conversation.id);
  return conversation;
}

export async function rotateInviteCode(adminId: string, conversationId: string) {
  await assertAdmin(conversationId, adminId);
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
  });
  if (!conversation || conversation.type !== "group") {
    throw Object.assign(new Error("Só grupos têm convite"), { statusCode: 400 });
  }
  const inviteCode = randomBytes(6).toString("hex");
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { inviteCode },
  });
  return getConversationSummary(conversationId, adminId);
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
  viewerId: string,
): ConversationSummary["participants"][number] {
  return {
    ...toPublicUser(p.user, viewerId),
    role: p.role,
  };
}

async function buildSummary(
  row: {
    id: string;
    type: "direct" | "group";
    name: string | null;
    avatarUrl: string | null;
    inviteCode: string | null;
    createdAt: Date;
    participants: Array<{
      role: ParticipantRole;
      user: Parameters<typeof toPublicUser>[0];
    }>;
  },
  userId: string,
  mine: {
    role: ParticipantRole;
    pinnedAt: Date | null;
    archivedAt: Date | null;
    mutedUntil: Date | null;
    deletedForMeAt: Date | null;
  },
): Promise<ConversationSummary> {
  const cutoff = mine.deletedForMeAt ?? null;
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
    const peerStatuses = await prisma.messageStatus.findMany({
      where: last.senderId === userId
        ? { messageId: last.id, userId: { not: userId } }
        : { messageId: last.id, userId },
    });
    const readers = await prisma.user.findMany({
      where: { id: { in: peerStatuses.map((s) => s.userId) } },
      select: { id: true, sendReadReceipts: true },
    });
    const receipts = new Map(readers.map((r) => [r.id, r.sendReadReceipts]));
    let status: SharedMessage["status"];
    if (last.senderId === userId) {
      const rank = { sent: 0, delivered: 1, read: 2 } as const;
      status = peerStatuses.reduce<"sent" | "delivered" | "read">(
        (acc, cur) => {
          const visible = visibleDeliveryStatus(
            cur.status,
            receipts.get(cur.userId),
          );
          return rank[visible] > rank[acc] ? visible : acc;
        },
        "sent",
      );
    } else {
      status = peerStatuses[0]?.status;
    }
    lastMessage = toMessage(last, status, userId);
  }

  return {
    id: row.id,
    type: row.type,
    name: row.name,
    avatarUrl: row.avatarUrl,
    inviteCode: row.type === "group" ? row.inviteCode : null,
    createdAt: row.createdAt.toISOString(),
    pinnedAt: mine.pinnedAt?.toISOString() ?? null,
    archivedAt: mine.archivedAt?.toISOString() ?? null,
    mutedUntil: mine.mutedUntil?.toISOString() ?? null,
    myRole: mine.role,
    participants: row.participants.map((p) => toSummaryParticipant(p, userId)),
    lastMessage,
    unreadCount: await unreadCount(row.id, userId, cutoff),
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
      if (!mine) {
        throw Object.assign(new Error("Participação inválida"), {
          statusCode: 500,
        });
      }
      return buildSummary(row, userId, mine);
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
  const mine = await assertParticipant(conversationId, userId);
  const row = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { participants: { include: { user: true } } },
  });
  if (!row) {
    throw Object.assign(new Error("Conversa não encontrada"), { statusCode: 404 });
  }
  return buildSummary(row, userId, mine);
}

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
      if (
        prefs.muteMinutes === MUTE_FOREVER_MINUTES ||
        typeof prefs.muteMinutes !== "number"
      ) {
        data.mutedUntil = new Date(MUTE_FOREVER_ISO);
      } else if (prefs.muteMinutes > 0) {
        data.mutedUntil = new Date(Date.now() + prefs.muteMinutes * 60 * 1000);
      } else {
        data.mutedUntil = new Date(MUTE_FOREVER_ISO);
      }
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
  const readerIds = [...new Set(statuses.map((s) => s.userId))];
  const readers = readerIds.length
    ? await prisma.user.findMany({
        where: { id: { in: readerIds } },
        select: { id: true, sendReadReceipts: true },
      })
    : [];
  const receipts = new Map(readers.map((r) => [r.id, r.sendReadReceipts]));

  const mapped = slice.map((m) => {
    if (m.senderId === userId) {
      const peerStatuses = statuses.filter(
        (s) => s.messageId === m.id && s.userId !== userId,
      );
      const rank = { sent: 0, delivered: 1, read: 2 } as const;
      const best = peerStatuses.reduce<"sent" | "delivered" | "read">(
        (acc, cur) => {
          const visible = visibleDeliveryStatus(
            cur.status,
            receipts.get(cur.userId),
          );
          return rank[visible] > rank[acc] ? visible : acc;
        },
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

async function ensureNotLastAdmin(userId: string, conversationId: string) {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
  });
  if (!conversation || conversation.type !== "group") return;

  const me = await prisma.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
  });
  if (!me || me.role !== "admin") return;

  const adminCount = await prisma.conversationParticipant.count({
    where: { conversationId, role: "admin" },
  });
  if (adminCount > 1) return;

  const next = await prisma.conversationParticipant.findFirst({
    where: { conversationId, userId: { not: userId } },
    orderBy: { joinedAt: "asc" },
  });
  if (next) {
    await prisma.conversationParticipant.update({
      where: {
        conversationId_userId: {
          conversationId,
          userId: next.userId,
        },
      },
      data: { role: "admin" },
    });
  }
}

export async function leaveConversation(userId: string, conversationId: string) {
  await assertParticipant(conversationId, userId);
  await ensureNotLastAdmin(userId, conversationId);
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

  if (role === "member" && memberId === adminId) {
    const adminCount = await prisma.conversationParticipant.count({
      where: { conversationId, role: "admin" },
    });
    if (adminCount <= 1) {
      throw Object.assign(
        new Error("Promova outro admin antes de se rebaixar"),
        { statusCode: 400 },
      );
    }
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
    if (!trimmed || trimmed.length > 80) {
      throw Object.assign(new Error("Nome do grupo é obrigatório (máx. 80)"), {
        statusCode: 400,
      });
    }
    data.name = trimmed;
  }
  if (input.avatarUrl !== undefined) {
    if (input.avatarUrl) {
      await assertOwnedMedia(input.avatarUrl, adminId);
    }
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
