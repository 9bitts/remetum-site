export interface ConversationSummary {
  id: string;
  type: "direct" | "group";
  name: string | null;
  avatarUrl: string | null;
  inviteCode: string | null;
  createdAt: string;
  pinnedAt: string | null;
  archivedAt: string | null;
  mutedUntil: string | null;
  participants: Array<{
    id: string;
    name: string;
    avatarUrl: string | null;
    bio: string | null;
    status: "online" | "offline";
    lastSeenAt: string | null;
  }>;
  lastMessage: {
    id: string;
    conversationId: string;
    senderId: string;
    replyToId: string | null;
    replyTo: {
      id: string;
      senderId: string;
      content: string | null;
      type: "text" | "image" | "file" | "audio" | "video";
    } | null;
    content: string | null;
    type: "text" | "image" | "file" | "audio" | "video";
    mediaUrl: string | null;
    durationMs: number | null;
    createdAt: string;
    editedAt: string | null;
    deletedAt: string | null;
    status?: "sent" | "delivered" | "read";
    reactions: Array<{ emoji: string; count: number; reactedByMe: boolean }>;
  } | null;
  unreadCount: number;
}

export interface ConversationDetail extends ConversationSummary {}

export interface MessagesPage {
  messages: NonNullable<ConversationSummary["lastMessage"]>[];
  nextCursor: string | null;
}

export interface CreateDirectInput {
  userId: string;
}

export interface CreateGroupInput {
  name: string;
  memberIds: string[];
}

export interface UpdateProfileInput {
  name?: string;
  bio?: string | null;
  avatarUrl?: string | null;
}

export interface StatusItem {
  id: string;
  userId: string;
  userName: string;
  userAvatarUrl: string | null;
  type: "text" | "image" | "file" | "audio" | "video";
  content: string | null;
  mediaUrl: string | null;
  createdAt: string;
  expiresAt: string;
  viewedByMe: boolean;
  viewCount: number;
}
