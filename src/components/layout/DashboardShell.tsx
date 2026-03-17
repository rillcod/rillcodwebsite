'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { useAuth } from '@/contexts/auth-context';
import NewsletterPopup from '@/components/dashboard/NewsletterPopup';

function ShellInner({ children }: { children: React.ReactNode }) {
  const { profile } = useAuth();
  const searchParams = useSearchParams();
  const isMinimal = searchParams.get('minimal') === 'true';

  if (isMinimal) {
    return (
      <div className="flex-1 flex flex-col w-full relative h-screen overflow-y-auto">
        <main className="flex-1 w-full mx-auto p-0">
          {children}
        </main>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col w-full relative pt-[53px] pb-[80px] md:pt-0 md:pb-0 md:overflow-y-auto print:overflow-visible print:pt-0 print:pb-0 print:block">
      {profile && <NewsletterPopup userId={profile.id} />}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-8 mobile-landscape-padding print:p-0 print:max-w-none print:m-0">
        {children}
      </main>
    </div>
  );
}

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="flex-1 bg-[#050a17]" />}>
      <ShellInner>{children}</ShellInner>
    </Suspense>
  );
}
