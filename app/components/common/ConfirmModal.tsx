"use client";

import { useEffect } from "react";

interface ConfirmModalProps {
  open: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export default function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  busy = false,
  onConfirm,
  onClose,
}: ConfirmModalProps) {
  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, busy, onClose]);

  if (!open) return null;

  const confirmBg = danger ? "var(--danger)" : "var(--accent)";

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50"
      onClick={() => !busy && onClose()}
    >
      <div
        className="rounded-lg p-6 w-full max-w-sm shadow-xl"
        style={{ background: "var(--bg-secondary)", color: "var(--text-primary)" }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <h2 className="text-lg font-semibold mb-2">{title}</h2>
        {message && (
          <p className="text-sm mb-4" style={{ color: "var(--text-muted)" }}>
            {message}
          </p>
        )}
        <div className="flex justify-end gap-2 mt-4">
          <button
            onClick={onClose}
            disabled={busy}
            className="px-4 py-2 rounded text-sm disabled:opacity-50"
            style={{ color: "var(--text-muted)" }}
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className="px-4 py-2 rounded text-sm font-medium disabled:opacity-50"
            style={{ background: confirmBg, color: "white" }}
          >
            {busy ? "..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
