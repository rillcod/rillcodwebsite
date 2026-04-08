"use client";

import type { ReactNode } from "react";
import { ThemeProvider } from "@/contexts/theme-context";
import { AuthProvider } from "@/contexts/auth-context";
import Navigation from "@/components/layout/Navigation";
import PwaProvider from "@/components/pwa/PwaProvider";
import PWAInstaller, { OfflineIndicator } from "@/components/PWAInstaller";
import PushSubscriptionManager from "@/components/pwa/PushSubscriptionManager";
import { Toaster } from "sonner";

import { usePathname } from "next/navigation";
import WhatsAppButton from "@/components/WhatsAppButton";

export default function AppProviders({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isDashboard = pathname?.startsWith('/dashboard');

  return (
    <ThemeProvider>
      <AuthProvider>
        <Navigation />
        <PwaProvider />
        <PWAInstaller />
        <PushSubscriptionManager />
        <OfflineIndicator />
        {children}
        {!isDashboard && <WhatsAppButton />}
        <Toaster richColors position="top-right" />
      </AuthProvider>
    </ThemeProvider>
  );
}
