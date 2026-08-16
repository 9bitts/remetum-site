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
  sessionError: string | null;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  setUser: (user: AuthUser | null) => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function AuthLoading() {
  return (
    <main className="flex h-dvh items-center justify-center text-ebano-muted">
      Carregando…
    </main>
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionError, setSessionError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 12_000);
    try {
      const data = await api<AuthResponse>("/auth/me", {
        signal: controller.signal,
      });
      setUser(data.user);
      setSessionError(null);
      connectSocket();
    } catch (err) {
      const unauthorized = err instanceof ApiError && err.status === 401;
      if (unauthorized) {
        setUser(null);
        setSessionError(null);
        disconnectSocket();
        return;
      }
      const aborted =
        (err instanceof DOMException && err.name === "AbortError") ||
        (err instanceof Error && err.name === "AbortError");
      setSessionError(
        aborted
          ? "A API não respondeu. Tente de novo em instantes."
          : err instanceof Error
            ? err.message
            : "Falha de conexão",
      );
    } finally {
      window.clearTimeout(timer);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) void refresh();
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, [refresh]);

  useEffect(() => {
    return () => disconnectSocket();
  }, []);

  const logout = useCallback(async () => {
    try {
      await api("/auth/logout", { method: "POST" });
    } catch {
      // Local session still ends; cookies may already be gone.
    }
    disconnectSocket();
    setUser(null);
    setSessionError(null);
    window.location.replace("/login");
  }, []);

  const value = useMemo(
    () => ({ user, loading, sessionError, refresh, logout, setUser }),
    [user, loading, sessionError, refresh, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading, sessionError, refresh } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user && !sessionError) {
      router.replace("/login");
    }
  }, [loading, user, sessionError, router]);

  if (loading) return <AuthLoading />;

  if (!user && sessionError) {
    return (
      <main className="flex h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-ebano-muted">{sessionError}</p>
        <button
          type="button"
          onClick={() => void refresh()}
          className="rounded-xl bg-ebano-accent px-4 py-2 text-sm font-medium text-ebano-bg"
        >
          Tentar de novo
        </button>
      </main>
    );
  }

  if (!user) return <AuthLoading />;

  return children;
}

export function RedirectIfAuthed({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading || !user) return;
    const params = new URLSearchParams(window.location.search);
    const next = params.get("next");
    const target =
      next && next.startsWith("/") && !next.startsWith("//") && !next.includes("://")
        ? next
        : "/app";
    router.replace(target.startsWith("/join/") || target.startsWith("/u/") || target.startsWith("/app") || target.startsWith("/verify-email") ? target : "/app");
  }, [loading, user, router]);

  if (loading) return <AuthLoading />;
  if (user) return <AuthLoading />;
  return children;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
