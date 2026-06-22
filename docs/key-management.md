# Key Management

How BibleHodl handles Nostr private keys, signing, encryption, and HTTP auth.

## Principles

1. **The app is untrusted with respect to the secret key.** App code depends only
   on a `Signer` interface and never touches raw key bytes.
2. **Secrets are never persisted in plaintext.** The only secret that may hit
   disk/localStorage is a passphrase-encrypted key (NIP-49 `ncryptsec`).
3. **Identity is proven, never asserted.** Every authenticated request to our own
   API carries a NIP-98 signature; the server never trusts a self-declared pubkey.

## Signing methods (v1)

| Rank | Method | NIP | Notes |
| --- | --- | --- | --- |
| 1 | Browser extension (`window.nostr`) | NIP-07 | Key never enters the app. Desktop. |
| 2 | Local key, encrypted at rest | NIP-49 | Passphrase-encrypted `ncryptsec`; decrypted to memory per session. The zero-dependency path for non-technical users. |

> Roadmap: NIP-46 (remote/bunker) and NIP-55 (Android signer) drop in as
> additional `Signer` adapters with no changes to app code.

## The Signer boundary

`app/lib/signer.ts` defines the single contract all app code uses:

```ts
interface Signer {
  readonly type: "nip07" | "local";
  readonly pubkey: string;
  signEvent(input: EventInput): Promise<VerifiedEvent>;
  nip44Encrypt(peerPubkey: string, plaintext: string): Promise<string>;
  nip44Decrypt(peerPubkey: string, ciphertext: string): Promise<string>;
}
```

- `createNip07Signer(pubkey)` delegates signing/encryption to the extension.
- `createLocalSigner(secretKey)` holds the key in a **closure** — there is no
  getter to read it back out. NIP-44 uses the key directly via `nostr-tools`.

Services (`chat-service`, `calendar-service`, `meeting-service`,
`whiteboard-service`, `dm-service`, `blossom`, `game-service`, `team-service`)
and components accept a `Signer`. No `privateKey: Uint8Array` is threaded
through the app.

## Key-at-rest (NIP-49)

`app/lib/keystore.ts` wraps NIP-49:

- `encryptSecretKey(sk, passphrase)` → `ncryptsec1...` (scrypt logN=16 + XChaCha20-Poly1305).
- `decryptSecretKey(ncryptsec, passphrase)` → raw key (throws on wrong passphrase).

Persisted app state (Zustand `persist`, localStorage `nostr-teams-storage`):

```jsonc
{
  "keys": { "publicKey": "<hex>", "npub": "npub1..." },  // public identity only
  "signerMode": "nip07" | "local",
  "ncryptsec": "ncryptsec1..." | null                    // encrypted; safe to store
}
```

The in-memory `Signer` is **never** persisted.

## Session lifecycle

```
                ┌─ no identity ─────────────► LoginScreen
                │
on load ────────┤─ signerMode=nip07, no signer ─► recreate from window.nostr
                │
                └─ signerMode=local, no signer ─► UnlockScreen (passphrase → decrypt)
```

- **Login / onboarding:** `LoginScreen` (returning) and `/join` (new). Generating
  or importing a key requires a passphrase, which encrypts it to `ncryptsec`.
- **Unlock:** local sessions restored from storage have the encrypted key but no
  in-memory signer; `UnlockScreen` re-derives the signer from the passphrase.
- **Logout:** `store.logout()` clears identity, signer, and the encrypted blob.

## HTTP auth (NIP-98)

Replaces the old, forgeable `x-pubkey` header. There is **no** unsigned fallback.

**Client** — `app/lib/http-auth.ts`:

- `authFetch(signer, url, init)` attaches `Authorization: Nostr <base64 event>`.
- The kind-27235 event is bound to the absolute URL (`u`), HTTP method
  (`method`), and a SHA-256 `payload` hash when there is a body.

**Server** — `app/lib/auth.ts` `getPubkeyFromRequest(request)` verifies:

- valid signature (`verifyEvent`) and `kind === 27235`;
- freshness (`created_at` within 60s);
- `method` tag matches the request method;
- `u` tag matches the request **path + query** (host is ignored so reverse
  proxies like Caddy don't break the binding);
- single-use: event id cached in-memory (~90s TTL) to block replay.

Returns the authenticated pubkey or `null`. All 19 authenticated routes use it.

### Known limitations

- **Payload hash** is sent by the client but not yet enforced server-side
  (avoids double-reading request bodies). Add per-route where body integrity matters.
- **Replay cache is per-instance** (in-memory). A horizontally-scaled deployment
  needs a shared store (e.g. Redis).

## Direct messages (NIP-17)

`app/lib/nip17.ts` implements gift-wrapped DMs against the `Signer` (works for
both NIP-07 and local, without exposing the user's key):

1. **rumor** (kind 14) — unsigned message.
2. **seal** (kind 13) — `NIP-44(sender → recipient)` of the rumor, signed by the sender.
3. **gift wrap** (kind 1059) — `NIP-44(ephemeral → recipient)` of the seal, signed
   by a throwaway key so the sender is hidden at the transport layer.

A message is published twice: wrapped to the recipient and wrapped to self (so the
sender can read their sent messages). Timestamps are randomized up to 2 days
(NIP-59) to avoid leaking timing. NIP-04 is removed entirely.

## File auth (Blossom / BUD-02)

`uploadBlob`/`deleteBlob` build kind-24242 auth events via `signer.signEvent` and
send them as `Authorization: Nostr <base64 event>`.

## Threat model summary

| Threat | Mitigation |
| --- | --- |
| XSS / shared machine reading the key | No plaintext key at rest; only `ncryptsec` (passphrase-gated). |
| API impersonation / admin takeover | NIP-98 signature required; no `x-pubkey` trust. |
| Token replay across endpoints | `u` + `method` binding + single-use id cache. |
| DM metadata leakage | NIP-17 gift wrap + randomized timestamps. |
| App code leaking the key | Key held in a closure behind the `Signer`; never in global state. |

## Roadmap

- NIP-46 (remote/bunker) and NIP-55 (Android signer) adapters.
- Server-side payload-hash enforcement + shared replay cache for multi-instance.
- Relay-level access control via NIP-42; revisit NIP-28 → NIP-29 for groups.
