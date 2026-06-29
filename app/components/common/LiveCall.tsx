"use client";

import { useEffect, useState } from "react";
import { LiveKitRoom, VideoConference } from "@livekit/components-react";
import "@livekit/components-styles";
import { useAppStore } from "../../lib/store";
import { authFetch } from "../../lib/http-auth";

interface Props {
  room: string; // LiveKit room id
  title: string; // human label shown in the overlay header
  onClose: () => void; // close the overlay (and leave if connected)
}

// Build-time public URL of the community's own LiveKit server.
const LIVEKIT_URL = process.env.NEXT_PUBLIC_LIVEKIT_URL;

/**
 * Full-screen call overlay for chat-originated calls (channels + DMs).
 *
 * The user has already expressed intent by tapping "Meet now"/"Join now", so we
 * fetch a token and connect immediately — no second lobby. Audio-first (camera
 * off by default); video is one tap away from the in-room controls. Leaving the
 * call, an error, or the close button all dismiss the overlay.
 */
export default function LiveCall({ room, title, onClose }: Props) {
  const signer = useAppStore((s) => s.signer);
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
        <button
          onClick={onClose}
          className="text-sm px-3 py-1.5 rounded-lg font-medium shrink-0"
          style={{ background: "var(--bg-tertiary)", color: "var(--text-secondary)" }}
        >
          ✕ Leave
        </button>
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
            <VideoConference />
          </LiveKitRoom>
        )}
      </div>
    </div>
  );
}
