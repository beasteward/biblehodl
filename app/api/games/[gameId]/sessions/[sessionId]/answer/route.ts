// POST /api/games/[gameId]/sessions/[sessionId]/answer — submit an answer
//
// Server-authoritative: only accepted while the session phase is "question",
// only for the CURRENT question, and only until the deadline (+ grace).
// Correctness/score are NOT returned — they're revealed to everyone at once
// via the "question-closed" SSE event when the question closes.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../../../lib/prisma";
import { getPubkeyFromRequest } from "../../../../../../lib/auth";
import { emitGameEvent, maybeCloseEarly, ANSWER_GRACE_MS } from "../../../../../../lib/game-engine";

const MAX_STREAK_BONUS_STEPS = 5;
const STREAK_BONUS_PER_STEP = 50;

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
  const { questionId, selectedIndex } = body;

  if (!questionId || typeof selectedIndex !== "number") {
    return NextResponse.json({ error: "questionId and selectedIndex required" }, { status: 400 });
  }

  const session = await prisma.gameSession.findUnique({
    where: { id: sessionId },
    include: { game: true },
  });
  if (!session || session.phase !== "question") {
    return NextResponse.json({ error: "No question is open" }, { status: 400 });
  }

  // Must answer the CURRENT question
  const question = await prisma.question.findUnique({ where: { id: questionId } });
  if (!question || question.gameId !== session.gameId) {
    return NextResponse.json({ error: "Question not found" }, { status: 404 });
  }
  if (question.order !== session.currentQuestionIndex) {
    return NextResponse.json({ error: "Not the current question" }, { status: 400 });
  }

  // Deadline enforcement (server clock + small grace for network latency)
  const timeLimitMs = session.game.timePerQuestion * 1000;
  const startedAt = session.questionStartedAt?.getTime() ?? 0;
  const responseTimeMs = Date.now() - startedAt;
  if (!startedAt || responseTimeMs > timeLimitMs + ANSWER_GRACE_MS) {
    return NextResponse.json({ error: "Time is up" }, { status: 400 });
  }

  const player = await prisma.player.findUnique({
    where: { sessionId_pubkey: { sessionId, pubkey } },
  });
  if (!player) {
    return NextResponse.json({ error: "You are not in this game" }, { status: 403 });
  }

  const existing = await prisma.answer.findUnique({
    where: { sessionId_questionId_playerPubkey: { sessionId, questionId, playerPubkey: pubkey } },
  });
  if (existing) {
    return NextResponse.json({ error: "Already answered this question" }, { status: 400 });
  }

  const correct = selectedIndex === question.correctIndex;

  // Speed-based score (100–1000) + streak bonus, computed server-side
  const clampedTime = Math.min(Math.max(responseTimeMs, 0), timeLimitMs);
  const baseScore = correct
    ? Math.max(100, Math.round(1000 - (clampedTime / timeLimitMs) * 900))
    : 0;
  const newStreak = correct ? player.streak + 1 : 0;
  const streakBonus = correct
    ? Math.min(newStreak - 1, MAX_STREAK_BONUS_STEPS) * STREAK_BONUS_PER_STEP
    : 0;
  const score = baseScore + streakBonus;

  await prisma.answer.create({
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

  await prisma.player.update({
    where: { id: player.id },
    data: { score: player.score + score, streak: newStreak },
  });

  const answeredCount = await prisma.answer.count({ where: { sessionId, questionId } });

  // Broadcast that someone answered (without revealing what they picked)
  emitGameEvent(sessionId, "player-answered", {
    pubkey,
    questionId,
    answeredCount,
  });

  // Close early if everyone has answered (fire-and-forget; SSE will notify)
  maybeCloseEarly(sessionId, questionId).catch((err) =>
    console.error(`[games] early close failed for ${sessionId}:`, err)
  );

  return NextResponse.json({ accepted: true, answeredCount });
}
