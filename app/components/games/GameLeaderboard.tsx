"use client";

// Final results: podium builds up 3rd → 2nd → 1st, confetti for the winner,
// then the rest of the field stagger in.

import { useEffect } from "react";
import { motion, useReducedMotion } from "framer-motion";

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
// Build-up order: 3rd, 2nd, then the winner
const RISE_DELAYS = [1.1, 0.6, 0.1]; // indexed by place (0 = 1st)
const CONFETTI_AT_MS = 1700;

export default function GameLeaderboard({ leaderboard, gameTitle, onBack }: Props) {
  const reducedMotion = useReducedMotion();
  const sorted = [...leaderboard].sort((a, b) => b.score - a.score);
  const top3 = sorted.slice(0, 3);
  const rest = sorted.slice(3);

  // Confetti when the winner lands
  useEffect(() => {
    if (reducedMotion || sorted.length === 0) return;
    const t = setTimeout(async () => {
      try {
        const confetti = (await import("canvas-confetti")).default;
        confetti({ particleCount: 120, spread: 75, origin: { y: 0.55 }, zIndex: 10_000 });
        setTimeout(() => {
          confetti({ particleCount: 60, angle: 60, spread: 60, origin: { x: 0, y: 0.6 }, zIndex: 10_000 });
          confetti({ particleCount: 60, angle: 120, spread: 60, origin: { x: 1, y: 0.6 }, zIndex: 10_000 });
        }, 350);
      } catch {
        // confetti is decorative; never break the results screen
      }
    }, CONFETTI_AT_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const podium = (place: number, widthClass: string, height: number, nameClass: string, scoreClass: string) => {
    const player = top3[place];
    if (!player) return null;
    const delay = reducedMotion ? 0 : RISE_DELAYS[place];
    return (
      <div className="flex flex-col items-end justify-end" style={{ height: "170px" }}>
        <motion.div
          className="flex flex-col items-center w-full"
          initial={reducedMotion ? false : { opacity: 0, y: 60 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 160, damping: 18, delay }}
        >
          <motion.span
            className={place === 0 ? "text-4xl mb-2" : "text-3xl mb-2"}
            initial={reducedMotion ? false : { scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 12, delay: delay + 0.25 }}
          >
            {podiumIcons[place]}
          </motion.span>
          <div
            className={`${widthClass} rounded-t-lg flex flex-col items-center justify-end p-3`}
            style={{
              background: podiumColors[place] + "30",
              height: `${height}px`,
              border: `2px solid ${podiumColors[place]}`,
            }}
          >
            <div className={`${nameClass} truncate w-full text-center`} style={{ color: "var(--text-primary)" }}>
              {player.displayName}
            </div>
            <div className={scoreClass} style={{ color: podiumColors[place] }}>
              {player.score}
            </div>
          </div>
        </motion.div>
      </div>
    );
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 overflow-y-auto">
      <div className="w-full max-w-lg text-center">
        {/* Header */}
        <motion.div
          className="text-5xl mb-4"
          initial={reducedMotion ? false : { scale: 0, rotate: -15 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 220, damping: 12 }}
        >
          🏆
        </motion.div>
        <h1 className="text-2xl font-bold mb-1" style={{ color: "var(--text-primary)" }}>
          Game Over!
        </h1>
        <p className="text-sm mb-8" style={{ color: "var(--text-muted)" }}>
          {gameTitle}
        </p>

        {/* Podium (2nd — 1st — 3rd, Kahoot layout) */}
        {top3.length > 0 && (
          <div className="flex items-end justify-center gap-4 mb-8">
            {top3.length > 1 && podium(1, "w-24", 100, "text-sm font-semibold", "text-lg font-bold")}
            {podium(0, "w-28", 130, "text-sm font-bold", "text-2xl font-bold")}
            {top3.length > 2 && podium(2, "w-24", 80, "text-sm font-semibold", "text-lg font-bold")}
          </div>
        )}

        {/* Rest of players */}
        {rest.length > 0 && (
          <div className="space-y-2 mb-8">
            {rest.map((player, i) => (
              <motion.div
                key={player.pubkey}
                className="flex items-center justify-between px-4 py-3 rounded-lg"
                style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
                initial={reducedMotion ? false : { opacity: 0, x: -24 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: (reducedMotion ? 0 : 1.6) + i * 0.08 }}
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
              </motion.div>
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
