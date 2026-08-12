import type { Message, User } from "@prisma/client";
import type { AuthUser, DeliveryStatus, Message as SharedMessage, PublicUser } from "@ebano/shared";

export function toAuthUser(user: User): AuthUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    avatarUrl: user.avatarUrl,
    bio: user.bio,
    status: user.status,
    lastSeenAt: user.lastSeenAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
  };
}

export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    name: user.name,
    avatarUrl: user.avatarUrl,
    bio: user.bio,
    status: user.status,
    lastSeenAt: user.lastSeenAt?.toISOString() ?? null,
  };
}

export function toMessage(
  message: Message,
  status?: DeliveryStatus,
): SharedMessage {
  return {
    id: message.id,
    conversationId: message.conversationId,
    senderId: message.senderId,
    content: message.content,
    type: message.type,
    mediaUrl: message.mediaUrl,
    createdAt: message.createdAt.toISOString(),
    editedAt: message.editedAt?.toISOString() ?? null,
    deletedAt: message.deletedAt?.toISOString() ?? null,
    status,
  };
}
