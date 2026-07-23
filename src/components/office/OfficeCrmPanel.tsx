'use client';

import dynamic from 'next/dynamic';
import { useOfficeOptional } from './OfficeContext';

const CrmPage = dynamic(() => import('@/app/dashboard/crm/page'), {
  ssr: false,
  loading: () => <p className="p-6 text-sm text-muted-foreground">Loading retention...</p>,
});

type Props = { embedded?: boolean };

export function OfficeCrmPanel(_props: Props) {
  const office = useOfficeOptional();

  return (
    <div className="space-y-3">
      {office ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-muted/30 px-4 py-2.5 text-xs text-muted-foreground">
          <p>Same people as Desk and Help Requests — follow-ups respect your automation switches.</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => office.setWorkspace('settings', 'automation')}
              className="min-h-11 touch-manipulation rounded-lg border border-border px-3 py-2 text-xs font-black text-foreground"
            >
              Retention switches
            </button>
            <button
              type="button"
              onClick={() => office.setWorkspace('newsletters')}
              className="min-h-11 touch-manipulation rounded-lg border border-border px-3 py-2 text-xs font-black text-foreground"
            >
              Newsletters
            </button>
          </div>
        </div>
      ) : null}
      <div className="-mx-4 flex min-h-[min(520px,70dvh)] flex-1 flex-col overflow-hidden rounded-2xl border border-border sm:mx-0 lg:min-h-[min(640px,75dvh)]">
        <CrmPage />
      </div>
    </div>
  );
}
