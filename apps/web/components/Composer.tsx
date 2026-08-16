"use client";

import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";
import type { Message } from "@ebano/shared";
import { uploadMedia } from "@/lib/upload";
import { registerBackHandler } from "@/lib/back-stack";
import { VoiceCapture } from "@/lib/voice-record";

export function Composer({
  disabled,
  conversationId,
  replyTo,
  editing,
  onCancelReply,
  onCancelEdit,
  onSend,
  onTyping,
}: {
  disabled?: boolean;
  conversationId?: string;
  replyTo: Message | null;
  editing: Message | null;
  onCancelReply: () => void;
  onCancelEdit: () => void;
  onSend: (input: {
    content?: string;
    type: "text" | "image" | "file" | "audio" | "video";
    mediaUrl?: string;
    durationMs?: number;
    replyToId?: string;
  }) => void;
  onTyping: (isTyping: boolean) => void;
}) {
  const [text, setText] = useState("");
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const capture = useRef(new VoiceCapture());

  useEffect(() => {
    if (editing) setText(editing.content ?? "");
  }, [editing]);

  useEffect(() => {
    if (!conversationId || editing) return;
    try {
      setText(localStorage.getItem(`remetum:draft:${conversationId}`) ?? "");
    } catch {
      setText("");
    }
  }, [conversationId, editing]);

  useEffect(() => {
    if (!conversationId || editing) return;
    try {
      localStorage.setItem(`remetum:draft:${conversationId}`, text);
    } catch {
      // ignore quota
    }
  }, [conversationId, editing, text]);

  useEffect(() => {
    const session = capture.current;
    return () => session.abort();
  }, []);

  useEffect(() => {
    if (!recording) return;
    return registerBackHandler(() => {
      capture.current.abort();
      setRecording(false);
      return true;
    });
  }, [recording]);

  useEffect(() => {
    if (!editing && !replyTo) return;
    return registerBackHandler(() => {
      if (editing) onCancelEdit();
      else onCancelReply();
      return true;
    });
  }, [editing, replyTo, onCancelEdit, onCancelReply]);

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
    onSend({
      content,
      type: "text",
      replyToId: editing ? undefined : replyTo?.id,
    });
    setText("");
    if (conversationId) {
      try {
        localStorage.removeItem(`remetum:draft:${conversationId}`);
      } catch {
        // ignore
      }
    }
    onTyping(false);
  }

  async function onFile(file: File) {
    setError(null);
    setUploading(true);
    try {
      const data = await uploadMedia(file);
      onSend({
        type: data.type,
        mediaUrl: data.url,
        content: file.name,
        replyToId: replyTo?.id,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload falhou");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function armMic() {
    if (recording || uploading || disabled) return;
    void capture.current.arm().catch(() => undefined);
  }

  async function toggleRecording() {
    if (recording) {
      setRecording(false);
      setUploading(true);
      setError(null);
      try {
        const result = await capture.current.stop();
        if (!result) {
          setError("Áudio muito curto");
          return;
        }
        const data = await uploadMedia(result.file);
        onSend({
          type: "audio",
          mediaUrl: data.url,
          durationMs: result.durationMs,
          replyToId: replyTo?.id,
        });
      } catch (err) {
        capture.current.abort();
        setError(
          err instanceof Error && /permission|notallowed|denied/i.test(err.message)
            ? "Permissão de microfone negada"
            : err instanceof Error
              ? err.message
              : "Áudio falhou",
        );
      } finally {
        setUploading(false);
      }
      return;
    }

    setError(null);
    try {
      await capture.current.start();
      setRecording(true);
    } catch {
      capture.current.abort();
      setError("Permissão de microfone negada");
    }
  }

  return (
    <div className="border-t border-white/5 bg-ebano-bg/90 backdrop-blur">
      {replyTo ? (
        <div className="flex items-center justify-between px-3 pt-2 text-xs text-ebano-muted">
          <span>
            Respondendo:{" "}
            {replyTo.type === "text"
              ? replyTo.content
              : replyTo.type === "audio"
                ? "🎤 Áudio"
                : "anexo"}
          </span>
          <button type="button" onClick={onCancelReply}>
            ✕
          </button>
        </div>
      ) : null}
      {editing ? (
        <div className="flex items-center justify-between px-3 pt-2 text-xs text-ebano-accent">
          <span>Editando mensagem</span>
          <button type="button" onClick={onCancelEdit}>
            ✕
          </button>
        </div>
      ) : null}
      {recording ? (
        <div className="px-3 pt-2 text-xs text-red-300">Gravando…</div>
      ) : null}
      {error ? (
        <div className="flex items-center justify-between gap-3 px-3 pt-2 text-xs text-red-300">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} aria-label="Fechar aviso">
            ✕
          </button>
        </div>
      ) : null}
      <form onSubmit={submit} className="flex items-end gap-2 px-3 py-3">
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void onFile(file);
          }}
        />
        <button
          type="button"
          disabled={disabled || uploading || Boolean(editing)}
          onClick={() => fileRef.current?.click()}
          className="flex h-[42px] w-[42px] items-center justify-center rounded-xl text-ebano-accent hover:bg-ebano-surface disabled:opacity-50"
          title="Anexar"
          aria-label="Anexar arquivo"
        >
          <PaperclipIcon />
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
          placeholder={editing ? "Editar mensagem" : "Mensagem"}
          className="max-h-32 min-h-[42px] flex-1 resize-none rounded-xl border border-white/10 bg-ebano-surface px-3 py-2.5 text-[15px] outline-none focus:border-ebano-accent"
        />
        {!editing ? (
          <button
            type="button"
            disabled={disabled || uploading}
            onPointerDown={() => armMic()}
            onClick={() => void toggleRecording()}
            className={`flex h-[42px] w-[42px] items-center justify-center rounded-xl ${
              recording
                ? "bg-red-500/20 text-red-300"
                : "text-ebano-accent hover:bg-ebano-surface"
            }`}
            title={recording ? "Parar gravação" : "Áudio"}
            aria-label={recording ? "Parar gravação" : "Gravar áudio"}
          >
            {recording ? <StopIcon /> : <MicIcon />}
          </button>
        ) : null}
        <button
          type="submit"
          disabled={disabled || uploading || !text.trim()}
          className="rounded-xl bg-ebano-accent px-4 py-2.5 font-medium text-ebano-bg disabled:opacity-50"
        >
          {editing ? "Salvar" : "Enviar"}
        </button>
      </form>
    </div>
  );
}

function PaperclipIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M21.4 11.6 12.1 20.9a6 6 0 0 1-8.5-8.5l9.9-9.9a4 4 0 0 1 5.7 5.7l-9.9 9.8a2 2 0 1 1-2.8-2.8l8.5-8.4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MicIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect
        x="9"
        y="3"
        width="6"
        height="11"
        rx="3"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M6.5 11a5.5 5.5 0 0 0 11 0M12 16.5V21M9 21h6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  );
}
