"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAppStore, type BibleBookmark } from "../../lib/store";
import {
  fetchBooks,
  fetchChapters,
  fetchChapter,
  searchBible,
  fetchVerseOfTheDay,
  formatRef,
  type BibleBook,
  type ChapterMeta,
  type BibleVerse,
} from "../../lib/bible-service";
import ShareVerseModal from "./ShareVerseModal";
import { toggleBibleBookmark, removeBibleBookmark } from "../../lib/bible-bookmark-service";
import { parseScriptureRef } from "../../lib/scripture-ref";

// Module-level stable defaults so store/derived selectors never return a fresh
// reference each render (avoids the React #185 unstable-snapshot trap).
const EMPTY_BOOKS: BibleBook[] = [];

export default function BibleView() {
  const signer = useAppStore((s) => s.signer);
  const bibleLocation = useAppStore((s) => s.bibleLocation);
  const setBibleLocation = useAppStore((s) => s.setBibleLocation);
  const bibleBookmarks = useAppStore((s) => s.bibleBookmarks);
  const bibleNavTarget = useAppStore((s) => s.bibleNavTarget);
  const setBibleNavTarget = useAppStore((s) => s.setBibleNavTarget);

  const [books, setBooks] = useState<BibleBook[]>(EMPTY_BOOKS);
  const [booksError, setBooksError] = useState<string | null>(null);

  const [selectedBook, setSelectedBook] = useState<string | null>(null);
  const [chapters, setChapters] = useState<ChapterMeta[]>([]);
  const [selectedChapter, setSelectedChapter] = useState<number | null>(null);

  const [verses, setVerses] = useState<BibleVerse[]>([]);
  const [readerLoading, setReaderLoading] = useState(false);
  const [readerError, setReaderError] = useState<string | null>(null);
  const [highlightVerse, setHighlightVerse] = useState<number | null>(null);

  const [votd, setVotd] = useState<BibleVerse | null>(null);
  const [fontScale, setFontScale] = useState(1);

  // Verse selection for share-to-chat. Tap a verse number to toggle.
  const [selectedVerses, setSelectedVerses] = useState<Set<number>>(new Set());
  const [shareTarget, setShareTarget] = useState<{ book: string; chapter: number; verses: BibleVerse[] } | null>(null);

  // Search
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<BibleVerse[] | null>(null);
  const [searching, setSearching] = useState(false);

  // Bookmarks browser + in-flight toggle guard.
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [bookmarkBusy, setBookmarkBusy] = useState(false);

  const verseRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const resumedRef = useRef(false);

  // ── Load books + verse-of-the-day once ──
  useEffect(() => {
    if (!signer) return;
    let cancelled = false;
    fetchBooks(signer)
      .then((b) => {
        if (!cancelled) setBooks(b);
      })
      .catch((e) => {
        if (!cancelled) setBooksError(e.message || "Failed to load books");
      });
    fetchVerseOfTheDay(signer)
      .then((v) => {
        if (!cancelled) setVotd(v);
      })
      .catch(() => {
        /* non-fatal */
      });
    return () => {
      cancelled = true;
    };
  }, [signer]);

  // ── Open a book: load its chapter list ──
  const openBook = useCallback(
    (bookKey: string) => {
      if (!signer) return;
      setSelectedBook(bookKey);
      setSelectedChapter(null);
      setChapters([]);
      fetchChapters(signer, bookKey)
        .then(setChapters)
        .catch((e) => setReaderError(e.message || "Failed to load chapters"));
    },
    [signer]
  );

  // ── Open a chapter: load its verses ──
  const openChapter = useCallback(
    (bookKey: string, chapter: number, scrollToVerse?: number) => {
      if (!signer) return;
      setSelectedBook(bookKey);
      setSelectedChapter(chapter);
      setReaderLoading(true);
      setReaderError(null);
      setHighlightVerse(scrollToVerse ?? null);
      setSelectedVerses(new Set());
      fetchChapter(signer, bookKey, chapter)
        .then((v) => {
          setVerses(v);
          setBibleLocation({ book: bookKey, chapter });
        })
        .catch((e) => setReaderError(e.message || "Failed to load chapter"))
        .finally(() => setReaderLoading(false));
    },
    [signer, setBibleLocation]
  );

  // ── Resume last position once books are available ──
  useEffect(() => {
    // A pending deep-link target takes precedence over resume.
    if (resumedRef.current || books.length === 0 || !bibleLocation || bibleNavTarget) return;
    resumedRef.current = true;
    openBook(bibleLocation.book);
    openChapter(bibleLocation.book, bibleLocation.chapter);
  }, [books, bibleLocation, bibleNavTarget, openBook, openChapter]);

  // ── Consume a cross-view deep link (chat ref / reading-plan entry) ──
  useEffect(() => {
    if (!bibleNavTarget || !signer) return;
    const parsed = parseScriptureRef(bibleNavTarget);
    resumedRef.current = true; // don't also run resume afterwards
    setBibleNavTarget(null);
    if (!parsed) return;
    setShowBookmarks(false);
    setQuery("");
    setResults(null);
    openBook(parsed.book);
    openChapter(parsed.book, parsed.chapter, parsed.verse);
  }, [bibleNavTarget, signer, setBibleNavTarget, openBook, openChapter]);

  // ── Scroll to a highlighted verse after render ──
  useEffect(() => {
    if (highlightVerse == null || readerLoading) return;
    const el = verseRefs.current[highlightVerse];
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightVerse, readerLoading, verses]);

  // ── Debounced search ──
  useEffect(() => {
    const q = query.trim();
    if (!signer || q.length < 2) {
      setResults(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    const handle = setTimeout(() => {
      searchBible(signer, q, { limit: 50 })
        .then((r) => setResults(r.results))
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(handle);
  }, [query, signer]);

  const testaments = useMemo(() => {
    const ot = books.filter((b) => b.testament === "OT");
    const nt = books.filter((b) => b.testament === "NT");
    return { ot, nt };
  }, [books]);

  const chapterIndex = selectedChapter ?? null;
  const prevChapter = chapterIndex && chapterIndex > 1 ? chapterIndex - 1 : null;
  const nextChapter =
    chapterIndex && chapters.length > 0 && chapterIndex < chapters.length ? chapterIndex + 1 : null;

  const toggleVerse = (verseNum: number) => {
    setSelectedVerses((prev) => {
      const next = new Set(prev);
      if (next.has(verseNum)) next.delete(verseNum);
      else next.add(verseNum);
      return next;
    });
  };

  const shareSelected = () => {
    if (!selectedBook || selectedChapter == null) return;
    const chosen = verses.filter((v) => selectedVerses.has(v.verse));
    if (chosen.length === 0) return;
    setShareTarget({ book: selectedBook, chapter: selectedChapter, verses: chosen });
  };

  // Build the bookmark for the current selection (single verse or contiguous range).
  const selectionBookmark = useCallback((): BibleBookmark | null => {
    if (!selectedBook || selectedChapter == null) return null;
    const chosen = verses.filter((v) => selectedVerses.has(v.verse)).sort((a, b) => a.verse - b.verse);
    if (chosen.length === 0) return null;
    const first = chosen[0];
    const last = chosen[chosen.length - 1];
    const ref = formatRef(selectedBook, selectedChapter, first.verse, last.verse);
    const snippet = first.text.length > 160 ? first.text.slice(0, 157) + "…" : first.text;
    return {
      ref,
      book: selectedBook,
      chapter: selectedChapter,
      verse: first.verse,
      endVerse: last.verse !== first.verse ? last.verse : undefined,
      snippet,
    };
  }, [selectedBook, selectedChapter, verses, selectedVerses]);

  const selectionRef = useMemo(() => {
    const bm = selectionBookmark();
    return bm?.ref ?? null;
  }, [selectionBookmark]);

  const selectionBookmarked = selectionRef != null && bibleBookmarks.some((b) => b.ref === selectionRef);

  const onToggleBookmark = async () => {
    if (!signer || bookmarkBusy) return;
    const bm = selectionBookmark();
    if (!bm) return;
    setBookmarkBusy(true);
    try {
      await toggleBibleBookmark(signer, bm);
    } finally {
      setBookmarkBusy(false);
    }
  };

  // Verse numbers in the current chapter that begin a saved bookmark.
  const bookmarkedStartVerses = useMemo(() => {
    const set = new Set<number>();
    if (!selectedBook || selectedChapter == null) return set;
    for (const b of bibleBookmarks) {
      if (b.book === selectedBook && b.chapter === selectedChapter) set.add(b.verse);
    }
    return set;
  }, [bibleBookmarks, selectedBook, selectedChapter]);

  const openBookmark = (b: BibleBookmark) => {
    setShowBookmarks(false);
    openBook(b.book);
    openChapter(b.book, b.chapter, b.verse);
  };

  const onRemoveBookmark = async (ref: string) => {
    if (!signer) return;
    await removeBibleBookmark(signer, ref);
  };

  const onResultClick = (v: BibleVerse) => {
    setQuery("");
    setResults(null);
    openBook(v.book);
    openChapter(v.book, v.chapter, v.verse);
  };

  const readerActive = selectedChapter != null;

  // ── Render: book navigator ──
  const Navigator = (
    <div
      className={`${readerActive ? "hidden md:flex" : "flex"} w-full md:w-72 shrink-0 flex-col overflow-y-auto`}
      style={{ borderRight: "1px solid var(--border)" }}
    >
      {booksError && (
        <div className="p-4 text-sm" style={{ color: "var(--danger)" }}>
          {booksError}
        </div>
      )}

      {selectedBook && chapters.length > 0 ? (
        // Chapter grid for the selected book
        <div className="p-3">
          <button
            onClick={() => {
              setSelectedBook(null);
              setChapters([]);
            }}
            className="text-sm mb-3 flex items-center gap-1"
            style={{ color: "var(--accent-light)" }}
          >
            ← All books
          </button>
          <div className="text-sm font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
            {selectedBook}
          </div>
          <div className="grid grid-cols-5 gap-1.5">
            {chapters.map((c) => (
              <button
                key={c.chapter}
                onClick={() => openChapter(selectedBook, c.chapter)}
                className="aspect-square rounded-md text-sm flex items-center justify-center transition-colors"
                style={{
                  background: selectedChapter === c.chapter ? "var(--accent)" : "var(--bg-tertiary)",
                  color: selectedChapter === c.chapter ? "#fff" : "var(--text-secondary)",
                }}
              >
                {c.chapter}
              </button>
            ))}
          </div>
        </div>
      ) : (
        // Book list grouped by testament
        <div className="p-2">
          {[
            { label: "Old Testament", list: testaments.ot },
            { label: "New Testament", list: testaments.nt },
          ].map((group) => (
            <div key={group.label} className="mb-3">
              <div
                className="text-xs font-semibold uppercase tracking-wider px-2 py-1.5"
                style={{ color: "var(--text-muted)" }}
              >
                {group.label}
              </div>
              {group.list.map((b) => (
                <button
                  key={b.key}
                  onClick={() => openBook(b.key)}
                  className="w-full text-left px-3 py-1.5 rounded-md text-sm transition-colors"
                  style={{
                    background: selectedBook === b.key ? "var(--bg-active)" : "transparent",
                    color: selectedBook === b.key ? "var(--text-primary)" : "var(--text-secondary)",
                  }}
                >
                  {b.name}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  // ── Render: reader pane ──
  const Reader = (
    <div className={`${readerActive ? "flex" : "hidden md:flex"} flex-1 flex-col min-w-0`}>
      {!readerActive ? (
        <div className="flex-1 flex items-center justify-center p-8 text-center">
          <div>
            <div className="text-5xl mb-3">📖</div>
            <p style={{ color: "var(--text-muted)" }}>
              Choose a book and chapter to start reading.
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* Reader header */}
          <div
            className="flex items-center gap-3 px-4 py-3 shrink-0"
            style={{ borderBottom: "1px solid var(--border)" }}
          >
            <button
              onClick={() => {
                setSelectedChapter(null);
                openBook(selectedBook!);
              }}
              className="md:hidden text-sm"
              style={{ color: "var(--accent-light)" }}
            >
              ← Books
            </button>
            <h2 className="text-lg font-semibold flex-1 min-w-0 truncate" style={{ color: "var(--text-primary)" }}>
              {selectedBook} {selectedChapter}
            </h2>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setFontScale((s) => Math.max(0.8, s - 0.1))}
                className="w-7 h-7 rounded text-sm"
                style={{ background: "var(--bg-tertiary)", color: "var(--text-secondary)" }}
                title="Smaller text"
              >
                A−
              </button>
              <button
                onClick={() => setFontScale((s) => Math.min(1.6, s + 0.1))}
                className="w-7 h-7 rounded text-sm"
                style={{ background: "var(--bg-tertiary)", color: "var(--text-secondary)" }}
                title="Larger text"
              >
                A+
              </button>
            </div>
          </div>

          {/* Verses */}
          <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6">
            {readerLoading ? (
              <p style={{ color: "var(--text-muted)" }}>Loading…</p>
            ) : readerError ? (
              <div className="text-center py-8">
                <p className="mb-3" style={{ color: "var(--danger)" }}>{readerError}</p>
                <button
                  onClick={() => openChapter(selectedBook!, selectedChapter!)}
                  className="px-4 py-2 rounded-md text-sm font-medium"
                  style={{ background: "var(--accent)", color: "#fff" }}
                >
                  Retry
                </button>
              </div>
            ) : (
              <div className="max-w-2xl mx-auto leading-relaxed" style={{ fontSize: `${fontScale}rem` }}>
                {verses.map((v) => {
                  const isSelected = selectedVerses.has(v.verse);
                  return (
                    <div
                      key={v.verse}
                      ref={(el) => {
                        verseRefs.current[v.verse] = el;
                      }}
                      className="mb-2 rounded px-1 py-0.5 transition-colors"
                      style={{
                        background: isSelected
                          ? "var(--bg-active)"
                          : highlightVerse === v.verse
                          ? "var(--bg-active)"
                          : "transparent",
                        borderLeft: isSelected ? "3px solid var(--accent)" : "3px solid transparent",
                        paddingLeft: "0.5rem",
                      }}
                    >
                      <button
                        onClick={() => toggleVerse(v.verse)}
                        className="mr-1.5 font-semibold align-super rounded px-1"
                        style={{
                          fontSize: "0.7em",
                          color: isSelected ? "#fff" : "var(--accent-light)",
                          background: isSelected ? "var(--accent)" : "transparent",
                        }}
                        title="Tap to select for sharing"
                      >
                        {v.verse}
                      </button>
                      {bookmarkedStartVerses.has(v.verse) && (
                        <span className="mr-1" title="Bookmarked" style={{ color: "var(--accent-light)" }}>
                          ★
                        </span>
                      )}
                      <span style={{ color: "var(--text-primary)" }}>{v.text}</span>
                    </div>
                  );
                })}

                {/* Prev/Next chapter */}
                <div className="flex items-center justify-between mt-8 pt-4" style={{ borderTop: "1px solid var(--border)" }}>
                  <button
                    disabled={!prevChapter}
                    onClick={() => prevChapter && openChapter(selectedBook!, prevChapter)}
                    className="px-3 py-1.5 rounded-md text-sm disabled:opacity-30"
                    style={{ background: "var(--bg-tertiary)", color: "var(--text-secondary)" }}
                  >
                    ← Chapter {prevChapter ?? ""}
                  </button>
                  <button
                    disabled={!nextChapter}
                    onClick={() => nextChapter && openChapter(selectedBook!, nextChapter)}
                    className="px-3 py-1.5 rounded-md text-sm disabled:opacity-30"
                    style={{ background: "var(--bg-tertiary)", color: "var(--text-secondary)" }}
                  >
                    Chapter {nextChapter ?? ""} →
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Top bar: verse-of-the-day + search */}
      <div className="px-4 py-3 shrink-0 flex flex-col gap-2" style={{ borderBottom: "1px solid var(--border)" }}>
        {votd && (
          <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
            <span className="font-semibold" style={{ color: "var(--accent-light)" }}>
              Verse of the day:
            </span>{" "}
            <button
              className="italic hover:underline"
              onClick={() => onResultClick(votd)}
              title="Open passage"
            >
              “{votd.text}” — {formatRef(votd.book, votd.chapter, votd.verse)}
            </button>
            <button
              className="ml-2 not-italic hover:underline"
              onClick={() => setShareTarget({ book: votd.book, chapter: votd.chapter, verses: [votd] })}
              style={{ color: "var(--accent-light)" }}
              title="Share to chat"
            >
              ↗ Share
            </button>
          </div>
        )}
        <div className="flex items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the full text…"
            className="flex-1 px-3 py-2 rounded-md text-sm outline-none"
            style={{ background: "var(--bg-tertiary)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
          />
          <button
            onClick={() => setShowBookmarks((v) => !v)}
            className="shrink-0 px-3 py-2 rounded-md text-sm font-medium flex items-center gap-1.5"
            style={{
              background: showBookmarks ? "var(--accent)" : "var(--bg-tertiary)",
              color: showBookmarks ? "#fff" : "var(--text-secondary)",
              border: "1px solid var(--border)",
            }}
            title="Saved bookmarks"
          >
            ★ <span className="hidden sm:inline">Bookmarks</span>
            {bibleBookmarks.length > 0 && (
              <span
                className="min-w-[18px] h-[18px] flex items-center justify-center rounded-full text-[10px] font-bold px-1"
                style={{ background: showBookmarks ? "rgba(255,255,255,0.25)" : "var(--accent)", color: "#fff" }}
              >
                {bibleBookmarks.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Body: bookmarks browser, search results, or navigator + reader */}
      {showBookmarks ? (
        <div className="flex-1 overflow-y-auto p-4">
          <div className="max-w-2xl mx-auto">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                {bibleBookmarks.length} bookmark{bibleBookmarks.length !== 1 ? "s" : ""} · synced via your relay
              </p>
              <button onClick={() => setShowBookmarks(false)} className="text-sm" style={{ color: "var(--accent-light)" }}>
                Done
              </button>
            </div>
            {bibleBookmarks.length === 0 ? (
              <p className="text-center py-8" style={{ color: "var(--text-muted)" }}>
                No bookmarks yet. Select verses while reading and tap “☆ Bookmark”.
              </p>
            ) : (
              <div className="space-y-2">
                {bibleBookmarks.map((b) => (
                  <div
                    key={b.ref}
                    className="flex items-start gap-2 p-3 rounded-lg"
                    style={{ background: "var(--bg-tertiary)" }}
                  >
                    <button onClick={() => openBookmark(b)} className="flex-1 text-left min-w-0">
                      <div className="text-xs font-semibold mb-1" style={{ color: "var(--accent-light)" }}>
                        {b.ref}
                      </div>
                      {b.snippet && (
                        <div className="text-sm truncate" style={{ color: "var(--text-secondary)" }}>
                          {b.snippet}
                        </div>
                      )}
                    </button>
                    <button
                      onClick={() => onRemoveBookmark(b.ref)}
                      className="shrink-0 w-7 h-7 rounded-md flex items-center justify-center"
                      style={{ color: "var(--text-muted)" }}
                      title="Remove bookmark"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : results !== null || searching ? (
        <div className="flex-1 overflow-y-auto p-4">
          {searching ? (
            <p style={{ color: "var(--text-muted)" }}>Searching…</p>
          ) : results && results.length > 0 ? (
            <div className="max-w-2xl mx-auto space-y-2">
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                {results.length} result{results.length !== 1 ? "s" : ""}
              </p>
              {results.map((v, i) => (
                <button
                  key={`${v.book}-${v.chapter}-${v.verse}-${i}`}
                  onClick={() => onResultClick(v)}
                  className="w-full text-left p-3 rounded-lg transition-colors"
                  style={{ background: "var(--bg-tertiary)" }}
                >
                  <div className="text-xs font-semibold mb-1" style={{ color: "var(--accent-light)" }}>
                    {formatRef(v.book, v.chapter, v.verse)}
                  </div>
                  <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
                    {v.snippet || v.text}
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-center py-8" style={{ color: "var(--text-muted)" }}>
              No results for “{query}”.
            </p>
          )}
        </div>
      ) : (
        <div className="flex-1 flex min-h-0">
          {Navigator}
          {Reader}
        </div>
      )}

      {/* Floating share bar when verses are selected */}
      {readerActive && selectedVerses.size > 0 && (
        <div
          className="fixed left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 px-4 py-2.5 rounded-full shadow-lg bottom-20 md:bottom-6"
          style={{ background: "var(--bg-tertiary)", border: "1px solid var(--border)" }}
        >
          <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
            {selectedVerses.size} verse{selectedVerses.size !== 1 ? "s" : ""} selected
          </span>
          <button
            onClick={onToggleBookmark}
            disabled={bookmarkBusy}
            className="px-3 py-1.5 rounded-full text-sm font-medium disabled:opacity-50"
            style={{
              background: selectionBookmarked ? "var(--accent)" : "var(--bg-active)",
              color: selectionBookmarked ? "#fff" : "var(--text-primary)",
            }}
            title={selectionBookmarked ? "Remove bookmark" : "Save bookmark"}
          >
            {selectionBookmarked ? "★ Saved" : "☆ Bookmark"}
          </button>
          <button
            onClick={shareSelected}
            className="px-3 py-1.5 rounded-full text-sm font-medium"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            ↗ Share to chat
          </button>
          <button
            onClick={() => setSelectedVerses(new Set())}
            className="text-sm"
            style={{ color: "var(--text-muted)" }}
          >
            Clear
          </button>
        </div>
      )}

      {shareTarget && (
        <ShareVerseModal
          book={shareTarget.book}
          chapter={shareTarget.chapter}
          verses={shareTarget.verses}
          onClose={() => setShareTarget(null)}
        />
      )}
    </div>
  );
}
