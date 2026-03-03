import { Relay } from "nostr-tools/relay";
import { DEFAULT_RELAYS } from "./nostr";

export type SubCallback = (event: {
  id: string;
  kind: number;
  pubkey: string;
  content: string;
  tags: string[][];
  created_at: number;
}) => void;

export type EoseCallback = () => void;

class RelayPool {
  private relays: Map<string, Relay> = new Map();
  private connecting: Map<string, Promise<Relay | null>> = new Map();
  private subscriptions: Map<
    string,
    { urls: string[]; close: (() => void)[] }
  > = new Map();

  async connect(url: string): Promise<Relay | null> {
    if (this.relays.has(url)) return this.relays.get(url)!;
    if (this.connecting.has(url)) return this.connecting.get(url)!;

    const promise = (async () => {
      try {
        const relay = await Relay.connect(url);
        this.relays.set(url, relay);
        console.log(`[relay] connected: ${url}`);
        return relay;
      } catch (err) {
        console.warn(`[relay] failed to connect: ${url}`, err);
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

  async publish(event: Parameters<Relay["publish"]>[0], urls?: string[]) {
    const relays = urls
      ? (await Promise.all(urls.map((u) => this.connect(u)))).filter(
          (r): r is Relay => r !== null
        )
      : Array.from(this.relays.values());

    const results = await Promise.allSettled(
      relays.map((r) => r.publish(event))
    );

    const succeeded = results.filter((r) => r.status === "fulfilled").length;
    console.log(
      `[relay] published to ${succeeded}/${relays.length} relays`
    );
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
    console.log(
      `[relay] subscribed "${id}" on ${closers.length} relays`
    );
  }

  unsubscribe(id: string) {
    const sub = this.subscriptions.get(id);
    if (sub) {
      sub.close.forEach((fn) => fn());
      this.subscriptions.delete(id);
    }
  }

  getConnected(): string[] {
    return Array.from(this.relays.keys());
  }

  disconnect(url: string) {
    const relay = this.relays.get(url);
    if (relay) {
      relay.close();
      this.relays.delete(url);
    }
  }

  disconnectAll() {
    for (const [, subs] of this.subscriptions) {
      subs.close.forEach((fn) => fn());
    }
    this.subscriptions.clear();
    for (const relay of this.relays.values()) {
      relay.close();
    }
    this.relays.clear();
  }
}

// Singleton
export const pool = new RelayPool();
