import type { ConversationSummary, PublicUser } from "@ebano/shared";

export function conversationTitle(
  conversation: ConversationSummary,
  currentUserId: string,
) {
  if (conversation.type === "group") {
    return conversation.name || "Grupo";
  }
  const other = conversation.participants.find((p) => p.id !== currentUserId);
  return other?.name ?? "Conversa";
}

export function conversationPeer(
  conversation: ConversationSummary,
  currentUserId: string,
): PublicUser | null {
  if (conversation.type !== "direct") return null;
  return conversation.participants.find((p) => p.id !== currentUserId) ?? null;
}

export function formatTime(iso: string) {
  const date = new Date(iso);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) {
    return date.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
  });
}

export function formatLastSeen(iso: string | null) {
  if (!iso) return "offline";
  const date = new Date(iso);
  return `visto ${date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}
