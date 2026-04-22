import { NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { getPubkeyFromRequest } from "../../../lib/auth";

export async function GET(request: Request) {
  const pubkey = getPubkeyFromRequest(request);
  if (!pubkey) {
    return NextResponse.json({ error: "Missing pubkey" }, { status: 401 });
  }

  const member = await prisma.member.findFirst({
    where: { pubkey },
    select: { id: true, firstName: true, lastName: true, email: true, role: true, teamId: true },
  });

  if (!member) {
    return NextResponse.json({ registered: false, member: null });
  }

  return NextResponse.json({
    registered: true,
    member: {
      id: member.id,
      firstName: member.firstName,
      lastName: member.lastName,
      email: member.email,
      role: member.role,
      teamId: member.teamId,
    },
  });
}
