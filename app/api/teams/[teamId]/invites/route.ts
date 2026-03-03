// POST /api/teams/[teamId]/invites — create an invite code (admin/owner only)
// GET /api/teams/[teamId]/invites — list active invites

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { getPubkeyFromRequest } from "../../../../lib/auth";
import crypto from "crypto";

export async function GET(
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
    return NextResponse.json({ error: "Only admins can view invites" }, { status: 403 });
  }

  const invites = await prisma.invite.findMany({
    where: { teamId },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(invites);
}

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
    return NextResponse.json({ error: "Only admins can create invites" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const expiresInHours = body.expiresInHours || 48;

  const code = crypto.randomBytes(4).toString("hex").toUpperCase();
  const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);

  const invite = await prisma.invite.create({
    data: {
      teamId,
      code,
      createdBy: pubkey,
      expiresAt,
    },
  });

  return NextResponse.json(invite, { status: 201 });
}
