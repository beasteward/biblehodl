"use client";

import { useState, useCallback } from "react";
import { useAppStore } from "../../lib/store";
import GameLobby from "./GameLobby";
import GamePlay from "./GamePlay";
import GameLeaderboard from "./GameLeaderboard";

interface Question {
  id: string;
  text: string;
  options: string[];
  order: number;
}

interface Props {
  gameId: string;
  sessionId: string;
  gameTitle: string;
  timePerQuestion: number;
  isAdmin: boolean;
  totalQuestions: number;
  onExit: () => void;
}

type Phase = "lobby" | "playing" | "finished";

export default function GameSessionView({
  gameId,
  sessionId,
  gameTitle,
  timePerQuestion,
  isAdmin,
  totalQuestions: initialTotal,
  onExit,
}: Props) {
  const [phase, setPhase] = useState<Phase>("lobby");
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [totalQuestions, setTotalQuestions] = useState(initialTotal);
  const [leaderboard, setLeaderboard] = useState<{ pubkey: string; displayName: string; score: number }[]>([]);

  const handleGameStart = useCallback((data: { question: unknown; questionIndex: number; totalQuestions: number }) => {
    setCurrentQuestion(data.question as Question);
    setQuestionIndex(data.questionIndex);
    if (data.totalQuestions > 0) setTotalQuestions(data.totalQuestions);
    setPhase("playing");
  }, []);

  const handleNextQuestion = useCallback((data: { question: Question; questionIndex: number; totalQuestions: number }) => {
    setCurrentQuestion(data.question);
    setQuestionIndex(data.questionIndex);
    if (data.totalQuestions > 0) setTotalQuestions(data.totalQuestions);
  }, []);

  const handleGameFinished = useCallback((lb: { pubkey: string; displayName: string; score: number }[]) => {
    setLeaderboard(lb);
    setPhase("finished");
  }, []);

  if (phase === "lobby") {
    return (
      <GameLobby
        gameId={gameId}
        sessionId={sessionId}
        gameTitle={gameTitle}
        isAdmin={isAdmin}
        onGameStart={handleGameStart}
        onBack={onExit}
      />
    );
  }

  if (phase === "playing" && currentQuestion) {
    return (
      <GamePlay
        gameId={gameId}
        sessionId={sessionId}
        question={currentQuestion}
        questionIndex={questionIndex}
        totalQuestions={totalQuestions}
        timePerQuestion={timePerQuestion}
        isAdmin={isAdmin}
        onNextQuestion={handleNextQuestion}
        onGameFinished={handleGameFinished}
      />
    );
  }

  if (phase === "finished") {
    return (
      <GameLeaderboard
        leaderboard={leaderboard}
        gameTitle={gameTitle}
        onBack={onExit}
      />
    );
  }

  return null;
}
