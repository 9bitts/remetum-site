"use client";

import { useEffect, useState } from "react";
import type { ConversationSummary } from "@ebano/shared";
import { api } from "@/lib/api";
import { Avatar } from "./Avatar";

export function GroupInfoModal({
  open,
  conversation,
  currentUserId,
  onClose,
  onUpdated,
  onLeft,
}: {
  open: boolean;
  conversation: ConversationSummary;
  currentUserId: string;
  onClose: () => void;
  onUpdated: (conversation: ConversationSummary) => void;
  onLeft: () => void;
}) {
  const [name, setName] = useState(conversation.name ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const isAdmin = conversation.myRole === "admin";

  useEffect(() => {
    if (open) setName(conversation.name ?? "");
  }, [open, conversation.id, conversation.name]);

  if (!open) return null;

  async function rename() {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ conversation: ConversationSummary }>(
        `/conversations/${conversation.id}/group`,
        { method: "PATCH", body: { name: name.trim() } },
      );
      onUpdated(res.conversation);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao renomear");
    } finally {
      setBusy(false);
    }
  }

  async function kick(userId: string) {
    if (!window.confirm("Remover este membro do grupo?")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ conversation: ConversationSummary }>(
        `/conversations/${conversation.id}/members/remove`,
        { body: { memberId: userId } },
      );
      onUpdated(res.conversation);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao remover");
    } finally {
      setBusy(false);
    }
  }

  async function setRole(userId: string, role: "admin" | "member") {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ conversation: ConversationSummary }>(
        `/conversations/${conversation.id}/members/role`,
        { body: { memberId: userId, role } },
      );
      onUpdated(res.conversation);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao alterar cargo");
    } finally {
      setBusy(false);
    }
  }

  async function leave() {
    if (!window.confirm("Sair deste grupo?")) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/conversations/${conversation.id}/leave`, { method: "POST" });
      onLeft();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao sair");
    } finally {
      setBusy(false);
    }
  }

  async function rotateInvite() {
    if (!window.confirm("Gerar um novo código? O anterior deixa de funcionar.")) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ conversation: ConversationSummary }>(
        `/conversations/${conversation.id}/invite/rotate`,
        { method: "POST" },
      );
      onUpdated(res.conversation);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao renovar convite");
    } finally {
      setBusy(false);
    }
  }

  function copyInvite() {
    if (!conversation.inviteCode) return;
    const url = `${window.location.origin}/join/${conversation.inviteCode}`;
    void navigator.clipboard.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <div className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-[var(--radius-ebano)] bg-ebano-surface p-4 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Info do grupo</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-ebano-muted hover:text-ebano-text"
          >
            Fechar
          </button>
        </div>

        <div className="mb-4 flex items-center gap-3">
          <Avatar
            name={conversation.name || "Grupo"}
            url={conversation.avatarUrl}
          />
          <div className="min-w-0 flex-1">
            {isAdmin ? (
              <div className="flex gap-2">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="min-w-0 flex-1 rounded-xl border border-white/10 bg-ebano-bg px-3 py-2 text-sm outline-none focus:border-ebano-accent"
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void rename()}
                  className="rounded-xl bg-ebano-accent px-3 py-2 text-sm font-medium text-ebano-bg disabled:opacity-60"
                >
                  Salvar
                </button>
              </div>
            ) : (
              <p className="font-medium">{conversation.name || "Grupo"}</p>
            )}
            <p className="mt-1 text-xs text-ebano-muted">
              {conversation.participants.length} participantes
            </p>
          </div>
        </div>

        {conversation.inviteCode ? (
          <div className="mb-4 flex gap-2">
            <button
              type="button"
              onClick={copyInvite}
              className="flex-1 rounded-xl border border-white/10 px-3 py-2 text-sm text-ebano-accent hover:bg-white/5"
            >
              {copied ? "Link copiado" : "Copiar link de convite"}
            </button>
            {isAdmin ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void rotateInvite()}
                className="rounded-xl border border-white/10 px-3 py-2 text-sm text-ebano-muted hover:bg-white/5 disabled:opacity-60"
              >
                Renovar
              </button>
            ) : null}
          </div>
        ) : null}

        <h3 className="mb-2 text-sm font-medium text-ebano-accent">Membros</h3>
        <div className="space-y-1">
          {conversation.participants.map((p) => {
            const isMe = p.id === currentUserId;
            return (
              <div
                key={p.id}
                className="flex items-center gap-3 rounded-xl px-2 py-2"
              >
                <Avatar
                  name={p.name}
                  url={p.avatarUrl}
                  online={p.status === "online"}
                  size="sm"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {p.name}
                    {isMe ? " (você)" : ""}
                  </p>
                  <p className="text-xs text-ebano-muted">
                    {p.role === "admin" ? "Admin" : "Membro"}
                  </p>
                </div>
                {isAdmin && !isMe ? (
                  <div className="flex flex-col gap-1">
                    {p.role === "admin" ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void setRole(p.id, "member")}
                        className="text-[11px] text-ebano-muted hover:text-ebano-accent"
                      >
                        Rebaixar
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void setRole(p.id, "admin")}
                        className="text-[11px] text-ebano-muted hover:text-ebano-accent"
                      >
                        Promover
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void kick(p.id)}
                      className="text-[11px] text-red-300/80 hover:text-red-300"
                    >
                      Remover
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        <button
          type="button"
          disabled={busy}
          onClick={() => void leave()}
          className="mt-6 w-full rounded-xl border border-red-400/30 py-2.5 text-sm text-red-300 hover:bg-red-400/10 disabled:opacity-60"
        >
          Sair do grupo
        </button>

        {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}
      </div>
    </div>
  );
}
