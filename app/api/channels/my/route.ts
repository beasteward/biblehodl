import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// GET /api/channels/my — list channel IDs the user is a member of
export async function GET(req: NextRequest) {
  const pubkey = req.headers.get("x-pubkey");
  if (!pubkey) {
    return NextResponse.json({ error: "Missing x-pubkey header" }, { status: 401 });
  }

  const memberships = await prisma.channelMember.findMany({
    where: { pubkey },
    select: { channelId: true, role: true },
  });

  return NextResponse.json({
    channels: memberships.map((m) => ({ id: m.channelId, role: m.role })),
  });
}
