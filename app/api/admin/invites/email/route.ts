import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { getPubkeyFromRequest } from "../../../../lib/auth";
import { isAdminOfAnyTeam } from "../../../../lib/membership";
import { isMailConfigured, sendInviteEmail, appBaseUrl } from "../../../../lib/mailer";

// Lightweight probe so the client can show/hide the email UI.
export async function GET(request: Request) {
  const pubkey = await getPubkeyFromRequest(request);
  if (!pubkey) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const isAdmin = await isAdminOfAnyTeam(pubkey);
  if (!isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ configured: isMailConfigured() });
}

// Email an existing invite code to a recipient.
export async function POST(request: Request) {
  const pubkey = await getPubkeyFromRequest(request);
  if (!pubkey) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const isAdmin = await isAdminOfAnyTeam(pubkey);
  if (!isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (!isMailConfigured()) {
    return NextResponse.json({ error: "email_not_configured" }, { status: 503 });
  }

  let inviteId: string | undefined;
  let toEmail: string | undefined;
  let recipientName: string | undefined;
  try {
    const body = await request.json();
    if (typeof body?.inviteId === "string") inviteId = body.inviteId.trim();
    if (typeof body?.toEmail === "string") toEmail = body.toEmail.trim();
    if (typeof body?.recipientName === "string" && body.recipientName.trim()) {
      recipientName = body.recipientName.trim();
    }
  } catch {
    // fall through to validation below
  }

  if (!inviteId || !toEmail) {
    return NextResponse.json({ error: "inviteId and toEmail are required" }, { status: 400 });
  }
  // Basic email shape check.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(toEmail)) {
    return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
  }

  const invite = await prisma.invite.findUnique({
    where: { id: inviteId },
    include: { team: { select: { name: true } } },
  });
  if (!invite) return NextResponse.json({ error: "Invite not found" }, { status: 404 });

  // The admin must belong to the invite's team (admins are scoped to their team).
  const membership = await prisma.member.findFirst({
    where: { pubkey, teamId: invite.teamId, role: { in: ["owner", "admin"] } },
  });
  if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (invite.usedBy) {
    return NextResponse.json({ error: "Invite has already been used" }, { status: 409 });
  }
  if (new Date(invite.expiresAt) < new Date()) {
    return NextResponse.json({ error: "Invite has expired" }, { status: 409 });
  }

  try {
    const joinUrl = `${appBaseUrl()}/join?invite=${encodeURIComponent(invite.code)}`;
    await sendInviteEmail({
      to: toEmail,
      code: invite.code,
      teamName: invite.team?.name ?? "the community",
      joinUrl,
      expiresAt: invite.expiresAt,
      recipientName,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to send email";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const updated = await prisma.invite.update({
    where: { id: invite.id },
    data: { sentTo: toEmail, sentAt: new Date() },
    include: { team: { select: { name: true } } },
  });

  return NextResponse.json({ invite: updated, emailed: true });
}
