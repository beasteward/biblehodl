// POST /api/games/[gameId]/sessions/[sessionId]/next — host control
//
// lobby/reveal → starts the next question (countdown → question, server-timed)
// question     → closes the open question early (skip)
// Delegates all phase transitions to the game engine.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../../../lib/prisma";
import { getPubkeyFromRequest } from "../../../../../../lib/auth";
import { advanceSession } from "../../../../../../lib/game-engine";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ gameId: string; sessionId: string }> }
) {
  const { gameId, sessionId } = await params;
  const pubkey = await getPubkeyFromRequest(request);
  if (!pubkey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const session = await prisma.gameSession.findUnique({
    where: { id: sessionId },
    include: { game: { select: { createdBy: true } } },
  });
  if (!session || session.gameId !== gameId) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  // Host = session creator (fallback: game author, for sessions created
  // before hostPubkey existed)
  const host = session.hostPubkey || session.game.createdBy;
  if (host !== pubkey) {
    return NextResponse.json({ error: "Only the host can control the game" }, { status: 403 });
  }

  try {
    const result = await advanceSession(sessionId);
    return NextResponse.json(result);
  } catch (err) {
    console.error(`[games] advance failed for ${sessionId}:`, err);
    return NextResponse.json({ error: "Failed to advance game" }, { status: 500 });
  }
}
