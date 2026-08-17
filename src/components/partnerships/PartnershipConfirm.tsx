"use client";

/**
 * A confirmation the phone can actually show.
 *
 * `window.confirm` is silent in the native WebView — the tap looks like it
 * did nothing. This is the same question, as a bottom sheet, with 48px
 * targets and the safe-area padding the rest of the app already uses.
 */

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
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4"
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
      <div className="relative w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl bg-card border border-border p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-xl">
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
  );
}
