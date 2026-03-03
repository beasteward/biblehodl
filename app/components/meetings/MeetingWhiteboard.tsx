"use client";

import { useEffect, useCallback, useRef, useState } from "react";
import { Tldraw, type Editor } from "tldraw";
import "tldraw/tldraw.css";
import { useAppStore } from "../../lib/store";
import {
  saveWhiteboard,
  loadLatestWhiteboard,
} from "../../lib/whiteboard-service";

interface Props {
  meetingId: string;
}

export default function MeetingWhiteboard({ meetingId }: Props) {
  const keys = useAppStore((s) => s.keys);
  const editorRef = useRef<Editor | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  // Load saved whiteboard on mount
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const result = await loadLatestWhiteboard(meetingId);
        if (cancelled || !editorRef.current) return;

        if (result) {
          const snapshot = JSON.parse(result.snapshotJson);
          editorRef.current.store.loadStoreSnapshot(snapshot);
          setLastSaved(new Date(result.meta.timestamp).toLocaleTimeString());
          setHasChanges(false);
        }
      } catch (err) {
        console.warn("[whiteboard] Failed to load saved state:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    // Small delay to ensure editor is ready
    const timer = setTimeout(load, 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [meetingId]);

  // Save to BLOSSOM
  const handleSave = useCallback(async () => {
    if (!keys || !editorRef.current) return;
    setSaving(true);
    try {
      const snapshot = editorRef.current.store.getStoreSnapshot();
      const snapshotJson = JSON.stringify(snapshot);
      await saveWhiteboard(meetingId, snapshotJson, keys.privateKey);
      setLastSaved(new Date().toLocaleTimeString());
      setHasChanges(false);
    } catch (err) {
      console.error("[whiteboard] Failed to save:", err);
    } finally {
      setSaving(false);
    }
  }, [keys, meetingId]);

  // Track changes
  const handleMount = useCallback((editor: Editor) => {
    editorRef.current = editor;

    editor.store.listen(
      () => {
        setHasChanges(true);
      },
      { source: "user", scope: "document" }
    );
  }, []);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Toolbar */}
      <div
        className="flex items-center justify-between px-4 py-2 border-b"
        style={{ borderColor: "var(--border)", background: "var(--bg-secondary)" }}
      >
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
            🎨 Whiteboard
          </span>
          {loading && (
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              Loading...
            </span>
          )}
          {lastSaved && !loading && (
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              Last saved: {lastSaved}
            </span>
          )}
          {hasChanges && !loading && (
            <span className="text-xs font-medium" style={{ color: "#f59e0b" }}>
              • Unsaved changes
            </span>
          )}
        </div>
        <button
          onClick={handleSave}
          disabled={saving || !hasChanges}
          className="px-4 py-1.5 rounded text-sm font-medium disabled:opacity-50 transition-opacity"
          style={{
            background: hasChanges ? "var(--accent)" : "var(--bg-tertiary)",
            color: hasChanges ? "white" : "var(--text-muted)",
          }}
        >
          {saving ? "Saving..." : "💾 Save"}
        </button>
      </div>

      {/* tldraw Canvas */}
      <div className="flex-1 relative" style={{ minHeight: 0 }}>
        <Tldraw onMount={handleMount} />
      </div>
    </div>
  );
}
