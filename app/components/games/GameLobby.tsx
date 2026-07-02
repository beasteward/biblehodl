"use client";

// Presentational lobby: player list + host start button.
// Join/SSE lifecycle is owned by GameSession.

interface LobbyPlayer {
  pubkey: string;
  displayName: string;
}

interface Props {
  gameTitle: string;
  sessionId: string;
  players: LobbyPlayer[];
  isHost: boolean;
  starting: boolean;
  onStart: () => void;
  onBack: () => void;
}

const playerColors = ["#e74c3c", "#3498db", "#f39c12", "#2ecc71", "#9b59b6", "#1abc9c", "#e67e22", "#e84393"];

export default function GameLobby({ gameTitle, sessionId, players, isHost, starting, onStart, onBack }: Props) {
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
          {isHost && (
            <button
              onClick={onStart}
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
