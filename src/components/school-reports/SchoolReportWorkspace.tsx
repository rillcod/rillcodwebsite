'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  SchoolReportBuilderCanvas,
  type EditorState,
} from '@/components/school-reports/SchoolReportBuilderCanvas';
import { SchoolReportAnalyticsPanel } from '@/components/school-reports/SchoolReportAnalyticsPanel';
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
  backHref?: string;
}) {
  const [showCharts, setShowCharts] = useState(true);

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
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setShowCharts((v) => !v)}
          className="rounded-xl border border-border px-4 py-2 text-sm font-black"
        >
          {showCharts ? 'Hide analytics canvas' : 'Open analytics canvas'}
        </button>
      </div>

      {showCharts ? <SchoolReportAnalyticsPanel report={report} /> : null}
    </div>
  );
}
