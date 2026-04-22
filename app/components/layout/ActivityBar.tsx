"use client";

import { useAppStore, type View } from "../../lib/store";

const navItems: { view: View; icon: string; label: string }[] = [
  { view: "chat", icon: "💬", label: "Chat" },
  { view: "calendar", icon: "📅", label: "Calendar" },
  { view: "meetings", icon: "👥", label: "Meetings" },
  { view: "files", icon: "📁", label: "Files" },
  { view: "games", icon: "🎮", label: "Games" },
  { view: "team", icon: "⚙️", label: "Team" },
  { view: "admin", icon: "🛡️", label: "Admin" },
];

export default function ActivityBar() {
  const currentView = useAppStore((s) => s.currentView);
  const setCurrentView = useAppStore((s) => s.setCurrentView);
  const keys = useAppStore((s) => s.keys);
  const connectedRelays = useAppStore((s) => s.connectedRelays);

  return (
    <div
      className="w-16 flex flex-col items-center py-4 gap-2 shrink-0"
      style={{ background: "var(--bg-secondary)", borderRight: "1px solid var(--border)" }}
    >
      {/* App logo */}
      <div className="w-10 h-10 rounded-lg flex items-center justify-center text-xl mb-4" style={{ background: "var(--accent)" }}>
        ⚡
      </div>

      {navItems.map((item) => (
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
  );
}
