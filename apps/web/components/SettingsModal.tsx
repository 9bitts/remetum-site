"use client";

import { useEffect, useState } from "react";
import type { AuthUser, PublicUser } from "@ebano/shared";
import { api } from "@/lib/api";
import { Avatar } from "./Avatar";

export function SettingsModal({
  open,
  onClose,
  user,
  onUserUpdated,
}: {
  open: boolean;
  onClose: () => void;
  user: AuthUser;
  onUserUpdated: (user: AuthUser) => void;
}) {
  const [name, setName] = useState(user.name);
  const [bio, setBio] = useState(user.bio ?? "");
  const [blocked, setBlocked] = useState<PublicUser[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(user.name);
    setBio(user.bio ?? "");
    setError(null);
    void api<{ users: PublicUser[] }>("/users/blocked")
      .then((res) => setBlocked(res.users))
      .catch(() => setBlocked([]));
  }, [open, user.name, user.bio]);

  if (!open) return null;

  async function saveProfile() {
    setSaving(true);
    setError(null);
    try {
      const res = await api<{ user: AuthUser }>("/users/me", {
        method: "PATCH",
        body: { name: name.trim(), bio: bio.trim() || null },
      });
      onUserUpdated(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar");
    } finally {
      setSaving(false);
    }
  }

  async function unblock(userId: string) {
    try {
      await api("/users/unblock", { body: { userId } });
      setBlocked((prev) => prev.filter((u) => u.id !== userId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao desbloquear");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <div className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-[var(--radius-ebano)] bg-ebano-surface p-4 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Perfil</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-ebano-muted hover:text-ebano-text"
          >
            Fechar
          </button>
        </div>

        <div className="mb-4 flex items-center gap-3">
          <Avatar name={name || user.name} url={user.avatarUrl} size="md" />
          <div className="min-w-0">
            <p className="truncate font-medium">{user.email}</p>
            <p className="text-xs text-ebano-muted">Conta Remetum</p>
          </div>
        </div>

        <label className="mb-1 block text-xs text-ebano-muted">Nome</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mb-3 w-full rounded-xl border border-white/10 bg-ebano-bg px-3 py-2 text-sm outline-none focus:border-ebano-accent"
        />

        <label className="mb-1 block text-xs text-ebano-muted">Bio</label>
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          rows={3}
          placeholder="Sobre você"
          className="mb-3 w-full resize-none rounded-xl border border-white/10 bg-ebano-bg px-3 py-2 text-sm outline-none focus:border-ebano-accent"
        />

        <button
          type="button"
          disabled={saving || name.trim().length < 2}
          onClick={() => void saveProfile()}
          className="mb-6 w-full rounded-xl bg-ebano-accent py-2.5 text-sm font-medium text-ebano-bg disabled:opacity-60"
        >
          {saving ? "Salvando…" : "Salvar perfil"}
        </button>

        <h3 className="mb-2 text-sm font-medium text-ebano-accent">
          Usuários bloqueados
        </h3>
        <div className="space-y-1">
          {blocked.map((u) => (
            <div
              key={u.id}
              className="flex items-center gap-3 rounded-xl px-2 py-2"
            >
              <Avatar name={u.name} url={u.avatarUrl} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{u.name}</p>
              </div>
              <button
                type="button"
                onClick={() => void unblock(u.id)}
                className="rounded-lg px-2 py-1 text-xs text-ebano-accent hover:bg-white/5"
              >
                Desbloquear
              </button>
            </div>
          ))}
          {blocked.length === 0 ? (
            <p className="px-2 py-4 text-center text-sm text-ebano-muted">
              Nenhum bloqueio
            </p>
          ) : null}
        </div>

        {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}
      </div>
    </div>
  );
}
