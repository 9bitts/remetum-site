import type { ConversationSummary } from "@ebano/shared";
import { formatCallMessage, parseCallMessage } from "@ebano/shared";

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
): ConversationSummary["participants"][number] | null {
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

export function messagePreview(message: {
  type: string;
  content: string | null;
  deletedAt?: string | null;
} | null) {
  if (!message) return "Sem mensagens";
  if (message.deletedAt) return "Mensagem apagada";
  if (message.type === "image") return "📷 Imagem";
  if (message.type === "audio") return "🎤 Áudio";
  if (message.type === "video") return "🎬 Vídeo";
  if (message.type === "file") return "📎 Arquivo";
  if (message.type === "call") {
    return formatCallMessage(parseCallMessage(message.content), null);
  }
  return message.content || "Mensagem";
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}
