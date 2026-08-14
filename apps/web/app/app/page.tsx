import { RequireAuth } from "@/components/AuthProvider";
import { ChatShell } from "@/components/ChatShell";

export default function AppPage() {
  return (
    <RequireAuth>
      <ChatShell />
    </RequireAuth>
  );
}
