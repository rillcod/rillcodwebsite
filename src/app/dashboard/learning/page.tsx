// @refresh reset
'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import {
  RocketLaunchIcon, BookOpenIcon, ClockIcon,
  AcademicCapIcon, PlayCircleIcon, CheckBadgeIcon,
  SparklesIcon, ArrowRightIcon, TrophyIcon,
  FireIcon, BoltIcon, ChartBarIcon, StarIcon,
  PlayIcon, LockClosedIcon, ArrowPathIcon,
  ClipboardDocumentListIcon
} from '@/lib/icons';
import { motion, AnimatePresence } from 'framer-motion';

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
      const [xpRes, streakRes, progressRes, subsRes] = await Promise.all([
        db.from('student_xp_summary').select('*').eq('student_id', profile.id).maybeSingle(),
        db.from('student_streaks').select('*').eq('student_id', profile.id).maybeSingle(),
        db.from('lesson_progress').select('id', { count: 'exact' }).eq('portal_user_id', profile.id).eq('status', 'completed'),
        db.from('assignment_submissions').select('grade, assignments(max_points)').eq('portal_user_id', profile.id).not('grade', 'is', null)
      ]);

      const avgScore = subsRes.data?.length 
        ? Math.round(subsRes.data.reduce((s, sub: any) => s + (sub.grade / (sub.assignments?.max_points || 100)) * 100, 0) / subsRes.data.length)
        : 0;

      setStats({
        avgScore,
        lessonsDone: progressRes.count || 0,
        streak: (streakRes.data as any)?.current_streak || 0,
        xp: (xpRes.data as any)?.total_xp || 0,
        level: (xpRes.data as any)?.level || 1
      });

      // 2. Fetch Badges
      const { data: badgeData } = await db
        .from('student_badges')
        .select('*')
        .eq('student_id', profile.id)
        .order('earned_at', { ascending: false })
        .limit(4);
      setBadges(badgeData || []);

      // 3. Fetch Pending Assignments
      const { count: pendingCount } = await db
        .from('assignment_submissions')
        .select('id', { count: 'exact', head: true })
        .eq('portal_user_id', profile.id)
        .eq('status', 'submitted');
      setPendingAssignments(pendingCount || 0);

      // 4. Fetch Enrollments and Programs (sequential levels first)
      const { data: levelEnr } = await db.from('student_level_enrollments')
        .select('*, courses!course_id(*, programs(*))')
        .eq('student_id', profile.id)
        .eq('status', 'active');
      
      let enrolledPrograms = [];
      if (levelEnr?.length) {
        enrolledPrograms = levelEnr.map(le => ({
          ...((le as any).courses?.programs || {}),
          status: le.status,
          current_course: (le as any).courses
        }));
      } else {
        const { data: fallbackEnr } = await db.from('enrollments')
          .select('*, programs(*)')
          .eq('user_id', profile.id);
        enrolledPrograms = fallbackEnr?.map(e => ({
          ...(e.programs as any || {}),
          status: e.status
        })) || [];
      }
      
      setPrograms(enrolledPrograms);

      const pIds = Array.from(new Set(enrolledPrograms.map((p: any) => p.id).filter((id: any) => id !== null)));

      // 5. Fetch Courses & Lessons (respect admin lock for students, except
      // for our always-public flagship programmes — see lib/courses/visibility)
      if (pIds.length) {
        const { data: rawCourses } = await db.from('courses')
          .select('id, title, description, duration_hours, program_id, is_locked, lessons(id), assignments(id), programs(name)')
          .in('program_id', pIds)
          .eq('is_active', true)
          .order('level_order', { ascending: true });

        const { isCourseVisibleToLearners } = await import('@/lib/courses/visibility');
        // Hide empty courses (no lessons AND no assignments) from students —
        // "0/0 modules" placeholder cards are not a good first impression.
        const visibleCourses = (rawCourses ?? []).filter((c: any) =>
          isCourseVisibleToLearners(c, { requireContent: true }),
        );

        const cmap: Record<string, any[]> = {};
        visibleCourses.forEach((c: any) => {
          if (c.program_id && !cmap[c.program_id]) cmap[c.program_id] = [];
          if (c.program_id) cmap[c.program_id].push(c);
        });
        setCoursesByProgram(cmap);

        const { data: recentLessons } = await db.from('lessons')
          .select('*, courses(title, programs(name))')
          .in('course_id', visibleCourses.map((c: any) => c.id))
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(6);
        setLessons(recentLessons || []);

        // 6. Find "Next Up" Lesson
        const { data: completedIds } = await db
          .from('lesson_progress')
          .select('lesson_id')
          .eq('portal_user_id', profile.id)
          .eq('status', 'completed');
        
        const doneSet = new Set(completedIds?.map(c => c.lesson_id).filter((id): id is string => id !== null) || []);
        setCompletedLessonIds(doneSet);

        // Find the first lesson in the first program that isn't done
        const { data: allLessons } = await db.from('lessons')
            .select('id, title, course_id, courses(id, title, level_order)')
            .in('course_id', rawCourses?.map(c => c.id) || [])
            .order('id', { ascending: true });
        
        const next = allLessons?.find(l => !doneSet.has(l.id));
        setNextLesson(next || allLessons?.[0]);
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
    { name: 'Bronze', min: 0, max: 499, color: 'text-amber-700', bar: 'bg-amber-600', bg: 'bg-amber-500/10' },
    { name: 'Silver', min: 500, max: 1999, color: 'text-muted-foreground/70', bar: 'bg-slate-400', bg: 'bg-slate-500/10' },
    { name: 'Gold', min: 2000, max: 4999, color: 'text-amber-400', bar: 'bg-amber-400', bg: 'bg-amber-500/10' },
    { name: 'Platinum', min: 5000, max: 9999, color: 'text-cyan-400', bar: 'bg-cyan-400', bg: 'bg-cyan-500/10' },
  ], []);

  const currentLevelConfig = LEVEL_CONFIG.find((l: any) => stats.xp >= l.min && stats.xp <= l.max) || LEVEL_CONFIG[0];
  const nextLevelConfig = LEVEL_CONFIG[LEVEL_CONFIG.indexOf(currentLevelConfig) + 1];
  const xpProgress = nextLevelConfig
    ? Math.min(100, ((stats.xp - currentLevelConfig.min) / (nextLevelConfig.min - currentLevelConfig.min)) * 100)
    : 100;

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
            {[
              { label: 'Lessons Done', value: stats.lessonsDone, icon: CheckBadgeIcon, color: 'text-emerald-500', border: 'border-t-emerald-500' },
              { label: 'Week Streak',  value: stats.streak,      icon: FireIcon,       color: 'text-primary', border: 'border-t-primary' },
              { label: 'Total Points', value: stats.xp.toLocaleString(), icon: TrophyIcon, color: 'text-amber-500', border: 'border-t-amber-500' },
              { label: 'Avg Score',    value: `${stats.avgScore}%`, icon: ChartBarIcon, color: 'text-primary', border: 'border-t-primary' },
            ].slice(0, 2).map(({ label, value, icon: Icon, color, border }) => (
              <div key={label} className={`bg-card border border-border border-t-2 ${border} p-5 flex items-center gap-4`}>
                <Icon className={`w-7 h-7 ${color} shrink-0`} />
                <div>
                  <p className="text-2xl font-black tabular-nums">{value}</p>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mt-0.5">{label}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── XP Progress ── */}
        <div className="bg-card border border-border p-5 flex flex-col sm:flex-row items-center gap-5">
          <div className="flex items-center gap-4 shrink-0">
            <div className={`w-14 h-14 border-2 ${currentLevelConfig.bar.replace('bg-', 'border-')} flex items-center justify-center text-2xl`}>
              {currentLevelConfig.name === 'Bronze' ? '🥉' : currentLevelConfig.name === 'Silver' ? '🥈' : currentLevelConfig.name === 'Gold' ? '🥇' : '💎'}
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
                          className={`w-14 h-14 sm:w-16 sm:h-16 flex items-center justify-center border-2 transition-all ${
                            isCompleted ? 'bg-primary border-primary text-white' :
                            isNext ? 'bg-card border-primary text-primary ring-2 ring-brand-red-600/30 animate-pulse' :
                            'bg-muted/30 border-border text-muted-foreground/30 cursor-not-allowed'
                          }`}
                        >
                          {isCompleted ? <CheckBadgeIcon className="w-7 h-7" /> :
                           isNext ? <RocketLaunchIcon className="w-7 h-7" /> :
                           <LockClosedIcon className="w-5 h-5" />}
                        </Link>
                        <p className={`text-[9px] font-bold text-center max-w-[80px] leading-tight truncate ${isNext ? 'text-foreground' : 'text-muted-foreground/50'}`}>
                          {lesson.title}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Legend */}
            <div className="flex items-center gap-6 mt-6 pt-4 border-t border-border">
              <div className="flex items-center gap-2"><div className="w-3 h-3 bg-primary" /><span className="text-[10px] text-muted-foreground font-bold">Completed</span></div>
              <div className="flex items-center gap-2"><div className="w-3 h-3 border-2 border-primary animate-pulse" /><span className="text-[10px] text-muted-foreground font-bold">Up Next</span></div>
              <div className="flex items-center gap-2"><div className="w-3 h-3 bg-muted border border-border" /><span className="text-[10px] text-muted-foreground font-bold">Locked</span></div>
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

      </div>
    </div>
  );
}
