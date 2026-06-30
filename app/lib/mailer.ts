// Server-only email transport (BYO mailbox via SMTP).
//
// The instance operator configures SMTP once via environment variables; team
// admins never touch mail config. If SMTP is not configured the invite-email
// feature stays dormant (the UI hides it and the route returns 503).
//
// Required env (set in /opt/biblehodl/.env, then `docker compose up -d app`):
//   SMTP_HOST       e.g. smtp.gmail.com
//   SMTP_PORT       e.g. 465 (SSL) or 587 (STARTTLS)
//   SMTP_USER       mailbox login
//   SMTP_PASS       mailbox password / app-password
//   SMTP_FROM       From header, e.g. "BibleHodl <community@example.com>"
// Optional:
//   SMTP_SECURE     "true" to force TLS-on-connect (defaults true for port 465)
//   NEXT_PUBLIC_APP_URL  base URL for building the /join link (e.g. https://biblehodl.com)

// NOTE: only import this module from server-side route handlers — it reads SMTP
// secrets from process.env and must never be bundled into client code.
import nodemailer, { type Transporter } from "nodemailer";

function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : undefined;
}

/** True only when every required SMTP field is present. */
export function isMailConfigured(): boolean {
  return Boolean(env("SMTP_HOST") && env("SMTP_USER") && env("SMTP_PASS") && env("SMTP_FROM"));
}

let cached: Transporter | null = null;

function getTransport(): Transporter {
  if (cached) return cached;
  const host = env("SMTP_HOST");
  const user = env("SMTP_USER");
  const pass = env("SMTP_PASS");
  if (!host || !user || !pass) {
    throw new Error("SMTP is not configured");
  }
  const port = Number(env("SMTP_PORT") ?? "465");
  const secureEnv = env("SMTP_SECURE");
  const secure = secureEnv ? secureEnv === "true" : port === 465;
  cached = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });
  return cached;
}

/** Base app URL used to build the registration link. Falls back to localhost in dev. */
export function appBaseUrl(): string {
  return (env("NEXT_PUBLIC_APP_URL") ?? "http://localhost:3000").replace(/\/+$/, "");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface InviteEmailParams {
  to: string;
  code: string;
  teamName: string;
  joinUrl: string;
  expiresAt: Date;
  recipientName?: string;
}

function renderInviteEmail(p: InviteEmailParams): { subject: string; text: string; html: string } {
  const greeting = p.recipientName ? `Hi ${p.recipientName},` : "Hello,";
  const expires = p.expiresAt.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const subject = `You're invited to join ${p.teamName}`;

  const text = [
    greeting,
    "",
    `You've been invited to join ${p.teamName} on BibleHodl.`,
    "",
    `Your invite code: ${p.code}`,
    "",
    `Register here (code pre-filled): ${p.joinUrl}`,
    "",
    `This invite expires on ${expires}.`,
  ].join("\n");

  const eName = escapeHtml(p.teamName);
  const eCode = escapeHtml(p.code);
  const eGreet = escapeHtml(greeting);
  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#0f172a;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;padding:32px 0;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#1e293b;border-radius:12px;overflow:hidden;">
          <tr><td style="padding:28px 32px;">
            <h1 style="margin:0 0 16px;color:#f8fafc;font-size:20px;">You're invited to ${eName}</h1>
            <p style="margin:0 0 16px;color:#cbd5e1;font-size:14px;line-height:1.5;">${eGreet}</p>
            <p style="margin:0 0 20px;color:#cbd5e1;font-size:14px;line-height:1.5;">You've been invited to join <strong>${eName}</strong> on BibleHodl. Use the button below to register — your invite code is already filled in.</p>
            <p style="margin:0 0 8px;color:#94a3b8;font-size:12px;text-transform:uppercase;letter-spacing:.05em;">Invite code</p>
            <p style="margin:0 0 24px;"><code style="display:inline-block;background:#0f172a;color:#7dd3fc;font-size:18px;font-weight:bold;letter-spacing:.1em;padding:10px 16px;border-radius:8px;">${eCode}</code></p>
            <a href="${p.joinUrl}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 24px;border-radius:8px;">Join ${eName}</a>
            <p style="margin:24px 0 0;color:#64748b;font-size:12px;line-height:1.5;">This invite expires on ${escapeHtml(expires)}. If the button doesn't work, paste this link into your browser:<br><span style="color:#7dd3fc;word-break:break-all;">${escapeHtml(p.joinUrl)}</span></p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

  return { subject, text, html };
}

/** Send an invite email. Throws if SMTP is not configured or the send fails. */
export async function sendInviteEmail(p: InviteEmailParams): Promise<void> {
  const from = env("SMTP_FROM");
  if (!from) throw new Error("SMTP is not configured");
  const { subject, text, html } = renderInviteEmail(p);
  await getTransport().sendMail({ from, to: p.to, subject, text, html });
}
