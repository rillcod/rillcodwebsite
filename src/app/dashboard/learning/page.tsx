// @refresh reset
'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import { withTimeout, withTimeoutOrThrow } from '@/lib/async-timeout';
import { academicWeekNumber } from '@/lib/academic/week-package';
import {
  loadLearnerClassWeek,
  nextLessonInClassOrder,
} from '@/lib/learning/lesson-plan-scope';
import ClassReplays from '@/components/live-session/ClassReplays';
import Link from 'next/link';
import {
  RocketLaunchIcon, BookOpenIcon, CheckBadgeIcon,
  ArrowRightIcon, PlayIcon, ClipboardDocumentListIcon,
  PresentationChartLineIcon, BoltIcon, AcademicCapIcon,
  ChartBarIcon, FireIcon, TrophyIcon, LockClosedIcon,
} from '@/lib/icons';
import MyProgressPanel from '@/components/engagement/MyProgressPanel';

const GREETINGS = ['Welcome back', 'Ready to learn?', 'Let\'s continue', 'Great to see you'];
const KID_GREETINGS = ['Hey there!', 'Ready to learn?', 'Let\'s have fun!', 'Time to explore!'];

function getLearnerTier(gradeLevel?: string | null, enrollmentType?: string | null): 'kids' | 'secondary' | 'adult' {
  const g = (gradeLevel || enrollmentType || '').toLowerCase().trim();
  if (!g) return 'secondary';

  if (/\b(nursery|kg|kindergarten|pre-?school|basic\s*[1-6]|primary|grade\s*[1-6]|year\s*[1-6]|class\s*[1-6]|kid|p[1-6]\b)/i.test(g)) return 'kids';
  if (/\b(jss|ss\s*[1-3]|junior\s*sec|senior\s*sec|secondary|form\s*[1-6]|year\s*[7-9]|year\s*1[0-3])/i.test(g)) return 'secondary';
  if (/\b(adult|hnd|ond|nce|pgde|university|uni|tertiary|professional|degree|postgrad|masters|phd|ndp|diploma|college)/i.test(g)) return 'adult';

  if (g.includes('basic') || g.includes('primary') || g.includes('kid') || g.includes('grade')) return 'kids';
  if (g.includes('jss') || g.includes('ss') || g.includes('junior') || g.includes('senior')) return 'secondary';
  if (g.includes('adult') || g.includes('professional') || g.includes('university')) return 'adult';

  return 'secondary';
}

