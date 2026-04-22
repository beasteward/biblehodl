# BibleHodl — Feature Documentation

A self-hostable community platform for small groups (50–300 users) built on Nostr. Each community owns their entire stack: relay, file storage, database, and frontend.

## Phase 1: Infrastructure
- [Infrastructure](./01-infrastructure.md) — Docker Compose stack, Caddy routing, data persistence

## Phase 2: Auth & Access Control
- [Authentication](./02-authentication.md) — Nostr keypair identity, invite codes, whitelist enforcement
- [Team Management](./03-team-management.md) — Teams, roles, invite codes, relay sync

## Phase 3: Core Features (Nostr-based)
- [Chat](./04-chat.md) — NIP-28 public channels
- [Direct Messages](./05-direct-messages.md) — NIP-17 encrypted DMs
- [Calendar](./06-calendar.md) — NIP-52 calendar events & RSVPs
- [Meetings](./07-meetings.md) — Meeting rooms with chat, whiteboard, files, games
- [Files](./08-files.md) — Blossom/BUD-02 file storage

## Phase 4: Server-side Features
- [Games](./09-games.md) — Trivia game engine

## Phase 5: Bible Integration
- [Bible API](./10-bible-api.md) — CPDV Bible text API
