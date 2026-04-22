# TODO — BibleHodl

## High Priority
- [ ] Refactor all service files to use signer abstraction instead of raw `privateKey` (chat-service, dm-service, calendar-service, blossom, meeting-service, whiteboard-service, game-service)
- [ ] Move nsec storage from `localStorage` to `sessionStorage` for local signer mode
- [ ] Phase 3: Full feature test pass (Chat, DMs, Calendar, Files, Games, Meetings)

## Medium Priority
- [ ] NIP-07 `nip44` support for encrypted DMs (currently DMs use raw privateKey for NIP-44 encryption)
- [ ] Handle stale localStorage keys on /join — if keys exist but user isn't registered, clear state instead of skipping to registration form
- [ ] Add logout/disconnect button to AppShell (clear keys + signer + registration state)

## Low Priority
- [ ] Init script: add `--non-interactive` flag for automated deployments (accept args instead of prompts)
- [ ] README: add troubleshooting section (common issues like data/ dir, ESM errors)


## Done
- [x] Add save-your-keys step to /join registration flow (2026-04-22)
- [x] Add NIP-07 browser extension signer support (2026-04-22)
- [x] Create init.sh for fresh community deployments (2026-04-22)
- [x] Add README.md (2026-04-22)
- [x] Fix ESM imports for nostr-tools in init script (2026-04-22)
- [x] Fix data/ directory creation in init script (2026-04-22)
- [x] Remove biblehodl.com from Vercel (2026-04-22)
