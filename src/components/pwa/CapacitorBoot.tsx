"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";

/**
 * Native shell boot: status bar, splash hide, Android back button, safe-area class.
 * No-ops in browser / PWA.
 */
export default function CapacitorBoot() {
  useEffect(() => {
    if (typeof window === "undefined" || !Capacitor.isNativePlatform()) return;

    document.documentElement.classList.add("capacitor");

    let removeBack: (() => void) | undefined;

    const boot = async () => {
      try {
        const { StatusBar, Style } = await import("@capacitor/status-bar");
        // Style.Light = light icons/text on dark brand chrome
        await StatusBar.setStyle({ style: Style.Light });
        await StatusBar.setBackgroundColor({ color: "#0f0f1a" });
      } catch {
        // plugin may be unavailable on some builds
      }

      try {
        const { SplashScreen } = await import("@capacitor/splash-screen");
        // Let first paint settle, then fade splash for a polished start.
        window.setTimeout(() => {
          void SplashScreen.hide({ fadeOutDuration: 350 });
        }, 450);
      } catch {
        // ignore
      }

      try {
        const { App } = await import("@capacitor/app");
        const handle = await App.addListener("backButton", ({ canGoBack }) => {
          // Give drawers, sheets, and other transient app UI the first chance to close.
          const nativeBack = new Event("rillcod:native-back", { cancelable: true });
          window.dispatchEvent(nativeBack);
          if (nativeBack.defaultPrevented) return;

          // Accessible dialogs already understand Escape, so Back closes them first.
          const openDialog = document.querySelector<HTMLElement>('[role="dialog"], dialog[open], [data-state="open"]');
          if (openDialog) {
            document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true }));
            return;
          }

          if (canGoBack || window.history.length > 1) {
            window.history.back();
          } else {
            void App.exitApp();
          }
        });
        removeBack = () => {
          void handle.remove();
        };
      } catch {
        // ignore
      }
    };

    void boot();

    return () => {
      removeBack?.();
      document.documentElement.classList.remove("capacitor");
    };
  }, []);

  return null;
}
