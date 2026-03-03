"use client";

import { useState, useEffect, useCallback } from "react";
import { useAppStore } from "../../lib/store";
import { fetchGames, deleteGame, createSession, type Game } from "../../lib/game-service";
import CreateGameModal from "./CreateGameModal";
import GameSessionView from "./GameSession";

function GameCard({
  game,
  isCreator,
  onDelete,
  onSelect,
}: {
  game: Game;
  isCreator: boolean;
  onDelete: () => void;
  onSelect: () => void;
}) {
  const questionCount = game._count?.questions || game.questions?.length || 0;
  const activeSessions = game.sessions?.filter((s) => s.status === "lobby" || s.status === "active").length || 0;

  return (
    <div
      className="p-4 rounded-lg border hover:opacity-90 transition-opacity cursor-pointer"
      style={{ background: "var(--bg-secondary)", borderColor: "var(--border)" }}
      onClick={onSelect}
    >
      <div className="flex items-start justify-between mb-2">
        <div>
          <h3 className="font-semibold" style={{ color: "var(--text-primary)" }}>
            🎮 {game.title}
          </h3>
          {game.description && (
            <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
              {game.description}
            </p>
          )}
        </div>
        {activeSessions > 0 && (
          <span
            className="text-xs px-2 py-0.5 rounded-full font-medium"
            style={{ background: "#22c55e20", color: "#22c55e" }}
          >
            🟢 Live
          </span>
        )}
      </div>

      <div className="flex items-center gap-4 text-xs" style={{ color: "var(--text-muted)" }}>
        <span>❓ {questionCount} question{questionCount !== 1 ? "s" : ""}</span>
        <span>⏱ {game.timePerQuestion}s per question</span>
        <span>📅 {new Date(game.createdAt).toLocaleDateString()}</span>
      </div>

      {isCreator && (
        <div className="flex items-center gap-2 mt-3">
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="text-xs px-2 py-1 rounded hover:opacity-80"
            style={{ color: "var(--danger)" }}
          >
            🗑 Delete
          </button>
        </div>
      )}
    </div>
  );
}

