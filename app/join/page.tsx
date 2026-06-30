"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAppStore } from "../lib/store";
import {
  generateKeypair,
  keypairFromNsec,
  identityFromPubkey,
  KIND_METADATA,
  type FreshKeypair,
} from "../lib/nostr";
import { encryptSecretKey } from "../lib/keystore";
import {
  hasNip07Extension,
  getNip07PublicKey,
  createNip07Signer,
  createLocalSigner,
} from "../lib/signer";
import { pool } from "../lib/relay-pool";

const MIN_PASSPHRASE = 8;

type Step = "keys" | "secure" | "register";

export default function JoinPage() {
  const router = useRouter();
  const keys = useAppStore((s) => s.keys);
  const setKeys = useAppStore((s) => s.setKeys);
  const setSigner = useAppStore((s) => s.setSigner);
  const setSignerMode = useAppStore((s) => s.setSignerMode);
  const setNcryptsec = useAppStore((s) => s.setNcryptsec);
  const setIsRegistered = useAppStore((s) => s.setIsRegistered);
  const setMemberProfile = useAppStore((s) => s.setMemberProfile);

  const [step, setStep] = useState<Step>(keys ? "register" : "keys");
  const [keyMode, setKeyMode] = useState<"choose" | "import">("choose");
  const [hasExtension, setHasExtension] = useState(false);

  // Transient key material (never persisted raw)
  const [fresh, setFresh] = useState<FreshKeypair | null>(null);
  const [isNewKey, setIsNewKey] = useState(false);
  const [nsecInput, setNsecInput] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [confirm, setConfirm] = useState("");
  const [savedConfirmed, setSavedConfirmed] = useState(false);
  const [backedUp, setBackedUp] = useState(false); // copied or downloaded nsec at least once
  const [copied, setCopied] = useState<"nsec" | "npub" | null>(null);
  const [keyError, setKeyError] = useState("");
  const [busy, setBusy] = useState(false);

  // Registration form
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [regError, setRegError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const check = () => setHasExtension(hasNip07Extension());
    check();
    const timer = setTimeout(check, 500);
    return () => clearTimeout(timer);
  }, []);

  // Pre-fill the invite code from an emailed link (e.g. /join?invite=abc123).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const code = new URLSearchParams(window.location.search).get("invite");
    if (code) setInviteCode(code.trim());
  }, []);

  const handleNip07 = async () => {
    try {
      setKeyError("");
      const pubkey = await getNip07PublicKey();
      setKeys(identityFromPubkey(pubkey));
      setSigner(createNip07Signer(pubkey));
      setSignerMode("nip07");
      setNcryptsec(null);
      setStep("register");
    } catch (err) {
      setKeyError(err instanceof Error ? err.message : "Failed to connect to extension");
    }
  };

  const handleGenerate = () => {
    setFresh(generateKeypair());
    setIsNewKey(true);
    setStep("secure");
  };

  const handleImport = () => {
    try {
      setKeyError("");
      setFresh(keypairFromNsec(nsecInput.trim()));
      setIsNewKey(false);
      setStep("secure");
    } catch {
      setKeyError("Invalid nsec key. Please check and try again.");
    }
  };

  // Encrypt the key with the passphrase and establish the session.
  const handleSecure = async () => {
    setKeyError("");
    if (!fresh) return;
    if (passphrase.length < MIN_PASSPHRASE) {
      setKeyError(`Passphrase must be at least ${MIN_PASSPHRASE} characters`);
      return;
    }
    if (passphrase !== confirm) {
      setKeyError("Passphrases do not match");
      return;
    }
    if (isNewKey && !savedConfirmed) {
      setKeyError("Please confirm you've backed up your key");
      return;
    }
    try {
      setBusy(true);
      await new Promise((r) => setTimeout(r, 0)); // let UI show busy (scrypt is slow)
      const ncryptsec = encryptSecretKey(fresh.secretKey, passphrase);
      setNcryptsec(ncryptsec);
      setSigner(createLocalSigner(fresh.secretKey));
      setKeys(identityFromPubkey(fresh.publicKey));
      setSignerMode("local");
      setStep("register");
    } catch (err) {
      setKeyError(err instanceof Error ? err.message : "Failed to secure key");
    } finally {
      setBusy(false);
    }
  };

  const copyToClipboard = (text: string, label: "nsec" | "npub") => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    if (label === "nsec") setBackedUp(true);
    setTimeout(() => setCopied(null), 2000);
  };

  const downloadKeys = () => {
    if (!fresh) return;
    setBackedUp(true);
    const content = `NOSTR KEYS — KEEP THIS FILE SAFE\n\nPublic Key (npub):\n${fresh.npub}\n\nPrivate Key (nsec) — NEVER SHARE THIS:\n${fresh.nsec}\n\nGenerated: ${new Date().toISOString()}\n`;
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "nostr-keys.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleRegister = async () => {
    if (!keys) return;
    setRegError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pubkey: keys.publicKey,
          firstName,
          lastName,
          email,
          inviteCode: inviteCode || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setRegError(data.error || "Registration failed");
        setSubmitting(false);
        return;
      }

      setIsRegistered(true);
      setMemberProfile({ firstName, lastName, email, role: data.member.role });

      // Publish kind-0 profile via the signer so others can find us
      try {
        const signer = useAppStore.getState().signer;
        if (signer) {
          const event = await signer.signEvent({
            kind: KIND_METADATA,
            content: JSON.stringify({
              name: `${firstName} ${lastName}`,
              display_name: `${firstName} ${lastName}`,
            }),
            tags: [],
          });
          await pool.publish(event);
        }
      } catch (e) {
        console.warn("[register] Failed to publish profile:", e);
      }

      router.push("/");
    } catch {
      setRegError("Network error. Please try again.");
      setSubmitting(false);
    }
  };

  const inputStyle = {
    background: "var(--bg-tertiary)",
    border: "1px solid var(--border)",
    color: "var(--text-primary)",
  };
  const primaryBtn = { background: "var(--accent)", color: "white" };
  const backBtn = "text-sm underline cursor-pointer";

  const startOver = () => {
    setFresh(null);
    setNsecInput("");
    setPassphrase("");
    setConfirm("");
    setSavedConfirmed(false);
    setBackedUp(false);
    setKeyError("");
    setKeyMode("choose");
    setStep("keys");
  };

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg-primary)" }}>
      <div className="w-full max-w-md p-8 rounded-2xl" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}>
        <div className="text-center mb-8">
          <div className="text-5xl mb-4">⚡</div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>Join the community</h1>
          <p className="mt-2 text-sm" style={{ color: "var(--text-secondary)" }}>
            {step === "register" ? "Complete your registration" : "First, set up your Nostr identity"}
          </p>
        </div>

        {step === "keys" ? (
          keyMode === "choose" ? (
            <>
              {hasExtension && (
                <>
                  <button onClick={handleNip07} className="w-full py-3 rounded-lg font-medium text-sm cursor-pointer" style={primaryBtn}>
                    🔑 Continue with Nostr Extension
                  </button>
                  <p className="mt-2 text-center text-xs" style={{ color: "var(--text-muted)" }}>
                    Recommended — your key never leaves the extension
                  </p>
                  <div className="my-5 flex items-center gap-3">
                    <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
                    <span className="text-xs" style={{ color: "var(--text-muted)" }}>or</span>
                    <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
                  </div>
                </>
              )}

              <button onClick={handleGenerate} className="w-full py-3 rounded-lg font-medium text-sm cursor-pointer" style={primaryBtn}>
                Create a new account
              </button>
              <p className="mt-2 text-center text-xs" style={{ color: "var(--text-muted)" }}>
                Generates a key, encrypted with a passphrase on this device
              </p>

              <div className="mt-4 text-center">
                <button onClick={() => { setKeyMode("import"); setKeyError(""); }} className={backBtn} style={{ color: "var(--accent-light)" }}>
                  Already have a key? Import nsec
                </button>
              </div>
            </>
          ) : (
            <>
              <label className="block text-sm mb-1" style={{ color: "var(--text-secondary)" }}>Private key (nsec)</label>
              <input type="password" value={nsecInput} onChange={(e) => setNsecInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleImport()}
                placeholder="nsec1..." className="w-full mb-3 px-4 py-3 rounded-lg text-sm outline-none" style={inputStyle} />
              {keyError && <p className="mb-3 text-sm" style={{ color: "var(--danger)" }}>{keyError}</p>}
              <button onClick={handleImport} className="w-full py-3 rounded-lg font-medium text-sm cursor-pointer" style={primaryBtn}>
                Continue
              </button>
              <div className="mt-4 text-center">
                <button onClick={() => { setKeyMode("choose"); setKeyError(""); }} className={backBtn} style={{ color: "var(--accent-light)" }}>
                  ← Back
                </button>
              </div>
            </>
          )
        ) : step === "secure" ? (
          <>
            {isNewKey && fresh && (
              <>
                <div className="mb-4 p-4 rounded-lg" style={{ background: "var(--bg-tertiary)", border: "1px solid var(--warning)" }}>
                  <p className="text-sm font-medium mb-1" style={{ color: "var(--warning)" }}>⚠️ Back up your key now</p>
                  <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                    Your nsec is the only way to recover your account if you forget your passphrase or switch devices.
                  </p>
                </div>

                <div className="space-y-3 mb-3">
                  <div>
                    <label className="block text-xs mb-1 font-medium" style={{ color: "var(--text-secondary)" }}>Public Key (npub)</label>
                    <div className="flex gap-2">
                      <input type="text" readOnly value={fresh.npub} className="flex-1 px-3 py-2 rounded-lg text-xs outline-none font-mono" style={inputStyle} />
                      <button onClick={() => copyToClipboard(fresh.npub, "npub")} className="px-3 py-2 rounded-lg text-xs whitespace-nowrap cursor-pointer" style={{ background: copied === "npub" ? "var(--success)" : "var(--bg-tertiary)", color: copied === "npub" ? "white" : "var(--text-secondary)", border: "1px solid var(--border)" }}>
                        {copied === "npub" ? "✓" : "Copy"}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs mb-1 font-medium" style={{ color: "var(--warning)" }}>Private Key (nsec) — never share</label>
                    <div className="flex gap-2">
                      <input type="text" readOnly value={fresh.nsec} className="flex-1 px-3 py-2 rounded-lg text-xs outline-none font-mono" style={inputStyle} />
                      <button onClick={() => copyToClipboard(fresh.nsec, "nsec")} className="px-3 py-2 rounded-lg text-xs whitespace-nowrap cursor-pointer" style={{ background: copied === "nsec" ? "var(--success)" : "var(--bg-tertiary)", color: copied === "nsec" ? "white" : "var(--text-secondary)", border: "1px solid var(--border)" }}>
                        {copied === "nsec" ? "✓" : "Copy"}
                      </button>
                    </div>
                  </div>
                </div>

                <button onClick={downloadKeys} className="w-full py-2 mb-3 rounded-lg text-sm cursor-pointer" style={{ background: "var(--bg-tertiary)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}>
                  📥 Download Keys as Text File
                </button>

                <label className={`flex items-center gap-2 mb-1 ${backedUp ? "cursor-pointer" : "cursor-not-allowed opacity-60"}`}>
                  <input type="checkbox" disabled={!backedUp} checked={savedConfirmed} onChange={(e) => setSavedConfirmed(e.target.checked)} className="w-4 h-4" style={{ accentColor: "var(--accent)" }} />
                  <span className="text-sm" style={{ color: "var(--text-secondary)" }}>I&apos;ve saved my recovery key somewhere safe</span>
                </label>
                {!backedUp && (
                  <p className="mb-4 text-xs" style={{ color: "var(--text-muted)" }}>
                    Copy or download your nsec first — it&apos;s the only way to recover this account.
                  </p>
                )}
                {backedUp && <div className="mb-4" />}
              </>
            )}

            <div className="mb-3 p-3 rounded-lg" style={{ background: "var(--bg-tertiary)" }}>
              <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                Choose a passphrase to encrypt your key on this device. We never see it — there is no reset.
              </p>
            </div>

            <label className="block text-sm mb-1" style={{ color: "var(--text-secondary)" }}>Passphrase</label>
            <input type="password" value={passphrase} onChange={(e) => setPassphrase(e.target.value)}
              placeholder="At least 8 characters" className="w-full mb-3 px-4 py-3 rounded-lg text-sm outline-none" style={inputStyle} />

            <label className="block text-sm mb-1" style={{ color: "var(--text-secondary)" }}>Confirm passphrase</label>
            <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSecure()}
              placeholder="Re-enter passphrase" className="w-full mb-4 px-4 py-3 rounded-lg text-sm outline-none" style={inputStyle} />

            {keyError && <p className="mb-4 text-sm" style={{ color: "var(--danger)" }}>{keyError}</p>}

            <button onClick={handleSecure} disabled={busy || (isNewKey && !savedConfirmed)} className="w-full py-3 rounded-lg font-medium text-sm cursor-pointer disabled:opacity-50" style={primaryBtn}>
              {busy ? "Securing…" : "Continue"}
            </button>

            <div className="mt-4 text-center">
              <button onClick={startOver} className={backBtn} style={{ color: "var(--accent-light)" }}>Start over</button>
            </div>
          </>
        ) : (
          <>
            {keys && (
              <div className="mb-4 p-3 rounded-lg text-xs break-all" style={{ background: "var(--bg-tertiary)", color: "var(--text-muted)" }}>
                <span style={{ color: "var(--text-secondary)" }}>Pubkey:</span> {keys.publicKey.slice(0, 16)}...{keys.publicKey.slice(-8)}
              </div>
            )}

            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm mb-1" style={{ color: "var(--text-secondary)" }}>First Name</label>
                <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} className="w-full px-4 py-3 rounded-lg text-sm outline-none" style={inputStyle} />
              </div>
              <div>
                <label className="block text-sm mb-1" style={{ color: "var(--text-secondary)" }}>Last Name</label>
                <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} className="w-full px-4 py-3 rounded-lg text-sm outline-none" style={inputStyle} />
              </div>
              <div>
                <label className="block text-sm mb-1" style={{ color: "var(--text-secondary)" }}>Email</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full px-4 py-3 rounded-lg text-sm outline-none" style={inputStyle} />
              </div>
              <div>
                <label className="block text-sm mb-1" style={{ color: "var(--text-secondary)" }}>Invite Code</label>
                <input type="text" value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} placeholder="Leave blank if first user" className="w-full px-4 py-3 rounded-lg text-sm outline-none" style={inputStyle} />
              </div>
            </div>

            {regError && <p className="mb-4 text-sm" style={{ color: "var(--danger)" }}>{regError}</p>}

            <button onClick={handleRegister} disabled={submitting || !firstName || !lastName || !email}
              className="w-full py-3 rounded-lg font-medium text-sm cursor-pointer disabled:opacity-50" style={primaryBtn}>
              {submitting ? "Registering..." : "Join Community"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
