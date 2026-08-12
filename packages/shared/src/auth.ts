export interface AuthUser {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  bio: string | null;
  status: "online" | "offline";
  lastSeenAt: string | null;
  createdAt: string;
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
