// Whiteboard Service — save/load tldraw snapshots via BLOSSOM
//
// Each save uploads the tldraw store snapshot (JSON) to the community's BLOSSOM
// file server and publishes a kind-42 event (tagged `whiteboard-save`) linking
// that blob to the meeting. The event is a *system* event — it is filtered out
// of chat history (see isSystemChannelEvent) so it never renders as a bubble.
// Boards are named, and every save is kept so the meeting has a browsable
// history of saved whiteboards rather than a single overwritten snapshot.

import { pool } from "./relay-pool";
import { KIND_CHANNEL_MESSAGE, KIND_DELETE } from "./nostr";
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
): Promise<WhiteboardSave> {
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
    blobUrl: blob.url.replace(/^http:\/\//i, "https://"),
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

  return { meta, eventId: event.id, pubkey: event.pubkey, created_at: event.created_at };
}

// ─── Rename a saved board (republish same blob under a new name, retract old) ───
//
// The blob is reused as-is; we publish a fresh whiteboard-save event with the
// new name and then NIP-09-delete the previous link event so the list shows a
// single, renamed board. Only the original author can do this (NIP-09 deletion
// is author-scoped).

export async function renameWhiteboard(
  meetingId: string,
  prev: WhiteboardSave,
  newName: string,
  signer: Signer
): Promise<WhiteboardSave> {
  const meta: WhiteboardMeta = {
    type: "whiteboard-save",
    meetingId,
    name: newName.trim() || "Untitled board",
    blobSha256: prev.meta.blobSha256,
    blobUrl: prev.meta.blobUrl,
    timestamp: Date.now(),
  };
  const content = JSON.stringify(meta);
  const tags: string[][] = [
    ["e", meetingId, "", "root"],
    ["t", "whiteboard-save"],
    ["x", prev.meta.blobSha256],
  ];
  const event = await signer.signEvent({ kind: KIND_CHANNEL_MESSAGE, content, tags });
  await pool.publish(event);
  await deleteWhiteboard(prev.eventId, signer);
  return { meta, eventId: event.id, pubkey: event.pubkey, created_at: event.created_at };
}

// ─── Delete a saved board (retract its link event via NIP-09) ───

export async function deleteWhiteboard(eventId: string, signer: Signer): Promise<void> {
  const del = await signer.signEvent({
    kind: KIND_DELETE,
    content: "",
    tags: [["e", eventId]],
  });
  await pool.publish(del);
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
    // Blossom reports http:// URLs (it sits behind Caddy's TLS and doesn't know
    // it), which the browser blocks as mixed content on our https page. Force
    // https so existing saved boards (whose stored blobUrl is http) still load.
    const url = (meta.blobUrl || getBlobUrl(meta.blobSha256)).replace(/^http:\/\//i, "https://");
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
