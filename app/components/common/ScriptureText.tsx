"use client";

import { Fragment, useMemo } from "react";
import { useAppStore } from "../../lib/store";
import { findScriptureRefs } from "../../lib/scripture-ref";

// Renders text with any scripture references ("John 3:16") turned into tappable
// links that deep-link into the Bible reader. Falls back to plain text when the
// Bible feature isn't enabled or no references are present.
export default function ScriptureText({
  content,
  linkColor = "var(--accent-light)",
}: {
  content: string;
  linkColor?: string;
}) {
  const bibleEnabled = useAppStore((s) => s.bibleEnabled);
  const openBibleRef = useAppStore((s) => s.openBibleRef);

  const matches = useMemo(
    () => (bibleEnabled ? findScriptureRefs(content) : []),
    [content, bibleEnabled]
  );

  if (matches.length === 0) return <>{content}</>;

  const parts: React.ReactNode[] = [];
  let cursor = 0;
  matches.forEach((m, i) => {
    if (m.start > cursor) parts.push(<Fragment key={`t${i}`}>{content.slice(cursor, m.start)}</Fragment>);
    parts.push(
      <button
        key={`r${i}`}
        onClick={(e) => {
          e.stopPropagation();
          openBibleRef(m.refString);
        }}
        className="underline font-medium"
        style={{ color: linkColor }}
        title={`Open ${m.refString}`}
      >
        {m.text}
      </button>
    );
    cursor = m.end;
  });
  if (cursor < content.length) parts.push(<Fragment key="tail">{content.slice(cursor)}</Fragment>);

  return <>{parts}</>;
}
