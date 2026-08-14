"use client";

import { useEffect, useState } from "react";
import type { ConversationSummary, PublicUser } from "@ebano/shared";
import { api } from "@/lib/api";
import { Avatar } from "./Avatar";

export function NewChatModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (conversation: ConversationSummary) => void;
}) {
  const [tab, setTab] = useState<"direct" | "group" | "invite">("direct");
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [selected, setSelected] = useState<PublicUser[]>([]);
  const [groupName, setGroupName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < 2) {
      setUsers([]);
      return;
    }
    const t = setTimeout(() => {
      void api<{ users: PublicUser[] }>(`/users/search?q=${encodeURIComponent(q)}`).then(
        (res) => setUsers(res.users),
      );
    }, 250);
    return () => clearTimeout(t);
  }, [query, open]);

  if (!open) return null;

  async function createDirect(user: PublicUser) {
    setLoading(true);
    setError(null);
    try {
      const res = await api<{ conversation: ConversationSummary }>(
        "/conversations/direct",
        { body: { userId: user.id } },
      );
      onCreated(res.conversation);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao criar conversa");
    } finally {
      setLoading(false);
    }
  }

  async function createGroup() {
    if (!groupName.trim() || selected.length === 0) {
      setError("Informe o nome e ao menos um membro");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api<{ conversation: ConversationSummary }>(
        "/conversations/group",
        {
          body: {
            name: groupName,
            memberIds: selected.map((u) => u.id),
          },
        },
      );
      onCreated(res.conversation);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao criar grupo");
    } finally {
      setLoading(false);
    }
  }

  function toggleUser(user: PublicUser) {
    setSelected((prev) =>
      prev.some((u) => u.id === user.id)
        ? prev.filter((u) => u.id !== user.id)
        : [...prev, user],
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <div className="w-full max-w-md rounded-[var(--radius-ebano)] bg-ebano-surface p-4 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Nova conversa</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-ebano-muted hover:text-ebano-text"
          >
            Fechar
          </button>
        </div>

        <div className="mb-3 flex gap-2">
          <button
            type="button"
            onClick={() => setTab("direct")}
            className={`rounded-xl px-3 py-1.5 text-sm ${
              tab === "direct"
                ? "bg-ebano-accent text-ebano-bg"
                : "bg-ebano-bg text-ebano-muted"
            }`}
          >
            Direta
          </button>
          <button
            type="button"
            onClick={() => setTab("group")}
            className={`rounded-xl px-3 py-1.5 text-sm ${
              tab === "group"
                ? "bg-ebano-accent text-ebano-bg"
                : "bg-ebano-bg text-ebano-muted"
            }`}
          >
            Grupo
          </button>
          <button
            type="button"
            onClick={() => setTab("invite")}
            className={`rounded-xl px-3 py-1.5 text-sm ${
              tab === "invite"
                ? "bg-ebano-accent text-ebano-bg"
                : "bg-ebano-bg text-ebano-muted"
            }`}
          >
            Convite
          </button>
        </div>

        {tab === "invite" ? (
          <div className="space-y-3">
            <input
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              placeholder="Código do grupo"
              className="w-full rounded-xl border border-white/10 bg-ebano-bg px-3 py-2 outline-none focus:border-ebano-accent"
            />
            <button
              type="button"
              disabled={loading}
              onClick={() => {
                void (async () => {
                  setLoading(true);
                  setError(null);
                  try {
                    const res = await api<{ conversation: ConversationSummary }>(
                      "/conversations/join",
                      { body: { inviteCode } },
                    );
                    onCreated(res.conversation);
                    onClose();
                  } catch (err) {
                    setError(
                      err instanceof Error ? err.message : "Convite inválido",
                    );
                  } finally {
                    setLoading(false);
                  }
                })();
              }}
              className="w-full rounded-xl bg-ebano-accent py-2.5 font-medium text-ebano-bg disabled:opacity-60"
            >
              Entrar no grupo
            </button>
          </div>
        ) : null}

        {tab === "group" ? (
          <input
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            placeholder="Nome do grupo"
            className="mb-3 w-full rounded-xl border border-white/10 bg-ebano-bg px-3 py-2 outline-none focus:border-ebano-accent"
          />
        ) : null}

        {tab !== "invite" ? (
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nome"
            className="mb-3 w-full rounded-xl border border-white/10 bg-ebano-bg px-3 py-2 outline-none focus:border-ebano-accent"
          />
        ) : null}
        {tab !== "invite" ? (
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {users.map((user) => {
              const active = selected.some((u) => u.id === user.id);
              return (
                <button
                  key={user.id}
                  type="button"
                  disabled={loading}
                  onClick={() =>
                    tab === "direct" ? void createDirect(user) : toggleUser(user)
                  }
                  className={`flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-white/5 ${
                    active ? "bg-white/5" : ""
                  }`}
                >
                  <Avatar
                    name={user.name}
                    url={user.avatarUrl}
                    online={user.status === "online"}
                    size="sm"
                  />
                  <div>
                    <p className="text-sm font-medium">{user.name}</p>
                    <p className="text-xs text-ebano-muted">
                      {user.bio || "Sem bio"}
                    </p>
                  </div>
                </button>
              );
            })}
            {query.trim().length >= 2 && users.length === 0 ? (
              <p className="px-2 py-6 text-center text-sm text-ebano-muted">
                Nenhum usuário encontrado
              </p>
            ) : null}
          </div>
        ) : null}

        {error ? (
          <p className="mt-3 text-sm text-red-300">{error}</p>
        ) : null}

        {tab === "group" ? (
          <button
            type="button"
            disabled={loading}
            onClick={() => void createGroup()}
            className="mt-4 w-full rounded-xl bg-ebano-accent py-2.5 font-medium text-ebano-bg disabled:opacity-60"
          >
            Criar grupo
          </button>
        ) : null}
      </div>
    </div>
  );
}
