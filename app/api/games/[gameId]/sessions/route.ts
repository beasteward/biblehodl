// POST /api/games/[gameId]/sessions — create a game session (lobby)
// GET /api/games/[gameId]/sessions — list sessions for a game

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { getPubkeyFromRequest } from "../../../../lib/auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ gameId: string }> }
) {
  const { gameId } = await params;

  const sessions = await prisma.gameSession.findMany({
    where: { gameId },
    include: {
      players: { orderBy: { score: "desc" } },
      _count: { select: { answers: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(sessions);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ gameId: string }> }
) {
  const { gameId } = await params;
  const pubkey = getPubkeyFromRequest(request);
  if (!pubkey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const game = await prisma.game.findUnique({ where: { id: gameId } });
  if (!game) {
    return NextResponse.json({ error: "Game not found" }, { status: 404 });
  }
  if (game.createdBy !== pubkey) {
    return NextResponse.json({ error: "Only the creator can start sessions" }, { status: 403 });
  }

  const session = await prisma.gameSession.create({
    data: {
      gameId,
      status: "lobby",
    },
    include: {
      players: true,
      game: { include: { questions: { orderBy: { order: "asc" } } } },
    },
  });

  return NextResponse.json(session, { status: 201 });
}
