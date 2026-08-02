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
  AcademicCapIcon, ClipboardDocumentListIcon, TrophyIcon, ArrowRightIcon
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
          <input aria-label="Search lessons or courses"
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

      {/* AI Lesson Plan Generator — quick shortcut */}
      {isStaff && (
        <Link
          href="/dashboard/academic/build"
          className="flex items-center gap-4 p-5 bg-card/90 backdrop-blur-2xl border border-border/80 rounded-3xl shadow-xl transition-all hover:border-primary/30 hover:shadow-2xl group"
        >
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary to-indigo-600 text-white flex items-center justify-center shadow-lg shadow-primary/30 flex-shrink-0 group-hover:scale-105 transition-transform">
            <SparklesIcon className="w-6 h-6" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-black text-foreground">Need a lesson plan?</p>
            <p className="text-xs text-muted-foreground mt-0.5">Open the Curriculum Builder to generate full AI-powered lesson plans, week-by-week syllabi, and assessments.</p>
          </div>
          <ArrowRightIcon className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0" />
        </Link>
      )}

    </div>
  );
}
