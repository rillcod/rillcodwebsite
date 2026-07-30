'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowPathIcon, CalendarDaysIcon, CheckCircleIcon, ClockIcon, InformationCircleIcon } from '@/lib/icons';
import { buildDistributeHref, buildClassTeachingHref } from '@/lib/curriculum/href';

type Assignment = { id: string; school_id: string; course_id: string; release_id: string; academic_session?: string | null; schools?: { name?: string } | null; courses?: { title?: string; program_id?: string | null } | null; release?: { title?: string; audience_label?: string | null } | null };
type Klass = { id: string; name: string; school_id: string; program_id?: string | null };
type Schedule = { id: string; school_id: string; class_id?: string | null; entry_term_number: number; entry_week_number: number; curriculum_year_number: number; curriculum_term_number: number; curriculum_week_number: number; sessions_per_week: number; pacing_mode: string; schools?: { name?: string } | null; classes?: { name?: string } | null; courses?: { title?: string } | null };

function relation<T>(value: T | T[] | null | undefined): T | null { return Array.isArray(value) ? value[0] ?? null : value ?? null; }
function termLabel(value: number) { return value === 1 ? 'First Term' : value === 2 ? 'Second Term' : 'Third Term'; }

export default function CurriculumTimingPage() {
  return (
    <Suspense fallback={null}>
      <CurriculumTimingPageInner />
    </Suspense>
  );
}

