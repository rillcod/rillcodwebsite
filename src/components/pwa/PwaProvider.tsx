"use client";

import { useEffect, useState } from "react";

export default function PwaProvider() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleBeforeInstallPrompt = (event: any) => {
      event.preventDefault();
      setDeferredPrompt(event);
      window.dispatchEvent(new CustomEvent("pwa:installable"));
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Silent: offline support is best-effort.
      });
    }

    const promptPushPermission = async () => {
      if (!("Notification" in window)) return;
      const asked = window.localStorage.getItem("push-permission-asked");
      if (asked) return;
      window.localStorage.setItem("push-permission-asked", "1");
      try {
        await Notification.requestPermission();
      } catch {
        // Ignore permission errors
      }
    };

    promptPushPermission();

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  useEffect(() => {
    if (!deferredPrompt) return;
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
  }, [deferredPrompt]);

  return null;
}
