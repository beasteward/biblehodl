# Infrastructure

## Overview
BibleHodl runs as a Docker Compose stack with four services behind a Caddy reverse proxy. Each community self-hosts the entire stack on a single VPS (2–4 vCPU, 4GB RAM, ~$5–15/mo).

## How It Fits
Caddy is the entry point — it terminates TLS and routes subdomains to the appropriate container. All persistent data lives in a single `data/` directory (SQLite databases + blob storage), making backup a single `tar` command.

## Key Files
- `docker-compose.yml` — Service definitions for app, relay, blossom, caddy
- `Caddyfile` — Subdomain routing and TLS config
- `config/relay-config.toml` — nostr-rs-relay TOML configuration
- `config/blossom-config.yml` — Blossom server configuration
- `.env` / `.env.example` — Community-specific environment variables

## Architecture

```mermaid
graph TB
    Internet((Internet))

    subgraph VPS["VPS (Ubuntu/Debian)"]
        Caddy["Caddy :80/:443<br/>Auto TLS"]

        App["Next.js App<br/>:3000"]
        Relay["nostr-rs-relay<br/>:8080 (WS)"]
        Blossom["Blossom Server<br/>:3100"]
        Bible["CPDV Bible API<br/>:4000 (optional)"]

        AppDB[("data/app.db<br/>SQLite")]
        RelayDB[("data/relay.db<br/>SQLite")]
        BlobStore[("data/blossom/<br/>Blob storage")]
        CaddyData[("data/caddy/<br/>TLS certs")]
    end

    Internet -->|"app.domain"| Caddy
    Internet -->|"relay.domain"| Caddy
    Internet -->|"files.domain"| Caddy
    Internet -->|"api.domain"| Caddy

    Caddy --> App
    Caddy --> Relay
    Caddy --> Blossom
    Caddy --> Bible

    App --> AppDB
    Relay --> RelayDB
    Blossom --> BlobStore
    Caddy --> CaddyData
```

## Status
Implemented — Docker Compose stack with all four services and Caddy routing.
