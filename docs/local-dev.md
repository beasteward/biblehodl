# Local Development

Run the Next.js app **natively** on your machine with hot reload, without
touching the production Docker stack. There are two options for the backing
services (Nostr relay + Blossom file storage):

| Option | App | Relay + Blossom | Use when |
|--------|-----|-----------------|----------|
| **A** | native `npm run dev` | **production** services | Quick UI / read-only work |
| **B** | native `npm run dev` | **local**, in Docker | Anything that writes data/files |

Both run the app the same way. The only difference is which relay + Blossom the
app points at, controlled by two env vars in `.env.local`.

> **Why native?** Next.js hot-reload is far faster running directly on the host
> than rebuilding the app container on every change. Docker is only useful here
> for the *backing services* (Option B).

---

## Prerequisites

- Node.js 20+ and npm
- Docker + Docker Compose (only for Option B)
- A Nostr keypair (your `npub`) to log in as admin locally

---

## Option A — native app, production services

Fastest way to get running. The app talks to the live relay and Blossom.

> ⚠️ **Heads up:** pointing at production means anything you post (chat,
> calendar events, file uploads) hits **real community data**. Fine for UI and
> read-only work. For anything destructive or messy, use Option B.

### 1. Create `.env.local`

`.env.local` is gitignored and overrides `.env` on a per-key basis. Next.js
loads it automatically.

```bash
cat > .env.local <<'EOF'
# Local dev overrides. Option A: native dev, pointed at PRODUCTION services.

# Local SQLite file (NOT the container's /data/app.db absolute path)
DATABASE_URL=file:./prisma/dev.db

# Point the browser client at the live services
NEXT_PUBLIC_RELAY_URL=wss://relay.biblehodl.com
NEXT_PUBLIC_BLOSSOM_URL=https://files.biblehodl.com

# Hosted Bible API
CPDV_API_URL=https://cpdv-bible-production.up.railway.app
CPDV_API_KEY=<your-cpdv-key>

# Set these to YOUR npub/email so you can log in as admin locally
ADMIN_NPUB=npub1...
ADMIN_EMAIL=you@example.com
EOF
```

### 2. Install deps and set up the local DB

```bash
npm install
npx prisma generate
DATABASE_URL="file:./prisma/dev.db" npx prisma migrate deploy
```

### 3. Run

```bash
npm run dev      # http://localhost:3000
```

---

## Option B — native app, local relay + Blossom (full isolation)

Runs your own empty relay and Blossom in Docker so you can post, upload, and
delete freely with zero risk to production. Also works offline.

### 1. Initialize the Blossom submodule

`blossom-server` is a git submodule (Deno app, built locally from source):

```bash
git submodule update --init --recursive
```

### 2. Start the backing services

A dev-only compose file (`docker-compose.dev.yml`) runs **only** the relay and
Blossom, with isolated data dirs under `./data/dev/` so production data is never
touched. No app container, no Caddy, no TLS.

```bash
docker compose -f docker-compose.dev.yml up -d
docker compose -f docker-compose.dev.yml logs -f blossom   # first build takes a few min
```

- Relay → `ws://localhost:8080`
- Blossom → `http://localhost:3100` (admin dashboard at `/admin`, user `admin` / `devpass`)

### 3. Create `.env.local`

Same as Option A, but point the two `NEXT_PUBLIC_*` vars at the local services
(note the `ws://` / `http://` schemes, not `wss://` / `https://`):

```bash
cat > .env.local <<'EOF'
DATABASE_URL=file:./prisma/dev.db

NEXT_PUBLIC_RELAY_URL=ws://localhost:8080
NEXT_PUBLIC_BLOSSOM_URL=http://localhost:3100

CPDV_API_URL=https://cpdv-bible-production.up.railway.app
CPDV_API_KEY=<your-cpdv-key>

ADMIN_NPUB=npub1...
ADMIN_EMAIL=you@example.com
EOF
```

### 4. Install deps, set up DB, run

```bash
npm install
npx prisma generate
DATABASE_URL="file:./prisma/dev.db" npx prisma migrate deploy
npm run dev      # http://localhost:3000
```

### Stopping

```bash
docker compose -f docker-compose.dev.yml down        # keep data
docker compose -f docker-compose.dev.yml down -v     # wipe dev data too
```

---

## How Blossom URLs work locally (verified)

Blossom stamps a base URL into every blob descriptor it returns on upload. The
scheme is **mirrored from the incoming request** (`getBaseUrl()` in
`src/utils/url.ts`) and the host comes from `publicDomain` (`BLOSSOM_DOMAIN`).

With `BLOSSOM_DOMAIN=localhost:3100` and the app uploading over `http://`, a
signed BUD-02 upload returns:

```json
{ "url": "http://localhost:3100/<sha256>.txt", "sha256": "<sha256>", ... }
```

— correct scheme, correct host, no mixed-content. (The only place that
hardcodes `https://` is the admin dashboard's blob links, which is cosmetic and
admin-only.)

---

## Gotchas

1. **Prisma CLI ignores `.env.local`.** It only reads `.env`. Prefix any
   `prisma migrate` / `db push` / `studio` command with the DB var inline:
   `DATABASE_URL="file:./prisma/dev.db" npx prisma <cmd>`. The app runtime is
   fine — Next.js does load `.env.local`.
2. **First page load is slow (~10s)** while Turbopack compiles. Subsequent
   loads are instant. Not a bug.
3. **`NEXT_PUBLIC_*` vars are baked at boot.** Change a relay/Blossom URL →
   restart `npm run dev`.
4. **Option B relay starts empty.** None of the existing community history is
   there — that is the point of isolation.
5. **Blossom listens on container port 3000;** the `3100:3000` port map is what
   exposes it at `localhost:3100`. `BLOSSOM_DOMAIN` must be the host-visible
   value (`localhost:3100`).
