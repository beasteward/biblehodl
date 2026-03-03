// Team API client

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

function headers(pubkey: string): Record<string, string> {
  return { "Content-Type": "application/json", "x-pubkey": pubkey };
}

export async function fetchTeams(pubkey: string): Promise<Team[]> {
  const res = await fetch("/api/teams", { headers: headers(pubkey) });
  if (!res.ok) throw new Error("Failed to fetch teams");
  return res.json();
}

export async function fetchTeam(teamId: string, pubkey: string): Promise<TeamDetail> {
  const res = await fetch(`/api/teams/${teamId}`, { headers: headers(pubkey) });
  if (!res.ok) throw new Error("Failed to fetch team");
  return res.json();
}

export async function createTeam(name: string, description: string, pubkey: string): Promise<Team> {
  const res = await fetch("/api/teams", {
    method: "POST",
    headers: headers(pubkey),
    body: JSON.stringify({ name, description }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to create team");
  }
  return res.json();
}

export async function deleteTeam(teamId: string, pubkey: string): Promise<void> {
  const res = await fetch(`/api/teams/${teamId}`, {
    method: "DELETE",
    headers: headers(pubkey),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to delete team");
  }
}

export async function addMember(teamId: string, memberPubkey: string, role: string, pubkey: string) {
  const res = await fetch(`/api/teams/${teamId}/members`, {
    method: "POST",
    headers: headers(pubkey),
    body: JSON.stringify({ pubkey: memberPubkey, role }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to add member");
  }
  return res.json();
}

export async function removeMember(teamId: string, memberPubkey: string, pubkey: string) {
  const res = await fetch(`/api/teams/${teamId}/members`, {
    method: "DELETE",
    headers: headers(pubkey),
    body: JSON.stringify({ pubkey: memberPubkey }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to remove member");
  }
}

export async function createInvite(teamId: string, pubkey: string, expiresInHours = 48) {
  const res = await fetch(`/api/teams/${teamId}/invites`, {
    method: "POST",
    headers: headers(pubkey),
    body: JSON.stringify({ expiresInHours }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to create invite");
  }
  return res.json();
}

export async function joinTeam(code: string, pubkey: string) {
  const res = await fetch("/api/teams/join", {
    method: "POST",
    headers: headers(pubkey),
    body: JSON.stringify({ code }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to join team");
  }
  return res.json();
}
