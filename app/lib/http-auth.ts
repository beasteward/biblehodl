/**
 * Client-side NIP-98 HTTP Auth.
 *
 * Every authenticated request to our own API is signed: a kind-27235 event
 * bound to the request URL + method (+ body hash). Replaces the old, forgeable
 * `x-pubkey` header.
 */

import type { Signer } from "./signer";
import { KIND_HTTP_AUTH } from "./nostr";

async function sha256Hex(data: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(data));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function buildNip98Header(
  signer: Signer,
  absoluteUrl: string,
  method: string,
  body?: string
): Promise<string> {
  const tags: string[][] = [
    ["u", absoluteUrl],
    ["method", method.toUpperCase()],
  ];
  if (body) tags.push(["payload", await sha256Hex(body)]);

  const event = await signer.signEvent({
    kind: KIND_HTTP_AUTH,
    content: "",
    tags,
  });
  return `Nostr ${btoa(JSON.stringify(event))}`;
}

/**
 * `fetch` wrapper that attaches a NIP-98 Authorization header signed by `signer`.
 */
export async function authFetch(
  signer: Signer,
  input: string,
  init: RequestInit = {}
): Promise<Response> {
  const method = (init.method || "GET").toUpperCase();
  const body = typeof init.body === "string" ? init.body : undefined;
  const absoluteUrl = new URL(input, window.location.origin).toString();

  const authHeader = await buildNip98Header(signer, absoluteUrl, method, body);
  const headers = new Headers(init.headers);
  headers.set("Authorization", authHeader);

  return fetch(input, { ...init, headers });
}
