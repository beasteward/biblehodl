// Client-side notifications.
//
// Two complementary paths:
//  1. Web Push (server-originated) — subscribe the browser to VAPID push so the
//     server can notify about events it legitimately knows about (e.g. being
//     added to a channel) even when the app is closed.
//  2. Local notifications (client-originated) — this app is E2E: chat/DM content
//     only exists in the browser after the relay delivers + decrypts it. So for
//     new messages we raise a notification from the live tab (via the service
//     worker registration) when the tab is backgrounded.
//
// All server calls are NIP-98 signed via authFetch.

import type { Signer } from "./signer";
import { authFetch } from "./http-auth";

// Messages older than the moment the app loaded are treated as backlog (the
// relay replays history on every connect/reconnect) and never notified.
const appStartedAt = Math.floor(Date.now() / 1000);

// App-level on/off preference. Browser notification permission can't be revoked
// programmatically, so this localStorage flag is the real "off" switch for
// local (client-originated) notifications. Default: on.
const PREF_KEY = "biblehodl:notifications";

export function notificationsPref(): boolean {
  if (typeof localStorage === "undefined") return true;
  return localStorage.getItem(PREF_KEY) !== "off";
}

export function setNotificationsPref(on: boolean): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(PREF_KEY, on ? "on" : "off");
}

export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function notificationPermission(): NotificationPermission {
  if (typeof Notification === "undefined") return "denied";
  return Notification.permission;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  // Back with an explicit ArrayBuffer so the result is a BufferSource that
  // satisfies pushManager.subscribe's applicationServerKey typing.
  const buffer = new ArrayBuffer(raw.length);
  const out = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function readyRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.ready;
  } catch {
    return null;
  }
}

export async function getExistingSubscription(): Promise<PushSubscription | null> {
  const reg = await readyRegistration();
  if (!reg) return null;
  return reg.pushManager.getSubscription();
}

/** True when this browser already has an active push subscription. */
export async function isPushEnabled(): Promise<boolean> {
  return (await getExistingSubscription()) !== null;
}

/**
 * Request permission (if needed), create a VAPID push subscription, and
 * register it with the server. Returns false if unsupported, denied, or the
 * server has push disabled.
 */
export async function enablePushNotifications(signer: Signer): Promise<boolean> {
  if (!isPushSupported()) return false;

  const permission =
    Notification.permission === "default"
      ? await Notification.requestPermission()
      : Notification.permission;
  if (permission !== "granted") return false;

  const reg = await readyRegistration();
  if (!reg) return false;

  // Fetch the server VAPID public key (also tells us if push is configured).
  let publicKey: string | null = null;
  try {
    const res = await fetch("/api/push/vapid-public-key");
    publicKey = (await res.json())?.publicKey ?? null;
  } catch {
    publicKey = null;
  }
  if (!publicKey) return false;

  let subscription = await reg.pushManager.getSubscription();
  if (!subscription) {
    subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  }

  const res = await authFetch(signer, "/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subscription: subscription.toJSON() }),
  });
  return res.ok;
}

/** Tear down this browser's push subscription, server-side and locally. */
export async function disablePushNotifications(signer: Signer): Promise<void> {
  const subscription = await getExistingSubscription();
  if (!subscription) return;
  const endpoint = subscription.endpoint;
  try {
    await subscription.unsubscribe();
  } catch {
    /* ignore */
  }
  try {
    await authFetch(signer, "/api/push/unsubscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint }),
    });
  } catch {
    /* best effort */
  }
}

export interface LocalNotification {
  title: string;
  body?: string;
  url?: string; // in-app deep link, e.g. "/?view=chat&channel=<id>"
  tag?: string; // collapse key
  createdAt?: number; // unix seconds of the source event (backlog guard)
}

/**
 * Raise a notification for a freshly-received event from the live tab. No-ops
 * unless: notifications are granted, the tab is currently hidden (don't
 * interrupt someone actively using the app), and the event is newer than app
 * load (so replayed relay history never spams). Uses the service worker
 * registration so it renders like a real push (and is clickable).
 */
export async function notifyLocal(n: LocalNotification): Promise<void> {
  if (typeof document === "undefined") return;
  if (!notificationsPref()) return;
  if (notificationPermission() !== "granted") return;
  // Only when backgrounded — an active reader already sees the in-app unread.
  if (document.visibilityState === "visible") return;
  if (n.createdAt !== undefined && n.createdAt < appStartedAt) return;

  const reg = await readyRegistration();
  const options: NotificationOptions & { badge?: string; renotify?: boolean } = {
    body: n.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-badge.png",
    tag: n.tag,
    renotify: Boolean(n.tag),
    data: { url: n.url || "/" },
  };

  if (reg) {
    await reg.showNotification(n.title, options);
    return;
  }
  // Fallback: plain Notification (no SW) — still better than nothing.
  try {
    new Notification(n.title, options);
  } catch {
    /* ignore */
  }
}
