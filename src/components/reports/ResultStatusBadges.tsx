'use client';

import Link from 'next/link';
import { automaticResultHasNoEvidence } from '@/lib/reports/score';

/** Shared status chips for one progress-report row across Write / Publish / Auto-fill. */

export type ResultStatusFields = {
  calculation_mode?: string | null;
  is_published?: boolean | null;
  academic_qa_status?: string | null;
  calculation_snapshot?: unknown;
};

function chip(className: string, label: string) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${className}`}>
      {label}
    </span>
  );
}

export function ResultStatusBadges({ report }: { report: ResultStatusFields }) {
  const mode = String(report.calculation_mode || '').toLowerCase();
  const qa = String(report.academic_qa_status || 'not_checked').replace(/_/g, ' ');

  return (
    <span className="inline-flex flex-wrap gap-1.5">
      {mode === 'manual'
        ? chip('border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300', 'Typed')
        : mode === 'automatic'
          ? chip('border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300', 'Auto-fill')
          : null}
      {report.is_published
        ? chip('border-primary/30 bg-primary/10 text-primary', 'Published')
        : chip('border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300', 'Draft')}
      {qa && qa !== 'not checked' ? chip('border-border bg-background text-muted-foreground', qa) : null}
    </span>
  );
}

export function ManualProtectionBanner({ mode }: { mode?: string | null }) {
  if (String(mode || '').toLowerCase() !== 'manual') return null;
  return (
    <p className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs font-semibold leading-5 text-emerald-800 dark:text-emerald-200">
      These scores were typed. Auto-fill will not change them.
    </p>
  );
}

export function AutoFillStatusBanner({ report }: { report: ResultStatusFields }) {
  const mode = String(report.calculation_mode || '').toLowerCase();
  if (mode !== 'automatic') return null;
  if (automaticResultHasNoEvidence(report)) {
    return (
      <p className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs font-semibold leading-5 text-amber-900 dark:text-amber-100">
        No class evidence for this term yet. Scores stay blank until CBT, assignments, or attendance is recorded — or type them here in Write.
      </p>
    );
  }
  return (
    <p className="rounded-xl border border-sky-500/20 bg-sky-500/10 px-3 py-2 text-xs font-semibold leading-5 text-sky-900 dark:text-sky-100">
      Filled from class evidence. Editing any score switches this report to Typed.
    </p>
  );
}

export function NoScoresYetNotice({ compact }: { compact?: boolean }) {
  return (
    <div className={`rounded-xl border border-amber-500/25 bg-amber-500/5 ${compact ? 'px-3 py-2' : 'px-4 py-3'}`}>
      <p className={`font-bold text-amber-900 dark:text-amber-100 ${compact ? 'text-xs' : 'text-sm'}`}>
        No scores to show yet
      </p>
      <p className={`mt-1 text-amber-800/90 dark:text-amber-200/90 ${compact ? 'text-[11px] leading-5' : 'text-xs leading-5'}`}>
        Auto-fill found no class work for this term. Record evidence in{' '}
        <Link href="/dashboard/academic/results" className="font-bold underline underline-offset-2">
          Auto-fill
        </Link>{' '}
        or type scores in Write before publishing.
      </p>
    </div>
  );
}

/** Shown once before the first score edit on an unpublished Auto-fill draft. */
export function AutoFillEditConfirmDialog({
  open,
  studentName,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  studentName?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 p-4 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="auto-fill-edit-confirm-title"
        className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-xl"
      >
        <p id="auto-fill-edit-confirm-title" className="text-base font-black text-foreground">
          Switch to typed scores?
        </p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {studentName ? (
            <>
              <span className="font-semibold text-foreground">{studentName}&apos;s</span> report was filled from class evidence.
            </>
          ) : (
            'This report was filled from class evidence.'
          )}{' '}
          Editing a score marks it as <span className="font-semibold text-foreground">Typed</span>. Auto-fill will not refresh these numbers again.
        </p>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
          <li>Use Auto-fill again only on a fresh draft before you edit</li>
          <li>Typed scores stay protected from bulk refresh</li>
        </ul>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-11 rounded-xl border border-border px-4 py-2 text-sm font-bold"
          >
            Keep Auto-fill
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="min-h-11 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"
          >
            Edit scores
          </button>
        </div>
      </div>
    </div>
  );
}
