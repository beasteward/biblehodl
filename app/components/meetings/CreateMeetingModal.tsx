"use client";

import { useState } from "react";
import { useAppStore } from "../../lib/store";
import { createMeeting } from "../../lib/meeting-service";

interface Props {
  onClose: () => void;
}

export default function CreateMeetingModal({ onClose }: Props) {
  const keys = useAppStore((s) => s.keys);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleTime, setScheduleTime] = useState("");
  const [startNow, setStartNow] = useState(true);
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!keys || !name.trim()) return;
    setCreating(true);

    let scheduledAt: number | undefined;
    if (!startNow && scheduleDate && scheduleTime) {
      scheduledAt = Math.floor(new Date(`${scheduleDate}T${scheduleTime}`).getTime() / 1000);
    }

    try {
      await createMeeting(name.trim(), description.trim(), scheduledAt, keys.privateKey);
      onClose();
    } catch (err) {
      console.error("Failed to create meeting:", err);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="rounded-lg p-6 w-full max-w-md shadow-xl"
        style={{ background: "var(--bg-secondary)", color: "var(--text-primary)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold mb-4">Create Meeting Room</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm mb-1" style={{ color: "var(--text-muted)" }}>
              Room Name *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Sprint Planning"
              className="w-full px-3 py-2 rounded text-sm outline-none"
              style={{
                background: "var(--bg-tertiary)",
                color: "var(--text-primary)",
                border: "1px solid var(--border)",
              }}
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm mb-1" style={{ color: "var(--text-muted)" }}>
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What's this meeting about?"
              rows={2}
              className="w-full px-3 py-2 rounded text-sm outline-none resize-none"
              style={{
                background: "var(--bg-tertiary)",
                color: "var(--text-primary)",
                border: "1px solid var(--border)",
              }}
            />
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={startNow}
                onChange={(e) => setStartNow(e.target.checked)}
                className="rounded"
              />
              Start immediately
            </label>
          </div>

          {!startNow && (
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="block text-sm mb-1" style={{ color: "var(--text-muted)" }}>
                  Date
                </label>
                <input
                  type="date"
                  value={scheduleDate}
                  onChange={(e) => setScheduleDate(e.target.value)}
                  className="w-full px-3 py-2 rounded text-sm outline-none"
                  style={{
                    background: "var(--bg-tertiary)",
                    color: "var(--text-primary)",
                    border: "1px solid var(--border)",
                  }}
                />
              </div>
              <div className="flex-1">
                <label className="block text-sm mb-1" style={{ color: "var(--text-muted)" }}>
                  Time
                </label>
                <input
                  type="time"
                  value={scheduleTime}
                  onChange={(e) => setScheduleTime(e.target.value)}
                  className="w-full px-3 py-2 rounded text-sm outline-none"
                  style={{
                    background: "var(--bg-tertiary)",
                    color: "var(--text-primary)",
                    border: "1px solid var(--border)",
                  }}
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded text-sm hover:opacity-80"
            style={{ color: "var(--text-muted)" }}
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!name.trim() || creating}
            className="px-4 py-2 rounded text-sm font-medium disabled:opacity-50"
            style={{
              background: "var(--accent)",
              color: "white",
            }}
          >
            {creating ? "Creating..." : startNow ? "Start Meeting" : "Schedule Meeting"}
          </button>
        </div>
      </div>
    </div>
  );
}
