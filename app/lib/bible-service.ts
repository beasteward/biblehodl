// Client-side Bible service. Typed wrappers over the same-origin `/api/bible/*`
// BFF proxy, signed with NIP-98 via `authFetch`. The browser never sees the
// CPDV API key — every call is member-gated server-side.

import type { Signer } from "./signer";
import { authFetch } from "./http-auth";

export interface BibleBook {
  name: string;
  key: string;
  testament: "OT" | "NT";
  chapterCount: number;
  verseCount: number;
}

export interface ChapterMeta {
  chapter: number;
  verseCount: number;
}

export interface BibleVerse {
  book: string;
  chapter: number;
  verse: number;
  text: string;
  /** Present only on search results. */
  snippet?: string;
}

async function getJson<T>(signer: Signer, url: string): Promise<T> {
  const res = await authFetch(signer, url);
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) msg = body.error;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return (await res.json()) as T;
}

/** Whether the Bible feature is configured for this deployment. */
export async function fetchBibleStatus(signer: Signer): Promise<boolean> {
  try {
    const { configured } = await getJson<{ configured: boolean }>(signer, "/api/bible/status");
    return Boolean(configured);
  } catch {
    return false;
  }
}

export async function fetchBooks(signer: Signer): Promise<BibleBook[]> {
  const { books } = await getJson<{ books: BibleBook[] }>(signer, "/api/bible/books");
  return books;
}

export async function fetchChapters(signer: Signer, book: string): Promise<ChapterMeta[]> {
  const { chapters } = await getJson<{ chapters: ChapterMeta[] }>(
    signer,
    `/api/bible/books/${encodeURIComponent(book)}/chapters`
  );
  return chapters;
}

export async function fetchChapter(
  signer: Signer,
  book: string,
  chapter: number
): Promise<BibleVerse[]> {
  const { verses } = await getJson<{ verses: BibleVerse[] }>(
    signer,
    `/api/bible/books/${encodeURIComponent(book)}/${chapter}`
  );
  return verses;
}

export interface SearchOpts {
  book?: string;
  testament?: "OT" | "NT";
  limit?: number;
  offset?: number;
}

export async function searchBible(
  signer: Signer,
  q: string,
  opts: SearchOpts = {}
): Promise<{ results: BibleVerse[]; total: number }> {
  const params = new URLSearchParams({ q });
  if (opts.book) params.set("book", opts.book);
  if (opts.testament) params.set("testament", opts.testament);
  if (opts.limit) params.set("limit", String(opts.limit));
  if (opts.offset) params.set("offset", String(opts.offset));
  return getJson<{ results: BibleVerse[]; total: number }>(
    signer,
    `/api/bible/search?${params.toString()}`
  );
}

export async function fetchVerseOfTheDay(signer: Signer): Promise<BibleVerse> {
  const { verse } = await getJson<{ verse: BibleVerse }>(signer, "/api/bible/verse-of-the-day");
  return verse;
}

export async function fetchPassage(signer: Signer, ref: string): Promise<BibleVerse[]> {
  const { verses } = await getJson<{ verses: BibleVerse[] }>(
    signer,
    `/api/bible/passage?ref=${encodeURIComponent(ref)}`
  );
  return verses;
}

/** "John" + 3 + 16 → "John 3:16"; range when `end` given. */
export function formatRef(book: string, chapter: number, verse?: number, end?: number): string {
  if (verse == null) return `${book} ${chapter}`;
  if (end != null && end !== verse) return `${book} ${chapter}:${verse}-${end}`;
  return `${book} ${chapter}:${verse}`;
}
