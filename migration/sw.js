/* Kill-switch service worker for the OLD origin (rcarrier32.github.io/FitKidHooper/).
 *
 * Deployed in place of the Workbox-generated sw.js as the final release to the old
 * origin. The browser byte-compares the SW script on navigation, so an installed PWA
 * picks this up the next time it is opened — while the old origin is still served
 * same-origin (a cross-origin 301 makes SW updates fail, so ship this BEFORE the
 * custom domain redirect or the repo transfer).
 *
 * What it does:
 *   1. Takes over immediately (skipWaiting + claim).
 *   2. Deletes every Workbox cache, so the stale app shell stops being served.
 *   3. Declares NO fetch handler — navigations go straight to the network, which is
 *      what lets the "we moved" page (and later the 301) actually reach the user.
 *   4. Keeps the push handler alive, rewritten to announce the move.
 *
 * What it deliberately does NOT do: unregister itself. Unregistering invalidates the
 * origin's push subscriptions, which is the one remaining channel to reach anyone who
 * has not opened the app. Clean that up in a later release if you want to.
 */

const NEW_APP_URL = "https://app.legendsyba.com/";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    // Drop the precached app shell — this is what de-zombies the installed PWA.
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));

    await self.clients.claim();

    // Reload any window still running the old shell so it lands on the moved page.
    const windows = await self.clients.matchAll({ type: "window" });
    for (const client of windows) {
      try { await client.navigate(client.url); } catch { /* client may be gone */ }
    }
  })());
});

/* No "fetch" listener on purpose. A service worker without one is bypassed for
   navigations, so nothing here can keep serving the old app. */

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = {}; }

  event.waitUntil(self.registration.showNotification(
    data.title || "🏀 Fit Kid Hooper has moved",
    {
      body: data.body || "Tap to open the new app and re-add it to your home screen.",
      tag: "fkh-moved",
      renotify: true,
      data: { url: NEW_APP_URL },
    },
  ));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  // Always the new origin — never focus an old-origin window, which is the whole point.
  event.waitUntil(self.clients.openWindow(event.notification.data?.url || NEW_APP_URL));
});
