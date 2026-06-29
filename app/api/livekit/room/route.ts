import { NextResponse } from "next/server";
import { RoomServiceClient } from "livekit-server-sdk";
import { prisma } from "../../../lib/prisma";
import { getPubkeyFromRequest } from "../../../lib/auth";

// GET /api/livekit/room?room=<name>
// Live presence for a call room so the chat UI can decide between
// "Meet now" (no one in the room) and "Join now" (a call is already running and
// the caller hasn't joined). Identity in our LiveKit tokens is the hex pubkey,
// so the client maps participants back to members and computes `joined` itself.
//
// Access control mirrors /api/livekit/token:
//   1. NIP-98 signature establishes the caller's pubkey.
//   2. The pubkey must be a registered/whitelisted community member.

// LiveKit's HTTP (Twirp) API lives on the same host as the signaling URL. We
// derive the https/http origin from the public wss/ws URL, allowing an explicit
// override via LIVEKIT_API_URL for unusual topologies.
function livekitApiHost(): string | null {
  const pub = process.env.LIVEKIT_API_URL || process.env.NEXT_PUBLIC_LIVEKIT_URL;
  if (!pub) return null;
  return pub.replace(/^wss:\/\//, "https://").replace(/^ws:\/\//, "http://");
}

export async function GET(request: Request) {
  const pubkey = await getPubkeyFromRequest(request);
  if (!pubkey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const host = livekitApiHost();
  // Calling not configured → report an empty, inactive room rather than erroring
  // so the UI can simply hide the call affordance.
  if (!apiKey || !apiSecret || !host) {
    return NextResponse.json({ active: false, identities: [] });
  }

  const room = new URL(request.url).searchParams.get("room")?.trim();
  if (!room) {
    return NextResponse.json({ error: "Missing room" }, { status: 400 });
  }

  // Whitelist gate: only registered members may probe call presence.
  const member = await prisma.member.findFirst({
    where: { pubkey },
    select: { id: true },
  });
  if (!member) {
    return NextResponse.json({ error: "Not a community member" }, { status: 403 });
  }

  try {
    const svc = new RoomServiceClient(host, apiKey, apiSecret);
    const participants = await svc.listParticipants(room);
    const identities = participants.map((p) => p.identity);
    return NextResponse.json({ active: identities.length > 0, identities });
  } catch {
    // listParticipants throws when the room doesn't exist yet (nobody has
    // joined). That's the common "no call in progress" case, not an error.
    return NextResponse.json({ active: false, identities: [] });
  }
}
