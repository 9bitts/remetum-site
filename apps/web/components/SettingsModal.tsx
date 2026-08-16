"use client";

import { useEffect, useRef, useState } from "react";
import type { AuthSession, AuthUser, PublicUser } from "@ebano/shared";
import { api } from "@/lib/api";
import { uploadMedia } from "@/lib/upload";
import { profileUrl } from "@/lib/links";
import { Avatar } from "./Avatar";

export function SettingsModal({
  open,
  onClose,
  user,
  onUserUpdated,
  onLogout,
}: {
  open: boolean;
  onClose: () => void;
  user: AuthUser;
  onUserUpdated: (user: AuthUser) => void;
  onLogout: () => void;
}) {
  const [name, setName] = useState(user.name);
  const [handle, setHandle] = useState(user.handle ?? "");
  const [bio, setBio] = useState(user.bio ?? "");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(user.avatarUrl);
  const [hideLastSeen, setHideLastSeen] = useState(user.hideLastSeen);
  const [sendReadReceipts, setSendReadReceipts] = useState(user.sendReadReceipts);
  const [blocked, setBlocked] = useState<PublicUser[]>([]);
  const [sessions, setSessions] = useState<AuthSession[]>([]);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setName(user.name);
    setHandle(user.handle ?? "");
    setBio(user.bio ?? "");
    setAvatarUrl(user.avatarUrl);
    setHideLastSeen(user.hideLastSeen);
    setSendReadReceipts(user.sendReadReceipts);
    setError(null);
    void api<{ users: PublicUser[] }>("/users/blocked")
      .then((res) => setBlocked(res.users))
      .catch(() => setBlocked([]));
    void api<{ sessions: AuthSession[] }>("/auth/sessions")
      .then((res) => setSessions(res.sessions))
      .catch(() => setSessions([]));
  }, [
    open,
    user.name,
    user.handle,
    user.bio,
    user.avatarUrl,
    user.hideLastSeen,
    user.sendReadReceipts,
  ]);

  if (!open) return null;

  async function onPickPhoto(file: File) {
    setUploading(true);
    setError(null);
    try {
      if (
        !file.type.startsWith("image/") &&
        !/\.(jpe?g|png|webp|gif|heic|heif|avif|bmp)$/i.test(file.name)
      ) {
        throw new Error("Envie uma imagem (JPG, PNG, WebP…)");
      }
      const data = await uploadMedia(file, { imageMaxSize: 1024 });

      const res = await api<{ user: AuthUser }>("/users/me", {
        method: "PATCH",
        body: { avatarUrl: data.url },
      });
      setAvatarUrl(res.user.avatarUrl);
      onUserUpdated(res.user);
    } catch (err) {
      const message =
        err instanceof TypeError
          ? "Não foi possível conectar à API. Confira a rede e tente de novo."
          : err instanceof Error
            ? err.message
            : "Falha ao enviar foto";
      setError(message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function removePhoto() {
    setUploading(true);
    setError(null);
    try {
      const res = await api<{ user: AuthUser }>("/users/me", {
        method: "PATCH",
        body: { avatarUrl: null },
      });
      setAvatarUrl(res.user.avatarUrl);
      onUserUpdated(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao remover foto");
    } finally {
      setUploading(false);
    }
  }

  async function saveProfile() {
    setSaving(true);
    setError(null);
    try {
      const res = await api<{ user: AuthUser }>("/users/me", {
        method: "PATCH",
        body: {
          name: name.trim(),
          handle: handle.trim() || undefined,
          bio: bio.trim() || null,
          hideLastSeen,
          sendReadReceipts,
        },
      });
      onUserUpdated(res.user);
      setHandle(res.user.handle ?? "");
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

  async function changePassword() {
    setSaving(true);
    setError(null);
    try {
      await api("/auth/change-password", {
        body: { currentPassword, newPassword },
      });
      onLogout();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao trocar senha");
      setSaving(false);
    }
  }

  async function revokeAll() {
    if (!window.confirm("Encerrar todas as sessões? Você precisará entrar de novo.")) {
      return;
    }
    try {
      await api("/auth/sessions/revoke-all", { method: "POST" });
      onLogout();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao encerrar sessões");
    }
  }

  async function revokeOne(id: string, current: boolean) {
    try {
      await api(`/auth/sessions/${id}/revoke`, { method: "POST" });
      if (current) {
        onLogout();
        return;
      }
      setSessions((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao encerrar sessão");
    }
  }

  async function destroyAccount() {
    if (
      !window.confirm(
        "Apagar a conta e todas as suas mensagens? Isso não tem volta.",
      )
    ) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api("/auth/account", { method: "DELETE", body: { password: deletePassword } });
      onLogout();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao apagar conta");
      setSaving(false);
    }
  }

  function copyProfile() {
    if (!user.handle) return;
    void navigator.clipboard.writeText(profileUrl(user.handle));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
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

        <input
          ref={fileRef}
          type="file"
          accept="image/*,image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
          capture="user"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void onPickPhoto(file);
          }}
        />

        <div className="mb-5 flex items-center gap-4">
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
            className="group relative shrink-0 disabled:opacity-60"
            title="Alterar foto"
            aria-label="Alterar foto de perfil"
          >
            <Avatar name={name || user.name} url={avatarUrl} size="lg" />
            <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 text-[10px] font-medium text-ebano-accent opacity-0 transition group-hover:opacity-100">
              Foto
            </span>
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{user.email}</p>
            <p className="text-xs text-ebano-muted">
              {user.handle ? `@${user.handle}` : "Conta Remetum"}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={uploading}
                onClick={() => fileRef.current?.click()}
                className="rounded-lg text-xs text-ebano-accent hover:underline disabled:opacity-60"
              >
                {uploading ? "Enviando…" : "Alterar foto"}
              </button>
              {avatarUrl ? (
                <button
                  type="button"
                  disabled={uploading}
                  onClick={() => void removePhoto()}
                  className="rounded-lg text-xs text-ebano-muted hover:text-red-300 disabled:opacity-60"
                >
                  Remover
                </button>
              ) : null}
              {user.handle ? (
                <button
                  type="button"
                  onClick={copyProfile}
                  className="rounded-lg text-xs text-ebano-accent hover:underline"
                >
                  {copied ? "Link copiado" : "Copiar link"}
                </button>
              ) : null}
            </div>
          </div>
        </div>

        <label className="mb-1 block text-xs text-ebano-muted">Nome</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mb-3 w-full rounded-xl border border-white/10 bg-ebano-bg px-3 py-2 text-sm outline-none focus:border-ebano-accent"
        />

        <label className="mb-1 block text-xs text-ebano-muted">Apelido</label>
        <input
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          placeholder="seu_nome"
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

        <label className="mb-2 flex items-center justify-between gap-3 text-sm">
          <span>Ocultar último acesso</span>
          <input
            type="checkbox"
            checked={hideLastSeen}
            onChange={(e) => setHideLastSeen(e.target.checked)}
          />
        </label>
        <label className="mb-4 flex items-center justify-between gap-3 text-sm">
          <span>Enviar confirmação de leitura</span>
          <input
            type="checkbox"
            checked={sendReadReceipts}
            onChange={(e) => setSendReadReceipts(e.target.checked)}
          />
        </label>

        <button
          type="button"
          disabled={saving || name.trim().length < 2}
          onClick={() => void saveProfile()}
          className="mb-6 w-full rounded-xl bg-ebano-accent py-2.5 text-sm font-medium text-ebano-bg disabled:opacity-60"
        >
          {saving ? "Salvando…" : "Salvar perfil"}
        </button>

        <h3 className="mb-2 text-sm font-medium text-ebano-accent">Senha</h3>
        <input
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          placeholder="Senha atual"
          className="mb-2 w-full rounded-xl border border-white/10 bg-ebano-bg px-3 py-2 text-sm outline-none focus:border-ebano-accent"
        />
        <input
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="Nova senha"
          minLength={8}
          className="mb-2 w-full rounded-xl border border-white/10 bg-ebano-bg px-3 py-2 text-sm outline-none focus:border-ebano-accent"
        />
        <button
          type="button"
          disabled={saving || currentPassword.length < 8 || newPassword.length < 8}
          onClick={() => void changePassword()}
          className="mb-6 w-full rounded-xl border border-white/10 py-2 text-sm text-ebano-text hover:bg-white/5 disabled:opacity-60"
        >
          Trocar senha
        </button>

        <h3 className="mb-2 text-sm font-medium text-ebano-accent">Sessões</h3>
        <div className="mb-3 space-y-1">
          {sessions.map((session) => (
            <div
              key={session.id}
              className="flex items-start justify-between gap-3 rounded-xl px-2 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm">
                  {session.current ? "Este aparelho" : session.userAgent || "Sessão"}
                </p>
                <p className="text-xs text-ebano-muted">
                  {new Date(session.createdAt).toLocaleString("pt-BR")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void revokeOne(session.id, session.current)}
                className="text-xs text-ebano-accent hover:underline"
              >
                Encerrar
              </button>
            </div>
          ))}
          {sessions.length === 0 ? (
            <p className="px-2 py-2 text-sm text-ebano-muted">Nenhuma sessão ativa</p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => void revokeAll()}
          className="mb-6 w-full rounded-xl border border-white/10 py-2 text-sm text-ebano-muted hover:bg-white/5"
        >
          Sair de todos os aparelhos
        </button>

        <h3 className="mb-2 text-sm font-medium text-ebano-accent">
          Usuários bloqueados
        </h3>
        <div className="mb-6 space-y-1">
          {blocked.map((u) => (
            <div
              key={u.id}
              className="flex items-center gap-3 rounded-xl px-2 py-2"
            >
              <Avatar name={u.name} url={u.avatarUrl} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{u.name}</p>
                {u.handle ? (
                  <p className="text-xs text-ebano-muted">@{u.handle}</p>
                ) : null}
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

        <h3 className="mb-2 text-sm font-medium text-red-300">Zona de risco</h3>
        <input
          type="password"
          value={deletePassword}
          onChange={(e) => setDeletePassword(e.target.value)}
          placeholder="Senha para confirmar exclusão"
          className="mb-2 w-full rounded-xl border border-red-400/20 bg-ebano-bg px-3 py-2 text-sm outline-none focus:border-red-400/60"
        />
        <button
          type="button"
          disabled={saving || deletePassword.length < 8}
          onClick={() => void destroyAccount()}
          className="w-full rounded-xl border border-red-400/30 py-2.5 text-sm text-red-300 hover:bg-red-400/10 disabled:opacity-60"
        >
          Apagar conta
        </button>

        {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}
      </div>
    </div>
  );
}
