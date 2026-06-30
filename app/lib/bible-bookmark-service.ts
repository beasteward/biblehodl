// Bible bookmarks — relay-published as a NIP-51 bookmark set.
//
// The member's bookmarks live in a single parameterized-replaceable event
// (kind 30003) addressed by (kind, pubkey, d="bible-bookmarks"). Each bookmarked
// passage is a custom `ref` tag: ["ref", "<ref>", "<snippet>"]. Because the
// event is replaceable, add/remove rebuilds the whole tag set and republishes —
// the relay keeps only the latest, and the same list syncs to every device the
// member signs in on. Self-sovereign: signed by the member's key, no server DB.

import { pool } from "./relay-pool";
import { useAppStore, type BibleBookmark } from "./store";
import type { Signer } from "./signer";

// NIP-51 "Bookmark sets" — parameterized replaceable.
export const KIND_BOOKMARK_SET = 30003;
export const BIBLE_BOOKMARKS_D = "bible-bookmarks";
const SUB_ID = "bible-bookmarks";

/** Parse a stored ref string ("John 3:16" / "John 3:16-18") into parts. */
export function parseBookmarkRef(ref: string, snippet?: string): BibleBookmark | null {
  const m = ref.trim().match(/^(.+?)\s+(\d+):(\d+)(?:-(\d+))?$/);
  if (!m) return null;
  const [, book, chapter, verse, endVerse] = m;
  return {
    ref,
    book,
    chapter: Number(chapter),
    verse: Number(verse),
    endVerse: endVerse ? Number(endVerse) : undefined,
    snippet: snippet || undefined,
  };
}

function buildTags(list: BibleBookmark[]): string[][] {
  const tags: string[][] = [
    ["d", BIBLE_BOOKMARKS_D],
    ["title", "Bible Bookmarks"],
  ];
  for (const b of list) {
    tags.push(["ref", b.ref, b.snippet ?? ""]);
  }
  return tags;
}

async function publishList(signer: Signer, list: BibleBookmark[]): Promise<number> {
  const signed = await signer.signEvent({
    kind: KIND_BOOKMARK_SET,
    tags: buildTags(list),
    content: "",
  });
  await pool.publish(signed);
  return signed.created_at;
}

/** Subscribe to the member's own bookmark set and hydrate the store. */
export function subscribeToBibleBookmarks(pubkey: string) {
  pool.subscribe(
    SUB_ID,
    [{ kinds: [KIND_BOOKMARK_SET], authors: [pubkey], "#d": [BIBLE_BOOKMARKS_D], limit: 1 }],
    (event) => {
      const store = useAppStore.getState();
      // Replaceable: ignore anything not strictly newer than what we have.
      if (event.created_at < store.bibleBookmarksAt) return;
      const list: BibleBookmark[] = [];
      for (const t of event.tags) {
        if (t[0] === "ref" && t[1]) {
          const parsed = parseBookmarkRef(t[1], t[2]);
          if (parsed) list.push(parsed);
        }
      }
      store.setBibleBookmarks(list, event.created_at);
    }
  );
}

export function isBookmarked(ref: string): boolean {
  return useAppStore.getState().bibleBookmarks.some((b) => b.ref === ref);
}

/** Add a bookmark (no-op if the ref already exists). Republishes the full set. */
export async function addBibleBookmark(signer: Signer, bookmark: BibleBookmark): Promise<void> {
  const store = useAppStore.getState();
  if (store.bibleBookmarks.some((b) => b.ref === bookmark.ref)) return;
  const next = [bookmark, ...store.bibleBookmarks];
  // Optimistic local update; created_at advances so the relay echo won't undo it.
  const at = await publishList(signer, next);
  useAppStore.getState().setBibleBookmarks(next, Math.max(at, store.bibleBookmarksAt + 1));
}

/** Remove a bookmark by ref. Republishes the remaining set. */
export async function removeBibleBookmark(signer: Signer, ref: string): Promise<void> {
  const store = useAppStore.getState();
  const next = store.bibleBookmarks.filter((b) => b.ref !== ref);
  if (next.length === store.bibleBookmarks.length) return;
  const at = await publishList(signer, next);
  useAppStore.getState().setBibleBookmarks(next, Math.max(at, store.bibleBookmarksAt + 1));
}

/** Toggle a bookmark on/off; returns the new state (true = now bookmarked). */
export async function toggleBibleBookmark(signer: Signer, bookmark: BibleBookmark): Promise<boolean> {
  if (isBookmarked(bookmark.ref)) {
    await removeBibleBookmark(signer, bookmark.ref);
    return false;
  }
  await addBibleBookmark(signer, bookmark);
  return true;
}
