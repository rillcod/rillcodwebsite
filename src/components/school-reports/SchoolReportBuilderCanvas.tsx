'use client';

import { startTransition, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowPathIcon,
  ArrowsPointingOutIcon,
  DocumentArrowDownIcon,
  EnvelopeIcon,
  EyeIcon,
  PaintBrushIcon,
  PencilIcon,
  SparklesIcon,
  TrashIcon,
  XMarkIcon,
} from '@/lib/icons';
import { SchoolReportDesignPanel } from '@/components/school-reports/SchoolReportDesignPanel';
import { DataQualityDrawer } from '@/components/school-reports/DataQualityDrawer';
import { SchoolReportEmailDialog } from '@/components/school-reports/SchoolReportEmailDialog';
import { SchoolReportLivePreview } from '@/components/school-reports/SchoolReportLivePreview';
import {
  type SchoolReportDesignSettings,
  type SchoolReportPreviewDevice,
} from '@/lib/school-reports/design';
import type { SchoolPerformanceReportRow, SchoolReportNarrative } from '@/lib/school-reports/types';
import { formatPersonDisplayName, formatSchoolDisplayName } from '@/lib/school-reports/display-labels';
import {
  editorFromNarrative,
  narrativeFromEditor,
  type SchoolReportEditorState,
} from '@/lib/school-reports/editor-state';
import { resolveSchoolReportInsights } from '@/lib/school-reports/insights';
import { buildReportTopicsPresentation } from '@/lib/school-reports/delivered-topics';
import { resolveLeadershipNarrativeForDisplay } from '@/lib/school-reports/topics-covered-presentation';
import { filterNextPhaseItems, resolveCommunityMessageForReport } from '@/lib/school-reports/report-content-dedup';
import { deduplicateNarrativeContent } from '@/lib/school-reports/narrative';
import { SegmentGrid, SegmentPanel } from '@/components/school-reports/SegmentPanel';
import { DeliveryLedgerView } from '@/components/school-reports/DeliveryLedgerView';
import { TopicsDeliveryPanel } from '@/components/school-reports/TopicsDeliveryPanel';

export type EditorState = SchoolReportEditorState;

type FieldKey = keyof EditorState;

const FIELD_META: Array<{ key: FieldKey; label: string; hint: string; rows: number; list?: boolean; featured?: boolean }> = [
  {
    key: 'executiveSummary',
    label: 'Executive summary',
    hint: 'One clear paragraph for school leadership — your voice, not a data dump.',
    rows: 4,
  },
  {
    key: 'topicsCovered',
    label: 'Report story',
    hint: 'One or two sentences for school leaders — no statistics.',
    rows: 4,
    featured: true,
  },
  {
    key: 'achievements',
    label: 'Strengths & excellence',
    hint: 'Factual wins from the data — one per line.',
    rows: 4,
    list: true,
  },
  {
    key: 'concerns',
    label: 'Partnership focus',
    hint: 'What Rillcod and the school will do together — not audit language.',
    rows: 4,
    list: true,
  },
  {
    key: 'recommendations',
    label: 'Recommendations',
    hint: 'One action per line.',
    rows: 4,
    list: true,
  },
  {
    key: 'nextPeriodFocus',
    label: 'Next module focus',
    hint: 'Coherent next steps drawn from learner reports and curriculum — one per line.',
    rows: 4,
    list: true,
  },
];

const pct = (value: number) => `${Number(value || 0).toFixed(value % 1 ? 1 : 0)}%`;
const parseLines = (value: string) => value.split('\n').map((item) => item.trim()).filter(Boolean);
const money = (value: number, currency: string) =>
  new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: currency || 'NGN',
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

type Props = {
  report: SchoolPerformanceReportRow;
  canManage: boolean;
  role?: string;
  editor: EditorState;
  setEditor: (value: EditorState | ((prev: EditorState) => EditorState)) => void;
  design: SchoolReportDesignSettings;
  setDesign: (value: SchoolReportDesignSettings | ((prev: SchoolReportDesignSettings) => SchoolReportDesignSettings)) => void;
  working: string;
  saveStatus?: {
    isDirty: boolean;
    lastSavedAt: Date | null;
    autosaving: boolean;
    saveFailed?: boolean;
    offline?: boolean;
    hasLocalDraft?: boolean;
  };
  onRetrySave?: () => void;
  onSave: (opts?: {
    status?: 'draft' | 'published' | 'archived';
    forcePublish?: boolean;
    forcePublishReason?: string;
    statusOnly?: boolean;
    withdrawReason?: string;
  }) => Promise<{ ok: boolean; published?: boolean }>;
  onRegenerate: (refreshNarrative?: boolean) => Promise<void>;
  onRefreshAndReady?: () => Promise<void>;
  onDelete?: () => Promise<void>;
  onTitleChange?: (title: string) => Promise<void>;
  onBack?: () => void;
  onEditorSynced?: () => void;
  onNarrativeGenerated?: (narrative: SchoolReportNarrative) => void;
  onDeliveryApplied?: () => Promise<void>;
  onLockVersionChange?: (next: number) => void;
};

