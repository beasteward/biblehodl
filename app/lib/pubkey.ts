import { nip19 } from "nostr-tools";

/**
 * Accept either a bech32 npub or a 64-char hex pubkey and return lowercase
 * hex, or null if the input is neither. Used to keep stored pubkeys canonical
 * (hex) regardless of what format a client submits.
 */
export function normalizePubkey(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const value = input.trim();
  if (/^npub1[a-z0-9]+$/.test(value)) {
    try {
      const decoded = nip19.decode(value);
      if (decoded.type === "npub" && typeof decoded.data === "string") {
        return decoded.data.toLowerCase();
      }
    } catch {
      return null;
    }
    return null;
  }
  if (/^[0-9a-fA-F]{64}$/.test(value)) return value.toLowerCase();
  return null;
}
