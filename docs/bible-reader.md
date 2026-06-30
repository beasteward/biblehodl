# Bible Reader — Architecture & Design

Adds a **📖 Bible** reading feature to BibleHodl, backed by the
[CPDV-Bible API](https://github.com/beasteward/CPDV-Bible) (Catholic Public
Domain Version — 73 books, ~35.8k verses), already deployed at
`https://cpdv-bible-production.up.railway.app`.

This document is the design proposal. Nothing here is shipped yet.

---

## 1. Goals & constraints

- **Read scripture in-app** — browse by book → chapter, jump to a verse/range,
  full-text search, verse-of-the-day.
- **Fits the existing app shell** — it's just another `View` (like Calendar,
  Files, Games), member-gated like everything else.
- **Self-sovereign feel** — the value-add over a generic Bible app is the
  *community* layer: share passages into chat, bookmark via Nostr, tie reading
  plans into the existing calendar. (Phase 2+.)
- **Don't leak the CPDV API key to the browser.** The key is a server secret.
- **Be cheap on the upstream.** CPDV text is immutable public-domain data —
  cache hard, hit Railway rarely.

### What the upstream gives us (verified against the live deployment)

- Base: `/api/v1`. Auth: **`X-API-Key` header** on *every* endpoint (`/health`
  included → 401 without it). Bearer is rejected.
- Response envelope: `{ "status": "ok", "data": {...}, "meta": {...} }`.
- Endpoints: `/books`, `/books/:book`, `/books/:book/chapters`,
  `/books/:book/:chapter`, `/books/:book/:chapter/:verse`,
  `/books/:book/:chapter/:start-:end`, `/search?q=`, `/random`,
  `/verse-of-the-day`, `/testaments`, `/stats`, `/health`.
- Book names are case-insensitive with aliases (`gen`, `1sam`, `sos`, `rev`…).

> Note: `.env.example` already reserves `CPDV_API_URL` / `CPDV_API_KEY`. This
> design fills in those slots.

---

## 2. High-level architecture

Browser never talks to CPDV directly. A thin **Backend-for-Frontend (BFF)
proxy** in our Next.js app sits in the middle:

```
┌────────────┐   NIP-98 authFetch    ┌──────────────────────┐   X-API-Key    ┌──────────────┐
│  BibleView │ ────────────────────▶ │  /api/bible/* (BFF)  │ ─────────────▶ │  CPDV-Bible  │
│  (client)  │ ◀──────────────────── │  member-gate + cache │ ◀───────────── │   (Railway)  │
└────────────┘    {status,data}      └──────────────────────┘   {status,data}└──────────────┘
        ▲                                      │
        │ bible-service.ts (typed)             └── immutable HTTP cache (force-cache / revalidate)
```

Why the proxy instead of calling Railway from the client:

1. **Secrecy** — `CPDV_API_KEY` stays server-side; it is never bundled or shipped.
2. **Consistent access control** — reuse the app's NIP-98 + member check, so
   only registered/whitelisted members can read (matches `/api/livekit/*`).
3. **Caching** — Bible text never changes; we cache aggressively and shield the
   upstream from per-keystroke / per-scroll load.
4. **No CORS / mixed-content surprises** — same-origin `/api/bible/*`.
5. **One seam** — if CPDV's shape or host changes, only the proxy changes.

This mirrors the pattern already used for LiveKit presence
(`app/api/livekit/room/route.ts`): NIP-98 → Prisma member lookup → upstream call,
and "feature not configured ⇒ degrade gracefully" rather than erroring.

---

## 3. Server: the BFF proxy

### 3.1 Shared upstream client — `app/lib/cpdv.ts`

A single server-only module that owns the upstream contract:

```ts
// app/lib/cpdv.ts  (server-only; imports never reach the client bundle)
const BASE = process.env.CPDV_API_URL;          // e.g. https://cpdv-bible-production.up.railway.app
const KEY  = process.env.CPDV_API_KEY;           // X-API-Key secret

export function isBibleConfigured() { return Boolean(BASE && KEY); }

export async function cpdv<T>(
  path: string,                                  // e.g. "/books/genesis/1"
  opts: { revalidate?: number | false } = {}
): Promise<T> {
  if (!BASE || !KEY) throw new BibleNotConfigured();
  const res = await fetch(`${BASE}/api/v1${path}`, {
    headers: { "X-API-Key": KEY },
    // Immutable text → cache forever; VOTD/random override per-call.
    next: { revalidate: opts.revalidate ?? false }, // false ⇒ force-cache
  });
  if (!res.ok) throw new CpdvError(res.status);
  return res.json() as Promise<T>;
}
```

