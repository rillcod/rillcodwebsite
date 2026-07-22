'use client';

import { ArrowPathIcon, SparklesIcon } from '@/lib/icons';
import { DeliveryTopicsPicker } from '@/components/school-reports/DeliveryTopicsPicker';
import { ExpandedNarrativePreview } from '@/components/school-reports/ExpandedNarrativePreview';
import { WhatWeTaughtPreview } from '@/components/school-reports/WhatWeTaughtPreview';
import { buildDeliveryContext, buildReportTopicsPresentation } from '@/lib/school-reports/delivered-topics';
import { DeliveryLedgerView } from '@/components/school-reports/DeliveryLedgerView';
import { SegmentPanel } from '@/components/school-reports/SegmentPanel';
import { buildDeliveryLedger } from '@/lib/school-reports/delivery-structure';
import { resolveSchoolReportInsights } from '@/lib/school-reports/insights';
import type { SchoolReportSnapshot } from '@/lib/school-reports/types';

type Props = {
  reportId: string;
  lockVersion: number;
  snapshot: SchoolReportSnapshot;
  topicsValue: string;
  busy?: boolean;
  aiWorking?: boolean;
  onInsertDraft: (draft: string) => void;
  onGenerateAi: () => void;
  onDeliveryApplied: () => void;
  onLockVersionChange?: (next: number) => void;
};

export function TopicsDeliveryPanel({
  reportId,
  lockVersion,
  snapshot,
  topicsValue,
  busy,
  aiWorking,
  onInsertDraft,
  onGenerateAi,
  onDeliveryApplied,
  onLockVersionChange,
}: Props) {
  const insights = resolveSchoolReportInsights(snapshot);
  const ctx = buildDeliveryContext(snapshot);
  const ledger = insights.deliveryLedger || buildDeliveryLedger(snapshot, {
    nextLines: insights.deliveryCommitment?.next || insights.nextModuleFocus || [],
    curriculumRange:
      snapshot.period?.curriculumStart && snapshot.period?.curriculumEnd
        ? `Term ${snapshot.period.curriculumStart.term} Week ${snapshot.period.curriculumStart.week} – Term ${snapshot.period.curriculumEnd.term} Week ${snapshot.period.curriculumEnd.week}`
        : snapshot.period?.termLabel || 'this term',
    programmeNames: Array.from(
      new Set((snapshot.curriculum?.courses || []).map((row) => row.programme).filter(Boolean)),
    ),
    evidenceQualityPct: insights.evidenceQualityPct,
  });

  const hasDraft = Boolean(ctx.draftParagraph.trim());
  const isEmpty = !topicsValue.trim();
  const deliveryDecl = snapshot.deliveryDeclaration;
  const autoApplied = deliveryDecl?.autoApplied && !deliveryDecl?.manualOverride;
  const deliveryConfirmed = Boolean(deliveryDecl?.updatedAt);

  const formattedPreview = buildReportTopicsPresentation(snapshot);
  const enrolledCourses = snapshot.schoolProgrammes ?? [];

  return (
    <div className="mb-4 space-y-3">
      {autoApplied ? (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[11px] text-emerald-950 dark:text-emerald-100">
          <span className="font-black">Auto-applied delivery</span>
          {' '}from {deliveryDecl?.autoSource === 'tracking' ? 'week tracking' : 'programme catalog'}.
          Adjust topics below and apply to override — manual picks are preserved on refresh.
        </div>
      ) : deliveryDecl?.manualOverride ? (
        <div className="rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 text-[11px] text-foreground">
          <span className="font-black">Manual delivery confirmed</span> — refresh will keep your topic selection.
        </div>
      ) : !deliveryConfirmed ? (
        <div className="rounded-xl border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-950 dark:text-amber-100">
          <span className="font-black">Delivery not confirmed yet.</span>{' '}
          Tick the topics actually taught below, apply, then generate or edit the narrative — you can complete this any time while the report stays in draft.
        </div>
      ) : null}

      {formattedPreview ? (
        <WhatWeTaughtPreview presentation={formattedPreview} enrolledCourses={enrolledCourses} />
      ) : enrolledCourses.length ? (
        <div className="rounded-2xl border border-dashed border-primary/30 bg-primary/[0.03] px-4 py-5 text-center">
          <p className="text-sm font-black text-foreground">What we taught</p>
          <p className="mt-2 text-[11px] text-muted-foreground">
            {enrolledCourses.length} course{enrolledCourses.length === 1 ? '' : 's'} enrolled —{' '}
            {deliveryConfirmed
              ? 'adjust topics below only if setup delivery needs changing.'
              : 'select topics below and apply to confirm what was taught.'}
          </p>
        </div>
      ) : null}

      {topicsValue.trim() ? (
        <ExpandedNarrativePreview
          body={topicsValue}
          title="AI / narrative preview"
          subtitle="Expanded leadership wording from Smart AI or your edits — visible in the live book preview and PDF."
        />
      ) : aiWorking ? (
        <div className="rounded-2xl border border-dashed border-emerald-500/30 bg-emerald-500/5 px-4 py-5 text-center">
          <p className="text-sm font-black text-emerald-800 dark:text-emerald-200">Generating expanded narrative…</p>
          <p className="mt-2 text-[11px] text-muted-foreground">Preview will appear here when AI finishes.</p>
        </div>
      ) : null}

      <DeliveryTopicsPicker
        reportId={reportId}
        lockVersion={lockVersion}
        disabled={busy}
        onApplied={() => onDeliveryApplied()}
        onLockVersionChange={onLockVersionChange}
      />

      <SegmentPanel title="Delivery flow" tone="brand">
        <ol className="space-y-1.5 text-[11px] text-muted-foreground">
          <li>
            <span className="font-black text-foreground">
              1. {deliveryConfirmed ? 'Adjust if needed' : 'Confirm topics'}
            </span>
            {' '}—{' '}
            {deliveryConfirmed
              ? 'delivery was confirmed in setup or a prior apply; tick here to override'
              : 'tick what was taught, then apply — saved on this draft until you publish'}
          </li>
          <li>
            <span className="font-black text-foreground">2. Span</span> — apply to spread topics across the report week window
          </li>
          <li>
            <span className="font-black text-foreground">3. Edit</span> — refine the paragraph below for the PDF
          </li>
        </ol>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {hasDraft ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => onInsertDraft(ctx.draftParagraph)}
              className="inline-flex min-h-11 w-full items-center justify-center gap-1 rounded-lg border border-emerald-600/40 bg-emerald-500/10 px-2.5 py-2 text-[11px] font-black text-emerald-800 disabled:opacity-50 dark:text-emerald-200 sm:w-auto"
            >
              {isEmpty ? 'Step 2 · Auto-fill from data' : 'Replace with data draft'}
            </button>
          ) : null}
          <button
            type="button"
            disabled={busy}
            onClick={onGenerateAi}
            className="inline-flex min-h-11 w-full items-center justify-center gap-1 rounded-lg bg-primary px-2.5 py-2 text-[11px] font-black text-white disabled:opacity-50 sm:w-auto"
          >
            {aiWorking ? (
              <ArrowPathIcon className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <SparklesIcon className="h-3.5 w-3.5" />
            )}
            Step 2 · Smart AI paragraph
          </button>
        </div>
      </SegmentPanel>

      <SegmentPanel title="Detected delivery structure" step={1}>
        <DeliveryLedgerView ledger={ledger} variant="compact" />
      </SegmentPanel>
    </div>
  );
}
