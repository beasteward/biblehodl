// POST /api/games/[gameId]/sessions/[sessionId]/join — player joins a session

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../../../lib/prisma";
import { getPubkeyFromRequest } from "../../../../../../lib/auth";
import { emitGameEvent } from "../../../../../../lib/game-engine";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ gameId: string; sessionId: string }> }
) {
  const { sessionId } = await params;
  const pubkey = await getPubkeyFromRequest(request);
  if (!pubkey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { displayName } = body;

  const session = await prisma.gameSession.findUnique({
    where: { id: sessionId },
  });

  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  if (session.status !== "lobby") {
    // Allow existing players to reconnect mid-game; block new joins
    const existing = await prisma.player.findUnique({
      where: { sessionId_pubkey: { sessionId, pubkey } },
    });
    if (existing) {
      return NextResponse.json(existing, { status: 200 });
    }
    return NextResponse.json({ error: "Cannot join — game already in progress or finished" }, { status: 400 });
  }

  // Upsert player (rejoin if already in)
  const player = await prisma.player.upsert({
    where: { sessionId_pubkey: { sessionId, pubkey } },
    update: { displayName: displayName || pubkey.slice(0, 8) },
    create: {
      sessionId,
      pubkey,
      displayName: displayName || pubkey.slice(0, 8),
    },
  });

  emitGameEvent(sessionId, "player-joined", {
    pubkey: player.pubkey,
    displayName: player.displayName,
  });

  return NextResponse.json(player, { status: 201 });
}
