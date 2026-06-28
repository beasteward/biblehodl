// NIP-17 Private Direct Messages (gift-wrapped, NIP-44 encrypted).
// All signing/encryption goes through the Signer — no raw keys here.

import { pool } from "./relay-pool";
import { useAppStore } from "./store";
import type { ChatMessage, Channel } from "./store";
import type { Signer } from "./signer";
import { fetchProfile, normalizeReactionEmoji } from "./chat-service";
import type { ActivityItem } from "./store";
import { KIND_GIFT_WRAP, KIND_DM, KIND_REACTION, KIND_DELETE } from "./nostr";
import { wrapDirectMessage, wrapRumorEvent, unwrapDirectMessage } from "./nip17";
import { notifyLocal } from "./notifications";

// ─── Send DM ───

export async function sendDirectMessage(
  recipientPubkey: string,
  content: string,
  signer: Signer
): Promise<string> {
  const store = useAppStore.getState();

  const { id, toRecipient, toSelf } = await wrapDirectMessage(signer, recipientPubkey, content);

  // Publish the recipient's copy and our own copy
  await Promise.all([pool.publish(toRecipient), pool.publish(toSelf)]);

  // Optimistically render our own message
  const conversationId = `dm-${recipientPubkey}`;
  store.addMessage(conversationId, {
    id,
    pubkey: signer.pubkey,
    content,
    created_at: Math.floor(Date.now() / 1000),
    channelId: conversationId,
  });

  return id;
}

// ─── DM Reactions (encrypted, gift-wrapped kind 7) ───
//
// A channel reaction is a public kind-7. For a DM that would publicly link the
// two parties + a timestamp, defeating the E2E encryption — so DM reactions are
// wrapped in the same NIP-59 gift wrap as the messages and never appear in the
// clear. Retractions are wrapped kind-5 deletions referencing the inner
// reaction rumor id.

export async function sendDmReaction(
  partnerPubkey: string,
  targetMessageId: string,
  emoji: string,
  signer: Signer
): Promise<string> {
  const tags: string[][] = [
    ["e", targetMessageId],
    ["p", partnerPubkey],
    ["k", String(KIND_DM)],
  ];
  const { id, toRecipient, toSelf } = await wrapRumorEvent(
    signer,
    partnerPubkey,
    KIND_REACTION,
    emoji,
    tags
  );
  await Promise.all([pool.publish(toRecipient), pool.publish(toSelf)]);

  // Optimistic local render.
  useAppStore.getState().addReaction({
    id,
    targetId: targetMessageId,
    pubkey: signer.pubkey,
    emoji: normalizeReactionEmoji(emoji),
    created_at: Math.floor(Date.now() / 1000),
  });
  return id;
}

export async function retractDmReaction(
  partnerPubkey: string,
  reactionId: string,
  signer: Signer
): Promise<void> {
  const { toRecipient, toSelf } = await wrapRumorEvent(
    signer,
    partnerPubkey,
    KIND_DELETE,
    "",
    [["e", reactionId]]
  );
  await Promise.all([pool.publish(toRecipient), pool.publish(toSelf)]);
  useAppStore.getState().removeReaction(reactionId, signer.pubkey);
}

function handleDmReaction(
  rumorId: string,
  reactor: string,
  recipient: string,
  emoji: string,
  targetId: string,
  created_at: number,
  myPubkey: string
) {
  const store = useAppStore.getState();
  const partner = reactor === myPubkey ? recipient : reactor;
  const conversationId = `dm-${partner}`;

  store.addReaction({
    id: rumorId,
    targetId,
    pubkey: reactor,
    emoji: normalizeReactionEmoji(emoji),
    created_at,
  });

  // Activity when someone else reacts to a message I authored.
  if (reactor === myPubkey) return;
  const target = (store.messages[conversationId] || []).find((m) => m.id === targetId);
  if (target && target.pubkey === myPubkey) {
    const item: ActivityItem = {
      id: rumorId,
      type: "reaction",
      actorPubkey: reactor,
      emoji: normalizeReactionEmoji(emoji),
      targetId,
      targetSnippet: target.content.slice(0, 80),
      channelId: conversationId,
      created_at,
    };
    store.addActivity(item);
    if (!store.profiles[reactor]) fetchProfile(reactor);
  }
}

// ─── Subscribe to DMs ───

