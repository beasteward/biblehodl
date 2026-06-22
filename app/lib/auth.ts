// Server-side NIP-98 HTTP Auth verification.
//
// The client signs a kind-27235 event bound to the request URL + method. We
// verify the signature, freshness, URL/method binding, and single-use. There is
// NO `x-pubkey` fallback — an unverified header can never establish identity.

import { verifyEvent, type Event } from "nostr-tools";

const FRESHNESS_WINDOW_S = 60;
const REPLAY_TTL_MS = 90_000;

// In-memory single-use cache (event id -> expiry). Note: per-instance only; a
// multi-instance deployment should back this with a shared store (Redis).
const seenEventIds = new Map<string, number>();

function rememberOnce(id: string): boolean {
  const nowMs = Date.now();
  // opportunistic cleanup
  if (seenEventIds.size > 5000) {
    for (const [k, exp] of seenEventIds) if (exp < nowMs) seenEventIds.delete(k);
  }
  if (seenEventIds.has(id)) return false;
  seenEventIds.set(id, nowMs + REPLAY_TTL_MS);
  return true;
}

function tagValue(event: Event, name: string): string | undefined {
  return event.tags.find((t) => t[0] === name)?.[1];
}

/** Compare only path + query so reverse proxies (Caddy) don't break URL binding. */
function samePathAndQuery(a: string, b: string): boolean {
  try {
    const ua = new URL(a);
    const ub = new URL(b);
    return ua.pathname + ua.search === ub.pathname + ub.search;
  } catch {
    return false;
  }
}

/**
 * Verify a NIP-98 `Authorization: Nostr <base64 event>` header.
 * Returns the authenticated pubkey, or null.
 */
export async function verifyNostrAuth(request: Request): Promise<string | null> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Nostr ")) return null;

  let event: Event;
  try {
    event = JSON.parse(atob(authHeader.slice(6)));
  } catch {
    return null;
  }

  // Structural + signature checks
  if (event.kind !== 27235) return null;
  if (!verifyEvent(event)) return null;

  // Freshness
  const nowS = Math.floor(Date.now() / 1000);
  if (Math.abs(nowS - event.created_at) > FRESHNESS_WINDOW_S) return null;

  // Method binding
  const method = tagValue(event, "method");
  if (!method || method.toUpperCase() !== request.method.toUpperCase()) return null;

  // URL binding (path + query)
  const u = tagValue(event, "u");
  if (!u || !samePathAndQuery(u, request.url)) return null;

  // Single-use (replay protection)
  if (!rememberOnce(event.id)) return null;

  return event.pubkey;
}

/**
 * Resolve the authenticated pubkey for a request, or null if unauthenticated.
 * Always requires a valid NIP-98 signature.
 */
export async function getPubkeyFromRequest(request: Request): Promise<string | null> {
  return verifyNostrAuth(request);
}
