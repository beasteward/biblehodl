// NIP-28 Chat Service — channels (kind 40) and messages (kind 42)

import { pool } from "./relay-pool";
import {
  KIND_CHANNEL_CREATE,
  KIND_CHANNEL_MESSAGE,
  KIND_METADATA,
} from "./nostr";
import { useAppStore } from "./store";
import type { Channel, ChatMessage, Profile } from "./store";
import type { Signer } from "./signer";
import { authFetch } from "./http-auth";

// ─── Channel Creation (kind 40) ───

export async function createChannel(
  name: string,
  about: string,
  signer: Signer
): Promise<string> {
  const content = JSON.stringify({ name, about, picture: "" });
  const event = await signer.signEvent({ kind: KIND_CHANNEL_CREATE, content, tags: [] });
  await pool.publish(event);

  // Auto-add creator as channel owner in DB
  const pubkey = signer.pubkey;
  try {
    await authFetch(signer, `/api/channels/${event.id}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pubkey, role: "owner" }),
    });
  } catch {
    // non-critical — owner can be added later
  }

  return event.id;
}

// ─── Channel Message (kind 42) ───

export async function sendChannelMessage(
  channelId: string,
  content: string,
  signer: Signer,
  replyTo?: string
): Promise<string> {
  const tags: string[][] = [["e", channelId, "", "root"]];
  if (replyTo) {
    tags.push(["e", replyTo, "", "reply"]);
  }

  const event = await signer.signEvent({ kind: KIND_CHANNEL_MESSAGE, content, tags });
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
    async () => {
      // EOSE without result from relay — fall back to member DB
      pool.unsubscribe(`profile-${pubkey}`);
      profileFetchQueue.delete(pubkey);

      if (!store.profiles[pubkey]) {
        try {
          const signer = store.signer;
          if (!signer) return;
          const res = await authFetch(signer, `/api/members/search?q=${pubkey}`);
          const data = await res.json();
          const member = data.members?.[0];
          if (member) {
            store.setProfile(pubkey, {
              pubkey,
              name: `${member.firstName} ${member.lastName}`,
              displayName: `${member.firstName} ${member.lastName}`,
            });
          }
        } catch {
          // ignore fallback failure
        }
      }
    }
  );
}

// ─── Init / Teardown ───

export async function initChat() {
  const relays = await pool.connectAll();
  const store = useAppStore.getState();
  store.setConnectedRelays(relays.map((r) => r.url));

  // Channels are no longer persisted — hydrate fresh from the relay each session
  // so the list reflects live relay truth (a wiped/relocated relay yields an
  // empty list instead of resurrecting stale channels + lastMessage previews).
  store.setChannels([]);
  subscribeToChannels();

  // Load user's channel memberships
  if (store.signer) {
    try {
      const res = await authFetch(store.signer, "/api/channels/my");
      const data = await res.json();
      const ids = new Set<string>((data.channels || []).map((c: { id: string }) => c.id));
      store.setMyChannelIds(ids);
    } catch {
      // non-critical
    }
  }
}

export function teardownChat() {
  pool.disconnectAll();
  useAppStore.getState().setConnectedRelays([]);
}
