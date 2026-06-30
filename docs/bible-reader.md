# Bible Reader — Architecture & Implementation

A **📖 Bible** feature for BibleHodl, backed by the
[CPDV-Bible API](https://github.com/beasteward/CPDV-Bible) (Catholic Public
Domain Version — 73 books, ~35.8k verses), deployed at
`https://cpdv-bible-production.up.railway.app`.

**Status: shipped & live on biblehodl.com.** Phases 1, 1.5, 2 and 3 are all
deployed. The only deferred item is an automated daily-verse bot (see §7). This
document reflects the as-built system.

---

## 1. Goals & constraints

- **Read scripture in-app** — browse by book → chapter, jump to a verse/range,
  full-text search, verse-of-the-day.
- **Fits the existing app shell** — it's just another `View` (like Calendar,
  Files, Games), member-gated like everything else.
- **Self-sovereign community layer** — the value over a generic Bible app: share
  passages into chat, bookmark via Nostr (relay-published), reading plans on the
  calendar, and in-chat scripture links.
- **Don't leak the CPDV API key to the browser.** The key is a server secret.
- **Be cheap on the upstream.** CPDV text is immutable public-domain data —
  cache hard, hit Railway rarely.

### Upstream contract (verified live)

- Base: `/api/v1`. Auth: **`X-API-Key` header** on *every* endpoint (`/health`
  included → 401 without it). Bearer is rejected.
- Response envelope: `{ "status": "ok", "data": ..., "meta"?: ... }`.
- `/books` returns each book with `{ name, key, testament: "OT"|"NT",
  chapterCount, verseCount }` — testament grouping needs no extra call.
- Other endpoints used: `/books/:book/chapters`, `/books/:book/:chapter`,
  `/books/:book/:chapter/:verse`, `/books/:book/:chapter/:start-:end`,
  `/search?q=`, `/verse-of-the-day`, `/random`.
- Book names are case-insensitive with aliases (`gen`, `1sam`, `sos`, `rev`…),
  so the proxy can forward human references without normalizing them first.

---

## 2. High-level architecture

The browser never talks to CPDV directly. A thin **Backend-for-Frontend (BFF)
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

This mirrors the LiveKit presence route (`app/api/livekit/room/route.ts`):
NIP-98 → Prisma member lookup → upstream call, and "feature not configured ⇒
degrade gracefully" rather than erroring.

The **community features** (share, bookmarks, reading plans, chat links) never
touch the upstream — CPDV is a read-only text source; that layer lives entirely
in Nostr + our app.

---

## 3. Server: the BFF proxy

### 3.1 Shared upstream client — `app/lib/cpdv.ts`

Server-only module that owns the upstream contract, the `CPDV_API_KEY` secret,
the cache policy, and the shared auth gate. Key exports:

- `isBibleConfigured()` — `Boolean(CPDV_API_URL && CPDV_API_KEY)`.
- `cpdv<T>(path, { revalidate?, noStore? })` — fetches `${BASE}/api/v1${path}`
  with the `X-API-Key` header. `revalidate: false` (default) ⇒ cache the payload
  in Next's Data Cache indefinitely; verse-of-the-day passes `revalidate: 3600`;
  random passes `noStore`. Throws a typed `CpdvError(status)` on
  misconfiguration / non-2xx / bad envelope.
- `cachedJson(data, cacheControl?)` and `bibleErrorResponse(err)` — response
  helpers (the latter maps `CpdvError` → 404 / 503 / 502).
- `requireBibleMember(request)` — the gate: `getPubkeyFromRequest` (NIP-98) →
  `prisma.member.findFirst({ where: { pubkey } })`. Returns `{ pubkey }` or
  `{ response }` (401 unauth / 403 non-member) to return immediately.

Cache-control constants: `IMMUTABLE_CACHE =
"public, max-age=86400, stale-while-revalidate=604800"` for text;
`SHORT_CACHE = "public, max-age=60, stale-while-revalidate=300"` for search.

### 3.2 Routes — `app/api/bible/*`

Every route runs `requireBibleMember(request)` first, then calls `cpdv(...)` and
returns the data with an appropriate `Cache-Control` header.

