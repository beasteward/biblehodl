"use client";

import { useState, useEffect, useCallback } from "react";
import { useAppStore } from "../../lib/store";

interface MemberRow {
  id: string;
  pubkey: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  joinedAt: string;
  team: { name: string };
}

interface InviteRow {
  id: string;
  code: string;
  createdBy: string;
  usedBy: string | null;
  usedAt: string | null;
  expiresAt: string;
  createdAt: string;
  team: { name: string };
}

export default function AdminPanel() {
  const keys = useAppStore((s) => s.keys);
  const [tab, setTab] = useState<"members" | "invites">("members");
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const headers = { "x-pubkey": keys?.publicKey || "" };

  const fetchMembers = useCallback(async () => {
    const res = await fetch("/api/admin/members", { headers: { "x-pubkey": keys?.publicKey || "" } });
    if (res.ok) {
      const data = await res.json();
      setMembers(data.members);
    }
  }, [keys?.publicKey]);

  const fetchInvites = useCallback(async () => {
    const res = await fetch("/api/admin/invites", { headers: { "x-pubkey": keys?.publicKey || "" } });
    if (res.ok) {
      const data = await res.json();
      setInvites(data.invites);
    }
  }, [keys?.publicKey]);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchMembers(), fetchInvites()])
      .catch(() => setError("Failed to load admin data"))
      .finally(() => setLoading(false));
  }, [fetchMembers, fetchInvites]);

  const handleRemoveMember = async (memberId: string) => {
    if (!confirm("Remove this member?")) return;
    const res = await fetch("/api/admin/members", {
      method: "DELETE",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ memberId }),
    });
    if (res.ok) fetchMembers();
    else {
      const data = await res.json();
      alert(data.error || "Failed to remove member");
    }
  };

  const handleCreateInvite = async () => {
    const res = await fetch("/api/admin/invites", {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
    });
    if (res.ok) fetchInvites();
    else alert("Failed to create invite");
  };

  const tabStyle = (active: boolean) => ({
    background: active ? "var(--bg-active)" : "transparent",
    color: active ? "var(--text-primary)" : "var(--text-muted)",
    borderBottom: active ? "2px solid var(--accent)" : "2px solid transparent",
  });

  if (loading) {
    return <div className="p-6" style={{ color: "var(--text-secondary)" }}>Loading admin panel...</div>;
  }

  if (error) {
    return <div className="p-6" style={{ color: "var(--danger)" }}>{error}</div>;
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden" style={{ background: "var(--bg-primary)" }}>
      {/* Tabs */}
      <div className="flex shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
        <button
          onClick={() => setTab("members")}
          className="px-6 py-3 text-sm font-medium cursor-pointer"
          style={tabStyle(tab === "members")}
        >
          Members ({members.length})
        </button>
        <button
          onClick={() => setTab("invites")}
          className="px-6 py-3 text-sm font-medium cursor-pointer"
          style={tabStyle(tab === "invites")}
        >
          Invites ({invites.length})
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {tab === "members" && (
          <div className="space-y-3">
            {members.map((m) => (
              <div
                key={m.id}
                className="p-4 rounded-lg flex items-center justify-between"
                style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
              >
                <div>
                  <div className="font-medium" style={{ color: "var(--text-primary)" }}>
                    {m.firstName} {m.lastName}
                    <span className="ml-2 text-xs px-2 py-0.5 rounded-full" style={{
                      background: m.role === "owner" ? "var(--accent)" : m.role === "admin" ? "var(--warning)" : "var(--bg-tertiary)",
                      color: m.role === "owner" || m.role === "admin" ? "white" : "var(--text-secondary)",
                    }}>
                      {m.role}
                    </span>
                  </div>
                  <div className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>{m.email}</div>
                  <div className="text-xs mt-1 font-mono" style={{ color: "var(--text-muted)" }}>
                    {m.pubkey.slice(0, 16)}...
                  </div>
                  <div className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                    Joined {new Date(m.joinedAt).toLocaleDateString()}
                  </div>
                </div>
                {m.role !== "owner" && (
                  <button
                    onClick={() => handleRemoveMember(m.id)}
                    className="px-3 py-1.5 rounded text-sm cursor-pointer"
                    style={{ background: "var(--danger)", color: "white" }}
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
            {members.length === 0 && (
              <p style={{ color: "var(--text-muted)" }}>No members yet.</p>
            )}
          </div>
        )}

        {tab === "invites" && (
          <div>
            <button
              onClick={handleCreateInvite}
              className="mb-4 px-4 py-2 rounded-lg text-sm font-medium cursor-pointer"
              style={{ background: "var(--accent)", color: "white" }}
            >
              + Create Invite
            </button>
            <div className="space-y-3">
              {invites.map((inv) => (
                <div
                  key={inv.id}
                  className="p-4 rounded-lg"
                  style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
                >
                  <div className="flex items-center gap-3">
                    <code className="text-sm font-bold" style={{ color: "var(--accent-light)" }}>{inv.code}</code>
                    {inv.usedBy ? (
                      <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "var(--bg-tertiary)", color: "var(--text-muted)" }}>
                        Used
                      </span>
                    ) : new Date(inv.expiresAt) < new Date() ? (
                      <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "var(--danger)", color: "white" }}>
                        Expired
                      </span>
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "var(--success)", color: "white" }}>
                        Active
                      </span>
                    )}
                  </div>
                  <div className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>
                    Expires: {new Date(inv.expiresAt).toLocaleDateString()}
                    {inv.usedBy && ` · Used by: ${inv.usedBy.slice(0, 12)}...`}
                  </div>
                </div>
              ))}
              {invites.length === 0 && (
                <p style={{ color: "var(--text-muted)" }}>No invites yet. Create one to get started.</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
