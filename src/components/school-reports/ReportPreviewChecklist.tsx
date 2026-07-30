'use client';

import type { SchoolReportNarrative, SchoolReportSnapshot } from '@/lib/school-reports/types';

export function ReportPreviewChecklist({
  snapshot,
  narrative,
}: {
  snapshot: SchoolReportSnapshot;
  narrative?: SchoolReportNarrative | null;
}) {
  const completeness = snapshot.completeness;
  if (!completeness) {
    return (
      <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
        Completeness checklist unavailable — regenerate snapshot data from the editor.
      </p>
    );
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
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
            completeness.readyToPublish ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
          }`}
        >
          {completeness.readyToPublish ? 'Ready' : 'Incomplete'}
        </span>
      </div>
      {/* A fallback narrative is a perfectly readable report, which is exactly
          why it needs saying out loud: a retired model id once left every
          partner school receiving template text and nothing surfaced it. */}
      {narrative?.source === 'fallback' ? (
        <div className="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-950 dark:text-amber-100">
          <span className="font-black">Wording is template text, not AI-written.</span>{' '}
          The model was unavailable when this narrative was generated. It is accurate but generic —
          regenerate the narrative, or edit the wording yourself, before publishing.
        </div>
      ) : null}

      <ul className="mt-4 grid gap-2 md:grid-cols-2">
        {completeness.items.map((item) => (
          <li
            key={item.key}
            className={`rounded-lg border px-3 py-2 text-xs break-words ${
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
