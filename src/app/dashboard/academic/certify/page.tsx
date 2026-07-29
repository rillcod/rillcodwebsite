'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AcademicCapIcon,
  ArrowRightIcon,  ClipboardDocumentCheckIcon,
  ExclamationTriangleIcon,
  ShieldCheckIcon,
  SparklesIcon,
} from '@/lib/icons';

type CurriculumDraft = {
  id: string;
  course_id: string;
  version: number;
  courses?: { title?: string; programs?: { name?: string } | null } | null;
};

type QualityIssue = {
  code: string;
  severity: 'must_fix' | 'improve';
  dimension: string;
  location: string;
  message: string;
  action: string;
};

type QualityReport = {
  readiness: 'ready' | 'needs_attention' | 'not_ready';
  score: number;
  heading: string;
  summary: string;
  mustFix: QualityIssue[];
  improvements: QualityIssue[];
  dimensions: Record<string, { score: number; issueCount: number }>;
  coverage: { years: number; terms: number; weeks: number };
  note: string;
};

const DIMENSION_LABELS: Record<string, string> = {
  academic_foundation: 'Academic foundation',
  structure: 'Curriculum structure',
  learning_sequence: 'Learning sequence',
  teacher_usability: 'Teacher usability',
  assessment: 'Evidence of learning',
  human_clarity: 'Clarity and language',
};

function relation<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

