# RSC Migration Analysis — Chat Feature

> Branch: `rsc-analysis/chat` (do **not** merge to `main` until fully tested)
> Date: 2026-06-30
> Scope: Chat feature only (channels, DMs, members, reactions, composer)

## TL;DR

**None of the current Chat components can be converted to React Server
Components (RSC) as-is, and that is the correct state given the architecture —
not an oversight.** BibleHodl is a fully client-rendered SPA: the entire tree
mounts under a *client-side* auth/signing gate, and Chat in particular is driven
by live Nostr relay WebSocket subscriptions, the NIP-07/local **signer**, and a
**zustand** store hydrated in the browser. Servers have no session, no signer,
and no relay subscription, so they cannot render meaningful Chat UI.

This doc gives the honest per-component verdict, explains the structural blocker,
and lays out the *only* refactors that would actually unlock RSC — plus a few
low-risk leaf extractions worth doing regardless.

## Architecture reality check

| Fact | Evidence | Consequence for RSC |
|---|---|---|
| Whole app is a client SPA | `app/page.tsx` and `app/join/page.tsx` both start with `"use client"`; **all 36** files in `app/components/**` carry `"use client"`. The only Server Component in the codebase is `app/layout.tsx`. | Every component is already inside a client boundary. |
| Auth gate is client-side | `app/page.tsx` decides `LoginScreen` / `UnlockScreen` / `AppShell` from client state (`signer`, `keys`, `signerMode`) restored from localStorage + NIP-07 extension. | The server can't know who the user is, so it can't pre-render gated content. |
| Data is live relay subscriptions | `ChatView` calls `subscribeToChannelMessages`; `AppShell` wires `subscribeToDMs/Unread/Reactions/Membership` over the WebSocket relay pool. | No request/response data to fetch on the server; data arrives over time in the browser. |
| State lives in zustand | Chat components read `useAppStore(...)` for `channels`, `messages`, `profiles`, `reactions`, `keys`, `signer`. | `useAppStore`/`useState`/`useEffect` are client-only hooks → forces `"use client"`. |
| Signing is browser-bound | Sends go through `signer.signEvent` (NIP-07 extension or in-memory NIP-49 key). `CPDV_API_KEY` etc. never reach the browser, but the *user* key never reaches the server. | The server cannot produce or sign Chat events. |

### Why "just remove `use client`" does nothing here

In the App Router the `"use client"` boundary is **transitive downward through
imports**: once a Client Component (`ChatView`) imports another component, that
child is compiled into the client bundle *regardless* of whether it declares
`"use client"`. A Server Component can only enter a client subtree by being
passed in as `children`/props from a Server parent — never by being imported and
rendered by a client parent.

Since `page.tsx → AppShell → ChatView → {ChatSidebar, ChannelMembersPanel,
EmojiPicker, ScriptureText}` is an unbroken client chain, dropping `"use client"`
from a leaf would not make it a Server Component. It would just be an
implicitly-client module (and would break the moment it touches a hook).

## Per-component verdict

| Component | Lines | Verdict | Why |
|---|---|---|---|
| `chat/ChatView.tsx` | 458 | **Must stay client** | `useState/useRef/useEffect`, `useAppStore`, relay subscribe/unsubscribe, `signer.signEvent` sends, reactions, scroll refs, `next/dynamic ssr:false` LiveCall, dozens of handlers. |
| `chat/ChatSidebar.tsx` | 341 | **Must stay client** | Store reads, channel/DM creation via signer, controlled inputs, `useMemo`, click handlers, `require("nostr-tools")` npub decode. |
| `chat/ChannelMembersPanel.tsx` | 307 | **Must stay client** | `authFetch` is **NIP‑98 client-signed**, store reads, modals, optimistic refetch. The members list *is* a real server fetch (`/api/channels/:id/members`) but the request must be signed in-browser. |
| `chat/EmojiPicker.tsx` | 84 | **Must stay client** | `useState/useRef/useEffect`, `document` pointer/key listeners, caret insertion. Static `EMOJIS` array is the only server-safe part. |
| `common/ScriptureText.tsx` | 49 | **Must stay client** | Reads `bibleEnabled`/`openBibleRef` from store and renders `onClick` deep-link buttons. Its *parser* (`findScriptureRefs`) is already a pure, server-safe module (`app/lib/scripture-ref.ts`). |

