self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

function safeAppUrl(raw) {
  try {
    if (!raw || typeof raw !== "string") return "/app";
    if (raw.startsWith("/app")) {
      const u = new URL(raw, self.location.origin);
      if (u.origin !== self.location.origin) return "/app";
      return `${u.pathname}${u.search}`;
    }
    const u = new URL(raw, self.location.origin);
    if (u.origin !== self.location.origin) return "/app";
    if (!u.pathname.startsWith("/app")) return "/app";
    return `${u.pathname}${u.search}`;
  } catch {
    return "/app";
  }
}

async function closeTagged(tag) {
  if (!tag) return 0;
  const existing = await self.registration.getNotifications({ tag });
  for (const n of existing) n.close();
  return existing.length;
}

async function hasFocusedClient() {
  const clients = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });
  return clients.some((c) => c.visibilityState === "visible" && c.focused);
}

async function markAppBadge() {
  try {
    if (self.navigator?.setAppBadge) await self.navigator.setAppBadge();
  } catch {
    // ignore
  }
}

self.addEventListener("push", (event) => {
  event.waitUntil(
    (async () => {
      let data = { title: "Remetum", body: "Nova mensagem", url: "/app" };
      try {
        if (event.data) data = { ...data, ...event.data.json() };
      } catch {
        // ignore
      }

      const url = safeAppUrl(data.url);
      const tag =
        typeof data.tag === "string"
          ? data.tag
          : data.callId
            ? `call-${data.callId}`
            : data.conversationId
              ? `msg-${data.conversationId}`
              : undefined;
      const focused = await hasFocusedClient();

      if (data.type === "call-ended") {
        await closeTagged(tag);
        const missed =
          data.reason === "cancelled" || data.reason === "unavailable";
        if (focused || !missed) {
          if (!focused && missed === false) {
            await self.registration.showNotification(data.title || "Remetum", {
              body: data.body || "Chamada encerrada",
              tag,
              silent: true,
              icon: "/icons/icon-192.png",
              badge: "/icons/icon-192.png",
              data: { url },
            });
            await closeTagged(tag);
          }
          return;
        }
        await markAppBadge();
        await self.registration.showNotification("Chamada perdida", {
          body: data.body || "Chamada perdida",
          tag,
          icon: "/icons/icon-192.png",
          badge: "/icons/icon-192.png",
          data: { url, type: "call-ended", conversationId: data.conversationId },
        });
        return;
      }

      if (focused) return;

      await markAppBadge();

      const isCall = data.type === "call";
      await self.registration.showNotification(data.title || "Remetum", {
        body: data.body,
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        tag,
        renotify: true,
        requireInteraction: isCall || Boolean(data.requireInteraction),
        vibrate: isCall
          ? [300, 140, 300, 140, 300, 140, 300]
          : [120, 80, 120],
        actions: isCall
          ? [
              { action: "accept", title: "Atender" },
              { action: "decline", title: "Recusar" },
            ]
          : [],
        data: {
          url,
          callId: data.callId,
          type: data.type,
          conversationId: data.conversationId,
          video: data.video,
          fromName: data.fromName,
        },
      });
    })(),
  );
});

async function openFromNotification(url, payload) {
  const abs = new URL(url, self.location.origin).href;
  const clients = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });
  const visible = clients.find((c) => c.visibilityState === "visible");
  const client = visible || clients[0];
  if (client) {
    client.postMessage({ type: "remetum:notification", ...payload, url });
    try {
      if ("navigate" in client) await client.navigate(url);
    } catch {
      // ignore
    }
    return client.focus();
  }
  if (self.clients.openWindow) return self.clients.openWindow(abs);
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  let url = safeAppUrl(data.url);
  const action = event.action || "";
  if (data.type === "call" && data.callId) {
    const next = new URL(url, self.location.origin);
    if (!next.searchParams.get("call")) {
      next.searchParams.set("call", data.callId);
    }
    if (action === "accept" || action === "decline") {
      next.searchParams.set("action", action);
    }
    url = `${next.pathname}${next.search}`;
  }

  event.waitUntil(
    openFromNotification(url, {
      conversationId: data.conversationId,
      callId: data.callId,
      action: action || undefined,
      kind: data.type,
    }),
  );
});

const SHARE_CACHE = "remetum-share-target-v1";
const SHARE_FILE = "/__share-target/file";
const SHARE_TEXT = "/__share-target/text";

async function handleShareTarget(request) {
  const formData = await request.formData();
  const cache = await caches.open(SHARE_CACHE);
  await cache.delete(SHARE_FILE);
  await cache.delete(SHARE_TEXT);

  const files = formData
    .getAll("media")
    .filter((value) => value instanceof File && value.size > 0);
  const file = files[0];
  const text = ["title", "text", "url"]
    .map((key) => formData.get(key))
    .filter((value) => typeof value === "string" && value.trim())
    .join("\n");

  if (file) {
    await cache.put(
      SHARE_FILE,
      new Response(file, {
        headers: {
          "Content-Type": file.type || "application/octet-stream",
          "X-Filename": encodeURIComponent(file.name || "arquivo"),
        },
      }),
    );
  } else if (text) {
    await cache.put(
      SHARE_TEXT,
      new Response(text, {
        headers: { "Content-Type": "text/plain;charset=utf-8" },
      }),
    );
  }

  return Response.redirect(new URL("/app?share-target=1", self.location.origin).href, 303);
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "POST" || url.pathname !== "/share-target") return;
  event.respondWith(handleShareTarget(event.request));
});
