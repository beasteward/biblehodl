/**
 * NIP-17 Private Direct Messages (sealed kind-14 rumors, NIP-59 gift-wrapped).
 *
 * Implemented against the `Signer` interface so it works with both NIP-07 and
 * local keys WITHOUT exposing the user's secret key:
 *   - rumor (14): unsigned message
 *   - seal  (13): NIP-44(sender→recipient) of the rumor, signed by the sender
 *   - wrap  (1059): NIP-44(ephemeral→recipient) of the seal, signed by a fresh
 *     throwaway key so the sender's identity is hidden at the transport layer.
 */

import {
  finalizeEvent,
  generateSecretKey,
  getEventHash,
  type VerifiedEvent,
} from "nostr-tools/pure";
import * as nip44 from "nostr-tools/nip44";
import type { Signer } from "./signer";
import { KIND_DM, KIND_DM_SEAL, KIND_GIFT_WRAP } from "./nostr";

const TWO_DAYS = 2 * 24 * 60 * 60;

/** Randomize timestamps up to 2 days in the past (NIP-59) to avoid leaking timing. */
function randomizedTimestamp(): number {
  return Math.floor(Date.now() / 1000) - Math.floor(Math.random() * TWO_DAYS);
}

export interface DecryptedDM {
  id: string;
  sender: string;
  recipient: string;
  content: string;
  created_at: number;
  // Inner rumor kind (14 = message, 7 = reaction, 5 = deletion) + its tags, so
  // callers can route encrypted reactions/retractions, not just plain messages.
  kind: number;
  tags: string[][];
}

interface Rumor {
  id: string;
  pubkey: string;
  kind: number;
  created_at: number;
  tags: string[][];
  content: string;
}

function buildRumor(
  sender: string,
  kind: number,
  content: string,
  tags: string[][]
): Rumor {
  const rumor = {
    pubkey: sender,
    kind,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content,
  };
  return { ...rumor, id: getEventHash(rumor) };
}

/** Seal (kind 13): the rumor, NIP-44 encrypted to the recipient and signed by the sender. */
async function sealRumor(
  signer: Signer,
  recipient: string,
  rumor: Rumor
): Promise<VerifiedEvent> {
  const ciphertext = await signer.nip44Encrypt(recipient, JSON.stringify(rumor));
  return signer.signEvent({
    kind: KIND_DM_SEAL,
    content: ciphertext,
    tags: [],
    created_at: randomizedTimestamp(),
  });
}

/** Gift wrap (kind 1059): the seal, NIP-44 encrypted to the recipient under a throwaway key. */
function giftWrap(seal: VerifiedEvent, recipient: string): VerifiedEvent {
  const ephemeral = generateSecretKey();
  const conversationKey = nip44.getConversationKey(ephemeral, recipient);
  const content = nip44.encrypt(JSON.stringify(seal), conversationKey);
  return finalizeEvent(
    {
      kind: KIND_GIFT_WRAP,
      created_at: randomizedTimestamp(),
      tags: [["p", recipient]],
      content,
    },
    ephemeral
  );
}

/**
 * Build the gift wraps for a DM: one addressed to the recipient, one to the
 * sender themselves (so the sender can read their own sent messages).
 */
export async function wrapDirectMessage(
  signer: Signer,
  recipient: string,
  content: string
): Promise<{ id: string; toRecipient: VerifiedEvent; toSelf: VerifiedEvent }> {
  return wrapRumorEvent(signer, recipient, KIND_DM, content, [["p", recipient]]);
}

/**
 * Generic gift-wrap of an arbitrary inner event (rumor) to a peer + self copy.
 * Used for encrypted DMs (kind 14), DM reactions (kind 7) and DM reaction
 * retractions (kind 5) — all stay inside the NIP-59 wrap so no metadata leaks.
 */
export async function wrapRumorEvent(
  signer: Signer,
  recipient: string,
  kind: number,
  content: string,
  tags: string[][]
): Promise<{ id: string; toRecipient: VerifiedEvent; toSelf: VerifiedEvent }> {
  const rumor = buildRumor(signer.pubkey, kind, content, tags);
  const toRecipient = giftWrap(await sealRumor(signer, recipient, rumor), recipient);
  const toSelf = giftWrap(await sealRumor(signer, signer.pubkey, rumor), signer.pubkey);
  return { id: rumor.id, toRecipient, toSelf };
}

/** Unwrap an incoming gift wrap (kind 1059) into the underlying message. */
export async function unwrapDirectMessage(
  signer: Signer,
  giftWrapEvent: { pubkey: string; content: string }
): Promise<DecryptedDM> {
  // wrap → seal (decrypt against the ephemeral wrap pubkey)
  const sealJson = await signer.nip44Decrypt(giftWrapEvent.pubkey, giftWrapEvent.content);
  const seal = JSON.parse(sealJson) as { pubkey: string; content: string };
  // seal → rumor (decrypt against the real sender pubkey)
  const rumorJson = await signer.nip44Decrypt(seal.pubkey, seal.content);
  const rumor = JSON.parse(rumorJson) as Rumor;

  if (rumor.pubkey !== seal.pubkey) {
    throw new Error("Seal/rumor sender mismatch — possible spoofing");
  }

  return {
    id: rumor.id,
    sender: rumor.pubkey,
    recipient: rumor.tags.find((t) => t[0] === "p")?.[1] || signer.pubkey,
    content: rumor.content,
    created_at: rumor.created_at,
    kind: rumor.kind,
    tags: rumor.tags,
  };
}
