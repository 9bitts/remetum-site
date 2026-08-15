import { API_URL } from "./config";

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

export async function registerPush() {
  if (!("Notification" in window) || !("PushManager" in window)) return;
  const reg = await registerServiceWorker();
  if (!reg) return;

  const keyRes = await fetch(`${API_URL}/push/vapid-public-key`, {
    credentials: "include",
  });
  if (!keyRes.ok) return;
  const { publicKey } = (await keyRes.json()) as { publicKey: string };

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return;

  const subscription = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });

  await fetch(`${API_URL}/push/subscribe`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(subscription.toJSON()),
  });
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
  const options: NotificationOptions = {
    body: `${input.fromName} está ligando (${kind})`,
    tag: `call-${input.callId}`,
    icon: "/icons/icon-192.png",
    requireInteraction: true,
    data: { url: `/app?c=${encodeURIComponent(input.conversationId)}` },
  };

  if (reg) {
    await reg.showNotification("Remetum", options);
    return;
  }

  const note = new Notification("Remetum", options);
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
