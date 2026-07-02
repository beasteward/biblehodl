"use client";

// Full-screen two-beat interstitial shown to ALL players when a question
// closes (Kahoot-style):
//   Beat 1 — "histogram": answer distribution as growing columns, correct
//            answer highlighted, personal result banner.
//   Beat 2 — "standings": live scoreboard with rank deltas, points gained,
//            and streaks; rows slide to their new positions via CSS.
// Beats auto-rotate locally (the question-closed event lands on every client
// at ~the same time, so the beats stay visually in sync).

import { useState, useEffect } from "react";
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
  const [grown, setGrown] = useState(false);

  const myResult = myPubkey ? reveal.leaderboard.find((p) => p.pubkey === myPubkey) : undefined;
  const totalAnswers = reveal.distribution.reduce((a, b) => a + b, 0);
  const maxCount = Math.max(1, ...reveal.distribution);

  // Grow histogram bars just after mount
  useEffect(() => {
    const t = setTimeout(() => setGrown(true), 60);
    return () => clearTimeout(t);
  }, []);

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
          {beat === "histogram" ? (
            <div key="histogram" className="animate-[fadeIn_.3s_ease]">
              {/* Question */}
              <div className="text-center mb-8 px-8 py-5 rounded-xl" style={{ background: "var(--bg-secondary)" }}>
                <h2 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>
                  {question.text}
                </h2>
              </div>

              {/* Histogram */}
              <div
                className="flex items-end justify-center gap-6 mb-8"
                style={{ height: "220px" }}
              >
                {question.options.map((option, i) => {
                  const count = reveal.distribution[i] || 0;
                  const isCorrect = reveal.correctIndex === i;
                  const height = grown ? Math.max(0.06, count / maxCount) : 0.06;
                  const color = optionColors[i % optionColors.length];
                  return (
                    <div key={i} className="flex flex-col items-center justify-end h-full" style={{ width: "110px" }}>
                      <div
                        className="text-lg font-bold mb-1"
                        style={{ color: isCorrect ? "#22c55e" : "var(--text-primary)" }}
                      >
                        {count}
                        {isCorrect && " ✓"}
                      </div>
                      <div
                        className="w-full rounded-t-lg transition-all duration-700 ease-out"
                        style={{
                          height: `${height * 100}%`,
                          background: color,
                          opacity: isCorrect ? 1 : 0.35,
                          boxShadow: isCorrect ? `0 0 16px ${color}80` : undefined,
                        }}
                      />
                    </div>
                  );
                })}
              </div>

              {/* Option labels */}
              <div className="grid gap-2 mb-6" style={{ gridTemplateColumns: `repeat(${question.options.length}, 1fr)` }}>
                {question.options.map((option, i) => {
                  const isCorrect = reveal.correctIndex === i;
                  const color = optionColors[i % optionColors.length];
                  return (
                    <div
                      key={i}
                      className="px-3 py-2 rounded-lg text-center text-sm font-semibold text-white"
                      style={{ background: color, opacity: isCorrect ? 1 : 0.35 }}
                    >
                      <span className="mr-1 opacity-60">{optionIcons[i % optionIcons.length]}</span>
                      {option}
                    </div>
                  );
                })}
              </div>

              {/* My result banner */}
              {myResult && (
                <div className="text-center">
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
                        myResult.correct === true ? "#22c55e" : myResult.correct === false ? "#ef4444" : "var(--border)"
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
                </div>
              )}
            </div>
          ) : (
            <div key="standings" className="animate-[fadeIn_.3s_ease]">
              <div className="text-center mb-6">
                <div className="text-4xl mb-2">📊</div>
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
            </div>
          )}

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

function StandingsRow({
  entry,
  isMe,
  index,
}: {
  entry: SessionLeaderboardEntry;
  isMe: boolean;
  index: number;
}) {
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setEntered(true), 80 * index);
    return () => clearTimeout(t);
  }, [index]);

  const delta = entry.prevRank != null ? entry.prevRank - entry.rank : 0;
  const medal = entry.rank === 1 ? "🥇" : entry.rank === 2 ? "🥈" : entry.rank === 3 ? "🥉" : null;

  return (
    <div
      className="flex items-center justify-between px-4 py-3 rounded-xl transition-all duration-500 ease-out"
      style={{
        background: isMe ? "var(--bg-tertiary)" : "var(--bg-secondary)",
        border: `1px solid ${isMe ? "var(--accent)" : "var(--border)"}`,
        opacity: entered ? 1 : 0,
        transform: entered ? "translateX(0)" : "translateX(-24px)",
      }}
    >
      <div className="flex items-center gap-3 min-w-0">
        <span className="font-mono text-sm w-7 text-center" style={{ color: "var(--text-muted)" }}>
          {medal || entry.rank}
        </span>
        <span className="font-semibold truncate" style={{ color: "var(--text-primary)" }}>
          {entry.displayName}
          {isMe && <span className="text-xs ml-1.5" style={{ color: "var(--text-muted)" }}>(you)</span>}
          {entry.streak > 1 && " 🔥"}
        </span>
        {delta !== 0 && (
          <span className="text-xs font-bold" style={{ color: delta > 0 ? "#22c55e" : "#ef4444" }}>
            {delta > 0 ? `▲${delta}` : `▼${Math.abs(delta)}`}
          </span>
        )}
      </div>
      <div className="flex items-center gap-3">
        {entry.gained > 0 && (
          <span className="text-sm font-semibold" style={{ color: "#22c55e" }}>
            +{entry.gained}
          </span>
        )}
        <span className="text-lg font-bold tabular-nums" style={{ color: "var(--text-primary)" }}>
          {entry.score}
        </span>
      </div>
    </div>
  );
}
