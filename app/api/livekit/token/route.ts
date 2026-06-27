import { NextResponse } from "next/server";
import { AccessToken } from "livekit-server-sdk";
import { prisma } from "../../../lib/prisma";
import { getPubkeyFromRequest } from "../../../lib/auth";

// POST /api/livekit/token
// Body: { room: string }  (room === meetingId, the kind-40 event id)
//
// Access control mirrors the rest of the app:
//  1. NIP-98 signature establishes the caller's pubkey (no x-pubkey fallback).
//  2. The pubkey must be a registered/whitelisted community member.
// On success we mint a short-lived LiveKit JWT scoped to that single room.
export async function POST(request: Request) {
  const pubkey = await getPubkeyFromRequest(request);
  if (!pubkey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  if (!apiKey || !apiSecret) {
    return NextResponse.json(
      { error: "LiveKit not configured on this server" },
      { status: 503 }
    );
  }

  let room: string | undefined;
  try {
    const body = await request.json();
    room = typeof body?.room === "string" ? body.room.trim() : undefined;
  } catch {
    /* fallthrough */
  }
  if (!room) {
    return NextResponse.json({ error: "Missing room" }, { status: 400 });
  }

  // Whitelist gate: only registered members may obtain a media token.
  const member = await prisma.member.findFirst({
    where: { pubkey },
    select: { firstName: true, lastName: true },
  });
  if (!member) {
    return NextResponse.json({ error: "Not a community member" }, { status: 403 });
  }

  const displayName =
    [member.firstName, member.lastName].filter(Boolean).join(" ").trim() ||
    `${pubkey.slice(0, 8)}…`;

  // Identity is the hex pubkey so the client can map participants to profiles.
  const at = new AccessToken(apiKey, apiSecret, {
    identity: pubkey,
    name: displayName,
    ttl: "2h",
  });
  at.addGrant({
    room,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });

  const token = await at.toJwt();
  return NextResponse.json({ token, identity: pubkey });
}
