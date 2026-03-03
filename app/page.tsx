"use client";

import { useAppStore } from "./lib/store";
import LoginScreen from "./components/auth/LoginScreen";
import AppShell from "./components/layout/AppShell";

export default function Home() {
  const keys = useAppStore((s) => s.keys);

  if (!keys) return <LoginScreen />;
  return <AppShell />;
}
