"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAppStore } from "./lib/store";
import { createNip07Signer, waitForNip07Extension, getNip07PublicKey } from "./lib/signer";
import { authFetch } from "./lib/http-auth";
import LoginScreen from "./components/auth/LoginScreen";
import UnlockScreen from "./components/auth/UnlockScreen";
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

  // Restore signer on reload from persisted signerMode.
  // NIP-07: recreate from the extension. Local: require passphrase via UnlockScreen.
  useEffect(() => {
    if (signer || !keys || signerMode !== "nip07") return;

    let cancelled = false;
    const clearStaleSession = () => {
      if (cancelled) return;
      setKeys(null);
      setSignerMode(null);
      setIsRegistered(false);
    };

    (async () => {
      // Wait for async injection before deciding the extension is gone —
      // otherwise a slow inject would falsely log the user out on reload.
      const available = await waitForNip07Extension();
      if (cancelled) return;
      if (!available) {
        clearStaleSession();
        return;
      }
      try {
        const pubkey = await getNip07PublicKey();
        if (cancelled) return;
        setSigner(createNip07Signer(pubkey));
      } catch {
        clearStaleSession();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [signer, keys, signerMode, setSigner, setKeys, setSignerMode, setIsRegistered]);

  // Registration status is NEVER trusted from the persisted cache — it is
  // always verified against the server at login. After a data wipe a stale
  // `isRegistered` must not grant access to a now-deleted account, and a failed
  // check must NOT silently let the user in.
  const [checkedThisSession, setCheckedThisSession] = useState(false);
  const [checkError, setCheckError] = useState(false);

  const runRegistrationCheck = useCallback(() => {
    if (!keys || !signer) return;
    setChecking(true);
    setCheckError(false);
    authFetch(signer, "/api/auth/check")
      .then((res) => {
        if (!res.ok) throw new Error(`auth check failed: ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (data.registered && data.member) {
          setMemberProfile({
            firstName: data.member.firstName,
            lastName: data.member.lastName,
            email: data.member.email,
            role: data.member.role,
          });
          setIsRegistered(true);
        } else {
          // Not registered server-side → onboarding. Never fall through to app.
          setMemberProfile(null);
          setIsRegistered(false);
          router.push("/join");
        }
      })
      .catch(() => {
        // Trust the server, not the cache: on failure deny access and offer a
        // retry rather than granting entry to an unverified session.
        setMemberProfile(null);
        setIsRegistered(false);
        setCheckError(true);
      })
      .finally(() => setChecking(false));
  }, [keys, signer, router, setIsRegistered, setMemberProfile]);

  useEffect(() => {
    if (!keys || !signer || checkedThisSession) return;
    setCheckedThisSession(true);
    runRegistrationCheck();
  }, [keys, signer, checkedThisSession, runRegistrationCheck]);

  if (!keys) return <LoginScreen />;

  // Local session restored from storage but not yet unlocked.
  if (signerMode === "local" && !signer) return <UnlockScreen />;

  // NIP-07 session restored from storage; reconnecting to the extension.
  // Gate the app here so it never mounts against a null signer (isRegistered
  // is persisted, so without this it would fall through to <AppShell />).
  if (signerMode === "nip07" && !signer) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg-primary)" }}>
        <div className="text-center">
          <div className="text-4xl mb-4">🔑</div>
          <p style={{ color: "var(--text-secondary)" }}>Connecting to your Nostr extension…</p>
        </div>
      </div>
    );
  }

  if (checkError) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg-primary)" }}>
        <div className="text-center max-w-sm px-6">
          <div className="text-4xl mb-4">⚠️</div>
          <p className="mb-4" style={{ color: "var(--text-secondary)" }}>
            Couldn&apos;t verify your registration. Check your connection and try again.
          </p>
          <button
            onClick={runRegistrationCheck}
            className="px-4 py-2 rounded-md font-medium"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

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
