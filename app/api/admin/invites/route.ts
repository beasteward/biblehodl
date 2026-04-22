import { NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { getPubkeyFromRequest } from "../../../lib/auth";
import { isAdminOfAnyTeam } from "../../../lib/membership";
import crypto from "crypto";

export async function GET(request: Request) {
  const pubkey = getPubkeyFromRequest(request);
  if (!pubkey) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const isAdmin = await isAdminOfAnyTeam(pubkey);
  if (!isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const invites = await prisma.invite.findMany({
    orderBy: { createdAt: "desc" },
    include: { team: { select: { name: true } } },
  });

  return NextResponse.json({ invites });
}

export async function POST(request: Request) {
  const pubkey = getPubkeyFromRequest(request);
  if (!pubkey) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const isAdmin = await isAdminOfAnyTeam(pubkey);
  if (!isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Find the team this admin belongs to
  const membership = await prisma.member.findFirst({
    where: { pubkey, role: { in: ["owner", "admin"] } },
  });
  if (!membership) return NextResponse.json({ error: "No team found" }, { status: 400 });

  const code = crypto.randomBytes(6).toString("hex"); // 12-char hex code
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  const invite = await prisma.invite.create({
    data: {
      teamId: membership.teamId,
      code,
      createdBy: pubkey,
      expiresAt,
    },
  });

  return NextResponse.json({ invite });
}
