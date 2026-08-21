import { API_URL } from "./config";

const PROMPT_KEY = "remetum.push-prompt-v1";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

export async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return null;
  return navigator.serviceWorker.register("/sw.js");
}

export function notificationPermission():
  | "unsupported"
  | NotificationPermission {
  if (!("Notification" in window) || !("PushManager" in window)) {
    return "unsupported";
  }
  return Notification.permission;
}

export async function pushConfigured() {
  try {
    const res = await fetch(`${API_URL}/push/vapid-public-key`, {
      credentials: "include",
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function pushPromptDismissed() {
  try {
    return localStorage.getItem(PROMPT_KEY) === "1";
  } catch {
    return false;
  }
}

export function dismissPushPrompt() {
  try {
    localStorage.setItem(PROMPT_KEY, "1");
  } catch {
    // ignore
  }
}

async function persistSubscription(reg: ServiceWorkerRegistration) {
  const keyRes = await fetch(`${API_URL}/push/vapid-public-key`, {
    credentials: "include",
  });
  if (!keyRes.ok) return false;
  const { publicKey } = (await keyRes.json()) as { publicKey: string };

  const subscription = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });

  const res = await fetch(`${API_URL}/push/subscribe`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(subscription.toJSON()),
  });
  return res.ok;
}

export async function syncPushIfGranted() {
  if (notificationPermission() !== "granted") return false;
  const reg = await registerServiceWorker();
  if (!reg) return false;
  const existing = await reg.pushManager.getSubscription();
  if (existing) {
    await fetch(`${API_URL}/push/subscribe`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(existing.toJSON()),
    }).catch(() => undefined);
    return true;
  }
  return persistSubscription(reg);
}

export async function enablePush() {
  if (notificationPermission() === "unsupported") return "unsupported";
  const reg = await registerServiceWorker();
  if (!reg) return "unsupported";

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission;

  const ok = await persistSubscription(reg);
  return ok ? "granted" : "unsupported";
}

export async function disablePush() {
  const reg = await navigator.serviceWorker?.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await fetch(`${API_URL}/push/unsubscribe`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: sub.endpoint }),
  }).catch(() => undefined);
  await sub.unsubscribe().catch(() => undefined);
}

export async function hasPushSubscription() {
  const reg = await navigator.serviceWorker?.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return Boolean(sub);
}

export async function showLocalCallNotification(input: {
  callId: string;
  fromName: string;
  video: boolean;
  conversationId: string;
}) {
  if (!("Notification" in window) || Notification.permission !== "granted") {
    return;
  }
  if (document.visibilityState === "visible" && document.hasFocus()) return;

  const reg = await navigator.serviceWorker?.getRegistration();
  const pushSub = await reg?.pushManager.getSubscription();
  if (pushSub) return;

  const kind = input.video ? "chamada de vídeo" : "chamada de voz";
  const url = `/app?c=${encodeURIComponent(input.conversationId)}&call=${encodeURIComponent(input.callId)}`;
  const options: NotificationOptions = {
    body: `Está ligando (${kind})`,
    tag: `call-${input.callId}`,
    icon: "/icons/icon-192.png",
    requireInteraction: true,
    data: {
      url,
      type: "call",
      callId: input.callId,
      conversationId: input.conversationId,
    },
  };

  if (reg) {
    await reg.showNotification(input.fromName, options);
    return;
  }

  const note = new Notification(input.fromName, options);
  note.onclick = () => {
    window.focus();
    note.close();
  };
}

export async function closeCallNotification(callId: string) {
  const tag = `call-${callId}`;
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    const notes = await reg?.getNotifications({ tag });
    notes?.forEach((n) => n.close());
  } catch {
    // ignore
  }
}

export function syncAppBadge(count: number) {
  try {
    if (!("setAppBadge" in navigator)) return;
    if (count > 0) void navigator.setAppBadge(count);
    else void navigator.clearAppBadge();
  } catch {
    // ignore
  }
}
