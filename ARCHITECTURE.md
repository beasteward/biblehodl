# BibleHodl — Production Architecture

## Vision

A self-hostable community platform for small groups (50-300 users) built on Nostr. Each community fully owns and manages their own stack — relay, file storage, database, and frontend. Access is restricted to authenticated users with a whitelisted Nostr npub and verified email address.

---

## Stack Overview

```
┌─────────────────────────────────────────────────────────┐
│  VPS (Ubuntu/Debian, 2-4 vCPU, 4GB RAM)                │
│                                                          │
│  ┌──────────────┐                                        │
│  │    Caddy      │ ← Reverse proxy, auto TLS (HTTPS)    │
│  │   :80 / :443  │   Routes by subdomain                 │
│  └──────┬────────┘                                       │
│         │                                                │
│   ┌─────┼──────────────┬───────────────┐                 │
│   ▼     ▼              ▼               ▼                 │
│ ┌─────┐ ┌────────────┐ ┌────────┐ ┌───────────┐         │
│ │ App │ │nostr-rs-   │ │Blossom │ │CPDV Bible │         │
│ │Next │ │relay       │ │Server  │ │API        │         │
│ │:3000│ │:8080 (ws)  │ │:3100   │ │:4000      │         │
│ └──┬──┘ └─────┬──────┘ └────┬───┘ └───────────┘         │
│    │          │              │                            │
│    ▼          ▼              ▼                            │
│ ┌──────┐ ┌──────────┐ ┌───────────┐                     │
│ │SQLite│ │SQLite    │ │ Local disk│                      │
│ │(app) │ │(relay)   │ │ (blobs)   │                      │
│ └──────┘ └──────────┘ └───────────┘                      │
└─────────────────────────────────────────────────────────┘
```

### Subdomains

| Subdomain | Service | Port |
|-----------|---------|------|
| `app.{domain}` or `{domain}` | Next.js frontend + API routes | 3000 |
| `relay.{domain}` | nostr-rs-relay (WebSocket) | 8080 |
| `files.{domain}` | Blossom file server | 3100 |
| `api.{domain}` (optional) | CPDV Bible API | 4000 |

---

## Services

### 1. Next.js Application (`:3000`)

**Role:** Frontend UI + server-side API routes

- **Framework:** Next.js 16 (SSR + CSR)
- **Database:** SQLite via Prisma
- **Manages:** Teams, members, invites, games/trivia, user whitelist, email verification
- **Auth:** NIP-98 Nostr signature verification on all API routes
- **Server-side auth middleware:** SSR pages check npub + whitelist before rendering (not just client-side gating)

### 2. nostr-rs-relay (`:8080`)

**Role:** Nostr relay for all decentralized data

- **Language:** Rust (single binary)
- **Storage:** SQLite
- **Config:** TOML (`config.toml`)
- **Whitelist:** Enabled — only approved pubkeys can read/write
- **Handles:**
  - NIP-28: Channels (kind 40) + messages (kind 42) — chat
  - NIP-17: Encrypted DMs (kind 14/13/1059) — gift-wrapped direct messages
  - NIP-52: Calendar events (kind 31922/31923) + RSVPs (kind 31925)
  - Kind 0: User profiles/metadata
  - Meeting events (kind 40 with meeting metadata)
  - Whiteboard link events (kind 42 with whiteboard-save tags)

**Whitelist sync:** When the Next.js app adds/removes a team member, it writes directly to nostr-rs-relay's SQLite database to update the pubkey whitelist. No REST admin API needed.

### 3. Blossom Server (`:3100`)

**Role:** Decentralized file storage (BUD-02 protocol)

- **Auth:** Kind 24242 Nostr signed events (upload authorization)
- **Storage:** Local disk, content-addressed by SHA-256
- **Handles:** File uploads, whiteboard snapshots, profile images
- **Access:** Only whitelisted pubkeys can upload

### 4. CPDV Bible API (`:4000`)

**Role:** Bible text API for study/game features

- **Language:** Node.js + TypeScript
- **Storage:** In-memory (loaded from JSON at boot)
- **Auth:** API key (`X-API-Key` header)
- **Note:** Communities can run their own instance or point to the shared instance at `cpdv-bible-production.up.railway.app`

### 5. Caddy (`:80` / `:443`)

**Role:** Reverse proxy + automatic HTTPS

- Automatic Let's Encrypt TLS for all subdomains
- WebSocket upgrade support for relay
- Subdomain-based routing
- Zero-config HTTPS renewal

---

## Data Architecture

### Storage

| Data | Location | Backed up by |
|------|----------|--------------|
| Teams, members, invites, games, scores, whitelist | `data/app.db` (SQLite) | File copy |
| Nostr events (chat, DMs, calendar, meetings) | `data/relay.db` (SQLite) | File copy |
| Uploaded files (blobs) | `data/blossom/` (disk) | Directory copy |
| Bible text | In-memory (loaded from JSON) | Source file in repo |

**Full backup = tar the `data/` directory.** One command, everything included.

### Auth & Access Control