export function SchoolReportBuilderCanvas({
  report,
  canManage,
  role = '',
  editor,
  setEditor,
  design,
  setDesign,
  working,
  saveStatus,
  onSave,
  onRetrySave,
  onRegenerate,
  onRefreshAndReady,
  onDelete,
  onTitleChange,
  onBack,
  onEditorSynced,
  onNarrativeGenerated,
  onDeliveryApplied,
  onLockVersionChange,
}: Props) {
  const published = report.status === 'published';
  const isAdmin = role === 'admin';
  const [tab, setTab] = useState<'write' | 'briefing' | 'design' | 'data'>('write');
  const [previewOpen, setPreviewOpen] = useState(true);
  const [hasPreviewed, setHasPreviewed] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [titleDraft, setTitleDraft] = useState(report.title);
  const [aiWorking, setAiWorking] = useState('');
  const [aiNote, setAiNote] = useState('');
  const [aiError, setAiError] = useState('');
  const [dataQualityOpen, setDataQualityOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const snapshot = report.snapshot;
  const insights = resolveSchoolReportInsights(snapshot);
  const leadershipNarrative = resolveLeadershipNarrativeForDisplay(
    report.narrative.topicsCovered,
    buildReportTopicsPresentation(snapshot),
  );
  const filteredNextPhaseSchool = (insights.nextPhaseSchool || [])
    .map((phase) => ({
      ...phase,
      actions: filterNextPhaseItems(phase.actions, [
        report.narrative.executiveSummary,
        leadershipNarrative,
        ...(insights.deliveryLedger?.nextLines || []),
        ...(report.narrative.nextPeriodFocus || []),
      ]),
    }))
    .filter((phase) => phase.actions.length > 0);
  const completeness = snapshot.completeness;
  const finance = snapshot.finance;
  const billingHref = finance?.billingHref || '/dashboard/school-billing';
  const excludeBilling = design.excludeBilling === true;

  useEffect(() => {
    setTitleDraft(report.title);
  }, [report.id, report.title]);

  useEffect(() => {
    if (previewOpen) setHasPreviewed(true);
  }, [previewOpen]);

  async function openPdfPreview() {
    if (canManage && !published && saveStatus?.isDirty) {
      await onSave();
    }
    window.open(`/api/school-performance-reports/${report.id}/pdf`, '_blank', 'noopener,noreferrer');
  }

  function setPreviewDevice(device: SchoolReportPreviewDevice) {
    startTransition(() => {
      setDesign((prev) => ({ ...prev, previewDevice: device }));
    });
    setPreviewOpen(true);
  }

  const previewNarrative = useMemo<SchoolReportNarrative>(() => narrativeFromEditor(editor), [editor]);

  const previewPanel = (
    <>
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-muted-foreground">Live book preview</p>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground">Layout:</span>
          {(['mobile', 'tablet', 'desktop'] as const).map((device) => (
            <button
              key={device}
              type="button"
              disabled={published && !canManage}
              onClick={() => setPreviewDevice(device)}
              className={`min-h-10 rounded-lg px-3 py-1.5 text-[10px] font-black capitalize sm:min-h-9 ${
                design.previewDevice === device
                  ? 'bg-primary text-white'
                  : 'border border-border bg-background text-muted-foreground'
              }`}
            >
              {device}
            </button>
          ))}
        </div>
      </div>
      <SchoolReportLivePreview
        report={report}
        narrative={previewNarrative}
        design={design}
        billingHref={billingHref}
        draft={!published}
      />
    </>
  );

  function patchField(key: FieldKey, value: string) {
    startTransition(() => {
      setEditor((prev) => ({ ...prev, [key]: value }));
    });
  }

  async function generateAi(fields?: FieldKey[]) {
    if (published || !canManage) return;
    const key = fields?.length === 1 ? `ai-${fields[0]}` : 'ai-all';
    setAiWorking(key);
    setAiError('');
    setAiNote('');
    try {
      const response = await fetch(`/api/school-performance-reports/${report.id}/narrative`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: fields?.length ? fields : undefined, persist: true }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Unable to generate wording.');
      const narrative = json.narrative as SchoolReportNarrative;
      startTransition(() => {
        setEditor(editorFromNarrative(narrative));
      });
      onNarrativeGenerated?.(narrative);
      onEditorSynced?.();
      setAiNote(
        json.usedAi
          ? `Generated in ${Math.max(1, Math.round((json.durationMs || 0) / 1000))}s · review before saving`
          : 'Factual draft ready (AI key not configured) · review before saving',
      );
      setTab('write');
      setPreviewOpen(true);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Unable to generate wording.');
    } finally {
      setAiWorking('');
    }
  }

  const busy = Boolean(working || aiWorking);
  const canPublish = completeness?.readyToPublish ?? false;
  const missingRequired = completeness?.items?.filter((item) => item.required && !item.ok) ?? [];

  async function unlockReport() {
    if (
      !window.confirm(
        'Unlock this report for editing?\n\nIt stays saved but is no longer the live published version until you publish again. The school will not see changes until you re-publish.',
      )
    ) {
      return;
    }
    await onSave({ status: 'draft', statusOnly: true });
  }

  async function archiveReport() {
    if (published) {
      if (role !== 'admin') {
        window.alert('Only administrators can withdraw a published report.');
        return;
      }
      const reason = window.prompt('Withdrawal reason (required, at least 8 characters):');
      if (!reason || reason.trim().length < 8) return;
      if (
        !window.confirm(
          'Withdraw this published report? The school will no longer see it until you publish a new revision.',
        )
      ) {
        return;
      }
      await onSave({ status: 'archived', statusOnly: true, withdrawReason: reason.trim() });
      return;
    }
    if (
      !window.confirm(
        'Archive this report book? It leaves the active slot for this school and term. You can generate a fresh draft later.',
      )
    ) {
      return;
    }
    await onSave({ status: 'archived', statusOnly: true });
  }

  async function publishReport() {
    const result = await onSave({ status: 'published' });
    if (result.ok && result.published) {
      setEmailOpen(true);
    }
  }

  async function adminForcePublish(reason: string) {
    const result = await onSave({
      status: 'published',
      forcePublish: true,
      forcePublishReason: reason,
    });
    if (result.ok && result.published) {
      setEmailOpen(true);
    }
  }

  const publishedAtLabel = report.published_at
    ? new Date(report.published_at).toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : null;

  const shell = (
    <div className={`flex flex-col ${fullscreen ? 'fixed inset-0 z-50 bg-background' : 'min-h-[70vh]'}`}>
      {/* Sticky toolbar */}
      <div className="sticky top-0 z-20 border-b border-border/80 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="flex flex-col gap-3 px-4 py-3 md:flex-row md:items-start md:justify-between md:px-5">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-primary">School report builder</p>
              <span
                className={`rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase ${
                  published
                    ? 'bg-emerald-600 text-white'
                    : 'bg-amber-500/15 text-amber-800 dark:text-amber-200'
                }`}
              >
                {published ? 'Published · locked' : 'Draft · editable'}
              </span>
            </div>
            {canManage && !published && onTitleChange ? (
              <input
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={() => {
                  if (titleDraft.trim() !== report.title && titleDraft.trim().length >= 3) {
                    void onTitleChange(titleDraft);
                  } else {
                    setTitleDraft(report.title);
                  }
                }}
                className="mt-1 w-full rounded-lg border border-transparent bg-transparent px-0 text-lg font-black text-foreground outline-none focus:border-border focus:bg-background focus:px-2 md:text-xl"
              />
            ) : (
              <h2 className="truncate text-lg font-black text-foreground md:text-xl">{report.title}</h2>
            )}
            <p className="truncate text-xs text-muted-foreground">
              {formatSchoolDisplayName(snapshot.school.name)} · {snapshot.period.termLabel} · {snapshot.period.academicYear}
              {report.published_revision_number
                ? ` · Published revision ${report.published_revision_number}`
                : report.working_revision_number
                  ? ` · Working revision ${report.working_revision_number}`
                  : ''}
              {completeness ? ` · Completeness ${completeness.score}%` : ''}
            </p>
            {canManage && !published && saveStatus ? (
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <p className="text-[11px] font-bold text-muted-foreground">
                  {saveStatus.offline
                    ? 'Offline — local draft preserved'
                    : saveStatus.saveFailed
                      ? 'Save failed'
                      : saveStatus.autosaving || working === 'save'
                        ? 'Saving…'
                        : saveStatus.isDirty
                          ? '● Unsaved · autosaves after 8 seconds'
                          : saveStatus.lastSavedAt
                            ? `Saved ${saveStatus.lastSavedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                            : 'All changes saved'}
                  {saveStatus.hasLocalDraft ? ' · local recovery draft' : ''}
                </p>
                {saveStatus.saveFailed && onRetrySave ? (
                  <button
                    type="button"
                    onClick={() => void onRetrySave()}
                    className="rounded-md border border-border px-2 py-0.5 text-[10px] font-black uppercase tracking-wide"
                  >
                    Retry save
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => setDataQualityOpen(true)}
                  className="rounded-md border border-border px-2 py-0.5 text-[10px] font-black uppercase tracking-wide"
                >
                  Data sources
                </button>
              </div>
            ) : null}
          </div>
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center">
            {onBack ? (
              <button
                type="button"
                onClick={onBack}
                className="rounded-xl border border-border px-3 py-2 text-xs font-black hover:border-primary/40 min-h-11 inline-flex items-center justify-center"
              >
                Back
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void openPdfPreview()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-black hover:border-primary/40"
            >
              <DocumentArrowDownIcon className="h-4 w-4" />
              PDF
            </button>
            {canManage ? (
              <button
                type="button"
                onClick={() => setEmailOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-black hover:border-primary/40"
              >
                <EnvelopeIcon className="h-4 w-4" />
                Email
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => {
                setPreviewOpen((v) => !v);
              }}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-black hover:border-primary/40 lg:hidden"
            >
              <EyeIcon className="h-4 w-4" />
              {previewOpen ? 'Hide preview' : 'Show preview'}
            </button>
            <button
              type="button"
              onClick={() => setPreviewOpen((v) => !v)}
              className="hidden items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-black hover:border-primary/40 lg:inline-flex"
            >
              <EyeIcon className="h-4 w-4" />
              {previewOpen ? 'Hide preview' : 'Show preview'}
            </button>
            <button
              type="button"
              onClick={() => setFullscreen((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-black hover:border-primary/40"
            >
              {fullscreen ? <XMarkIcon className="h-4 w-4" /> : <ArrowsPointingOutIcon className="h-4 w-4" />}
              {fullscreen ? 'Exit' : 'Focus'}
            </button>
            {canManage && !published ? (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void generateAi()}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-black text-white disabled:opacity-50"
                >
                  {aiWorking === 'ai-all' ? (
                    <ArrowPathIcon className="h-4 w-4 animate-spin" />
                  ) : (
                    <SparklesIcon className="h-4 w-4" />
                  )}
                  {aiWorking === 'ai-all' ? 'Generating…' : 'Generate all AI'}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void onSave()}
                  className="rounded-xl border border-primary px-3 py-2 text-xs font-black text-primary disabled:opacity-50"
                >
                  {working === 'save' ? 'Saving…' : 'Save wording'}
                </button>
                <button
                  type="button"
                  disabled={busy || !canPublish || !hasPreviewed}
                  title={
                    !hasPreviewed
                      ? 'Open live preview before publishing'
                      : canPublish
                        ? 'Publish for the school'
                        : 'Complete required checklist items first'
                  }
                  onClick={() => void publishReport()}
                  className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white disabled:opacity-50"
                >
                  {working === 'published' ? 'Publishing…' : 'Publish'}
                </button>
                      {canManage && missingRequired.length && role === 'admin' ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      const reason = window.prompt(
                        'Reason to force publish without all checklist items passing (saved in revision log):',
                        'Approved by school lead',
                      );
                      if (reason == null) return;
                      if (!reason.trim()) {
                        window.alert('A reason is required to force-publish.');
                        return;
                      }
                      if (
                        window.confirm(
                          'Publish without all required items? The override reason will be stored in revision history.',
                        )
                      ) {
                        void adminForcePublish(reason.trim());
                      }
                    }}
                    className="rounded-xl border border-amber-600/40 px-3 py-2 text-xs font-black text-amber-700 dark:text-amber-300 dark:bg-amber-500/10 disabled:opacity-50"
                  >
                    Admin publish anyway
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void archiveReport()}
                  className="rounded-xl border border-border px-3 py-2 text-xs font-black disabled:opacity-50"
                >
                  Archive
                </button>
                {onDelete ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void onDelete()}
                    className="inline-flex items-center gap-1 rounded-xl border border-rose-500/40 px-3 py-2 text-xs font-black text-rose-600 dark:text-rose-300 dark:bg-rose-500/10 disabled:opacity-50"
                  >
                    <TrashIcon className="h-4 w-4" />
                    Delete
                  </button>
                ) : null}
              </>
            ) : null}
            {canManage && published ? (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void unlockReport()}
                  className="rounded-xl bg-primary px-4 py-2 text-xs font-black text-primary-foreground disabled:opacity-50 shadow-sm hover:bg-primary/90 transition-all"
                >
                  {working === 'draft' ? 'Unlocking…' : 'Unlock to edit'}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void archiveReport()}
                  className="rounded-xl border border-border px-3 py-2 text-xs font-black disabled:opacity-50"
                >
                  {working === 'archived' ? 'Withdrawing…' : role === 'admin' ? 'Withdraw publication' : 'Withdraw (admin)'}
                </button>
              </>
            ) : null}
          </div>
        </div>
        {canManage && published ? (
          <PublishedReportBanner
            publishedAtLabel={publishedAtLabel}
            busy={busy}
            unlocking={working === 'draft'}
            onUnlock={() => void unlockReport()}
            onArchive={() => void archiveReport()}
          />
        ) : null}
        {canManage && !published && missingRequired.length ? (
          <div className="border-t border-amber-500/30 bg-amber-500/10 dark:bg-amber-500/15 px-4 py-3 md:px-5">
            <p className="break-words text-sm font-bold text-amber-800 dark:text-amber-200">
              Before you can publish: {missingRequired.map((item) => item.label).join(' · ')}
            </p>
            <p className="mt-1 break-words text-xs text-amber-900/80 dark:text-amber-100/90">
              Fix the items in the Source data tab (especially the term invoice), then click Refresh data. Open PDF for the full book layout.
            </p>
          </div>
        ) : null}
        {canManage && !published && onDelete ? (
          <div className="flex flex-col gap-3 border-t border-border/70 bg-muted/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between md:px-5">
            <div className="min-w-0">
              <p className="text-xs font-black text-foreground">Draft book actions</p>
              <p className="text-[11px] text-muted-foreground">
                Archive hides this book from the active term slot. Delete removes it permanently.
              </p>
            </div>
            <div className="grid w-full grid-cols-1 gap-2 sm:flex sm:w-auto sm:flex-wrap">
              <button
                type="button"
                disabled={busy}
                onClick={() => void archiveReport()}
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border bg-background px-4 py-2 text-xs font-black disabled:opacity-50"
              >
                Archive draft
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void onDelete()}
                className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-rose-500 bg-rose-500/10 px-4 py-2 text-xs font-black text-rose-700 dark:text-rose-300 disabled:opacity-50"
              >
                <TrashIcon className="h-4 w-4" />
                {working === 'delete' ? 'Deleting…' : 'Delete draft permanently'}
              </button>
            </div>
          </div>
        ) : null}
        <div className="space-y-2 border-t border-border/40 px-4 pb-3 md:px-5">
          <div className="-mx-1 flex gap-1 overflow-x-auto overscroll-x-contain px-1 pb-1 snap-x snap-mandatory">
          {(
            [
              ['write', 'Narrative', PencilIcon],
              ['briefing', 'Leadership brief', SparklesIcon],
              ['design', 'Layout & PDF', PaintBrushIcon],
              ['data', 'Source data', EyeIcon],
            ] as const
          ).map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`inline-flex min-h-10 shrink-0 snap-start items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-black transition ${
                tab === id ? 'bg-primary text-white shadow-sm' : 'bg-muted text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
          </div>
          {canManage && !published ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void onRegenerate(false)}
                className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-full border border-border px-3.5 py-2 text-xs font-black disabled:opacity-50 sm:flex-none"
              >
                <ArrowPathIcon className={`h-3.5 w-3.5 ${working === 'regenerate' ? 'animate-spin' : ''}`} />
                Refresh data
              </button>
              {onRefreshAndReady ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void onRefreshAndReady()}
                  className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-full bg-primary px-3.5 py-2 text-xs font-black text-white disabled:opacity-50 sm:flex-none"
                  title="Refresh snapshot, auto-apply delivery from tracking, and regenerate AI narrative"
                >
                  <SparklesIcon className={`h-3.5 w-3.5 ${working === 'refresh-ready' ? 'animate-spin' : ''}`} />
                  {working === 'refresh-ready' ? 'Preparing…' : 'Refresh & ready'}
                </button>
              ) : null}
            </div>
          ) : canManage && published ? (
            <p className="text-[11px] font-bold text-muted-foreground">Unlock to refresh data or edit</p>
          ) : null}
        </div>
        {(aiNote || aiError) && (
          <div className="border-t border-border/60 px-4 py-2 text-xs md:px-5">
            {aiError ? <p className="font-bold text-rose-600 dark:text-rose-400">{aiError}</p> : <p className="text-emerald-700 dark:text-emerald-300">{aiNote}</p>}
          </div>
        )}
      </div>

      {/* Workspace — editor + preview stack on mobile, side-by-side on large screens */}
      <div
        className={`grid flex-1 gap-0 ${
          previewOpen ? 'grid-cols-1 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]' : ''
        }`}
      >
        <div className="min-h-0 overflow-y-auto p-3 sm:p-4 md:p-5">
          {tab === 'write' ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-black text-foreground">Write the school’s story</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      You control the narrative — AI drafts from live data, then you edit. Metrics and charts stay in the Source data tab; this tab is what leadership actually reads.
                    </p>
                  </div>
                  {canManage && !published ? (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          const currentNarrative = narrativeFromEditor(editor);
                          const cleaned = deduplicateNarrativeContent(currentNarrative);
                          setEditor(editorFromNarrative(cleaned));
                          setAiNote('Deduplicated and refined items across all sections.');
                        }}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-xs font-black text-primary hover:bg-primary/20 disabled:opacity-50"
                      >
                        Clean & Deduplicate
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void generateAi()}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-xs font-black text-white hover:bg-primary/90 disabled:opacity-50"
                      >
                        <SparklesIcon className="h-4 w-4" />
                        Generate all with AI
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>

              {published || !canManage ? (
                <>
                  {canManage && published ? (
                    <PublishedLockPanel
                      busy={busy}
                      unlocking={working === 'draft'}
                      onUnlock={() => void unlockReport()}
                    />
                  ) : null}
                  <NarrativeRead narrative={report.narrative} />
                </>
              ) : (
                <div className="space-y-4">
                  {FIELD_META.map((field) => (
                    <div
                      key={field.key}
                      className={`rounded-2xl border p-4 shadow-sm transition hover:border-primary/30 ${
                        field.featured ? 'border-primary/30 bg-primary/[0.03]' : 'border-border bg-card'
                      }`}
                    >
                      {field.key === 'topicsCovered' ? (
                        <TopicsDeliveryPanel
                          reportId={report.id}
                          lockVersion={report.lock_version ?? 1}
                          snapshot={snapshot}
                          topicsValue={editor.topicsCovered}
                          busy={busy}
                          aiWorking={aiWorking === 'ai-topicsCovered'}
                          onInsertDraft={(draft) => patchField('topicsCovered', draft)}
                          onGenerateAi={() => void generateAi(['topicsCovered'])}
                          onDeliveryApplied={() => void onDeliveryApplied?.()}
                          onLockVersionChange={onLockVersionChange}
                        />
                      ) : null}
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <label className="text-xs font-black uppercase tracking-wide text-muted-foreground" htmlFor={`sr-${field.key}`}>
                            {field.label}
                          </label>
                          <p className="text-[11px] text-muted-foreground">{field.hint}</p>
                        </div>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void generateAi([field.key])}
                          className={`inline-flex items-center gap-1 rounded-lg border border-primary/30 bg-primary/5 px-2.5 py-1.5 text-[11px] font-black text-primary disabled:opacity-50 ${
                            field.key === 'topicsCovered' ? 'hidden' : ''
                          }`}
                        >
                          {aiWorking === `ai-${field.key}` ? (
                            <ArrowPathIcon className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <SparklesIcon className="h-3.5 w-3.5" />
                          )}
                          Draft with AI
                        </button>
                      </div>
                      <textarea
                        id={`sr-${field.key}`}
                        value={editor[field.key]}
                        rows={field.rows}
                        onChange={(e) => patchField(field.key, e.target.value)}
                        className="w-full resize-y rounded-xl border border-border bg-background p-3.5 text-sm leading-6 outline-none ring-primary/30 transition focus:ring-2"
                        placeholder={field.list ? 'One item per line…' : 'Write or generate with AI…'}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {tab === 'briefing' ? (
            <div className="space-y-4">
              <section className="rounded-2xl border border-primary/20 bg-primary/5 p-5">
                <p className="text-sm font-black">Your wording drives the book</p>
                <p className="mt-2 text-xs text-muted-foreground leading-6">
                  The sections below are auto-generated from snapshot data. Edit the story in the <strong>Narrative</strong> tab — especially{' '}
                  <strong>What we covered this term</strong> — then use <strong>Layout &amp; PDF</strong> to hide sections you do not need in the PDF.
                </p>
                {canManage && !published ? (
                  <button
                    type="button"
                    onClick={() => setTab('write')}
                    className="mt-3 rounded-lg bg-primary px-3 py-1.5 text-xs font-black text-white"
                  >
                    Open Narrative tab
                  </button>
                ) : null}
              </section>
              {insights ? (
                <>
                  <section className="rounded-2xl border border-border bg-card p-5">
                    <p className="text-[11px] font-black uppercase tracking-[0.2em] text-muted-foreground">Snapshot metrics</p>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <MiniKpi label="Evidence" value={`${insights.evidenceQualityPct}%`} />
                      <MiniKpi label="Equity gap" value={`${insights.scoreEquityGap} pts`} />
                      <MiniKpi label="Curriculum" value={`${snapshot.summary.curriculumCoverage}%`} />
                      <MiniKpi label="Excellent" value={insights.excellentLearners} />
                    </div>
                  </section>

                  <section className="rounded-2xl border border-primary/25 bg-card p-5 shadow-sm">
                    <h3 className="font-black">Delivery this term</h3>
                    {insights.deliveryLedger ? (
                      <div className="mt-4">
                        <DeliveryLedgerView
                          ledger={insights.deliveryLedger}
                          narrativeProse={
                            resolveLeadershipNarrativeForDisplay(
                              report.narrative.topicsCovered,
                              buildReportTopicsPresentation(snapshot),
                            ) || undefined
                          }
                          variant="full"
                        />
                      </div>
                    ) : null}
                  </section>

                  {(insights.teacherDelivery || []).length ? (
                    <ListCard title="Who delivered for you" items={insights.teacherDelivery} tone="brand" brandAccent={design.accentColor} />
                  ) : null}

                  <div className="grid gap-4 lg:grid-cols-2">
                    {(insights.learnerHighlights || []).length ? (
                      <ListCard title="Learner highlights" items={insights.learnerHighlights} tone="emerald" />
                    ) : null}
                    {(insights.celebrationWall || []).length ? (
                      <section className="rounded-2xl border border-border bg-card p-5">
                        <h3 className="font-black text-emerald-700 dark:text-emerald-300">Celebration wall</h3>
                        <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                          {insights.celebrationWall.map((row, i) => (
                            <li key={i}>
                              <span className="font-bold text-foreground">{formatPersonDisplayName(row.name)}</span> ({row.className}) — {row.highlight}
                            </li>
                          ))}
                        </ul>
                      </section>
                    ) : null}
                  </div>

                  {(insights.programmeSpotlights?.length ? insights.programmeSpotlights : insights.programmeSpotlight ? [insights.programmeSpotlight] : []).length &&
                  !insights.deliveryLedger?.topicRows?.length ? (
                    <section
                      className="rounded-2xl border p-5"
                      style={{
                        borderColor: `color-mix(in srgb, ${design.accentColor} 25%, transparent)`,
                        backgroundColor: `color-mix(in srgb, ${design.accentColor} 6%, transparent)`,
                      }}
                    >
                      <h3 className="font-black" style={{ color: design.accentColor }}>
                        {(insights.programmeSpotlights?.length || 0) > 1
                          ? 'Programmes & courses this term'
                          : 'Programme spotlight'}
                      </h3>
                      <div className="mt-3 space-y-4">
                        {(insights.programmeSpotlights?.length
                          ? insights.programmeSpotlights
                          : insights.programmeSpotlight
                            ? [insights.programmeSpotlight]
                            : []
                        ).map((row) => (
                          <div key={`${row.programme}-${row.course}`} className="rounded-xl border border-border/70 bg-card/80 p-4">
                            <p className="text-sm font-bold">
                              {row.programme} · {row.course}
                            </p>
                            <p className="mt-1 text-sm text-muted-foreground">{row.summary}</p>
                            <p className="mt-2 text-sm">{row.nextIntro}</p>
                          </div>
                        ))}
                      </div>
                    </section>
                  ) : null}

                  {resolveCommunityMessageForReport(insights.communityMessage, report.narrative.executiveSummary) ? (
                    <section className="rounded-2xl border border-border bg-card p-5">
                      <h3 className="font-black">Message for your school community</h3>
                      <p className="mt-3 text-sm leading-7 text-foreground">
                        {resolveCommunityMessageForReport(insights.communityMessage, report.narrative.executiveSummary)}
                      </p>
                      {insights.suggestedPartnershipReview ? (
                        <p className="mt-3 text-xs italic text-muted-foreground">{insights.suggestedPartnershipReview}</p>
                      ) : null}
                    </section>
                  ) : null}

                  <div className="grid gap-4 lg:grid-cols-2">
                    <ListCard title="Strengths & excellence" items={insights.strengths || []} tone="emerald" />
                    {!snapshot.deliveryDeclaration?.selectedTopics?.length ? (
                      <ListCard title="Academic coverage" items={insights.academicCoverage || []} tone="brand" brandAccent={design.accentColor} />
                    ) : null}
                    <ListCard title="Partnership focus" items={insights.partnershipFocus || []} tone="brand" brandAccent={design.accentColor} />
                    {!insights.deliveryLedger?.nextLines?.length ? (
                      <ListCard title="Next module focus" items={insights.nextModuleFocus || []} tone="emerald" />
                    ) : null}
                    {insights.risks?.length ? (
                      <ListCard title="Cases needing attention" items={insights.risks} tone="rose" />
                    ) : null}
                  </div>
                  {filteredNextPhaseSchool.length ? (
                    <section className="rounded-2xl border border-border bg-card p-5">
                      <h3 className="font-black">Next phase</h3>
                      <div className="mt-4 space-y-4">
                        {filteredNextPhaseSchool.map((phase) => (
                          <div key={phase.phase} className="rounded-xl border border-border/70 bg-muted/20 p-4">
                            <p className="text-sm font-black">{phase.phase}</p>
                            <p className="text-xs text-muted-foreground">{phase.horizon}</p>
                            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                              {phase.actions.map((action, i) => (
                                <li key={i}>{action}</li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    </section>
                  ) : null}
                  {(insights.involvement || []).length ? (
                    <ListCard title="Keep everyone involved" items={insights.involvement} tone="brand" brandAccent={design.accentColor} />
                  ) : null}
                </>
              ) : (
                <EmptyHint
                  title="Refresh snapshot for the briefing layer"
                  body="Academic coverage, partnership focus, and next-module plans appear after you refresh snapshot data."
                  actionLabel={working === 'regenerate' ? 'Refreshing…' : 'Refresh snapshot data'}
                  onAction={canManage ? () => void onRegenerate(false) : undefined}
                  busy={busy}
                />
              )}
            </div>
          ) : null}

          {tab === 'design' ? (
            <>
              {canManage && published ? (
                <PublishedLockPanel
                  busy={busy}
                  unlocking={working === 'draft'}
                  onUnlock={() => void unlockReport()}
                  compact
                />
              ) : null}
              <SchoolReportDesignPanel
                design={design}
                disabled={published || !canManage}
                onChange={(next) => startTransition(() => setDesign(next))}
                onPreviewDeviceChange={() => {
                  setPreviewOpen(true);
                  setHasPreviewed(true);
                }}
              />
            </>
          ) : null}

          {tab === 'data' ? (
            <div className="space-y-4">
              {canManage && published ? (
                <PublishedLockPanel
                  busy={busy}
                  unlocking={working === 'draft'}
                  onUnlock={() => void unlockReport()}
                  hint="After unlocking, use Refresh snapshot on this tab to pull new scores, invoices, and attendance."
                  compact
                />
              ) : null}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <MiniKpi label="Learners" value={snapshot.summary.activeStudents} />
                <MiniKpi label="Avg score" value={pct(snapshot.summary.averageScore)} />
                <MiniKpi label="Attendance" value={pct(snapshot.summary.attendanceRate)} />
                <MiniKpi label="Curriculum" value={pct(snapshot.summary.curriculumCoverage)} />
              </div>
              <section className="rounded-2xl border border-border bg-muted/20 p-4 text-xs text-muted-foreground">
                <p className="font-black text-foreground">Delivery range frozen in this report</p>
                <p className="mt-1">
                  Term {snapshot.period.curriculumStart.term} Week {snapshot.period.curriculumStart.week} → Term{' '}
                  {snapshot.period.curriculumEnd.term} Week {snapshot.period.curriculumEnd.week} ·{' '}
                  {snapshot.curriculum?.completedWeeks ?? 0}/{snapshot.curriculum?.plannedWeeks ?? 0} weeks counted
                </p>
                <p className="mt-2">
                  To change the range, create a new report draft with Detect from delivery on the setup form, or unlock
                  and refresh after updating week marks in Course Syllabus.
                </p>
              </section>
              {completeness ? (
                <section className="rounded-2xl border border-border bg-card p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-black">Completeness checklist</h3>
                    <span className={`text-xs font-black ${completeness.readyToPublish ? 'text-emerald-600 dark:text-emerald-300' : 'text-amber-600 dark:text-amber-300'}`}>
                      {completeness.readyToPublish ? 'Ready to publish' : `${completeness.completedRequired}/${completeness.totalRequired} required`}
                    </span>
                  </div>
                  <ul className="mt-3 space-y-2 text-sm">
                    {completeness.items.map((item) => (
                      <li key={item.key} className="flex gap-2 rounded-lg border border-border/60 px-3 py-2">
                        <span className={item.ok ? 'text-emerald-600 dark:text-emerald-300 font-bold' : item.required ? 'text-rose-600 dark:text-rose-300 font-bold' : 'text-muted-foreground'}>
                          {item.ok ? '✓' : item.required ? '✗' : '○'}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="font-bold text-foreground">{item.label}</span>
                          <span className="block text-xs text-muted-foreground">{item.detail}</span>
                          {!item.ok && item.actionHref ? (
                            <Link
                              href={item.actionHref}
                              className="mt-1 inline-block text-xs font-black text-primary underline-offset-2 hover:underline"
                            >
                              {item.actionLabel || 'Open'}
                            </Link>
                          ) : null}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
              <section
                className={`rounded-2xl border p-5 ${
                  excludeBilling
                    ? 'border-slate-500/30 bg-slate-500/5 dark:bg-slate-500/10'
                    : finance?.attached
                      ? 'border-emerald-500/30 bg-emerald-500/5 dark:bg-emerald-500/10'
                      : 'border-rose-500/30 bg-rose-500/5 dark:bg-rose-500/10'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-black text-foreground">
                      {excludeBilling ? 'School invoice (excluded from this book)' : 'School invoice (feeds this report)'}
                    </h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {excludeBilling
                        ? design.excludeBillingReason
                          ? `Billing excluded: ${design.excludeBillingReason}`
                          : 'Invoice appendices are hidden and publication does not require a term invoice. Change this in Layout & PDF → Billing & invoice.'
                        : finance?.attached
                          ? `${finance.invoiceCount} invoice(s) matched ${snapshot.period.termLabel}, ${snapshot.period.academicYear}. Shown in PDF and publish checklist.`
                          : `Create the ${snapshot.period.termLabel}, ${snapshot.period.academicYear} invoice for ${formatSchoolDisplayName(snapshot.school.name)}, then refresh snapshot here.`}
                    </p>
                    {!excludeBilling && finance?.attached && finance.invoiceCount > 1 ? (
                      <p className="mt-2 text-xs font-bold text-amber-700 dark:text-amber-300">
                        More than one invoice matched this term — review duplicates in Finance Center if needed.
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {excludeBilling ? (
                      canManage && !published ? (
                        <button
                          type="button"
                          onClick={() => setTab('design')}
                          className="rounded-xl border border-border px-3 py-2 text-xs font-black"
                        >
                          Open Layout &amp; PDF
                        </button>
                      ) : null
                    ) : (
                      <Link
                        href={billingHref}
                        className="rounded-xl border border-primary bg-background px-3 py-2 text-xs font-black text-primary"
                      >
                        {finance?.attached ? 'Open in Finance Center' : 'Create invoice in Finance Center'}
                      </Link>
                    )}
                    {canManage && !published ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void onRegenerate(false)}
                        className="rounded-xl border border-border px-3 py-2 text-xs font-black disabled:opacity-50"
                      >
                        {working === 'regenerate' ? 'Refreshing…' : 'Refresh snapshot'}
                      </button>
                    ) : null}
                  </div>
                </div>
                {!excludeBilling && finance?.attached ? (
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full min-w-[520px] text-sm">
                      <thead>
                        <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                          <th className="p-2">Invoice</th>
                          <th className="p-2">Status</th>
                          <th className="p-2 text-right">Amount</th>
                          <th className="p-2 text-right">Paid</th>
                          <th className="p-2 text-right">Outstanding</th>
                          <th className="p-2">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(finance.invoices || []).map((inv) => (
                          <tr key={inv.id} className="border-b border-border/50">
                            <td className="p-2 font-bold">{inv.invoiceNumber}</td>
                            <td className="p-2 capitalize">{inv.status.replaceAll('_', ' ')}</td>
                            <td className="p-2 text-right">{money(inv.amount, finance.currency)}</td>
                            <td className="p-2 text-right">{money(inv.paid, finance.currency)}</td>
                            <td className="p-2 text-right font-bold">{money(inv.outstanding, finance.currency)}</td>
                            <td className="p-2">
                              <div className="flex flex-wrap gap-2">
                                {inv.editHref ? (
                                  <Link
                                    href={inv.editHref}
                                    className="text-xs font-black text-primary underline-offset-2 hover:underline"
                                  >
                                    Edit
                                  </Link>
                                ) : null}
                                <a
                                  href={`/api/invoices/${inv.id}/pdf`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-xs font-black text-primary underline-offset-2 hover:underline"
                                >
                                  PDF
                                </a>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p className="mt-3 text-xs text-muted-foreground">
                      Totals: {money(finance.totalInvoiced, finance.currency)} invoiced ·{' '}
                      {money(finance.totalPaid, finance.currency)} paid ·{' '}
                      {money(finance.totalOutstanding, finance.currency)} outstanding
                    </p>
                  </div>
                ) : !excludeBilling ? (
                  <>
                    <ol className="mt-4 list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
                      <li>Click Create invoice in Finance Center — school and term are pre-filled.</li>
                      <li>Save the invoice with the correct term and academic year labels.</li>
                      <li>Return here and click Refresh snapshot — the invoice attaches automatically.</li>
                    </ol>
                    {finance?.matchDiagnostics?.nearMisses?.length ? (
                      <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
                        <p className="text-xs font-black text-amber-800 dark:text-amber-200">
                          {finance.matchDiagnostics.candidateCount} school invoice(s) found — none matched{' '}
                          {snapshot.period.termLabel}, {snapshot.period.academicYear}
                        </p>
                        {finance.matchDiagnostics.hints.length ? (
                          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                            {finance.matchDiagnostics.hints.map((hint) => (
                              <li key={hint}>{hint}</li>
                            ))}
                          </ul>
                        ) : null}
                        <div className="mt-3 overflow-x-auto">
                          <table className="w-full min-w-[480px] text-xs">
                            <thead>
                              <tr className="border-b border-border text-left uppercase text-muted-foreground">
                                <th className="p-2">Invoice</th>
                                <th className="p-2">Status</th>
                                <th className="p-2">Why it did not attach</th>
                                <th className="p-2">Fix</th>
                              </tr>
                            </thead>
                            <tbody>
                              {finance.matchDiagnostics.nearMisses.map((row) => (
                                <tr key={row.id} className="border-b border-border/50 align-top">
                                  <td className="p-2 font-bold">{row.invoiceNumber}</td>
                                  <td className="p-2 capitalize">{row.status.replaceAll('_', ' ')}</td>
                                  <td className="p-2 text-muted-foreground">{row.reasons.join(' · ')}</td>
                                  <td className="p-2">
                                    <Link
                                      href={row.editHref}
                                      className="font-black text-primary underline-offset-2 hover:underline"
                                    >
                                      Edit in Finance
                                    </Link>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ) : null}
                  </>
                ) : null}
              </section>
              <section className="rounded-2xl border border-border bg-card p-5">
                <h3 className="font-black">Assigned teachers</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {snapshot.summary.activeTeachers} teachers at this school only (assignment / class ownership).
                </p>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[520px] text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                        <th className="p-2">Teacher</th>
                        <th className="p-2">Classes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(snapshot.staff?.teachers || []).map((row) => (
                        <tr key={row.id} className="border-b border-border/50">
                          <td className="p-2 font-bold">{formatPersonDisplayName(row.name, 'Teacher')}</td>
                          <td className="p-2 text-muted-foreground">{row.classNames.join(', ') || '—'}</td>
                        </tr>
                      ))}
                      {!snapshot.staff?.teachers?.length ? (
                        <tr>
                          <td colSpan={2} className="p-4 text-center text-muted-foreground">
                            No assigned teachers in this snapshot.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </section>
              <section className="rounded-2xl border border-border bg-muted/30 p-5">
                <h3 className="font-black">Data notes</h3>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                  {(snapshot.dataNotes || []).map((note, i) => (
                    <li key={i}>{note}</li>
                  ))}
                </ul>
              </section>
              {canManage && !published && onDelete ? (
                <section className="rounded-2xl border border-rose-500/40 bg-rose-500/5 p-5">
                  <h3 className="font-black text-rose-800 dark:text-rose-200">Remove this draft</h3>
                  <p className="mt-2 text-sm text-rose-900/80 dark:text-rose-200/80">
                    Deleting permanently removes this report book and its snapshot. The school will not see it. You can
                    generate a fresh book for the same term afterward.
                  </p>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void onDelete()}
                    className="mt-4 inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-black text-white disabled:opacity-50"
                  >
                    <TrashIcon className="h-4 w-4" />
                    {working === 'delete' ? 'Deleting…' : 'Delete this draft permanently'}
                  </button>
                </section>
              ) : null}
              {canManage && published ? (
                <section className="rounded-2xl border border-border bg-muted/20 p-5">
                  <h3 className="font-black">Delete not available while published</h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Unlock this report first, then you can delete the draft or archive it to free the term slot.
                  </p>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void unlockReport()}
                    className="mt-4 rounded-xl bg-primary px-4 py-2 text-xs font-black text-white disabled:opacity-50"
                  >
                    {working === 'draft' ? 'Unlocking…' : 'Unlock to edit'}
                  </button>
                </section>
              ) : null}
            </div>
          ) : null}
        </div>

        {previewOpen ? (
          <aside className="min-h-0 border-t border-border bg-muted/20 lg:sticky lg:top-24 lg:block lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto lg:border-l lg:border-t-0">
            <div className="p-3 sm:p-4 md:p-5">{previewPanel}</div>
          </aside>
        ) : null}
      </div>
    </div>
  );

  return (
    <>
      {shell}
      <DataQualityDrawer
        open={dataQualityOpen}
        onClose={() => setDataQualityOpen(false)}
        sources={snapshot.dataSources}
        generatedAt={snapshot.generatedAt}
        dataNotes={snapshot.dataNotes}
        summary={snapshot.summary}
        schoolProgrammes={snapshot.schoolProgrammes}
        programmeCoursePerformance={snapshot.programmeCoursePerformance}
        finance={snapshot.finance}
      />
      {canManage ? (
        <SchoolReportEmailDialog
          reportId={report.id}
          reportTitle={report.title}
          open={emailOpen}
          onClose={() => setEmailOpen(false)}
        />
      ) : null}
    </>
  );
}

function MiniKpi({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <p className="text-[10px] font-black uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-black">{value}</p>
    </div>
  );
}

function ListCard({
  title,
  items,
  tone,
  brandAccent,
}: {
  title: string;
  items: string[];
  tone: 'brand' | 'rose' | 'emerald';
  brandAccent?: string;
}) {
  const accent =
    tone === 'rose'
      ? 'hsl(var(--destructive))'
      : tone === 'emerald'
        ? '#10b981'
        : brandAccent;
  const panelTone = tone === 'emerald' ? 'emerald' : tone === 'brand' ? 'brand' : 'neutral';
  return (
    <SegmentPanel title={title} accent={accent} tone={panelTone as 'brand' | 'emerald' | 'neutral'} fillHeight>
      <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
        {items.length ? items.map((item, i) => <li key={i}>{item}</li>) : <li>No items yet.</li>}
      </ul>
    </SegmentPanel>
  );
}

function EmptyHint({
  title,
  body,
  actionLabel,
  onAction,
  busy,
}: {
  title: string;
  body: string;
  actionLabel: string;
  onAction?: () => void;
  busy: boolean;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-border p-8 text-center">
      <p className="font-black">{title}</p>
      <p className="mt-2 text-sm text-muted-foreground">{body}</p>
      {onAction ? (
        <button
          type="button"
          disabled={busy}
          onClick={onAction}
          className="mt-4 rounded-xl border border-primary px-4 py-2 text-sm font-black text-primary disabled:opacity-50"
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

function NarrativeRead({ narrative }: { narrative: SchoolReportNarrative }) {
  return (
    <div className="space-y-5 rounded-2xl border border-border bg-card p-5">
      <div>
        <h4 className="font-black">Executive summary</h4>
        <p className="mt-2 text-sm leading-7">{narrative.executiveSummary}</p>
      </div>
      {narrative.topicsCovered ? (
        <div>
          <h4 className="font-black">What we covered this term</h4>
          <div className="mt-2 whitespace-pre-line text-sm leading-7 text-muted-foreground">{narrative.topicsCovered}</div>
        </div>
      ) : null}
      {(
        [
          ['Strengths & excellence', narrative.achievements],
          ['Partnership focus', narrative.concerns],
          ['Recommendations', narrative.recommendations],
          ['Next module focus', narrative.nextPeriodFocus],
        ] as const
      ).map(([label, items]) => (
        <div key={label}>
          <h4 className="font-black">{label}</h4>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
            {items.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function BookPreview({
  report,
  narrative,
  billingHref,
}: {
  report: SchoolPerformanceReportRow;
  narrative: SchoolReportNarrative;
  billingHref: string;
}) {
  const s = report.snapshot;
  const finance = s.finance;
  const learners = (s.learners || []).slice(0, 8);
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-lg shadow-black/5">
      <div className="border-b-2 border-primary bg-card p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Rillcod Technologies</p>
            <p className="mt-1 text-[10px] font-bold text-muted-foreground">School Performance Report</p>
            <h3 className="mt-2 text-lg font-black leading-snug text-foreground">{report.title}</h3>
            <p className="mt-1 text-sm font-bold text-primary">{s.school.name}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {s.period.termLabel} · {s.period.academicYear}
            </p>
          </div>
          <span
            className={`rounded px-2 py-1 text-[10px] font-black uppercase ${
              report.status === 'published' ? 'bg-emerald-600 text-white' : 'bg-primary text-primary-foreground'
            }`}
          >
            {report.status === 'published' ? 'Published' : 'Draft'}
          </span>
        </div>
      </div>
      <div className="space-y-4 p-5">
        <div
          className={`rounded-xl border px-3 py-2 text-xs ${
            finance?.attached
              ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-800 dark:text-emerald-200'
              : 'border-rose-500/30 bg-rose-500/5 text-rose-800 dark:text-rose-200'
          }`}
        >
          {finance?.attached ? (
            <p>
              <span className="font-black">Invoice attached:</span> {finance.invoiceCount} for this term ·{' '}
              {money(finance.totalOutstanding, finance.currency)} outstanding
            </p>
          ) : (
            <p>
              <span className="font-black">Invoice missing.</span>{' '}
              <Link href={billingHref} className="underline">
                Create invoice in Finance Center
              </Link>
              , then refresh snapshot.
            </p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <PreviewMetric label="Learners" value={String(s.summary.activeStudents)} />
          <PreviewMetric label="Avg score" value={pct(s.summary.averageScore)} />
          <PreviewMetric label="Attendance" value={pct(s.summary.attendanceRate)} />
          <PreviewMetric label="Curriculum" value={pct(s.summary.curriculumCoverage)} />
        </div>
        <div>
          <p className="text-[10px] font-black uppercase tracking-wide text-muted-foreground">Executive summary</p>
          <p className="mt-1 text-sm leading-6 text-foreground">
            {narrative.executiveSummary || 'Generate or write the executive summary…'}
          </p>
        </div>
        {s.insights?.communityMessage ? (
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
            <p className="text-[10px] font-black uppercase tracking-wide text-primary">Community message</p>
            <p className="mt-1 text-xs leading-6 text-foreground">{s.insights.communityMessage}</p>
          </div>
        ) : null}
        {s.insights?.programmeSpotlights?.length ? (
          <PreviewList
            title="Courses this term"
            items={s.insights.programmeSpotlights.map(
              (row) => `${row.programme} · ${row.course} — ${row.summary}`,
            )}
          />
        ) : s.insights?.programmeSpotlight ? (
          <PreviewMetric
            label="Spotlight"
            value={`${s.insights.programmeSpotlight.programme} · ${s.insights.programmeSpotlight.course}`}
          />
        ) : null}
        <PreviewList title="Strengths & excellence" items={narrative.achievements} />
        <PreviewList title="Partnership focus" items={narrative.concerns} />
        <PreviewList title="Recommendations for students" items={narrative.recommendations.slice(0, 4)} />
        <PreviewList title="Next module focus" items={narrative.nextPeriodFocus} />
        {s.insights?.academicCoverage?.length ? (
          <PreviewList title="Academic coverage" items={s.insights.academicCoverage} />
        ) : null}
        {learners.length ? (
          <div>
            <p className="text-[10px] font-black uppercase tracking-wide text-muted-foreground">Learner sample</p>
            <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
              {learners.map((row) => (
                <li key={row.id} className="flex justify-between gap-2 border-b border-border/40 pb-1">
                  <span className="truncate font-bold text-foreground">{formatPersonDisplayName(row.name)}</span>
                  <span className="shrink-0">{row.className}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function PublishedReportBanner({
  publishedAtLabel,
  busy,
  unlocking,
  onUnlock,
  onArchive,
}: {
  publishedAtLabel: string | null;
  busy: boolean;
  unlocking: boolean;
  onUnlock: () => void;
  onArchive: () => void;
}) {
  return (
    <div className="border-t border-emerald-500/30 bg-emerald-500/10 px-4 py-4 md:px-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <p className="text-sm font-black text-emerald-900 dark:text-emerald-100">This report is live for the school</p>
          <p className="mt-1 text-xs leading-5 text-emerald-900/80 dark:text-emerald-50/90">
            Wording, design, and data refresh are locked while published.
            {publishedAtLabel ? ` Published ${publishedAtLabel}.` : ''} Unlock to edit, refresh snapshot, or regenerate AI — then
            publish again when ready.
          </p>
          <ol className="mt-3 list-decimal space-y-1 pl-5 text-[11px] text-emerald-900/75 dark:text-emerald-50/80">
            <li>Click <span className="font-black">Unlock to edit</span></li>
            <li>Edit on Narrative / Layout & PDF, or refresh data on the Source data tab</li>
            <li>Publish again when the book is complete</li>
          </ol>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onUnlock}
            className="rounded-xl bg-primary px-4 py-2.5 text-xs font-black text-white disabled:opacity-50"
          >
            {unlocking ? 'Unlocking…' : 'Unlock to edit'}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onArchive}
            className="rounded-xl border border-border bg-background px-4 py-2.5 text-xs font-black disabled:opacity-50"
          >
            Withdraw publication
          </button>
        </div>
      </div>
    </div>
  );
}

function PublishedLockPanel({
  busy,
  unlocking,
  onUnlock,
  hint,
  compact = false,
}: {
  busy: boolean;
  unlocking: boolean;
  onUnlock: () => void;
  hint?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border border-emerald-500/30 bg-emerald-500/5 ${
        compact ? 'p-4' : 'p-5'
      }`}
    >
      <p className="text-sm font-black text-foreground">Published — read-only</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        {hint ||
          'Unlock this report to edit wording, change layout, refresh snapshot data, or run AI again.'}
      </p>
      <button
        type="button"
        disabled={busy}
        onClick={onUnlock}
        className="mt-3 rounded-xl bg-primary px-4 py-2 text-xs font-black text-white disabled:opacity-50"
      >
        {unlocking ? 'Unlocking…' : 'Unlock to edit'}
      </button>
    </div>
  );
}

function PreviewMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2">
      <p className="text-[9px] font-black uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-black">{value}</p>
    </div>
  );
}

function PreviewList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="text-[10px] font-black uppercase tracking-wide text-muted-foreground">{title}</p>
      <ul className="mt-1 list-disc space-y-1 pl-4 text-xs leading-5 text-muted-foreground">
        {items.length ? items.map((item, i) => <li key={i}>{item}</li>) : <li className="italic">Awaiting draft…</li>}
      </ul>
    </div>
  );
}
