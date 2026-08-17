"use client";

/**
 * A confirmation the phone can actually show.
 *
 * `window.confirm` is silent in the native WebView — the tap looks like it
 * did nothing. This is the same question, as a bottom sheet, with 48px
 * targets. It portals to `document.body` so `.app-page-main`'s overflow
 * cannot clip it, and it sits above the dashboard dock (`z-50`) instead of
 * sliding under it.
 */

import { useEffect } from "react";
import BodyPortal, { useOverlayScrollLock } from "@/components/ui/BodyPortal";

export function PartnershipConfirm({
  open,
  title,
  body,
  confirmLabel,
  busy,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}) {
  useOverlayScrollLock(open);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onCancel();
    };
    const onBack = (event: Event) => {
      event.preventDefault();
      if (!busy) onCancel();
    };
    document.addEventListener("keydown", onKey);
    window.addEventListener("rillcod:native-back", onBack);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("rillcod:native-back", onBack);
    };
  }, [open, busy, onCancel]);

  if (!open) return null;

  return (
    <BodyPortal>
      <div
        className="fixed inset-0 z-[120] flex items-end justify-center bg-black/50 p-0 pb-[var(--app-bottom-nav-height)] md:items-center md:p-4 md:pb-4"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="partnership-confirm-title"
      >
        <button
          type="button"
          className="absolute inset-0"
          aria-label="Cancel"
          onClick={onCancel}
          disabled={busy}
        />
        <div className="relative w-full max-h-[min(70dvh,calc(100dvh-var(--app-bottom-nav-height)-1rem))] overflow-y-auto md:max-w-md md:max-h-[min(70dvh,calc(100dvh-2rem))] rounded-t-2xl md:rounded-2xl bg-card border border-border p-4 shadow-xl">
          <h3 id="partnership-confirm-title" className="text-base font-bold text-foreground">
            {title}
          </h3>
          <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{body}</p>
          <div className="grid grid-cols-2 gap-2 mt-4">
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className="min-h-[48px] rounded-xl border border-border text-foreground text-sm font-bold disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void onConfirm()}
              disabled={busy}
              className="min-h-[48px] rounded-xl bg-destructive text-destructive-foreground text-sm font-bold disabled:opacity-50"
            >
              {busy ? "Working…" : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </BodyPortal>
  );
}
