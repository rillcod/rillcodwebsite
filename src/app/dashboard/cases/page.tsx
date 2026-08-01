'use client';

import { Suspense } from 'react';
import { CasesPanel } from '@/components/office/CasesPanel';
import { useOfficeAdminRedirect } from '@/components/office/useOfficeAdminRedirect';

function CasesPageInner() {
  const redirecting = useOfficeAdminRedirect({ workspace: 'cases', preserveCaseId: true });
  if (redirecting) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground mobile-page-root">
        Opening Help Requests in Office Center...
      </div>
    );
  }
  return <CasesPanel />;
}

export default function CommunicationCasesPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground mobile-page-root">Loading...</div>
      }
    >
      <CasesPageInner />
    </Suspense>
  );
}
