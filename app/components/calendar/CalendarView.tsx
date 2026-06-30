"use client";

import { useState, useEffect, useMemo } from "react";
import { useAppStore } from "../../lib/store";
import { createCalendarEvent, createReadingPlan, subscribeToCalendarEvents } from "../../lib/calendar-service";
import { fetchBooks, fetchChapters, type BibleBook } from "../../lib/bible-service";

export default function CalendarView() {
  const keys = useAppStore((s) => s.keys);
  const calendarEvents = useAppStore((s) => s.calendarEvents);
  const bibleEnabled = useAppStore((s) => s.bibleEnabled);
  const openBibleRef = useAppStore((s) => s.openBibleRef);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showCreate, setShowCreate] = useState(false);
  const [showPlan, setShowPlan] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // Subscribe to calendar events
  useEffect(() => {
    if (keys) {
      subscribeToCalendarEvents([keys.publicKey]);
    }
  }, [keys]);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const monthName = currentDate.toLocaleString("en", { month: "long", year: "numeric" });

  // Build calendar grid
  const calendarDays = useMemo(() => {
    const days: { date: string; day: number; isCurrentMonth: boolean }[] = [];
    // Previous month padding
    const prevMonthDays = new Date(year, month, 0).getDate();
    for (let i = firstDayOfWeek - 1; i >= 0; i--) {
      const d = prevMonthDays - i;
      const m = month === 0 ? 12 : month;
      const y = month === 0 ? year - 1 : year;
      days.push({ date: `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`, day: d, isCurrentMonth: false });
    }
    // Current month
    for (let d = 1; d <= daysInMonth; d++) {
      days.push({
        date: `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
        day: d,
        isCurrentMonth: true,
      });
    }
    // Next month padding
    const remaining = 42 - days.length;
    for (let d = 1; d <= remaining; d++) {
      const m = month + 2 > 12 ? 1 : month + 2;
      const y = month + 2 > 12 ? year + 1 : year;
      days.push({ date: `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`, day: d, isCurrentMonth: false });
    }
    return days;
  }, [year, month, daysInMonth, firstDayOfWeek]);

  // Events by date
  const eventsByDate = useMemo(() => {
    const map: Record<string, typeof calendarEvents> = {};
    for (const ev of calendarEvents) {
      const date = new Date(ev.start * 1000).toISOString().slice(0, 10);
      if (!map[date]) map[date] = [];
      map[date].push(ev);
    }
    return map;
  }, [calendarEvents]);

  const todayStr = new Date().toISOString().slice(0, 10);

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
  const goToday = () => setCurrentDate(new Date());

  const selectedEvents = selectedDate ? eventsByDate[selectedDate] || [] : [];

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-6 py-3 flex items-center justify-between shrink-0" style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-secondary)" }}>
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>{monthName}</h2>
          <div className="flex gap-1">
            <button onClick={prevMonth} className="px-2 py-1 rounded text-sm cursor-pointer" style={{ background: "var(--bg-tertiary)", color: "var(--text-secondary)" }}>←</button>
            <button onClick={goToday} className="px-3 py-1 rounded text-sm cursor-pointer" style={{ background: "var(--bg-tertiary)", color: "var(--text-secondary)" }}>Today</button>
            <button onClick={nextMonth} className="px-2 py-1 rounded text-sm cursor-pointer" style={{ background: "var(--bg-tertiary)", color: "var(--text-secondary)" }}>→</button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {bibleEnabled && (
            <button
              onClick={() => setShowPlan(true)}
              className="px-3 py-1.5 rounded text-sm cursor-pointer"
              style={{ background: "var(--bg-tertiary)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}
            >
              📖 Reading plan
            </button>
          )}
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-1.5 rounded text-sm cursor-pointer"
            style={{ background: "var(--accent)", color: "white" }}
          >
            + New Event
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Calendar Grid */}
        <div className="flex-1 p-4 overflow-auto">
          {/* Weekday headers */}
          <div className="grid grid-cols-7 gap-px mb-1">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <div key={d} className="text-center text-xs py-2 font-medium" style={{ color: "var(--text-muted)" }}>{d}</div>
            ))}
          </div>
          {/* Days grid */}
          <div className="grid grid-cols-7 gap-px rounded-lg overflow-hidden" style={{ background: "var(--border)" }}>
            {calendarDays.map(({ date, day, isCurrentMonth }) => {
              const events = eventsByDate[date] || [];
              const isToday = date === todayStr;
              const isSelected = date === selectedDate;
              return (
                <button
                  key={date}
                  onClick={() => setSelectedDate(date === selectedDate ? null : date)}
                  className="min-h-[80px] p-1.5 text-left cursor-pointer flex flex-col"
                  style={{
                    background: isSelected ? "var(--bg-active)" : "var(--bg-secondary)",
                    opacity: isCurrentMonth ? 1 : 0.4,
                  }}
                >
                  <span
                    className={`text-xs w-6 h-6 flex items-center justify-center rounded-full ${isToday ? "font-bold" : ""}`}
                    style={{
                      background: isToday ? "var(--accent)" : "transparent",
                      color: isToday ? "white" : "var(--text-primary)",
                    }}
                  >
                    {day}
                  </span>
                  <div className="mt-1 space-y-0.5 overflow-hidden">
                    {events.slice(0, 3).map((ev) => (
                      <div
                        key={ev.id}
                        className="text-[10px] px-1 py-0.5 rounded truncate"
                        style={{ background: "var(--accent)", color: "white" }}
                      >
                        {ev.title}
                      </div>
                    ))}
                    {events.length > 3 && (
                      <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                        +{events.length - 3} more
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Side panel — selected day details */}
        {selectedDate && (
          <div className="w-72 shrink-0 overflow-y-auto p-4" style={{ borderLeft: "1px solid var(--border)", background: "var(--bg-secondary)" }}>
            <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--text-primary)" }}>
              {new Date(selectedDate + "T00:00:00").toLocaleDateString("en", { weekday: "long", month: "long", day: "numeric" })}
            </h3>
            {selectedEvents.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>No events</p>
            ) : (
              <div className="space-y-3">
                {selectedEvents.map((ev) => (
                  <div key={ev.id} className="p-3 rounded-lg" style={{ background: "var(--bg-tertiary)" }}>
                    <div className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{ev.title}</div>
                    {ev.start && (
                      <div className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                        {new Date(ev.start * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        {ev.end && ` — ${new Date(ev.end * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
                      </div>
                    )}
                    {ev.location && (
                      <div className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>📍 {ev.location}</div>
                    )}
                    {ev.description && (
                      <div className="text-xs mt-2" style={{ color: "var(--text-secondary)" }}>{ev.description}</div>
                    )}
                    {ev.bibleRef && (
                      <button
                        onClick={() => openBibleRef(ev.bibleRef!)}
                        className="mt-2 text-xs font-medium px-2.5 py-1 rounded cursor-pointer"
                        style={{ background: "var(--accent)", color: "white" }}
                      >
                        📖 Read {ev.bibleRef}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Create Event Modal */}
      {showCreate && <CreateEventModal onClose={() => setShowCreate(false)} />}
      {showPlan && <CreateReadingPlanModal onClose={() => setShowPlan(false)} />}
    </div>
  );
}

function CreateReadingPlanModal({ onClose }: { onClose: () => void }) {
  const signer = useAppStore((s) => s.signer);
  const [books, setBooks] = useState<BibleBook[]>([]);
  const [book, setBook] = useState("");
  const [startDate, setStartDate] = useState("");
  const [perDay, setPerDay] = useState(1);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);

  useEffect(() => {
    if (!signer) return;
    fetchBooks(signer).then(setBooks).catch(() => setError("Couldn’t load books"));
  }, [signer]);

  const selected = books.find((b) => b.key === book);

  const handleCreate = async () => {
    if (!signer || !selected || !startDate) return;
    setCreating(true);
    setError(null);
    try {
      // Use the live chapter count for the book so the plan covers it exactly.
      const chapters = await fetchChapters(signer, selected.key);
      const count = await createReadingPlan(
        {
          book: selected.key,
          chapters: chapters.length || selected.chapterCount,
          startDate: new Date(startDate + "T00:00:00"),
          chaptersPerDay: perDay,
        },
        signer
      );
      setDone(count);
    } catch (e) {
      setError((e as Error).message || "Failed to create plan");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)" }}>
      <div className="w-full max-w-md rounded-xl p-6 space-y-4" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}>
        <h3 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>📖 Bible reading plan</h3>

        {done != null ? (
          <>
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              Added {done} daily reading{done !== 1 ? "s" : ""} to your calendar. Tap any day’s entry to open the passage.
            </p>
            <div className="flex justify-end">
              <button onClick={onClose} className="px-4 py-2 rounded text-sm cursor-pointer" style={{ background: "var(--accent)", color: "white" }}>
                Done
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              Generates one calendar entry per day covering a book, each linking into the reader.
            </p>
            <div>
              <label className="text-xs mb-1 block" style={{ color: "var(--text-muted)" }}>Book</label>
              <select
                value={book}
                onChange={(e) => setBook(e.target.value)}
                className="w-full px-3 py-2 rounded text-sm outline-none"
                style={{ background: "var(--bg-tertiary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
              >
                <option value="">Select a book…</option>
                {books.map((b) => (
                  <option key={b.key} value={b.key}>{b.name} ({b.chapterCount} ch)</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs mb-1 block" style={{ color: "var(--text-muted)" }}>Start date</label>
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-3 py-2 rounded text-sm outline-none" style={{ background: "var(--bg-tertiary)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
              </div>
              <div>
                <label className="text-xs mb-1 block" style={{ color: "var(--text-muted)" }}>Chapters/day</label>
                <input type="number" min={1} max={20} value={perDay} onChange={(e) => setPerDay(Math.max(1, Number(e.target.value) || 1))}
                  className="w-full px-3 py-2 rounded text-sm outline-none" style={{ background: "var(--bg-tertiary)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
              </div>
            </div>
            {selected && (
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                {Math.ceil(selected.chapterCount / perDay)} day{Math.ceil(selected.chapterCount / perDay) !== 1 ? "s" : ""} to finish {selected.name}.
              </p>
            )}
            {error && <p className="text-sm" style={{ color: "var(--danger)" }}>{error}</p>}
            <div className="flex gap-2 justify-end pt-2">
              <button onClick={onClose} className="px-4 py-2 rounded text-sm cursor-pointer" style={{ background: "var(--bg-tertiary)", color: "var(--text-secondary)" }}>Cancel</button>
              <button onClick={handleCreate} disabled={creating || !book || !startDate}
                className="px-4 py-2 rounded text-sm cursor-pointer disabled:opacity-50" style={{ background: "var(--accent)", color: "white" }}>
                {creating ? "Creating…" : "Create plan"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function CreateEventModal({ onClose }: { onClose: () => void }) {
  const keys = useAppStore((s) => s.keys);
  const signer = useAppStore((s) => s.signer);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endDate, setEndDate] = useState("");
  const [endTime, setEndTime] = useState("");
  const [allDay, setAllDay] = useState(false);
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!title.trim() || !startDate || !keys || !signer) return;
    setCreating(true);
    try {
      const start = allDay
        ? new Date(startDate + "T00:00:00")
        : new Date(`${startDate}T${startTime || "00:00"}`);
      const end = endDate
        ? (allDay ? new Date(endDate + "T23:59:59") : new Date(`${endDate}T${endTime || "23:59"}`))
        : undefined;

      await createCalendarEvent({ title: title.trim(), description: description.trim() || undefined, start, end, location: location.trim() || undefined, allDay }, signer);
      onClose();
    } catch (err) {
      console.error("Failed to create event:", err);
    }
    setCreating(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.6)" }}>
      <div className="w-full max-w-md rounded-xl p-6 space-y-4" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}>
        <h3 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>New Event</h3>

        <input type="text" placeholder="Event title..." value={title} onChange={(e) => setTitle(e.target.value)}
          className="w-full px-3 py-2 rounded text-sm outline-none" style={{ background: "var(--bg-tertiary)", border: "1px solid var(--border)", color: "var(--text-primary)" }} autoFocus />

        <textarea placeholder="Description (optional)..." value={description} onChange={(e) => setDescription(e.target.value)}
          className="w-full px-3 py-2 rounded text-sm outline-none resize-none h-20" style={{ background: "var(--bg-tertiary)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />

        <input type="text" placeholder="Location (optional)..." value={location} onChange={(e) => setLocation(e.target.value)}
          className="w-full px-3 py-2 rounded text-sm outline-none" style={{ background: "var(--bg-tertiary)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />

        <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: "var(--text-secondary)" }}>
          <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} /> All day
        </label>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs mb-1 block" style={{ color: "var(--text-muted)" }}>Start date</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2 rounded text-sm outline-none" style={{ background: "var(--bg-tertiary)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
          </div>
          {!allDay && (
            <div>
              <label className="text-xs mb-1 block" style={{ color: "var(--text-muted)" }}>Start time</label>
              <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)}
                className="w-full px-3 py-2 rounded text-sm outline-none" style={{ background: "var(--bg-tertiary)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
            </div>
          )}
          <div>
            <label className="text-xs mb-1 block" style={{ color: "var(--text-muted)" }}>End date</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3 py-2 rounded text-sm outline-none" style={{ background: "var(--bg-tertiary)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
          </div>
          {!allDay && (
            <div>
              <label className="text-xs mb-1 block" style={{ color: "var(--text-muted)" }}>End time</label>
              <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)}
                className="w-full px-3 py-2 rounded text-sm outline-none" style={{ background: "var(--bg-tertiary)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
            </div>
          )}
        </div>

        <div className="flex gap-2 justify-end pt-2">
          <button onClick={onClose} className="px-4 py-2 rounded text-sm cursor-pointer" style={{ background: "var(--bg-tertiary)", color: "var(--text-secondary)" }}>Cancel</button>
          <button onClick={handleCreate} disabled={creating || !title.trim() || !startDate}
            className="px-4 py-2 rounded text-sm cursor-pointer disabled:opacity-50" style={{ background: "var(--accent)", color: "white" }}>
            {creating ? "Creating..." : "Create Event"}
          </button>
        </div>
      </div>
    </div>
  );
}
