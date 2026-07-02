// GET /api/games/[gameId]/sessions/[sessionId]/state — full session snapshot
//
// Lets a client hydrate (or re-hydrate after refresh/reconnect) into the
// correct phase without replaying events. The correct answer is only included
// once the question has closed (reveal/finished).

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../../../lib/prisma";
import { recoverSession } from "../../../../../../lib/game-engine";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ gameId: string; sessionId: string }> }
) {
  const { gameId, sessionId } = await params;

  // Fast-forward/re-arm timers if needed (e.g. after server restart)
  await recoverSession(sessionId);

  const session = await prisma.gameSession.findUnique({
    where: { id: sessionId },
    include: {
      game: {
        select: {
          title: true,
          timePerQuestion: true,
          createdBy: true,
          _count: { select: { questions: true } },
        },
      },
      players: { orderBy: [{ score: "desc" }, { joinedAt: "asc" }] },
    },
  });
  if (!session || session.gameId !== gameId) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const revealed = session.phase === "reveal" || session.phase === "finished";
  const question =
    session.currentQuestionIndex >= 0
      ? await prisma.question.findFirst({
          where: { gameId: session.gameId, order: session.currentQuestionIndex },
        })
      : null;

  const answers = question
    ? await prisma.answer.findMany({
        where: { sessionId, questionId: question.id },
        select: { playerPubkey: true, selectedIndex: true, correct: true, score: true },
      })
    : [];

  const options = question ? (JSON.parse(question.options) as string[]) : [];
  const distribution = revealed
    ? options.map((_, i) => answers.filter((a) => a.selectedIndex === i).length)
    : null;

  return NextResponse.json({
    session: {
      id: session.id,
      status: session.status,
      phase: session.phase,
      remainingMs: session.phaseEndsAt
        ? Math.max(0, session.phaseEndsAt.getTime() - Date.now())
        : null,
      currentQuestionIndex: session.currentQuestionIndex,
      totalQuestions: session.game._count.questions,
      timePerQuestion: session.game.timePerQuestion,
      gameTitle: session.game.title,
      hostPubkey: session.hostPubkey || session.game.createdBy,
    },
    question: question
      ? {
          id: question.id,
          text: question.text,
          options,
          order: question.order,
          imageUrl: question.imageUrl || undefined,
          ...(revealed ? { correctIndex: question.correctIndex } : {}),
        }
      : null,
    distribution,
    answeredPubkeys: answers.map((a) => a.playerPubkey),
    leaderboard: session.players.map((p, i) => {
      const a = revealed ? answers.find((x) => x.playerPubkey === p.pubkey) : undefined;
      return {
        pubkey: p.pubkey,
        displayName: p.displayName,
        score: p.score,
        gained: a?.score ?? 0,
        correct: a ? a.correct : null,
        streak: p.streak,
        rank: i + 1,
        prevRank: p.lastRank,
      };
    }),
  });
}
