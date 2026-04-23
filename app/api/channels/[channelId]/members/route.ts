import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// GET /api/channels/[channelId]/members — list members
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ channelId: string }> }
) {
  const { channelId } = await params;

  const members = await prisma.channelMember.findMany({
    where: { channelId },
    orderBy: { joinedAt: "asc" },
  });

  // Enrich with profile info from Member table
  const enriched = await Promise.all(
    members.map(async (cm) => {
      const member = await prisma.member.findFirst({
        where: { pubkey: cm.pubkey },
      });
      return {
        pubkey: cm.pubkey,
        role: cm.role,
        joinedAt: cm.joinedAt,
        firstName: member?.firstName || "",
        lastName: member?.lastName || "",
        email: member?.email || "",
      };
    })
  );

  return NextResponse.json({ members: enriched });
}

// POST /api/channels/[channelId]/members — add member(s)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ channelId: string }> }
) {
  const { channelId } = await params;
  const requesterPubkey = req.headers.get("x-pubkey");
  if (!requesterPubkey) {
    return NextResponse.json({ error: "Missing x-pubkey header" }, { status: 401 });
  }

  // Check requester is owner or admin
  const requester = await prisma.channelMember.findUnique({
    where: { channelId_pubkey: { channelId, pubkey: requesterPubkey } },
  });
  if (!requester || !["owner", "admin"].includes(requester.role)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const body = await req.json();

  // Bootstrap: if channel has no members yet, the requester becomes owner
  const memberCount = await prisma.channelMember.count({ where: { channelId } });
  if (memberCount === 0) {
    // First member — make them owner
    try {
      await prisma.channelMember.create({
        data: { channelId, pubkey: requesterPubkey, role: body.role || "owner" },
      });
    } catch {
      // already exists
    }
    return NextResponse.json({ added: 1 });
  }

  const pubkeys: string[] = Array.isArray(body.pubkeys) ? body.pubkeys : [body.pubkey];

  const added = [];
  for (const pubkey of pubkeys) {
    if (!pubkey) continue;
    try {
      const cm = await prisma.channelMember.create({
        data: { channelId, pubkey, role: "member" },
      });
      added.push(cm);
    } catch {
      // already exists — skip
    }
  }

  return NextResponse.json({ added: added.length });
}
