'use client';

import { useState } from 'react';
import { ArrowPathIcon, SparklesIcon } from '@/lib/icons';
import { DeliveryTopicsPicker } from '@/components/school-reports/DeliveryTopicsPicker';
import { ExpandedNarrativePreview } from '@/components/school-reports/ExpandedNarrativePreview';
import { WhatWeTaughtPreview } from '@/components/school-reports/WhatWeTaughtPreview';
import { buildDeliveryContext, buildReportTopicsPresentation } from '@/lib/school-reports/delivered-topics';
import { LEADERSHIP_REPORT_STORY_HINT } from '@/lib/school-reports/leadership-story';
import {
  resolveLeadershipNarrativeForDisplay,
  type TopicsCoveredPresentation,
} from '@/lib/school-reports/topics-covered-presentation';
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
  onLiveTopicsPresentationChange?: (presentation: TopicsCoveredPresentation | null) => void;
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
  onLiveTopicsPresentationChange,
}: Props) {
  const [livePreview, setLivePreview] = useState<TopicsCoveredPresentation | null>(null);
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

  const savedPreview = buildReportTopicsPresentation(snapshot);
  const previewPresentation = livePreview || savedPreview;
  const previewIsLive = Boolean(livePreview);
  const enrolledCourses = snapshot.schoolProgrammes ?? [];
  const leadershipNarrative = resolveLeadershipNarrativeForDisplay(topicsValue, previewPresentation, {
    fallbackDraft: ctx.draftParagraph,
  });
  const hasStructuredMirror =
    Boolean(topicsValue.trim()) && !leadershipNarrative && Boolean(previewPresentation?.sections?.length);

  return (
    <div className="mb-4 space-y-3">
      {autoApplied ? (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-900 dark:text-emerald-200">
          <span className="font-black">Auto-applied delivery</span>
          {' '}from {deliveryDecl?.autoSource === 'tracking' ? 'week tracking' : 'programme catalog'}.
          Adjust topics below and apply to override — manual picks are preserved on refresh.
        </div>
      ) : deliveryDecl?.manualOverride ? (
        <div className="rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-foreground">
          <span className="font-black">Manual delivery confirmed</span> — refresh will keep your topic selection.
        </div>
      ) : !deliveryConfirmed ? (
        <div className="rounded-xl border border-amber-500/50 bg-amber-500/15 px-3.5 py-2.5 text-xs font-semibold text-amber-950 dark:text-amber-100">
          <span className="font-black">Delivery not confirmed yet.</span>{' '}
          Tick topics below — the preview updates as you go. Click Apply to save them on this draft.
        </div>
      ) : null}

      <DeliveryTopicsPicker
        reportId={reportId}
        lockVersion={lockVersion}
        schoolName={snapshot.school?.name}
        termLabel={snapshot.period?.termLabel}
        onLivePreviewChange={(presentation) => {
          setLivePreview(presentation);
          onLiveTopicsPresentationChange?.(presentation);
        }}
        onApplied={(topicsCovered) => {
          if (topicsCovered.trim()) onInsertDraft(topicsCovered);
          void onDeliveryApplied();
        }}
        onLockVersionChange={onLockVersionChange}
      />

      {previewPresentation ? (
        <div className="space-y-2">
          {previewIsLive ? (
            <p className="text-[11px] font-bold text-primary">Live preview — apply to save on this draft</p>
          ) : null}
          <WhatWeTaughtPreview presentation={previewPresentation} enrolledCourses={enrolledCourses} />
        </div>
      ) : enrolledCourses.length ? (
        <div className="rounded-2xl border border-dashed border-primary/30 bg-primary/[0.03] px-4 py-5 text-center">
          <p className="text-sm font-black text-foreground">What we taught preview</p>
          <p className="mt-2 text-[11px] text-muted-foreground">
            {enrolledCourses.length} course{enrolledCourses.length === 1 ? '' : 's'} enrolled — tick topics above to
            fill this section.
          </p>
        </div>
      ) : null}

      {leadershipNarrative ? (
        <ExpandedNarrativePreview
          body={leadershipNarrative}
          title="Report story"
          subtitle={LEADERSHIP_REPORT_STORY_HINT}
        />
      ) : hasStructuredMirror ? (
        <div className="rounded-2xl border border-dashed border-border/70 bg-muted/20 px-4 py-5 text-center">
          <p className="text-sm font-black text-foreground">Add the report story</p>
          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
            {LEADERSHIP_REPORT_STORY_HINT} Tap Smart AI to generate it, or write two sentences yourself.
          </p>
        </div>
      ) : aiWorking ? (
        <div className="rounded-2xl border border-dashed border-emerald-500/30 bg-emerald-500/5 px-4 py-5 text-center">
          <p className="text-sm font-black text-emerald-800 dark:text-emerald-200">Generating report story…</p>
          <p className="mt-2 text-[11px] text-muted-foreground">A short Nigeria-context narrative will appear here.</p>
        </div>
      ) : null}

      <SegmentPanel title="Delivery flow" tone="brand">
        <ol className="space-y-1.5 text-[11px] text-muted-foreground">
          <li>
            <span className="font-black text-foreground">
              1. {deliveryConfirmed ? 'Adjust if needed' : 'Confirm topics'}
            </span>
            {' '}— tick what was taught; preview updates immediately
          </li>
          <li>
            <span className="font-black text-foreground">2. Apply</span> — save picks and span them across the report week window
          </li>
          <li>
            <span className="font-black text-foreground">3. Edit</span> — refine the paragraph below for the PDF
          </li>
        </ol>
        <div className="mt-3 flex flex-col gap-2.5 sm:flex-row sm:flex-wrap">
          {hasDraft ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => onInsertDraft(ctx.draftParagraph)}
              className="inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-emerald-600/40 bg-emerald-500/10 px-3.5 py-2 text-xs font-bold text-emerald-800 hover:bg-emerald-500/20 shadow-2xs transition-all disabled:opacity-50 dark:text-emerald-200 sm:w-auto"
            >
              {isEmpty ? 'Insert data draft' : 'Replace with data draft'}
            </button>
          ) : null}
          <button
            type="button"
            disabled={busy}
            onClick={onGenerateAi}
            className="inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 px-4 py-2 text-xs font-black text-white hover:from-blue-700 hover:to-purple-700 shadow-sm transition-all disabled:opacity-50 sm:w-auto"
          >
            {aiWorking ? (
              <ArrowPathIcon className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <SparklesIcon className="h-3.5 w-3.5" />
            )}
            Generate report story
          </button>
        </div>
      </SegmentPanel>

      <SegmentPanel title="Delivery evidence" step={1}>
        <DeliveryLedgerView ledger={ledger} variant="compact" />
      </SegmentPanel>
    </div>
  );
}
