"use client";

import { useState, useRef, useEffect } from "react";

// A compact, dependency-free emoji picker for the message composer. The hover
// reaction palette is desktop-only (it relies on :hover), so on mobile this is
// the only way to add emoji to an outgoing message. The trigger icon is always
// visible; tapping it opens the list, tapping an emoji inserts it, and tapping
// anywhere outside (or pressing Escape) closes it.
const EMOJIS = [
  "\u{1F600}", "\u{1F603}", "\u{1F604}", "\u{1F601}", "\u{1F606}", "\u{1F605}", "\u{1F923}", "\u{1F602}",
  "\u{1F642}", "\u{1F643}", "\u{1F609}", "\u{1F60A}", "\u{1F607}", "\u{1F60D}", "\u{1F618}", "\u{1F617}",
  "\u{1F60B}", "\u{1F61B}", "\u{1F61C}", "\u{1F92A}", "\u{1F60E}", "\u{1F913}", "\u{1F914}", "\u{1F910}",
  "\u{1F644}", "\u{1F60F}", "\u{1F62C}", "\u{1F636}", "\u{1F610}", "\u{1F611}", "\u{1F62E}", "\u{1F627}",
  "\u{1F605}", "\u{1F613}", "\u{1F614}", "\u{1F62A}", "\u{1F634}", "\u{1F44D}", "\u{1F44E}", "\u{1F44F}",
  "\u{1F64C}", "\u{1F64F}", "\u{1F4AA}", "\u{1F525}", "\u{1F389}", "\u2764\uFE0F", "\u{1F49C}", "\u{1F49B}",
  "\u{1F622}", "\u{1F62D}", "\u{1F621}", "\u{1F620}", "\u{1F628}", "\u{1F631}", "\u{1F914}", "\u{1F44C}",
  "\u270C\uFE0F", "\u{1F91D}", "\u{1F440}", "\u2728", "\u2705", "\u274C", "\u{1F64B}", "\u{1F680}",
];

export default function EmojiPicker({ onSelect }: { onSelect: (emoji: string) => void }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on any click/tap outside the picker and on Escape.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-lg cursor-pointer"
        title="Emoji"
        aria-label="Emoji"
        aria-expanded={open}
        style={{ color: open ? "var(--accent-light)" : "var(--text-muted)" }}
      >
        😊
      </button>
      {open && (
        <div
          className="absolute bottom-full mb-2 left-0 z-20 p-2 rounded-xl shadow-lg grid grid-cols-8 gap-0.5"
          style={{
            background: "var(--bg-secondary)",
            border: "1px solid var(--border)",
            width: "16rem",
            maxHeight: "13rem",
            overflowY: "auto",
          }}
        >
          {EMOJIS.map((emoji, i) => (
            <button
              key={`${emoji}-${i}`}
              type="button"
              onClick={() => {
                onSelect(emoji);
                setOpen(false);
              }}
              className="text-xl leading-none p-1 rounded hover:scale-125 transition-transform cursor-pointer"
              title={emoji}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
