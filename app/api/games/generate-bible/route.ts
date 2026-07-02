// POST /api/games/generate-bible — generate Kahoot-style Bible trivia
// questions from the CPDV Bible API (server-side; the CPDV key never leaves
// the BFF). Member-gated like game creation.
//
// Body: { book?: string | null, count?: number }
//   book  — CPDV book key/name to draw from, or null/omitted for the whole Bible
//   count — number of questions (1–20, default 10)
//
// Question types (rotated):
//   "book"     — Which book is this verse from?        (whole-Bible mode only)
//   "complete" — Complete the verse: "first half …"
//   "ref"      — Which reference is this verse?

import { NextRequest, NextResponse } from "next/server";
import { getPubkeyFromRequest } from "../../../lib/auth";
import { verifyAccess } from "../../../lib/membership";
import { cpdv, isBibleConfigured, CpdvError } from "../../../lib/cpdv";

interface CpdvBook {
  name: string;
  key: string;
  testament: "OT" | "NT";
  chapterCount: number;
  verseCount: number;
}

interface CpdvVerse {
  book: string;
  chapter: number;
  verse: number;
  text: string;
}

interface GeneratedQuestion {
  text: string;
  options: string[];
  correctIndex: number;
}

const MAX_COUNT = 20;
const MIN_COMPLETE_WORDS = 10;

