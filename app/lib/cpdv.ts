// Server-only client for the CPDV-Bible API (https://github.com/beasteward/CPDV-Bible).
//
// The browser never talks to CPDV directly. This module owns the upstream
// contract and the `CPDV_API_KEY` secret, and is imported only from
// `app/api/bible/*` route handlers. Keeping the key here (never `NEXT_PUBLIC_`)
// means it is never shipped in the client bundle.
//
// Upstream facts (verified live):
//   - Base path: `/api/v1`
//   - Auth: `X-API-Key` header on EVERY endpoint (401 without it).
//   - Envelope: `{ "status": "ok", "data": ..., "meta"?: ... }`.

import { NextResponse } from "next/server";
import { getPubkeyFromRequest } from "./auth";
import { prisma } from "./prisma";

const BASE = process.env.CPDV_API_URL;
const KEY = process.env.CPDV_API_KEY;

// Bible text is immutable public-domain data, so cacheable responses can sit in
// the browser/CDN for a day and revalidate in the background for a week.
export const IMMUTABLE_CACHE = "public, max-age=86400, stale-while-revalidate=604800";
// Search results are derived but cheap to revalidate; keep them briefly.
export const SHORT_CACHE = "public, max-age=60, stale-while-revalidate=300";

/** Whether the Bible feature is configured for this deployment. */
export function isBibleConfigured(): boolean {
  return Boolean(BASE && KEY);
}

/** Error carrying the HTTP status the route handler should surface. */
export class CpdvError extends Error {
  constructor(public status: number, message?: string) {
    super(message ?? `CPDV upstream error ${status}`);
    this.name = "CpdvError";
  }
}

export interface CpdvEnvelope<T> {
  status: string;
  data: T;
  meta?: Record<string, unknown>;
}

interface CpdvOpts {
  /** Next Data Cache revalidation. `false` (default) ⇒ cache indefinitely. */
  revalidate?: number | false;
  /** Bypass all caching (e.g. /random). */
  noStore?: boolean;
}

/**
 * Call a CPDV endpoint and return the parsed envelope. Throws `CpdvError` on
 * misconfiguration, non-2xx upstream, or a non-"ok" envelope.
 */
export async function cpdv<T>(path: string, opts: CpdvOpts = {}): Promise<CpdvEnvelope<T>> {
  if (!BASE || !KEY) throw new CpdvError(503, "Bible API not configured");

  const init: RequestInit & { next?: { revalidate?: number | false } } = {
    headers: { "X-API-Key": KEY },
  };
  if (opts.noStore) init.cache = "no-store";
  else init.next = { revalidate: opts.revalidate ?? false };

  let res: Response;
  try {
    res = await fetch(`${BASE}/api/v1${path}`, init);
  } catch {
    throw new CpdvError(502, "Bible API unreachable");
  }
  if (!res.ok) throw new CpdvError(res.status === 404 ? 404 : 502);

  const json = (await res.json()) as CpdvEnvelope<T>;
  if (json?.status !== "ok") throw new CpdvError(502, "Bad upstream envelope");
  return json;
}

/** JSON response with a cache-control header for proxied, cacheable data. */
export function cachedJson(data: unknown, cacheControl: string = IMMUTABLE_CACHE) {
  return NextResponse.json(data, { headers: { "Cache-Control": cacheControl } });
}

/** Map a thrown error to the appropriate NextResponse for a Bible route. */
export function bibleErrorResponse(err: unknown) {
  if (err instanceof CpdvError) {
    if (err.status === 404) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (err.status === 503) return NextResponse.json({ error: "Bible not configured" }, { status: 503 });
    return NextResponse.json({ error: "Bible service unavailable" }, { status: 502 });
  }
  return NextResponse.json({ error: "Bible service unavailable" }, { status: 502 });
}

/**
 * Auth + membership gate shared by every `/api/bible/*` route. Mirrors the
 * LiveKit room route: a valid NIP-98 signature establishes the pubkey, which
 * must belong to a registered community member.
 *
 * Returns `{ pubkey }` on success, or `{ response }` to return immediately.
 */
export async function requireBibleMember(
  request: Request
): Promise<{ pubkey: string } | { response: NextResponse }> {
  const pubkey = await getPubkeyFromRequest(request);
  if (!pubkey) {
    return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const member = await prisma.member.findFirst({ where: { pubkey }, select: { id: true } });
  if (!member) {
    return { response: NextResponse.json({ error: "Not a community member" }, { status: 403 }) };
  }
  return { pubkey };
}
