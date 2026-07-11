'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import {
  BanknotesIcon,
  CheckBadgeIcon,
  DocumentTextIcon,
  ArrowTrendingUpIcon,
} from '@/lib/icons';
import { AccountsPanel } from './AccountsPanel';
import { ApprovalsPanel } from './ApprovalsPanel';
import { InvoicesPanel } from './InvoicesPanel';
import { ReceiptsPanel } from './ReceiptsPanel';
import { ReceiptBuilderPanel } from './ReceiptBuilderPanel';
import { SchoolInvoiceBuilderPanel } from './SchoolInvoiceBuilderPanel';
import { SchoolBillingDocsPanel } from './SchoolBillingDocsPanel';
import { DiagnosticsPanel } from './DiagnosticsPanel';
import { BillingCyclesTab } from '@/components/finance/BillingCyclesTab';
import { ReceiptPercentIcon, BuildingOfficeIcon, ShieldCheckIcon, CalendarDaysIcon } from '@/lib/icons';

type OpsTab =
  | 'approvals'
  | 'invoices'
  | 'receipts'
  | 'receipt_builder'
  | 'school_invoice_builder'
  | 'billing_docs'
  | 'billing_cycles'
  | 'accounts'
  | 'diagnostics';

interface OperationsHubProps {
  embedded?: boolean;
  defaultTab?: OpsTab;
  workspace?: 'invoices' | 'collections';
}

/**
 * OperationsHub — staff-facing finance operations center.
 *
 * Replaces the monolithic legacy PaymentsHub with focused, stream-aware
 * panels. Every feature, route and live preview from the old hub has been
 * migrated and, where possible, improved:
 *
 *   - Approvals:              pending transactions + proof-review queue
 *                             (uses /api/payments/approve, proofs/*)
 *   - Invoices:               list + quick create + staff actions
 *                             (mark paid, email, remind, delete, preview)
 *                             (uses /api/invoices, /api/invoices/[id],
 *                              /api/invoices/[id]/remind,
 *                              /api/payments/invoices/send-email,
 *                              /api/invoices/[id]/pdf)
 *   - Receipts:               issued-receipt grid with SmartDocument
 *                             previews (uses /api/receipts)
 *   - Receipt Builder:        rich HTML receipt for offline payments,
 *                             with live iframe preview, print + save
 *                             (uses /api/receipts POST)
 *   - School Invoice Builder: admin-only partner-school invoice with
 *                             revenue-share split + live preview
 *                             (uses /api/invoices POST with stream='school')
 *   - Accounts:               bank accounts (Rillcod + partner schools)
 *                             (uses /api/payment-accounts)
 *   - Diagnostics:            admin-only billing health + test email
 *                             (uses /api/admin/billing-health,
 *                              /api/admin/test-email)
 *
 * Day-to-day activity for every role lives in the Finance Center Today workspace.
 * Admin audit lives in the Finance Center Reconciliation workspace.
 */
export function OperationsHub({ embedded = false, defaultTab = 'invoices', workspace = 'invoices' }: OperationsHubProps) {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const isSchool = profile?.role === 'school';
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const editInvoiceId = searchParams.get('edit_invoice');
  const opsParam = searchParams.get('ops') as OpsTab | null;
  const [tab, setTab] = useState<OpsTab>(opsParam || defaultTab);

  // When arriving with ?edit_invoice=<id>, switch to the school invoice builder
  useEffect(() => {
    if (editInvoiceId && isAdmin) {
      setTab('school_invoice_builder');
    }
  }, [editInvoiceId, isAdmin]);

  useEffect(() => {
    setTab(isSchool ? 'invoices' : defaultTab);
  }, [defaultTab, isSchool]);

  useEffect(() => {
    if (!opsParam) return;
    const allowed = workspace === 'collections'
      ? ['approvals']
      : ['invoices', 'receipts', 'billing_docs'];
    if (allowed.includes(opsParam)) setTab(opsParam);
  }, [opsParam, workspace]);

  const switchTab = (next: OpsTab) => {
    setTab(next);
    const params = new URLSearchParams(searchParams.toString());
    params.set('ops', next);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  if (!isAdmin && !isSchool) {
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
    Icon: typeof BanknotesIcon;
    hint: string;
    show: boolean;
  };
  const tabs: TabDef[] = ([
    {
      k: 'invoices',
      label: 'Invoices',
      Icon: DocumentTextIcon,
      hint: isSchool ? 'View and download your school invoices' : 'Create, edit, preview, remind & manage invoices',
      show: true,
    },
    {
      k: 'receipts',
      label: 'Receipts',
      Icon: ReceiptPercentIcon,
      hint: 'Browse issued receipts with full document preview',
      show: true,
    },
    {
      k: 'approvals',
      label: 'Approvals',
      Icon: CheckBadgeIcon,
      hint: 'Pending transactions & proof queue',
      show: isAdmin,
    },
    {
      k: 'receipt_builder',
      label: 'Build Receipt',
      Icon: ReceiptPercentIcon,
      hint: 'Manual receipt builder with live preview (offline payments)',
      show: isAdmin,
    },
    {
      k: 'school_invoice_builder',
      label: 'School Invoice',
      Icon: BuildingOfficeIcon,
      hint: 'Partner-school invoice builder with revenue split & preview',
      show: isAdmin,
    },
    {
      k: 'billing_docs',
      label: 'Billing Docs',
      Icon: DocumentTextIcon,
      hint: 'Payment Register & Attendance Roster — official documents for school billing',
      show: isAdmin,
    },

    {
      k: 'accounts',
      label: 'Accounts',
      Icon: BanknotesIcon,
      hint: 'Bank accounts for collections',
      show: isAdmin,
    },
    {
      k: 'diagnostics',
      label: 'Diagnostics',
      Icon: ShieldCheckIcon,
      hint: 'Admin-only: billing health & email delivery tests',
      show: isAdmin,
    },
  ] as TabDef[]).filter((t) => t.show && (
    workspace === 'collections' ? t.k === 'approvals' : ['invoices', 'receipts', 'billing_docs'].includes(t.k)
  ));

  return (
    <div className={embedded ? 'space-y-6' : 'max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6'}>
      {!embedded && (
        <div>
          <div className="flex items-center gap-2 mb-1">
            <CheckBadgeIcon className="w-5 h-5 text-primary" />
            <span className="text-xs font-bold text-primary uppercase tracking-widest">Finance Ops</span>
          </div>
          <h1 className="text-3xl font-extrabold">Payments operations</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Approve payments, manage invoices and maintain collection accounts.
          </p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-2 px-2">
        {tabs.map((t) => {
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

      <div className="pt-2">
        {tab === 'approvals' && <ApprovalsPanel />}
        {tab === 'invoices' && <InvoicesPanel />}
        {tab === 'receipts' && <ReceiptsPanel />}
        {tab === 'receipt_builder' && isAdmin && <ReceiptBuilderPanel />}
        {tab === 'school_invoice_builder' && isAdmin && <SchoolInvoiceBuilderPanel editInvoiceId={editInvoiceId ?? undefined} />}
        {tab === 'billing_docs' && isAdmin && <SchoolBillingDocsPanel />}
        {tab === 'accounts' && isAdmin && <AccountsPanel />}
        {tab === 'diagnostics' && isAdmin && <DiagnosticsPanel />}
      </div>
    </div>
  );
}

export default OperationsHub;
