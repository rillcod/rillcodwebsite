// @refresh reset
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import {
  BookOpenIcon, MagnifyingGlassIcon, EyeIcon, PencilIcon,
  TrashIcon, ClockIcon,
  VideoCameraIcon, PlayIcon, DocumentTextIcon, BoltIcon,
  BuildingOfficeIcon,
  CalendarIcon, ArrowPathIcon, ExclamationTriangleIcon,
  AcademicCapIcon, ClipboardDocumentListIcon, TrophyIcon
} from '@/lib/icons';
import MobilePageHero from '@/components/mobile/MobilePageHero';
import { MOBILE_PAGE_BOTTOM, MOBILE_TOUCH_BTN } from '@/components/mobile/mobile-styles';
import { buildClassTeachingHref } from '@/lib/curriculum/href';

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
  const [planContext, setPlanContext] = useState<any | null>(null);
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
    if (!lessonPlanId) {
      setLessons([]);
      setPlanContext(null);
      setLoading(false);
      setError(null);
      return;
    }
    const scopedLessonPlanId = lessonPlanId;
    let cancelled = false;
    async function load() {
      setLoading(true); setError(null);
      try {
        const [res, planRes] = await Promise.all([
          fetch(`/api/lessons?lesson_plan_id=${encodeURIComponent(scopedLessonPlanId)}`, { cache: 'no-store' }),
          fetch(`/api/lesson-plans/${encodeURIComponent(scopedLessonPlanId)}`, { cache: 'no-store' }),
        ]);
        if (!res.ok) { const j = await res.json(); throw new Error(j.error || 'Failed to load lessons'); }
        const json = await res.json();
        const result = json.data ?? [];
        const planJson = planRes.ok ? await planRes.json() : null;
        if (!cancelled) {
          setLessons(result);
          setPlanContext(planJson?.data ?? null);
        }
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
  const planClass = Array.isArray(planContext?.classes) ? planContext.classes[0] : planContext?.classes;
  const planCourse = Array.isArray(planContext?.courses) ? planContext.courses[0] : planContext?.courses;
  const classPlanHref = planContext?.class_id
    ? buildClassTeachingHref({ classId: planContext.class_id, courseId: planContext.course_id })
    : `/dashboard/lesson-plans/${lessonPlanId}?view=advanced`;

  if (authLoading || (profileLoading && !profile) || loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center mobile-page-root">
      <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!lessonPlanId) {
    return (
      <div className="mx-auto flex min-h-[70vh] max-w-4xl items-center px-4 py-10 mobile-page-root">
        <section className="w-full overflow-hidden rounded-3xl border border-border bg-card shadow-xl">
          <div className="border-b border-border bg-gradient-to-br from-primary/15 via-primary/5 to-transparent p-6 sm:p-10">
            <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
              <BookOpenIcon className="h-7 w-7" />
            </div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-primary">Connected academic workspace</p>
            <h1 className="mt-2 text-2xl font-black text-foreground sm:text-4xl">Lessons live inside a class plan</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
              Open a class and its class plan to prepare lessons, resources, assignments and learner release in one place. This prevents separate lesson lists from drifting apart.
            </p>
          </div>
          <div className="grid gap-3 p-6 sm:grid-cols-4 sm:p-10">
            {['Class', 'Class plan', 'Week & session', 'Lesson delivery'].map((label, index) => (
              <div key={label} className="flex items-center gap-3 rounded-2xl border border-border bg-muted/30 p-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-black text-primary">{index + 1}</span>
                <span className="text-sm font-bold text-foreground">{label}</span>
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-3 border-t border-border p-6 sm:flex-row sm:justify-end sm:p-8">
            <Link href="/dashboard/lesson-plans" className="inline-flex min-h-12 items-center justify-center rounded-xl border border-border px-5 text-sm font-bold text-foreground hover:bg-muted">View class plans</Link>
            <Link href="/dashboard/classes" className="inline-flex min-h-12 items-center justify-center rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground hover:bg-primary/90">Open classes</Link>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className={`space-y-8 ${MOBILE_PAGE_BOTTOM}`}>

      <MobilePageHero
        badge="Class plan · Lesson guides"
        title={planClass?.name ? `Lessons for ${planClass.name}` : "Lesson guides"}
        description={`These are the lesson guides inside this class plan${planCourse?.title ? ` for ${planCourse.title}` : ""}. Slides, cards, assignments and projects remain in each week's complete package.`}
        icon={BookOpenIcon}
        stats={[
          { label: 'Total', value: lessons.length },
          { label: 'Active', value: active, tone: 'primary' },
          { label: 'Done', value: completed, tone: 'emerald' },
        ]}
        actions={isStaff ? (
          <Link href={classPlanHref} className={`${MOBILE_TOUCH_BTN} bg-primary text-primary-foreground w-full sm:w-auto`}>
            Return to class plan
          </Link>
        ) : undefined}
      />

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 p-4 bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-sm rounded-xl">
          <ExclamationTriangleIcon className="w-4 h-4 flex-shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => window.location.reload()} className="text-xs underline hover:text-rose-700 dark:hover:text-rose-300">Retry</button>
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
              : 'No lesson guide is prepared yet. Return to the class plan and choose the exact week or session to fill.'}
          </p>
          {isStaff && !search && filterStatus === 'all' && (
            <Link href={classPlanHref} className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">
              Return to class plan
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

    </div>
  );
}