- `revalidate: false` ⇒ `force-cache`: the proxy keeps book/chapter/verse
  payloads in Next's Data Cache indefinitely (they're public-domain constants).
- Verse-of-the-day uses `revalidate: 3600`; `random` uses `cache: 'no-store'`.
- Errors are typed so routes can map them to status codes / graceful fallbacks.

### 3.2 Routes — `app/api/bible/*`

All routes: `getPubkeyFromRequest(request)` → 401 if no NIP-98; then a
`prisma.member.findFirst({ where: { pubkey } })` gate → 403 if not a member
(identical to the LiveKit room route). Then call `cpdv(...)` and pass the
envelope straight through, adding a long-lived `Cache-Control` header.

| Route | Proxies | Cache |
|-------|---------|-------|
| `GET /api/bible/books` | `/books` (+ `/testaments` merged) | immutable |
| `GET /api/bible/books/[book]/chapters` | `/books/:book/chapters` | immutable |
| `GET /api/bible/books/[book]/[chapter]` | `/books/:book/:chapter` | immutable |
| `GET /api/bible/passage?ref=John+3:16-18` | resolves to verse/range endpoint | immutable |
| `GET /api/bible/search?q=&book=&testament=&limit=&offset=` | `/search` | short (60s) |
| `GET /api/bible/verse-of-the-day` | `/verse-of-the-day` | 1h |
| `GET /api/bible/random` | `/random` | no-store |

Response header on cacheable routes:
`Cache-Control: public, max-age=86400, stale-while-revalidate=604800` so the
browser and any CDN/Caddy layer also cache. Two cache tiers (browser + Next Data
Cache) means a cold community hits Railway a few dozen times total, ever.

**Not-configured behavior:** if `!isBibleConfigured()`, routes return
`{ configured: false }` (200). The client uses this to **hide the Bible nav item
entirely** — same "hide the affordance" approach LiveKit uses when calling isn't
set up. No half-broken UI.

### 3.3 Why not Next.js `rewrites()` / direct edge proxy?

A static rewrite can't inject a secret header conditionally, can't run the member
gate, and can't normalize errors. The explicit route handlers are a few lines
each and buy us auth + caching + graceful degradation.

---

## 4. Client

### 4.1 Service — `app/lib/bible-service.ts`

Typed wrappers over the proxy using the existing `authFetch(signer, url)` helper
(attaches the NIP-98 header). Mirrors `calendar-service.ts` / `game-service.ts`
conventions.

```ts
export interface BibleBook { id: string; name: string; testament: "OT" | "NT";
  chapters: number; aliases?: string[]; }
export interface BibleVerse { book: string; chapter: number; verse: number; text: string; }

export async function fetchBooks(signer: Signer): Promise<BibleBook[]>;
export async function fetchChapters(signer: Signer, book: string): Promise<number[]>;
export async function fetchChapter(signer: Signer, book: string, ch: number): Promise<BibleVerse[]>;
export async function searchBible(signer: Signer, q: string, opts?): Promise<{ verses: BibleVerse[]; total: number }>;
export async function fetchVerseOfTheDay(signer: Signer): Promise<BibleVerse>;
```

All unwrap the `{status,data}` envelope and throw on `status !== "ok"`.

### 4.2 View — `app/components/bible/BibleView.tsx`

Layout follows the existing two-pane pattern (Sidebar list + main reader):

- **Book/chapter navigator** (left, or the shared `Sidebar` slot): testament
  groups → books → chapter grid. Remembers last position.
- **Reader pane** (main): chapter heading, verse-numbered text, prev/next chapter
  controls, font-size toggle. Verses are individually selectable.
- **Search bar**: debounced (~300ms) calls to `/api/bible/search`, results link
  into the reader.
- **Verse-of-the-day** chip at the top.
- **Per-verse actions** (the community hook): **Share to chat** (see §5),
  **Copy**, **Bookmark** (Phase 2).

Reuses the app's theme CSS vars (`--bg-primary`, `--accent`, …) so it inherits
the community's `PRIMARY_COLOR`. Mobile: single pane with a back affordance,
consistent with the existing drawer pattern.

### 4.3 Store wiring — `app/lib/store.ts`

