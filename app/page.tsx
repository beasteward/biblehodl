"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAppStore } from "./lib/store";
import LoginScreen from "./components/auth/LoginScreen";
import AppShell from "./components/layout/AppShell";

export default function Home() {
  const router = useRouter();
  const keys = useAppStore((s) => s.keys);
  const isRegistered = useAppStore((s) => s.isRegistered);
  const setIsRegistered = useAppStore((s) => s.setIsRegistered);
  const setMemberProfile = useAppStore((s) => s.setMemberProfile);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (!keys || isRegistered) return;

    setChecking(true);
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
  }, [keys, isRegistered, router, setIsRegistered, setMemberProfile]);

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
