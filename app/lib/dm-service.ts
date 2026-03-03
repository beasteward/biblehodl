// NIP-17 Direct Messages
// Flow: kind 14 (DM) → kind 13 (seal) → kind 1059 (gift wrap)
// Uses NIP-44 encryption

import * as nip44 from "nostr-tools/nip44";
import { finalizeEvent, generateSecretKey, getPublicKey } from "nostr-tools";
import type { UnsignedEvent } from "nostr-tools";
import { pool } from "./relay-pool";
import { useAppStore } from "./store";
import type { ChatMessage, Channel } from "./store";
import { fetchProfile } from "./chat-service";

const KIND_DM = 14;
const KIND_SEAL = 13;
const KIND_GIFT_WRAP = 1059;

// ─── NIP-44 helpers ───

function getConversationKey(privateKey: Uint8Array, publicKey: string): Uint8Array {
  return nip44.v2.utils.getConversationKey(privateKey, publicKey);
}

function encrypt(message: string, conversationKey: Uint8Array): string {
  return nip44.v2.encrypt(message, conversationKey);
}

function decrypt(ciphertext: string, conversationKey: Uint8Array): string {
  return nip44.v2.decrypt(ciphertext, conversationKey);
}

// ─── Build NIP-17 gift-wrapped DM ───

function createSeal(
  dmEvent: UnsignedEvent,
  senderPrivateKey: Uint8Array,
  recipientPubkey: string
): ReturnType<typeof finalizeEvent> {
  const conversationKey = getConversationKey(senderPrivateKey, recipientPubkey);
  const encryptedContent = encrypt(JSON.stringify(dmEvent), conversationKey);

  const sealEvent: UnsignedEvent = {
    kind: KIND_SEAL,
    created_at: randomTimestamp(),
    tags: [],
    content: encryptedContent,
    pubkey: getPublicKey(senderPrivateKey),
  };

  return finalizeEvent(sealEvent, senderPrivateKey);
}

function createGiftWrap(
  sealEvent: ReturnType<typeof finalizeEvent>,
  recipientPubkey: string
): ReturnType<typeof finalizeEvent> {
  const randomKey = generateSecretKey();
  const conversationKey = getConversationKey(randomKey, recipientPubkey);
  const encryptedContent = encrypt(JSON.stringify(sealEvent), conversationKey);

  const giftWrapEvent: UnsignedEvent = {
    kind: KIND_GIFT_WRAP,
    created_at: randomTimestamp(),
    tags: [["p", recipientPubkey]],
    content: encryptedContent,
    pubkey: getPublicKey(randomKey),
  };

  return finalizeEvent(giftWrapEvent, randomKey);
}

// Randomize timestamp ±48h for metadata protection (per NIP-17)
function randomTimestamp(): number {
  const now = Math.floor(Date.now() / 1000);
  const twoDays = 2 * 24 * 60 * 60;
  return now - Math.floor(Math.random() * twoDays);
}

// ─── Send DM ───

export async function sendDirectMessage(
  recipientPubkey: string,
  content: string,
  senderPrivateKey: Uint8Array
): Promise<string> {
  const senderPubkey = getPublicKey(senderPrivateKey);

  // 1. Create the kind 14 DM event (unsigned, not published)
  const dmEvent: UnsignedEvent = {
    kind: KIND_DM,
    created_at: Math.floor(Date.now() / 1000),
    tags: [["p", recipientPubkey]],
    content,
    pubkey: senderPubkey,
  };

  // 2. Seal for recipient
  const sealForRecipient = createSeal(dmEvent, senderPrivateKey, recipientPubkey);
  const giftWrapForRecipient = createGiftWrap(sealForRecipient, recipientPubkey);

  // 3. Seal for self (so sender can read their own messages)
  const sealForSelf = createSeal(dmEvent, senderPrivateKey, senderPubkey);
  const giftWrapForSelf = createGiftWrap(sealForSelf, senderPubkey);

  // 4. Publish both gift wraps
  await Promise.all([
    pool.publish(giftWrapForRecipient),
    pool.publish(giftWrapForSelf),
  ]);

  return giftWrapForRecipient.id;
}

// ─── Decrypt incoming gift wrap ───

interface DecryptedDM {
  id: string;
  senderPubkey: string;
  recipientPubkey: string;
  content: string;
  created_at: number;
}

function decryptGiftWrap(
  giftWrapEvent: { content: string; pubkey: string },
  privateKey: Uint8Array
): DecryptedDM | null {
  try {
    // Decrypt gift wrap → seal
    const conversationKey1 = getConversationKey(privateKey, giftWrapEvent.pubkey);
    const sealJson = decrypt(giftWrapEvent.content, conversationKey1);
    const sealEvent = JSON.parse(sealJson);

    // Decrypt seal → DM
    const conversationKey2 = getConversationKey(privateKey, sealEvent.pubkey);
    const dmJson = decrypt(sealEvent.content, conversationKey2);
    const dmEvent = JSON.parse(dmJson);

    const recipientPubkey = dmEvent.tags?.find((t: string[]) => t[0] === "p")?.[1] || "";

    return {
      id: sealEvent.id || crypto.randomUUID(),
      senderPubkey: dmEvent.pubkey || sealEvent.pubkey,
      recipientPubkey,
      content: dmEvent.content,
      created_at: dmEvent.created_at,
    };
  } catch (err) {
    console.warn("[dm] Failed to decrypt gift wrap:", err);
    return null;
  }
}

// ─── Subscribe to DMs ───

export function subscribeToDMs(privateKey: Uint8Array) {
  const pubkey = getPublicKey(privateKey);
  const store = useAppStore.getState();

  pool.subscribe(
    "dms",
    [{ kinds: [KIND_GIFT_WRAP], "#p": [pubkey], limit: 500 }],
    (event) => {
      const dm = decryptGiftWrap(event, privateKey);
      if (!dm) return;

      // Determine conversation partner
      const partnerPubkey = dm.senderPubkey === pubkey ? dm.recipientPubkey : dm.senderPubkey;
      const conversationId = `dm-${partnerPubkey}`;

      // Ensure DM conversation exists in channels
      const existing = store.channels.find((c) => c.id === conversationId);
      if (!existing) {
        const channel: Channel = {
          id: conversationId,
          name: partnerPubkey.slice(0, 8) + "...",
          isDirectMessage: true,
          participants: [pubkey, partnerPubkey],
        };
        store.addChannel(channel);
        fetchProfile(partnerPubkey);
      }

      // Add message
      const msg: ChatMessage = {
        id: dm.id,
        pubkey: dm.senderPubkey,
        content: dm.content,
        created_at: dm.created_at,
        channelId: conversationId,
      };
      store.addMessage(conversationId, msg);

      if (!store.profiles[dm.senderPubkey]) {
        fetchProfile(dm.senderPubkey);
      }
    }
  );
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
