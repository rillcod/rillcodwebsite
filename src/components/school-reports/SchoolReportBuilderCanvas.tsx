'use client';

import { startTransition, useDeferredValue, useMemo, useState } from 'react';
import {
  ArrowPathIcon,
  ArrowsPointingOutIcon,
  DocumentArrowDownIcon,
  EyeIcon,
  PencilIcon,
  SparklesIcon,
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
    label: 'Achievements',
    hint: 'One strength per line.',
    rows: 4,
    list: true,
  },
  {
    key: 'concerns',
    label: 'Areas needing attention',
    hint: 'One risk per line.',
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
    label: 'Next-phase focus',
    hint: 'Progressive next steps — one per line.',
    rows: 4,
    list: true,
  },
];

const pct = (value: number) => `${Number(value || 0).toFixed(value % 1 ? 1 : 0)}%`;
const parseLines = (value: string) => value.split('\n').map((item) => item.trim()).filter(Boolean);

type Props = {
  report: SchoolPerformanceReportRow;
  canManage: boolean;
  editor: EditorState;
  setEditor: (value: EditorState | ((prev: EditorState) => EditorState)) => void;
  working: string;
  onSave: (status?: 'draft' | 'published' | 'archived') => Promise<void>;
  onRegenerate: (refreshNarrative?: boolean) => Promise<void>;
  onNarrativeGenerated?: (narrative: SchoolReportNarrative) => void;
};

export function SchoolReportBuilderCanvas({
  report,
  canManage,
  editor,
  setEditor,
  working,
  onSave,
  onRegenerate,
  onNarrativeGenerated,
}: Props) {
  const published = report.status === 'published';
  const [tab, setTab] = useState<'write' | 'briefing' | 'data'>('write');
  const [previewOpen, setPreviewOpen] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [aiWorking, setAiWorking] = useState('');
  const [aiNote, setAiNote] = useState('');
  const [aiError, setAiError] = useState('');
  const deferredEditor = useDeferredValue(editor);
  const snapshot = report.snapshot;
  const insights = snapshot.insights;
  const completeness = snapshot.completeness;

  const previewNarrative = useMemo<SchoolReportNarrative>(
    () => ({
      executiveSummary: deferredEditor.executiveSummary,
      achievements: parseLines(deferredEditor.achievements),
      concerns: parseLines(deferredEditor.concerns),
      recommendations: parseLines(deferredEditor.recommendations),
      nextPeriodFocus: parseLines(deferredEditor.nextPeriodFocus),
    }),
    [deferredEditor],
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
        body: JSON.stringify({ fields: fields?.length ? fields : undefined, persist: false }),
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

  const shell = (
    <div className={`flex flex-col ${fullscreen ? 'fixed inset-0 z-50 bg-background' : 'min-h-[70vh]'}`}>
      {/* Sticky toolbar */}
      <div className="sticky top-0 z-20 border-b border-border/80 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-5">
          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-primary">School report builder</p>
            <h2 className="truncate text-lg font-black text-foreground md:text-xl">{report.title}</h2>
            <p className="truncate text-xs text-muted-foreground">
              {snapshot.school.name} · {snapshot.period.termLabel} · {snapshot.period.academicYear}
              {completeness ? ` · Completeness ${completeness.score}%` : ''}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
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
                  disabled={busy}
                  onClick={() => void onSave('published')}
                  className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white disabled:opacity-50"
                >
                  {working === 'published' ? 'Publishing…' : 'Publish'}
                </button>
              </>
            ) : null}
            {canManage && published ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void onSave('draft')}
                className="rounded-xl border border-border px-3 py-2 text-xs font-black disabled:opacity-50"
              >
                {working === 'draft' ? 'Unlocking…' : 'Unpublish to edit'}
              </button>
            ) : null}
          </div>
        </div>
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
          {canManage ? (
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
      <div className={`grid flex-1 gap-0 ${previewOpen ? 'xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]' : ''}`}>
        <div className="min-h-0 overflow-y-auto p-4 md:p-5">
          {tab === 'write' ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-black text-foreground">AI writing studio</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Generate one field or all wording in seconds. Snapshot data stays untouched. Staff always approve before publish.
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
                      <MiniKpi label="At risk" value={insights.atRiskLearners} />
                      <MiniKpi label="Teacher cover" value={`${insights.teacherCoveragePct}%`} />
                    </div>
                  </section>
                  <div className="grid gap-4 lg:grid-cols-2">
                    <ListCard title="Growth opportunities" items={insights.growthAreas || []} tone="brand" />
                    <ListCard title="Areas to improve" items={insights.improvementAreas || []} tone="rose" />
                    <ListCard title="Strengths" items={insights.strengths || []} tone="emerald" />
                    <ListCard title="Risks" items={insights.risks || []} tone="rose" />
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
                  body="Board briefing, growth areas and next-phase plans appear after you refresh snapshot data."
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
                        <span>
                          <span className="font-bold">{item.label}</span>
                          <span className="block text-xs text-muted-foreground">{item.detail}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
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
            </div>
          ) : null}
        </div>

        {previewOpen ? (
          <aside className="border-t border-border bg-muted/20 xl:border-l xl:border-t-0">
            <div className="sticky top-[7.5rem] max-h-[calc(100dvh-8rem)] overflow-y-auto p-4 md:p-5">
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-muted-foreground">Live book preview</p>
                <span className="rounded-full bg-background px-2 py-1 text-[10px] font-black uppercase text-muted-foreground">
                  {published ? 'Published' : 'Draft'}
                </span>
              </div>
              <BookPreview report={report} narrative={previewNarrative} />
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
          ['Achievements', narrative.achievements],
          ['Areas needing attention', narrative.concerns],
          ['Recommendations', narrative.recommendations],
          ['Next-period focus', narrative.nextPeriodFocus],
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
}: {
  report: SchoolPerformanceReportRow;
  narrative: SchoolReportNarrative;
}) {
  const s = report.snapshot;
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-white shadow-lg shadow-black/5 dark:bg-card">
      <div className="bg-gradient-to-br from-[#420303] via-[#7a0606] to-[#b42318] p-5 text-white">
        <p className="text-[10px] font-black uppercase tracking-[0.25em] text-white/70">Rillcod Technologies</p>
        <p className="mt-2 text-xs font-bold text-white/80">School Performance Report</p>
        <h3 className="mt-3 text-xl font-black leading-snug">{report.title}</h3>
        <p className="mt-2 text-sm font-bold text-white/90">{s.school.name}</p>
        <p className="mt-3 text-[11px] text-white/70">
          {s.period.termLabel} · {s.period.academicYear}
        </p>
      </div>
      <div className="space-y-4 p-5">
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
        <PreviewList title="Achievements" items={narrative.achievements} />
        <PreviewList title="Needs attention" items={narrative.concerns} />
        <PreviewList title="Recommendations" items={narrative.recommendations} />
        <PreviewList title="Next phase" items={narrative.nextPeriodFocus} />
        {s.insights?.headline ? (
          <div className="rounded-xl border border-border/70 bg-muted/30 p-3">
            <p className="text-[10px] font-black uppercase tracking-wide text-muted-foreground">Intelligence</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{s.insights.headline}</p>
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
