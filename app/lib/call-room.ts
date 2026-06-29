"use client";

import { useEffect, useState } from "react";
import { useAppStore } from "./store";
import { authFetch } from "./http-auth";

// Build-time public URL of the community's own LiveKit server (wss://livekit.<domain>).
// When unset, calling is disabled and the UI hides every call affordance.
export const CALLS_ENABLED = !!process.env.NEXT_PUBLIC_LIVEKIT_URL;

// Deterministic LiveKit room ids for chat-originated calls. Both sides must
// compute the same id, so DM rooms sort the two pubkeys. These are namespaced
// away from meeting rooms (which use the kind-40 event id) so a channel call and
// a meeting can never collide.
export function channelCallRoom(channelId: string): string {
  return `chat-channel-${channelId}`;
}

export function dmCallRoom(myPubkey: string | undefined, partnerPubkey: string): string | null {
  if (!myPubkey || !partnerPubkey) return null;
  const [a, b] = [myPubkey, partnerPubkey].sort();
  return `chat-dm-${a}-${b}`;
}

export interface CallPresence {
  active: boolean; // someone is currently in the room
  count: number; // number of live participants
  joined: boolean; // the current user is one of them
}

const IDLE: CallPresence = { active: false, count: 0, joined: false };

/**
 * Poll live presence for a call room so a chat header can switch between
 * "Meet now" and "Join now". Polls every 10s while a room is active in view.
 * No-ops (returns idle) when calling is disabled or the user isn't unlocked.
 */
export function useCallPresence(room: string | null): CallPresence {
  const signer = useAppStore((s) => s.signer);
  const myPubkey = useAppStore((s) => s.keys?.publicKey);
  const [presence, setPresence] = useState<CallPresence>(IDLE);

  useEffect(() => {
    if (!room || !signer || !CALLS_ENABLED) {
      setPresence(IDLE);
      return;
    }
    let cancelled = false;

    const poll = async () => {
      try {
        const res = await authFetch(
          signer,
          `/api/livekit/room?room=${encodeURIComponent(room)}`
        );
        if (!res.ok || cancelled) return;
        const data = await res.json();
        const identities: string[] = Array.isArray(data?.identities) ? data.identities : [];
        if (cancelled) return;
        setPresence({
          active: identities.length > 0,
          count: identities.length,
          joined: myPubkey ? identities.includes(myPubkey) : false,
        });
      } catch {
        /* transient network/relay hiccup — keep last known presence */
      }
    };

    poll();
    const iv = setInterval(poll, 10_000);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [room, signer, myPubkey]);

  return presence;
}
