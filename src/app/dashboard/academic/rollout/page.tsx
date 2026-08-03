'use client';

/**
 * Rollout — certify, distribute and time an edition in one view.
 *
 * These were three pages. Splitting them implied three decisions, but publishing already
 * performs the rollout ("Publishing is the single rollout action. Every school and
 * matching active programme offering receives the direction"), so certify and distribute
 * were never separate choices — only separate screens. Timing is the one genuinely
 * distinct step, and it needs the edition that publishing just produced.
 *
 * One draft is chosen at the top and every section works against it, so the flow reads
 * top to bottom with no navigation between steps.
 */

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  ArrowPathIcon,
  CalendarDaysIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ShieldCheckIcon,
  SparklesIcon,
} from '@/lib/icons';
import { buildCurriculumHref } from '@/lib/curriculum/href';
import {
  findLiveDirectionForDraft,
  findScheduleForTimingScope,
  timingValuesFromSchedule,
  type CurriculumDirectionSummary,
  type CurriculumTimingSchedule,
} from '@/lib/curriculum/rollout-workflow';

type Rel<T> = T | T[] | null | undefined;
function relation<T>(value: Rel<T>): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

interface Draft {
  id: string;
  course_id: string;
  version?: number;
  courses?: Rel<{ title?: string; program_id?: string; programs?: Rel<{ name?: string }> }>;
}

interface QualityIssue {
  code: string;
  location: string;
  message: string;
  action: string;
  dimension: string;
  severity: 'must_fix' | 'improvement';
}

/** Mirrors the academic-quality response, kept whole so nothing from the old
 *  standalone certify page is lost in the merge. */
interface QualityReport {
  readiness: 'ready' | 'needs_attention' | 'not_ready';
  score: number;
  heading: string;
  summary: string;
  mustFix: QualityIssue[];
  improvements: QualityIssue[];
  dimensions: Record<string, { score: number; issueCount: number }>;
  coverage: { years: number; terms: number; weeks: number };
  note: string;
}

const DIMENSION_LABELS: Record<string, string> = {
  academic_foundation: 'Academic foundation',
  structure: 'Curriculum structure',
  learning_sequence: 'Learning sequence',
  teacher_usability: 'Teacher usability',
  assessment: 'Evidence of learning',
  human_clarity: 'Clarity and language',
};

function IssueCard({ issue }: { issue: QualityIssue }) {
  return (
    <article className={`rounded-xl border p-4 ${issue.severity === 'must_fix' ? 'border-rose-500/30 bg-rose-400/10 dark:border-rose-400/20 dark:bg-rose-400/5' : 'border-amber-500/30 bg-amber-400/10 dark:border-amber-400/20 dark:bg-amber-400/5'}`}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-wider text-muted-foreground">{issue.location}</p>
          <p className="mt-1 text-sm font-bold text-foreground">{issue.message}</p>
        </div>
        <span className="shrink-0 rounded-full bg-muted/20 px-2.5 py-1 text-[10px] font-bold text-muted-foreground">
          {DIMENSION_LABELS[issue.dimension] ?? issue.dimension}
        </span>
      </div>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        <span className="font-bold text-primary">What to do:</span> {issue.action}
      </p>
    </article>
  );
}

interface OfficialDirection extends CurriculumDirectionSummary {
  title?: string;
}

interface TimingSchedule extends CurriculumTimingSchedule {
  schools?: Rel<{ name?: string }>;
  classes?: Rel<{ name?: string }>;
  courses?: Rel<{ title?: string }>;
}

interface TimingAssignment {
  id: string;
  school_id: string;
  course_id: string;
  release_id: string;
  academic_session?: string | null;
  schools?: Rel<{ name?: string }>;
  courses?: Rel<{ title?: string; program_id?: string }>;
}

interface StrandedGroup {
  courseId: string;
  courseTitle: string;
  retiredEdition: { id: string; title: string; release_number: number | null };
  liveEdition: { id: string; title: string; release_number: number | null } | null;
  schools: Array<{ id: string; name: string; adoptedBy: string | null; adoptedAt: string | null }>;
  resolvable: boolean;
}

const SECTION = 'rounded-3xl border border-border bg-card p-5 sm:p-6';
const TERM_LABELS: Record<number, string> = { 1: 'First Term', 2: 'Second Term', 3: 'Third Term' };

/** useSearchParams needs a Suspense boundary or static generation fails at build. */
export default function RolloutPage() {
  return (
    <Suspense fallback={null}>
      <RolloutWorkspace />
    </Suspense>
  );
}

