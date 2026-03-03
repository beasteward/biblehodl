"use client";

import { useState } from "react";
import { useAppStore } from "../../lib/store";
import { generateKeys, keysFromNsec } from "../../lib/nostr";

export default function LoginScreen() {
  const setKeys = useAppStore((s) => s.setKeys);
  const [nsecInput, setNsecInput] = useState("");
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"login" | "generate">("login");

  const handleLogin = () => {
    try {
      setError("");
      const keys = keysFromNsec(nsecInput.trim());
      setKeys(keys);
    } catch {
      setError("Invalid nsec key. Please check and try again.");
    }
  };

  const handleGenerate = () => {
    const keys = generateKeys();
    setKeys(keys);
  };

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg-primary)" }}>
      <div className="w-full max-w-md p-8 rounded-2xl" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}>
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="text-5xl mb-4">⚡</div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
            Nostr Teams
          </h1>
          <p className="mt-2 text-sm" style={{ color: "var(--text-secondary)" }}>
            Decentralized collaboration, powered by NOSTR
          </p>
        </div>

        {mode === "login" ? (
          <>
            <div className="mb-4">
              <label className="block text-sm mb-2" style={{ color: "var(--text-secondary)" }}>
                Enter your nsec key
              </label>
              <input
                type="password"
                value={nsecInput}
                onChange={(e) => setNsecInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                placeholder="nsec1..."
                className="w-full px-4 py-3 rounded-lg text-sm outline-none"
                style={{
                  background: "var(--bg-tertiary)",
                  border: "1px solid var(--border)",
                  color: "var(--text-primary)",
                }}
              />
              {error && (
                <p className="mt-2 text-sm" style={{ color: "var(--danger)" }}>{error}</p>
              )}
            </div>

            <button
              onClick={handleLogin}
              className="w-full py-3 rounded-lg font-medium text-sm transition-colors cursor-pointer"
              style={{ background: "var(--accent)", color: "white" }}
            >
              Sign In
            </button>

            <div className="mt-4 text-center">
              <button
                onClick={() => setMode("generate")}
                className="text-sm underline cursor-pointer"
                style={{ color: "var(--accent-light)" }}
              >
                Don&apos;t have a key? Generate one
              </button>
            </div>

            {/* TODO: nsecBunker support */}
            <div className="mt-6 pt-4" style={{ borderTop: "1px solid var(--border)" }}>
              <button
                className="w-full py-3 rounded-lg font-medium text-sm cursor-pointer"
                style={{
                  background: "var(--bg-tertiary)",
                  border: "1px solid var(--border)",
                  color: "var(--text-secondary)",
                }}
                title="Coming soon"
                disabled
              >
                🔐 Connect with nsecBunker (coming soon)
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="mb-6 p-4 rounded-lg" style={{ background: "var(--bg-tertiary)" }}>
              <p className="text-sm mb-3" style={{ color: "var(--warning)" }}>
                ⚠️ A new NOSTR keypair will be generated. <strong>Save your nsec key</strong> — it cannot be recovered!
              </p>
            </div>

            <button
              onClick={handleGenerate}
              className="w-full py-3 rounded-lg font-medium text-sm transition-colors cursor-pointer"
              style={{ background: "var(--accent)", color: "white" }}
            >
              Generate New Keys
            </button>

            <div className="mt-4 text-center">
              <button
                onClick={() => setMode("login")}
                className="text-sm underline cursor-pointer"
                style={{ color: "var(--accent-light)" }}
              >
                Already have a key? Sign in
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
