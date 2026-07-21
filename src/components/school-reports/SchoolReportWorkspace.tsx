'use client';

import Link from 'next/link';
import {
  SchoolReportBuilderCanvas,
  type EditorState,
} from '@/components/school-reports/SchoolReportBuilderCanvas';
import { SchoolReportWorkflowRail } from '@/components/school-reports/SchoolReportWorkflowRail';
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
  onRetrySave?: () => Promise<void>;
  onReload?: () => Promise<void>;
  onRestoreLocalDraft?: () => void;
  backHref?: string;
}) {
  return (
    <div className="space-y-6">
      <SchoolReportWorkflowRail
        reportId={report.id}
        activeStep="review"
        published={report.status === 'published'}
        canManage={canManage}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href={backHref} className="rounded-xl border border-border px-4 py-2 text-sm font-black">
          Back to reports
        </Link>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/dashboard/school-reports/${report.id}/analytics`}
            className="rounded-xl border border-border px-4 py-2 text-sm font-black"
          >
            Analytics
          </Link>
          <Link
            href={`/dashboard/school-reports/${report.id}/preview`}
            className="rounded-xl border border-border px-4 py-2 text-sm font-black"
          >
            Full preview
          </Link>
          <Link
            href={`/dashboard/school-reports/${report.id}/history`}
            className="rounded-xl border border-border px-4 py-2 text-sm font-black"
          >
            Revision history
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
          onRetrySave={onRetrySave}
        />
      </div>

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
