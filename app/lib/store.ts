import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Identity } from "./nostr";
import type { Signer, SignerType } from "./signer";

export type View = "chat" | "activity" | "calendar" | "meetings" | "files" | "games" | "bible" | "team" | "admin";

// Last-read position in the Bible reader. Persisted so members resume where
// they left off. Only the position is cached — never the scripture text, which
// always comes fresh-but-cached through the BFF proxy.
export interface BibleLocation {
  book: string;
  chapter: number;
}

// A relay-published Bible bookmark (one entry in the member's NIP-51
// `bible-bookmarks` set). `ref` is the canonical, parseable reference string
// (e.g. "John 3:16" or "John 3:16-18") and doubles as the identity key.
export interface BibleBookmark {
  ref: string;
  book: string;
  chapter: number;
  verse: number;
  endVerse?: number;
  snippet?: string;
}

export interface MemberProfile {
  firstName: string;
  lastName: string;
  email: string;
  role?: string;
}

// Delivery state for a message we sent. Received messages carry no status
// (treated as already delivered). "sending" = optimistically rendered, publish
// in flight; "failed" = reached zero relays; "sent" = at least one relay
// accepted it (or the relay echoed it back to us).
export type MessageStatus = "sending" | "sent" | "failed";

export interface ChatMessage {
  id: string;
  pubkey: string;
  content: string;
  created_at: number;
  channelId?: string;
  status?: MessageStatus;
}

// NIP-25 reaction (kind 7) targeting a chat message.
export interface Reaction {
  id: string; // reaction event id (kind 7)
  targetId: string; // id of the message being reacted to
  pubkey: string; // reactor
  emoji: string; // reaction content ("+" normalized to 👍)
  created_at: number;
}

// A Teams-style Activity feed entry. Supports reactions to your messages and
// being added to a channel; can grow to mentions, replies, RSVPs, etc.
export interface ActivityItem {
  id: string; // source event id (stable, dedup key)
  type: "reaction" | "channel_add";
  actorPubkey: string; // who performed the action
  emoji?: string; // reaction only
  targetId?: string; // reaction: your message they reacted to
  targetSnippet?: string; // reaction: preview of your message, if known
  channelId?: string; // channel/DM the item relates to, if known
  channelName?: string; // channel_add: name of the channel you were added to
  created_at: number;
}

export interface Channel {
  id: string;
  name: string;
  about?: string;
  picture?: string;
  createdBy?: string;
  isDirectMessage?: boolean;
  participants?: string[];
  lastMessage?: ChatMessage;
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
  // Auth — `keys` holds ONLY public identity (no secret material).
  keys: Identity | null;
  setKeys: (keys: Identity | null) => void;
  signer: Signer | null;
  setSigner: (signer: Signer | null) => void;
  signerMode: SignerType | null;
  setSignerMode: (mode: SignerType | null) => void;
  // Passphrase-encrypted private key (NIP-49). Safe to persist; null for NIP-07.
  ncryptsec: string | null;
  setNcryptsec: (value: string | null) => void;
  // True when a local-mode session is restored from storage but not yet unlocked.
  locked: boolean;
  setLocked: (locked: boolean) => void;
  // Clear all auth state (logout).
  logout: () => void;
  isRegistered: boolean;
  setIsRegistered: (val: boolean) => void;
  memberProfile: MemberProfile | null;
  setMemberProfile: (profile: MemberProfile | null) => void;

  // Navigation
  currentView: View;
  setCurrentView: (view: View) => void;

  // Bible reader
  bibleLocation: BibleLocation | null;
  setBibleLocation: (loc: BibleLocation | null) => void;
  // Whether the Bible feature is configured server-side (resolved once at load).
  // Null = not yet checked; gates whether the Bible nav item renders at all.
  bibleEnabled: boolean | null;
  setBibleEnabled: (enabled: boolean) => void;
  // Relay-published bookmarks (NIP-51). Hydrated fresh from the relay each
  // session — never persisted, so the relay stays the source of truth.
  // `bibleBookmarksAt` is the created_at of the newest list event seen, used to
  // ignore stale replays that would otherwise clobber a newer list.
  bibleBookmarks: BibleBookmark[];
  bibleBookmarksAt: number;
  setBibleBookmarks: (list: BibleBookmark[], updatedAt: number) => void;

