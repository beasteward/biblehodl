// POST /api/teams/[teamId]/sync-relay — sync all team members to the relay whitelist (admin only)

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { getPubkeyFromRequest } from "../../../../lib/auth";
import { syncRelayWhitelist } from "../../../../lib/relay-sync";

export async function POST(
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
  if (!membership || membership.role === "member") {
    return NextResponse.json({ error: "Only admins can sync the relay" }, { status: 403 });
  }

  // Get all members for count
  const members = await prisma.member.findMany({
    where: { teamId },
    select: { pubkey: true },
  });

  // Sync full whitelist
  const synced = await syncRelayWhitelist();

  return NextResponse.json({
    success: true,
    totalMembers: members.length,
    synced: synced.length,
  });
}
