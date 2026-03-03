"use client";

import { useState } from "react";
import { useAppStore } from "../../lib/store";
import type { Meeting } from "../../lib/store";
import CreateMeetingModal from "./CreateMeetingModal";
import MeetingRoom from "./MeetingRoom";

function MeetingCard({
  meeting,
  onClick,
  profiles,
}: {
  meeting: Meeting;
  onClick: () => void;
  profiles: Record<string, { name?: string; displayName?: string; picture?: string }>;
}) {
  const statusColor =
    meeting.status === "active" ? "#22c55e" : meeting.status === "scheduled" ? "#f59e0b" : "#6b7280";
  const statusIcon =
    meeting.status === "active" ? "🟢" : meeting.status === "scheduled" ? "🟡" : "⚫";

  const creatorName = (() => {
    const p = profiles[meeting.pubkey];
    return p?.displayName || p?.name || meeting.pubkey.slice(0, 8) + "...";
  })();

  const formatDate = (ts: number) => {
    const d = new Date(ts * 1000);
    return d.toLocaleDateString([], { month: "short", day: "numeric" }) +
      " " +
      d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <button
      onClick={onClick}
      className="w-full text-left p-4 rounded-lg border hover:opacity-90 transition-opacity"
      style={{
        background: "var(--bg-secondary)",
        borderColor: meeting.status === "active" ? statusColor : "var(--border)",
      }}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <span>{statusIcon}</span>
          <h3 className="font-semibold" style={{ color: "var(--text-primary)" }}>
            {meeting.name}
          </h3>
        </div>
        <span
          className="text-xs px-2 py-0.5 rounded-full font-medium capitalize"
          style={{ background: statusColor + "20", color: statusColor }}
        >
          {meeting.status}
        </span>
      </div>
      {meeting.description && (
        <p className="text-sm mb-2" style={{ color: "var(--text-muted)" }}>
          {meeting.description}
        </p>
      )}
      <div className="flex items-center gap-4 text-xs" style={{ color: "var(--text-muted)" }}>
        <span>by {creatorName}</span>
        <span>👥 {meeting.participants.length}</span>
        {meeting.scheduledAt && <span>📅 {formatDate(meeting.scheduledAt)}</span>}
        {!meeting.scheduledAt && <span>Created {formatDate(meeting.createdAt)}</span>}
      </div>
    </button>
  );
}

export default function MeetingsView() {
  const meetings = useAppStore((s) => s.meetings);
  const profiles = useAppStore((s) => s.profiles);
  const activeMeetingId = useAppStore((s) => s.activeMeetingId);
  const setActiveMeetingId = useAppStore((s) => s.setActiveMeetingId);
  const [showCreate, setShowCreate] = useState(false);
  const [filter, setFilter] = useState<"all" | "active" | "scheduled" | "ended">("all");

  // If we're in a meeting room, show that
  if (activeMeetingId) {
    return (
      <MeetingRoom
        meetingId={activeMeetingId}
        onBack={() => setActiveMeetingId(null)}
      />
    );
  }

  const filtered = meetings
    .filter((m) => filter === "all" || m.status === filter)
    .sort((a, b) => {
      // Active first, then scheduled, then ended
      const order = { active: 0, scheduled: 1, ended: 2 };
      if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
      return b.createdAt - a.createdAt;
    });

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header */}
      <div
        className="flex items-center justify-between px-6 py-4 border-b"
        style={{ borderColor: "var(--border)" }}
      >
        <h1 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
          Meeting Rooms
        </h1>
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 rounded text-sm font-medium"
          style={{ background: "var(--accent)", color: "white" }}
        >
          + New Meeting
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 px-6 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
        {(["all", "active", "scheduled", "ended"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className="px-3 py-1 rounded-full text-xs font-medium capitalize transition-colors"
            style={{
              background: filter === f ? "var(--accent)" : "var(--bg-tertiary)",
              color: filter === f ? "white" : "var(--text-muted)",
            }}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Meeting List */}
      <div className="flex-1 overflow-y-auto p-6">
        {filtered.length === 0 ? (
          <div className="text-center py-16" style={{ color: "var(--text-muted)" }}>
            <div className="text-6xl mb-4">👥</div>
            <h2 className="text-xl font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
              {filter === "all" ? "No meetings yet" : `No ${filter} meetings`}
            </h2>
            <p className="text-sm mb-4">Create a meeting room to get started</p>
            <button
              onClick={() => setShowCreate(true)}
              className="px-4 py-2 rounded text-sm font-medium"
              style={{ background: "var(--accent)", color: "white" }}
            >
              + New Meeting
            </button>
          </div>
        ) : (
          <div className="space-y-3 max-w-2xl">
            {filtered.map((meeting) => (
              <MeetingCard
                key={meeting.id}
                meeting={meeting}
                onClick={() => setActiveMeetingId(meeting.id)}
                profiles={profiles}
              />
            ))}
          </div>
        )}
      </div>

      {showCreate && <CreateMeetingModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}
