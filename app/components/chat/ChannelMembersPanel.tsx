"use client";

import { useState, useEffect, useCallback } from "react";
import { useAppStore } from "../../lib/store";
import MemberSearch, { type MemberResult } from "../common/MemberSearch";

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
  const profiles = useAppStore((s) => s.profiles);
  const [members, setMembers] = useState<ChannelMemberInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [myRole, setMyRole] = useState<string | null>(null);

  const fetchMembers = useCallback(async () => {
    if (!keys) return;
    try {
      const res = await fetch(`/api/channels/${channelId}/members`, {
        headers: { "x-pubkey": keys.publicKey },
      });
      const data = await res.json();
      setMembers(data.members || []);
      const me = (data.members || []).find((m: ChannelMemberInfo) => m.pubkey === keys.publicKey);
      setMyRole(me?.role || null);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [channelId, keys]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  const canManage = myRole === "owner" || myRole === "admin";

  const handleAdd = async (member: MemberResult) => {
    if (!keys) return;
    await fetch(`/api/channels/${channelId}/members`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-pubkey": keys.publicKey,
      },
      body: JSON.stringify({ pubkey: member.pubkey }),
    });
    fetchMembers();
  };

  const handleRemove = async (pubkey: string) => {
    if (!keys) return;
    await fetch(`/api/channels/${channelId}/members/${pubkey}`, {
      method: "DELETE",
      headers: { "x-pubkey": keys.publicKey },
    });
    fetchMembers();
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
        <div className="px-3 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
          <MemberSearch
            onSelect={handleAdd}
            placeholder="Add member..."
            excludePubkeys={existingPubkeys}
          />
        </div>
      )}

      {/* Member list */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="px-4 py-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>
            Loading...
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
                  onClick={() => handleRemove(m.pubkey)}
                  className="text-xs opacity-0 group-hover:opacity-100 cursor-pointer px-1.5 py-0.5 rounded"
                  style={{ color: "var(--text-muted)" }}
                  title="Remove member"
                >
                  ✕
                </button>
              )}
              {m.pubkey === keys?.publicKey && m.role !== "owner" && (
                <button
                  onClick={() => handleRemove(m.pubkey)}
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
    </div>
  );
}
