"use client";

import type { ReactNode } from "react";
import { ThemeProvider } from "@/contexts/theme-context";
import { AuthProvider } from "@/contexts/auth-context";
import Navigation from "@/components/layout/Navigation";
import PwaProvider from "@/components/pwa/PwaProvider";
import CapacitorBoot from "@/components/pwa/CapacitorBoot";
import PWAInstaller, { OfflineIndicator } from "@/components/PWAInstaller";
import PushSubscriptionManager from "@/components/pwa/PushSubscriptionManager";
import NativePushManager from "@/components/pwa/NativePushManager";
import PwaUpdateBanner from "@/components/pwa/PwaUpdateBanner";
import { Toaster } from "sonner";

import { usePathname } from "next/navigation";
import SmartWhatsAppWidget from "@/components/SmartWhatsAppWidget";

export default function AppProviders({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isDashboard = pathname?.startsWith('/dashboard');

  return (
    <ThemeProvider>
      <AuthProvider>
        <CapacitorBoot />
        <Navigation />
        <PwaProvider enabled={isDashboard} />
        {isDashboard && <PWAInstaller />}
        {isDashboard && <PwaUpdateBanner enabled={isDashboard} />}
        <PushSubscriptionManager />
        <NativePushManager />
        <OfflineIndicator />
        {children}
        {!isDashboard && <SmartWhatsAppWidget />}
        <Toaster richColors position="top-right" />
      </AuthProvider>
    </ThemeProvider>
  );
}
