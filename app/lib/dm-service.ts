// NIP-04 Direct Messages
// Uses kind 4 (EncryptedDirectMessage) with NIP-04 encryption
// Supports both NIP-07 signer (extension handles encryption) and local key

import { finalizeEvent, getPublicKey, nip04 } from "nostr-tools";
import type { UnsignedEvent } from "nostr-tools";
import { pool } from "./relay-pool";
import { useAppStore } from "./store";
import type { ChatMessage, Channel } from "./store";
import { fetchProfile } from "./chat-service";
import type { Signer } from "./signer";

const KIND_ENCRYPTED_DM = 4;

// ─── Encryption helpers ───

async function encryptMessage(
  content: string,
  recipientPubkey: string,
  signer: Signer | null,
  privateKey: Uint8Array | null
): Promise<string> {
  // Try NIP-07 extension first
  if (signer?.mode === "nip07" && typeof window !== "undefined" && window.nostr?.nip04) {
    return window.nostr.nip04.encrypt(recipientPubkey, content);
  }

  // Fall back to local encryption
  if (privateKey && privateKey.length > 0) {
    return nip04.encrypt(privateKey, recipientPubkey, content);
  }

  throw new Error("No encryption method available");
}

async function decryptMessage(
  ciphertext: string,
  senderPubkey: string,
  signer: Signer | null,
  privateKey: Uint8Array | null
): Promise<string> {
  // Try NIP-07 extension first
  if (signer?.mode === "nip07" && typeof window !== "undefined" && window.nostr?.nip04) {
    return window.nostr.nip04.decrypt(senderPubkey, ciphertext);
  }

  // Fall back to local decryption
  if (privateKey && privateKey.length > 0) {
    return nip04.decrypt(privateKey, senderPubkey, ciphertext);
  }

  throw new Error("No decryption method available");
}

// ─── Send DM ───

export async function sendDirectMessage(
  recipientPubkey: string,
  content: string,
  privateKey: Uint8Array
): Promise<string> {
  const store = useAppStore.getState();
  const signer = store.signer;

  // Encrypt the message
  const encrypted = await encryptMessage(content, recipientPubkey, signer, privateKey);

  let publishedEvent;

  if (signer?.mode === "nip07") {
    // NIP-07: let the extension sign
    const pubkey = await Promise.resolve(signer.getPublicKey());
    const event: UnsignedEvent = {
      kind: KIND_ENCRYPTED_DM,
      created_at: Math.floor(Date.now() / 1000),
      tags: [["p", recipientPubkey]],
      content: encrypted,
      pubkey,
    };
    publishedEvent = await Promise.resolve(signer.signEvent(event));
  } else {
    // Local key: sign directly
    const event: UnsignedEvent = {
      kind: KIND_ENCRYPTED_DM,
      created_at: Math.floor(Date.now() / 1000),
      tags: [["p", recipientPubkey]],
      content: encrypted,
      pubkey: getPublicKey(privateKey),
    };
    publishedEvent = finalizeEvent(event, privateKey);
  }

  await pool.publish(publishedEvent);

  // Add to local messages immediately
  const myPubkey = signer?.mode === "nip07"
    ? await Promise.resolve(signer.getPublicKey())
    : getPublicKey(privateKey);

  const conversationId = `dm-${recipientPubkey}`;
  const msg: ChatMessage = {
    id: publishedEvent.id,
    pubkey: myPubkey,
    content,
    created_at: publishedEvent.created_at,
    channelId: conversationId,
  };
  store.addMessage(conversationId, msg);

  return publishedEvent.id;
}

// ─── Subscribe to DMs ───

export function subscribeToDMs(privateKey: Uint8Array) {
  const store = useAppStore.getState();
  const signer = store.signer;

  // Determine our pubkey
  let pubkey: string;
  if (signer?.mode === "nip07") {
    // For NIP-07, the pubkey should already be in keys
    pubkey = store.keys?.publicKey || "";
  } else {
    pubkey = getPublicKey(privateKey);
  }

  if (!pubkey) {
    console.warn("[dm] No pubkey available for DM subscription");
    return;
  }

  // Subscribe to DMs sent TO us (kind 4, tagged with our pubkey)
  pool.subscribe(
    "dms-incoming",
    [{ kinds: [KIND_ENCRYPTED_DM], "#p": [pubkey], limit: 500 }],
    async (event) => {
      try {
        const content = await decryptMessage(event.content, event.pubkey, signer, privateKey);
        handleIncomingDM(event.id, event.pubkey, pubkey, content, event.created_at, pubkey);
      } catch (err) {
        console.warn("[dm] Failed to decrypt incoming message:", err);
      }
    }
  );

  // Subscribe to DMs sent BY us (kind 4, authored by us)
  pool.subscribe(
    "dms-outgoing",
    [{ kinds: [KIND_ENCRYPTED_DM], authors: [pubkey], limit: 500 }],
    async (event) => {
      // Get the recipient from the p tag
      const recipientPubkey = event.tags.find((t: string[]) => t[0] === "p")?.[1];
      if (!recipientPubkey) return;

      try {
        const content = await decryptMessage(event.content, recipientPubkey, signer, privateKey);
        handleIncomingDM(event.id, pubkey, recipientPubkey, content, event.created_at, pubkey);
      } catch (err) {
        console.warn("[dm] Failed to decrypt outgoing message:", err);
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

  // Add message (dedup handled by store)
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

  // Increment unread if this is a new message from someone else and not the active channel
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
