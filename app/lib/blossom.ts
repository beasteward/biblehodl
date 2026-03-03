// BLOSSOM file upload client
// BUD-02: Upload blobs with signed auth events

import { createEvent } from "./nostr";

const BLOSSOM_URL = process.env.NEXT_PUBLIC_BLOSSOM_URL || "http://localhost:3100";

export interface BlobDescriptor {
  sha256: string;
  size: number;
  type?: string;
  url: string;
  created: number;
}

async function hashFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function uploadBlob(
  file: File,
  privateKey: Uint8Array
): Promise<BlobDescriptor> {
  const hash = await hashFile(file);

  // Create BUD-02 auth event (kind 24242)
  const authEvent = createEvent(
    24242,
    `Upload ${file.name}`,
    [
      ["t", "upload"],
      ["x", hash],
      ["expiration", String(Math.floor(Date.now() / 1000) + 300)],
    ],
    privateKey
  );

  const authHeader = `Nostr ${btoa(JSON.stringify(authEvent))}`;

  const res = await fetch(`${BLOSSOM_URL}/upload`, {
    method: "PUT",
    headers: {
      Authorization: authHeader,
      "Content-Type": file.type || "application/octet-stream",
    },
    body: file,
  });

  if (!res.ok) {
    throw new Error(`Upload failed: ${res.status} ${await res.text()}`);
  }

  return res.json();
}

export async function deleteBlob(
  sha256: string,
  privateKey: Uint8Array
): Promise<void> {
  const authEvent = createEvent(
    24242,
    `Delete ${sha256}`,
    [
      ["t", "delete"],
      ["x", sha256],
      ["expiration", String(Math.floor(Date.now() / 1000) + 300)],
    ],
    privateKey
  );

  const authHeader = `Nostr ${btoa(JSON.stringify(authEvent))}`;

  const res = await fetch(`${BLOSSOM_URL}/${sha256}`, {
    method: "DELETE",
    headers: { Authorization: authHeader },
  });

  if (!res.ok) {
    throw new Error(`Delete failed: ${res.status}`);
  }
}

export async function listBlobs(pubkey?: string): Promise<BlobDescriptor[]> {
  const url = pubkey
    ? `${BLOSSOM_URL}/list/${pubkey}`
    : `${BLOSSOM_URL}/list`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`List failed: ${res.status}`);
  return res.json();
}

export function getBlobUrl(sha256: string): string {
  return `${BLOSSOM_URL}/${sha256}`;
}
