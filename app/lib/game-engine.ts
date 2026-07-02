// Server-side game engine: authoritative phase machine + SSE event bus.
//
// Phases: lobby → countdown(3s) → question(N s) → reveal → … → finished
// - The server owns question deadlines. Questions auto-close when the timer
//   expires or when every player has answered (early close).
// - Events carry a monotonic per-session `seq` so SSE clients can catch up
//   after a reconnect (Last-Event-ID).
// - Timers are in-process (single-node deploy). `recoverSession` re-arms or
//   fast-forwards a session whose deadline passed while no timer was armed
//   (e.g. after a server restart).

import { prisma } from "./prisma";

export const COUNTDOWN_MS = 3000;
export const ANSWER_GRACE_MS = 1000;
const CLOSE_SLACK_MS = 250;
const RING_SIZE = 200;

export type GameEvent = {
  seq: number;
  type: string;
  data: unknown;
  timestamp: number;
};

export interface LeaderboardEntry {
  pubkey: string;
  displayName: string;
  score: number;
  gained: number; // points gained on the question just closed
  correct: boolean | null; // null = didn't answer
  streak: number;
  rank: number;
  prevRank: number | null;
}

// ─── Event bus ───

const sessionEvents = new Map<string, GameEvent[]>();
const sessionSeq = new Map<string, number>();
const sessionListeners = new Map<string, Set<(event: GameEvent) => void>>();
const sessionTimers = new Map<string, ReturnType<typeof setTimeout>>();
const sessionLocks = new Map<string, Promise<void>>();

export function emitGameEvent(sessionId: string, type: string, data: unknown): GameEvent {
  const seq = (sessionSeq.get(sessionId) || 0) + 1;
  sessionSeq.set(sessionId, seq);
  const event: GameEvent = { seq, type, data, timestamp: Date.now() };

  const events = sessionEvents.get(sessionId) || [];
  events.push(event);
  if (events.length > RING_SIZE) events.shift();
  sessionEvents.set(sessionId, events);

  const listeners = sessionListeners.get(sessionId);
  if (listeners) {
    for (const listener of listeners) {
      try {
        listener(event);
      } catch {
        // listener teardown races are fine
      }
    }
  }
  return event;
}

export function subscribeToSession(
  sessionId: string,
  listener: (event: GameEvent) => void
): () => void {
  if (!sessionListeners.has(sessionId)) {
    sessionListeners.set(sessionId, new Set());
  }
  sessionListeners.get(sessionId)!.add(listener);
  return () => {
    const set = sessionListeners.get(sessionId);
    set?.delete(listener);
    if (set && set.size === 0) sessionListeners.delete(sessionId);
  };
}

export function eventsSince(sessionId: string, afterSeq: number): GameEvent[] {
  const events = sessionEvents.get(sessionId) || [];
  return events.filter((e) => e.seq > afterSeq);
}

// ─── Per-session mutex (serialize phase transitions) ───

async function withSessionLock<T>(sessionId: string, fn: () => Promise<T>): Promise<T> {
  const prev = sessionLocks.get(sessionId) || Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  sessionLocks.set(
    sessionId,
    prev.then(() => gate)
  );
  await prev;
  try {
    return await fn();
  } finally {
    release();
    if (sessionLocks.get(sessionId) === gate) sessionLocks.delete(sessionId);
  }
}

function armTimer(sessionId: string, ms: number, fn: () => void) {
  clearTimer(sessionId);
  sessionTimers.set(sessionId, setTimeout(fn, Math.max(0, ms)));
}

function clearTimer(sessionId: string) {
  const t = sessionTimers.get(sessionId);
  if (t) clearTimeout(t);
  sessionTimers.delete(sessionId);
}

// ─── Question payload helpers ───

function publicQuestion(q: { id: string; text: string; options: string; order: number; imageUrl?: string | null }) {
  return {
    id: q.id,
    text: q.text,
    options: JSON.parse(q.options) as string[],
    order: q.order,
    imageUrl: q.imageUrl || undefined,
  };
}

