"use client";

import { useState } from "react";
import { LiveKitRoom, VideoConference } from "@livekit/components-react";
import "@livekit/components-styles";
import { useAppStore } from "../../lib/store";
import { authFetch } from "../../lib/http-auth";

interface Props {
  meetingId: string;
}

// Build-time public URL of the community's own LiveKit server (wss://livekit.<domain>).
const LIVEKIT_URL = process.env.NEXT_PUBLIC_LIVEKIT_URL;

export default function MeetingCall({ meetingId }: Props) {
  const signer = useAppStore((s) => s.signer);
  const meeting = useAppStore((s) => s.meetings.find((m) => m.id === meetingId));
  const [token, setToken] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ended = meeting?.status === "ended";

  const join = async () => {
    if (!signer) {
      setError("You need to be unlocked to join the call.");
      return;
    }
    setConnecting(true);
    setError(null);
    try {
      const res = await authFetch(signer, "/api/livekit/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ room: meetingId }),
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
      setToken(data.token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to join the call.");
    } finally {
      setConnecting(false);
    }
  };

  // ── Not configured ───────────────────────────────────────────────
  if (!LIVEKIT_URL) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 text-center">
        <div style={{ color: "var(--text-muted)" }}>
          <div className="text-5xl mb-3">📞</div>
          <p className="text-sm">
            Voice/video calling isn&apos;t configured on this instance.
            <br />
            Set <code>NEXT_PUBLIC_LIVEKIT_URL</code> and run a LiveKit server to enable it.
          </p>
        </div>
      </div>
    );
  }

  // ── Connected: render the conference ─────────────────────────────
  if (token) {
    return (
      <div className="flex-1 min-h-0" data-lk-theme="default" style={{ height: "100%" }}>
        <LiveKitRoom
          serverUrl={LIVEKIT_URL}
          token={token}
          connect
          audio
          video={false}
          onDisconnected={() => setToken(null)}
          onError={(e) => setError(e.message)}
          style={{ height: "100%" }}
        >
          <VideoConference />
        </LiveKitRoom>
      </div>
    );
  }

  // ── Pre-join lobby ───────────────────────────────────────────────
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="text-center max-w-sm">
        <div className="text-5xl mb-4">📞</div>
        <h3 className="text-lg font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
          {meeting?.name || "Meeting"} call
        </h3>
        <p className="text-sm mb-5" style={{ color: "var(--text-muted)" }}>
          Audio-first. You join muted-camera; turn it on from the controls if you want video.
        </p>
        {error && (
          <p className="text-sm mb-3" style={{ color: "var(--danger)" }}>
            {error}
          </p>
        )}
        <button
          onClick={join}
          disabled={connecting || ended}
          className="px-5 py-2.5 rounded-lg text-sm font-medium disabled:opacity-50"
          style={{ background: "var(--accent)", color: "white" }}
        >
          {ended ? "Meeting has ended" : connecting ? "Joining…" : "Join call"}
        </button>
      </div>
    </div>
  );
}
