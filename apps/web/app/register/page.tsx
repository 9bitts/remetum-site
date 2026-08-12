import { AuthForm } from "@/components/AuthForm";

export default function RegisterPage() {
  return (
    <main className="flex min-h-full items-center justify-center bg-[radial-gradient(ellipse_at_top,_#1a1a1f_0%,_#0B0B0D_55%)] px-4 py-10">
      <AuthForm mode="register" />
    </main>
  );
}
