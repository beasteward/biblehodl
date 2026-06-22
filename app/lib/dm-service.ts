// NIP-17 Private Direct Messages (gift-wrapped, NIP-44 encrypted).
// All signing/encryption goes through the Signer — no raw keys here.

import { pool } from "./relay-pool";
import { useAppStore } from "./store";
import type { ChatMessage, Channel } from "./store";
import type { Signer } from "./signer";
import { fetchProfile } from "./chat-service";
import { KIND_GIFT_WRAP } from "./nostr";
import { wrapDirectMessage, unwrapDirectMessage } from "./nip17";

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
        handleIncomingDM(dm.id, dm.sender, dm.recipient, dm.content, dm.created_at, myPubkey);
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

  if (!isDuplicate && senderPubkey !== myPubkey && store.activeChannelId !== conversationId) {
    store.incrementUnread(conversationId);
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
