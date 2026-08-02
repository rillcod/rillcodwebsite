'use client';

import Link from 'next/link';
import { BanknotesIcon, DocumentTextIcon, BoltIcon } from '@/lib/icons';
import { roleHasCapability } from '@/lib/auth/capabilities';

type Props = {
  workspace: string;
  role: string;
};

type Action = { href: string; label: string; icon: typeof BanknotesIcon };

/**
 * Sticky mobile CTA bar — always points into Finance workspaces, never MoneyHub tools.
 * Never duplicate the current workspace as a no-op primary action.
 */
export function FinanceStickyActions({ workspace, role }: Props) {
  if (!roleHasCapability(role, 'view_student_payment_status')) return null;
  const isAdmin = roleHasCapability(role, 'manage_finance');
  const isSchool = role === 'school';

  const invoices = { href: '/dashboard/finance?workspace=invoices&ops=invoices', label: 'Invoices', icon: DocumentTextIcon };
  const collections = { href: '/dashboard/finance?workspace=collections&ops=approvals', label: 'Collect', icon: BoltIcon };
  const today = { href: '/dashboard/finance?workspace=today', label: 'Today', icon: BanknotesIcon };
  const reconcile = { href: '/dashboard/finance?workspace=reconciliation', label: 'Reconcile', icon: BoltIcon };
  const settings = { href: '/dashboard/finance?workspace=settings', label: 'Settings', icon: BanknotesIcon };

  let actions: Action[];
  if (workspace === 'today') {
    actions = isAdmin ? [invoices, collections, reconcile] : isSchool ? [invoices, settings] : [invoices];
  } else if (workspace === 'reports') {
    actions = isAdmin ? [invoices, collections, reconcile] : [today, invoices, settings];
  } else if (workspace === 'collections') {
    actions = [today, invoices, reconcile];
  } else if (workspace === 'invoices') {
    actions = isAdmin ? [today, collections, reconcile] : isSchool ? [today, settings] : [today];
  } else if (workspace === 'reconciliation') {
    actions = [today, invoices, collections];
  } else if (workspace === 'settings') {
    actions = isAdmin ? [today, invoices, reconcile] : [today, invoices];
  } else {
    actions = [today, invoices];
  }

  // De-dupe by href so teacher/today paths never show two identical tiles.
  const seen = new Set<string>();
  actions = actions.filter((a) => {
    if (seen.has(a.href)) return false;
    seen.add(a.href);
    return true;
  }).slice(0, 3);

  return (
    <div className="fixed bottom-[var(--app-bottom-nav-height)] inset-x-0 z-40 border-t border-border bg-background/95 backdrop-blur sm:hidden safe-area-pb">
      <div className="mx-auto flex max-w-6xl items-stretch gap-1 px-3 py-2">
        {actions.map(({ href, label, icon: Icon }) => (
          <Link
            key={href + label}
            href={href}
            aria-label={label}
            className="flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg bg-primary/10 py-2 text-xs font-bold text-primary"
          >
            <Icon className="h-5 w-5" />
            {label}
          </Link>
        ))}
      </div>
    </div>
  );
}
