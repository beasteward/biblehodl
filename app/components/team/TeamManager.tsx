"use client";

import { useState, useEffect, useCallback } from "react";
import { useAppStore } from "../../lib/store";
import {
  fetchTeams,
  fetchTeam,
  createTeam,
  createInvite,
  addMember,
  removeMember,
  joinTeam,
  type Team,
  type TeamDetail,
} from "../../lib/team-service";

const roleColors: Record<string, string> = {
  owner: "#f59e0b",
  admin: "#3b82f6",
  member: "#6b7280",
};

// ─── Create Team Modal ───

function CreateTeamModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const keys = useAppStore((s) => s.keys);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const handleCreate = async () => {
    if (!keys || !name.trim()) return;
    setCreating(true);
    setError("");
    try {
      await createTeam(name.trim(), description.trim(), keys.publicKey);
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create team");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="rounded-lg p-6 w-full max-w-md shadow-xl"
        style={{ background: "var(--bg-secondary)", color: "var(--text-primary)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold mb-4">Create Team</h2>
        <div className="space-y-3">
          <div>
            <label className="block text-sm mb-1" style={{ color: "var(--text-muted)" }}>Team Name *</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Bible Study Group"
              className="w-full px-3 py-2 rounded text-sm outline-none"
              style={{ background: "var(--bg-tertiary)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
              autoFocus />
          </div>
          <div>
            <label className="block text-sm mb-1" style={{ color: "var(--text-muted)" }}>Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is this team about?"
              rows={2} className="w-full px-3 py-2 rounded text-sm outline-none resize-none"
              style={{ background: "var(--bg-tertiary)", color: "var(--text-primary)", border: "1px solid var(--border)" }} />
          </div>
        </div>
        {error && <div className="text-sm mt-3" style={{ color: "var(--danger)" }}>{error}</div>}
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-4 py-2 rounded text-sm" style={{ color: "var(--text-muted)" }}>Cancel</button>
          <button onClick={handleCreate} disabled={!name.trim() || creating}
            className="px-4 py-2 rounded text-sm font-medium disabled:opacity-50"
            style={{ background: "var(--accent)", color: "white" }}>
            {creating ? "Creating..." : "Create Team"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Join Team Modal ───

function JoinTeamModal({ onClose, onJoined }: { onClose: () => void; onJoined: () => void }) {
  const keys = useAppStore((s) => s.keys);
  const [code, setCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState("");

  const handleJoin = async () => {
    if (!keys || !code.trim()) return;
    setJoining(true);
    setError("");
    try {
      await joinTeam(code.trim(), keys.publicKey);
      onJoined();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to join");
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="rounded-lg p-6 w-full max-w-md shadow-xl"
        style={{ background: "var(--bg-secondary)", color: "var(--text-primary)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold mb-4">Join a Team</h2>
        <div>
          <label className="block text-sm mb-1" style={{ color: "var(--text-muted)" }}>Invite Code</label>
          <input type="text" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Enter invite code"
            className="w-full px-3 py-2 rounded text-sm outline-none font-mono text-center text-lg tracking-widest"
            style={{ background: "var(--bg-tertiary)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
            autoFocus maxLength={8} />
        </div>
        {error && <div className="text-sm mt-3" style={{ color: "var(--danger)" }}>{error}</div>}
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-4 py-2 rounded text-sm" style={{ color: "var(--text-muted)" }}>Cancel</button>
          <button onClick={handleJoin} disabled={!code.trim() || joining}
            className="px-4 py-2 rounded text-sm font-medium disabled:opacity-50"
            style={{ background: "var(--accent)", color: "white" }}>
            {joining ? "Joining..." : "Join Team"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Team Detail View ───

function TeamDetailView({ teamId, onBack }: { teamId: string; onBack: () => void }) {
  const keys = useAppStore((s) => s.keys);
  const profiles = useAppStore((s) => s.profiles);
  const [team, setTeam] = useState<TeamDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [newPubkey, setNewPubkey] = useState("");
  const [newRole, setNewRole] = useState("member");
  const [adding, setAdding] = useState(false);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [creatingInvite, setCreatingInvite] = useState(false);

  const load = useCallback(async () => {
    if (!keys) return;
    setLoading(true);
    try {
      const data = await fetchTeam(teamId, keys.publicKey);
      setTeam(data);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }, [teamId, keys]);

  useEffect(() => { load(); }, [load]);

  const isAdmin = team?.myRole === "owner" || team?.myRole === "admin";

  const handleAddMember = async () => {
    if (!keys || !newPubkey.trim()) return;
    setAdding(true);
    try {
      await addMember(teamId, newPubkey.trim(), newRole, keys.publicKey);
      setNewPubkey("");
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to add member");
    }
    setAdding(false);
  };

  const handleRemoveMember = async (pubkey: string) => {
    if (!keys || !confirm("Remove this member?")) return;
    try {
      await removeMember(teamId, pubkey, keys.publicKey);
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to remove member");
    }
  };

  const handleCreateInvite = async () => {
    if (!keys) return;
    setCreatingInvite(true);
    try {
      const invite = await createInvite(teamId, keys.publicKey);
      setInviteCode(invite.code);
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to create invite");
    }
    setCreatingInvite(false);
  };

  const getDisplayName = (pubkey: string) => {
    const p = profiles[pubkey];
    return p?.displayName || p?.name || pubkey.slice(0, 12) + "...";
  };

  if (loading) {
    return <div className="flex-1 flex items-center justify-center" style={{ color: "var(--text-muted)" }}>Loading...</div>;
  }

  if (!team) {
    return <div className="flex-1 flex items-center justify-center" style={{ color: "var(--text-muted)" }}>Team not found</div>;
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b" style={{ borderColor: "var(--border)" }}>
        <button onClick={onBack} className="text-sm hover:opacity-80" style={{ color: "var(--text-muted)" }}>← Back</button>
        <div className="flex-1">
          <h2 className="font-semibold" style={{ color: "var(--text-primary)" }}>⚙️ {team.name}</h2>
          {team.description && <p className="text-xs" style={{ color: "var(--text-muted)" }}>{team.description}</p>}
        </div>
        <span className="text-xs px-2 py-0.5 rounded-full font-medium capitalize"
          style={{ background: roleColors[team.myRole] + "20", color: roleColors[team.myRole] }}>
          {team.myRole}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6 max-w-2xl">
        {/* Members */}
        <div>
          <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--text-primary)" }}>
            Members ({team.members.length})
          </h3>
          <div className="space-y-2">
            {team.members.map((m) => (
              <div key={m.id} className="flex items-center justify-between p-3 rounded-lg"
                style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}>
                <div className="flex items-center gap-3">
                  <span className="text-sm" style={{ color: "var(--text-primary)" }}>{getDisplayName(m.pubkey)}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full capitalize"
                    style={{ background: roleColors[m.role] + "20", color: roleColors[m.role] }}>
                    {m.role}
                  </span>
                </div>
                {isAdmin && m.role !== "owner" && m.pubkey !== keys?.publicKey && (
                  <button onClick={() => handleRemoveMember(m.pubkey)}
                    className="text-xs px-2 py-1 rounded" style={{ color: "var(--danger)" }}>
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Add member */}
          {isAdmin && (
            <div className="mt-3 flex gap-2">
              <input type="text" value={newPubkey} onChange={(e) => setNewPubkey(e.target.value)}
                placeholder="Paste npub or hex pubkey"
                className="flex-1 px-3 py-2 rounded text-sm outline-none"
                style={{ background: "var(--bg-tertiary)", color: "var(--text-primary)", border: "1px solid var(--border)" }} />
              <select value={newRole} onChange={(e) => setNewRole(e.target.value)}
                className="px-2 py-2 rounded text-sm outline-none"
                style={{ background: "var(--bg-tertiary)", color: "var(--text-primary)", border: "1px solid var(--border)" }}>
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
              <button onClick={handleAddMember} disabled={!newPubkey.trim() || adding}
                className="px-3 py-2 rounded text-sm font-medium disabled:opacity-50"
                style={{ background: "var(--accent)", color: "white" }}>
                {adding ? "..." : "Add"}
              </button>
            </div>
          )}
        </div>

        {/* Invites */}
        {isAdmin && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Invite Codes</h3>
              <button onClick={handleCreateInvite} disabled={creatingInvite}
                className="text-sm px-3 py-1 rounded disabled:opacity-50"
                style={{ background: "var(--bg-tertiary)", color: "var(--accent)" }}>
                {creatingInvite ? "..." : "+ Generate Code"}
              </button>
            </div>

            {inviteCode && (
              <div className="p-4 rounded-lg mb-3 text-center"
                style={{ background: "var(--accent)" + "15", border: "1px solid var(--accent)" }}>
                <p className="text-xs mb-1" style={{ color: "var(--text-muted)" }}>New invite code (share with the new member):</p>
                <p className="text-2xl font-mono font-bold tracking-widest" style={{ color: "var(--accent)" }}>{inviteCode}</p>
                <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>Expires in 48 hours · Single use</p>
              </div>
            )}

            {team.invites && team.invites.length > 0 && (
              <div className="space-y-2">
                {team.invites.map((inv) => (
                  <div key={inv.id} className="flex items-center justify-between p-2 rounded text-sm"
                    style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}>
                    <span className="font-mono font-bold" style={{ color: inv.usedBy ? "var(--text-muted)" : "var(--accent)" }}>
                      {inv.code}
                    </span>
                    <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                      {inv.usedBy ? "Used" : `Expires ${new Date(inv.expiresAt).toLocaleDateString()}`}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main TeamManager ───

export default function TeamManager() {
  const keys = useAppStore((s) => s.keys);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);

  const loadTeams = useCallback(async () => {
    if (!keys) return;
    setLoading(true);
    try {
      const data = await fetchTeams(keys.publicKey);
      setTeams(data);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }, [keys]);

  useEffect(() => { loadTeams(); }, [loadTeams]);

  if (selectedTeamId) {
    return <TeamDetailView teamId={selectedTeamId} onBack={() => { setSelectedTeamId(null); loadTeams(); }} />;
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: "var(--border)" }}>
        <h1 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>⚙️ Teams</h1>
        <div className="flex gap-2">
          <button onClick={() => setShowJoin(true)} className="px-3 py-2 rounded text-sm"
            style={{ background: "var(--bg-tertiary)", color: "var(--text-primary)" }}>
            🔗 Join Team
          </button>
          <button onClick={() => setShowCreate(true)} className="px-3 py-2 rounded text-sm font-medium"
            style={{ background: "var(--accent)", color: "white" }}>
            + Create Team
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-40" style={{ color: "var(--text-muted)" }}>Loading...</div>
        ) : teams.length === 0 ? (
          <div className="text-center py-16" style={{ color: "var(--text-muted)" }}>
            <div className="text-6xl mb-4">👥</div>
            <h2 className="text-xl font-semibold mb-2" style={{ color: "var(--text-primary)" }}>No teams yet</h2>
            <p className="text-sm mb-4">Create a team or join one with an invite code</p>
            <div className="flex justify-center gap-3">
              <button onClick={() => setShowJoin(true)} className="px-4 py-2 rounded text-sm"
                style={{ background: "var(--bg-tertiary)", color: "var(--text-primary)" }}>
                🔗 Join Team
              </button>
              <button onClick={() => setShowCreate(true)} className="px-4 py-2 rounded text-sm font-medium"
                style={{ background: "var(--accent)", color: "white" }}>
                + Create Team
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3 max-w-2xl">
            {teams.map((team) => (
              <button key={team.id} onClick={() => setSelectedTeamId(team.id)}
                className="w-full text-left p-4 rounded-lg border hover:opacity-90 transition-opacity"
                style={{ background: "var(--bg-secondary)", borderColor: "var(--border)" }}>
                <div className="flex items-center justify-between mb-1">
                  <h3 className="font-semibold" style={{ color: "var(--text-primary)" }}>{team.name}</h3>
                  <span className="text-xs px-2 py-0.5 rounded-full capitalize"
                    style={{ background: roleColors[team.role] + "20", color: roleColors[team.role] }}>
                    {team.role}
                  </span>
                </div>
                {team.description && <p className="text-sm" style={{ color: "var(--text-muted)" }}>{team.description}</p>}
                <div className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>
                  👥 {team.memberCount} member{team.memberCount !== 1 ? "s" : ""}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {showCreate && <CreateTeamModal onClose={() => setShowCreate(false)} onCreated={loadTeams} />}
      {showJoin && <JoinTeamModal onClose={() => setShowJoin(false)} onJoined={loadTeams} />}
    </div>
  );
}
