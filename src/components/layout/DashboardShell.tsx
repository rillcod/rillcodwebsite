'use client';

import { useSearchParams, usePathname } from 'next/navigation';
import { Suspense } from 'react';
import DashboardLoadingScreen from '@/components/dashboard/DashboardLoadingScreen';
import { useAuth } from '@/contexts/auth-context';
import NewsletterPopup from '@/components/dashboard/NewsletterPopup';
import StaffQRScanner from '@/components/qr/StaffQRScanner';
import PartnerSchoolScopeBanner from '@/components/layout/PartnerSchoolScopeBanner';
import PullToRefreshContainer from '@/components/mobile/PullToRefreshContainer';
import DesktopTopNavbar from '@/components/layout/DesktopTopNavbar';

// Pages where the QR scanner should NOT appear (overlaps fixed action bars).
const QR_HIDDEN_PATHS = [
  '/dashboard/inbox',
  '/dashboard/office',
  '/dashboard/messages',
  '/dashboard/school-teacher-messages',
  '/dashboard/whatsapp-groups',
  '/dashboard/crm',
  '/dashboard/reports/builder',
  '/dashboard/results',
  '/dashboard/lessons',
  '/dashboard/cbt',
  '/dashboard/playground',
];

// Full-bleed messaging / desk layouts — zero shell padding.
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

/** Learning flows that manage their own scroll + fixed footers (lesson player, CBT exam). */
function isImmersiveLearning(pathname: string | null): boolean {
  if (!pathname) return false;
  if (/^\/dashboard\/lessons\/[^/]+$/.test(pathname)) return true;
  if (/^\/dashboard\/cbt\/[^/]+\/take$/.test(pathname)) return true;
  if (/^\/dashboard\/flashcards\/[^/]+\/review$/.test(pathname)) return true;
  if (pathname === '/dashboard/playground') return true;
  return false;
}

function ShellInner({ children }: { children: React.ReactNode }) {
  const { profile } = useAuth();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const isMinimal = searchParams.get('minimal') === 'true';
  const isFullscreen = FULLSCREEN_PATHS.some((p) => pathname?.startsWith(p));
  const isImmersive = isImmersiveLearning(pathname);
  const isSchoolPaperSheet = !!pathname && /^\/dashboard\/classes\/[^/]+\/papers\/[^/]+$/.test(pathname);
  const hideQr = QR_HIDDEN_PATHS.some((p) => pathname?.startsWith(p)) || isImmersive || isSchoolPaperSheet;

  if (isMinimal) {
    return (
      <div className="flex-1 flex flex-col w-full min-w-0 relative h-screen overflow-y-auto overflow-x-clip">
        <main className="flex-1 w-full min-w-0 mx-auto p-0">{children}</main>
      </div>
    );
  }

  if (isFullscreen) {
    return (
      <>
        {profile && <NewsletterPopup userId={profile.id} />}
        <main className="app-page-main fixed top-[var(--app-header-height)] bottom-[var(--app-bottom-nav-height)] left-0 right-0 min-w-0 overflow-hidden flex flex-col md:static md:inset-auto md:flex-1 md:flex md:flex-col md:w-full md:overflow-hidden">
          {children}
        </main>
      </>
    );
  }

  if (isImmersive) {
    return (
      <>
        {profile && <NewsletterPopup userId={profile.id} />}
        <main className="fixed top-[var(--app-header-height)] bottom-0 left-0 right-0 min-w-0 overflow-hidden flex flex-col md:static md:flex-1 md:overflow-hidden md:bottom-auto">
          {children}
        </main>
      </>
    );
  }

  return (
    <div
      className="app-shell-scroll relative flex w-full min-w-0 flex-1 flex-col overflow-x-clip bg-muted/20 pt-[var(--app-header-height)] pb-[calc(var(--app-bottom-nav-height)+0.5rem)] scroll-smooth print:block print:overflow-visible print:pt-0 print:pb-0 md:h-full md:min-h-0 md:overflow-y-auto md:bg-background md:pt-0 md:pb-0"
    >
      <DesktopTopNavbar />
      <PullToRefreshContainer>
        {profile && <NewsletterPopup userId={profile.id} />}
        {!hideQr && <StaffQRScanner />}
        <main className="app-page-main mx-auto w-full min-w-0 max-w-[1750px] flex-1 px-4 py-3 text-[15px] leading-relaxed sm:px-6 sm:py-4 md:py-6 lg:px-10 lg:py-8 lg:text-base xl:px-14 mobile-landscape-padding print:m-0 print:max-w-none print:p-0">
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
