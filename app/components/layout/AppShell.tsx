"use client";

import { useEffect, useState } from "react";
import { useAppStore, type View } from "../../lib/store";
import {
  initChat,
  teardownChat,
  subscribeToChannelUnread,
  subscribeToReactions,
  unsubscribeFromReactions,
  subscribeToChannelMembership,
  unsubscribeFromChannelMembership,
} from "../../lib/chat-service";
import { subscribeToDMs } from "../../lib/dm-service";
import { subscribeToCalendarEvents } from "../../lib/calendar-service";
import { initMeetings } from "../../lib/meeting-service";
import ActivityBar from "./ActivityBar";
import Sidebar, { SidebarContent } from "./Sidebar";
import ChatView from "../chat/ChatView";
import ActivityView from "../activity/ActivityView";
import CalendarView from "../calendar/CalendarView";
import MeetingsView from "../meetings/MeetingsView";
import FilesView from "../files/FilesView";
import GamesView from "../games/GamesView";
import BibleView from "../bible/BibleView";
import { fetchBibleStatus } from "../../lib/bible-service";
import TeamManager from "../team/TeamManager";
import AdminPanel from "../admin/AdminPanel";

const viewTitles: Record<View, string> = {
  chat: "Chat",
  activity: "Activity",
  calendar: "Calendar",
  meetings: "Meetings",
  files: "Files",
  games: "Games",
  bible: "Bible",
  team: "Team",
  admin: "Admin",
};

const views: Record<View, React.ComponentType> = {
  chat: ChatView,
  activity: ActivityView,
  calendar: CalendarView,
  meetings: MeetingsView,
  files: FilesView,
  games: GamesView,
  bible: BibleView,
  team: TeamManager,
  admin: AdminPanel,
};

export default function AppShell() {
  const currentView = useAppStore((s) => s.currentView);
  const keys = useAppStore((s) => s.keys);
  const activeChannelId = useAppStore((s) => s.activeChannelId);
  const ActiveView = views[currentView];

  const signer = useAppStore((s) => s.signer);
  const setBibleEnabled = useAppStore((s) => s.setBibleEnabled);

  // Resolve once whether the Bible feature is configured for this deployment,
  // so the nav item only appears when the CPDV proxy is wired up.
  useEffect(() => {
    if (!signer) return;
    let cancelled = false;
    fetchBibleStatus(signer).then((enabled) => {
      if (!cancelled) setBibleEnabled(enabled);
    });
    return () => {
      cancelled = true;
    };
  }, [signer, setBibleEnabled]);

  // Mobile slide-in drawer for the Sidebar.
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Auto-close the drawer after navigating (view change or channel selection).
  useEffect(() => {
    setDrawerOpen(false);
  }, [currentView, activeChannelId]);

  // Close on Escape.
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  useEffect(() => {
    initChat().then(() => {
      if (keys?.publicKey && signer) {
        subscribeToDMs(signer);
        subscribeToChannelUnread(keys.publicKey);
        subscribeToReactions(keys.publicKey);
        subscribeToChannelMembership(keys.publicKey);
        subscribeToCalendarEvents([keys.publicKey]);
        initMeetings();
      }
    });
    return () => {
      unsubscribeFromReactions();
      unsubscribeFromChannelMembership();
      teardownChat();
    };
  }, [keys, signer]);

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <ActivityBar />
      <Sidebar />
      <main className="flex-1 flex flex-col min-w-0 pb-14 md:pb-0" style={{ background: "var(--bg-primary)" }}>
        {/* Mobile header with hamburger to open the Sidebar drawer */}
        <div
          className="md:hidden flex items-center gap-3 px-4 py-3 shrink-0"
          style={{ background: "var(--bg-secondary)", borderBottom: "1px solid var(--border)" }}
        >
          <button
            onClick={() => setDrawerOpen(true)}
            className="w-9 h-9 flex items-center justify-center rounded-lg text-xl"
            style={{ color: "var(--text-primary)" }}
            aria-label="Open menu"
          >
            ☰
          </button>
          <span className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
            {viewTitles[currentView]}
          </span>
        </div>
        <ActiveView />
      </main>

      {/* Mobile slide-in drawer (Sidebar content) */}
      <div className={`md:hidden fixed inset-0 z-[60] ${drawerOpen ? "" : "pointer-events-none"}`}>
        {/* Backdrop */}
        <div
          className={`absolute inset-0 transition-opacity duration-200 ${drawerOpen ? "opacity-100" : "opacity-0"}`}
          style={{ background: "rgba(0,0,0,0.5)" }}
          onClick={() => setDrawerOpen(false)}
        />
        {/* Panel */}
        <div
          className={`absolute left-0 top-0 bottom-0 w-72 max-w-[82%] flex flex-col overflow-hidden shadow-xl transition-transform duration-200 ${
            drawerOpen ? "translate-x-0" : "-translate-x-full"
          }`}
          style={{ background: "var(--bg-secondary)", borderRight: "1px solid var(--border)" }}
        >
          <SidebarContent />
        </div>
      </div>
    </div>
  );
}
