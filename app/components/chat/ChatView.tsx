"use client";

import { useState, useRef, useEffect } from "react";
import { useAppStore } from "../../lib/store";
import {
  sendChannelMessage,
  subscribeToChannelMessages,
  unsubscribeFromChannelMessages,
  fetchProfile,
  sendReaction,
  retractReaction,
} from "../../lib/chat-service";
import type { ChatMessage } from "../../lib/store";
import { sendDirectMessage, sendDmReaction, retractDmReaction } from "../../lib/dm-service";
import { retryMessage } from "../../lib/outbox";
import ChannelMembersPanel from "./ChannelMembersPanel";
import EmojiPicker from "./EmojiPicker";
import dynamic from "next/dynamic";
import { channelCallRoom, dmCallRoom, useCallPresence, CALLS_ENABLED } from "../../lib/call-room";

// LiveKit pulls in browser-only WebRTC; load the call overlay lazily (never on
// SSR) so it only costs anything when a call is actually opened.
const LiveCall = dynamic(() => import("../common/LiveCall"), { ssr: false });

// Quick-reaction palette shown on message hover (Teams-style).
const REACTION_EMOJIS = ["\u{1F44D}", "\u2764\uFE0F", "\u{1F602}", "\u{1F389}", "\u{1F62E}", "\u{1F622}", "\u{1F64F}"];