// ─── helpers ───

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function truncateWords(text: string, maxChars: number): string {
  const clean = text.trim();
  if (clean.length <= maxChars) return clean;
  const cut = clean.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 40 ? lastSpace : maxChars)}…`;
}

/** Split a verse ~60% in on a word boundary: [prompt half, answer half]. */
function splitVerse(text: string): [string, string] | null {
  const words = text.trim().split(/\s+/);
  if (words.length < MIN_COMPLETE_WORDS) return null;
  const splitAt = Math.max(4, Math.round(words.length * 0.6));
  if (words.length - splitAt < 3) return null;
  return [words.slice(0, splitAt).join(" "), words.slice(splitAt).join(" ")];
}

/** Ending of a verse to use as a distractor, roughly matching answer length. */
function verseEnding(text: string, targetWords: number): string | null {
  const words = text.trim().split(/\s+/);
  if (words.length < Math.min(6, targetWords)) return null;
  return words.slice(-targetWords).join(" ");
}

function refString(v: CpdvVerse): string {
  return `${v.book} ${v.chapter}:${v.verse}`;
}

async function fetchChapterVerses(bookKey: string, chapter: number): Promise<CpdvVerse[]> {
  const { data } = await cpdv<CpdvVerse[]>(
    `/books/${encodeURIComponent(bookKey)}/${chapter}`
  );
  return data;
}

// ─── question builders (return null when the source verse doesn't fit) ───

function buildBookQuestion(verse: CpdvVerse, books: CpdvBook[]): GeneratedQuestion | null {
  const correct = books.find((b) => b.name === verse.book || b.key === verse.book);
  if (!correct) return null;
  // Prefer same-testament distractors for difficulty
  const sameTestament = books.filter((b) => b.key !== correct.key && b.testament === correct.testament);
  const pool = sameTestament.length >= 3 ? sameTestament : books.filter((b) => b.key !== correct.key);
  if (pool.length < 3) return null;
  const distractors = shuffle(pool).slice(0, 3).map((b) => b.name);
  const options = shuffle([correct.name, ...distractors]);
  return {
    text: `Which book is this verse from? “${truncateWords(verse.text, 180)}”`,
    options,
    correctIndex: options.indexOf(correct.name),
  };
}

function buildCompleteQuestion(verse: CpdvVerse, chapterVerses: CpdvVerse[]): GeneratedQuestion | null {
  const split = splitVerse(verse.text);
  if (!split) return null;
  const [prompt, answer] = split;
  const answerWords = answer.split(/\s+/).length;

  const distractors: string[] = [];
  for (const v of shuffle(chapterVerses)) {
    if (v.verse === verse.verse) continue;
    const ending = verseEnding(v.text, answerWords);
    if (!ending) continue;
    const norm = ending.toLowerCase();
    if (norm === answer.toLowerCase()) continue;
    if (distractors.some((d) => d.toLowerCase() === norm)) continue;
    distractors.push(ending);
    if (distractors.length === 3) break;
  }
  if (distractors.length < 3) return null;

  const correct = truncateWords(answer, 90);
  const options = shuffle([correct, ...distractors.map((d) => truncateWords(d, 90))]);
  return {
    text: `Complete the verse: “${truncateWords(prompt, 160)} …”`,
    options,
    correctIndex: options.indexOf(correct),
  };
}

function buildRefQuestion(verse: CpdvVerse, book: CpdvBook | undefined): GeneratedQuestion | null {
  const chapterCount = book?.chapterCount ?? verse.chapter + 3;
  const correct = refString(verse);
  const fakes = new Set<string>();
  let guard = 0;
  while (fakes.size < 3 && guard++ < 40) {
    const chapter = Math.max(1, Math.min(chapterCount, verse.chapter + Math.floor(Math.random() * 7) - 3));
    const verseNum = Math.max(1, verse.verse + Math.floor(Math.random() * 11) - 5);
    const fake = `${verse.book} ${chapter}:${verseNum}`;
    if (fake !== correct) fakes.add(fake);
  }
  if (fakes.size < 3) return null;
  const options = shuffle([correct, ...fakes]);
  return {
    text: `Which reference is this verse? “${truncateWords(verse.text, 180)}”`,
    options,
    correctIndex: options.indexOf(correct),
  };
}

// ─── route ───

export async function POST(request: NextRequest) {
  const pubkey = await getPubkeyFromRequest(request);
  if (!pubkey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const hasAccess = await verifyAccess(pubkey);
  if (!hasAccess) {
    return NextResponse.json({ error: "You must be a team member" }, { status: 403 });
  }
  if (!isBibleConfigured()) {
    return NextResponse.json({ error: "Bible not configured" }, { status: 503 });
  }

  let body: { book?: string | null; count?: number };
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const count = Math.max(1, Math.min(MAX_COUNT, Math.round(body.count ?? 10)));

  try {
    const { data: books } = await cpdv<CpdvBook[]>("/books");

    // Resolve requested book (key or name), if any
    let sourceBook: CpdvBook | undefined;
    if (body.book) {
      const needle = String(body.book).toLowerCase();
      sourceBook = books.find((b) => b.key.toLowerCase() === needle || b.name.toLowerCase() === needle);
      if (!sourceBook) {
        return NextResponse.json({ error: "Unknown book" }, { status: 400 });
      }
    }

    // Question types to rotate through
    const types = sourceBook ? (["complete", "ref"] as const) : (["book", "complete", "ref"] as const);

    // Cache chapter fetches within this request
    const chapterCache = new Map<string, CpdvVerse[]>();
    const getChapter = async (bookKey: string, chapter: number) => {
      const cacheKey = `${bookKey}/${chapter}`;
      if (!chapterCache.has(cacheKey)) {
        chapterCache.set(cacheKey, await fetchChapterVerses(bookKey, chapter));
      }
      return chapterCache.get(cacheKey)!;
    };

    /** Draw a random source verse (+its book meta and chapter siblings). */
    const drawVerse = async (): Promise<{ verse: CpdvVerse; book: CpdvBook | undefined; siblings: CpdvVerse[] }> => {
      if (sourceBook) {
        const chapter = 1 + Math.floor(Math.random() * sourceBook.chapterCount);
        const verses = await getChapter(sourceBook.key, chapter);
        if (verses.length === 0) throw new CpdvError(502, "Empty chapter");
        return { verse: pick(verses), book: sourceBook, siblings: verses };
      }
      const { data: verse } = await cpdv<CpdvVerse>("/random", { noStore: true });
      const book = books.find((b) => b.name === verse.book || b.key === verse.book);
      let siblings: CpdvVerse[] = [];
      if (book) {
        try {
          siblings = await getChapter(book.key, verse.chapter);
        } catch {
          siblings = [];
        }
      }
      return { verse, book, siblings };
    };

    const questions: GeneratedQuestion[] = [];
    const usedVerses = new Set<string>();
    const usedQuestionTexts = new Set<string>();
    let attempts = 0;
    let typeIdx = 0;

    while (questions.length < count && attempts < count * 5) {
      attempts++;
      try {
        const { verse, book, siblings } = await drawVerse();
        const verseKey = refString(verse);
        if (usedVerses.has(verseKey)) continue;

        const type = types[typeIdx % types.length];
        let q: GeneratedQuestion | null = null;
        if (type === "book") q = buildBookQuestion(verse, books);
        else if (type === "complete") q = buildCompleteQuestion(verse, siblings);
        else q = buildRefQuestion(verse, book);

        if (!q || usedQuestionTexts.has(q.text)) continue;

        usedVerses.add(verseKey);
        usedQuestionTexts.add(q.text);
        questions.push(q);
        typeIdx++;
      } catch (err) {
        if (err instanceof CpdvError && err.status === 503) throw err;
        // transient upstream hiccup — try another verse
      }
    }

    if (questions.length === 0) {
      return NextResponse.json({ error: "Could not generate questions" }, { status: 502 });
    }

    return NextResponse.json({
      questions,
      source: sourceBook ? sourceBook.name : "Whole Bible",
    });
  } catch (err) {
    if (err instanceof CpdvError) {
      if (err.status === 503) {
        return NextResponse.json({ error: "Bible not configured" }, { status: 503 });
      }
      return NextResponse.json({ error: "Bible service unavailable" }, { status: 502 });
    }
    console.error("[games] bible generation failed:", err);
    return NextResponse.json({ error: "Failed to generate questions" }, { status: 500 });
  }
}
