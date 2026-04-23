"use client";

import { useEffect, useState } from "react";

export default function PwaProvider({ enabled = true }: { enabled?: boolean }) {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !enabled) return;

    const handleBeforeInstallPrompt = (event: any) => {
      event.preventDefault();
      setDeferredPrompt(event);
      window.dispatchEvent(new CustomEvent("pwa:installable"));
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !deferredPrompt) return;
    // Auto-prompt is discouraged; expose a global helper instead.
    (window as any).installPwa = async () => {
      try {
        deferredPrompt.prompt();
        await deferredPrompt.userChoice;
        setDeferredPrompt(null);
      } catch {
        // no-op
      }
    };
  }, [deferredPrompt, enabled]);

  return null;
}
