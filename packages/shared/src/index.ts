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
  StatusItem,
  CallInvitePayload,
  CallSignalPayload,
  CallOfferEvent,
  CallAcceptedEvent,
  CallEndedEvent,
} from "./chat";

export type UserStatus = "online" | "offline";

export type ConversationType = "direct" | "group";

export type ParticipantRole = "member" | "admin";

export type MessageType = "text" | "image" | "file" | "audio" | "video";

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
  inviteCode: string | null;
  createdAt: string;
}

export interface ConversationParticipant {
  conversationId: string;
  userId: string;
  role: ParticipantRole;
  joinedAt: string;
}

export interface MessageReactionSummary {
  emoji: string;
  count: number;
  reactedByMe: boolean;
}

export interface MessagePreview {
  id: string;
  senderId: string;
  content: string | null;
  type: MessageType;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  replyToId: string | null;
  replyTo: MessagePreview | null;
  content: string | null;
  type: MessageType;
  mediaUrl: string | null;
  durationMs: number | null;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  status?: DeliveryStatus;
  reactions: MessageReactionSummary[];
}

export interface MessageStatusRecord {
  messageId: string;
  userId: string;
  status: DeliveryStatus;
  updatedAt: string;
}

export interface MessageSendPayload {
  conversationId: string;
  content?: string;
  type: MessageType;
  mediaUrl?: string;
  durationMs?: number;
  replyToId?: string;
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

export interface MessageEditPayload {
  messageId: string;
  content: string;
}

export interface MessageDeletePayload {
  messageId: string;
}

export interface MessageReactPayload {
  messageId: string;
  emoji: string;
}

export interface MessageUpdatedEvent {
  message: Message;
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

export interface ConversationUpdatedEvent {
  conversationId: string;
  reason: "created" | "joined" | "prefs" | "left" | "updated";
}

export const SOCKET_EVENTS = {
  MESSAGE_SEND: "message:send",
  MESSAGE_NEW: "message:new",
  MESSAGE_SENT: "message:sent",
  MESSAGE_READ: "message:read",
  MESSAGE_STATUS: "message:status",
  MESSAGE_EDIT: "message:edit",
  MESSAGE_DELETE: "message:delete",
  MESSAGE_REACT: "message:react",
  MESSAGE_UPDATED: "message:updated",
  TYPING: "typing",
  PRESENCE: "presence",
  CONVERSATION_UPDATED: "conversation:updated",
  CONVERSATION_JOIN: "conversation:join",
  CALL_INVITE: "call:invite",
  CALL_OFFER: "call:offer",
  CALL_ACCEPT: "call:accept",
  CALL_REJECT: "call:reject",
  CALL_CANCEL: "call:cancel",
  CALL_HANGUP: "call:hangup",
  CALL_ACCEPTED: "call:accepted",
  CALL_ENDED: "call:ended",
  ERROR: "error",
} as const;
