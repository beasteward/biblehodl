"use client";

import { useEffect, useState } from "react";

// `beforeinstallprompt` isn't in the standard DOM lib types.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "bibleh…install";

/**
 * Android (Chromium) one-tap install button.
 *
 * Chrome fires `beforeinstallprompt` when the PWA meets install criteria
 * (HTTPS + manifest + service worker + icons). We stash the event and surface a
 * button; tapping it calls the native prompt. The button hides when the app is
 * already installed, after install, or once the user dismisses it.
 *
 * iOS/Safari never fires this event (install is a manual Share → Add to Home
 * Screen flow), so the button simply won't render there — handled by the
 * separate hint, not here.
 */
export default function InstallButton() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Already running as an installed PWA → never show.
    const isStandalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      // iOS standalone flag
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    if (isStandalone) return;

    if (localStorage.getItem(DISMISS_KEY) === "1") return;

    const onPrompt = (e: Event) => {
      e.preventDefault(); // stop Chrome's default mini-infobar
      setDeferred(e as BeforeInstallPromptEvent);
      setHidden(false);
    };
    const onInstalled = () => {
      setHidden(true);
      setDeferred(null);
    };

    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (hidden || !deferred) return null;

  const install = async () => {
    try {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      if (choice.outcome === "accepted") {
        setHidden(true);
      }
    } catch {
      /* ignore */
    } finally {
      // A prompt can only be used once; drop it regardless of outcome.
      setDeferred(null);
    }
  };

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, "1");
    setHidden(true);
  };

  return (
    <div
      className="flex items-center gap-2 px-4 py-3"
      style={{ borderTop: "1px solid var(--border)", background: "var(--bg-tertiary)" }}
    >
      <button
        onClick={install}
        className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold"
        style={{ background: "var(--accent)", color: "#fff" }}
      >
        <span className="text-base leading-none">📲</span>
        Install app
      </button>
      <button
        onClick={dismiss}
        aria-label="Dismiss install"
        className="w-8 h-8 flex items-center justify-center rounded-lg text-base shrink-0"
        style={{ color: "var(--text-muted)" }}
      >
        ✕
      </button>
    </div>
  );
}
