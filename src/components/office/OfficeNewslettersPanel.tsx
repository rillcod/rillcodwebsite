'use client';

import dynamic from 'next/dynamic';
import { useOfficeOptional } from './OfficeContext';

const NewslettersPage = dynamic(() => import('@/app/dashboard/newsletters/page'), {
  ssr: false,
  loading: () => <p className="p-6 text-sm text-muted-foreground">Loading newsletters...</p>,
});

type Props = { embedded?: boolean };

export function OfficeNewslettersPanel(_props: Props) {
  const office = useOfficeOptional();

  return (
    <div className="space-y-3">
      {office ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-muted/30 px-4 py-2.5 text-xs text-muted-foreground">
          <p>Official school mail — publish health lives under Systems → Scheduled jobs.</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => office.setWorkspace('settings', 'automation')}
              className="min-h-11 touch-manipulation rounded-lg border border-border px-3 py-2 text-xs font-black text-foreground"
            >
              Marketing switches
            </button>
            <button
              type="button"
              onClick={() => office.setWorkspace('settings', 'health')}
              className="min-h-11 touch-manipulation rounded-lg border border-border px-3 py-2 text-xs font-black text-foreground"
            >
              Scheduled Work
            </button>
          </div>
        </div>
      ) : null}
      <div className="-mx-4 sm:mx-0">
        <NewslettersPage />
      </div>
    </div>
  );
}
