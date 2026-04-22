"use client";

import { useAppStore } from "../../lib/store";
import ChatSidebar from "../chat/ChatSidebar";

export default function Sidebar() {
  const currentView = useAppStore((s) => s.currentView);
  const calendarEvents = useAppStore((s) => s.calendarEvents);

  // Upcoming events (next 7 days)
  const now = Math.floor(Date.now() / 1000);
  const weekFromNow = now + 7 * 24 * 60 * 60;
  const upcoming = calendarEvents
    .filter((e) => e.start >= now && e.start <= weekFromNow)
    .sort((a, b) => a.start - b.start)
    .slice(0, 10);

  return (
    <div
      className="w-72 flex flex-col shrink-0 overflow-hidden"
      style={{ background: "var(--bg-secondary)", borderRight: "1px solid var(--border)" }}
    >
      <div className="p-4 shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
        <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
          {currentView === "chat" && "Chat"}
          {currentView === "calendar" && "Calendar"}
          {currentView === "meetings" && "Meetings"}
          {currentView === "files" && "Files"}
          {currentView === "games" && "Games"}
          {currentView === "team" && "Team"}
          {currentView === "admin" && "Admin"}
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto">
        {currentView === "chat" && <ChatSidebar />}
        {currentView === "calendar" && (
          <div className="p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--text-muted)" }}>
              Upcoming (7 days)
            </h3>
            {upcoming.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>No upcoming events</p>
            ) : (
              <div className="space-y-2">
                {upcoming.map((ev) => (
                  <div key={ev.id} className="p-2.5 rounded-lg" style={{ background: "var(--bg-tertiary)" }}>
                    <div className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{ev.title}</div>
                    <div className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                      {new Date(ev.start * 1000).toLocaleDateString("en", { weekday: "short", month: "short", day: "numeric" })}
                      {" · "}
                      {new Date(ev.start * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </div>
                    {ev.location && (
                      <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>📍 {ev.location}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {currentView === "meetings" && (
          <div className="p-4 text-sm" style={{ color: "var(--text-secondary)" }}>
            Meeting rooms will appear here.
          </div>
        )}
        {currentView === "files" && (
          <div className="p-4 text-sm" style={{ color: "var(--text-secondary)" }}>
            Drag &amp; drop files into the main area or click Upload.
          </div>
        )}
        {currentView === "games" && (
          <div className="p-4 text-sm" style={{ color: "var(--text-secondary)" }}>
            Create and play quiz games to reinforce learning.
          </div>
        )}
        {currentView === "team" && (
          <div className="p-4 text-sm" style={{ color: "var(--text-secondary)" }}>
            Manage your team, members, and invite codes.
          </div>
        )}
        {currentView === "admin" && (
          <div className="p-4 text-sm" style={{ color: "var(--text-secondary)" }}>
            Admin panel — manage members and invites.
          </div>
        )}
      </div>
    </div>
  );
}
