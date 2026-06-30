import { cpdv, cachedJson, bibleErrorResponse, requireBibleMember } from "../../../../../lib/cpdv";

interface CpdvVerse {
  book: string;
  chapter: number;
  verse: number;
  text: string;
}

// GET /api/bible/books/[book]/[chapter] — all verses in a chapter.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ book: string; chapter: string }> }
) {
  const gate = await requireBibleMember(request);
  if ("response" in gate) return gate.response;
  const { book, chapter } = await params;
  const ch = Number(chapter);
  if (!Number.isInteger(ch) || ch < 1) {
    return bibleErrorResponse(new Error("bad chapter"));
  }
  try {
    const { data } = await cpdv<CpdvVerse[]>(
      `/books/${encodeURIComponent(book)}/${ch}`
    );
    return cachedJson({ verses: data });
  } catch (err) {
    return bibleErrorResponse(err);
  }
}
