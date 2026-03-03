"use client";

import { useState, useEffect, useRef } from "react";
import { useAppStore } from "../../lib/store";
import { joinSession, advanceQuestion } from "../../lib/game-service";

interface Player {
  pubkey: string;
  displayName: string;
  score: number;
}

interface Props {
  gameId: string;
  sessionId: string;
  gameTitle: string;
  isAdmin: boolean;
  onGameStart: (data: { question: unknown; questionIndex: number; totalQuestions: number }) => void;
  onBack: () => void;
}

export default function GameLobby({ gameId, sessionId, gameTitle, isAdmin, onGameStart, onBack }: Props) {
  const keys = useAppStore((s) => s.keys);
  const profiles = useAppStore((s) => s.profiles);
  const [players, setPlayers] = useState<Player[]>([]);
  const [joined, setJoined] = useState(false);
  const [starting, setStarting] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Connect to SSE
  useEffect(() => {
    const es = new EventSource(`/api/games/${gameId}/sessions/${sessionId}/events`);
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "player-joined") {
        setPlayers((prev) => {
          if (prev.some((p) => p.pubkey === data.data.pubkey)) return prev;
          return [...prev, { pubkey: data.data.pubkey, displayName: data.data.displayName, score: 0 }];
        });
      } else if (data.type === "next-question") {
        onGameStart({
          question: data.data.question,
          questionIndex: data.data.questionIndex,
          totalQuestions: data.data.totalQuestions,
        });
      }
    };

    return () => es.close();
  }, [gameId, sessionId, onGameStart]);

  // Auto-join on mount
  useEffect(() => {
    if (!keys || joined) return;
    const displayName = profiles[keys.publicKey]?.displayName || profiles[keys.publicKey]?.name || keys.publicKey.slice(0, 8);
    joinSession(gameId, sessionId, keys.publicKey, displayName)
      .then(() => setJoined(true))
      .catch(console.error);
  }, [keys, joined, gameId, sessionId, profiles]);

  // Fetch existing players
  useEffect(() => {
    fetch(`/api/games/${gameId}/sessions/${sessionId}/leaderboard`)
      .then((r) => r.json())
      .then((data) => {
        if (data.leaderboard) {
          setPlayers(data.leaderboard.map((p: Player) => ({
            pubkey: p.pubkey,
            displayName: p.displayName,
            score: 0,
          })));
        }
      })
      .catch(console.error);
  }, [gameId, sessionId]);

  const handleStart = async () => {
    if (!keys) return;
    setStarting(true);
    try {
      const result = await advanceQuestion(gameId, sessionId, keys.publicKey);
      // Admin also gets the question directly
      onGameStart({
        question: result.question,
        questionIndex: result.session.currentQuestionIndex,
        totalQuestions: 0, // Will be updated from SSE
      });
    } catch (err) {
      console.error("Failed to start:", err);
      setStarting(false);
    }
  };

  const playerColors = ["#e74c3c", "#3498db", "#f39c12", "#2ecc71", "#9b59b6", "#1abc9c", "#e67e22", "#e84393"];

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <div className="w-full max-w-lg text-center">
        {/* Game title */}
        <div className="text-5xl mb-4">🎮</div>
        <h1 className="text-2xl font-bold mb-2" style={{ color: "var(--text-primary)" }}>
          {gameTitle}
        </h1>
        <p className="text-sm mb-8" style={{ color: "var(--text-muted)" }}>
          Waiting for players to join...
        </p>

        {/* Session code */}
        <div
          className="inline-block px-6 py-3 rounded-lg mb-8"
          style={{ background: "var(--bg-tertiary)", border: "1px solid var(--border)" }}
        >
          <div className="text-xs mb-1" style={{ color: "var(--text-muted)" }}>Game Code</div>
          <div className="text-2xl font-mono font-bold tracking-wider" style={{ color: "var(--accent)" }}>
            {sessionId.slice(0, 8).toUpperCase()}
          </div>
        </div>

        {/* Players */}
        <div className="mb-8">
          <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--text-muted)" }}>
            Players ({players.length})
          </h3>
          {players.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>No players yet...</p>
          ) : (
            <div className="flex flex-wrap justify-center gap-3">
              {players.map((player, i) => (
                <div
                  key={player.pubkey}
                  className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium animate-pulse"
                  style={{
                    background: playerColors[i % playerColors.length] + "20",
                    color: playerColors[i % playerColors.length],
                    border: `1px solid ${playerColors[i % playerColors.length]}40`,
                    animationDuration: "2s",
                  }}
                >
                  <span className="text-lg">👤</span>
                  {player.displayName}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={onBack}
            className="px-4 py-2 rounded text-sm"
            style={{ color: "var(--text-muted)" }}
          >
            ← Leave
          </button>
          {isAdmin && (
            <button
              onClick={handleStart}
              disabled={starting || players.length === 0}
              className="px-8 py-3 rounded-lg text-lg font-bold disabled:opacity-50 transition-transform hover:scale-105"
              style={{ background: "var(--accent)", color: "white" }}
            >
              {starting ? "Starting..." : "🚀 Start Game!"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
