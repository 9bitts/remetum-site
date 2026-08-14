"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { openMediaFile } from "@/lib/media";

export function MediaLightbox({
  src,
  kind,
  title,
  onClose,
}: {
  src: string;
  kind: "image" | "pdf";
  title?: string | null;
  onClose: () => void;
}) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex flex-col bg-black/92"
      role="dialog"
      aria-modal="true"
      aria-label={title || (kind === "image" ? "Imagem" : "Documento")}
      onClick={onClose}
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <p className="min-w-0 truncate text-sm text-white/80">
          {title || (kind === "image" ? "Imagem" : "Documento")}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            className="rounded-xl px-3 py-1.5 text-sm text-white/80 hover:bg-white/10"
            onClick={(e) => {
              e.stopPropagation();
              openMediaFile(src, title);
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
