"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import type { ConversationSummary, PublicUser } from "@ebano/shared";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/components/AuthProvider";
import { Avatar } from "@/components/Avatar";

export default function ProfilePage() {
  const params = useParams<{ handle: string }>();
  const router = useRouter();
  const { user, loading } = useAuth();
  const [profile, setProfile] = useState<PublicUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);

  useEffect(() => {
    if (loading) return;
    const handle = params.handle;
    if (!handle) return;
    if (!user) {
      router.replace(`/login?next=${encodeURIComponent(`/u/${handle}`)}`);
      return;
    }
    void api<{ user: PublicUser }>(`/users/handle/${encodeURIComponent(handle)}`)
      .then((res) => setProfile(res.user))
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : "Não encontrado");
      });
  }, [loading, user, params.handle, router]);

  async function message() {
    if (!profile) return;
    setOpening(true);
    try {
      const res = await api<{ conversation: ConversationSummary }>(
        "/conversations/direct",
        { body: { userId: profile.id } },
      );
      router.replace(`/app?c=${encodeURIComponent(res.conversation.id)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao abrir conversa");
      setOpening(false);
    }
  }

  return (
    <main className="flex min-h-full items-center justify-center bg-[radial-gradient(ellipse_at_top,_#1a1a1f_0%,_#0B0B0D_55%)] px-4 py-10">
      <div className="w-full max-w-sm rounded-[var(--radius-ebano)] bg-ebano-surface p-6 text-center">
        {profile ? (
          <>
            <div className="flex justify-center">
              <Avatar name={profile.name} url={profile.avatarUrl} size="lg" />
            </div>
            <h1 className="mt-4 text-xl font-semibold">{profile.name}</h1>
            {profile.handle ? (
              <p className="mt-1 text-sm text-ebano-accent">@{profile.handle}</p>
            ) : null}
            <p className="mt-3 text-sm text-ebano-muted">
              {profile.bio || "Sem bio"}
            </p>
            <button
              type="button"
              disabled={opening || profile.id === user?.id}
              onClick={() => void message()}
              className="mt-6 w-full rounded-xl bg-ebano-accent py-2.5 font-medium text-ebano-bg disabled:opacity-60"
            >
              {opening ? "Abrindo…" : "Enviar mensagem"}
            </button>
          </>
        ) : (
          <p className="text-sm text-ebano-muted">{error ?? "Carregando…"}</p>
        )}
        <Link href="/app" className="mt-4 inline-block text-sm text-ebano-accent">
          Voltar
        </Link>
      </div>
    </main>
  );
}
