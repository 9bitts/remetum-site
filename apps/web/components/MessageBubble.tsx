"use client";

import type { Message } from "@ebano/shared";
import { formatTime } from "@/lib/format";

const QUICK_REACTIONS = ["❤️", "👍", "😂", "😮", "😢", "🙏"];

export function MessageBubble({
  message,
  mine,
  onReply,
  onReact,
  onEdit,
  onDelete,
}: {
  message: Message;
  mine: boolean;
  onReply: (message: Message) => void;
  onReact: (messageId: string, emoji: string) => void;
  onEdit: (message: Message) => void;
  onDelete: (messageId: string) => void;
}) {
  if (message.deletedAt) {
    return (
      <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
        <div className="rounded-[var(--radius-ebano)] bg-ebano-surface/60 px-3 py-2 text-sm italic text-ebano-muted">
          Mensagem apagada
        </div>
      </div>
    );
  }

  return (
    <div className={`group flex ${mine ? "justify-end" : "justify-start"}`}>
      <div className="max-w-[85%]">
        <div
          className={`rounded-[var(--radius-ebano)] px-3 py-2 ${
            mine ? "bg-ebano-sent text-ebano-text" : "bg-ebano-surface text-ebano-text"
          }`}
        >
          {message.replyTo ? (
            <div className="mb-2 rounded-lg border-l-2 border-ebano-accent bg-black/20 px-2 py-1 text-xs text-ebano-muted">
              <p className="truncate">
                {message.replyTo.type === "text"
                  ? message.replyTo.content
                  : message.replyTo.type === "image"
                    ? "📷 Imagem"
                    : message.replyTo.type === "audio"
                      ? "🎤 Áudio"
                      : "📎 Anexo"}
              </p>
            </div>
          ) : null}

          {message.type === "image" && message.mediaUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={message.mediaUrl}
              alt={message.content ?? "imagem"}
              className="mb-1 max-h-64 rounded-xl object-cover"
            />
          ) : null}

          {message.type === "video" && message.mediaUrl ? (
            <video
              src={message.mediaUrl}
              controls
              className="mb-1 max-h-64 rounded-xl"
            />
          ) : null}

          {message.type === "audio" && message.mediaUrl ? (
            <audio src={message.mediaUrl} controls className="mb-1 w-56" />
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
            {message.editedAt ? <span>editada</span> : null}
            <span>{formatTime(message.createdAt)}</span>
            {mine ? (
              <span
                className={
                  message.status === "read" ? "text-ebano-accent" : undefined
                }
              >
                {message.status === "delivered" || message.status === "read"
                  ? "✓✓"
                  : "✓"}
              </span>
            ) : null}
          </div>
        </div>

        {message.reactions.length > 0 ? (
          <div className={`mt-1 flex flex-wrap gap-1 ${mine ? "justify-end" : ""}`}>
            {message.reactions.map((r) => (
              <button
                key={r.emoji}
                type="button"
                onClick={() => onReact(message.id, r.emoji)}
                className={`rounded-full px-1.5 py-0.5 text-xs ${
                  r.reactedByMe
                    ? "bg-ebano-accent/20 text-ebano-accent"
                    : "bg-ebano-surface text-ebano-muted"
                }`}
              >
                {r.emoji} {r.count}
              </button>
            ))}
          </div>
        ) : null}

        <div
          className={`mt-1 hidden gap-1 text-[11px] group-hover:flex ${
            mine ? "justify-end" : "justify-start"
          }`}
        >
          <button type="button" className="text-ebano-muted hover:text-ebano-accent" onClick={() => onReply(message)}>
            Responder
          </button>
          {QUICK_REACTIONS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              className="hover:scale-110"
              onClick={() => onReact(message.id, emoji)}
            >
              {emoji}
            </button>
          ))}
          {mine && message.type === "text" ? (
            <button type="button" className="text-ebano-muted hover:text-ebano-accent" onClick={() => onEdit(message)}>
              Editar
            </button>
          ) : null}
          {mine ? (
            <button type="button" className="text-red-300/80 hover:text-red-300" onClick={() => onDelete(message.id)}>
              Apagar
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
