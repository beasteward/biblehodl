"use client";

import { useState } from "react";
import { useAppStore } from "../../lib/store";
import { decryptSecretKey } from "../../lib/keystore";
import { createLocalSigner } from "../../lib/signer";

/**
 * Shown on reload for local (NIP-49) sessions: the encrypted key is in storage
 * but no signer is in memory. The user re-enters their passphrase to unlock.
 */
export default function UnlockScreen() {
  const keys = useAppStore((s) => s.keys);
  const ncryptsec = useAppStore((s) => s.ncryptsec);
  const setSigner = useAppStore((s) => s.setSigner);
  const logout = useAppStore((s) => s.logout);

  const [passphrase, setPassphrase] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const handleUnlock = async () => {
    setError("");
    if (!ncryptsec) {
      setError("No stored key found. Please sign in again.");
      return;
    }
    setBusy(true);
    try {
      // scrypt is intentionally slow — yield a frame so the button can show busy
      await new Promise((r) => setTimeout(r, 0));
      const secretKey = decryptSecretKey(ncryptsec, passphrase);
      setSigner(createLocalSigner(secretKey));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Incorrect passphrase");
    } finally {
      setBusy(false);
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
        <div className="text-center mb-6">
          <div className="text-5xl mb-4">🔒</div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>Unlock</h1>
          <p className="mt-2 text-sm break-all" style={{ color: "var(--text-muted)" }}>
            {keys?.npub ? `${keys.npub.slice(0, 18)}…` : "Enter your passphrase to continue"}
          </p>
        </div>

        <label className="block text-sm mb-1" style={{ color: "var(--text-secondary)" }}>Passphrase</label>
        <input type="password" autoFocus value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleUnlock()}
          placeholder="Your passphrase"
          className="w-full mb-4 px-4 py-3 rounded-lg text-sm outline-none" style={inputStyle} />

        {error && <p className="mb-4 text-sm" style={{ color: "var(--danger)" }}>{error}</p>}

        <button onClick={handleUnlock} disabled={busy}
          className="w-full py-3 rounded-lg font-medium text-sm cursor-pointer disabled:opacity-50"
          style={{ background: "var(--accent)", color: "white" }}>
          {busy ? "Unlocking…" : "Unlock"}
        </button>

        <div className="mt-4 text-center">
          <button onClick={() => logout()} className="text-sm underline cursor-pointer" style={{ color: "var(--accent-light)" }}>
            Sign in with a different account
          </button>
        </div>
      </div>
    </div>
  );
}
