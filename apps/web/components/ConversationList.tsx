"use client";

import type { ConversationSummary } from "@ebano/shared";
import { Avatar } from "./Avatar";
import {
  conversationPeer,
  conversationTitle,
  formatTime,
} from "@/lib/format";

export function ConversationList({
  conversations,
  currentUserId,
  selectedId,
  onSelect,
  search,
  onSearch,
  showArchived,
  onToggleArchived,
}: {
  conversations: ConversationSummary[];
  currentUserId: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
  search: string;
  onSearch: (value: string) => void;
  showArchived: boolean;
  onToggleArchived: () => void;
}) {
  const filtered = conversations.filter((c) => {
    const title = conversationTitle(c, currentUserId).toLowerCase();
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      title.includes(q) ||
      (c.lastMessage?.content ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2 px-3 pt-3 pb-2">
        <input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Buscar conversas"
          className="w-full rounded-xl border border-white/10 bg-ebano-bg px-3 py-2 text-sm outline-none focus:border-ebano-accent"
        />
        <button
          type="button"
          onClick={onToggleArchived}
          className="text-xs text-ebano-muted hover:text-ebano-accent"
        >
          {showArchived ? "Ver conversas" : "Ver arquivadas"}
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {filtered.map((c) => {
          const peer = conversationPeer(c, currentUserId);
          const title = conversationTitle(c, currentUserId);
          const active = c.id === selectedId;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onSelect(c.id)}
              className={`mb-1 flex w-full items-center gap-3 rounded-[var(--radius-ebano)] px-2 py-2.5 text-left transition ${
                active ? "bg-ebano-surface" : "hover:bg-white/5"
              }`}
            >
              <Avatar
                name={title}
                url={c.type === "direct" ? peer?.avatarUrl : c.avatarUrl}
                online={peer?.status === "online"}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate font-medium">
                    {c.pinnedAt ? "📌 " : ""}
                    {c.mutedUntil ? "🔇 " : ""}
                    {title}
                  </p>
                  {c.lastMessage ? (
                    <span className="shrink-0 text-[11px] text-ebano-muted">
                      {formatTime(c.lastMessage.createdAt)}
                    </span>
                  ) : null}
                </div>
                <div className="mt-0.5 flex items-center justify-between gap-2">
                  <p className="truncate text-sm text-ebano-muted">
                    {c.lastMessage?.deletedAt
                      ? "Mensagem apagada"
                      : c.lastMessage?.type === "image"
                        ? "📷 Imagem"
                        : c.lastMessage?.type === "audio"
                          ? "🎤 Áudio"
                          : c.lastMessage?.type === "video"
                            ? "🎬 Vídeo"
                            : c.lastMessage?.type === "file"
                              ? "📎 Arquivo"
                              : c.lastMessage?.content || "Sem mensagens"}
                  </p>
                  {c.unreadCount > 0 ? (
                    <span className="rounded-full bg-ebano-accent px-1.5 py-0.5 text-[10px] font-semibold text-ebano-bg">
                      {c.unreadCount}
                    </span>
                  ) : null}
                </div>
              </div>
            </button>
          );
        })}
        {filtered.length === 0 ? (
          <p className="px-3 py-10 text-center text-sm text-ebano-muted">
            Nenhuma conversa ainda
          </p>
        ) : null}
      </div>
    </div>
  );
}
