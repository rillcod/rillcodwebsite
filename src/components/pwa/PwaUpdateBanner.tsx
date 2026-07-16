"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowPathIcon, XMarkIcon } from "@/lib/icons";
import { hardRefreshApp } from "@/lib/pwa/hard-refresh";

export default function PwaUpdateBanner({ enabled = true }: { enabled?: boolean }) {
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [applying, setApplying] = useState(false);
  const reloadArmed = useRef(false);

  useEffect(() => {
    if (!enabled || typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    let mounted = true;

    const onControllerChange = () => {
      if (!reloadArmed.current) return;
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

        // Periodically check for updates while the dashboard is open
        const tick = () => {
          reg.update().catch(() => {});
        };
        tick();
        const id = window.setInterval(tick, 5 * 60 * 1000);
        return () => window.clearInterval(id);
      } catch {
        return undefined;
      }
    };

    let clearUpdatePoll: (() => void) | undefined;
    trackRegistration().then((cleanup) => {
      clearUpdatePoll = cleanup;
    });

    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    return () => {
      mounted = false;
      clearUpdatePoll?.();
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, [enabled]);

  if (!enabled || !waitingWorker || dismissed) return null;

  const applyUpdate = async () => {
    if (applying) return;
    setApplying(true);
    reloadArmed.current = true;

    try {
      waitingWorker.postMessage({ type: "SKIP_WAITING" });
      waitingWorker.postMessage({ type: "skipWaiting" });
    } catch {
      // ignore — hard refresh below is the reliable path
    }

    // Give skipWaiting a brief window to activate; then force a clean reload.
    window.setTimeout(() => {
      void hardRefreshApp();
    }, 350);
  };

  return (
    <div className="fixed bottom-[calc(var(--app-bottom-nav-height)+4rem)] left-4 right-4 sm:left-auto sm:right-6 sm:max-w-sm z-[60]">
      <div className="rounded-xl border border-cyan-500/40 bg-card/95 backdrop-blur-lg p-3 shadow-xl">
        <div className="flex items-start gap-2">
          <ArrowPathIcon className={`w-4 h-4 text-cyan-300 mt-0.5 shrink-0 ${applying ? "animate-spin" : ""}`} />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-black text-foreground uppercase tracking-wide">Update available</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              A newer app version is ready. Refresh now to get latest fixes and content.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            disabled={applying}
            className="p-1 rounded hover:bg-muted/50 text-muted-foreground disabled:opacity-50"
            aria-label="Dismiss update banner"
          >
            <XMarkIcon className="w-4 h-4" />
          </button>
        </div>
        <button
          type="button"
          onClick={() => void applyUpdate()}
          disabled={applying}
          className="mt-3 w-full min-h-[44px] rounded-lg border border-cyan-500/50 bg-cyan-500/15 text-cyan-200 text-[11px] font-black uppercase tracking-widest hover:bg-cyan-500/25 transition-colors disabled:opacity-60 touch-manipulation"
        >
          {applying ? "Updating…" : "Refresh to update"}
        </button>
      </div>
    </div>
  );
}
