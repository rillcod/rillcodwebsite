'use client';

import { startTransition, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowPathIcon,
  ArrowsPointingOutIcon,
  DocumentArrowDownIcon,
  EyeIcon,
  PencilIcon,
  SparklesIcon,
  TrashIcon,
  XMarkIcon,
} from '@/lib/icons';
import type { SchoolPerformanceReportRow, SchoolReportNarrative } from '@/lib/school-reports/types';

export type EditorState = {
  executiveSummary: string;
  achievements: string;
  concerns: string;
  recommendations: string;
  nextPeriodFocus: string;
};

type FieldKey = keyof EditorState;

const FIELD_META: Array<{ key: FieldKey; label: string; hint: string; rows: number; list?: boolean }> = [
  {
    key: 'executiveSummary',
    label: 'Executive summary',
    hint: 'One clear paragraph for school leadership.',
    rows: 5,
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
  working: string;
  saveStatus?: { isDirty: boolean; lastSavedAt: Date | null; autosaving: boolean };
  onSave: (opts?: { status?: 'draft' | 'published' | 'archived'; forcePublish?: boolean }) => Promise<void>;
  onRegenerate: (refreshNarrative?: boolean) => Promise<void>;
  onDelete?: () => Promise<void>;
  onTitleChange?: (title: string) => Promise<void>;
  onBack?: () => void;
  onEditorSynced?: () => void;
  onNarrativeGenerated?: (narrative: SchoolReportNarrative) => void;
};

export function SchoolReportBuilderCanvas({
  report,
  canManage,
  role = '',
  editor,
  setEditor,
  working,
  saveStatus,
  onSave,
  onRegenerate,
  onDelete,
  onTitleChange,
  onBack,
  onEditorSynced,
  onNarrativeGenerated,
}: Props) {
  const published = report.status === 'published';
  const isAdmin = role === 'admin';
  const [tab, setTab] = useState<'write' | 'briefing' | 'data'>('write');
  const [previewOpen, setPreviewOpen] = useState(true);
  const [hasPreviewed, setHasPreviewed] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [titleDraft, setTitleDraft] = useState(report.title);
  const [aiWorking, setAiWorking] = useState('');
  const [aiNote, setAiNote] = useState('');
  const [aiError, setAiError] = useState('');
  const snapshot = report.snapshot;
  const insights = snapshot.insights;
  const completeness = snapshot.completeness;
  const finance = snapshot.finance;
  const billingHref = finance?.billingHref || '/dashboard/school-billing';

  useEffect(() => {
    setTitleDraft(report.title);
  }, [report.id, report.title]);

  useEffect(() => {
    if (previewOpen) setHasPreviewed(true);
  }, [previewOpen]);

  const previewNarrative = useMemo<SchoolReportNarrative>(
    () => ({
      executiveSummary: editor.executiveSummary,
      achievements: parseLines(editor.achievements),
      concerns: parseLines(editor.concerns),
      recommendations: parseLines(editor.recommendations),
      nextPeriodFocus: parseLines(editor.nextPeriodFocus),
    }),
    [editor],
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
        setEditor({
          executiveSummary: narrative.executiveSummary || '',
          achievements: (narrative.achievements || []).join('\n'),
          concerns: (narrative.concerns || []).join('\n'),
          recommendations: (narrative.recommendations || []).join('\n'),
          nextPeriodFocus: (narrative.nextPeriodFocus || []).join('\n'),
        });
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

  const shell = (
    <div className={`flex flex-col ${fullscreen ? 'fixed inset-0 z-50 bg-background' : 'min-h-[70vh]'}`}>
      {/* Sticky toolbar */}
      <div className="sticky top-0 z-20 border-b border-border/80 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-5">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-primary">School report builder</p>
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
              {snapshot.school.name} · {snapshot.period.termLabel} · {snapshot.period.academicYear}
              {completeness ? ` · Completeness ${completeness.score}%` : ''}
            </p>
            {canManage && !published && saveStatus ? (
              <p className="mt-1 text-[11px] font-bold text-muted-foreground">
                {saveStatus.autosaving || working === 'save'
                  ? 'Saving…'
                  : saveStatus.isDirty
                    ? '● Unsaved · autosaves after 8 seconds'
                    : saveStatus.lastSavedAt
                      ? `Saved ${saveStatus.lastSavedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                      : 'All changes saved'}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {onBack ? (
              <button
                type="button"
                onClick={onBack}
                className="rounded-xl border border-border px-3 py-2 text-xs font-black hover:border-primary/40"
              >
                Back
              </button>
            ) : null}
            <a
              href={`/api/school-performance-reports/${report.id}/pdf`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-black hover:border-primary/40"
            >
              <DocumentArrowDownIcon className="h-4 w-4" />
              PDF
            </a>
            <button
              type="button"
              onClick={() => setPreviewOpen((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-black hover:border-primary/40"
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
                  onClick={() => void onSave({ status: 'published' })}
                  className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white disabled:opacity-50"
                >
                  {working === 'published' ? 'Publishing…' : 'Publish'}
                </button>
                {isAdmin && !canPublish ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      if (window.confirm('Publish without all required items? The school may receive an incomplete book.')) {
                        void onSave({ status: 'published', forcePublish: true });
                      }
                    }}
                    className="rounded-xl border border-amber-600 px-3 py-2 text-xs font-black text-amber-700 disabled:opacity-50"
                  >
                    Admin publish anyway
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    if (window.confirm('Archive this report book? It will leave the active draft/published slot for this term.')) {
                      void onSave({ status: 'archived' });
                    }
                  }}
                  className="rounded-xl border border-border px-3 py-2 text-xs font-black disabled:opacity-50"
                >
                  Archive
                </button>
                {onDelete ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void onDelete()}
                    className="inline-flex items-center gap-1 rounded-xl border border-rose-500/40 px-3 py-2 text-xs font-black text-rose-600 disabled:opacity-50"
                  >
                    <TrashIcon className="h-4 w-4" />
                    Delete
                  </button>
                ) : null}
              </>
            ) : null}
            {canManage && published ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void onSave({ status: 'draft' })}
                className="rounded-xl border border-border px-3 py-2 text-xs font-black disabled:opacity-50"
              >
                {working === 'draft' ? 'Unlocking…' : 'Unpublish to edit'}
              </button>
            ) : null}
          </div>
        </div>
        {canManage && !published && missingRequired.length ? (
          <div className="border-t border-amber-500/30 bg-amber-500/10 px-4 py-3 md:px-5">
            <p className="text-sm font-bold text-amber-800 dark:text-amber-200">
              Before you can publish: {missingRequired.map((item) => item.label).join(' · ')}
            </p>
            <p className="mt-1 text-xs text-amber-900/80 dark:text-amber-100/80">
              Fix the items in the Data tab (especially the term invoice), then click Refresh data. Open PDF for the full book layout.
            </p>
          </div>
        ) : null}
        {canManage && !published && onDelete ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/70 bg-muted/20 px-4 py-3 md:px-5">
            <div>
              <p className="text-xs font-black text-foreground">Draft book actions</p>
              <p className="text-[11px] text-muted-foreground">
                Archive hides this book from the active term slot. Delete removes it permanently.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  if (window.confirm('Archive this report book? It will leave the active draft/published slot for this term.')) {
                    void onSave({ status: 'archived' });
                  }
                }}
                className="rounded-xl border border-border bg-background px-4 py-2 text-xs font-black disabled:opacity-50"
              >
                Archive draft
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void onDelete()}
                className="inline-flex items-center gap-1.5 rounded-xl border border-rose-500 bg-rose-500/10 px-4 py-2 text-xs font-black text-rose-700 disabled:opacity-50"
              >
                <TrashIcon className="h-4 w-4" />
                {working === 'delete' ? 'Deleting…' : 'Delete draft permanently'}
              </button>
            </div>
          </div>
        ) : null}
        {canManage && published ? (
          <div className="border-t border-border/70 bg-muted/10 px-4 py-2 text-[11px] text-muted-foreground md:px-5">
            Published books cannot be deleted. Use <span className="font-black">Unpublish to edit</span>, then delete the
            draft if needed.
          </div>
        ) : null}
        <div className="flex gap-1 overflow-x-auto px-4 pb-3 md:px-5">
          {(
            [
              ['write', 'Write', PencilIcon],
              ['briefing', 'Briefing', SparklesIcon],
              ['data', 'Data', EyeIcon],
            ] as const
          ).map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-black transition ${
                tab === id ? 'bg-primary text-white shadow-sm' : 'bg-muted text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
          {canManage && !published ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void onRegenerate(false)}
              className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-border px-3.5 py-1.5 text-xs font-black disabled:opacity-50"
            >
              <ArrowPathIcon className={`h-3.5 w-3.5 ${working === 'regenerate' ? 'animate-spin' : ''}`} />
              Refresh data
            </button>
          ) : null}
        </div>
        {(aiNote || aiError) && (
          <div className="border-t border-border/60 px-4 py-2 text-xs md:px-5">
            {aiError ? <p className="font-bold text-rose-600">{aiError}</p> : <p className="text-emerald-700">{aiNote}</p>}
          </div>
        )}
      </div>

      {/* Workspace */}
      <div className={`grid flex-1 gap-0 ${previewOpen ? 'lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]' : ''}`}>
        <div className="min-h-0 overflow-y-auto p-4 md:p-5">
          {tab === 'write' ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-black text-foreground">Write the school’s story</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Speak as Rillcod to a partner school — celebrate delivery, academic coverage, and a clear next module. Keep every line tied to the data in the Data tab.
                    </p>
                  </div>
                  {canManage && !published ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void generateAi()}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-black text-white disabled:opacity-50"
                    >
                      <SparklesIcon className="h-4 w-4" />
                      Generate all
                    </button>
                  ) : null}
                </div>
              </div>

              {published || !canManage ? (
                <NarrativeRead narrative={report.narrative} />
              ) : (
                <div className="space-y-4">
                  {FIELD_META.map((field) => (
                    <div key={field.key} className="rounded-2xl border border-border bg-card p-4 shadow-sm transition hover:border-primary/30">
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
                          className="inline-flex items-center gap-1 rounded-lg border border-primary/30 bg-primary/5 px-2.5 py-1.5 text-[11px] font-black text-primary disabled:opacity-50"
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
              {insights ? (
                <>
                  <section className="rounded-2xl border border-border bg-card p-5">
                    <p className="text-[11px] font-black uppercase tracking-[0.2em] text-muted-foreground">Board briefing</p>
                    <p className="mt-3 text-base font-bold leading-7">{insights.headline}</p>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <MiniKpi label="Evidence" value={`${insights.evidenceQualityPct}%`} />
                      <MiniKpi label="Equity gap" value={`${insights.scoreEquityGap} pts`} />
                      <MiniKpi label="Curriculum" value={`${snapshot.summary.curriculumCoverage}%`} />
                      <MiniKpi label="Excellent" value={insights.excellentLearners} />
                    </div>
                  </section>

                  <section className="rounded-2xl border border-primary/20 bg-primary/5 p-5">
                    <h3 className="font-black">Our delivery this term</h3>
                    <div className="mt-4 grid gap-4 lg:grid-cols-3">
                      <ListCard title="Planned" items={insights.deliveryCommitment?.planned || []} tone="brand" />
                      <ListCard title="Delivered" items={insights.deliveryCommitment?.delivered || []} tone="emerald" />
                      <ListCard title="Next" items={insights.deliveryCommitment?.next || insights.nextModuleFocus || []} tone="brand" />
                    </div>
                    <div className="mt-4 grid gap-4 lg:grid-cols-2">
                      <ListCard title="Evidence captured" items={insights.evidenceLedger || []} tone="brand" />
                      <ListCard title="Milestones together" items={insights.partnershipMilestones || []} tone="emerald" />
                    </div>
                  </section>

                  {(insights.moduleCoverage || []).length ? (
                    <section className="rounded-2xl border border-border bg-card p-5">
                      <h3 className="font-black">Topics & module coverage</h3>
                      <div className="mt-3 overflow-x-auto">
                        <table className="min-w-full text-xs">
                          <thead>
                            <tr className="border-b border-border text-left text-muted-foreground">
                              <th className="px-2 py-2 font-black">Programme</th>
                              <th className="px-2 py-2 font-black">Course</th>
                              <th className="px-2 py-2 font-black">Done</th>
                              <th className="px-2 py-2 font-black">Plan</th>
                              <th className="px-2 py-2 font-black">Cover</th>
                              <th className="px-2 py-2 font-black">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {insights.moduleCoverage.map((row, i) => (
                              <tr key={i} className="border-b border-border/60">
                                <td className="px-2 py-2">{row.programme}</td>
                                <td className="px-2 py-2">{row.course}</td>
                                <td className="px-2 py-2">{row.completed}</td>
                                <td className="px-2 py-2">{row.planned}</td>
                                <td className="px-2 py-2">{row.coverage}%</td>
                                <td className="px-2 py-2">{row.status}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </section>
                  ) : null}

                  {(insights.teacherDelivery || []).length ? (
                    <ListCard title="Who delivered for you" items={insights.teacherDelivery} tone="brand" />
                  ) : null}

                  <div className="grid gap-4 lg:grid-cols-2">
                    {(insights.learnerHighlights || []).length ? (
                      <ListCard title="Learner highlights" items={insights.learnerHighlights} tone="emerald" />
                    ) : null}
                    {(insights.celebrationWall || []).length ? (
                      <section className="rounded-2xl border border-border bg-card p-5">
                        <h3 className="font-black text-emerald-700">Celebration wall</h3>
                        <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                          {insights.celebrationWall.map((row, i) => (
                            <li key={i}>
                              <span className="font-bold text-foreground">{row.name}</span> ({row.className}) — {row.highlight}
                            </li>
                          ))}
                        </ul>
                      </section>
                    ) : null}
                  </div>

                  {insights.programmeSpotlight ? (
                    <section className="rounded-2xl border border-[#7a0606]/20 bg-[#7a0606]/5 p-5">
                      <h3 className="font-black text-[#7a0606]">Programme spotlight</h3>
                      <p className="mt-2 text-sm font-bold">
                        {insights.programmeSpotlight.programme} · {insights.programmeSpotlight.course}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">{insights.programmeSpotlight.summary}</p>
                      <p className="mt-2 text-sm">{insights.programmeSpotlight.nextIntro}</p>
                    </section>
                  ) : null}

                  <section className="rounded-2xl border border-border bg-card p-5">
                    <h3 className="font-black">Message for your school community</h3>
                    <p className="mt-3 text-sm leading-7 text-foreground">{insights.communityMessage}</p>
                    {insights.suggestedPartnershipReview ? (
                      <p className="mt-3 text-xs italic text-muted-foreground">{insights.suggestedPartnershipReview}</p>
                    ) : null}
                  </section>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <ListCard title="Strengths (from data)" items={insights.strengths || []} tone="emerald" />
                    <ListCard title="Academic coverage" items={insights.academicCoverage || []} tone="brand" />
                    <ListCard title="Partnership focus" items={insights.partnershipFocus || []} tone="brand" />
                    <ListCard title="Next module focus" items={insights.nextModuleFocus || []} tone="emerald" />
                    {insights.risks?.length ? (
                      <ListCard title="Exceptional cases only" items={insights.risks} tone="rose" />
                    ) : null}
                  </div>
                  {(insights.nextPhaseSchool || []).length ? (
                    <section className="rounded-2xl border border-border bg-card p-5">
                      <h3 className="font-black">Progressive next phase</h3>
                      <div className="mt-4 space-y-4">
                        {insights.nextPhaseSchool.map((phase) => (
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
                    <ListCard title="Keep everyone involved" items={insights.involvement} tone="brand" />
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

          {tab === 'data' ? (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <MiniKpi label="Learners" value={snapshot.summary.activeStudents} />
                <MiniKpi label="Avg score" value={pct(snapshot.summary.averageScore)} />
                <MiniKpi label="Attendance" value={pct(snapshot.summary.attendanceRate)} />
                <MiniKpi label="Curriculum" value={pct(snapshot.summary.curriculumCoverage)} />
              </div>
              {completeness ? (
                <section className="rounded-2xl border border-border bg-card p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-black">Completeness checklist</h3>
                    <span className={`text-xs font-black ${completeness.readyToPublish ? 'text-emerald-600' : 'text-amber-600'}`}>
                      {completeness.readyToPublish ? 'Ready to publish' : `${completeness.completedRequired}/${completeness.totalRequired} required`}
                    </span>
                  </div>
                  <ul className="mt-3 space-y-2 text-sm">
                    {completeness.items.map((item) => (
                      <li key={item.key} className="flex gap-2 rounded-lg border border-border/60 px-3 py-2">
                        <span className={item.ok ? 'text-emerald-600' : item.required ? 'text-rose-600' : 'text-muted-foreground'}>
                          {item.ok ? '✓' : item.required ? '✗' : '○'}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="font-bold">{item.label}</span>
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
                  finance?.attached ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-rose-500/30 bg-rose-500/5'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-black">School invoice (feeds this report)</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {finance?.attached
                        ? `${finance.invoiceCount} invoice(s) matched ${snapshot.period.termLabel}, ${snapshot.period.academicYear}. Shown in PDF and publish checklist.`
                        : `Create the ${snapshot.period.termLabel}, ${snapshot.period.academicYear} invoice for ${snapshot.school.name}, then refresh snapshot here.`}
                    </p>
                    {finance?.attached && finance.invoiceCount > 1 ? (
                      <p className="mt-2 text-xs font-bold text-amber-700">
                        More than one invoice matched this term — review duplicates in Finance Center if needed.
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={billingHref}
                      className="rounded-xl border border-primary bg-background px-3 py-2 text-xs font-black text-primary"
                    >
                      {finance?.attached ? 'Open in Finance Center' : 'Create invoice in Finance Center'}
                    </Link>
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
                {finance?.attached ? (
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
                ) : (
                  <ol className="mt-4 list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
                    <li>Click Create invoice in Finance Center — school and term are pre-filled.</li>
                    <li>Save the invoice with the correct term and academic year labels.</li>
                    <li>Return here and click Refresh snapshot — the invoice attaches automatically.</li>
                  </ol>
                )}
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
                          <td className="p-2 font-bold">{row.name}</td>
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
                  <h3 className="font-black text-rose-800">Remove this draft</h3>
                  <p className="mt-2 text-sm text-rose-900/80">
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
                  <h3 className="font-black">Delete not available</h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    This book is published. Unpublish it from the toolbar first if you need to remove it entirely.
                  </p>
                </section>
              ) : null}
            </div>
          ) : null}
        </div>

        {previewOpen ? (
          <aside className="border-t border-border bg-muted/20 lg:border-l lg:border-t-0">
            <div className="sticky top-24 max-h-[calc(100dvh-6rem)] overflow-y-auto p-4 md:p-5">
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-muted-foreground">Live book preview</p>
                <span className="rounded-full bg-background px-2 py-1 text-[10px] font-black uppercase text-muted-foreground">
                  {published ? 'Published' : 'Draft'}
                </span>
              </div>
              <BookPreview report={report} narrative={previewNarrative} billingHref={billingHref} />
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  );

  return shell;
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
}: {
  title: string;
  items: string[];
  tone: 'brand' | 'rose' | 'emerald';
}) {
  const color =
    tone === 'rose' ? 'text-rose-700' : tone === 'emerald' ? 'text-emerald-700' : 'text-[#7a0606]';
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <h3 className={`text-sm font-black ${color}`}>{title}</h3>
      <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
        {items.length ? items.map((item, i) => <li key={i}>{item}</li>) : <li>No items yet.</li>}
      </ul>
    </section>
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
      <p className="text-sm leading-7">{narrative.executiveSummary}</p>
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
    <div className="overflow-hidden rounded-2xl border border-border bg-white shadow-lg shadow-black/5 dark:bg-card">
      <div className="border-b-2 border-[#7a0606] bg-white p-4 dark:bg-card">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#7a0606]">Rillcod Technologies</p>
            <p className="mt-1 text-[10px] font-bold text-muted-foreground">School Performance Report</p>
            <h3 className="mt-2 text-lg font-black leading-snug text-foreground">{report.title}</h3>
            <p className="mt-1 text-sm font-bold text-[#7a0606]">{s.school.name}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {s.period.termLabel} · {s.period.academicYear}
            </p>
          </div>
          <span
            className={`rounded px-2 py-1 text-[10px] font-black uppercase text-white ${
              report.status === 'published' ? 'bg-emerald-600' : 'bg-[#7a0606]'
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
              ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-800'
              : 'border-rose-500/30 bg-rose-500/5 text-rose-800'
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
          <div className="rounded-xl border border-[#7a0606]/20 bg-[#7a0606]/5 p-3">
            <p className="text-[10px] font-black uppercase tracking-wide text-[#7a0606]">Community message</p>
            <p className="mt-1 text-xs leading-6 text-foreground">{s.insights.communityMessage}</p>
          </div>
        ) : null}
        {s.insights?.programmeSpotlight ? (
          <PreviewMetric
            label="Spotlight"
            value={`${s.insights.programmeSpotlight.programme} · ${s.insights.programmeSpotlight.course}`}
          />
        ) : null}
        <PreviewList title="Strengths & excellence" items={narrative.achievements} />
        <PreviewList title="Partnership focus" items={narrative.concerns} />
        <PreviewList title="Recommendations" items={narrative.recommendations} />
        <PreviewList title="Next module focus" items={narrative.nextPeriodFocus} />
        {s.insights?.academicCoverage?.length ? (
          <PreviewList title="Academic coverage" items={s.insights.academicCoverage.slice(0, 4)} />
        ) : null}
        {learners.length ? (
          <div>
            <p className="text-[10px] font-black uppercase tracking-wide text-muted-foreground">Learner sample</p>
            <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
              {learners.map((row) => (
                <li key={row.id} className="flex justify-between gap-2 border-b border-border/40 pb-1">
                  <span className="truncate font-bold text-foreground">{row.name}</span>
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
