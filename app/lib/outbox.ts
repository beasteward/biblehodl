// Outbox — optimistic send + delivery tracking for public chat messages
// (kind 42: channels and meeting rooms).
//
// A message we send is rendered instantly with status "sending", then published
// to the relays. If at least one relay accepts it (or later echoes it back) it
// flips to "sent"; if it reaches zero relays it flips to "failed" and the user
// gets a Retry affordance. This guarantees a sent message never silently
// vanishes when a relay socket is briefly down — the exact failure that ate
// meeting-chat messages after a relay restart.

import type { VerifiedEvent } from "nostr-tools/pure";
import { pool } from "./relay-pool";
import { useAppStore } from "./store";

// Failed/in-flight sends, keyed by event id, so Retry can re-publish the exact
// signed event without re-signing.
const pending = new Map<string, { event: VerifiedEvent; channelId: string }>();

async function deliver(id: string): Promise<boolean> {
  const entry = pending.get(id);
  if (!entry) return false;
  const store = useAppStore.getState();
  store.updateMessageStatus(entry.channelId, id, "sending");

  let accepted = 0;
  try {
    accepted = await pool.publish(entry.event);
  } catch {
    accepted = 0;
  }

  if (accepted > 0) {
    store.updateMessageStatus(entry.channelId, id, "sent");
    pending.delete(id);
    return true;
  }
  store.updateMessageStatus(entry.channelId, id, "failed");
  return false;
}

// Optimistically render a just-signed outgoing kind-42 event and publish it.
// `channelId` is the channel/meeting id the message belongs to.
export async function sendOptimistic(
  channelId: string,
  event: VerifiedEvent
): Promise<boolean> {
  useAppStore.getState().addMessage(channelId, {
    id: event.id,
    pubkey: event.pubkey,
    content: event.content,
    created_at: event.created_at,
    channelId,
    status: "sending",
  });
  pending.set(event.id, { event, channelId });
  return deliver(event.id);
}

// Re-publish a previously failed message (called from the Retry button).
export async function retryMessage(id: string): Promise<boolean> {
  return deliver(id);
}

// True if a message id is still unsent (failed/in-flight), for the UI.
export function isPending(id: string): boolean {
  return pending.has(id);
}
