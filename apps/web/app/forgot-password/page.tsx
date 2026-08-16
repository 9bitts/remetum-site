"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [devUrl, setDevUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api<{ ok: boolean; devResetUrl?: string }>(
        "/auth/forgot-password",
        { body: { email } },
      );
      setSent(true);
      setDevUrl(res.devResetUrl ?? null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Falha ao enviar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-full items-center justify-center bg-[radial-gradient(ellipse_at_top,_#1a1a1f_0%,_#0B0B0D_55%)] px-4 py-10">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm space-y-4 rounded-[var(--radius-ebano)] bg-ebano-surface p-6"
      >
        <p className="text-xs tracking-[0.2em] text-ebano-accent uppercase">
          Remetum
        </p>
        <h1 className="text-2xl font-semibold">Recuperar senha</h1>
        {sent ? (
          <p className="text-sm text-ebano-muted">
            Se o e-mail existir, enviamos um link para redefinir a senha.
            {devUrl ? (
              <>
                {" "}
                <a href={devUrl} className="text-ebano-accent hover:underline">
                  Abrir link de desenvolvimento
                </a>
              </>
            ) : null}
          </p>
        ) : (
          <>
            <label className="block space-y-1.5">
              <span className="text-sm text-ebano-muted">E-mail</span>
              <input
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-ebano-bg px-3 py-2.5 outline-none focus:border-ebano-accent"
              />
            </label>
            {error ? <p className="text-sm text-red-300">{error}</p> : null}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-ebano-accent py-2.5 font-medium text-ebano-bg disabled:opacity-60"
            >
              {loading ? "Enviando…" : "Enviar link"}
            </button>
          </>
        )}
        <Link href="/login" className="block text-center text-sm text-ebano-accent">
          Voltar ao login
        </Link>
      </form>
    </main>
  );
}
