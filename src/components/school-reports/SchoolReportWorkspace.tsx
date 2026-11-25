'use client';

import { useState } from 'react';
import {
  SchoolReportBuilderCanvas,
  type EditorState,
} from '@/components/school-reports/SchoolReportBuilderCanvas';
import { ReportCollaborationPanel } from '@/components/school-reports/ReportCollaborationPanel';
import type { SchoolReportDesignSettings } from '@/lib/school-reports/design';
import type { SchoolPerformanceReportRow } from '@/lib/school-reports/types';

type SaveOpts = {
  status?: 'draft' | 'published' | 'archived';
  forcePublish?: boolean;
  forcePublishReason?: string;
  statusOnly?: boolean;
  withdrawReason?: string;
};

export function SchoolReportWorkspace({
  report,
  canManage,
  role,
  editor,
  setEditor,
  design,
  setDesign,
  working,
  saveStatus,
  onSave,
  onDelete,
  onTitleChange,
  onRegenerate,
  onRefreshAndReady,
  onDeliveryApplied,
  onLockVersionChange,
  onRetrySave,
  onReload,
  onRestoreLocalDraft,
  backHref = '/dashboard/school-reports',
}: {
  report: SchoolPerformanceReportRow;
  canManage: boolean;
  role: string;
  editor: EditorState;
  setEditor: (value: EditorState | ((prev: EditorState) => EditorState)) => void;
  design: SchoolReportDesignSettings;
  setDesign: (value: SchoolReportDesignSettings | ((prev: SchoolReportDesignSettings) => SchoolReportDesignSettings)) => void;
  working: string;
  saveStatus: {
    isDirty: boolean;
    lastSavedAt: Date | null;
    autosaving: boolean;
    saveFailed?: boolean;
    offline?: boolean;
    hasLocalDraft?: boolean;
  };
  onSave: (opts?: SaveOpts) => Promise<{ ok: boolean; published?: boolean; lockVersion?: number }>;
  onDelete: () => Promise<void>;
  onTitleChange: (title: string) => Promise<void>;
  onRegenerate: (refreshNarrative?: boolean) => Promise<void>;
  onRefreshAndReady?: () => Promise<void>;
  onDeliveryApplied: () => Promise<void>;
  onLockVersionChange?: (next: number) => void;
  onRetrySave?: () => Promise<void>;
  onReload?: () => Promise<void>;
  onRestoreLocalDraft?: () => void;
  backHref?: string;
}) {
  const [copiedSummary, setCopiedSummary] = useState(false);

  const handleCopyPrincipalSummary = async () => {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://www.rillcod.com';
    const r = report as any;
    const schoolTitle = r.school_name || r.schools?.name || report.title || 'Partner School';
    const term = [r.term_label || r.report_term, r.academic_year || r.report_period].filter(Boolean).join(' · ');
    const snap = (r.snapshot && typeof r.snapshot === 'object' ? r.snapshot : {}) as Record<string, any>;
    const summary = snap.summary && typeof snap.summary === 'object' ? snap.summary : {};
    const enrolled = summary.activeStudents ?? snap.total_students ?? snap.enrolled_students ?? snap.active_students ?? null;
    const avgScore = summary.averageScore ?? snap.average_score ?? snap.avg_score ?? null;
    const lines = [
      `*Rillcod Technologies — Term Performance Report*`,
      `School: *${schoolTitle}*${term ? ` (${term})` : ''}`,
      enrolled != null ? `Active Learners Assessed: *${enrolled}*` : null,
      avgScore != null ? `Average Performance: *${Math.round(Number(avgScore))}%*` : null,
      `Status: *${report.status === 'published' ? 'Published' : 'Ready for Review'}*`,
      `View / Download PDF: ${origin}/dashboard/school-reports/${report.id}/preview`,
    ].filter(Boolean);
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopiedSummary(true);
      setTimeout(() => setCopiedSummary(false), 2200);
    } catch {
      /* ignore clipboard error */
    }
  };

  return (
    <div className="space-y-4">
      <div className="w-full min-w-0 overflow-hidden rounded-2xl sm:rounded-3xl border border-border bg-card shadow-sm">
        <SchoolReportBuilderCanvas
          report={report}
          canManage={canManage}
          role={role}
          editor={editor}
          setEditor={setEditor}
          design={design}
          setDesign={setDesign}
          working={working}
          saveStatus={saveStatus}
          onSave={onSave}
          onDelete={onDelete}
          onTitleChange={onTitleChange}
          onRegenerate={onRegenerate}
          onRefreshAndReady={onRefreshAndReady}
          onDeliveryApplied={onDeliveryApplied}
          onLockVersionChange={onLockVersionChange}
          onRetrySave={onRetrySave}
          backHref={backHref}
          onCopyPrincipalSummary={handleCopyPrincipalSummary}
          copiedPrincipalSummary={copiedSummary}
        />
      </div>

      {canManage ? (
        <ReportCollaborationPanel
          reportId={report.id}
          historyHref={`/dashboard/school-reports/${report.id}/history`}
          reportStatus={report.status}
        />
      ) : null}

      {saveStatus.saveFailed && (onReload || onRestoreLocalDraft) ? (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 dark:bg-amber-500/15 p-4 text-sm">
          <p className="font-black text-amber-800 dark:text-amber-200">Conflict or save failure detected</p>
          <p className="mt-1 text-amber-900 dark:text-amber-100/90">
            Another staff member may have saved changes, or your connection dropped. Reload the latest version or restore
            your local draft.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {onReload ? (
              <button
                type="button"
                onClick={() => void onReload()}
                className="min-h-10 rounded-lg border border-border bg-background hover:bg-muted text-foreground px-3 py-1.5 text-xs font-black transition-colors"
              >
                Reload latest
              </button>
            ) : null}
            {saveStatus.hasLocalDraft && onRestoreLocalDraft ? (
              <button
                type="button"
                onClick={onRestoreLocalDraft}
                className="min-h-10 rounded-lg border border-border bg-background hover:bg-muted text-foreground px-3 py-1.5 text-xs font-black transition-colors"
              >
                Copy local draft to editor
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
