import { NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { getPubkeyFromRequest } from "../../../lib/auth";

export async function GET(request: Request) {
  const pubkey = await getPubkeyFromRequest(request);
  if (!pubkey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify caller is a registered member
  const caller = await prisma.member.findFirst({ where: { pubkey } });
  if (!caller) {
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim() || "";
  const scope = searchParams.get("scope") || "team";
  const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);

  const queryFilter = query
    ? {
        OR: [
          { firstName: { contains: query } },
          { lastName: { contains: query } },
          { email: { contains: query } },
          { pubkey: { startsWith: query } },
        ],
      }
    : {};

  // ─── Directory scope: search registered users across all teams ───
  // Used when adding people to a team. Returns distinct users (by pubkey),
  // optionally excluding those already in `excludeTeamId`.
  if (scope === "directory") {
    const excludeTeamId = searchParams.get("excludeTeamId") || "";

    let excludePubkeys: string[] = [];
    if (excludeTeamId) {
      const existing = await prisma.member.findMany({
        where: { teamId: excludeTeamId },
        select: { pubkey: true },
      });
      excludePubkeys = existing.map((m) => m.pubkey);
    }

    const rows = await prisma.member.findMany({
      where: {
        ...queryFilter,
        ...(excludePubkeys.length ? { pubkey: { notIn: excludePubkeys } } : {}),
      },
      select: {
        id: true,
        pubkey: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
        joinedAt: true,
      },
      orderBy: { firstName: "asc" },
      take: 200,
    });

    // Dedupe by pubkey (a user may belong to multiple teams)
    const seen = new Set<string>();
    const members = [];
    for (const r of rows) {
      if (seen.has(r.pubkey)) continue;
      seen.add(r.pubkey);
      // Don't leak per-team role in directory results
      members.push({ ...r, role: "member" });
      if (members.length >= limit) break;
    }

    return NextResponse.json({ members });
  }

  // ─── Team scope (default): members of a single team ───
  const teamId = searchParams.get("teamId") || caller.teamId;

  const members = await prisma.member.findMany({
    where: { teamId, ...queryFilter },
    select: {
      id: true,
      pubkey: true,
      firstName: true,
      lastName: true,
      email: true,
      role: true,
      joinedAt: true,
    },
    orderBy: { firstName: "asc" },
    take: limit,
  });

  return NextResponse.json({ members });
}