async function computeLeaderboard(
  sessionId: string,
  questionId: string | null
): Promise<LeaderboardEntry[]> {
  const players = await prisma.player.findMany({
    where: { sessionId },
    orderBy: [{ score: "desc" }, { joinedAt: "asc" }],
  });
  const answers = questionId
    ? await prisma.answer.findMany({ where: { sessionId, questionId } })
    : [];
  const byPubkey = new Map(answers.map((a) => [a.playerPubkey, a]));

  const entries: LeaderboardEntry[] = players.map((p, i) => {
    const a = byPubkey.get(p.pubkey);
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
  });

  // Persist ranks for next question's deltas
  await Promise.all(
    entries.map((e, i) =>
      prisma.player.updateMany({
        where: { sessionId, pubkey: e.pubkey },
        data: { lastRank: i + 1 },
      })
    )
  );

  return entries;
}

// ─── Phase machine ───

/**
 * Advance the session: lobby/reveal → countdown → question.
 * If the current phase is an open question, treats the call as a skip
 * (closes the question instead of advancing).
 * Returns the emitted phase.
 */
export async function advanceSession(sessionId: string): Promise<{ phase: string; finished: boolean }> {
  return withSessionLock(sessionId, async () => {
    const session = await prisma.gameSession.findUnique({
      where: { id: sessionId },
      include: { game: { include: { _count: { select: { questions: true } } } } },
    });
    if (!session) throw new Error("Session not found");
    if (session.status === "finished") return { phase: "finished", finished: true };

    // Host pressed next while a question is open → close it (skip)
    if (session.phase === "question") {
      await closeQuestionLocked(sessionId);
      return { phase: "reveal", finished: false };
    }
    if (session.phase === "countdown") {
      // countdown already running; ignore double-click
      return { phase: "countdown", finished: false };
    }

    const questionCount = session.game._count.questions;
    const nextIndex = session.currentQuestionIndex + 1;

    if (nextIndex >= questionCount) {
      return await finishSessionLocked(sessionId);
    }

    const endsAt = new Date(Date.now() + COUNTDOWN_MS);
    await prisma.gameSession.update({
      where: { id: sessionId },
      data: {
        status: "active",
        phase: "countdown",
        phaseEndsAt: endsAt,
        currentQuestionIndex: nextIndex,
        startedAt: session.startedAt || new Date(),
      },
    });

    emitGameEvent(sessionId, "countdown", {
      questionIndex: nextIndex,
      totalQuestions: questionCount,
      durationMs: COUNTDOWN_MS,
      endsAt: endsAt.toISOString(),
    });

    armTimer(sessionId, COUNTDOWN_MS, () => {
      startQuestion(sessionId).catch((err) =>
        console.error(`[game-engine] startQuestion(${sessionId}) failed:`, err)
      );
    });

    return { phase: "countdown", finished: false };
  });
}

async function startQuestion(sessionId: string): Promise<void> {
  return withSessionLock(sessionId, async () => {
    const session = await prisma.gameSession.findUnique({
      where: { id: sessionId },
      include: { game: { include: { _count: { select: { questions: true } } } } },
    });
    if (!session || session.phase !== "countdown") return;

    const question = await prisma.question.findFirst({
      where: { gameId: session.gameId, order: session.currentQuestionIndex },
    });
    if (!question) {
      await finishSessionLocked(sessionId);
      return;
    }

    const durationMs = session.game.timePerQuestion * 1000;
    const now = new Date();
    const endsAt = new Date(now.getTime() + durationMs);

    await prisma.gameSession.update({
      where: { id: sessionId },
      data: { phase: "question", questionStartedAt: now, phaseEndsAt: endsAt },
    });

    emitGameEvent(sessionId, "question", {
      questionIndex: session.currentQuestionIndex,
      totalQuestions: session.game._count.questions,
      question: publicQuestion(question),
      durationMs,
      endsAt: endsAt.toISOString(),
    });

    armTimer(sessionId, durationMs + CLOSE_SLACK_MS, () => {
      closeQuestion(sessionId).catch((err) =>
        console.error(`[game-engine] closeQuestion(${sessionId}) failed:`, err)
      );
    });
  });
}

