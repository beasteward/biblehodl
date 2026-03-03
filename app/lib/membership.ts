// Membership verification — checks if a pubkey is a member of any team
// Used by API routes to enforce access control

import { prisma } from "./prisma";

/**
 * Check if a pubkey is a member of at least one team.
 * Returns the list of team IDs they belong to, or empty array if none.
 */
export async function getTeamMemberships(pubkey: string) {
  const memberships = await prisma.member.findMany({
    where: { pubkey },
    select: { teamId: true, role: true },
  });
  return memberships;
}

/**
 * Check if a pubkey is a member of any team.
 */
export async function isMemberOfAnyTeam(pubkey: string): Promise<boolean> {
  const count = await prisma.member.count({ where: { pubkey } });
  return count > 0;
}

/**
 * Check if a pubkey is a member of a specific team.
 */
export async function isMemberOfTeam(pubkey: string, teamId: string): Promise<boolean> {
  const member = await prisma.member.findUnique({
    where: { teamId_pubkey: { teamId, pubkey } },
  });
  return !!member;
}

/**
 * Check if a pubkey has admin or owner role in any team.
 */
export async function isAdminOfAnyTeam(pubkey: string): Promise<boolean> {
  const count = await prisma.member.count({
    where: { pubkey, role: { in: ["owner", "admin"] } },
  });
  return count > 0;
}

/**
 * Check if any teams exist. If no teams exist, access control is not enforced
 * (first-run scenario where nobody has created a team yet).
 */
export async function anyTeamsExist(): Promise<boolean> {
  const count = await prisma.team.count();
  return count > 0;
}

/**
 * Verify membership for API routes. Returns true if:
 * 1. No teams exist yet (open access until first team is created)
 * 2. The pubkey is a member of at least one team
 */
export async function verifyAccess(pubkey: string): Promise<boolean> {
  const teamsExist = await anyTeamsExist();
  if (!teamsExist) return true; // Open access until teams are set up
  return isMemberOfAnyTeam(pubkey);
}