```
User Registration Flow:
─────────────────────────────────────────────────────
1. Admin creates a one-time invite code in admin panel
2. Admin shares invite code with the person (text, email, in person)
3. User visits app.{domain}/join
4. User logs in with Nostr keypair (nsec)
5. User enters: first name, last name, email, invite code
6. Server validates invite code
7. npub added to app whitelist (Prisma/SQLite)
8. npub synced to relay whitelist (nostr-rs-relay SQLite)
9. Invite marked as used (one-time)
10. User can now access all services

Request Auth Flow:
─────────────────────────────────────────────────────
Browser → Next.js SSR middleware
  ├─ Check NIP-98 signed auth OR session token
  ├─ Verify npub is in whitelist
  ├─ Reject if not whitelisted
  └─ Allow → render page / process API request

Browser → nostr-rs-relay
  ├─ WebSocket connects with pubkey
  ├─ Relay checks pubkey_whitelist
  └─ Reject if not whitelisted

Browser → Blossom
  ├─ Upload requires kind 24242 signed event
  ├─ Server verifies signature + checks whitelist
  └─ Reject if not whitelisted
```

---

## Docker Compose Structure

```
biblehodl-stack/
├── docker-compose.yml
├── .env.example
├── .env                      # Community-specific config (gitignored)
├── Caddyfile
├── config/
│   └── relay-config.toml     # nostr-rs-relay config template
├── data/                     # All persistent data (gitignored)
│   ├── app.db                # Next.js Prisma SQLite
│   ├── relay.db              # nostr-rs-relay SQLite
│   ├── blossom/              # Uploaded files
│   └── caddy/                # TLS certs
└── README.md                 # Setup instructions
```

### Environment Variables (`.env`)

```bash
# Domain
DOMAIN=community.example.com

# Admin
ADMIN_NPUB=npub1...
ADMIN_EMAIL=admin@example.com

# Relay
RELAY_NAME="Community Relay"
RELAY_DESCRIPTION="Private relay for our community"

# CPDV Bible API
CPDV_API_URL=https://cpdv-bible-production.up.railway.app
CPDV_API_KEY=cpdv_...

# Secrets (auto-generated on first run)
SESSION_SECRET=...
```

---

## Deployment Model

### Option A: One-command install script

```bash
curl -sSL https://install.biblehodl.com | bash
# Prompts: domain, admin npub, admin email
# Generates .env, starts all containers, prints DNS instructions
```

### Option B: Manual docker-compose

```bash
git clone https://github.com/beasteward/biblehodl-stack
cd biblehodl-stack
cp .env.example .env
# Edit .env
docker compose up -d
```

### DNS Requirements

Community admin creates these DNS records pointing to their VPS IP:

| Type | Name | Value |
|------|------|-------|
| A | `@` or `app` | VPS IP |
| A | `relay` | VPS IP |
| A | `files` | VPS IP |
| A | `api` (optional) | VPS IP |

Caddy handles TLS automatically once DNS propagates.

---

## Resource Estimates (300 users)

| Service | RAM (idle) | RAM (active) |
|---------|-----------|-------------|
| Next.js | ~80MB | ~150MB |
| nostr-rs-relay | ~20MB | ~50MB |
| Blossom | ~30MB | ~60MB |
| CPDV Bible API | ~50MB | ~70MB |
| Caddy | ~15MB | ~20MB |
| **Total** | **~195MB** | **~350MB** |

Recommended VPS: 2-4 vCPU, 4GB RAM, 40GB+ disk. Cost: $5-15/mo.

---

## Build Order

### Phase 1: Dockerize & Infrastructure
1. Dockerize the Next.js app (standalone output)
2. Add nostr-rs-relay container + config template
3. Add Blossom container
4. Add CPDV Bible API container
5. Create Caddyfile with subdomain routing
6. Wire up docker-compose.yml
7. Test full stack locally

### Phase 2: Auth & Access Control
8. Add registration page (/join) — first name, last name, email, invite code
9. Update Prisma schema — add firstName, lastName, email to Member model
10. Build server-side auth middleware (SSR page protection)
11. Implement relay whitelist sync (write to nostr-rs-relay SQLite)
12. Add Blossom whitelist enforcement
13. Build admin panel (manage members, generate/revoke invite codes, view whitelist)

### Phase 3: Deploy & Distribution
14. Create `.env.example` + setup documentation
15. Build install script (optional)
16. Test fresh deployment on clean VPS
17. Create `beasteward/biblehodl-stack` repo

### Phase 4: Polish
18. First-run setup wizard
19. Backup/restore scripts
20. Monitoring & health checks
21. README + deployment guide

---

## Open Questions

- [x] ~~CPDV Bible API shared or per-community?~~ Shared on Railway, communities get an API key.
- [x] ~~Email provider for verification?~~ Not needed — invite codes are the trust mechanism. Email captured at registration for contact purposes only.
- [x] ~~Relay federation?~~ No for now.
- [x] ~~Custom branding?~~ Yes, lightweight via env vars (COMMUNITY_NAME, COMMUNITY_LOGO_URL, PRIMARY_COLOR).
- [x] ~~Mobile app?~~ Web-only, PWA-capable.
