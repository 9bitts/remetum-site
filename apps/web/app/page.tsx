import Link from "next/link";

export default function HomePage() {
  return (
    <main className="flex min-h-full flex-col items-center justify-center bg-[radial-gradient(ellipse_at_top,_#1a1a1f_0%,_#0B0B0D_55%)] px-6 text-center">
      <p className="mb-3 text-sm tracking-[0.2em] text-ebano-accent uppercase">
        Remetum
      </p>
      <h1 className="max-w-md text-4xl font-semibold tracking-tight text-ebano-text sm:text-5xl">
        Conversas com estilo.
      </h1>
      <p className="mt-4 max-w-sm text-base text-ebano-muted">
        Suas mensagens, no seu tom.
      </p>
      <div className="mt-10 flex gap-3">
        <Link
          href="/login"
          className="rounded-xl bg-ebano-accent px-5 py-2.5 font-medium text-ebano-bg hover:brightness-110"
        >
          Entrar
        </Link>
        <Link
          href="/register"
          className="rounded-xl border border-white/15 px-5 py-2.5 text-ebano-text hover:border-ebano-accent"
        >
          Criar conta
        </Link>
      </div>
    </main>
  );
}
