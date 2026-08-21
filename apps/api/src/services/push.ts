import webpush from "web-push";
import { prisma } from "../prisma.js";
import { config, pushEnabled } from "../config.js";

if (pushEnabled()) {
  try {
    webpush.setVapidDetails(
      config.vapid.subject,
      config.vapid.publicKey,
      config.vapid.privateKey,
    );
  } catch (err) {
    console.error("[push] invalid VAPID keys; push disabled", err);
  }
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
    await prisma.pushSubscription.delete({ where: { id: existing.id } });
  }

  return prisma.pushSubscription.upsert({
    where: { endpoint: input.endpoint },
    create: input,
    update: {
      p256dh: input.p256dh,
      auth: input.auth,
      userId: input.userId,
    },
  });
}

export async function removePushSubscription(endpoint: string, userId: string) {
  await prisma.pushSubscription.deleteMany({ where: { endpoint, userId } });
}

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  type?: "message" | "call" | "call-ended" | "reaction" | "status";
  callId?: string;
  tag?: string;
  requireInteraction?: boolean;
  reason?: "rejected" | "cancelled" | "hangup" | "unavailable" | "accepted";
  video?: boolean;
  fromName?: string;
  conversationId?: string;
};

export async function sendPushToUsers(
  items: Array<{ userId: string; payload: PushPayload }>,
) {
  if (!pushEnabled() || items.length === 0) return;

  const payloadByUser = new Map(items.map((item) => [item.userId, item.payload]));
  const subs = await prisma.pushSubscription.findMany({
    where: { userId: { in: [...payloadByUser.keys()] } },
  });

  await Promise.all(
    subs.map(async (sub) => {
      const payload = payloadByUser.get(sub.userId);
      if (!payload) return;
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

export async function notifyUsers(userIds: string[], payload: PushPayload) {
  const unique = [...new Set(userIds)];
  await sendPushToUsers(unique.map((userId) => ({ userId, payload })));
}

export async function notifyIncomingCall(
  userIds: string | string[],
  input: {
    callId: string;
    conversationId: string;
    fromName: string;
    video: boolean;
  },
) {
  const ids = Array.isArray(userIds) ? userIds : [userIds];
  const kind = input.video ? "chamada de vídeo" : "chamada de voz";
  await notifyUsers(ids, {
    title: input.fromName,
    body: `Está ligando (${kind})`,
    url: `/app?c=${encodeURIComponent(input.conversationId)}&call=${encodeURIComponent(input.callId)}`,
    type: "call",
    callId: input.callId,
    tag: `call-${input.callId}`,
    requireInteraction: true,
    video: input.video,
    fromName: input.fromName,
    conversationId: input.conversationId,
  });
}

export async function notifyCallEnded(
  userIds: string | string[],
  input: {
    callId: string;
    conversationId: string;
    reason: "rejected" | "cancelled" | "hangup" | "unavailable" | "accepted";
    fromName?: string;
  },
) {
  const ids = Array.isArray(userIds) ? userIds : [userIds];
  const missed =
    input.reason === "cancelled" || input.reason === "unavailable";
  const body = missed
    ? input.fromName
      ? `Chamada perdida de ${input.fromName}`
      : "Chamada perdida"
    : "Chamada encerrada";

  await notifyUsers(ids, {
    title: missed ? "Chamada perdida" : "Remetum",
    body,
    url: `/app?c=${encodeURIComponent(input.conversationId)}`,
    type: "call-ended",
    callId: input.callId,
    tag: `call-${input.callId}`,
    reason: input.reason,
    conversationId: input.conversationId,
  });
}
