import { isValidHandle } from "./handle.js";

export type NotificationPreviewMode = "full" | "name" | "hidden";

export type PushKind = "message" | "reply" | "mention" | "reaction" | "status";

export const MUTE_FOREVER_MINUTES = 0;
export const MUTE_FOREVER_ISO = "9999-12-31T00:00:00.000Z";

export const NOTIFICATION_PREVIEW_MODES = ["full", "name", "hidden"] as const;

export function isNotificationPreviewMode(
  value: unknown,
): value is NotificationPreviewMode {
  return (
    value === "full" || value === "name" || value === "hidden"
  );
}

export function isPermanentMute(mutedUntil: Date | string | null | undefined) {
  if (!mutedUntil) return false;
  const year = new Date(mutedUntil).getUTCFullYear();
  return year >= 9999;
}

export function extractMentionedHandles(text: string): string[] {
  const found = new Set<string>();
  const re = /(^|[^a-z0-9_])@([a-z0-9_]{3,24})\b/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    const handle = (match[2] ?? "").toLowerCase();
    if (isValidHandle(handle)) found.add(handle);
  }
  return [...found];
}

export function previewSnippet(type: string, content: string | null): string {
  if (type === "text") {
    const trimmed = (content ?? "").replace(/\s+/g, " ").trim();
    return trimmed.slice(0, 120) || "Nova mensagem";
  }
  if (type === "image") return "Foto";
  if (type === "audio") return "Áudio";
  if (type === "video") return "Vídeo";
  if (type === "file") return "Arquivo";
  return "Nova mensagem";
}

export function formatPushCopy(input: {
  preview: NotificationPreviewMode;
  kind: PushKind;
  conversationType: "direct" | "group";
  conversationName: string | null;
  senderName: string;
  snippet: string;
  emoji?: string;
}): { title: string; body: string } {
  if (input.preview === "hidden") {
    return { title: "Remetum", body: "Nova notificação" };
  }

  if (input.kind === "status") {
    return {
      title: input.senderName,
      body: input.preview === "name" ? "Novo status" : "Publicou um status",
    };
  }

  const title =
    input.conversationType === "group"
      ? input.conversationName?.trim() || "Grupo"
      : input.senderName;

  if (input.kind === "reaction") {
    if (input.preview === "name") return { title, body: "Nova reação" };
    const who =
      input.conversationType === "group" ? `${input.senderName} ` : "";
    const emoji = input.emoji ? ` ${input.emoji}` : "";
    return { title, body: `${who}reagiu${emoji}`.trim() };
  }

  if (input.preview === "name") {
    if (input.kind === "mention") return { title, body: "Marcou você" };
    if (input.kind === "reply") return { title, body: "Respondeu você" };
    return { title, body: "Nova mensagem" };
  }

  const snippet = input.snippet;
  if (input.kind === "mention") {
    return {
      title,
      body:
        input.conversationType === "group"
          ? `${input.senderName} marcou você: ${snippet}`
          : snippet,
    };
  }
  if (input.kind === "reply") {
    return {
      title,
      body:
        input.conversationType === "group"
          ? `${input.senderName} respondeu: ${snippet}`
          : `Respondeu: ${snippet}`,
    };
  }

  return {
    title,
    body:
      input.conversationType === "group"
        ? `${input.senderName}: ${snippet}`
        : snippet,
  };
}
