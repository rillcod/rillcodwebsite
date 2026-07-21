'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import {
  CheckBadgeIcon,
  DocumentTextIcon,
  ReceiptPercentIcon,
} from '@/lib/icons';
import { ApprovalsPanel } from './ApprovalsPanel';
import { InvoicesPanel } from './InvoicesPanel';
import { ReceiptsPanel } from './ReceiptsPanel';
import BalanceRemindersPanel from '@/components/finance/BalanceRemindersPanel';

type OpsTab =
  | 'approvals'
  | 'invoices'
  | 'receipts'
;

interface OperationsHubProps {
  embedded?: boolean;
  defaultTab?: OpsTab;
  workspace?: 'invoices' | 'collections';
}

/**
 * OperationsHub — staff-facing finance operations center.
 *
 * Workspace boundary (do not cross):
 *   - invoices   → Invoices + Receipts only
 *   - collections → Approvals (+ admin outstanding-parents queue)
 *
 * Approvals must never render under the Invoices workspace.
 */
export function OperationsHub({ embedded = false, defaultTab = 'invoices', workspace = 'invoices' }: OperationsHubProps) {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const isSchool = profile?.role === 'school';
  const isTeacher = profile?.role === 'teacher';
  const isStaff = isAdmin || isSchool || isTeacher;
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const editInvoiceId = searchParams.get('edit_invoice');
  const opsParam = searchParams.get('ops') as OpsTab | null;

  const resolveTab = (requested: OpsTab | null | undefined): OpsTab => {
    if (workspace === 'collections') return 'approvals';
    if (requested === 'receipts') return 'receipts';
    return 'invoices';
  };

  const [tab, setTab] = useState<OpsTab>(() => resolveTab(opsParam || defaultTab));

  useEffect(() => {
    setTab(resolveTab(opsParam || defaultTab));
  }, [defaultTab, opsParam, workspace]);

  const switchTab = (next: OpsTab) => {
    const safe = resolveTab(next);
    setTab(safe);
    const params = new URLSearchParams(searchParams.toString());
    params.set('workspace', workspace);
    params.set('ops', safe);
    params.delete('tab');
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  if (!isStaff) {
    return (
      <div className="border border-dashed border-border rounded-xl p-10 text-center">
        <p className="text-sm font-bold text-foreground">Staff-only area</p>
        <p className="text-xs text-muted-foreground mt-1">
          Open{' '}
          <Link href="/dashboard/finance" className="text-primary font-bold hover:underline">
            Finance Center
          </Link>{' '}
          for your payment activity.
        </p>
      </div>
    );
  }

  type TabDef = {
    k: OpsTab;
    label: string;
    Icon: typeof DocumentTextIcon;
    hint: string;
  };

  const documentFilters: TabDef[] = [
    {
      k: 'invoices',
      label: 'Invoices',
      Icon: DocumentTextIcon,
      hint: isSchool || isTeacher ? 'View, mark paid, and download school invoices' : 'Create, edit, preview, remind & manage invoices',
    },
    {
      k: 'receipts',
      label: 'Receipts',
      Icon: ReceiptPercentIcon,
      hint: 'Browse issued receipts with full document preview',
    },
  ];

  // Collections has no inner chip strip — Approvals is the whole workspace.
  const showDocumentFilter = workspace === 'invoices';

  return (
    <div className={embedded ? 'space-y-6' : 'max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6'}>
      {!embedded && (
        <div>
          <div className="flex items-center gap-2 mb-1">
            <CheckBadgeIcon className="w-5 h-5 text-primary" />
            <span className="text-xs font-bold text-primary uppercase tracking-widest">Finance Ops</span>
          </div>
          <h1 className="text-3xl font-extrabold">
            {workspace === 'collections' ? 'Collections' : 'Invoice documents'}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {workspace === 'collections'
              ? 'Approve pending payments and follow up outstanding balances.'
              : 'Create and manage invoice records; switch document type to view their receipts.'}
          </p>
        </div>
      )}

      {workspace === 'collections' && embedded && (
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Collections</p>
          <h2 className="text-xl font-black text-foreground mt-0.5">Collections queue</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Use the queue filter for pending payments, uploaded proofs, completed records, and outstanding follow-up.
          </p>
        </div>
      )}

      {showDocumentFilter && (
        <div className="space-y-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Document type</span>
          <div className="flex gap-2 overflow-x-auto pb-1">
          {documentFilters.map((t) => {
            const Icon = t.Icon;
            const active = tab === t.k;
            return (
              <button
                key={t.k}
                onClick={() => switchTab(t.k)}
                className={`shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-xl border text-xs font-black uppercase tracking-widest transition-colors ${
                  active
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background text-muted-foreground border-border hover:text-foreground hover:border-primary/40'
                }`}
                title={t.hint}
              >
                <Icon className="w-4 h-4" />
                {t.label}
              </button>
            );
          })}
          </div>
        </div>
      )}

      <div className="pt-2 space-y-8">
        {workspace === 'collections' && (
          <>
            <section className="rounded-2xl border border-border bg-card p-4">
              <ApprovalsPanel />
              {isAdmin && (
                <details className="mt-6 border-t border-border pt-4">
                  <summary className="cursor-pointer text-sm font-black">Outstanding follow-up queue</summary>
                  <div className="mt-4">
                    <BalanceRemindersPanel embedded variant="queue" />
                  </div>
                </details>
              )}
            </section>
          </>
        )}
        {workspace === 'invoices' && tab === 'invoices' && <InvoicesPanel editInvoiceId={editInvoiceId} />}
        {workspace === 'invoices' && tab === 'receipts' && <ReceiptsPanel />}
      </div>
    </div>
  );
}

export default OperationsHub;
