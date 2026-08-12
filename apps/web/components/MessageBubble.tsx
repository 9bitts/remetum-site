"use client";

import type { Message } from "@ebano/shared";
import { formatTime } from "@/lib/format";

export function MessageBubble({
  message,
  mine,
}: {
  message: Message;
  mine: boolean;
}) {
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] rounded-[var(--radius-ebano)] px-3 py-2 ${
          mine ? "bg-ebano-sent text-ebano-text" : "bg-ebano-surface text-ebano-text"
        }`}
      >
        {message.type === "image" && message.mediaUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={message.mediaUrl}
            alt={message.content ?? "imagem"}
            className="mb-1 max-h-64 rounded-xl object-cover"
          />
        ) : null}
        {message.type === "file" && message.mediaUrl ? (
          <a
            href={message.mediaUrl}
            target="_blank"
            rel="noreferrer"
            className="mb-1 block text-sm text-ebano-accent underline"
          >
            {message.content || "Baixar arquivo"}
          </a>
        ) : null}
        {message.content && message.type === "text" ? (
          <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed">
            {message.content}
          </p>
        ) : null}
        <div
          className={`mt-1 flex items-center gap-1 text-[11px] ${
            mine ? "justify-end text-white/55" : "text-ebano-muted"
          }`}
        >
          <span>{formatTime(message.createdAt)}</span>
          {mine ? (
            <span
              className={
                message.status === "read" ? "text-ebano-accent" : undefined
              }
              aria-label={message.status ?? "sent"}
            >
              {message.status === "delivered" || message.status === "read"
                ? "✓✓"
                : "✓"}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