function GameDetail({
  game,
  onBack,
  onPlay,
}: {
  game: Game;
  onBack: () => void;
  onPlay: (sessionId: string) => void;
}) {
  const keys = useAppStore((s) => s.keys);
  const [startingSession, setStartingSession] = useState(false);
  const isCreator = game.createdBy === keys?.publicKey;

  const handleStartSession = async () => {
    if (!keys) return;
    setStartingSession(true);
    try {
      const session = await createSession(game.id, keys.publicKey);
      onPlay(session.id);
    } catch (err) {
      console.error("Failed to create session:", err);
    } finally {
      setStartingSession(false);
    }
  };

  // Check for active lobby to join
  const activeLobby = game.sessions?.find((s) => s.status === "lobby");

  const questions = game.questions || [];

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header */}
      <div
        className="flex items-center gap-3 px-6 py-4 border-b"
        style={{ borderColor: "var(--border)" }}
      >
        <button onClick={onBack} className="text-sm hover:opacity-80" style={{ color: "var(--text-muted)" }}>
          ← Back
        </button>
        <div className="flex-1">
          <h2 className="font-semibold" style={{ color: "var(--text-primary)" }}>
            🎮 {game.title}
          </h2>
          {game.description && (
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>{game.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
            ⏱ {game.timePerQuestion}s · ❓ {questions.length} questions
          </span>
          {activeLobby && (
            <button
              onClick={() => onPlay(activeLobby.id)}
              className="px-4 py-2 rounded text-sm font-medium"
              style={{ background: "#22c55e", color: "white" }}
            >
              🎮 Join Game
            </button>
          )}
          {isCreator && !activeLobby && (
            <button
              onClick={handleStartSession}
              disabled={startingSession}
              className="px-4 py-2 rounded text-sm font-medium disabled:opacity-50"
              style={{ background: "var(--accent)", color: "white" }}
            >
              {startingSession ? "Starting..." : "▶ Host Game"}
            </button>
          )}
        </div>
      </div>

      {/* Questions preview */}
      <div className="flex-1 overflow-y-auto p-6">
        <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--text-primary)" }}>Questions</h3>
        <div className="space-y-3 max-w-2xl">
          {questions.map((q, i) => {
            const options = typeof q.options === "string" ? JSON.parse(q.options) : q.options;
            return (
              <div
                key={q.id}
                className="p-4 rounded-lg"
                style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
              >
                <div className="text-sm font-medium mb-2" style={{ color: "var(--text-primary)" }}>
                  {i + 1}. {q.text}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {options.map((opt: string, optIdx: number) => (
                    <div
                      key={optIdx}
                      className="px-3 py-1.5 rounded text-xs"
                      style={{
                        background: optIdx === q.correctIndex ? "#22c55e20" : "var(--bg-tertiary)",
                        color: optIdx === q.correctIndex ? "#22c55e" : "var(--text-muted)",
                        border: optIdx === q.correctIndex ? "1px solid #22c55e" : "1px solid var(--border)",
                      }}
                    >
                      {String.fromCharCode(65 + optIdx)}. {opt}
                      {optIdx === q.correctIndex && " ✓"}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Past sessions */}
        {game.sessions && game.sessions.length > 0 && (
          <div className="mt-8">
            <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--text-primary)" }}>Past Sessions</h3>
            <div className="space-y-2 max-w-2xl">
              {game.sessions.map((session) => (
                <div
                  key={session.id}
                  className="flex items-center justify-between p-3 rounded-lg text-sm"
                  style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
                >
                  <span style={{ color: "var(--text-primary)" }}>Session {session.id.slice(0, 8)}</span>
                  <span
                    className="text-xs px-2 py-0.5 rounded-full capitalize"
                    style={{
                      background: session.status === "finished" ? "var(--bg-tertiary)" : "#22c55e20",
                      color: session.status === "finished" ? "var(--text-muted)" : "#22c55e",
                    }}
                  >
                    {session.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function GamesView() {
  const keys = useAppStore((s) => s.keys);
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  const [filter, setFilter] = useState<"all" | "mine">("all");
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
      const data = await fetchGames(filter === "mine" ? keys?.publicKey : undefined);
      setGames(data);
    } catch (err) {
      console.error("Failed to load games:", err);
    }
    setLoading(false);
  }, [filter, keys?.publicKey]);

  useEffect(() => {
    loadGames();
  }, [loadGames]);

  const handleDelete = async (gameId: string) => {
    if (!keys || !confirm("Delete this game and all its sessions?")) return;
    try {
      await deleteGame(gameId, keys.publicKey);
      setGames((prev) => prev.filter((g) => g.id !== gameId));
    } catch (err) {
      console.error("Failed to delete:", err);
    }
  };

  const handleSelect = async (game: Game) => {
    // Fetch full details
    try {
      const res = await fetch(`/api/games/${game.id}`);
      const full = await res.json();
      setSelectedGame(full);
    } catch {
      setSelectedGame(game);
    }
  };

  const handlePlay = (game: Game, sessionId: string) => {
    setActiveSession({
      gameId: game.id,
      sessionId,
      gameTitle: game.title,
      timePerQuestion: game.timePerQuestion,
      isAdmin: game.createdBy === keys?.publicKey,
      totalQuestions: game.questions?.length || game._count?.questions || 0,
    });
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

  if (selectedGame) {
    return (
      <GameDetail
        game={selectedGame}
        onBack={() => setSelectedGame(null)}
        onPlay={(sessionId) => handlePlay(selectedGame, sessionId)}
      />
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header */}
      <div
        className="flex items-center justify-between px-6 py-4 border-b"
        style={{ borderColor: "var(--border)" }}
      >
        <h1 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
          🎮 Quiz Games
        </h1>
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 rounded text-sm font-medium"
          style={{ background: "var(--accent)", color: "white" }}
        >
          + Create Game
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 px-6 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
        {(["all", "mine"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className="px-3 py-1 rounded-full text-xs font-medium capitalize"
            style={{
              background: filter === f ? "var(--accent)" : "var(--bg-tertiary)",
              color: filter === f ? "white" : "var(--text-muted)",
            }}
          >
            {f === "all" ? "All Games" : "My Games"}
          </button>
        ))}
      </div>

      {/* Game List */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-40" style={{ color: "var(--text-muted)" }}>
            Loading games...
          </div>
        ) : games.length === 0 ? (
          <div className="text-center py-16" style={{ color: "var(--text-muted)" }}>
            <div className="text-6xl mb-4">🎮</div>
            <h2 className="text-xl font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
              No games yet
            </h2>
            <p className="text-sm mb-4">Create a quiz game to test your group&apos;s knowledge</p>
            <button
              onClick={() => setShowCreate(true)}
              className="px-4 py-2 rounded text-sm font-medium"
              style={{ background: "var(--accent)", color: "white" }}
            >
              + Create Game
            </button>
          </div>
        ) : (
          <div className="space-y-3 max-w-2xl">
            {games.map((game) => (
              <GameCard
                key={game.id}
                game={game}
                isCreator={game.createdBy === keys?.publicKey}
                onDelete={() => handleDelete(game.id)}
                onSelect={() => handleSelect(game)}
              />
            ))}
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
