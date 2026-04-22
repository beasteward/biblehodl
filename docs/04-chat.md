# Chat

## Overview
Chat uses NIP-28 public channels on the community's private Nostr relay. Users create channels (kind 40) and send messages (kind 42). Messages are delivered in real-time via WebSocket relay subscriptions.

## How It Fits
All chat data lives on the nostr-rs-relay — no server-side database needed. The Next.js app subscribes to the relay via a WebSocket pool and renders messages client-side. Only whitelisted pubkeys can read or write.

## Key Files
- `app/lib/chat-service.ts` — Create channels, send messages, subscribe to channel events
- `app/lib/nostr.ts` — Kind constants (40, 41, 42), event creation helpers
- `app/lib/relay-pool.ts` — WebSocket connection pool to the relay
- `app/lib/store.ts` — `Channel` and `ChatMessage` interfaces, Zustand state

## Architecture

```mermaid
sequenceDiagram
    participant UserA as User A (Browser)
    participant Pool as Relay Pool
    participant Relay as nostr-rs-relay
    participant UserB as User B (Browser)

    UserA->>Relay: Publish kind 40 (create channel)
    Relay-->>UserA: OK
    Relay-->>UserB: kind 40 event (subscription)

    UserA->>Relay: Publish kind 42 (message)
    Relay-->>UserA: kind 42 event
    Relay-->>UserB: kind 42 event

    Note over UserA,UserB: Real-time via WebSocket subscriptions
```

## Status
Implemented — channel creation, messaging, real-time subscriptions.
