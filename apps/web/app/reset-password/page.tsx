"use client";

import { FormEvent, Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { api, ApiError } from "@/lib/api";

function ResetForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api("/auth/reset-password", { body: { token, password } });
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Falha ao redefinir");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="w-full max-w-sm space-y-4 rounded-[var(--radius-ebano)] bg-ebano-surface p-6"
    >
      <p className="text-xs tracking-[0.2em] text-ebano-accent uppercase">
        Remetum
      </p>
      <h1 className="text-2xl font-semibold">Nova senha</h1>
      {done ? (
        <p className="text-sm text-ebano-muted">
          Senha atualizada.{" "}
          <Link href="/login" className="text-ebano-accent hover:underline">
            Entrar
          </Link>
        </p>
      ) : (
        <>
          <label className="block space-y-1.5">
            <span className="text-sm text-ebano-muted">Nova senha</span>
            <input
              required
              type="password"
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-ebano-bg px-3 py-2.5 outline-none focus:border-ebano-accent"
            />
          </label>
          {error ? <p className="text-sm text-red-300">{error}</p> : null}
          <button
            type="submit"
            disabled={loading || !token}
            className="w-full rounded-xl bg-ebano-accent py-2.5 font-medium text-ebano-bg disabled:opacity-60"
          >
            {loading ? "Salvando…" : "Redefinir"}
          </button>
        </>
      )}
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <main className="flex min-h-full items-center justify-center bg-[radial-gradient(ellipse_at_top,_#1a1a1f_0%,_#0B0B0D_55%)] px-4 py-10">
      <Suspense>
        <ResetForm />
      </Suspense>
    </main>
  );
}
