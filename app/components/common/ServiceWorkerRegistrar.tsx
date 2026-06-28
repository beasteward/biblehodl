"use client";

import { useEffect } from "react";
import { useAppStore } from "../../lib/store";

/**
 * Registers the PWA service worker once on the client and bridges SW → app
 * navigation messages (notification clicks). Mounted high in the tree (layout)
 * so it runs regardless of auth state.
 *
 * Registration is intentionally side-effect only: the actual push-subscription
 * lifecycle lives in `lib/notifications.ts` and is driven by the user opting in.
 */
export default function ServiceWorkerRegistrar() {
  const setCurrentView = useAppStore((s) => s.setCurrentView);
  const setActiveChannelId = useAppStore((s) => s.setActiveChannelId);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    let cancelled = false;

    const register = async () => {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
        });
        // Proactively check for an updated SW on load.
        reg.update().catch(() => {});
      } catch (err) {
        console.warn("[pwa] service worker registration failed:", err);
      }
    };

    // Translate a notification click (posted by the SW) into in-app navigation.
    const onMessage = (event: MessageEvent) => {
      if (cancelled) return;
      const data = event.data;
      if (!data || data.type !== "NOTIFICATION_CLICK") return;
      try {
        const url = new URL(data.url, window.location.origin);
        const view = url.searchParams.get("view");
        const channel = url.searchParams.get("channel");
        if (view) setCurrentView(view as never);
        if (channel) setActiveChannelId(channel);
      } catch {
        /* ignore malformed deep-link */
      }
    };

    register();
    navigator.serviceWorker.addEventListener("message", onMessage);

    return () => {
      cancelled = true;
      navigator.serviceWorker.removeEventListener("message", onMessage);
    };
  }, [setCurrentView, setActiveChannelId]);

  return null;
}
