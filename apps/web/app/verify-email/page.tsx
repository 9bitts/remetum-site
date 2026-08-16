"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { api, ApiError } from "@/lib/api";

function Verify() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setError("Link inválido");
      return;
    }
    void api("/auth/verify-email", { body: { token } })
      .then(() => setStatus("ok"))
      .catch((err) => {
        setStatus("error");
        setError(err instanceof ApiError ? err.message : "Falha ao confirmar");
      });
  }, [token]);

  return (
    <div className="w-full max-w-sm space-y-4 rounded-[var(--radius-ebano)] bg-ebano-surface p-6 text-center">
      <p className="text-xs tracking-[0.2em] text-ebano-accent uppercase">
        Remetum
      </p>
      <h1 className="text-2xl font-semibold">Confirmar e-mail</h1>
      {status === "loading" ? (
        <p className="text-sm text-ebano-muted">Validando…</p>
      ) : null}
      {status === "ok" ? (
        <p className="text-sm text-ebano-muted">
          E-mail confirmado.{" "}
          <Link href="/app" className="text-ebano-accent hover:underline">
            Ir para o app
          </Link>
        </p>
      ) : null}
      {status === "error" ? (
        <p className="text-sm text-red-300">{error}</p>
      ) : null}
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <main className="flex min-h-full items-center justify-center bg-[radial-gradient(ellipse_at_top,_#1a1a1f_0%,_#0B0B0D_55%)] px-4 py-10">
      <Suspense>
        <Verify />
      </Suspense>
    </main>
  );
}
