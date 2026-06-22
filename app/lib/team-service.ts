// Team API client (NIP-98 authenticated)

import type { Signer } from "./signer";
import { authFetch } from "./http-auth";

export interface Team {
  id: string;
  name: string;
  description: string;
  relayUrl: string;
  createdBy: string;
  createdAt: string;
  role: string;
  memberCount: number;
}

export interface TeamDetail extends Team {
  myRole: string;
  members: { id: string; pubkey: string; role: string; joinedAt: string }[];
  invites: { id: string; code: string; createdBy: string; usedBy: string | null; expiresAt: string; createdAt: string }[];
}

const JSON_HEADERS = { "Content-Type": "application/json" };

export async function fetchTeams(signer: Signer): Promise<Team[]> {
  const res = await authFetch(signer, "/api/teams");
  if (!res.ok) throw new Error("Failed to fetch teams");
  return res.json();
}

export async function fetchTeam(teamId: string, signer: Signer): Promise<TeamDetail> {
  const res = await authFetch(signer, `/api/teams/${teamId}`);
  if (!res.ok) throw new Error("Failed to fetch team");
  return res.json();
}

export async function createTeam(name: string, description: string, signer: Signer): Promise<Team> {
  const res = await authFetch(signer, "/api/teams", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ name, description }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to create team");
  }
  return res.json();
}

export async function deleteTeam(teamId: string, signer: Signer): Promise<void> {
  const res = await authFetch(signer, `/api/teams/${teamId}`, { method: "DELETE" });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to delete team");
  }
}

export async function addMember(teamId: string, memberPubkey: string, role: string, signer: Signer) {
  const res = await authFetch(signer, `/api/teams/${teamId}/members`, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ pubkey: memberPubkey, role }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to add member");
  }
  return res.json();
}

export async function removeMember(teamId: string, memberPubkey: string, signer: Signer) {
  const res = await authFetch(signer, `/api/teams/${teamId}/members`, {
    method: "DELETE",
    headers: JSON_HEADERS,
    body: JSON.stringify({ pubkey: memberPubkey }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to remove member");
  }
}

export async function createInvite(teamId: string, signer: Signer, expiresInHours = 48) {
  const res = await authFetch(signer, `/api/teams/${teamId}/invites`, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ expiresInHours }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to create invite");
  }
  return res.json();
}

export async function joinTeam(code: string, signer: Signer) {
  const res = await authFetch(signer, "/api/teams/join", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ code }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to join team");
  }
  return res.json();
}
