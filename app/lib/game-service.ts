// Game API client

import { createEvent } from "./nostr";

function getAuthHeaders(privateKey?: Uint8Array, pubkey?: string): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };

  if (privateKey) {
    // NIP-98 auth event
    const event = createEvent(
      27235,
      "",
      [["expiration", String(Math.floor(Date.now() / 1000) + 300)]],
      privateKey
    );
    headers["Authorization"] = `Nostr ${btoa(JSON.stringify(event))}`;
  } else if (pubkey) {
    headers["x-pubkey"] = pubkey;
  }

  return headers;
}

export interface GameQuestion {
  text: string;
  options: string[];
  correctIndex: number;
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
  pubkey: string
): Promise<Game> {
  const res = await fetch("/api/games", {
    method: "POST",
    headers: getAuthHeaders(undefined, pubkey),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to create game");
  }
  return res.json();
}

export async function deleteGame(gameId: string, pubkey: string): Promise<void> {
  const res = await fetch(`/api/games/${gameId}`, {
    method: "DELETE",
    headers: getAuthHeaders(undefined, pubkey),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to delete game");
  }
}

// ─── Sessions ───

export async function createSession(gameId: string, pubkey: string) {
  const res = await fetch(`/api/games/${gameId}/sessions`, {
    method: "POST",
    headers: getAuthHeaders(undefined, pubkey),
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
  pubkey: string,
  displayName: string
) {
  const res = await fetch(`/api/games/${gameId}/sessions/${sessionId}/join`, {
    method: "POST",
    headers: getAuthHeaders(undefined, pubkey),
    body: JSON.stringify({ displayName }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to join session");
  }
  return res.json();
}

export async function advanceQuestion(gameId: string, sessionId: string, pubkey: string) {
  const res = await fetch(`/api/games/${gameId}/sessions/${sessionId}/next`, {
    method: "POST",
    headers: getAuthHeaders(undefined, pubkey),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to advance question");
  }
  return res.json();
}

export async function submitAnswer(
  gameId: string,
  sessionId: string,
  pubkey: string,
  questionId: string,
  selectedIndex: number
) {
  const res = await fetch(`/api/games/${gameId}/sessions/${sessionId}/answer`, {
    method: "POST",
    headers: getAuthHeaders(undefined, pubkey),
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
