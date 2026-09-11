/* Web push handlers, imported into the Workbox-generated service worker
   (vite.config.js → workbox.importScripts). Shows the notification and focuses
   the installed PWA on click, then routes inside the app (messages, etc.). */

function resolveNotificationUrl(raw) {
  try {
    return new URL(raw || ".", self.registration.scope).href;
  } catch {
    try { return self.registration.scope; } catch { return "/"; }
  }
}

function targetPathFromUrl(url) {
  try {
    const u = new URL(url);
    return u.pathname + u.search + u.hash;
  } catch {
    return url;
  }
}

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; }
  catch { data = { body: event.data && event.data.text() }; }

  const icon = data.icon || resolveNotificationUrl("pwa-192.png");
  const title = data.title || "🏀 Fit Kid Hooper";
  const options = {
    body: data.body || "",
    icon,
    // Android badge must be a small monochrome silhouette — a color PNG shows as a white box.
    tag: data.tag || "fkh",
    renotify: !!data.tag,
    data: { url: resolveNotificationUrl(data.url || "") },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = resolveNotificationUrl(event.notification.data?.url);
  const targetPath = targetPathFromUrl(targetUrl);

  event.waitUntil((async () => {
    const scope = self.registration.scope;
    const allClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });

    // Prefer an existing app window (installed PWA or open tab) in our scope.
    for (const client of allClients) {
      if (!client.url.startsWith(scope)) continue;
      try {
        client.postMessage({ type: "FKH_NAV", url: targetPath });
        if ("focus" in client) return client.focus();
      } catch { /* try next client */ }
    }

    // Cold start — open the scoped app URL so the PWA shell loads with deep-link params.
    if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
  })());
});
