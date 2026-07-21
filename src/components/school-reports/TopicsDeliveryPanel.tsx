'use client';

import { ArrowPathIcon, SparklesIcon } from '@/lib/icons';
import { buildDeliveryContext } from '@/lib/school-reports/delivered-topics';
import { DeliveryLedgerView } from '@/components/school-reports/DeliveryLedgerView';
import { SegmentPanel } from '@/components/school-reports/SegmentPanel';
import { buildDeliveryLedger } from '@/lib/school-reports/delivery-structure';
import { resolveSchoolReportInsights } from '@/lib/school-reports/insights';
import type { SchoolReportSnapshot } from '@/lib/school-reports/types';

type Props = {
  snapshot: SchoolReportSnapshot;
  topicsValue: string;
  busy?: boolean;
  aiWorking?: boolean;
  onInsertDraft: (draft: string) => void;
  onGenerateAi: () => void;
};

export function TopicsDeliveryPanel({
  snapshot,
  topicsValue,
  busy,
  aiWorking,
  onInsertDraft,
  onGenerateAi,
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

  return (
    <div className="mb-4 space-y-3">
      <SegmentPanel title="Delivery flow" accent="#7a0606" tone="brand">
        <ol className="space-y-1.5 text-[11px] text-muted-foreground">
          <li>
            <span className="font-black text-foreground">1. Detect</span> — programme & course ranges from snapshot
          </li>
          <li>
            <span className="font-black text-foreground">2. Draft</span> — auto-fill or AI from matched aggregate data
          </li>
          <li>
            <span className="font-black text-foreground">3. Edit</span> — refine the paragraph below for the PDF
          </li>
        </ol>
        <div className="mt-3 flex flex-wrap gap-2 border-t border-border/60 pt-3">
          {hasDraft ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => onInsertDraft(ctx.draftParagraph)}
              className="inline-flex items-center gap-1 rounded-lg border border-emerald-600/40 bg-emerald-500/10 px-2.5 py-1.5 text-[11px] font-black text-emerald-800 disabled:opacity-50 dark:text-emerald-200"
            >
              {isEmpty ? 'Step 2 · Auto-fill from data' : 'Replace with data draft'}
            </button>
          ) : null}
          <button
            type="button"
            disabled={busy}
            onClick={onGenerateAi}
            className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 text-[11px] font-black text-white disabled:opacity-50"
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

      <SegmentPanel title="Detected delivery structure" step={1} accent="#7a0606">
        <DeliveryLedgerView ledger={ledger} variant="compact" accent="#7a0606" />
      </SegmentPanel>
    </div>
  );
}
