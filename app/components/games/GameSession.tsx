"use client";

// Owns the game session lifecycle: snapshot hydration, the single SSE
// connection (with Last-Event-ID replay handled by EventSource), auto-join,
// and the server-driven phase machine.
//
// lobby → countdown → question → reveal → … → finished

import { useState, useEffect, useRef, useCallback } from "react";
import { useAppStore } from "../../lib/store";
import {
  joinSession,
  advanceQuestion,
  fetchSessionState,
  type PublicQuestion,
  type SessionLeaderboardEntry,
} from "../../lib/game-service";
import GameLobby from "./GameLobby";
import GamePlay from "./GamePlay";
import GameLeaderboard from "./GameLeaderboard";

type Phase = "lobby" | "countdown" | "question" | "reveal" | "finished";

export interface RevealData {
  correctIndex: number;
  distribution: number[];
  leaderboard: SessionLeaderboardEntry[];
  isLast: boolean;
}

interface LobbyPlayer {
  pubkey: string;
  displayName: string;
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

export default function GameSessionView({
  gameId,
  sessionId,
  gameTitle,
  timePerQuestion,
  isAdmin,
  totalQuestions: initialTotal,
  onExit,
}: Props) {
  const keys = useAppStore((s) => s.keys);
  const signer = useAppStore((s) => s.signer);
  const profiles = useAppStore((s) => s.profiles);

  const [hydrated, setHydrated] = useState(false);
  const [phase, setPhase] = useState<Phase>("lobby");
  const [players, setPlayers] = useState<LobbyPlayer[]>([]);
  const [question, setQuestion] = useState<PublicQuestion | null>(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [totalQuestions, setTotalQuestions] = useState(initialTotal);
  const [deadline, setDeadline] = useState<number | null>(null);
  const [answeredCount, setAnsweredCount] = useState(0);
  const [alreadyAnswered, setAlreadyAnswered] = useState(false);
  const [reveal, setReveal] = useState<RevealData | null>(null);
  const [hostPubkey, setHostPubkey] = useState<string>("");
  const [finalLeaderboard, setFinalLeaderboard] = useState<
    { pubkey: string; displayName: string; score: number }[]
  >([]);
  const [advancing, setAdvancing] = useState(false);
  const joinedRef = useRef(false);

  const myPubkey = keys?.publicKey;
  const isHost = hostPubkey ? myPubkey === hostPubkey : isAdmin;

  // ── Snapshot hydration (initial mount + refresh mid-game) ──
  useEffect(() => {
    let cancelled = false;
    fetchSessionState(gameId, sessionId)
      .then((state) => {
        if (cancelled) return;
        const s = state.session;
        setPhase(s.phase);
        setQuestionIndex(Math.max(0, s.currentQuestionIndex));
        setTotalQuestions(s.totalQuestions);
        setHostPubkey(s.hostPubkey);
        setQuestion(state.question);
        setDeadline(s.remainingMs != null ? Date.now() + s.remainingMs : null);
        setAnsweredCount(state.answeredPubkeys.length);
        setAlreadyAnswered(!!myPubkey && state.answeredPubkeys.includes(myPubkey));
        setPlayers(
          state.leaderboard.map((p) => ({ pubkey: p.pubkey, displayName: p.displayName }))
        );
        if (s.phase === "reveal" && state.question?.correctIndex != null) {
          setReveal({
            correctIndex: state.question.correctIndex,
            distribution: state.distribution || [],
            leaderboard: state.leaderboard,
            isLast: s.currentQuestionIndex + 1 >= s.totalQuestions,
          });
        }
        if (s.phase === "finished") {
          setFinalLeaderboard(
            state.leaderboard.map((p) => ({
              pubkey: p.pubkey,
              displayName: p.displayName,
              score: p.score,
            }))
          );
        }
        setHydrated(true);
      })
      .catch((err) => {
        console.error("Failed to hydrate game session:", err);
        setHydrated(true); // fall back to lobby; SSE will correct us
      });
    return () => {
      cancelled = true;
    };
  }, [gameId, sessionId, myPubkey]);

  // ── Auto-join while in lobby ──
  useEffect(() => {
    if (!hydrated || phase !== "lobby" || !keys || !signer || joinedRef.current) return;
    joinedRef.current = true;
    const displayName =
      profiles[keys.publicKey]?.displayName ||
      profiles[keys.publicKey]?.name ||
      keys.publicKey.slice(0, 8);
    joinSession(gameId, sessionId, signer, displayName).catch((err) => {
      console.error("Failed to join session:", err);
      joinedRef.current = false;
    });
  }, [hydrated, phase, keys, signer, profiles, gameId, sessionId]);

  // ── SSE (single connection for the whole session) ──
  useEffect(() => {
    if (!hydrated) return;
    const es = new EventSource(`/api/games/${gameId}/sessions/${sessionId}/events`);

    es.onmessage = (event) => {
      const evt = JSON.parse(event.data);
      const data = evt.data;
      switch (evt.type) {
        case "player-joined":
          setPlayers((prev) => {
            if (prev.some((p) => p.pubkey === data.pubkey)) return prev;
            return [...prev, { pubkey: data.pubkey, displayName: data.displayName }];
          });
          break;
        case "countdown":
          setPhase("countdown");
          setQuestionIndex(data.questionIndex);
          if (data.totalQuestions > 0) setTotalQuestions(data.totalQuestions);
          setDeadline(Date.now() + data.durationMs);
          setReveal(null);
          setQuestion(null);
          setAnsweredCount(0);
          setAlreadyAnswered(false);
          break;
        case "question":
          setPhase("question");
          setQuestion(data.question);
          setQuestionIndex(data.questionIndex);
          if (data.totalQuestions > 0) setTotalQuestions(data.totalQuestions);
          setDeadline(Date.now() + data.durationMs);
          setAnsweredCount(0);
          break;
        case "player-answered":
          setAnsweredCount(data.answeredCount);
          break;
        case "question-closed":
          setPhase("reveal");
          setDeadline(null);
          setReveal({
            correctIndex: data.correctIndex,
            distribution: data.distribution,
            leaderboard: data.leaderboard,
            isLast: data.isLast,
          });
          break;
        case "game-finished":
          setPhase("finished");
          setFinalLeaderboard(data.leaderboard);
          break;
      }
    };

    return () => es.close();
  }, [hydrated, gameId, sessionId]);

  // ── Host controls ──
  const handleAdvance = useCallback(async () => {
    if (!signer) return;
    setAdvancing(true);
    try {
      await advanceQuestion(gameId, sessionId, signer);
      // SSE drives the phase change for everyone, including the host
    } catch (err) {
      console.error("Failed to advance game:", err);
    } finally {
      setAdvancing(false);
    }
  }, [signer, gameId, sessionId]);

  if (!hydrated) {
    return (
      <div className="flex-1 flex items-center justify-center" style={{ color: "var(--text-muted)" }}>
        Loading game…
      </div>
    );
  }

  if (phase === "lobby") {
    return (
      <GameLobby
        gameTitle={gameTitle}
        sessionId={sessionId}
        players={players}
        isHost={isHost}
        starting={advancing}
        onStart={handleAdvance}
        onBack={onExit}
      />
    );
  }

  if (phase === "finished") {
    return (
      <GameLeaderboard leaderboard={finalLeaderboard} gameTitle={gameTitle} onBack={onExit} />
    );
  }

  if (phase === "countdown") {
    return <CountdownScreen deadline={deadline} questionIndex={questionIndex} totalQuestions={totalQuestions} />;
  }

  if ((phase === "question" || phase === "reveal") && question) {
    return (
      <GamePlay
        key={question.id}
        gameId={gameId}
        sessionId={sessionId}
        question={question}
        questionIndex={questionIndex}
        totalQuestions={totalQuestions}
        timePerQuestion={timePerQuestion}
        deadline={deadline}
        answeredCount={answeredCount}
        totalPlayers={players.length}
        alreadyAnswered={alreadyAnswered}
        reveal={reveal}
        isHost={isHost}
        advancing={advancing}
        onAdvance={handleAdvance}
      />
    );
  }

  // reveal/question with no question loaded shouldn't happen; fail safe to lobby
  return (
    <div className="flex-1 flex items-center justify-center" style={{ color: "var(--text-muted)" }}>
      Waiting for the game to continue…
    </div>
  );
}

// ─── 3-2-1 countdown between questions ───

function CountdownScreen({
  deadline,
  questionIndex,
  totalQuestions,
}: {
  deadline: number | null;
  questionIndex: number;
  totalQuestions: number;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(interval);
  }, []);

  const secondsLeft = deadline ? Math.max(1, Math.ceil((deadline - now) / 1000)) : 1;

  return (
    <div className="flex-1 flex flex-col items-center justify-center" style={{ background: "var(--bg-primary)" }}>
      <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>
        Question {questionIndex + 1}
        {totalQuestions > 0 ? ` of ${totalQuestions}` : ""}
      </p>
      <div
        key={secondsLeft}
        className="text-8xl font-bold animate-ping"
        style={{ color: "var(--accent)", animationDuration: "1s", animationIterationCount: 1 }}
      >
        {secondsLeft}
      </div>
      <p className="text-lg mt-8 font-semibold" style={{ color: "var(--text-primary)" }}>
        Get ready…
      </p>
    </div>
  );
}
