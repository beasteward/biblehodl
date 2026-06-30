"use client";

import { useState, useEffect, useCallback } from "react";
import { useAppStore } from "../../lib/store";
import { authFetch } from "../../lib/http-auth";
import ConfirmModal from "../common/ConfirmModal";

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
  sentTo: string | null;
  sentAt: string | null;
  expiresAt: string;
  createdAt: string;
  team: { name: string };
}

function joinUrlFor(code: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/join?invite=${encodeURIComponent(code)}`;
}

export default function AdminPanel() {
  const keys = useAppStore((s) => s.keys);
  const signer = useAppStore((s) => s.signer);
  const [tab, setTab] = useState<"members" | "invites">("members");
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [removeTarget, setRemoveTarget] = useState<{ id: string; name: string } | null>(null);
  const [removing, setRemoving] = useState(false);
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  // Per-row email compose state (which invite row has its form open + field values)
  const [emailForId, setEmailForId] = useState<string | null>(null);
  const [emailTo, setEmailTo] = useState("");
  const [emailName, setEmailName] = useState("");
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailErr, setEmailErr] = useState("");
  // Create-and-email field at the top of the tab
  const [createEmail, setCreateEmail] = useState("");
  const [creating, setCreating] = useState(false);

  const fetchMembers = useCallback(async () => {
    if (!signer) return;
    const res = await authFetch(signer, "/api/admin/members");
    if (!res.ok) {
      throw new Error(`Failed to load members (${res.status})`);
    }
    const data = await res.json();
    setMembers(data.members);
  }, [signer]);

  const fetchInvites = useCallback(async () => {
    if (!signer) return;
    const res = await authFetch(signer, "/api/admin/invites");
    if (!res.ok) {
      throw new Error(`Failed to load invites (${res.status})`);
    }
    const data = await res.json();
    setInvites(data.invites);
    setEmailEnabled(Boolean(data.emailEnabled));
  }, [signer]);

  useEffect(() => {
    setLoading(true);
    setError("");
    Promise.all([fetchMembers(), fetchInvites()])
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load admin data"))
      .finally(() => setLoading(false));
  }, [fetchMembers, fetchInvites]);

  const handleRemoveMember = async () => {
    if (!signer || !removeTarget) return;
    setRemoving(true);
    const res = await authFetch(signer, "/api/admin/members", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberId: removeTarget.id }),
    });
    setRemoving(false);
    if (res.ok) {
      setRemoveTarget(null);
      fetchMembers();
    } else {
      const data = await res.json();
      alert(data.error || "Failed to remove member");
    }
  };

  const handleCreateInvite = async () => {
    if (!signer) return;
    setCreating(true);
    const wantEmail = createEmail.trim();
    const res = await authFetch(signer, "/api/admin/invites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(wantEmail ? { email: wantEmail } : {}),
    });
    setCreating(false);
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      if (wantEmail && data && data.emailed === false) {
        alert(`Invite created, but email failed: ${data.emailError || "unknown error"}. You can copy the link or retry from the row.`);
      }
      setCreateEmail("");
      fetchInvites();
    } else {
      const data = await res.json().catch(() => ({}));
      alert(data.error === "email_not_configured" ? "Email is not configured on this server." : "Failed to create invite");
    }
  };

  const handleCopyLink = async (inv: InviteRow) => {
    try {
      await navigator.clipboard.writeText(joinUrlFor(inv.code));
      setCopiedId(inv.id);
      setTimeout(() => setCopiedId((c) => (c === inv.id ? null : c)), 1800);
    } catch {
      alert(joinUrlFor(inv.code));
    }
  };

  const openEmailForm = (inv: InviteRow) => {
    setEmailForId(inv.id);
    setEmailTo(inv.sentTo || "");
    setEmailName("");
    setEmailErr("");
  };

  const handleSendEmail = async (inv: InviteRow) => {
    if (!signer) return;
    const to = emailTo.trim();
    if (!to) {
      setEmailErr("Enter an email address");
      return;
    }
    setEmailBusy(true);
    setEmailErr("");
    const res = await authFetch(signer, "/api/admin/invites/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inviteId: inv.id, toEmail: to, recipientName: emailName.trim() || undefined }),
    });
    setEmailBusy(false);
    if (res.ok) {
      setEmailForId(null);
      setEmailTo("");
      setEmailName("");
      fetchInvites();
    } else {
      const data = await res.json().catch(() => ({}));
      setEmailErr(data.error === "email_not_configured" ? "Email is not configured on this server." : (data.error || "Failed to send email"));
    }
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
                    onClick={() => setRemoveTarget({ id: m.id, name: `${m.firstName} ${m.lastName}`.trim() || m.pubkey.slice(0, 12) })}
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
            <div className="mb-4 flex flex-wrap items-center gap-2">
              {emailEnabled && (
                <input
                  type="email"
                  value={createEmail}
                  onChange={(e) => setCreateEmail(e.target.value)}
                  placeholder="Email to send to (optional)"
                  className="px-3 py-2 rounded-lg text-sm outline-none"
                  style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", color: "var(--text-primary)", minWidth: 240 }}
                />
              )}
              <button
                onClick={handleCreateInvite}
                disabled={creating}
                className="px-4 py-2 rounded-lg text-sm font-medium cursor-pointer disabled:opacity-50"
                style={{ background: "var(--accent)", color: "white" }}
              >
                {creating ? "Creating…" : emailEnabled && createEmail.trim() ? "+ Create & Email" : "+ Create Invite"}
              </button>
            </div>
            {!emailEnabled && (
              <p className="mb-4 text-xs" style={{ color: "var(--text-muted)" }}>
                Email sending isn&apos;t configured on this server — use Copy Link to share invites. (Operator: set SMTP_* env vars to enable email.)
              </p>
            )}
            <div className="space-y-3">
              {invites.map((inv) => {
                const used = !!inv.usedBy;
                const expired = !used && new Date(inv.expiresAt) < new Date();
                const active = !used && !expired;
                return (
                <div
                  key={inv.id}
                  className="p-4 rounded-lg"
                  style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
                >
                  <div className="flex items-center gap-3 flex-wrap">
                    <code className="text-sm font-bold" style={{ color: "var(--accent-light)" }}>{inv.code}</code>
                    {used ? (
                      <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "var(--bg-tertiary)", color: "var(--text-muted)" }}>
                        Used
                      </span>
                    ) : expired ? (
                      <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "var(--danger)", color: "white" }}>
                        Expired
                      </span>
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "var(--success)", color: "white" }}>
                        Active
                      </span>
                    )}
                    {inv.sentTo && (
                      <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "var(--bg-tertiary)", color: "var(--text-secondary)" }}>
                        ✉ {inv.sentTo}
                      </span>
                    )}
                  </div>

                  {active && (
                    <div className="flex items-center gap-2 mt-3 flex-wrap">
                      <button
                        onClick={() => handleCopyLink(inv)}
                        className="px-3 py-1.5 rounded text-xs cursor-pointer"
                        style={{ background: "var(--bg-tertiary)", color: "var(--text-primary)" }}
                      >
                        {copiedId === inv.id ? "Copied ✓" : "📋 Copy link"}
                      </button>
                      {emailEnabled && (
                        <button
                          onClick={() => (emailForId === inv.id ? setEmailForId(null) : openEmailForm(inv))}
                          className="px-3 py-1.5 rounded text-xs cursor-pointer"
                          style={{ background: "var(--bg-tertiary)", color: "var(--text-primary)" }}
                        >
                          {inv.sentTo ? "✉ Resend" : "✉ Email"}
                        </button>
                      )}
                    </div>
                  )}

                  {emailEnabled && active && emailForId === inv.id && (
                    <div className="mt-3 p-3 rounded-lg" style={{ background: "var(--bg-primary)", border: "1px solid var(--border)" }}>
                      <div className="flex flex-col gap-2">
                        <input
                          type="email"
                          value={emailTo}
                          onChange={(e) => setEmailTo(e.target.value)}
                          placeholder="recipient@example.com"
                          className="px-3 py-2 rounded text-sm outline-none"
                          style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
                        />
                        <input
                          type="text"
                          value={emailName}
                          onChange={(e) => setEmailName(e.target.value)}
                          placeholder="Recipient name (optional)"
                          className="px-3 py-2 rounded text-sm outline-none"
                          style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
                        />
                        {emailErr && <p className="text-xs" style={{ color: "var(--danger)" }}>{emailErr}</p>}
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleSendEmail(inv)}
                            disabled={emailBusy}
                            className="px-3 py-1.5 rounded text-xs font-medium cursor-pointer disabled:opacity-50"
                            style={{ background: "var(--accent)", color: "white" }}
                          >
                            {emailBusy ? "Sending…" : "Send invite email"}
                          </button>
                          <button
                            onClick={() => setEmailForId(null)}
                            className="px-3 py-1.5 rounded text-xs cursor-pointer"
                            style={{ background: "var(--bg-tertiary)", color: "var(--text-secondary)" }}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>
                    Expires: {new Date(inv.expiresAt).toLocaleDateString()}
                    {inv.usedBy && ` · Used by: ${inv.usedBy.slice(0, 12)}...`}
                    {inv.sentAt && ` · Emailed ${new Date(inv.sentAt).toLocaleDateString()}`}
                  </div>
                </div>
                );
              })}
              {invites.length === 0 && (
                <p style={{ color: "var(--text-muted)" }}>No invites yet. Create one to get started.</p>
              )}
            </div>
          </div>
        )}
      </div>

      <ConfirmModal
        open={!!removeTarget}
        title="Remove member"
        message={removeTarget ? `Remove ${removeTarget.name} from the community? This revokes their access.` : undefined}
        confirmLabel="Remove"
        danger
        busy={removing}
        onConfirm={handleRemoveMember}
        onClose={() => setRemoveTarget(null)}
      />
    </div>
  );
}
