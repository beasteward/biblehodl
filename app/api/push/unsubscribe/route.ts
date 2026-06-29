import { NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { getPubkeyFromRequest } from "../../../lib/auth";

// POST /api/push/unsubscribe
// Body: { endpoint: string }
//
// Removes a push subscription. NIP-98 auth required; a caller may only delete a
// subscription bound to their own pubkey.
export async function POST(request: Request) {
  const pubkey = await getPubkeyFromRequest(request);
  if (!pubkey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let endpoint: string | undefined;
  try {
    const body = await request.json();
    endpoint = typeof body?.endpoint === "string" ? body.endpoint.trim() : undefined;
  } catch {
    /* fallthrough */
  }
  if (!endpoint) {
    return NextResponse.json({ error: "Missing endpoint" }, { status: 400 });
  }

  await prisma.pushSubscription.deleteMany({ where: { endpoint, pubkey } });
  return NextResponse.json({ ok: true });
}
