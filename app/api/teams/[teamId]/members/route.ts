// GET /api/teams/[teamId]/members — list members
// POST /api/teams/[teamId]/members — add a member (admin/owner only)
// DELETE /api/teams/[teamId]/members — remove a member (admin/owner only)

import { NextRequest, NextResponse } from "next/server";
import { nip19 } from "nostr-tools";
import { prisma } from "../../../../lib/prisma";
import { getPubkeyFromRequest } from "../../../../lib/auth";
import { addPubkeyToRelay, removePubkeyFromRelay } from "../../../../lib/relay-sync";

// Accept either a bech32 npub or a 64-char hex pubkey; return lowercase hex or null.
function normalizePubkey(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const value = input.trim();
  if (/^npub1[a-z0-9]+$/.test(value)) {
    try {
      const decoded = nip19.decode(value);
      if (decoded.type === "npub" && typeof decoded.data === "string") {
        return decoded.data.toLowerCase();
      }
    } catch {
      return null;
    }
    return null;
  }
  if (/^[0-9a-fA-F]{64}$/.test(value)) return value.toLowerCase();
  return null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
) {
  const { teamId } = await params;
  const pubkey = await getPubkeyFromRequest(request);
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
  const pubkey = await getPubkeyFromRequest(request);
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
  const { pubkey: rawPubkey, role } = body;

  const newPubkey = normalizePubkey(rawPubkey);
  if (!newPubkey) {
    return NextResponse.json({ error: "Invalid pubkey (must be an npub or 64-char hex)" }, { status: 400 });
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

  // Sync with private relay whitelist
  await addPubkeyToRelay(newPubkey);

  return NextResponse.json(member, { status: 201 });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
) {
  const { teamId } = await params;
  const pubkey = await getPubkeyFromRequest(request);
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
  const removePubkey = normalizePubkey(body?.pubkey);
  if (!removePubkey) {
    return NextResponse.json({ error: "Invalid pubkey (must be an npub or 64-char hex)" }, { status: 400 });
  }

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

  // Check if this pubkey is still a member of any other team
  const otherMemberships = await prisma.member.count({
    where: { pubkey: removePubkey },
  });
  // Only remove from relay if they're not in any team
  if (otherMemberships === 0) {
    await removePubkeyFromRelay(removePubkey);
  }

  return NextResponse.json({ success: true });
}
