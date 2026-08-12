"use client";

import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";
import type { Message } from "@ebano/shared";
import { API_URL } from "@/lib/config";

export function Composer({
  disabled,
  replyTo,
  editing,
  onCancelReply,
  onCancelEdit,
  onSend,
  onTyping,
}: {
  disabled?: boolean;
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
  const fileRef = useRef<HTMLInputElement>(null);
  const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const recordStartedAt = useRef<number>(0);

  useEffect(() => {
    if (editing) setText(editing.content ?? "");
  }, [editing]);

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
        type?: "image" | "file" | "audio" | "video";
      };
      if (!res.ok || !data.url || !data.type) {
        throw new Error(data.error ?? "Falha no upload");
      }
      onSend({
        type: data.type,
        mediaUrl: data.url,
        content: file.name,
        replyToId: replyTo?.id,
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Upload falhou");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function toggleRecording() {
    if (recording) {
      mediaRecorder.current?.stop();
      setRecording(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunks.current = [];
      recordStartedAt.current = Date.now();
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.current.push(e.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks.current, { type: "audio/webm" });
        const file = new File([blob], `audio-${Date.now()}.webm`, {
          type: "audio/webm",
        });
        const durationMs = Date.now() - recordStartedAt.current;
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
            type?: "audio";
          };
          if (!res.ok || !data.url) throw new Error(data.error ?? "Falha no áudio");
          onSend({
            type: "audio",
            mediaUrl: data.url,
            durationMs,
            replyToId: replyTo?.id,
          });
        } catch (err) {
          alert(err instanceof Error ? err.message : "Áudio falhou");
        } finally {
          setUploading(false);
        }
      };
      mediaRecorder.current = recorder;
      recorder.start();
      setRecording(true);
    } catch {
      alert("Permissão de microfone negada");
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
      <form onSubmit={submit} className="flex items-end gap-2 px-3 py-3">
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          accept="image/*,video/*,audio/*,.pdf,.txt,.zip"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void onFile(file);
          }}
        />
        <button
          type="button"
          disabled={disabled || uploading || Boolean(editing)}
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
          placeholder={editing ? "Editar mensagem" : "Mensagem"}
          className="max-h-32 min-h-[42px] flex-1 resize-none rounded-xl border border-white/10 bg-ebano-surface px-3 py-2.5 text-[15px] outline-none focus:border-ebano-accent"
        />
        {!editing ? (
          <button
            type="button"
            disabled={disabled || uploading}
            onClick={() => void toggleRecording()}
            className={`rounded-xl px-3 py-2 ${
              recording
                ? "bg-red-500/20 text-red-300"
                : "text-ebano-muted hover:bg-ebano-surface hover:text-ebano-accent"
            }`}
            title="Áudio"
          >
            {recording ? "■" : "🎤"}
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
