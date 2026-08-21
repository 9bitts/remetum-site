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
  type StatusNewEvent,
  type TypingEvent,
  extractMentionedHandles,
  formatPushCopy,
  previewSnippet,
} from "@ebano/shared";
import { api, ApiError, refreshSession } from "@/lib/api";
import { connectSocket, getSocket } from "@/lib/socket";
import { useAuth } from "./AuthProvider";
import { ConversationList } from "./ConversationList";
import { ChatView } from "./ChatView";
import { NewChatModal } from "./NewChatModal";
import { CommunityView } from "./CommunityView";
import { SettingsModal } from "./SettingsModal";
import { GroupInfoModal } from "./GroupInfoModal";
import { CallOverlay, type CallUiState } from "./CallOverlay";
import {
  closeCallNotification,
  showLocalCallNotification,
  syncAppBadge,
  syncPushIfGranted,
} from "@/lib/push";
import { playNotificationSound } from "@/lib/notify-sound";
import { PushPrompt } from "./PushPrompt";
import { StatusTray } from "./StatusTray";
import { conversationPeer, conversationTitle } from "@/lib/format";
import { useStayInAppBack } from "@/lib/back-stack";
import {
  acquireCallMedia,
  callMediaErrorMessage,
  stopCallMedia,
  type CallMedia,
} from "@/lib/call-media";
import {
  dequeueOutbox,
  enqueueOutbox,
  outboxForConversation,
  readOutbox,
  type OutboxItem,
} from "@/lib/outbox";
import { groupInviteUrl } from "@/lib/links";
import { uploadMedia } from "@/lib/upload";
import {
  consumeIncomingShare,
  discardIncomingShare,
  incomingShareLabel,
  subscribeIncomingShare,
  type IncomingShare,
} from "@/lib/incoming-share";

function outboxToMessage(item: OutboxItem, userId: string): Message {
  return {
    id: item.clientTempId,
    conversationId: item.conversationId,
    senderId: userId,
    replyToId: item.replyToId ?? null,
    replyTo: null,
    content: item.content ?? null,
    type: item.type,
    mediaUrl: item.mediaUrl ?? null,
    durationMs: item.durationMs ?? null,
    createdAt: item.createdAt,
    editedAt: null,
    deletedAt: null,
    status: "sent",
    reactions: [],
  };
}

