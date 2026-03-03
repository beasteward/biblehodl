import {
  generateSecretKey,
  getPublicKey,
  nip19,
  finalizeEvent,
  type UnsignedEvent,
} from "nostr-tools";
import { Relay } from "nostr-tools/relay";

// Default relays
export const DEFAULT_RELAYS = [
  "wss://relay.primal.net",
  "wss://relay.damus.io",
];

// NIP-28 kinds
export const KIND_CHANNEL_CREATE = 40;
export const KIND_CHANNEL_META = 41;
export const KIND_CHANNEL_MESSAGE = 42;
export const KIND_CHANNEL_MUTE = 43;
export const KIND_CHANNEL_MUTE_USER = 44;

// NIP-17 DM
export const KIND_DM = 14;
export const KIND_DM_SEAL = 13;
export const KIND_GIFT_WRAP = 1059;

// NIP-52 Calendar
export const KIND_CALENDAR_EVENT = 31922;
export const KIND_CALENDAR_RSVP = 31925;
export const KIND_CALENDAR = 31924;

// Profile
export const KIND_METADATA = 0;

export interface NostrKeys {
  privateKey: Uint8Array;
  publicKey: string;
  npub: string;
  nsec: string;
}

export function generateKeys(): NostrKeys {
  const privateKey = generateSecretKey();
  const publicKey = getPublicKey(privateKey);
  return {
    privateKey,
    publicKey,
    npub: nip19.npubEncode(publicKey),
    nsec: nip19.nsecEncode(privateKey),
  };
}

export function keysFromNsec(nsec: string): NostrKeys {
  const { data: privateKey } = nip19.decode(nsec) as { data: Uint8Array };
  const publicKey = getPublicKey(privateKey);
  return {
    privateKey,
    publicKey,
    npub: nip19.npubEncode(publicKey),
    nsec,
  };
}

export function keysFromPrivateKey(privateKey: Uint8Array): NostrKeys {
  const publicKey = getPublicKey(privateKey);
  return {
    privateKey,
    publicKey,
    npub: nip19.npubEncode(publicKey),
    nsec: nip19.nsecEncode(privateKey),
  };
}

export async function connectRelay(url: string): Promise<Relay> {
  const relay = await Relay.connect(url);
  return relay;
}

export function createEvent(
  kind: number,
  content: string,
  tags: string[][],
  privateKey: Uint8Array
) {
  const event: UnsignedEvent = {
    kind,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content,
    pubkey: getPublicKey(privateKey),
  };
  return finalizeEvent(event, privateKey);
}
