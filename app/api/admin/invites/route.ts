import { NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { getPubkeyFromRequest } from "../../../lib/auth";
import { isAdminOfAnyTeam } from "../../../lib/membership";
import { isMailConfigured, sendInviteEmail, appBaseUrl } from "../../../lib/mailer";
import crypto from "crypto";

export async function GET(request: Request) {
  const pubkey = await getPubkeyFromRequest(request);
  if (!pubkey) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const isAdmin = await isAdminOfAnyTeam(pubkey);
  if (!isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const invites = await prisma.invite.findMany({
    orderBy: { createdAt: "desc" },
    include: { team: { select: { name: true } } },
  });

  // Tell the client whether the email feature is available so it can show/hide UI.
  return NextResponse.json({ invites, emailEnabled: isMailConfigured() });
}

export async function POST(request: Request) {
  const pubkey = await getPubkeyFromRequest(request);
  if (!pubkey) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const isAdmin = await isAdminOfAnyTeam(pubkey);
  if (!isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Optional body: { email?, recipientName? } to create-and-email in one step.
  let email: string | undefined;
  let recipientName: string | undefined;
  try {
    const body = await request.json();
    if (body && typeof body === "object") {
      if (typeof body.email === "string" && body.email.trim()) email = body.email.trim();
      if (typeof body.recipientName === "string" && body.recipientName.trim()) {
        recipientName = body.recipientName.trim();
      }
    }
  } catch {
    // no body / not JSON — plain create
  }

  // Find the team this admin belongs to
  const membership = await prisma.member.findFirst({
    where: { pubkey, role: { in: ["owner", "admin"] } },
  });
  if (!membership) return NextResponse.json({ error: "No team found" }, { status: 400 });

  if (email && !isMailConfigured()) {
    return NextResponse.json({ error: "email_not_configured" }, { status: 503 });
  }

  const code = crypto.randomBytes(6).toString("hex"); // 12-char hex code
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  const invite = await prisma.invite.create({
    data: {
      teamId: membership.teamId,
      code,
      createdBy: pubkey,
      expiresAt,
    },
    include: { team: { select: { name: true } } },
  });

  // Best-effort email on create. If it fails we still return the created invite
  // (the admin can copy the link or retry email from the row).
  let emailed = false;
  let emailError: string | undefined;
  if (email) {
    try {
      const joinUrl = `${appBaseUrl()}/join?invite=${encodeURIComponent(code)}`;
      await sendInviteEmail({
        to: email,
        code,
        teamName: invite.team?.name ?? "the community",
        joinUrl,
        expiresAt,
        recipientName,
      });
      const updated = await prisma.invite.update({
        where: { id: invite.id },
        data: { sentTo: email, sentAt: new Date() },
        include: { team: { select: { name: true } } },
      });
      return NextResponse.json({ invite: updated, emailed: true });
    } catch (e) {
      emailError = e instanceof Error ? e.message : "send_failed";
    }
  }

  return NextResponse.json({ invite, emailed, emailError });
}
