// GET /api/games/[gameId]/sessions/[sessionId]/leaderboard — get current standings

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../../../lib/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ gameId: string; sessionId: string }> }
) {
  const { sessionId } = await params;

  const session = await prisma.gameSession.findUnique({
    where: { id: sessionId },
    include: {
      players: { orderBy: { score: "desc" } },
      game: { select: { title: true, _count: { select: { questions: true } } } },
    },
  });

  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  // Get per-question breakdown for each player
  const answers = await prisma.answer.findMany({
    where: { sessionId },
    orderBy: { answeredAt: "asc" },
  });

  return NextResponse.json({
    session: {
      id: session.id,
      status: session.status,
      currentQuestionIndex: session.currentQuestionIndex,
      totalQuestions: session.game._count.questions,
      gameTitle: session.game.title,
    },
    leaderboard: session.players.map((p) => ({
      pubkey: p.pubkey,
      displayName: p.displayName,
      score: p.score,
      answersCount: answers.filter((a) => a.playerPubkey === p.pubkey).length,
      correctCount: answers.filter((a) => a.playerPubkey === p.pubkey && a.correct).length,
    })),
  });
}
