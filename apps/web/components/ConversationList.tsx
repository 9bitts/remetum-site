"use client";

import type { ConversationSummary, Message } from "@ebano/shared";
import { Avatar } from "./Avatar";
import {
  conversationPeer,
  conversationTitle,
  formatTime,
  messagePreview,
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
  onOpenPeople,
  messageHits,
}: {
  conversations: ConversationSummary[];
  currentUserId: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
  search: string;
  onSearch: (value: string) => void;
  showArchived: boolean;
  onToggleArchived: () => void;
  onOpenPeople: () => void;
  messageHits?: Message[];
}) {
  const q = search.trim().toLowerCase();
  const filtered = conversations.filter((c) => {
    const title = conversationTitle(c, currentUserId).toLowerCase();
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
          placeholder="Buscar conversas e mensagens"
          className="w-full rounded-xl border border-white/10 bg-ebano-bg px-3 py-2 text-sm outline-none focus:border-ebano-accent"
        />
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onToggleArchived}
            className="text-xs text-ebano-muted hover:text-ebano-accent"
          >
            {showArchived ? "Ver conversas" : "Ver arquivadas"}
          </button>
          <button
            type="button"
            onClick={onOpenPeople}
            className="rounded-xl border border-ebano-accent/70 px-3 py-1.5 text-xs font-medium text-ebano-accent hover:bg-ebano-accent hover:text-ebano-bg"
          >
            Ver todas as pessoas
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {messageHits && messageHits.length > 0 ? (
          <div className="mb-3">
            <p className="px-2 pb-1 text-[11px] tracking-wide text-ebano-accent uppercase">
              Mensagens
            </p>
            {messageHits.map((m) => {
              const conv = conversations.find((c) => c.id === m.conversationId);
              const title = conv
                ? conversationTitle(conv, currentUserId)
                : "Conversa";
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onSelect(m.conversationId)}
                  className="mb-1 flex w-full flex-col rounded-[var(--radius-ebano)] px-2 py-2 text-left hover:bg-white/5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-medium">{title}</p>
                    <span className="shrink-0 text-[11px] text-ebano-muted">
                      {formatTime(m.createdAt)}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-ebano-muted">
                    {messagePreview(m)}
                  </p>
                </button>
              );
            })}
          </div>
        ) : null}

        {q.length >= 2 ? (
          <p className="px-2 pb-1 text-[11px] tracking-wide text-ebano-muted uppercase">
            Conversas
          </p>
        ) : null}

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
                    {c.pinnedAt ? (
                      <span className="mr-1 text-ebano-accent">📌</span>
                    ) : null}
                    {c.mutedUntil ? (
                      <span className="mr-1 opacity-70">🔇</span>
                    ) : null}
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
                    {messagePreview(c.lastMessage)}
                  </p>
                  {c.unreadCount > 0 ? (
                    <span className="min-w-[1.25rem] rounded-full bg-ebano-accent px-1.5 py-0.5 text-center text-[10px] font-semibold text-ebano-bg">
                      {c.unreadCount > 99 ? "99+" : c.unreadCount}
                    </span>
                  ) : null}
                </div>
              </div>
            </button>
          );
        })}
        {filtered.length === 0 && (!messageHits || messageHits.length === 0) ? (
          <p className="px-3 py-10 text-center text-sm text-ebano-muted">
            Nenhuma conversa ainda
          </p>
        ) : null}
      </div>
    </div>
  );
}
