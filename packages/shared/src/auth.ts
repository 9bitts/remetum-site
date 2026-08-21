export interface AuthUser {
  id: string;
  name: string;
  email: string;
  handle: string | null;
  avatarUrl: string | null;
  bio: string | null;
  status: "online" | "offline";
  lastSeenAt: string | null;
  emailVerifiedAt: string | null;
  hideLastSeen: boolean;
  sendReadReceipts: boolean;
  notificationPreview: "full" | "name" | "hidden";
  notificationSound: boolean;
  dndEnabled: boolean;
  createdAt: string;
}

export interface AuthSession {
  id: string;
  current: boolean;
  userAgent: string | null;
  ip: string | null;
  createdAt: string;
  expiresAt: string;
}

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface AuthResponse {
  user: AuthUser;
}
