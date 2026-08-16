import type { MessageType } from "@ebano/shared";

const KEY = "remetum:outbox:v1";

export type OutboxItem = {
  clientTempId: string;
  conversationId: string;
  content?: string;
  type: Exclude<MessageType, "call">;
  mediaUrl?: string;
  durationMs?: number;
  replyToId?: string;
  createdAt: string;
};

function read(): OutboxItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as OutboxItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(items: OutboxItem[]) {
  localStorage.setItem(KEY, JSON.stringify(items.slice(-80)));
}

export function readOutbox() {
  return read();
}

export function enqueueOutbox(item: OutboxItem) {
  const next = read().filter((row) => row.clientTempId !== item.clientTempId);
  next.push(item);
  write(next);
}

export function dequeueOutbox(clientTempId: string) {
  write(read().filter((row) => row.clientTempId !== clientTempId));
}

export function outboxForConversation(conversationId: string) {
  return read().filter((row) => row.conversationId === conversationId);
}
