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
import { hasPublicMarketingFooter } from "@/lib/layout/public-route-policy";

export default function AppProviders({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isDashboard = pathname?.startsWith('/dashboard');
  const isNativeApp = useIsNativeApp();
  const showPublicFooter = !isDashboard && !isNativeApp && hasPublicMarketingFooter(pathname);

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
        {!isDashboard && !isNativeApp && <SmartWhatsAppWidget />}
        <Toaster richColors position="top-right" />
      </AuthProvider>
    </ThemeProvider>
  );
}
