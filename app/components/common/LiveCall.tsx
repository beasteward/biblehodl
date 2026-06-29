"use client";

import { useEffect, useRef, useState } from "react";
import {
  LiveKitRoom,
  GridLayout,
  ParticipantTile,
  ControlBar,
  RoomAudioRenderer,
  useTracks,
} from "@livekit/components-react";
import { Track } from "livekit-client";
import "@livekit/components-styles";
import { useAppStore } from "../../lib/store";
import type { ChatMessage } from "../../lib/store";
import { authFetch } from "../../lib/http-auth";
import { sendChannelMessage } from "../../lib/chat-service";
import { sendDirectMessage } from "../../lib/dm-service";
import { retryMessage } from "../../lib/outbox";

interface Props {
  room: string; // LiveKit room id
  title: string; // human label shown in the overlay header
  conversationId: string; // channel id, or `dm-<pubkey>` for a DM
  isDM: boolean;
  onClose: () => void; // close the overlay (and leave if connected)
}

// Build-time public URL of the community's own LiveKit server.
const LIVEKIT_URL = process.env.NEXT_PUBLIC_LIVEKIT_URL;

// Stable empty reference — returning a fresh [] from a zustand v5 selector on
// every render trips an infinite re-render loop (React #185).
const EMPTY_MESSAGES: ChatMessage[] = [];

/**
 * Full-screen call overlay for chat-originated calls (channels + DMs).
 *
 * The user has already expressed intent by tapping "Meet now"/"Join now", so we
 * fetch a token and connect immediately. Audio-first (camera off by default).
 *
 * Crucially, the in-call chat IS the conversation's chat: the side panel renders
 * and sends the same persisted Nostr channel/DM messages, so anything said
 * during the call shows up in the conversation's normal Chat history (rather than
 * LiveKit's ephemeral data-channel chat, which is disabled here).
 */
export default function LiveCall({ room, title, conversationId, isDM, onClose }: Props) {
  const signer = useAppStore((s) => s.signer);
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Open by default on desktop (docked side column), closed on mobile where the
  // chat is a bottom-sheet overlay and shouldn't cover the video unprompted.
  // Lazy init is safe: this component is dynamically imported with ssr:false.
  const [showChat, setShowChat] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches
  );

  useEffect(() => {
    if (!signer) {
      setError("You need to be unlocked to join the call.");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await authFetch(signer, "/api/livekit/token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ room }),
        });
        if (!res.ok) {
          const msg =
            res.status === 503
              ? "Calling isn't configured on this server yet."
              : res.status === 403
              ? "You're not a whitelisted member of this community."
              : `Could not get a call token (${res.status}).`;
          throw new Error(msg);
        }
        const data = await res.json();
        if (!cancelled) setToken(data.token);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to join the call.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [room, signer]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "var(--bg-primary)" }}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 shrink-0"
        style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-secondary)" }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-lg">🎥</span>
          <span className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>
            {title}
          </span>
          <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "var(--bg-tertiary)", color: "var(--text-muted)" }}>
            Live call
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setShowChat((v) => !v)}
            className="text-sm px-3 py-1.5 rounded-lg font-medium"
            style={{
              background: showChat ? "var(--accent)" : "var(--bg-tertiary)",
              color: showChat ? "white" : "var(--text-secondary)",
            }}
            title={showChat ? "Hide chat" : "Show chat"}
          >
            💬 Chat
          </button>
          <button
            onClick={onClose}
            className="text-sm px-3 py-1.5 rounded-lg font-medium"
            style={{ background: "var(--bg-tertiary)", color: "var(--text-secondary)" }}
          >
            ✕ Leave
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0" data-lk-theme="default">
        {!LIVEKIT_URL ? (
          <div className="h-full flex items-center justify-center p-8 text-center" style={{ color: "var(--text-muted)" }}>
            <p className="text-sm">Voice/video calling isn&apos;t configured on this instance.</p>
          </div>
        ) : error ? (
          <div className="h-full flex items-center justify-center p-8 text-center">
            <div>
              <div className="text-5xl mb-3">📞</div>
              <p className="text-sm mb-4" style={{ color: "var(--danger)" }}>{error}</p>
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-sm font-medium"
                style={{ background: "var(--bg-tertiary)", color: "var(--text-secondary)" }}
              >
                Close
              </button>
            </div>
          </div>
        ) : !token ? (
          <div className="h-full flex items-center justify-center" style={{ color: "var(--text-muted)" }}>
            <p className="text-sm">Connecting…</p>
          </div>
        ) : (
          <LiveKitRoom
            serverUrl={LIVEKIT_URL}
            token={token}
            connect
            audio
            video={false}
            onDisconnected={onClose}
            onError={(e) => setError(e.message)}
            style={{ height: "100%" }}
          >
            <div className="relative flex h-full min-h-0">
              <CallStage />
              {showChat && (
                <>
                  {/* Mobile-only dimmed backdrop; tap to dismiss the sheet. */}
                  <button
                    aria-label="Close chat"
                    onClick={() => setShowChat(false)}
                    className="md:hidden absolute inset-0 z-10 bg-black/40"
                  />
                  <aside
                    className="
                      z-20 shrink-0 flex flex-col min-h-0
                      absolute inset-x-0 bottom-0 h-[65%] rounded-t-2xl border-t shadow-2xl
                      md:static md:inset-auto md:bottom-auto md:h-auto md:w-80
                      md:rounded-none md:border-t-0 md:border-l md:shadow-none
                      border-[color:var(--border)]
                    "
                    style={{ background: "var(--bg-secondary)" }}
                  >
                    {/* Grab handle — mobile bottom-sheet affordance only. */}
                    <div className="md:hidden flex justify-center pt-2 pb-1 shrink-0">
                      <div className="h-1 w-10 rounded-full" style={{ background: "var(--border)" }} />
                    </div>
                    <CallChat conversationId={conversationId} isDM={isDM} />
                  </aside>
                </>
              )}
            </div>
            <RoomAudioRenderer />
          </LiveKitRoom>
        )}
      </div>
    </div>
  );
}

