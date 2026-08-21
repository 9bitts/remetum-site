"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { ConversationSummary, Message } from "@ebano/shared";
import { Avatar } from "./Avatar";
import { Composer } from "./Composer";
import { MessageBubble } from "./MessageBubble";
import {
  conversationPeer,
  conversationTitle,
  formatLastSeen,
} from "@/lib/format";
import { registerBackHandler } from "@/lib/back-stack";

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
  failedMessageIds,
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
  failedMessageIds?: Set<string>;
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
  const contentRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const pendingScrollRestore = useRef<number | null>(null);
  const wasLoadingOlder = useRef(false);
  const scrollerWasCollapsed = useRef(true);
  const pinning = useRef(false);
  const lastMessageId = messages[messages.length - 1]?.id;
  const [muteOpen, setMuteOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
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
  }, [conversation, peer, typingNames]);

  const senderNames = useMemo(() => {
    const names: Record<string, string> = {};
    for (const participant of conversation.participants) {
      names[participant.id] = participant.name;
    }
    return names;
  }, [conversation.participants]);

  const replySenderName = replyTo
    ? replyTo.senderId === currentUserId
      ? "Você"
      : senderNames[replyTo.senderId] || "Mensagem"
    : undefined;

  function jumpToMessage(messageId: string) {
    const el = document.getElementById(`msg-${messageId}`);
    if (!el) return;
    stickToBottom.current = false;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightedId(messageId);
    window.setTimeout(() => {
      setHighlightedId((current) => (current === messageId ? null : current));
    }, 1400);
  }

  function pinToBottom() {
    const el = listRef.current;
    if (!el) return;
    pinning.current = true;
    el.scrollTop = el.scrollHeight;
    requestAnimationFrame(() => {
      pinning.current = false;
    });
  }

  function pinIfSticky() {
    if (!stickToBottom.current) return;
    if (pendingScrollRestore.current !== null) return;
    pinToBottom();
  }

  useLayoutEffect(() => {
    stickToBottom.current = true;
    pendingScrollRestore.current = null;
    scrollerWasCollapsed.current = true;
    pinToBottom();
  }, [conversation.id]);

  useLayoutEffect(() => {
    pinIfSticky();
  }, [lastMessageId, messages.length, typingNames.length]);

  useEffect(() => {
    const scroller = listRef.current;
    const content = contentRef.current;
    if (!scroller) return;

    const onSize = () => {
      const collapsed = scroller.clientHeight < 2;
      if (scrollerWasCollapsed.current && !collapsed) {
        stickToBottom.current = true;
        pendingScrollRestore.current = null;
        pinToBottom();
      } else {
        pinIfSticky();
      }
      scrollerWasCollapsed.current = collapsed;
    };

    onSize();
    const ro = new ResizeObserver(onSize);
    ro.observe(scroller);
    if (content) ro.observe(content);
    return () => ro.disconnect();
  }, [conversation.id]);

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

  useEffect(() => {
    if (!menuOpen) return;
    return registerBackHandler(() => {
      setMenuOpen(false);
      setMuteOpen(false);
      return true;
    });
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    function onDocClick(e: MouseEvent) {
      const target = e.target as HTMLElement | null;
      if (target?.closest("[data-chat-menu]")) return;
      setMenuOpen(false);
      setMuteOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [menuOpen]);

  function handleScroll() {
    const el = listRef.current;
    if (!el || pinning.current) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    stickToBottom.current = nearBottom;
    if (el.scrollTop < 80 && hasMoreOlder && !loadingOlder) {
      pendingScrollRestore.current = el.scrollHeight;
      onLoadOlder();
    }
  }

  const iconBtn =
    "flex h-9 w-9 items-center justify-center rounded-xl text-ebano-accent hover:bg-white/5";

  return (
    <div className="flex h-full min-h-0 flex-col bg-[radial-gradient(ellipse_at_top,_#141418_0%,_#0B0B0D_50%)]">
      <header className="flex shrink-0 items-center gap-2 border-b border-white/5 px-3 py-3">
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

        <div className="relative flex shrink-0 items-center gap-0.5" data-chat-menu>
          <button
            type="button"
            onClick={onCallVoice}
            className={iconBtn}
            title="Chamada de voz"
            aria-label="Chamada de voz"
          >
            <PhoneIcon />
          </button>
          <button
            type="button"
            onClick={onCallVideo}
            className={iconBtn}
            title="Chamada de vídeo"
            aria-label="Chamada de vídeo"
          >
            <VideoIcon />
          </button>

          <button
            type="button"
            onClick={() => {
              setMenuOpen((v) => !v);
              setMuteOpen(false);
            }}
            className={iconBtn}
            title="Mais opções"
            aria-label="Mais opções"
            aria-expanded={menuOpen}
          >
            <GearIcon />
          </button>

          {menuOpen ? (
            <div className="absolute top-full right-0 z-30 mt-2 min-w-[200px] rounded-xl border border-white/10 bg-ebano-surface p-1 shadow-xl">
              <MenuItem
                onClick={() => {
                  setMenuOpen(false);
                  onTogglePin();
                }}
              >
                {conversation.pinnedAt ? "Desafixar" : "Fixar"}
              </MenuItem>

              <MenuItem
                onClick={() => setMuteOpen((v) => !v)}
              >
                {conversation.mutedUntil ? "Som" : "Silenciar"}
              </MenuItem>

              {muteOpen ? (
                <div className="mb-1 ml-2 space-y-0.5 border-l border-white/10 pl-2">
                  {conversation.mutedUntil ? (
                    <MenuItem
                      onClick={() => {
                        setMuteOpen(false);
                        setMenuOpen(false);
                        onMute(null);
                      }}
                    >
                      Ativar som
                    </MenuItem>
                  ) : (
                    <>
                      <MenuItem
                        onClick={() => {
                          setMuteOpen(false);
                          setMenuOpen(false);
                          onMute(8 * 60);
                        }}
                      >
                        8 horas
                      </MenuItem>
                      <MenuItem
                        onClick={() => {
                          setMuteOpen(false);
                          setMenuOpen(false);
                          onMute(7 * 24 * 60);
                        }}
                      >
                        1 semana
                      </MenuItem>
                      <MenuItem
                        onClick={() => {
                          setMuteOpen(false);
                          setMenuOpen(false);
                          onMute(0);
                        }}
                      >
                        Para sempre
                      </MenuItem>
                    </>
                  )}
                </div>
              ) : null}

              <MenuItem
                onClick={() => {
                  setMenuOpen(false);
                  onClearChat();
                }}
              >
                Limpar
              </MenuItem>
              <MenuItem
                onClick={() => {
                  setMenuOpen(false);
                  onToggleArchive();
                }}
              >
                {conversation.archivedAt ? "Desarquivar" : "Arquivar"}
              </MenuItem>

              {conversation.type === "group" ? (
                <>
                  <MenuItem
                    onClick={() => {
                      setMenuOpen(false);
                      onGroupInfo();
                    }}
                  >
                    Grupo
                  </MenuItem>
                  {conversation.inviteCode ? (
                    <MenuItem
                      onClick={() => {
                        setMenuOpen(false);
                        onCopyInvite();
                      }}
                    >
                      Convite
                    </MenuItem>
                  ) : null}
                  <MenuItem
                    danger
                    onClick={() => {
                      setMenuOpen(false);
                      onLeaveGroup();
                    }}
                  >
                    Sair do grupo
                  </MenuItem>
                </>
              ) : null}

              {isDirect ? (
                <MenuItem
                  danger
                  onClick={() => {
                    setMenuOpen(false);
                    onBlockPeer();
                  }}
                >
                  Bloquear
                </MenuItem>
              ) : null}
            </div>
          ) : null}
        </div>
      </header>

      <div
        ref={listRef}
        onScroll={handleScroll}
        className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 py-4 [overflow-anchor:none]"
      >
        <div ref={contentRef} className="space-y-2">
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
              senderNames={senderNames}
              currentUserId={currentUserId}
              highlighted={highlightedId === message.id}
              onReply={onReply}
              onReact={onReact}
              onEdit={onEdit}
              onDelete={onDelete}
              sendFailed={failedMessageIds?.has(message.id)}
              onForward={onForward}
              onJumpTo={jumpToMessage}
            />
          ))}
        </div>
      </div>

      <Composer
        conversationId={conversation.id}
        replyTo={replyTo}
        replySenderName={replySenderName}
        editing={editing}
        onCancelReply={onCancelReply}
        onCancelEdit={onCancelEdit}
        onSend={onSend}
        onTyping={onTyping}
      />
    </div>
  );
}

