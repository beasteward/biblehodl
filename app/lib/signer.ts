/**
 * Signer abstraction — the single boundary between the app and a private key.
 *
 * App code NEVER touches raw key bytes. It depends only on this interface, so
 * NIP-07 (extension) and local (NIP-49 encrypted) keys are interchangeable, and
 * NIP-46 (remote/bunker) can be added later as just another adapter.
 *
 *   v1 adapters: NIP-07 extension, local in-memory key (from NIP-49 decrypt).
 */

import {
  finalizeEvent,
  getPublicKey,
  type VerifiedEvent,
} from "nostr-tools/pure";
import * as nip44 from "nostr-tools/nip44";

export type SignerType = "nip07" | "local";

/** Minimal event template the app provides; the signer fills pubkey + created_at. */
export interface EventInput {
  kind: number;
  content: string;
  tags?: string[][];
  created_at?: number;
}

export interface Signer {
  readonly type: SignerType;
  /** Cached hex public key. */
  readonly pubkey: string;
  signEvent(input: EventInput): Promise<VerifiedEvent>;
  /** NIP-44 v2 encryption to a peer pubkey. */
  nip44Encrypt(peerPubkey: string, plaintext: string): Promise<string>;
  nip44Decrypt(peerPubkey: string, ciphertext: string): Promise<string>;
}

// ─── NIP-07 (window.nostr) types ───

interface Nip07 {
  getPublicKey(): Promise<string>;
  signEvent(event: {
    kind: number;
    created_at: number;
    tags: string[][];
    content: string;
  }): Promise<VerifiedEvent>;
  nip44?: {
    encrypt(pubkey: string, plaintext: string): Promise<string>;
    decrypt(pubkey: string, ciphertext: string): Promise<string>;
  };
}

declare global {
  interface Window {
    nostr?: Nip07;
  }
}

const now = () => Math.floor(Date.now() / 1000);

// ─── Local signer (raw key held in a closure, never exposed) ───

/**
 * Build a signer that holds the secret key in memory only.
 * The key is captured in a closure — there is no getter to read it back out.
 */
export function createLocalSigner(secretKey: Uint8Array): Signer {
  const pubkey = getPublicKey(secretKey);

  return {
    type: "local",
    pubkey,
    async signEvent(input) {
      return finalizeEvent(
        {
          kind: input.kind,
          created_at: input.created_at ?? now(),
          tags: input.tags ?? [],
          content: input.content,
        },
        secretKey
      );
    },
    async nip44Encrypt(peerPubkey, plaintext) {
      const ck = nip44.getConversationKey(secretKey, peerPubkey);
      return nip44.encrypt(plaintext, ck);
    },
    async nip44Decrypt(peerPubkey, ciphertext) {
      const ck = nip44.getConversationKey(secretKey, peerPubkey);
      return nip44.decrypt(ciphertext, ck);
    },
  };
}

// ─── NIP-07 signer (extension holds the key) ───

export function createNip07Signer(pubkey: string): Signer {
  return {
    type: "nip07",
    pubkey,
    async signEvent(input) {
      if (typeof window === "undefined" || !window.nostr) {
        throw new Error("NIP-07 extension not available");
      }
      return window.nostr.signEvent({
        kind: input.kind,
        created_at: input.created_at ?? now(),
        tags: input.tags ?? [],
        content: input.content,
      });
    },
    async nip44Encrypt(peerPubkey, plaintext) {
      if (!window.nostr?.nip44) {
        throw new Error("Your Nostr extension does not support NIP-44 encryption");
      }
      return window.nostr.nip44.encrypt(peerPubkey, plaintext);
    },
    async nip44Decrypt(peerPubkey, ciphertext) {
      if (!window.nostr?.nip44) {
        throw new Error("Your Nostr extension does not support NIP-44 encryption");
      }
      return window.nostr.nip44.decrypt(peerPubkey, ciphertext);
    },
  };
}

// ─── NIP-07 helpers ───

export function hasNip07Extension(): boolean {
  return typeof window !== "undefined" && !!window.nostr;
}

export async function getNip07PublicKey(): Promise<string> {
  if (!hasNip07Extension()) {
    throw new Error("NIP-07 extension not available");
  }
  return window.nostr!.getPublicKey();
}
