"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ConversationSummary, Message } from "@ebano/shared";
import { Avatar } from "./Avatar";
import { Composer } from "./Composer";
import { MessageBubble } from "./MessageBubble";
import {
  conversationPeer,
  conversationTitle,
  formatLastSeen,
} from "@/lib/format";

export function ChatView({
  conversation,
  currentUserId,
  messages,
  typingNames,
  replyTo,
  editing,
  loadingOlder,
  hasMoreOlder,
  onBack,
  onSend,
  onTyping,
  onReply,
  onReact,
  onEdit,
  onDelete,
  onForward,
  onCancelReply,
  onCancelEdit,
  onTogglePin,
  onMute,
  onToggleArchive,
  onClearChat,
  onBlockPeer,
  onCopyInvite,
  onGroupInfo,
  onLeaveGroup,
  onCallVoice,
  onCallVideo,
  onLoadOlder,
}: {
  conversation: ConversationSummary;
  currentUserId: string;
  messages: Message[];
  typingNames: string[];
  replyTo: Message | null;
  editing: Message | null;
  loadingOlder?: boolean;
  hasMoreOlder?: boolean;
  onBack: () => void;
  onSend: (input: {
    content?: string;
    type: "text" | "image" | "file" | "audio" | "video";
    mediaUrl?: string;
    durationMs?: number;
    replyToId?: string;
  }) => void;
  onTyping: (isTyping: boolean) => void;
  onReply: (message: Message) => void;
  onReact: (messageId: string, emoji: string) => void;
  onEdit: (message: Message) => void;
  onDelete: (messageId: string) => void;
  onForward: (message: Message) => void;
  onCancelReply: () => void;
  onCancelEdit: () => void;
  onTogglePin: () => void;
  onMute: (muteMinutes: number | null) => void;
  onToggleArchive: () => void;
  onClearChat: () => void;
  onBlockPeer: () => void;
  onCopyInvite: () => void;
  onGroupInfo: () => void;
  onLeaveGroup: () => void;
  onCallVoice: () => void;
  onCallVideo: () => void;
  onLoadOlder: () => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const pendingScrollRestore = useRef<number | null>(null);
  const wasLoadingOlder = useRef(false);
  const [muteOpen, setMuteOpen] = useState(false);
  const peer = conversationPeer(conversation, currentUserId);
  const title = conversationTitle(conversation, currentUserId);
  const isDirect = conversation.type === "direct";

  const subtitle = useMemo(() => {
    if (typingNames.length > 0) {
      if (typingNames.length === 1) return `${typingNames[0]} digitando…`;
      if (typingNames.length === 2) {
        return `${typingNames[0]} e ${typingNames[1]} digitando…`;
      }
      return "várias pessoas digitando…";
    }
    if (conversation.type === "group") {
      return `${conversation.participants.length} participantes`;
    }
    if (peer?.status === "online") return "online";
    return formatLastSeen(peer?.lastSeenAt ?? null);
  }, [typingNames, conversation, peer]);

  useEffect(() => {
    if (!stickToBottom.current) return;
    if (pendingScrollRestore.current !== null) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, typingNames.length]);

  useEffect(() => {
    if (wasLoadingOlder.current && !loadingOlder) {
      const el = listRef.current;
      const prevHeight = pendingScrollRestore.current;
      if (el && prevHeight !== null) {
        el.scrollTop = el.scrollHeight - prevHeight;
      }
      pendingScrollRestore.current = null;
    }
    wasLoadingOlder.current = Boolean(loadingOlder);
  }, [loadingOlder, messages.length]);

  function handleScroll() {
    const el = listRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    stickToBottom.current = nearBottom;
    if (el.scrollTop < 80 && hasMoreOlder && !loadingOlder) {
      pendingScrollRestore.current = el.scrollHeight;
      onLoadOlder();
    }
  }

  return (
    <div className="flex h-full flex-col bg-[radial-gradient(ellipse_at_top,_#141418_0%,_#0B0B0D_50%)]">
      <header className="flex items-center gap-3 border-b border-white/5 px-3 py-3">
        <button
          type="button"
          onClick={onBack}
          className="rounded-xl px-2 py-1 text-ebano-muted hover:bg-white/5 md:hidden"
        >
          ←
        </button>
        <button
          type="button"
          onClick={conversation.type === "group" ? onGroupInfo : undefined}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <Avatar
            name={title}
            url={
              conversation.type === "direct"
                ? peer?.avatarUrl
                : conversation.avatarUrl
            }
            online={peer?.status === "online"}
            size="sm"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{title}</p>
            <p className="truncate text-xs text-ebano-muted">{subtitle}</p>
          </div>
        </button>
        <div className="relative flex flex-wrap justify-end gap-1 text-xs">
          {isDirect ? (
            <>
              <button
                type="button"
                onClick={onCallVoice}
                className="rounded-lg px-2 py-1 text-ebano-muted hover:bg-white/5"
                title="Chamada de voz"
              >
                📞
              </button>
              <button
                type="button"
                onClick={onCallVideo}
                className="rounded-lg px-2 py-1 text-ebano-muted hover:bg-white/5"
                title="Chamada de vídeo"
              >
                🎥
              </button>
            </>
          ) : null}
          <button
            type="button"
            onClick={onTogglePin}
            className="rounded-lg px-2 py-1 text-ebano-muted hover:bg-white/5"
          >
            {conversation.pinnedAt ? "Desafixar" : "Fixar"}
          </button>
          <button
            type="button"
            onClick={() => setMuteOpen((v) => !v)}
            className="rounded-lg px-2 py-1 text-ebano-muted hover:bg-white/5"
          >
            {conversation.mutedUntil ? "Som" : "Silenciar"}
          </button>
          {muteOpen ? (
            <div className="absolute top-full right-0 z-20 mt-1 min-w-[160px] rounded-xl border border-white/10 bg-ebano-surface p-1 shadow-xl">
              {conversation.mutedUntil ? (
                <button
                  type="button"
                  onClick={() => {
                    setMuteOpen(false);
                    onMute(null);
                  }}
                  className="block w-full rounded-lg px-3 py-2 text-left text-ebano-text hover:bg-white/5"
                >
                  Ativar som
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setMuteOpen(false);
                      onMute(8 * 60);
                    }}
                    className="block w-full rounded-lg px-3 py-2 text-left hover:bg-white/5"
                  >
                    8 horas
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMuteOpen(false);
                      onMute(7 * 24 * 60);
                    }}
                    className="block w-full rounded-lg px-3 py-2 text-left hover:bg-white/5"
                  >
                    1 semana
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMuteOpen(false);
                      onMute(365 * 24 * 60);
                    }}
                    className="block w-full rounded-lg px-3 py-2 text-left hover:bg-white/5"
                  >
                    Para sempre
                  </button>
                </>
              )}
            </div>
          ) : null}
          <button
            type="button"
            onClick={onClearChat}
            className="rounded-lg px-2 py-1 text-ebano-muted hover:bg-white/5"
          >
            Limpar
          </button>
          <button
            type="button"
            onClick={onToggleArchive}
            className="rounded-lg px-2 py-1 text-ebano-muted hover:bg-white/5"
          >
            {conversation.archivedAt ? "Desarquivar" : "Arquivar"}
          </button>
          {conversation.type === "group" ? (
            <>
              <button
                type="button"
                onClick={onGroupInfo}
                className="rounded-lg px-2 py-1 text-ebano-muted hover:bg-white/5"
              >
                Grupo
              </button>
              <button
                type="button"
                onClick={onLeaveGroup}
                className="rounded-lg px-2 py-1 text-red-300/80 hover:bg-white/5"
              >
                Sair
              </button>
              {conversation.inviteCode ? (
                <button
                  type="button"
                  onClick={onCopyInvite}
                  className="rounded-lg px-2 py-1 text-ebano-muted hover:bg-white/5"
                >
                  Convite
                </button>
              ) : null}
            </>
          ) : null}
          {isDirect ? (
            <button
              type="button"
              onClick={onBlockPeer}
              className="rounded-lg px-2 py-1 text-red-300/80 hover:bg-white/5"
            >
              Bloquear
            </button>
          ) : null}
        </div>
      </header>

      <div
        ref={listRef}
        onScroll={handleScroll}
        className="flex-1 space-y-2 overflow-y-auto px-3 py-4"
      >
        {loadingOlder ? (
          <p className="py-2 text-center text-xs text-ebano-muted">
            Carregando…
          </p>
        ) : null}
        {messages.map((message) => (
          <MessageBubble
            key={message.id}
            message={message}
            mine={message.senderId === currentUserId}
            onReply={onReply}
            onReact={onReact}
            onEdit={onEdit}
            onDelete={onDelete}
            onForward={onForward}
          />
        ))}
        <div ref={bottomRef} />
      </div>

      <Composer
        replyTo={replyTo}
        editing={editing}
        onCancelReply={onCancelReply}
        onCancelEdit={onCancelEdit}
        onSend={onSend}
        onTyping={onTyping}
      />
    </div>
  );
}
