"use client";

import { useEffect, useCallback, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Tldraw, type Editor } from "tldraw";
import "tldraw/tldraw.css";
import { useAppStore } from "../../lib/store";
import {
  saveWhiteboard,
  renameWhiteboard,
  deleteWhiteboard,
  listWhiteboards,
  fetchWhiteboardSnapshot,
  type WhiteboardSave,
} from "../../lib/whiteboard-service";
import ConfirmModal from "../common/ConfirmModal";

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
  const [hasChanges, setHasChanges] = useState(false);

  // The board currently loaded into the canvas. Saving updates this board in
  // place (retracting the previous version); with no active board, Save creates
  // a new one.
  const [activeBoard, setActiveBoard] = useState<WhiteboardSave | null>(null);

  // Saved-board browser
  const [saves, setSaves] = useState<WhiteboardSave[]>([]);
  const [showSaved, setShowSaved] = useState(false);
  const [loadingBoard, setLoadingBoard] = useState(false);
  const savedBtnRef = useRef<HTMLButtonElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number }>({ top: 0, right: 0 });

  // Name modal (used for both Save and Rename)
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"save" | "rename">("save");
  const [boardName, setBoardName] = useState("");
  const [renameTarget, setRenameTarget] = useState<WhiteboardSave | null>(null);

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<WhiteboardSave | null>(null);
  const [deleting, setDeleting] = useState(false);

  const getDisplayName = (pubkey: string) => {
    const p = profiles[pubkey];
    return p?.displayName || p?.name || pubkey.slice(0, 8) + "…";
  };

  const refreshSaves = useCallback(async () => {
    try {
      setSaves(await listWhiteboards(meetingId));
    } catch (err) {
      console.warn("[whiteboard] Failed to list saves:", err);
    }
  }, [meetingId]);

  // Toggle the saved-board menu. When opening, anchor it to the button's screen
  // position so the portal (rendered at <body>) lines up under the button.
  const toggleSaved = useCallback(() => {
    setShowSaved((open) => {
      if (!open) {
        const rect = savedBtnRef.current?.getBoundingClientRect();
        if (rect) setMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
        refreshSaves();
        return true;
      }
      return false;
    });
  }, [refreshSaves]);

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
          setActiveBoard(list[0]);
          setHasChanges(false);
        }
      } catch (err) {
        console.warn("[whiteboard] Failed to load saved state:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    const timer = setTimeout(load, 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [meetingId]);

  // Open the Save name prompt. Prefill with the active board's name (so saving
  // an opened board keeps its name) or a fresh default for a brand-new board.
  const openSaveModal = useCallback(() => {
    if (!keys || !signer || !editorRef.current) return;
    setModalMode("save");
    setRenameTarget(null);
    setBoardName(
      activeBoard?.meta.name ||
        `Board ${new Date().toLocaleDateString([], { month: "short", day: "numeric" })} ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
    );
    setModalOpen(true);
  }, [keys, signer, activeBoard]);

  const openRenameModal = useCallback((board: WhiteboardSave) => {
    setModalMode("rename");
    setRenameTarget(board);
    setBoardName(board.meta.name);
    setModalOpen(true);
  }, []);

  // Save: create a new board, or update the active one in place.
  const handleSave = useCallback(async () => {
    if (!keys || !signer || !editorRef.current) return;
    setSaving(true);
    try {
      const snapshot = editorRef.current.store.getStoreSnapshot();
      const snapshotJson = JSON.stringify(snapshot);
      const saved = await saveWhiteboard(meetingId, snapshotJson, boardName, signer);

      // Updating an existing board: retract the previous version so the list
      // shows a single, current board rather than a duplicate.
      if (activeBoard && activeBoard.eventId !== saved.eventId) {
        try {
          await deleteWhiteboard(activeBoard.eventId, signer);
        } catch (err) {
          console.warn("[whiteboard] Failed to retract previous version:", err);
        }
      }

      setActiveBoard(saved);
      setHasChanges(false);
      setModalOpen(false);
      refreshSaves();
    } catch (err) {
      console.error("[whiteboard] Failed to save:", err);
    } finally {
      setSaving(false);
    }
  }, [keys, signer, meetingId, boardName, activeBoard, refreshSaves]);

  // Rename a saved board (no canvas change).
  const handleRename = useCallback(async () => {
    if (!signer || !renameTarget) return;
    setSaving(true);
    try {
      const renamed = await renameWhiteboard(meetingId, renameTarget, boardName, signer);
      if (activeBoard?.eventId === renameTarget.eventId) setActiveBoard(renamed);
      setModalOpen(false);
      setRenameTarget(null);
      refreshSaves();
    } catch (err) {
      console.error("[whiteboard] Failed to rename:", err);
    } finally {
      setSaving(false);
    }
  }, [signer, meetingId, renameTarget, boardName, activeBoard, refreshSaves]);

  const handleDelete = useCallback(async () => {
    if (!signer || !deleteTarget) return;
    setDeleting(true);
    try {
      await deleteWhiteboard(deleteTarget.eventId, signer);
      if (activeBoard?.eventId === deleteTarget.eventId) setActiveBoard(null);
      setSaves((prev) => prev.filter((s) => s.eventId !== deleteTarget.eventId));
      setDeleteTarget(null);
    } catch (err) {
      console.error("[whiteboard] Failed to delete:", err);
    } finally {
      setDeleting(false);
    }
  }, [signer, deleteTarget, activeBoard]);

  // Load a specific saved board into the canvas and make it the active board.
  const handleLoadBoard = useCallback(async (save: WhiteboardSave) => {
    if (!editorRef.current) return;
    setLoadingBoard(true);
    try {
      const snapshotJson = await fetchWhiteboardSnapshot(save.meta);
      if (!snapshotJson || !editorRef.current) return;
      editorRef.current.store.loadStoreSnapshot(JSON.parse(snapshotJson));
      setActiveBoard(save);
      setHasChanges(false);
      setShowSaved(false);
    } catch (err) {
      console.error("[whiteboard] Failed to load board:", err);
    } finally {
      setLoadingBoard(false);
    }
  }, []);

  const handleMount = useCallback((editor: Editor) => {
    editorRef.current = editor;
    editor.store.listen(() => setHasChanges(true), { source: "user", scope: "document" });
  }, []);

  return (
    <div className="flex-1 flex flex-col min-h-0 relative">
      {/* Toolbar */}
      <div
        className="flex items-center justify-between px-4 py-2 border-b"
        style={{ borderColor: "var(--border)", background: "var(--bg-secondary)" }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
            🎨 Whiteboard
          </span>
          {loading && (
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              Loading...
            </span>
          )}
          {!loading && activeBoard && (
            <span className="text-xs truncate" style={{ color: "var(--text-muted)" }}>
              Editing: <span style={{ color: "var(--text-primary)" }}>{activeBoard.meta.name}</span>
            </span>
          )}
          {!loading && !activeBoard && (
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              New board (unsaved)
            </span>
          )}
          {hasChanges && !loading && (
            <span className="text-xs font-medium" style={{ color: "#f59e0b" }}>
              • Unsaved changes
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            ref={savedBtnRef}
            onClick={toggleSaved}
            className="px-3 py-1.5 rounded text-sm font-medium"
            style={{ background: "var(--bg-tertiary)", color: "var(--text-primary)" }}
            title="Browse whiteboards saved to this meeting"
          >
            📂 Saved ({saves.length})
          </button>

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
            {saving ? "Saving..." : activeBoard ? "💾 Save" : "💾 Save new"}
          </button>
        </div>
      </div>

      {/* tldraw Canvas */}
      <div className="flex-1 relative" style={{ minHeight: 0 }}>
        <Tldraw onMount={handleMount} />
      </div>

      {/* Saved-board browser — portaled to <body> with a max z-index so it paints
          above tldraw's canvas + style picker (which are trapped inside the
          contain:strict .tl-container) and its rows stay clickable. */}
      {showSaved && typeof document !== "undefined" && createPortal(
        <>
          <div
            className="fixed inset-0"
            style={{ zIndex: 2147483000 }}
            onClick={() => setShowSaved(false)}
          />
          <div
            className="fixed w-80 rounded-lg shadow-xl overflow-hidden"
            style={{ top: menuPos.top, right: menuPos.right, background: "var(--bg-secondary)", border: "1px solid var(--border)", zIndex: 2147483001 }}
          >
            <div
              className="px-3 py-2 text-xs font-medium border-b"
              style={{ color: "var(--text-muted)", borderColor: "var(--border)" }}
            >
              Saved whiteboards
            </div>
            <div className="max-h-80 overflow-y-auto">
              {saves.length === 0 ? (
                <div className="px-3 py-4 text-sm text-center" style={{ color: "var(--text-muted)" }}>
                  No saved whiteboards yet
                </div>
              ) : (
                saves.map((s) => {
                  const mine = s.pubkey === keys?.publicKey;
                  const isActive = activeBoard?.eventId === s.eventId;
                  return (
                    <div
                      key={s.eventId}
                      className="flex items-center gap-2 px-3 py-2 group border-b"
                      style={{
                        borderColor: "var(--border)",
                        background: isActive ? "var(--bg-tertiary)" : "transparent",
                      }}
                    >
                      <button
                        onClick={() => handleLoadBoard(s)}
                        disabled={loadingBoard}
                        className="flex-1 min-w-0 text-left disabled:opacity-50"
                        title="Open this board for editing"
                      >
                        <div className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>
                          {s.meta.name}{isActive ? " ·" : ""}
                          {isActive && <span style={{ color: "var(--accent)" }}> editing</span>}
                        </div>
                        <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                          {getDisplayName(s.pubkey)} · {new Date(s.created_at * 1000).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </div>
                      </button>
                      {mine && (
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => openRenameModal(s)}
                            className="text-xs px-1.5 py-1 rounded"
                            style={{ color: "var(--text-muted)" }}
                            title="Rename"
                          >
                            ✏️
                          </button>
                          <button
                            onClick={() => setDeleteTarget(s)}
                            className="text-xs px-1.5 py-1 rounded"
                            style={{ color: "var(--danger)" }}
                            title="Delete"
                          >
                            🗑
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </>,
        document.body
      )}

      {/* Name modal (Save / Rename) */}
      {modalOpen && (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.5)", zIndex: 10000 }}
          onClick={() => !saving && setModalOpen(false)}
        >
          <div
            className="w-80 rounded-lg p-4"
            style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
              {modalMode === "rename" ? "Rename whiteboard" : activeBoard ? "Save whiteboard" : "Save new whiteboard"}
            </h3>
            <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>
              {modalMode === "rename"
                ? "Give this saved board a new name."
                : "Saved to this community's file server and linked to this meeting. Everyone in the meeting can open it from 📂 Saved."}
            </p>
            <input
              type="text"
              autoFocus
              value={boardName}
              onChange={(e) => setBoardName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (modalMode === "rename" ? handleRename() : handleSave())}
              placeholder="Whiteboard name"
              className="w-full px-3 py-2 rounded text-sm outline-none mb-3"
              style={{ background: "var(--bg-tertiary)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setModalOpen(false)}
                disabled={saving}
                className="px-3 py-1.5 rounded text-sm font-medium disabled:opacity-50"
                style={{ background: "var(--bg-tertiary)", color: "var(--text-muted)" }}
              >
                Cancel
              </button>
              <button
                onClick={modalMode === "rename" ? handleRename : handleSave}
                disabled={saving}
                className="px-4 py-1.5 rounded text-sm font-medium disabled:opacity-50"
                style={{ background: "var(--accent)", color: "white" }}
              >
                {saving ? "Saving..." : modalMode === "rename" ? "Rename" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={!!deleteTarget}
        title="Delete whiteboard"
        message={`Delete "${deleteTarget?.meta.name ?? ""}"? This removes it for everyone in the meeting and cannot be undone.`}
        confirmLabel="Delete"
        danger
        busy={deleting}
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}
