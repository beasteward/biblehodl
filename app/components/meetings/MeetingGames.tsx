"use client";

import { useState, useEffect, useCallback } from "react";
import { useAppStore } from "../../lib/store";
import { fetchGames, createSession, type Game } from "../../lib/game-service";
import { createEvent, KIND_CHANNEL_MESSAGE } from "../../lib/nostr";
import { pool } from "../../lib/relay-pool";
import CreateGameModal from "../games/CreateGameModal";
import GameSessionView from "../games/GameSession";

interface Props {
  meetingId: string;
}

export default function MeetingGames({ meetingId }: Props) {
  const keys = useAppStore((s) => s.keys);
  const profiles = useAppStore((s) => s.profiles);
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [activeSession, setActiveSession] = useState<{
    gameId: string;
    sessionId: string;
    gameTitle: string;
    timePerQuestion: number;
    isAdmin: boolean;
    totalQuestions: number;
  } | null>(null);

  const loadGames = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchGames();
      setGames(data);
    } catch (err) {
      console.error("Failed to load games:", err);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadGames();
  }, [loadGames]);

  // Publish a game invite to the meeting channel
  const publishInvite = async (game: Game, sessionId: string) => {
    if (!keys) return;

    const displayName = profiles[keys.publicKey]?.displayName || profiles[keys.publicKey]?.name || "Someone";
    const content = JSON.stringify({
      type: "game-invite",
      gameId: game.id,
      sessionId,
      gameTitle: game.title,
      invitedBy: displayName,
      questionCount: game._count?.questions || game.questions?.length || 0,
      timePerQuestion: game.timePerQuestion,
    });

    const tags: string[][] = [
      ["e", meetingId, "", "root"],
      ["t", "game-invite"],
    ];

    const event = createEvent(KIND_CHANNEL_MESSAGE, content, tags, keys.privateKey);
    await pool.publish(event);
  };

  const handleHostGame = async (game: Game) => {
    if (!keys) return;
    try {
      const session = await createSession(game.id, keys.publicKey);
      await publishInvite(game, session.id);
      setActiveSession({
        gameId: game.id,
        sessionId: session.id,
        gameTitle: game.title,
        timePerQuestion: game.timePerQuestion,
        isAdmin: true,
        totalQuestions: game._count?.questions || game.questions?.length || 0,
      });
    } catch (err) {
      console.error("Failed to start game:", err);
    }
  };

  // Active game session
  if (activeSession) {
    return (
      <GameSessionView
        gameId={activeSession.gameId}
        sessionId={activeSession.sessionId}
        gameTitle={activeSession.gameTitle}
        timePerQuestion={activeSession.timePerQuestion}
        isAdmin={activeSession.isAdmin}
        totalQuestions={activeSession.totalQuestions}
        onExit={() => { setActiveSession(null); loadGames(); }}
      />
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Toolbar */}
      <div
        className="flex items-center justify-between px-4 py-2 border-b"
        style={{ borderColor: "var(--border)", background: "var(--bg-secondary)" }}
      >
        <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
          🎮 Meeting Games
        </span>
        <button
          onClick={() => setShowCreate(true)}
          className="px-3 py-1.5 rounded text-sm font-medium"
          style={{ background: "var(--accent)", color: "white" }}
        >
          + Create Game
        </button>
      </div>

      {/* Game list */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center h-40" style={{ color: "var(--text-muted)" }}>
            Loading games...
          </div>
        ) : games.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48" style={{ color: "var(--text-muted)" }}>
            <div className="text-5xl mb-3">🎮</div>
            <p className="text-sm mb-1">No games available</p>
            <p className="text-xs">Create a quiz to test your group</p>
          </div>
        ) : (
          <div className="space-y-2">
            {games.map((game) => {
              const isCreator = game.createdBy === keys?.publicKey;
              const activeLobby = game.sessions?.find((s) => s.status === "lobby");
              const questionCount = game._count?.questions || game.questions?.length || 0;

              return (
                <div
                  key={game.id}
                  className="flex items-center justify-between p-3 rounded-lg"
                  style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                      {game.title}
                    </div>
                    <div className="flex items-center gap-3 text-xs" style={{ color: "var(--text-muted)" }}>
                      <span>❓ {questionCount}</span>
                      <span>⏱ {game.timePerQuestion}s</span>
                      {activeLobby && (
                        <span style={{ color: "#22c55e" }}>🟢 Lobby open</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {activeLobby && (
                      <button
                        onClick={() =>
                          setActiveSession({
                            gameId: game.id,
                            sessionId: activeLobby.id,
                            gameTitle: game.title,
                            timePerQuestion: game.timePerQuestion,
                            isAdmin: isCreator,
                            totalQuestions: questionCount,
                          })
                        }
                        className="px-3 py-1.5 rounded text-xs font-medium"
                        style={{ background: "#22c55e", color: "white" }}
                      >
                        Join
                      </button>
                    )}
                    {isCreator && !activeLobby && (
                      <button
                        onClick={() => handleHostGame(game)}
                        className="px-3 py-1.5 rounded text-xs font-medium"
                        style={{ background: "var(--accent)", color: "white" }}
                      >
                        ▶ Host
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showCreate && (
        <CreateGameModal
          onClose={() => setShowCreate(false)}
          onCreated={loadGames}
        />
      )}
    </div>
  );
}
