"use client";

import { useCallback, useEffect, useState } from "react";
import { useAppStore } from "../../lib/store";
import {
  isPushSupported,
  notificationPermission,
  notificationsPref,
  setNotificationsPref,
  enablePushNotifications,
  disablePushNotifications,
} from "../../lib/notifications";

/**
 * Per-user notification switch. Lives in the sidebar footer.
 *
 * "On" means: browser permission granted AND the app-level preference is on.
 * Enabling also best-effort registers a Web Push subscription (for server-sent
 * notifications like channel adds); message notifications work with permission
 * alone, so the toggle stays "on" even on deployments without VAPID configured.
 */
export default function NotificationToggle() {
  const signer = useAppStore((s) => s.signer);
  const [supported, setSupported] = useState(true);
  const [on, setOn] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const sup = isPushSupported();
    setSupported(sup);
    if (!sup) return;
    const perm = notificationPermission();
    setBlocked(perm === "denied");
    // With permission granted + pref on, local message notifications work
    // regardless of whether a server push subscription exists.
    setOn(perm === "granted" && notificationsPref());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const toggle = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (on) {
        setNotificationsPref(false);
        if (signer) await disablePushNotifications(signer).catch(() => {});
        setOn(false);
      } else {
        setNotificationsPref(true);
        // Requests permission (if needed) + best-effort push subscribe.
        if (signer) await enablePushNotifications(signer).catch(() => {});
        await refresh();
      }
    } finally {
      setBusy(false);
    }
  }, [busy, on, signer, refresh]);

  if (!supported) {
    return (
      <div className="px-4 py-3 text-xs" style={{ color: "var(--text-muted)" }}>
        🔕 Notifications not supported on this browser
      </div>
    );
  }

  return (
    <div
      className="flex items-center justify-between px-4 py-3"
      style={{ borderTop: "1px solid var(--border)" }}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-base leading-none">{on ? "🔔" : "🔕"}</span>
        <div className="min-w-0">
          <div className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
            Notifications
          </div>
          <div className="text-[11px] leading-tight" style={{ color: "var(--text-muted)" }}>
            {blocked
              ? "Blocked — enable in browser settings"
              : on
              ? "On for messages & invites"
              : "Off"}
          </div>
        </div>
      </div>
      <button
        onClick={toggle}
        disabled={busy || blocked}
        aria-pressed={on}
        aria-label="Toggle notifications"
        className="relative w-11 h-6 rounded-full shrink-0 transition-colors disabled:opacity-50"
        style={{ background: on ? "var(--accent)" : "var(--bg-tertiary)" }}
      >
        <span
          className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform"
          style={{ transform: on ? "translateX(20px)" : "translateX(0)" }}
        />
      </button>
    </div>
  );
}
