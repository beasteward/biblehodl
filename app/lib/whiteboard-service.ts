// Whiteboard Service — save/load tldraw snapshots via BLOSSOM
//
// Each save uploads the tldraw store snapshot (JSON) to the community's BLOSSOM
// file server and publishes a kind-42 event (tagged `whiteboard-save`) linking
// that blob to the meeting. The event is a *system* event — it is filtered out
// of chat history (see isSystemChannelEvent) so it never renders as a bubble.
// Boards are named, and every save is kept so the meeting has a browsable
// history of saved whiteboards rather than a single overwritten snapshot.

import { pool } from "./relay-pool";
import { KIND_CHANNEL_MESSAGE } from "./nostr";
import type { Signer } from "./signer";
import { uploadBlob, getBlobUrl } from "./blossom";

export interface WhiteboardMeta {
  type: "whiteboard-save";
  meetingId: string;
  name: string;
  blobSha256: string;
  blobUrl: string;
  timestamp: number;
}

export interface WhiteboardSave {
  meta: WhiteboardMeta;
  eventId: string;
  pubkey: string;
  created_at: number;
}

// ─── Save a named whiteboard snapshot to BLOSSOM ───

export async function saveWhiteboard(
  meetingId: string,
  snapshotJson: string,
  name: string,
  signer: Signer
): Promise<WhiteboardMeta> {
  const safeName = name.trim() || "Untitled board";

  // Create a File from the JSON snapshot
  const file = new File(
    [snapshotJson],
    `whiteboard-${meetingId.slice(0, 8)}-${Date.now()}.json`,
    { type: "application/json" }
  );

  // Upload to BLOSSOM (community-owned file server)
  const blob = await uploadBlob(file, signer);

  const meta: WhiteboardMeta = {
    type: "whiteboard-save",
    meetingId,
    name: safeName,
    blobSha256: blob.sha256,
    blobUrl: blob.url,
    timestamp: Date.now(),
  };

  // Publish a Nostr event linking the save to the meeting
  const content = JSON.stringify(meta);
  const tags: string[][] = [
    ["e", meetingId, "", "root"],
    ["t", "whiteboard-save"],
    ["x", blob.sha256],
  ];
  const event = await signer.signEvent({ kind: KIND_CHANNEL_MESSAGE, content, tags });
  await pool.publish(event);

  return meta;
}

// ─── List every saved whiteboard for a meeting (latest first) ───

export async function listWhiteboards(meetingId: string): Promise<WhiteboardSave[]> {
  return new Promise((resolve) => {
    const saves: WhiteboardSave[] = [];
    const seen = new Set<string>();

    pool.subscribe(
      `whiteboard-list-${meetingId}`,
      [
        {
          kinds: [KIND_CHANNEL_MESSAGE],
          "#e": [meetingId],
          "#t": ["whiteboard-save"],
          limit: 100,
        },
      ],
      (event) => {
        if (seen.has(event.id)) return;
        seen.add(event.id);
        try {
          const parsed = JSON.parse(event.content);
          if (parsed.type === "whiteboard-save") {
            saves.push({
              meta: { ...(parsed as WhiteboardMeta), name: parsed.name || "Untitled board" },
              eventId: event.id,
              pubkey: event.pubkey,
              created_at: event.created_at,
            });
          }
        } catch {
          // skip malformed
        }
      },
      () => {
        // EOSE — return all saves, newest first
        pool.unsubscribe(`whiteboard-list-${meetingId}`);
        saves.sort((a, b) => b.created_at - a.created_at);
        resolve(saves);
      }
    );
  });
}

// ─── Fetch the tldraw snapshot JSON for a specific saved board ───

export async function fetchWhiteboardSnapshot(meta: WhiteboardMeta): Promise<string | null> {
  try {
    const url = meta.blobUrl || getBlobUrl(meta.blobSha256);
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

// ─── Convenience: load the most recent saved whiteboard ───

export async function loadLatestWhiteboard(
  meetingId: string
): Promise<{ snapshotJson: string; meta: WhiteboardMeta } | null> {
  const saves = await listWhiteboards(meetingId);
  if (saves.length === 0) return null;

  const latest = saves[0].meta;
  const snapshotJson = await fetchWhiteboardSnapshot(latest);
  if (!snapshotJson) return null;
  return { snapshotJson, meta: latest };
}
