// Whiteboard Sync Service — tldraw state synced via Nostr
// Uses kind 42 messages tagged with "t":"whiteboard" scoped to meeting channels
// Each event contains a JSON patch (added/updated/removed shapes)

import { pool } from "./relay-pool";
import { createEvent, KIND_CHANNEL_MESSAGE } from "./nostr";

export interface WhiteboardPatch {
  type: "whiteboard-patch";
  meetingId: string;
  added?: Record<string, unknown>[];
  updated?: Record<string, unknown>[];
  removed?: string[];
  timestamp: number;
}

// ─── Publish a whiteboard patch ───

export async function publishWhiteboardPatch(
  meetingId: string,
  patch: Omit<WhiteboardPatch, "type" | "meetingId" | "timestamp">,
  privateKey: Uint8Array
): Promise<void> {
  const content = JSON.stringify({
    type: "whiteboard-patch",
    meetingId,
    ...patch,
    timestamp: Date.now(),
  });

  const tags: string[][] = [
    ["e", meetingId, "", "root"],
    ["t", "whiteboard"],
  ];

  const event = createEvent(KIND_CHANNEL_MESSAGE, content, tags, privateKey);
  await pool.publish(event);
}

// ─── Subscribe to whiteboard patches ───

export function subscribeToWhiteboardPatches(
  meetingId: string,
  onPatch: (patch: WhiteboardPatch, pubkey: string) => void
) {
  pool.subscribe(
    `whiteboard-${meetingId}`,
    [
      {
        kinds: [KIND_CHANNEL_MESSAGE],
        "#e": [meetingId],
        "#t": ["whiteboard"],
        limit: 500,
      },
    ],
    (event) => {
      try {
        const parsed = JSON.parse(event.content);
        if (parsed.type === "whiteboard-patch") {
          onPatch(parsed as WhiteboardPatch, event.pubkey);
        }
      } catch {
        // Not a whiteboard event
      }
    }
  );
}

export function unsubscribeFromWhiteboard(meetingId: string) {
  pool.unsubscribe(`whiteboard-${meetingId}`);
}