export default function AcademicDirectionPage() {
  const [drafts, setDrafts] = useState<CurriculumDraft[]>([]);
  const [curriculumId, setCurriculumId] = useState('');
  const [sourceName, setSourceName] = useState('Rillcod Academic Office');
  const [framework, setFramework] = useState('Rillcod Coding and Robotics Academic Standard');
  const [academicSession, setAcademicSession] = useState('2026/2027');
  const [audienceLabel, setAudienceLabel] = useState('');
  const [report, setReport] = useState<QualityReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    fetch('/api/curriculum-governance/releases')
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Could not load the academic workspace.');
        return payload;
      })
      .then((payload) => {
        if (!active) return;
        const nextDrafts = Array.isArray(payload.curricula) ? payload.curricula : [];
        setDrafts(nextDrafts);
        setCurriculumId(nextDrafts[0]?.id ?? '');
      })
      .catch((reason) => active && setError(reason instanceof Error ? reason.message : 'Could not load the academic workspace.'))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  const selected = useMemo(() => drafts.find((draft) => draft.id === curriculumId) ?? null, [drafts, curriculumId]);
  const course = relation(selected?.courses);
  const programme = relation(course?.programs);

  async function runReview() {
    if (!curriculumId) return;
    setChecking(true);
    setError('');
    setReport(null);
    try {
      const response = await fetch('/api/curriculum-governance/academic-quality', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          curriculum_id: curriculumId,
          source_metadata: { name: sourceName, framework },
          academic_session: academicSession,
          audience_label: audienceLabel,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'The academic review could not be completed.');
      setReport(payload.data);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The academic review could not be completed.');
    } finally {
      setChecking(false);
    }
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="mb-8 rounded-3xl border border-border bg-gradient-to-br from-primary/10 via-card to-violet-400/5 p-6 sm:p-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-primary">Academic Office</p>
              <h1 className="text-3xl font-black tracking-tight sm:text-4xl">Academic Direction</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">
                One calm workspace for shaping the official curriculum, checking its quality, assigning schools,
                and respecting when each school actually begins. Teachers receive a clear weekly direction, while quality checks and publishing stay safely managed here.
              </p>
            </div>
            <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm text-emerald-100 lg:max-w-xs">
              <div className="mb-1 flex items-center gap-2 font-bold"><ShieldCheckIcon className="h-5 w-5" /> Central control</div>
              Quality checks are managed here. Teachers receive clear guidance without technical controls.
            </div>
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)]">
          <section className="rounded-3xl border border-border bg-card p-5 sm:p-6">
            <div className="mb-6 flex items-start gap-3">
              <span className="rounded-xl bg-primary/10 p-2 text-primary"><AcademicCapIcon className="h-6 w-6" /></span>
              <div>
                <h2 className="text-lg font-black">Start with the academic meaning</h2>
                <p className="mt-1 text-sm text-muted-foreground">These labels follow the curriculum wherever it is used.</p>
              </div>
            </div>

            <div className="space-y-5">
              <label className="block text-sm font-bold">
                Curriculum to review
                <select
                  value={curriculumId}
                  onChange={(event) => { setCurriculumId(event.target.value); setReport(null); }}
                  disabled={loading}
                  className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-3 text-sm outline-none focus:border-primary"
                >
                  {drafts.length === 0 && <option value="">No central curriculum draft found</option>}
                  {drafts.map((draft) => {
                    const draftCourse = relation(draft.courses);
                    const draftProgramme = relation(draftCourse?.programs);
                    return <option key={draft.id} value={draft.id}>{draftProgramme?.name ? `${draftProgramme.name} · ` : ''}{draftCourse?.title ?? 'Untitled curriculum'}</option>;
                  })}
                </select>
              </label>

              {selected && (
                <div className="rounded-xl border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
                  Reviewing <span className="font-bold text-foreground">{course?.title ?? 'Curriculum'}</span>
                  {programme?.name ? <> for <span className="font-bold text-foreground">{programme.name}</span></> : null}.
                </div>
              )}

              <label className="block text-sm font-bold">
                Academic source
                <input value={sourceName} onChange={(event) => setSourceName(event.target.value)} className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-3 text-sm outline-none focus:border-primary" />
                <span className="mt-1 block text-xs font-normal text-muted-foreground">Who owns or approves the academic direction?</span>
              </label>
              <label className="block text-sm font-bold">
                Framework or standard
                <input value={framework} onChange={(event) => setFramework(event.target.value)} className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-3 text-sm outline-none focus:border-primary" />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-bold">
                  Academic session
                  <input value={academicSession} onChange={(event) => setAcademicSession(event.target.value)} placeholder="2026/2027" className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-3 text-sm outline-none focus:border-primary" />
                </label>
                <label className="block text-sm font-bold">
                  Learner level
                  <input value={audienceLabel} onChange={(event) => setAudienceLabel(event.target.value)} placeholder="Basic 1 or Year 1" className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-3 text-sm outline-none focus:border-primary" />
                </label>
              </div>
              <button
                type="button"
                onClick={runReview}
                disabled={!curriculumId || checking}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-black text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <SparklesIcon className="h-5 w-5" />
                {checking ? 'Reviewing the academic direction…' : 'Run full academic review'}
              </button>
              {error && <p role="alert" className="rounded-xl border border-rose-400/30 bg-rose-400/10 p-3 text-sm text-rose-200">{error}</p>}
            </div>
          </section>

          <section className="rounded-3xl border border-border bg-card p-5 sm:p-6">
            {!report ? (
              <div className="flex min-h-[540px] flex-col items-center justify-center px-6 text-center">
                <span className="mb-5 rounded-full bg-violet-400/10 p-5 text-violet-300"><ClipboardDocumentCheckIcon className="h-10 w-10" /></span>
                <h2 className="text-xl font-black">A useful review, not a technical report</h2>
                <p className="mt-3 max-w-lg text-sm leading-6 text-muted-foreground">
                  The engine will show what is ready, what must be corrected before publication, and what would make teaching easier.
                  Every suggestion includes the exact location and a practical next action.
                </p>
              </div>
            ) : (
              <div>
                <div className={`mb-6 rounded-2xl border p-5 ${report.readiness === 'not_ready' ? 'border-rose-400/30 bg-rose-400/10' : report.readiness === 'ready' ? 'border-emerald-400/30 bg-emerald-400/10' : 'border-amber-400/30 bg-amber-400/10'}`}>
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Academic readiness</p>
                      <h2 className="mt-1 text-xl font-black">{report.heading}</h2>
                      <p className="mt-2 text-sm text-muted-foreground">{report.summary}</p>
                    </div>
                    <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full border-4 border-current text-2xl font-black">{report.score}</div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2 text-xs font-bold text-muted-foreground">
                    <span className="rounded-full bg-background px-3 py-1">{report.coverage.years} {report.coverage.years === 1 ? 'year' : 'years'}</span>
                    <span className="rounded-full bg-background px-3 py-1">{report.coverage.terms} curriculum sections</span>
                    <span className="rounded-full bg-background px-3 py-1">{report.coverage.weeks} teaching weeks</span>
                  </div>
                </div>

                <details className="mb-7 rounded-2xl border border-border bg-muted/10 p-4">
                  <summary className="cursor-pointer text-sm font-bold text-foreground">View detailed readiness scores</summary>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {Object.entries(report.dimensions).map(([key, value]) => (
                    <div key={key} className="rounded-xl border border-border bg-muted/20 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-bold text-muted-foreground">{DIMENSION_LABELS[key] ?? key}</p>
                        <span className={`text-sm font-black ${value.score >= 85 ? 'text-emerald-300' : value.score >= 70 ? 'text-amber-300' : 'text-rose-300'}`}>{value.score}</span>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${value.score}%` }} /></div>
                    </div>
                  ))}
                </div>
                </details>
                {report.mustFix.length > 0 && (
                  <div className="mb-7">
                    <h3 className="mb-3 flex items-center gap-2 font-black text-rose-200"><ExclamationTriangleIcon className="h-5 w-5" /> Must fix before publication</h3>
                    <div className="space-y-3">{report.mustFix.map((issue, index) => <IssueCard key={`${issue.code}-${index}`} issue={issue} />)}</div>
                  </div>
                )}
                {report.improvements.length > 0 && (
                  <div className="mb-7">
                    <h3 className="mb-3 flex items-center gap-2 font-black text-amber-100"><SparklesIcon className="h-5 w-5" /> Improvements that will help teachers</h3>
                    <div className="space-y-3">{report.improvements.slice(0, 5).map((issue, index) => <IssueCard key={`${issue.code}-${index}`} issue={issue} />)}</div>
                    {report.improvements.length > 5 && <p className="mt-3 text-xs text-muted-foreground">Showing the first 5 of {report.improvements.length} suggestions. Similar week-by-week items can be improved together.</p>}
                  </div>
                )}

                <p className="mb-5 rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs leading-5 text-foreground">{report.note}</p>
                <Link href="/dashboard/academic/distribute" className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-primary/40 px-4 py-3 text-sm font-black text-primary hover:bg-primary/10">
                  Continue to school assignment and timing <ArrowRightIcon className="h-4 w-4" />
                </Link>
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}

function IssueCard({ issue }: { issue: QualityIssue }) {
  return (
    <article className={`rounded-xl border p-4 ${issue.severity === 'must_fix' ? 'border-rose-400/20 bg-rose-400/5' : 'border-amber-400/20 bg-amber-400/5'}`}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-wider text-muted-foreground">{issue.location}</p>
          <p className="mt-1 text-sm font-bold text-foreground">{issue.message}</p>
        </div>
        <span className="shrink-0 rounded-full bg-muted/20 px-2.5 py-1 text-[10px] font-bold text-muted-foreground">{DIMENSION_LABELS[issue.dimension] ?? issue.dimension}</span>
      </div>
      <p className="mt-3 text-sm leading-6 text-muted-foreground"><span className="font-bold text-primary">What to do:</span> {issue.action}</p>
    </article>
  );
}

