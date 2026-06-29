# PWA & Notifications

BibleHodl is an installable Progressive Web App with two notification paths
tuned for its end-to-end / peer-to-peer architecture.

## What you get

- **Installable app** — Add to Home Screen / Install on desktop & mobile, with
  app icons, splash/theme color, standalone (chromeless) display, and an offline
  fallback page.
- **Offline shell** — a service worker caches hashed static assets and serves an
  offline page when the network is gone. The dynamic app still needs the relay/
  server for content (it's a live, decentralized app).
- **Message notifications (client-originated)** — new channel messages and DMs
  raise a system notification when the tab is backgrounded. Because chat/DMs are
  E2E and only decrypted in the browser, these are fired by the live tab via the
  service worker, **not** by the server.
- **Web Push (server-originated)** — for events the server legitimately knows
  about (e.g. being added to a channel), the server can push even when the app
  is closed, using VAPID. Optional: works only when VAPID keys are configured.

## Architecture

```
public/manifest.webmanifest   Web App Manifest (name, icons, theme, display)
public/sw.js                  Service worker: offline cache + push + click routing
public/offline.html           Offline fallback page
public/icons/*                App / maskable / Apple / badge icons (generated)

app/layout.tsx                Manifest link, theme-color, apple-web-app meta
app/components/common/
  ServiceWorkerRegistrar.tsx   Registers /sw.js, routes notification clicks → views
  NotificationToggle.tsx       Per-user on/off switch (sidebar footer)

app/lib/notifications.ts      Client: permission, push subscribe/unsubscribe,
                              local notifications (backgrounded-tab, backlog-safe)
app/lib/web-push.ts           Server: VAPID config + sendPushToPubkeys()

app/api/push/vapid-public-key  GET  — serve VAPID public key (null if disabled)
app/api/push/subscribe         POST — store a subscription (NIP-98 auth)
app/api/push/unsubscribe       POST — remove a subscription (NIP-98 auth)

prisma  PushSubscription model — { pubkey, endpoint(unique), p256dh, auth, ... }
```

### Why two paths?

The server cannot read message content (E2E DMs are gift-wrapped; channel
messages live on the relay). So "you have a new message" can only be detected by
a client that already holds the keys. We therefore notify from the live tab when
it's backgrounded. Web Push is reserved for server-authored events (channel
adds, future: invites, admin announcements), where the server is the source of
truth and can legitimately originate the notification.

## Notification gating (no spam)

`notifyLocal()` only fires when **all** hold:

1. The app-level preference is on (`localStorage` `biblehodl:notifications`).
2. Browser permission is `granted`.
3. The tab is **hidden** (an active reader already sees the in-app unread badge).
4. The source event is **newer than app load** — the relay replays history on
   every (re)connect, so backlog must never notify.

Plus the existing per-message dedup (multi-relay copies) and "not my own
message" / "not the channel I'm viewing" checks.

## Server push setup (VAPID)

Web Push is optional. To enable server-originated notifications:

1. Generate a keypair once:
   ```bash
   npx web-push generate-vapid-keys
   ```
2. Set on the server (e.g. `/opt/biblehodl/.env`):
   ```ini
   VAPID_PUBLIC_KEY=BB...        # base64url
   VAPID_PRIVATE_KEY=xx...       # base64url (secret)
   VAPID_SUBJECT=mailto:admin@biblehodl.com
   ```
3. Rebuild/redeploy the app container. `GET /api/push/vapid-public-key` should
   now return the key (it returns `null` when unset, which disables push subscribe
   client-side while leaving in-app message notifications working).

`VAPID_PUBLIC_KEY` is **not** a build-time `NEXT_PUBLIC_` var — the client fetches
it at runtime from the endpoint, so rotating keys doesn't require a rebuild.

### Sending a push from server code

```ts
import { sendPushToPubkeys } from "@/app/lib/web-push";

await sendPushToPubkeys([pubkeyHex], {
  title: "Added to a channel",
  body: "You've been added to a new channel.",
  url: "/?view=chat&channel=<id>",   // deep-link handled by ServiceWorkerRegistrar
  tag: "channel-add-<id>",            // collapse key
});
```

Dead subscriptions (HTTP 404/410) are pruned automatically.

## Deep links

Notification `url`s use query params the app understands:
`/?view=<chat|activity|...>&channel=<id>`. On click the service worker focuses an
existing tab (or opens one) and posts a `NOTIFICATION_CLICK` message;
`ServiceWorkerRegistrar` switches the view / active channel accordingly.

## Icons

Generated from an inline SVG (open book + cross on the brand gradient):

```bash
node scripts/generate-pwa-icons.mjs
```

Outputs `public/icons/{icon-192,icon-512,icon-192-maskable,icon-512-maskable,
apple-touch-icon,icon-badge}.png` and `public/favicon.png`.

## Testing checklist

- Lighthouse → Installable PWA passes; "Install" appears in the browser.
- DevTools → Application → Service Workers shows `/sw.js` activated.
- Offline (DevTools → Network → Offline) → navigations show `offline.html`.
- Grant notifications via the sidebar toggle, background the tab, send a message
  from another account → system notification appears; clicking it opens the
  conversation.
- With VAPID set: add a member to a channel via the UI → that member gets a push.

## Deployment note

The runtime Docker image now copies `public/` (Dockerfile) — required so the
manifest, service worker, and icons are actually served in production. The
service worker must be served from the origin root (`/sw.js`) for `scope: "/"`.
