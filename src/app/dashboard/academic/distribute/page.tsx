'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { AcademicCapIcon, ArrowLeftIcon, ArrowPathIcon, BuildingOfficeIcon, CalendarDaysIcon, CheckCircleIcon, ExclamationTriangleIcon, RocketLaunchIcon, ShieldCheckIcon } from '@/lib/icons';
import {
  buildCertifyHref,
  buildCurriculumHref,
  buildTimingHref,
} from '@/lib/curriculum/href';

type Draft = { id: string; course_id: string; courses?: { title?: string; programs?: { name?: string } | null } | null };
type Direction = { id: string; course_id: string; title: string; change_summary: string; status: string; academic_session?: string | null; effective_term_number?: number | null; audience_label?: string | null; quality_status?: string | null; published_at: string };
type Preview = { release: Direction; summary: { eligible: number; skipped: number; conflict: number; protected_active_plans: number }; schools: Array<{ school_id: string; school_name: string; rollout_status: string; reason: string; active_plan_count: number }> };
type QualityBlock = {
  heading: string;
  summary?: string;
  mustFix?: Array<{ location: string; message: string; action: string }>;
};

function relation<T>(value: T | T[] | null | undefined): T | null { return Array.isArray(value) ? value[0] ?? null : value ?? null; }
function termLabel(term?: number | null) { return term === 1 ? 'First Term' : term === 2 ? 'Second Term' : term === 3 ? 'Third Term' : 'Term not set'; }

function pickDraftId(
  drafts: Draft[],
  curriculumId: string | null,
  courseId: string | null,
  current: string
): string {
  if (current && drafts.some((draft) => draft.id === current)) return current;
  if (curriculumId && drafts.some((draft) => draft.id === curriculumId)) {
    return curriculumId;
  }
  if (courseId) {
    const match = drafts.find((draft) => draft.course_id === courseId);
    if (match) return match.id;
  }
  return drafts[0]?.id ?? '';
}

export default function SchoolDirectionPage() {
  return (
    <Suspense fallback={null}>
      <SchoolDirectionPageInner />
    </Suspense>
  );
}

