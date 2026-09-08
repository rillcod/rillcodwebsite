"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Capacitor } from "@capacitor/core";

import {
  isNativeDestination,
  pushRouteToStack,
  performSmartBack,
} from "@/lib/navigation/smart-back";

export default function CapacitorBoot() {
  const pathname = usePathname();
  const router = useRouter();
  const pathnameRef = useRef(pathname || '/login');
  const lastBackPressRef = useRef(0);

  useEffect(() => {
    pathnameRef.current = pathname || '/login';
    if (typeof window === 'undefined' || !Capacitor.isNativePlatform()) return;

    // The native shell has no marketing-site root. A stale browser-history entry
    // for `/` always returns to the portal entry point; middleware sends an active
    // session straight on to its dashboard.
    if (pathname === '/') {
      router.replace('/login');
      return;
    }

    if (!pathname || !isNativeDestination(pathname)) return;
    pushRouteToStack(pathname);
  }, [pathname, router]);

  useEffect(() => {
    if (typeof window === "undefined" || !Capacitor.isNativePlatform()) return;

    document.documentElement.classList.add("capacitor");

    let removeBack: (() => void) | undefined;
    let removeDeepLink: (() => void) | undefined;

    const originalWindowOpen = window.open.bind(window);
    window.open = ((url?: string | URL, target?: string, features?: string) => {
      const value = typeof url === 'string' ? url : url?.toString();
      if (value) {
        try {
          const parsed = new URL(value, window.location.origin);
          const isWebUrl = ['http:', 'https:'].includes(parsed.protocol);
          const isTrustedAppHost = ['rillcod.com', 'www.rillcod.com', window.location.hostname].includes(parsed.hostname);
          const shouldLeaveNativeShell = isWebUrl && (!isTrustedAppHost || !isNativeDestination(parsed.pathname));
          if (shouldLeaveNativeShell) {
            void import('@capacitor/browser').then(({ Browser }) => Browser.open({ url: parsed.toString(), presentationStyle: 'popover' }));
            return null;
          }
        } catch { /* preserve normal browser behavior for malformed or blank print windows */ }
      }
      return originalWindowOpen(url as string | URL | undefined, target, features);
    }) as typeof window.open;
    const restoreWindowOpen = () => { window.open = originalWindowOpen; };

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
        const handle = await App.addListener("backButton", () => {
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

          const currentPath = pathnameRef.current || window.location.pathname;
          const isAppRoot = currentPath === "/dashboard" || currentPath === "/login" || currentPath === "/";
          if (isAppRoot) {
            const now = Date.now();
            if (now - lastBackPressRef.current < 2000) {
              void App.exitApp();
              return;
            }
            lastBackPressRef.current = now;
            toast.message("Press back again to exit");
            return;
          }

          performSmartBack(router, currentPath);
        });
        removeBack = () => {
          void handle.remove();
        };

        const deepLinkHandle = await App.addListener("appUrlOpen", async ({ url }) => {
          try {
            const parsed = new URL(url);
            const isCustomScheme = parsed.protocol === "rillcod:";
            const isTrustedWebLink = parsed.protocol === "https:" && ["rillcod.com", "www.rillcod.com"].includes(parsed.hostname);
            if (!isCustomScheme && !isTrustedWebLink) return;

            const path = isCustomScheme
              ? `/${parsed.hostname}${parsed.pathname}`
              : parsed.pathname;
            const normalizedPath = path.replace(/\/+/g, "/");
            const destination = `${normalizedPath}${parsed.search}${parsed.hash}`;
            if (!destination.startsWith("/") || !isNativeDestination(normalizedPath)) {
              if (isTrustedWebLink) {
                const { Browser } = await import('@capacitor/browser');
                await Browser.open({ url: parsed.toString(), presentationStyle: 'popover' });
              }
              return;
            }
            window.location.assign(destination);
          } catch {
            // Ignore malformed or untrusted deep links.
          }
        });
        removeDeepLink = () => {
          void deepLinkHandle.remove();
        };
      } catch {
        // ignore
      }
    };

    void boot();

    return () => {
      removeBack?.();
      removeDeepLink?.();
      restoreWindowOpen?.();
      document.documentElement.classList.remove("capacitor");
    };
  }, [router]);

  return null;
}
