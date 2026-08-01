'use client';

import { ShieldCheckIcon, EnvelopeIcon } from '@/lib/icons';

export function NativeBillingNotice({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`relative overflow-hidden rounded-3xl border border-cyan-400/30 bg-gradient-to-br from-cyan-500/10 via-primary/5 to-transparent backdrop-blur-2xl shadow-xl ${compact ? 'p-4 sm:p-5' : 'p-5 sm:p-8'}`}>
      <div className="absolute -right-8 -top-8 h-28 w-28 rounded-full bg-cyan-400/10 blur-2xl" />
      <div className="relative flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-400/10">
          <ShieldCheckIcon className="h-5 w-5 text-cyan-600 dark:text-cyan-400" />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-600 dark:text-cyan-400">Account billing</p>
          <h3 className="mt-1 text-sm font-black text-foreground">Billing is managed separately</h3>
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
            This Android app is for learning, reports, schedules and account records. Billing instructions and confirmations are sent securely to the account email.
          </p>
          <div className="mt-3 inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            <EnvelopeIcon className="h-3.5 w-3.5" /> Check your registered email for billing updates
          </div>
        </div>
      </div>
    </div>
  );
}