function RolloutWorkspace() {
  const searchParams = useSearchParams();
  const linkedCourseId = searchParams.get('course_id') ?? '';
  const linkedCurriculumId = searchParams.get('curriculum_id') ?? '';

  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [curriculumId, setCurriculumId] = useState('');
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  // Step 1 — review and publish
  const [report, setReport] = useState<QualityReport | null>(null);
  const [checking, setChecking] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [repairing, setRepairing] = useState(false);
  const [repairNote, setRepairNote] = useState('');
  const [assigningCourse, setAssigningCourse] = useState(false);
  const [courseNote, setCourseNote] = useState('');
  const [coursePlan, setCoursePlan] = useState<{
    to_assign: number;
    already_set: number;
    assign: Array<{ id: string; name: string | null }>;
    refused: Array<{ id: string; name: string | null; reason: string }>;
  } | null>(null);
  const [session, setSession] = useState('2026/2027');
  const [audience, setAudience] = useState('All assigned learner levels');
  const [termNumber, setTermNumber] = useState(1);

  // Step 2 — where it landed
  const [directions, setDirections] = useState<OfficialDirection[]>([]);
  /** Dry-run of who an edition reaches, before or after it is assigned. */
  const [preview, setPreview] = useState<{
    summary: { eligible: number; skipped: number; conflict: number; protected_active_plans: number };
    schools: Array<{ school_id: string; school_name: string; rollout_status: string; active_plan_count: number }>;
  } | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [stranded, setStranded] = useState<{ groups: StrandedGroup[]; totals: { schools: number } } | null>(null);
  const [strandedOpen, setStrandedOpen] = useState<string | null>(null);
  const [fixing, setFixing] = useState<string | null>(null);

  // Step 3 — timing. Every field the standalone page exposed is kept: defaulting the
  // programme position, sessions or pacing would silently overwrite a school's real
  // settings on save.
  const [assignments, setAssignments] = useState<TimingAssignment[]>([]);
  const [classes, setClasses] = useState<Array<{ id: string; name: string; school_id: string; program_id?: string | null }>>([]);
  const [schedules, setSchedules] = useState<TimingSchedule[]>([]);
  const [assignmentId, setAssignmentId] = useState('');
  const [classId, setClassId] = useState('');
  const [entryTerm, setEntryTerm] = useState(1);
  const [entryWeek, setEntryWeek] = useState(1);
  const [programmeYear, setProgrammeYear] = useState(1);
  const [programmeTerm, setProgrammeTerm] = useState(1);
  const [programmeWeek, setProgrammeWeek] = useState(1);
  const [sessionsPerWeek, setSessionsPerWeek] = useState(1);
  const [pacing, setPacing] = useState('standard');
  const [savingTiming, setSavingTiming] = useState(false);
  const [showTiming, setShowTiming] = useState(false);

  // The Timing stage in lanes.ts points at #timing. The anchor scrolled here
  // correctly and then showed a collapsed header, so arriving from the stepper
  // looked like the stage had no content. Asking for it counts as opening it.
  useEffect(() => {
    if (window.location.hash === '#timing') setShowTiming(true);
  }, []);

  const selected = useMemo(() => drafts.find((d) => d.id === curriculumId) ?? null, [drafts, curriculumId]);
  const course = relation(selected?.courses);
  const programme = relation(course?.programs);
  const liveDirection = useMemo(
    () =>
      selected
        ? findLiveDirectionForDraft(directions, {
            curriculumId: selected.id,
            academicSession: session,
            effectiveTermNumber: termNumber,
            audienceLabel: audience,
          })
        : null,
    [audience, directions, selected, session, termNumber],
  );
  const courseAssignments = useMemo(
    () => assignments.filter((assignment) => assignment.course_id === selected?.course_id),
    [assignments, selected?.course_id],
  );

  const load = useCallback(async () => {
    setError('');
    try {
      const [releasesRes, directionsRes, timingRes, strandedRes] = await Promise.all([
        fetch('/api/curriculum-governance/releases', { cache: 'no-store' }),
        fetch('/api/curriculum-studio/official-directions', { cache: 'no-store' }),
        fetch('/api/curriculum-studio/timing-options', { cache: 'no-store' }),
        fetch('/api/curriculum-governance/stranded', { cache: 'no-store' }),
      ]);

      const releases = await releasesRes.json();
      if (!releasesRes.ok) throw new Error(releases.error || 'Could not open the rollout workspace.');
      const nextDrafts: Draft[] = Array.isArray(releases.curricula) ? releases.curricula : [];
      setDrafts(nextDrafts);
      setCurriculumId((current) => {
        if (current && nextDrafts.some((d) => d.id === current)) return current;
        if (linkedCurriculumId && nextDrafts.some((d) => d.id === linkedCurriculumId)) return linkedCurriculumId;
        const byCourse = nextDrafts.find((d) => d.course_id === linkedCourseId);
        return byCourse?.id ?? nextDrafts[0]?.id ?? '';
      });

      if (directionsRes.ok) {
        const payload = await directionsRes.json();
        setIsAdmin(!!payload?.data?.is_admin);
        setDirections(payload?.data?.official_directions ?? []);
      }
      if (timingRes.ok) {
        const payload = await timingRes.json();
        const items: TimingAssignment[] = payload?.data?.assignments ?? payload?.assignments ?? [];
        setAssignments(items);
        setClasses(payload?.data?.classes ?? []);
        setSchedules(payload?.data?.schedules ?? []);
        setAssignmentId((current) => items.some((item) => item.id === current) ? current : (items[0]?.id ?? ''));
      }
      if (strandedRes.ok) setStranded(await strandedRes.json());

      // Prefill the session from the configured academic year. Publishing under a
      // hardcoded year would stamp every edition with the wrong session.
      fetch('/api/settings/academic-year')
        .then((response) => (response.ok ? response.json() : null))
        .then((payload) => { if (payload?.effective) setSession(String(payload.effective)); })
        .catch(() => undefined);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not open the rollout workspace.');
    } finally {
      setLoading(false);
    }
  }, [linkedCourseId, linkedCurriculumId]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (window.location.hash === '#timing') setShowTiming(true);
  }, []);

  useEffect(() => {
    setAssignmentId((current) =>
      courseAssignments.some((assignment) => assignment.id === current)
        ? current
        : (courseAssignments[0]?.id ?? ''),
    );
  }, [courseAssignments]);

  useEffect(() => {
    setClassId('');
  }, [assignmentId]);

  async function runReview() {
    if (!curriculumId) return;
    setChecking(true); setError(''); setReport(null);
    try {
      const response = await fetch('/api/curriculum-governance/academic-quality', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          curriculum_id: curriculumId,
          source_metadata: { name: 'Rillcod Academic Office', framework: 'Rillcod Coding and Robotics Academic Standard' },
          academic_session: session,
          audience_label: audience,
          effective_term_number: termNumber,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Could not review this curriculum.');
      setReport(payload.data ?? payload.report ?? payload);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not review this curriculum.');
    } finally { setChecking(false); }
  }

  /**
   * Ask the AI to close the gaps the review found, rather than sending the Academic Office back
   * to the builder to write them by hand. The server refuses any repair that loses a term or a
   * week, or that does not actually reduce the faults, so the worst case is "nothing changed".
   * Re-runs the review afterwards so the decision to publish is made on a fresh report.
   */
  async function repairWithAi() {
    if (!curriculumId) return;
    setRepairing(true); setError(''); setMessage(''); setRepairNote('');
    try {
      const response = await fetch('/api/curriculum-governance/quality-repair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ curriculum_id: curriculumId, include_warnings: true, save: true }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Could not repair this curriculum.');

      if (payload.status === 'repaired') {
        const fixed = Number(payload.faults_before ?? 0) - Number(payload.faults_after ?? 0);
        setRepairNote(
          `Fixed ${fixed} ${fixed === 1 ? 'fault' : 'faults'}. ${
            payload.publishable
              ? 'This curriculum is now ready to publish.'
              : `${payload.faults_after} still need a person — the review below shows which.`
          }`,
        );
      } else if (payload.status === 'not_needed') {
        setRepairNote('Nothing to repair — this curriculum already passes the checks.');
      } else if (payload.status === 'unavailable') {
        setRepairNote('The AI service did not respond. Your curriculum is unchanged; try again shortly.');
      } else {
        // Rejected: the guard refused the model's version and kept the original.
        setRepairNote(`Left unchanged — ${payload.reason ?? 'the suggested repair was not safe to apply.'}`);
      }
      await runReview();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not repair this curriculum.');
    } finally { setRepairing(false); }
  }

  /**
   * Set this edition's course on every class in the same programme that has none.
   *
   * `preview` first, so the exceptions are visible before anything is written. The server only
   * ever targets classes with no course set, and refuses any class from another programme — a
   * class cannot be quietly switched to material it does not teach.
   */
  async function assignCourseToClasses(preview: boolean) {
    const targetCourseId = selected?.course_id;
    const targetProgramId = course?.program_id;
    if (!targetCourseId || !targetProgramId) {
      setCourseNote('This edition has no course and programme attached, so classes cannot be matched to it.');
      return;
    }
    setAssigningCourse(true); setError(''); setCourseNote('');
    try {
      const response = await fetch('/api/classes/bulk-course', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ course_id: targetCourseId, program_id: targetProgramId, preview }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Could not set the course on these classes.');

      setCoursePlan({
        to_assign: Number(payload.to_assign ?? 0),
        already_set: Number(payload.already_set ?? 0),
        assign: payload.assign ?? [],
        refused: payload.refusals ?? [],
      });

      if (!preview) {
        const n = Number(payload.updated ?? 0);
        setCourseNote(
          n > 0
            ? `${n} class${n === 1 ? '' : 'es'} now teach this course. They pick up the edition on the next readiness run.`
            : 'No class needed changing.',
        );
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not set the course on these classes.');
    } finally { setAssigningCourse(false); }
  }

  /** Publishing certifies AND assigns to every eligible school in one action. */
  async function publish() {
    if (!curriculumId) return;
    setPublishing(true); setError(''); setMessage('');
    try {
      const response = await fetch('/api/curriculum-studio/official-directions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          curriculum_id: curriculumId,
          academic_session: session,
          audience_label: audience,
          grade_key: '',
          effective_term_number: termNumber,
          change_summary: 'Approved curriculum direction.',
          source_metadata: { name: 'Rillcod Academic Office', framework: 'Rillcod Coding and Robotics Academic Standard' },
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Could not publish this edition.');
      setMessage(payload?.data?.message || 'Edition published and assigned to schools.');
      setReport(null);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not publish this edition.');
    } finally { setPublishing(false); }
  }

  /** Dry-run: which schools this edition reaches, and which plans stay protected. */
  async function checkImpact(releaseId: string) {
    setPreviewing(true); setError('');
    try {
      const response = await fetch('/api/curriculum-governance/rollouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ release_id: releaseId, dry_run: true }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'School assignment could not be checked.');
      setPreview(payload.data);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'School assignment could not be checked.');
    } finally { setPreviewing(false); }
  }

  async function fixStranded(courseId: string, mode: 'move' | 'clear') {
    if (mode === 'clear' && !window.confirm('Remove these school assignments? The course will read as not distributed until a new edition is assigned.')) return;
    setFixing(courseId); setError('');
    try {
      const response = await fetch('/api/curriculum-governance/stranded', {
        method: mode === 'move' ? 'POST' : 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courseId }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Could not update those assignments.');
      setMessage(mode === 'move'
        ? `Moved ${payload.assignment?.applied_count ?? payload.requestedSchools} school(s) onto edition #${payload.movedTo?.release_number ?? ''}.`
        : `Cleared ${payload.removedAdoptions} stale assignment(s).`);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not update those assignments.');
    } finally { setFixing(null); }
  }

  const timingAssignment = courseAssignments.find((a) => a.id === assignmentId) ?? null;
  const savedTiming = useMemo(
    () => findScheduleForTimingScope(schedules, timingAssignment, classId),
    [classId, schedules, timingAssignment],
  );
  const relevantSchedules = useMemo(
    () =>
      schedules.filter(
        (schedule) =>
          schedule.course_id === selected?.course_id &&
          (!timingAssignment || schedule.school_id === timingAssignment.school_id),
      ),
    [schedules, selected?.course_id, timingAssignment],
  );

  useEffect(() => {
    const values = timingValuesFromSchedule(savedTiming);
    setEntryTerm(values.entryTerm);
    setEntryWeek(values.entryWeek);
    setProgrammeYear(values.programmeYear);
    setProgrammeTerm(values.programmeTerm);
    setProgrammeWeek(values.programmeWeek);
    setSessionsPerWeek(values.sessionsPerWeek);
    setPacing(values.pacing);
  }, [savedTiming]);

  /** Only classes in the chosen school that sit on the same programme as the course. */
  const availableClasses = useMemo(
    () => classes.filter((item) =>
      item.school_id === timingAssignment?.school_id
      && (!relation(timingAssignment?.courses)?.program_id || item.program_id === relation(timingAssignment?.courses)?.program_id)),
    [classes, timingAssignment],
  );

  async function saveTiming() {
    if (!timingAssignment) return;
    setSavingTiming(true); setError(''); setMessage('');
    try {
      const response = await fetch('/api/curriculum-governance/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          school_id: timingAssignment.school_id,
          class_id: classId || null,
          course_id: timingAssignment.course_id,
          release_id: timingAssignment.release_id,
          entry_term_number: entryTerm,
          entry_week_number: entryWeek,
          curriculum_year_number: programmeYear,
          curriculum_term_number: programmeTerm,
          curriculum_week_number: programmeWeek,
          sessions_per_week: sessionsPerWeek,
          pacing_mode: pacing,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Could not save this timing.');
      setMessage(payload?.data?.message || 'School timing saved.');
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save this timing.');
    } finally { setSavingTiming(false); }
  }

  const publishedForCourse = directions.filter((d) => d.course_id === selected?.course_id && d.status !== 'retired');

  if (loading) {
    return (
      <main className="mx-auto max-w-5xl p-4 sm:p-6 lg:p-8 mobile-page-root">
        <div className="h-40 animate-pulse rounded-3xl border border-border bg-card" />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-6 lg:p-8 mobile-page-root">
      <header className="mb-6">
        <p className="text-xs font-black uppercase tracking-widest text-primary">Academic Office</p>
        <h1 className="mt-2 text-3xl font-black">Rollout</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Choose a curriculum, check it once, and publish it to eligible schools. Existing class plans stay protected.
        </p>
      </header>

      {message && <p className="mb-5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm font-bold text-emerald-700 dark:text-emerald-300">{message}</p>}
      {error && <p role="alert" className="mb-5 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm font-bold text-destructive">{error}</p>}

      {/* Which curriculum everything below acts on. */}
      <section className={`${SECTION} mb-5`}>
        <label className="block text-sm font-bold">
          Curriculum
          <select
            value={curriculumId}
            onChange={(event) => { setCurriculumId(event.target.value); setReport(null); setPreview(null); setMessage(''); }}
            className="mt-2 w-full rounded-xl border border-border bg-background p-3 text-sm"
          >
            {drafts.length === 0 && <option value="">No curriculum drafts yet</option>}
            {drafts.map((draft) => {
              const c = relation(draft.courses);
              return <option key={draft.id} value={draft.id}>{c?.title ?? 'Course'} · v{draft.version ?? 1}</option>;
            })}
          </select>
        </label>
        {selected && (
          <p className="mt-2 text-xs text-muted-foreground">
            {programme?.name ? `${programme.name} · ` : ''}
            {publishedForCourse.length > 0
              ? `${publishedForCourse.length} live edition${publishedForCourse.length === 1 ? '' : 's'} for this course`
              : 'No live edition yet for this course'}
            {' · '}
            <Link href={buildCurriculumHref({ courseId: selected.course_id })} className="font-bold text-primary hover:underline">
              Edit in builder
            </Link>
          </p>
        )}
      </section>

      {drafts.length === 0 ? (
        <section className={SECTION}>
          <p className="text-sm text-muted-foreground">
            Nothing to roll out yet. Write a curriculum first, then return here.{' '}
            <Link href="/dashboard/academic/build" className="font-bold text-primary hover:underline">Open the builder</Link>
          </p>
        </section>
      ) : (
        <div className="space-y-5">
          {/* 1 — Review, then publish. One button each; publishing also distributes. */}
          <section id="review" className={SECTION}>
            <div className="mb-4 flex items-start gap-3">
              <ShieldCheckIcon className="h-7 w-7 shrink-0 text-primary" />
              <div>
                <h2 className="text-lg font-black">1 · Review and publish</h2>
                <p className="text-sm text-muted-foreground">A quality review runs first; publishing then certifies the edition and assigns it to schools.</p>
              </div>
            </div>

            {liveDirection && (
              <div className="mb-4 flex items-start gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-800 dark:text-emerald-200">
                <CheckCircleIcon className="mt-0.5 h-5 w-5 shrink-0" />
                <div>
                  <p className="text-sm font-black">This edition is live</p>
                  <p className="mt-1 text-xs leading-5">
                    {liveDirection.title || 'The selected curriculum'} is already protected and assigned. Repeating the action refreshes school coverage safely; it does not create a duplicate edition.
                  </p>
                </div>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-3">
              <label className="text-xs font-bold">Academic session
                <input value={session} onChange={(e) => { setSession(e.target.value); setReport(null); }} className="mt-1 w-full rounded-lg border border-border bg-background p-2 text-sm" />
              </label>
              <label className="text-xs font-bold">Audience
                <input value={audience} onChange={(e) => { setAudience(e.target.value); setReport(null); }} className="mt-1 w-full rounded-lg border border-border bg-background p-2 text-sm" />
              </label>
              <label className="text-xs font-bold">Starts in
                <select value={termNumber} onChange={(e) => { setTermNumber(Number(e.target.value)); setReport(null); }} className="mt-1 w-full rounded-lg border border-border bg-background p-2 text-sm">
                  <option value={1}>First Term</option><option value={2}>Second Term</option><option value={3}>Third Term</option>
                </select>
              </label>
            </div>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <button onClick={() => void runReview()} disabled={checking || !curriculumId}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-primary/40 px-4 py-2.5 text-sm font-black text-primary disabled:opacity-50">
                {checking ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : <ShieldCheckIcon className="h-4 w-4" />}
                {checking ? 'Checking…' : liveDirection ? 'Recheck quality' : 'Check readiness'}
              </button>
              {isAdmin && (
                <button
                  onClick={() => void publish()}
                  disabled={publishing || !curriculumId || (!liveDirection && (!report || report.readiness === 'not_ready'))}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-black text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {publishing ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : <CheckCircleIcon className="h-4 w-4" />}
                  {publishing
                    ? liveDirection ? 'Refreshing…' : 'Publishing…'
                    : liveDirection ? 'Refresh school coverage' : 'Publish to schools'}
                </button>
              )}
            </div>
            {!liveDirection && !report && (
              <p className="mt-2 text-xs text-muted-foreground">Check readiness to unlock publishing.</p>
            )}

            {report && (
              <div className="mt-5">
                <div className={`rounded-2xl border p-5 ${
                  report.readiness === 'ready'
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200'
                    : report.readiness === 'not_ready'
                      ? 'border-rose-500/30 bg-rose-400/10 text-rose-800 dark:text-rose-200'
                      : 'border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200'
                }`}>
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-lg font-black">{report.heading}</p>
                      {report.summary && <p className="mt-1 text-sm leading-6 opacity-90">{report.summary}</p>}
                    </div>
                    <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full border-4 border-current text-2xl font-black">
                      {report.score}
                    </div>
                  </div>
                  {report.coverage && (
                    <div className="mt-4 flex flex-wrap gap-2 text-xs font-bold text-muted-foreground">
                      <span className="rounded-full bg-background px-3 py-1">{report.coverage.years} {report.coverage.years === 1 ? 'year' : 'years'}</span>
                      <span className="rounded-full bg-background px-3 py-1">{report.coverage.terms} curriculum sections</span>
                      <span className="rounded-full bg-background px-3 py-1">{report.coverage.weeks} teaching weeks</span>
                    </div>
                  )}
                </div>

                {report.dimensions && (
                  <details className="mt-4 rounded-2xl border border-border bg-muted/10 p-4">
                    <summary className="cursor-pointer text-sm font-bold text-foreground">View detailed readiness scores</summary>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      {Object.entries(report.dimensions).map(([key, value]) => (
                        <div key={key} className="rounded-xl border border-border bg-muted/20 p-3">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-bold text-muted-foreground">{DIMENSION_LABELS[key] ?? key}</p>
                            <span className={`text-sm font-black ${value.score >= 85 ? 'text-emerald-700 dark:text-emerald-300' : value.score >= 70 ? 'text-amber-700 dark:text-amber-300' : 'text-rose-700 dark:text-rose-300'}`}>{value.score}</span>
                          </div>
                          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                            <div className="h-full rounded-full bg-primary" style={{ width: `${value.score}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </details>
                )}

                {(report.mustFix ?? []).length > 0 && (
                  <div className="mt-5">
                    <h3 className="mb-3 flex items-center gap-2 font-black text-rose-700 dark:text-rose-200">
                      <ExclamationTriangleIcon className="h-5 w-5" /> Must fix before publication
                    </h3>
                    <div className="space-y-3">
                      {report.mustFix.map((issue, index) => <IssueCard key={`${issue.code}-${index}`} issue={issue} />)}
                    </div>
                  </div>
                )}

                {(report.improvements ?? []).length > 0 && (
                  <div className="mt-5">
                    <h3 className="mb-3 flex items-center gap-2 font-black text-amber-800 dark:text-amber-100">
                      <SparklesIcon className="h-5 w-5" /> Improvements that will help teachers
                    </h3>
                    <div className="space-y-3">
                      {report.improvements.slice(0, 5).map((issue, index) => <IssueCard key={`${issue.code}-${index}`} issue={issue} />)}
                    </div>
                    {report.improvements.length > 5 && (
                      <p className="mt-3 text-xs text-muted-foreground">
                        Showing the first 5 of {report.improvements.length} suggestions. Similar week-by-week items can be improved together.
                      </p>
                    )}
                  </div>
                )}

                {report.note && (
                  <p className="mt-5 rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs leading-5 text-foreground">{report.note}</p>
                )}

                {repairNote && (
                  <p className="mt-4 rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm leading-5 text-foreground">
                    {repairNote}
                  </p>
                )}

                {report.readiness === 'not_ready' && selected && (
                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    {/* The AI closes the mechanical gaps — missing topics, focus points, week
                        numbering. Anything it cannot safely fix is left for a person, and the
                        builder link stays for exactly that. */}
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={repairWithAi}
                        disabled={repairing || checking}
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-black text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <SparklesIcon className="h-5 w-5" />
                        {repairing ? 'Repairing…' : 'Fix what can be fixed automatically'}
                      </button>
                    )}
                    <Link
                      href={buildCurriculumHref({ courseId: selected.course_id })}
                      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-black ${
                        isAdmin
                          ? 'border border-border bg-card text-foreground hover:bg-muted'
                          : 'bg-primary text-primary-foreground hover:bg-primary/90'
                      }`}
                    >
                      Fix in curriculum builder
                    </Link>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* 2 — Where it went, and anything left behind on a dead edition. */}
          <section id="schools" className={SECTION}>
            <div className="mb-4 flex items-start gap-3">
              <CheckCircleIcon className="h-7 w-7 shrink-0 text-primary" />
              <div>
                <h2 className="text-lg font-black">2 · School coverage</h2>
                <p className="text-sm text-muted-foreground">Publishing assigns automatically. Anything left on a retired edition is listed here.</p>
              </div>
            </div>

            <p className="text-sm text-muted-foreground">
              {publishedForCourse.length > 0
                ? `This course has ${publishedForCourse.length} live edition${publishedForCourse.length === 1 ? '' : 's'} in circulation.`
                : 'This course has no live edition assigned yet — publish above.'}
            </p>

            {/* Publishing reaches the schools, but a class only picks the edition up once this
                course is set on it. Where a programme offers several courses nothing can infer
                which one a class teaches, so without this they sit unassigned indefinitely. */}
            {isAdmin && selected && publishedForCourse.length > 0 && (
              <div className="mt-4 rounded-2xl border border-border bg-muted/20 p-4">
                <p className="text-sm font-black text-foreground">Classes teaching this course</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  A class only follows this edition once it is set to teach{' '}
                  <span className="font-bold text-foreground">{course?.title ?? 'this course'}</span>.
                  Classes in this programme that have no course yet can all be set at once.
                </p>

                {coursePlan && (
                  <div className="mt-3 rounded-xl border border-border bg-card p-3 text-sm">
                    {coursePlan.to_assign > 0 ? (
                      <p className="font-bold text-foreground">
                        {coursePlan.to_assign} class{coursePlan.to_assign === 1 ? '' : 'es'} would be set to this course.
                      </p>
                    ) : (
                      <p className="text-muted-foreground">No class is waiting for a course in this programme.</p>
                    )}
                    {coursePlan.refused?.length > 0 && (
                      <>
                        <ul className="mt-2 space-y-1 text-xs text-amber-700 dark:text-amber-300">
                          {coursePlan.refused.slice(0, 5).map((r) => (
                            <li key={r.id}>{r.name}: {r.reason}</li>
                          ))}
                        </ul>
                        {coursePlan.refused.length > 5 && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            and {coursePlan.refused.length - 5} more refused for the same kinds of reason.
                          </p>
                        )}
                      </>
                    )}
                    {coursePlan.assign?.length > 0 && (
                      <ul className="mt-2 max-h-32 space-y-0.5 overflow-y-auto text-xs text-muted-foreground">
                        {coursePlan.assign.map((c) => <li key={c.id}>{c.name}</li>)}
                      </ul>
                    )}
                  </div>
                )}

                {courseNote && (
                  <p className="mt-3 rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm">{courseNote}</p>
                )}

                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => void assignCourseToClasses(true)}
                    disabled={assigningCourse}
                    className="rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-black text-foreground hover:bg-muted disabled:opacity-50"
                  >
                    {assigningCourse ? 'Checking…' : 'Show which classes'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void assignCourseToClasses(false)}
                    disabled={assigningCourse || !coursePlan || coursePlan.to_assign === 0}
                    className="rounded-xl bg-primary px-4 py-2.5 text-sm font-black text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {coursePlan?.to_assign
                      ? `Set this course on ${coursePlan.to_assign} class${coursePlan.to_assign === 1 ? '' : 'es'}`
                      : 'Set this course on the waiting classes'}
                  </button>
                </div>
              </div>
            )}

            {publishedForCourse.length > 0 && (
              <button
                type="button"
                onClick={() => void checkImpact((liveDirection ?? publishedForCourse[0]).id)}
                disabled={previewing}
                className="mt-3 inline-flex items-center gap-2 rounded-xl border border-primary/40 px-4 py-2 text-xs font-black text-primary disabled:opacity-50"
              >
                {previewing ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : null}
                {previewing ? 'Checking…' : 'Check which schools this reaches'}
              </button>
            )}

            {preview && (
              <div className="mt-4 rounded-xl border border-primary/25 bg-primary/5 p-4">
                <p className="text-sm font-black text-foreground">
                  {preview.summary.eligible} ready · {preview.summary.skipped} paused/not selected · {preview.summary.conflict} need attention · {preview.summary.protected_active_plans} current plans protected
                </p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {preview.schools.map((school) => (
                    <div key={school.school_id} className="rounded-lg border border-border bg-card p-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="truncate text-sm font-bold text-foreground">{school.school_name}</p>
                        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-black">
                          {school.rollout_status === 'eligible' ? 'Ready' : school.rollout_status === 'skipped' ? 'Paused' : 'Needs attention'}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {school.active_plan_count > 0
                          ? `${school.active_plan_count} current class plan(s) will remain unchanged.`
                          : 'No current class plan will be affected.'}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {stranded && stranded.groups.length > 0 && (
              <div className="mt-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
                <div className="flex items-start gap-2">
                  <ExclamationTriangleIcon className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
                  <p className="text-sm font-black text-foreground">
                    {stranded.totals.schools} school{stranded.totals.schools === 1 ? '' : 's'} still sit on a retired edition
                  </p>
                </div>
                <div className="mt-3 space-y-3">
                  {stranded.groups.map((group) => {
                    const open = strandedOpen === group.courseId;
                    const busy = fixing === group.courseId;
                    return (
                      <div key={group.courseId} className="rounded-lg border border-amber-500/30 bg-background/60 p-3">
                        <p className="text-sm font-black text-foreground">{group.courseTitle}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {group.schools.length} school{group.schools.length === 1 ? '' : 's'} on “{group.retiredEdition.title}”
                          {group.liveEdition ? ` · live edition #${group.liveEdition.release_number ?? '—'} available` : ' · no live edition exists'}
                        </p>
                        <button onClick={() => setStrandedOpen(open ? null : group.courseId)} className="mt-2 text-[11px] font-bold text-primary hover:underline">
                          {open ? 'Hide schools' : `Show the ${group.schools.length} school${group.schools.length === 1 ? '' : 's'}`}
                        </button>
                        {open && (
                          <ul className="mt-2 grid gap-1 sm:grid-cols-2">
                            {group.schools.map((school) => (
                              <li key={school.id} className="rounded-lg bg-muted px-2 py-1.5 text-[11px]">
                                <span className="block truncate font-bold text-foreground">{school.name}</span>
                                <span className="block truncate text-[10px] text-muted-foreground">
                                  {school.adoptedBy ? `Adopted by ${school.adoptedBy}` : 'Adopted automatically on publish'}
                                  {school.adoptedAt ? ` · ${new Date(school.adoptedAt).toLocaleDateString()}` : ''}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                        {isAdmin && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {group.resolvable && (
                              <button onClick={() => void fixStranded(group.courseId, 'move')} disabled={busy}
                                className="rounded-xl bg-primary px-4 py-2 text-xs font-black text-primary-foreground disabled:opacity-50">
                                {busy ? 'Working…' : `Move to edition #${group.liveEdition?.release_number ?? ''}`}
                              </button>
                            )}
                            <button onClick={() => void fixStranded(group.courseId, 'clear')} disabled={busy}
                              className="rounded-xl border border-rose-500/40 px-4 py-2 text-xs font-black text-rose-700 dark:text-rose-300 hover:bg-rose-500/10 disabled:opacity-50">
                              {busy ? 'Working…' : 'Unadopt and clear'}
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </section>

          {/* 3 — When teaching actually starts. */}
          <section id="timing" className={SECTION}>
            <button
              type="button"
              onClick={() => setShowTiming((current) => !current)}
              aria-expanded={showTiming}
              className="flex min-h-11 w-full items-start justify-between gap-4 text-left"
            >
              <span className="flex items-start gap-3">
                <CalendarDaysIcon className="h-7 w-7 shrink-0 text-primary" />
                <span>
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-lg font-black">School timing exceptions</span>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-muted-foreground">Optional</span>
                  </span>
                  <span className="mt-1 block text-sm text-muted-foreground">
                    Standard rollout needs no change. Open this only when a school joins mid-programme or uses a different pace.
                  </span>
                </span>
              </span>
              <span className="shrink-0 text-xs font-black text-primary">{showTiming ? 'Hide' : 'Adjust'}</span>
            </button>

            {showTiming && (courseAssignments.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">No school assignments yet. Publish an edition above, then set its entry point here.</p>
            ) : (
              <div className="mt-4 space-y-4">
                {savedTiming && (
                  <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs font-bold text-emerald-800 dark:text-emerald-200">
                    Saved timing loaded. Changes update this setting instead of replacing it with defaults.
                  </p>
                )}
                <label className="block text-sm font-bold">School and course
                  <select value={assignmentId} onChange={(e) => { setAssignmentId(e.target.value); setClassId(''); }} className="mt-2 w-full rounded-xl border border-border bg-background p-3 text-sm">
                    {courseAssignments.map((item) => (
                      <option key={item.id} value={item.id}>
                        {relation(item.schools)?.name ?? 'School'} · {relation(item.courses)?.title ?? 'Course'}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block text-sm font-bold">Apply timing to
                  <select value={classId} onChange={(e) => setClassId(e.target.value)} className="mt-2 w-full rounded-xl border border-border bg-background p-3 text-sm">
                    <option value="">Every class in this school taking this course</option>
                    {availableClasses.map((item) => <option key={item.id} value={item.id}>Only {item.name}</option>)}
                  </select>
                </label>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="text-sm font-bold">School begins in
                    <select value={entryTerm} onChange={(e) => setEntryTerm(Number(e.target.value))} className="mt-2 w-full rounded-xl border border-border bg-background p-3 text-sm">
                      <option value={1}>First Term</option><option value={2}>Second Term</option><option value={3}>Third Term</option>
                    </select>
                  </label>
                  <label className="text-sm font-bold">First teaching week
                    <select value={entryWeek} onChange={(e) => setEntryWeek(Number(e.target.value))} className="mt-2 w-full rounded-xl border border-border bg-background p-3 text-sm">
                      {Array.from({ length: 12 }, (_, index) => <option key={index + 1} value={index + 1}>Week {index + 1}</option>)}
                    </select>
                  </label>
                </div>

                <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4">
                  <p className="text-sm font-black">Where should the programme continue from?</p>
                  <p className="mt-1 text-xs text-muted-foreground">Usually Year 1, First Term, Week 1. Change this only when learners are joining an existing programme.</p>
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <label className="text-xs font-bold">Year
                      <input type="number" min={1} max={6} value={programmeYear} onChange={(e) => setProgrammeYear(Number(e.target.value))} className="mt-1 w-full rounded-lg border border-border bg-background p-2" />
                    </label>
                    <label className="text-xs font-bold">Term
                      <select value={programmeTerm} onChange={(e) => setProgrammeTerm(Number(e.target.value))} className="mt-1 w-full rounded-lg border border-border bg-background p-2">
                        <option value={1}>First</option><option value={2}>Second</option><option value={3}>Third</option>
                      </select>
                    </label>
                    <label className="text-xs font-bold">Week
                      <input type="number" min={1} max={12} value={programmeWeek} onChange={(e) => setProgrammeWeek(Number(e.target.value))} className="mt-1 w-full rounded-lg border border-border bg-background p-2" />
                    </label>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="text-sm font-bold">Sessions each week
                    <input type="number" min={1} max={14} value={sessionsPerWeek} onChange={(e) => setSessionsPerWeek(Number(e.target.value))} className="mt-2 w-full rounded-xl border border-border bg-background p-3 text-sm" />
                  </label>
                  <label className="text-sm font-bold">Pacing
                    <select value={pacing} onChange={(e) => setPacing(e.target.value)} className="mt-2 w-full rounded-xl border border-border bg-background p-3 text-sm">
                      <option value="standard">Standard pace</option>
                      <option value="accelerated">Faster pace</option>
                      <option value="extended">More time for mastery</option>
                      <option value="custom">Custom pace</option>
                    </select>
                  </label>
                </div>
                <button onClick={() => void saveTiming()} disabled={savingTiming || !timingAssignment}
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-black text-primary-foreground disabled:opacity-50 sm:w-auto">
                  {savingTiming ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : <CheckCircleIcon className="h-4 w-4" />}
                  {savingTiming ? 'Saving…' : 'Save school timing'}
                </button>

                {/* What is already set — school defaults and class exceptions in one list. */}
                <div className="mt-2 border-t border-border pt-4">
                  <p className="text-sm font-black">Current timing</p>
                  <div className="mt-3 space-y-3">
                    {relevantSchedules.length === 0 && (
                      <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                        No school timing has been set yet.
                      </p>
                    )}
                    {relevantSchedules.map((item) => (
                      <article key={item.id} className="rounded-2xl border border-border p-4">
                        <h3 className="font-black">{relation(item.classes)?.name ?? relation(item.schools)?.name ?? 'School default'}</h3>
                        <p className="mt-1 text-sm text-muted-foreground">{relation(item.courses)?.title ?? 'Course'}</p>
                        <p className="mt-3 text-sm font-bold">Begins {TERM_LABELS[Number(item.entry_term_number ?? 1)] ?? `Term ${item.entry_term_number}`}, Week {item.entry_week_number}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Starts from Programme Year {item.curriculum_year_number}, {TERM_LABELS[Number(item.curriculum_term_number ?? 1)] ?? `Term ${item.curriculum_term_number}`}, Week {item.curriculum_week_number}
                          {' · '}{item.sessions_per_week} session(s) weekly · {item.pacing_mode} pace
                        </p>
                      </article>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </section>
        </div>
      )}
    </main>
  );
}
