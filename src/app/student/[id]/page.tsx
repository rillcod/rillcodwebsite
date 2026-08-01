'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { formatAccessCardCodeDisplay, normalizeAccessCardCode } from '@/lib/access-card-code';

/**
 * Legacy public student passport URL.
 * Identity + results now live on the gated /result-check surface.
 */
export default function PublicStudentProfileRedirect() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  useEffect(() => {
    const raw = decodeURIComponent(String(id || '')).trim();
    if (!raw) {
      router.replace('/result-check');
      return;
    }
    const code = formatAccessCardCodeDisplay(raw) || normalizeAccessCardCode(raw) || raw;
    router.replace(`/result-check/${encodeURIComponent(code)}?via=qr`);
  }, [id, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6 text-center public-page-root overflow-x-clip">
      <p className="text-sm text-muted-foreground">Redirecting to secure result check…</p>
    </div>
  );
}
