"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAppStore } from "../../lib/store";
import { identityFromPubkey, keypairFromNsec } from "../../lib/nostr";
import { encryptSecretKey } from "../../lib/keystore";
import {
  waitForNip07Extension,
  getNip07PublicKey,
  createNip07Signer,
  createLocalSigner,
} from "../../lib/signer";

const MIN_PASSPHRASE = 8;

export default function LoginScreen() {
  const router = useRouter();
  const setKeys = useAppStore((s) => s.setKeys);
  const setSigner = useAppStore((s) => s.setSigner);
  const setSignerMode = useAppStore((s) => s.setSignerMode);
  const setNcryptsec = useAppStore((s) => s.setNcryptsec);

  const [mode, setMode] = useState<"main" | "nsec">("main");
  const [nsecInput, setNsecInput] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [hasExtension, setHasExtension] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Poll for async extension injection rather than a single delayed check,
    // and flip the CTA the moment window.nostr appears.
    let cancelled = false;
    waitForNip07Extension().then((available) => {
      if (!cancelled) setHasExtension(available);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleNip07Login = async () => {
    try {
      setError("");
      setBusy(true);
      const pubkey = await getNip07PublicKey();
      setKeys(identityFromPubkey(pubkey));
      setSigner(createNip07Signer(pubkey));
      setSignerMode("nip07");
      setNcryptsec(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect to extension");
    } finally {
      setBusy(false);
    }
  };

  const handleNsecLogin = async () => {
    setError("");
    if (passphrase.length < MIN_PASSPHRASE) {
      setError(`Passphrase must be at least ${MIN_PASSPHRASE} characters`);
      return;
    }
    if (passphrase !== confirm) {
      setError("Passphrases do not match");
      return;
    }
    let fresh;
    try {
      fresh = keypairFromNsec(nsecInput.trim());
    } catch {
      setError("Invalid nsec key. Please check and try again.");
      return;
    }
    try {
      setBusy(true);
      // Encrypt the key at rest (NIP-49); the raw key only lives in the signer.
      const ncryptsec = encryptSecretKey(fresh.secretKey, passphrase);
      setNcryptsec(ncryptsec);
      setSigner(createLocalSigner(fresh.secretKey));
      setKeys(identityFromPubkey(fresh.publicKey));
      setSignerMode("local");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to secure key");
    } finally {
      setBusy(false);
    }
  };

  const inputStyle = {
    background: "var(--bg-tertiary)",
    border: "1px solid var(--border)",
    color: "var(--text-primary)",
  };
  const primaryBtn = { background: "var(--accent)", color: "white" };

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg-primary)" }}>
      <div className="w-full max-w-md p-8 rounded-2xl" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}>
        <div className="text-center mb-8">
          <div className="text-5xl mb-4">⚡</div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>Sign in</h1>
          <p className="mt-2 text-sm" style={{ color: "var(--text-secondary)" }}>
            Decentralized collaboration, powered by Nostr
          </p>
        </div>

        {mode === "main" ? (
          <>
            {hasExtension && (
              <>
                <button onClick={handleNip07Login} disabled={busy}
                  className="w-full py-3 rounded-lg font-medium text-sm cursor-pointer disabled:opacity-50"
                  style={primaryBtn}>
                  {busy ? "Connecting..." : "🔑 Sign in with Nostr Extension"}
                </button>
                <p className="mt-2 text-center text-xs" style={{ color: "var(--text-muted)" }}>
                  Recommended — your key never leaves the extension
                </p>
                <div className="my-6 flex items-center gap-3">
                  <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>or</span>
                  <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
                </div>
              </>
            )}

            <button onClick={() => { setMode("nsec"); setError(""); }}
              className="w-full py-3 rounded-lg font-medium text-sm cursor-pointer"
              style={{
                background: hasExtension ? "var(--bg-tertiary)" : "var(--accent)",
                color: hasExtension ? "var(--text-secondary)" : "white",
                border: hasExtension ? "1px solid var(--border)" : "none",
              }}>
              Sign in with private key (nsec)
            </button>

            <div className="mt-4 text-center">
              <button onClick={() => router.push("/join")} className="text-sm underline cursor-pointer" style={{ color: "var(--accent-light)" }}>
                New here? Create an account
              </button>
            </div>

            {error && <p className="mt-4 text-sm text-center" style={{ color: "var(--danger)" }}>{error}</p>}
          </>
        ) : (
          <>
            <div className="mb-3 p-3 rounded-lg" style={{ background: "var(--bg-tertiary)" }}>
              <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                Your key is encrypted with a passphrase and stored only on this device. We never see it.
              </p>
            </div>

            <label className="block text-sm mb-1" style={{ color: "var(--text-secondary)" }}>Private key (nsec)</label>
            <input type="password" value={nsecInput} onChange={(e) => setNsecInput(e.target.value)}
              placeholder="nsec1..." className="w-full mb-3 px-4 py-3 rounded-lg text-sm outline-none" style={inputStyle} />

            <label className="block text-sm mb-1" style={{ color: "var(--text-secondary)" }}>Passphrase</label>
            <input type="password" value={passphrase} onChange={(e) => setPassphrase(e.target.value)}
              placeholder="At least 8 characters" className="w-full mb-3 px-4 py-3 rounded-lg text-sm outline-none" style={inputStyle} />

            <label className="block text-sm mb-1" style={{ color: "var(--text-secondary)" }}>Confirm passphrase</label>
            <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleNsecLogin()}
              placeholder="Re-enter passphrase" className="w-full mb-4 px-4 py-3 rounded-lg text-sm outline-none" style={inputStyle} />

            {error && <p className="mb-4 text-sm" style={{ color: "var(--danger)" }}>{error}</p>}

            <button onClick={handleNsecLogin} disabled={busy}
              className="w-full py-3 rounded-lg font-medium text-sm cursor-pointer disabled:opacity-50" style={primaryBtn}>
              {busy ? "Securing…" : "Sign In"}
            </button>

            <div className="mt-4 text-center">
              <button onClick={() => { setMode("main"); setError(""); }} className="text-sm underline cursor-pointer" style={{ color: "var(--accent-light)" }}>
                ← Back
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
