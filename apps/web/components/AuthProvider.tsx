"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import type { AuthResponse, AuthUser } from "@ebano/shared";
import { api, ApiError } from "@/lib/api";
import { connectSocket, disconnectSocket } from "@/lib/socket";

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  setUser: (user: AuthUser | null) => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await api<AuthResponse>("/auth/me");
      setUser(data.user);
      connectSocket();
    } catch (err) {
      setUser(null);
      disconnectSocket();
      // 401/403 or network: never stay stuck on "Carregando…"
      if (
        !(err instanceof ApiError) ||
        err.status === 401 ||
        err.status === 403
      ) {
        router.replace("/login");
      } else {
        router.replace("/login");
      }
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void refresh();
    return () => disconnectSocket();
  }, [refresh]);

  const logout = useCallback(async () => {
    await api("/auth/logout", { method: "POST" });
    disconnectSocket();
    setUser(null);
    router.replace("/login");
  }, [router]);

  const value = useMemo(
    () => ({ user, loading, refresh, logout, setUser }),
    [user, loading, refresh, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
