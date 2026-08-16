import type { Message, MessageReaction, User } from "@prisma/client";
import type {
  AuthUser,
  DeliveryStatus,
  Message as SharedMessage,
  MessagePreview,
  MessageReactionSummary,
  PublicUser,
} from "@ebano/shared";

export function toAuthUser(user: User): AuthUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    handle: user.handle,
    avatarUrl: user.avatarUrl,
    bio: user.bio,
    status: user.status,
    lastSeenAt: user.lastSeenAt?.toISOString() ?? null,
    emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
    hideLastSeen: user.hideLastSeen,
    sendReadReceipts: user.sendReadReceipts,
    createdAt: user.createdAt.toISOString(),
  };
}

export function toPublicUser(user: User, viewerId?: string): PublicUser {
  const hideSeen = user.hideLastSeen && user.id !== viewerId;
  return {
    id: user.id,
    name: user.name,
    handle: user.handle,
    avatarUrl: user.avatarUrl,
    bio: user.bio,
    status: user.status,
    lastSeenAt: hideSeen ? null : (user.lastSeenAt?.toISOString() ?? null),
  };
}

type MessageWithRelations = Message & {
  replyTo?: Message | null;
  reactions?: MessageReaction[];
};

export function toMessage(
  message: MessageWithRelations,
  status?: DeliveryStatus,
  currentUserId?: string,
): SharedMessage {
  if (message.deletedAt) {
    return {
      id: message.id,
      conversationId: message.conversationId,
      senderId: message.senderId,
      replyToId: null,
      replyTo: null,
      content: null,
      type: "text",
      mediaUrl: null,
      durationMs: null,
      createdAt: message.createdAt.toISOString(),
      editedAt: null,
      deletedAt: message.deletedAt.toISOString(),
      status,
      reactions: [],
    };
  }

  const reactions = summarizeReactions(message.reactions ?? [], currentUserId);
  let replyTo: MessagePreview | null = null;
  if (message.replyTo && !message.replyTo.deletedAt) {
    replyTo = {
      id: message.replyTo.id,
      senderId: message.replyTo.senderId,
      content: message.replyTo.content,
      type: message.replyTo.type,
    };
  }

  return {
    id: message.id,
    conversationId: message.conversationId,
    senderId: message.senderId,
    replyToId: message.replyToId,
    replyTo,
    content: message.content,
    type: message.type,
    mediaUrl: message.mediaUrl,
    durationMs: message.durationMs,
    createdAt: message.createdAt.toISOString(),
    editedAt: message.editedAt?.toISOString() ?? null,
    deletedAt: null,
    status,
    reactions,
  };
}

export function visibleDeliveryStatus(
  status: DeliveryStatus,
  readerSendsReceipts: boolean | undefined,
): DeliveryStatus {
  if (status === "read" && readerSendsReceipts === false) return "delivered";
  return status;
}

function summarizeReactions(
  reactions: MessageReaction[],
  currentUserId?: string,
): MessageReactionSummary[] {
  const map = new Map<string, MessageReactionSummary>();
  for (const r of reactions) {
    const current = map.get(r.emoji) ?? {
      emoji: r.emoji,
      count: 0,
      reactedByMe: false,
    };
    current.count += 1;
    if (currentUserId && r.userId === currentUserId) current.reactedByMe = true;
    map.set(r.emoji, current);
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}