function tempId() {
  return `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function callIdOf(state: CallUiState | null): string | null {
  if (!state || state.phase === "error") return null;
  if (state.phase === "outgoing") return state.callId;
  if (state.phase === "incoming") return state.offer.callId;
  return state.accepted.callId;
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
  const [sidebarTab, setSidebarTab] = useState<"chats" | "community">("chats");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [groupInfoOpen, setGroupInfoOpen] = useState(false);
  const [mobileShowChat, setMobileShowChat] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editing, setEditing] = useState<Message | null>(null);
  const [forwarding, setForwarding] = useState<Message | null>(null);
  const [incomingShare, setIncomingShare] = useState<IncomingShare | null>(null);
  const [incomingBusy, setIncomingBusy] = useState(false);
  const [callState, setCallState] = useState<CallUiState | null>(null);
  const [callMedia, setCallMedia] = useState<CallMedia | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const [failedTempIds, setFailedTempIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [inAppNotice, setInAppNotice] = useState<{
    conversationId: string | null;
    title: string;
    body: string;
  } | null>(null);

  const selectedIdRef = useRef<string | null>(null);
  const userRef = useRef(user);
  const conversationsRef = useRef(conversations);
  const pendingCallRef = useRef<{
    callId: string;
    action?: "accept" | "decline";
  } | null>(null);
  const loadGenRef = useRef(0);
  const deepLinkDone = useRef(false);
  const callStateRef = useRef<CallUiState | null>(null);
  const pendingCancelRef = useRef(false);
  const startingCallRef = useRef(false);
  const inFlightTempIds = useRef(new Set<string>());
  const flushOutboxRef = useRef<() => void>(() => undefined);

  function ackOutbox(clientTempId?: string) {
    if (!clientTempId) return;
    inFlightTempIds.current.delete(clientTempId);
    dequeueOutbox(clientTempId);
  }

  function flushOutbox() {
    const socket = getSocket();
    if (!socket.connected) return;
    for (const item of readOutbox()) {
      if (inFlightTempIds.current.has(item.clientTempId)) continue;
      inFlightTempIds.current.add(item.clientTempId);
      socket.emit(SOCKET_EVENTS.MESSAGE_SEND, {
        conversationId: item.conversationId,
        content: item.content,
        type: item.type,
        mediaUrl: item.mediaUrl,
        durationMs: item.durationMs,
        replyToId: item.replyToId,
        clientTempId: item.clientTempId,
      });
    }
  }
  flushOutboxRef.current = flushOutbox;

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  useEffect(() => {
    const n = conversations.reduce((sum, c) => sum + (c.unreadCount || 0), 0);
    syncAppBadge(n);
  }, [conversations]);

  useEffect(() => {
    if (!inAppNotice) return;
    const t = window.setTimeout(() => setInAppNotice(null), 5000);
    return () => window.clearTimeout(t);
  }, [inAppNotice]);

  useEffect(() => {
    callStateRef.current = callState;
  }, [callState]);

  useEffect(() => {
    if (callState && callState.phase !== "error") return;
    stopCallMedia(callMedia);
    if (callMedia) setCallMedia(null);
  }, [callState, callMedia]);

  const selected = useMemo(
    () => conversations.find((c) => c.id === selectedId) ?? null,
    [conversations, selectedId],
  );

  useStayInAppBack(Boolean(user) && !loading, () => {
    if (forwarding) {
      setForwarding(null);
      return true;
    }
    if (incomingShare) {
      setIncomingShare(null);
      void discardIncomingShare();
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
    if (sidebarTab === "community") {
      setSidebarTab("chats");
      return true;
    }
    if (newChatOpen) {
      setNewChatOpen(false);
      return true;
    }
    if (callState?.phase === "incoming") {
      rejectCall();
      return true;
    }
    if (callState?.phase === "outgoing") {
      cancelCall();
      return true;
    }
    if (callState?.phase === "active") {
      hangupCall();
      return true;
    }
    if (callState?.phase === "error") {
      clearCall();
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
        const pending = user
          ? outboxForConversation(conversationId).map((item) =>
              outboxToMessage(item, user.id),
            )
          : [];
        setMessages(() => {
          const ids = new Set(res.messages.map((m) => m.id));
          return [
            ...res.messages,
            ...pending.filter((m) => !ids.has(m.id)),
          ];
        });
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
      const switching = selectedIdRef.current !== id;
      setSelectedId(id);
      setMobileShowChat(true);
      setReplyTo(null);
      setEditing(null);
      setNextCursor(null);
      if (switching) setMessages([]);
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
          const callId = params.get("call");
          const action = params.get("action");
          if (params.get("status") === "1") setSidebarTab("chats");
          if (callId) {
            pendingCallRef.current = {
              callId,
              action:
                action === "accept" || action === "decline" ? action : undefined,
            };
          }
          if (c && list.some((x) => x.id === c)) {
            void selectConversation(c);
          }
          if (params.toString()) {
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
    void syncPushIfGranted().catch(() => undefined);
  }, [user, refreshConversations, refresh, selectConversation]);

  useEffect(() => {
    if (!user || !("serviceWorker" in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      const data = event.data as {
        type?: string;
        conversationId?: string;
        callId?: string;
        action?: "accept" | "decline";
        kind?: string;
      };
      if (data?.type !== "remetum:notification") return;
      if (data.kind === "status") setSidebarTab("chats");
      if (data.callId) {
        pendingCallRef.current = {
          callId: data.callId,
          action: data.action,
        };
      }
      if (data.conversationId) void selectConversation(data.conversationId);
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () =>
      navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [user, selectConversation]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void consumeIncomingShare()
      .then((share) => {
        if (!cancelled && share) setIncomingShare(share);
      })
      .catch((err) => {
        if (!cancelled) {
          window.alert(
            err instanceof Error ? err.message : "Falha ao receber arquivo",
          );
        }
      });
    const unsub = subscribeIncomingShare(
      (share) => {
        if (!cancelled) setIncomingShare(share);
      },
      (message) => {
        if (!cancelled) window.alert(message);
      },
    );
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has("share-target")) {
        url.searchParams.delete("share-target");
        const search = url.searchParams.toString();
        window.history.replaceState(
          {},
          "",
          `${url.pathname}${search ? `?${search}` : ""}`,
        );
      }
    } catch {
      // ignore
    }
    return () => {
      cancelled = true;
      unsub();
    };
  }, [user]);

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

      if (event.clientTempId) ackOutbox(event.clientTempId);
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
      } else if (msg.senderId !== user.id && msg.type !== "call") {
        const me = userRef.current;
        if (
          me &&
          !me.dndEnabled &&
          document.visibilityState === "visible"
        ) {
          const conv = conversationsRef.current.find(
            (c) => c.id === msg.conversationId,
          );
          const muted = Boolean(
            conv?.mutedUntil && new Date(conv.mutedUntil) > new Date(),
          );
          const mentioned = Boolean(
            me.handle &&
              extractMentionedHandles(msg.content ?? "").includes(me.handle),
          );
          const replyToMe = msg.replyTo?.senderId === me.id;
          if (!muted || mentioned || replyToMe) {
            const senderName =
              conv?.participants.find((p) => p.id === msg.senderId)?.name ??
              "Alguém";
            const copy = formatPushCopy({
              preview: me.notificationPreview ?? "full",
              kind: mentioned ? "mention" : replyToMe ? "reply" : "message",
              conversationType: conv?.type ?? "direct",
              conversationName: conv?.name ?? null,
              senderName,
              snippet: previewSnippet(msg.type, msg.content),
            });
            setInAppNotice({
              conversationId: msg.conversationId,
              title: copy.title,
              body: copy.body,
            });
            if (me.notificationSound) playNotificationSound();
          }
        }
      }
    };

    const onSent = (event: MessageSentEvent) => {
      if (!event.clientTempId) return;
      ackOutbox(event.clientTempId);
      setFailedTempIds((prev) => {
        if (!prev.has(event.clientTempId!)) return prev;
        const next = new Set(prev);
        next.delete(event.clientTempId!);
        return next;
      });
      setMessages((prev) => {
        const next = prev.map((m) =>
          m.id === event.clientTempId
            ? { ...m, id: event.messageId, createdAt: event.createdAt }
            : m,
        );
        const seen = new Set<string>();
        return next.filter((m) => {
          if (seen.has(m.id)) return false;
          seen.add(m.id);
          return true;
        });
      });
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
        if (pendingCancelRef.current) {
          pendingCancelRef.current = false;
          getSocket().emit(SOCKET_EVENTS.CALL_CANCEL, {
            callId: offer.callId,
            conversationId: offer.conversationId,
          });
          return;
        }
        setCallState((prev) => {
          if (
            prev?.phase === "outgoing" &&
            prev.conversationId === offer.conversationId
          ) {
            return {
              ...prev,
              callId: offer.callId,
              token: offer.token ?? prev.token,
              livekitUrl: offer.livekitUrl ?? prev.livekitUrl,
              roomName: offer.roomName ?? prev.roomName,
            };
          }
          return prev;
        });
        return;
      }

      const current = callStateRef.current;
      const currentId = callIdOf(current);
      if (current && current.phase !== "error") {
        if (currentId === offer.callId) return;
        getSocket().emit(SOCKET_EVENTS.CALL_REJECT, {
          callId: offer.callId,
          conversationId: offer.conversationId,
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
        if (prev?.phase === "active" && prev.accepted.callId === accepted.callId) {
          return prev;
        }
        if (prev?.phase === "outgoing" && prev.callId === accepted.callId) {
          return {
            phase: "active",
            peerName: prev.peerName,
            accepted: {
              ...accepted,
              token: prev.token ?? accepted.token,
              livekitUrl: prev.livekitUrl ?? accepted.livekitUrl,
              roomName: prev.roomName ?? accepted.roomName,
            },
          };
        }
        if (prev?.phase === "incoming" && prev.offer.callId === accepted.callId) {
          return {
            phase: "active",
            peerName: prev.offer.fromName,
            accepted: {
              ...accepted,
              token: prev.offer.token ?? accepted.token,
              livekitUrl: prev.offer.livekitUrl ?? accepted.livekitUrl,
              roomName: prev.offer.roomName ?? accepted.roomName,
            },
          };
        }
        if (prev?.phase === "outgoing" || prev?.phase === "incoming") {
          let peerName = "Chamada";
          if (prev.phase === "outgoing") peerName = prev.peerName;
          else peerName = prev.offer.fromName;
          return { phase: "active", accepted, peerName };
        }
        return prev;
      });
    };

    const onCallEnded = (event: CallEndedEvent) => {
      void closeCallNotification(event.callId);
      setCallState((prev) => {
        if (!prev || prev.phase === "error") return prev;
        if (prev.phase === "outgoing" && !prev.callId) {
          return prev.conversationId === event.conversationId ? null : prev;
        }
        return callIdOf(prev) === event.callId ? null : prev;
      });
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
        inFlightTempIds.current.delete(payload.clientTempId);
        setFailedTempIds((prev) => new Set(prev).add(payload.clientTempId!));
      }
    };

    const onConnect = () => {
      void syncAfterReconnect();
      flushOutboxRef.current();
    };

    const onDisconnect = () => {
      inFlightTempIds.current.clear();
    };

    const onStatusNew = (event: StatusNewEvent) => {
      if (event.userId === user.id) return;
      const me = userRef.current;
      if (!me || me.dndEnabled) return;
      if (document.visibilityState !== "visible") return;
      setInAppNotice({
        conversationId: null,
        title: event.userName,
        body: "Publicou um status",
      });
      if (me.notificationSound) playNotificationSound();
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    if (socket.connected) flushOutboxRef.current();
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
    socket.on(SOCKET_EVENTS.STATUS_NEW, onStatusNew);
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
      socket.off("disconnect", onDisconnect);
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
      socket.off(SOCKET_EVENTS.STATUS_NEW, onStatusNew);
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
    enqueueOutbox({
      clientTempId,
      conversationId: selectedId,
      content: input.content,
      type: input.type,
      mediaUrl: input.mediaUrl,
      durationMs: input.durationMs,
      replyToId: input.replyToId,
      createdAt: optimistic.createdAt,
    });
    flushOutbox();
  }

  function sendToConversation(
    conversationId: string,
    input: {
      content?: string;
      type: "text" | "image" | "file" | "audio" | "video";
      mediaUrl?: string;
    },
  ) {
    if (!user) return;
    const clientTempId = tempId();
    enqueueOutbox({
      clientTempId,
      conversationId,
      content: input.content,
      type: input.type,
      mediaUrl: input.mediaUrl,
      createdAt: new Date().toISOString(),
    });
    flushOutbox();
  }

  async function deliverIncoming(conversationId: string) {
    if (!incomingShare || incomingBusy) return;
    setIncomingBusy(true);
    try {
      if (incomingShare.kind === "text") {
        sendToConversation(conversationId, {
          type: "text",
          content: incomingShare.text,
        });
      } else {
        const data = await uploadMedia(incomingShare.file);
        sendToConversation(conversationId, {
          type: data.type,
          mediaUrl: data.url,
          content: incomingShare.file.name,
        });
      }
      setIncomingShare(null);
      await selectConversation(conversationId);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Falha ao enviar");
    } finally {
      setIncomingBusy(false);
    }
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

  function clearCall() {
    startingCallRef.current = false;
    stopCallMedia(callMedia);
    setCallMedia(null);
    setCallState(null);
  }

  async function startCall(video: boolean) {
    if (!selected || !user) return;
    if (startingCallRef.current) return;
    const current = callStateRef.current;
    if (current && current.phase !== "error") return;
    startingCallRef.current = true;
    pendingCancelRef.current = false;
    let media: CallMedia | null = null;
    try {
      media = await acquireCallMedia(video);
      setCallMedia(media);
      const peer = conversationPeer(selected, user.id);
      getSocket().emit(SOCKET_EVENTS.CALL_INVITE, {
        conversationId: selected.id,
        video,
      });
      setCallState({
        phase: "outgoing",
        conversationId: selected.id,
        callId: null,
        token: null,
        livekitUrl: null,
        roomName: null,
        video,
        peerName:
          selected.type === "group"
            ? selected.name || "Grupo"
            : peer?.name ?? "Contato",
      });
    } catch (err) {
      stopCallMedia(media);
      setCallMedia(null);
      setCallState({
        phase: "error",
        message: callMediaErrorMessage(err),
      });
    } finally {
      startingCallRef.current = false;
    }
  }

  async function acceptCall() {
    if (callState?.phase !== "incoming") return;
    const offer = callState.offer;
    void closeCallNotification(offer.callId);
    let media: CallMedia | null = null;
    try {
      media = await acquireCallMedia(offer.video);
      setCallMedia(media);
      getSocket().emit(SOCKET_EVENTS.CALL_ACCEPT, {
        callId: offer.callId,
        conversationId: offer.conversationId,
      });
      if (offer.token && offer.livekitUrl) {
        setCallState({
          phase: "active",
          peerName: offer.fromName,
          accepted: {
            callId: offer.callId,
            conversationId: offer.conversationId,
            token: offer.token,
            livekitUrl: offer.livekitUrl,
            roomName: offer.roomName ?? `call_${offer.callId}`,
            video: offer.video,
          },
        });
      }
    } catch (err) {
      stopCallMedia(media);
      setCallMedia(null);
      setCallState({
        phase: "error",
        message: callMediaErrorMessage(err),
      });
    }
  }

  function rejectCall() {
    if (callState?.phase !== "incoming") return;
    void closeCallNotification(callState.offer.callId);
    getSocket().emit(SOCKET_EVENTS.CALL_REJECT, {
      callId: callState.offer.callId,
      conversationId: callState.offer.conversationId,
    });
    clearCall();
  }

  useEffect(() => {
    if (callState?.phase !== "incoming") return;
    const pending = pendingCallRef.current;
    if (!pending || pending.callId !== callState.offer.callId) return;
    const action = pending.action;
    pendingCallRef.current = null;
    if (action === "decline") rejectCall();
    else if (action === "accept") void acceptCall();
  }, [callState]);

  function cancelCall() {
    if (callState?.phase !== "outgoing") return;
    if (callState.callId) {
      pendingCancelRef.current = false;
      void closeCallNotification(callState.callId);
      getSocket().emit(SOCKET_EVENTS.CALL_CANCEL, {
        callId: callState.callId,
        conversationId: callState.conversationId,
      });
    } else {
      pendingCancelRef.current = true;
    }
    clearCall();
  }

  function hangupCall() {
    if (callState?.phase === "active") {
      void closeCallNotification(callState.accepted.callId);
      getSocket().emit(SOCKET_EVENTS.CALL_HANGUP, {
        callId: callState.accepted.callId,
        conversationId: callState.accepted.conversationId,
      });
    }
    clearCall();
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
    <div className="relative flex h-dvh flex-col overflow-hidden bg-ebano-bg">
      {inAppNotice ? (
        <button
          type="button"
          onClick={() => {
            const id = inAppNotice.conversationId;
            setInAppNotice(null);
            if (id) void selectConversation(id);
          }}
          className="absolute top-3 left-1/2 z-40 w-[min(92%,24rem)] -translate-x-1/2 rounded-xl border border-white/10 bg-ebano-surface px-3 py-2 text-left shadow-xl"
        >
          <p className="truncate text-sm font-medium">{inAppNotice.title}</p>
          <p className="truncate text-xs text-ebano-muted">{inAppNotice.body}</p>
        </button>
      ) : null}
      <div className="flex min-h-0 flex-1 overflow-hidden">
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
        <PushPrompt visible={conversations.length > 0} />
        <div className="min-h-0 flex-1">
          {sidebarTab === "community" ? (
            <CommunityView
              onCreated={(conversation) => {
                setConversations((prev) => {
                  if (prev.some((c) => c.id === conversation.id)) return prev;
                  return [conversation, ...prev];
                });
                setSidebarTab("chats");
                void selectConversation(conversation.id);
              }}
            />
          ) : (
            <div className="flex h-full flex-col">
              <StatusTray />
              <div className="min-h-0 flex-1">
                <ConversationList
              conversations={conversations}
              currentUserId={user.id}
              selectedId={selectedId}
              onSelect={(id) => void selectConversation(id)}
              search={search}
              onSearch={setSearch}
              showArchived={showArchived}
              onToggleArchived={() => setShowArchived((v) => !v)}
              onOpenPeople={() => setSidebarTab("community")}
              messageHits={messageHits}
            />
              </div>
            </div>
          )}
        </div>
        <nav className="flex shrink-0 border-t border-white/5">
          <button
            type="button"
            onClick={() => setSidebarTab("chats")}
            className={`flex-1 py-3 text-sm font-medium ${
              sidebarTab === "chats"
                ? "text-ebano-accent"
                : "text-ebano-muted hover:text-ebano-text"
            }`}
          >
            Conversas
          </button>
          <button
            type="button"
            onClick={() => setSidebarTab("community")}
            className={`flex-1 py-3 text-sm font-medium ${
              sidebarTab === "community"
                ? "text-ebano-accent"
                : "text-ebano-muted hover:text-ebano-text"
            }`}
          >
            Comunidade
          </button>
        </nav>
      </aside>

      <section
        className={`min-h-0 min-w-0 flex-1 ${
          mobileShowChat ? "flex" : "hidden md:flex"
        } flex-col`}
      >
        {selected ? (
          <ChatView
            key={selected.id}
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
            onReply={(message) => {
              setEditing(null);
              setReplyTo(message);
            }}
            onReact={(messageId, emoji) =>
              getSocket().emit(SOCKET_EVENTS.MESSAGE_REACT, { messageId, emoji })
            }
            onEdit={(message) => {
              setReplyTo(null);
              setEditing(message);
            }}
            onDelete={(messageId) => {
              if (!window.confirm("Apagar esta mensagem para todos?")) return;
              getSocket().emit(SOCKET_EVENTS.MESSAGE_DELETE, { messageId });
            }}
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
              void navigator.clipboard.writeText(
                groupInviteUrl(selected.inviteCode),
              );
            }}
            onGroupInfo={() => setGroupInfoOpen(true)}
            onLeaveGroup={() => void leaveGroup()}
            onCallVoice={() => void startCall(false)}
            onCallVideo={() => void startCall(true)}
            onLoadOlder={() => void loadOlder()}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <p className="text-sm tracking-[0.2em] text-ebano-accent uppercase">
              Remetum
            </p>
            <h1 className="mt-3 text-2xl font-semibold">Conversas com estilo.</h1>
            <p className="mt-2 max-w-sm text-ebano-muted">
              Selecione uma conversa, inicie uma nova ou conheça a comunidade.
            </p>
            <button
              type="button"
              onClick={() => setSidebarTab("community")}
              className="mt-5 rounded-xl border border-ebano-accent/70 px-4 py-2 text-sm font-medium text-ebano-accent hover:bg-ebano-accent hover:text-ebano-bg"
            >
              Ver comunidade
            </button>
          </div>
        )}
      </section>
      </div>

      <NewChatModal
        open={newChatOpen}
        onClose={() => setNewChatOpen(false)}
        onCreated={(conversation) => {
          setConversations((prev) => {
            if (prev.some((c) => c.id === conversation.id)) return prev;
            return [conversation, ...prev];
          });
          if (incomingShare) {
            void deliverIncoming(conversation.id);
            return;
          }
          void selectConversation(conversation.id);
        }}
      />

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        user={user}
        onUserUpdated={setUser}
        onLogout={() => void logout()}
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
              <h2 className="text-lg font-semibold">Encaminhar no Remetum</h2>
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

      {incomingShare ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
          <div className="max-h-[80dvh] w-full max-w-md overflow-y-auto rounded-[var(--radius-ebano)] bg-ebano-surface p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Enviar no Remetum</h2>
              <button
                type="button"
                disabled={incomingBusy}
                onClick={() => {
                  setIncomingShare(null);
                  void discardIncomingShare();
                }}
                className="text-ebano-muted hover:text-ebano-text disabled:opacity-50"
              >
                Fechar
              </button>
            </div>
            <p className="mb-3 truncate text-sm text-ebano-muted">
              {incomingBusy ? "Enviando…" : incomingShareLabel(incomingShare)}
            </p>
            <div className="space-y-1">
              {conversations.filter((c) => !c.archivedAt).length === 0 ? (
                <p className="px-3 py-2 text-sm text-ebano-muted">
                  Nenhuma conversa ainda. Inicie um chat para enviar.
                </p>
              ) : (
                conversations
                  .filter((c) => !c.archivedAt)
                  .map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      disabled={incomingBusy}
                      onClick={() => void deliverIncoming(c.id)}
                      className="flex w-full items-center rounded-xl px-3 py-2.5 text-left hover:bg-white/5 disabled:opacity-50"
                    >
                      <span className="truncate text-sm">
                        {conversationTitle(c, user.id)}
                      </span>
                    </button>
                  ))
              )}
            </div>
            <button
              type="button"
              disabled={incomingBusy}
              onClick={() => setNewChatOpen(true)}
              className="mt-3 w-full rounded-xl border border-ebano-accent/70 px-3 py-2.5 text-sm font-medium text-ebano-accent hover:bg-ebano-accent hover:text-ebano-bg disabled:opacity-50"
            >
              Nova conversa
            </button>
          </div>
        </div>
      ) : null}

      <CallOverlay
        state={callState}
        localMedia={callMedia}
        onAccept={() => void acceptCall()}
        onReject={rejectCall}
        onCancel={cancelCall}
        onHangup={hangupCall}
        onDismissError={clearCall}
      />
    </div>
  );
}
