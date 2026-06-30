import { cpdv, cachedJson, bibleErrorResponse, requireBibleMember } from "../../../../../lib/cpdv";

interface CpdvChapterMeta {
  chapter: number;
  verseCount: number;
}

// GET /api/bible/books/[book]/chapters — chapter list with verse counts.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ book: string }> }
) {
  const gate = await requireBibleMember(request);
  if ("response" in gate) return gate.response;
  const { book } = await params;
  try {
    const { data } = await cpdv<CpdvChapterMeta[]>(`/books/${encodeURIComponent(book)}/chapters`);
    return cachedJson({ chapters: data });
  } catch (err) {
    return bibleErrorResponse(err);
  }
}
