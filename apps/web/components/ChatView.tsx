"use client";

import { useEffect, useMemo, useRef } from "react";
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
  typingUsers,
  onBack,
  onSend,
  onTyping,
}: {
  conversation: ConversationSummary;
  currentUserId: string;
  messages: Message[];
  typingUsers: string[];
  onBack: () => void;
  onSend: (input: {
    content?: string;
    type: "text" | "image" | "file";
    mediaUrl?: string;
  }) => void;
  onTyping: (isTyping: boolean) => void;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const peer = conversationPeer(conversation, currentUserId);
  const title = conversationTitle(conversation, currentUserId);

  const subtitle = useMemo(() => {
    if (typingUsers.length > 0) return "digitando…";
    if (conversation.type === "group") {
      return `${conversation.participants.length} participantes`;
    }
    if (peer?.status === "online") return "online";
    return formatLastSeen(peer?.lastSeenAt ?? null);
  }, [typingUsers, conversation, peer]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, typingUsers.length]);

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
        <Avatar
          name={title}
          url={conversation.type === "direct" ? peer?.avatarUrl : conversation.avatarUrl}
          online={peer?.status === "online"}
          size="sm"
        />
        <div className="min-w-0">
          <p className="truncate font-medium">{title}</p>
          <p className="truncate text-xs text-ebano-muted">{subtitle}</p>
        </div>
      </header>

      <div className="flex-1 space-y-2 overflow-y-auto px-3 py-4">
        {messages.map((message) => (
          <MessageBubble
            key={message.id}
            message={message}
            mine={message.senderId === currentUserId}
          />
        ))}
        <div ref={bottomRef} />
      </div>

      <Composer onSend={onSend} onTyping={onTyping} />
    </div>
  );
}
