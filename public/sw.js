// ShareAnything service worker: shows notifications (from the page or from Web Push)
// and handles clicks on them. No caching — the app always loads fresh.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const tag = event.notification.tag;
  const url = event.notification.data && event.notification.data.url;

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const page = url ? url.split("#")[0] : null;
      // Prefer a tab that already has this note open; otherwise open it.
      const target = windows.find((client) => page && client.url.split("#")[0] === page) || (url ? null : windows[0]);
      if (target) {
        await target.focus();
        target.postMessage({ type: "shareanything:notification-click", tag, url });
        return;
      }
      if (url) await self.clients.openWindow(url);
    })(),
  );
});

// Web Push from the server: "Riya sent a message" — never the message itself.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    // ignore malformed payloads, show a generic one below
  }
  const title = typeof data.title === "string" ? data.title : "ShareAnything";
  // Only ever open pages of this site.
  let url = self.location.origin + "/";
  try {
    const parsed = new URL(String(data.url || "/"), self.location.origin);
    if (parsed.origin === self.location.origin) url = parsed.href;
  } catch {
    // keep the home page
  }
  event.waitUntil(
    self.registration.showNotification(title, {
      body: typeof data.body === "string" ? data.body : "Something new in a shared note",
      tag: typeof data.tag === "string" ? data.tag : "shareanything",
      renotify: true,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url },
    }),
  );
});

// The browser replaced the subscription: the page subscribes again next time it opens.
self.addEventListener("pushsubscriptionchange", () => {});
