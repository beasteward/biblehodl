"use client";

// Live question screen. Server-authoritative:
// - The countdown is driven by the server deadline (prop), not a local timer.
// - Answers are locked in without revealing correctness; when the question
//   closes, GameSession swaps this out for the QuestionReveal interstitial.

import { useState, useEffect, useCallback } from "react";
import { useAppStore } from "../../lib/store";
import { submitAnswer, type PublicQuestion } from "../../lib/game-service";

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
  isHost,
  advancing,
  onAdvance,
}: Props) {
  const keys = useAppStore((s) => s.keys);
  const signer = useAppStore((s) => s.signer);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // Tick against the server deadline
  useEffect(() => {
    if (!deadline) return;
    const interval = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(interval);
  }, [deadline]);

  const timeLeftMs = deadline ? Math.max(0, deadline - now) : 0;
  const timeLeft = Math.ceil(timeLeftMs / 1000);
  const timeUp = deadline !== null && timeLeftMs <= 0;
  const hasAnswered = selectedIndex !== null || alreadyAnswered;

  const handleAnswer = useCallback(
    async (index: number) => {
      if (!keys || !signer || hasAnswered || timeUp) return;
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
    [keys, signer, hasAnswered, timeUp, gameId, sessionId, question.id]
  );

  const timerPercent = deadline ? (timeLeftMs / (timePerQuestion * 1000)) * 100 : 0;
  const timerColor =
    timeLeft > timePerQuestion * 0.5 ? "#22c55e" : timeLeft > timePerQuestion * 0.25 ? "#f59e0b" : "#ef4444";

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
            {answeredCount}/{totalPlayers || "?"} answered
          </span>
          <div className="text-2xl font-bold font-mono w-12 text-center" style={{ color: timerColor }}>
            {timeLeft}
          </div>
        </div>
      </div>

      {/* Timer bar */}
      <div className="h-1.5 w-full" style={{ background: "var(--bg-tertiary)" }}>
        <div
          className="h-full transition-all ease-linear"
          style={{ width: `${timerPercent}%`, background: timerColor, transitionDuration: "200ms" }}
        />
      </div>

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
              const dimmed = (hasAnswered && !isSelected) || (timeUp && !hasAnswered);
              const bg = optionColors[i % optionColors.length];

              return (
                <button
                  key={i}
                  onClick={() => handleAnswer(i)}
                  disabled={hasAnswered || timeUp || submitting}
                  className="relative p-6 rounded-xl text-white font-bold text-lg transition-all hover:scale-[1.02] active:scale-[0.98] disabled:cursor-default"
                  style={{
                    background: bg,
                    opacity: dimmed ? 0.45 : 1,
                    transform: isSelected ? "scale(1.02)" : undefined,
                    boxShadow: isSelected ? `0 0 0 4px white, 0 0 0 6px ${bg}` : undefined,
                  }}
                >
                  <span className="text-2xl mr-3 opacity-50">{optionIcons[i % optionIcons.length]}</span>
                  {option}
                </button>
              );
            })}
          </div>

          {/* Feedback */}
          {hasAnswered && (
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
          {timeUp && !hasAnswered && (
            <div className="text-center mt-6">
              <div className="text-4xl mb-2">⏰</div>
              <div className="text-xl font-bold" style={{ color: "#f59e0b" }}>
                Time&apos;s up!
              </div>
            </div>
          )}

          {/* Host: skip */}
          {isHost && (
            <div className="text-center mt-8">
              <button
                onClick={onAdvance}
                disabled={advancing}
                className="px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
                style={{ background: "var(--bg-tertiary)", color: "var(--text-muted)", border: "1px solid var(--border)" }}
              >
                {advancing ? "…" : "Skip ⏭"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
