// Relay Whitelist Sync — keeps the private relay's whitelist in sync with team members
// Called from team member API routes when members are added/removed

const RELAY_ADMIN_URL = process.env.RELAY_ADMIN_URL || "http://localhost:3002";
const RELAY_ADMIN_TOKEN = process.env.RELAY_ADMIN_TOKEN || "relay-admin-secret";

async function relayRequest(method: string, path: string, body?: unknown) {
  try {
    const res = await fetch(`${RELAY_ADMIN_URL}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RELAY_ADMIN_TOKEN}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return res.json();
  } catch (err) {
    console.warn(`[relay-sync] Failed to ${method} ${path}:`, err);
    return null;
  }
}

export async function addPubkeyToRelay(pubkey: string) {
  console.log(`[relay-sync] Adding pubkey to relay: ${pubkey.slice(0, 8)}...`);
  return relayRequest("POST", "/whitelist", { pubkey });
}

export async function removePubkeyFromRelay(pubkey: string) {
  console.log(`[relay-sync] Removing pubkey from relay: ${pubkey.slice(0, 8)}...`);
  return relayRequest("DELETE", "/whitelist", { pubkey });
}

export async function getRelayWhitelist(): Promise<string[]> {
  const result = await relayRequest("GET", "/whitelist");
  return result?.pubkeys || [];
}

export async function getRelayHealth() {
  return relayRequest("GET", "/health");
}
