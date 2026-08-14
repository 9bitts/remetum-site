"use client";

import { useEffect, useMemo, useState } from "react";
import type { ConversationSummary, PublicUser } from "@ebano/shared";
import { api } from "@/lib/api";
import { Avatar } from "./Avatar";

export function PeopleModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (conversation: ConversationSummary) => void;
}) {
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setUsers([]);
      setError(null);
      return;
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < 2) {
      setUsers([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const t = setTimeout(() => {
      void api<{ users: PublicUser[] }>(
        `/users/search?q=${encodeURIComponent(q)}`,
      )
        .then((res) => setUsers(res.users))
        .catch((err) =>
          setError(err instanceof Error ? err.message : "Falha ao buscar"),
        )
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(t);
  }, [query, open]);

  const sorted = useMemo(
    () =>
      [...users].sort((a, b) =>
        a.name.localeCompare(b.name, "pt", { sensitivity: "base" }),
      ),
    [users],
  );

  if (!open) return null;

  async function sendMessage(user: PublicUser) {
    setSendingId(user.id);
    setError(null);
    try {
      const res = await api<{ conversation: ConversationSummary }>(
        "/conversations/direct",
        { body: { userId: user.id } },
      );
      onCreated(res.conversation);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao abrir conversa");
    } finally {
      setSendingId(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <div className="flex max-h-[85dvh] w-full max-w-md flex-col rounded-[var(--radius-ebano)] bg-ebano-surface p-4 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Pessoas</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-ebano-muted hover:text-ebano-text"
          >
            Fechar
          </button>
        </div>

        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por nome (mín. 2 letras)"
          className="mb-3 w-full rounded-xl border border-white/10 bg-ebano-bg px-3 py-2 text-sm outline-none focus:border-ebano-accent"
        />

        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
          {loading ? (
            <p className="px-2 py-10 text-center text-sm text-ebano-muted">
              Buscando…
            </p>
          ) : null}

          {!loading
            ? sorted.map((user) => (
                <div
                  key={user.id}
                  className="flex items-center gap-3 rounded-xl px-2 py-2"
                >
                  <Avatar
                    name={user.name}
                    url={user.avatarUrl}
                    online={user.status === "online"}
                    size="sm"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{user.name}</p>
                    {user.bio ? (
                      <p className="truncate text-xs text-ebano-muted">
                        {user.bio}
                      </p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    disabled={sendingId !== null}
                    onClick={() => void sendMessage(user)}
                    className="shrink-0 rounded-xl bg-ebano-accent px-3 py-1.5 text-xs font-medium text-ebano-bg disabled:opacity-60"
                  >
                    {sendingId === user.id ? "Abrindo…" : "Enviar mensagem"}
                  </button>
                </div>
              ))
            : null}

          {!loading && sorted.length === 0 ? (
            <p className="px-2 py-10 text-center text-sm text-ebano-muted">
              {query.trim().length < 2
                ? "Digite um nome para buscar"
                : "Nenhuma pessoa encontrada"}
            </p>
          ) : null}
        </div>

        {error ? (
          <p className="mt-3 text-sm text-red-300">{error}</p>
        ) : null}
      </div>
    </div>
  );
}
