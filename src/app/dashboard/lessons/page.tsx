// @refresh reset
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import {
  BookOpenIcon, PlusIcon, MagnifyingGlassIcon, EyeIcon, PencilIcon,
  TrashIcon, ClockIcon, UserGroupIcon, CheckCircleIcon,
  VideoCameraIcon, PlayIcon, DocumentTextIcon, BoltIcon,
  SparklesIcon, ChevronDownIcon, ChevronUpIcon, BuildingOfficeIcon,
  ChevronRightIcon, CalendarIcon, ArrowPathIcon, ExclamationTriangleIcon,
  AcademicCapIcon, ClipboardDocumentListIcon, TrophyIcon,
} from '@/lib/icons';
import PipelineStepper from '@/components/pipeline/PipelineStepper';
import MobilePageHero from '@/components/mobile/MobilePageHero';
import { MOBILE_PAGE_BOTTOM, MOBILE_TOUCH_BTN } from '@/components/mobile/mobile-styles';

const STATUS_BADGE: Record<string, string> = {
  completed: 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
  active: 'bg-primary/20 text-primary border-primary/30',
  scheduled: 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30',
  draft: 'bg-muted text-muted-foreground border-border',
};

const TYPE_ICON: Record<string, React.ElementType> = {
  video: VideoCameraIcon,
  interactive: PlayIcon,
  hands_on: BoltIcon,
  'hands-on': BoltIcon,
  workshop: BookOpenIcon,
  coding: DocumentTextIcon,
  reading: AcademicCapIcon,
  quiz: ClipboardDocumentListIcon,
  article: DocumentTextIcon,
  project: TrophyIcon,
  live: PlayIcon,
  lesson: BookOpenIcon,
};

const TYPE_COLOR: Record<string, string> = {
  video: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
  interactive: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  hands_on: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400',
  'hands-on': 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400',
  workshop: 'bg-primary/10 text-primary',
  coding: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  reading: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400',
  quiz: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
  article: 'bg-slate-500/10 text-muted-foreground/70',
  project: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400',
  live: 'bg-red-500/10 text-red-600 dark:text-red-400',
  lesson: 'bg-primary/10 text-primary',
};