export function subscribeToDMs(signer: Signer) {
  const myPubkey = signer.pubkey;
  if (!myPubkey) {
    console.warn("[dm] No pubkey available for DM subscription");
    return;
  }

  // All NIP-17 messages arrive as kind-1059 gift wraps addressed to us.
  pool.subscribe(
    "dms-giftwrap",
    [{ kinds: [KIND_GIFT_WRAP], "#p": [myPubkey], limit: 500 }],
    async (event) => {
      try {
        const dm = await unwrapDirectMessage(signer, event);
        if (dm.kind === KIND_REACTION) {
          const eTags = dm.tags.filter((t) => t[0] === "e" && t[1]);
          const targetId = eTags[eTags.length - 1]?.[1];
          if (targetId) {
            handleDmReaction(dm.id, dm.sender, dm.recipient, dm.content, targetId, dm.created_at, myPubkey);
          }
        } else if (dm.kind === KIND_DELETE) {
          for (const t of dm.tags) {
            if (t[0] === "e" && t[1]) useAppStore.getState().removeReaction(t[1], dm.sender);
          }
        } else {
          handleIncomingDM(dm.id, dm.sender, dm.recipient, dm.content, dm.created_at, myPubkey);
        }
      } catch (err) {
        console.warn("[dm] Failed to unwrap gift wrap:", err);
      }
    }
  );
}

function handleIncomingDM(
  eventId: string,
  senderPubkey: string,
  recipientPubkey: string,
  content: string,
  created_at: number,
  myPubkey: string
) {
  const store = useAppStore.getState();

  // Determine conversation partner
  const partnerPubkey = senderPubkey === myPubkey ? recipientPubkey : senderPubkey;
  const conversationId = `dm-${partnerPubkey}`;

  // Ensure DM conversation exists in channels
  const existing = store.channels.find((c) => c.id === conversationId);
  if (!existing) {
    const channel: Channel = {
      id: conversationId,
      name: partnerPubkey.slice(0, 8) + "...",
      isDirectMessage: true,
      participants: [myPubkey, partnerPubkey],
    };
    store.addChannel(channel);
    // Track unread from now so existing DM history isn't counted on first load.
    store.ensureChannelTracked(conversationId);
    fetchProfile(partnerPubkey);
  }

  const msg: ChatMessage = {
    id: eventId,
    pubkey: senderPubkey,
    content,
    created_at,
    channelId: conversationId,
  };

  // Check for dedup before incrementing unread
  const existingMsgs = store.messages[conversationId] || [];
  const isDuplicate = existingMsgs.some((m) => m.id === eventId);

  store.addMessage(conversationId, msg);

  // Only count as unread if it's newer than our last-read boundary for this
  // conversation — keeps counts stable across reloads (gift-wrap history replays
  // on every connect) and matches "messages since you last looked".
  const boundary = store.lastReadAt[conversationId] ?? 0;
  const isViewing = store.currentView === "chat" && store.activeChannelId === conversationId;
  if (
    !isDuplicate &&
    senderPubkey !== myPubkey &&
    !isViewing &&
    created_at > boundary
  ) {
    store.incrementUnread(conversationId);

    // Backgrounded-tab notification (no-op when the tab is focused or this is
    // replayed backlog). Title = sender display name; body = message preview.
    const profile = store.profiles[senderPubkey];
    const senderName =
      profile?.displayName || profile?.name || partnerPubkey.slice(0, 8) + "…";
    void notifyLocal({
      title: senderName,
      body: content.slice(0, 140),
      url: `/?view=chat&channel=${encodeURIComponent(conversationId)}`,
      tag: conversationId,
      createdAt: created_at,
    });
  }

  if (!store.profiles[senderPubkey]) {
    fetchProfile(senderPubkey);
  }
}

// ─── Start new DM conversation ───

export function startDMConversation(partnerPubkey: string, myPubkey: string): string {
  const store = useAppStore.getState();
  const conversationId = `dm-${partnerPubkey}`;

  const existing = store.channels.find((c) => c.id === conversationId);
  if (!existing) {
    store.addChannel({
      id: conversationId,
      name: partnerPubkey.slice(0, 8) + "...",
      isDirectMessage: true,
      participants: [myPubkey, partnerPubkey],
    });
    fetchProfile(partnerPubkey);
  }

  store.setActiveChannelId(conversationId);
  return conversationId;
}
