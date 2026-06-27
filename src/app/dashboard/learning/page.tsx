// @refresh reset
'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import { withTimeout } from '@/lib/async-timeout';
import Link from 'next/link';
import {
  RocketLaunchIcon, BookOpenIcon, ClockIcon,
  AcademicCapIcon, PlayCircleIcon, CheckBadgeIcon,
  SparklesIcon, ArrowRightIcon, TrophyIcon,
  FireIcon, BoltIcon, ChartBarIcon, StarIcon,
  PlayIcon, LockClosedIcon, ArrowPathIcon,
  ClipboardDocumentListIcon, ChartPieIcon,
  CommandLineIcon
} from '@/lib/icons';
import { motion, AnimatePresence } from 'framer-motion';

const GREETINGS = ['Welcome back', 'Ready to learn?', 'Let\'s continue', 'Great to see you'];
const KID_GREETINGS = ['Hey there!', 'Ready to learn?', 'Let\'s have fun!', 'Time to explore!'];

function lessonPlanIdOf(lesson: any): string | null {
  const metadata = lesson?.metadata;
  if (!metadata || typeof metadata !== 'object') return null;
  const id = metadata.lesson_plan_id;
  return typeof id === 'string' && id.trim() ? id : null;
}

async function filterLessonsForClassPlans(db: ReturnType<typeof createClient>, lessons: any[], classId?: string | null, termId?: string | null) {
  if (!classId || lessons.length === 0) return lessons;
  const courseIds = Array.from(new Set(lessons.map((lesson) => lesson.course_id).filter(Boolean)));
  if (courseIds.length === 0) return lessons;

  let planQuery = db
    .from('lesson_plans')
    .select('id, course_id, term_id')
    .eq('class_id', classId)
    .in('course_id', courseIds);
  if (termId) planQuery = planQuery.eq('term_id', termId);
  const { data: plans } = await planQuery;
  const allowedPlanIds = new Set((plans ?? []).map((plan: any) => plan.id).filter(Boolean));
  const plannedCourseIds = new Set((plans ?? []).map((plan: any) => plan.course_id).filter(Boolean));

  return lessons.filter((lesson) => {
    const planId = lessonPlanIdOf(lesson);
    if (planId) return allowedPlanIds.has(planId);
    return !plannedCourseIds.has(lesson.course_id);
  });
}

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
  const [programs, setPrograms] = useState<any[]>([]);
  const [stats, setStats] = useState({
    avgScore: 0,
    lessonsDone: 0,
    streak: 0,
    xp: 0,
    level: 1
  });
  const [loading, setLoading] = useState(true);
  const [nextLesson, setNextLesson] = useState<any>(null);
  const [completedLessonIds, setCompletedLessonIds] = useState<Set<string>>(new Set());
  const [coursesByProgram, setCoursesByProgram] = useState<Record<string, any[]>>({});
  const [badges, setBadges] = useState<any[]>([]);
  const [dailyMissions, setDailyMissions] = useState<any[]>([]);
  const [pendingAssignments, setPendingAssignments] = useState(0);
  const [dueFlashcards, setDueFlashcards] = useState(0);
  const [activeTab, setActiveTab] = useState<'map' | 'gym' | 'insights'>('map');
  const [loadError, setLoadError] = useState<string | null>(null);
  
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
    const db = createClient();
    
    try {
      // 1. Fetch Summary Stats using NEW engagement schema
      const [xpRes, streakRes, progressRes, subsRes] = await withTimeout(Promise.all([
        db.from('student_xp_summary').select('*').eq('student_id', profile.id).maybeSingle(),
        db.from('student_streaks').select('*').eq('student_id', profile.id).maybeSingle(),
        db.from('lesson_progress').select('id', { count: 'exact' }).eq('portal_user_id', profile.id).eq('status', 'completed'),
        db.from('assignment_submissions').select('grade, assignments(max_points)').eq('portal_user_id', profile.id).not('grade', 'is', null)
      ]), [{ data: null }, { data: null }, { data: [], count: 0 }, { data: [] }], 'learning summary stats');

      const avgScore = subsRes.data?.length 
        ? Math.round((subsRes.data as any[]).reduce((s: number, sub: any) => s + (sub.grade / (sub.assignments?.max_points || 100)) * 100, 0) / subsRes.data.length)
        : 0;

      setStats({
        avgScore,
        lessonsDone: progressRes.count || 0,
        streak: (streakRes.data as any)?.current_streak || 0,
        xp: (xpRes.data as any)?.total_xp || 0,
        level: (xpRes.data as any)?.level || 1
      });

      // 2. Fetch Badges
      const { data: badgeData } = await withTimeout(
        db
          .from('student_badges')
          .select('*')
          .eq('student_id', profile.id)
          .order('earned_at', { ascending: false })
          .limit(4),
        { data: [], error: null },
        'learning badges',
      );
      setBadges(badgeData || []);

      // 3. Fetch Pending Assignments
      const { count: pendingCount } = await withTimeout(
        db
          .from('assignment_submissions')
          .select('id', { count: 'exact', head: true })
          .eq('portal_user_id', profile.id)
          .eq('status', 'submitted'),
        { count: 0, data: null, error: null },
        'learning pending assignments',
      );
      setPendingAssignments(pendingCount || 0);

      // 3.5 Fetch Due Flashcards reviews count
      const { data: dueCards } = await withTimeout(
        db
          .from('flashcard_reviews')
          .select('card_id, next_review_at')
          .eq('student_id', profile.id),
        { data: [], error: null },
        'learning due flashcards',
      );
        
      const nowVal = new Date();
      const dueFlashcardsCount = (dueCards ?? []).filter((r: any) => !r.next_review_at || new Date(r.next_review_at) <= nowVal).length;
      setDueFlashcards(dueFlashcardsCount);

      // 4. Fetch Enrollments and Programs (sequential levels first)
      const { data: levelEnr } = await withTimeout(
        db.from('student_level_enrollments')
          .select('*, courses!course_id(*, programs(*))')
          .eq('student_id', profile.id)
          .eq('status', 'active'),
        { data: [], error: null },
        'learning level enrollments',
      );
      
      let enrolledPrograms = [];
      if (levelEnr?.length) {
        enrolledPrograms = (levelEnr as any[]).map((le: any) => ({
          ...((le as any).courses?.programs || {}),
          status: le.status,
          current_course: (le as any).courses
        }));
      } else {
        const { data: fallbackEnr } = await withTimeout(
          db.from('enrollments')
            .select('*, programs(*)')
            .eq('user_id', profile.id),
          { data: [], error: null },
          'learning fallback enrollments',
        );
        enrolledPrograms = (fallbackEnr as any[] | null | undefined)?.map((e: any) => ({
          ...(e.programs as any || {}),
          status: e.status
        })) || [];
      }
      
      setPrograms(enrolledPrograms);

      const pIds = Array.from(new Set<string>(enrolledPrograms.map((p: any) => p.id).filter((id: any): id is string => typeof id === 'string' && id.length > 0)));

      // 5. Fetch Courses & Lessons (respect admin lock for students, except
      // for our always-public flagship programmes — see lib/courses/visibility)
      if (pIds.length) {
        const { data: rawCourses } = await withTimeout(
          db.from('courses')
            .select('id, title, description, duration_hours, program_id, is_locked, lessons(id), assignments(id), programs(name)')
            .in('program_id', pIds)
            .eq('is_active', true)
            .order('level_order', { ascending: true }),
          { data: [], error: null },
          'learning courses',
        );

        // Check if there is a current course focus lock for the student's class
        let currentCourseId: string | null = null;
        let currentClassTermId: string | null = null;
        if (profile?.class_id) {
          const { data: clsData } = await withTimeout(
            db
              .from('classes')
              .select('current_course_id, term_id')
              .eq('id', profile.class_id)
              .maybeSingle(),
            { data: null, error: null },
            'learning class focus',
          );
          if (clsData?.current_course_id) {
            currentCourseId = clsData.current_course_id;
          }
          currentClassTermId = clsData?.term_id ?? null;
        }

        const coursesToUse = currentCourseId
          ? (rawCourses ?? []).filter((c: any) => c.id === currentCourseId)
          : (rawCourses ?? []);

        const { isCourseVisibleToLearners } = await import('@/lib/courses/visibility');
        // Hide empty courses (no lessons AND no assignments) from students —
        // "0/0 modules" placeholder cards are not a good first impression.
        const visibleCourses = (coursesToUse).filter((c: any) =>
          isCourseVisibleToLearners(c, { requireContent: true }),
        );

        const cmap: Record<string, any[]> = {};
        visibleCourses.forEach((c: any) => {
          if (c.program_id && !cmap[c.program_id]) cmap[c.program_id] = [];
          if (c.program_id) cmap[c.program_id].push(c);
        });
        setCoursesByProgram(cmap);

        const { data: recentLessons } = await withTimeout(
          db.from('lessons')
            .select('*, courses(title, programs(name))')
            .in('course_id', visibleCourses.map((c: any) => c.id))
            .in('status', ['active', 'published'])
            .order('created_at', { ascending: false })
            .limit(30),
          { data: [], error: null },
          'learning recent lessons',
        );
        const scopedRecentLessons = await filterLessonsForClassPlans(db, recentLessons ?? [], profile?.class_id, currentClassTermId);
        setLessons(scopedRecentLessons.slice(0, 6));

        // 6. Find "Next Up" Lesson
        const { data: completedIds } = await withTimeout(
          db
            .from('lesson_progress')
            .select('lesson_id')
            .eq('portal_user_id', profile.id)
            .eq('status', 'completed'),
          { data: [], error: null },
          'learning completed lessons',
        );
        
        const doneSet = new Set<string>(((completedIds ?? []) as any[]).map((c: any) => c.lesson_id).filter((id: any): id is string => typeof id === 'string'));
        setCompletedLessonIds(doneSet);

        // Find the first lesson in the first program that isn't done
        const { data: allLessons } = await withTimeout(
          db.from('lessons')
              .select('id, title, course_id, metadata, courses(id, title, level_order)')
              .in('course_id', coursesToUse.map((c: any) => c.id))
              .in('status', ['active', 'published'])
              .order('id', { ascending: true }),
          { data: [], error: null },
          'learning all lessons',
        );
        const scopedAllLessons = await filterLessonsForClassPlans(db, allLessons ?? [], profile?.class_id, currentClassTermId);

        const next = scopedAllLessons?.find(l => !doneSet.has(l.id));
        setNextLesson(next || scopedAllLessons?.[0]);
      }

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

  // DAILY MISSIONS LOGIC
  useEffect(() => {
    if (loading) return;
    const missions: any[] = [];

    // Mission 1: Complete next lesson
    if (nextLesson) {
      missions.push({
        id: 'lesson',
        label: isKids ? 'Today\'s Adventure' : 'Next Lesson',
        desc: nextLesson.title,
        xp: 10,
        emoji: '📚',
        href: `/dashboard/lessons/${nextLesson.id}`,
        done: completedLessonIds.has(nextLesson.id),
        color: 'border-l-cyan-500 bg-cyan-400/5 text-cyan-400'
      });
    }

    // Mission 2: Assignment / CBT
    if (pendingAssignments > 0) {
      missions.push({
        id: 'assignment',
        label: `Submit Homework`,
        desc: `${pendingAssignments} pending task${pendingAssignments > 1 ? 's' : ''}`,
        xp: 25,
        emoji: '📝',
        href: '/dashboard/assignments',
        done: false,
        color: 'border-l-primary bg-primary/5 text-primary'
      });
    } else {
      missions.push({
        id: 'quiz',
        label: 'Take a CBT Quiz',
        desc: 'Test your knowledge',
        xp: 50,
        emoji: '🎯',
        href: '/dashboard/cbt',
        done: false,
        color: 'border-l-primary bg-primary/5 text-primary'
      });
    }

    // Mission 3: Streak / Growth
    missions.push({
      id: 'streak',
      label: stats.streak > 0 ? 'Keep it up!' : 'Start a Streak',
      desc: stats.streak > 0 ? `${stats.streak} weeks active` : 'Active session required',
      xp: 15,
      emoji: '🔥',
      href: '/dashboard/learning/stats',
      done: stats.streak > 0,
      color: 'border-l-emerald-500 bg-emerald-400/5 text-emerald-400'
    });

    setDailyMissions(missions);
  }, [loading, nextLesson, pendingAssignments, stats.streak, completedLessonIds, isKids]);

  // Level configuration
  const LEVEL_CONFIG = useMemo(() => [
    { name: 'Nehemiah Builder', min: 0, max: 499, color: 'text-amber-700', bar: 'bg-amber-600', bg: 'bg-amber-500/10' },
    { name: 'Gideon Scout', min: 500, max: 1999, color: 'text-slate-400', bar: 'bg-slate-400', bg: 'bg-slate-500/10' },
    { name: 'Joshua Commander', min: 2000, max: 4999, color: 'text-amber-400', bar: 'bg-amber-400', bg: 'bg-amber-500/10' },
    { name: 'Solomon Sage', min: 5000, max: 999999, color: 'text-cyan-400', bar: 'bg-cyan-400', bg: 'bg-cyan-500/10' },
  ], []);

  const currentLevelConfig = LEVEL_CONFIG.find((l: any) => stats.xp >= l.min && stats.xp <= l.max) || LEVEL_CONFIG[0];
  const nextLevelConfig = LEVEL_CONFIG[LEVEL_CONFIG.indexOf(currentLevelConfig) + 1];
  const xpProgress = nextLevelConfig
    ? Math.min(100, ((stats.xp - currentLevelConfig.min) / (nextLevelConfig.min - currentLevelConfig.min)) * 100)
    : 100;

  const totalLessonsCount = useMemo(() => {
    let count = 0;
    Object.values(coursesByProgram).forEach((coursesArr: any[]) => {
      coursesArr.forEach((c: any) => {
        count += c.lessons?.length || 0;
      });
    });
    return count || 1; // prevent divide-by-zero
  }, [coursesByProgram]);

  if (authLoading || profileLoading || loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent animate-spin rounded-full" />
        <p className="text-muted-foreground text-xs font-bold uppercase tracking-widest animate-pulse">Loading...</p>
      </div>
    </div>
  );

  if (!profile) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center space-y-4">
        <p className="text-muted-foreground text-sm">Session expired. Please sign in again.</p>
        <a href="/login" className="inline-block px-6 py-3 bg-primary text-white text-sm font-bold hover:bg-primary transition-colors">Sign In</a>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background text-foreground">

      {/* ── Top bar: quick links ── */}
      <div className="bg-card border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2.5 flex items-center gap-2 flex-wrap">
          <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest shrink-0">Jump to:</span>
          {[
            { label: 'Lessons',     href: '/dashboard/lessons',     icon: '📖' },
            { label: 'Assignments', href: '/dashboard/assignments',  icon: '📋' },
            { label: 'CBT Exams',   href: '/dashboard/cbt',          icon: '🎯' },
            { label: 'Flashcards',  href: '/dashboard/flashcards',   icon: '🎴' },
            { label: 'Projects',    href: '/dashboard/projects',     icon: '🚀' },
            { label: 'Certificates',href: '/dashboard/certificates', icon: '🎓' },
          ].map(({ label, href, icon }) => (
            <Link key={label} href={href}
              className="flex items-center gap-1.5 px-3 py-1 text-[10px] font-bold text-muted-foreground hover:text-foreground hover:bg-muted border border-transparent hover:border-border rounded-full transition-all">
              {icon} {label}
            </Link>
          ))}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">

        {/* ── Error banner ── */}
        {loadError && (
          <div className="bg-destructive/10 border border-destructive/30 p-4 flex items-center justify-between gap-4">
            <p className="text-destructive text-sm font-bold">{loadError}</p>
            <button onClick={() => { setLoadError(null); loadData(); }}
              className="text-xs font-bold text-destructive border border-destructive/40 px-3 py-1.5 hover:bg-destructive/10 transition-colors shrink-0">
              Retry
            </button>
          </div>
        )}

        {/* ── Hero: greeting + stats ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* Greeting */}
          <div className="lg:col-span-2 bg-card border border-border p-6 sm:p-8 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-48 h-48 bg-primary/5 blur-3xl pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-32 h-32 bg-brand-red-600/5 blur-3xl pointer-events-none" />
            <div className="relative z-10">
              <span className="inline-block text-[10px] font-black text-brand-red-600 uppercase tracking-widest mb-3">
                {profile.grade_level || (isKids ? 'Primary School' : isAdult ? 'Professional' : 'Secondary School')}
              </span>
              <h1 className="text-3xl sm:text-4xl font-black text-foreground tracking-tight mb-2">
                {greeting}, <span className="text-primary">{profile?.full_name?.split(' ')[0]}!</span>
                {isKids && ' 🚀'}
              </h1>
              <p className="text-sm text-muted-foreground max-w-lg leading-relaxed">
                {isKids
                  ? 'Your learning adventure is waiting! Complete lessons, earn points, and have fun! 🌟'
                  : isAdult
                  ? 'Keep building your skills. Your next lesson is ready.'
                  : 'Your courses, lessons, and assignments — all in one place.'}
              </p>

              {/* ── Dynamic Wisdom Spark of the Day ── */}
              <div className="mt-5 p-3 bg-primary/5 border border-primary/10 rounded-xl max-w-lg flex items-start gap-2.5 shadow-sm">
                <span className="text-lg shrink-0">📜</span>
                <div>
                  <p className="text-[9px] font-black text-primary uppercase tracking-widest leading-none">Wisdom Spark of the Day</p>
                  <p className="text-xs text-foreground italic mt-1 leading-relaxed">
                    {currentLevelConfig.name === 'Nehemiah Builder' && '"Let us rise up and build." — Nehemiah 2:18 (Theme: Modular foundations, engineering & rebuilding)'}
                    {currentLevelConfig.name === 'Gideon Scout' && '"Go in this thy might." — Judges 6:14 (Theme: Focus, analytical strategy & debugging under pressure)'}
                    {currentLevelConfig.name === 'Joshua Commander' && '"Be strong and of a good courage." — Joshua 1:9 (Theme: Leadership, sweeps loop pacing & marching progress)'}
                    {currentLevelConfig.name === 'Solomon Sage' && '"Wisdom is the principal thing; therefore get wisdom." — Proverbs 4:7 (Theme: Deep compilation, complex architectures & systemic wisdom)'}
                  </p>
                </div>
              </div>

              {nextLesson && (
                <Link href={`/dashboard/lessons/${nextLesson.id}`}
                  className="inline-flex items-center gap-2 mt-5 px-5 py-3 bg-primary hover:bg-primary text-white text-xs font-black uppercase tracking-widest transition-all border-2 border-transparent hover:border-brand-red-600">
                  <RocketLaunchIcon className="w-4 h-4" />
                  Continue: {nextLesson.title}
                  <ArrowRightIcon className="w-3.5 h-3.5" />
                </Link>
              )}
            </div>
          </div>

          {/* Stats column */}
          <div className="grid grid-cols-2 lg:grid-cols-1 gap-3">
            
            {/* Card 1: Lessons Completed */}
            <div className="bg-card border border-border border-t-2 border-t-emerald-500 p-5 flex items-center gap-4 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 blur-xl pointer-events-none" />
              <CheckBadgeIcon className="w-8 h-8 text-emerald-500 shrink-0" />
              <div>
                <p className="text-2xl font-black tabular-nums text-foreground">{stats.lessonsDone}</p>
                <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mt-0.5">Lessons Done</p>
              </div>
            </div>

            {/* Card 2: Streak Multiplier Boost */}
            <div className="bg-card border border-border border-t-2 border-t-primary p-5 flex items-center gap-4 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 blur-xl pointer-events-none" />
              <FireIcon className={`w-8 h-8 shrink-0 ${stats.streak > 0 ? 'text-primary animate-pulse' : 'text-muted-foreground/30'}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-2xl font-black tabular-nums text-foreground">{stats.streak}</p>
                  {stats.streak > 0 ? (
                    <span className="px-2 py-0.5 bg-amber-500/10 text-amber-500 border border-amber-500/25 text-[8px] font-black rounded-full uppercase tracking-wider animate-pulse whitespace-nowrap">
                      x1.2 Boost
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 bg-muted text-muted-foreground text-[7px] font-black rounded-full uppercase tracking-wider whitespace-nowrap">
                      Ready
                    </span>
                  )}
                </div>
                <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mt-0.5">Week Streak</p>
              </div>
            </div>

          </div>
        </div>

        {/* ── XP Progress ── */}
        <div className="bg-card border border-border p-5 flex flex-col sm:flex-row items-center gap-5">
          <div className="flex items-center gap-4 shrink-0">
            <div className={`w-14 h-14 border-2 ${currentLevelConfig.bar.replace('bg-', 'border-')} flex items-center justify-center text-2xl rounded-xl`}>
              {currentLevelConfig.name === 'Nehemiah Builder' ? '🧱' : currentLevelConfig.name === 'Gideon Scout' ? '🏹' : currentLevelConfig.name === 'Joshua Commander' ? '🛡️' : '👑'}
            </div>
            <div>
              <p className={`text-sm font-black uppercase ${currentLevelConfig.color}`}>{currentLevelConfig.name}</p>
              <p className="text-xs text-muted-foreground font-bold">Level {stats.level} · {stats.xp.toLocaleString()} XP</p>
            </div>
          </div>
          <div className="flex-1 w-full space-y-1.5">
            <div className="flex justify-between text-[10px] font-bold text-muted-foreground">
              <span>{stats.xp.toLocaleString()} XP earned</span>
              {nextLevelConfig && <span>{nextLevelConfig.min.toLocaleString()} XP for {nextLevelConfig.name}</span>}
            </div>
            <div className="h-2.5 w-full bg-muted rounded-full overflow-hidden">
              <motion.div
                className={`h-full ${currentLevelConfig.bar} rounded-full`}
                initial={{ width: 0 }}
                animate={{ width: `${xpProgress}%` }}
                transition={{ duration: 1.2, ease: 'circOut' }}
              />
            </div>
          </div>
          {badges.length > 0 && (
            <div className="flex items-center gap-2 shrink-0 border-l border-border pl-5">
              {badges.slice(0, 4).map((badge: any) => (
                <div key={badge.id} title={badge.badge_label}
                  className="w-10 h-10 bg-muted border border-border flex items-center justify-center text-xl hover:scale-110 transition-transform cursor-help">
                  {badge.badge_icon || '🏅'}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Dashboard Workspaces: the student's own learning views ── */}
        <div className="bg-card/40 backdrop-blur-md border border-border/80 rounded-[24px] p-2 flex flex-col md:flex-row gap-2 items-center justify-between">
          <div className="flex flex-wrap gap-1.5 w-full md:w-auto">
            {[
              { id: 'map', label: 'My Learning Map', emoji: '🗺️', desc: 'Missions & Path' },
              { id: 'gym', label: 'Skill Revision Gym', emoji: '⚡', desc: 'Flashcards & Labs', badge: dueFlashcards > 0 ? dueFlashcards : null },
              { id: 'insights', label: 'Growth Analytics', emoji: '📊', desc: 'Academic Insights' },
            ].map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`relative flex items-center gap-3 px-5 py-3 rounded-[16px] text-xs font-black uppercase tracking-wider transition-all duration-300 w-full md:w-auto ${
                    isActive
                      ? 'bg-primary text-white shadow-lg shadow-primary/20 scale-102'
                      : 'hover:bg-muted/60 text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <span className="text-lg">{tab.emoji}</span>
                  <div className="text-left">
                    <p className="leading-none font-black">{tab.label}</p>
                    <p className={`text-[8px] font-bold mt-0.5 ${isActive ? 'text-white/70' : 'text-muted-foreground/60'}`}>
                      {tab.desc}
                    </p>
                  </div>
                  {tab.badge && (
                    <span className="absolute -top-1.5 -right-1.5 bg-brand-red-600 text-white text-[9px] font-black w-5 h-5 flex items-center justify-center rounded-full animate-bounce border border-background">
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="px-4 py-2 border-t md:border-t-0 md:border-l border-border/80 w-full md:w-auto flex items-center justify-between md:justify-start gap-3 text-[10px] font-black uppercase tracking-widest shrink-0">
            <span className="text-muted-foreground">Active Persona:</span>
            {activeTab === 'insights' ? (
              <span className="px-2.5 py-1 bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 rounded-full flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Analytics View
              </span>
            ) : (
              <span className="px-2.5 py-1 bg-primary/10 text-primary border border-primary/20 rounded-full flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                Active Student
              </span>
            )}
          </div>
        </div>

        {/* ── Active Tab View ── */}
        <AnimatePresence mode="wait">
          {activeTab === 'map' && (
            <motion.div
              key="map-workspace"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.2 }}
              className="space-y-8 animate-in fade-in duration-300"
            >
              {/* ── Today's Tasks ── */}
              {dailyMissions.length > 0 && (
                <section>
                  <h2 className="text-sm font-black uppercase tracking-widest text-muted-foreground mb-4">
                    {isKids ? "⭐ Today's Missions" : "Today's Tasks"}
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {dailyMissions.map((mission) => (
                      <Link key={mission.id} href={mission.href}
                        className={`flex items-center gap-4 p-4 bg-card border border-l-4 ${mission.color} border-border hover:bg-muted/30 transition-all ${mission.done ? 'opacity-50' : ''}`}>
                        <span className="text-2xl shrink-0">{mission.emoji}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-black text-foreground truncate">{mission.label}</p>
                          <p className="text-[11px] text-muted-foreground truncate">{mission.desc}</p>
                        </div>
                        <span className="text-[10px] font-black text-primary shrink-0">+{mission.xp} XP</span>
                        {mission.done && <CheckBadgeIcon className="w-5 h-5 text-emerald-500 shrink-0" />}
                      </Link>
                    ))}
                  </div>
                </section>
              )}

              {/* ── Lesson Path ── */}
              <section>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-black uppercase tracking-widest text-muted-foreground">
                    {isKids ? '🗺️ My Learning Path' : 'Your Lessons'}
                  </h2>
                  <Link href="/dashboard/lessons" className="text-xs font-bold text-primary hover:text-primary transition-colors">
                    View all →
                  </Link>
                </div>

                <div className="bg-card border border-border p-6 overflow-x-auto">
                  {lessons.length === 0 ? (
                    <div className="text-center py-12">
                      <BookOpenIcon className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                      <p className="text-sm text-muted-foreground font-bold">No lessons yet — your teacher will add them soon.</p>
                    </div>
                  ) : (
                    <div className="flex items-center gap-0 min-w-max">
                      {lessons.map((lesson, idx) => {
                        const isCompleted = completedLessonIds.has(lesson.id);
                        const isNext = nextLesson?.id === lesson.id;
                        const isLocked = !isCompleted && !isNext;
                        return (
                          <div key={lesson.id} className="flex items-center">
                            {idx > 0 && (
                              <div className={`h-0.5 w-12 sm:w-16 ${completedLessonIds.has(lessons[idx-1]?.id) ? 'bg-primary' : 'bg-border'}`} />
                            )}
                            <div className="flex flex-col items-center gap-2 relative">
                              {isNext && (
                                <span className="absolute -top-8 left-1/2 -translate-x-1/2 bg-brand-red-600 text-white text-[9px] font-black px-2 py-1 whitespace-nowrap uppercase tracking-wider">
                                  Up Next
                                </span>
                              )}
                              <Link
                                href={isLocked ? '#' : `/dashboard/lessons/${lesson.id}`}
                                className={`w-16 h-16 flex items-center justify-center border-2 transition-all duration-300 ${
                                  isCompleted
                                    ? 'rounded-full bg-gradient-to-tr from-amber-400 to-yellow-300 border-yellow-400 text-slate-950 shadow-lg shadow-yellow-500/20 hover:scale-110'
                                    : isNext
                                    ? 'rounded-[20px] bg-gradient-to-tr from-primary to-brand-red-500 border-primary text-white ring-4 ring-primary/30 shadow-xl shadow-primary/20 hover:scale-105'
                                    : 'rounded-xl bg-muted/40 border-border text-muted-foreground/30 cursor-not-allowed hover:bg-muted/60'
                                }`}
                              >
                                {isCompleted ? (
                                  <span className="text-2xl animate-pulse">⭐</span>
                                ) : isNext ? (
                                  <RocketLaunchIcon className="w-8 h-8 animate-bounce" />
                                ) : (
                                  <span className="text-xl opacity-60">🔒</span>
                                )}
                              </Link>
                              <p className={`text-[9px] font-bold text-center max-w-[80px] leading-tight truncate ${isNext ? 'text-foreground font-black' : 'text-muted-foreground/50'}`}>
                                {lesson.title}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Legend */}
                  <div className="flex flex-wrap items-center gap-6 mt-6 pt-4 border-t border-border">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-amber-400 to-yellow-300 flex items-center justify-center text-[11px]">⭐</div>
                      <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Mission Mastered</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-[8px] bg-primary flex items-center justify-center text-white text-[10px] animate-pulse">🚀</div>
                      <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Current Adventure</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-xl bg-muted border border-border flex items-center justify-center text-[10px]">🔒</div>
                      <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Locked Milestone</span>
                    </div>
                    <Link href={nextLesson ? `/dashboard/lessons/${nextLesson.id}` : '/dashboard/lessons'}
                      className="ml-auto px-5 py-2.5 bg-primary hover:bg-primary text-white text-xs font-black uppercase tracking-widest transition-all">
                      {nextLesson ? 'Continue Learning' : 'Browse Lessons'}
                    </Link>
                  </div>
                </div>
              </section>

              {/* ── My Programmes ── */}
              <section>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-black uppercase tracking-widest text-muted-foreground">
                    {isKids ? '🎒 My Learning Path' : 'My Programmes'}
                  </h2>
                  <span className="text-xs text-muted-foreground font-bold">{programs.length} enrolled</span>
                </div>

                {programs.length === 0 ? (
                  <div className="bg-card border-2 border-dashed border-border p-12 text-center">
                    <AcademicCapIcon className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
                    <p className="text-sm text-muted-foreground font-bold mb-4">
                      {isKids ? 'No programmes yet — ask your teacher! ✨' : 'You are not enrolled in any programme yet.'}
                    </p>
                    <Link href="/dashboard/library" className="inline-flex items-center gap-2 text-primary hover:text-primary text-xs font-black uppercase tracking-widest transition-all">
                      Browse Library <ArrowRightIcon className="w-4 h-4" />
                    </Link>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {programs.map((prog, pi) => {
                      const courses = coursesByProgram[prog.id] ?? [];
                      const accentColors = [
                        { border: 'border-t-primary', text: 'text-primary', bar: 'bg-primary' },
                        { border: 'border-t-primary',   text: 'text-primary',   bar: 'bg-primary'   },
                        { border: 'border-t-emerald-500', text: 'text-emerald-500',bar: 'bg-emerald-500'},
                      ][pi % 3];

                      return (
                        <div key={prog.id} className={`bg-card border border-border border-t-2 ${accentColors.border} overflow-hidden`}>
                          {/* Programme header */}
                          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                            <div className="flex items-center gap-3">
                              <AcademicCapIcon className={`w-5 h-5 ${accentColors.text} shrink-0`} />
                              <div>
                                <h3 className="text-sm font-black uppercase tracking-tight">{prog.name}</h3>
                                <p className="text-[10px] text-muted-foreground font-bold mt-0.5">
                                  {prog.difficulty_level || 'Level 1'} · {prog.duration_weeks || 12} weeks
                                </p>
                              </div>
                            </div>
                            <Link href={`/dashboard/curriculum?program=${prog.id}`}
                              className="text-[10px] font-black text-brand-red-600 hover:text-primary uppercase tracking-widest transition-colors">
                              View Syllabus →
                            </Link>
                          </div>

                          {/* Courses grid */}
                          {courses.length === 0 ? (
                            <div className="px-6 py-8 text-center text-sm text-muted-foreground font-bold">
                              No courses available yet.
                            </div>
                          ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-px bg-border">
                              {courses.map((c) => {
                                const total = c.lessons?.length || 0;
                                const done = (c.lessons || []).filter((l: any) => completedLessonIds.has(l.id)).length;
                                const pct = total > 0 ? Math.round((done / total) * 100) : 0;
                                return (
                                  <Link key={c.id} href={`/dashboard/courses/${c.id}`}
                                    className="bg-card p-5 hover:bg-muted/30 transition-all flex flex-col gap-3">
                                    <div className="flex items-start justify-between gap-2">
                                      <p className="text-sm font-black leading-tight">{c.title}</p>
                                      <span className={`text-[9px] font-black px-2 py-0.5 shrink-0 ${pct === 100 ? 'bg-emerald-500/10 text-emerald-500' : 'bg-muted text-muted-foreground'}`}>
                                        {pct === 100 ? '✓ Done' : `${pct}%`}
                                      </span>
                                    </div>
                                    <div className="space-y-1">
                                      <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                                        <div className={`h-full rounded-full transition-all ${pct === 100 ? 'bg-emerald-500' : accentColors.bar}`}
                                          style={{ width: `${pct}%` }} />
                                      </div>
                                      <div className="flex justify-between text-[9px] font-bold text-muted-foreground">
                                        <span>{done}/{total} lessons</span>
                                        <span>{c.duration_hours || 0}h</span>
                                      </div>
                                    </div>
                                  </Link>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            </motion.div>
          )}

          {activeTab === 'gym' && (
            <motion.div
              key="gym-workspace"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.2 }}
              className="space-y-6 animate-in fade-in duration-300"
            >
              <div>
                <h2 className="text-xl font-black uppercase tracking-tight text-foreground font-black">⚡ SKILL REVISION GYM</h2>
                <p className="text-xs text-muted-foreground mt-1">Accelerate memory retention, test analytical limits, and build freeform computational prototypes.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* 1. Flashcard Card */}
                <div className={`bg-card border rounded-[24px] p-6 flex flex-col justify-between overflow-hidden relative group transition-all duration-300 hover:scale-[1.02] ${
                  dueFlashcards > 0 
                    ? 'border-brand-red-600/30 hover:border-brand-red-600/60 shadow-lg shadow-brand-red-600/5' 
                    : 'border-border hover:border-primary/40'
                }`}>
                  <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 blur-3xl pointer-events-none group-hover:bg-primary/10 transition-colors" />
                  <div>
                    <div className="flex items-center justify-between mb-6">
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl ${
                        dueFlashcards > 0 ? 'bg-brand-red-600/10 text-brand-red-600' : 'bg-primary/10 text-primary'
                      }`}>
                        {dueFlashcards > 0 ? '🔥' : '🎴'}
                      </div>
                      {dueFlashcards > 0 && (
                        <span className="px-2.5 py-1 bg-brand-red-600/10 text-brand-red-600 border border-brand-red-600/20 text-[9px] font-black rounded-full uppercase tracking-wider">
                          Due Today
                        </span>
                      )}
                    </div>
                    <h3 className="text-base font-black uppercase tracking-tight mb-2">Spaced Revision Deck</h3>
                    <p className="text-xs text-muted-foreground leading-relaxed mb-6">
                      {dueFlashcards > 0 
                        ? `You have ${dueFlashcards} card${dueFlashcards > 1 ? 's' : ''} due today. Keep your memory streak alive and lock in your coding vocabulary.`
                        : "Outstanding retention! You have 0 review cards due today. Visit the card vault to browse existing modules or study ahead."}
                    </p>
                  </div>
                  <Link href="/dashboard/flashcards"
                    className={`inline-flex items-center justify-center gap-2 w-full py-3 text-xs font-black uppercase tracking-widest transition-all rounded-[14px] ${
                      dueFlashcards > 0 
                        ? 'bg-brand-red-600 text-white hover:bg-brand-red-600/90 shadow-lg shadow-brand-red-600/20' 
                        : 'bg-primary text-white hover:bg-primary/95'
                    }`}>
                    <FireIcon className="w-4 h-4" />
                    {dueFlashcards > 0 ? 'Start Revision' : 'Enter Card Vault'}
                  </Link>
                </div>

                {/* 2. CBT Exam Simulator */}
                <div className="bg-card border border-border hover:border-primary/40 rounded-[24px] p-6 flex flex-col justify-between overflow-hidden relative group transition-all duration-300 hover:scale-[1.02]">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 blur-3xl pointer-events-none group-hover:bg-primary/10 transition-colors" />
                  <div>
                    <div className="flex items-center justify-between mb-6">
                      <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center text-2xl">
                        🎯
                      </div>
                      <span className="px-2.5 py-1 bg-muted text-muted-foreground border border-border text-[9px] font-black rounded-full uppercase tracking-wider">
                        Exam Hall
                      </span>
                    </div>
                    <h3 className="text-base font-black uppercase tracking-tight mb-2">CBT Quiz Simulator</h3>
                    <p className="text-xs text-muted-foreground leading-relaxed mb-6">
                      Test your understanding across multi-choice modules. Simulate real-world exams, track your timing scores, and build robust academic resilience.
                    </p>
                  </div>
                  <Link href="/dashboard/cbt"
                    className="inline-flex items-center justify-center gap-2 w-full py-3 bg-primary text-white hover:bg-primary/95 text-xs font-black uppercase tracking-widest transition-all rounded-[14px]">
                    <TrophyIcon className="w-4 h-4" />
                    Launch CBT Arena
                  </Link>
                </div>

                {/* 3. Robotics & Code Labs Sandbox */}
                <div className="bg-card border border-border hover:border-primary/40 rounded-[24px] p-6 flex flex-col justify-between overflow-hidden relative group transition-all duration-300 hover:scale-[1.02]">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 blur-3xl pointer-events-none group-hover:bg-primary/10 transition-colors" />
                  <div>
                    <div className="flex items-center justify-between mb-6">
                      <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center text-2xl">
                        💻
                      </div>
                      <span className="px-2.5 py-1 bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 text-[9px] font-black rounded-full uppercase tracking-wider">
                        Laboratory
                      </span>
                    </div>
                    <h3 className="text-base font-black uppercase tracking-tight mb-2">Code & Robotics Labs</h3>
                    <p className="text-xs text-muted-foreground leading-relaxed mb-6">
                      Step into our freeform sandbox. Compile code, simulate autonomous robotics workflows, and build community solutions using our digital prototyping board.
                    </p>
                  </div>
                  <Link href="/dashboard/playground"
                    className="inline-flex items-center justify-center gap-2 w-full py-3 bg-primary text-white hover:bg-primary/95 text-xs font-black uppercase tracking-widest transition-all rounded-[14px]">
                    <CommandLineIcon className="w-4 h-4" />
                    Open Lab Sandbox
                  </Link>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'insights' && (
            <motion.div
              key="insights-workspace"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.2 }}
              className="space-y-6 animate-in fade-in duration-300 text-slate-100"
            >
              {/* Header card — student's own growth analytics */}
              <div className="bg-card border border-border rounded-[24px] p-6 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-48 h-48 bg-emerald-500/5 blur-3xl pointer-events-none" />
                <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <div>
                    <span className="inline-block text-[9px] font-black text-emerald-500 bg-emerald-500/10 border border-emerald-500/25 px-2.5 py-1 rounded-full uppercase tracking-wider mb-2">
                      📊 Growth Analytics
                    </span>
                    <h2 className="text-xl font-black uppercase tracking-tight text-foreground font-black">
                      {profile?.full_name?.split(' ')[0]}'s Growth Analytics
                    </h2>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Track your academic milestones, lesson pacing, and teacher remarks.
                    </p>
                  </div>
                  <div className="shrink-0 flex items-center gap-1.5 bg-muted/50 border border-border rounded-xl px-4 py-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    📅 Date: {new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long' })}
                  </div>
                </div>
              </div>

              {/* Grid: Radial Score + Metrics */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                
                {/* 1. Academic Performance (Radial Average) */}
                <div className="bg-card border border-border rounded-[24px] p-6 flex flex-col items-center justify-between text-center relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 blur-3xl pointer-events-none" />
                  <div className="w-full">
                    <h3 className="text-xs font-black uppercase tracking-wider text-muted-foreground mb-4">Grade Point Average</h3>
                    
                    {/* SVG Radial Progress */}
                    <div className="relative w-36 h-36 mx-auto flex items-center justify-center">
                      <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                        <circle
                          cx="50"
                          cy="50"
                          r="40"
                          className="stroke-muted"
                          strokeWidth="8"
                          fill="transparent"
                        />
                        <circle
                          cx="50"
                          cy="50"
                          r="40"
                          className="stroke-primary"
                          strokeWidth="8"
                          fill="transparent"
                          strokeDasharray={251.2}
                          strokeDashoffset={251.2 - (251.2 * Math.min(stats.avgScore, 100)) / 100}
                          strokeLinecap="round"
                        />
                      </svg>
                      <div className="absolute flex flex-col items-center justify-center">
                        <span className="text-3xl font-black tracking-tight tabular-nums text-foreground">{stats.avgScore}%</span>
                        <span className="text-[8px] font-black text-muted-foreground uppercase tracking-widest">GPA Index</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 w-full">
                    <p className="text-[11px] text-muted-foreground leading-relaxed px-2">
                      Calculated from homework submissions, capstone deliverables, and multi-choice quizzes.
                    </p>
                  </div>
                </div>

                {/* 2. Syllabus Milestone Progress */}
                <div className="bg-card border border-border rounded-[24px] p-6 flex flex-col justify-between relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 blur-3xl pointer-events-none" />
                  <div className="w-full">
                    <h3 className="text-xs font-black uppercase tracking-wider text-muted-foreground mb-4">Curriculum Completion</h3>
                    
                    <div className="space-y-4">
                      <div className="flex justify-between items-baseline">
                        <p className="text-2xl font-black tabular-nums text-foreground">{stats.lessonsDone} / {totalLessonsCount}</p>
                        <p className="text-[10px] font-bold text-muted-foreground">Syllabus Lessons</p>
                      </div>

                      <div className="space-y-1">
                        <div className="h-3 w-full bg-muted rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                            style={{ width: `${Math.min(100, (stats.lessonsDone / totalLessonsCount) * 100)}%` }}
                          />
                        </div>
                        <div className="flex justify-between text-[9px] font-bold text-muted-foreground uppercase tracking-wider">
                          <span>Progress ratio</span>
                          <span>{Math.round((stats.lessonsDone / totalLessonsCount) * 100)}% Complete</span>
                        </div>
                      </div>

                      <div className="border-t border-border/85 pt-4 space-y-2">
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground font-bold">Active Programs:</span>
                          <span className="font-black text-foreground">{programs.length} Enrolled</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground font-bold">Homework Tasks Completed:</span>
                          <span className="font-black text-foreground">{stats.lessonsDone} Modules</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 3. Streaks & Retention */}
                <div className="bg-card border border-border rounded-[24px] p-6 flex flex-col justify-between relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 blur-3xl pointer-events-none" />
                  <div className="w-full">
                    <h3 className="text-xs font-black uppercase tracking-wider text-muted-foreground mb-4">Consistency Index</h3>
                    
                    <div className="space-y-4">
                      <div className="flex items-center gap-4 bg-muted/30 border border-border/50 p-4 rounded-2xl">
                        <span className="text-3xl">🔥</span>
                        <div>
                          <p className="text-xl font-black tabular-nums text-foreground">{stats.streak} Week{stats.streak !== 1 ? 's' : ''}</p>
                          <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Active learning streak</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 bg-muted/30 border border-border/50 p-4 rounded-2xl">
                        <span className="text-3xl">💎</span>
                        <div>
                          <p className="text-xl font-black tabular-nums text-foreground">{stats.xp.toLocaleString()}</p>
                          <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Cumulative knowledge xp</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Section: Badges & Official Feedback */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* Master Badges Block (2 cols) */}
                <div className="lg:col-span-2 bg-card border border-border rounded-[24px] p-6 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-48 h-48 bg-primary/5 blur-3xl pointer-events-none" />
                  <h3 className="text-xs font-black uppercase tracking-wider text-muted-foreground mb-4">Mastered Competency Badges</h3>
                  
                  {badges.length === 0 ? (
                    <div className="py-12 text-center text-sm text-muted-foreground font-bold">
                      🏆 No custom badges earned yet. When capstone milestones are completed, verified badges will display here.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {badges.map((badge: any) => (
                        <div key={badge.id} className="flex items-center gap-4 p-4 bg-muted/30 border border-border rounded-2xl transition-all hover:bg-muted/50">
                          <div className="w-12 h-12 bg-card border border-border/80 flex items-center justify-center text-3xl rounded-xl shrink-0">
                            {badge.badge_icon || '🏅'}
                          </div>
                          <div>
                            <p className="text-xs font-black uppercase tracking-tight text-foreground">{badge.badge_label}</p>
                            <p className="text-[9px] text-muted-foreground font-bold mt-0.5">
                              Earned on {new Date(badge.earned_at).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Official Broadsheet remarks (1 col) */}
                <div className="bg-card border border-border rounded-[24px] p-6 relative overflow-hidden flex flex-col justify-between">
                  <div className="absolute bottom-0 right-0 w-32 h-32 bg-primary/5 blur-3xl pointer-events-none" />
                  
                  <div>
                    <h3 className="text-xs font-black uppercase tracking-wider text-muted-foreground mb-4">Academic & Character Assessment</h3>
                    <div className="space-y-4">
                      <p className="text-xs text-foreground leading-relaxed italic">
                        "{profile?.full_name?.split(' ')[0]} is currently progressing under the verified level of <strong className={currentLevelConfig.color}>{currentLevelConfig.name}</strong>. Their retention index remains strong, maintaining healthy computational curiosity. We highly recommend continuous spaced repetition reviews in the Revision Gym to lock in memory vocabularies."
                      </p>
                    </div>
                  </div>

                  <div className="mt-6 pt-4 border-t border-border/80 flex items-center justify-between text-[8px] font-black uppercase tracking-widest text-muted-foreground">
                    <span>Office of Academic Affairs</span>
                    <span className="text-emerald-500 font-bold">✓ Verified Report Card</span>
                  </div>
                </div>

              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </div>
  );
}
