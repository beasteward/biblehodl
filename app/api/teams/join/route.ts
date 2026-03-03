// POST /api/teams/join — join a team using an invite code

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { getPubkeyFromRequest } from "../../../lib/auth";

export async function POST(request: NextRequest) {
  const pubkey = getPubkeyFromRequest(request);
  if (!pubkey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { code } = body;

  if (!code) {
    return NextResponse.json({ error: "Invite code is required" }, { status: 400 });
  }

  // Find the invite
  const invite = await prisma.invite.findUnique({
    where: { code: code.toUpperCase() },
    include: { team: true },
  });

  if (!invite) {
    return NextResponse.json({ error: "Invalid invite code" }, { status: 404 });
  }

  if (invite.usedBy) {
    return NextResponse.json({ error: "Invite code has already been used" }, { status: 400 });
  }

  if (invite.expiresAt < new Date()) {
    return NextResponse.json({ error: "Invite code has expired" }, { status: 400 });
  }

  // Check if already a member
  const existing = await prisma.member.findUnique({
    where: { teamId_pubkey: { teamId: invite.teamId, pubkey } },
  });
  if (existing) {
    return NextResponse.json({ error: "You are already a member of this team", team: invite.team }, { status: 400 });
  }

  // Add member and mark invite as used
  const [member] = await prisma.$transaction([
    prisma.member.create({
      data: {
        teamId: invite.teamId,
        pubkey,
        role: "member",
      },
    }),
    prisma.invite.update({
      where: { id: invite.id },
      data: { usedBy: pubkey, usedAt: new Date() },
    }),
  ]);

  return NextResponse.json({
    member,
    team: invite.team,
  }, { status: 201 });
}
