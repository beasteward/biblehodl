"use client";

import { useState, useEffect, useCallback } from "react";
import { useAppStore } from "../../lib/store";
import { authFetch } from "../../lib/http-auth";
import MemberSearch, { type MemberResult } from "../common/MemberSearch";
import ConfirmModal from "../common/ConfirmModal";

interface ChannelMemberInfo {
  pubkey: string;
  role: string;
  firstName: string;
  lastName: string;
  email: string;
}

interface ChannelMembersPanelProps {
  channelId: string;
  onClose: () => void;
}

export default function ChannelMembersPanel({ channelId, onClose }: ChannelMembersPanelProps) {
  const keys = useAppStore((s) => s.keys);
  const signer = useAppStore((s) => s.signer);
  const profiles = useAppStore((s) => s.profiles);
  const [members, setMembers] = useState<ChannelMemberInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [myRole, setMyRole] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [newPubkey, setNewPubkey] = useState("");
  const [adding, setAdding] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<{ pubkey: string; name: string; isSelf: boolean } | null>(null);
  const [removing, setRemoving] = useState(false);

  const fetchMembers = useCallback(async () => {
    if (!keys || !signer) return;
    try {
      const res = await authFetch(signer, `/api/channels/${channelId}/members`);
      if (!res.ok) {
        throw new Error(`Failed to load members (${res.status})`);
      }
      const data = await res.json();
      setMembers(data.members || []);
      const me = (data.members || []).find((m: ChannelMemberInfo) => m.pubkey === keys.publicKey);
      setMyRole(me?.role || null);
      setError("");
    } catch (e) {
      // Surface the failure instead of silently rendering an empty list.
      setError(e instanceof Error ? e.message : "Failed to load members");
    } finally {
      setLoading(false);
    }
  }, [channelId, keys, signer]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  const canManage = myRole === "owner" || myRole === "admin";

  const handleAddPubkey = async (pubkey: string) => {
    if (!keys || !signer || !pubkey.trim()) return;
    setAdding(true);
    try {
      const res = await authFetch(signer, `/api/channels/${channelId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pubkey: pubkey.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Failed to add member (${res.status})`);
      }
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add member");
    } finally {
      setAdding(false);
      fetchMembers();
    }
  };

  const handleAdd = (member: MemberResult) => handleAddPubkey(member.pubkey);

  const handleRemove = async () => {
    if (!keys || !signer || !removeTarget) return;
    setRemoving(true);
    try {
      const res = await authFetch(signer, `/api/channels/${channelId}/members/${removeTarget.pubkey}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Failed to remove member (${res.status})`);
      }
      setError("");
      setRemoveTarget(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to remove member");
    } finally {
      setRemoving(false);
      fetchMembers();
    }
  };

  const getDisplayName = (m: ChannelMemberInfo) => {
    const profile = profiles[m.pubkey];
    if (profile?.displayName) return profile.displayName;
    if (profile?.name) return profile.name;
    if (m.firstName) return `${m.firstName} ${m.lastName}`.trim();
    return `${m.pubkey.slice(0, 8)}…`;
  };

  const getAvatar = (m: ChannelMemberInfo) => profiles[m.pubkey]?.picture || null;

  const roleBadge = (role: string) => {
    if (role === "owner") return "👑";
    if (role === "admin") return "⭐";
    return null;
  };

  const existingPubkeys = members.map((m) => m.pubkey);
  if (keys) existingPubkeys.push(keys.publicKey);

  return (
    <div
      className="w-72 flex flex-col h-full shrink-0"
      style={{ borderLeft: "1px solid var(--border)", background: "var(--bg-secondary)" }}
    >
      {/* Header */}
      <div
        className="px-4 py-3 flex items-center justify-between shrink-0"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            Members
          </span>
          <span
            className="text-xs px-1.5 py-0.5 rounded"
            style={{ background: "var(--bg-tertiary)", color: "var(--text-muted)" }}
          >
            {members.length}
          </span>
        </div>
        <button
          onClick={onClose}
          className="text-sm cursor-pointer px-2 py-1 rounded"
          style={{ color: "var(--text-muted)" }}
        >
          ✕
        </button>
      </div>

      {/* Add member */}
      {canManage && (
        <div className="px-3 py-3 space-y-2" style={{ borderBottom: "1px solid var(--border)" }}>
          <MemberSearch
            scope="directory"
            onSelect={handleAdd}
            placeholder="Add by name or email..."
            excludePubkeys={existingPubkeys}
          />
          <div className="flex gap-2">
            <input
              type="text"
              value={newPubkey}
              onChange={(e) => setNewPubkey(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newPubkey.trim()) {
                  handleAddPubkey(newPubkey).then(() => setNewPubkey(""));
                }
              }}
              placeholder="…or paste an npub / hex pubkey"
              className="flex-1 px-2 py-1.5 rounded text-sm outline-none min-w-0"
              style={{ background: "var(--bg-tertiary)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
            />
            <button
              onClick={() => handleAddPubkey(newPubkey).then(() => setNewPubkey(""))}
              disabled={!newPubkey.trim() || adding}
              className="px-3 py-1.5 rounded text-sm font-medium disabled:opacity-50 shrink-0"
              style={{ background: "var(--accent)", color: "white" }}
            >
              {adding ? "..." : "Add"}
            </button>
          </div>
        </div>
      )}

      {/* Member list */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="px-4 py-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>
            Loading...
          </div>
        ) : error ? (
          <div className="px-4 py-8 text-center text-sm" style={{ color: "var(--danger)" }}>
            {error}
          </div>
        ) : members.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>
            No members yet
          </div>
        ) : (
          members.map((m) => (
            <div
              key={m.pubkey}
              className="px-4 py-2.5 flex items-center gap-3 group"
            >
              {getAvatar(m) ? (
                <img src={getAvatar(m)!} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
              ) : (
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-xs shrink-0"
                  style={{ background: "var(--bg-tertiary)", color: "var(--text-primary)" }}
                >
                  {getDisplayName(m).slice(0, 2).toUpperCase()}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>
                    {getDisplayName(m)}
                  </span>
                  {roleBadge(m.role) && <span className="text-xs">{roleBadge(m.role)}</span>}
                </div>
                {m.email && (
                  <div className="text-xs truncate" style={{ color: "var(--text-muted)" }}>
                    {m.email}
                  </div>
                )}
              </div>
              {/* Remove button — owner/admin can remove non-owners; anyone can leave */}
              {(canManage && m.role !== "owner" && m.pubkey !== keys?.publicKey) && (
                <button
                  onClick={() => setRemoveTarget({ pubkey: m.pubkey, name: getDisplayName(m), isSelf: false })}
                  className="text-xs opacity-0 group-hover:opacity-100 cursor-pointer px-1.5 py-0.5 rounded"
                  style={{ color: "var(--text-muted)" }}
                  title="Remove member"
                >
                  ✕
                </button>
              )}
              {m.pubkey === keys?.publicKey && m.role !== "owner" && (
                <button
                  onClick={() => setRemoveTarget({ pubkey: m.pubkey, name: getDisplayName(m), isSelf: true })}
                  className="text-xs opacity-0 group-hover:opacity-100 cursor-pointer px-1.5 py-0.5 rounded"
                  style={{ color: "var(--text-muted)" }}
                  title="Leave channel"
                >
                  Leave
                </button>
              )}
            </div>
          ))
        )}
      </div>

      <ConfirmModal
        open={!!removeTarget}
        title={removeTarget?.isSelf ? "Leave channel" : "Remove member"}
        message={
          removeTarget?.isSelf
            ? "Leave this channel? You'll need to be re-added to rejoin."
            : removeTarget
            ? `Remove ${removeTarget.name} from this channel?`
            : undefined
        }
        confirmLabel={removeTarget?.isSelf ? "Leave" : "Remove"}
        danger
        busy={removing}
        onConfirm={handleRemove}
        onClose={() => setRemoveTarget(null)}
      />
    </div>
  );
}