export default function StudentLearningPage() {
  const { profile, loading: authLoading, profileLoading } = useAuth();
  const [lessons, setLessons] = useState<any[]>([]);
  const [stats, setStats] = useState({
    avgScore: 0,
    lessonsDone: 0,
    streak: 0,
    xp: 0,
    level: 1
  });
  const [loading, setLoading] = useState(true);
  const [nextLesson, setNextLesson] = useState<any>(null);
  const [thisWeekNumber, setThisWeekNumber] = useState<number | null>(null);
  const [thisWeekLessons, setThisWeekLessons] = useState<any[]>([]);
  const [completedLessonIds, setCompletedLessonIds] = useState<Set<string>>(new Set());
  const [pendingAssignments, setPendingAssignments] = useState(0);
  const [dueFlashcards, setDueFlashcards] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeExamLock, setActiveExamLock] = useState<{
    locked: boolean;
    examId?: string;
    examTitle?: string;
    unlocksAt?: string | null;
  } | null>(null);

  useEffect(() => {
    if (authLoading || profileLoading || !profile || profile.role !== 'student') return;
    let cancelled = false;
    fetch('/api/learning/exam-lock', { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && data?.locked) setActiveExamLock(data);
        else if (!cancelled) setActiveExamLock(null);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [authLoading, profileLoading, profile]);
  
  const [greetingSeed] = useState(() => Math.random());
  const tier = getLearnerTier(profile?.grade_level, profile?.enrollment_type);
  const isKids = tier === 'kids';
  const isAdult = tier === 'adult';
  const greeting = isKids
    ? KID_GREETINGS[Math.floor(greetingSeed * KID_GREETINGS.length)]
    : GREETINGS[Math.floor(greetingSeed * GREETINGS.length)];

  const loadData = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    setLoadError(null);
    const db = createClient();
    
    try {
      // 1. Fetch summary stats — grades, lessons and XP prefer the live academic session.
      const { resolveAssignmentTermId, filterByAssignmentSession } = await import('@/lib/assignments/session');
      const { loadAcademicTermBounds } = await import('@/lib/cbt/session');
      const [liveTermId, pack] = await Promise.all([
        resolveAssignmentTermId(db as any, {}),
        withTimeoutOrThrow(
          loadLearnerClassWeek(db, profile.class_id),
          'Your class package is taking longer than expected. Please retry.',
          20_000,
        ),
      ]);
      const termBounds = await loadAcademicTermBounds(db as any, liveTermId);

      const [xpRes, streakRes, progressRes, subsRes] = await withTimeout(Promise.all([
        db.from('student_xp_summary').select('*').eq('student_id', profile.id).maybeSingle(),
        db.from('student_streaks').select('*').eq('student_id', profile.id).maybeSingle(),
        db.from('lesson_progress').select('id, completed_at').eq('portal_user_id', profile.id).eq('status', 'completed'),
        db.from('assignment_submissions').select('grade, assignments(max_points, term_id)').eq('portal_user_id', profile.id).not('grade', 'is', null)
      ]), [{ data: null }, { data: null }, { data: [] }, { data: [] }], 'learning summary stats');

      const scopedSubs = filterByAssignmentSession((subsRes.data ?? []) as any[], liveTermId);
      const avgScore = scopedSubs.length
        ? Math.round(scopedSubs.reduce((s: number, sub: any) => s + (sub.grade / (sub.assignments?.max_points || 100)) * 100, 0) / scopedSubs.length)
        : 0;

      const withinTerm = (iso: string | null | undefined) => {
        if (!termBounds?.start_date && !termBounds?.end_date) return true;
        if (!iso) return false;
        const t = Date.parse(iso);
        if (!Number.isFinite(t)) return false;
        if (termBounds.start_date) {
          const start = Date.parse(termBounds.start_date);
          if (Number.isFinite(start) && t < start) return false;
        }
        if (termBounds.end_date) {
          const end = Date.parse(termBounds.end_date) + (termBounds.end_date.includes('T') ? 0 : 24 * 60 * 60 * 1000 - 1);
          if (Number.isFinite(end) && t > end) return false;
        }
        return true;
      };
      const lessonsDoneThisTerm = ((progressRes.data ?? []) as any[]).filter((p) => withinTerm(p.completed_at)).length;

      setStats({
        avgScore,
        lessonsDone: lessonsDoneThisTerm,
        streak: (streakRes.data as any)?.current_streak || 0,
        xp: ((xpRes.data as any)?.this_term_xp ?? (xpRes.data as any)?.total_xp) || 0,
        level: (xpRes.data as any)?.level || 1
      });

      // 3. Fetch submitted assignments that are waiting for teacher feedback (live session).
      const { data: pendingRows } = await withTimeout(
        db
          .from('assignment_submissions')
          .select('id, assignments(term_id)')
          .eq('portal_user_id', profile.id)
          .eq('status', 'submitted'),
        { count: 0, data: [], error: null },
        'learning submitted assignments',
      );
      const pendingScoped = filterByAssignmentSession((pendingRows ?? []) as any[], liveTermId);
      setPendingAssignments(pendingScoped.length);

      // 3.5 Use the same server-side visibility rule as the flashcard library.
      // This prevents another class's decks from affecting this learner's count.
      const flashcardStatsResponse = await withTimeoutOrThrow(
        fetch('/api/flashcards/stats', { cache: 'no-store' }),
        'Your practice-card count is taking longer than expected. Please retry.',
        15_000,
      );
      const flashcardStats = await flashcardStatsResponse.json();
      if (!flashcardStatsResponse.ok) {
        throw new Error(flashcardStats.error || 'Could not load practice-card count');
      }
      setDueFlashcards(Number(flashcardStats.data?.due_today ?? 0));

      const { data: completedIds } = await withTimeout(
        db
          .from('lesson_progress')
          .select('lesson_id')
          .eq('portal_user_id', profile.id)
          .eq('status', 'completed'),
        { data: [], error: null },
        'learning completed lessons',
      );
      const doneSet = new Set<string>(
        ((completedIds ?? []) as any[])
          .map((c: any) => c.lesson_id)
          .filter((id: any): id is string => typeof id === 'string'),
      );
      setCompletedLessonIds(doneSet);

      setLessons(pack.lessons);
      setThisWeekNumber(pack.week);
      setThisWeekLessons(pack.thisWeekLessons);
      setNextLesson(nextLessonInClassOrder(pack.thisWeekLessons, doneSet));

    } catch (err) {
      console.error('Error loading learning data:', err);
      setLoadError('Failed to load your dashboard data. Please refresh the page.');
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => {
    if (authLoading || profileLoading) return;
    if (!profile) {
      setLoading(false);
      return;
    }
    loadData();

    // Setup Realtime Sync for engagement summaries
    const db = createClient();
    const channel = db.channel(`student-engagement-${profile.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'student_xp_summary',
        filter: `student_id=eq.${profile.id}`
      }, (payload) => {
        if (payload.new) {
          setStats(prev => ({
            ...prev,
            xp: (payload.new as any).total_xp,
            level: (payload.new as any).level
          }));
        }
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'student_streaks',
        filter: `student_id=eq.${profile.id}`
      }, (payload) => {
        if (payload.new) {
          setStats(prev => ({
            ...prev,
            streak: (payload.new as any).current_streak
          }));
        }
      })
      .subscribe();

    return () => {
      db.removeChannel(channel);
    };
  }, [profile?.id, authLoading, profileLoading, loadData]);

  const earlierWeeks = useMemo(() => {
    const groups: { week: number; lessons: any[] }[] = [];
    for (const lesson of lessons) {
      const week = academicWeekNumber(lesson);
      if (week == null || week === thisWeekNumber) continue;
      const last = groups[groups.length - 1];
      if (last && last.week === week) {
        last.lessons.push(lesson);
        continue;
      }
      groups.push({ week, lessons: [lesson] });
    }
    return groups;
  }, [lessons, thisWeekNumber]);

  if (authLoading || profileLoading || loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center mobile-page-root">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent animate-spin rounded-full" />
        <p className="text-muted-foreground text-xs font-bold uppercase tracking-widest animate-pulse">Loading...</p>
      </div>
    </div>
  );

  if (!profile) return (
    <div className="min-h-screen bg-background flex items-center justify-center mobile-page-root">
      <div className="text-center space-y-4">
        <p className="text-muted-foreground text-sm">Session expired. Please sign in again.</p>
        <a href="/login" className="inline-block px-6 py-3 bg-primary text-white text-sm font-bold hover:bg-primary transition-colors">Sign In</a>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background text-foreground mobile-page-root">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">

        {/* Error banner */}
        {loadError && (
          <div className="bg-destructive/10 border border-destructive/30 p-4 flex items-center justify-between gap-4">
            <p className="text-destructive text-sm font-bold">{loadError}</p>
            <button onClick={() => { setLoadError(null); loadData(); }}
              className="text-xs font-bold text-destructive border border-destructive/40 px-3 py-1.5 hover:bg-destructive/10 transition-colors shrink-0">
              Retry
            </button>
          </div>
        )}

        {/* Live Examination Lockdown Banner */}
        {activeExamLock?.locked && (
          <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/35 flex items-center justify-center text-amber-800 dark:text-amber-300 shrink-0">
                <LockClosedIcon className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-wider text-amber-900 dark:text-amber-200">
                  Official Examination In Progress
                </p>
                <p className="text-sm font-bold text-foreground mt-0.5">
                  Study notes, priority materials, and the AI Study Assistant are temporarily locked while &ldquo;{activeExamLock.examTitle || 'your exam'}&rdquo; is live.
                </p>
                {activeExamLock.unlocksAt && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Automatically unlocks: {new Date(activeExamLock.unlocksAt).toLocaleString()}
                  </p>
                )}
              </div>
            </div>
            <Link
              href={activeExamLock.examId ? `/dashboard/cbt/${activeExamLock.examId}/take` : '/dashboard/cbt'}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 px-5 py-2.5 text-xs font-black uppercase tracking-wider text-white shadow-sm shrink-0 transition-colors"
            >
              <AcademicCapIcon className="w-4 h-4" />
              Open Live Exam
            </Link>
          </div>
        )}

        {/* Hero: greeting + stats */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* Greeting */}
          <div className="lg:col-span-2 bg-card/90 backdrop-blur-2xl border border-border/80 rounded-3xl p-6 sm:p-8 relative overflow-hidden shadow-xl">
            <div className="absolute top-0 right-0 w-48 h-48 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-32 h-32 bg-brand-red-accent/15 rounded-full blur-3xl pointer-events-none" />
            <div className="relative z-10">
              <span className="inline-block px-3 py-1 bg-brand-red-accent text-white text-[10px] font-black uppercase tracking-widest rounded-full shadow-sm mb-3">
                {profile.grade_level || (isKids ? 'Primary School' : isAdult ? 'Professional' : 'Secondary School')}
              </span>
              <h1 className="text-3xl sm:text-4xl font-black text-foreground tracking-tight mb-2">
                {greeting}, <span className="bg-gradient-to-r from-primary to-indigo-500 dark:from-white dark:to-slate-300 bg-clip-text text-transparent">{profile?.full_name?.split(' ')[0]}</span>!
              </h1>
              <p className="text-sm text-muted-foreground max-w-lg leading-relaxed">
                {thisWeekNumber
                  ? `This is Week ${thisWeekNumber} — the same learning package your teacher shared with the class.`
                  : 'When your teacher shares this week, it will show up here.'}
              </p>

              <div className="mt-5 flex flex-wrap items-center gap-2.5">
                {nextLesson && (
                  <Link href={`/dashboard/lessons/${nextLesson.id}`}
                    className="inline-flex min-h-11 items-center gap-2 rounded-xl px-5 py-2.5 bg-primary hover:opacity-90 text-primary-foreground text-xs font-black uppercase tracking-wider transition-all shadow-sm">
                    <RocketLaunchIcon className="w-4 h-4 shrink-0" />
                    <span className="truncate max-w-[200px] sm:max-w-xs">Open: {nextLesson.title}</span>
                    <ArrowRightIcon className="w-3.5 h-3.5 shrink-0" />
                  </Link>
                )}
                <Link href="/dashboard/cbt"
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-background hover:border-primary/40 px-4 py-2.5 text-xs font-black text-foreground transition-colors">
                  <AcademicCapIcon className="w-4 h-4 text-primary shrink-0" />
                  CBT &amp; Exams
                </Link>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
            <div className="rounded-2xl bg-card border border-border p-4 flex flex-col justify-between shadow-sm">
              <CheckBadgeIcon className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
              <div className="mt-2">
                <p className="text-2xl font-black tabular-nums text-foreground">{stats.lessonsDone}</p>
                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-wider mt-0.5">Lessons Done</p>
              </div>
            </div>
            <div className="rounded-2xl bg-card border border-border p-4 flex flex-col justify-between shadow-sm">
              <FireIcon className="w-6 h-6 text-amber-500" />
              <div className="mt-2">
                <p className="text-2xl font-black tabular-nums text-foreground">{stats.streak}<span className="text-xs font-bold text-muted-foreground ml-0.5">d</span></p>
                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-wider mt-0.5">Day Streak</p>
              </div>
            </div>
            <div className="rounded-2xl bg-card border border-border p-4 flex flex-col justify-between shadow-sm">
              <TrophyIcon className="w-6 h-6 text-primary" />
              <div className="mt-2">
                <p className="text-2xl font-black tabular-nums text-foreground">{stats.xp.toLocaleString()}</p>
                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-wider mt-0.5">Term XP</p>
              </div>
            </div>
            <Link href="/dashboard/grades" className="rounded-2xl bg-card border border-border p-4 flex flex-col justify-between shadow-sm hover:border-primary/40 transition-colors">
              <ChartBarIcon className="w-6 h-6 text-indigo-500" />
              <div className="mt-2">
                <p className="text-2xl font-black tabular-nums text-foreground">{stats.avgScore > 0 ? `${stats.avgScore}%` : '—'}</p>
                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-wider mt-0.5">Avg Score</p>
              </div>
            </Link>
          </div>
        </div>

        {/* Always-Visible Quick Learning Tools Strip (2-col iPhone -> 6-col desktop) */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
          <Link href="/dashboard/cbt" className="flex items-center gap-2.5 rounded-2xl border border-border bg-card p-3.5 text-xs font-black text-foreground shadow-sm hover:border-primary/40 transition-all">
            <AcademicCapIcon className="h-5 w-5 text-primary shrink-0" />
            <span className="truncate">CBT &amp; Exams</span>
          </Link>
          <Link href="/dashboard/assignments" className="flex items-center gap-2.5 rounded-2xl border border-border bg-card p-3.5 text-xs font-black text-foreground shadow-sm hover:border-primary/40 transition-all">
            <ClipboardDocumentListIcon className="h-5 w-5 text-emerald-600 shrink-0" />
            <span className="truncate">Tasks{pendingAssignments > 0 ? ` (${pendingAssignments})` : ''}</span>
          </Link>
          <Link href="/dashboard/flashcards" className="flex items-center gap-2.5 rounded-2xl border border-border bg-card p-3.5 text-xs font-black text-foreground shadow-sm hover:border-primary/40 transition-all">
            <BoltIcon className="h-5 w-5 text-amber-600 shrink-0" />
            <span className="truncate">Practice{dueFlashcards > 0 ? ` (${dueFlashcards})` : ''}</span>
          </Link>
          <Link href="/dashboard/slides" className="flex items-center gap-2.5 rounded-2xl border border-border bg-card p-3.5 text-xs font-black text-foreground shadow-sm hover:border-primary/40 transition-all">
            <PresentationChartLineIcon className="h-5 w-5 text-violet-600 shrink-0" />
            <span className="truncate">Slides</span>
          </Link>
          <Link href="/dashboard/projects" className="flex items-center gap-2.5 rounded-2xl border border-border bg-card p-3.5 text-xs font-black text-foreground shadow-sm hover:border-primary/40 transition-all">
            <RocketLaunchIcon className="h-5 w-5 text-sky-600 shrink-0" />
            <span className="truncate">Projects</span>
          </Link>
          <Link href="/dashboard/grades" className="flex items-center gap-2.5 rounded-2xl border border-border bg-card p-3.5 text-xs font-black text-foreground shadow-sm hover:border-primary/40 transition-all">
            <ChartBarIcon className="h-5 w-5 text-indigo-600 shrink-0" />
            <span className="truncate">My Grades</span>
          </Link>
        </div>

        <section className="rounded-3xl border border-border bg-card p-4 shadow-sm sm:p-6" aria-labelledby="student-class-package">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-primary">Shared by your teacher</p>
              <h2 id="student-class-package" className="mt-1 text-lg font-black text-foreground">
                {thisWeekNumber ? `Your Week ${thisWeekNumber} class package` : 'Your class package'}
              </h2>
              <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
                Your teacher's shared lesson and learning tools stay together. Open the session once, then move through what is available.
              </p>
            </div>
            {thisWeekLessons.length > 0 && (
              <span className="w-fit rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[10px] font-black text-emerald-700 dark:text-emerald-300">
                Available to your class
              </span>
            )}
          </div>
          {thisWeekLessons.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border py-12 text-center">
              <BookOpenIcon className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground font-bold">
                Your teacher has not shared a week yet.
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                This is the same week your class is on. When they open it, the lesson will be here.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {thisWeekLessons.map((lesson) => {
                const isCompleted = completedLessonIds.has(lesson.id);
                const isNext = nextLesson?.id === lesson.id;
                const packageItems = [
                  { key: 'lesson', label: 'Lesson' },
                  { key: 'slides', label: 'Slides' },
                  { key: 'practice', label: 'Practice' },
                  { key: 'assignment', label: 'Assignment' },
                  { key: 'project', label: 'Project' },
                ].filter(({ key }) => lesson.learner_package?.[key] === true);
                const completePackage = lesson.learner_package?.availableCount === 5;
                return (
                  <Link
                    key={lesson.id}
                    href={`/dashboard/lessons/${lesson.id}`}
                    className={`group flex min-h-40 flex-col rounded-2xl border p-4 transition-all ${
                      isNext
                        ? 'border-primary/50 bg-primary/5 shadow-sm'
                        : 'border-border bg-background hover:border-primary/30'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                        isCompleted
                          ? 'bg-emerald-500/15 text-emerald-600'
                          : isNext
                          ? 'bg-primary text-white'
                          : 'bg-muted text-muted-foreground'
                      }`}>
                        {isCompleted ? (
                          <CheckBadgeIcon className="h-5 w-5" />
                        ) : (
                          <PlayIcon className="h-4 w-4" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-[9px] font-black uppercase tracking-widest text-primary">
                          {isCompleted ? 'Completed session' : 'Continue this session'}
                        </p>
                        <p className="mt-1 text-sm font-black leading-tight text-foreground">
                          {lesson.title}
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-1.5">
                      {packageItems.map((item) => (
                        <span key={item.key} className="rounded-full border border-border bg-card px-2 py-1 text-[9px] font-bold text-muted-foreground">
                          {item.label}
                        </span>
                      ))}
                    </div>
                    <span className="mt-auto inline-flex items-center gap-1 pt-4 text-xs font-black text-primary">
                      {completePackage ? 'Open complete package' : 'Open class session'} <ArrowRightIcon className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
          <details className="mt-6 border-t border-border pt-4">
            <summary className="cursor-pointer text-xs font-black text-muted-foreground">All learning tools</summary>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
              <Link href="/dashboard/assignments" className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border bg-background px-3 text-xs font-bold text-foreground hover:border-primary/40">
                <ClipboardDocumentListIcon className="h-4 w-4 text-primary" />
                Assignments{pendingAssignments > 0 ? ` (${pendingAssignments})` : ''}
              </Link>
              <Link href="/dashboard/flashcards" className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border bg-background px-3 text-xs font-bold text-foreground hover:border-primary/40">
                <BoltIcon className="h-4 w-4 text-amber-600" />
                Practice{dueFlashcards > 0 ? ` (${dueFlashcards} due)` : ''}
              </Link>
              <Link href="/dashboard/slides" className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border bg-background px-3 text-xs font-bold text-foreground hover:border-primary/40">
                <PresentationChartLineIcon className="h-4 w-4 text-violet-600" /> Slides
              </Link>
              <Link href="/dashboard/projects" className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border bg-background px-3 text-xs font-bold text-foreground hover:border-primary/40">
                <RocketLaunchIcon className="h-4 w-4 text-sky-600" /> Projects
              </Link>
            </div>
          </details>
        </section>

        <ClassReplays heading={isKids ? 'Class replays' : 'Class Replays'} />

        {earlierWeeks.length > 0 && (
          <details className="rounded-2xl border border-border bg-card p-4">
            <summary className="cursor-pointer text-sm font-black text-foreground">
              Earlier shared weeks
            </summary>
            <div className="mt-4 space-y-5">
              {earlierWeeks.map((group) => (
                <div key={group.week}>
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">
                    Week {group.week}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {group.lessons.map((lesson) => (
                      <Link
                        key={lesson.id}
                        href={`/dashboard/lessons/${lesson.id}`}
                        className="flex items-center gap-2 p-3 border border-border text-sm font-bold hover:bg-muted/30"
                      >
                        {completedLessonIds.has(lesson.id) && (
                          <CheckBadgeIcon className="h-4 w-4 text-emerald-600 shrink-0" />
                        )}
                        <span className="truncate">{lesson.title}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </details>
        )}

        <MyProgressPanel />

      </div>
    </div>
  );
}
