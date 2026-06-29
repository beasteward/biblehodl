"use client";

import { useEffect, useCallback, useRef, useState } from "react";
import { Tldraw, type Editor } from "tldraw";
import "tldraw/tldraw.css";
import { useAppStore } from "../../lib/store";
import {
  saveWhiteboard,
  listWhiteboards,
  fetchWhiteboardSnapshot,
  type WhiteboardSave,
} from "../../lib/whiteboard-service";

interface Props {
  meetingId: string;
}

export default function MeetingWhiteboard({ meetingId }: Props) {
  const keys = useAppStore((s) => s.keys);
  const signer = useAppStore((s) => s.signer);
  const profiles = useAppStore((s) => s.profiles);
  const editorRef = useRef<Editor | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  // Saved-board browser + naming
  const [saves, setSaves] = useState<WhiteboardSave[]>([]);
  const [showSaved, setShowSaved] = useState(false);
  const [nameModalOpen, setNameModalOpen] = useState(false);
  const [boardName, setBoardName] = useState("");
  const [loadingBoard, setLoadingBoard] = useState(false);

  const getDisplayName = (pubkey: string) => {
    const p = profiles[pubkey];
    return p?.displayName || p?.name || pubkey.slice(0, 8) + "…";
  };

  const refreshSaves = useCallback(async () => {
    try {
      const list = await listWhiteboards(meetingId);
      setSaves(list);
    } catch (err) {
      console.warn("[whiteboard] Failed to list saves:", err);
    }
  }, [meetingId]);

  // Load saved whiteboard on mount (latest) + populate the saved-board list
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const list = await listWhiteboards(meetingId);
        if (cancelled) return;
        setSaves(list);

        if (list.length > 0 && editorRef.current) {
          const snapshotJson = await fetchWhiteboardSnapshot(list[0].meta);
          if (cancelled || !editorRef.current || !snapshotJson) return;
          editorRef.current.store.loadStoreSnapshot(JSON.parse(snapshotJson));
          setLastSaved(
            `${list[0].meta.name} · ${new Date(list[0].meta.timestamp).toLocaleTimeString()}`
          );
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

  // Open the name prompt (prefill with a sensible default)
  const openSaveModal = useCallback(() => {
    if (!keys || !signer || !editorRef.current) return;
    setBoardName(
      `Board ${new Date().toLocaleDateString([], { month: "short", day: "numeric" })} ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
    );
    setNameModalOpen(true);
  }, [keys, signer]);

  // Save to BLOSSOM under the chosen name
  const handleSave = useCallback(async () => {
    if (!keys || !signer || !editorRef.current) return;
    setSaving(true);
    try {
      const snapshot = editorRef.current.store.getStoreSnapshot();
      const snapshotJson = JSON.stringify(snapshot);
      const meta = await saveWhiteboard(meetingId, snapshotJson, boardName, signer);
      setLastSaved(`${meta.name} · ${new Date(meta.timestamp).toLocaleTimeString()}`);
      setHasChanges(false);
      setNameModalOpen(false);
      refreshSaves();
    } catch (err) {
      console.error("[whiteboard] Failed to save:", err);
    } finally {
      setSaving(false);
    }
  }, [keys, signer, meetingId, boardName, refreshSaves]);

  // Load a specific saved board into the canvas
  const handleLoadBoard = useCallback(async (save: WhiteboardSave) => {
    if (!editorRef.current) return;
    setLoadingBoard(true);
    try {
      const snapshotJson = await fetchWhiteboardSnapshot(save.meta);
      if (!snapshotJson || !editorRef.current) return;
      editorRef.current.store.loadStoreSnapshot(JSON.parse(snapshotJson));
      setLastSaved(`${save.meta.name} · ${new Date(save.meta.timestamp).toLocaleTimeString()}`);
      setHasChanges(false);
      setShowSaved(false);
    } catch (err) {
      console.error("[whiteboard] Failed to load board:", err);
    } finally {
      setLoadingBoard(false);
    }
  }, []);

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
    <div className="flex-1 flex flex-col min-h-0 relative">
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
              Showing: {lastSaved}
            </span>
          )}
          {hasChanges && !loading && (
            <span className="text-xs font-medium" style={{ color: "#f59e0b" }}>
              • Unsaved changes
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 relative">
          {/* Saved boards browser */}
          <button
            onClick={() => { setShowSaved((v) => !v); if (!showSaved) refreshSaves(); }}
            className="px-3 py-1.5 rounded text-sm font-medium"
            style={{ background: "var(--bg-tertiary)", color: "var(--text-primary)" }}
            title="Browse whiteboards saved to this meeting"
          >
            📂 Saved ({saves.length})
          </button>

          {showSaved && (
            <div
              className="absolute right-0 top-full mt-1 w-72 rounded-lg shadow-lg z-50 overflow-hidden"
              style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
            >
              <div
                className="px-3 py-2 text-xs font-medium border-b"
                style={{ color: "var(--text-muted)", borderColor: "var(--border)" }}
              >
                Saved whiteboards
              </div>
              <div className="max-h-72 overflow-y-auto">
                {saves.length === 0 ? (
                  <div className="px-3 py-4 text-sm text-center" style={{ color: "var(--text-muted)" }}>
                    No saved whiteboards yet
                  </div>
                ) : (
                  saves.map((s) => (
                    <button
                      key={s.eventId}
                      onClick={() => handleLoadBoard(s)}
                      disabled={loadingBoard}
                      className="w-full text-left px-3 py-2 hover:opacity-80 transition-opacity disabled:opacity-50 border-b"
                      style={{ borderColor: "var(--border)" }}
                    >
                      <div className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>
                        {s.meta.name}
                      </div>
                      <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                        {getDisplayName(s.pubkey)} · {new Date(s.created_at * 1000).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}

          <button
            onClick={openSaveModal}
            disabled={saving || !hasChanges}
            className="px-4 py-1.5 rounded text-sm font-medium disabled:opacity-50 transition-opacity"
            style={{
              background: hasChanges ? "var(--accent)" : "var(--bg-tertiary)",
              color: hasChanges ? "white" : "var(--text-muted)",
            }}
            title="Save this whiteboard to the community file server, linked to this meeting"
          >
            {saving ? "Saving..." : "💾 Save"}
          </button>
        </div>
      </div>

      {/* tldraw Canvas */}
      <div className="flex-1 relative" style={{ minHeight: 0 }}>
        <Tldraw onMount={handleMount} />
      </div>

      {/* Name-on-save modal */}
      {nameModalOpen && (
        <div
          className="absolute inset-0 z-[60] flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.5)" }}
          onClick={() => !saving && setNameModalOpen(false)}
        >
          <div
            className="w-80 rounded-lg p-4"
            style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
              Save whiteboard
            </h3>
            <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>
              Saved to this community&apos;s file server and linked to this meeting. Everyone in the meeting can open it from 📂 Saved.
            </p>
            <input
              type="text"
              autoFocus
              value={boardName}
              onChange={(e) => setBoardName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSave()}
              placeholder="Whiteboard name"
              className="w-full px-3 py-2 rounded text-sm outline-none mb-3"
              style={{ background: "var(--bg-tertiary)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setNameModalOpen(false)}
                disabled={saving}
                className="px-3 py-1.5 rounded text-sm font-medium disabled:opacity-50"
                style={{ background: "var(--bg-tertiary)", color: "var(--text-muted)" }}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-1.5 rounded text-sm font-medium disabled:opacity-50"
                style={{ background: "var(--accent)", color: "white" }}
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
