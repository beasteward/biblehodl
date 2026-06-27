"use client";

import { useEffect, useRef, useState } from "react";
import { useAppStore, type View } from "../../lib/store";

const navItems: { view: View; icon: string; label: string; adminOnly?: boolean }[] = [
  { view: "chat", icon: "💬", label: "Chat" },
  { view: "activity", icon: "🔔", label: "Activity" },
  { view: "calendar", icon: "📅", label: "Calendar" },
  { view: "meetings", icon: "👥", label: "Meetings" },
  { view: "files", icon: "📁", label: "Files" },
  { view: "games", icon: "🎮", label: "Games" },
  { view: "team", icon: "⚙️", label: "Team" },
  { view: "admin", icon: "🛡️", label: "Admin", adminOnly: true },
];

// Number of icons shown inline on the mobile bottom bar before overflowing
// into the "More" dropdown.
const MOBILE_VISIBLE_COUNT = 5;

function Badge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span
      className="absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center rounded-full text-[10px] font-bold px-1"
      style={{ background: "var(--danger)", color: "white" }}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

export default function ActivityBar() {
  const currentView = useAppStore((s) => s.currentView);
  const setCurrentView = useAppStore((s) => s.setCurrentView);
  const keys = useAppStore((s) => s.keys);
  const memberProfile = useAppStore((s) => s.memberProfile);
  const connectedRelays = useAppStore((s) => s.connectedRelays);
  const unreadCounts = useAppStore((s) => s.unreadCounts);
  const activity = useAppStore((s) => s.activity);
  const activityLastReadAt = useAppStore((s) => s.activityLastReadAt);
  const isAdmin = memberProfile?.role === "owner" || memberProfile?.role === "admin";

  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  // Close the "More" dropdown on outside click or Escape.
  useEffect(() => {
    if (!moreOpen) return;
    const onClick = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMoreOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [moreOpen]);

  // Total unread across all chat channels + DMs for the current user.
  const unreadTotal = Object.values(unreadCounts).reduce((sum, n) => sum + n, 0);
  // Unread Activity = items newer than the last time the feed was opened.
  const activityUnread = activity.filter((a) => a.created_at > activityLastReadAt).length;
  const visibleItems = navItems.filter((item) => !item.adminOnly || isAdmin);

  // Unread badge count for a given view (0 when none).
  const badgeFor = (view: View) =>
    view === "chat" ? unreadTotal : view === "activity" ? activityUnread : 0;

  // Mobile split: first N inline, remainder behind the "More" dropdown.
  const inlineItems = visibleItems.slice(0, MOBILE_VISIBLE_COUNT);
  const overflowItems = visibleItems.slice(MOBILE_VISIBLE_COUNT);
  const overflowActive = overflowItems.some((i) => i.view === currentView);
  const overflowUnread = overflowItems.reduce((sum, i) => sum + badgeFor(i.view), 0);

  const selectView = (view: View) => {
    setCurrentView(view);
    setMoreOpen(false);
  };

  return (
    <>
      {/* ===== Desktop: vertical left rail (md and up) ===== */}
      <div
        className="hidden md:flex w-16 flex-col items-center py-4 gap-2 shrink-0"
        style={{ background: "var(--bg-secondary)", borderRight: "1px solid var(--border)" }}
      >
        {/* App logo */}
        <div className="w-10 h-10 rounded-lg flex items-center justify-center text-xl mb-4" style={{ background: "var(--accent)" }}>
          ⚡
        </div>

        {visibleItems.map((item) => (
          <button
            key={item.view}
            onClick={() => setCurrentView(item.view)}
            className="w-12 h-12 rounded-lg flex items-center justify-center text-xl transition-colors relative group"
            style={{
              background: currentView === item.view ? "var(--bg-active)" : "transparent",
              color: currentView === item.view ? "var(--text-primary)" : "var(--text-muted)",
            }}
            title={item.label}
          >
            {item.icon}
            <Badge count={badgeFor(item.view)} />
            {currentView === item.view && (
              <div
                className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 rounded-r"
                style={{ background: "var(--accent-light)" }}
              />
            )}
            <div className="absolute left-full ml-2 px-2 py-1 rounded text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none z-50"
              style={{ background: "var(--bg-tertiary)", color: "var(--text-primary)" }}>
              {item.label}
            </div>
          </button>
        ))}

        <div className="flex-1" />

        {/* Relay status */}
        <div className="mb-2 group relative">
          <div
            className="w-3 h-3 rounded-full"
            style={{
              background: connectedRelays.length > 0 ? "var(--success)" : "var(--danger)",
            }}
          />
          <div className="absolute left-full ml-2 px-2 py-1 rounded text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none z-50"
            style={{ background: "var(--bg-tertiary)", color: "var(--text-primary)" }}>
            {connectedRelays.length} relay{connectedRelays.length !== 1 ? "s" : ""} connected
          </div>
        </div>

        {/* User avatar */}
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-sm cursor-pointer"
          style={{ background: "var(--accent)", color: "var(--text-primary)" }}
          title={keys?.npub ? `${keys.npub.slice(0, 20)}...` : "Not logged in"}
        >
          {keys ? "👤" : "❓"}
        </div>
      </div>

      {/* ===== Mobile: horizontal bottom bar (below md) ===== */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex items-stretch justify-around"
        style={{
          background: "var(--bg-secondary)",
          borderTop: "1px solid var(--border)",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        {inlineItems.map((item) => (
          <button
            key={item.view}
            onClick={() => setCurrentView(item.view)}
            className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 relative transition-colors"
            style={{
              color: currentView === item.view ? "var(--text-primary)" : "var(--text-muted)",
            }}
            title={item.label}
          >
            <span className="relative text-xl leading-none">
              {item.icon}
              <Badge count={badgeFor(item.view)} />
            </span>
            <span className="text-[10px] leading-none">{item.label}</span>
            {currentView === item.view && (
              <div
                className="absolute top-0 left-1/2 -translate-x-1/2 h-[3px] w-8 rounded-b"
                style={{ background: "var(--accent-light)" }}
              />
            )}
          </button>
        ))}

        {overflowItems.length > 0 && (
          <div ref={moreRef} className="flex-1 flex">
            <button
              onClick={() => setMoreOpen((o) => !o)}
              className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 relative transition-colors"
              style={{
                color: moreOpen || overflowActive ? "var(--text-primary)" : "var(--text-muted)",
              }}
              title="More"
              aria-haspopup="true"
              aria-expanded={moreOpen}
            >
              <span className="relative text-xl leading-none">
                ⋯
                <Badge count={overflowUnread} />
              </span>
              <span className="text-[10px] leading-none">More</span>
              {(moreOpen || overflowActive) && (
                <div
                  className="absolute top-0 left-1/2 -translate-x-1/2 h-[3px] w-8 rounded-b"
                  style={{ background: "var(--accent-light)" }}
                />
              )}
            </button>

            {/* Dropdown of overflow items, anchored above the bar */}
            {moreOpen && (
              <div
                className="absolute bottom-full right-2 mb-2 min-w-[180px] rounded-xl overflow-hidden shadow-lg"
                style={{
                  background: "var(--bg-tertiary)",
                  border: "1px solid var(--border)",
                }}
              >
                {overflowItems.map((item) => (
                  <button
                    key={item.view}
                    onClick={() => selectView(item.view)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors"
                    style={{
                      background: currentView === item.view ? "var(--bg-active)" : "transparent",
                      color: currentView === item.view ? "var(--text-primary)" : "var(--text-secondary)",
                    }}
                  >
                    <span className="relative text-xl leading-none">
                      {item.icon}
                      <Badge count={badgeFor(item.view)} />
                    </span>
                    <span className="text-sm font-medium">{item.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </nav>
    </>
  );
}
