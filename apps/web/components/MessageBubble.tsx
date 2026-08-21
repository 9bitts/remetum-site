"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { Message } from "@ebano/shared";
import { isValidHandle } from "@ebano/shared";
import { formatCallMessage, parseCallMessage } from "@ebano/shared";
import { registerBackHandler } from "@/lib/back-stack";
import { formatTime, messagePreview } from "@/lib/format";
import { splitMessageLinks, hrefForLink } from "@/lib/links";
import { fileLooksLikePdf, mediaSrc, openMediaFile } from "@/lib/media";
import { isShareableMedia, shareMediaFile } from "@/lib/share";
import { MediaLightbox } from "./MediaLightbox";

function MentionText({ text }: { text: string }) {
  const parts = text.split(/(@[a-z0-9_]{3,24})/gi);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("@") && isValidHandle(part.slice(1).toLowerCase())) {
          return (
            <span key={i} className="text-ebano-accent">
              {part}
            </span>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

const QUICK_REACTIONS = ["❤️", "👍", "😂", "😮", "😢", "🙏"];

export function MessageBubble({
  message,
  mine,
  senderNames,
  currentUserId,
  highlighted,
  onReply,
  onReact,
  onEdit,
  onDelete,
  onForward,
  onJumpTo,
}: {
  message: Message;
  mine: boolean;
  senderNames?: Record<string, string>;
  currentUserId?: string;
  highlighted?: boolean;
  onReply: (message: Message) => void;
  onReact: (messageId: string, emoji: string) => void;
  onEdit: (message: Message) => void;
  onDelete: (messageId: string) => void;
  onForward?: (message: Message) => void;
  onJumpTo?: (messageId: string) => void;
}) {
  const [preview, setPreview] = useState<"image" | "pdf" | null>(null);
  const [sharing, setSharing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const src = message.mediaUrl ? mediaSrc(message.mediaUrl) : undefined;
  const canShareMedia = isShareableMedia(message.type) && Boolean(message.mediaUrl);

  useEffect(() => {
    if (!menuOpen) return;
    return registerBackHandler(() => {
      setMenuOpen(false);
      return true;
    });
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    function onDocClick(e: Event) {
      const target = e.target as HTMLElement | null;
      if (target?.closest(`[data-msg-menu="${message.id}"]`)) return;
      setMenuOpen(false);
    }
    document.addEventListener("pointerdown", onDocClick);
    return () => document.removeEventListener("pointerdown", onDocClick);
  }, [menuOpen, message.id]);

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

  function senderLabel(senderId: string) {
    if (currentUserId && senderId === currentUserId) return "Você";
    return senderNames?.[senderId] || "Mensagem";
  }

  if (message.deletedAt) {
    return (
      <div id={`msg-${message.id}`} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
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
    <div
      id={`msg-${message.id}`}
      className={`group/msg flex ${mine ? "justify-end" : "justify-start"}`}
    >
      <div
        className={`flex max-w-[92%] items-start gap-1.5 ${
          mine ? "flex-row-reverse" : ""
        }`}
      >
        <div className="relative min-w-0" data-msg-menu={message.id}>
        <div
          className={`rounded-[var(--radius-ebano)] px-3 py-2 transition ${
            mine ? "bg-ebano-sent text-ebano-text" : "bg-ebano-surface text-ebano-text"
          } ${highlighted ? "ring-2 ring-ebano-accent/60" : ""}`}
        >
          {message.replyTo ? (
            <button
              type="button"
              onClick={() => onJumpTo?.(message.replyTo!.id)}
              className="mb-2 w-full rounded-lg border-l-2 border-ebano-accent bg-black/20 px-2 py-1 text-left"
              aria-label="Ir para a mensagem citada"
            >
              <p className="truncate text-[11px] font-medium text-ebano-accent">
                {senderLabel(message.replyTo.senderId)}
              </p>
              <p className="truncate text-xs text-ebano-muted">
                {messagePreview(message.replyTo)}
              </p>
            </button>
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
                  <MentionText key={i} text={part.value} />
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
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              className={`-mr-1.5 inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-black/25 ${
                menuOpen ? "bg-black/25" : ""
              } ${
                mine
                  ? "text-white/70 hover:text-white"
                  : "text-ebano-muted hover:text-ebano-text"
              }`}
              title="Opções da mensagem"
              aria-label="Opções da mensagem"
              aria-expanded={menuOpen}
            >
              <DotsIcon />
            </button>
          </div>
        </div>
        {menuOpen ? (
          <div
            className={`absolute top-full z-30 mt-1 min-w-[188px] rounded-xl border border-white/10 bg-ebano-surface p-1 shadow-xl ${
              mine ? "right-0" : "left-0"
            }`}
          >
            <div className="mb-1 flex justify-between gap-0.5 px-1 py-1">
              {QUICK_REACTIONS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  className="rounded-md px-1 py-0.5 text-base hover:bg-white/5"
                  onClick={() => {
                    setMenuOpen(false);
                    onReact(message.id, emoji);
                  }}
                >
                  {emoji}
                </button>
              ))}
            </div>
            {onForward ? (
              <MessageMenuItem
                onClick={() => {
                  setMenuOpen(false);
                  onForward(message);
                }}
              >
                Encaminhar
              </MessageMenuItem>
            ) : null}
            {mine && message.type === "text" ? (
              <MessageMenuItem
                onClick={() => {
                  setMenuOpen(false);
                  onEdit(message);
                }}
              >
                Editar
              </MessageMenuItem>
            ) : null}
            {mine ? (
              <MessageMenuItem
                danger
                onClick={() => {
                  setMenuOpen(false);
                  onDelete(message.id);
                }}
              >
                Apagar
              </MessageMenuItem>
            ) : null}
          </div>
        ) : null}

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
          className={`mt-1 hidden gap-1 text-[11px] group-hover/msg:flex ${
            mine ? "justify-end" : "justify-start"
          }`}
        >
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
        <button
          type="button"
          onClick={() => onReply(message)}
          className="mt-1 flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full bg-ebano-surface text-ebano-muted shadow-sm transition hover:bg-white/10 hover:text-ebano-accent md:h-8 md:w-8 md:opacity-0 md:group-hover/msg:opacity-100"
          title="Responder"
          aria-label="Responder a esta mensagem"
        >
          <ReplyArrowIcon />
        </button>
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

function MessageMenuItem({
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

function DotsIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="12" cy="5" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="12" cy="19" r="2" />
    </svg>
  );
}

function ReplyArrowIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1.5-7-5.5-10-11-11Z" />
    </svg>
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
