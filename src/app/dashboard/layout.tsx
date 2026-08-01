import DashboardNavigation from '@/components/layout/DashboardNavigation';
import DashboardAccessGuard from '@/components/layout/DashboardAccessGuard';
import DashboardShell from '@/components/layout/DashboardShell';
import CommandPalette from '@/components/layout/CommandPalette';
import PasswordChangeGuard from '@/components/layout/PasswordChangeGuard';
import RoleSimBanner from '@/components/layout/RoleSimBanner';
import DashboardErrorBoundary from '@/components/dashboard/DashboardErrorBoundary';
import SystemStatusBanners from '@/components/dashboard/SystemStatusBanners';
import SessionExpiryWrapper from '@/components/dashboard/SessionExpiryWrapper';
import PopupNotificationContainer from '@/components/notifications/PopupNotificationContainer';
import LiveSessionWatcher from '@/components/dashboard/LiveSessionWatcher';
import { AcademicYearProvider } from '@/contexts/academic-year-context';
import { Suspense } from 'react';
import Script from 'next/script';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AcademicYearProvider>
    <div className="flex flex-col min-h-screen md:h-screen md:overflow-hidden bg-background text-foreground font-sans print:h-auto print:min-h-0 print:bg-card print:text-foreground overflow-x-clip">
      {/* Role-simulation banner — only renders when a staff user is previewing
          the app as a different role. Server RBAC is unaffected. */}
      <RoleSimBanner />

      <div className="flex flex-col md:flex-row flex-1 min-h-0">
      {/* Force-password-change guard — renders a blocking modal for bulk-registered students */}
      <PasswordChangeGuard />

      {/* System maintenance overlay + force-refresh banner (Req 11) */}
      <SystemStatusBanners />

      {/* Session expiry banner — non-blocking, triggers silent refresh (Req 16) */}
      <SessionExpiryWrapper />

      <div className="print:hidden h-full flex flex-col">
        <Suspense fallback={<div className="print:hidden w-64 h-full bg-background border-r border-border animate-pulse" />}>
          <DashboardNavigation />
        </Suspense>
      </div>

      {/* Main Content Area — wrapped in ErrorBoundary (Req 9.1) */}
      <DashboardShell>
        <DashboardErrorBoundary>
          <DashboardAccessGuard>{children}</DashboardAccessGuard>
        </DashboardErrorBoundary>
      </DashboardShell>

      {/* Global Dashboard Overlays */}
      <PopupNotificationContainer />
      <LiveSessionWatcher />
      <CommandPalette />

      {/* Puter.js — free-tier AI SDK (browser only, no API key needed) */}
      <Script src="https://js.puter.com/v2/" strategy="lazyOnload" />
      </div>
    </div>
    </AcademicYearProvider>
  );
}