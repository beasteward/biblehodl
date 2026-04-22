"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAppStore } from "../lib/store";
import { generateKeys, keysFromNsec } from "../lib/nostr";

export default function JoinPage() {
  const router = useRouter();
  const keys = useAppStore((s) => s.keys);
  const setKeys = useAppStore((s) => s.setKeys);
  const setIsRegistered = useAppStore((s) => s.setIsRegistered);
  const setMemberProfile = useAppStore((s) => s.setMemberProfile);

  const [step, setStep] = useState<"keys" | "register">(keys ? "register" : "keys");
  const [nsecInput, setNsecInput] = useState("");
  const [keyError, setKeyError] = useState("");
  const [keyMode, setKeyMode] = useState<"login" | "generate">("login");

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [regError, setRegError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleKeyLogin = () => {
    try {
      setKeyError("");
      const k = keysFromNsec(nsecInput.trim());
      setKeys(k);
      setStep("register");
    } catch {
      setKeyError("Invalid nsec key. Please check and try again.");
    }
  };

  const handleKeyGenerate = () => {
    const k = generateKeys();
    setKeys(k);
    setStep("register");
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
      setMemberProfile({ firstName, lastName, email });
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
                  ⚠️ A new NOSTR keypair will be generated. <strong>Save your nsec key</strong> — it cannot be recovered!
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
