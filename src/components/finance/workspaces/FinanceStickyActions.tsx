'use client';

import Link from 'next/link';
import { BanknotesIcon, DocumentTextIcon, BoltIcon } from '@/lib/icons';

type Props = {
  workspace: string;
  role: string;
};

type Action = { href: string; label: string; icon: typeof BanknotesIcon };

/**
 * Sticky mobile CTA bar — always points into Finance workspaces, never MoneyHub tools.
 */
export function FinanceStickyActions({ workspace, role }: Props) {
  if (role !== 'admin' && role !== 'school' && role !== 'teacher') return null;

  const isAdmin = role === 'admin';
  const hasBilling = role === 'admin' || role === 'school';

  let actions: Action[];
  if (workspace === 'today' || workspace === 'reports') {
    actions = [
      { href: '/dashboard/finance?workspace=invoices&ops=invoices', label: 'Invoices', icon: DocumentTextIcon },
      hasBilling
        ? { href: '/dashboard/finance?workspace=billing', label: 'Billing', icon: BanknotesIcon }
        : { href: '/dashboard/finance?workspace=collections&ops=approvals', label: 'Approve', icon: BoltIcon },
      { href: '/dashboard/finance?workspace=collections&ops=approvals', label: isAdmin ? 'Collect' : 'Approve', icon: BoltIcon },
    ];
    // Teacher today: avoid duplicate Approve tiles
    if (role === 'teacher') {
      actions = [
        { href: '/dashboard/finance?workspace=invoices&ops=invoices', label: 'Invoices', icon: DocumentTextIcon },
        { href: '/dashboard/finance?workspace=collections&ops=approvals', label: 'Approve', icon: BoltIcon },
        { href: '/dashboard/finance?workspace=today', label: 'Today', icon: BanknotesIcon },
      ];
    }
  } else if (workspace === 'invoices' || workspace === 'billing') {
    actions = [
      { href: '/dashboard/finance?workspace=invoices&ops=invoices', label: 'Invoice', icon: DocumentTextIcon },
      hasBilling
        ? { href: '/dashboard/finance?workspace=billing', label: 'Cycles', icon: BanknotesIcon }
        : { href: '/dashboard/finance?workspace=today', label: 'Today', icon: BanknotesIcon },
      { href: '/dashboard/finance?workspace=collections&ops=approvals', label: 'Approve', icon: BoltIcon },
    ];
  } else if (workspace === 'reconciliation' || workspace === 'settings') {
    actions = [
      { href: '/dashboard/finance?workspace=today', label: 'Today', icon: BanknotesIcon },
      { href: '/dashboard/finance?workspace=invoices&ops=invoices', label: 'Invoices', icon: DocumentTextIcon },
      isAdmin
        ? { href: '/dashboard/finance?workspace=reconciliation', label: 'Reconcile', icon: BoltIcon }
        : { href: '/dashboard/finance?workspace=collections&ops=approvals', label: 'Approve', icon: BoltIcon },
    ];
  } else {
    actions = [
      { href: '/dashboard/finance?workspace=collections&ops=approvals', label: 'Approvals', icon: BoltIcon },
      { href: '/dashboard/finance?workspace=invoices&ops=invoices', label: 'Invoices', icon: DocumentTextIcon },
      isAdmin
        ? { href: '/dashboard/finance?workspace=reconciliation', label: 'Reconcile', icon: BanknotesIcon }
        : hasBilling
          ? { href: '/dashboard/finance?workspace=billing', label: 'Billing', icon: BanknotesIcon }
          : { href: '/dashboard/finance?workspace=today', label: 'Today', icon: BanknotesIcon },
    ];
  }

  return (
    <div className="fixed bottom-0 inset-x-0 z-40 border-t border-border bg-background/95 backdrop-blur sm:hidden safe-area-pb">
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
