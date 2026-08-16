"use client";

import { useEffect, useMemo, useState } from "react";
import {
  SOCKET_EVENTS,
  type ConversationSummary,
  type PresenceEvent,
  type PublicUser,
} from "@ebano/shared";
import { api } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import { Avatar } from "./Avatar";

export function CommunityView({
  onCreated,
}: {
  onCreated: (conversation: ConversationSummary) => void;
}) {
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void api<{ users: PublicUser[] }>("/users?limit=200")
      .then((res) => {
        if (!cancelled) setUsers(res.users);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Falha ao carregar");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const socket = getSocket();
    const onPresence = (event: PresenceEvent) => {
      setUsers((prev) =>
        prev.map((u) =>
          u.id === event.userId
            ? { ...u, status: event.status, lastSeenAt: event.lastSeenAt }
            : u,
        ),
      );
    };
    socket.on(SOCKET_EVENTS.PRESENCE, onPresence);
    return () => {
      socket.off(SOCKET_EVENTS.PRESENCE, onPresence);
    };
  }, []);

  const sorted = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? users.filter(
          (u) =>
            u.name.toLowerCase().includes(q) ||
            (u.handle ?? "").toLowerCase().includes(q.replace(/^@/, "")) ||
            (u.bio ?? "").toLowerCase().includes(q),
        )
      : users;
    return [...filtered].sort((a, b) =>
      a.name.localeCompare(b.name, "pt", { sensitivity: "base" }),
    );
  }, [users, query]);

  async function sendMessage(user: PublicUser) {
    setSendingId(user.id);
    setError(null);
    try {
      const res = await api<{ conversation: ConversationSummary }>(
        "/conversations/direct",
        { body: { userId: user.id } },
      );
      onCreated(res.conversation);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao abrir conversa");
    } finally {
      setSendingId(null);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2 px-3 pt-3 pb-2">
        <div>
          <p className="text-[11px] tracking-wide text-ebano-accent uppercase">
            Comunidade
          </p>
          <p className="mt-0.5 text-sm text-ebano-muted">
            Conheça as pessoas e envie uma mensagem
          </p>
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filtrar por nome ou bio"
          className="w-full rounded-xl border border-white/10 bg-ebano-bg px-3 py-2 text-sm outline-none focus:border-ebano-accent"
        />
      </div>

      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-2">
        {loading ? (
          <p className="px-2 py-10 text-center text-sm text-ebano-muted">
            Carregando pessoas…
          </p>
        ) : null}

        {!loading
          ? sorted.map((user) => (
              <div
                key={user.id}
                className="flex items-start gap-3 rounded-[var(--radius-ebano)] px-2 py-2.5"
              >
                <Avatar
                  name={user.name}
                  url={user.avatarUrl}
                  online={user.status === "online"}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{user.name}</p>
                  {user.handle ? (
                    <p className="text-[11px] text-ebano-accent">@{user.handle}</p>
                  ) : null}
                  <p className="mt-0.5 line-clamp-2 text-xs text-ebano-muted">
                    {user.bio || "Sem bio"}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={sendingId !== null}
                  onClick={() => void sendMessage(user)}
                  className="mt-0.5 shrink-0 rounded-xl bg-ebano-accent px-3 py-1.5 text-xs font-medium text-ebano-bg disabled:opacity-60"
                >
                  {sendingId === user.id ? "Abrindo…" : "Enviar mensagem"}
                </button>
              </div>
            ))
          : null}

        {!loading && sorted.length === 0 ? (
          <p className="px-2 py-10 text-center text-sm text-ebano-muted">
            {query.trim()
              ? "Nenhuma pessoa encontrada"
              : "Ainda não há outras pessoas por aqui"}
          </p>
        ) : null}

        {error ? (
          <p className="px-2 py-3 text-sm text-red-300">{error}</p>
        ) : null}
      </div>
    </div>
  );
}
