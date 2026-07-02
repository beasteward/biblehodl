// Game API client (NIP-98 authenticated)

import type { Signer } from "./signer";
import { authFetch } from "./http-auth";

const JSON_HEADERS = { "Content-Type": "application/json" };

export interface GameQuestion {
  text: string;
  options: string[];
  correctIndex: number;
}

export interface SessionLeaderboardEntry {
  pubkey: string;
  displayName: string;
  score: number;
  gained: number;
  correct: boolean | null;
  streak: number;
  rank: number;
  prevRank: number | null;
}

export interface PublicQuestion {
  id: string;
  text: string;
  options: string[];
  order: number;
  correctIndex?: number; // only present once revealed
}

export interface SessionState {
  session: {
    id: string;
    status: string;
    phase: "lobby" | "countdown" | "question" | "reveal" | "finished";
    remainingMs: number | null;
    currentQuestionIndex: number;
    totalQuestions: number;
    timePerQuestion: number;
    gameTitle: string;
    hostPubkey: string;
  };
  question: PublicQuestion | null;
  distribution: number[] | null;
  answeredPubkeys: string[];
  leaderboard: SessionLeaderboardEntry[];
}

export interface Game {
  id: string;
  title: string;
  description: string;
  createdBy: string;
  timePerQuestion: number;
  createdAt: string;
  questions: { id: string; text: string; options: string; correctIndex: number; order: number }[];
  sessions?: { id: string; status: string }[];
  _count?: { questions: number };
}

// ─── Games CRUD ───

export async function fetchGames(createdBy?: string): Promise<Game[]> {
  const params = createdBy ? `?createdBy=${createdBy}` : "";
  const res = await fetch(`/api/games${params}`);
  if (!res.ok) throw new Error("Failed to fetch games");
  return res.json();
}

export async function fetchGame(gameId: string): Promise<Game> {
  const res = await fetch(`/api/games/${gameId}`);
  if (!res.ok) throw new Error("Failed to fetch game");
  return res.json();
}

export async function createGame(
  data: {
    title: string;
    description: string;
    timePerQuestion: number;
    questions: GameQuestion[];
  },
  signer: Signer
): Promise<Game> {
  const res = await authFetch(signer, "/api/games", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to create game");
  }
  return res.json();
}

export async function deleteGame(gameId: string, signer: Signer): Promise<void> {
  const res = await authFetch(signer, `/api/games/${gameId}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to delete game");
  }
}

// ─── Sessions ───

export async function createSession(gameId: string, signer: Signer) {
  const res = await authFetch(signer, `/api/games/${gameId}/sessions`, {
    method: "POST",
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to create session");
  }
  return res.json();
}

export async function joinSession(
  gameId: string,
  sessionId: string,
  signer: Signer,
  displayName: string
) {
  const res = await authFetch(signer, `/api/games/${gameId}/sessions/${sessionId}/join`, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ displayName }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to join session");
  }
  return res.json();
}

export async function advanceQuestion(gameId: string, sessionId: string, signer: Signer) {
  const res = await authFetch(signer, `/api/games/${gameId}/sessions/${sessionId}/next`, {
    method: "POST",
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to advance question");
  }
  return res.json();
}

export async function fetchSessionState(
  gameId: string,
  sessionId: string
): Promise<SessionState> {
  const res = await fetch(`/api/games/${gameId}/sessions/${sessionId}/state`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error("Failed to fetch session state");
  return res.json();
}

export async function submitAnswer(
  gameId: string,
  sessionId: string,
  signer: Signer,
  questionId: string,
  selectedIndex: number
): Promise<{ accepted: boolean; answeredCount: number }> {
  const res = await authFetch(signer, `/api/games/${gameId}/sessions/${sessionId}/answer`, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ questionId, selectedIndex }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to submit answer");
  }
  return res.json();
}

export async function fetchLeaderboard(gameId: string, sessionId: string) {
  const res = await fetch(`/api/games/${gameId}/sessions/${sessionId}/leaderboard`);
  if (!res.ok) throw new Error("Failed to fetch leaderboard");
  return res.json();
}
