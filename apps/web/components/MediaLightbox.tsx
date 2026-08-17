"use client";

import { useEffect, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { openMediaFile } from "@/lib/media";
import { shareMediaFile } from "@/lib/share";
import { registerBackHandler } from "@/lib/back-stack";

export function MediaLightbox({
  src,
  kind,
  title,
  onClose,
  onForward,
}: {
  src: string;
  kind: "image" | "pdf";
  title?: string | null;
  onClose: () => void;
  onForward?: () => void;
}) {
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    const unregisterBack = registerBackHandler(() => {
      onClose();
      return true;
    });
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
      unregisterBack();
    };
  }, [onClose]);

  async function share(e: MouseEvent) {
    e.stopPropagation();
    if (sharing) return;
    setSharing(true);
    try {
      await shareMediaFile(src, title);
    } catch {
      window.alert("Não foi possível compartilhar este arquivo");
    } finally {
      setSharing(false);
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex flex-col bg-black/92"
      role="dialog"
      aria-modal="true"
      aria-label={title || (kind === "image" ? "Imagem" : "Documento")}
      onClick={onClose}
    >
      <div className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-4">
        <p className="min-w-0 truncate text-sm text-white/80">
          {title || (kind === "image" ? "Imagem" : "Documento")}
        </p>
        <div className="flex flex-wrap items-center gap-1 sm:gap-2">
          {onForward ? (
            <button
              type="button"
              className="rounded-xl px-3 py-1.5 text-sm text-white/80 hover:bg-white/10"
              onClick={(e) => {
                e.stopPropagation();
                onForward();
              }}
            >
              Encaminhar
            </button>
          ) : null}
          <button
            type="button"
            className="rounded-xl px-3 py-1.5 text-sm text-white/80 hover:bg-white/10 disabled:opacity-50"
            disabled={sharing}
            onClick={(e) => void share(e)}
          >
            {sharing ? "Preparando…" : "Compartilhar"}
          </button>
          <button
            type="button"
            className="rounded-xl px-3 py-1.5 text-sm text-white/80 hover:bg-white/10"
            onClick={(e) => {
              e.stopPropagation();
              void openMediaFile(src, title);
            }}
          >
            Abrir
          </button>
          <button
            type="button"
            className="rounded-xl px-3 py-1.5 text-sm text-white/80 hover:bg-white/10"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
          >
            Fechar
          </button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center p-3 sm:p-6">
        {kind === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={title || "imagem"}
            crossOrigin="use-credentials"
            className="max-h-full max-w-full rounded-2xl object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <iframe
            title={title || "documento"}
            src={src}
            className="h-full w-full rounded-2xl bg-white"
            onClick={(e) => e.stopPropagation()}
          />
        )}
      </div>
    </div>,
    document.body,
  );
}
