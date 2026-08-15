"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  SOCKET_EVENTS,
  type CallAcceptedEvent,
  type CallEndedEvent,
  type CallOfferEvent,
  type ConversationSummary,
  type Message,
  type MessageNewEvent,
  type MessageSentEvent,
  type MessageStatusEvent,
  type MessageUpdatedEvent,
  type ConversationUpdatedEvent,
  type PresenceEvent,
  type TypingEvent,
} from "@ebano/shared";
import { api, ApiError, refreshSession } from "@/lib/api";
import { connectSocket, getSocket } from "@/lib/socket";
import { useAuth } from "./AuthProvider";
import { ConversationList } from "./ConversationList";
import { ChatView } from "./ChatView";
import { NewChatModal } from "./NewChatModal";
import { PeopleModal } from "./PeopleModal";
import { SettingsModal } from "./SettingsModal";
import { GroupInfoModal } from "./GroupInfoModal";
import { CallOverlay, type CallUiState } from "./CallOverlay";
import { registerPush, showLocalCallNotification, closeCallNotification } from "@/lib/push";
import { conversationPeer, conversationTitle } from "@/lib/format";
import { useStayInAppBack } from "@/lib/back-stack";

function tempId() {
  return `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function ChatShell() {
  const { user, loading, logout, setUser, refresh } = useAuth();
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [search, setSearch] = useState("");
  const [messageHits, setMessageHits] = useState<Message[]>([]);
  const [typingByConversation, setTypingByConversation] = useState<
    Record<string, string[]>
  >({});
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [groupInfoOpen, setGroupInfoOpen] = useState(false);
  const [mobileShowChat, setMobileShowChat] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editing, setEditing] = useState<Message | null>(null);
  const [forwarding, setForwarding] = useState<Message | null>(null);
  const [callState, setCallState] = useState<CallUiState | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const [failedTempIds, setFailedTempIds] = useState<Set<string>>(
    () => new Set(),
  );

  const selectedIdRef = useRef<string | null>(null);
  const loadGenRef = useRef(0);
  const deepLinkDone = useRef(false);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  const selected = useMemo(
    () => conversations.find((c) => c.id === selectedId) ?? null,
    [conversations, selectedId],
  );

  useStayInAppBack(Boolean(user) && !loading, () => {
    if (forwarding) {
      setForwarding(null);
      return true;
    }
    if (groupInfoOpen) {
      setGroupInfoOpen(false);
      return true;
    }
    if (settingsOpen) {
      setSettingsOpen(false);
      return true;
    }
    if (peopleOpen) {
      setPeopleOpen(false);
      return true;
    }
    if (newChatOpen) {
      setNewChatOpen(false);
      return true;
    }
    if (callState?.phase === "error") {
      setCallState(null);
      return true;
    }
    if (mobileShowChat) {
      setMobileShowChat(false);
      return true;
    }
    if (showArchived) {
      setShowArchived(false);
      return true;
    }
    return true;
  });

  const typingNames = useMemo(() => {
    if (!selected) return [] as string[];
    const ids = typingByConversation[selected.id] ?? [];
    return ids
      .map((id) => selected.participants.find((p) => p.id === id)?.name)
      .filter((n): n is string => Boolean(n));
  }, [selected, typingByConversation]);

  const refreshConversations = useCallback(async () => {
    const res = await api<{ conversations: ConversationSummary[] }>(
      `/conversations${showArchived ? "?archived=1" : ""}`,
    );
    setConversations(res.conversations);
    return res.conversations;
  }, [showArchived]);

  const loadMessages = useCallback(
    async (conversationId: string, cursor?: string) => {
      const gen = cursor ? loadGenRef.current : ++loadGenRef.current;
      const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
      const res = await api<{ messages: Message[]; nextCursor: string | null }>(
        `/conversations/${conversationId}/messages${qs}`,
      );

      if (!cursor && gen !== loadGenRef.current) return res;
      if (!cursor && selectedIdRef.current !== conversationId) return res;

      if (cursor) {
        if (selectedIdRef.current !== conversationId) return res;
        setMessages((prev) => {
          const existing = new Set(prev.map((m) => m.id));
          const older = res.messages.filter((m) => !existing.has(m.id));
          return [...older, ...prev];
        });
      } else {
        setMessages(res.messages);
        const unread = res.messages
          .filter(
            (m) =>
              m.senderId !== user?.id && m.status !== "read" && !m.deletedAt,
          )
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
      }
      setNextCursor(res.nextCursor);
      return res;
    },
    [user?.id],
  );

  const selectConversation = useCallback(
    async (id: string) => {
      setSelectedId(id);
      setMobileShowChat(true);
      setReplyTo(null);
      setEditing(null);
      setNextCursor(null);
      getSocket().emit(SOCKET_EVENTS.CONVERSATION_JOIN, id);
      await loadMessages(id);
    },
    [loadMessages],
  );

  const syncAfterReconnect = useCallback(async () => {
    try {
      await refreshConversations();
      const openId = selectedIdRef.current;
      if (openId) await loadMessages(openId);
    } catch {
      // ignore transient sync errors
    }
  }, [refreshConversations, loadMessages]);

  useEffect(() => {
    if (!user) return;
    void refreshConversations()
      .then((list) => {
        setBootError(null);
        if (deepLinkDone.current) return;
        deepLinkDone.current = true;
        try {
          const params = new URLSearchParams(window.location.search);
          const c = params.get("c");
          if (c && list.some((x) => x.id === c)) {
            void selectConversation(c);
            window.history.replaceState({}, "", "/app");
          }
        } catch {
          // ignore
        }
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          void refresh();
          return;
        }
        setBootError(err instanceof Error ? err.message : "Falha ao carregar");
      });
    void registerPush().catch(() => undefined);
  }, [user, refreshConversations, refresh, selectConversation]);

  useEffect(() => {
    const q = search.trim();
    if (q.length < 2) {
      setMessageHits([]);
      return;
    }
    const t = setTimeout(() => {
      void api<{ messages: Message[] }>(
        `/search/messages?q=${encodeURIComponent(q)}`,
      )
        .then((res) => setMessageHits(res.messages))
        .catch(() => setMessageHits([]));
    }, 250);
    return () => clearTimeout(t);
  }, [search]);

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
          const isOpen = selectedIdRef.current === c.id;
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

      if (selectedIdRef.current === msg.conversationId) {
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

    const onSent = (event: MessageSentEvent) => {
      if (!event.clientTempId) return;
      setFailedTempIds((prev) => {
        if (!prev.has(event.clientTempId!)) return prev;
        const next = new Set(prev);
        next.delete(event.clientTempId!);
        return next;
      });
      setMessages((prev) =>
        prev.map((m) =>
          m.id === event.clientTempId
            ? { ...m, id: event.messageId, createdAt: event.createdAt }
            : m,
        ),
      );
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
      socket.emit(SOCKET_EVENTS.CONVERSATION_JOIN, event.conversationId);
      void refreshConversations();
    };

    const onCallOffer = (offer: CallOfferEvent) => {
      if (offer.fromUserId === user.id) {
        setCallState((prev) => {
          if (
            prev?.phase === "outgoing" &&
            prev.conversationId === offer.conversationId
          ) {
            return { ...prev, callId: offer.callId };
          }
          return prev;
        });
        return;
      }
      setCallState({ phase: "incoming", offer });
      void showLocalCallNotification({
        callId: offer.callId,
        fromName: offer.fromName,
        video: offer.video,
        conversationId: offer.conversationId,
      });
    };

    const onCallAccepted = (accepted: CallAcceptedEvent) => {
      void closeCallNotification(accepted.callId);
      setCallState((prev) => {
        let peerName = "Chamada";
        if (prev?.phase === "outgoing") peerName = prev.peerName;
        else if (prev?.phase === "incoming") peerName = prev.offer.fromName;
        return { phase: "active", accepted, peerName };
      });
    };

    const onCallEnded = (event: CallEndedEvent) => {
      void closeCallNotification(event.callId);
      setCallState(null);
    };

    const onSocketError = (payload: {
      event?: string;
      message?: string;
      clientTempId?: string;
    }) => {
      if (
        payload.event === SOCKET_EVENTS.CALL_INVITE ||
        payload.event === SOCKET_EVENTS.CALL_ACCEPT
      ) {
        setCallState({
          phase: "error",
          message: payload.message ?? "Falha na chamada",
        });
      }
      if (payload.event === SOCKET_EVENTS.MESSAGE_SEND && payload.clientTempId) {
        setFailedTempIds((prev) => new Set(prev).add(payload.clientTempId!));
      }
    };

    const onConnect = () => {
      void syncAfterReconnect();
    };

    socket.on("connect", onConnect);
    socket.on(SOCKET_EVENTS.MESSAGE_NEW, onNew);
    socket.on(SOCKET_EVENTS.MESSAGE_SENT, onSent);
    socket.on(SOCKET_EVENTS.MESSAGE_UPDATED, onUpdated);
    socket.on(SOCKET_EVENTS.MESSAGE_STATUS, onStatus);
    socket.on(SOCKET_EVENTS.TYPING, onTyping);
    socket.on(SOCKET_EVENTS.PRESENCE, onPresence);
    socket.on(SOCKET_EVENTS.CONVERSATION_UPDATED, onConversationUpdated);
    socket.on(SOCKET_EVENTS.CALL_OFFER, onCallOffer);
    socket.on(SOCKET_EVENTS.CALL_ACCEPTED, onCallAccepted);
    socket.on(SOCKET_EVENTS.CALL_ENDED, onCallEnded);
    socket.on(SOCKET_EVENTS.ERROR, onSocketError);

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void refreshSession().then(() => syncAfterReconnect());
      }
    };
    const onOnline = () => {
      void refreshSession().then((ok) => {
        if (ok) connectSocket();
        void syncAfterReconnect();
      });
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);

    return () => {
      socket.off("connect", onConnect);
      socket.off(SOCKET_EVENTS.MESSAGE_NEW, onNew);
      socket.off(SOCKET_EVENTS.MESSAGE_SENT, onSent);
      socket.off(SOCKET_EVENTS.MESSAGE_UPDATED, onUpdated);
      socket.off(SOCKET_EVENTS.MESSAGE_STATUS, onStatus);
      socket.off(SOCKET_EVENTS.TYPING, onTyping);
      socket.off(SOCKET_EVENTS.PRESENCE, onPresence);
      socket.off(SOCKET_EVENTS.CONVERSATION_UPDATED, onConversationUpdated);
      socket.off(SOCKET_EVENTS.CALL_OFFER, onCallOffer);
      socket.off(SOCKET_EVENTS.CALL_ACCEPTED, onCallAccepted);
      socket.off(SOCKET_EVENTS.CALL_ENDED, onCallEnded);
      socket.off(SOCKET_EVENTS.ERROR, onSocketError);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
    };
  }, [user, refreshConversations, syncAfterReconnect]);

  async function loadOlder() {
    if (!selectedId || !nextCursor || loadingOlder) return;
    setLoadingOlder(true);
    try {
      await loadMessages(selectedId, nextCursor);
    } finally {
      setLoadingOlder(false);
    }
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
    muteMinutes?: number;
    clearChat?: boolean;
  }) {
    if (!selectedId) return;
    const res = await api<{ conversation: ConversationSummary }>(
      `/conversations/${selectedId}/prefs`,
      { method: "PATCH", body: patch },
    );
    if (patch.clearChat) {
      setConversations((prev) =>
        prev.map((c) => (c.id === selectedId ? res.conversation : c)),
      );
      await loadMessages(selectedId);
      return;
    }
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

  function startCall(video: boolean) {
    if (!selected || selected.type !== "direct" || !user) return;
    const peer = conversationPeer(selected, user.id);
    getSocket().emit(SOCKET_EVENTS.CALL_INVITE, {
      conversationId: selected.id,
      video,
    });
    setCallState({
      phase: "outgoing",
      conversationId: selected.id,
      callId: null,
      video,
      peerName: peer?.name ?? "Contato",
    });
  }

  function acceptCall() {
    if (callState?.phase !== "incoming") return;
    void closeCallNotification(callState.offer.callId);
    getSocket().emit(SOCKET_EVENTS.CALL_ACCEPT, {
      callId: callState.offer.callId,
      conversationId: callState.offer.conversationId,
    });
  }

  function rejectCall() {
    if (callState?.phase !== "incoming") return;
    void closeCallNotification(callState.offer.callId);
    getSocket().emit(SOCKET_EVENTS.CALL_REJECT, {
      callId: callState.offer.callId,
      conversationId: callState.offer.conversationId,
    });
    setCallState(null);
  }

  function cancelCall() {
    if (callState?.phase !== "outgoing") return;
    if (callState.callId) void closeCallNotification(callState.callId);
    getSocket().emit(SOCKET_EVENTS.CALL_CANCEL, {
      callId: callState.callId ?? "",
      conversationId: callState.conversationId,
    });
    setCallState(null);
  }

  function hangupCall() {
    if (callState?.phase === "active") {
      void closeCallNotification(callState.accepted.callId);
      getSocket().emit(SOCKET_EVENTS.CALL_HANGUP, {
        callId: callState.accepted.callId,
        conversationId: callState.accepted.conversationId,
      });
    }
    setCallState(null);
  }

  async function forwardTo(conversationId: string) {
    if (!forwarding) return;
    try {
      await api(`/messages/${forwarding.id}/forward`, {
        body: { conversationIds: [conversationId] },
      });
      setForwarding(null);
      if (conversationId === selectedId) {
        await loadMessages(conversationId);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Falha ao encaminhar");
    }
  }

  async function leaveGroup() {
    if (!selectedId) return;
    if (!window.confirm("Sair deste grupo?")) return;
    try {
      await api(`/conversations/${selectedId}/leave`, { method: "POST" });
      setConversations((prev) => prev.filter((c) => c.id !== selectedId));
      setSelectedId(null);
      setMobileShowChat(false);
      setGroupInfoOpen(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Falha ao sair do grupo");
    }
  }

  const displayMessages = useMemo(
    () =>
      messages.map((m) =>
        failedTempIds.has(m.id)
          ? {
              ...m,
              content:
                m.type === "text"
                  ? `${m.content ?? ""}\n(falha ao enviar)`.trim()
                  : m.content,
            }
          : m,
      ),
    [messages, failedTempIds],
  );

  if (loading || !user) {
    return (
      <main className="flex h-dvh items-center justify-center text-ebano-muted">
        Carregando…
      </main>
    );
  }

  if (bootError) {
    return (
      <main className="flex h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-red-300">{bootError}</p>
        <button
          type="button"
          className="rounded-xl bg-ebano-accent px-4 py-2 text-sm font-medium text-ebano-bg"
          onClick={() => {
            setBootError(null);
            void refreshConversations().catch((err) =>
              setBootError(
                err instanceof Error ? err.message : "Falha ao carregar",
              ),
            );
          }}
        >
          Tentar de novo
        </button>
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
              onClick={() => setSettingsOpen(true)}
              className="rounded-xl border border-white/10 px-3 py-1.5 text-sm text-ebano-muted hover:text-ebano-text"
            >
              Perfil
            </button>
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
          showArchived={showArchived}
          onToggleArchived={() => setShowArchived((v) => !v)}
          onOpenPeople={() => setPeopleOpen(true)}
          messageHits={messageHits}
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
            messages={displayMessages}
            typingNames={typingNames}
            replyTo={replyTo}
            editing={editing}
            loadingOlder={loadingOlder}
            hasMoreOlder={Boolean(nextCursor)}
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
            onForward={setForwarding}
            onCancelReply={() => setReplyTo(null)}
            onCancelEdit={() => setEditing(null)}
            onTogglePin={() => void patchPrefs({ pinned: !selected.pinnedAt })}
            onMute={(muteMinutes) => {
              if (muteMinutes === null) {
                void patchPrefs({ muted: false });
              } else {
                void patchPrefs({ muted: true, muteMinutes });
              }
            }}
            onToggleArchive={() =>
              void patchPrefs({ archived: !selected.archivedAt })
            }
            onClearChat={() => {
              if (
                !window.confirm("Limpar mensagens desta conversa para você?")
              ) {
                return;
              }
              void patchPrefs({ clearChat: true });
            }}
            onBlockPeer={() => {
              const peer = conversationPeer(selected, user.id);
              if (!peer) return;
              const blocked = window.confirm(`Bloquear ${peer.name}?`);
              if (!blocked) return;
              void api("/users/block", { body: { userId: peer.id } })
                .then(() => refreshConversations())
                .then(() => alert("Usuário bloqueado"))
                .catch((err) =>
                  alert(
                    err instanceof Error ? err.message : "Falha ao bloquear",
                  ),
                );
            }}
            onCopyInvite={() => {
              if (!selected.inviteCode) return;
              void navigator.clipboard.writeText(selected.inviteCode);
              alert(`Código de convite: ${selected.inviteCode}`);
            }}
            onGroupInfo={() => setGroupInfoOpen(true)}
            onLeaveGroup={() => void leaveGroup()}
            onCallVoice={() => startCall(false)}
            onCallVideo={() => startCall(true)}
            onLoadOlder={() => void loadOlder()}
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

      <PeopleModal
        open={peopleOpen}
        onClose={() => setPeopleOpen(false)}
        onCreated={(conversation) => {
          setConversations((prev) => {
            if (prev.some((c) => c.id === conversation.id)) return prev;
            return [conversation, ...prev];
          });
          void selectConversation(conversation.id);
        }}
      />

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        user={user}
        onUserUpdated={setUser}
      />

      {selected && selected.type === "group" ? (
        <GroupInfoModal
          open={groupInfoOpen}
          conversation={selected}
          currentUserId={user.id}
          onClose={() => setGroupInfoOpen(false)}
          onUpdated={(conversation) => {
            setConversations((prev) =>
              prev.map((c) => (c.id === conversation.id ? conversation : c)),
            );
          }}
          onLeft={() => {
            setConversations((prev) =>
              prev.filter((c) => c.id !== selected.id),
            );
            setSelectedId(null);
            setMobileShowChat(false);
          }}
        />
      ) : null}

      {forwarding ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
          <div className="max-h-[80dvh] w-full max-w-md overflow-y-auto rounded-[var(--radius-ebano)] bg-ebano-surface p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Encaminhar para</h2>
              <button
                type="button"
                onClick={() => setForwarding(null)}
                className="text-ebano-muted hover:text-ebano-text"
              >
                Fechar
              </button>
            </div>
            <div className="space-y-1">
              {conversations
                .filter((c) => !c.archivedAt)
                .map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => void forwardTo(c.id)}
                    className="flex w-full items-center rounded-xl px-3 py-2.5 text-left hover:bg-white/5"
                  >
                    <span className="truncate text-sm">
                      {conversationTitle(c, user.id)}
                    </span>
                  </button>
                ))}
            </div>
          </div>
        </div>
      ) : null}

      <CallOverlay
        state={callState}
        onAccept={acceptCall}
        onReject={rejectCall}
        onCancel={cancelCall}
        onHangup={hangupCall}
        onDismissError={() => setCallState(null)}
      />
    </div>
  );
}
