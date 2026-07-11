'use client';

import Link from 'next/link';
import { BanknotesIcon, DocumentTextIcon, BoltIcon } from '@/lib/icons';

type Props = {
  workspace: 'today' | 'payments' | 'collections';
  role: string;
};

/**
 * Sticky mobile CTA bar for high-frequency finance actions.
 */
export function FinanceStickyActions({ workspace, role }: Props) {
  if (role !== 'admin' && role !== 'school') return null;

  const actions =
    workspace === 'today'
      ? [
          { href: '/dashboard/finance?workspace=invoices&ops=invoices', label: 'Invoice', icon: DocumentTextIcon },
          { href: '/dashboard/finance?workspace=payments', label: 'Pay', icon: BanknotesIcon },
          { href: '/dashboard/finance?workspace=collections', label: 'Collect', icon: BoltIcon },
        ]
      : workspace === 'payments'
        ? [
            { href: '/dashboard/finance?workspace=invoices&ops=invoices', label: 'Invoice', icon: DocumentTextIcon },
            { href: '/dashboard/finance?workspace=collections&ops=approvals', label: 'Approve', icon: BoltIcon },
          ]
        : [
            { href: '/dashboard/finance?workspace=collections&ops=approvals', label: 'Approvals', icon: BoltIcon },
            { href: '/dashboard/finance?workspace=reconciliation', label: 'Reconcile', icon: BanknotesIcon },
          ];

  return (
    <div className="fixed bottom-0 inset-x-0 z-40 border-t border-border bg-background/95 backdrop-blur sm:hidden safe-area-pb">
      <div className="mx-auto flex max-w-6xl items-stretch gap-1 px-3 py-2">
        {actions.map(({ href, label, icon: Icon }) => (
          <Link
            key={href + label}
            href={href}
            className="flex flex-1 flex-col items-center justify-center gap-0.5 rounded-lg bg-primary/10 py-2 text-xs font-bold text-primary"
          >
            <Icon className="h-5 w-5" />
            {label}
          </Link>
        ))}
      </div>
    </div>
  );
}
