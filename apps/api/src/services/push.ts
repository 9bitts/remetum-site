import webpush from "web-push";
import { prisma } from "../prisma.js";
import { config, pushEnabled } from "../config.js";
import { isUserOnline } from "./presence.js";

if (pushEnabled()) {
  webpush.setVapidDetails(
    config.vapid.subject,
    config.vapid.publicKey,
    config.vapid.privateKey,
  );
}

export async function savePushSubscription(input: {
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}) {
  const existing = await prisma.pushSubscription.findUnique({
    where: { endpoint: input.endpoint },
  });
  if (existing && existing.userId !== input.userId) {
    throw Object.assign(new Error("Subscription já vinculada a outra conta"), {
      statusCode: 409,
    });
  }

  return prisma.pushSubscription.upsert({
    where: { endpoint: input.endpoint },
    create: input,
    update: {
      p256dh: input.p256dh,
      auth: input.auth,
    },
  });
}

export async function removePushSubscription(endpoint: string, userId: string) {
  await prisma.pushSubscription.deleteMany({ where: { endpoint, userId } });
}

export async function notifyUsers(
  userIds: string[],
  payload: { title: string; body: string; url?: string },
) {
  if (!pushEnabled() || userIds.length === 0) return;

  const offlineIds = userIds.filter((id) => !isUserOnline(id));
  if (offlineIds.length === 0) return;

  const subs = await prisma.pushSubscription.findMany({
    where: { userId: { in: offlineIds } },
  });

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          JSON.stringify(payload),
        );
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await prisma.pushSubscription.delete({ where: { id: sub.id } });
        }
      }
    }),
  );
}
