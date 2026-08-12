"use client";

import { useEffect, useState } from "react";
import type { StatusItem } from "@ebano/shared";
import { api } from "@/lib/api";
import { API_URL } from "@/lib/config";

export function StatusTray() {
  const [statuses, setStatuses] = useState<StatusItem[]>([]);
  const [text, setText] = useState("");
  const [active, setActive] = useState<StatusItem | null>(null);

  async function refresh() {
    const res = await api<{ statuses: StatusItem[] }>("/status");
    setStatuses(res.statuses);
  }

  useEffect(() => {
    void refresh().catch(() => undefined);
  }, []);

  async function publishText() {
    if (!text.trim()) return;
    await api("/status", { body: { type: "text", content: text.trim() } });
    setText("");
    await refresh();
  }

  async function publishImage(file: File) {
    const form = new FormData();
    form.append("file", file);
    const upload = await fetch(`${API_URL}/uploads`, {
      method: "POST",
      credentials: "include",
      body: form,
    });
    const data = (await upload.json()) as { url?: string; error?: string };
    if (!upload.ok || !data.url) throw new Error(data.error ?? "Upload falhou");
    await api("/status", { body: { type: "image", mediaUrl: data.url } });
    await refresh();
  }

  async function openStatus(item: StatusItem) {
    setActive(item);
    await api(`/status/${item.id}/view`, { method: "POST", body: {} });
    await refresh();
  }

  return (
    <div className="border-b border-white/5 px-3 py-2">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs tracking-wide text-ebano-muted uppercase">Status</p>
        <div className="flex gap-2">
          <label className="cursor-pointer text-xs text-ebano-accent">
            Foto
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void publishImage(file);
              }}
            />
          </label>
        </div>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {statuses.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => void openStatus(s)}
            className={`flex h-14 w-14 shrink-0 flex-col items-center justify-center overflow-hidden rounded-full border-2 text-[10px] ${
              s.viewedByMe ? "border-white/20" : "border-ebano-accent"
            }`}
            title={s.userName}
          >
            {s.type === "image" && s.mediaUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={s.mediaUrl}
                alt=""
                className="h-full w-full rounded-full object-cover"
              />
            ) : (
              <span className="px-1 text-center leading-tight text-ebano-text">
                {(s.content ?? s.userName).slice(0, 10)}
              </span>
            )}
          </button>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Novo status…"
          className="flex-1 rounded-xl border border-white/10 bg-ebano-bg px-2 py-1.5 text-sm outline-none focus:border-ebano-accent"
        />
        <button
          type="button"
          onClick={() => void publishText()}
          className="rounded-xl bg-ebano-accent px-3 text-sm font-medium text-ebano-bg"
        >
          Postar
        </button>
      </div>

      {active ? (
        <div className="fixed inset-0 z-[60] flex flex-col bg-black/95">
          <div className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="text-sm font-medium text-white">{active.userName}</p>
              <p className="text-xs text-white/50">
                {new Date(active.createdAt).toLocaleString("pt-BR")} ·{" "}
                {active.viewCount} views
              </p>
            </div>
            <button
              type="button"
              className="rounded-xl px-3 py-1.5 text-sm text-white/80 hover:bg-white/10"
              onClick={() => setActive(null)}
            >
              Fechar
            </button>
          </div>
          <div className="flex flex-1 items-center justify-center p-6">
            {active.type === "image" && active.mediaUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={active.mediaUrl}
                alt=""
                className="max-h-full max-w-full rounded-2xl object-contain"
              />
            ) : active.type === "video" && active.mediaUrl ? (
              <video
                src={active.mediaUrl}
                controls
                autoPlay
                className="max-h-full max-w-full rounded-2xl"
              />
            ) : (
              <p className="max-w-lg text-center text-2xl font-medium text-white">
                {active.content}
              </p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
