import webpush from "web-push";
import { prisma } from "../prisma.js";
import { config, pushEnabled } from "../config.js";

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
  return prisma.pushSubscription.upsert({
    where: { endpoint: input.endpoint },
    create: input,
    update: {
      userId: input.userId,
      p256dh: input.p256dh,
      auth: input.auth,
    },
  });
}

export async function removePushSubscription(endpoint: string) {
  await prisma.pushSubscription.deleteMany({ where: { endpoint } });
}

export async function notifyUsers(
  userIds: string[],
  payload: { title: string; body: string; url?: string },
) {
  if (!pushEnabled() || userIds.length === 0) return;

  const subs = await prisma.pushSubscription.findMany({
    where: { userId: { in: userIds } },
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
