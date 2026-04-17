// @refresh reset
'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
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
  courses?: { id: string; title: string } | null;
  classes?: { id: string; name: string } | null;
  schools?: { id: string; name: string } | null;
}

interface Course { id: string; title: string }
interface Class { id: string; name: string }
interface School { id: string; name: string }

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  draft:     { label: 'Draft',     cls: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30' },
  published: { label: 'Published', cls: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
  archived:  { label: 'Archived',  cls: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
};

export default function LessonPlansPage() {
  const { profile, loading: authLoading, profileLoading } = useAuth();
  const [plans, setPlans] = useState<LessonPlan[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    course_id: '',
    class_id: '',
    school_id: '',
    term: '',
    term_start: '',
    term_end: '',
    sessions_per_week: '5',
    curriculum_version_id: '',
  });

  const isAdmin = profile?.role === 'admin';
  const isTeacher = profile?.role === 'teacher';
  const canManage = isAdmin || isTeacher;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [plansRes, coursesRes, classesRes] = await Promise.all([
        fetch('/api/lesson-plans'),
        fetch('/api/courses'),
        fetch('/api/classes'),
      ]);
      const plansJson = await plansRes.json();
      const coursesJson = coursesRes.ok ? await coursesRes.json() : { data: [] };
      const classesJson = classesRes.ok ? await classesRes.json() : { data: [] };
      setPlans(plansJson.data ?? []);
      setCourses(coursesJson.data ?? []);
      setClasses(classesJson.data ?? []);

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

  async function save() {
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
          term: form.term || null,
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
      setForm({ course_id: '', class_id: '', school_id: '', term: '', term_start: '', term_end: '', sessions_per_week: '5', curriculum_version_id: '' });
      load();
    } catch (e: any) {
      toast.error(e.message || 'Failed to save');
    } finally {
      setSubmitting(false);
    }
  }

  if (authLoading || profileLoading || !profile) {
    return <div className="flex items-center justify-center min-h-[60vh]"><div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" /></div>;
  }

  if (!canManage) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <DocumentTextIcon className="w-16 h-16 text-card-foreground/10" />
        <p className="text-card-foreground/50 text-lg font-semibold">Teacher or admin access required</p>
      </div>
    );
  }

  const filtered = plans.filter(p => !search ||
    (p.courses?.title ?? p.lessons?.courses?.title ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (p.classes?.name ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (p.term ?? '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-6xl mx-auto">
      {/* Tab Bar */}
      <div className="flex items-center gap-1 bg-card border border-border rounded-xl p-1 w-fit">
        <Link href="/dashboard/lessons"
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 text-sm font-bold transition-all">
          <BookOpenIcon className="w-4 h-4" /> Lessons
        </Link>
        <span className="flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-black">
          <ClipboardDocumentListIcon className="w-4 h-4" /> Lesson Plans
        </span>
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-card-foreground flex items-center gap-2">
            <DocumentTextIcon className="w-7 h-7 text-violet-400" />
            Term Lesson Plans
          </h1>
          <p className="text-card-foreground/50 text-sm mt-0.5">{plans.length} plans</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="p-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-all">
            <ArrowPathIcon className={`w-4 h-4 text-card-foreground/50 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-violet-500 hover:bg-violet-400 text-white font-bold rounded-xl transition-all shadow-lg shadow-violet-500/20">
            <PlusIcon className="w-4 h-4" /> New Plan
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative w-full sm:w-80">
        <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-card-foreground/30" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search plans…"
          className="w-full pl-9 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-card-foreground placeholder-card-foreground/30 focus:outline-none focus:border-violet-500/50" />
      </div>

      {/* Plans Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20"><div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <ClipboardDocumentListIcon className="w-16 h-16 text-card-foreground/10" />
          <p className="text-card-foreground/40 font-semibold">No lesson plans yet</p>
          <button onClick={() => setShowForm(true)} className="text-violet-400 text-sm font-bold hover:underline">Create the first plan</button>
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
                      <span className="text-xs text-card-foreground/40 bg-white/5 px-2 py-0.5 rounded-full truncate max-w-[140px]">{courseTitle}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-bold ${badge.cls}`}>{badge.label}</span>
                      {(plan.version ?? 1) > 1 && (
                        <span className="text-xs text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full">v{plan.version}</span>
                      )}
                    </div>
                    <h3 className="font-black text-card-foreground text-base">
                      {plan.term ?? 'Term Plan'} {plan.classes?.name ? `— ${plan.classes.name}` : ''}
                    </h3>
                  </div>
                  <PencilIcon className="w-4 h-4 text-card-foreground/30 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-1" />
                </div>

                <div className="space-y-1.5 text-xs text-card-foreground/50">
                  {plan.term_start && plan.term_end && (
                    <p>{new Date(plan.term_start).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} → {new Date(plan.term_end).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
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

      {/* Create Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-card border border-white/[0.12] rounded-2xl w-full max-w-lg shadow-2xl my-4">
            <div className="flex items-center justify-between p-5 border-b border-white/[0.08]">
              <h3 className="font-black text-card-foreground text-lg flex items-center gap-2">
                <SparklesIcon className="w-5 h-5 text-violet-400" /> New Term Plan
              </h3>
              <button onClick={() => setShowForm(false)} className="p-1.5 hover:bg-white/5 rounded-lg">
                <XMarkIcon className="w-5 h-5 text-card-foreground/50" />
              </button>
            </div>
            <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
              <div>
                <label className="block text-xs font-bold text-card-foreground/50 uppercase mb-1.5">Course <span className="text-rose-400">*</span></label>
                <select value={form.course_id} onChange={e => setForm(f => ({ ...f, course_id: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-card-foreground focus:outline-none focus:border-violet-500/50">
                  <option value="">Select course…</option>
                  {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-card-foreground/50 uppercase mb-1.5">Class</label>
                <select value={form.class_id} onChange={e => setForm(f => ({ ...f, class_id: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-card-foreground focus:outline-none focus:border-violet-500/50">
                  <option value="">Select class…</option>
                  {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              {isAdmin && schools.length > 0 && (
                <div>
                  <label className="block text-xs font-bold text-card-foreground/50 uppercase mb-1.5">School</label>
                  <select value={form.school_id} onChange={e => setForm(f => ({ ...f, school_id: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-card-foreground focus:outline-none focus:border-violet-500/50">
                    <option value="">Select school…</option>
                    {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-xs font-bold text-card-foreground/50 uppercase mb-1.5">Term</label>
                <select value={form.term} onChange={e => setForm(f => ({ ...f, term: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-card-foreground focus:outline-none focus:border-violet-500/50">
                  <option value="">Select term…</option>
                  <option value="First Term">First Term</option>
                  <option value="Second Term">Second Term</option>
                  <option value="Third Term">Third Term</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-card-foreground/50 uppercase mb-1.5">Start Date <span className="text-rose-400">*</span></label>
                  <input type="date" value={form.term_start} onChange={e => setForm(f => ({ ...f, term_start: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-card-foreground focus:outline-none focus:border-violet-500/50" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-card-foreground/50 uppercase mb-1.5">End Date <span className="text-rose-400">*</span></label>
                  <input type="date" value={form.term_end} onChange={e => setForm(f => ({ ...f, term_end: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-card-foreground focus:outline-none focus:border-violet-500/50" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-card-foreground/50 uppercase mb-1.5">Sessions per Week</label>
                <input type="number" min="1" max="7" value={form.sessions_per_week}
                  onChange={e => setForm(f => ({ ...f, sessions_per_week: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-card-foreground focus:outline-none focus:border-violet-500/50" />
              </div>
              <div>
                <label className="block text-xs font-bold text-card-foreground/50 uppercase mb-1.5">Curriculum Version ID <span className="text-card-foreground/30">(optional)</span></label>
                <input type="text" value={form.curriculum_version_id}
                  onChange={e => setForm(f => ({ ...f, curriculum_version_id: e.target.value }))}
                  placeholder="UUID of linked curriculum version"
                  className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-card-foreground placeholder-card-foreground/30 focus:outline-none focus:border-violet-500/50" />
              </div>
            </div>
            <div className="flex gap-3 p-5 border-t border-white/[0.08]">
              <button onClick={() => setShowForm(false)} className="flex-1 py-2.5 bg-white/5 hover:bg-white/10 text-card-foreground/70 font-bold rounded-xl transition-all">Cancel</button>
              <button onClick={save} disabled={submitting || !form.course_id || !form.term_start || !form.term_end}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-violet-500 hover:bg-violet-400 disabled:opacity-50 text-white font-bold rounded-xl transition-all">
                <CheckCircleIcon className="w-4 h-4" /> {submitting ? 'Creating…' : 'Create Plan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
