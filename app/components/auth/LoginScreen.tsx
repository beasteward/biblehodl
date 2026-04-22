"use client";

import { useState, useEffect } from "react";
import { useAppStore } from "../../lib/store";
import { keysFromNsec } from "../../lib/nostr";
import { hasNip07Extension, getNip07PublicKey, createNip07Signer, createLocalSigner } from "../../lib/signer";
import { nip19 } from "nostr-tools";

export default function LoginScreen() {
  const setKeys = useAppStore((s) => s.setKeys);
  const setSigner = useAppStore((s) => s.setSigner);
  const setSignerMode = useAppStore((s) => s.setSignerMode);

  const [nsecInput, setNsecInput] = useState("");
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"main" | "nsec">("main");
  const [hasExtension, setHasExtension] = useState(false);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    // Check for NIP-07 extension (may load async)
    const check = () => setHasExtension(hasNip07Extension());
    check();
    // Some extensions inject after page load
    const timer = setTimeout(check, 500);
    return () => clearTimeout(timer);
  }, []);

  const handleNip07Login = async () => {
    try {
      setError("");
      setConnecting(true);
      const pubkey = await getNip07PublicKey();
      const npub = nip19.npubEncode(pubkey);
      const signer = createNip07Signer(pubkey);

      // Set keys without private key (NIP-07 manages it)
      setKeys({
        privateKey: new Uint8Array(0), // placeholder — never used
        publicKey: pubkey,
        npub,
        nsec: "", // not available in NIP-07 mode
      });
      setSigner(signer);
      setSignerMode("nip07");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect to extension");
    } finally {
      setConnecting(false);
    }
  };

  const handleNsecLogin = () => {
    try {
      setError("");
      const keys = keysFromNsec(nsecInput.trim());
      const signer = createLocalSigner(keys.privateKey);
      setKeys(keys);
      setSigner(signer);
      setSignerMode("local");
    } catch {
      setError("Invalid nsec key. Please check and try again.");
    }
  };

  const inputStyle = {
    background: "var(--bg-tertiary)",
    border: "1px solid var(--border)",
    color: "var(--text-primary)",
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

        {mode === "main" ? (
          <>
            {/* NIP-07 Extension Login */}
            {hasExtension && (
              <>
                <button
                  onClick={handleNip07Login}
                  disabled={connecting}
                  className="w-full py-3 rounded-lg font-medium text-sm transition-colors cursor-pointer disabled:opacity-50"
                  style={{ background: "var(--accent)", color: "white" }}
                >
                  {connecting ? "Connecting..." : "🔑 Sign in with Nostr Extension"}
                </button>

                <p className="mt-2 text-center text-xs" style={{ color: "var(--text-muted)" }}>
                  Recommended — your keys never leave the extension
                </p>

                <div className="my-6 flex items-center gap-3">
                  <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>or</span>
                  <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
                </div>
              </>
            )}

            {/* nsec Login */}
            <button
              onClick={() => setMode("nsec")}
              className="w-full py-3 rounded-lg font-medium text-sm transition-colors cursor-pointer"
              style={{
                background: hasExtension ? "var(--bg-tertiary)" : "var(--accent)",
                color: hasExtension ? "var(--text-secondary)" : "white",
                border: hasExtension ? "1px solid var(--border)" : "none",
              }}
            >
              {hasExtension ? "Sign in with nsec" : "Sign in with nsec key"}
            </button>

            {!hasExtension && (
              <div className="mt-6 p-3 rounded-lg" style={{ background: "var(--bg-tertiary)" }}>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  💡 <strong>Tip:</strong> Install a Nostr signer extension (
                  <a href="https://github.com/fiatjaf/nos2x" target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent-light)" }}>nos2x</a>,{" "}
                  <a href="https://getalby.com" target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent-light)" }}>Alby</a>
                  ) for safer key management. Your private key never leaves the extension.
                </p>
              </div>
            )}

            {error && (
              <p className="mt-4 text-sm text-center" style={{ color: "var(--danger)" }}>{error}</p>
            )}
          </>
        ) : (
          // nsec input mode
          <>
            <div className="mb-2 p-3 rounded-lg" style={{ background: "var(--bg-tertiary)" }}>
              <p className="text-xs" style={{ color: "var(--warning)" }}>
                ⚠️ Your nsec is stored in this browser&apos;s session. For better security, use a Nostr signer extension.
              </p>
            </div>

            <div className="mb-4">
              <label className="block text-sm mb-2" style={{ color: "var(--text-secondary)" }}>
                Enter your nsec key
              </label>
              <input
                type="password"
                value={nsecInput}
                onChange={(e) => setNsecInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleNsecLogin()}
                placeholder="nsec1..."
                className="w-full px-4 py-3 rounded-lg text-sm outline-none"
                style={inputStyle}
              />
              {error && (
                <p className="mt-2 text-sm" style={{ color: "var(--danger)" }}>{error}</p>
              )}
            </div>

            <button
              onClick={handleNsecLogin}
              className="w-full py-3 rounded-lg font-medium text-sm transition-colors cursor-pointer"
              style={{ background: "var(--accent)", color: "white" }}
            >
              Sign In
            </button>

            <div className="mt-4 text-center">
              <button
                onClick={() => { setMode("main"); setError(""); }}
                className="text-sm underline cursor-pointer"
                style={{ color: "var(--accent-light)" }}
              >
                ← Back
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
