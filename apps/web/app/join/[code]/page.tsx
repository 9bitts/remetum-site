"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import type { ConversationSummary } from "@ebano/shared";
import { useAuth } from "@/components/AuthProvider";

export default function JoinPage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const { user, loading } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    const code = params.code;
    if (!code) {
      setError("Convite inválido");
      return;
    }
    if (!user) {
      router.replace(`/login?next=${encodeURIComponent(`/join/${code}`)}`);
      return;
    }
    void api<{ conversation: ConversationSummary }>("/conversations/join", {
      body: { inviteCode: code },
    })
      .then((res) => {
        router.replace(`/app?c=${encodeURIComponent(res.conversation.id)}`);
      })
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : "Não foi possível entrar");
      });
  }, [loading, user, params.code, router]);

  return (
    <main className="flex min-h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="text-xs tracking-[0.2em] text-ebano-accent uppercase">
        Remetum
      </p>
      <p className="text-ebano-muted">
        {error ?? "Entrando no grupo…"}
      </p>
    </main>
  );
}
