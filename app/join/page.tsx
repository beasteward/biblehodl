"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAppStore } from "../lib/store";
import { generateKeys, keysFromNsec, createEvent, KIND_METADATA } from "../lib/nostr";
import { hasNip07Extension, getNip07PublicKey, createNip07Signer, createLocalSigner, createSignedEvent } from "../lib/signer";
import { nip19 } from "nostr-tools";
import { pool } from "../lib/relay-pool";

export default function JoinPage() {
  const router = useRouter();
  const keys = useAppStore((s) => s.keys);
  const setKeys = useAppStore((s) => s.setKeys);
  const setSigner = useAppStore((s) => s.setSigner);
  const setSignerMode = useAppStore((s) => s.setSignerMode);
  const setIsRegistered = useAppStore((s) => s.setIsRegistered);
  const setMemberProfile = useAppStore((s) => s.setMemberProfile);

  const [step, setStep] = useState<"keys" | "save" | "register">(keys ? "register" : "keys");
  const [hasExtension, setHasExtension] = useState(false);

  useEffect(() => {
    const check = () => setHasExtension(hasNip07Extension());
    check();
    const timer = setTimeout(check, 500);
    return () => clearTimeout(timer);
  }, []);
  const [savedConfirmed, setSavedConfirmed] = useState(false);
  const [copied, setCopied] = useState<"nsec" | "npub" | null>(null);
  const [nsecInput, setNsecInput] = useState("");
  const [keyError, setKeyError] = useState("");
  const [keyMode, setKeyMode] = useState<"login" | "generate">("login");

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [regError, setRegError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleNip07 = async () => {
    try {
      setKeyError("");
      const pubkey = await getNip07PublicKey();
      const npub = nip19.npubEncode(pubkey);
      const signer = createNip07Signer(pubkey);
      setKeys({
        privateKey: new Uint8Array(0),
        publicKey: pubkey,
        npub,
        nsec: "",
      });
      setSigner(signer);
      setSignerMode("nip07");
      setStep("register");
    } catch (err) {
      setKeyError(err instanceof Error ? err.message : "Failed to connect to extension");
    }
  };

  const handleKeyLogin = () => {
    try {
      setKeyError("");
      const k = keysFromNsec(nsecInput.trim());
      const signer = createLocalSigner(k.privateKey);
      setKeys(k);
      setSigner(signer);
      setSignerMode("local");
      setStep("register");
    } catch {
      setKeyError("Invalid nsec key. Please check and try again.");
    }
  };

  const handleKeyGenerate = () => {
    const k = generateKeys();
    const signer = createLocalSigner(k.privateKey);
    setKeys(k);
    setSigner(signer);
    setSignerMode("local");
    setStep("save");
  };

  const copyToClipboard = (text: string, label: "nsec" | "npub") => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  };

  const downloadKeys = () => {
    if (!keys) return;
    const content = `NOSTR KEYS — KEEP THIS FILE SAFE\n\nPublic Key (npub):\n${keys.npub}\n\nPrivate Key (nsec) — NEVER SHARE THIS:\n${keys.nsec}\n\nGenerated: ${new Date().toISOString()}\n`;
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

      // Publish kind-0 profile to relay so other users can find us
      try {
        const signer = useAppStore.getState().signer;
        const profileContent = JSON.stringify({
          name: `${firstName} ${lastName}`,
          display_name: `${firstName} ${lastName}`,
        });
        if (signer) {
          const event = await createSignedEvent(signer, KIND_METADATA, profileContent, []);
          await pool.publish(event);
        } else if (keys.privateKey?.length > 0) {
          const event = createEvent(KIND_METADATA, profileContent, [], keys.privateKey);
          await pool.publish(event);
        }
      } catch (e) {
        console.warn("[register] Failed to publish profile:", e);
        // Non-fatal — registration still succeeded
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

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg-primary)" }}>
      <div className="w-full max-w-md p-8 rounded-2xl" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}>
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="text-5xl mb-4">⚡</div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
            Join Nostr Teams
          </h1>
          <p className="mt-2 text-sm" style={{ color: "var(--text-secondary)" }}>
            {step === "keys" ? "First, set up your Nostr identity" : "Complete your registration"}
          </p>
        </div>

        {step === "keys" ? (
          // Step 1: Key entry
          keyMode === "login" ? (
            <>
              {hasExtension && (
                <>
                  <button
                    onClick={handleNip07}
                    className="w-full py-3 rounded-lg font-medium text-sm transition-colors cursor-pointer"
                    style={{ background: "var(--accent)", color: "white" }}
                  >
                    🔑 Continue with Nostr Extension
                  </button>
                  <p className="mt-2 text-center text-xs" style={{ color: "var(--text-muted)" }}>
                    Recommended — your keys never leave the extension
                  </p>
                  <div className="my-5 flex items-center gap-3">
                    <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
                    <span className="text-xs" style={{ color: "var(--text-muted)" }}>or</span>
                    <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
                  </div>
                </>
              )}
              <div className="mb-4">
                <label className="block text-sm mb-2" style={{ color: "var(--text-secondary)" }}>
                  Enter your nsec key
                </label>
                <input
                  type="password"
                  value={nsecInput}
                  onChange={(e) => setNsecInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleKeyLogin()}
                  placeholder="nsec1..."
                  className="w-full px-4 py-3 rounded-lg text-sm outline-none"
                  style={inputStyle}
                />
                {keyError && <p className="mt-2 text-sm" style={{ color: "var(--danger)" }}>{keyError}</p>}
              </div>
              <button
                onClick={handleKeyLogin}
                className="w-full py-3 rounded-lg font-medium text-sm transition-colors cursor-pointer"
                style={{ background: "var(--accent)", color: "white" }}
              >
                Continue
              </button>
              <div className="mt-4 text-center">
                <button
                  onClick={() => setKeyMode("generate")}
                  className="text-sm underline cursor-pointer"
                  style={{ color: "var(--accent-light)" }}
                >
                  Don&apos;t have a key? Generate one
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="mb-6 p-4 rounded-lg" style={{ background: "var(--bg-tertiary)" }}>
                <p className="text-sm mb-3" style={{ color: "var(--warning)" }}>
                  ⚠️ A new NOSTR keypair will be generated. You&apos;ll be able to save your keys on the next screen.
                </p>
              </div>
              <button
                onClick={handleKeyGenerate}
                className="w-full py-3 rounded-lg font-medium text-sm transition-colors cursor-pointer"
                style={{ background: "var(--accent)", color: "white" }}
              >
                Generate New Keys
              </button>
              <div className="mt-4 text-center">
                <button
                  onClick={() => setKeyMode("login")}
                  className="text-sm underline cursor-pointer"
                  style={{ color: "var(--accent-light)" }}
                >
                  Already have a key? Sign in
                </button>
              </div>
            </>
          )
        ) : step === "save" ? (
          // Step 1.5: Save your keys
          <>
            <div className="mb-4 p-4 rounded-lg" style={{ background: "var(--bg-tertiary)", border: "1px solid var(--warning)" }}>
              <p className="text-sm font-medium mb-1" style={{ color: "var(--warning)" }}>
                ⚠️ Save your keys now!
              </p>
              <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                Your private key (nsec) is the <strong>only way</strong> to access your account. It cannot be recovered if lost.
              </p>
            </div>

            <div className="space-y-3 mb-4">
              <div>
                <label className="block text-xs mb-1 font-medium" style={{ color: "var(--text-secondary)" }}>Public Key (npub)</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    readOnly
                    value={keys?.npub || ""}
                    className="flex-1 px-3 py-2 rounded-lg text-xs outline-none font-mono"
                    style={inputStyle}
                  />
                  <button
                    onClick={() => keys && copyToClipboard(keys.npub, "npub")}
                    className="px-3 py-2 rounded-lg text-xs whitespace-nowrap cursor-pointer transition-colors"
                    style={{ background: copied === "npub" ? "var(--success)" : "var(--bg-tertiary)", color: copied === "npub" ? "white" : "var(--text-secondary)", border: "1px solid var(--border)" }}
                  >
                    {copied === "npub" ? "✓ Copied" : "Copy"}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs mb-1 font-medium" style={{ color: "var(--warning)" }}>Private Key (nsec) — never share this!</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    readOnly
                    value={keys?.nsec || ""}
                    className="flex-1 px-3 py-2 rounded-lg text-xs outline-none font-mono"
                    style={inputStyle}
                  />
                  <button
                    onClick={() => keys && copyToClipboard(keys.nsec, "nsec")}
                    className="px-3 py-2 rounded-lg text-xs whitespace-nowrap cursor-pointer transition-colors"
                    style={{ background: copied === "nsec" ? "var(--success)" : "var(--bg-tertiary)", color: copied === "nsec" ? "white" : "var(--text-secondary)", border: "1px solid var(--border)" }}
                  >
                    {copied === "nsec" ? "✓ Copied" : "Copy"}
                  </button>
                </div>
              </div>
            </div>

            <button
              onClick={downloadKeys}
              className="w-full py-2 mb-4 rounded-lg text-sm transition-colors cursor-pointer"
              style={{ background: "var(--bg-tertiary)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}
            >
              📥 Download Keys as Text File
            </button>

            <label className="flex items-center gap-2 mb-4 cursor-pointer">
              <input
                type="checkbox"
                checked={savedConfirmed}
                onChange={(e) => setSavedConfirmed(e.target.checked)}
                className="w-4 h-4 accent-current"
                style={{ accentColor: "var(--accent)" }}
              />
              <span className="text-sm" style={{ color: "var(--text-secondary)" }}>I have saved my keys somewhere safe</span>
            </label>

            <button
              onClick={() => setStep("register")}
              disabled={!savedConfirmed}
              className="w-full py-3 rounded-lg font-medium text-sm transition-colors cursor-pointer disabled:opacity-50"
              style={{ background: "var(--accent)", color: "white" }}
            >
              Continue to Registration
            </button>

            <div className="mt-4 text-center">
              <button
                onClick={() => { setStep("keys"); setKeys(null); setSavedConfirmed(false); }}
                className="text-sm underline cursor-pointer"
                style={{ color: "var(--accent-light)" }}
              >
                Start over
              </button>
            </div>
          </>
        ) : (
          // Step 2: Registration form
          <>
            {keys && (
              <div className="mb-4 p-3 rounded-lg text-xs break-all" style={{ background: "var(--bg-tertiary)", color: "var(--text-muted)" }}>
                <span style={{ color: "var(--text-secondary)" }}>Pubkey:</span> {keys.publicKey.slice(0, 16)}...{keys.publicKey.slice(-8)}
              </div>
            )}

            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm mb-1" style={{ color: "var(--text-secondary)" }}>First Name</label>
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="w-full px-4 py-3 rounded-lg text-sm outline-none"
                  style={inputStyle}
                />
              </div>
              <div>
                <label className="block text-sm mb-1" style={{ color: "var(--text-secondary)" }}>Last Name</label>
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="w-full px-4 py-3 rounded-lg text-sm outline-none"
                  style={inputStyle}
                />
              </div>
              <div>
                <label className="block text-sm mb-1" style={{ color: "var(--text-secondary)" }}>Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-3 rounded-lg text-sm outline-none"
                  style={inputStyle}
                />
              </div>
              <div>
                <label className="block text-sm mb-1" style={{ color: "var(--text-secondary)" }}>Invite Code</label>
                <input
                  type="text"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  placeholder="Leave blank if first user"
                  className="w-full px-4 py-3 rounded-lg text-sm outline-none"
                  style={inputStyle}
                />
              </div>
            </div>

            {regError && <p className="mb-4 text-sm" style={{ color: "var(--danger)" }}>{regError}</p>}

            <button
              onClick={handleRegister}
              disabled={submitting || !firstName || !lastName || !email}
              className="w-full py-3 rounded-lg font-medium text-sm transition-colors cursor-pointer disabled:opacity-50"
              style={{ background: "var(--accent)", color: "white" }}
            >
              {submitting ? "Registering..." : "Join Community"}
            </button>

            <div className="mt-4 text-center">
              <button
                onClick={() => { setStep("keys"); setKeys(null); }}
                className="text-sm underline cursor-pointer"
                style={{ color: "var(--accent-light)" }}
              >
                Use a different key
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
