import {
  extractMentionedHandles,
  formatPushCopy,
  isNotificationPreviewMode,
  previewSnippet,
  type NotificationPreviewMode,
  type PushKind,
} from "@ebano/shared";
import { prisma } from "../prisma.js";
import { sendPushToUsers, type PushPayload } from "./push.js";

function previewMode(value: string): NotificationPreviewMode {
  return isNotificationPreviewMode(value) ? value : "full";
}

function kindFor(input: {
  mentioned: boolean;
  replyToRecipient: boolean;
}): PushKind {
  if (input.mentioned) return "mention";
  if (input.replyToRecipient) return "reply";
  return "message";
}

export async function notifyNewMessage(input: {
  conversationId: string;
  senderId: string;
  senderName: string;
  type: string;
  content: string | null;
  replyToSenderId?: string | null;
}) {
  const conversation = await prisma.conversation.findUnique({
    where: { id: input.conversationId },
    include: {
      participants: { include: { user: true } },
    },
  });
  if (!conversation) return;

  const others = conversation.participants.filter(
    (p) => p.userId !== input.senderId,
  );
  if (others.length === 0) return;

  const mentioned = new Set(
    extractMentionedHandles(input.content ?? ""),
  );
  const snippet = previewSnippet(input.type, input.content);
  const now = new Date();

  const items: Array<{ userId: string; payload: PushPayload }> = [];
  for (const p of others) {
    if (p.user.dndEnabled) continue;
    const mentionedMe = Boolean(
      p.user.handle && mentioned.has(p.user.handle),
    );
    const replyToMe = input.replyToSenderId === p.userId;
    const muted = Boolean(p.mutedUntil && p.mutedUntil > now);
    if (muted && !mentionedMe && !replyToMe) continue;

    const copy = formatPushCopy({
      preview: previewMode(p.user.notificationPreview),
      kind: kindFor({ mentioned: mentionedMe, replyToRecipient: replyToMe }),
      conversationType: conversation.type,
      conversationName: conversation.name,
      senderName: input.senderName,
      snippet,
    });

    items.push({
      userId: p.userId,
      payload: {
        title: copy.title,
        body: copy.body,
        url: `/app?c=${encodeURIComponent(input.conversationId)}`,
        type: "message",
        tag: `msg-${input.conversationId}`,
        conversationId: input.conversationId,
      },
    });
  }

  await sendPushToUsers(items);
}

export async function notifyReaction(input: {
  conversationId: string;
  messageId: string;
  authorId: string;
  actorId: string;
  actorName: string;
  emoji: string;
}) {
  if (input.authorId === input.actorId) return;

  const [author, participant, conversation] = await Promise.all([
    prisma.user.findUnique({
      where: { id: input.authorId },
      select: { dndEnabled: true, notificationPreview: true },
    }),
    prisma.conversationParticipant.findUnique({
      where: {
        conversationId_userId: {
          conversationId: input.conversationId,
          userId: input.authorId,
        },
      },
      select: { mutedUntil: true },
    }),
    prisma.conversation.findUnique({
      where: { id: input.conversationId },
      select: { type: true, name: true },
    }),
  ]);
  if (!author || !participant || !conversation) return;
  if (author.dndEnabled) return;
  if (participant.mutedUntil && participant.mutedUntil > new Date()) return;

  const copy = formatPushCopy({
    preview: previewMode(author.notificationPreview),
    kind: "reaction",
    conversationType: conversation.type,
    conversationName: conversation.name,
    senderName: input.actorName,
    snippet: "",
    emoji: input.emoji,
  });

  await sendPushToUsers([
    {
      userId: input.authorId,
      payload: {
        title: copy.title,
        body: copy.body,
        url: `/app?c=${encodeURIComponent(input.conversationId)}`,
        type: "reaction",
        tag: `react-${input.messageId}`,
        conversationId: input.conversationId,
      },
    },
  ]);
}

export async function notifyStatus(input: {
  authorId: string;
  authorName: string;
  recipientIds: string[];
}) {
  if (input.recipientIds.length === 0) return;

  const users = await prisma.user.findMany({
    where: { id: { in: input.recipientIds } },
    select: { id: true, dndEnabled: true, notificationPreview: true },
  });

  const items: Array<{ userId: string; payload: PushPayload }> = [];
  for (const user of users) {
    if (user.dndEnabled) continue;
    const copy = formatPushCopy({
      preview: previewMode(user.notificationPreview),
      kind: "status",
      conversationType: "direct",
      conversationName: null,
      senderName: input.authorName,
      snippet: "",
    });
    items.push({
      userId: user.id,
      payload: {
        title: copy.title,
        body: copy.body,
        url: "/app?status=1",
        type: "status",
        tag: `status-${input.authorId}`,
      },
    });
  }

  await sendPushToUsers(items);
}
