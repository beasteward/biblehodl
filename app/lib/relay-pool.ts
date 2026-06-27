import { Relay } from "nostr-tools/relay";
import { DEFAULT_RELAYS } from "./nostr";
import { useAppStore } from "./store";

export type SubCallback = (event: {
  id: string;
  kind: number;
  pubkey: string;
  content: string;
  tags: string[][];
  created_at: number;
}) => void;

export type EoseCallback = () => void;

// Connect options applied to every relay. enableReconnect makes nostr-tools
// auto-reconnect (with backoff) whenever a socket drops — e.g. the relay
// container restarts, the laptop wakes from sleep, or the network blips — and
// it re-fires all open subscriptions on reconnect (advancing `since` so there's
// no duplicate backfill). Without this a dropped socket stayed dead forever and
// every publish/subscribe silently hit a CLOSED WebSocket.
const RELAY_OPTS = { enableReconnect: true } as const;

class RelayPool {
  private relays: Map<string, Relay> = new Map();
  private connecting: Map<string, Promise<Relay | null>> = new Map();
  private subscriptions: Map<
    string,
    { urls: string[]; close: (() => void)[] }
  > = new Map();
  private healthTimer: ReturnType<typeof setInterval> | null = null;

  // Push the live set of connected relay URLs into the store so the UI
  // connection indicator reflects reconnects/drops in real time.
  private syncStatus() {
    const connected = Array.from(this.relays.entries())
      .filter(([, r]) => r.connected)
      .map(([url]) => url);
    try {
      useAppStore.getState().setConnectedRelays(connected);
    } catch {
      // store not ready (SSR) — ignore
    }
  }

  // Periodically revive any relay whose socket has died but hasn't yet been
  // re-established, so incoming messages resume without user interaction even
  // if an onclose/reconnect cycle is delayed.
  private ensureHealthLoop() {
    if (this.healthTimer || typeof window === "undefined") return;
    this.healthTimer = setInterval(() => {
      for (const url of this.relays.keys()) {
        const relay = this.relays.get(url);
        if (relay && !relay.connected) {
          // Fire-and-forget revive; connect() is idempotent while in flight.
          this.connect(url).catch(() => {});
        }
      }
      this.syncStatus();
    }, 15000);
  }

  async connect(url: string): Promise<Relay | null> {
    const existing = this.relays.get(url);
    if (existing?.connected) return existing;
    if (this.connecting.has(url)) return this.connecting.get(url)!;

    const promise = (async () => {
      try {
        let relay = this.relays.get(url);
        if (relay) {
          // Revive the existing instance — this preserves its open
          // subscriptions, which nostr-tools re-fires once reconnected.
          await relay.connect();
        } else {
          relay = await Relay.connect(url, RELAY_OPTS);
          relay.onclose = () => this.syncStatus();
          this.relays.set(url, relay);
          console.log(`[relay] connected: ${url}`);
        }
        this.syncStatus();
        this.ensureHealthLoop();
        return relay.connected ? relay : null;
      } catch (err) {
        console.warn(`[relay] failed to connect: ${url}`, err);
        this.syncStatus();
        return null;
      }
    })();

    this.connecting.set(url, promise);
    const result = await promise;
    this.connecting.delete(url);
    return result;
  }

  async connectAll(urls: string[] = DEFAULT_RELAYS): Promise<Relay[]> {
    const results = await Promise.all(urls.map((u) => this.connect(u)));
    return results.filter((r): r is Relay => r !== null);
  }

  // Publish to the given (or all known) relays. Ensures a live connection first
  // so a send issued while a socket is mid-reconnect doesn't vanish into a dead
  // WebSocket. Returns the number of relays that accepted the event so callers
  // can surface a real success/failure state to the user.
  async publish(event: Parameters<Relay["publish"]>[0], urls?: string[]) {
    const targetUrls = urls ?? (this.relays.size ? Array.from(this.relays.keys()) : DEFAULT_RELAYS);
    const relays = (await Promise.all(targetUrls.map((u) => this.connect(u)))).filter(
      (r): r is Relay => r !== null
    );

    if (relays.length === 0) {
      console.warn("[relay] publish failed — no connected relays");
      return 0;
    }

    const results = await Promise.allSettled(relays.map((r) => r.publish(event)));
    const succeeded = results.filter((r) => r.status === "fulfilled").length;
    console.log(`[relay] published to ${succeeded}/${relays.length} relays`);
    return succeeded;
  }

  subscribe(
    id: string,
    filters: Record<string, unknown>[],
    onEvent: SubCallback,
    onEose?: EoseCallback,
    urls?: string[]
  ) {
    // Close existing sub with same id
    this.unsubscribe(id);

    const targetRelays = urls
      ? urls
          .map((u) => this.relays.get(u))
          .filter((r): r is Relay => r !== undefined)
      : Array.from(this.relays.values());

    const closers: (() => void)[] = [];
    const relayUrls: string[] = [];

    for (const relay of targetRelays) {
      try {
        const sub = relay.subscribe(filters as Parameters<Relay["subscribe"]>[0], {
          onevent: onEvent,
          oneose: onEose,
        });
        closers.push(() => sub.close());
        relayUrls.push(relay.url);
      } catch (err) {
        console.warn(`[relay] subscribe failed on ${relay.url}`, err);
      }
    }

    this.subscriptions.set(id, { urls: relayUrls, close: closers });
    console.log(`[relay] subscribed "${id}" on ${closers.length} relays`);
  }

  unsubscribe(id: string) {
    const sub = this.subscriptions.get(id);
    if (sub) {
      sub.close.forEach((fn) => {
        try {
          fn();
        } catch {
          // sub already closed with its socket — ignore
        }
      });
      this.subscriptions.delete(id);
    }
  }

  getConnected(): string[] {
    return Array.from(this.relays.entries())
      .filter(([, r]) => r.connected)
      .map(([url]) => url);
  }

  disconnect(url: string) {
    const relay = this.relays.get(url);
    if (relay) {
      relay.close();
      this.relays.delete(url);
    }
    this.syncStatus();
  }

  disconnectAll() {
    for (const [, subs] of this.subscriptions) {
      subs.close.forEach((fn) => {
        try {
          fn();
        } catch {
          // ignore
        }
      });
    }
    this.subscriptions.clear();
    for (const relay of this.relays.values()) {
      relay.close();
    }
    this.relays.clear();
    if (this.healthTimer) {
      clearInterval(this.healthTimer);
      this.healthTimer = null;
    }
    this.syncStatus();
  }
}

// Singleton
export const pool = new RelayPool();
