"use client";

import { useEffect } from "react";
import { useAppStore } from "../../lib/store";
import { fetchProfile } from "../../lib/chat-service";

// Teams-style Activity feed. Today it surfaces "someone reacted to your
// message"; the same list can grow to mentions, replies, RSVPs, etc.
export default function ActivityView() {
  const activity = useAppStore((s) => s.activity);
  const activityLastReadAt = useAppStore((s) => s.activityLastReadAt);
  const profiles = useAppStore((s) => s.profiles);
  const channels = useAppStore((s) => s.channels);
  const markActivityRead = useAppStore((s) => s.markActivityRead);
  const setActiveChannelId = useAppStore((s) => s.setActiveChannelId);
  const setCurrentView = useAppStore((s) => s.setCurrentView);

  // Opening the feed clears the unread badge. Capture the prior boundary first
  // so freshly-arrived items can still be highlighted as new in this render.
  const prevBoundary = activityLastReadAt;
  useEffect(() => {
    markActivityRead();
  }, [activity.length, markActivityRead]);

  // Backfill any actor profiles we don't have yet.
  useEffect(() => {
    for (const a of activity) {
      if (!profiles[a.actorPubkey]) fetchProfile(a.actorPubkey);
    }
  }, [activity, profiles]);

  const getDisplayName = (pubkey: string) => {
    const p = profiles[pubkey];
    if (p?.displayName) return p.displayName;
    if (p?.name) return p.name;
    return `${pubkey.slice(0, 8)}...${pubkey.slice(-4)}`;
  };
  const getAvatar = (pubkey: string) => profiles[pubkey]?.picture || null;

  const channelName = (channelId?: string) => {
    if (!channelId) return null;
    if (channelId.startsWith("dm-")) return "your DM";
    const c = channels.find((c) => c.id === channelId);
    return c ? `#${c.name}` : null;
  };

  const goToSource = (channelId?: string) => {
    if (!channelId) return;
    setActiveChannelId(channelId);
    setCurrentView("chat");
  };

  return (
    <div className="flex-1 flex flex-col h-full">
      <div
        className="px-6 py-3 flex items-center justify-between shrink-0"
        style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-secondary)" }}
      >
        <span className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
          🔔 Activity
        </span>
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
          {activity.length} notification{activity.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1">
        {activity.length === 0 && (
          <div className="text-center py-16" style={{ color: "var(--text-muted)" }}>
            <div className="text-5xl mb-3">🔔</div>
            <p className="text-sm">No activity yet.</p>
            <p className="text-xs mt-1">Reactions to your messages will show up here.</p>
          </div>
        )}

        {activity.map((a) => {
          const isNew = a.created_at > prevBoundary;
          const time = new Date(a.created_at * 1000).toLocaleString([], {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          });
          const where = channelName(a.channelId);
          return (
            <button
              key={a.id}
              onClick={() => goToSource(a.channelId)}
              className="w-full flex items-start gap-3 px-3 py-2.5 rounded-lg text-left transition-colors"
              style={{ background: isNew ? "var(--bg-active)" : "transparent" }}
            >
              <div className="relative shrink-0">
                {getAvatar(a.actorPubkey) ? (
                  <img src={getAvatar(a.actorPubkey)!} alt="" className="w-9 h-9 rounded-full object-cover" />
                ) : (
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-xs"
                    style={{ background: "var(--bg-tertiary)", color: "var(--text-primary)" }}
                  >
                    {getDisplayName(a.actorPubkey).slice(0, 2).toUpperCase()}
                  </div>
                )}
                <span className="absolute -bottom-1 -right-1 text-sm">{a.emoji}</span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm" style={{ color: "var(--text-primary)" }}>
                  <span className="font-semibold">{getDisplayName(a.actorPubkey)}</span>
                  <span style={{ color: "var(--text-secondary)" }}>
                    {" "}reacted {a.emoji} to your message{where ? ` in ${where}` : ""}
                  </span>
                </div>
                {a.targetSnippet && (
                  <div
                    className="text-xs mt-0.5 truncate italic"
                    style={{ color: "var(--text-muted)" }}
                  >
                    “{a.targetSnippet}”
                  </div>
                )}
                <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{time}</div>
              </div>
              {isNew && (
                <span
                  className="w-2 h-2 rounded-full shrink-0 mt-1.5"
                  style={{ background: "var(--accent-light)" }}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
