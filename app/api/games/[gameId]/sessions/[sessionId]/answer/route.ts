// POST /api/games/[gameId]/sessions/[sessionId]/answer — submit an answer

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../../../lib/prisma";
import { getPubkeyFromRequest } from "../../../../../../lib/auth";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ gameId: string; sessionId: string }> }
) {
  const { sessionId } = await params;
  const pubkey = getPubkeyFromRequest(request);
  if (!pubkey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { questionId, selectedIndex } = body;

  if (!questionId || typeof selectedIndex !== "number") {
    return NextResponse.json({ error: "questionId and selectedIndex required" }, { status: 400 });
  }

  // Verify session is active
  const session = await prisma.gameSession.findUnique({
    where: { id: sessionId },
    include: { game: true },
  });
  if (!session || session.status !== "active") {
    return NextResponse.json({ error: "Game is not active" }, { status: 400 });
  }

  // Verify player is in the session
  const player = await prisma.player.findUnique({
    where: { sessionId_pubkey: { sessionId, pubkey } },
  });
  if (!player) {
    return NextResponse.json({ error: "You are not in this game" }, { status: 403 });
  }

  // Check for duplicate answer
  const existing = await prisma.answer.findUnique({
    where: { sessionId_questionId_playerPubkey: { sessionId, questionId, playerPubkey: pubkey } },
  });
  if (existing) {
    return NextResponse.json({ error: "Already answered this question" }, { status: 400 });
  }

  // Get the question and check correctness
  const question = await prisma.question.findUnique({ where: { id: questionId } });
  if (!question) {
    return NextResponse.json({ error: "Question not found" }, { status: 404 });
  }

  const correct = selectedIndex === question.correctIndex;

  // Calculate response time and score
  const responseTimeMs = session.questionStartedAt
    ? Date.now() - session.questionStartedAt.getTime()
    : 0;
  const timeLimit = session.game.timePerQuestion * 1000;
  const score = correct
    ? Math.max(100, Math.round(1000 - (responseTimeMs / timeLimit) * 900))
    : 0;

  // Save answer
  const answer = await prisma.answer.create({
    data: {
      sessionId,
      questionId,
      playerPubkey: pubkey,
      selectedIndex,
      correct,
      responseTimeMs,
      score,
    },
  });

  // Update player total score
  await prisma.player.update({
    where: { id: player.id },
    data: { score: player.score + score },
  });

  return NextResponse.json({
    answer,
    correct,
    score,
    correctIndex: question.correctIndex,
  });
}
