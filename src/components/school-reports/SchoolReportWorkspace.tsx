'use client';

import Link from 'next/link';
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
  onEditorSynced,
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
  onSave: (opts?: SaveOpts) => Promise<{ ok: boolean; published?: boolean }>;
  onDelete: () => Promise<void>;
  onTitleChange: (title: string) => Promise<void>;
  onRegenerate: (refreshNarrative?: boolean) => Promise<void>;
  onRefreshAndReady?: () => Promise<void>;
  onEditorSynced: () => void;
  onDeliveryApplied: () => Promise<void>;
  onLockVersionChange?: (next: number) => void;
  onRetrySave?: () => Promise<void>;
  onReload?: () => Promise<void>;
  onRestoreLocalDraft?: () => void;
  backHref?: string;
}) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href={backHref} className="rounded-xl border border-border bg-card hover:bg-muted text-foreground px-4 py-2 text-sm font-bold shadow-sm transition-all">
          Back to reports
        </Link>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/dashboard/school-reports/${report.id}/analytics`}
            className="rounded-xl border border-border bg-card hover:bg-muted text-foreground px-4 py-2 text-sm font-bold shadow-sm transition-all"
          >
            Insights
          </Link>
          <Link
            href={`/dashboard/school-reports/${report.id}/preview`}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-black text-primary-foreground shadow-sm transition-all hover:bg-primary/90"
          >
            Client PDF & print
          </Link>
          <Link
            href={`/dashboard/school-reports/${report.id}/history`}
            className="rounded-xl border border-border bg-card hover:bg-muted text-foreground px-4 py-2 text-sm font-bold shadow-sm transition-all"
          >
            Activity & revisions
          </Link>
        </div>
      </div>

      <section aria-label="Report safeguards" className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-4">
          <p className="text-xs font-black uppercase tracking-wide text-emerald-700 dark:text-emerald-300">Manual records protected</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">Teacher results and attendance rolls are read as evidence and are never rewritten here.</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs font-black uppercase tracking-wide text-primary">Curriculum connected</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">The report reads official delivery scope without changing curriculum direction.</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs font-black uppercase tracking-wide text-primary">Client output</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">Review the live book, then open the polished PDF before publishing or sharing.</p>
        </div>
      </section>

      <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
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
          onEditorSynced={onEditorSynced}
          onDeliveryApplied={onDeliveryApplied}
          onLockVersionChange={onLockVersionChange}
          onRetrySave={onRetrySave}
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
                className="rounded-lg border border-border bg-background hover:bg-muted text-foreground px-3 py-1.5 text-xs font-black transition-colors"
              >
                Reload latest
              </button>
            ) : null}
            {saveStatus.hasLocalDraft && onRestoreLocalDraft ? (
              <button
                type="button"
                onClick={onRestoreLocalDraft}
                className="rounded-lg border border-border bg-background hover:bg-muted text-foreground px-3 py-1.5 text-xs font-black transition-colors"
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
