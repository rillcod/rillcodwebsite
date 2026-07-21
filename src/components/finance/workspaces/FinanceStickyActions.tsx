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
 * Never duplicate the current workspace as a no-op primary action.
 */
export function FinanceStickyActions({ workspace, role }: Props) {
  if (role !== 'admin' && role !== 'school' && role !== 'teacher') return null;

  const isAdmin = role === 'admin';

  const invoices = { href: '/dashboard/finance?workspace=invoices&ops=invoices', label: 'Invoices', icon: DocumentTextIcon };
  const collections = { href: '/dashboard/finance?workspace=collections&ops=approvals', label: 'Collect', icon: BoltIcon };
  const today = { href: '/dashboard/finance?workspace=today', label: 'Today', icon: BanknotesIcon };
  const reconcile = { href: '/dashboard/finance?workspace=reconciliation', label: 'Reconcile', icon: BoltIcon };
  const settings = { href: '/dashboard/finance?workspace=settings', label: 'Settings', icon: BanknotesIcon };

  let actions: Action[];
  if (workspace === 'today' || workspace === 'reports') {
    actions = [
      invoices,
      collections,
      collections,
    ];
    if (role === 'teacher') {
      actions = [invoices, collections, today];
    }
  } else if (workspace === 'collections') {
    // Already on Collections — don't show Collect/Approvals as a dead click.
    actions = [
      today,
      invoices,
      isAdmin ? reconcile : today,
    ];
  } else if (workspace === 'invoices') {
    actions = [invoices, collections, today];
  } else if (workspace === 'reconciliation' || workspace === 'settings') {
    actions = [
      today,
      invoices,
      isAdmin ? reconcile : collections,
    ];
  } else {
    actions = [today, invoices, collections];
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
