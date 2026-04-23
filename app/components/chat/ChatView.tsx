"use client";

import { useState, useRef, useEffect } from "react";
import { useAppStore } from "../../lib/store";
import {
  sendChannelMessage,
  subscribeToChannelMessages,
  unsubscribeFromChannelMessages,
  fetchProfile,
} from "../../lib/chat-service";
import { sendDirectMessage } from "../../lib/dm-service";

export default function ChatView() {
  const activeChannelId = useAppStore((s) => s.activeChannelId);
  const channels = useAppStore((s) => s.channels);
  const messages = useAppStore((s) => s.messages);
  const profiles = useAppStore((s) => s.profiles);
  const keys = useAppStore((s) => s.keys);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const clearUnread = useAppStore((s) => s.clearUnread);
  const activeChannel = channels.find((c) => c.id === activeChannelId);
  const isDM = activeChannel?.isDirectMessage ?? false;
  const channelMessages = activeChannelId ? messages[activeChannelId] || [] : [];

  // Clear unread when switching to a channel
  useEffect(() => {
    if (activeChannelId) {
      clearUnread(activeChannelId);
    }
  }, [activeChannelId, clearUnread]);

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

  const handleSend = async () => {
    if (!input.trim() || !activeChannelId || !keys) return;
    setSending(true);
    try {
      if (isDM) {
        const partnerPubkey = activeChannelId.replace("dm-", "");
        await sendDirectMessage(partnerPubkey, input.trim(), keys.privateKey);
      } else {
        await sendChannelMessage(activeChannelId, input.trim(), keys.privateKey);
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
        <div className="text-xs" style={{ color: "var(--text-muted)" }}>
          {channelMessages.length} messages
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
              <div className={`flex items-start gap-3 group ${showHeader ? "mt-4" : "mt-0.5"}`}>
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
                <div className="min-w-0 flex-1">
                  {showHeader && (
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm font-semibold" style={{ color: isMe ? "var(--accent-light)" : "var(--text-primary)" }}>
                        {isMe ? "You" : getDisplayName(msg.pubkey)}
                      </span>
                      <span className="text-xs" style={{ color: "var(--text-muted)" }}>{time}</span>
                    </div>
                  )}
                  <p className="text-sm leading-relaxed" style={{ color: "var(--text-primary)" }}>{msg.content}</p>
                </div>
                {!showHeader && (
                  <span className="text-xs opacity-0 group-hover:opacity-100 shrink-0" style={{ color: "var(--text-muted)" }}>{time}</span>
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
          <input
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
  );
}