| Route | Proxies / behavior | Cache |
|-------|--------------------|-------|
| `GET /api/bible/status` | `{ configured }` — no upstream call | none |
| `GET /api/bible/books` | `/books` → `{ books }` (carries testament) | immutable |
| `GET /api/bible/books/[book]/chapters` | `/books/:book/chapters` → `{ chapters }` | immutable |
| `GET /api/bible/books/[book]/[chapter]` | `/books/:book/:chapter` → `{ verses }` | immutable |
| `GET /api/bible/passage?ref=John+3:16-18` | parses ref → verse / range / chapter endpoint → `{ verses }` | immutable |
| `GET /api/bible/search?q=&book=&testament=&limit=&offset=` | `/search` → `{ results, total }` | short (60s) |
| `GET /api/bible/verse-of-the-day` | `/verse-of-the-day` → `{ verse }` | 1h |
| `GET /api/bible/random` | `/random` → `{ verse }` | no-store |

`/api/bible/passage` parses references with a trailing-token regex so multi-word
/ number-prefixed books work (`1 John 2:1`, `John 3`, `John 3:16-18`).

**Not-configured behavior:** `/api/bible/status` returns `{ configured: false }`
when the env is unset; the client uses this to **hide the Bible nav entirely** —
the same "hide the affordance" approach LiveKit uses. No half-broken UI.

### 3.3 Why not Next.js `rewrites()` / a static edge proxy?

A static rewrite can't inject a secret header, run the member gate, or normalize
errors. The explicit handlers are a few lines each and buy auth + caching +
graceful degradation.

---

## 4. Client

### 4.1 Service — `app/lib/bible-service.ts`

Typed wrappers over the proxy using `authFetch(signer, url)` (attaches the
NIP-98 header). Types reflect the upstream shape:

```ts
interface BibleBook { name: string; key: string; testament: "OT" | "NT";
  chapterCount: number; verseCount: number; }
interface ChapterMeta { chapter: number; verseCount: number; }
interface BibleVerse { book: string; chapter: number; verse: number; text: string;
  snippet?: string; } // snippet on search results only

fetchBibleStatus(signer): Promise<boolean>
fetchBooks(signer): Promise<BibleBook[]>
fetchChapters(signer, book): Promise<ChapterMeta[]>
fetchChapter(signer, book, chapter): Promise<BibleVerse[]>
searchBible(signer, q, opts?): Promise<{ results: BibleVerse[]; total: number }>
fetchVerseOfTheDay(signer): Promise<BibleVerse>
fetchPassage(signer, ref): Promise<BibleVerse[]>
formatRef(book, chapter, verse?, end?): string   // "John 3:16" / "John 3:16-18"
```

All unwrap the `{status,data}` envelope and throw on error.

### 4.2 View — `app/components/bible/BibleView.tsx`

Self-contained two-pane reader:

- **Navigator**: testament-grouped book list → chapter grid. On mobile it
  collapses (book list ⇄ reader) with a "← Books" affordance.
- **Reader**: chapter heading, verse-numbered text, prev/next chapter, A−/A+
  font scaling. **Tap a verse number to select** it (one or several).
- **Top bar**: verse-of-the-day chip (with Open + ↗ Share), debounced (~300ms)
  full-text **search**, and a **★ Bookmarks** toggle (with count).
- **Resume**: opens the persisted last position on load (unless a deep link
  overrides it).

### 4.3 Store wiring — `app/lib/store.ts`

- `View` union includes `"bible"`.
- `bibleLocation: { book, chapter } | null` (+ setter) — **persisted** via
  `partialize` so members resume where they left off. Scripture text itself is
  never persisted (always fresh-but-cached via the proxy).
- `bibleEnabled: boolean | null` (+ setter) — gates the nav item; resolved once
  on load from `/api/bible/status`.
- `bibleBookmarks: BibleBookmark[]` + `bibleBookmarksAt: number` (+ setter) —
  **not persisted**; hydrated from the relay each session (relay is source of
  truth).
