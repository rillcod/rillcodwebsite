'use client';

import { NEXT_TERM_FOCUS_LABEL } from '@/lib/school-reports/report-content-dedup';
import type { DeliveryLedger, DeliveryTopicRow } from '@/lib/school-reports/delivery-structure';
import { formatCourseDisplay, formatProgrammeDisplay } from '@/lib/school-reports/display-labels';
import { SegmentGrid, SegmentPanel } from '@/components/school-reports/SegmentPanel';

type Props = {
  ledger: DeliveryLedger;
  narrativeProse?: string;
  /** Compact = briefing sidebar; full = preview/PDF-like flow */
  variant?: 'compact' | 'full';
  accent?: string;
  className?: string;
};

function SourceTag({ source }: { source: DeliveryTopicRow['source'] }) {
  const label =
    source === 'both' ? 'Curriculum + results' : source === 'curriculum' ? 'Weeks logged' : 'Results path';
  return (
    <span className="rounded-full border border-border/70 bg-background px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-muted-foreground">
      {label}
    </span>
  );
}

function TopicCard({ row, accent }: { row: DeliveryTopicRow; accent: string }) {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-border/80 bg-card shadow-sm">
      <div className="h-1 shrink-0" style={{ backgroundColor: accent }} aria-hidden />
      <div className="flex flex-1 flex-col p-3">
        <p className="text-[10px] font-black uppercase tracking-[0.14em]" style={{ color: accent }}>
          {formatProgrammeDisplay(row.programme)}
        </p>
        <p className="mt-1 text-sm font-black text-foreground">{formatCourseDisplay(row.course)}</p>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{row.weekRange}</p>
        <p className="mt-2 text-xs text-muted-foreground">{row.evidence}</p>
        <div className="mt-auto pt-3">
          <SourceTag source={row.source} />
        </div>
      </div>
    </div>
  );
}

function TopicTable({ rows, accent }: { rows: DeliveryTopicRow[]; accent: string }) {
  if (!rows.length) return null;
  if (rows.length >= 2 && rows.length <= 4) {
    return (
      <div className="grid grid-cols-1 items-stretch gap-4 sm:grid-cols-2">
        {rows.map((row) => (
          <TopicCard key={`${row.programme}-${row.course}`} row={row} accent={accent} />
        ))}
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-border/80 bg-background">
      <table className="min-w-full text-xs">
        <thead>
          <tr className="border-b border-border bg-muted/40 text-left text-[10px] font-black uppercase tracking-wide text-muted-foreground">
            <th className="px-3 py-2.5">Programme</th>
            <th className="px-3 py-2.5">Course</th>
            <th className="px-3 py-2.5">Delivery range</th>
            <th className="px-3 py-2.5">Evidence</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.programme}-${row.course}`} className="border-b border-border/50 last:border-0">
              <td className="px-3 py-2.5 font-bold">{formatProgrammeDisplay(row.programme)}</td>
              <td className="px-3 py-2.5">{formatCourseDisplay(row.course)}</td>
              <td className="px-3 py-2.5 text-muted-foreground">{row.weekRange}</td>
              <td className="px-3 py-2.5">
                <span className="text-muted-foreground">{row.evidence}</span>
                <span className="ml-2 inline-block align-middle">
                  <SourceTag source={row.source} />
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BulletLines({ items, bulletColor }: { items: string[]; bulletColor: string }) {
  return (
    <ul className="space-y-2 text-xs leading-5 text-muted-foreground">
      {items.map((line) => (
        <li key={line} className="flex gap-2.5">
          <span className="mt-0.5 shrink-0 font-black" style={{ color: bulletColor }}>
            •
          </span>
          <span>{line}</span>
        </li>
      ))}
    </ul>
  );
}

export function DeliveryLedgerView({
  ledger,
  narrativeProse,
  variant = 'full',
  accent,
  className = '',
}: Props) {
  const compact = variant === 'compact';
  const stepOffset = compact ? 0 : 0;
  const accentColor = accent ?? 'var(--primary)';

  return (
    <div className={`space-y-3 ${className}`}>
      {!compact ? (
        <SegmentPanel title="Reporting window" accent={accent} tone="brand">
          <p className="text-sm font-bold text-foreground">{ledger.windowLine}</p>
          {ledger.plannedLines[1] ? (
            <p className="mt-1.5 text-xs text-muted-foreground">{ledger.plannedLines[1]}</p>
          ) : null}
        </SegmentPanel>
      ) : null}

      {narrativeProse ? (
        <SegmentPanel
          title="What we taught"
          step={compact ? undefined : 1 + stepOffset}
          accent={accent}
          tone="brand"
        >
          <p className={`leading-relaxed text-foreground ${compact ? 'text-xs' : 'text-sm'}`}>
            {narrativeProse}
          </p>
        </SegmentPanel>
      ) : null}

      {ledger.topicRows.length ? (
        <SegmentPanel
          title="Programme & course delivery"
          step={compact ? undefined : (narrativeProse ? 2 : 1) + stepOffset}
          accent={accent}
        >
          <TopicTable rows={ledger.topicRows} accent={accentColor} />
          {ledger.pathNote ? (
            <p className="mt-3 rounded-lg border border-dashed border-border/70 bg-muted/20 px-3 py-2 text-[11px] italic text-muted-foreground">
              {ledger.pathNote}
            </p>
          ) : null}
        </SegmentPanel>
      ) : null}

      <SegmentGrid columns={1} className={compact ? '' : 'lg:grid-cols-2'}>
        <SegmentPanel
          title="Evidence captured"
          step={compact ? undefined : (ledger.topicRows.length ? 3 : narrativeProse ? 2 : 1) + stepOffset}
          accent="#059669"
          tone="emerald"
          fillHeight
        >
          <BulletLines items={ledger.evidenceLines} bulletColor="#059669" />
        </SegmentPanel>
        {ledger.nextLines.length ? (
          <SegmentPanel title={NEXT_TERM_FOCUS_LABEL} accent={accent} tone="brand" fillHeight>
            <BulletLines items={ledger.nextLines} bulletColor={accentColor} />
          </SegmentPanel>
        ) : null}
      </SegmentGrid>
    </div>
  );
}
