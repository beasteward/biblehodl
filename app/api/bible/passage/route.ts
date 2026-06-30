import { cpdv, cachedJson, bibleErrorResponse, requireBibleMember } from "../../../lib/cpdv";

interface CpdvVerse {
  book: string;
  chapter: number;
  verse: number;
  text: string;
}

// Parse a human reference like "John 3:16", "John 3:16-18", "John 3", or
// "1 John 2:1" into its parts. Book is everything before the trailing
// chapter[:verse[-verse]] token, so multi-word / number-prefixed names work.
function parseRef(ref: string): { book: string; chapter: number; start?: number; end?: number } | null {
  const m = ref.trim().match(/^(.+?)\s+(\d+)(?::(\d+)(?:-(\d+))?)?$/);
  if (!m) return null;
  const [, book, chapter, start, end] = m;
  return {
    book,
    chapter: Number(chapter),
    start: start ? Number(start) : undefined,
    end: end ? Number(end) : undefined,
  };
}

// GET /api/bible/passage?ref=John+3:16-18
export async function GET(request: Request) {
  const gate = await requireBibleMember(request);
  if ("response" in gate) return gate.response;

  const ref = new URL(request.url).searchParams.get("ref")?.trim();
  if (!ref) return bibleErrorResponse(new Error("missing ref"));

  const parsed = parseRef(ref);
  if (!parsed) return bibleErrorResponse(new Error("unparseable ref"));

  const { book, chapter, start, end } = parsed;
  const b = encodeURIComponent(book);
  let path: string;
  if (start && end) path = `/books/${b}/${chapter}/${start}-${end}`;
  else if (start) path = `/books/${b}/${chapter}/${start}`;
  else path = `/books/${b}/${chapter}`;

  try {
    const { data } = await cpdv<CpdvVerse | CpdvVerse[]>(path);
    const verses = Array.isArray(data) ? data : [data];
    return cachedJson({ ref, book, chapter, verses });
  } catch (err) {
    return bibleErrorResponse(err);
  }
}
