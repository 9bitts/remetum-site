"use client";

import { useEffect, useState } from "react";
import {
  dismissPushPrompt,
  enablePush,
  notificationPermission,
  pushConfigured,
  pushPromptDismissed,
} from "@/lib/push";

export function PushPrompt({ visible }: { visible: boolean }) {
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible || pushPromptDismissed()) {
      setShow(false);
      return;
    }
    if (notificationPermission() !== "default") {
      setShow(false);
      return;
    }
    let cancelled = false;
    void pushConfigured().then((ok) => {
      if (!cancelled) setShow(ok);
    });
    return () => {
      cancelled = true;
    };
  }, [visible]);

  if (!show) return null;

  return (
    <div className="mx-3 mb-2 rounded-xl border border-white/10 bg-ebano-surface px-3 py-3">
      <p className="text-sm font-medium">Quer saber quando alguém falar com você?</p>
      <p className="mt-1 text-xs text-ebano-muted">
        Ative as notificações para ver quem enviou, mesmo com o app fechado.
      </p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void enablePush().finally(() => {
              dismissPushPrompt();
              setShow(false);
              setBusy(false);
            });
          }}
          className="rounded-xl bg-ebano-accent px-3 py-1.5 text-xs font-medium text-ebano-bg disabled:opacity-60"
        >
          {busy ? "Ativando…" : "Ativar"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            dismissPushPrompt();
            setShow(false);
          }}
          className="rounded-xl px-3 py-1.5 text-xs text-ebano-muted hover:text-ebano-text"
        >
          Agora não
        </button>
      </div>
    </div>
  );
}
