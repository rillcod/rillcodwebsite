// @refresh reset
'use client';

import { useState, useEffect, useCallback, useMemo, useRef, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import PipelineStepper from '@/components/pipeline/PipelineStepper';
import {
  DocumentTextIcon, PlusIcon, PencilIcon, CheckCircleIcon, XMarkIcon,
  MagnifyingGlassIcon, BookOpenIcon, ArrowPathIcon, ClipboardDocumentListIcon,
  SparklesIcon, AcademicCapIcon,
} from '@/lib/icons';
import { toast } from 'sonner';

interface LessonPlan {
  id: string;
  lesson_id?: string | null;
  course_id?: string | null;
  class_id?: string | null;
  school_id?: string | null;
  term?: string | null;
  term_start?: string | null;
  term_end?: string | null;
  sessions_per_week?: number | null;
  curriculum_version_id?: string | null;
  status?: string | null;
  version?: number | null;
  plan_data?: Record<string, unknown> | null;
  objectives?: string | null;
  activities?: string | null;
  assessment_methods?: string | null;
  staff_notes?: string | null;
  summary_notes?: string | null;
  created_at: string;
  updated_at: string;
  lessons?: {
    id: string;
    title: string;
    course_id: string;
    lesson_type: string | null;
    status: string;
    courses?: { id: string; title: string };
  } | null;
  courses?: { id: string; title: string; program_id?: string | null } | null;
  classes?: { id: string; name: string } | null;
  schools?: { id: string; name: string } | null;
}

function getWeekEntries(planData: LessonPlan['plan_data']): Array<Record<string, unknown>> {
  if (!planData || typeof planData !== 'object') return [];
  const maybeWeeks = (planData as Record<string, unknown>).weeks;
  return Array.isArray(maybeWeeks) ? (maybeWeeks as Array<Record<string, unknown>>) : [];
}

interface Course {
  id: string;
  title: string;
  program_id?: string | null;
  programs?: { id: string; name: string } | null;
  /** Soft-tag payload from courses.metadata — optional grade targeting & subject. */
  metadata?: {
    subject?: string;
    grade_levels?: string[];
    tags?: string[];
  } | null;
}
interface Class { id: string; name: string; school_id?: string | null }
interface School { id: string; name: string }
interface Program { id: string; name: string }
interface Curriculum {
  id: string;
  version: number;
  school_id?: string | null;
  content: any;
  schools?: { id: string; name: string } | null;
}

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  draft:     { label: 'Draft',     cls: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30' },
  published: { label: 'Published', cls: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
  archived:  { label: 'Archived',  cls: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
};

// ─── Term date helpers (Nigerian school calendar) ────────────────────────────
function academicYearOptions(): string[] {
  const y = new Date().getFullYear();
  return [`${y - 1}/${y}`, `${y}/${y + 1}`, `${y + 1}/${y + 2}`];
}

function currentAcademicYear(): string {
  const now = new Date();
  const y = now.getFullYear();
  return now.getMonth() >= 8 ? `${y}/${y + 1}` : `${y - 1}/${y}`;
}

function termDates(term: string, academicYear: string): { start: string; end: string } | null {
  const [startY, endY] = academicYear.split('/').map(Number);
  if (!startY || !endY) return null;
  if (term === 'First Term')  return { start: `${startY}-09-01`, end: `${startY}-12-15` };
  if (term === 'Second Term') return { start: `${endY}-01-10`,   end: `${endY}-04-10` };
  if (term === 'Third Term')  return { start: `${endY}-05-01`,   end: `${endY}-07-25` };
  return null;
}

function getCourseProgramId(course: Course): string {
  return (course.program_id ?? course.programs?.id ?? '').trim();
}

function getCurrentTermLabel(): string {
  const m = new Date().getMonth() + 1;
  if (m >= 9) return 'First Term';
  if (m >= 5) return 'Third Term';
  return 'Second Term';
}

/** Match syllabus JSON `terms[].term` (1–3) to UI term like "First Term" or "First Term 2025/2026". */
function inferTermNumberFromLabel(term: string): number {
  const s = term.trim().toLowerCase();
  if (s.startsWith('first') || /\b1st\b/.test(s) || /\bterm\s*1\b/.test(s)) return 1;
  if (s.startsWith('second') || /\b2nd\b/.test(s) || /\bterm\s*2\b/.test(s)) return 2;
  if (s.startsWith('third') || /\b3rd\b/.test(s) || /\bterm\s*3\b/.test(s)) return 3;
  return 1;
}

function LessonPlansPageInner() {
  const { profile, loading: authLoading, profileLoading } = useAuth();
  const sp = useSearchParams();
  const qpCourseId     = sp.get('course_id');
  const qpProgramId    = sp.get('program_id');
  const qpCurriculumId = sp.get('curriculum_id');
  const qpTerm         = sp.get('term');

  const [plans, setPlans] = useState<LessonPlan[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [allClasses, setAllClasses] = useState<Class[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [curricula, setCurricula] = useState<Curriculum[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterProgramId, setFilterProgramId] = useState(qpProgramId ?? '');
  const [filterClassId, setFilterClassId] = useState<string>('');
  const [filterTerm, setFilterTerm] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [prefilledFromUrl, setPrefilledFromUrl] = useState(false);
  const [autoClassMatch, setAutoClassMatch] = useState(true);
  const [autoPickedClassId, setAutoPickedClassId] = useState('');
  const scheduleStepRef = useRef<HTMLDivElement | null>(null);
  /** Courses for the selected programme (fetched directly so we are not limited to the first N global rows). */
  const [programScopedCourses, setProgramScopedCourses] = useState<Course[] | null>(null);
  const [programCoursesLoading, setProgramCoursesLoading] = useState(false);

  const isAdmin = profile?.role === 'admin';
  const isTeacher = profile?.role === 'teacher';
  const canManage = isAdmin || isTeacher;

  const [form, setForm] = useState({
    academic_year: currentAcademicYear(),
    term: qpTerm ?? '',
    program_id: qpProgramId ?? '',
    course_id: qpCourseId ?? '',
    class_id: '',
    school_id: '',
    term_start: '',
    term_end: '',
    sessions_per_week: '5',
    curriculum_version_id: qpCurriculumId ?? '',
  });

  // Auto-fill dates when term or academic year changes
  useEffect(() => {
    if (!form.term) return;
    const dates = termDates(form.term, form.academic_year);
    if (dates) setForm(f => ({ ...f, term_start: dates.start, term_end: dates.end }));
  }, [form.term, form.academic_year]);

  // Load curricula when course changes (but respect curriculum_id from URL on first mount)
  useEffect(() => {
    if (!form.course_id) {
      setCurricula([]);
      if (!qpCurriculumId) setForm(f => ({ ...f, curriculum_version_id: '' }));
      return;
    }
    fetch(`/api/curricula?course_id=${form.course_id}`)
      .then(r => r.json())
      .then(j => setCurricula(j.data ?? []))
      .catch(() => setCurricula([]));
  }, [form.course_id, qpCurriculumId]);

  // Keep school context aligned for non-admin users so Step 2/3 filters don't
  // accidentally hide school-scoped syllabus options.
  useEffect(() => {
    if (!profile?.id) return;
    if (isAdmin) return;
    const profileSchoolId = profile?.school_id ?? '';
    if (!profileSchoolId) return;
    if (form.school_id) return;
    setForm(f => ({ ...f, school_id: profileSchoolId }));
  }, [profile?.id, profile?.school_id, isAdmin, form.school_id]);

  // If a curriculum is preselected (from pipeline query params), inherit its
  // school scope so Step 2 "Import weeks from syllabus" behaves predictably.
  useEffect(() => {
    if (!form.curriculum_version_id || curricula.length === 0) return;
    const selected = curricula.find(c => c.id === form.curriculum_version_id);
    if (!selected) return;
    if (selected.school_id && selected.school_id !== form.school_id) {
      setForm(f => ({ ...f, school_id: selected.school_id ?? '' }));
    }
  }, [form.curriculum_version_id, curricula, form.school_id]);

  // When a programme is chosen in the create-plan modal, load that programme's courses explicitly.
  // The global `courses` list is capped at 500 rows — courses for the selected programme may not appear otherwise.
  useEffect(() => {
    if (!showForm || !form.program_id) {
      setProgramScopedCourses(null);
      setProgramCoursesLoading(false);
      return;
    }
    const ac = new AbortController();
    setProgramScopedCourses(null);
    setProgramCoursesLoading(true);
    fetch(`/api/courses?program_id=${encodeURIComponent(form.program_id)}&limit=500`, { signal: ac.signal })
      .then(r => r.json())
      .then(j => {
        if (!ac.signal.aborted) setProgramScopedCourses(Array.isArray(j.data) ? j.data : []);
      })
      .catch(() => {
        if (!ac.signal.aborted) setProgramScopedCourses([]);
      })
      .finally(() => {
        if (!ac.signal.aborted) setProgramCoursesLoading(false);
      });
    return () => ac.abort();
  }, [showForm, form.program_id]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [plansRes, coursesRes, classesRes, programsRes] = await Promise.all([
        fetch('/api/lesson-plans'),
        // Lesson-plan form needs broad course coverage across programmes.
        // /api/courses is paginated by default; request a high limit to avoid
        // "programme selected but no courses visible" in Step 2.
        fetch('/api/courses?limit=500'),
        fetch('/api/classes'),
        fetch('/api/programs?is_active=true'),
      ]);
      const plansJson    = await plansRes.json();
      const coursesJson  = coursesRes.ok  ? await coursesRes.json()  : { data: [] };
      const classesJson  = classesRes.ok  ? await classesRes.json()  : { data: [] };
      const programsJson = programsRes.ok ? await programsRes.json() : { data: [] };

      setPlans(plansJson.data ?? []);
      setCourses(coursesJson.data ?? []);
      setAllClasses(classesJson.data ?? []);
      setPrograms(programsJson.data ?? []);

      if (isAdmin) {
        const schoolsRes = await fetch('/api/schools');
        const schoolsJson = schoolsRes.ok ? await schoolsRes.json() : { data: [] };
        setSchools(schoolsJson.data ?? []);
      }
    } catch {
      toast.error('Failed to load lesson plans');
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    if (!authLoading && !profileLoading && profile) load();
  }, [authLoading, profileLoading, profile, load]);

  // After courses arrive, if a URL course is specified, auto-open modal once + set program context.
  useEffect(() => {
    if (prefilledFromUrl) return;
    if (!qpCourseId || courses.length === 0) return;
    const match = courses.find(c => c.id === qpCourseId);
    if (match?.program_id) {
      setForm(f => ({ ...f, program_id: match.program_id ?? '', course_id: match.id }));
      setFilterProgramId(match.program_id ?? '');
    } else {
      setForm(f => ({ ...f, course_id: qpCourseId }));
    }
    setShowForm(true);
    setPrefilledFromUrl(true);
  }, [qpCourseId, courses, prefilledFromUrl]);

  function resetForm() {
    setForm({
      academic_year: currentAcademicYear(),
      term: '',
      program_id: filterProgramId,
      course_id: '',
      class_id: '',
      school_id: '',
      term_start: '',
      term_end: '',
      sessions_per_week: '5',
      curriculum_version_id: '',
    });
    setAutoClassMatch(true);
    setAutoPickedClassId('');
  }

  async function save() {
    if (!form.term) { toast.error('Please select a term'); return; }
    if (!form.course_id) { toast.error('Please select a course'); return; }
    if (!form.term_start || !form.term_end) { toast.error('Start and end dates are required'); return; }
    setSubmitting(true);
    try {
      const res = await fetch('/api/lesson-plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          course_id: form.course_id || null,
          class_id: form.class_id || null,
          school_id: form.school_id || profile?.school_id || null,
          term: form.term ? `${form.term} ${form.academic_year}` : null,
          term_start: form.term_start || null,
          term_end: form.term_end || null,
          sessions_per_week: form.sessions_per_week ? Number(form.sessions_per_week) : null,
          curriculum_version_id: form.curriculum_version_id || null,
          status: 'draft',
          plan_data: {},
          created_by: profile?.id,
        }),
      });
      if (!res.ok) { const j = await res.json(); throw new Error(j.error); }
      toast.success('Lesson plan created');
      setShowForm(false);
      resetForm();
      load();
    } catch (e: any) {
      toast.error(e.message || 'Failed to save');
    } finally {
      setSubmitting(false);
    }
  }

  const programOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of programs) {
      if (!p.id) continue;
      map.set(p.id, p.name || 'Programme');
    }
    for (const c of courses) {
      const pid = getCourseProgramId(c);
      if (!pid) continue;
      if (!map.has(pid)) map.set(pid, c.programs?.name ?? 'Programme');
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [programs, courses]);

  // Courses scoped by the selected program (form + filter).
  const coursesForForm = useMemo(() => {
    if (!form.program_id) return courses;
    if (programScopedCourses !== null) return programScopedCourses;
    return courses.filter(c => getCourseProgramId(c) === form.program_id);
  }, [courses, form.program_id, programScopedCourses]);

  // If the programme has exactly one course, select it so syllabus + class steps can advance in order.
  useEffect(() => {
    if (!showForm || !form.program_id) return;
    if (!programScopedCourses || programScopedCourses.length !== 1) return;
    const only = programScopedCourses[0];
    setForm(f => {
      if (f.course_id === only.id) return f;
      return { ...f, course_id: only.id, curriculum_version_id: '' };
    });
  }, [showForm, form.program_id, programScopedCourses]);

  // Courses grouped by program for the dropdown.
  const groupedCourses = useMemo(() => {
    const groups = new Map<string, { programName: string; list: Course[] }>();
    const others: Course[] = [];
    for (const c of coursesForForm) {
      const pid = getCourseProgramId(c);
      if (pid) {
        const key = pid;
        const name = c.programs?.name ?? programOptions.find(p => p.id === key)?.name ?? 'Programme';
        if (!groups.has(key)) groups.set(key, { programName: name, list: [] });
        groups.get(key)!.list.push(c);
      } else {
        others.push(c);
      }
    }
    return { groups: Array.from(groups.values()), others };
  }, [coursesForForm, programOptions]);

  const filtered = useMemo(() => {
    return plans.filter(p => {
      if (filterProgramId) {
        const cId = p.course_id ?? p.lessons?.course_id ?? null;
        const course = cId ? courses.find(c => c.id === cId) : null;
        if (!course || getCourseProgramId(course) !== filterProgramId) return false;
      }
      if (filterClassId && p.class_id !== filterClassId) return false;
      if (filterTerm && !(p.term ?? '').toLowerCase().startsWith(filterTerm.toLowerCase())) return false;
      if (filterStatus && (p.status ?? 'draft') !== filterStatus) return false;
      if (!search) return true;
      const courseTitle = p.courses?.title ?? p.lessons?.courses?.title ?? '';
      const className = p.classes?.name ?? '';
      const term = p.term ?? '';
      const q = search.toLowerCase();
      return courseTitle.toLowerCase().includes(q) || className.toLowerCase().includes(q) || term.toLowerCase().includes(q);
    });
  }, [plans, search, filterProgramId, filterClassId, filterTerm, filterStatus, courses]);

  // Unique class + term options derived from the plans on screen (tight scope so
  // filters never offer values that would produce an empty list).
  const classChipOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of plans) {
      const cid = p.class_id;
      const name = p.classes?.name;
      if (cid && name) map.set(cid, name);
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [plans]);

  const termChipOptions = useMemo(() => {
    const set = new Set<string>();
    for (const p of plans) {
      const t = p.term?.split(' ')?.slice(0, 2).join(' '); // "First Term"
      if (t) set.add(t);
    }
    return Array.from(set).sort();
  }, [plans]);

  // Classes filtered by school AND (when available) by the selected course's
  // target grades. We match loosely: a class "JSS1A" or "Grade JSS1 — Blue"
  // all count as belonging to grade "JSS1". If the course hasn't been tagged
  // with grade_levels yet, we skip the grade filter entirely so the dropdown
  // is never accidentally empty.
  const formClasses = useMemo(() => {
    const bySchool = form.school_id
      ? allClasses.filter(c => c.school_id === form.school_id)
      : allClasses;

    const selectedCourse = courses.find(c => c.id === form.course_id);
    const grades = (selectedCourse?.metadata?.grade_levels ?? []).filter(Boolean);
    if (grades.length === 0) return bySchool;

    const norm = (s: string) => s.toLowerCase().replace(/[\s_\-]+/g, '');
    const normGrades = grades.map(norm);

    const matching = bySchool.filter(c => {
      const n = norm(c.name ?? '');
      return normGrades.some(g => n.includes(g));
    });

    // If nothing matched (e.g. school hasn't mirrored its class naming yet)
    // fall back to the school-scoped list so the teacher isn't stuck.
    return matching.length > 0 ? matching : bySchool;
  }, [allClasses, form.school_id, form.course_id, courses]);

  const visibleCurricula = useMemo(() => {
    const selectedId = form.curriculum_version_id;
    if (!form.school_id) {
      // No explicit school selected: only show platform templates.
      return curricula.filter(c => !c.school_id || (selectedId && c.id === selectedId));
    }
    // School selected: allow that school's copy or platform fallback.
    return curricula.filter(c =>
      !c.school_id ||
      c.school_id === form.school_id ||
      (selectedId ? c.id === selectedId : false),
    );
  }, [curricula, form.school_id, form.curriculum_version_id]);

  const syllabusWeeksPreview = useMemo(() => {
    const doc = curricula.find((c) => c.id === form.curriculum_version_id);
    const content = doc?.content as {
      terms?: Array<{ term: number; title?: string; weeks?: Array<{ week: number; topic?: string }> }>;
    } | undefined;
    if (!content?.terms?.length) return { termLabel: '', weeks: [] as Array<{ week: number; topic: string }> };
    const tn = inferTermNumberFromLabel(form.term || 'First Term');
    const termData = content.terms.find((t) => t.term === tn) ?? content.terms[0];
    const weeks = (termData.weeks ?? []).map((w) => ({
      week: w.week,
      topic: typeof w.topic === 'string' ? w.topic : '',
    }));
    return {
      termLabel: termData.title ?? `Term ${termData.term}`,
      weeks,
    };
  }, [curricula, form.curriculum_version_id, form.term]);

  const autoMatchClassHints = useMemo(() => {
    const selectedCurriculum = curricula.find(c => c.id === form.curriculum_version_id);
    const content = selectedCurriculum?.content ?? {};
    const selectedCourse = courses.find(c => c.id === form.course_id);

    const gradeHints = (selectedCourse?.metadata?.grade_levels ?? []).filter(Boolean);
    const syllabusHints = [
      content?.grade_level,
      content?.class_name,
      content?.target_class,
      content?.class,
      content?.audience?.grade_level,
    ].filter((x: unknown): x is string => typeof x === 'string' && x.trim().length > 0);

    return [...gradeHints, ...syllabusHints];
  }, [curricula, form.curriculum_version_id, courses, form.course_id]);

  // Whether we actually narrowed the list by course grades — used for UI hint.
  const classesNarrowedByGrade = useMemo(() => {
    const selectedCourse = courses.find(c => c.id === form.course_id);
    const grades = (selectedCourse?.metadata?.grade_levels ?? []).filter(Boolean);
    if (grades.length === 0) return false;
    const bySchool = form.school_id
      ? allClasses.filter(c => c.school_id === form.school_id)
      : allClasses;
    return formClasses.length > 0 && formClasses.length < bySchool.length;
  }, [courses, form.course_id, form.school_id, allClasses, formClasses.length]);

  useEffect(() => {
    if (!autoClassMatch) return;
    if (form.class_id) return;
    if (formClasses.length === 0) return;
    if (autoMatchClassHints.length === 0) return;

    const norm = (s: string) => s.toLowerCase().replace(/[\s_\-]+/g, '');
    const hints = autoMatchClassHints.map(norm).filter(Boolean);
    if (hints.length === 0) return;

    const match = formClasses.find(c => {
      const classNorm = norm(c.name ?? '');
      return hints.some(h => classNorm.includes(h));
    });

    if (match && match.id !== form.class_id) {
      setForm(f => ({ ...f, class_id: match.id }));
      setAutoPickedClassId(match.id);
    }
  }, [autoClassMatch, form.class_id, formClasses, autoMatchClassHints]);

  // Auto mode should drive the flow forward:
  // - pick current term if empty
  // - pick the single available syllabus copy when obvious
  // - move focus to final step once context is ready
  useEffect(() => {
    if (!autoClassMatch || !showForm) return;

    if (!form.term) {
      setForm(f => ({ ...f, term: getCurrentTermLabel() }));
      return;
    }

    if (
      form.course_id &&
      !form.curriculum_version_id &&
      visibleCurricula.length === 1
    ) {
      setForm(f => ({ ...f, curriculum_version_id: visibleCurricula[0].id }));
      return;
    }

    const readyForLastStep =
      !!form.term &&
      !!form.course_id &&
      !!form.term_start &&
      !!form.term_end &&
      (isAdmin ? !!form.school_id : true);

    if (readyForLastStep) {
      scheduleStepRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [
    autoClassMatch,
    showForm,
    form.term,
    form.course_id,
    form.curriculum_version_id,
    form.term_start,
    form.term_end,
    form.school_id,
    visibleCurricula,
    isAdmin,
  ]);

  if (authLoading || profileLoading || !profile) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!canManage) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 px-4 text-center">
        <DocumentTextIcon className="w-16 h-16 text-card-foreground/10" />
        <p className="text-card-foreground/50 text-lg font-semibold">Teacher or admin access required</p>
        <Link href="/dashboard" className="text-sm text-violet-400 font-bold hover:underline">Back to dashboard</Link>
      </div>
    );
  }

  const currentCourse = courses.find(c => c.id === form.course_id);

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-6xl mx-auto">
      {/* Shared pipeline stepper */}
      <PipelineStepper
        current="plans"
        courseId={form.course_id || null}
        programId={form.program_id || filterProgramId || null}
        courseTitle={currentCourse?.title ?? null}
        curriculumId={form.curriculum_version_id || null}
      />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-card-foreground flex items-center gap-2">
            <DocumentTextIcon className="w-7 h-7 text-violet-400" />
            Term Lesson Plans
          </h1>
          <p className="text-card-foreground/50 text-sm mt-0.5">
            {filtered.length} / {plans.length} plan{plans.length === 1 ? '' : 's'}
            {filterProgramId && programs.length > 0 && (
              <> · <span className="text-violet-400">{programs.find(p => p.id === filterProgramId)?.name}</span></>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} aria-label="Refresh" className="p-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-all">
            <ArrowPathIcon className={`w-4 h-4 text-card-foreground/50 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => { setShowForm(true); }}
            className="flex items-center gap-2 px-4 py-2 bg-violet-500 hover:bg-violet-400 text-white font-bold rounded-xl transition-all shadow-lg shadow-violet-500/20 min-h-[44px]"
          >
            <PlusIcon className="w-4 h-4" /> New Plan
          </button>
        </div>
      </div>

      {/* Filters — search + programme + class + term + status chips */}
      <div className="space-y-2">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1 sm:max-w-80">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-card-foreground/30" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search plans…"
              className="w-full pl-9 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-card-foreground placeholder-card-foreground/30 focus:outline-none focus:border-violet-500/50 min-h-[44px]" />
          </div>
          <select
            value={filterProgramId}
            onChange={e => setFilterProgramId(e.target.value)}
            aria-label="Filter by programme"
            className="px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-card-foreground focus:outline-none focus:border-violet-500/50 min-h-[44px]"
          >
            <option value="">All programmes</option>
            {programOptions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {(filterClassId || filterTerm || filterStatus || filterProgramId || search) && (
            <button
              onClick={() => {
                setFilterClassId('');
                setFilterTerm('');
                setFilterStatus('');
                setFilterProgramId('');
                setSearch('');
              }}
              className="px-3 py-2.5 text-xs font-black uppercase tracking-widest text-card-foreground/60 hover:text-card-foreground border border-white/10 rounded-xl hover:bg-white/5 transition min-h-[44px]"
              title="Clear all filters"
            >
              Clear
            </button>
          )}
        </div>

        {/* Chip filters — horizontally scrollable on mobile */}
        {(classChipOptions.length > 0 || termChipOptions.length > 0) && (
          <div className="flex flex-wrap gap-2 overflow-x-auto -mx-1 px-1 pb-1">
            {termChipOptions.length > 0 && (
              <ChipGroup
                label="Term"
                items={termChipOptions.map(t => ({ id: t, name: t }))}
                value={filterTerm}
                onChange={setFilterTerm}
                tone="violet"
              />
            )}
            {classChipOptions.length > 0 && (
              <ChipGroup
                label="Class"
                items={classChipOptions}
                value={filterClassId}
                onChange={setFilterClassId}
                tone="cyan"
              />
            )}
            <ChipGroup
              label="Status"
              items={[
                { id: 'draft', name: 'Draft' },
                { id: 'published', name: 'Published' },
                { id: 'archived', name: 'Archived' },
              ]}
              value={filterStatus}
              onChange={setFilterStatus}
              tone="emerald"
            />
          </div>
        )}
      </div>

      {/* Plans Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-center px-4">
          <ClipboardDocumentListIcon className="w-16 h-16 text-card-foreground/10" />
          <p className="text-card-foreground/40 font-semibold">
            {plans.length === 0 ? 'No lesson plans yet' : 'No plans match these filters'}
          </p>
          <p className="text-xs text-card-foreground/40 max-w-md">
            Term lesson plans group your lessons by term, class and course. Generate a syllabus first for the best pre-fill.
          </p>
          <div className="flex flex-wrap gap-2 justify-center mt-2">
            <Link
              href="/dashboard/curriculum"
              className="text-orange-400 text-sm font-bold hover:underline px-3 py-1.5 border border-orange-500/30 rounded-lg"
            >
              ← Step 1 · Syllabus
            </Link>
            <button onClick={() => setShowForm(true)} className="text-violet-400 text-sm font-bold hover:underline px-3 py-1.5 border border-violet-500/30 rounded-lg">
              + Create the first plan
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filtered.map(plan => {
            const status = plan.status ?? 'draft';
            const badge = STATUS_BADGE[status] ?? STATUS_BADGE.draft;
            const courseTitle = plan.courses?.title ?? plan.lessons?.courses?.title ?? 'Unknown Course';
            const hasStrictRouteBadge = getWeekEntries(plan.plan_data).some((w) => {
              const badge = w.progression_badge;
              return !!badge && typeof badge === 'object' && !!(badge as Record<string, unknown>).id;
            });
            return (
              <Link key={plan.id} href={`/dashboard/lesson-plans/${plan.id}`}
                className="bg-card border border-white/[0.08] rounded-2xl p-5 hover:border-violet-500/30 transition-all group block">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-xs text-card-foreground/40 bg-white/5 px-2 py-0.5 rounded-full truncate max-w-[160px]">{courseTitle}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-bold ${badge.cls}`}>{badge.label}</span>
                      {(plan.version ?? 1) > 1 && (
                        <span className="text-xs text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full">v{plan.version}</span>
                      )}
                      {hasStrictRouteBadge && (
                        <span className="text-xs text-cyan-300 bg-cyan-500/10 px-2 py-0.5 rounded-full border border-cyan-500/30">
                          Platform → School
                        </span>
                      )}
                    </div>
                    <h3 className="font-black text-card-foreground text-base truncate">
                      {plan.term ?? 'Term Plan'} {plan.classes?.name ? `— ${plan.classes.name}` : ''}
                    </h3>
                  </div>
                  <PencilIcon className="w-4 h-4 text-card-foreground/30 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-1" />
                </div>

                <div className="space-y-1.5 text-xs text-card-foreground/50">
                  {plan.term_start && plan.term_end && (
                    <p>
                      {new Date(plan.term_start).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} → {new Date(plan.term_end).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </p>
                  )}
                  {plan.sessions_per_week && <p>{plan.sessions_per_week} sessions/week</p>}
                </div>

                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-white/[0.06]">
                  <AcademicCapIcon className="w-3.5 h-3.5 text-violet-400" />
                  <span className="text-xs text-card-foreground/30">
                    {plan.plan_data && typeof plan.plan_data === 'object' && 'weeks' in plan.plan_data
                      ? `${(plan.plan_data.weeks as unknown[]).length} weeks`
                      : 'No weeks yet'}
                  </span>
                  <span className="ml-auto text-xs text-card-foreground/30">
                    {new Date(plan.updated_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* Create Form Modal — mobile-first full-screen on xs, centered on sm+ */}
      {showForm && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-stretch sm:items-center justify-center p-0 sm:p-4 overflow-y-auto">
          <div className="bg-card border border-white/[0.12] w-full sm:max-w-lg shadow-2xl sm:rounded-2xl flex flex-col max-h-screen">
            <div className="flex items-center justify-between p-5 border-b border-white/[0.08] shrink-0">
              <div className="min-w-0">
                <h3 className="font-black text-card-foreground text-lg flex items-center gap-2">
                  <SparklesIcon className="w-5 h-5 text-violet-400" /> New Term Lesson Plan
                </h3>
                {qpCourseId && prefilledFromUrl && (
                  <p className="text-[10px] text-violet-400 uppercase tracking-widest font-black mt-1">
                    ← Prefilled from Syllabus
                  </p>
                )}
              </div>
              <button onClick={() => { setShowForm(false); resetForm(); }} aria-label="Close" className="p-1.5 hover:bg-white/5 rounded-lg min-h-[44px] min-w-[44px] flex items-center justify-center">
                <XMarkIcon className="w-5 h-5 text-card-foreground/50" />
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto flex-1">

              {/* ── Step 1: When ── */}
              <p className="text-[10px] font-black uppercase tracking-widest text-violet-400">1 · When</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-card-foreground/50 uppercase mb-1.5">Academic Year <span className="text-rose-400">*</span></label>
                  <select value={form.academic_year} onChange={e => setForm(f => ({ ...f, academic_year: e.target.value, term_start: '', term_end: '' }))}
                    className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-card-foreground focus:outline-none focus:border-violet-500/50 min-h-[44px]">
                    {academicYearOptions().map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-card-foreground/50 uppercase mb-1.5">Term <span className="text-rose-400">*</span></label>
                  <select value={form.term} onChange={e => setForm(f => ({ ...f, term: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-card-foreground focus:outline-none focus:border-violet-500/50 min-h-[44px]">
                    <option value="">Select term…</option>
                    <option value="First Term">First Term</option>
                    <option value="Second Term">Second Term</option>
                    <option value="Third Term">Third Term</option>
                  </select>
                </div>
              </div>

              {/* Date range — auto-filled, but editable */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-card-foreground/50 uppercase mb-1.5">
                    Start Date <span className="text-rose-400">*</span>
                    {form.term && <span className="ml-1 text-violet-400 normal-case font-normal">(auto-filled)</span>}
                  </label>
                  <input type="date" value={form.term_start} onChange={e => setForm(f => ({ ...f, term_start: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-card-foreground focus:outline-none focus:border-violet-500/50 min-h-[44px]" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-card-foreground/50 uppercase mb-1.5">
                    End Date <span className="text-rose-400">*</span>
                    {form.term && <span className="ml-1 text-violet-400 normal-case font-normal">(auto-filled)</span>}
                  </label>
                  <input type="date" value={form.term_end} onChange={e => setForm(f => ({ ...f, term_end: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-card-foreground focus:outline-none focus:border-violet-500/50 min-h-[44px]" />
                </div>
              </div>

              {/* ── Step 2: What — Programme → Course → Syllabus ── */}
              <p className="text-[10px] font-black uppercase tracking-widest text-violet-400 pt-1">2 · What</p>

              <div>
                <label className="block text-xs font-bold text-card-foreground/50 uppercase mb-1.5">
                  Programme <span className="text-card-foreground/30 normal-case font-normal">(scope the course list)</span>
                </label>
                <select
                  value={form.program_id}
                  onChange={e => setForm(f => ({ ...f, program_id: e.target.value, course_id: '', curriculum_version_id: '' }))}
                  className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-card-foreground focus:outline-none focus:border-violet-500/50 min-h-[44px]"
                >
                  <option value="">All programmes</option>
                  {programOptions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-card-foreground/50 uppercase mb-1.5">
                  Course <span className="text-rose-400">*</span>
                </label>
                <select
                  value={form.course_id}
                  disabled={!!form.program_id && programCoursesLoading}
                  onChange={e => setForm(f => ({ ...f, course_id: e.target.value, curriculum_version_id: '' }))}
                  className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-card-foreground focus:outline-none focus:border-violet-500/50 min-h-[44px] disabled:opacity-50"
                >
                  <option value="">
                    {form.program_id && programCoursesLoading
                      ? 'Loading courses for this programme…'
                      : coursesForForm.length === 0
                        ? (form.program_id ? 'No courses in this programme' : 'No courses available')
                        : 'Select course…'}
                  </option>
                  {groupedCourses.groups.map(g => (
                    <optgroup key={g.programName} label={g.programName}>
                      {g.list.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                    </optgroup>
                  ))}
                  {groupedCourses.others.length > 0 && (
                    <optgroup label="Unassigned">
                      {groupedCourses.others.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                    </optgroup>
                  )}
                </select>
                {!form.program_id && coursesForForm.length > 8 && (
                  <p className="text-[11px] text-card-foreground/40 mt-1.5">Tip · Pick a programme to shorten this list.</p>
                )}
                {form.program_id && programCoursesLoading && (
                  <p className="text-[11px] text-violet-300/90 mt-1.5">Loading courses for the selected programme…</p>
                )}
              </div>

              {/* Import from syllabus — only when course is chosen */}
              {form.course_id && (
                <div>
                  <label className="block text-xs font-bold text-card-foreground/50 uppercase mb-1.5">
                    Import weeks from syllabus <span className="text-card-foreground/30 normal-case font-normal">(optional)</span>
                  </label>
                  <select value={form.curriculum_version_id} onChange={e => setForm(f => ({ ...f, curriculum_version_id: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-card-foreground focus:outline-none focus:border-violet-500/50 min-h-[44px]">
                    <option value="">{visibleCurricula.length === 0 ? 'No syllabus available for this school scope' : '— Skip, start blank —'}</option>
                    {visibleCurricula.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.content?.course_title ?? 'Syllabus'} · v{c.version} · {c.school_id ? (c.schools?.name ?? 'School') : 'Platform'}
                      </option>
                    ))}
                  </select>
                  {visibleCurricula.length === 0 && (
                    <p className="text-[11px] text-amber-400 mt-1.5">
                      No syllabus for this course yet — <Link href={`/dashboard/curriculum?course_id=${form.course_id}`} className="underline">generate one first</Link> for richer prefills.
                    </p>
                  )}
                  {form.curriculum_version_id && (
                    <p className="text-xs text-emerald-400 mt-1.5">✓ Week topics will be pre-filled from this syllabus.</p>
                  )}
                </div>
              )}

              {form.course_id && form.curriculum_version_id && syllabusWeeksPreview.weeks.length > 0 && (
                <details className="rounded-xl border border-violet-500/25 bg-violet-500/5 p-3">
                  <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden flex items-center justify-between gap-2 text-xs font-black uppercase tracking-widest text-violet-300">
                    <span>Syllabus preview — {syllabusWeeksPreview.termLabel}</span>
                    <span className="text-[10px] font-bold text-violet-400/80 normal-case">tap to expand</span>
                  </summary>
                  <p className="text-[11px] text-muted-foreground mt-2 mb-2">
                    Saving this plan copies these weeks in order into the term plan. Then open the plan: publish when ready, run <strong>Generate lessons / assignments / projects</strong> from there. For the progression library route, use <strong>Generate progression</strong> on the same plan.
                  </p>
                  <ol className="max-h-48 overflow-y-auto text-xs space-y-1 list-decimal pl-4 text-card-foreground/90">
                    {syllabusWeeksPreview.weeks.slice(0, 40).map((w) => (
                      <li key={w.week}>
                        Week {w.week}: {w.topic || '—'}
                      </li>
                    ))}
                  </ol>
                  {syllabusWeeksPreview.weeks.length > 40 && (
                    <p className="text-[10px] text-muted-foreground mt-1">
                      …and {syllabusWeeksPreview.weeks.length - 40} more weeks
                    </p>
                  )}
                </details>
              )}

              {/* ── Step 3: Who ── */}
              <p className="text-[10px] font-black uppercase tracking-widest text-violet-400 pt-1">3 · Who</p>
              {isAdmin && schools.length > 0 && (
                <div>
                  <label className="block text-xs font-bold text-card-foreground/50 uppercase mb-1.5">School</label>
                  <select value={form.school_id} onChange={e => setForm(f => ({ ...f, school_id: e.target.value, class_id: '' }))}
                    className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-card-foreground focus:outline-none focus:border-violet-500/50 min-h-[44px]">
                    <option value="">All schools</option>
                    {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  {!form.school_id && (
                    <p className="text-[11px] text-amber-400 mt-1.5">
                      Select a school first so Step 3 can load the right class list.
                    </p>
                  )}
                </div>
              )}
              <div>
                <label className="block text-xs font-bold text-card-foreground/50 uppercase mb-1.5">
                  Class <span className="text-card-foreground/30 normal-case font-normal">(optional)</span>
                </label>
                <select
                  value={form.class_id}
                  onChange={e => {
                    const next = e.target.value;
                    setForm(f => ({ ...f, class_id: next }));
                    if (next) setAutoClassMatch(false);
                  }}
                  disabled={isAdmin && !form.school_id}
                  className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-card-foreground focus:outline-none focus:border-violet-500/50 min-h-[44px]">
                  <option value="">
                    {isAdmin && !form.school_id ? 'Select school first…' : '— Not assigned to a class —'}
                  </option>
                  {formClasses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <label className="inline-flex items-center gap-2 text-[11px] text-card-foreground/60">
                    <input
                      type="checkbox"
                      checked={autoClassMatch}
                      onChange={e => setAutoClassMatch(e.target.checked)}
                      className="accent-violet-500"
                    />
                    Auto-match class from syllabus/course grade
                  </label>
                  {autoPickedClassId && form.class_id === autoPickedClassId && (
                    <span className="text-[11px] text-emerald-400">Auto-selected class; you can still change it manually.</span>
                  )}
                </div>
                {classesNarrowedByGrade && (
                  <p className="text-[10px] text-cyan-300/80 mt-1.5 flex items-center gap-1">
                    <span className="font-black uppercase tracking-widest text-cyan-400/80">Grade-matched</span>
                    <span className="text-card-foreground/50">
                      Showing classes matching the course&apos;s grade tags
                      ({(courses.find(c => c.id === form.course_id)?.metadata?.grade_levels ?? []).join(', ')}).
                    </span>
                  </p>
                )}
              </div>

              {/* ── Step 4: Schedule ── */}
              <p ref={scheduleStepRef} className="text-[10px] font-black uppercase tracking-widest text-violet-400 pt-1">4 · Schedule</p>
              <div>
                <label className="block text-xs font-bold text-card-foreground/50 uppercase mb-1.5">
                  Lessons per week
                </label>
                <div className="flex items-center gap-3">
                  <input type="range" min="1" max="7" value={form.sessions_per_week}
                    onChange={e => setForm(f => ({ ...f, sessions_per_week: e.target.value }))}
                    className="flex-1 accent-violet-500" />
                  <span className="w-8 text-center font-black text-card-foreground text-sm">{form.sessions_per_week}</span>
                </div>
                <p className="text-xs text-card-foreground/30 mt-1">
                  {form.term_start && form.term_end && (() => {
                    const weeks = Math.round((new Date(form.term_end).getTime() - new Date(form.term_start).getTime()) / (7 * 864e5));
                    return `~${weeks} weeks × ${form.sessions_per_week} = ~${weeks * Number(form.sessions_per_week)} lessons total`;
                  })()}
                </p>
              </div>
            </div>

            <div className="sticky bottom-0 flex gap-3 p-4 sm:p-5 border-t border-white/[0.08] bg-card pb-[max(1rem,env(safe-area-inset-bottom))]">
              <button onClick={() => { setShowForm(false); resetForm(); }}
                className="flex-1 py-2.5 bg-white/5 hover:bg-white/10 text-card-foreground/70 font-bold rounded-xl transition-all min-h-[44px]">
                Cancel
              </button>
              <button onClick={save} disabled={submitting || !form.term || !form.course_id || !form.term_start || !form.term_end}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-violet-500 hover:bg-violet-400 disabled:opacity-50 text-white font-bold rounded-xl transition-all min-h-[44px]">
                <CheckCircleIcon className="w-4 h-4" /> {submitting ? 'Creating…' : 'Create Plan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Filter chip row — used for Term / Class / Status quick-filters ──────────
type ChipTone = 'violet' | 'cyan' | 'emerald';
const CHIP_TONE: Record<ChipTone, { active: string; idle: string }> = {
  violet:  { active: 'bg-violet-500/20 text-violet-300 border-violet-500/40',
             idle:   'border-white/10 text-card-foreground/60 hover:text-card-foreground hover:bg-white/5' },
  cyan:    { active: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
             idle:   'border-white/10 text-card-foreground/60 hover:text-card-foreground hover:bg-white/5' },
  emerald: { active: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
             idle:   'border-white/10 text-card-foreground/60 hover:text-card-foreground hover:bg-white/5' },
};

function ChipGroup({
  label,
  items,
  value,
  onChange,
  tone = 'violet',
}: {
  label: string;
  items: Array<{ id: string; name: string }>;
  value: string;
  onChange: (next: string) => void;
  tone?: ChipTone;
}) {
  const t = CHIP_TONE[tone];
  return (
    <div className="inline-flex items-center gap-1.5 flex-wrap">
      <span className="text-[10px] font-black uppercase tracking-widest text-card-foreground/40">
        {label}
      </span>
      <button
        onClick={() => onChange('')}
        className={`px-2.5 py-1 rounded-full border text-[10px] font-black uppercase tracking-widest transition ${
          value === '' ? t.active : t.idle
        }`}
      >
        All
      </button>
      {items.map((it) => (
        <button
          key={it.id}
          onClick={() => onChange(it.id)}
          className={`px-2.5 py-1 rounded-full border text-[10px] font-black uppercase tracking-widest transition ${
            value === it.id ? t.active : t.idle
          }`}
        >
          {it.name}
        </button>
      ))}
    </div>
  );
}

export default function LessonPlansPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <LessonPlansPageInner />
    </Suspense>
  );
}
