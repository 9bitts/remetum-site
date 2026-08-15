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

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  type?: "message" | "call" | "call-ended";
  callId?: string;
  tag?: string;
  requireInteraction?: boolean;
  reason?: "rejected" | "cancelled" | "hangup" | "unavailable" | "accepted";
  video?: boolean;
  fromName?: string;
  conversationId?: string;
};

export async function notifyUsers(
  userIds: string[],
  payload: PushPayload,
  options?: { evenIfOnline?: boolean },
) {
  if (!pushEnabled() || userIds.length === 0) return;

  const targetIds = options?.evenIfOnline
    ? userIds
    : userIds.filter((id) => !isUserOnline(id));
  if (targetIds.length === 0) return;

  const subs = await prisma.pushSubscription.findMany({
    where: { userId: { in: targetIds } },
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

export async function notifyIncomingCall(
  userId: string,
  input: {
    callId: string;
    conversationId: string;
    fromName: string;
    video: boolean;
  },
) {
  const kind = input.video ? "chamada de vídeo" : "chamada de voz";
  await notifyUsers(
    [userId],
    {
      title: "Remetum",
      body: `${input.fromName} está ligando (${kind})`,
      url: `/app?c=${encodeURIComponent(input.conversationId)}`,
      type: "call",
      callId: input.callId,
      tag: `call-${input.callId}`,
      requireInteraction: true,
      video: input.video,
      fromName: input.fromName,
      conversationId: input.conversationId,
    },
    { evenIfOnline: true },
  );
}

export async function notifyCallEnded(
  userId: string,
  input: {
    callId: string;
    conversationId: string;
    reason: "rejected" | "cancelled" | "hangup" | "unavailable" | "accepted";
    fromName?: string;
  },
) {
  const missed =
    input.reason === "cancelled" || input.reason === "unavailable";
  const body = missed
    ? input.fromName
      ? `Chamada perdida de ${input.fromName}`
      : "Chamada perdida"
    : "Chamada encerrada";

  await notifyUsers(
    [userId],
    {
      title: missed ? "Chamada perdida" : "Remetum",
      body,
      url: `/app?c=${encodeURIComponent(input.conversationId)}`,
      type: "call-ended",
      callId: input.callId,
      tag: `call-${input.callId}`,
      reason: input.reason,
      conversationId: input.conversationId,
    },
    { evenIfOnline: true },
  );
}
