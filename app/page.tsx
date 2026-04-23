"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAppStore } from "./lib/store";
import { createLocalSigner, createNip07Signer, hasNip07Extension, getNip07PublicKey } from "./lib/signer";
import LoginScreen from "./components/auth/LoginScreen";
import AppShell from "./components/layout/AppShell";

export default function Home() {
  const router = useRouter();
  const keys = useAppStore((s) => s.keys);
  const signer = useAppStore((s) => s.signer);
  const setSigner = useAppStore((s) => s.setSigner);
  const signerMode = useAppStore((s) => s.signerMode);
  const setKeys = useAppStore((s) => s.setKeys);
  const setSignerMode = useAppStore((s) => s.setSignerMode);
  const isRegistered = useAppStore((s) => s.isRegistered);
  const setIsRegistered = useAppStore((s) => s.setIsRegistered);
  const setMemberProfile = useAppStore((s) => s.setMemberProfile);
  const [checking, setChecking] = useState(false);

  // Restore signer on reload from persisted signerMode
  useEffect(() => {
    if (signer || !keys || !signerMode) return;

    if (signerMode === "nip07") {
      if (hasNip07Extension()) {
        getNip07PublicKey()
          .then((pubkey) => setSigner(createNip07Signer(pubkey)))
          .catch(() => {
            // Extension gone — clear auth state
            setKeys(null);
            setSignerMode(null);
            setIsRegistered(false);
          });
      } else {
        // Extension not available — clear auth
        setKeys(null);
        setSignerMode(null);
        setIsRegistered(false);
      }
    } else if (signerMode === "local" && keys.privateKey?.length > 0) {
      setSigner(createLocalSigner(keys.privateKey));
    }
  }, [signer, keys, signerMode, setSigner, setKeys, setSignerMode, setIsRegistered]);

  // Always check registration on mount to refresh profile (role, etc.)
  const [checkedThisSession, setCheckedThisSession] = useState(false);

  useEffect(() => {
    if (!keys || checkedThisSession) return;

    setChecking(true);
    setCheckedThisSession(true);
    fetch("/api/auth/check", {
      headers: { "x-pubkey": keys.publicKey },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.registered) {
          setIsRegistered(true);
          setMemberProfile({
            firstName: data.member.firstName,
            lastName: data.member.lastName,
            email: data.member.email,
            role: data.member.role,
          });
        } else {
          router.push("/join");
        }
      })
      .catch(() => {
        // If check fails, let them through (graceful degradation)
        setIsRegistered(true);
      })
      .finally(() => setChecking(false));
  }, [keys, checkedThisSession, router, setIsRegistered, setMemberProfile]);

  if (!keys) return <LoginScreen />;

  if (checking || (!isRegistered && keys)) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg-primary)" }}>
        <div className="text-center">
          <div className="text-4xl mb-4">⚡</div>
          <p style={{ color: "var(--text-secondary)" }}>Checking registration...</p>
        </div>
      </div>
    );
  }

  return <AppShell />;
}
