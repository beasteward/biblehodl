"use client";

import { useEffect, useRef, useState } from "react";
import { useAppStore } from "../../lib/store";
import {
  sendMeetingMessage,
  subscribeToMeetingMessages,
  unsubscribeFromMeetingMessages,
  updateMeetingStatus,
} from "../../lib/meeting-service";
import MeetingWhiteboard from "./MeetingWhiteboard";

interface Props {
  meetingId: string;
  onBack: () => void;
}

export default function MeetingRoom({ meetingId, onBack }: Props) {
  const keys = useAppStore((s) => s.keys);
  const meeting = useAppStore((s) => s.meetings.find((m) => m.id === meetingId));
  const messages = useAppStore((s) => s.messages[meetingId] || []);
  const profiles = useAppStore((s) => s.profiles);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<"chat" | "whiteboard" | "files">("chat");

  useEffect(() => {
    subscribeToMeetingMessages(meetingId);
    return () => unsubscribeFromMeetingMessages(meetingId);
  }, [meetingId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!keys || !input.trim()) return;
    setSending(true);
    try {
      await sendMeetingMessage(meetingId, input.trim(), keys.privateKey);
      setInput("");
    } catch (err) {
      console.error("Failed to send:", err);
    } finally {
      setSending(false);
    }
  };

  const handleEndMeeting = async () => {
    if (!keys) return;
    await updateMeetingStatus(meetingId, "ended", keys.privateKey);
  };

  const handleStartMeeting = async () => {
    if (!keys) return;
    await updateMeetingStatus(meetingId, "active", keys.privateKey);
  };

  const getDisplayName = (pubkey: string) => {
    const profile = profiles[pubkey];
    if (profile?.displayName) return profile.displayName;
    if (profile?.name) return profile.name;
    return pubkey.slice(0, 8) + "...";
  };

  const getAvatar = (pubkey: string) => {
    return profiles[pubkey]?.picture;
  };

  const formatTime = (ts: number) => {
    return new Date(ts * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  if (!meeting) {
    return (
      <div className="flex-1 flex items-center justify-center" style={{ color: "var(--text-muted)" }}>
        Meeting not found
      </div>
    );
  }

  const statusColor =
    meeting.status === "active" ? "#22c55e" : meeting.status === "scheduled" ? "#f59e0b" : "#6b7280";

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-3 border-b"
        style={{ borderColor: "var(--border)", background: "var(--bg-secondary)" }}
      >
        <button
          onClick={onBack}
          className="text-sm hover:opacity-80 px-2 py-1 rounded"
          style={{ color: "var(--text-muted)" }}
        >
          ← Back
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold" style={{ color: "var(--text-primary)" }}>
              {meeting.name}
            </h2>
            <span
              className="text-xs px-2 py-0.5 rounded-full font-medium"
              style={{ background: statusColor + "20", color: statusColor }}
            >
              {meeting.status}
            </span>
          </div>
          {meeting.description && (
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              {meeting.description}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
            👥 {meeting.participants.length}
          </span>
          {meeting.status === "scheduled" && meeting.pubkey === keys?.publicKey && (
            <button
              onClick={handleStartMeeting}
              className="text-xs px-3 py-1 rounded font-medium"
              style={{ background: "#22c55e", color: "white" }}
            >
              Start
            </button>
          )}
          {meeting.status === "active" && meeting.pubkey === keys?.publicKey && (
            <button
              onClick={handleEndMeeting}
              className="text-xs px-3 py-1 rounded font-medium"
              style={{ background: "#ef4444", color: "white" }}
            >
              End Meeting
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div
        className="flex border-b px-4"
        style={{ borderColor: "var(--border)", background: "var(--bg-secondary)" }}
      >
        {(["chat", "whiteboard", "files"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className="px-4 py-2 text-sm font-medium capitalize border-b-2 transition-colors"
            style={{
              borderColor: activeTab === tab ? "var(--accent)" : "transparent",
              color: activeTab === tab ? "var(--text-primary)" : "var(--text-muted)",
            }}
          >
            {tab === "chat" ? "💬 Chat" : tab === "whiteboard" ? "🎨 Whiteboard" : "📁 Files"}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "chat" && (
        <div className="flex-1 flex flex-col min-h-0">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 && (
              <div className="text-center py-8" style={{ color: "var(--text-muted)" }}>
                <p className="text-sm">No messages yet. Start the conversation!</p>
              </div>
            )}
            {messages.map((msg) => {
              const isMe = msg.pubkey === keys?.publicKey;
              return (
                <div key={msg.id} className="flex items-start gap-2">
                  <div
                    className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-xs overflow-hidden"
                    style={{ background: "var(--bg-tertiary)" }}
                  >
                    {getAvatar(msg.pubkey) ? (
                      <img src={getAvatar(msg.pubkey)} alt="" className="w-full h-full object-cover" />
                    ) : (
                      msg.pubkey.slice(0, 2)
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span
                        className="text-sm font-medium"
                        style={{ color: isMe ? "var(--accent)" : "var(--text-primary)" }}
                      >
                        {getDisplayName(msg.pubkey)}
                      </span>
                      <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                        {formatTime(msg.created_at)}
                      </span>
                    </div>
                    <p className="text-sm" style={{ color: "var(--text-primary)" }}>
                      {msg.content}
                    </p>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-4 border-t" style={{ borderColor: "var(--border)" }}>
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
                placeholder={meeting.status === "ended" ? "Meeting has ended" : "Type a message..."}
                disabled={meeting.status === "ended"}
                className="flex-1 px-3 py-2 rounded text-sm outline-none disabled:opacity-50"
                style={{
                  background: "var(--bg-tertiary)",
                  color: "var(--text-primary)",
                  border: "1px solid var(--border)",
                }}
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || sending || meeting.status === "ended"}
                className="px-4 py-2 rounded text-sm font-medium disabled:opacity-50"
                style={{ background: "var(--accent)", color: "white" }}
              >
                Send
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === "whiteboard" && (
        <MeetingWhiteboard meetingId={meetingId} />
      )}

      {activeTab === "files" && (
        <div className="flex-1 flex items-center justify-center" style={{ color: "var(--text-muted)" }}>
          <div className="text-center">
            <div className="text-5xl mb-3">📁</div>
            <p className="text-sm">Meeting documents coming soon</p>
            <p className="text-xs mt-1">Upload & share files via BLOSSOM</p>
          </div>
        </div>
      )}
    </div>
  );
}