/**
 * Video grid + controls, with LiveKit's built-in (ephemeral) chat disabled —
 * the persisted conversation chat lives in the side panel instead.
 */
function CallStage() {
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false }
  );

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex-1 min-h-0">
        <GridLayout tracks={tracks} style={{ height: "100%" }}>
          <ParticipantTile />
        </GridLayout>
      </div>
      <ControlBar
        controls={{ microphone: true, camera: true, screenShare: true, chat: false, leave: true, settings: false }}
      />
    </div>
  );
}

/**
 * Slim chat panel bound to the conversation's real messages. Sends through the
 * exact same channel/DM paths as the main ChatView, so every message persists to
 * the relay and appears in the conversation's Chat history.
 */
function CallChat({ conversationId, isDM }: { conversationId: string; isDM: boolean }) {
  const messages = useAppStore((s) => s.messages[conversationId]) ?? EMPTY_MESSAGES;
  const profiles = useAppStore((s) => s.profiles);
  const keys = useAppStore((s) => s.keys);
  const signer = useAppStore((s) => s.signer);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const displayName = (pubkey: string) => {
    const p = profiles[pubkey];
    return p?.displayName || p?.name || `${pubkey.slice(0, 8)}…`;
  };

  const send = async () => {
    if (!input.trim() || !signer) return;
    setSending(true);
    try {
      if (isDM) {
        await sendDirectMessage(conversationId.replace("dm-", ""), input.trim(), signer);
      } else {
        await sendChannelMessage(conversationId, input.trim(), signer);
      }
      setInput("");
    } catch (err) {
      console.error("Failed to send from call:", err);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-3 py-2 text-xs font-semibold shrink-0" style={{ borderBottom: "1px solid var(--border)", color: "var(--text-muted)" }}>
        In-call chat — saved to this conversation
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
        {messages.length === 0 && (
          <p className="text-xs text-center py-6" style={{ color: "var(--text-muted)" }}>
            Messages you send here appear in the conversation history.
          </p>
        )}
        {messages.map((msg) => {
          const isMe = msg.pubkey === keys?.publicKey;
          const time = new Date(msg.created_at * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
          return (
            <div key={msg.id} className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}>
              <div className="flex items-baseline gap-1.5">
                <span className="text-xs font-semibold" style={{ color: isMe ? "var(--accent-light)" : "var(--text-primary)" }}>
                  {isMe ? "You" : displayName(msg.pubkey)}
                </span>
                <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>{time}</span>
              </div>
              <p
                className="text-sm rounded-lg px-2.5 py-1 mt-0.5 inline-block break-words max-w-full"
                style={{ background: isMe ? "var(--accent)" : "var(--bg-tertiary)", color: isMe ? "white" : "var(--text-primary)" }}
              >
                {msg.content}
              </p>
              {isMe && msg.status === "sending" && (
                <span className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>Sending…</span>
              )}
              {isMe && msg.status === "failed" && (
                <span className="text-[10px] mt-0.5" style={{ color: "#ef4444" }}>
                  Failed ·{" "}
                  <button onClick={() => retryMessage(msg.id)} className="underline hover:opacity-80">Retry</button>
                </span>
              )}
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      <div className="p-2 shrink-0" style={{ borderTop: "1px solid var(--border)" }}>
        <div className="flex items-center gap-2 rounded-lg px-2.5 py-1.5" style={{ background: "var(--bg-tertiary)", border: "1px solid var(--border)" }}>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
            placeholder="Message…"
            className="flex-1 bg-transparent outline-none text-sm"
            style={{ color: "var(--text-primary)" }}
            disabled={sending}
          />
          <button
            onClick={send}
            disabled={!input.trim() || sending}
            className="text-base cursor-pointer disabled:opacity-30"
            style={{ color: "var(--accent-light)" }}
          >
            {sending ? "⏳" : "➤"}
          </button>
        </div>
      </div>
    </div>
  );
}
