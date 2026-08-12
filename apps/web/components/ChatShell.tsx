"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  SOCKET_EVENTS,
  type ConversationSummary,
  type Message,
  type MessageNewEvent,
  type MessageStatusEvent,
  type MessageUpdatedEvent,
  type ConversationUpdatedEvent,
  type PresenceEvent,
  type TypingEvent,
} from "@ebano/shared";
import { api } from "@/lib/api";
import { connectSocket, getSocket } from "@/lib/socket";
import { useAuth } from "./AuthProvider";
import { ConversationList } from "./ConversationList";
import { ChatView } from "./ChatView";
import { NewChatModal } from "./NewChatModal";
import { StatusTray } from "./StatusTray";
import { registerPush } from "@/lib/push";
import { conversationPeer } from "@/lib/format";

function tempId() {
  return `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function ChatShell() {
  const { user, loading, logout } = useAuth();
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [search, setSearch] = useState("");
  const [typingByConversation, setTypingByConversation] = useState<
    Record<string, string[]>
  >({});
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [mobileShowChat, setMobileShowChat] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editing, setEditing] = useState<Message | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);

  const selected = useMemo(
    () => conversations.find((c) => c.id === selectedId) ?? null,
    [conversations, selectedId],
  );

  const refreshConversations = useCallback(async () => {
    const res = await api<{ conversations: ConversationSummary[] }>(
      `/conversations${showArchived ? "?archived=1" : ""}`,
    );
    setConversations(res.conversations);
  }, [showArchived]);

  const loadMessages = useCallback(
    async (conversationId: string) => {
      const res = await api<{ messages: Message[] }>(
        `/conversations/${conversationId}/messages`,
      );
      setMessages(res.messages);

      const unread = res.messages
        .filter((m) => m.senderId !== user?.id && m.status !== "read" && !m.deletedAt)
        .map((m) => m.id);
      if (unread.length > 0) {
        getSocket().emit(SOCKET_EVENTS.MESSAGE_READ, {
          conversationId,
          messageIds: unread,
        });
        setConversations((prev) =>
          prev.map((c) =>
            c.id === conversationId ? { ...c, unreadCount: 0 } : c,
          ),
        );
      }
    },
    [user?.id],
  );

  useEffect(() => {
    if (!user) return;
    void refreshConversations().catch((err) =>
      setBootError(err instanceof Error ? err.message : "Falha ao carregar"),
    );
    void registerPush().catch(() => undefined);
  }, [user, refreshConversations]);

  useEffect(() => {
    if (!user) return;
    const socket = connectSocket();

    const onNew = (event: MessageNewEvent) => {
      const msg = event.message;
      setConversations((prev) => {
        const exists = prev.find((c) => c.id === msg.conversationId);
        if (!exists) {
          void refreshConversations();
          return prev;
        }
        const next = prev.map((c) => {
          if (c.id !== msg.conversationId) return c;
          const isOpen = selectedId === c.id;
          return {
            ...c,
            lastMessage: msg,
            unreadCount:
              isOpen || msg.senderId === user.id ? 0 : c.unreadCount + 1,
          };
        });
        return [...next].sort((a, b) => {
          if (a.pinnedAt && !b.pinnedAt) return -1;
          if (!a.pinnedAt && b.pinnedAt) return 1;
          const at = a.lastMessage?.createdAt ?? a.createdAt;
          const bt = b.lastMessage?.createdAt ?? b.createdAt;
          return bt.localeCompare(at);
        });
      });

      if (selectedId === msg.conversationId) {
        setMessages((prev) => {
          if (event.clientTempId) {
            const withoutTemp = prev.filter((m) => m.id !== event.clientTempId);
            if (withoutTemp.some((m) => m.id === msg.id)) return withoutTemp;
            return [...withoutTemp, msg];
          }
          if (prev.some((m) => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
        if (msg.senderId !== user.id) {
          socket.emit(SOCKET_EVENTS.MESSAGE_READ, {
            conversationId: msg.conversationId,
            messageIds: [msg.id],
          });
        }
      }
    };

    const onUpdated = (event: MessageUpdatedEvent) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === event.message.id ? event.message : m)),
      );
      setConversations((prev) =>
        prev.map((c) =>
          c.lastMessage?.id === event.message.id
            ? { ...c, lastMessage: event.message }
            : c,
        ),
      );
    };

    const onStatus = (event: MessageStatusEvent) => {
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== event.messageId || m.senderId !== user.id) return m;
          const rank = { sent: 0, delivered: 1, read: 2 } as const;
          const current = m.status ?? "sent";
          if (rank[event.status] < rank[current]) return m;
          return { ...m, status: event.status };
        }),
      );
    };

    const onTyping = (event: TypingEvent) => {
      if (event.userId === user.id) return;
      setTypingByConversation((prev) => {
        const current = new Set(prev[event.conversationId] ?? []);
        if (event.isTyping) current.add(event.userId);
        else current.delete(event.userId);
        return { ...prev, [event.conversationId]: [...current] };
      });
    };

    const onPresence = (event: PresenceEvent) => {
      setConversations((prev) =>
        prev.map((c) => ({
          ...c,
          participants: c.participants.map((p) =>
            p.id === event.userId
              ? { ...p, status: event.status, lastSeenAt: event.lastSeenAt }
              : p,
          ),
        })),
      );
    };

    const onConversationUpdated = (event: ConversationUpdatedEvent) => {
      socket.emit("conversation:join", event.conversationId);
      void refreshConversations();
    };

    socket.on(SOCKET_EVENTS.MESSAGE_NEW, onNew);
    socket.on(SOCKET_EVENTS.MESSAGE_UPDATED, onUpdated);
    socket.on(SOCKET_EVENTS.MESSAGE_STATUS, onStatus);
    socket.on(SOCKET_EVENTS.TYPING, onTyping);
    socket.on(SOCKET_EVENTS.PRESENCE, onPresence);
    socket.on(SOCKET_EVENTS.CONVERSATION_UPDATED, onConversationUpdated);

    return () => {
      socket.off(SOCKET_EVENTS.MESSAGE_NEW, onNew);
      socket.off(SOCKET_EVENTS.MESSAGE_UPDATED, onUpdated);
      socket.off(SOCKET_EVENTS.MESSAGE_STATUS, onStatus);
      socket.off(SOCKET_EVENTS.TYPING, onTyping);
      socket.off(SOCKET_EVENTS.PRESENCE, onPresence);
      socket.off(SOCKET_EVENTS.CONVERSATION_UPDATED, onConversationUpdated);
    };
  }, [user, selectedId, refreshConversations]);

  async function selectConversation(id: string) {
    setSelectedId(id);
    setMobileShowChat(true);
    setReplyTo(null);
    setEditing(null);
    getSocket().emit("conversation:join", id);
    await loadMessages(id);
  }

  function sendMessage(input: {
    content?: string;
    type: "text" | "image" | "file" | "audio" | "video";
    mediaUrl?: string;
    durationMs?: number;
    replyToId?: string;
  }) {
    if (!selectedId || !user) return;

    if (editing) {
      getSocket().emit(SOCKET_EVENTS.MESSAGE_EDIT, {
        messageId: editing.id,
        content: input.content ?? "",
      });
      setEditing(null);
      return;
    }

    const clientTempId = tempId();
    const optimistic: Message = {
      id: clientTempId,
      conversationId: selectedId,
      senderId: user.id,
      replyToId: input.replyToId ?? null,
      replyTo: replyTo
        ? {
            id: replyTo.id,
            senderId: replyTo.senderId,
            content: replyTo.content,
            type: replyTo.type,
          }
        : null,
      content: input.content ?? null,
      type: input.type,
      mediaUrl: input.mediaUrl ?? null,
      durationMs: input.durationMs ?? null,
      createdAt: new Date().toISOString(),
      editedAt: null,
      deletedAt: null,
      status: "sent",
      reactions: [],
    };
    setMessages((prev) => [...prev, optimistic]);
    setReplyTo(null);
    getSocket().emit(SOCKET_EVENTS.MESSAGE_SEND, {
      conversationId: selectedId,
      content: input.content,
      type: input.type,
      mediaUrl: input.mediaUrl,
      durationMs: input.durationMs,
      replyToId: input.replyToId,
      clientTempId,
    });
  }

  async function patchPrefs(patch: {
    pinned?: boolean;
    archived?: boolean;
    muted?: boolean;
  }) {
    if (!selectedId) return;
    const res = await api<{ conversation: ConversationSummary }>(
      `/conversations/${selectedId}/prefs`,
      { method: "PATCH", body: patch },
    );
    setConversations((prev) => {
      if (patch.archived !== undefined) {
        return prev.filter((c) => c.id !== selectedId);
      }
      return prev.map((c) => (c.id === selectedId ? res.conversation : c));
    });
    if (patch.archived !== undefined) {
      setSelectedId(null);
      setMobileShowChat(false);
    }
  }

  if (loading || !user) {
    return (
      <main className="flex h-dvh items-center justify-center text-ebano-muted">
        Carregando…
      </main>
    );
  }

  if (bootError) {
    return (
      <main className="flex h-dvh items-center justify-center text-red-300">
        {bootError}
      </main>
    );
  }

  return (
    <div className="flex h-dvh overflow-hidden bg-ebano-bg">
      <aside
        className={`w-full border-r border-white/5 md:w-[380px] md:shrink-0 ${
          mobileShowChat ? "hidden md:flex" : "flex"
        } flex-col`}
      >
        <div className="flex items-center justify-between px-4 py-4">
          <div>
            <p className="text-xs tracking-[0.2em] text-ebano-accent uppercase">
              Remetum
            </p>
            <p className="mt-1 text-sm text-ebano-muted">{user.name}</p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setNewChatOpen(true)}
              className="rounded-xl bg-ebano-accent px-3 py-1.5 text-sm font-medium text-ebano-bg"
            >
              Nova
            </button>
            <button
              type="button"
              onClick={() => void logout()}
              className="rounded-xl border border-white/10 px-3 py-1.5 text-sm text-ebano-muted hover:text-ebano-text"
            >
              Sair
            </button>
          </div>
        </div>
        <StatusTray />
        <ConversationList
          conversations={conversations}
          currentUserId={user.id}
          selectedId={selectedId}
          onSelect={(id) => void selectConversation(id)}
          search={search}
          onSearch={setSearch}
          showArchived={showArchived}
          onToggleArchived={() => setShowArchived((v) => !v)}
        />
      </aside>

      <section
        className={`min-w-0 flex-1 ${
          mobileShowChat ? "flex" : "hidden md:flex"
        } flex-col`}
      >
        {selected ? (
          <ChatView
            conversation={selected}
            currentUserId={user.id}
            messages={messages}
            typingUsers={typingByConversation[selected.id] ?? []}
            replyTo={replyTo}
            editing={editing}
            onBack={() => setMobileShowChat(false)}
            onSend={sendMessage}
            onTyping={(isTyping) =>
              getSocket().emit(SOCKET_EVENTS.TYPING, {
                conversationId: selected.id,
                isTyping,
              })
            }
            onReply={setReplyTo}
            onReact={(messageId, emoji) =>
              getSocket().emit(SOCKET_EVENTS.MESSAGE_REACT, { messageId, emoji })
            }
            onEdit={setEditing}
            onDelete={(messageId) =>
              getSocket().emit(SOCKET_EVENTS.MESSAGE_DELETE, { messageId })
            }
            onCancelReply={() => setReplyTo(null)}
            onCancelEdit={() => setEditing(null)}
            onTogglePin={() =>
              void patchPrefs({ pinned: !selected.pinnedAt })
            }
            onToggleMute={() =>
              void patchPrefs({ muted: !selected.mutedUntil })
            }
            onToggleArchive={() =>
              void patchPrefs({ archived: !selected.archivedAt })
            }
            onBlockPeer={() => {
              const peer = conversationPeer(selected, user.id);
              if (!peer) return;
              const blocked = window.confirm(`Bloquear ${peer.name}?`);
              if (!blocked) return;
              void api("/users/block", { body: { userId: peer.id } }).then(() =>
                alert("Usuário bloqueado"),
              );
            }}
            onCopyInvite={() => {
              if (!selected.inviteCode) return;
              void navigator.clipboard.writeText(selected.inviteCode);
              alert(`Código de convite: ${selected.inviteCode}`);
            }}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <p className="text-sm tracking-[0.2em] text-ebano-accent uppercase">
              Remetum
            </p>
            <h1 className="mt-3 text-2xl font-semibold">Conversas com estilo.</h1>
            <p className="mt-2 max-w-sm text-ebano-muted">
              Selecione uma conversa ou inicie uma nova.
            </p>
          </div>
        )}
      </section>

      <NewChatModal
        open={newChatOpen}
        onClose={() => setNewChatOpen(false)}
        onCreated={(conversation) => {
          setConversations((prev) => {
            if (prev.some((c) => c.id === conversation.id)) return prev;
            return [conversation, ...prev];
          });
          void selectConversation(conversation.id);
        }}
      />
    </div>
  );
}
