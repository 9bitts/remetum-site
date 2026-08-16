import { Suspense } from "react";
import { AuthForm } from "@/components/AuthForm";
import { RedirectIfAuthed } from "@/components/AuthProvider";

export default function LoginPage() {
  return (
    <RedirectIfAuthed>
      <main className="flex min-h-full items-center justify-center bg-[radial-gradient(ellipse_at_top,_#1a1a1f_0%,_#0B0B0D_55%)] px-4 py-10">
        <Suspense>
          <AuthForm mode="login" />
        </Suspense>
      </main>
    </RedirectIfAuthed>
  );
}
