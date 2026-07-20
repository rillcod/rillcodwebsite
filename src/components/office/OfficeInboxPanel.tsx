'use client';

import dynamic from 'next/dynamic';
import { useOfficeOptional } from './OfficeContext';

const InboxPage = dynamic(() => import('@/app/dashboard/inbox/page'), {
  ssr: false,
  loading: () => <p className="p-6 text-sm text-muted-foreground">Loading inbox...</p>,
});

const WhatsAppGroupsPage = dynamic(() => import('@/app/dashboard/whatsapp-groups/page'), {
  ssr: false,
  loading: () => <p className="p-6 text-sm text-muted-foreground">Loading groups...</p>,
});

type Props = { embedded?: boolean; section?: 'chats' | 'groups' };

export function OfficeInboxPanel({ section = 'chats' }: Props) {
  const office = useOfficeOptional();
  const unassigned = office?.summary?.unassigned ?? 0;

  return (
    <div className="space-y-3">
      {office ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-muted/30 px-4 py-2.5 text-xs text-muted-foreground">
          <p>
            Replies here show up on Desk and in each person&apos;s help history.
            {unassigned > 0 ? ` · ${unassigned} still need a staff owner.` : ''}
          </p>
          {unassigned > 0 ? (
            <button
              type="button"
              onClick={() => office.setWorkspace('cases')}
              className="min-h-11 touch-manipulation rounded-lg border border-border px-3 py-2 text-xs font-black text-foreground"
            >
              Assign owners
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="-mx-4 h-[min(78dvh,900px)] min-h-[min(520px,70dvh)] overflow-hidden rounded-2xl border border-border sm:mx-0">
        {section === 'groups' ? <WhatsAppGroupsPage /> : <InboxPage />}
      </div>
    </div>
  );
}
