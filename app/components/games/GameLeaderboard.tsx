"use client";

interface PlayerScore {
  pubkey: string;
  displayName: string;
  score: number;
}

interface Props {
  leaderboard: PlayerScore[];
  gameTitle: string;
  onBack: () => void;
}

const podiumColors = ["#f59e0b", "#9ca3af", "#cd7f32"];
const podiumIcons = ["🥇", "🥈", "🥉"];

export default function GameLeaderboard({ leaderboard, gameTitle, onBack }: Props) {
  const sorted = [...leaderboard].sort((a, b) => b.score - a.score);
  const top3 = sorted.slice(0, 3);
  const rest = sorted.slice(3);

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 overflow-y-auto">
      <div className="w-full max-w-lg text-center">
        {/* Header */}
        <div className="text-5xl mb-4">🏆</div>
        <h1 className="text-2xl font-bold mb-1" style={{ color: "var(--text-primary)" }}>
          Game Over!
        </h1>
        <p className="text-sm mb-8" style={{ color: "var(--text-muted)" }}>
          {gameTitle}
        </p>

        {/* Podium */}
        {top3.length > 0 && (
          <div className="flex items-end justify-center gap-4 mb-8">
            {/* 2nd place */}
            {top3.length > 1 && (
              <div className="flex flex-col items-center">
                <span className="text-3xl mb-2">{podiumIcons[1]}</span>
                <div
                  className="w-24 rounded-t-lg flex flex-col items-center justify-end p-3"
                  style={{ background: podiumColors[1] + "30", height: "100px", border: `2px solid ${podiumColors[1]}` }}
                >
                  <div className="text-sm font-semibold truncate w-full" style={{ color: "var(--text-primary)" }}>
                    {top3[1].displayName}
                  </div>
                  <div className="text-lg font-bold" style={{ color: podiumColors[1] }}>
                    {top3[1].score}
                  </div>
                </div>
              </div>
            )}

            {/* 1st place */}
            {top3.length > 0 && (
              <div className="flex flex-col items-center">
                <span className="text-4xl mb-2">{podiumIcons[0]}</span>
                <div
                  className="w-28 rounded-t-lg flex flex-col items-center justify-end p-3"
                  style={{ background: podiumColors[0] + "30", height: "130px", border: `2px solid ${podiumColors[0]}` }}
                >
                  <div className="text-sm font-bold truncate w-full" style={{ color: "var(--text-primary)" }}>
                    {top3[0].displayName}
                  </div>
                  <div className="text-2xl font-bold" style={{ color: podiumColors[0] }}>
                    {top3[0].score}
                  </div>
                </div>
              </div>
            )}

            {/* 3rd place */}
            {top3.length > 2 && (
              <div className="flex flex-col items-center">
                <span className="text-3xl mb-2">{podiumIcons[2]}</span>
                <div
                  className="w-24 rounded-t-lg flex flex-col items-center justify-end p-3"
                  style={{ background: podiumColors[2] + "30", height: "80px", border: `2px solid ${podiumColors[2]}` }}
                >
                  <div className="text-sm font-semibold truncate w-full" style={{ color: "var(--text-primary)" }}>
                    {top3[2].displayName}
                  </div>
                  <div className="text-lg font-bold" style={{ color: podiumColors[2] }}>
                    {top3[2].score}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Rest of players */}
        {rest.length > 0 && (
          <div className="space-y-2 mb-8">
            {rest.map((player, i) => (
              <div
                key={player.pubkey}
                className="flex items-center justify-between px-4 py-3 rounded-lg"
                style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
              >
                <div className="flex items-center gap-3">
                  <span className="text-sm font-mono w-6" style={{ color: "var(--text-muted)" }}>
                    {i + 4}
                  </span>
                  <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                    {player.displayName}
                  </span>
                </div>
                <span className="text-sm font-bold" style={{ color: "var(--text-muted)" }}>
                  {player.score}
                </span>
              </div>
            ))}
          </div>
        )}

        {sorted.length === 0 && (
          <p className="text-sm mb-8" style={{ color: "var(--text-muted)" }}>
            No players scored in this game.
          </p>
        )}

        {/* Back button */}
        <button
          onClick={onBack}
          className="px-6 py-3 rounded-lg text-sm font-medium"
          style={{ background: "var(--accent)", color: "white" }}
        >
          ← Back to Games
        </button>
      </div>
    </div>
  );
}