export async function closeQuestion(sessionId: string): Promise<void> {
  return withSessionLock(sessionId, () => closeQuestionLocked(sessionId));
}

/** Must be called while holding the session lock. */
async function closeQuestionLocked(sessionId: string): Promise<void> {
  const session = await prisma.gameSession.findUnique({
    where: { id: sessionId },
    include: { game: { include: { _count: { select: { questions: true } } } } },
  });
  if (!session || session.phase !== "question") return;
  clearTimer(sessionId);

  const question = await prisma.question.findFirst({
    where: { gameId: session.gameId, order: session.currentQuestionIndex },
  });
  if (!question) return;

  // Players who didn't answer lose their streak
  const answered = await prisma.answer.findMany({
    where: { sessionId, questionId: question.id },
    select: { playerPubkey: true, selectedIndex: true },
  });
  const answeredSet = new Set(answered.map((a) => a.playerPubkey));
  await prisma.player.updateMany({
    where: { sessionId, pubkey: { notIn: [...answeredSet] } },
    data: { streak: 0 },
  });

  const optionCount = (JSON.parse(question.options) as string[]).length;
  const distribution = Array.from({ length: optionCount }, (_, i) =>
    answered.filter((a) => a.selectedIndex === i).length
  );

  await prisma.gameSession.update({
    where: { id: sessionId },
    data: { phase: "reveal", phaseEndsAt: null },
  });

  const leaderboard = await computeLeaderboard(sessionId, question.id);
  const isLast = session.currentQuestionIndex + 1 >= session.game._count.questions;

  emitGameEvent(sessionId, "question-closed", {
    questionIndex: session.currentQuestionIndex,
    questionId: question.id,
    correctIndex: question.correctIndex,
    distribution,
    answeredCount: answered.length,
    leaderboard,
    isLast,
  });
}

/** Must be called while holding the session lock. */
async function finishSessionLocked(sessionId: string): Promise<{ phase: string; finished: boolean }> {
  clearTimer(sessionId);
  const updated = await prisma.gameSession.update({
    where: { id: sessionId },
    data: { status: "finished", phase: "finished", phaseEndsAt: null, finishedAt: new Date() },
    include: { players: { orderBy: [{ score: "desc" }, { joinedAt: "asc" }] } },
  });
  emitGameEvent(sessionId, "game-finished", {
    leaderboard: updated.players.map((p, i) => ({
      pubkey: p.pubkey,
      displayName: p.displayName,
      score: p.score,
      rank: i + 1,
    })),
  });
  return { phase: "finished", finished: true };
}

/**
 * Close the question early if every player has answered.
 * Called after each answer submission.
 */
export async function maybeCloseEarly(sessionId: string, questionId: string): Promise<void> {
  const [playerCount, answerCount] = await Promise.all([
    prisma.player.count({ where: { sessionId } }),
    prisma.answer.count({ where: { sessionId, questionId } }),
  ]);
  if (playerCount > 0 && answerCount >= playerCount) {
    await closeQuestion(sessionId);
  }
}

/**
 * Re-arm or fast-forward a session whose timed phase expired while no
 * in-process timer was armed (server restart). Cheap no-op otherwise.
 */
export async function recoverSession(sessionId: string): Promise<void> {
  if (sessionTimers.has(sessionId)) return;
  const session = await prisma.gameSession.findUnique({
    where: { id: sessionId },
    select: { phase: true, phaseEndsAt: true },
  });
  if (!session || !session.phaseEndsAt) return;

  const remaining = session.phaseEndsAt.getTime() - Date.now();
  if (session.phase === "countdown") {
    if (remaining <= 0) await startQuestion(sessionId);
    else
      armTimer(sessionId, remaining, () => {
        startQuestion(sessionId).catch(() => {});
      });
  } else if (session.phase === "question") {
    if (remaining <= -ANSWER_GRACE_MS) await closeQuestion(sessionId);
    else
      armTimer(sessionId, remaining + CLOSE_SLACK_MS, () => {
        closeQuestion(sessionId).catch(() => {});
      });
  }
}
