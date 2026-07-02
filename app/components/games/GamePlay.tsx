"use client";

// Question + reveal screens. Server-authoritative:
// - The countdown is driven by the server deadline (prop), not a local timer.
// - Answers are locked in without revealing correctness; the reveal comes for
//   everyone at once via the "question-closed" event (reveal prop).

import { useState, useEffect, useCallback } from "react";
import { useAppStore } from "../../lib/store";
import { submitAnswer, type PublicQuestion } from "../../lib/game-service";
import type { RevealData } from "./GameSession";

interface Props {
  gameId: string;
  sessionId: string;
  question: PublicQuestion;
  questionIndex: number;
  totalQuestions: number;
  timePerQuestion: number;
  deadline: number | null;
  answeredCount: number;
  totalPlayers: number;
  alreadyAnswered: boolean;
  reveal: RevealData | null;
  isHost: boolean;
  advancing: boolean;
  onAdvance: () => void;
}

const optionColors = ["#e74c3c", "#3498db", "#f39c12", "#2ecc71", "#9b59b6", "#1abc9c"];
const optionIcons = ["▲", "◆", "●", "■", "★", "♦"];

export default function GamePlay({
  gameId,
  sessionId,
  question,
  questionIndex,
  totalQuestions,
  timePerQuestion,
  deadline,
  answeredCount,
  totalPlayers,
  alreadyAnswered,
  reveal,
  isHost,
  advancing,
  onAdvance,
}: Props) {
  const keys = useAppStore((s) => s.keys);
  const signer = useAppStore((s) => s.signer);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const revealed = reveal !== null;

  // Tick against the server deadline
  useEffect(() => {
    if (revealed || !deadline) return;
    const interval = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(interval);
  }, [revealed, deadline]);

  const timeLeftMs = deadline ? Math.max(0, deadline - now) : 0;
  const timeLeft = Math.ceil(timeLeftMs / 1000);
  const timeUp = !revealed && deadline !== null && timeLeftMs <= 0;
  const hasAnswered = selectedIndex !== null || alreadyAnswered;

  const handleAnswer = useCallback(
    async (index: number) => {
      if (!keys || !signer || hasAnswered || timeUp || revealed) return;
      setSelectedIndex(index);
      setSubmitting(true);
      try {
        await submitAnswer(gameId, sessionId, signer, question.id, index);
      } catch (err) {
        console.error("Failed to submit answer:", err);
      } finally {
        setSubmitting(false);
      }
    },
    [keys, signer, hasAnswered, timeUp, revealed, gameId, sessionId, question.id]
  );

  const timerPercent = deadline ? (timeLeftMs / (timePerQuestion * 1000)) * 100 : 0;
  const timerColor =
    timeLeft > timePerQuestion * 0.5 ? "#22c55e" : timeLeft > timePerQuestion * 0.25 ? "#f59e0b" : "#ef4444";

  const myPubkey = keys?.publicKey;
  const myResult = revealed && myPubkey ? reveal.leaderboard.find((p) => p.pubkey === myPubkey) : undefined;
  const totalAnswers = revealed ? reveal.distribution.reduce((a, b) => a + b, 0) : 0;

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto" style={{ background: "var(--bg-primary)" }}>
      {/* Top bar: progress + answered + timer */}
      <div
        className="px-6 py-3 flex items-center justify-between"
        style={{ background: "var(--bg-secondary)", borderBottom: "1px solid var(--border)" }}
      >
        <span className="text-sm" style={{ color: "var(--text-muted)" }}>
          Question {questionIndex + 1}
          {totalQuestions > 0 ? ` of ${totalQuestions}` : ""}
        </span>
        <div className="flex items-center gap-3">
          <span className="text-sm" style={{ color: "var(--text-muted)" }}>
            {revealed ? `${totalAnswers} answered` : `${answeredCount}/${totalPlayers || "?"} answered`}
          </span>
          {!revealed && (
            <div className="text-2xl font-bold font-mono w-12 text-center" style={{ color: timerColor }}>
              {timeLeft}
            </div>
          )}
        </div>
      </div>

      {/* Timer bar */}
      {!revealed && (
        <div className="h-1.5 w-full" style={{ background: "var(--bg-tertiary)" }}>
          <div
            className="h-full transition-all ease-linear"
            style={{ width: `${timerPercent}%`, background: timerColor, transitionDuration: "200ms" }}
          />
        </div>
      )}

      <div className="flex-1 flex flex-col items-center justify-center p-8">
        <div className="w-full max-w-3xl">
          {/* Question text */}
          <div className="text-center mb-8 px-8 py-6 rounded-xl" style={{ background: "var(--bg-secondary)" }}>
            <h2 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
              {question.text}
            </h2>
          </div>

          {/* Answer grid */}
          <div className="grid grid-cols-2 gap-4">
            {question.options.map((option, i) => {
              const isSelected = selectedIndex === i;
              const isCorrect = revealed && reveal.correctIndex === i;
              const isWrong = revealed && isSelected && reveal.correctIndex !== i;

              let bg = optionColors[i % optionColors.length];
              let opacity = "1";
              if (revealed) {
                if (isCorrect) bg = "#22c55e";
                else if (isWrong) bg = "#ef4444";
                else opacity = "0.35";
              } else if ((hasAnswered && !isSelected) || (timeUp && !hasAnswered)) {
                opacity = "0.45";
              }

              const share = revealed && totalAnswers > 0 ? (reveal.distribution[i] || 0) / totalAnswers : 0;

              return (
                <button
                  key={i}
                  onClick={() => handleAnswer(i)}
                  disabled={hasAnswered || timeUp || revealed || submitting}
                  className="relative p-6 rounded-xl text-white font-bold text-lg transition-all hover:scale-[1.02] active:scale-[0.98] disabled:cursor-default overflow-hidden"
                  style={{
                    background: bg,
                    opacity,
                    transform: isSelected && !revealed ? "scale(1.02)" : undefined,
                    boxShadow: isSelected ? `0 0 0 4px white, 0 0 0 6px ${bg}` : undefined,
                  }}
                >
                  <span className="text-2xl mr-3 opacity-50">{optionIcons[i % optionIcons.length]}</span>
                  {option}
                  {revealed && (
                    <span className="absolute top-2 right-3 text-sm font-semibold opacity-90">
                      {reveal.distribution[i] || 0} {isCorrect && "✓"}
                    </span>
                  )}
                  {/* Distribution bar */}
                  {revealed && (
                    <span
                      className="absolute bottom-0 left-0 h-1.5 rounded-full transition-all duration-700"
                      style={{ width: `${Math.round(share * 100)}%`, background: "rgba(255,255,255,0.9)" }}
                    />
                  )}
                </button>
              );
            })}
          </div>

          {/* Pre-reveal feedback */}
          {!revealed && hasAnswered && (
            <div className="text-center mt-6">
              <div className="text-4xl mb-2">🔒</div>
              <div className="text-xl font-bold" style={{ color: "var(--accent)" }}>
                Answer locked in!
              </div>
              <div className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
                Waiting for the reveal…
              </div>
            </div>
          )}
          {!revealed && timeUp && !hasAnswered && (
            <div className="text-center mt-6">
              <div className="text-4xl mb-2">⏰</div>
              <div className="text-xl font-bold" style={{ color: "#f59e0b" }}>
                Time&apos;s up!
              </div>
            </div>
          )}

          {/* Reveal: my result */}
          {revealed && myResult && (
            <div className="text-center mt-6">
              <div className="text-4xl mb-2">
                {myResult.correct === true ? "🎉" : myResult.correct === false ? "😔" : "⏰"}
              </div>
              <div
                className="text-xl font-bold"
                style={{
                  color:
                    myResult.correct === true ? "#22c55e" : myResult.correct === false ? "#ef4444" : "#f59e0b",
                }}
              >
                {myResult.correct === true
                  ? `Correct! +${myResult.gained}`
                  : myResult.correct === false
                    ? "Wrong!"
                    : "No answer"}
                {myResult.correct === true && myResult.streak > 1 && (
                  <span className="ml-2">🔥 {myResult.streak} streak</span>
                )}
              </div>
            </div>
          )}

          {/* Reveal: standings (top 5) */}
          {revealed && reveal.leaderboard.length > 0 && (
            <div className="mt-8 max-w-md mx-auto">
              <h3
                className="text-xs font-semibold uppercase tracking-wide mb-2 text-center"
                style={{ color: "var(--text-muted)" }}
              >
                Standings
              </h3>
              <div className="space-y-1.5">
                {reveal.leaderboard.slice(0, 5).map((p) => {
                  const delta = p.prevRank != null ? p.prevRank - p.rank : 0;
                  const isMe = p.pubkey === myPubkey;
                  return (
                    <div
                      key={p.pubkey}
                      className="flex items-center justify-between px-3 py-2 rounded-lg text-sm"
                      style={{
                        background: isMe ? "var(--bg-tertiary)" : "var(--bg-secondary)",
                        border: `1px solid ${isMe ? "var(--accent)" : "var(--border)"}`,
                      }}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-mono w-5 text-center" style={{ color: "var(--text-muted)" }}>
                          {p.rank}
                        </span>
                        <span
                          className="font-medium truncate"
                          style={{ color: "var(--text-primary)" }}
                        >
                          {p.displayName}
                          {p.streak > 1 && " 🔥"}
                        </span>
                        {delta !== 0 && (
                          <span
                            className="text-xs font-semibold"
                            style={{ color: delta > 0 ? "#22c55e" : "#ef4444" }}
                          >
                            {delta > 0 ? `▲${delta}` : `▼${Math.abs(delta)}`}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {p.gained > 0 && (
                          <span className="text-xs font-semibold" style={{ color: "#22c55e" }}>
                            +{p.gained}
                          </span>
                        )}
                        <span className="font-bold" style={{ color: "var(--text-primary)" }}>
                          {p.score}
                        </span>
                      </div>
                    </div>
                  );
                })}
                {myResult && myResult.rank > 5 && (
                  <div
                    className="flex items-center justify-between px-3 py-2 rounded-lg text-sm"
                    style={{ background: "var(--bg-tertiary)", border: "1px solid var(--accent)" }}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono w-5 text-center" style={{ color: "var(--text-muted)" }}>
                        {myResult.rank}
                      </span>
                      <span className="font-medium" style={{ color: "var(--text-primary)" }}>
                        You
                      </span>
                    </div>
                    <span className="font-bold" style={{ color: "var(--text-primary)" }}>
                      {myResult.score}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Host controls */}
          {isHost && (
            <div className="text-center mt-8">
              {revealed ? (
                <button
                  onClick={onAdvance}
                  disabled={advancing}
                  className="px-8 py-3 rounded-lg text-lg font-bold disabled:opacity-50"
                  style={{ background: "var(--accent)", color: "white" }}
                >
                  {advancing ? "Loading..." : reveal.isLast ? "🏁 Finish Game" : "Next Question →"}
                </button>
              ) : (
                <button
                  onClick={onAdvance}
                  disabled={advancing}
                  className="px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
                  style={{ background: "var(--bg-tertiary)", color: "var(--text-muted)", border: "1px solid var(--border)" }}
                >
                  {advancing ? "…" : "Skip ⏭"}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
