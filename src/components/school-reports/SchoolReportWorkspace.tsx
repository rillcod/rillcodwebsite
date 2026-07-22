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
  onSave: (opts?: SaveOpts) => Promise<void>;
  onDelete: () => Promise<void>;
  onTitleChange: (title: string) => Promise<void>;
  onRegenerate: (refreshNarrative?: boolean) => Promise<void>;
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
        <Link href={backHref} className="rounded-xl border border-border px-4 py-2 text-sm font-black">
          Back to reports
        </Link>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/dashboard/school-reports/${report.id}/analytics`}
            className="rounded-xl border border-border px-4 py-2 text-sm font-black"
          >
            Insights
          </Link>
          <Link
            href={`/dashboard/school-reports/${report.id}/preview`}
            className="rounded-xl border border-border px-4 py-2 text-sm font-black"
          >
            Output & PDF
          </Link>
          <Link
            href={`/dashboard/school-reports/${report.id}/history`}
            className="rounded-xl border border-border px-4 py-2 text-sm font-black"
          >
            Activity & revisions
          </Link>
        </div>
      </div>

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
          onEditorSynced={onEditorSynced}
          onDeliveryApplied={onDeliveryApplied}
          onLockVersionChange={onLockVersionChange}
          onRetrySave={onRetrySave}
        />
      </div>

      {canManage ? (
        <section className="rounded-2xl border border-border bg-card p-5">
          <div className="mb-4">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-primary">Team review</p>
            <h2 className="mt-1 text-lg font-black">Comments and readiness discussion</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Keep review comments beside the working report. Revision and audit details remain under Activity.
            </p>
          </div>
          <ReportCollaborationPanel reportId={report.id} />
        </section>
      ) : null}
      {saveStatus.saveFailed && (onReload || onRestoreLocalDraft) ? (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
          <p className="font-black text-amber-800">Conflict or save failure detected</p>
          <p className="mt-1 text-amber-900">
            Another staff member may have saved changes, or your connection dropped. Reload the latest version or restore
            your local draft.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {onReload ? (
              <button
                type="button"
                onClick={() => void onReload()}
                className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-black"
              >
                Reload latest
              </button>
            ) : null}
            {saveStatus.hasLocalDraft && onRestoreLocalDraft ? (
              <button
                type="button"
                onClick={onRestoreLocalDraft}
                className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-black"
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
