// Whiteboard Service — save/load tldraw snapshots via BLOSSOM
// Publishes a kind 42 event linking the saved blob to the meeting

import { pool } from "./relay-pool";
import { createEvent, KIND_CHANNEL_MESSAGE } from "./nostr";
import { uploadBlob, getBlobUrl } from "./blossom";

export interface WhiteboardMeta {
  type: "whiteboard-save";
  meetingId: string;
  blobSha256: string;
  blobUrl: string;
  timestamp: number;
}

// ─── Save whiteboard snapshot to BLOSSOM ───

export async function saveWhiteboard(
  meetingId: string,
  snapshotJson: string,
  privateKey: Uint8Array
): Promise<WhiteboardMeta> {
  // Create a File from the JSON snapshot
  const file = new File(
    [snapshotJson],
    `whiteboard-${meetingId.slice(0, 8)}-${Date.now()}.json`,
    { type: "application/json" }
  );

  // Upload to BLOSSOM
  const blob = await uploadBlob(file, privateKey);

  const meta: WhiteboardMeta = {
    type: "whiteboard-save",
    meetingId,
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
  const event = createEvent(KIND_CHANNEL_MESSAGE, content, tags, privateKey);
  await pool.publish(event);

  return meta;
}

// ─── Load latest whiteboard snapshot ───

export async function loadLatestWhiteboard(
  meetingId: string
): Promise<{ snapshotJson: string; meta: WhiteboardMeta } | null> {
  return new Promise((resolve) => {
    const saves: { meta: WhiteboardMeta; created_at: number }[] = [];

    pool.subscribe(
      `whiteboard-load-${meetingId}`,
      [
        {
          kinds: [KIND_CHANNEL_MESSAGE],
          "#e": [meetingId],
          "#t": ["whiteboard-save"],
          limit: 10,
        },
      ],
      (event) => {
        try {
          const parsed = JSON.parse(event.content);
          if (parsed.type === "whiteboard-save") {
            saves.push({ meta: parsed as WhiteboardMeta, created_at: event.created_at });
          }
        } catch {
          // skip
        }
      },
      async () => {
        // EOSE — pick the latest save
        pool.unsubscribe(`whiteboard-load-${meetingId}`);

        if (saves.length === 0) {
          resolve(null);
          return;
        }

        // Sort by timestamp descending, pick latest
        saves.sort((a, b) => b.created_at - a.created_at);
        const latest = saves[0].meta;

        try {
          const url = latest.blobUrl || getBlobUrl(latest.blobSha256);
          const res = await fetch(url);
          if (!res.ok) {
            resolve(null);
            return;
          }
          const snapshotJson = await res.text();
          resolve({ snapshotJson, meta: latest });
        } catch {
          resolve(null);
        }
      }
    );
  });
}
