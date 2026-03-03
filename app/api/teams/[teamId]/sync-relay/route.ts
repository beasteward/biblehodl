// POST /api/teams/[teamId]/sync-relay — sync all team members to the relay whitelist (admin only)

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { getPubkeyFromRequest } from "../../../../lib/auth";
import { addPubkeyToRelay, getRelayHealth } from "../../../../lib/relay-sync";

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

  // Check relay health
  const health = await getRelayHealth();
  if (!health || health.status !== "ok") {
    return NextResponse.json({ error: "Private relay is not reachable" }, { status: 503 });
  }

  // Get all members and add to relay
  const members = await prisma.member.findMany({
    where: { teamId },
    select: { pubkey: true },
  });

  let synced = 0;
  for (const member of members) {
    const result = await addPubkeyToRelay(member.pubkey);
    if (result?.success) synced++;
  }

  return NextResponse.json({
    success: true,
    totalMembers: members.length,
    synced,
  });
}
