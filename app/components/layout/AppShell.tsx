"use client";

import { useEffect } from "react";
import { useAppStore, type View } from "../../lib/store";
import {
  initChat,
  teardownChat,
  subscribeToChannelUnread,
  subscribeToReactions,
  unsubscribeFromReactions,
} from "../../lib/chat-service";
import { subscribeToDMs } from "../../lib/dm-service";
import { subscribeToCalendarEvents } from "../../lib/calendar-service";
import { initMeetings } from "../../lib/meeting-service";
import ActivityBar from "./ActivityBar";
import Sidebar from "./Sidebar";
import ChatView from "../chat/ChatView";
import ActivityView from "../activity/ActivityView";
import CalendarView from "../calendar/CalendarView";
import MeetingsView from "../meetings/MeetingsView";
import FilesView from "../files/FilesView";
import GamesView from "../games/GamesView";
import TeamManager from "../team/TeamManager";
import AdminPanel from "../admin/AdminPanel";

const views: Record<View, React.ComponentType> = {
  chat: ChatView,
  activity: ActivityView,
  calendar: CalendarView,
  meetings: MeetingsView,
  files: FilesView,
  games: GamesView,
  team: TeamManager,
  admin: AdminPanel,
};

export default function AppShell() {
  const currentView = useAppStore((s) => s.currentView);
  const keys = useAppStore((s) => s.keys);
  const ActiveView = views[currentView];

  const signer = useAppStore((s) => s.signer);

  useEffect(() => {
    initChat().then(() => {
      if (keys?.publicKey && signer) {
        subscribeToDMs(signer);
        subscribeToChannelUnread(keys.publicKey);
        subscribeToReactions(keys.publicKey);
        subscribeToCalendarEvents([keys.publicKey]);
        initMeetings();
      }
    });
    return () => {
      unsubscribeFromReactions();
      teardownChat();
    };
  }, [keys, signer]);

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <ActivityBar />
      <Sidebar />
      <main className="flex-1 flex flex-col min-w-0" style={{ background: "var(--bg-primary)" }}>
        <ActiveView />
      </main>
    </div>
  );
}
