/* BibleHodl service worker — PWA offline shell + Web Push notifications.
 *
 * Strategy:
 *  - Navigations: network-first, fall back to cached shell / offline page.
 *  - Hashed static assets (/_next/static, /icons): cache-first (immutable).
 *  - Everything else (API, relay, auth): pass straight through to the network.
 *  - Push: render a notification from the server payload.
 *  - Notification click: focus an existing tab (optionally deep-link) or open one.
 *
 * Bump CACHE_VERSION on any change here so old caches are purged on activate.
 */

const CACHE_VERSION = "v1";
const CACHE_NAME = `biblehodl-${CACHE_VERSION}`;
const OFFLINE_URL = "/offline.html";

// Minimal app-shell precache. Keep this small — the SPA hydrates from the
// relay/server at runtime; we only need an offline fallback + icons.
const PRECACHE = [OFFLINE_URL, "/icons/icon-192.png", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(PRECACHE).catch(() => {});
      // Activate this SW immediately rather than waiting for all tabs to close.
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/favicon.png" ||
    url.pathname === "/manifest.webmanifest"
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // Only handle same-origin requests; never touch relay (wss) or third parties.
  if (url.origin !== self.location.origin) return;
  // Never cache API/auth/livekit/push traffic — always live.
  if (url.pathname.startsWith("/api/")) return;

  // Navigations → network-first with offline fallback.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request);
          return fresh;
        } catch {
          const cache = await caches.open(CACHE_NAME);
          return (
            (await cache.match(request)) ||
            (await cache.match(OFFLINE_URL)) ||
            Response.error()
          );
        }
      })()
    );
    return;
  }

  // Hashed static assets → cache-first (immutable, safe to serve offline).
  if (isStaticAsset(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(request);
        if (cached) return cached;
        try {
          const fresh = await fetch(request);
          if (fresh.ok) cache.put(request, fresh.clone());
          return fresh;
        } catch {
          return cached || Response.error();
        }
      })()
    );
  }
});

// ─── Web Push ───
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "BibleHodl", body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "BibleHodl";
  const options = {
    body: data.body || "",
    icon: data.icon || "/icons/icon-192.png",
    badge: data.badge || "/icons/icon-badge.png",
    tag: data.tag || undefined,
    renotify: Boolean(data.tag),
    timestamp: data.timestamp || Date.now(),
    data: {
      url: data.url || "/",
      ...(data.data || {}),
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      // Focus an existing tab if one is open; tell it where to go.
      for (const client of clientList) {
        if ("focus" in client) {
          client.postMessage({ type: "NOTIFICATION_CLICK", url: targetUrl });
          return client.focus();
        }
      }
      // Otherwise open a fresh window.
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })()
  );
});

// Allow the page to drive the SW (manual update + local notifications when the
// tab is backgrounded but the app — and thus the relay subscriptions — is alive).
self.addEventListener("message", (event) => {
  const msg = event.data;
  if (!msg) return;
  if (msg.type === "SKIP_WAITING") {
    self.skipWaiting();
    return;
  }
  if (msg.type === "SHOW_NOTIFICATION" && msg.title) {
    const options = msg.options || {};
    self.registration.showNotification(msg.title, {
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-badge.png",
      ...options,
    });
  }
});
