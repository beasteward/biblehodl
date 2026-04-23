import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// DELETE /api/channels/[channelId]/members/[pubkey] — remove member
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ channelId: string; pubkey: string }> }
) {
  const { channelId, pubkey } = await params;
  const requesterPubkey = req.headers.get("x-pubkey");
  if (!requesterPubkey) {
    return NextResponse.json({ error: "Missing x-pubkey header" }, { status: 401 });
  }

  // Self-leave is always allowed
  const isSelf = requesterPubkey === pubkey;

  if (!isSelf) {
    // Only owner/admin can remove others
    const requester = await prisma.channelMember.findUnique({
      where: { channelId_pubkey: { channelId, pubkey: requesterPubkey } },
    });
    if (!requester || !["owner", "admin"].includes(requester.role)) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    // Can't remove the owner
    const target = await prisma.channelMember.findUnique({
      where: { channelId_pubkey: { channelId, pubkey } },
    });
    if (target?.role === "owner") {
      return NextResponse.json({ error: "Cannot remove the channel owner" }, { status: 403 });
    }
  }

  try {
    await prisma.channelMember.delete({
      where: { channelId_pubkey: { channelId, pubkey } },
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }
}
