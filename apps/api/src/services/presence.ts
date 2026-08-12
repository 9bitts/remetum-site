import { prisma } from "../prisma.js";
import { toPublicUser } from "../lib/serialize.js";

const onlineSockets = new Map<string, Set<string>>();

export function trackSocket(userId: string, socketId: string) {
  const set = onlineSockets.get(userId) ?? new Set<string>();
  set.add(socketId);
  onlineSockets.set(userId, set);
  return set.size;
}

export function untrackSocket(userId: string, socketId: string) {
  const set = onlineSockets.get(userId);
  if (!set) return 0;
  set.delete(socketId);
  if (set.size === 0) onlineSockets.delete(userId);
  return set.size;
}

export function isUserOnline(userId: string) {
  return (onlineSockets.get(userId)?.size ?? 0) > 0;
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

  return [...new Set(peers.map((p) => p.userId))];
}