- `bibleNavTarget: string | null` (+ setter) and `openBibleRef(ref)` — the
  cross-view deep link. `openBibleRef` sets the target and switches to the Bible
  view; `BibleView` consumes the target and clears it.

### 4.4 Navigation registration

- `ActivityBar.tsx` — `{ view: "bible", icon: "📖", label: "Bible" }`, filtered
  out unless `bibleEnabled === true`.
- `AppShell.tsx` — `bible: BibleView` in the `views` map, `bible: "Bible"` in
  `viewTitles`, plus a one-shot effect that resolves `fetchBibleStatus` →
  `setBibleEnabled` and subscribes to bookmarks.
- `Sidebar.tsx` — Bible heading + a short hint.

---

## 5. Community / Nostr features (shipped)

### 5.1 Share a passage to chat — Phase 1.5

`app/components/bible/ShareVerseModal.tsx`. Select verses → **↗ Share to chat**
in the floating action bar (verse-of-the-day has its own Share). The modal lists
the member's group channels (mirrors `ChatSidebar`'s filter), posts the formatted
passage — `📖 <ref> (CPDV)` + text (verse-numbered for ranges) — via the existing
`sendChannelMessage` (kind-42, optimistic `outbox` path), then jumps to that
channel. Shared passages land in normal chat history. No new API/infra.

### 5.2 Bookmarks — Phase 2 (relay-published)

`app/lib/bible-bookmark-service.ts`. A member's Bible bookmarks live in a single
**parameterized-replaceable NIP-51 bookmark set**: **kind `30003`**, tag
`["d", "bible-bookmarks"]`, signed by the member key and published to the
community relay → syncs across every device, no server DB.

- Each passage is a custom tag `["ref", "<ref>", "<snippet>"]` where `<ref>` is a
  parseable string like `John 3:16` / `John 3:16-18`.
- Add/remove rebuilds the full tag set and republishes (replaceable ⇒ relay keeps
  only the latest). Local update is optimistic; `created_at` advances so the relay
  echo can't undo it.
- `subscribeToBibleBookmarks(pubkey)` (wired in `AppShell` init) filters
  `kinds:[30003], authors:[pubkey], "#d":["bible-bookmarks"], limit:1` and ignores
  any event not strictly newer than what's held.
- **UI**: select verses → **☆ Bookmark / ★ Saved** toggle; bookmarked start
  verses show a **★** in the reader; the **★ Bookmarks** browser lists / jumps to
  / removes saved passages.

### 5.3 Reading plans on the calendar — Phase 3 (NIP-52)

`createReadingPlan(...)` in `app/lib/calendar-service.ts` generates one
**date-based calendar event (kind 31922)** per day covering a book, each tagged
`["bible", "<ref>"]`. `CalendarEvent` gained an optional `bibleRef` (parsed from
that tag). `CalendarView` has a **📖 Reading plan** modal (book select + start
date + chapters/day; gated by `bibleEnabled`), and any plan entry shows a
**📖 Read <ref>** button that deep-links via `openBibleRef`.

### 5.4 In-chat scripture linking — Phase 3

`app/lib/scripture-ref.ts` holds a 73-book alias dictionary (full names + common
abbreviations) and:

- `parseScriptureRef(input)` → `{ book, chapter, verse?, endVerse? }` (canonical
  book name).
- `findScriptureRefs(text)` → match spans, **requiring `chapter:verse`** and
  anchoring on a known book name, so bare `3:16`, `Section 2:3`, or `john3` are
  *not* matched.

`app/components/common/ScriptureText.tsx` linkifies any references inside chat
messages (wired into `ChatView` where `{msg.content}` renders); tapping one calls
`openBibleRef` and jumps to the passage. Falls back to plain text when Bible is
disabled or no refs are present.

### 5.5 Deep-link plumbing

`openBibleRef(ref)` (store) sets `bibleNavTarget` and `currentView:"bible"`.
`BibleView` watches `bibleNavTarget`, parses it with `parseScriptureRef`, opens
the book/chapter and scrolls to the verse, then clears the target. This path takes
precedence over resume-last-position.

---

## 6. Config & ops

