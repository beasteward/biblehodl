// Meeting Service — NIP-28 channels with meeting metadata
// A meeting room is a kind 40 channel with type: "meeting" in content JSON
// Chat within meetings uses kind 42, same as regular channels

import { pool } from "./relay-pool";
import {
  createEvent,
  KIND_CHANNEL_CREATE,
  KIND_CHANNEL_MESSAGE,
} from "./nostr";
import { useAppStore } from "./store";
import type { Meeting, ChatMessage } from "./store";
import { fetchProfile } from "./chat-service";

// ─── Meeting Room Creation (kind 40, type: "meeting") ───

export async function createMeeting(
  name: string,
  description: string,
  scheduledAt: number | undefined,
  privateKey: Uint8Array
): Promise<string> {
  const content = JSON.stringify({
    name,
    about: description,
    picture: "",
    type: "meeting",
    status: scheduledAt && scheduledAt > Math.floor(Date.now() / 1000) ? "scheduled" : "active",
    scheduledAt: scheduledAt || undefined,
  });

  const tags: string[][] = [["t", "meeting"]];
  if (scheduledAt) {
    tags.push(["starts", String(scheduledAt)]);
  }

  const event = createEvent(KIND_CHANNEL_CREATE, content, tags, privateKey);
  await pool.publish(event);
  return event.id;
}

// ─── Send Message in Meeting (kind 42) ───

export async function sendMeetingMessage(
  meetingId: string,
  content: string,
  privateKey: Uint8Array
): Promise<string> {
  const tags: string[][] = [["e", meetingId, "", "root"]];
  const event = createEvent(KIND_CHANNEL_MESSAGE, content, tags, privateKey);
  await pool.publish(event);
  return event.id;
}

// ─── Update Meeting Status ───

export async function updateMeetingStatus(
  meetingId: string,
  status: "active" | "ended",
  privateKey: Uint8Array
): Promise<void> {
  // Publish a kind 42 system message to signal status change
  const content = JSON.stringify({
    type: "meeting-status",
    status,
  });
  const tags: string[][] = [
    ["e", meetingId, "", "root"],
    ["t", "meeting-status"],
  ];
  const event = createEvent(KIND_CHANNEL_MESSAGE, content, tags, privateKey);
  await pool.publish(event);

  // Update local store
  useAppStore.getState().updateMeeting(meetingId, { status });
}

// ─── Subscriptions ───

export function subscribeToMeetings() {
  const store = useAppStore.getState();

  // Subscribe to channel creation events tagged as meetings
  pool.subscribe(
    "meetings",
    [{ kinds: [KIND_CHANNEL_CREATE], "#t": ["meeting"], limit: 100 }],
    (event) => {
      try {
        const meta = JSON.parse(event.content);
        if (meta.type !== "meeting") return;

        const meeting: Meeting = {
          id: event.id,
          name: meta.name || "Untitled Meeting",
          description: meta.about,
          status: meta.status || "active",
          scheduledAt: meta.scheduledAt,
          createdAt: event.created_at,
          pubkey: event.pubkey,
          participants: [event.pubkey],
        };
        store.addMeeting(meeting);

        // Fetch creator profile
        if (!store.profiles[event.pubkey]) {
          fetchProfile(event.pubkey);
        }
      } catch {
        // skip malformed
      }
    }
  );
}

export function subscribeToMeetingMessages(meetingId: string) {
  const store = useAppStore.getState();

  pool.subscribe(
    `meeting-msgs-${meetingId}`,
    [
      {
        kinds: [KIND_CHANNEL_MESSAGE],
        "#e": [meetingId],
        limit: 200,
      },
    ],
    (event) => {
      // Check for status update messages
      try {
        const parsed = JSON.parse(event.content);
        if (parsed.type === "meeting-status") {
          store.updateMeeting(meetingId, { status: parsed.status });
          return;
        }
      } catch {
        // Not JSON — regular chat message
      }

      const msg: ChatMessage = {
        id: event.id,
        pubkey: event.pubkey,
        content: event.content,
        created_at: event.created_at,
        channelId: meetingId,
      };
      store.addMessage(meetingId, msg);

      // Track participant
      const meeting = store.meetings.find((m) => m.id === meetingId);
      if (meeting && !meeting.participants.includes(event.pubkey)) {
        store.updateMeeting(meetingId, {
          participants: [...meeting.participants, event.pubkey],
        });
      }

      // Fetch profile
      if (!store.profiles[event.pubkey]) {
        fetchProfile(event.pubkey);
      }
    }
  );
}

export function unsubscribeFromMeetingMessages(meetingId: string) {
  pool.unsubscribe(`meeting-msgs-${meetingId}`);
}

// ─── Init ───

export function initMeetings() {
  subscribeToMeetings();
}
