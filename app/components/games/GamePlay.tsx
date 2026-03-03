"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useAppStore } from "../../lib/store";
import { submitAnswer, advanceQuestion } from "../../lib/game-service";

interface Question {
  id: string;
  text: string;
  options: string[];
  order: number;
}

interface Props {
  gameId: string;
  sessionId: string;
  question: Question;
  questionIndex: number;
  totalQuestions: number;
  timePerQuestion: number;
  isAdmin: boolean;
  onNextQuestion: (data: { question: Question; questionIndex: number; totalQuestions: number }) => void;
  onGameFinished: (leaderboard: { pubkey: string; displayName: string; score: number }[]) => void;
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
  isAdmin,
  onNextQuestion,
  onGameFinished,
}: Props) {
  const keys = useAppStore((s) => s.keys);
  const [timeLeft, setTimeLeft] = useState(timePerQuestion);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [result, setResult] = useState<{ correct: boolean; correctIndex: number; score: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showingResults, setShowingResults] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [answeredCount, setAnsweredCount] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  // SSE for real-time updates
  useEffect(() => {
    const es = new EventSource(`/api/games/${gameId}/sessions/${sessionId}/events`);
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "player-answered") {
        setAnsweredCount((prev) => prev + 1);
      } else if (data.type === "next-question") {
        setTimeLeft(timePerQuestion);
        setSelectedIndex(null);
        setResult(null);
        setShowingResults(false);
        setAnsweredCount(0);
        onNextQuestion({
          question: data.data.question,
          questionIndex: data.data.questionIndex,
          totalQuestions: data.data.totalQuestions,
        });
      } else if (data.type === "game-finished") {
        onGameFinished(data.data.leaderboard);
      }
    };

    return () => es.close();
  }, [gameId, sessionId, timePerQuestion, onNextQuestion, onGameFinished]);

  // Countdown timer
  useEffect(() => {
    setTimeLeft(timePerQuestion);
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          setShowingResults(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [question.id, timePerQuestion]);

  const handleAnswer = useCallback(async (index: number) => {
    if (!keys || selectedIndex !== null || timeLeft === 0) return;
    setSelectedIndex(index);
    setSubmitting(true);

    try {
      const res = await submitAnswer(gameId, sessionId, keys.publicKey, question.id, index);
      setResult({ correct: res.correct, correctIndex: res.correctIndex, score: res.score });
    } catch (err) {
      console.error("Failed to submit answer:", err);
    } finally {
      setSubmitting(false);
    }
  }, [keys, selectedIndex, timeLeft, gameId, sessionId, question.id]);

  const handleNextQuestion = async () => {
    if (!keys) return;
    setAdvancing(true);
    try {
      const res = await advanceQuestion(gameId, sessionId, keys.publicKey);
      if (res.finished) {
        onGameFinished(res.players.map((p: { pubkey: string; displayName: string; score: number }) => ({
          pubkey: p.pubkey,
          displayName: p.displayName,
          score: p.score,
        })));
      }
      // SSE will handle propagation to all players
    } catch (err) {
      console.error("Failed to advance:", err);
    } finally {
      setAdvancing(false);
    }
  };

  const timerPercent = (timeLeft / timePerQuestion) * 100;
  const timerColor = timeLeft > timePerQuestion * 0.5 ? "#22c55e" : timeLeft > timePerQuestion * 0.25 ? "#f59e0b" : "#ef4444";
  const hasAnswered = selectedIndex !== null;
  const timeUp = timeLeft === 0;

  return (
    <div className="flex-1 flex flex-col min-h-0" style={{ background: "var(--bg-primary)" }}>
      {/* Top bar: timer + progress */}
      <div className="px-6 py-3 flex items-center justify-between" style={{ background: "var(--bg-secondary)", borderBottom: "1px solid var(--border)" }}>
        <span className="text-sm" style={{ color: "var(--text-muted)" }}>
          Question {questionIndex + 1}{totalQuestions > 0 ? ` of ${totalQuestions}` : ""}
        </span>
        <div className="flex items-center gap-3">
          <span className="text-sm" style={{ color: "var(--text-muted)" }}>
            {answeredCount} answered
          </span>
          <div
            className="text-2xl font-bold font-mono w-12 text-center"
            style={{ color: timerColor }}
          >
            {timeLeft}
          </div>
        </div>
      </div>

      {/* Timer bar */}
      <div className="h-1.5 w-full" style={{ background: "var(--bg-tertiary)" }}>
        <div
          className="h-full transition-all duration-1000 ease-linear"
          style={{ width: `${timerPercent}%`, background: timerColor }}
        />
      </div>

      {/* Question */}
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        <div className="w-full max-w-3xl">
          {/* Question text */}
          <div
            className="text-center mb-10 px-8 py-6 rounded-xl"
            style={{ background: "var(--bg-secondary)" }}
          >
            <h2 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
              {question.text}
            </h2>
          </div>

          {/* Answer grid */}
          <div className="grid grid-cols-2 gap-4">
            {question.options.map((option, i) => {
              const isSelected = selectedIndex === i;
              const isCorrect = result?.correctIndex === i;
              const isWrong = isSelected && result && !result.correct;
              const revealed = hasAnswered && result;

              let bg = optionColors[i];
              let opacity = "1";

              if (revealed) {
                if (isCorrect) bg = "#22c55e";
                else if (isWrong) bg = "#ef4444";
                else opacity = "0.4";
              } else if (timeUp && !hasAnswered) {
                opacity = "0.4";
              }

              return (
                <button
                  key={i}
                  onClick={() => handleAnswer(i)}
                  disabled={hasAnswered || timeUp || submitting}
                  className="relative p-6 rounded-xl text-white font-bold text-lg transition-all hover:scale-[1.02] active:scale-[0.98] disabled:cursor-default"
                  style={{
                    background: bg,
                    opacity,
                    transform: isSelected ? "scale(1.02)" : undefined,
                    boxShadow: isSelected ? `0 0 0 4px white, 0 0 0 6px ${bg}` : undefined,
                  }}
                >
                  <span className="text-2xl mr-3 opacity-50">{optionIcons[i]}</span>
                  {option}
                  {revealed && isCorrect && <span className="absolute top-2 right-3 text-2xl">✓</span>}
                  {revealed && isWrong && <span className="absolute top-2 right-3 text-2xl">✗</span>}
                </button>
              );
            })}
          </div>

          {/* Result feedback */}
          {result && (
            <div className="text-center mt-6">
              <div className="text-4xl mb-2">{result.correct ? "🎉" : "😔"}</div>
              <div
                className="text-xl font-bold"
                style={{ color: result.correct ? "#22c55e" : "#ef4444" }}
              >
                {result.correct ? `Correct! +${result.score}` : "Wrong!"}
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

          {/* Admin: next question button */}
          {isAdmin && (hasAnswered || timeUp) && (
            <div className="text-center mt-8">
              <button
                onClick={handleNextQuestion}
                disabled={advancing}
                className="px-8 py-3 rounded-lg text-lg font-bold disabled:opacity-50"
                style={{ background: "var(--accent)", color: "white" }}
              >
                {advancing ? "Loading..." : "Next Question →"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