- Extend the `View` union: `… | "bible"`.
- Add light reading state: `bibleLocation: { book: string; chapter: number } | null`
  and `setBibleLocation`. **Persist only `bibleLocation`** via `partialize`
  (keeps "resume where you left off" without caching scripture text — text always
  comes fresh-but-cached through the proxy, honoring the app's "relay/server is
  source of truth, don't trust persisted content cache" principle).

### 4.4 Navigation registration (3 one-line edits)

- `ActivityBar.tsx` → add `{ view: "bible", icon: "📖", label: "Bible" }` to
  `navItems` (conditionally rendered only when `/api/bible/verse-of-the-day`
  reports configured — or gate via a small `bibleEnabled` store flag fetched once).
- `AppShell.tsx` → add `bible: BibleView` to the `views` map and
  `bible: "Bible"` to `viewTitles`.

That's the entire integration surface for Phase 1.

---

## 5. Community / Nostr integration (the differentiator)

These are what make it *BibleHodl's* reader, not a generic one. Phased so Phase 1
ships fast.

- **Share a passage to chat (Phase 1.5, cheap).** Per-verse "Share" → posts a
  formatted blockquote (`> John 3:16 — For God so loved…`) into the active
  channel via the existing `sendChannelMessage` (kind-42, routed through the
  `outbox` optimistic-send path). Zero new infra; immediate community value.
- **Bookmarks & highlights as Nostr events (Phase 2).** Store a member's
  bookmarks as a NIP-51 list (kind 30001, `d:"bible-bookmarks"`) signed by their
  key and published to the community relay. Self-sovereign, syncs across devices,
  no server schema. Highlights can be a parameterized-replaceable event keyed by
  passage.
- **Verse-of-the-day in the feed (Phase 2).** A daily post (admin/bot key) of
  `/verse-of-the-day` into a `#daily-verse` channel, or surfaced in the existing
  Activity view. Deterministic upstream endpoint means everyone sees the same verse.
- **Reading plans on the calendar (Phase 3).** Reading-plan entries as NIP-52
  calendar events (`app/lib/calendar-service.ts`) with a passage ref; clicking a
  calendar entry deep-links into the reader.
- **Scripture reference linking (Phase 3).** Detect refs like `John 3:16` in chat
  messages and render them as links that open the reader at that passage
  (`/api/bible/passage?ref=`).

None of these require touching the upstream — CPDV stays a read-only text source;
the community layer lives in Nostr + our app, consistent with the platform's
self-hosted, self-sovereign model.

---

## 6. Config & ops

`.env` (slots already present in `.env.example`):

```
CPDV_API_URL=https://cpdv-bible-production.up.railway.app
CPDV_API_KEY=cpdv_xxxxxxxx        # server secret; NEVER NEXT_PUBLIC_*
```

- **Secret hygiene:** key is read only in server modules (`app/lib/cpdv.ts`).
  Never prefixed `NEXT_PUBLIC_`, so it can't leak into the client bundle.
- **Self-hosting note:** each community can point at the shared hosted CPDV API
  (default) *or* run their own CPDV-Bible container — same self-sovereign story
  as relay/Blossom/LiveKit. Document both in the README; default to the hosted URL.
- **Rate limits:** CPDV defaults to 100 req / 15 min per IP. With the two-tier
  immutable cache, steady-state requests are near-zero; the proxy also serializes
  through one server IP, so a community of 300 won't each burn the upstream limit.
- **Failure modes:**
  - Not configured → Bible nav hidden.
  - CPDV 5xx / timeout → proxy returns cached payload if present, else a 503 the
    view renders as a non-blocking "Bible service unavailable, retry" banner
    (same pattern as the registration-check Retry).
  - Upstream key rotation → update `.env`, `docker compose up -d app`.

---

## 7. Build order

1. **Phase 1 — Reader.** `cpdv.ts`, `/api/bible/*` routes (books, chapters,
   chapter, search, votd), `bible-service.ts`, `BibleView`, store `View` +
   `bibleLocation`, nav registration. End-to-end: browse + search + VOTD.
2. **Phase 1.5 — Share to chat.** Per-verse share via `sendChannelMessage`.
3. **Phase 2 — Bookmarks (NIP-51) + daily-verse feed.**
4. **Phase 3 — Reading plans (NIP-52) + in-chat reference linking.**

## 8. Testing / verification

- Upstream contract is pinned: `X-API-Key` only, `{status,data}` envelope
  (verified live 2026-06-29).
- Unit: `cpdv.ts` envelope unwrap + error mapping; book-name/ref resolution.
- Route: 401 unauthenticated, 403 non-member, 200 member, `{configured:false}`
  when env unset (mirror the LiveKit route tests).
- Manual smoke: `next build` clean, nav appears only when configured, resume-last
  position works, search debounces, share posts into chat history.
```
