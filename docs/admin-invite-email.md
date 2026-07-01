# Admin Invite Email

Let team admins email an invite code (with a one-click registration link) directly
to a prospective member, instead of manually copying the code out of the admin panel.

The feature is **operator-configured**: whoever runs the server enables it once by
setting SMTP environment variables. Team admins never touch mail configuration — they
just click ✉ Email. If SMTP is not configured the feature stays dormant: the email UI
is hidden and the API returns `503 email_not_configured`. **Copy link always works**,
configured or not.

---

## Two "admins" (important distinction)

| Role | Who | What they do here |
| --- | --- | --- |
| **Instance operator** | Runs the server (shell access to `/opt/biblehodl`) | Sets SMTP env vars once |
| **Team Admin** | Member with `owner`/`admin` role, in-app only | Uses the AdminPanel ✉ Email button |

The team admin needs to configure **nothing**. Enabling email is a one-time,
server-level setup done by the operator.

---

## Operator setup (one-time)

Add to `/opt/biblehodl/.env`:

```dotenv
# --- Invite email (SMTP, BYO mailbox) ---
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465                 # 465 = SSL on connect, 587 = STARTTLS
SMTP_USER=community@example.com
SMTP_PASS=your-app-password
SMTP_FROM="BibleHodl <community@example.com>"

# Base URL used to build the /join?invite=<code> link in the email.
NEXT_PUBLIC_APP_URL=https://biblehodl.com
```

Then rebuild/restart the app container:

```bash
cd /opt/biblehodl
docker compose build app
docker compose up -d app
```

**BYO mailbox** means: bring whatever email account you already own. Gmail
(app-password), Proton Bridge, Mailgun/SES SMTP, your own Postfix — anything that
speaks SMTP. No third-party vendor signup is forced and no secrets live in the app DB.

### Required vs optional env

| Var | Required | Notes |
| --- | --- | --- |
| `SMTP_HOST` | ✅ | SMTP server hostname |
| `SMTP_USER` | ✅ | Mailbox login |
| `SMTP_PASS` | ✅ | Mailbox password / app-password |
| `SMTP_FROM` | ✅ | `From` header; some providers require it match the auth user |
| `SMTP_PORT` | optional | Defaults to `465` |
| `SMTP_SECURE` | optional | `"true"`/`"false"`; defaults to `true` when port is `465` |
| `NEXT_PUBLIC_APP_URL` | recommended | Base URL for the join link; falls back to `http://localhost:3000` |

The feature is considered **configured** only when `SMTP_HOST`, `SMTP_USER`,
`SMTP_PASS`, and `SMTP_FROM` are all present (`isMailConfigured()` in
`app/lib/mailer.ts`).

---

## How a team admin uses it

In **Admin → Invites**:

- **Create & Email** — type a recipient email in the field next to the create button;
  the new invite is generated and emailed in one click. Leave it blank for a plain
  invite.
- **📋 Copy link** — copies `https://<app>/join?invite=<code>` to the clipboard. Always
  available, even when email is off.
- **✉ Email / ✉ Resend** — opens an inline form (recipient email + optional name) to
  send/resend an existing active invite. Once sent, the row shows an `✉ <email>` badge
  and the emailed date.

The recipient gets an email with the code and a **Join** button. The link pre-fills the
invite code on the `/join` page, so they only fill in name + email and register.

---

## Architecture

```
AdminPanel ─NIP-98─▶ POST /api/admin/invites/email ─▶ mailer.ts ─SMTP─▶ recipient
                     (team-admin gated)                (server-only secrets)
```

- **`app/lib/mailer.ts`** — `nodemailer` SMTP transport (lazy, cached). Reads `SMTP_*`
  from `process.env` (server-only; never bundled into client code). Exposes
  `isMailConfigured()`, `appBaseUrl()`, and `sendInviteEmail()`. Renders an HTML + text
  invite template.
- **`POST /api/admin/invites`** — optional `{ email, recipientName }` body to
  create-and-email atomically. `GET` returns `emailEnabled` so the client can show/hide
  UI.
- **`POST /api/admin/invites/email`** — NIP-98 authenticated, requires the caller to be
  `owner`/`admin` **of the invite's team**. Rejects used/expired invites and malformed
  emails. On success stamps `sentTo`/`sentAt`. `GET` is a lightweight `{ configured }`
  probe.
- **`Invite.sentTo` / `Invite.sentAt`** — audit columns (migration
  `20260630223753_add_invite_email_fields`).
- **`/join?invite=<code>`** — client reads the `invite` query param and pre-fills the
  code field.

### Security notes

- SMTP credentials are server-only env vars — never exposed to the browser and never
  stored in the database (consistent with the `CPDV_API_KEY` server-only pattern).
- The email route is gated by NIP-98 (`getPubkeyFromRequest`) **and** team-admin
  membership scoped to the specific invite's team, so an admin of team A cannot email
  team B's invites.
- Email failures never leak the invite in an inconsistent state: on send failure the
  route returns `502` and `sentTo`/`sentAt` are not stamped.

### Failure modes

| Condition | Response |
| --- | --- |
| SMTP not configured | `503 email_not_configured` (UI hides email controls) |
| Not authenticated | `401 Unauthorized` |
| Not a team admin / wrong team | `403 Forbidden` |
| Missing `inviteId`/`toEmail` or bad email | `400` |
| Invite used / expired | `409` |
| SMTP send error | `502` with the transport error message |
