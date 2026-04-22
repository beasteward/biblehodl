import { NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { addPubkeyToRelay } from "../../../lib/relay-sync";

export async function POST(request: Request) {
  try {
    const { pubkey, firstName, lastName, email, inviteCode } = await request.json();

    if (!pubkey || !firstName || !lastName || !email) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Check if already registered
    const existing = await prisma.member.findFirst({ where: { pubkey } });
    if (existing) {
      return NextResponse.json({ error: "Already registered" }, { status: 409 });
    }

    // Bootstrap: if no teams and no members exist, create first team + owner
    const teamCount = await prisma.team.count();
    const memberCount = await prisma.member.count();

    if (teamCount === 0 && memberCount === 0) {
      // First user — bootstrap
      const team = await prisma.team.create({
        data: {
          name: "Community",
          description: "Default community team",
          createdBy: pubkey,
        },
      });

      const member = await prisma.member.create({
        data: {
          teamId: team.id,
          pubkey,
          firstName,
          lastName,
          email,
          role: "owner",
        },
      });

      await addPubkeyToRelay(pubkey);

      return NextResponse.json({
        success: true,
        member: { id: member.id, firstName, lastName, email, role: member.role },
        bootstrap: true,
      });
    }

    // Normal registration — require invite code
    if (!inviteCode) {
      return NextResponse.json({ error: "Invite code required" }, { status: 400 });
    }

    const invite = await prisma.invite.findUnique({ where: { code: inviteCode } });

    if (!invite) {
      return NextResponse.json({ error: "Invalid invite code" }, { status: 400 });
    }
    if (invite.usedBy) {
      return NextResponse.json({ error: "Invite code already used" }, { status: 400 });
    }
    if (invite.expiresAt < new Date()) {
      return NextResponse.json({ error: "Invite code expired" }, { status: 400 });
    }

    // Create member and mark invite used in a transaction
    const member = await prisma.$transaction(async (tx) => {
      const m = await tx.member.create({
        data: {
          teamId: invite.teamId,
          pubkey,
          firstName,
          lastName,
          email,
          role: "member",
        },
      });

      await tx.invite.update({
        where: { id: invite.id },
        data: { usedBy: pubkey, usedAt: new Date() },
      });

      return m;
    });

    await addPubkeyToRelay(pubkey);

    return NextResponse.json({
      success: true,
      member: { id: member.id, firstName, lastName, email, role: member.role },
    });
  } catch (err) {
    console.error("[register] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
