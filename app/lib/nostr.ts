import {
  generateSecretKey,
  getPublicKey,
} from "nostr-tools/pure";
import { nip19 } from "nostr-tools";
import { Relay } from "nostr-tools/relay";

// Default relays — uses private relay if configured, falls back to public relays
const PRIVATE_RELAY = process.env.NEXT_PUBLIC_RELAY_URL;

export const DEFAULT_RELAYS = PRIVATE_RELAY
  ? [PRIVATE_RELAY]
  : [
      "wss://relay.primal.net",
      "wss://relay.damus.io",
    ];

// NIP-28 kinds
export const KIND_CHANNEL_CREATE = 40;
export const KIND_CHANNEL_META = 41;
export const KIND_CHANNEL_MESSAGE = 42;
export const KIND_CHANNEL_MUTE = 43;
export const KIND_CHANNEL_MUTE_USER = 44;

// App-specific: notify a user they were added to a (membership-gated) channel.
// Regular event, p-tagged at the added user; content = {channelId, channelName}.
export const KIND_CHANNEL_MEMBERSHIP = 9001;

// `t` tag values that mark a kind-42 event as an app/system event (a file-share
// link, a meeting status change, …) rather than a human chat message. These
// carry a JSON payload that must NEVER be rendered as a chat bubble.
export const SYSTEM_CHANNEL_EVENT_TAGS = new Set([
  "meeting-status",
  "meeting-file",
  "whiteboard-save",
]);

/**
 * True when a kind-42 channel/meeting event is an app system event rather than
 * a human-typed message. Detected by its `t` tag so the raw JSON payload never
 * surfaces in chat history (in a meeting room or, defensively, a chat channel).
 */
export function isSystemChannelEvent(event: { tags: string[][] }): boolean {
  return event.tags.some((t) => t[0] === "t" && SYSTEM_CHANNEL_EVENT_TAGS.has(t[1]));
}

// NIP-25 Reactions
export const KIND_REACTION = 7;

// NIP-09 Event Deletion (used to retract reactions)
export const KIND_DELETE = 5;

// NIP-17 Private Direct Messages (NIP-59 gift wrap)
export const KIND_DM = 14;
export const KIND_DM_SEAL = 13;
export const KIND_GIFT_WRAP = 1059;

// NIP-52 Calendar
export const KIND_CALENDAR_EVENT = 31922;
export const KIND_CALENDAR_RSVP = 31925;
export const KIND_CALENDAR = 31924;

// Profile
export const KIND_METADATA = 0;

// NIP-98 HTTP Auth
export const KIND_HTTP_AUTH = 27235;

/**
 * Public identity persisted in app state. Contains NO secret material.
 */
export interface Identity {
  publicKey: string;
  npub: string;
}

/** Newly generated keypair — held transiently during onboarding, never persisted raw. */
export interface FreshKeypair {
  secretKey: Uint8Array;
  publicKey: string;
  npub: string;
  nsec: string;
}

export function identityFromPubkey(publicKey: string): Identity {
  return { publicKey, npub: nip19.npubEncode(publicKey) };
}

export function generateKeypair(): FreshKeypair {
  const secretKey = generateSecretKey();
  const publicKey = getPublicKey(secretKey);
  return {
    secretKey,
    publicKey,
    npub: nip19.npubEncode(publicKey),
    nsec: nip19.nsecEncode(secretKey),
  };
}

/** Decode a user-supplied nsec into raw secret-key bytes (throws if invalid). */
export function secretKeyFromNsec(nsec: string): Uint8Array {
  const decoded = nip19.decode(nsec.trim());
  if (decoded.type !== "nsec") {
    throw new Error("Not an nsec key");
  }
  return decoded.data as Uint8Array;
}

export function keypairFromNsec(nsec: string): FreshKeypair {
  const secretKey = secretKeyFromNsec(nsec);
  const publicKey = getPublicKey(secretKey);
  return {
    secretKey,
    publicKey,
    npub: nip19.npubEncode(publicKey),
    nsec: nip19.nsecEncode(secretKey),
  };
}

export async function connectRelay(url: string): Promise<Relay> {
  return Relay.connect(url);
}
