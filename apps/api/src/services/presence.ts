import { prisma } from "../prisma.js";
import { toPublicUser } from "../lib/serialize.js";
import { getRedis } from "../redis.js";

const onlineSockets = new Map<string, Set<string>>();

function memoryTrack(userId: string, socketId: string) {
  const set = onlineSockets.get(userId) ?? new Set<string>();
  set.add(socketId);
  onlineSockets.set(userId, set);
  return set.size;
}

function memoryUntrack(userId: string, socketId: string) {
  const set = onlineSockets.get(userId);
  if (!set) return 0;
  set.delete(socketId);
  if (set.size === 0) onlineSockets.delete(userId);
  return set.size;
}

export async function trackSocket(userId: string, socketId: string) {
  const redis = await getRedis();
  if (!redis) return memoryTrack(userId, socketId);
  try {
    await redis.sadd(`remetum:online:${userId}`, socketId);
    return await redis.scard(`remetum:online:${userId}`);
  } catch {
    return memoryTrack(userId, socketId);
  }
}

export async function untrackSocket(userId: string, socketId: string) {
  const redis = await getRedis();
  if (!redis) return memoryUntrack(userId, socketId);
  try {
    await redis.srem(`remetum:online:${userId}`, socketId);
    return await redis.scard(`remetum:online:${userId}`);
  } catch {
    return memoryUntrack(userId, socketId);
  }
}

export async function isUserOnline(userId: string) {
  const redis = await getRedis();
  if (!redis) return (onlineSockets.get(userId)?.size ?? 0) > 0;
  try {
    return (await redis.scard(`remetum:online:${userId}`)) > 0;
  } catch {
    return (onlineSockets.get(userId)?.size ?? 0) > 0;
  }
}

export async function setUserOnline(userId: string) {
  const user = await prisma.user.update({
    where: { id: userId },
    data: { status: "online" },
  });
  return toPublicUser(user);
}

export async function setUserOffline(userId: string) {
  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      status: "offline",
      lastSeenAt: new Date(),
    },
  });
  return toPublicUser(user);
}

export async function getContactUserIds(userId: string) {
  const conversations = await prisma.conversationParticipant.findMany({
    where: { userId },
    select: { conversationId: true },
  });
  const ids = conversations.map((c) => c.conversationId);
  if (ids.length === 0) return [] as string[];

  const peers = await prisma.conversationParticipant.findMany({
    where: {
      conversationId: { in: ids },
      userId: { not: userId },
    },
    select: { userId: true },
  });

  const peerIds = [...new Set(peers.map((p) => p.userId))];
  if (peerIds.length === 0) return [] as string[];

  const blocks = await prisma.userBlock.findMany({
    where: {
      OR: [
        { blockerId: userId, blockedId: { in: peerIds } },
        { blockedId: userId, blockerId: { in: peerIds } },
      ],
    },
  });
  const blocked = new Set(
    blocks.flatMap((b) => [b.blockerId, b.blockedId]).filter((id) => id !== userId),
  );

  return peerIds.filter((id) => !blocked.has(id));
}
