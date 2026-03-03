"use client";

import { useEffect, useCallback, useRef } from "react";
import { Tldraw, type Editor } from "tldraw";
import "tldraw/tldraw.css";
import { useAppStore } from "../../lib/store";
import {
  publishWhiteboardPatch,
  subscribeToWhiteboardPatches,
  unsubscribeFromWhiteboard,
  type WhiteboardPatch,
} from "../../lib/whiteboard-service";

interface Props {
  meetingId: string;
}

export default function MeetingWhiteboard({ meetingId }: Props) {
  const keys = useAppStore((s) => s.keys);
  const editorRef = useRef<Editor | null>(null);
  const isApplyingRemote = useRef(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingChanges = useRef<{
    added: Record<string, unknown>[];
    updated: Record<string, unknown>[];
    removed: string[];
  }>({ added: [], updated: [], removed: [] });

  // Flush pending changes to Nostr
  const flushChanges = useCallback(() => {
    if (!keys) return;
    const { added, updated, removed } = pendingChanges.current;
    if (added.length === 0 && updated.length === 0 && removed.length === 0) return;

    const patch: { added?: Record<string, unknown>[]; updated?: Record<string, unknown>[]; removed?: string[] } = {};
    if (added.length > 0) patch.added = [...added];
    if (updated.length > 0) patch.updated = [...updated];
    if (removed.length > 0) patch.removed = [...removed];

    pendingChanges.current = { added: [], updated: [], removed: [] };
    publishWhiteboardPatch(meetingId, patch, keys.privateKey).catch(console.error);
  }, [keys, meetingId]);

  // Handle incoming remote patches
  const handleRemotePatch = useCallback(
    (patch: WhiteboardPatch, pubkey: string) => {
      const editor = editorRef.current;
      if (!editor || pubkey === keys?.publicKey) return;

      isApplyingRemote.current = true;
      try {
        if (patch.added && patch.added.length > 0) {
          editor.createShapes(patch.added as Parameters<Editor["createShapes"]>[0]);
        }
        if (patch.updated && patch.updated.length > 0) {
          editor.updateShapes(patch.updated as Parameters<Editor["updateShapes"]>[0]);
        }
        if (patch.removed && patch.removed.length > 0) {
          editor.deleteShapes(patch.removed as unknown as Parameters<Editor["deleteShapes"]>[0]);
        }
      } catch (err) {
        console.warn("[whiteboard] Failed to apply remote patch:", err);
      } finally {
        isApplyingRemote.current = false;
      }
    },
    [keys]
  );

  // Subscribe to remote patches
  useEffect(() => {
    subscribeToWhiteboardPatches(meetingId, handleRemotePatch);
    return () => unsubscribeFromWhiteboard(meetingId);
  }, [meetingId, handleRemotePatch]);

  // Set up editor change listener
  const handleMount = useCallback(
    (editor: Editor) => {
      editorRef.current = editor;

      // Listen to store changes
      editor.store.listen(
        ({ changes }) => {
          if (isApplyingRemote.current) return;

          // Collect added shapes
          for (const record of Object.values(changes.added)) {
            if ((record as { typeName?: string }).typeName === "shape") {
              pendingChanges.current.added.push(record as unknown as Record<string, unknown>);
            }
          }

          // Collect updated shapes
          for (const [, to] of Object.values(changes.updated)) {
            if ((to as { typeName?: string }).typeName === "shape") {
              pendingChanges.current.updated.push(to as unknown as Record<string, unknown>);
            }
          }

          // Collect removed shapes
          for (const record of Object.values(changes.removed)) {
            if ((record as { typeName?: string }).typeName === "shape") {
              pendingChanges.current.removed.push((record as { id: string }).id);
            }
          }

          // Debounce: batch changes every 200ms
          if (debounceTimer.current) clearTimeout(debounceTimer.current);
          debounceTimer.current = setTimeout(flushChanges, 200);
        },
        { source: "user", scope: "document" }
      );
    },
    [flushChanges]
  );

  return (
    <div className="flex-1 relative" style={{ minHeight: 0 }}>
      <Tldraw onMount={handleMount} />
    </div>
  );
}
