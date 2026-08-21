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
  myRole: "member" | "admin";
  participants: Array<{
    id: string;
    name: string;
    handle: string | null;
    avatarUrl: string | null;
    bio: string | null;
    status: "online" | "offline";
    lastSeenAt: string | null;
    role: "member" | "admin";
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
      type: "text" | "image" | "file" | "audio" | "video" | "call";
    } | null;
    content: string | null;
    type: "text" | "image" | "file" | "audio" | "video" | "call";
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
  handle?: string;
  bio?: string | null;
  avatarUrl?: string | null;
  hideLastSeen?: boolean;
  sendReadReceipts?: boolean;
  notificationPreview?: "full" | "name" | "hidden";
  notificationSound?: boolean;
  dndEnabled?: boolean;
}

export interface StatusItem {
  id: string;
  userId: string;
  userName: string;
  userAvatarUrl: string | null;
  type: "text" | "image" | "file" | "audio" | "video" | "call";
  content: string | null;
  mediaUrl: string | null;
  createdAt: string;
  expiresAt: string;
  viewedByMe: boolean;
  viewCount: number;
}

export interface CallInvitePayload {
  conversationId: string;
  video: boolean;
}

export interface CallSignalPayload {
  callId: string;
  conversationId: string;
}

export interface CallOfferEvent {
  callId: string;
  conversationId: string;
  fromUserId: string;
  fromName: string;
  video: boolean;
  livekitUrl: string | null;
  group: boolean;
  roomName?: string;
  token?: string;
}

export interface CallAcceptedEvent {
  callId: string;
  conversationId: string;
  token: string;
  livekitUrl: string;
  roomName: string;
  video: boolean;
}

export interface CallEndedEvent {
  callId: string;
  conversationId: string;
  reason: "rejected" | "cancelled" | "hangup" | "unavailable";
}
