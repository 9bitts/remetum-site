import { AuthProvider } from "@/components/AuthProvider";
import { ChatShell } from "@/components/ChatShell";

export default function AppPage() {
  return (
    <AuthProvider>
      <ChatShell />
    </AuthProvider>
  );
}
