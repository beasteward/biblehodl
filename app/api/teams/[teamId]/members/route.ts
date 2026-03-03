// GET /api/teams/[teamId]/members — list members
// POST /api/teams/[teamId]/members — add a member (admin/owner only)
// DELETE /api/teams/[teamId]/members — remove a member (admin/owner only)

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { getPubkeyFromRequest } from "../../../../lib/auth";

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
  if (!membership) {
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }

  const members = await prisma.member.findMany({
    where: { teamId },
    orderBy: { joinedAt: "asc" },
  });

  return NextResponse.json(members);
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

  // Verify admin/owner
  const membership = await prisma.member.findUnique({
    where: { teamId_pubkey: { teamId, pubkey } },
  });
  if (!membership || membership.role === "member") {
    return NextResponse.json({ error: "Only admins can add members" }, { status: 403 });
  }

  const body = await request.json();
  const { pubkey: newPubkey, role } = body;

  if (!newPubkey || typeof newPubkey !== "string" || newPubkey.length !== 64) {
    return NextResponse.json({ error: "Invalid pubkey (must be 64-char hex)" }, { status: 400 });
  }

  const validRoles = ["member", "admin"];
  const assignRole = validRoles.includes(role) ? role : "member";

  // Can't assign owner role
  if (role === "owner") {
    return NextResponse.json({ error: "Cannot assign owner role" }, { status: 400 });
  }

  const member = await prisma.member.upsert({
    where: { teamId_pubkey: { teamId, pubkey: newPubkey } },
    update: { role: assignRole },
    create: { teamId, pubkey: newPubkey, role: assignRole },
  });

  return NextResponse.json(member, { status: 201 });
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
  if (!membership || membership.role === "member") {
    return NextResponse.json({ error: "Only admins can remove members" }, { status: 403 });
  }

  const body = await request.json();
  const { pubkey: removePubkey } = body;

  // Can't remove the owner
  const target = await prisma.member.findUnique({
    where: { teamId_pubkey: { teamId, pubkey: removePubkey } },
  });
  if (!target) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }
  if (target.role === "owner") {
    return NextResponse.json({ error: "Cannot remove the owner" }, { status: 400 });
  }
  // Admins can't remove other admins, only owners can
  if (target.role === "admin" && membership.role !== "owner") {
    return NextResponse.json({ error: "Only the owner can remove admins" }, { status: 403 });
  }

  await prisma.member.delete({
    where: { teamId_pubkey: { teamId, pubkey: removePubkey } },
  });

  return NextResponse.json({ success: true });
}
