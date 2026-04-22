/**
 * Nostr Signer Abstraction
 *
 * Supports two modes:
 * 1. NIP-07 (browser extension) — keys never touch the app
 * 2. Local private key (nsec fallback) — key in memory only
 *
 * All event signing goes through this module.
 */

import {
  finalizeEvent,
  getPublicKey,
  type UnsignedEvent,
  type VerifiedEvent,
} from "nostr-tools";

// NIP-07 window.nostr interface
interface Nip07Nostr {
  getPublicKey(): Promise<string>;
  signEvent(event: UnsignedEvent): Promise<VerifiedEvent>;
  nip04?: {
    encrypt(pubkey: string, plaintext: string): Promise<string>;
    decrypt(pubkey: string, ciphertext: string): Promise<string>;
  };
  nip44?: {
    encrypt(pubkey: string, plaintext: string): Promise<string>;
    decrypt(pubkey: string, ciphertext: string): Promise<string>;
  };
}

declare global {
  interface Window {
    nostr?: Nip07Nostr;
  }
}

export type SignerMode = "nip07" | "local";

export interface Signer {
  mode: SignerMode;
  getPublicKey(): string | Promise<string>;
  signEvent(event: UnsignedEvent): VerifiedEvent | Promise<VerifiedEvent>;
  /** Raw private key — only available in local mode */
  getPrivateKey(): Uint8Array | null;
}

/**
 * Create a local signer from a raw private key
 */
export function createLocalSigner(privateKey: Uint8Array): Signer {
  const publicKey = getPublicKey(privateKey);

  return {
    mode: "local",
    getPublicKey: () => publicKey,
    signEvent: (event: UnsignedEvent) => finalizeEvent(event, privateKey),
    getPrivateKey: () => privateKey,
  };
}

/**
 * Create a NIP-07 signer using the browser extension
 */
export function createNip07Signer(pubkey: string): Signer {
  return {
    mode: "nip07",
    getPublicKey: () => pubkey,
    signEvent: async (event: UnsignedEvent) => {
      if (!window.nostr) {
        throw new Error("NIP-07 extension not available");
      }
      return window.nostr.signEvent(event);
    },
    getPrivateKey: () => null,
  };
}

/**
 * Check if a NIP-07 extension is available
 */
export function hasNip07Extension(): boolean {
  return typeof window !== "undefined" && !!window.nostr;
}

/**
 * Get the public key from the NIP-07 extension
 */
export async function getNip07PublicKey(): Promise<string> {
  if (!window.nostr) {
    throw new Error("NIP-07 extension not available");
  }
  return window.nostr.getPublicKey();
}

/**
 * Helper: create and sign a Nostr event using a signer
 */
export async function createSignedEvent(
  signer: Signer,
  kind: number,
  content: string,
  tags: string[][]
): Promise<VerifiedEvent> {
  const pubkey = await Promise.resolve(signer.getPublicKey());
  const event: UnsignedEvent = {
    kind,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content,
    pubkey,
  };
  return Promise.resolve(signer.signEvent(event));
}
