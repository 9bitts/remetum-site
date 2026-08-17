"use client";

import { useState } from "react";
import type { Message } from "@ebano/shared";
import { formatCallMessage, parseCallMessage } from "@ebano/shared";
import { formatTime } from "@/lib/format";
import { splitMessageLinks, hrefForLink } from "@/lib/links";
import { fileLooksLikePdf, mediaSrc, openMediaFile } from "@/lib/media";
import { isShareableMedia, shareMediaFile } from "@/lib/share";
import { MediaLightbox } from "./MediaLightbox";

const QUICK_REACTIONS = ["❤️", "👍", "😂", "😮", "😢", "🙏"];

export function MessageBubble({
  message,
  mine,
  onReply,
  onReact,
  onEdit,
  onDelete,
  onForward,
}: {
  message: Message;
  mine: boolean;
  onReply: (message: Message) => void;
  onReact: (messageId: string, emoji: string) => void;
  onEdit: (message: Message) => void;
  onDelete: (messageId: string) => void;
  onForward?: (message: Message) => void;
}) {
  const [preview, setPreview] = useState<"image" | "pdf" | null>(null);
  const [sharing, setSharing] = useState(false);
  const src = message.mediaUrl ? mediaSrc(message.mediaUrl) : undefined;
  const canShareMedia = isShareableMedia(message.type) && Boolean(message.mediaUrl);

  async function shareExternal() {
    if (!message.mediaUrl || sharing) return;
    setSharing(true);
    try {
      await shareMediaFile(message.mediaUrl, message.content);
    } catch {
      window.alert("Não foi possível compartilhar este arquivo");
    } finally {
      setSharing(false);
    }
  }

  if (message.deletedAt) {
    return (
      <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
        <div className="rounded-[var(--radius-ebano)] bg-ebano-surface/60 px-3 py-2 text-sm italic text-ebano-muted">
          Mensagem apagada
        </div>
      </div>
    );
  }

  if (message.type === "call") {
    return (
      <div className="flex justify-center py-1">
        <span className="rounded-full bg-white/5 px-3 py-1 text-xs text-ebano-muted">
          {formatCallMessage(parseCallMessage(message.content), message.durationMs)}
        </span>
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

          {message.type === "image" && src ? (
            <button
              type="button"
              className="mb-1 block max-w-full cursor-zoom-in bg-transparent p-0"
              onClick={() => setPreview("image")}
              aria-label="Ampliar imagem"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt={message.content ?? "imagem"}
                crossOrigin="use-credentials"
                className="block max-h-64 max-w-full rounded-xl object-cover"
              />
            </button>
          ) : null}

          {message.type === "video" && src ? (
            <video
              src={src}
              controls
              crossOrigin="use-credentials"
              className="mb-1 max-h-64 rounded-xl"
            />
          ) : null}

          {message.type === "audio" && src ? (
            <audio
              src={src}
              controls
              preload="metadata"
              playsInline
              crossOrigin="use-credentials"
              className="mb-1 w-56"
              onLoadedMetadata={(e) => {
                e.currentTarget.currentTime = 0;
              }}
            />
          ) : null}

          {message.type === "file" && src ? (
            <button
              type="button"
              onClick={() => {
                if (fileLooksLikePdf(src, message.content)) {
                  setPreview("pdf");
                  return;
                }
                void openMediaFile(src, message.content);
              }}
              className="mb-1 flex w-full items-center gap-3 rounded-xl bg-black/25 px-3 py-2.5 text-left hover:bg-black/40"
              aria-label={`Abrir ${message.content || "documento"}`}
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-ebano-accent/15 text-ebano-accent">
                <FileIcon />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">
                  {message.content || "Documento"}
                </span>
                <span className="block text-[11px] text-ebano-muted">
                  Toque para abrir
                </span>
              </span>
            </button>
          ) : null}

          {message.content && message.type === "text" ? (
            <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed">
              {splitMessageLinks(message.content).map((part, i) =>
                part.type === "url" ? (
                  <a
                    key={`${part.value}-${i}`}
                    href={hrefForLink(part.value)}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      window.open(
                        hrefForLink(part.value),
                        "_blank",
                        "noopener,noreferrer",
                      );
                    }}
                    className="inline break-all text-ebano-accent underline decoration-ebano-accent/80 underline-offset-2"
                  >
                    {part.value}
                  </a>
                ) : (
                  <span key={i}>{part.value}</span>
                ),
              )}
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

        {canShareMedia ? (
          <div
            className={`mt-1.5 flex flex-wrap gap-1.5 ${
              mine ? "justify-end" : "justify-start"
            }`}
          >
            {onForward ? (
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-lg bg-ebano-surface px-2 py-1 text-[11px] text-ebano-muted hover:text-ebano-accent"
                onClick={() => onForward(message)}
                aria-label="Encaminhar para outro usuário do Remetum"
              >
                <ForwardIcon />
                Encaminhar
              </button>
            ) : null}
            <button
              type="button"
              disabled={sharing}
              className="inline-flex items-center gap-1 rounded-lg bg-ebano-surface px-2 py-1 text-[11px] text-ebano-muted hover:text-ebano-accent disabled:opacity-50"
              onClick={() => void shareExternal()}
              title="Compartilhar com outros apps, e-mail ou salvar"
              aria-label="Compartilhar com outros aplicativos, e-mail ou salvar"
            >
              <ShareIcon />
              {sharing ? "Preparando…" : "Compartilhar"}
            </button>
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
          {onForward && !canShareMedia ? (
            <button
              type="button"
              className="text-ebano-muted hover:text-ebano-accent"
              onClick={() => onForward(message)}
            >
              Encaminhar
            </button>
          ) : null}
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
      {preview && src ? (
        <MediaLightbox
          src={src}
          kind={preview}
          title={message.content}
          onClose={() => setPreview(null)}
          onForward={
            onForward
              ? () => {
                  setPreview(null);
                  onForward(message);
                }
              : undefined
          }
        />
      ) : null}
    </div>
  );
}

function ForwardIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M15 7h6v6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M21 7 10 18H3"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="18" cy="5" r="3" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="6" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="18" cy="19" r="3" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M8.6 10.6 15.4 6.4M8.6 13.4l6.8 4.2"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path
        d="M14 3v5h5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}
