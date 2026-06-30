import { cpdv, cachedJson, bibleErrorResponse, requireBibleMember } from "../../../lib/cpdv";

interface CpdvVerse {
  book: string;
  chapter: number;
  verse: number;
  text: string;
}

// GET /api/bible/verse-of-the-day — deterministic daily verse (cache 1h).
export async function GET(request: Request) {
  const gate = await requireBibleMember(request);
  if ("response" in gate) return gate.response;
  try {
    const { data } = await cpdv<CpdvVerse>("/verse-of-the-day", { revalidate: 3600 });
    return cachedJson({ verse: data }, "public, max-age=3600, stale-while-revalidate=86400");
  } catch (err) {
    return bibleErrorResponse(err);
  }
}
