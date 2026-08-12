import { prisma } from "../prisma.js";
import { toPublicUser } from "../lib/serialize.js";
import type { StatusItem } from "@ebano/shared";

export async function createStatus(input: {
  userId: string;
  type: "text" | "image" | "video";
  content?: string;
  mediaUrl?: string;
}) {
  if (input.type === "text" && !input.content?.trim()) {
    throw Object.assign(new Error("Status vazio"), { statusCode: 400 });
  }
  if ((input.type === "image" || input.type === "video") && !input.mediaUrl) {
    throw Object.assign(new Error("Mídia obrigatória"), { statusCode: 400 });
  }

  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24);
  return prisma.statusPost.create({
    data: {
      userId: input.userId,
      type: input.type,
      content: input.content?.trim() || null,
      mediaUrl: input.mediaUrl ?? null,
      expiresAt,
    },
  });
}

export async function listStatusesForUser(viewerId: string): Promise<StatusItem[]> {
  const contactIds = await prisma.conversationParticipant.findMany({
    where: {
      conversation: {
        participants: { some: { userId: viewerId } },
      },
    },
    select: { userId: true },
  });
  const userIds = [...new Set([viewerId, ...contactIds.map((c) => c.userId)])];

  const posts = await prisma.statusPost.findMany({
    where: {
      userId: { in: userIds },
      expiresAt: { gt: new Date() },
    },
    include: {
      user: true,
      views: true,
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return posts.map((p) => ({
    id: p.id,
    userId: p.userId,
    userName: p.user.name,
    userAvatarUrl: p.user.avatarUrl,
    type: p.type as StatusItem["type"],
    content: p.content,
    mediaUrl: p.mediaUrl,
    createdAt: p.createdAt.toISOString(),
    expiresAt: p.expiresAt.toISOString(),
    viewedByMe: p.views.some((v) => v.viewerId === viewerId),
    viewCount: p.views.length,
  }));
}

export async function viewStatus(statusId: string, viewerId: string) {
  const status = await prisma.statusPost.findUnique({ where: { id: statusId } });
  if (!status || status.expiresAt < new Date()) {
    throw Object.assign(new Error("Status expirado"), { statusCode: 404 });
  }

  await prisma.statusView.upsert({
    where: {
      statusId_viewerId: { statusId, viewerId },
    },
    create: { statusId, viewerId },
    update: {},
  });

  return { ok: true };
}

export async function blockUser(blockerId: string, blockedId: string) {
  if (blockerId === blockedId) {
    throw Object.assign(new Error("Não pode bloquear a si mesmo"), {
      statusCode: 400,
    });
  }
  await prisma.userBlock.upsert({
    where: {
      blockerId_blockedId: { blockerId, blockedId },
    },
    create: { blockerId, blockedId },
    update: {},
  });
  return { ok: true };
}

export async function unblockUser(blockerId: string, blockedId: string) {
  await prisma.userBlock.deleteMany({
    where: { blockerId, blockedId },
  });
  return { ok: true };
}

export async function listBlocked(blockerId: string) {
  const rows = await prisma.userBlock.findMany({
    where: { blockerId },
    include: { blocked: true },
  });
  return rows.map((r) => toPublicUser(r.blocked));
}
