// Server-side Web Push (VAPID) helper.
//
// Sends notifications to a member's registered browser/device subscriptions.
// In a fully E2E app the server only originates push for events it legitimately
// knows about (e.g. an admin adding you to a channel) — never message content,
// which it can't read.
//
// Config (env):
//   VAPID_PUBLIC_KEY   — base64url VAPID public key (also served to clients)
//   VAPID_PRIVATE_KEY  — base64url VAPID private key (secret)
//   VAPID_SUBJECT      — "mailto:admin@example.com" or an https URL
//
// Generate a keypair once with:  npx web-push generate-vapid-keys

import webpush from "web-push";
import { prisma } from "./prisma";

let configured = false;

export function getVapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY?.trim() || null;
}

/** True when VAPID keys are present so push can actually be sent. */
export function isPushConfigured(): boolean {
  return Boolean(
    process.env.VAPID_PUBLIC_KEY?.trim() && process.env.VAPID_PRIVATE_KEY?.trim()
  );
}

function ensureConfigured(): boolean {
  if (configured) return true;
  if (!isPushConfigured()) return false;
  const subject = process.env.VAPID_SUBJECT?.trim() || "mailto:admin@biblehodl.com";
  webpush.setVapidDetails(
    subject,
    process.env.VAPID_PUBLIC_KEY!.trim(),
    process.env.VAPID_PRIVATE_KEY!.trim()
  );
  configured = true;
  return true;
}

export interface PushPayload {
  title: string;
  body?: string;
  url?: string; // deep-link, e.g. "/?view=chat&channel=<id>"
  tag?: string; // collapse key — a newer notification with the same tag replaces
  icon?: string;
  badge?: string;
  data?: Record<string, unknown>;
}

/**
 * Send a push notification to every subscription belonging to the given
 * pubkeys. Dead subscriptions (404/410) are pruned automatically. Safe no-op
 * when VAPID isn't configured. Never throws — returns a small summary.
 */
export async function sendPushToPubkeys(
  pubkeys: string[],
  payload: PushPayload
): Promise<{ sent: number; pruned: number; skipped?: string }> {
  if (!ensureConfigured()) return { sent: 0, pruned: 0, skipped: "vapid-not-configured" };
  const unique = [...new Set(pubkeys.filter(Boolean))];
  if (unique.length === 0) return { sent: 0, pruned: 0 };

  const subs = await prisma.pushSubscription.findMany({
    where: { pubkey: { in: unique } },
  });
  if (subs.length === 0) return { sent: 0, pruned: 0 };

  const body = JSON.stringify(payload);
  let sent = 0;
  const deadEndpoints: string[] = [];

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          body
        );
        sent += 1;
      } catch (err: unknown) {
        const code = (err as { statusCode?: number })?.statusCode;
        // 404 Not Found / 410 Gone → subscription is permanently dead.
        if (code === 404 || code === 410) deadEndpoints.push(sub.endpoint);
        else console.warn("[web-push] send failed:", code ?? err);
      }
    })
  );

  let pruned = 0;
  if (deadEndpoints.length) {
    const res = await prisma.pushSubscription.deleteMany({
      where: { endpoint: { in: deadEndpoints } },
    });
    pruned = res.count;
  }

  return { sent, pruned };
}
