'use client';

import type { SchoolReportSnapshot } from '@/lib/school-reports/types';

export function ReportPreviewChecklist({ snapshot }: { snapshot: SchoolReportSnapshot }) {
  const completeness = snapshot.completeness;
  if (!completeness) {
    return (
      <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
        Completeness checklist unavailable — regenerate snapshot data from the editor.
      </p>
    );
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-black">Publication readiness</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {completeness.readyToPublish
              ? 'All required checks pass — ready to publish when wording is final.'
              : `${completeness.completedRequired}/${completeness.totalRequired} required checks complete (${completeness.score}%).`}
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-[11px] font-black uppercase ${
            completeness.readyToPublish ? 'bg-emerald-500/10 text-emerald-700' : 'bg-amber-500/10 text-amber-700'
          }`}
        >
          {completeness.readyToPublish ? 'Ready' : 'Incomplete'}
        </span>
      </div>
      <ul className="mt-4 grid gap-2 md:grid-cols-2">
        {completeness.items.map((item) => (
          <li
            key={item.key}
            className={`rounded-lg border px-3 py-2 text-xs ${
              item.ok ? 'border-emerald-500/30 bg-emerald-500/5' : item.required ? 'border-rose-500/30 bg-rose-500/5' : 'border-border'
            }`}
          >
            <p className="font-black">{item.label}</p>
            <p className="mt-1 text-muted-foreground">{item.detail}</p>
            {item.actionHref ? (
              <a href={item.actionHref} className="mt-2 inline-flex text-[11px] font-black text-primary underline">
                {item.actionLabel || 'Open related record'}
              </a>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
