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

export function OfficeInboxPanel({ embedded = false, section = 'chats' }: Props) {
  const office = useOfficeOptional();
  const unassigned = office?.summary?.unassigned ?? 0;

  return (
    <div className={embedded ? 'flex min-h-0 flex-1 flex-col gap-3' : 'space-y-3'}>
      {office ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-muted/30 px-4 py-2.5 text-xs text-muted-foreground shrink-0">
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
      <div
        className={
          embedded
            ? 'flex min-h-[min(520px,70dvh)] flex-1 flex-col overflow-hidden rounded-2xl border border-border lg:min-h-[min(640px,75dvh)]'
            : '-mx-4 flex min-h-[min(520px,70dvh)] flex-col overflow-hidden rounded-2xl border border-border sm:mx-0 lg:min-h-[min(640px,75dvh)]'
        }
      >
        {section === 'groups' ? <WhatsAppGroupsPage /> : <InboxPage />}
      </div>
    </div>
  );
}
