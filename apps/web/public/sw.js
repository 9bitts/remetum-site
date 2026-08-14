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

self.addEventListener("push", (event) => {
  let data = { title: "Remetum", body: "Nova mensagem", url: "/app" };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    // ignore
  }

  const url = safeAppUrl(data.url);

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = safeAppUrl(event.notification.data?.url);

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    }),
  );
});
