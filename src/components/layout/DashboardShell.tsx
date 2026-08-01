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
  const hideQr = QR_HIDDEN_PATHS.some((p) => pathname?.startsWith(p)) || isImmersive;

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
    <div className="app-shell-scroll flex-1 flex flex-col w-full h-full min-h-0 min-w-0 relative pt-[var(--app-header-height)] pb-[calc(var(--app-bottom-nav-height)+0.5rem)] bg-muted/20 md:bg-background md:pt-0 md:pb-0 overflow-y-auto overflow-x-clip md:overflow-y-auto scroll-smooth print:overflow-visible print:pt-0 print:pb-0 print:block">
      <DesktopTopNavbar />
      <PullToRefreshContainer>
        {profile && <NewsletterPopup userId={profile.id} />}
        {!hideQr && <StaffQRScanner />}
        <main className="app-page-main flex-1 max-w-[1750px] w-full min-w-0 mx-auto px-4 sm:px-6 lg:px-10 xl:px-14 py-3 sm:py-4 md:py-6 lg:py-8 mobile-landscape-padding print:p-0 print:max-w-none print:m-0 text-[15px] lg:text-base leading-relaxed">
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
