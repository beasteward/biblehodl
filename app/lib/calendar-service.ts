// NIP-52 Calendar Service
// kind 31922 — date-based calendar event
// kind 31923 — time-based calendar event

import { pool } from "./relay-pool";
import { useAppStore } from "./store";
import type { CalendarEvent } from "./store";
import type { Signer } from "./signer";

const KIND_TIME_CALENDAR_EVENT = 31923;
const KIND_CALENDAR_RSVP = 31925;

export interface CreateEventInput {
  title: string;
  description?: string;
  start: Date;
  end?: Date;
  location?: string;
  allDay?: boolean;
  // Optional Bible passage reference for reading-plan entries (e.g. "John 3").
  bibleRef?: string;
}

// ─── Create calendar event ───

export async function createCalendarEvent(
  input: CreateEventInput,
  signer: Signer
): Promise<string> {
  const pubkey = signer.pubkey;
  const dTag = crypto.randomUUID();

  const tags: string[][] = [
    ["d", dTag],
    ["title", input.title],
  ];

  if (input.allDay) {
    // Date-based event (kind 31922)
    tags.push(["start", formatDateOnly(input.start)]);
    if (input.end) tags.push(["end", formatDateOnly(input.end)]);
  } else {
    // Time-based event (kind 31923)
    tags.push(["start", String(Math.floor(input.start.getTime() / 1000))]);
    if (input.end) tags.push(["end", String(Math.floor(input.end.getTime() / 1000))]);
  }

  if (input.location) tags.push(["location", input.location]);
  if (input.description) tags.push(["description", input.description]);
  if (input.bibleRef) tags.push(["bible", input.bibleRef]);

  const kind = input.allDay ? 31922 : KIND_TIME_CALENDAR_EVENT;

  const signed = await signer.signEvent({
    kind,
    tags,
    content: input.description || "",
  });
  await pool.publish(signed);

  // Add to local store
  useAppStore.getState().addCalendarEvent({
    id: signed.id,
    title: input.title,
    description: input.description,
    start: Math.floor(input.start.getTime() / 1000),
    end: input.end ? Math.floor(input.end.getTime() / 1000) : undefined,
    location: input.location,
    pubkey,
    bibleRef: input.bibleRef,
  });

  return signed.id;
}

// ─── Reading plan: generate one all-day calendar entry per day ───

export interface ReadingPlanInput {
  book: string;
  /** Total chapters in the book. */
  chapters: number;
  startDate: Date;
  /** Chapters covered per day (default 1). */
  chaptersPerDay?: number;
}

/**
 * Create a Bible reading plan as a series of NIP-52 date-based calendar events,
 * one per day, each tagged with its passage reference for deep-linking.
 * Returns the number of entries created.
 */
export async function createReadingPlan(input: ReadingPlanInput, signer: Signer): Promise<number> {
  const perDay = Math.max(1, input.chaptersPerDay ?? 1);
  let created = 0;
  let day = 0;
  for (let ch = 1; ch <= input.chapters; ch += perDay) {
    const last = Math.min(ch + perDay - 1, input.chapters);
    const ref = perDay === 1 || last === ch ? `${input.book} ${ch}` : `${input.book} ${ch}-${last}`;
    const date = new Date(input.startDate);
    date.setDate(date.getDate() + day);
    await createCalendarEvent(
      {
        title: `📖 ${ref}`,
        start: date,
        allDay: true,
        bibleRef: ref,
        description: `Bible reading plan: ${input.book}`,
      },
      signer
    );
    created++;
    day++;
  }
  return created;
}

// ─── Subscribe to calendar events ───

export function subscribeToCalendarEvents(pubkeys?: string[]) {
  const store = useAppStore.getState();
  const filters: Record<string, unknown>[] = [
    {
      kinds: [31922, KIND_TIME_CALENDAR_EVENT],
      limit: 200,
      ...(pubkeys ? { authors: pubkeys } : {}),
    },
  ];

  pool.subscribe(
    "calendar-events",
    filters,
    (event) => {
      const tags = new Map(event.tags.map((t) => [t[0], t[1]]));
      const title = tags.get("title") || tags.get("name") || "Untitled";
      const bibleRef = tags.get("bible");
      const startRaw = tags.get("start");
      const endRaw = tags.get("end");
      const location = tags.get("location");

      let start: number;
      if (event.kind === 31922 && startRaw) {
        // Date-based: parse YYYY-MM-DD
        start = Math.floor(new Date(startRaw + "T00:00:00").getTime() / 1000);
      } else {
        start = startRaw ? parseInt(startRaw) : event.created_at;
      }

      let end: number | undefined;
      if (endRaw) {
        end = event.kind === 31922
          ? Math.floor(new Date(endRaw + "T23:59:59").getTime() / 1000)
          : parseInt(endRaw);
      }

      const calEvent: CalendarEvent = {
        id: event.id,
        title,
        description: event.content || tags.get("description"),
        start,
        end,
        location,
        pubkey: event.pubkey,
        bibleRef,
      };

      store.addCalendarEvent(calEvent);
    }
  );
}

// ─── RSVP ───

export async function rsvpToEvent(
  eventId: string,
  eventPubkey: string,
  status: "accepted" | "declined" | "tentative",
  signer: Signer
) {
  const signed = await signer.signEvent({
    kind: KIND_CALENDAR_RSVP,
    tags: [
      ["d", eventId],
      ["a", `31923:${eventPubkey}:${eventId}`],
      ["status", status],
      ["L", "status"],
      ["l", status, "status"],
    ],
    content: "",
  });
  await pool.publish(signed);
}

function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}
