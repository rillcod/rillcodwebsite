import DashboardNavigation from '@/components/layout/DashboardNavigation';
import DashboardShell from '@/components/layout/DashboardShell';
import CommandPalette from '@/components/layout/CommandPalette';
import PasswordChangeGuard from '@/components/layout/PasswordChangeGuard';
import DashboardErrorBoundary from '@/components/dashboard/DashboardErrorBoundary';
import SystemStatusBanners from '@/components/dashboard/SystemStatusBanners';
import SessionExpiryWrapper from '@/components/dashboard/SessionExpiryWrapper';
import PopupNotificationContainer from '@/components/notifications/PopupNotificationContainer';
import { Suspense } from 'react';
import Script from 'next/script';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col md:flex-row min-h-screen md:h-screen md:overflow-hidden bg-background text-gray-100 font-sans print:h-auto print:min-h-0 print:bg-white print:text-black">
      {/* Force-password-change guard — renders a blocking modal for bulk-registered students */}
      <PasswordChangeGuard />

      {/* System maintenance overlay + force-refresh banner (Req 11) */}
      <SystemStatusBanners />

      {/* Session expiry banner — non-blocking, triggers silent refresh (Req 16) */}
      <SessionExpiryWrapper />

      <div className="print:hidden h-full flex flex-col">
        <Suspense fallback={<div className="w-64 h-full bg-background" />}>
          <DashboardNavigation />
        </Suspense>
      </div>

      {/* Main Content Area — wrapped in ErrorBoundary (Req 9.1) */}
      <DashboardShell>
        <DashboardErrorBoundary>
          {children}
        </DashboardErrorBoundary>
      </DashboardShell>

      {/* Global Dashboard Overlays */}
      <PopupNotificationContainer />
      <CommandPalette />

      {/* Puter.js — free-tier AI SDK (browser only, no API key needed) */}
      <Script src="https://js.puter.com/v2/" strategy="lazyOnload" />
    </div>
  );
}