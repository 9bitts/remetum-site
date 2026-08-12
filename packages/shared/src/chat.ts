export interface ConversationSummary {
  id: string;
  type: "direct" | "group";
  name: string | null;
  avatarUrl: string | null;
  createdAt: string;
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
    content: string | null;
    type: "text" | "image" | "file";
    mediaUrl: string | null;
    createdAt: string;
    editedAt: string | null;
    deletedAt: string | null;
    status?: "sent" | "delivered" | "read";
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
