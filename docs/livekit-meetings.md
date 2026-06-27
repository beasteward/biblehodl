# Meeting Calls (LiveKit)

Adds self-hosted **voice/video** to meeting rooms via a LiveKit SFU. No third
party, no per-minute billing — it runs in your own Docker stack alongside the
relay/Blossom/Caddy, in keeping with the self-sovereign model.

## Architecture

- **Identity & access:** the app mints a short-lived LiveKit JWT at
  `POST /api/livekit/token`. The request is **NIP-98 signed** (same auth as the
  rest of the API) and the pubkey must be a **registered/whitelisted member**.
  No membership → no token → no call.
- **Room mapping:** LiveKit room name == `meetingId` (the kind-40 event id), so a
  call is automatically scoped to its meeting.
- **Signaling:** `wss://livekit.<DOMAIN>` reverse-proxied by Caddy → `livekit:7880`.
- **Media (RTC):** does **not** go through Caddy. Browsers connect directly to
  the host's public IP on the published UDP range (`50000-50100/udp`) with a TCP
  fallback (`7881`). These must be open on the host firewall.

## One-time setup

1. **Generate API credentials:**
   ```sh
   docker run --rm livekit/livekit-server generate-keys
   ```
2. **Fill `.env`:**
   ```
   NEXT_PUBLIC_LIVEKIT_URL=wss://livekit.<DOMAIN>
   LIVEKIT_API_KEY=<key>
   LIVEKIT_API_SECRET=<secret>
   ```
   `NEXT_PUBLIC_LIVEKIT_URL` is build-time — rebuild the `app` image after setting it.
3. **DNS:** point `livekit.<DOMAIN>` A record at the host IP (Caddy auto-issues TLS).
4. **Firewall:** allow `7881/tcp` and `50000-50100/udp` (plus 80/443 already open).
5. **Bring it up:**
   ```sh
   docker compose up -d livekit
   docker compose build app && docker compose up -d app caddy
   ```

## Notes / tuning

- **Audio-first** by design: clients join with mic on, camera off (toggle in the
  control bar). Keeps bandwidth sane for 50-300 member communities.
- **Concurrency:** widen the UDP range (compose + `config/livekit.yaml`
  `port_range_*`) for more simultaneous participants/rooms. Bandwidth is the
  ceiling, not CPU — full video for large rooms is expensive.
- **Behind NAT / no public IP:** set up a TURN server and `rtc.turn_servers` in
  `config/livekit.yaml`. Not needed when the host has a routable public IP
  (`use_external_ip: true`, already set).
- **Discovery (optional, future):** publish a NIP-53 `kind 30311` live event so
  an active call is advertised on-protocol and presence is visible to other
  Nostr clients. Not required for in-app calls.

## Files

- `app/api/livekit/token/route.ts` — NIP-98-gated token mint.
- `app/components/meetings/MeetingCall.tsx` — the "📞 Call" tab UI.
- `config/livekit.yaml` — server config (keys injected via compose `--keys`).
- `docker-compose.yml` / `Caddyfile` — `livekit` service + signaling route.