function MenuItem({
  children,
  onClick,
  danger,
}: {
  children: ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`block w-full rounded-lg px-3 py-2.5 text-left text-sm hover:bg-white/5 ${
        danger ? "text-red-300" : "text-ebano-text"
      }`}
    >
      {children}
    </button>
  );
}

function PhoneIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M8.5 4.5c.4-.4 1-.5 1.5-.3l2 1c.5.2.8.7.8 1.2v2.1c0 .4-.2.8-.6 1-.7.5-1.1 1.3-1 2.1.3 2 1.9 3.6 3.9 3.9.8.1 1.6-.3 2.1-1 .2-.4.6-.6 1-.6h2.1c.5 0 1 .3 1.2.8l1 2c.2.5.1 1.1-.3 1.5-1.2 1.2-2.9 1.8-4.6 1.5-4.4-.8-7.9-4.3-8.7-8.7-.3-1.7.3-3.4 1.5-4.6Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function VideoIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect
        x="3.5"
        y="6.5"
        width="11"
        height="11"
        rx="2.2"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <path
        d="M14.5 10.5 20 7.5v9l-5.5-3v-3Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 8.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6Z"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <path
        d="M19.4 13.2a7.8 7.8 0 0 0 .1-1.2 7.8 7.8 0 0 0-.1-1.2l2-1.6-1.9-3.3-2.4.8a7.5 7.5 0 0 0-2.1-1.2L13.5 2h-3l-.5 2.5a7.5 7.5 0 0 0-2.1 1.2l-2.4-.8L3.6 8.2l2 1.6a7.8 7.8 0 0 0-.1 1.2c0 .4 0 .8.1 1.2l-2 1.6 1.9 3.3 2.4-.8c.6.5 1.3.9 2.1 1.2L10.5 22h3l.5-2.5c.8-.3 1.5-.7 2.1-1.2l2.4.8 1.9-3.3-2-1.6Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}
