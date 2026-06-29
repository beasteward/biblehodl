import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { getPubkeyFromRequest } from "../../../../lib/auth";
import { normalizePubkey } from "../../../../lib/pubkey";
import { sendPushToPubkeys } from "../../../../lib/web-push";

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
  const requesterPubkey = await getPubkeyFromRequest(req);
  if (!requesterPubkey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();

  // Bootstrap: if the channel has no members yet, the requester (the channel
  // creator, who claims ownership right after publishing kind 40) becomes
  // owner. This MUST run before the owner/admin check below, otherwise no one
  // can ever become the first owner (chicken-and-egg).
  const memberCount = await prisma.channelMember.count({ where: { channelId } });
  if (memberCount === 0) {
    try {
      await prisma.channelMember.create({
        data: { channelId, pubkey: requesterPubkey, role: "owner" },
      });
    } catch {
      // already exists — race, ignore
    }
    return NextResponse.json({ added: 1 });
  }

  // For a channel that already has members, only owner/admin may add others.
  const requester = await prisma.channelMember.findUnique({
    where: { channelId_pubkey: { channelId, pubkey: requesterPubkey } },
  });
  if (!requester || !["owner", "admin"].includes(requester.role)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const rawPubkeys: unknown[] = Array.isArray(body.pubkeys) ? body.pubkeys : [body.pubkey];

  // Normalize npub/hex -> canonical hex; reject if nothing valid was supplied.
  const pubkeys: string[] = [];
  let sawInvalid = false;
  for (const raw of rawPubkeys) {
    const hex = normalizePubkey(raw);
    if (hex) pubkeys.push(hex);
    else if (raw) sawInvalid = true;
  }

  if (pubkeys.length === 0) {
    return NextResponse.json(
      { error: sawInvalid ? "Invalid pubkey (must be an npub or 64-char hex)" : "No pubkey provided" },
      { status: 400 }
    );
  }

  const added = [];
  for (const pubkey of pubkeys) {
    try {
      const cm = await prisma.channelMember.create({
        data: { channelId, pubkey, role: "member" },
      });
      added.push(cm);
    } catch {
      // already exists — skip
    }
  }

  // Fire a Web Push to everyone just added (fire-and-forget; the server can't
  // read channel content, but "you were added" is a legitimate server event).
  const addedPubkeys = added.map((a) => a.pubkey);
  if (addedPubkeys.length) {
    void sendPushToPubkeys(addedPubkeys, {
      title: "Added to a channel",
      body: "You've been added to a new channel in your community.",
      url: `/?view=chat&channel=${encodeURIComponent(channelId)}`,
      tag: `channel-add-${channelId}`,
    }).catch(() => {});
  }

  // Return the canonical hex pubkeys actually added so the client can publish
  // membership notifications to exactly those users.
  return NextResponse.json({ added: added.length, pubkeys: addedPubkeys });
}
