import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { NostrKeys } from "./nostr";
import type { Signer, SignerMode } from "./signer";

export type View = "chat" | "calendar" | "meetings" | "files" | "games" | "team" | "admin";

export interface MemberProfile {
  firstName: string;
  lastName: string;
  email: string;
  role?: string;
}

export interface ChatMessage {
  id: string;
  pubkey: string;
  content: string;
  created_at: number;
  channelId?: string;
}

export interface Channel {
  id: string;
  name: string;
  about?: string;
  picture?: string;
  isDirectMessage?: boolean;
  participants?: string[];
  lastMessage?: ChatMessage;
  unreadCount?: number;
}

export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  start: number;
  end?: number;
  location?: string;
  pubkey: string;
}

export type MeetingStatus = "scheduled" | "active" | "ended";

export interface Meeting {
  id: string;
  name: string;
  description?: string;
  status: MeetingStatus;
  scheduledAt?: number;
  createdAt: number;
  pubkey: string;
  participants: string[];
}

export interface Profile {
  pubkey: string;
  name?: string;
  displayName?: string;
  picture?: string;
  about?: string;
  nip05?: string;
}

interface AppState {
  // Auth
  keys: NostrKeys | null;
  setKeys: (keys: NostrKeys | null) => void;
  signer: Signer | null;
  setSigner: (signer: Signer | null) => void;
  signerMode: SignerMode | null;
  setSignerMode: (mode: SignerMode | null) => void;
  isRegistered: boolean;
  setIsRegistered: (val: boolean) => void;
  memberProfile: MemberProfile | null;
  setMemberProfile: (profile: MemberProfile | null) => void;

  // Navigation
  currentView: View;
  setCurrentView: (view: View) => void;

  // Chat
  channels: Channel[];
  setChannels: (channels: Channel[]) => void;
  addChannel: (channel: Channel) => void;
  activeChannelId: string | null;
  setActiveChannelId: (id: string | null) => void;
  messages: Record<string, ChatMessage[]>;
  addMessage: (channelId: string, message: ChatMessage) => void;
  clearUnread: (channelId: string) => void;
  incrementUnread: (channelId: string) => void;

  // Calendar
  calendarEvents: CalendarEvent[];
  setCalendarEvents: (events: CalendarEvent[]) => void;
  addCalendarEvent: (event: CalendarEvent) => void;

  // Meetings
  meetings: Meeting[];
  setMeetings: (meetings: Meeting[]) => void;
  addMeeting: (meeting: Meeting) => void;
  updateMeeting: (id: string, updates: Partial<Meeting>) => void;
  activeMeetingId: string | null;
  setActiveMeetingId: (id: string | null) => void;

  // Profiles cache
  profiles: Record<string, Profile>;
  setProfile: (pubkey: string, profile: Profile) => void;

  // Connection
  connectedRelays: string[];
  setConnectedRelays: (relays: string[]) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      // Auth
      keys: null,
      setKeys: (keys) => set({ keys }),
      signer: null,
      setSigner: (signer) => set({ signer }),
      signerMode: null,
      setSignerMode: (signerMode) => set({ signerMode }),
      isRegistered: false,
      setIsRegistered: (isRegistered) => set({ isRegistered }),
      memberProfile: null,
      setMemberProfile: (memberProfile) => set({ memberProfile }),

      // Navigation
      currentView: "chat",
      setCurrentView: (currentView) => set({ currentView }),

      // Chat
      channels: [],
      setChannels: (channels) => set({ channels }),
      addChannel: (channel) =>
        set((state) => ({
          channels: state.channels.some((c) => c.id === channel.id)
            ? state.channels
            : [...state.channels, channel],
        })),
      activeChannelId: null,
      setActiveChannelId: (activeChannelId) => set({ activeChannelId }),
      messages: {},
      addMessage: (channelId, message) =>
        set((state) => {
          const existing = state.messages[channelId] || [];
          if (existing.some((m) => m.id === message.id)) return state;
          const sorted = [...existing, message].sort(
            (a, b) => a.created_at - b.created_at
          );
          const lastMsg = sorted[sorted.length - 1];
          return {
            messages: {
              ...state.messages,
              [channelId]: sorted,
            },
            channels: state.channels.map((c) =>
              c.id === channelId ? { ...c, lastMessage: lastMsg } : c
            ),
          };
        }),
      clearUnread: (channelId) =>
        set((state) => ({
          channels: state.channels.map((c) =>
            c.id === channelId ? { ...c, unreadCount: 0 } : c
          ),
        })),
      incrementUnread: (channelId) =>
        set((state) => ({
          channels: state.channels.map((c) =>
            c.id === channelId
              ? { ...c, unreadCount: (c.unreadCount || 0) + 1 }
              : c
          ),
        })),

      // Calendar
      calendarEvents: [],
      setCalendarEvents: (calendarEvents) => set({ calendarEvents }),
      addCalendarEvent: (event) =>
        set((state) => ({
          calendarEvents: state.calendarEvents.some((e) => e.id === event.id)
            ? state.calendarEvents
            : [...state.calendarEvents, event],
        })),

      // Meetings
      meetings: [],
      setMeetings: (meetings) => set({ meetings }),
      addMeeting: (meeting) =>
        set((state) => ({
          meetings: state.meetings.some((m) => m.id === meeting.id)
            ? state.meetings
            : [...state.meetings, meeting],
        })),
      updateMeeting: (id, updates) =>
        set((state) => ({
          meetings: state.meetings.map((m) =>
            m.id === id ? { ...m, ...updates } : m
          ),
        })),
      activeMeetingId: null,
      setActiveMeetingId: (activeMeetingId) => set({ activeMeetingId }),

      // Profiles
      profiles: {},
      setProfile: (pubkey, profile) =>
        set((state) => ({
          profiles: { ...state.profiles, [pubkey]: profile },
        })),

      // Connection
      connectedRelays: [],
      setConnectedRelays: (connectedRelays) => set({ connectedRelays }),
    }),
    {
      name: "nostr-teams-storage",
      partialize: (state) => ({
        // Only persist keys and view preference
        keys: state.keys,
        signerMode: state.signerMode,
        currentView: state.currentView,
        channels: state.channels,
        isRegistered: state.isRegistered,
        memberProfile: state.memberProfile,
      }),
    }
  )
);
