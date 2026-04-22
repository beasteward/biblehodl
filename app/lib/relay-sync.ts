// Relay Whitelist Sync — writes member pubkeys to a whitelist file
// The relay reads this file for pubkey_whitelist authorization

import { prisma } from "./prisma";
import { writeFile } from "fs/promises";
import { join } from "path";

const WHITELIST_PATH = process.env.RELAY_WHITELIST_PATH || join(process.cwd(), "data", "relay-whitelist.txt");

/**
 * Regenerate the relay whitelist file from all current members.
 * Writes one hex pubkey per line.
 * TODO: Send SIGHUP to relay or use a shared volume for auto-reload.
 */
export async function syncRelayWhitelist() {
  try {
    const members = await prisma.member.findMany({
      select: { pubkey: true },
      distinct: ["pubkey"],
    });

    const pubkeys = members.map((m) => m.pubkey);
    const content = pubkeys.join("\n") + "\n";

    await writeFile(WHITELIST_PATH, content, "utf-8");
    console.log(`[relay-sync] Wrote ${pubkeys.length} pubkeys to ${WHITELIST_PATH}`);
    console.log("[relay-sync] NOTE: Relay may need restart to pick up changes");

    return pubkeys;
  } catch (err) {
    console.warn("[relay-sync] Failed to sync whitelist:", err);
    return [];
  }
}

/**
 * Add a single pubkey — just re-syncs the entire list for simplicity.
 */
export async function addPubkeyToRelay(pubkey: string) {
  console.log(`[relay-sync] Adding pubkey to relay: ${pubkey.slice(0, 8)}...`);
  return syncRelayWhitelist();
}

/**
 * Remove a pubkey — re-syncs the entire list.
 */
export async function removePubkeyFromRelay(pubkey: string) {
  console.log(`[relay-sync] Removing pubkey from relay: ${pubkey.slice(0, 8)}...`);
  return syncRelayWhitelist();
}
