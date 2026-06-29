import { NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { getPubkeyFromRequest } from "../../../lib/auth";
import { isPushConfigured } from "../../../lib/web-push";

// POST /api/push/subscribe
// Body: { subscription: PushSubscriptionJSON }
//
// Binds a browser/device push subscription to the authenticated member pubkey.
// NIP-98 establishes identity (no x-pubkey fallback). Idempotent: keyed by the
// unique push endpoint, so re-subscribing just refreshes the keys/owner.
export async function POST(request: Request) {
  if (!isPushConfigured()) {
    return NextResponse.json(
      { error: "Push notifications are not configured on this server" },
      { status: 503 }
    );
  }

  const pubkey = await getPubkeyFromRequest(request);
  if (!pubkey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let sub: {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  } | undefined;
  try {
    const body = await request.json();
    sub = body?.subscription;
  } catch {
    /* fallthrough */
  }

  const endpoint = sub?.endpoint?.trim();
  const p256dh = sub?.keys?.p256dh?.trim();
  const auth = sub?.keys?.auth?.trim();
  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
  }

  const userAgent = request.headers.get("user-agent")?.slice(0, 255) || "";

  // Upsert by endpoint: a given browser push endpoint maps to exactly one row.
  // Re-binding to the current pubkey lets a shared device switch accounts.
  await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: { pubkey, endpoint, p256dh, auth, userAgent },
    update: { pubkey, p256dh, auth, userAgent },
  });

  return NextResponse.json({ ok: true });
}
