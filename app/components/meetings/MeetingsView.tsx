"use client";

export default function MeetingsView() {
  return (
    <div className="flex-1 flex items-center justify-center" style={{ color: "var(--text-muted)" }}>
      <div className="text-center">
        <div className="text-6xl mb-4">👥</div>
        <h2 className="text-xl font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
          Meetings
        </h2>
        <p className="text-sm">Meeting rooms with whiteboard &amp; chat coming in v3</p>
      </div>
    </div>
  );
}
