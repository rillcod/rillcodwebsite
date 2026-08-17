"use client";

import type { ReactNode } from "react";
import { ThemeProvider } from "@/contexts/theme-context";
import { AuthProvider } from "@/contexts/auth-context";
import Navigation from "@/components/layout/Navigation";
import PublicFooter from "@/components/landing/Footer";
import PwaProvider from "@/components/pwa/PwaProvider";
import CapacitorBoot from "@/components/pwa/CapacitorBoot";
import PWAInstaller, { OfflineIndicator } from "@/components/PWAInstaller";
import PushSubscriptionManager from "@/components/pwa/PushSubscriptionManager";
import NativePushManager from "@/components/pwa/NativePushManager";
import PwaUpdateBanner from "@/components/pwa/PwaUpdateBanner";
import { Toaster } from "sonner";

import { usePathname } from "next/navigation";
import SmartWhatsAppWidget from "@/components/SmartWhatsAppWidget";
import { useIsNativeApp } from "@/hooks/useIsNativeApp";
import { hasPublicMarketingFooter, isAppUtilityRoute } from "@/lib/layout/public-route-policy";

export default function AppProviders({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isDashboard = pathname?.startsWith('/dashboard');
  const isNativeApp = useIsNativeApp();
  const showPublicFooter = !isDashboard && !isNativeApp && hasPublicMarketingFooter(pathname);

  /*
    Navigation's mobile dock is `fixed bottom-0`, so it sits on top of the
    document rather than in it. Nothing reserved the space it covers, and the
    last 64px of the page went underneath it — at 390x844 the footer's "Official
    Verified Node" badge was sliced in half with the page already scrolled to the
    bottom, so there was no way to reach it.

    These are the dock's own visibility conditions, repeated: it renders when
    Navigation renders (not native, not an app-utility route) and is `lg:hidden`.
    Tying the spacer to the same two facts is what stops it drifting out of sync
    and reserving space for a bar that is not there.
  */
  const showsMobileDock = !isNativeApp && !isAppUtilityRoute(pathname);

  return (
    <ThemeProvider>
      <AuthProvider>
        <CapacitorBoot />
        {!isNativeApp && <Navigation />}
        <PwaProvider enabled={isDashboard} />
        {isDashboard && <PWAInstaller />}
        {isDashboard && <PwaUpdateBanner enabled={isDashboard} />}
        <PushSubscriptionManager />
        <NativePushManager />
        <OfflineIndicator />
        {children}
        {showPublicFooter && <PublicFooter />}
        {showsMobileDock && (
          <div aria-hidden className="lg:hidden h-[var(--app-bottom-nav-height)]" />
        )}
        {!isDashboard && !isNativeApp && !isAppUtilityRoute(pathname) && (
          <SmartWhatsAppWidget />
        )}
        <Toaster richColors position="top-right" />
      </AuthProvider>
    </ThemeProvider>
  );
}