export default function ChatView() {
  const activeChannelId = useAppStore((s) => s.activeChannelId);
  const channels = useAppStore((s) => s.channels);
  const messages = useAppStore((s) => s.messages);
  const profiles = useAppStore((s) => s.profiles);
  const reactions = useAppStore((s) => s.reactions);
  const keys = useAppStore((s) => s.keys);
  const signer = useAppStore((s) => s.signer);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [callOpen, setCallOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Insert an emoji at the caret (or append if the field isn't focused), keep
  // the rest of the text intact, then restore focus + caret after it.
  const insertEmoji = (emoji: string) => {
    const el = inputRef.current;
    if (!el) {
      setInput((v) => v + emoji);
      return;
    }
    const start = el.selectionStart ?? input.length;
    const end = el.selectionEnd ?? input.length;
    const next = input.slice(0, start) + emoji + input.slice(end);
    setInput(next);
    requestAnimationFrame(() => {
      el.focus();
      const caret = start + emoji.length;
      el.setSelectionRange(caret, caret);
    });
  };

  const markChannelRead = useAppStore((s) => s.markChannelRead);
  const activeChannel = channels.find((c) => c.id === activeChannelId);
  const isDM = activeChannel?.isDirectMessage ?? false;
  const channelMessages = activeChannelId ? messages[activeChannelId] || [] : [];

  // Mark the active channel read — on open and as new messages arrive while it
  // stays open — advancing the persisted read boundary to the latest message so
  // those messages don't resurface as unread after you leave or reload.
  useEffect(() => {
    if (!activeChannelId) return;
    const latest = channelMessages.length
      ? channelMessages[channelMessages.length - 1].created_at
      : undefined;
    markChannelRead(activeChannelId, latest);
  }, [activeChannelId, channelMessages, markChannelRead]);

  // Subscribe to channel messages (not DMs — those are handled globally)
  useEffect(() => {
    if (!activeChannelId || isDM) return;
    subscribeToChannelMessages(activeChannelId);
    return () => unsubscribeFromChannelMessages(activeChannelId);
  }, [activeChannelId, isDM]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [channelMessages.length]);

  useEffect(() => {
    const unknowns = new Set<string>();
    for (const msg of channelMessages) {
      if (!profiles[msg.pubkey]) unknowns.add(msg.pubkey);
    }
    unknowns.forEach((pk) => fetchProfile(pk));
  }, [channelMessages, profiles]);

  // Call presence for the active conversation. Channels and DMs each map to a
  // deterministic LiveKit room; if a call is already running and I'm not in it,
  // the header button reads "Join now" instead of "Meet now".
  const callRoom = !activeChannelId
    ? null
    : isDM
    ? dmCallRoom(keys?.publicKey, activeChannelId.replace("dm-", ""))
    : channelCallRoom(activeChannelId);
  const callPresence = useCallPresence(callRoom);
  const joinable = callPresence.active && !callPresence.joined;

  // Close the call overlay when switching conversations.
  useEffect(() => {
    setCallOpen(false);
  }, [activeChannelId]);

  // Toggle a reaction on a message: retract if I already reacted with this
  // emoji, otherwise add it. Works on sent + received messages, in channels and
  // DMs. DM reactions go through the encrypted gift-wrap path so they never leak
  // publicly; channel reactions are public NIP-25 (kind 7).
  const handleReact = async (msg: ChatMessage, emoji: string) => {
    if (!signer) return;
    const mine = (reactions[msg.id] || []).find(
      (r) => r.pubkey === keys?.publicKey && r.emoji === emoji
    );
    try {
      if (isDM) {
        const partner = activeChannelId!.replace("dm-", "");
        if (mine) await retractDmReaction(partner, mine.id, signer);
        else await sendDmReaction(partner, msg.id, emoji, signer);
      } else {
        if (mine) await retractReaction(mine.id, signer);
        else await sendReaction({ id: msg.id, pubkey: msg.pubkey }, emoji, signer);
      }
    } catch (err) {
      console.error("Failed to react:", err);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || !activeChannelId || !keys || !signer) return;
    setSending(true);
    try {
      if (isDM) {
        const partnerPubkey = activeChannelId.replace("dm-", "");
        await sendDirectMessage(partnerPubkey, input.trim(), signer);
      } else {
        await sendChannelMessage(activeChannelId, input.trim(), signer);
      }
      setInput("");
    } catch (err) {
      console.error("Failed to send:", err);
    }
    setSending(false);
  };

  const getDisplayName = (pubkey: string) => {
    const p = profiles[pubkey];
    if (p?.displayName) return p.displayName;
    if (p?.name) return p.name;
    return `${pubkey.slice(0, 8)}...${pubkey.slice(-4)}`;
  };

  const getAvatar = (pubkey: string) => profiles[pubkey]?.picture || null;

  const getChannelDisplayName = () => {
    if (!activeChannel) return "";
    if (isDM) {
      const partnerPubkey = activeChannelId!.replace("dm-", "");
      return getDisplayName(partnerPubkey);
    }
    return activeChannel.name;
  };

  if (!activeChannel) {
    return (
      <div className="flex-1 flex items-center justify-center" style={{ color: "var(--text-muted)" }}>
        <div className="text-center">
          <div className="text-6xl mb-4">💬</div>
          <h2 className="text-xl font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
            Welcome to Nostr Teams
          </h2>
          <p className="text-sm">Select a channel or start a DM to begin</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex h-full">
    <div className="flex-1 flex flex-col h-full">
      {/* Header */}
      <div
        className="px-6 py-3 flex items-center justify-between shrink-0"
        style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-secondary)" }}
      >
        <div className="flex items-center gap-3">
          {isDM ? (
            <>
              {getAvatar(activeChannelId!.replace("dm-", "")) ? (
                <img
                  src={getAvatar(activeChannelId!.replace("dm-", ""))!}
                  alt=""
                  className="w-7 h-7 rounded-full object-cover"
                />
              ) : (
                <span className="text-lg">👤</span>
              )}
              <span className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
                {getChannelDisplayName()}
              </span>
              <span className="text-xs px-2 py-0.5 rounded" style={{ background: "var(--bg-tertiary)", color: "var(--text-muted)" }}>
                Encrypted
              </span>
            </>
          ) : (
            <>
              <span className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
                # {activeChannel.name}
              </span>
              {activeChannel.about && (
                <span className="text-sm" style={{ color: "var(--text-muted)" }}>— {activeChannel.about}</span>
              )}
            </>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="text-xs" style={{ color: "var(--text-muted)" }}>
            {channelMessages.length} messages
          </div>
          {CALLS_ENABLED && callRoom && (
            <button
              onClick={() => setCallOpen(true)}
              className="text-sm cursor-pointer px-2.5 py-1 rounded flex items-center gap-1.5 font-medium"
              style={{ background: joinable ? "#22c55e" : "var(--accent)", color: "white" }}
              title={joinable ? "Join the call in progress" : "Start a call"}
            >
              <span>🎥</span>
              <span>{joinable ? "Join now" : "Meet now"}</span>
              {callPresence.active && callPresence.count > 0 && (
                <span
                  className="text-xs px-1.5 py-0.5 rounded-full leading-none"
                  style={{ background: "rgba(255,255,255,0.25)" }}
                >
                  {callPresence.count}
                </span>
              )}
            </button>
          )}
          {!isDM && (
            <button
              onClick={() => setShowMembers(!showMembers)}
              className="text-sm cursor-pointer px-2 py-1 rounded"
              style={{
                background: showMembers ? "var(--accent)" : "var(--bg-tertiary)",
                color: showMembers ? "white" : "var(--text-secondary)",
              }}
              title="Members"
            >
              👥
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-1">
        {channelMessages.length === 0 && (
          <div className="text-center py-12" style={{ color: "var(--text-muted)" }}>
            <p className="text-sm">
              {isDM
                ? "This is the beginning of your encrypted conversation."
                : "No messages yet. Be the first to say something!"}
            </p>
          </div>
        )}
        {channelMessages.map((msg, idx) => {
          const isMe = msg.pubkey === keys?.publicKey;
          const time = new Date(msg.created_at * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
          const date = new Date(msg.created_at * 1000).toLocaleDateString();
          const prevMsg = channelMessages[idx - 1];
          const showHeader = !prevMsg || prevMsg.pubkey !== msg.pubkey || msg.created_at - prevMsg.created_at > 300;
          const prevDate = prevMsg ? new Date(prevMsg.created_at * 1000).toLocaleDateString() : null;
          const showDate = date !== prevDate;

          return (
            <div key={msg.id}>
              {showDate && (
                <div className="flex items-center gap-4 my-4">
                  <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
                  <span className="text-xs px-2" style={{ color: "var(--text-muted)" }}>{date}</span>
                  <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
                </div>
              )}
              <div className={`flex items-start gap-3 group ${isMe ? "flex-row-reverse" : ""} ${showHeader ? "mt-4" : "mt-0.5"}`}>
                <div className="w-8 shrink-0">
                  {showHeader && (
                    getAvatar(msg.pubkey) ? (
                      <img src={getAvatar(msg.pubkey)!} alt="" className="w-8 h-8 rounded-full object-cover" />
                    ) : (
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-xs"
                        style={{ background: isMe ? "var(--accent)" : "var(--bg-tertiary)", color: "var(--text-primary)" }}
                      >
                        {getDisplayName(msg.pubkey).slice(0, 2).toUpperCase()}
                      </div>
                    )
                  )}
                </div>
                <div className={`min-w-0 flex flex-col ${isMe ? "items-end" : "items-start"}`} style={{ maxWidth: "75%" }}>
                  {showHeader && (
                    <div className={`flex items-baseline gap-2 ${isMe ? "flex-row-reverse" : ""}`}>
                      <span className="text-sm font-semibold" style={{ color: isMe ? "var(--accent-light)" : "var(--text-primary)" }}>
                        {isMe ? "You" : getDisplayName(msg.pubkey)}
                      </span>
                      <span className="text-xs" style={{ color: "var(--text-muted)" }}>{time}</span>
                    </div>
                  )}
                  <div className="relative">
                    {/* Hover reaction picker — sent + received, channels + DMs */}
                    <div
                      className={`absolute -top-4 z-10 flex gap-0.5 px-1.5 py-0.5 rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity ${isMe ? "right-1" : "left-1"}`}
                      style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
                    >
                        {REACTION_EMOJIS.map((emoji) => (
                          <button
                            key={emoji}
                            onClick={() => handleReact(msg, emoji)}
                            className="text-sm leading-none px-1 py-0.5 rounded-full hover:scale-125 transition-transform cursor-pointer"
                            title={`React ${emoji}`}
                          >
                            {emoji}
                          </button>
                        ))}
                    </div>
                    <p
                      className="text-sm leading-relaxed rounded-2xl px-3 py-1.5 mt-0.5 inline-block break-words"
                      style={{
                        background: isMe ? "var(--accent)" : "var(--bg-tertiary)",
                        color: isMe ? "white" : "var(--text-primary)",
                      }}
                    >
                      {msg.content}
                    </p>
                  </div>
                  {/* Reaction pills — grouped by emoji with counts */}
                  {(() => {
                    const list = reactions[msg.id] || [];
                    if (list.length === 0) return null;
                    const groups = new Map<string, typeof list>();
                    for (const r of list) {
                      const g = groups.get(r.emoji) || [];
                      g.push(r);
                      groups.set(r.emoji, g);
                    }
                    return (
                      <div className={`flex flex-wrap gap-1 mt-1 ${isMe ? "justify-end" : "justify-start"}`}>
                        {Array.from(groups.entries()).map(([emoji, rs]) => {
                          const mine = rs.some((r) => r.pubkey === keys?.publicKey);
                          return (
                            <button
                              key={emoji}
                              onClick={() => handleReact(msg, emoji)}
                              className="flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs cursor-pointer transition-colors"
                              style={{
                                background: mine ? "var(--accent)" : "var(--bg-tertiary)",
                                color: mine ? "white" : "var(--text-secondary)",
                                border: `1px solid ${mine ? "var(--accent-light)" : "var(--border)"}`,
                              }}
                              title={mine ? "Remove your reaction" : "React"}
                            >
                              <span>{emoji}</span>
                              <span>{rs.length}</span>
                            </button>
                          );
                        })}
                      </div>
                    );
                  })()}
                  {isMe && msg.status === "sending" && (
                    <span className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                      Sending…
                    </span>
                  )}
                  {isMe && msg.status === "failed" && (
                    <span className="text-xs mt-0.5" style={{ color: "#ef4444" }}>
                      Failed to send ·{" "}
                      <button
                        onClick={() => retryMessage(msg.id)}
                        className="underline hover:opacity-80 cursor-pointer"
                      >
                        Retry
                      </button>
                    </span>
                  )}
                </div>
                {!showHeader && (
                  <span className="text-xs opacity-0 group-hover:opacity-100 shrink-0 self-center" style={{ color: "var(--text-muted)" }}>{time}</span>
                )}
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="px-6 py-4 shrink-0" style={{ borderTop: "1px solid var(--border)" }}>
        <div
          className="flex items-center gap-2 rounded-lg px-4 py-2"
          style={{ background: "var(--bg-tertiary)", border: "1px solid var(--border)" }}
        >
          <button className="text-lg cursor-pointer" title="Attach file" style={{ color: "var(--text-muted)" }}>
            📎
          </button>
          <EmojiPicker onSelect={insertEmoji} />
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
            placeholder={isDM ? `Message ${getChannelDisplayName()}...` : `Message #${activeChannel.name}...`}
            className="flex-1 bg-transparent outline-none text-sm"
            style={{ color: "var(--text-primary)" }}
            disabled={sending}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || sending}
            className="text-lg cursor-pointer disabled:opacity-30"
            style={{ color: "var(--accent-light)" }}
          >
            {sending ? "⏳" : "➤"}
          </button>
        </div>
        {isDM && (
          <div className="text-xs mt-1 text-center" style={{ color: "var(--text-muted)" }}>
            🔒 Messages are end-to-end encrypted (NIP-04)
          </div>
        )}
      </div>
    </div>
    {showMembers && activeChannelId && !isDM && (
      <ChannelMembersPanel
        channelId={activeChannelId}
        onClose={() => setShowMembers(false)}
      />
    )}
    {callOpen && callRoom && (
      <LiveCall
        room={callRoom}
        title={isDM ? `Call \u00B7 ${getChannelDisplayName()}` : `# ${activeChannel.name}`}
        conversationId={activeChannelId!}
        isDM={isDM}
        onClose={() => setCallOpen(false)}
      />
    )}
    </div>
  );
}