export default function LessonsPage() {
  const { profile, isLoading: authLoading, profileLoading } = useAuth();
  const searchParams = useSearchParams();
  const lessonPlanId = searchParams.get('lesson_plan_id');
  const [lessons, setLessons] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [filterCourseId, setFilterCourseId] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);

  // AI lesson plan generator
  const [planOpen, setPlanOpen] = useState(false);
  const [planTopic, setPlanTopic] = useState('');
  const [planGrade, setPlanGrade] = useState('JSS1–SS3');
  const [planWeeks, setPlanWeeks] = useState('12');
  const [planGenerating, setPlanGenerating] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [planResult, setPlanResult] = useState<any | null>(null);
  const [savingPlan, setSavingPlan] = useState(false);
  const [planSaved, setPlanSaved] = useState(false);
  const [planSaveError, setPlanSaveError] = useState<string | null>(null);
  const [planCourseId, setPlanCourseId] = useState('');
  const [courses, setCourses] = useState<any[]>([]);
  const [planMap, setPlanMap] = useState<Record<string, { class_name: string | null; course_title: string | null; term: string | null }>>({});

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`Delete lesson "${title}"? This cannot be undone.`)) return;
    setDeleting(id);
    try {
      const res = await fetch(`/api/lessons/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j.error || 'Delete failed');
      } else {
        setLessons(prev => prev.filter(l => l.id !== id));
      }
    } catch {
      alert('Delete failed — network error');
    } finally {
      setDeleting(null);
    }
  };

  useEffect(() => {
    if (!planOpen || !profile || courses.length > 0) return;
    const fetchCourses = async () => {
      let query = createClient().from('courses').select('id, title, school_id').eq('is_active', true);
      if (profile?.school_id) query = query.or(`school_id.eq.${profile.school_id},school_id.is.null`);
      const { data } = await query.order('title');
      setCourses(data ?? []);
    };
    fetchCourses();
  }, [planOpen, profile?.id, profile?.school_id]); // eslint-disable-line

  const handleSavePlan = async () => {
    if (!planResult || !profile) return;
    if (!planCourseId) { setPlanSaveError('Select a course to attach this plan to.'); return; }
    setSavingPlan(true);
    setPlanSaveError(null);
    try {
      const objectives = (planResult.objectives ?? []).join('\n');
      const activities = (planResult.weeks ?? []).map((w: any) =>
        `Week ${w.week} — ${w.theme}:\n${(w.activities ?? []).map((a: string) => `• ${a}`).join('\n')}`
      ).join('\n\n');
      const res = await fetch('/api/lessons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: planResult.course_title || planTopic,
          description: planResult.description,
          lesson_type: 'interactive',
          status: 'active', // auto-publish generated content (no manual draft→active step)
          course_id: planCourseId,
          lesson_plan: {
            objectives, activities,
            assessment_methods: planResult.assessment_strategy ?? '',
            staff_notes: `Grade: ${planResult.grade_level} | Duration: ${planResult.duration}\nMaterials: ${(planResult.materials ?? []).join(', ')}`,
            plan_data: planResult,
            covers_full_course: true,
          },
        }),
      });
      if (!res.ok) { const j = await res.json(); throw new Error(j.error || 'Failed to save plan'); }
      const { data: newLesson } = await res.json();
      setPlanSaved(true);
      setLessons(prev => [{
        id: newLesson.id, title: planResult.course_title || planTopic,
        description: planResult.description, lesson_type: 'interactive',
        status: 'active', created_at: new Date().toISOString(),
        courses: courses.find(c => c.id === planCourseId),
      }, ...prev]);
    } catch (e: any) {
      setPlanSaveError(e.message ?? 'Failed to save plan');
    } finally {
      setSavingPlan(false);
    }
  };

  const handleGeneratePlan = async () => {
    if (!planTopic.trim()) { setPlanError('Enter a subject/course name.'); return; }
    setPlanGenerating(true);
    setPlanError(null);
    setPlanResult(null);
    setPlanSaved(false);
    setPlanSaveError(null);
    try {
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'lesson-plan', topic: planTopic, gradeLevel: planGrade, termWeeks: parseInt(planWeeks) || 12 }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? 'Generation failed');
      setPlanResult(payload.data);
    } catch (e: any) {
      setPlanError(e.message ?? 'Failed to generate lesson plan');
    } finally {
      setPlanGenerating(false);
    }
  };

  useEffect(() => {
    if (authLoading || !profile) return;
    let cancelled = false;
    async function load() {
      setLoading(true); setError(null);
      try {
        let result: any[];
        if (profile!.role === 'student') {
          const supabase = createClient();
          const { data: enr } = await supabase.from('enrollments').select('program_id').eq('user_id', profile!.id);
          const programIds = (enr ?? []).map((e: any) => e.program_id).filter(Boolean); // Filter out null values

          if (!programIds.length) {
            // No enrollments or all enrollments have null program_id
            // Show empty state but don't block - they might have direct course access
            if (!cancelled) setLessons([]);
            setLoading(false);
            return;
          }

          const { data: courseData } = await supabase.from('courses').select('id').in('program_id', programIds);
          let courseIds = (courseData ?? []).map((c: any) => c.id);

          // If the student has a class_id, check if the class has a course focus lock
          let currentCourseId: string | null = null;
          if (profile?.class_id) {
            const { data: clsData } = await supabase
              .from('classes')
              .select('current_course_id')
              .eq('id', profile.class_id)
              .maybeSingle();
            if (clsData?.current_course_id) {
              currentCourseId = clsData.current_course_id;
            }
          }

          if (currentCourseId) {
            courseIds = courseIds.filter((id: any) => id === currentCourseId);
          }

          if (!courseIds.length) {
            // No courses found for enrolled programs or current course lock
            if (!cancelled) setLessons([]);
            setLoading(false);
            return;
          }

          const { data, error: err } = await supabase.from('lessons')
            .select('id, title, description, lesson_type, status, duration_minutes, session_date, video_url, created_by, created_at, courses(id, title, programs(name))')
            .in('course_id', courseIds).order('created_at', { ascending: false });
          if (err) throw err;
          result = data ?? [];
        } else {
          const qs = lessonPlanId ? `?lesson_plan_id=${lessonPlanId}` : '';
          const res = await fetch(`/api/lessons${qs}`, { cache: 'no-store' });
          if (!res.ok) { const j = await res.json(); throw new Error(j.error || 'Failed to load lessons'); }
          const json = await res.json();
          result = json.data ?? [];
        }
        if (!cancelled) setLessons(result);
      } catch (e: any) {
        if (!cancelled) setError(e.message ?? 'Failed to load lessons');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [profile?.id, authLoading, lessonPlanId]); // eslint-disable-line

  // Batch-fetch lesson plan details (class + term) for generated lessons
  useEffect(() => {
    const planIds = [...new Set(
      lessons.map((l: any) => l.metadata?.lesson_plan_id).filter(Boolean)
    )];
    if (planIds.length === 0) return;
    const db = createClient();
    db.from('lesson_plans')
      .select('id, term, classes!lesson_plans_class_id_fkey(name), courses(title)')
      .in('id', planIds)
      .then(({ data }) => {
        const map: Record<string, { class_name: string | null; course_title: string | null; term: string | null }> = {};
        for (const p of (data ?? [])) {
          map[(p as any).id] = {
            class_name: (p as any).classes?.name ?? null,
            course_title: (p as any).courses?.title ?? null,
            term: (p as any).term ?? null,
          };
        }
        setPlanMap(map);
      });
  }, [lessons]);

  const filtered = lessons.filter(l => {
    const q = search.toLowerCase();
    const matchText = (l.title ?? '').toLowerCase().includes(q) || (l.courses?.title ?? '').toLowerCase().includes(q);
    const matchStatus = filterStatus === 'all' || l.status === filterStatus;
    const matchType = filterType === 'all' || l.lesson_type === filterType;
    const matchCourse = !filterCourseId || l.courses?.id === filterCourseId;
    return matchText && matchStatus && matchType && matchCourse;
  });

  // Course chip options derived from loaded lessons — never offers an empty filter.
  const courseChipOptions = (() => {
    const map = new Map<string, string>();
    for (const l of lessons) {
      const id = l.courses?.id;
      const title = l.courses?.title;
      if (id && title) map.set(id, title);
    }
    return Array.from(map.entries()).map(([id, title]) => ({ id, title }));
  })();

  const completed = lessons.filter(l => l.status === 'completed').length;
  const active = lessons.filter(l => l.status === 'active').length;
  const isStaff = profile?.role === 'admin' || profile?.role === 'teacher';

  if (authLoading || (profileLoading && !profile) || loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center mobile-page-root">
      <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className={`space-y-8 ${MOBILE_PAGE_BOTTOM}`}>

      {/* Pipeline steps */}
      {isStaff && (
        <PipelineStepper current="lessons" lessonPlanId={lessonPlanId} />
      )}

      <MobilePageHero
        badge="Teaching · Lessons"
        title="Course lessons"
        description="Manage and track lesson content across courses."
        icon={BookOpenIcon}
        stats={[
          { label: 'Total', value: lessons.length },
          { label: 'Active', value: active, tone: 'primary' },
          { label: 'Done', value: completed, tone: 'emerald' },
        ]}
        actions={
          isStaff ? (
            <Link
              href={lessonPlanId ? `/dashboard/lessons/add?lesson_plan_id=${lessonPlanId}` : '/dashboard/lessons/add'}
              className={`${MOBILE_TOUCH_BTN} bg-primary text-primary-foreground w-full sm:w-auto`}
            >
              <PlusIcon className="w-4 h-4" /> Add lesson
              {lessonPlanId && <span className="text-[10px] opacity-70 uppercase tracking-widest">· for plan</span>}
            </Link>
          ) : undefined
        }
      />

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 p-4 bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-sm rounded-xl">
          <ExclamationTriangleIcon className="w-4 h-4 flex-shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => window.location.reload()} className="text-xs underline hover:text-rose-700 dark:hover:text-rose-300">Retry</button>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Lessons', value: lessons.length, icon: BookOpenIcon, bg: 'bg-primary/10', color: 'text-primary' },
          { label: 'Active', value: active, icon: BoltIcon, bg: 'bg-primary/10', color: 'text-primary' },
          { label: 'Completed', value: completed, icon: CheckCircleIcon, bg: 'bg-emerald-500/10', color: 'text-emerald-600 dark:text-emerald-400' },
          { label: 'Completion Rate', value: lessons.length ? `${Math.round((completed / lessons.length) * 100)}%` : '0%', icon: ClockIcon, bg: 'bg-purple-500/10', color: 'text-purple-600 dark:text-purple-400' },
        ].map(s => (
          <div key={s.label} className="bg-card/90 backdrop-blur-2xl border border-border/80 rounded-3xl p-4 sm:p-6 shadow-xl">
            <div className={`w-10 h-10 ${s.bg} rounded-xl flex items-center justify-center mb-3`}>
              <s.icon className={`w-5 h-5 ${s.color}`} />
            </div>
            <p className={`text-2xl font-extrabold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Lesson plan filter banner */}
      {lessonPlanId && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-primary/10 border border-primary/30 text-primary text-sm font-bold">
          <SparklesIcon className="w-4 h-4 shrink-0" />
          <span>Showing lessons from lesson plan</span>
          <Link href="/dashboard/lessons" className="ml-auto text-xs underline hover:text-violet-700 dark:hover:text-violet-300 transition-colors">
            Show all lessons
          </Link>
        </div>
      )}

      {/* Search & Filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by lesson or course name..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-card shadow-sm border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors"
          />
        </div>
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="px-4 py-2.5 bg-card shadow-sm border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-primary cursor-pointer transition-colors"
        >
          <option value="all">All Statuses</option>
          <option value="active">Active</option>
          <option value="completed">Completed</option>
          <option value="scheduled">Scheduled</option>
          <option value="draft">Draft</option>
        </select>
        <select
          value={filterType}
          onChange={e => setFilterType(e.target.value)}
          className="px-4 py-2.5 bg-card shadow-sm border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-primary cursor-pointer transition-colors"
        >
          <option value="all">All Types</option>
          {Object.keys(TYPE_COLOR).map(t => (
            <option key={t} value={t}>{t.replace(/[-_]/g, ' ').toUpperCase()}</option>
          ))}
        </select>
      </div>

      {/* Course chip filter — horizontally scrollable on mobile */}
      {courseChipOptions.length > 1 && (
        <div className="flex items-center gap-1.5 flex-wrap overflow-x-auto -mx-1 px-1 pb-1">
          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground shrink-0">
            Course
          </span>
          <button
            onClick={() => setFilterCourseId('')}
            className={`shrink-0 px-2.5 py-1 rounded-full border text-[10px] font-black uppercase tracking-widest transition ${filterCourseId === ''
              ? 'bg-primary/15 border-primary/40 text-primary'
              : 'border-border text-muted-foreground hover:text-foreground'
              }`}
          >
            All
          </button>
          {courseChipOptions.map((c) => (
            <button
              key={c.id}
              onClick={() => setFilterCourseId(c.id)}
              className={`shrink-0 px-2.5 py-1 rounded-full border text-[10px] font-black uppercase tracking-widest transition ${filterCourseId === c.id
                ? 'bg-primary/15 border-primary/40 text-primary'
                : 'border-border text-muted-foreground hover:text-foreground'
                }`}
              title={c.title}
            >
              {c.title.length > 22 ? c.title.slice(0, 20) + '…' : c.title}
            </button>
          ))}
        </div>
      )}

      {/* Lessons list */}
      {filtered.length === 0 ? (
        <div className="bg-card shadow-sm border border-border rounded-xl p-16 flex flex-col items-center justify-center text-center">
          <div className="w-12 h-12 bg-primary/10 flex items-center justify-center mb-4">
            <BookOpenIcon className="w-6 h-6 text-primary" />
          </div>
          <h3 className="text-base font-bold text-foreground mb-1">No lessons found</h3>
          <p className="text-sm text-muted-foreground max-w-xs">
            {filterStatus !== 'all' || search
              ? 'No lessons match your search. Try adjusting the filters.'
              : 'No lessons yet. Click "Add Lesson" to create your first one.'}
          </p>
          {isStaff && !search && filterStatus === 'all' && (
            <Link
              href={lessonPlanId ? `/dashboard/lessons/add?lesson_plan_id=${lessonPlanId}` : '/dashboard/lessons/add'}
              className="mt-5 inline-flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary text-white font-bold text-sm rounded-xl transition-colors"
            >
              <PlusIcon className="w-4 h-4" /> Add Lesson
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {filtered.map((lesson: any) => {
            const TypeIcon = TYPE_ICON[lesson.lesson_type] ?? BookOpenIcon;
            const typeColor = TYPE_COLOR[lesson.lesson_type] ?? 'bg-muted text-muted-foreground';
            const statusColor =
              lesson.status === 'active' ? 'bg-emerald-500' :
                lesson.status === 'completed' ? 'bg-primary' :
                  lesson.status === 'scheduled' ? 'bg-amber-500' : 'bg-muted';

            return (
              <div key={lesson.id} className="bg-card shadow-sm border border-border rounded-xl flex flex-col overflow-hidden">
                {/* Top accent bar by type */}
                <div className={`h-1 w-full ${lesson.lesson_type === 'video' ? 'bg-rose-500' : lesson.lesson_type === 'coding' ? 'bg-emerald-500' : lesson.lesson_type === 'interactive' ? 'bg-amber-500' : 'bg-primary'}`} />

                <div className="p-5 flex flex-col sm:flex-row gap-4">
                  {/* Icon */}
                  <div className={`w-11 h-11 flex items-center justify-center flex-shrink-0 ${typeColor}`}>
                    <TypeIcon className="w-5 h-5" />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex flex-wrap items-start gap-2">
                      <h3 className="text-base font-bold text-foreground truncate flex-1">{lesson.title}</h3>
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border capitalize flex-shrink-0 ${STATUS_BADGE[lesson.status] ?? 'bg-muted text-muted-foreground border-border'}`}>
                        {lesson.status ?? 'draft'}
                      </span>
                    </div>

                    {lesson.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2">{lesson.description}</p>
                    )}

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      {lesson.courses?.title && (
                        <span className="flex items-center gap-1">
                          <BuildingOfficeIcon className="w-3.5 h-3.5" />
                          {lesson.courses.title}
                        </span>
                      )}
                      {lesson.lesson_type && (
                        <span className={`px-2 py-0.5 text-[10px] font-bold uppercase ${typeColor}`}>
                          {lesson.lesson_type.replace(/[-_]/g, ' ')}
                        </span>
                      )}
                      {lesson.duration_minutes && (
                        <span className="flex items-center gap-1">
                          <ClockIcon className="w-3.5 h-3.5" />
                          {lesson.duration_minutes}m
                        </span>
                      )}
                      {lesson.session_date && (
                        <span className="flex items-center gap-1">
                          <CalendarIcon className="w-3.5 h-3.5" />
                          {new Date(lesson.session_date).toLocaleDateString('en-GB')}
                        </span>
                      )}
                    </div>

                    {/* Origin badges for AI-generated lessons */}
                    {lesson.metadata?.lesson_plan_id && (
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <span className="flex items-center gap-1 px-2 py-0.5 bg-primary/10 border border-primary/20 text-primary text-[10px] font-black uppercase tracking-widest rounded-full">
                          <SparklesIcon className="w-3 h-3" />
                          AI Generated
                        </span>
                        {lesson.metadata.week_number && (
                          <span className="px-2 py-0.5 bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-[10px] font-black uppercase tracking-widest rounded-full">
                            Week {lesson.metadata.week_number}
                            {lesson.metadata.term_number ? ` · T${lesson.metadata.term_number}` : ''}
                            {lesson.metadata.year_number ? ` · Y${lesson.metadata.year_number}` : ''}
                          </span>
                        )}
                        {planMap[lesson.metadata.lesson_plan_id]?.class_name && (
                          <span className="flex items-center gap-1 px-2 py-0.5 bg-sky-500/10 border border-sky-500/20 text-sky-600 dark:text-sky-400 text-[10px] font-black uppercase tracking-widest rounded-full">
                            <UserGroupIcon className="w-3 h-3" />
                            {planMap[lesson.metadata.lesson_plan_id].class_name}
                          </span>
                        )}
                        {planMap[lesson.metadata.lesson_plan_id]?.term && (
                          <span className="px-2 py-0.5 bg-muted border border-border text-muted-foreground text-[10px] font-black uppercase tracking-widest rounded-full">
                            {planMap[lesson.metadata.lesson_plan_id].term}
                          </span>
                        )}
                        <Link
                          href={`/dashboard/lesson-plans/${lesson.metadata.lesson_plan_id}`}
                          onClick={e => e.stopPropagation()}
                          className="text-[10px] font-black uppercase tracking-widest text-primary/60 hover:text-primary transition-colors"
                        >
                          → View Plan
                        </Link>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex sm:flex-col items-center gap-2 flex-shrink-0 sm:justify-center">
                    <Link
                      href={`/dashboard/lessons/${lesson.id}`}
                      className="flex items-center gap-1.5 px-4 py-2 bg-card shadow-sm hover:bg-primary/10 hover:text-primary border border-border text-xs font-bold text-muted-foreground rounded-xl transition-colors"
                    >
                      <EyeIcon className="w-3.5 h-3.5" /> View
                    </Link>
                    {isStaff && (
                      <div className="flex gap-2">
                        <Link
                          href={`/dashboard/lessons/${lesson.id}/edit`}
                          className="flex items-center justify-center w-8 h-8 bg-card shadow-sm hover:bg-muted border border-border text-muted-foreground rounded-xl transition-colors"
                        >
                          <PencilIcon className="w-3.5 h-3.5" />
                        </Link>
                        <button
                          onClick={() => handleDelete(lesson.id, lesson.title)}
                          disabled={deleting === lesson.id}
                          className="flex items-center justify-center w-8 h-8 bg-rose-500/5 hover:bg-rose-500/15 border border-rose-500/20 text-rose-600 dark:text-rose-400 rounded-xl transition-colors disabled:opacity-40"
                        >
                          {deleting === lesson.id
                            ? <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" />
                            : <TrashIcon className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Quick Actions */}
      {isStaff && (
        <div className="bg-card shadow-sm border border-border rounded-xl p-6">
          <h2 className="text-sm font-bold text-foreground mb-4">Teaching Tools</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: 'Add Lesson', desc: 'Create lesson content', icon: BookOpenIcon, color: 'text-primary', bg: 'bg-primary/10', href: '/dashboard/lessons/add' },
              { label: 'Assignments', desc: 'Tasks & assessments', icon: DocumentTextIcon, color: 'text-primary', bg: 'bg-primary/10', href: '/dashboard/assignments/new' },
              { label: 'CBT Exams', desc: 'Online examinations', icon: AcademicCapIcon, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500/10', href: '/dashboard/cbt' },
              { label: 'Classes', desc: 'Manage class groups', icon: UserGroupIcon, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-500/10', href: '/dashboard/classes' },
            ].map(a => (
              <Link
                key={a.label}
                href={a.href}
                className="flex items-center gap-3 p-3 border border-border hover:border-primary/40 hover:bg-primary/5 transition-colors rounded-xl group"
              >
                <div className={`w-8 h-8 ${a.bg} flex items-center justify-center flex-shrink-0`}>
                  <a.icon className={`w-4 h-4 ${a.color}`} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-foreground group-hover:text-primary transition-colors">{a.label}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{a.desc}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* AI Lesson Plan Generator — quick shortcut (not part of the main pipeline) */}
      {isStaff && (
        <div className="bg-card shadow-sm border border-border rounded-xl overflow-hidden">
          <button
            type="button"
            onClick={() => { setPlanOpen(o => !o); setPlanResult(null); setPlanError(null); }}
            className="w-full flex items-center justify-between px-6 py-5 text-left hover:bg-muted transition-colors"
          >
            <div className="flex items-center gap-4">
              <div className={`w-10 h-10 bg-primary/10 flex items-center justify-center border border-primary/20 transition-all ${planOpen ? 'border-primary' : ''}`}>
                <SparklesIcon className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-foreground">Quick Lesson Plan Generator</h3>
                <p className="text-xs text-muted-foreground mt-0.5">One-off plan for a single topic — for the full pipeline use <a href="/dashboard/academic/build" className="text-primary hover:underline">Course Syllabus → Lesson Plans</a></p>
              </div>
            </div>
            {planOpen
              ? <ChevronUpIcon className="w-4 h-4 text-primary" />
              : <ChevronDownIcon className="w-4 h-4 text-muted-foreground" />}
          </button>

          {planOpen && (
            <div className="px-6 pb-6 space-y-5 border-t border-border">
              {planError && (
                <p className="mt-4 text-xs text-rose-600 dark:text-rose-400 bg-rose-500/10 border border-rose-500/20 px-4 py-3">{planError}</p>
              )}

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-4">
                <div className="space-y-1 md:col-span-2">
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Subject / Course Name *</label>
                  <input
                    value={planTopic}
                    onChange={e => setPlanTopic(e.target.value)}
                    placeholder="e.g. Python Programming for Beginners"
                    className="w-full bg-background border border-border px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Grade Level</label>
                  <select
                    value={planGrade}
                    onChange={e => setPlanGrade(e.target.value)}
                    className="w-full bg-background border border-border px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary transition-colors"
                  >
                    {['Basic 1–Basic 3', 'Basic 4–Basic 6', 'JSS1–JSS3', 'SS1–SS3', 'JSS1–SS3', 'Basic 1–SS3'].map(g => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Term Length</label>
                  <select
                    value={planWeeks}
                    onChange={e => setPlanWeeks(e.target.value)}
                    className="w-full bg-background border border-border px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary transition-colors"
                  >
                    {['8', '10', '12', '14', '16'].map(w => (
                      <option key={w} value={w}>{w} weeks</option>
                    ))}
                  </select>
                </div>
              </div>

              <button
                type="button"
                onClick={handleGeneratePlan}
                disabled={planGenerating}
                className="flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary disabled:opacity-60 text-white font-bold text-sm rounded-xl transition-colors"
              >
                {planGenerating
                  ? <ArrowPathIcon className="w-4 h-4 animate-spin" />
                  : <SparklesIcon className="w-4 h-4" />}
                {planGenerating ? 'Generating...' : 'Generate Lesson Plan'}
              </button>

              {/* Plan result */}
              {planResult && (
                <div className="space-y-6 pt-2">
                  {/* Overview */}
                  <div className="bg-background border border-border p-6">
                    <h4 className="text-xl font-extrabold text-foreground mb-1">{planResult.course_title}</h4>
                    <p className="text-sm text-muted-foreground mb-4 border-l-2 border-primary/30 pl-3">{planResult.description}</p>
                    <div className="flex flex-wrap gap-3 text-xs font-bold uppercase">
                      <span className="px-3 py-1 bg-primary/10 border border-primary/20 text-primary">{planResult.grade_level}</span>
                      <span className="px-3 py-1 bg-card border border-border text-muted-foreground">{planResult.duration}</span>
                    </div>
                  </div>

                  {/* Learning Objectives */}
                  {planResult.objectives?.length > 0 && (
                    <div>
                      <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">Learning Objectives</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {planResult.objectives.map((o: string, i: number) => (
                          <div key={i} className="flex items-start gap-3 p-3 bg-background border border-border text-sm text-muted-foreground">
                            <CheckCircleIcon className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                            <span>{o}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Weekly breakdown */}
                  <div>
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">Weekly Breakdown</p>
                    <div className="space-y-3">
                      {(planResult.weeks ?? []).map((week: any) => (
                        <div key={week.week} className="bg-background border border-border p-4 grid grid-cols-1 lg:grid-cols-4 gap-4">
                          <div className="flex items-start gap-3">
                            <span className="w-8 h-8 bg-primary text-white font-extrabold text-sm flex items-center justify-center flex-shrink-0">
                              {week.week}
                            </span>
                            <div>
                              <p className="text-[10px] font-bold text-primary uppercase tracking-wide">Theme</p>
                              <p className="text-sm font-semibold text-foreground leading-tight">{week.theme}</p>
                            </div>
                          </div>
                          <div>
                            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-1.5">Topics</p>
                            <ul className="space-y-1">
                              {(week.topics ?? []).map((t: string, i: number) => (
                                <li key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                                  <span className="w-1 h-1 rounded-full bg-primary/50 mt-1.5 flex-shrink-0" />{t}
                                </li>
                              ))}
                            </ul>
                          </div>
                          <div>
                            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-1.5">Activities</p>
                            <ul className="space-y-1">
                              {(week.activities ?? []).map((a: string, i: number) => (
                                <li key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground italic">
                                  <span className="w-1 h-1 rounded-full bg-emerald-500/50 mt-1.5 flex-shrink-0" />{a}
                                </li>
                              ))}
                            </ul>
                          </div>
                          <div className="bg-card border border-border p-3">
                            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-1">Assessment</p>
                            <p className="text-xs text-muted-foreground">{week.assessment}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Materials & Strategy */}
                  {(planResult.materials?.length > 0 || planResult.assessment_strategy) && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {planResult.assessment_strategy && (
                        <div className="bg-background border border-border p-4">
                          <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-2">Assessment Strategy</p>
                          <p className="text-sm text-muted-foreground">{planResult.assessment_strategy}</p>
                        </div>
                      )}
                      {planResult.materials?.length > 0 && (
                        <div className="bg-background border border-border p-4">
                          <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-2">Materials</p>
                          <div className="flex flex-wrap gap-2">
                            {planResult.materials.map((m: string, i: number) => (
                              <span key={i} className="px-3 py-1 bg-card border border-border text-xs text-muted-foreground font-bold">{m}</span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Save to course */}
                  {planSaved ? (
                    <div className="flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/20 px-5 py-4">
                      <CheckCircleIcon className="w-5 h-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">Plan saved!</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Lesson plan saved to the selected course.</p>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-background border border-primary/20 p-5 space-y-4">
                      <div>
                        <p className="text-xs font-bold text-primary uppercase tracking-widest mb-1">Save to Course</p>
                        <p className="text-sm text-muted-foreground">Select a course to attach this lesson plan to.</p>
                      </div>
                      <div className="flex flex-col sm:flex-row gap-3">
                        <select
                          value={planCourseId}
                          onChange={e => { setPlanCourseId(e.target.value); setPlanSaveError(null); }}
                          className="flex-1 bg-card border border-border px-4 py-2.5 text-sm text-foreground outline-none focus:border-primary transition-colors"
                        >
                          <option value="">Select course...</option>
                          {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                        </select>
                        <button
                          type="button"
                          onClick={handleSavePlan}
                          disabled={savingPlan || !planCourseId}
                          className="flex items-center justify-center gap-2 px-6 py-2.5 bg-primary hover:bg-primary disabled:opacity-50 text-white font-bold text-sm rounded-xl transition-colors"
                        >
                          {savingPlan
                            ? <><ArrowPathIcon className="w-4 h-4 animate-spin" /> Saving…</>
                            : <><SparklesIcon className="w-4 h-4" /> Save Plan</>}
                        </button>
                      </div>
                      {planSaveError && <p className="text-xs text-rose-600 dark:text-rose-400 bg-rose-500/10 px-3 py-2 border border-rose-500/20">{planSaveError}</p>}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => { setPlanResult(null); setPlanTopic(''); setPlanSaved(false); setPlanSaveError(null); setPlanCourseId(''); }}
                    className="text-xs font-bold text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Clear plan
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

    </div>
  );
}
