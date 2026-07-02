"use client";

// Full-screen two-beat interstitial shown to ALL players when a question
// closes (Kahoot-style):
//   Beat 1 — "histogram": answer distribution as spring-growing columns,
//            correct answer highlighted, personal result banner.
//   Beat 2 — "standings": live scoreboard with rank deltas, points gained
//            counting up, and streaks; rows stagger in.
// Beats auto-rotate locally (the question-closed event lands on every client
// at ~the same time, so the beats stay visually in sync).

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import type { PublicQuestion, SessionLeaderboardEntry } from "../../lib/game-service";
import type { RevealData } from "./GameSession";

const optionColors = ["#e74c3c", "#3498db", "#f39c12", "#2ecc71", "#9b59b6", "#1abc9c"];
const optionIcons = ["▲", "◆", "●", "■", "★", "♦"];

const HISTOGRAM_BEAT_MS = 4500;

interface Props {
  question: PublicQuestion;
  questionIndex: number;
  totalQuestions: number;
  reveal: RevealData;
  myPubkey: string | undefined;
  isHost: boolean;
  advancing: boolean;
  autoAdvance: boolean;
  onToggleAutoAdvance: (v: boolean) => void;
  onAdvance: () => void;
}

export default function QuestionReveal({
  question,
  questionIndex,
  totalQuestions,
  reveal,
  myPubkey,
  isHost,
  advancing,
  autoAdvance,
  onToggleAutoAdvance,
  onAdvance,
}: Props) {
  const [beat, setBeat] = useState<"histogram" | "standings">("histogram");
  const reducedMotion = useReducedMotion();

  const myResult = myPubkey ? reveal.leaderboard.find((p) => p.pubkey === myPubkey) : undefined;
  const totalAnswers = reveal.distribution.reduce((a, b) => a + b, 0);
  const maxCount = Math.max(1, ...reveal.distribution);

  // Rotate to standings after the histogram beat
  useEffect(() => {
    const t = setTimeout(() => setBeat("standings"), HISTOGRAM_BEAT_MS);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto" style={{ background: "var(--bg-primary)" }}>
      {/* Top bar */}
      <div
        className="px-6 py-3 flex items-center justify-between"
        style={{ background: "var(--bg-secondary)", borderBottom: "1px solid var(--border)" }}
      >
        <span className="text-sm" style={{ color: "var(--text-muted)" }}>
          Question {questionIndex + 1}
          {totalQuestions > 0 ? ` of ${totalQuestions}` : ""} · Results
        </span>
        <span className="text-sm" style={{ color: "var(--text-muted)" }}>
          {totalAnswers} answered
        </span>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-3xl">
          <AnimatePresence mode="wait">
            {beat === "histogram" ? (
              <motion.div
                key="histogram"
                initial={reducedMotion ? false : { opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reducedMotion ? undefined : { opacity: 0, y: -12 }}
                transition={{ duration: 0.25 }}
              >
                {/* Question */}
                <div className="text-center mb-8 px-8 py-5 rounded-xl" style={{ background: "var(--bg-secondary)" }}>
                  <h2 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>
                    {question.text}
                  </h2>
                  {question.imageUrl && (
                    <div className="flex justify-center mt-4">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={question.imageUrl}
                        alt="Question"
                        className="rounded-lg object-contain"
                        style={{ maxHeight: "140px", maxWidth: "100%" }}
                      />
                    </div>
                  )}
                </div>

                {/* Histogram */}
                <div className="flex items-end justify-center gap-6 mb-8" style={{ height: "220px" }}>
                  {question.options.map((option, i) => {
                    const count = reveal.distribution[i] || 0;
                    const isCorrect = reveal.correctIndex === i;
                    const heightPct = Math.max(6, (count / maxCount) * 100);
                    const color = optionColors[i % optionColors.length];
                    return (
                      <div
                        key={i}
                        className="flex flex-col items-center justify-end h-full"
                        style={{ width: "110px" }}
                      >
                        <motion.div
                          className="text-lg font-bold mb-1"
                          style={{ color: isCorrect ? "#22c55e" : "var(--text-primary)" }}
                          initial={reducedMotion ? false : { opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: 0.5 + i * 0.08 }}
                        >
                          {count}
                          {isCorrect && " ✓"}
                        </motion.div>
                        <motion.div
                          className="w-full rounded-t-lg"
                          style={{
                            background: color,
                            opacity: isCorrect ? 1 : 0.35,
                            boxShadow: isCorrect ? `0 0 16px ${color}80` : undefined,
                          }}
                          initial={reducedMotion ? { height: `${heightPct}%` } : { height: "6%" }}
                          animate={{ height: `${heightPct}%` }}
                          transition={{
                            type: "spring",
                            stiffness: 120,
                            damping: 16,
                            delay: 0.15 + i * 0.08,
                          }}
                        />
                      </div>
                    );
                  })}
                </div>

                {/* Option labels */}
                <div
                  className="grid gap-2 mb-6"
                  style={{ gridTemplateColumns: `repeat(${question.options.length}, 1fr)` }}
                >
                  {question.options.map((option, i) => {
                    const isCorrect = reveal.correctIndex === i;
                    const color = optionColors[i % optionColors.length];
                    return (
                      <motion.div
                        key={i}
                        className="px-3 py-2 rounded-lg text-center text-sm font-semibold text-white"
                        style={{ background: color, opacity: isCorrect ? 1 : 0.35 }}
                        initial={reducedMotion ? false : { opacity: 0, y: 8 }}
                        animate={{ opacity: isCorrect ? 1 : 0.35, y: 0 }}
                        transition={{ delay: 0.3 + i * 0.06 }}
                      >
                        <span className="mr-1 opacity-60">{optionIcons[i % optionIcons.length]}</span>
                        {option}
                      </motion.div>
                    );
                  })}
                </div>

                {/* My result banner */}
                {myResult && (
                  <motion.div
                    className="text-center"
                    initial={reducedMotion ? false : { opacity: 0, scale: 0.7 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ type: "spring", stiffness: 260, damping: 18, delay: 0.9 }}
                  >
                    <div
                      className="inline-block px-6 py-3 rounded-xl text-lg font-bold"
                      style={{
                        background:
                          myResult.correct === true
                            ? "#22c55e20"
                            : myResult.correct === false
                              ? "#ef444420"
                              : "var(--bg-tertiary)",
                        color:
                          myResult.correct === true
                            ? "#22c55e"
                            : myResult.correct === false
                              ? "#ef4444"
                              : "#f59e0b",
                        border: `1px solid ${
                          myResult.correct === true
                            ? "#22c55e"
                            : myResult.correct === false
                              ? "#ef4444"
                              : "var(--border)"
                        }`,
                      }}
                    >
                      {myResult.correct === true
                        ? `🎉 Correct! +${myResult.gained}`
                        : myResult.correct === false
                          ? "😔 Wrong!"
                          : "⏰ No answer"}
                      {myResult.correct === true && myResult.streak > 1 && (
                        <span className="ml-2">🔥 ×{myResult.streak}</span>
                      )}
                    </div>
                  </motion.div>
                )}
              </motion.div>
            ) : (
              <motion.div
                key="standings"
                initial={reducedMotion ? false : { opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reducedMotion ? undefined : { opacity: 0, y: -12 }}
                transition={{ duration: 0.25 }}
              >
                <div className="text-center mb-6">
                  <motion.div
                    className="text-4xl mb-2"
                    initial={reducedMotion ? false : { scale: 0, rotate: -20 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: "spring", stiffness: 260, damping: 14 }}
                  >
                    📊
                  </motion.div>
                  <h2 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
                    Scoreboard
                  </h2>
                </div>

                <div className="max-w-md mx-auto space-y-2">
                  {reveal.leaderboard.slice(0, 5).map((p, i) => (
                    <StandingsRow key={p.pubkey} entry={p} isMe={p.pubkey === myPubkey} index={i} />
                  ))}
                  {myResult && myResult.rank > 5 && (
                    <>
                      <div className="text-center text-xs py-1" style={{ color: "var(--text-muted)" }}>
                        ⋯
                      </div>
                      <StandingsRow entry={myResult} isMe index={5} />
                    </>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Beat dots */}
          <div className="flex items-center justify-center gap-2 mt-8">
            {(["histogram", "standings"] as const).map((b) => (
              <button
                key={b}
                onClick={() => setBeat(b)}
                className="w-2 h-2 rounded-full transition-all"
                style={{ background: beat === b ? "var(--accent)" : "var(--bg-tertiary)" }}
                aria-label={b}
              />
            ))}
          </div>

          {/* Host controls */}
          {isHost && (
            <div className="flex items-center justify-center gap-4 mt-6">
              <label
                className="flex items-center gap-2 text-xs cursor-pointer select-none"
                style={{ color: "var(--text-muted)" }}
              >
                <input
                  type="checkbox"
                  checked={autoAdvance}
                  onChange={(e) => onToggleAutoAdvance(e.target.checked)}
                  className="accent-current"
                />
                Auto-advance
              </label>
              <button
                onClick={onAdvance}
                disabled={advancing}
                className="px-8 py-3 rounded-lg text-lg font-bold disabled:opacity-50"
                style={{ background: "var(--accent)", color: "white" }}
              >
                {advancing ? "Loading..." : reveal.isLast ? "🏁 Finish Game" : "Next Question →"}
              </button>
            </div>
          )}
          {!isHost && (
            <p className="text-center text-xs mt-6" style={{ color: "var(--text-muted)" }}>
              Waiting for the host…
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Scoreboard row: stagger-in + score count-up ───

function StandingsRow({
  entry,
  isMe,
  index,
}: {
  entry: SessionLeaderboardEntry;
  isMe: boolean;
  index: number;
}) {
  const reducedMotion = useReducedMotion();
  const delta = entry.prevRank != null ? entry.prevRank - entry.rank : 0;
  const medal = entry.rank === 1 ? "🥇" : entry.rank === 2 ? "🥈" : entry.rank === 3 ? "🥉" : null;
  const displayScore = useCountUp(
    entry.score,
    Math.max(0, entry.score - entry.gained),
    reducedMotion ? 0 : 900,
    200 + index * 90
  );

  return (
    <motion.div
      layout
      className="flex items-center justify-between px-4 py-3 rounded-xl"
      style={{
        background: isMe ? "var(--bg-tertiary)" : "var(--bg-secondary)",
        border: `1px solid ${isMe ? "var(--accent)" : "var(--border)"}`,
      }}
      initial={reducedMotion ? false : { opacity: 0, x: -32 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 24, delay: index * 0.09 }}
    >
      <div className="flex items-center gap-3 min-w-0">
        <span className="font-mono text-sm w-7 text-center" style={{ color: "var(--text-muted)" }}>
          {medal || entry.rank}
        </span>
        <span className="font-semibold truncate" style={{ color: "var(--text-primary)" }}>
          {entry.displayName}
          {isMe && (
            <span className="text-xs ml-1.5" style={{ color: "var(--text-muted)" }}>
              (you)
            </span>
          )}
          {entry.streak > 1 && " 🔥"}
        </span>
        {delta !== 0 && (
          <motion.span
            className="text-xs font-bold"
            style={{ color: delta > 0 ? "#22c55e" : "#ef4444" }}
            initial={reducedMotion ? false : { opacity: 0, y: delta > 0 ? 8 : -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 + index * 0.09 }}
          >
            {delta > 0 ? `▲${delta}` : `▼${Math.abs(delta)}`}
          </motion.span>
        )}
      </div>
      <div className="flex items-center gap-3">
        {entry.gained > 0 && (
          <motion.span
            className="text-sm font-semibold"
            style={{ color: "#22c55e" }}
            initial={reducedMotion ? false : { opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 16, delay: 0.3 + index * 0.09 }}
          >
            +{entry.gained}
          </motion.span>
        )}
        <span className="text-lg font-bold tabular-nums" style={{ color: "var(--text-primary)" }}>
          {displayScore}
        </span>
      </div>
    </motion.div>
  );
}

/** Animate a number from `from` to `to` over `durationMs`, starting after `delayMs`. */
function useCountUp(to: number, from: number, durationMs: number, delayMs = 0): number {
  const [value, setValue] = useState(durationMs > 0 ? from : to);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (durationMs <= 0 || from === to) {
      setValue(to);
      return;
    }
    let start: number | null = null;
    const timer = setTimeout(() => {
      const tick = (t: number) => {
        if (start === null) start = t;
        const p = Math.min(1, (t - start) / durationMs);
        const eased = 1 - Math.pow(1 - p, 3);
        setValue(Math.round(from + (to - from) * eased));
        if (p < 1) rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    }, delayMs);
    return () => {
      clearTimeout(timer);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [to, from, durationMs, delayMs]);

  return value;
}
