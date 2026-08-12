"use client";

import type { FormEvent } from "react";
import { useRef, useState } from "react";
import { API_URL } from "@/lib/config";

export function Composer({
  disabled,
  onSend,
  onTyping,
}: {
  disabled?: boolean;
  onSend: (input: {
    content?: string;
    type: "text" | "image" | "file";
    mediaUrl?: string;
  }) => void;
  onTyping: (isTyping: boolean) => void;
}) {
  const [text, setText] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleChange(value: string) {
    setText(value);
    onTyping(true);
    if (typingTimeout.current) clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => onTyping(false), 1200);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const content = text.trim();
    if (!content || disabled) return;
    onSend({ content, type: "text" });
    setText("");
    onTyping(false);
  }

  async function onFile(file: File) {
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`${API_URL}/uploads`, {
        method: "POST",
        credentials: "include",
        body: form,
      });
      const data = (await res.json()) as {
        error?: string;
        url?: string;
        type?: "image" | "file";
      };
      if (!res.ok || !data.url || !data.type) {
        throw new Error(data.error ?? "Falha no upload");
      }
      onSend({
        type: data.type,
        mediaUrl: data.url,
        content: file.name,
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Upload falhou");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <form
      onSubmit={submit}
      className="flex items-end gap-2 border-t border-white/5 bg-ebano-bg/90 px-3 py-3 backdrop-blur"
    >
      <input
        ref={fileRef}
        type="file"
        className="hidden"
        accept="image/*,.pdf,.txt,.zip"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void onFile(file);
        }}
      />
      <button
        type="button"
        disabled={disabled || uploading}
        onClick={() => fileRef.current?.click()}
        className="rounded-xl px-3 py-2 text-ebano-muted hover:bg-ebano-surface hover:text-ebano-accent disabled:opacity-50"
        title="Anexar"
      >
        +
      </button>
      <textarea
        rows={1}
        value={text}
        disabled={disabled || uploading}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit(e);
          }
        }}
        placeholder="Mensagem"
        className="max-h-32 min-h-[42px] flex-1 resize-none rounded-xl border border-white/10 bg-ebano-surface px-3 py-2.5 text-[15px] outline-none focus:border-ebano-accent"
      />
      <button
        type="submit"
        disabled={disabled || uploading || !text.trim()}
        className="rounded-xl bg-ebano-accent px-4 py-2.5 font-medium text-ebano-bg disabled:opacity-50"
      >
        Enviar
      </button>
    </form>
  );
}
