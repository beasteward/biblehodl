import { cpdv, cachedJson, bibleErrorResponse, requireBibleMember } from "../../../lib/cpdv";

interface CpdvBook {
  name: string;
  key: string;
  testament: "OT" | "NT";
  chapterCount: number;
  verseCount: number;
}

// GET /api/bible/books — all books with metadata (already includes testament).
export async function GET(request: Request) {
  const gate = await requireBibleMember(request);
  if ("response" in gate) return gate.response;
  try {
    const { data } = await cpdv<CpdvBook[]>("/books");
    return cachedJson({ books: data });
  } catch (err) {
    return bibleErrorResponse(err);
  }
}
