"use client";

import { useState } from "react";
import { useAppStore } from "../../lib/store";
import { createChannel } from "../../lib/chat-service";
import { startDMConversation } from "../../lib/dm-service";
import MemberSearch, { type MemberResult } from "../common/MemberSearch";

export default function ChatSidebar() {
  const channels = useAppStore((s) => s.channels);
  const activeChannelId = useAppStore((s) => s.activeChannelId);
  const setActiveChannelId = useAppStore((s) => s.setActiveChannelId);
  const addChannel = useAppStore((s) => s.addChannel);
  const profiles = useAppStore((s) => s.profiles);
  const keys = useAppStore((s) => s.keys);
  const [showNew, setShowNew] = useState<false | "channel" | "dm">(false);
  const [newName, setNewName] = useState("");
  const [newAbout, setNewAbout] = useState("");
  const [dmPubkey, setDmPubkey] = useState("");
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState("");

  const handleCreateChannel = async () => {
    if (!newName.trim() || !keys) return;
    setCreating(true);
    try {
      const id = await createChannel(newName.trim(), newAbout.trim(), keys.privateKey);
      addChannel({ id, name: newName.trim(), about: newAbout.trim() });
      setActiveChannelId(id);
      setNewName("");
      setNewAbout("");
      setShowNew(false);
    } catch (err) {
      console.error("Failed to create channel:", err);
    }
    setCreating(false);
  };

  const handleStartDM = (member: MemberResult) => {
    if (!keys) return;
    startDMConversation(member.pubkey, keys.publicKey);
    setShowNew(false);
  };

  const handleStartDMByPubkey = () => {
    if (!dmPubkey.trim() || !keys) return;
    let pubkey = dmPubkey.trim();
    if (pubkey.startsWith("npub1")) {
      try {
        const { nip19 } = require("nostr-tools");
        const { data } = nip19.decode(pubkey);
        pubkey = data as string;
      } catch {
        return;
      }
    }
    startDMConversation(pubkey, keys.publicKey);
    setDmPubkey("");
    setShowNew(false);
  };

  const dmChannels = channels.filter((c) => c.isDirectMessage);
  const groupChannels = channels.filter((c) => !c.isDirectMessage);

  const filterMatch = (name: string) =>
    !search || name.toLowerCase().includes(search.toLowerCase());

  const getDMName = (channel: typeof channels[0]) => {
    const partnerPubkey = channel.id.replace("dm-", "");
    const profile = profiles[partnerPubkey];
    if (profile?.displayName) return profile.displayName;
    if (profile?.name) return profile.name;
    return channel.name;
  };

  const getDMAvatar = (channel: typeof channels[0]) => {
    const partnerPubkey = channel.id.replace("dm-", "");
    return profiles[partnerPubkey]?.picture || null;
  };

  return (
    <div className="flex flex-col h-full">
      {/* Search / New */}
      <div className="p-3 flex gap-2" style={{ borderBottom: "1px solid var(--border)" }}>
        <input
          type="text"
          placeholder="Search..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 px-3 py-2 rounded text-sm outline-none"
          style={{ background: "var(--bg-tertiary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
        />
        <div className="relative group">
          <button
            onClick={() => setShowNew(showNew ? false : "channel")}
            className="px-3 py-2 rounded text-sm cursor-pointer"
            style={{ background: "var(--accent)", color: "white" }}
          >
            +
          </button>
        </div>
      </div>

      {/* New channel/DM toggle + form */}
      {showNew && (
        <div className="p-3 space-y-2" style={{ borderBottom: "1px solid var(--border)" }}>
          <div className="flex gap-1 mb-2">
            <button
              onClick={() => setShowNew("channel")}
              className="flex-1 py-1.5 rounded text-xs cursor-pointer"
              style={{
                background: showNew === "channel" ? "var(--accent)" : "var(--bg-tertiary)",
                color: showNew === "channel" ? "white" : "var(--text-secondary)",
              }}
            >
              # Channel
            </button>
            <button
              onClick={() => setShowNew("dm")}
              className="flex-1 py-1.5 rounded text-xs cursor-pointer"
              style={{
                background: showNew === "dm" ? "var(--accent)" : "var(--bg-tertiary)",
                color: showNew === "dm" ? "white" : "var(--text-secondary)",
              }}
            >
              👤 Direct Message
            </button>
          </div>

          {showNew === "channel" ? (
            <>
              <input
                type="text"
                placeholder="Channel name..."
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="w-full px-3 py-2 rounded text-sm outline-none"
                style={{ background: "var(--bg-tertiary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
                autoFocus
              />
              <input
                type="text"
                placeholder="Description (optional)..."
                value={newAbout}
                onChange={(e) => setNewAbout(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreateChannel()}
                className="w-full px-3 py-2 rounded text-sm outline-none"
                style={{ background: "var(--bg-tertiary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
              />
              <button
                onClick={handleCreateChannel}
                disabled={creating || !newName.trim()}
                className="w-full py-2 rounded text-sm cursor-pointer disabled:opacity-50"
                style={{ background: "var(--accent)", color: "white" }}
              >
                {creating ? "Creating..." : "Create Channel"}
              </button>
            </>
          ) : (
            <>
              <MemberSearch
                onSelect={handleStartDM}
                placeholder="Search members by name..."
                excludePubkeys={keys ? [keys.publicKey] : []}
              />
              <div className="flex items-center gap-2 mt-2">
                <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>or</span>
                <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
              </div>
              <input
                type="text"
                placeholder="npub or hex pubkey..."
                value={dmPubkey}
                onChange={(e) => setDmPubkey(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleStartDMByPubkey()}
                className="w-full px-3 py-2 rounded text-sm outline-none"
                style={{ background: "var(--bg-tertiary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
              />
              <button
                onClick={handleStartDMByPubkey}
                disabled={!dmPubkey.trim()}
                className="w-full py-2 rounded text-sm cursor-pointer disabled:opacity-50"
                style={{ background: "var(--accent)", color: "white" }}
              >
                Start Conversation
              </button>
            </>
          )}
        </div>
      )}

      {/* Channel list */}
      <div className="flex-1 overflow-y-auto">
        {/* DM section */}
        {dmChannels.length > 0 && (
          <>
            <div className="px-4 py-2 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
              Direct Messages
            </div>
            {dmChannels.filter((c) => filterMatch(getDMName(c))).map((channel) => (
              <button
                key={channel.id}
                onClick={() => setActiveChannelId(channel.id)}
                className="w-full px-4 py-2.5 flex items-center gap-3 text-left transition-colors cursor-pointer"
                style={{
                  background: activeChannelId === channel.id ? "var(--bg-active)" : "transparent",
                  borderLeft: activeChannelId === channel.id ? "3px solid var(--accent-light)" : "3px solid transparent",
                }}
              >
                {getDMAvatar(channel) ? (
                  <img src={getDMAvatar(channel)!} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
                ) : (
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs shrink-0" style={{ background: "var(--accent)" }}>
                    👤
                  </div>
                )}
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>
                    {getDMName(channel)}
                  </div>
                </div>
              </button>
            ))}
          </>
        )}

        {/* Channels section */}
        <div className="px-4 py-2 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
          Channels
        </div>
        {groupChannels.filter((c) => filterMatch(c.name)).length === 0 && (
          <div className="px-4 py-2 text-center text-sm" style={{ color: "var(--text-muted)" }}>
            No channels yet
          </div>
        )}
        {groupChannels.filter((c) => filterMatch(c.name)).map((channel) => (
          <button
            key={channel.id}
            onClick={() => setActiveChannelId(channel.id)}
            className="w-full px-4 py-2.5 flex items-center gap-3 text-left transition-colors cursor-pointer"
            style={{
              background: activeChannelId === channel.id ? "var(--bg-active)" : "transparent",
              borderLeft: activeChannelId === channel.id ? "3px solid var(--accent-light)" : "3px solid transparent",
            }}
          >
            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm shrink-0" style={{ background: "var(--bg-tertiary)" }}>
              #
            </div>
            <div className="min-w-0">
              <div className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>{channel.name}</div>
              {channel.about && <div className="text-xs truncate" style={{ color: "var(--text-muted)" }}>{channel.about}</div>}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