`.env` (slots present in `.env.example`):

```
CPDV_API_URL=https://cpdv-bible-production.up.railway.app
CPDV_API_KEY=cpdv_xxxxxxxx        # server secret; NEVER NEXT_PUBLIC_*
```

- **Secret hygiene:** the key is read only in `app/lib/cpdv.ts` (server). Never
  prefixed `NEXT_PUBLIC_`, so it can't reach the client bundle.
- **Runtime env:** `CPDV_*` are runtime server vars (not build-time inlined). On
  the VPS they live in `/opt/biblehodl/.env`; the container must be recreated
  (`docker compose up -d app`) to pick up changes.
- **Self-hosting:** a community can use the shared hosted CPDV API (default) or
  run its own CPDV-Bible container — same self-sovereign story as
  relay/Blossom/LiveKit.
- **Rate limits:** CPDV defaults to 100 req / 15 min per IP. With the two-tier
  immutable cache (browser + Next Data Cache) and a single proxy IP, steady-state
  upstream traffic is near zero.
- **Failure modes:** not configured → Bible nav hidden; CPDV error → proxy serves
  a cached payload if present, else a non-blocking error the view renders with a
  Retry; key rotation → edit `.env`, `docker compose up -d app`.

---

## 7. Delivered vs. deferred

| Phase | Feature | Status |
|-------|---------|--------|
| 1 | Reader: book→chapter→verse, search, verse-of-the-day, resume | ✅ shipped |
| 1.5 | Share passages to chat | ✅ shipped |
| 2 | Relay-published bookmarks (NIP-51 kind 30003) | ✅ shipped |
| 3 | Reading plans (NIP-52) | ✅ shipped |
| 3 | In-chat scripture-reference linking | ✅ shipped |
| — | Automated daily-verse feed (bot) | ⏸ deferred |

**Daily-verse bot (deferred):** an auto-posting feed needs a dedicated community
bot key + a server-side cron to publish the verse-of-the-day daily to a channel —
a product/infra decision (where the key lives, which channel, opt-in). Manual
verse-of-the-day sharing already works (§5.1).

---

## 8. File inventory

- `app/lib/cpdv.ts` — server-only upstream client + member gate + cache helpers.
- `app/api/bible/*` — `status`, `books`, `books/[book]/chapters`,
  `books/[book]/[chapter]`, `passage`, `search`, `verse-of-the-day`, `random`.
- `app/lib/bible-service.ts` — typed client wrappers.
- `app/lib/bible-bookmark-service.ts` — NIP-51 bookmark set (publish/subscribe).
- `app/lib/scripture-ref.ts` — ref dictionary, parser, detector.
- `app/components/bible/BibleView.tsx` — the reader.
- `app/components/bible/ShareVerseModal.tsx` — share-to-chat.
- `app/components/common/ScriptureText.tsx` — chat ref linkifier.
- `app/lib/calendar-service.ts` — `createReadingPlan` + `bibleRef` tag.
- `app/lib/store.ts` — `View:"bible"`, `bibleLocation`, `bibleEnabled`,
  `bibleBookmarks`/`At`, `bibleNavTarget`, `openBibleRef`.
- Nav wiring: `ActivityBar.tsx`, `AppShell.tsx`, `Sidebar.tsx`,
  `CalendarView.tsx`, `ChatView.tsx`.

---

## 9. Testing / verification

- Upstream contract pinned: `X-API-Key` only, `{status,data}` envelope
  (verified live 2026-06-29).
- Routes: 401 unauthenticated, 403 non-member, 200 member, `{configured:false}`
  when env unset — verified in prod (`/api/bible/*` → 401 unauthed).
- Ref detector: unit-checked to link `John 3:16`, `1 John 2:1-3`, `Ps 23:1`,
  `Gen 1:1-3` and reject `3:16`, `Section 2:3`, `john3`.
- Build: `tsc --noEmit` + `next build` clean on every phase.
- Manual smoke (in-browser): nav appears only when configured; resume works;
  search debounces; share posts to chat; bookmark persists + syncs; reading-plan
  entries + chat links deep-link into the reader.
```