**Net: 0 of 5 are convertible without an architectural change.** That is expected
for a relay-driven, client-signed Nostr app.

## What *would* unlock RSC (and what it buys)

These are structural levers, ordered by effort vs. payoff. None are required for
correctness; they're only worth doing if SSR/streaming or first-paint matters.

### 1. Server layout shell + `children` slot (low effort, small payoff)
Convert the *static chrome* (page scaffold, empty-state shells, section
headings, the "Welcome to…" placeholder, the encrypted-DM footer note) into
Server Components rendered by `layout.tsx`/a server page, then pass the
interactive client islands in via `children`. This is the canonical "Server
shell, Client islands" pattern.
- **Buys:** smaller client bundle for purely-static markup; faster first paint of
  the frame while the client hydrates the live parts.
- **Costs:** real restructure of `page.tsx`/`AppShell` so a Server parent owns the
  layout and slots clients in. The auth gate stays client — the server shell can
  only contain content safe to show pre-auth (skeletons, branding).

### 2. Static-data / pure-logic extraction (trivial, do regardless)
Already partly done (`scripture-ref.ts` is pure). Extend the pattern:
- Move `EMOJIS` and `REACTION_EMOJIS` to a shared constants module so they're not
  re-declared in client component bodies.
- Keep all formatting/parsing helpers (`formatRelativeTime`, `truncate`,
  `findScriptureRefs`, `parseScriptureRef`) in `app/lib/*` so they can run in
  either environment.
- **Buys:** cleaner client/server seam, smaller components, easier future testing.
- **Costs:** near-zero. This is the safe first PR.

### 3. Presentational leaf split (medium effort, enables future RSC)
Split dumb presentational pieces (a `MessageBubble`, `ReactionPills`,
`ChannelListItem`, `DmListItem`) out of the big client components. They'd still
be client today, but if/when item #1 lands, the *static* variants could be
rendered server-side and handed interactive props.
- **Buys:** testability, readability, a migration path.
- **Costs:** careful prop threading; risk of regressions in a 458-line file.

### 4. Server-fetched member list (only place a real RSC data fetch exists)
`ChannelMembersPanel` is the single Chat surface backed by an HTTP endpoint
rather than a relay subscription. In principle a Server Component could fetch
`/api/channels/:id/members`. **Blocker:** that route is gated by NIP‑98, which
requires a browser signature; there is no server session to authorize the fetch.
Unlocking this would require a server-side session model (e.g. an
HttpOnly cookie minted after a client signing handshake) — a security design
change well beyond this feature and contrary to the current "relay/signer is the
only source of truth" model.

## Recommendation

1. **Accept the current all-client design for Chat.** It is correct for a
   relay-driven, client-signed Nostr SPA. Do not chase RSC conversions that fight
   the architecture.
2. **Land the zero-risk cleanup (item #2)** — extract static emoji constants and
   confirm all pure helpers live in `app/lib`. This is the only change worth
   shipping purely for "RSC readiness."
3. **Treat items #1/#3 as a separate, app-wide initiative**, not a Chat task. RSC
   only pays off once the *layout shell* is a Server Component; doing it for one
   feature in isolation yields no bundle/first-paint win because the client gate
   above it still forces hydration.
4. **Do not pursue #4** without a deliberate auth redesign.

### Suggested next steps if we proceed
- [ ] PR A (safe): constants/helper extraction (item #2), no behavior change.
- [ ] Spike: prototype a Server `layout.tsx` shell that renders a static frame +
      skeleton and slots `<AppShell/>` as a client island; measure first-paint
      and bundle delta before committing to a per-feature split.
- [ ] Only if the spike shows a real win: schedule the presentational-leaf split
      (item #3) feature-by-feature, Chat first.

---

*This is an analysis artifact. No component behavior was changed on this branch.*
