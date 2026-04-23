"use client";

import { useEffect, useState } from "react";
import { ArrowPathIcon, XMarkIcon } from "@/lib/icons";

export default function PwaUpdateBanner({ enabled = true }: { enabled?: boolean }) {
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!enabled || typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    let mounted = true;
    const onControllerChange = () => {
      // New worker took control; reload to pull latest assets/UI.
      window.location.reload();
    };

    const trackRegistration = async () => {
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        if (!reg || !mounted) return;
        if (reg.waiting) setWaitingWorker(reg.waiting);

        reg.addEventListener("updatefound", () => {
          const sw = reg.installing;
          if (!sw) return;
          sw.addEventListener("statechange", () => {
            if (sw.state === "installed" && navigator.serviceWorker.controller) {
              setWaitingWorker(reg.waiting ?? sw);
              setDismissed(false);
            }
          });
        });
      } catch {
        // no-op
      }
    };

    trackRegistration();
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    return () => {
      mounted = false;
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, [enabled]);

  if (!enabled || !waitingWorker || dismissed) return null;

  const applyUpdate = () => {
    waitingWorker.postMessage({ type: "SKIP_WAITING" });
  };

  return (
    <div className="fixed bottom-32 left-4 right-4 sm:left-auto sm:right-6 sm:max-w-sm z-50">
      <div className="rounded-xl border border-cyan-500/40 bg-card/95 backdrop-blur-lg p-3 shadow-xl">
        <div className="flex items-start gap-2">
          <ArrowPathIcon className="w-4 h-4 text-cyan-300 mt-0.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-black text-foreground uppercase tracking-wide">Update available</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              A newer app version is ready. Refresh now to get latest fixes and content.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="p-1 rounded hover:bg-muted/50 text-muted-foreground"
            aria-label="Dismiss update banner"
          >
            <XMarkIcon className="w-4 h-4" />
          </button>
        </div>
        <button
          type="button"
          onClick={applyUpdate}
          className="mt-3 w-full min-h-[40px] rounded-lg border border-cyan-500/50 bg-cyan-500/15 text-cyan-200 text-[11px] font-black uppercase tracking-widest hover:bg-cyan-500/25 transition-colors"
        >
          Refresh to update
        </button>
      </div>
    </div>
  );
}

