"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  SOCKET_EVENTS,
  type ConversationSummary,
  type Message,
  type MessageNewEvent,
  type MessageStatusEvent,
  type PresenceEvent,
  type TypingEvent,
} from "@ebano/shared";
import { api } from "@/lib/api";
import { connectSocket, getSocket } from "@/lib/socket";
import { useAuth } from "./AuthProvider";
import { ConversationList } from "./ConversationList";
import { ChatView } from "./ChatView";
import { NewChatModal } from "./NewChatModal";
import { registerPush } from "@/lib/push";

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
  const [bootError, setBootError] = useState<string | null>(null);

  const selected = useMemo(
    () => conversations.find((c) => c.id === selectedId) ?? null,
    [conversations, selectedId],
  );

  const refreshConversations = useCallback(async () => {
    const res = await api<{ conversations: ConversationSummary[] }>(
      "/conversations",
    );
    setConversations(res.conversations);
  }, []);

  const loadMessages = useCallback(async (conversationId: string) => {
    const res = await api<{ messages: Message[] }>(
      `/conversations/${conversationId}/messages`,
    );
    setMessages(res.messages);

    const unread = res.messages
      .filter((m) => m.senderId !== user?.id && m.status !== "read")
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
  }, [user?.id]);

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
              isOpen || msg.senderId === user.id
                ? 0
                : c.unreadCount + 1,
          };
        });
        return [...next].sort((a, b) => {
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
      setConversations((prev) =>
        prev.map((c) => {
          if (c.lastMessage?.id !== event.messageId) return c;
          return {
            ...c,
            lastMessage: { ...c.lastMessage, status: event.status },
          };
        }),
      );
    };

    const onTyping = (event: TypingEvent) => {
      if (event.userId === user.id) return;
      setTypingByConversation((prev) => {
        const current = new Set(prev[event.conversationId] ?? []);
        if (event.isTyping) current.add(event.userId);
        else current.delete(event.userId);
        return {
          ...prev,
          [event.conversationId]: [...current],
        };
      });
    };

    const onPresence = (event: PresenceEvent) => {
      setConversations((prev) =>
        prev.map((c) => ({
          ...c,
          participants: c.participants.map((p) =>
            p.id === event.userId
              ? {
                  ...p,
                  status: event.status,
                  lastSeenAt: event.lastSeenAt,
                }
              : p,
          ),
        })),
      );
    };

    socket.on(SOCKET_EVENTS.MESSAGE_NEW, onNew);
    socket.on(SOCKET_EVENTS.MESSAGE_STATUS, onStatus);
    socket.on(SOCKET_EVENTS.TYPING, onTyping);
    socket.on(SOCKET_EVENTS.PRESENCE, onPresence);

    return () => {
      socket.off(SOCKET_EVENTS.MESSAGE_NEW, onNew);
      socket.off(SOCKET_EVENTS.MESSAGE_STATUS, onStatus);
      socket.off(SOCKET_EVENTS.TYPING, onTyping);
      socket.off(SOCKET_EVENTS.PRESENCE, onPresence);
    };
  }, [user, selectedId, refreshConversations]);

  async function selectConversation(id: string) {
    setSelectedId(id);
    setMobileShowChat(true);
    getSocket().emit("conversation:join", id);
    await loadMessages(id);
  }

  function sendMessage(input: {
    content?: string;
    type: "text" | "image" | "file";
    mediaUrl?: string;
  }) {
    if (!selectedId || !user) return;
    const clientTempId = tempId();
    const optimistic: Message = {
      id: clientTempId,
      conversationId: selectedId,
      senderId: user.id,
      content: input.content ?? null,
      type: input.type,
      mediaUrl: input.mediaUrl ?? null,
      createdAt: new Date().toISOString(),
      editedAt: null,
      deletedAt: null,
      status: "sent",
    };
    setMessages((prev) => [...prev, optimistic]);
    getSocket().emit(SOCKET_EVENTS.MESSAGE_SEND, {
      conversationId: selectedId,
      content: input.content,
      type: input.type,
      mediaUrl: input.mediaUrl,
      clientTempId,
    });
  }

  function handleTyping(isTyping: boolean) {
    if (!selectedId) return;
    getSocket().emit(SOCKET_EVENTS.TYPING, {
      conversationId: selectedId,
      isTyping,
    });
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
        className={`w-full border-r border-white/5 md:w-[360px] md:shrink-0 ${
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
        <ConversationList
          conversations={conversations}
          currentUserId={user.id}
          selectedId={selectedId}
          onSelect={(id) => void selectConversation(id)}
          search={search}
          onSearch={setSearch}
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
            onBack={() => setMobileShowChat(false)}
            onSend={sendMessage}
            onTyping={handleTyping}
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
