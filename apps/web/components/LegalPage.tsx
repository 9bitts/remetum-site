import type { ReactNode } from "react";
import Link from "next/link";

export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <main className="min-h-full bg-[radial-gradient(ellipse_at_top,_#1a1a1f_0%,_#0B0B0D_55%)] px-4 py-10">
      <article className="mx-auto w-full max-w-2xl">
        <p className="text-xs tracking-[0.2em] text-ebano-accent uppercase">
          <Link href="/" className="hover:underline">
            Remetum
          </Link>
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-ebano-text">
          {title}
        </h1>
        <p className="mt-2 text-sm text-ebano-muted">Atualizado em {updated}</p>
        <div className="legal-copy mt-8 space-y-4 text-sm leading-relaxed text-ebano-muted">
          {children}
        </div>
        <p className="mt-10 flex flex-wrap gap-4 text-sm">
          <Link href="/privacidade" className="text-ebano-accent hover:underline">
            Privacidade
          </Link>
          <Link href="/termos" className="text-ebano-accent hover:underline">
            Termos
          </Link>
          <Link href="/suporte" className="text-ebano-accent hover:underline">
            Suporte
          </Link>
          <Link href="/" className="text-ebano-accent hover:underline">
            Início
          </Link>
        </p>
      </article>
    </main>
  );
}
