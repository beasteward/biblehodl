// NIP-28 Chat Service — channels (kind 40) and messages (kind 42)

import { pool } from "./relay-pool";
import {
  KIND_CHANNEL_CREATE,
  KIND_CHANNEL_MESSAGE,
  KIND_CHANNEL_MEMBERSHIP,
  KIND_METADATA,
  KIND_REACTION,
  KIND_DELETE,
} from "./nostr";
import { useAppStore } from "./store";
import type { ActivityItem, Channel, ChatMessage, Profile, Reaction } from "./store";
import type { Signer } from "./signer";
import { authFetch } from "./http-auth";
import { notifyLocal } from "./notifications";
import { sendOptimistic } from "./outbox";

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
  // Optimistic render + tracked delivery (sending → sent/failed) so the message
  // appears instantly and never silently disappears if the relay is briefly down.
  await sendOptimistic(channelId, event);
  return event.id;
}

// ─── Reactions (NIP-25, kind 7) ───

// NIP-25 uses "+"/"" for a generic like and "-" for a dislike; map those to
// human-friendly glyphs and pass real emoji through untouched.
export function normalizeReactionEmoji(content: string): string {
  const c = (content || "").trim();
  if (c === "" || c === "+") return "\u{1F44D}"; // 👍
  if (c === "-") return "\u{1F44E}"; // 👎
  return c;
}

export async function sendReaction(
  target: { id: string; pubkey: string },
  emoji: string,
  signer: Signer
): Promise<string> {
  const tags: string[][] = [
    ["e", target.id],
    ["p", target.pubkey],
    ["k", String(KIND_CHANNEL_MESSAGE)],
  ];
  const event = await signer.signEvent({ kind: KIND_REACTION, content: emoji, tags });
  await pool.publish(event);

  // Optimistic local render so the pill appears instantly.
  useAppStore.getState().addReaction({
    id: event.id,
    targetId: target.id,
    pubkey: signer.pubkey,
    emoji: normalizeReactionEmoji(emoji),
    created_at: event.created_at,
  });
  return event.id;
}

// Retract one of your own reactions via a NIP-09 deletion (kind 5).
export async function retractReaction(
  reactionId: string,
  signer: Signer
): Promise<void> {
  const event = await signer.signEvent({
    kind: KIND_DELETE,
    content: "",
    tags: [["e", reactionId]],
  });
  await pool.publish(event);
  useAppStore.getState().removeReaction(reactionId, signer.pubkey);
}

// Global reaction + deletion subscription. Drives both the inline reaction
// pills (any message) and the Teams-style Activity feed (reactions to *your*
// messages). One relay-wide subscription is simple and fine at community scale.
export function subscribeToReactions(myPubkey: string) {
  const seen = new Set<string>();

  pool.subscribe(
    "reactions-global",
    [
      { kinds: [KIND_REACTION], limit: 1000 },
      { kinds: [KIND_DELETE], limit: 500 },
    ],
    (event) => {
      const store = useAppStore.getState();

      // NIP-09 deletion — retract referenced reactions (author-scoped).
      if (event.kind === KIND_DELETE) {
        for (const t of event.tags) {
          if (t[0] === "e" && t[1]) store.removeReaction(t[1], event.pubkey);
        }
        return;
      }

      if (seen.has(event.id)) return;
      seen.add(event.id);

      // Per NIP-25, the reacted event is the last "e" tag; its author the last "p".
      const eTags = event.tags.filter((t) => t[0] === "e" && t[1]);
      const pTags = event.tags.filter((t) => t[0] === "p" && t[1]);
      const targetId = eTags[eTags.length - 1]?.[1];
      const targetAuthor = pTags[pTags.length - 1]?.[1];
      if (!targetId) return;

      const emoji = normalizeReactionEmoji(event.content);
      const reaction: Reaction = {
        id: event.id,
        targetId,
        pubkey: event.pubkey,
        emoji,
        created_at: event.created_at,
      };
      store.addReaction(reaction);

      // Activity: someone (not me) reacted to a message authored by me.
      const reactedToMe =
        targetAuthor === myPubkey ||
        // Fall back to a locally-known message if the p tag is missing.
        Object.values(store.messages).some((list) =>
          list.some((m) => m.id === targetId && m.pubkey === myPubkey)
        );
      if (reactedToMe && event.pubkey !== myPubkey) {
        let targetSnippet: string | undefined;
        let channelId: string | undefined;
        for (const [cid, list] of Object.entries(store.messages)) {
          const m = list.find((x) => x.id === targetId);
          if (m) {
            targetSnippet = m.content.slice(0, 80);
            channelId = cid;
            break;
          }
        }
        const item: ActivityItem = {
          id: event.id,
          type: "reaction",
          actorPubkey: event.pubkey,
          emoji,
          targetId,
          targetSnippet,
          channelId,
          created_at: event.created_at,
        };
        store.addActivity(item);
        if (!store.profiles[event.pubkey]) fetchProfile(event.pubkey);
      }
    }
  );
}

export function unsubscribeFromReactions() {
  pool.unsubscribe("reactions-global");
}

// ─── Channel membership notifications (kind 9001) ───

// Publish a notification to a user that they were added to a channel. Called by
// the admin's client after the server records the membership.
export async function publishChannelMembership(
  signer: Signer,
  addedPubkey: string,
  channelId: string,
  channelName: string
): Promise<void> {
  const event = await signer.signEvent({
    kind: KIND_CHANNEL_MEMBERSHIP,
    content: JSON.stringify({ channelId, channelName }),
    tags: [
      ["p", addedPubkey],
      ["e", channelId],
      ["t", "channel-add"],
    ],
  });
  await pool.publish(event);
}