  // Chat
  channels: Channel[];
  setChannels: (channels: Channel[]) => void;
  addChannel: (channel: Channel) => void;
  activeChannelId: string | null;
  setActiveChannelId: (id: string | null) => void;
  messages: Record<string, ChatMessage[]>;
  addMessage: (channelId: string, message: ChatMessage) => void;
  updateMessageStatus: (channelId: string, id: string, status: MessageStatus) => void;

  // Reactions, keyed by the target message id.
  reactions: Record<string, Reaction[]>;
  addReaction: (reaction: Reaction) => void;
  removeReaction: (reactionId: string, byPubkey: string) => void;

  // Teams-style Activity feed (newest first) + persisted read boundary.
  activity: ActivityItem[];
  addActivity: (item: ActivityItem) => void;
  activityLastReadAt: number;
  markActivityRead: () => void;

  // Unread tracking. `unreadCounts` is session-only and recomputed from relay
  // history each load; `lastReadAt` (unix seconds per channel) is persisted so
  // unread reflects "messages since you last opened the channel" and survives
  // reloads instead of resetting or re-inflating from replayed history.
  unreadCounts: Record<string, number>;
  lastReadAt: Record<string, number>;
  incrementUnread: (channelId: string) => void;
  clearUnread: (channelId: string) => void;
  markChannelRead: (channelId: string, ts?: number) => void;
  ensureChannelTracked: (channelId: string, ts?: number) => void;

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

  // Channel membership
  myChannelIds: Set<string>;
  setMyChannelIds: (ids: Set<string>) => void;

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
      ncryptsec: null,
      setNcryptsec: (ncryptsec) => set({ ncryptsec }),
      locked: false,
      setLocked: (locked) => set({ locked }),
      logout: () =>
        set({
          // Auth
          keys: null,
          signer: null,
          signerMode: null,
          ncryptsec: null,
          locked: false,
          isRegistered: false,
          memberProfile: null,
          // Session-scoped data — clear so the next account never inherits the
          // previous user's cached channels/messages/profiles.
          currentView: "chat",
          channels: [],
          activeChannelId: null,
          messages: {},
          reactions: {},
          activity: [],
          activityLastReadAt: 0,
          unreadCounts: {},
          lastReadAt: {},
          myChannelIds: new Set<string>(),
          calendarEvents: [],
          meetings: [],
          activeMeetingId: null,
          profiles: {},
          bibleLocation: null,
          bibleBookmarks: [],
          bibleBookmarksAt: 0,
        }),
      isRegistered: false,
      setIsRegistered: (isRegistered) => set({ isRegistered }),
      memberProfile: null,
      setMemberProfile: (memberProfile) => set({ memberProfile }),

      // Navigation
      currentView: "chat",
      setCurrentView: (currentView) => set({ currentView }),

      // Bible reader
      bibleLocation: null,
      setBibleLocation: (bibleLocation) => set({ bibleLocation }),
      bibleEnabled: null,
      setBibleEnabled: (bibleEnabled) => set({ bibleEnabled }),
      bibleBookmarks: [],
      bibleBookmarksAt: 0,
      setBibleBookmarks: (bibleBookmarks, bibleBookmarksAt) =>
        set({ bibleBookmarks, bibleBookmarksAt }),

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
      // ── Reactions ──
      reactions: {},
      addReaction: (reaction) =>
        set((state) => {
          const existing = state.reactions[reaction.targetId] || [];
          // Dedup by reaction event id; also collapse a repeat of the same
          // (pubkey, emoji) so a double-tap never double-counts.
          if (
            existing.some(
              (r) =>
                r.id === reaction.id ||
                (r.pubkey === reaction.pubkey && r.emoji === reaction.emoji)
            )
          ) {
            return state;
          }
          return {
            reactions: {
              ...state.reactions,
              [reaction.targetId]: [...existing, reaction],
            },
          };
        }),
      removeReaction: (reactionId, byPubkey) =>
        set((state) => {
          const next: Record<string, Reaction[]> = {};
          for (const [targetId, list] of Object.entries(state.reactions)) {
            // Only the original reactor may retract their reaction.
            next[targetId] = list.filter(
              (r) => !(r.id === reactionId && r.pubkey === byPubkey)
            );
          }
          return { reactions: next };
        }),

