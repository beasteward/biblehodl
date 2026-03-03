// NIP-28 Chat Service — channels (kind 40) and messages (kind 42)

import { pool } from "./relay-pool";
import {
  createEvent,
  KIND_CHANNEL_CREATE,
  KIND_CHANNEL_MESSAGE,
  KIND_METADATA,
} from "./nostr";
import { useAppStore } from "./store";
import type { Channel, ChatMessage, Profile } from "./store";

// ─── Channel Creation (kind 40) ───

export async function createChannel(
  name: string,
  about: string,
  privateKey: Uint8Array
): Promise<string> {
  const content = JSON.stringify({ name, about, picture: "" });
  const event = createEvent(KIND_CHANNEL_CREATE, content, [], privateKey);
  await pool.publish(event);
  return event.id;
}

// ─── Channel Message (kind 42) ───

export async function sendChannelMessage(
  channelId: string,
  content: string,
  privateKey: Uint8Array,
  replyTo?: string
): Promise<string> {
  const tags: string[][] = [["e", channelId, "", "root"]];
  if (replyTo) {
    tags.push(["e", replyTo, "", "reply"]);
  }

  const event = createEvent(KIND_CHANNEL_MESSAGE, content, tags, privateKey);
  await pool.publish(event);
  return event.id;
}

// ─── Subscriptions ───

export function subscribeToChannels() {
  const store = useAppStore.getState();

  // Subscribe to channel creation events (kind 40)
  pool.subscribe(
    "channels",
    [{ kinds: [KIND_CHANNEL_CREATE], limit: 100 }],
    (event) => {
      try {
        const meta = JSON.parse(event.content);
        const channel: Channel = {
          id: event.id,
          name: meta.name || "Unnamed",
          about: meta.about,
          picture: meta.picture,
        };
        store.addChannel(channel);
      } catch {
        // skip malformed
      }
    }
  );
}

export function subscribeToChannelMessages(channelId: string) {
  const store = useAppStore.getState();

  pool.subscribe(
    `channel-msgs-${channelId}`,
    [
      {
        kinds: [KIND_CHANNEL_MESSAGE],
        "#e": [channelId],
        limit: 200,
      },
    ],
    (event) => {
      const msg: ChatMessage = {
        id: event.id,
        pubkey: event.pubkey,
        content: event.content,
        created_at: event.created_at,
        channelId,
      };
      store.addMessage(channelId, msg);

      // Fetch profile if we don't have it
      if (!store.profiles[event.pubkey]) {
        fetchProfile(event.pubkey);
      }
    }
  );
}

export function unsubscribeFromChannelMessages(channelId: string) {
  pool.unsubscribe(`channel-msgs-${channelId}`);
}

// ─── Profiles (kind 0) ───

const profileFetchQueue = new Set<string>();

export function fetchProfile(pubkey: string) {
  if (profileFetchQueue.has(pubkey)) return;
  profileFetchQueue.add(pubkey);

  const store = useAppStore.getState();

  pool.subscribe(
    `profile-${pubkey}`,
    [{ kinds: [KIND_METADATA], authors: [pubkey], limit: 1 }],
    (event) => {
      try {
        const meta = JSON.parse(event.content);
        const profile: Profile = {
          pubkey: event.pubkey,
          name: meta.name,
          displayName: meta.display_name || meta.displayName,
          picture: meta.picture,
          about: meta.about,
          nip05: meta.nip05,
        };
        store.setProfile(pubkey, profile);
      } catch {
        // skip malformed
      }
      // One-shot: unsubscribe after receiving
      pool.unsubscribe(`profile-${pubkey}`);
      profileFetchQueue.delete(pubkey);
    },
    () => {
      // EOSE without result
      pool.unsubscribe(`profile-${pubkey}`);
      profileFetchQueue.delete(pubkey);
    }
  );
}

// ─── Init / Teardown ───

export async function initChat() {
  const relays = await pool.connectAll();
  useAppStore.getState().setConnectedRelays(relays.map((r) => r.url));
  subscribeToChannels();
}

export function teardownChat() {
  pool.disconnectAll();
  useAppStore.getState().setConnectedRelays([]);
}
