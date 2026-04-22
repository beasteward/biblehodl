import { NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { getPubkeyFromRequest } from "../../../lib/auth";
import { isAdminOfAnyTeam } from "../../../lib/membership";
import { removePubkeyFromRelay } from "../../../lib/relay-sync";

export async function GET(request: Request) {
  const pubkey = getPubkeyFromRequest(request);
  if (!pubkey) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const isAdmin = await isAdminOfAnyTeam(pubkey);
  if (!isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const members = await prisma.member.findMany({
    orderBy: { joinedAt: "desc" },
    include: { team: { select: { name: true } } },
  });

  return NextResponse.json({ members });
}

export async function DELETE(request: Request) {
  const pubkey = getPubkeyFromRequest(request);
  if (!pubkey) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const isAdmin = await isAdminOfAnyTeam(pubkey);
  if (!isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { memberId } = await request.json();
  if (!memberId) return NextResponse.json({ error: "Missing memberId" }, { status: 400 });

  const member = await prisma.member.findUnique({ where: { id: memberId } });
  if (!member) return NextResponse.json({ error: "Member not found" }, { status: 404 });

  // Prevent removing yourself
  if (member.pubkey === pubkey) {
    return NextResponse.json({ error: "Cannot remove yourself" }, { status: 400 });
  }

  // Prevent removing owners
  if (member.role === "owner") {
    return NextResponse.json({ error: "Cannot remove an owner" }, { status: 400 });
  }

  await prisma.member.delete({ where: { id: memberId } });

  // Check if this pubkey still has any memberships
  const remaining = await prisma.member.count({ where: { pubkey: member.pubkey } });
  if (remaining === 0) {
    await removePubkeyFromRelay(member.pubkey);
  }

  return NextResponse.json({ success: true });
}
