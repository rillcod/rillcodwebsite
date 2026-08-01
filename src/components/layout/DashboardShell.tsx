'use client';

import { useSearchParams, usePathname } from 'next/navigation';
import { Suspense } from 'react';
import DashboardLoadingScreen from '@/components/dashboard/DashboardLoadingScreen';
import { useAuth } from '@/contexts/auth-context';
import NewsletterPopup from '@/components/dashboard/NewsletterPopup';
import StaffQRScanner from '@/components/qr/StaffQRScanner';
import PartnerSchoolScopeBanner from '@/components/layout/PartnerSchoolScopeBanner';
import PullToRefreshContainer from '@/components/mobile/PullToRefreshContainer';

// Pages where the QR scanner should NOT appear (its floating button overlaps their own
// action bars / buttons — e.g. the report builder's sticky Save/Publish controls).
const QR_HIDDEN_PATHS = [
  '/dashboard/inbox',
  '/dashboard/office',
  '/dashboard/messages',
  '/dashboard/school-teacher-messages',
  '/dashboard/whatsapp-groups',
  '/dashboard/crm',
  '/dashboard/reports/builder',
];

// Pages that need full-bleed, zero-padding, native-app layout
const FULLSCREEN_PATHS = [
  '/dashboard/inbox',
  '/dashboard/office',
  '/dashboard/messages',
  '/dashboard/school-teacher-messages',
  '/dashboard/whatsapp-groups',
  '/dashboard/crm',
  '/dashboard/identity-cards',
  '/dashboard/card-studio',
];

function ShellInner({ children }: { children: React.ReactNode }) {
  const { profile } = useAuth();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const isMinimal = searchParams.get('minimal') === 'true';
  const isFullscreen = FULLSCREEN_PATHS.some(p => pathname?.startsWith(p));

  if (isMinimal) {
    return (
      <div className="flex-1 flex flex-col w-full relative h-screen overflow-y-auto">
        <main className="flex-1 w-full mx-auto p-0">
          {children}
        </main>
      </div>
    );
  }

  // Full-bleed mode for messaging pages — no padding, fills available height exactly
  if (isFullscreen) {
    return (
      <>
        {profile && <NewsletterPopup userId={profile.id} />}
        {/* Mobile: fixed between the safe-area-aware app header and bottom tabs so h-full resolves correctly.
            Desktop: static flex-1 in the sidebar-flex row. */}
        <main className="fixed top-[var(--app-header-height)] bottom-[var(--app-bottom-nav-height)] left-0 right-0 overflow-hidden flex flex-col md:static md:inset-auto md:flex-1 md:flex md:flex-col md:w-full md:overflow-hidden">
          {children}
        </main>
      </>
    );
  }

  return (
    <div className="flex-1 flex flex-col w-full h-full min-h-0 relative pt-[var(--app-header-height)] pb-[calc(var(--app-bottom-nav-height)+1rem)] md:pt-0 md:pb-0 overflow-y-auto md:overflow-y-auto print:overflow-visible print:pt-0 print:pb-0 print:block">
      <PullToRefreshContainer>
        {profile && <NewsletterPopup userId={profile.id} />}
        {!QR_HIDDEN_PATHS.some(p => pathname?.startsWith(p)) && <StaffQRScanner />}
        <main className="flex-1 max-w-[1700px] w-full mx-auto px-4 sm:px-6 lg:px-10 xl:px-14 py-4 md:py-6 lg:py-8 mobile-landscape-padding print:p-0 print:max-w-none print:m-0 text-[15px] lg:text-base">
          <PartnerSchoolScopeBanner />
          {children}
        </main>
      </PullToRefreshContainer>
    </div>
  );
}

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<DashboardLoadingScreen variant="skeleton" message="Loading page…" />}>
      <ShellInner>{children}</ShellInner>
    </Suspense>
  );
}