// Subscribe to "you were added to a channel" notifications addressed to me.
// On receipt we re-fetch authoritative membership (never trust the event for
// access) and surface an Activity notification.
export function subscribeToChannelMembership(myPubkey: string) {
  const seen = new Set<string>();
  pool.subscribe(
    "channel-membership",
    [{ kinds: [KIND_CHANNEL_MEMBERSHIP], "#p": [myPubkey] }],
    (event) => {
      const store = useAppStore.getState();
      if (seen.has(event.id)) return;
      seen.add(event.id);
      if (event.pubkey === myPubkey) return; // ignore anything I published

      let channelId: string | undefined;
      let channelName: string | undefined;
      try {
        const meta = JSON.parse(event.content);
        channelId = meta.channelId;
        channelName = meta.channelName;
      } catch {
        // fall through to tag
      }
      if (!channelId) channelId = event.tags.find((t) => t[0] === "e")?.[1];
      if (!channelId) return;

      // Authoritative membership refresh from the DB.
      refreshMyChannels();
      store.ensureChannelTracked(channelId);
      if (channelName && !store.channels.some((c) => c.id === channelId)) {
        store.addChannel({ id: channelId, name: channelName });
      }

      store.addActivity({
        id: event.id,
        type: "channel_add",
        actorPubkey: event.pubkey,
        channelId,
        channelName: channelName || store.channels.find((c) => c.id === channelId)?.name,
        created_at: event.created_at,
      });
      if (!store.profiles[event.pubkey]) fetchProfile(event.pubkey);
    }
  );
}

export function unsubscribeFromChannelMembership() {
  pool.unsubscribe("channel-membership");
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
          createdBy: event.pubkey,
        };
        store.addChannel(channel);
        // Start tracking unread for newly-discovered channels (boundary = now)
        // so historical backlog isn't counted on first sight.
        store.ensureChannelTracked(channel.id);
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

// ─── Global Unread Tracking ───
//
// ChatView only subscribes to the *active* channel's messages, so unread for
// background channels needs a dedicated global subscription. Unread is gated by
// each channel's persisted last-read timestamp rather than by EOSE: this both
// ignores already-read history AND correctly counts messages that arrived while
// you were away, and it stays consistent across reloads.

// Per-session dedup of counted message ids (guards against multi-relay dupes).
const countedUnread = new Map<string, Set<string>>();

export function subscribeToChannelUnread(myPubkey: string) {
  const store = useAppStore.getState();
  countedUnread.clear();

  // Ensure every known channel has a read boundary before we compute `since`.
  for (const c of store.channels) store.ensureChannelTracked(c.id);

  const nowSec = Math.floor(Date.now() / 1000);
  const boundaries = Object.values(useAppStore.getState().lastReadAt);
  // Catch up from the oldest read boundary so messages missed while away are
  // counted; never look past "now".
  const since = boundaries.length ? Math.min(...boundaries, nowSec) : nowSec;

  pool.subscribe(
    "channel-unread",
    [{ kinds: [KIND_CHANNEL_MESSAGE], since }],
    (event) => {
      if (event.pubkey === myPubkey) return; // never count own messages

      // NIP-28: root channel ref is the "e" tag marked "root" (or the bare one).
      const rootTag = event.tags.find(
        (t) => t[0] === "e" && (t[3] === "root" || t[3] === undefined || t[3] === "")
      );
      const channelId = rootTag?.[1];
      if (!channelId) return;

      const s = useAppStore.getState();
      // Only suppress when the channel is actually on-screen — i.e. the chat
      // view is open AND this is the active channel. Otherwise (e.g. you're on
      // Calendar/Meetings while a channel stays "active") its messages must
      // still count as unread.
      if (s.currentView === "chat" && s.activeChannelId === channelId) return;

      const boundary = s.lastReadAt[channelId];
      if (boundary === undefined) {
        // Unknown channel not yet hydrated — start tracking from now and treat
        // this (historical) event as already read.
        s.ensureChannelTracked(channelId, nowSec);
        return;
      }
      if (event.created_at <= boundary) return; // already read

      let seen = countedUnread.get(channelId);
      if (!seen) {
        seen = new Set();
        countedUnread.set(channelId, seen);
      }
      if (seen.has(event.id)) return;
      seen.add(event.id);

      s.incrementUnread(channelId);

      // Backgrounded-tab notification (no-op when focused or replayed backlog).
      const channelName = s.channels.find((c) => c.id === channelId)?.name || "New message";
      const senderProfile = s.profiles[event.pubkey];
      const senderName =
        senderProfile?.displayName ||
        senderProfile?.name ||
        event.pubkey.slice(0, 8) + "\u2026";
      void notifyLocal({
        title: channelName,
        body: `${senderName}: ${event.content.slice(0, 140)}`,
        url: `/?view=chat&channel=${encodeURIComponent(channelId)}`,
        tag: channelId,
        createdAt: event.created_at,
      });
    }
  );
}

export function unsubscribeFromChannelUnread() {
  pool.unsubscribe("channel-unread");
  countedUnread.clear();
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

  // Load user's channel memberships (authoritative, DB-backed)
  await refreshMyChannels();
}

// Re-fetch the set of channels the current user is a member of from the
// authoritative DB endpoint. Used at init and whenever a membership-change
// notification arrives (so we never trust a relay event for access).
export async function refreshMyChannels() {
  const store = useAppStore.getState();
  if (!store.signer) return;
  try {
    const res = await authFetch(store.signer, "/api/channels/my");
    const data = await res.json();
    const ids = new Set<string>((data.channels || []).map((c: { id: string }) => c.id));
    store.setMyChannelIds(ids);
  } catch {
    // non-critical
  }
}

export function teardownChat() {
  pool.disconnectAll();
  useAppStore.getState().setConnectedRelays([]);
}
