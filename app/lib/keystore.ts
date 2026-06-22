/**
 * Key-at-rest storage (NIP-49 `ncryptsec`).
 *
 * The only secret we ever persist is a passphrase-encrypted private key
 * (`ncryptsec1...`). The raw secret key is never written to disk/localStorage.
 * Decryption happens in memory, per session, behind the user's passphrase.
 */

import { encrypt as nip49Encrypt, decrypt as nip49Decrypt } from "nostr-tools/nip49";

/** Default scrypt work factor (2^16). Higher = slower = more brute-force resistant. */
const DEFAULT_LOGN = 16;

/**
 * Encrypt a raw secret key with a passphrase, producing a NIP-49 `ncryptsec1...`.
 * Safe to persist (localStorage, DB, file).
 */
export function encryptSecretKey(
  secretKey: Uint8Array,
  passphrase: string,
  logn: number = DEFAULT_LOGN
): string {
  if (!passphrase) throw new Error("A passphrase is required to encrypt your key");
  return nip49Encrypt(secretKey, passphrase, logn);
}

/**
 * Decrypt a NIP-49 `ncryptsec1...` back to a raw secret key.
 * Throws if the passphrase is wrong or the blob is malformed.
 */
export function decryptSecretKey(ncryptsec: string, passphrase: string): Uint8Array {
  if (!ncryptsec?.startsWith("ncryptsec1")) {
    throw new Error("Invalid encrypted key format");
  }
  try {
    return nip49Decrypt(ncryptsec, passphrase);
  } catch {
    // Normalize all failures (bad passphrase, corrupt blob) to one message
    throw new Error("Incorrect passphrase");
  }
}

export function isEncryptedKey(value: string | null | undefined): value is string {
  return !!value && value.startsWith("ncryptsec1");
}
