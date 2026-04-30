// @refresh reset
'use client';

import { useState, useEffect, useCallback, useMemo, useRef, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import PipelineStepper from '@/components/pipeline/PipelineStepper';
import {
  DocumentTextIcon, PlusIcon, PencilIcon, CheckCircleIcon, XMarkIcon,
  MagnifyingGlassIcon, BookOpenIcon, ArrowPathIcon, ClipboardDocumentListIcon,
  SparklesIcon, AcademicCapIcon, TrashIcon, RocketLaunchIcon,
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
  draft:     { label: 'Draft',     cls: 'bg-zinc-500/20 text-muted-foreground/70 border-zinc-500/30' },
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
  const [filterCourseId, setFilterCourseId] = useState(qpCourseId ?? '');
  const [filterClassId, setFilterClassId] = useState<string>('');
  const [filterTerm, setFilterTerm] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [prefilledFromUrl, setPrefilledFromUrl] = useState(false);
  const [autoClassMatch, setAutoClassMatch] = useState(true);
  const [autoPickedClassId, setAutoPickedClassId] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [planToDelete, setPlanToDelete] = useState<LessonPlan | null>(null);
  const [deletionSummary, setDeletionSummary] = useState<{ lessons: number; assignments: number; audit: number } | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [editingPlan, setEditingPlan] = useState<LessonPlan | null>(null);
  const [editForm, setEditForm] = useState({ term: '', term_start: '', term_end: '', sessions_per_week: '5', status: 'draft' });
  const [savingEdit, setSavingEdit] = useState(false);
  const scheduleStepRef = useRef<HTMLDivElement | null>(null);
  /** Courses for the selected programme (fetched directly so we are not limited to the first N global rows). */
  const [programScopedCourses, setProgramScopedCourses] = useState<Course[] | null>(null);
  const [programCoursesLoading, setProgramCoursesLoading] = useState(false);

  const isAdmin = profile?.role === 'admin';
  const isTeacher = profile?.role === 'teacher';
  const canManage = isAdmin || isTeacher;
  const [debrisCount, setDebrisCount] = useState<number | null>(null);
  const [cleaningDebris, setCleaningDebris] = useState(false);

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

  // If a curriculum is selected and no school is chosen yet, inherit the
  // curriculum's school. Never override an explicit school the teacher picked.
  useEffect(() => {
    if (!form.curriculum_version_id || curricula.length === 0) return;
    const selected = curricula.find(c => c.id === form.curriculum_version_id);
    if (!selected?.school_id) return;   // platform template — nothing to inherit
    if (form.school_id) return;         // teacher already picked a school — don't override
    setForm(f => ({ ...f, school_id: selected.school_id ?? '' }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.curriculum_version_id, curricula]);

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
      if (isAdmin || isTeacher) {
        const debrisRes = await fetch('/api/admin/debris');
        if (debrisRes.ok) {
          const debrisJson = await debrisRes.json();
          setDebrisCount(debrisJson.debris?.total ?? 0);
        }
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
    const startDate = new Date(form.term_start);
    const endDate = new Date(form.term_end);
    if (endDate <= startDate) { toast.error('End date must be after start date'); return; }
    const termWeeks = Math.round((endDate.getTime() - startDate.getTime()) / (7 * 24 * 60 * 60 * 1000));
    if (termWeeks < 2) { toast.error('Term must be at least 2 weeks long'); return; }
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
      if (filterCourseId && p.course_id !== filterCourseId && p.lessons?.course_id !== filterCourseId) return false;
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
    const scoped = form.school_id
      ? curricula.filter(c =>
          !c.school_id ||
          c.school_id === form.school_id ||
          (selectedId ? c.id === selectedId : false),
        )
      : curricula.filter(c => !c.school_id || (selectedId && c.id === selectedId));

    // Deduplicate: keep only the highest-version row per (course_id + school scope).
    // If the DB somehow has duplicate rows (e.g. from a past RLS write failure),
    // we surface only the latest so the picker never shows two identical labels.
    const seen = new Map<string, Curriculum>();
    for (const c of scoped) {
      const key = `${c.school_id ?? '__platform__'}`;
      const existing = seen.get(key);
      if (!existing || (c.version ?? 0) > (existing.version ?? 0)) seen.set(key, c);
    }
    // Always include currently selected even if dedup would drop it.
    const deduped = Array.from(seen.values());
    if (selectedId && !deduped.find(c => c.id === selectedId)) {
      const sel = scoped.find(c => c.id === selectedId);
      if (sel) deduped.push(sel);
    }
    return deduped;
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
  // - pick current term if empty (only once when form first opens)
  // - pick the single available syllabus copy when obvious
  // - move focus to final step once context is ready (only when everything is filled)
  useEffect(() => {
    if (!autoClassMatch || !showForm) return;

    // Step A: auto-fill term — only when it's genuinely empty
    if (!form.term) {
      setForm(f => ({ ...f, term: getCurrentTermLabel() }));
      return; // stop here, let the next render handle the next step
    }

    // Step B: auto-pick curriculum — prefer school-scoped over platform template.
    // Fires whenever at least one curriculum exists for the selected course.
    if (form.course_id && !form.curriculum_version_id && visibleCurricula.length >= 1) {
      const best = visibleCurricula.find(c => c.school_id) ?? visibleCurricula[0];
      setForm(f =>
        f.curriculum_version_id === best.id
          ? f // already set — bail out to prevent loop
          : { ...f, curriculum_version_id: best.id },
      );
      return;
    }

    // Step C: scroll to schedule step when everything is filled (no state mutation — safe)
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

  async function deletePlan(id: string) {
    setDeleting(true);
    try {
      const res = await fetch(`/api/lesson-plans/${id}`, { method: 'DELETE' });
      if (!res.ok) { const j = await res.json(); throw new Error(j.error); }
      toast.success('Lesson plan deleted');
      setPlanToDelete(null);
      setDeleteId(null);
      load();
    } catch (e: any) {
      toast.error(e.message || 'Failed to delete');
    } finally {
      setDeleting(false);
    }
  }

  async function openDeleteConfirm(plan: LessonPlan) {
    setPlanToDelete(plan);
    setLoadingSummary(true);
    setDeletionSummary(null);
    try {
      const res = await fetch(`/api/lesson-plans/${plan.id}`);
      if (!res.ok) throw new Error('Failed to load summary');
      const j = await res.json();
      setDeletionSummary(j.data.deletion_summary);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingSummary(false);
    }
  }

  function openEdit(plan: LessonPlan) {
    setEditingPlan(plan);
    const termLabel = (plan.term ?? '').replace(/ \d{4}\/\d{4}$/, '').replace(/ \d{4}-\d{4}$/, '').trim();
    setEditForm({
      term: termLabel,
      term_start: plan.term_start ?? '',
      term_end: plan.term_end ?? '',
      sessions_per_week: String(plan.sessions_per_week ?? '5'),
      status: plan.status ?? 'draft',
    });
  }

  async function saveEdit() {
    if (!editingPlan) return;
    setSavingEdit(true);
    try {
      const res = await fetch(`/api/lesson-plans/${editingPlan.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          term_start: editForm.term_start || null,
          term_end: editForm.term_end || null,
          sessions_per_week: editForm.sessions_per_week ? Number(editForm.sessions_per_week) : null,
          status: editForm.status,
        }),
      });
      if (!res.ok) { const j = await res.json(); throw new Error(j.error); }
      toast.success('Lesson plan updated');
      setEditingPlan(null);
      load();
    } catch (e: any) {
      toast.error(e.message || 'Failed to update');
    } finally {
      setSavingEdit(false);
    }
  }

  if (authLoading || profileLoading || !profile) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!canManage) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 px-4 text-center">
        <DocumentTextIcon className="w-16 h-16 text-card-foreground/10" />
        <p className="text-card-foreground/50 text-lg font-semibold">Teacher or admin access required</p>
        <Link href="/dashboard" className="text-sm text-primary font-bold hover:underline">Back to dashboard</Link>
      </div>
    );
  }

  const currentCourse = courses.find(c => c.id === form.course_id);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 selection:bg-primary/30 selection:text-white">
      {/* Cinematic Background Elements */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/10 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-violet-600/10 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '2s' }} />
        <div className="absolute top-[20%] right-[10%] w-[30%] h-[30%] bg-emerald-500/5 rounded-full blur-[100px]" />
      </div>

      <div className="relative z-10 p-4 sm:p-8 space-y-8 max-w-7xl mx-auto">
        {/* Shared pipeline stepper */}
        <div className="bg-white/5 backdrop-blur-2xl border border-white/10 p-1 rounded-3xl inline-block">
          <PipelineStepper
            current="plans"
            courseId={form.course_id || null}
            programId={form.program_id || filterProgramId || null}
            courseTitle={currentCourse?.title ?? null}
            curriculumId={form.curriculum_version_id || null}
          />
        </div>

        {/* Header */}
        <div className="relative group">
          <div className="absolute -inset-1 bg-gradient-to-r from-primary to-violet-600 rounded-[40px] blur opacity-25 group-hover:opacity-40 transition duration-1000 group-hover:duration-200" />
          <div className="relative bg-slate-900/50 backdrop-blur-3xl border border-white/10 rounded-[40px] p-8 sm:p-12 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-8">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center shadow-[0_0_20px_rgba(255,107,0,0.3)]">
                  <DocumentTextIcon className="w-7 h-7 text-white" />
                </div>
                <div>
                  <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tighter text-white">Academic Plans</h1>
                  <p className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">Strategic Implementation Hub</p>
                </div>
              </div>
              <p className="text-lg text-white/60 font-medium max-w-2xl leading-relaxed">
                {filterCourseId 
                  ? `Active session schedule and milestones for ${courses.find(c => c.id === filterCourseId)?.title}.`
                  : 'Manage the bridge between syllabus theory and classroom execution. Track progress, schedule sessions, and monitor academic health.'}
              </p>
            </div>
            
            <div className="flex flex-wrap items-center gap-4">
              {filterCourseId && (
                <button 
                  onClick={() => {
                    setFilterCourseId('');
                    setFilterProgramId('');
                    setSearch('');
                  }}
                  className="px-6 py-3.5 bg-white/5 hover:bg-white/10 text-white text-xs font-black uppercase tracking-widest border border-white/10 rounded-2xl transition-all"
                >
                  Reset Filter
                </button>
              )}
              <div className="flex items-center gap-3">
                <button onClick={load} className="p-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl transition-all">
                  <ArrowPathIcon className={`w-5 h-5 text-white/50 ${loading ? 'animate-spin' : ''}`} />
                </button>
                <button
                  onClick={() => setShowForm(true)}
                  className="flex items-center gap-3 px-8 py-4 bg-primary hover:bg-primary text-white text-xs font-black uppercase tracking-widest rounded-2xl transition-all shadow-[0_0_30px_rgba(255,107,0,0.3)]"
                >
                  <PlusIcon className="w-5 h-5" /> Initialize Plan
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-4 items-center bg-white/5 backdrop-blur-2xl border border-white/10 p-4 rounded-3xl">
          <div className="relative flex-1 min-w-[280px]">
            <MagnifyingGlassIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/20" />
            <input 
              value={search} 
              onChange={e => setSearch(e.target.value)} 
              placeholder="Search active plans..."
              className="w-full pl-12 pr-6 py-4 bg-white/5 border border-white/10 rounded-2xl text-sm text-white placeholder-white/20 focus:outline-none focus:border-primary/50 transition-all" 
            />
          </div>
          <select
            value={filterProgramId}
            onChange={e => setFilterProgramId(e.target.value)}
            className="px-6 py-4 bg-white/5 border border-white/10 rounded-2xl text-sm text-white/70 focus:outline-none focus:border-primary/50 transition-all cursor-pointer hover:bg-white/10"
          >
            <option value="" className="bg-slate-900">All Streams</option>
            {programOptions.map(p => <option key={p.id} value={p.id} className="bg-slate-900">{p.name}</option>)}
          </select>
          {(filterClassId || filterTerm || filterStatus || filterProgramId || filterCourseId || search) && (
            <button
              onClick={() => {
                setFilterProgramId('');
                setFilterCourseId('');
                setFilterClassId('');
                setFilterTerm('');
                setFilterStatus('');
                setSearch('');
              }}
              className="px-6 py-4 text-xs font-black uppercase tracking-widest text-white/40 hover:text-white transition-colors"
            >
              Clear
            </button>
          )}
        </div>

        {/* Chip filters */}
        {(classChipOptions.length > 0 || termChipOptions.length > 0) && (
          <div className="flex flex-wrap gap-3">
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
          </div>
        )}

        {/* Plan Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <AnimatePresence mode="popLayout">
            {filtered.map(plan => {
              const status = STATUS_BADGE[plan.status ?? 'draft'] ?? STATUS_BADGE.draft;
              return (
                <motion.div
                  key={plan.id}
                  layout
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="group relative"
                >
                  <Link
                    href={`/dashboard/lesson-plans/${plan.id}`}
                    className="block bg-white/5 backdrop-blur-3xl border border-white/10 hover:border-primary/50 p-8 rounded-[32px] transition-all duration-500 hover:shadow-[0_20px_50px_rgba(255,107,0,0.1)] hover:-translate-y-2"
                  >
                    <div className="flex items-start justify-between mb-6">
                      <div className={`px-4 py-1.5 rounded-full border text-[10px] font-black uppercase tracking-widest ${status.cls}`}>
                        {status.label}
                      </div>
                      <div className="p-3 bg-white/5 rounded-2xl border border-white/10">
                        <AcademicCapIcon className="w-5 h-5 text-primary" />
                      </div>
                    </div>

                    <div className="space-y-2 mb-8">
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">{plan.classes?.name || 'Assigned Class'}</p>
                      <h3 className="text-xl font-black text-white group-hover:text-primary transition-colors line-clamp-2 leading-tight">
                        {plan.courses?.title || 'Course Plan'}
                      </h3>
                    </div>

                    <div className="grid grid-cols-2 gap-4 pt-6 border-t border-white/5">
                      <div className="space-y-1">
                        <p className="text-[9px] font-black uppercase tracking-widest text-white/30">Term</p>
                        <p className="text-xs font-bold text-white/70 truncate">{plan.term || 'N/A'}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[9px] font-black uppercase tracking-widest text-white/30">Intensity</p>
                        <p className="text-xs font-bold text-white/70">{plan.sessions_per_week || 0} Sessions/Week</p>
                      </div>
                    </div>

                    <div className="mt-8 flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-widest text-primary opacity-0 group-hover:opacity-100 transition-all -translate-x-2 group-hover:translate-x-0">
                        Open Plan Hub →
                      </span>
                      <div className="flex items-center gap-2">
                        {canManage && (
                          <button
                            onClick={(e) => { e.preventDefault(); openEdit(plan); }}
                            className="p-2.5 text-white/30 hover:text-white hover:bg-white/10 rounded-xl transition-all"
                          >
                            <PencilIcon className="w-4 h-4" />
                          </button>
                        )}
                        {canManage && (
                          <button
                            onClick={(e) => { e.preventDefault(); openDeleteConfirm(plan); }}
                            className="p-2.5 text-rose-500/30 hover:text-rose-500 hover:bg-rose-500/10 rounded-xl transition-all"
                          >
                            <TrashIcon className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  </Link>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>

        {/* Empty State */}
        {!loading && filtered.length === 0 && (
          <div className="py-32 flex flex-col items-center justify-center bg-white/5 backdrop-blur-3xl border border-white/10 rounded-[40px] text-center px-6">
            <div className="w-20 h-20 bg-white/5 rounded-3xl flex items-center justify-center mb-6">
              <DocumentTextIcon className="w-10 h-10 text-white/20" />
            </div>
            <h3 className="text-2xl font-black text-white mb-2">No Active Plans Found</h3>
            <p className="text-white/40 text-sm max-w-sm mb-8">Refine your search parameters or initialize a new academic plan for your class.</p>
            <button
              onClick={() => { setFilterProgramId(''); setFilterCourseId(''); setFilterClassId(''); setFilterTerm(''); setFilterStatus(''); setSearch(''); }}
              className="px-8 py-3.5 bg-primary/10 text-primary border border-primary/20 text-xs font-black uppercase tracking-widest rounded-2xl hover:bg-primary hover:text-white transition-all"
            >
              Clear All Filters
            </button>
          </div>
        )}
      </div>

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.2);
        }
      `}</style>

      {/* Create Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xl z-[100] flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="bg-slate-900 border border-white/10 w-full max-w-lg rounded-[32px] overflow-hidden shadow-2xl"
          >
            <div className="flex items-center justify-between p-8 border-b border-white/5">
              <div>
                <h3 className="text-xl font-black text-white">Initialize Plan</h3>
                <p className="text-[10px] font-black uppercase tracking-widest text-primary mt-1">Configure Academic Session</p>
              </div>
              <button onClick={() => { setShowForm(false); resetForm(); }} className="p-3 hover:bg-white/5 rounded-2xl transition-all">
                <XMarkIcon className="w-6 h-6 text-white/40" />
              </button>
            </div>

            <div className="p-8 space-y-6 max-h-[60vh] overflow-y-auto custom-scrollbar">
              <div className="space-y-4">
                <label className="text-[10px] font-black uppercase tracking-widest text-white/40">Select Course Blueprint</label>
                <select
                  value={form.course_id}
                  onChange={e => setForm(f => ({ ...f, course_id: e.target.value, curriculum_version_id: '' }))}
                  className="w-full px-6 py-4 bg-white/5 border border-white/10 rounded-2xl text-sm text-white focus:outline-none focus:border-primary/50 transition-all"
                >
                  <option value="" className="bg-slate-900">Select course blueprint...</option>
                  {groupedCourses.groups.map(g => (
                    <optgroup key={g.programName} label={g.programName} className="bg-slate-900 text-white/40">
                      {g.list.map(c => <option key={c.id} value={c.id} className="bg-slate-900 text-white">{c.title}</option>)}
                    </optgroup>
                  ))}
                </select>
              </div>

              <div className="space-y-4">
                <label className="text-[10px] font-black uppercase tracking-widest text-white/40">Academic Term</label>
                <div className="grid grid-cols-3 gap-3">
                  {(['First Term', 'Second Term', 'Third Term'] as const).map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, term: t }))}
                      className={`py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest border transition-all ${
                        form.term === t
                          ? 'bg-primary border-primary text-white shadow-lg shadow-primary/20'
                          : 'bg-white/5 border-white/10 text-white/40 hover:text-white hover:bg-white/10'
                      }`}
                    >
                      {t.split(' ')[0]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <label className="text-[10px] font-black uppercase tracking-widest text-white/40">Target Class</label>
                <select
                  value={form.class_id}
                  onChange={e => { setForm(f => ({ ...f, class_id: e.target.value })); if (e.target.value) setAutoClassMatch(false); }}
                  className="w-full px-6 py-4 bg-white/5 border border-white/10 rounded-2xl text-sm text-white focus:outline-none focus:border-primary/50 transition-all"
                >
                  <option value="" className="bg-slate-900">— Plan for all classes —</option>
                  {formClasses.map(c => <option key={c.id} value={c.id} className="bg-slate-900">{c.name}</option>)}
                </select>
              </div>
            </div>

            <div className="p-8 bg-white/5 border-t border-white/10 flex gap-4">
              <button 
                onClick={() => { setShowForm(false); resetForm(); }}
                className="flex-1 py-4 bg-white/5 hover:bg-white/10 text-white/60 text-[10px] font-black uppercase tracking-widest rounded-2xl transition-all"
              >
                Discard
              </button>
              <button 
                onClick={save}
                disabled={submitting || !form.term || !form.course_id}
                className="flex-1 py-4 bg-primary hover:bg-primary disabled:opacity-50 text-white text-[10px] font-black uppercase tracking-widest rounded-2xl transition-all shadow-lg shadow-primary/20"
              >
                {submitting ? 'Initializing...' : 'Confirm Plan'}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {planToDelete && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-xl z-[110] flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-slate-900 border border-white/10 w-full max-w-md rounded-[32px] overflow-hidden"
          >
            <div className="p-8 text-center space-y-6">
              <div className="mx-auto w-20 h-20 bg-rose-500/10 rounded-3xl flex items-center justify-center">
                <TrashIcon className="w-10 h-10 text-rose-500" />
              </div>
              <div>
                <h3 className="text-2xl font-black text-white">Permanently Delete?</h3>
                <p className="text-white/40 text-sm mt-2 leading-relaxed">
                  You are about to remove <span className="text-white font-bold">{planToDelete.courses?.title}</span> plan for <span className="text-white font-bold">{planToDelete.classes?.name}</span>. This will erase all progress tracking.
                </p>
              </div>
              
              {deletionSummary && (
                <div className="bg-white/5 border border-white/10 rounded-2xl p-6 text-left">
                  <p className="text-[10px] font-black uppercase tracking-widest text-rose-400 mb-4">Affected Assets</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <p className="text-[9px] font-black uppercase tracking-widest text-white/20">Lessons</p>
                      <p className="text-lg font-black text-white">{deletionSummary.lessons}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[9px] font-black uppercase tracking-widest text-white/20">Audit Trail</p>
                      <p className="text-lg font-black text-white">{deletionSummary.audit}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="p-8 bg-white/5 border-t border-white/10 flex gap-4">
              <button 
                onClick={() => setPlanToDelete(null)}
                className="flex-1 py-4 bg-white/5 hover:bg-white/10 text-white/60 text-[10px] font-black uppercase tracking-widest rounded-2xl transition-all"
              >
                Go Back
              </button>
              <button 
                onClick={() => deletePlan(planToDelete.id)}
                disabled={deleting}
                className="flex-1 py-4 bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-black uppercase tracking-widest rounded-2xl transition-all shadow-lg shadow-rose-600/20"
              >
                {deleting ? 'Removing...' : 'Confirm Delete'}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Edit Form Modal */}
      {editingPlan && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xl z-[100] flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-slate-900 border border-white/10 w-full max-w-md rounded-[32px] overflow-hidden shadow-2xl"
          >
            <div className="flex items-center justify-between p-8 border-b border-white/5">
              <div>
                <h3 className="text-xl font-black text-white">Modify Plan</h3>
                <p className="text-[10px] font-black uppercase tracking-widest text-primary mt-1">Status & Parameters</p>
              </div>
              <button onClick={() => setEditingPlan(null)} className="p-3 hover:bg-white/5 rounded-2xl transition-all">
                <XMarkIcon className="w-6 h-6 text-white/40" />
              </button>
            </div>

            <div className="p-8 space-y-6">
              <div className="space-y-4">
                <label className="text-[10px] font-black uppercase tracking-widest text-white/40">Publication Status</label>
                <div className="grid grid-cols-3 gap-3">
                  {Object.entries(STATUS_BADGE).map(([key, val]) => (
                    <button
                      key={key}
                      onClick={() => setEditForm(f => ({ ...f, status: key }))}
                      className={`py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest border transition-all ${
                        editForm.status === key
                          ? 'bg-primary border-primary text-white shadow-lg shadow-primary/20'
                          : 'bg-white/5 border-white/10 text-white/40 hover:text-white hover:bg-white/10'
                      }`}
                    >
                      {val.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <label className="text-[10px] font-black uppercase tracking-widest text-white/40">Sessions Per Week</label>
                <div className="flex items-center gap-6 bg-white/5 p-6 rounded-2xl border border-white/10">
                  <input 
                    type="range" min="1" max="5" 
                    value={editForm.sessions_per_week}
                    onChange={e => setEditForm(f => ({ ...f, sessions_per_week: e.target.value }))}
                    className="flex-1 accent-primary" 
                  />
                  <span className="text-2xl font-black text-white w-12 text-center">{editForm.sessions_per_week}</span>
                </div>
              </div>
            </div>

            <div className="p-8 bg-white/5 border-t border-white/10 flex gap-4">
              <button 
                onClick={() => setEditingPlan(null)}
                className="flex-1 py-4 bg-white/5 hover:bg-white/10 text-white/60 text-[10px] font-black uppercase tracking-widest rounded-2xl transition-all"
              >
                Discard
              </button>
              <button 
                onClick={saveEdit} 
                disabled={savingEdit}
                className="flex-1 py-4 bg-primary hover:bg-primary text-white text-[10px] font-black uppercase tracking-widest rounded-2xl transition-all shadow-lg shadow-primary/20"
              >
                {savingEdit ? 'Saving...' : 'Update Plan'}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}

// ─── Filter chip row — used for Term / Class / Status quick-filters ──────────
type ChipTone = 'violet' | 'cyan' | 'emerald';
const CHIP_TONE: Record<ChipTone, { active: string; idle: string }> = {
  violet:  { active: 'bg-primary/20 text-violet-300 border-primary/40',
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
        className={`px-2.5 py-2 min-h-[36px] sm:min-h-[44px] rounded-full border text-[10px] font-black uppercase tracking-widest transition ${
          value === '' ? t.active : t.idle
        }`}
      >
        All
      </button>
      {items.map((it) => (
        <button
          key={it.id}
          onClick={() => onChange(it.id)}
          className={`px-2.5 py-2 min-h-[36px] sm:min-h-[44px] rounded-full border text-[10px] font-black uppercase tracking-widest transition ${
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
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <LessonPlansPageInner />
    </Suspense>
  );
}
