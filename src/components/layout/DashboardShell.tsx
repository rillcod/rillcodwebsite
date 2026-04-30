'use client';

import { useSearchParams, usePathname } from 'next/navigation';
import { Suspense } from 'react';
import { useAuth } from '@/contexts/auth-context';
import NewsletterPopup from '@/components/dashboard/NewsletterPopup';
import StaffQRScanner from '@/components/qr/StaffQRScanner';
import PartnerSchoolScopeBanner from '@/components/layout/PartnerSchoolScopeBanner';

// Pages where the QR scanner should NOT appear
const QR_HIDDEN_PATHS = [
  '/dashboard/inbox',
  '/dashboard/messages',
  '/dashboard/school-teacher-messages',
];

// Pages that need full-bleed, zero-padding, native-app layout
const FULLSCREEN_PATHS = [
  '/dashboard/inbox',
  '/dashboard/messages',
  '/dashboard/school-teacher-messages',
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
      <div className="flex-1 flex flex-col w-full relative overflow-hidden pt-[53px] pb-[64px] md:pt-0 md:pb-0">
        {profile && <NewsletterPopup userId={profile.id} />}
        {/* No QR scanner on messaging pages */}
        <main className="flex-1 flex flex-col w-full overflow-hidden p-0 m-0">
          {children}
        </main>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col w-full relative pt-[53px] pb-[80px] md:pt-0 md:pb-0 md:overflow-y-auto print:overflow-visible print:pt-0 print:pb-0 print:block">
      {profile && <NewsletterPopup userId={profile.id} />}
      {!QR_HIDDEN_PATHS.some(p => pathname?.startsWith(p)) && <StaffQRScanner />}
      <main className="flex-1 max-w-[1700px] w-full mx-auto px-4 sm:px-6 lg:px-10 xl:px-14 py-4 md:py-6 lg:py-8 mobile-landscape-padding print:p-0 print:max-w-none print:m-0 text-[15px] lg:text-base">
        <PartnerSchoolScopeBanner />
        {children}
      </main>
    </div>
  );
}

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="flex-1 bg-background" />}>
      <ShellInner>{children}</ShellInner>
    </Suspense>
  );
}
