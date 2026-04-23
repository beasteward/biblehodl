import { NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { getPubkeyFromRequest } from "../../../lib/auth";

export async function GET(request: Request) {
  const pubkey = getPubkeyFromRequest(request);
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
  const teamId = searchParams.get("teamId") || caller.teamId;
  const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);

  const where: Record<string, unknown> = { teamId };

  if (query) {
    where.OR = [
      { firstName: { contains: query } },
      { lastName: { contains: query } },
      { email: { contains: query } },
      { pubkey: { startsWith: query } },
    ];
  }

  const members = await prisma.member.findMany({
    where,
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
