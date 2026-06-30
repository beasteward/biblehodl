import { NextResponse } from "next/server";
import { isBibleConfigured, requireBibleMember } from "../../../lib/cpdv";

// GET /api/bible/status
// Lightweight, no upstream call — lets the client hide the Bible nav entirely
// when the feature isn't configured for this deployment.
export async function GET(request: Request) {
  const gate = await requireBibleMember(request);
  if ("response" in gate) return gate.response;
  return NextResponse.json({ configured: isBibleConfigured() });
}