function CurriculumTimingPageInner() {
  const searchParams = useSearchParams();
  const linkedCourseId = searchParams.get('course_id');
  const linkedReleaseId = searchParams.get('release_id');

  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [classes, setClasses] = useState<Klass[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [assignmentId, setAssignmentId] = useState('');
  const [classId, setClassId] = useState('');
  const [entryTerm, setEntryTerm] = useState(1);
  const [entryWeek, setEntryWeek] = useState(1);
  const [programmeYear, setProgrammeYear] = useState(1);
  const [programmeTerm, setProgrammeTerm] = useState(1);
  const [programmeWeek, setProgrammeWeek] = useState(1);
  const [sessionsPerWeek, setSessionsPerWeek] = useState(1);
  const [pacing, setPacing] = useState('standard');
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function load() {
    const response = await fetch('/api/curriculum-studio/timing-options', { cache: 'no-store' });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Could not load school timing.');
    const nextAssignments: Assignment[] = payload.data.assignments ?? [];
    setAssignments(nextAssignments);
    setClasses(payload.data.classes ?? []);
    setSchedules(payload.data.schedules ?? []);

    const preferred =
      (linkedReleaseId &&
        nextAssignments.find((item) => item.release_id === linkedReleaseId)?.id) ||
      (linkedCourseId &&
        nextAssignments.find((item) => item.course_id === linkedCourseId)?.id) ||
      nextAssignments[0]?.id ||
      '';
    setAssignmentId((current) => current || preferred);
    setLoaded(true);
  }

  useEffect(() => {
    load().catch((reason) => setError(reason instanceof Error ? reason.message : 'Could not load school timing.'));
  }, [linkedCourseId, linkedReleaseId]);

  const assignment = assignments.find((item) => item.id === assignmentId) ?? null;
  const availableClasses = useMemo(() => classes.filter((item) => item.school_id === assignment?.school_id && (!relation(assignment?.courses)?.program_id || item.program_id === relation(assignment?.courses)?.program_id)), [classes, assignment]);

  async function save() {
    if (!assignment) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await fetch('/api/curriculum-governance/schedules', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ school_id: assignment.school_id, class_id: classId || null, course_id: assignment.course_id, release_id: assignment.release_id, entry_term_number: entryTerm, entry_week_number: entryWeek, curriculum_year_number: programmeYear, curriculum_term_number: programmeTerm, curriculum_week_number: programmeWeek, sessions_per_week: sessionsPerWeek, pacing_mode: pacing }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Could not save this timing.');
      setMessage(payload.data.message);
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save this timing.'); }
    finally { setBusy(false); }
  }

  return <main className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
    <Link href={buildDistributeHref({ courseId: assignment?.course_id ?? linkedCourseId })} className="mb-5 inline-flex text-sm font-bold text-muted-foreground hover:text-foreground">
      &larr; School assignment
    </Link>
    <header className="mb-7 rounded-3xl border border-cyan-500/20 bg-cyan-500/5 p-6"><p className="text-xs font-black uppercase tracking-widest text-cyan-700 dark:text-cyan-300">Academic Office</p><h1 className="mt-2 text-3xl font-black">School timing</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">Tell the system when teaching actually begins. The official learning sequence stays intact, while each school or class starts from its real calendar position.</p></header>
    {loaded && assignments.length === 0 && (
      <p className="mb-5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-muted-foreground">
        No school assignments exist yet. Protect and assign an official edition first, then return here to set each school&apos;s real entry point.
        {' '}
        <Link href={buildDistributeHref({ courseId: linkedCourseId })} className="font-bold text-primary hover:underline">
          Open school assignment
        </Link>
      </p>
    )}
    {message && <p className="mb-5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm font-bold text-emerald-700 dark:text-emerald-300">{message}</p>}{error && <p role="alert" className="mb-5 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm font-bold text-destructive">{error}</p>}
    <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
      <section className="rounded-3xl border border-border bg-card p-5 sm:p-6"><div className="mb-5 flex gap-3"><CalendarDaysIcon className="h-7 w-7 text-primary" /><div><h2 className="text-lg font-black">Set the real entry point</h2><p className="text-sm text-muted-foreground">Start with a school default, then add a class exception only when needed.</p></div></div>
        <div className="space-y-4"><label className="block text-sm font-bold">School and course<select value={assignmentId} onChange={(e) => { setAssignmentId(e.target.value); setClassId(''); }} className="mt-2 w-full rounded-xl border border-border bg-background p-3">{assignments.map((item) => <option key={item.id} value={item.id}>{relation(item.schools)?.name ?? 'School'} · {relation(item.courses)?.title ?? 'Course'} · {item.academic_session ?? 'Academic session'}</option>)}</select></label>
          <label className="block text-sm font-bold">Apply timing to<select value={classId} onChange={(e) => setClassId(e.target.value)} className="mt-2 w-full rounded-xl border border-border bg-background p-3"><option value="">Every class in this school taking this course</option>{availableClasses.map((item) => <option key={item.id} value={item.id}>Only {item.name}</option>)}</select></label>
          <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-bold">School begins in<select value={entryTerm} onChange={(e) => setEntryTerm(Number(e.target.value))} className="mt-2 w-full rounded-xl border border-border bg-background p-3"><option value={1}>First Term</option><option value={2}>Second Term</option><option value={3}>Third Term</option></select></label><label className="text-sm font-bold">First teaching week<select value={entryWeek} onChange={(e) => setEntryWeek(Number(e.target.value))} className="mt-2 w-full rounded-xl border border-border bg-background p-3">{Array.from({ length: 12 }, (_, index) => <option key={index + 1} value={index + 1}>Week {index + 1}</option>)}</select></label></div>
          <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4"><p className="text-sm font-black">Where should the programme continue from?</p><p className="mt-1 text-xs text-muted-foreground">Usually Year 1, First Term, Week 1. Change this only when learners are joining an existing programme.</p><div className="mt-3 grid grid-cols-3 gap-3"><label className="text-xs font-bold">Year<input type="number" min={1} max={6} value={programmeYear} onChange={(e) => setProgrammeYear(Number(e.target.value))} className="mt-1 w-full rounded-lg border border-border bg-background p-2" /></label><label className="text-xs font-bold">Term<select value={programmeTerm} onChange={(e) => setProgrammeTerm(Number(e.target.value))} className="mt-1 w-full rounded-lg border border-border bg-background p-2"><option value={1}>First</option><option value={2}>Second</option><option value={3}>Third</option></select></label><label className="text-xs font-bold">Week<input type="number" min={1} max={12} value={programmeWeek} onChange={(e) => setProgrammeWeek(Number(e.target.value))} className="mt-1 w-full rounded-lg border border-border bg-background p-2" /></label></div></div>
          <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-bold">Sessions each week<input type="number" min={1} max={14} value={sessionsPerWeek} onChange={(e) => setSessionsPerWeek(Number(e.target.value))} className="mt-2 w-full rounded-xl border border-border bg-background p-3" /></label><label className="text-sm font-bold">Pacing<select value={pacing} onChange={(e) => setPacing(e.target.value)} className="mt-2 w-full rounded-xl border border-border bg-background p-3"><option value="standard">Standard pace</option><option value="accelerated">Faster pace</option><option value="extended">More time for mastery</option><option value="custom">Custom pace</option></select></label></div>
          <div className="flex gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs leading-5 text-muted-foreground"><InformationCircleIcon className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" /><span>If teaching begins in {termLabel(entryTerm)}, Week {entryWeek}, earlier calendar weeks will not be marked late or missed.</span></div>
          <button onClick={save} disabled={busy || !assignment} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 font-black text-primary-foreground disabled:opacity-50">{busy ? <ArrowPathIcon className="h-5 w-5 animate-spin" /> : <CheckCircleIcon className="h-5 w-5" />} Save school timing</button>
          {message && (
            <Link
              href={
                classId
                  ? buildClassTeachingHref({
                      classId,
                      courseId: assignment?.course_id,
                    })
                  : availableClasses[0]?.id
                    ? buildClassTeachingHref({
                        classId: availableClasses[0].id,
                        courseId: assignment?.course_id,
                      })
                    : "/dashboard/classes"
              }
              className="inline-flex w-full items-center justify-center rounded-xl border border-border px-5 py-3 text-sm font-black text-foreground hover:bg-muted"
            >
              Open class teaching
            </Link>
          )}
        </div></section>
      <section className="rounded-3xl border border-border bg-card p-5 sm:p-6"><div className="mb-5 flex gap-3"><ClockIcon className="h-7 w-7 text-primary" /><div><h2 className="text-lg font-black">Current timing</h2><p className="text-sm text-muted-foreground">One readable view of school defaults and class exceptions.</p></div></div><div className="space-y-3">{schedules.length === 0 && <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No school timing has been set yet.</p>}{schedules.map((item) => <article key={item.id} className="rounded-2xl border border-border p-4"><h3 className="font-black">{relation(item.classes)?.name ?? relation(item.schools)?.name ?? 'School default'}</h3><p className="mt-1 text-sm text-muted-foreground">{relation(item.courses)?.title ?? 'Course'}</p><p className="mt-3 text-sm font-bold">Begins {termLabel(item.entry_term_number)}, Week {item.entry_week_number}</p><p className="mt-1 text-xs text-muted-foreground">Starts from Programme Year {item.curriculum_year_number}, {termLabel(item.curriculum_term_number)}, Week {item.curriculum_week_number} · {item.sessions_per_week} session(s) weekly · {item.pacing_mode} pace</p></article>)}</div></section>
    </div>
  </main>;
}
