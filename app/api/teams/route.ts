// GET /api/teams — list teams the user belongs to
// POST /api/teams — create a new team

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../lib/prisma";
import { getPubkeyFromRequest } from "../../lib/auth";

export async function GET(request: NextRequest) {
  const pubkey = getPubkeyFromRequest(request);
  if (!pubkey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const memberships = await prisma.member.findMany({
    where: { pubkey },
    include: {
      team: {
        include: {
          _count: { select: { members: true } },
        },
      },
    },
  });

  const teams = memberships.map((m) => ({
    ...m.team,
    role: m.role,
    memberCount: m.team._count.members,
  }));

  return NextResponse.json(teams);
}

export async function POST(request: NextRequest) {
  const pubkey = getPubkeyFromRequest(request);
  if (!pubkey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { name, description, relayUrl } = body;

  if (!name?.trim()) {
    return NextResponse.json({ error: "Team name is required" }, { status: 400 });
  }

  const team = await prisma.team.create({
    data: {
      name: name.trim(),
      description: description?.trim() || "",
      relayUrl: relayUrl?.trim() || "",
      createdBy: pubkey,
      members: {
        create: {
          pubkey,
          role: "owner",
        },
      },
    },
    include: {
      members: true,
    },
  });

  return NextResponse.json(team, { status: 201 });
}
