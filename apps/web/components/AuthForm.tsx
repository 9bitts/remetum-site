"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import type { AuthResponse } from "@ebano/shared";
import { useAuth } from "./AuthProvider";
import { connectSocket } from "@/lib/socket";

type Mode = "login" | "register";

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const { setUser } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const isRegister = mode === "register";

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const data = await api<AuthResponse>(
        isRegister ? "/auth/register" : "/auth/login",
        {
          body: isRegister ? { name, email, password } : { email, password },
        },
      );
      setUser(data.user);
      connectSocket();
      router.replace("/app");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erro inesperado");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="w-full max-w-sm space-y-4 rounded-[var(--radius-ebano)] bg-ebano-surface p-6"
    >
      <div>
        <p className="text-xs tracking-[0.2em] text-ebano-accent uppercase">
          Remetum
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-ebano-text">
          {isRegister ? "Criar conta" : "Entrar"}
        </h1>
        <p className="mt-1 text-sm text-ebano-muted">
          {isRegister
            ? "Comece a conversar com estilo."
            : "Suas mensagens, no seu tom."}
        </p>
      </div>

      {isRegister ? (
        <label className="block space-y-1.5">
          <span className="text-sm text-ebano-muted">Nome</span>
          <input
            required
            minLength={2}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-ebano-bg px-3 py-2.5 text-ebano-text outline-none focus:border-ebano-accent"
            autoComplete="name"
          />
        </label>
      ) : null}

      <label className="block space-y-1.5">
        <span className="text-sm text-ebano-muted">E-mail</span>
        <input
          required
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-xl border border-white/10 bg-ebano-bg px-3 py-2.5 text-ebano-text outline-none focus:border-ebano-accent"
          autoComplete="email"
        />
      </label>

      <label className="block space-y-1.5">
        <span className="text-sm text-ebano-muted">Senha</span>
        <input
          required
          type="password"
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-xl border border-white/10 bg-ebano-bg px-3 py-2.5 text-ebano-text outline-none focus:border-ebano-accent"
          autoComplete={isRegister ? "new-password" : "current-password"}
        />
      </label>

      {error ? (
        <p className="rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-xl bg-ebano-accent px-4 py-2.5 font-medium text-ebano-bg transition hover:brightness-110 disabled:opacity-60"
      >
        {loading ? "Aguarde…" : isRegister ? "Cadastrar" : "Entrar"}
      </button>

      <p className="text-center text-sm text-ebano-muted">
        {isRegister ? (
          <>
            Já tem conta?{" "}
            <Link href="/login" className="text-ebano-accent hover:underline">
              Entrar
            </Link>
          </>
        ) : (
          <>
            Novo por aqui?{" "}
            <Link href="/register" className="text-ebano-accent hover:underline">
              Criar conta
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
