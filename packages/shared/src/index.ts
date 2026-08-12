export type {
  AuthUser,
  RegisterInput,
  LoginInput,
  AuthResponse,
} from "./auth";

export type {
  ConversationSummary,
  ConversationDetail,
  MessagesPage,
  CreateDirectInput,
  CreateGroupInput,
  UpdateProfileInput,
} from "./chat";

export type UserStatus = "online" | "offline";

export type ConversationType = "direct" | "group";

export type ParticipantRole = "member" | "admin";

export type MessageType = "text" | "image" | "file";

export type DeliveryStatus = "sent" | "delivered" | "read";

export interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  bio: string | null;
  status: UserStatus;
  lastSeenAt: string | null;
  createdAt: string;
}

export interface PublicUser {
  id: string;
  name: string;
  avatarUrl: string | null;
  bio: string | null;
  status: UserStatus;
  lastSeenAt: string | null;
}

export interface Conversation {
  id: string;
  type: ConversationType;
  name: string | null;
  avatarUrl: string | null;
  createdAt: string;
}

export interface ConversationParticipant {
  conversationId: string;
  userId: string;
  role: ParticipantRole;
  joinedAt: string;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  content: string | null;
  type: MessageType;
  mediaUrl: string | null;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  status?: DeliveryStatus;
}

export interface MessageStatusRecord {
  messageId: string;
  userId: string;
  status: DeliveryStatus;
  updatedAt: string;
}

/** Socket.IO event payloads (shared contract) */
export interface MessageSendPayload {
  conversationId: string;
  content?: string;
  type: MessageType;
  mediaUrl?: string;
  clientTempId?: string;
}

export interface MessageNewEvent {
  message: Message;
  clientTempId?: string;
}

export interface MessageSentEvent {
  messageId: string;
  clientTempId?: string;
  createdAt: string;
}

export interface MessageReadPayload {
  conversationId: string;
  messageIds: string[];
}

export interface MessageStatusEvent {
  messageId: string;
  userId: string;
  status: DeliveryStatus;
  conversationId: string;
}

export interface TypingPayload {
  conversationId: string;
  isTyping: boolean;
}

export interface TypingEvent {
  conversationId: string;
  userId: string;
  isTyping: boolean;
}

export interface PresenceEvent {
  userId: string;
  status: UserStatus;
  lastSeenAt: string | null;
}

export const SOCKET_EVENTS = {
  MESSAGE_SEND: "message:send",
  MESSAGE_NEW: "message:new",
  MESSAGE_SENT: "message:sent",
  MESSAGE_READ: "message:read",
  MESSAGE_STATUS: "message:status",
  TYPING: "typing",
  PRESENCE: "presence",
  ERROR: "error",
} as const;
