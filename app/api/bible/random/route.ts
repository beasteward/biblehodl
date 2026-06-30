import { NextResponse } from "next/server";
import { cpdv, bibleErrorResponse, requireBibleMember } from "../../../lib/cpdv";

interface CpdvVerse {
  book: string;
  chapter: number;
  verse: number;
  text: string;
}

// GET /api/bible/random — a random verse (never cached).
export async function GET(request: Request) {
  const gate = await requireBibleMember(request);
  if ("response" in gate) return gate.response;
  try {
    const { data } = await cpdv<CpdvVerse>("/random", { noStore: true });
    return NextResponse.json({ verse: data }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return bibleErrorResponse(err);
  }
}
