'use client';

/** Shared status chips for one progress-report row across Write / Publish / Auto-fill. */

export type ResultStatusFields = {
  calculation_mode?: string | null;
  is_published?: boolean | null;
  academic_qa_status?: string | null;
};

function chip(className: string, label: string) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${className}`}>
      {label}
    </span>
  );
}

export function ResultStatusBadges({ report }: { report: ResultStatusFields }) {
  const mode = String(report.calculation_mode || 'manual').toLowerCase();
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