function SchoolDirectionPageInner() {
  const searchParams = useSearchParams();
  const linkedCurriculumId = searchParams.get('curriculum_id');
  const linkedCourseId = searchParams.get('course_id');

  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [directions, setDirections] = useState<Direction[]>([]);
  const [isAdmin, setIsAdmin] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [qualityBlock, setQualityBlock] = useState<QualityBlock | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [form, setForm] = useState({ curriculum_id: '', academic_session: '2026/2027', audience_label: 'All assigned learner levels', grade_key: '', effective_term_number: 1, change_summary: 'Initial approved curriculum direction.', source_name: 'Rillcod Academic Office', framework: 'Rillcod Coding and Robotics Academic Standard' });

  const load = useCallback(async () => {
    const response = await fetch('/api/curriculum-studio/official-directions', { cache: 'no-store' });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Could not open school assignment.');
    setIsAdmin(payload.data.is_admin);
    setMessage(payload.data.message || '');
    const nextDrafts: Draft[] = payload.data.curriculum_drafts ?? [];
    setDrafts(nextDrafts);
    setDirections(payload.data.official_directions ?? []);
    fetch('/api/settings/academic-year')
      .then((response) => response.ok ? response.json() : null)
      .then((payload) => {
        if (payload?.effective) setForm((current) => ({ ...current, academic_session: String(payload.effective) }));
      })
      .catch(() => undefined);
    setForm((current) => ({
      ...current,
      curriculum_id: pickDraftId(
        nextDrafts,
        linkedCurriculumId,
        linkedCourseId,
        current.curriculum_id
      ),
    }));
  }, [linkedCurriculumId, linkedCourseId]);

  useEffect(() => {
    load().catch((reason) => setError(reason instanceof Error ? reason.message : 'Could not open school assignment.'));
  }, [load]);

  const selectedDraft = useMemo(
    () => drafts.find((draft) => draft.id === form.curriculum_id) ?? null,
    [drafts, form.curriculum_id]
  );

  const coursesNeedingPublish = useMemo(() => {
    const covered = new Set(directions.map((d) => d.course_id));
    const seen = new Set<string>();
    const result: Draft[] = [];
    for (const draft of drafts) {
      if (seen.has(draft.course_id) || covered.has(draft.course_id)) continue;
      seen.add(draft.course_id);
      result.push(draft);
    }
    return result;
  }, [drafts, directions]);
  const distinctCentralCourses = useMemo(() => new Set(drafts.map((d) => d.course_id)).size, [drafts]);

  async function publish() {
    setBusy(true); setError(''); setMessage(''); setQualityBlock(null);
    try {
      const response = await fetch('/api/curriculum-studio/official-directions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, source_metadata: { name: form.source_name, framework: form.framework } }),
      });
      const payload = await response.json();
      if (!response.ok) {
        if (payload.quality) {
          setQualityBlock({
            heading: payload.error || payload.quality.heading || 'Curriculum is not ready to publish.',
            summary: payload.quality.summary,
            mustFix: payload.quality.mustFix ?? [],
          });
          return;
        }
        throw new Error(payload.error || 'The official direction could not be protected.');
      }
      setMessage(payload.data.message);
      setPreview(null);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The official direction could not be protected.');
    }
    finally { setBusy(false); }
  }

  async function schoolImpact(id: string, apply: boolean) {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/curriculum-governance/rollouts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ release_id: id, dry_run: !apply }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'School assignment could not be checked.');
      setPreview(payload.data);
      if (apply) { setMessage(`Academic direction assigned to ${payload.data.applied_count} schools. Existing class plans were protected.`); await load(); }
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'School assignment could not be checked.'); }
    finally { setBusy(false); }
  }

  const timingHref = buildTimingHref({
    courseId: selectedDraft?.course_id,
    releaseId: preview?.release?.id,
  });

  if (!isAdmin) return <main className="mx-auto max-w-3xl p-6"><div className="rounded-3xl border border-border bg-card p-8 text-center"><AcademicCapIcon className="mx-auto h-10 w-10 text-primary" /><h1 className="mt-4 text-2xl font-black">Your academic direction is ready in each class</h1><p className="mt-3 text-muted-foreground">{message}</p><Link href="/dashboard/classes" className="mt-6 inline-flex rounded-xl bg-primary px-5 py-3 font-bold text-primary-foreground">Open my classes</Link></div></main>;

  return (
    <main className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
      <Link href={buildCertifyHref({ curriculumId: form.curriculum_id, courseId: selectedDraft?.course_id })} className="mb-5 inline-flex items-center gap-2 text-sm font-bold text-muted-foreground hover:text-foreground"><ArrowLeftIcon className="h-4 w-4" /> Academic review</Link>
      <header className="mb-7 rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/10 to-transparent p-6">
        <p className="text-xs font-black uppercase tracking-widest text-primary">Academic Office</p><h1 className="mt-2 text-3xl font-black">Curriculum direction and schools</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">Protect one clear academic direction. It is assigned automatically to every school and matching regular, virtual or special-programme pathway. Existing class plans never change silently.</p>
      </header>
      {message && <p className="mb-5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm font-bold text-emerald-700 dark:text-emerald-300">{message}</p>}
      {error && <p role="alert" className="mb-5 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm font-bold text-destructive">{error}</p>}
      {qualityBlock && (
        <section className="mb-5 rounded-2xl border border-rose-400/30 bg-rose-400/10 p-5">
          <div className="flex items-start gap-3">
            <ExclamationTriangleIcon className="mt-0.5 h-5 w-5 shrink-0 text-rose-600 dark:text-rose-400" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-black text-foreground">{qualityBlock.heading}</p>
              {qualityBlock.summary && <p className="mt-1 text-sm text-muted-foreground">{qualityBlock.summary}</p>}
              {(qualityBlock.mustFix ?? []).length > 0 && (
                <ul className="mt-3 space-y-2 text-xs text-muted-foreground">
                  {qualityBlock.mustFix!.slice(0, 4).map((issue, index) => (
                    <li key={index} className="rounded-lg border border-rose-400/20 bg-background/40 p-2">
                      <span className="font-bold text-foreground">{issue.location}:</span> {issue.message}
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                <Link href={buildCertifyHref({ curriculumId: form.curriculum_id, courseId: selectedDraft?.course_id })} className="inline-flex rounded-xl border border-primary/40 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-primary hover:bg-primary/10">
                  Run review again
                </Link>
                <Link href={buildCurriculumHref({ courseId: selectedDraft?.course_id })} className="inline-flex rounded-xl bg-primary px-3 py-2 text-[10px] font-black uppercase tracking-widest text-primary-foreground hover:bg-primary/90">
                  Fix in builder
                </Link>
              </div>
            </div>
          </div>
        </section>
      )}

      {drafts.length > 0 && (
        <section className="mb-7 rounded-3xl border border-border bg-card p-5 sm:p-6">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-black">Curricula still needing the final readiness check</h2>
              <p className="text-sm text-muted-foreground">
                {distinctCentralCourses - coursesNeedingPublish.length} of {distinctCentralCourses} central courses have a protected edition.
                {' '}School-specific drafts are not counted here — they are never published as an official edition.
              </p>
            </div>
          </div>
          {coursesNeedingPublish.length === 0 ? (
            <p className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-4 text-sm font-bold text-emerald-700 dark:text-emerald-300">Every central course has a protected edition.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {coursesNeedingPublish.map((draft) => {
                const course = relation(draft.courses);
                const programme = relation(course?.programs);
                return (
                  <button
                    key={draft.id}
                    onClick={() => setForm((f) => ({ ...f, curriculum_id: draft.id }))}
                    className={`flex items-center justify-between gap-2 rounded-xl border p-3 text-left text-sm transition-colors ${form.curriculum_id === draft.id ? 'border-primary/50 bg-primary/5' : 'border-border hover:bg-muted/50'}`}
                  >
                    <span className="min-w-0 truncate">
                      {programme?.name ? <span className="text-muted-foreground">{programme.name} · </span> : null}
                      <span className="font-bold">{course?.title ?? 'Curriculum'}</span>
                    </span>
                    <span className="shrink-0 text-[10px] font-black uppercase tracking-widest text-primary">
                      {form.curriculum_id === draft.id ? 'Selected' : 'Select'}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_1.15fr]">
        <section className="rounded-3xl border border-border bg-card p-5 sm:p-6">
          <div className="mb-5 flex items-start gap-3"><ShieldCheckIcon className="h-7 w-7 text-primary" /><div><h2 className="text-lg font-black">Protect and assign the academic direction</h2><p className="text-sm text-muted-foreground">One action checks quality, publishes the direction and assigns it to every school and matching programme pathway.</p></div></div>
          <div className="space-y-4">
            <label className="block text-sm font-bold">Curriculum working copy<select value={form.curriculum_id} onChange={(e) => setForm({ ...form, curriculum_id: e.target.value })} className="mt-2 w-full rounded-xl border border-border bg-background p-3">{drafts.map((draft) => { const course = relation(draft.courses); const programme = relation(course?.programs); return <option key={draft.id} value={draft.id}>{programme?.name ? `${programme.name} · ` : ''}{course?.title ?? 'Curriculum'}</option>; })}</select></label>
            <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-bold">Academic session<input value={form.academic_session} onChange={(e) => setForm({ ...form, academic_session: e.target.value })} className="mt-2 w-full rounded-xl border border-border bg-background p-3" /></label><label className="text-sm font-bold">Learner level<input value={form.audience_label} onChange={(e) => setForm({ ...form, audience_label: e.target.value })} placeholder="Basic 1 or Year 1" className="mt-2 w-full rounded-xl border border-border bg-background p-3" /></label></div>
            <label className="block text-sm font-bold">When this direction becomes available<select value={form.effective_term_number} onChange={(e) => setForm({ ...form, effective_term_number: Number(e.target.value) })} className="mt-2 w-full rounded-xl border border-border bg-background p-3"><option value={1}>First Term</option><option value={2}>Second Term</option><option value={3}>Third Term</option></select><span className="mt-1 block text-xs font-normal text-muted-foreground">A school may still enter later, such as Third Term, Week 3.</span></label>
            <label className="block text-sm font-bold">What changed and why?<textarea value={form.change_summary} onChange={(e) => setForm({ ...form, change_summary: e.target.value })} rows={3} className="mt-2 w-full rounded-xl border border-border bg-background p-3" /></label>
            <details className="rounded-xl border border-border p-3"><summary className="cursor-pointer text-sm font-bold">Academic source</summary><div className="mt-3 grid gap-3"><input value={form.source_name} onChange={(e) => setForm({ ...form, source_name: e.target.value })} className="rounded-xl border border-border bg-background p-3 text-sm" /><input value={form.framework} onChange={(e) => setForm({ ...form, framework: e.target.value })} className="rounded-xl border border-border bg-background p-3 text-sm" /></div></details>

            <button onClick={publish} disabled={busy || !form.curriculum_id} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 font-black text-primary-foreground disabled:opacity-50">{busy ? <ArrowPathIcon className="h-5 w-5 animate-spin" /> : <CheckCircleIcon className="h-5 w-5" />} Check, make ready and assign</button>
          </div>
        </section>

        <section className="rounded-3xl border border-border bg-card p-5 sm:p-6">
          <div className="mb-5 flex items-start gap-3"><BuildingOfficeIcon className="h-7 w-7 text-primary" /><div><h2 className="text-lg font-black">Official directions</h2><p className="text-sm text-muted-foreground">Each protected direction is already assigned automatically. You can review the rollout record here.</p></div></div>
          <div className="space-y-3">{directions.length === 0 && <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No official direction has been protected yet.</p>}{directions.map((direction) => <article key={direction.id} className="rounded-2xl border border-border p-4"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><h3 className="font-black">{direction.title}</h3><p className="mt-1 text-sm text-muted-foreground">{direction.change_summary}</p><p className="mt-2 text-xs font-bold text-muted-foreground">{termLabel(direction.effective_term_number)} · Protected {new Date(direction.published_at).toLocaleDateString()}</p></div><button onClick={() => schoolImpact(direction.id, false)} disabled={busy} className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-border px-3 py-2 text-xs font-black hover:bg-muted"><RocketLaunchIcon className="h-4 w-4" /> Check school impact</button></div></article>)}</div>
        </section>
      </div>

      {preview && <section className="mt-6 rounded-3xl border border-primary/25 bg-primary/5 p-5 sm:p-6"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><h2 className="text-lg font-black">Automatic rollout record</h2><p className="mt-1 text-sm text-muted-foreground">{preview.summary.eligible} ready · {preview.summary.skipped} paused/not selected · {preview.summary.conflict} need attention · {preview.summary.protected_active_plans} current plans protected</p></div><Link href={timingHref} className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-black text-primary-foreground"><CalendarDaysIcon className="h-5 w-5" /> Continue to school timing</Link></div><div className="mt-5 grid gap-3 md:grid-cols-2">{preview.schools.map((school) => <div key={school.school_id} className="rounded-xl border border-border bg-card p-3"><div className="flex items-center justify-between gap-3"><p className="font-bold">{school.school_name}</p><span className="rounded-full bg-muted px-2 py-1 text-xs font-bold">{school.rollout_status === 'eligible' ? 'Ready' : school.rollout_status === 'skipped' ? 'Paused' : 'Needs attention'}</span></div><p className="mt-2 text-xs text-muted-foreground">{school.active_plan_count > 0 ? `${school.active_plan_count} current class plan(s) will remain unchanged.` : 'No current class plan will be affected.'}</p></div>)}</div><div className="mt-5 flex items-center gap-2 rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-3 text-xs text-muted-foreground"><CalendarDaysIcon className="h-5 w-5 text-cyan-700 dark:text-cyan-400" /> Set each school’s real entry point—for example Third Term, Week 3—without editing the curriculum.</div></section>}
    </main>
  );
}
