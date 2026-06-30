import { cpdv, cachedJson, bibleErrorResponse, requireBibleMember, SHORT_CACHE, type CpdvEnvelope } from "../../../lib/cpdv";

interface CpdvSearchVerse {
  book: string;
  chapter: number;
  verse: number;
  text: string;
  snippet?: string;
}

// GET /api/bible/search?q=&book=&testament=&limit=&offset=
export async function GET(request: Request) {
  const gate = await requireBibleMember(request);
  if ("response" in gate) return gate.response;

  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim();
  if (!q) {
    return cachedJson({ results: [], total: 0 }, SHORT_CACHE);
  }

  // Forward only the supported, whitelisted params upstream.
  const upstream = new URLSearchParams({ q });
  for (const key of ["book", "testament", "limit", "offset"]) {
    const v = url.searchParams.get(key);
    if (v) upstream.set(key, v);
  }

  try {
    const res = (await cpdv<CpdvSearchVerse[]>(`/search?${upstream.toString()}`, {
      revalidate: 60,
    })) as CpdvEnvelope<CpdvSearchVerse[]>;
    return cachedJson(
      { results: res.data, total: (res.meta?.total as number) ?? res.data.length },
      SHORT_CACHE
    );
  } catch (err) {
    return bibleErrorResponse(err);
  }
}
