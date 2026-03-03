// Nostr signature auth for API routes
// Client signs a JSON payload with their nsec, server verifies with their pubkey

import { verifyEvent, type Event } from "nostr-tools";

export interface AuthPayload {
  pubkey: string;
  event: Event;
}

/**
 * Verify a Nostr-signed auth header.
 * Client sends: Authorization: Nostr <base64-encoded signed event>
 * Event kind 27235 (NIP-98 HTTP Auth), content = JSON body hash or empty
 */
export function verifyNostrAuth(authHeader: string | null): string | null {
  if (!authHeader?.startsWith("Nostr ")) return null;

  try {
    const encoded = authHeader.slice(6);
    const event: Event = JSON.parse(atob(encoded));

    // Verify the event signature
    if (!verifyEvent(event)) return null;

    // Check kind 27235 (NIP-98) 
    if (event.kind !== 27235) return null;

    // Check timestamp is within 5 minutes
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - event.created_at) > 300) return null;

    return event.pubkey;
  } catch {
    return null;
  }
}

/**
 * Extract pubkey from request, falling back to x-pubkey header for simpler auth.
 * In production, always use Nostr signature auth.
 */
export function getPubkeyFromRequest(request: Request): string | null {
  // Try Nostr signature auth first
  const authHeader = request.headers.get("authorization");
  const pubkey = verifyNostrAuth(authHeader);
  if (pubkey) return pubkey;

  // Fallback: x-pubkey header (for development simplicity)
  return request.headers.get("x-pubkey");
}