      // ── Activity feed ──
      activity: [],
      addActivity: (item) =>
        set((state) => {
          if (state.activity.some((a) => a.id === item.id)) return state;
          return {
            activity: [item, ...state.activity].sort(
              (a, b) => b.created_at - a.created_at
            ),
          };
        }),
      activityLastReadAt: 0,
      markActivityRead: () =>
        set({ activityLastReadAt: Math.floor(Date.now() / 1000) }),
      messages: {},
      addMessage: (channelId, message) =>
        set((state) => {
          const existing = state.messages[channelId] || [];
          const dupIdx = existing.findIndex((m) => m.id === message.id);
          if (dupIdx !== -1) {
            // Already have this message. If it's our own optimistic copy still
            // marked sending/failed and the authoritative relay echo just
            // arrived, confirm delivery so the UI clears the pending state.
            const cur = existing[dupIdx];
            if (cur.status && cur.status !== "sent") {
              const next = [...existing];
              next[dupIdx] = { ...cur, status: "sent" };
              return { messages: { ...state.messages, [channelId]: next } };
            }
            return state;
          }
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
      updateMessageStatus: (channelId, id, status) =>
        set((state) => {
          const list = state.messages[channelId];
          if (!list) return state;
          const idx = list.findIndex((m) => m.id === id);
          if (idx === -1 || list[idx].status === status) return state;
          const next = [...list];
          next[idx] = { ...next[idx], status };
          return { messages: { ...state.messages, [channelId]: next } };
        }),

      // ── Unread tracking ──
      unreadCounts: {},
      lastReadAt: {},
      incrementUnread: (channelId) =>
        set((state) => ({
          unreadCounts: {
            ...state.unreadCounts,
            [channelId]: (state.unreadCounts[channelId] || 0) + 1,
          },
        })),
      clearUnread: (channelId) =>
        set((state) => ({
          unreadCounts: { ...state.unreadCounts, [channelId]: 0 },
        })),
      // Mark a channel read up to `ts` (defaults to now): advances the persisted
      // read boundary and zeroes the live unread count.
      markChannelRead: (channelId, ts) =>
        set((state) => {
          const now = Math.floor(Date.now() / 1000);
          const boundary = Math.max(state.lastReadAt[channelId] || 0, ts ?? now);
          return {
            lastReadAt: { ...state.lastReadAt, [channelId]: boundary },
            unreadCounts: { ...state.unreadCounts, [channelId]: 0 },
          };
        }),
      // Initialize a read boundary for a newly-discovered channel (defaults to
      // now) so first-ever load never counts the entire backlog as unread.
      ensureChannelTracked: (channelId, ts) =>
        set((state) => {
          if (state.lastReadAt[channelId] !== undefined) return state;
          const now = Math.floor(Date.now() / 1000);
          return {
            lastReadAt: { ...state.lastReadAt, [channelId]: ts ?? now },
          };
        }),

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

      // Channel membership
      myChannelIds: new Set<string>(),
      setMyChannelIds: (myChannelIds) => set({ myChannelIds }),

      // Connection
      connectedRelays: [],
      setConnectedRelays: (connectedRelays) => set({ connectedRelays }),
    }),
    {
      name: "nostr-teams-storage",
      partialize: (state) => ({
        // Persist ONLY auth identity + encrypted key blob (never raw secrets)
        // plus benign UI nav state. Everything else — channels, messages,
        // registration status, member profile — is derived fresh from the
        // relay/server on each load so the UI always reflects live truth and
        // never resurrects a stale instant-render cache after a data wipe.
        keys: state.keys,
        signerMode: state.signerMode,
        ncryptsec: state.ncryptsec,
        currentView: state.currentView,
        // Resume the reader at the member's last position across reloads.
        bibleLocation: state.bibleLocation,
        // Persisted so the Activity badge reflects "since you last looked".
        activityLastReadAt: state.activityLastReadAt,
        // Persisted read state so unread badges reflect "since you last looked"
        // across reloads. Safe to persist (just timestamps keyed by channel id).
        lastReadAt: state.lastReadAt,
      }),
    }
  )
);
