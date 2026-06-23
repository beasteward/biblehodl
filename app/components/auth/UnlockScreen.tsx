"use client";

import { useState } from "react";
import { useAppStore } from "../../lib/store";
import { decryptSecretKey, encryptSecretKey } from "../../lib/keystore";
import { createLocalSigner } from "../../lib/signer";
import { keypairFromNsec } from "../../lib/nostr";

const MIN_PASSPHRASE = 8;

/**
 * Shown on reload for local (NIP-49) sessions: the encrypted key is in storage
 * but no signer is in memory. The user re-enters their passphrase to unlock.
 *
 * If the passphrase is lost, "Forgot passphrase?" opens a recovery flow:
 * re-import the nsec and set a *new* passphrase. The imported key must match
 * this account's pubkey — recovery restores access, it does not switch accounts
 * (use "Sign in with a different account" for that). No server is involved; the
 * passphrase is disposable, the nsec is the identity.
 */
export default function UnlockScreen() {
  const keys = useAppStore((s) => s.keys);
  const ncryptsec = useAppStore((s) => s.ncryptsec);
  const setSigner = useAppStore((s) => s.setSigner);
  const setNcryptsec = useAppStore((s) => s.setNcryptsec);
  const logout = useAppStore((s) => s.logout);

  const [mode, setMode] = useState<"unlock" | "recover">("unlock");

  // Unlock
  const [passphrase, setPassphrase] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Recover
  const [nsecInput, setNsecInput] = useState("");
  const [newPass, setNewPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [recoverError, setRecoverError] = useState("");
  const [recovering, setRecovering] = useState(false);

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

  const handleRecover = async () => {
    setRecoverError("");
    let kp;
    try {
      kp = keypairFromNsec(nsecInput.trim());
    } catch {
      setRecoverError("Invalid nsec key. Please check and try again.");
      return;
    }
    // Recovery must restore THIS account, not switch to another identity.
    if (keys && kp.publicKey !== keys.publicKey) {
      setRecoverError(
        "This key doesn't match this account. To use a different account, sign in with a different account below."
      );
      return;
    }
    if (newPass.length < MIN_PASSPHRASE) {
      setRecoverError(`Passphrase must be at least ${MIN_PASSPHRASE} characters`);
      return;
    }
    if (newPass !== confirmPass) {
      setRecoverError("Passphrases do not match");
      return;
    }
    setRecovering(true);
    try {
      await new Promise((r) => setTimeout(r, 0)); // let UI show busy (scrypt is slow)
      const blob = encryptSecretKey(kp.secretKey, newPass);
      setNcryptsec(blob);
      setSigner(createLocalSigner(kp.secretKey));
    } catch (err) {
      setRecoverError(err instanceof Error ? err.message : "Failed to reset passphrase");
    } finally {
      setRecovering(false);
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
        {mode === "unlock" ? (
          <>
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
              <button
                onClick={() => { setMode("recover"); setError(""); }}
                className="text-sm underline cursor-pointer"
                style={{ color: "var(--accent-light)" }}
              >
                Forgot passphrase?
              </button>
            </div>

            <div className="mt-3 text-center">
              <button onClick={() => logout()} className="text-sm underline cursor-pointer" style={{ color: "var(--text-muted)" }}>
                Sign in with a different account
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="text-center mb-6">
              <div className="text-5xl mb-4">🔑</div>
              <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>Recover access</h1>
              <p className="mt-2 text-sm" style={{ color: "var(--text-secondary)" }}>
                There&apos;s no passphrase reset. Re-enter your nsec to set a new one.
              </p>
            </div>

            <div className="mb-4 p-3 rounded-lg" style={{ background: "var(--bg-tertiary)" }}>
              <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                Your nsec is the only way to recover this account. It must match{" "}
                {keys?.npub ? <span className="break-all font-mono">{keys.npub.slice(0, 18)}…</span> : "this account"}.
              </p>
            </div>

            <label className="block text-sm mb-1" style={{ color: "var(--text-secondary)" }}>Private key (nsec)</label>
            <input type="password" autoFocus value={nsecInput}
              onChange={(e) => setNsecInput(e.target.value)}
              placeholder="nsec1..."
              className="w-full mb-3 px-4 py-3 rounded-lg text-sm outline-none" style={inputStyle} />

            <label className="block text-sm mb-1" style={{ color: "var(--text-secondary)" }}>New passphrase</label>
            <input type="password" value={newPass}
              onChange={(e) => setNewPass(e.target.value)}
              placeholder="At least 8 characters"
              className="w-full mb-3 px-4 py-3 rounded-lg text-sm outline-none" style={inputStyle} />

            <label className="block text-sm mb-1" style={{ color: "var(--text-secondary)" }}>Confirm new passphrase</label>
            <input type="password" value={confirmPass}
              onChange={(e) => setConfirmPass(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleRecover()}
              placeholder="Re-enter passphrase"
              className="w-full mb-4 px-4 py-3 rounded-lg text-sm outline-none" style={inputStyle} />

            {recoverError && <p className="mb-4 text-sm" style={{ color: "var(--danger)" }}>{recoverError}</p>}

            <button onClick={handleRecover} disabled={recovering}
              className="w-full py-3 rounded-lg font-medium text-sm cursor-pointer disabled:opacity-50"
              style={{ background: "var(--accent)", color: "white" }}>
              {recovering ? "Resetting…" : "Reset passphrase & unlock"}
            </button>

            <div className="mt-4 text-center">
              <button
                onClick={() => { setMode("unlock"); setRecoverError(""); setNsecInput(""); setNewPass(""); setConfirmPass(""); }}
                className="text-sm underline cursor-pointer"
                style={{ color: "var(--accent-light)" }}
              >
                ← Back to unlock
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
