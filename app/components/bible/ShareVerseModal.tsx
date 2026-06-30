"use client";

import { useMemo, useState } from "react";
import { useAppStore } from "../../lib/store";
import { sendChannelMessage } from "../../lib/chat-service";
import { formatRef, type BibleVerse } from "../../lib/bible-service";

// Build the chat message body for a passage. Single verse → quoted line;
// multiple → verse-numbered block. Kept as plain text so it reads cleanly
// regardless of how the chat renderer handles markdown.
export function buildShareContent(book: string, chapter: number, verses: BibleVerse[]): string {
  const sorted = [...verses].sort((a, b) => a.verse - b.verse);
  const ref = formatRef(book, chapter, sorted[0].verse, sorted[sorted.length - 1].verse);
  const header = `📖 ${ref} (CPDV)`;
  if (sorted.length === 1) return `${header}\n“${sorted[0].text}”`;
  const body = sorted.map((v) => `${v.verse}. ${v.text}`).join("\n");
  return `${header}\n${body}`;
}

interface Props {
  book: string;
  chapter: number;
  verses: BibleVerse[];
  onClose: () => void;
  onShared?: () => void;
}

export default function ShareVerseModal({ book, chapter, verses, onClose, onShared }: Props) {
  const signer = useAppStore((s) => s.signer);
  const channels = useAppStore((s) => s.channels);
  const myChannelIds = useAppStore((s) => s.myChannelIds);
  const setActiveChannelId = useAppStore((s) => s.setActiveChannelId);
  const setCurrentView = useAppStore((s) => s.setCurrentView);

  // Mirror ChatSidebar's group-channel filter: real channels the user belongs to.
  const groupChannels = useMemo(
    () =>
      channels.filter(
        (c) => !c.isDirectMessage && (myChannelIds.size === 0 || myChannelIds.has(c.id))
      ),
    [channels, myChannelIds]
  );

  const [channelId, setChannelId] = useState<string>(groupChannels[0]?.id ?? "");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preview = useMemo(() => buildShareContent(book, chapter, verses), [book, chapter, verses]);

  const share = async () => {
    if (!signer || !channelId) return;
    setSending(true);
    setError(null);
    try {
      await sendChannelMessage(channelId, preview, signer);
      // Jump to the channel so the member sees their shared passage land.
      setActiveChannelId(channelId);
      setCurrentView("chat");
      onShared?.();
      onClose();
    } catch (e) {
      setError((e as Error).message || "Failed to share");
      setSending(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.5)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl overflow-hidden shadow-xl flex flex-col max-h-[80vh]"
        style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
          <h3 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
            Share to chat
          </h3>
        </div>

        <div className="p-4 overflow-y-auto">
          {/* Passage preview */}
          <div
            className="rounded-lg p-3 mb-4 text-sm whitespace-pre-wrap"
            style={{ background: "var(--bg-tertiary)", color: "var(--text-secondary)" }}
          >
            {preview}
          </div>

          {groupChannels.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              You’re not in any channels yet. Join or create a channel in Chat first.
            </p>
          ) : (
            <>
              <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                Channel
              </label>
              <div className="mt-2 space-y-1 max-h-48 overflow-y-auto">
                {groupChannels.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setChannelId(c.id)}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-left text-sm transition-colors"
                    style={{
                      background: channelId === c.id ? "var(--bg-active)" : "transparent",
                      color: channelId === c.id ? "var(--text-primary)" : "var(--text-secondary)",
                    }}
                  >
                    <span style={{ color: "var(--text-muted)" }}>#</span>
                    <span className="truncate">{c.name}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          {error && (
            <p className="mt-3 text-sm" style={{ color: "var(--danger)" }}>
              {error}
            </p>
          )}
        </div>

        <div className="px-4 py-3 shrink-0 flex justify-end gap-2" style={{ borderTop: "1px solid var(--border)" }}>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-md text-sm font-medium"
            style={{ background: "var(--bg-tertiary)", color: "var(--text-secondary)" }}
          >
            Cancel
          </button>
          <button
            onClick={share}
            disabled={sending || !channelId || groupChannels.length === 0}
            className="px-4 py-2 rounded-md text-sm font-medium disabled:opacity-40"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            {sending ? "Sharing…" : "Share"}
          </button>
        </div>
      </div>
    </div>
  );
}
