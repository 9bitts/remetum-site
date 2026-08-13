"use client";

import { useEffect, useRef, useState } from "react";
import type { AuthUser, PublicUser } from "@ebano/shared";
import { api } from "@/lib/api";
import { API_URL } from "@/lib/config";
import { Avatar } from "./Avatar";

async function fileToJpegBlob(file: File, maxSize = 1024): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Não foi possível processar a imagem");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/jpeg", 0.88),
  );
  if (!blob) throw new Error("Não foi possível converter a imagem");
  return blob;
}

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
  const [avatarUrl, setAvatarUrl] = useState<string | null>(user.avatarUrl);
  const [blocked, setBlocked] = useState<PublicUser[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setName(user.name);
    setBio(user.bio ?? "");
    setAvatarUrl(user.avatarUrl);
    setError(null);
    void api<{ users: PublicUser[] }>("/users/blocked")
      .then((res) => setBlocked(res.users))
      .catch(() => setBlocked([]));
  }, [open, user.name, user.bio, user.avatarUrl]);

  if (!open) return null;

  async function onPickPhoto(file: File) {
    setUploading(true);
    setError(null);
    try {
      let uploadBlob: Blob;
      let filename = file.name || "avatar.jpg";
      try {
        uploadBlob = await fileToJpegBlob(file);
        filename = filename.replace(/\.[^.]+$/, "") + ".jpg";
      } catch {
        if (!file.type.startsWith("image/")) {
          throw new Error("Envie uma imagem (JPG, PNG, WebP…)");
        }
        uploadBlob = file;
      }

      const form = new FormData();
      form.append("file", uploadBlob, filename);

      const upload = await fetch(`${API_URL}/uploads`, {
        method: "POST",
        credentials: "include",
        body: form,
      });
      const data = (await upload.json().catch(() => ({}))) as {
        url?: string;
        error?: string;
      };
      if (!upload.ok || !data.url) {
        throw new Error(data.error ?? `Falha no upload (${upload.status})`);
      }

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
            <p className="text-xs text-ebano-muted">Conta Remetum</p>
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
            </div>
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
