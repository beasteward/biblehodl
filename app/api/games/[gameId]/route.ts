// GET /api/games/[gameId] — get game details
// DELETE /api/games/[gameId] — delete game (creator only)

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { getPubkeyFromRequest } from "../../../lib/auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ gameId: string }> }
) {
  const { gameId } = await params;

  const game = await prisma.game.findUnique({
    where: { id: gameId },
    include: {
      questions: { orderBy: { order: "asc" } },
      sessions: {
        include: {
          players: { orderBy: { score: "desc" } },
          _count: { select: { answers: true } },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!game) {
    return NextResponse.json({ error: "Game not found" }, { status: 404 });
  }

  return NextResponse.json(game);
}

export async function DELETE(
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
    return NextResponse.json({ error: "Only the creator can delete this game" }, { status: 403 });
  }

  await prisma.game.delete({ where: { id: gameId } });
  return NextResponse.json({ success: true });
}
