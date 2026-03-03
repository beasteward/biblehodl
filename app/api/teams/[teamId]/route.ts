// GET /api/teams/[teamId] — get team details
// DELETE /api/teams/[teamId] — delete team (owner only)

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { getPubkeyFromRequest } from "../../../lib/auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
) {
  const { teamId } = await params;
  const pubkey = getPubkeyFromRequest(request);
  if (!pubkey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify membership
  const membership = await prisma.member.findUnique({
    where: { teamId_pubkey: { teamId, pubkey } },
  });
  if (!membership) {
    return NextResponse.json({ error: "Not a member of this team" }, { status: 403 });
  }

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: {
      members: { orderBy: { joinedAt: "asc" } },
      invites: {
        where: { usedBy: null, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  return NextResponse.json({ ...team, myRole: membership.role });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
) {
  const { teamId } = await params;
  const pubkey = getPubkeyFromRequest(request);
  if (!pubkey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const membership = await prisma.member.findUnique({
    where: { teamId_pubkey: { teamId, pubkey } },
  });
  if (!membership || membership.role !== "owner") {
    return NextResponse.json({ error: "Only the owner can delete the team" }, { status: 403 });
  }

  await prisma.team.delete({ where: { id: teamId } });
  return NextResponse.json({ success: true });
}
