// ShareAnything service worker: only used to show notifications and handle clicks on them.
// (Some browsers, e.g. Android Chrome, can only show notifications through a service worker.)

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
      const target = windows.find((client) => page && client.url.split("#")[0] === page) || windows[0];
      if (target) {
        await target.focus();
        target.postMessage({ type: "shareanything:notification-click", tag });
        return;
      }
      if (url) await self.clients.openWindow(url);
    })(),
  );
});
