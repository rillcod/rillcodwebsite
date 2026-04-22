// @refresh reset
'use client';

import { useState, useEffect, useCallback, useMemo, Suspense } from 'react';
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

interface Course {
  id: string;
  title: string;
  program_id?: string | null;
  programs?: { id: string; name: string } | null;
}
interface Class { id: string; name: string; school_id?: string | null }
interface School { id: string; name: string }
interface Program { id: string; name: string }
interface Curriculum { id: string; version: number; content: any }

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

  const isAdmin = profile?.role === 'admin';
  const isTeacher = profile?.role === 'teacher';
  const canManage = isAdmin || isTeacher;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [plansRes, coursesRes, classesRes, programsRes] = await Promise.all([
        fetch('/api/lesson-plans'),
        fetch('/api/courses'),
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

  // Courses scoped by the selected program (form + filter).
  const coursesForForm = useMemo(() => {
    if (!form.program_id) return courses;
    return courses.filter(c => c.program_id === form.program_id);
  }, [courses, form.program_id]);

  // Courses grouped by program for the dropdown.
  const groupedCourses = useMemo(() => {
    const groups = new Map<string, { programName: string; list: Course[] }>();
    const others: Course[] = [];
    for (const c of coursesForForm) {
      if (c.program_id) {
        const key = c.program_id;
        const name = c.programs?.name ?? programs.find(p => p.id === key)?.name ?? 'Programme';
        if (!groups.has(key)) groups.set(key, { programName: name, list: [] });
        groups.get(key)!.list.push(c);
      } else {
        others.push(c);
      }
    }
    return { groups: Array.from(groups.values()), others };
  }, [coursesForForm, programs]);

  const filtered = useMemo(() => {
    return plans.filter(p => {
      if (filterProgramId) {
        const cId = p.course_id ?? p.lessons?.course_id ?? null;
        const course = cId ? courses.find(c => c.id === cId) : null;
        if (!course || course.program_id !== filterProgramId) return false;
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

  // Classes filtered by school
  const formClasses = useMemo(() => {
    if (!form.school_id) return allClasses;
    return allClasses.filter(c => c.school_id === form.school_id);
  }, [allClasses, form.school_id]);

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
            {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
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
                  {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-card-foreground/50 uppercase mb-1.5">
                  Course <span className="text-rose-400">*</span>
                </label>
                <select
                  value={form.course_id}
                  onChange={e => setForm(f => ({ ...f, course_id: e.target.value, curriculum_version_id: '' }))}
                  className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-card-foreground focus:outline-none focus:border-violet-500/50 min-h-[44px]"
                >
                  <option value="">
                    {coursesForForm.length === 0
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
              </div>

              {/* Import from syllabus — only when course is chosen */}
              {form.course_id && (
                <div>
                  <label className="block text-xs font-bold text-card-foreground/50 uppercase mb-1.5">
                    Import weeks from syllabus <span className="text-card-foreground/30 normal-case font-normal">(optional)</span>
                  </label>
                  <select value={form.curriculum_version_id} onChange={e => setForm(f => ({ ...f, curriculum_version_id: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-card-foreground focus:outline-none focus:border-violet-500/50 min-h-[44px]">
                    <option value="">{curricula.length === 0 ? 'No syllabus available for this course' : '— Skip, start blank —'}</option>
                    {curricula.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.content?.course_title ?? `Syllabus v${c.version}`}
                      </option>
                    ))}
                  </select>
                  {curricula.length === 0 && (
                    <p className="text-[11px] text-amber-400 mt-1.5">
                      No syllabus for this course yet — <Link href={`/dashboard/curriculum?course_id=${form.course_id}`} className="underline">generate one first</Link> for richer prefills.
                    </p>
                  )}
                  {form.curriculum_version_id && (
                    <p className="text-xs text-emerald-400 mt-1.5">✓ Week topics will be pre-filled from this syllabus.</p>
                  )}
                </div>
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
                </div>
              )}
              <div>
                <label className="block text-xs font-bold text-card-foreground/50 uppercase mb-1.5">
                  Class <span className="text-card-foreground/30 normal-case font-normal">(optional)</span>
                </label>
                <select value={form.class_id} onChange={e => setForm(f => ({ ...f, class_id: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-card-foreground focus:outline-none focus:border-violet-500/50 min-h-[44px]">
                  <option value="">— Not assigned to a class —</option>
                  {formClasses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              {/* ── Step 4: Schedule ── */}
              <p className="text-[10px] font-black uppercase tracking-widest text-violet-400 pt-1">4 · Schedule</p>
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
