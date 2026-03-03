// POST /api/games/[gameId]/sessions/[sessionId]/next — advance to next question (admin only)

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../../../lib/prisma";
import { getPubkeyFromRequest } from "../../../../../../lib/auth";
import { emitGameEvent } from "../events/route";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ gameId: string; sessionId: string }> }
) {
  const { gameId, sessionId } = await params;
  const pubkey = getPubkeyFromRequest(request);
  if (!pubkey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify admin
  const game = await prisma.game.findUnique({ where: { id: gameId } });
  if (!game || game.createdBy !== pubkey) {
    return NextResponse.json({ error: "Only the game creator can advance questions" }, { status: 403 });
  }

  const session = await prisma.gameSession.findUnique({
    where: { id: sessionId },
  });
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const questionCount = await prisma.question.count({ where: { gameId } });
  const nextIndex = session.currentQuestionIndex + 1;

  if (nextIndex >= questionCount) {
    // Game is finished
    const updated = await prisma.gameSession.update({
      where: { id: sessionId },
      data: {
        status: "finished",
        finishedAt: new Date(),
      },
      include: {
        players: { orderBy: { score: "desc" } },
      },
    });
    emitGameEvent(sessionId, "game-finished", {
      leaderboard: updated.players.map((p) => ({
        pubkey: p.pubkey,
        displayName: p.displayName,
        score: p.score,
      })),
    });
    return NextResponse.json({ ...updated, finished: true });
  }

  // Advance to next question
  const updated = await prisma.gameSession.update({
    where: { id: sessionId },
    data: {
      status: "active",
      currentQuestionIndex: nextIndex,
      questionStartedAt: new Date(),
      startedAt: session.startedAt || new Date(),
    },
  });

  // Get the current question (without correct answer for players)
  const question = await prisma.question.findFirst({
    where: { gameId, order: nextIndex },
    select: { id: true, text: true, options: true, order: true },
  });

  const responseData = {
    session: updated,
    question: question
      ? { ...question, options: JSON.parse(question.options) }
      : null,
  };

  emitGameEvent(sessionId, "next-question", {
    questionIndex: nextIndex,
    question: responseData.question,
    totalQuestions: questionCount,
  });

  return NextResponse.json(responseData);
}
