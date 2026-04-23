"use client";

import { useState, useEffect, useRef } from "react";
import { useAppStore } from "../../lib/store";

export interface MemberResult {
  id: string;
  pubkey: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
}

interface MemberSearchProps {
  onSelect: (member: MemberResult) => void;
  placeholder?: string;
  excludePubkeys?: string[];
}

export default function MemberSearch({
  onSelect,
  placeholder = "Search members by name...",
  excludePubkeys = [],
}: MemberSearchProps) {
  const keys = useAppStore((s) => s.keys);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MemberResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setOpen(false);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      if (!keys) return;
      setLoading(true);
      try {
        const res = await fetch(`/api/members/search?q=${encodeURIComponent(query.trim())}`, {
          headers: { "x-pubkey": keys.publicKey },
        });
        const data = await res.json();
        const filtered = (data.members || []).filter(
          (m: MemberResult) => !excludePubkeys.includes(m.pubkey)
        );
        setResults(filtered);
        setOpen(filtered.length > 0);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, keys, excludePubkeys]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSelect = (member: MemberResult) => {
    onSelect(member);
    setQuery("");
    setResults([]);
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        placeholder={placeholder}
        className="w-full px-3 py-2 rounded-lg text-sm outline-none"
        style={{
          background: "var(--bg-tertiary)",
          border: "1px solid var(--border)",
          color: "var(--text-primary)",
        }}
      />
      {loading && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs" style={{ color: "var(--text-muted)" }}>
          ...
        </div>
      )}

      {open && (
        <div
          className="absolute z-50 w-full mt-1 rounded-lg overflow-hidden shadow-lg max-h-60 overflow-y-auto"
          style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
        >
          {results.map((member) => (
            <button
              key={member.id}
              onClick={() => handleSelect(member)}
              className="w-full px-3 py-2 text-left text-sm flex items-center gap-3 transition-colors cursor-pointer"
              style={{ color: "var(--text-primary)" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-active)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs shrink-0"
                style={{ background: "var(--accent)", color: "white" }}
              >
                {member.firstName[0]}{member.lastName[0]}
              </div>
              <div className="min-w-0">
                <div className="font-medium truncate">
                  {member.firstName} {member.lastName}
                  {member.role !== "member" && (
                    <span className="ml-1 text-xs px-1.5 py-0.5 rounded" style={{ background: "var(--bg-tertiary)", color: "var(--text-muted)" }}>
                      {member.role}
                    </span>
                  )}
                </div>
                <div className="text-xs truncate" style={{ color: "var(--text-muted)" }}>
                  {member.email}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
