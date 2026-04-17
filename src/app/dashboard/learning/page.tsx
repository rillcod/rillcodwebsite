// @refresh reset
'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import {
  RocketLaunchIcon, BookOpenIcon, ClockIcon,
  AcademicCapIcon, PlayCircleIcon, CheckBadgeIcon, ClipboardDocumentListIcon,
  SparklesIcon, ArrowRightIcon, TrophyIcon,
  FireIcon, BoltIcon, ChartBarIcon, StarIcon,
  PlayIcon, MapPinIcon, LockClosedIcon,
  ShieldCheckIcon,
} from '@/lib/icons';
import { motion, AnimatePresence } from 'framer-motion';

const GREETINGS = ['Welcome back', 'Keep it up', 'Ready to study?', 'Looking sharp', 'Innovate today'];
const KID_GREETINGS = ['Hey there!', 'Ready to learn?', 'Let\'s have fun!', 'Time to code!', 'Let\'s go!'];

/** Detect learner tier from grade_level / enrollment_type.
 *  Nigerian school system:
 *    Kids      = Nursery/KG, Basic 1-6 (Primary), Grade 1-6
 *    Secondary = JSS 1-3, SS 1-3, Junior/Senior Secondary
 *    Adult     = HND, OND, University, Professional, NCE, PGDE, Adult Ed
 */
function getLearnerTier(gradeLevel?: string | null, enrollmentType?: string | null): 'kids' | 'secondary' | 'adult' {
  const g = (gradeLevel || enrollmentType || '').toLowerCase().trim();
  if (!g) return 'secondary'; // default for unknown

  // Kids: nursery, kindergarten, primary, basic 1-6
  if (/\b(nursery|kg|kindergarten|pre-?school|basic\s*[1-6]|primary|grade\s*[1-6]|year\s*[1-6]|class\s*[1-6]|kid|p[1-6]\b)/i.test(g)) return 'kids';
  // Secondary: JSS, SS, junior, senior secondary
  if (/\b(jss|ss\s*[1-3]|junior\s*sec|senior\s*sec|secondary|form\s*[1-6]|year\s*[7-9]|year\s*1[0-3])/i.test(g)) return 'secondary';
  // Adult/tertiary
  if (/\b(adult|hnd|ond|nce|pgde|university|uni|tertiary|professional|degree|postgrad|masters|phd|ndp|diploma|college)/i.test(g)) return 'adult';

  // Loose fallbacks
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
    xp: 0
  });
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [aiInsight, setAiInsight] = useState<{strengths: string, growth: string} | null>(null);
  const [generatingInsight, setGeneratingInsight] = useState(false);
  const [nextLesson, setNextLesson] = useState<any>(null);
  
  const [greetingSeed] = useState(() => Math.random());
  const tier = getLearnerTier(profile?.grade_level, profile?.enrollment_type);
  const isKids = tier === 'kids';
  const isAdult = tier === 'adult';
  const greeting = isKids
    ? KID_GREETINGS[Math.floor(greetingSeed * KID_GREETINGS.length)]
    : GREETINGS[Math.floor(greetingSeed * GREETINGS.length)];
  const [completedLessonIds, setCompletedLessonIds] = useState<Set<string>>(new Set());
  const [badges, setBadges] = useState<any[]>([]);
  const [coursesByProgram, setCoursesByProgram] = useState<Record<string, { id: string; title: string; description: string | null; duration_hours: number | null; program_id: string; lessons: { id: string }[]; assignments: { id: string }[] }[]>>({});
  const [pendingAssignments, setPendingAssignments] = useState(0);
  const [dailyMissions, setDailyMissions] = useState<any[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  async function loadData() {
    if (!profile) return;
    setLoading(true);
    const db = createClient();
    
    try {
      // 1. Fetch Enrollments & Programs
      const { data: enr } = await db.from('enrollments')
        .select('*, programs(*)')
        .eq('user_id', profile.id);
      
      const enrolledPrograms = enr?.map(e => ({
        ...(e.programs as any || {}),
        progress_pct: e.progress_pct || 0,
        enrollment_date: e.enrollment_date,
        status: e.status
      })) || [];
      setPrograms(enrolledPrograms);

      const pIds = enrolledPrograms.map(p => p.id);

      // 1b. Fetch courses (with lesson + assignment counts) for each enrolled program
      type ProgramCourse = {
        id: string; title: string; description: string | null;
        duration_hours: number | null; program_id: string;
        lessons: { id: string }[];
        assignments: { id: string }[];
      };
      if (pIds.length) {
        const { data: rawCourses } = await db.from('courses')
          .select('id, title, description, duration_hours, program_id, is_locked, lessons(id), assignments(id)')
          .in('program_id', pIds)
          .eq('is_active', true)
          .eq('is_locked', false)
          .order('created_at', { ascending: true });
        const progCourses = (rawCourses ?? []) as unknown as ProgramCourse[];
        const cmap: Record<string, ProgramCourse[]> = {};
        for (const c of progCourses) {
          if (!cmap[c.program_id]) cmap[c.program_id] = [];
          cmap[c.program_id].push(c);
        }
        setCoursesByProgram(cmap);
      }

      // 2. Fetch Real Stats
      const [pointsRes, progressRes, subsRes] = await Promise.all([
        db.from('user_points').select('*').eq('portal_user_id', profile.id).maybeSingle(),
        db.from('lesson_progress').select('id', { count: 'exact' }).eq('portal_user_id', profile.id).eq('status', 'completed'),
        db.from('assignment_submissions').select('grade, assignments(max_points)').eq('portal_user_id', profile.id).not('grade', 'is', null)
      ]);

      const avgScore = subsRes.data?.length 
        ? Math.round(subsRes.data.reduce((s, sub: any) => s + (sub.grade / (sub.assignments?.max_points || 100)) * 100, 0) / subsRes.data.length)
        : 0;

      setStats({
        avgScore,
        lessonsDone: progressRes.count || 0,
        streak: pointsRes.data?.current_streak || 0,
        xp: pointsRes.data?.total_points || 0
      });

      // 3. Fetch Recent Lessons
      if (pIds.length) {
        // First find courses in these programs
        const { data: courses } = await db.from('courses').select('id').in('program_id', pIds);
        const cIds = courses?.map(c => c.id) || [];
        
        if (cIds.length) {
          const { data } = await db.from('lessons')
            .select('*, courses(title, programs(name))')
            .in('course_id', cIds)
            .eq('status', 'active')
            .order('created_at', { ascending: false })
            .limit(6);
          setLessons(data || []);
        }
      }

      // 4. Fetch Leaderboard
      const { data: lpRes } = await db
        .from('user_points')
        .select('portal_user_id, total_points, achievement_level, portal_users(full_name)')
        .order('total_points', { ascending: false })
        .limit(3);
      
      setLeaderboard((lpRes ?? []).map((item: any, idx: number) => ({
        rank: idx + 1,
        name: item.portal_users?.full_name || 'Anonymous',
        pts: item.total_points,
        level: item.achievement_level,
        isMe: item.portal_user_id === profile.id
      })));

      // 5. Logic: Determine Next Objective
      if (pIds.length) {
        // Find first incomplete lesson for current program
        const { data: firstProgramLessons } = await db
          .from('lessons')
          .select('id, title, course_id, courses(title, programs(name))')
          .in('course_id',
            (await db.from('courses').select('id').eq('program_id', pIds[0])).data?.map(c => c.id) || []
          )
          .order('id', { ascending: true });
        
        const { data: completedIds } = await db
          .from('lesson_progress')
          .select('lesson_id')
          .eq('portal_user_id', profile.id)
          .eq('status', 'completed');
        
        const doneSet = new Set(completedIds?.map(c => c.lesson_id));
        const next = firstProgramLessons?.find(l => !doneSet.has(l.id));
        setNextLesson(next || firstProgramLessons?.[0]);
      }

      // Fetch completed lesson IDs for journey map
      const { data: completedProgress } = await db
        .from('lesson_progress')
        .select('lesson_id')
        .eq('portal_user_id', profile.id)
        .eq('status', 'completed');
      setCompletedLessonIds(new Set(completedProgress?.map((p: any) => p.lesson_id) || []));

      // Fetch recent badges
      const { data: badgesData } = await db
        .from('user_badges')
        .select('earned_at, badges(name, description, icon_url)')
        .eq('portal_user_id', profile.id)
        .order('earned_at', { ascending: false })
        .limit(4);
      setBadges((badgesData || []).map((b: any) => b.badges).filter(Boolean));

      // Fetch pending assignments count
      const { count: pendingCount } = await db
        .from('assignment_submissions')
        .select('id', { count: 'exact', head: true })
        .eq('portal_user_id', profile.id)
        .eq('status', 'submitted');
      setPendingAssignments(pendingCount || 0);

    } catch (err) {
      console.error('Error loading learning data:', err);
      setLoadError('Failed to load your dashboard data. Please refresh the page.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Wait until both auth AND profile loading are done before acting
    if (authLoading || profileLoading) return;

    if (!profile) {
      // Auth resolved but no profile (e.g. fetch failed) — stop spinner, don't hang
      setLoading(false);
      return;
    }

    loadData();

    // Enable Realtime Synchronization
    const db = createClient();
    const channel = db.channel(`user-stats-${profile.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'user_points',
        filter: `portal_user_id=eq.${profile.id}`
      }, (payload: any) => {
        if (payload.new) {
          setStats(prev => ({
            ...prev,
            xp: payload.new.total_points,
            streak: payload.new.current_streak
          }));
        }
      })
      .subscribe();

    return () => {
      db.removeChannel(channel);
    };
  }, [profile?.id, authLoading, profileLoading]);

  useEffect(() => {
    if (loading) return;
    const missions: any[] = [];

    // Mission 1: Complete next lesson
    if (nextLesson) {
      missions.push({
        id: 'lesson',
        label: 'Complete Today\'s Lesson',
        desc: nextLesson.title,
        xp: 10,
        emoji: '📚',
        href: `/dashboard/lessons/${nextLesson.id}`,
        done: completedLessonIds.has(nextLesson.id),
        color: 'border-l-cyan-500 bg-cyan-500/5 text-cyan-400'
      });
    }

    // Mission 2: Submit assignment or take quiz
    if (pendingAssignments > 0) {
      missions.push({
        id: 'assignment',
        label: `Submit ${pendingAssignments} Assignment${pendingAssignments > 1 ? 's' : ''}`,
        desc: 'You have work ready to hand in',
        xp: 25,
        emoji: '📝',
        href: '/dashboard/assignments',
        done: false,
        color: 'border-l-orange-500 bg-orange-500/5 text-orange-400'
      });
    } else {
      missions.push({
        id: 'quiz',
        label: 'Take a CBT Exam',
        desc: 'Practice what you have learned',
        xp: 50,
        emoji: '🎯',
        href: '/dashboard/cbt',
        done: false,
        color: 'border-l-violet-500 bg-violet-500/5 text-violet-400'
      });
    }

    // Mission 3: Check leaderboard (always available)
    missions.push({
      id: 'streak',
      label: stats.streak > 0 ? 'Streak active!' : 'Start Your Streak',
      desc: stats.streak > 0 ? `${stats.streak}-day streak — keep it going!` : 'Complete a lesson to start your streak',
      xp: 10,
      emoji: stats.streak > 0 ? '🔥' : '⚡',
      href: '/dashboard/leaderboard',
      done: stats.streak > 0,
      color: stats.streak > 0 ? 'border-l-emerald-500 bg-emerald-500/5 text-emerald-400' : 'border-l-amber-500 bg-amber-500/5 text-amber-400'
    });

    setDailyMissions(missions);
  }, [loading, nextLesson, pendingAssignments, stats.streak, completedLessonIds]);

  if (authLoading || profileLoading || loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="flex flex-col items-center gap-6">
        <div className="w-12 h-12 border-4 border-orange-600 border-t-transparent animate-spin" />
        <p className="text-muted-foreground text-[10px] font-black tracking-[0.4em] uppercase">
          {profileLoading ? 'Authenticating...' : 'Loading your dashboard...'}
        </p>
      </div>
    </div>
  );

  // Auth resolved but profile missing — direct to login
  if (!profile) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center space-y-4">
        <p className="text-muted-foreground text-sm font-bold">Session expired. Please sign in again.</p>
        <a href="/login" className="inline-block px-6 py-3 bg-orange-600 text-white text-xs font-black uppercase tracking-widest hover:bg-orange-500 transition-colors">Sign In</a>
      </div>
    </div>
  );

  const LEVEL_CONFIG = [
    { name: 'Bronze', min: 0, max: 499, color: 'text-amber-700', bar: 'bg-amber-600' },
    { name: 'Silver', min: 500, max: 1999, color: 'text-slate-400', bar: 'bg-slate-400' },
    { name: 'Gold', min: 2000, max: 4999, color: 'text-amber-400', bar: 'bg-amber-400' },
    { name: 'Platinum', min: 5000, max: 9999, color: 'text-cyan-400', bar: 'bg-cyan-400' },
  ];
  const currentLevelConfig = LEVEL_CONFIG.find(l => stats.xp >= l.min && stats.xp <= l.max) || LEVEL_CONFIG[0];
  const nextLevelConfig = LEVEL_CONFIG[LEVEL_CONFIG.indexOf(currentLevelConfig) + 1];
  const xpProgress = nextLevelConfig
    ? Math.min(100, ((stats.xp - currentLevelConfig.min) / (nextLevelConfig.min - currentLevelConfig.min)) * 100)
    : 100;

  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-orange-600/30">

      {/* Activity Hub — quick nav to all 4 activity types */}
      <div className="bg-card border-b border-border px-4 sm:px-8 py-3">
        <div className="max-w-7xl mx-auto flex items-center gap-2 flex-wrap">
          <span className="text-[9px] font-black text-muted-foreground uppercase tracking-[0.2em] flex-shrink-0 mr-1">Activity Hub:</span>
          {[
            { label: 'Written Exams',    href: '/dashboard/exams',        color: 'text-blue-400 bg-blue-500/10 border-blue-500/20 hover:bg-blue-500/20', icon: '📝' },
            { label: 'CBT / Evaluation', href: '/dashboard/cbt',          color: 'text-orange-400 bg-orange-500/10 border-orange-500/20 hover:bg-orange-500/20', icon: '🎯' },
            { label: 'Assignments',      href: '/dashboard/assignments',   color: 'text-violet-400 bg-violet-500/10 border-violet-500/20 hover:bg-violet-500/20', icon: '📋' },
            { label: 'Projects',         href: '/dashboard/projects',      color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20 hover:bg-emerald-500/20', icon: '🚀' },
            { label: 'Lessons',          href: '/dashboard/lessons',       color: 'text-amber-400 bg-amber-500/15 border-amber-500/30', icon: '📖', active: true },
          ].map(({ label, href, color, icon, active }) =>
            active
              ? <span key={label} className={`flex items-center gap-1.5 px-3 py-1 text-[10px] font-black uppercase tracking-widest border rounded-full flex-shrink-0 ${color}`}>
                  {icon} {label} <span className="text-[8px] opacity-60">(here)</span>
                </span>
              : <Link key={label} href={href} className={`flex items-center gap-1.5 px-3 py-1 text-[10px] font-black uppercase tracking-widest border rounded-full flex-shrink-0 transition-all ${color}`}>
                  {icon} {label}
                </Link>
          )}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">

        {/* Error banner */}
        {loadError && (
          <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-4 flex items-center justify-between gap-4">
            <p className="text-destructive text-xs font-bold">{loadError}</p>
            <button onClick={() => { setLoadError(null); loadData(); }}
              className="text-[10px] font-black text-destructive uppercase tracking-widest border border-destructive/40 px-3 py-1 hover:bg-destructive/10 transition-colors flex-shrink-0">
              Retry
            </button>
          </div>
        )}

        {/* Unified Hero Section */}
        <div className={`relative overflow-hidden border p-6 sm:p-10 lg:p-14 group ${isKids ? 'bg-gradient-to-br from-violet-600/10 via-card to-orange-500/10 border-violet-500/30' : 'bg-card border-border'}`}>
          <div className={`absolute top-0 right-0 w-[600px] h-[600px] blur-[150px] -mr-64 -mt-64 pointer-events-none transition-all duration-1000 ${isKids ? 'bg-violet-600/10 group-hover:bg-violet-600/15' : 'bg-orange-600/5 group-hover:bg-orange-600/8'}`} />
          <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-blue-600/5 blur-[120px] -ml-48 -mb-48 pointer-events-none" />

          {/* Learner tier badge — always visible */}
          <div className={`relative z-10 inline-flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest mb-4 border ${isKids ? 'bg-violet-500/20 border-violet-500/40 text-violet-400' : isAdult ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400' : 'bg-blue-500/20 border-blue-500/40 text-blue-400'}`}>
            {isKids ? '🎒' : isAdult ? '🎓' : '📚'}
            {profile.grade_level || (isKids ? 'Primary School' : isAdult ? 'Professional Learner' : 'Secondary School')}
          </div>

          <div className="relative z-10 flex flex-col lg:flex-row items-center justify-between gap-8 sm:gap-12">
            <div className="space-y-4 sm:space-y-6 text-center lg:text-left flex-1">
              <h1 className={`font-black tracking-tighter leading-[0.9] italic ${isKids ? 'text-3xl sm:text-5xl' : 'text-3xl sm:text-5xl lg:text-7xl'}`}>
                {greeting},<br />
                <span className={`text-transparent bg-clip-text ${isKids ? 'bg-gradient-to-r from-violet-500 via-pink-500 to-orange-500' : 'bg-gradient-to-r from-orange-600 via-orange-500 to-amber-500'}`}>
                  {profile?.full_name?.split(' ')[0]}!
                </span>
                {isKids && <span className="ml-2 not-italic">🚀</span>}
              </h1>
              <p className="text-sm sm:text-base text-muted-foreground max-w-xl font-medium leading-relaxed">
                {isKids
                  ? 'Your learning adventure is waiting! Complete lessons, earn XP, and have fun! 🌟'
                  : isAdult
                  ? 'Professional learning at your pace — lessons, assessments, and certifications in one place.'
                  : 'Everything you need for your courses, lessons, and assignments — all in one place.'}
              </p>
              
              <div className="flex flex-col sm:flex-row flex-wrap gap-3 sm:gap-4 pt-4 justify-center lg:justify-start w-full sm:w-auto">
                <div 
                  className="flex items-center gap-4 px-6 py-4 bg-muted/30 border border-border backdrop-blur-md min-h-[60px] group relative"
                  title="Complete lessons daily to maintain your streak. Streak resets if no activity for 24 hours."
                >
                   <FireIcon className="w-6 h-6 text-orange-600 flex-shrink-0" />
                   <div>
                      <p className="text-2xl font-black tabular-nums leading-none">{stats.streak} DAYS</p>
                      <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mt-1">Day Streak</p>
                   </div>
                   {/* Tooltip */}
                   <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-background border border-border text-[10px] text-foreground whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                     Complete lessons daily to keep your streak
                     <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px border-4 border-transparent border-t-border" />
                   </div>
                </div>
                <div className="flex items-center gap-4 px-6 py-4 bg-muted/30 border border-border backdrop-blur-md min-h-[60px]">
                   <TrophyIcon className="w-6 h-6 text-amber-500 flex-shrink-0" />
                   <div>
                      <p className="text-2xl font-black tabular-nums leading-none">{stats.xp.toLocaleString()}</p>
                      <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mt-1">Points</p>
                   </div>
                </div>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-3 sm:gap-4 w-full lg:w-auto">
               <div className={`p-4 sm:p-8 text-center flex flex-col items-center justify-center min-w-0 sm:min-w-[200px] group/card hover:border-blue-500/30 transition-all border ${isKids ? 'bg-blue-500/10 border-blue-500/30' : 'bg-background border-border'}`}>
                  <div className={`w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center mb-2 sm:mb-4 transition-transform group-hover/card:scale-110 ${isKids ? 'text-2xl sm:text-3xl' : 'bg-blue-500/10 border border-blue-500/20 text-blue-400'}`}>
                     {isKids ? '⭐' : <ChartBarIcon className="w-5 h-5 sm:w-7 sm:h-7" />}
                  </div>
                  <p className="text-2xl sm:text-4xl font-black tabular-nums">{stats.avgScore}%</p>
                  <p className="text-[8px] sm:text-[9px] font-black uppercase tracking-[0.15em] sm:tracking-[0.25em] text-muted-foreground mt-1 sm:mt-2">
                    {isKids ? 'My Score' : isAdult ? 'Assessment Avg' : 'Avg Score'}
                  </p>
               </div>
               <div className={`p-4 sm:p-8 text-center flex flex-col items-center justify-center min-w-0 sm:min-w-[200px] group/card hover:border-emerald-500/30 transition-all border ${isKids ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-background border-border'}`}>
                  <div className={`w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center mb-2 sm:mb-4 transition-transform group-hover/card:scale-110 ${isKids ? 'text-2xl sm:text-3xl' : 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'}`}>
                     {isKids ? '🏅' : <CheckBadgeIcon className="w-5 h-5 sm:w-7 sm:h-7" />}
                  </div>
                  <p className="text-2xl sm:text-4xl font-black tabular-nums">{stats.lessonsDone}</p>
                  <p className="text-[8px] sm:text-[9px] font-black uppercase tracking-[0.15em] sm:tracking-[0.25em] text-muted-foreground mt-1 sm:mt-2">
                    {isKids ? 'Lessons Done! 🎉' : isAdult ? 'Modules Completed' : 'Lessons Done'}
                  </p>
               </div>
            </div>
          </div>
        </div>

        {/* AI Performance Insights Component */}
        <section className="bg-indigo-600/5 border border-indigo-500/20 p-8 sm:p-12 overflow-hidden relative group">
          <div className="absolute -right-24 -top-24 w-64 h-64 bg-indigo-500/10 blur-[80px] rounded-full group-hover:bg-indigo-500/20 transition-all duration-700" />
          <div className="relative z-10 flex flex-col md:flex-row items-center gap-10">
            <div className="shrink-0">
               <div className="w-20 h-20 bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 relative">
                  <SparklesIcon className="w-10 h-10" />
                  <div className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-500 rounded-full animate-pulse" />
               </div>
            </div>
            <div className="flex-1 space-y-4 text-center md:text-left">
               <div className="flex flex-col gap-1">
                 <p className="text-[9px] font-black text-indigo-500 uppercase tracking-[0.4em]">AI Feedback</p>
                 <h3 className="text-2xl font-black tracking-tight text-foreground uppercase italic">
                   {isKids ? 'My AI Tutor 🤖' : 'Performance Feedback'}
                 </h3>
               </div>
               <p className="text-sm text-muted-foreground font-medium max-w-2xl leading-relaxed">
                 {isKids
                   ? 'Ask our AI to see how you\'re doing and get tips on what to learn next! 🌟'
                   : 'Our AI will review your recent activity and suggest what to focus on next.'}
               </p>
               <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-3 sm:gap-4 justify-center md:justify-start pt-2">
                  <button 
                    disabled={generatingInsight}
                    onClick={async () => {
                      setGeneratingInsight(true);
                      try {
                        const res = await fetch('/api/ai/generate', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            type: 'report-feedback',
                            studentName: profile?.full_name,
                            topic: programs[0]?.name || 'STEM Curriculum',
                            attendance: 'Stable',
                            assignments: `${stats.lessonsDone} Labs Synced`
                          })
                        });
                        const d = await res.json();
                        if (d.data) {
                          setAiInsight({
                            strengths: d.data.key_strengths,
                            growth: d.data.areas_for_growth
                          });
                        }
                      } finally {
                        setGeneratingInsight(false);
                      }
                    }}
                    className="w-full sm:w-auto px-6 sm:px-8 py-4 bg-indigo-600 disabled:bg-indigo-900/50 hover:bg-indigo-500 text-foreground font-black uppercase text-[10px] tracking-[0.2em] transition-all min-h-[48px] sm:min-h-0"
                  >
                    {generatingInsight ? 'Generating feedback...' : 'Get my feedback'}
                  </button>
                  <span className="text-[9px] font-black text-muted-foreground/40 uppercase tracking-widest italic flex items-center gap-2">
                    <ShieldCheckIcon className="w-3.5 h-3.5" /> 
                  </span>
               </div>

               {aiInsight && (
                 <motion.div 
                   initial={{ opacity: 0, y: 10 }}
                   animate={{ opacity: 1, y: 0 }}
                   className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-6 p-6 bg-background border border-border"
                 >
                   <div>
                     <p className="text-[8px] font-black text-emerald-500 uppercase tracking-widest mb-2">Strengths</p>
                     <p className="text-xs text-foreground/60 leading-relaxed italic">"{aiInsight.strengths}"</p>
                   </div>
                   <div>
                     <p className="text-[8px] font-black text-orange-500 uppercase tracking-widest mb-2">Roadmap</p>
                     <p className="text-xs text-foreground/60 leading-relaxed italic">"{aiInsight.growth}"</p>
                   </div>
                 </motion.div>
               )}
            </div>
          </div>
        </section>

        {/* Today's Tasks */}
        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-1">
              <h2 className="text-2xl font-black uppercase italic flex items-center gap-3">
            {isKids ? '⭐ Today\'s Missions' : 'Today\'s Tasks'}
            <span className="text-emerald-500 text-lg">{isKids ? '🎮' : '🎯'}</span>
          </h2>
            </div>
            <div className="text-[9px] font-black text-muted-foreground uppercase tracking-[0.2em] hidden sm:block">
              Complete all 3 to earn points
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {dailyMissions.map((mission, idx) => (
              <motion.a
                key={mission.id}
                href={mission.href}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.1 }}
                className={`relative group flex flex-col gap-4 p-6 bg-card border border-l-4 ${mission.color} border-border hover:border-l-4 transition-all ${mission.done ? 'opacity-60' : 'hover:scale-[1.01]'}`}
              >
                {mission.done && (
                  <div className="absolute top-3 right-3 w-5 h-5 bg-emerald-500 flex items-center justify-center text-[10px]">✓</div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-3xl">{mission.emoji}</span>
                  <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest px-2 py-1 border border-border">
                    +{mission.xp} XP
                  </span>
                </div>
                <div>
                  <p className="text-sm font-black text-foreground uppercase tracking-tight leading-tight mb-1">
                    {mission.done ? <s className="opacity-50">{mission.label}</s> : mission.label}
                  </p>
                  <p className="text-[10px] text-muted-foreground font-medium leading-relaxed">{mission.desc}</p>
                </div>
              </motion.a>
            ))}
          </div>
        </section>

        {/* XP Level Progress */}
        <section className="bg-card border border-border p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row items-center gap-6">
            <div className="flex items-center gap-5 flex-1">
              <div className={`w-14 h-14 border-2 ${currentLevelConfig.bar.replace('bg-', 'border-')} flex items-center justify-center`}>
                <span className={`text-2xl font-black ${currentLevelConfig.color}`}>
                  {currentLevelConfig.name === 'Bronze' ? '🥉' : currentLevelConfig.name === 'Silver' ? '🥈' : currentLevelConfig.name === 'Gold' ? '🥇' : '💎'}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-2">
                  <p className={`text-[9px] font-black uppercase tracking-[0.4em] ${currentLevelConfig.color}`}>{currentLevelConfig.name} Level</p>
                  {nextLevelConfig && (
                    <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">
                      {nextLevelConfig.name} in {(nextLevelConfig.min - stats.xp).toLocaleString()} XP
                    </p>
                  )}
                </div>
                <div className="h-2 w-full bg-muted/20 overflow-hidden">
                  <motion.div
                    className={`h-full ${currentLevelConfig.bar}`}
                    initial={{ width: 0 }}
                    animate={{ width: `${xpProgress}%` }}
                    transition={{ duration: 1.2, ease: 'easeOut' }}
                  />
                </div>
                <p className="text-[8px] font-black text-muted-foreground uppercase tracking-widest mt-1.5">{stats.xp.toLocaleString()} / {(nextLevelConfig?.min || stats.xp).toLocaleString()} XP</p>
              </div>
            </div>
            {badges.length > 0 && (
              <div className="flex items-center gap-3 shrink-0">
                <p className="text-[8px] font-black text-muted-foreground uppercase tracking-widest mr-1">Badges</p>
                {badges.slice(0, 4).map((badge: any, i: number) => (
                  <div key={i} title={badge.name} className="w-10 h-10 bg-muted/20 border border-border flex items-center justify-center text-xl">
                    {badge.icon_url ? <img src={badge.icon_url} alt={badge.name} className="w-6 h-6" /> : '🏅'}
                  </div>
                ))}
                {badges.length === 0 && <span className="text-[9px] text-muted-foreground font-black">Complete tasks to earn badges</span>}
              </div>
            )}
          </div>
        </section>

        {/* Real Journey Map */}
        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-1">
              <h2 className="text-2xl font-black flex items-center gap-4 uppercase italic">
                {isKids ? '🗺️ My Learning Journey' : 'My Lessons'}
              </h2>
            </div>
            <div className="text-[9px] font-black text-muted-foreground uppercase tracking-[0.2em] hidden sm:block">
              Progress: <span className="text-orange-500">{stats.lessonsDone} lessons completed</span>
            </div>
          </div>

          <div className="relative bg-card border border-border p-8 sm:p-12 overflow-hidden">
            <div className="relative overflow-x-auto pb-8 custom-scrollbar scroll-smooth">
              <div className="flex items-center gap-6 sm:gap-10 min-w-max px-4">
                {lessons.length > 0 ? (
                  lessons.map((lesson, lessonIdx) => {
                    const isCompleted = completedLessonIds.has(lesson.id);
                    const isActive = !isCompleted && (lessonIdx === 0 || completedLessonIds.has(lessons[lessonIdx - 1]?.id));
                    return (
                      <div key={lesson.id} className="flex items-center">
                        {lessonIdx > 0 && (
                          <div className={`h-0.5 w-12 sm:w-20 transition-colors duration-1000 mr-6 sm:mr-10 ${completedLessonIds.has(lessons[lessonIdx - 1]?.id) ? 'bg-orange-600 shadow-[0_0_10px_rgba(234,88,12,0.3)]' : 'bg-muted/20'}`} />
                        )}
                        <motion.a
                          href={`/dashboard/lessons/${lesson.id}`}
                          whileHover={{ scale: 1.05, y: -3 }}
                          className="relative flex flex-col items-center gap-3 group cursor-pointer"
                        >
                          <div className={`w-14 h-14 sm:w-16 sm:h-16 flex items-center justify-center border-2 transition-all duration-300 shadow-lg ${
                            isCompleted
                              ? 'bg-orange-600 border-orange-500 text-foreground shadow-orange-600/30'
                              : isActive
                              ? 'bg-orange-600/10 border-orange-600 text-orange-500 animate-pulse shadow-orange-600/20'
                              : 'bg-muted/30 border-border text-muted-foreground'
                          }`}>
                            {isCompleted ? (
                              <CheckBadgeIcon className="w-8 h-8" />
                            ) : isActive ? (
                              <RocketLaunchIcon className="w-8 h-8" />
                            ) : (
                              <LockClosedIcon className="w-5 h-5" />
                            )}
                            {isActive && (
                              <div className="absolute -top-10 bg-orange-600 text-foreground text-[8px] font-black uppercase px-2.5 py-1.5 whitespace-nowrap tracking-widest shadow-xl">
                                Up Next
                                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 w-2 h-2 bg-orange-600 rotate-45" />
                              </div>
                            )}
                          </div>
                          <div className="text-center max-w-[90px] sm:max-w-[110px]">
                            {(lesson as any).courses?.title && (
                              <p className="text-[7px] font-black uppercase tracking-widest leading-none mb-0.5 text-blue-400/70 truncate w-full text-center">
                                {(lesson as any).courses.title}
                              </p>
                            )}
                            <p className={`text-[8px] font-black uppercase tracking-widest leading-none mb-1 ${isActive ? 'text-orange-500' : isCompleted ? 'text-foreground/50' : 'text-muted-foreground/50'}`}>
                              {lesson.lesson_type || 'Lesson'}
                            </p>
                            <p className={`text-[9px] font-black leading-tight truncate w-full text-center ${isCompleted ? 'line-through text-muted-foreground' : isActive ? 'text-white' : 'text-muted-foreground'}`}>
                              {lesson.title}
                            </p>
                            <p className="text-[8px] text-muted-foreground font-black mt-0.5">+10 XP</p>
                          </div>
                        </motion.a>
                      </div>
                    );
                  })
                ) : (
                  <div className="flex-1 text-center py-16 opacity-30 text-[10px] uppercase font-black tracking-widest min-w-[300px]">
                    {isKids ? '🎒 No lessons yet! Ask your teacher to set up your classes.' : 'No lessons available yet. Enroll in a program to begin.'}
                  </div>
                )}
              </div>
            </div>

            <div className="mt-8 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 sm:gap-6 pt-6 border-t border-border">
              <div className="flex flex-wrap items-center gap-4 sm:gap-6 justify-center sm:justify-start">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-orange-600" />
                  <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Completed</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-orange-600/30 border border-orange-600 animate-pulse" />
                  <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Current</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-muted/20 border border-border" />
                  <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Locked</span>
                </div>
              </div>
              <a
                href={nextLesson ? `/dashboard/lessons/${nextLesson.id}` : '/dashboard/lessons'}
                className="w-full sm:w-auto px-6 sm:px-8 py-3 bg-orange-600 hover:bg-orange-500 text-foreground text-[9px] font-black uppercase tracking-[0.25em] transition-all shadow-lg shadow-orange-600/20 text-center min-h-[48px] flex items-center justify-center"
              >
                {nextLesson ? `Continue: ${nextLesson.title.slice(0, 25)}${nextLesson.title.length > 25 ? '...' : ''}` : 'Browse Lessons'}
              </a>
            </div>
          </div>
        </section>

        {/* Learning Content Sections */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-10">
           
           <div className="xl:col-span-2 space-y-12">
              
              {/* My Programs + Courses */}
              <section className="space-y-8">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-black">{isKids ? '🎒 My Learning Programmes' : isAdult ? 'My Courses & Programmes' : 'My Programs'}</h2>
                  <span className="text-xs text-muted-foreground">{programs.length} enrolled</span>
                </div>

                {programs.length === 0 ? (
                  <div className="py-16 bg-muted/20 border border-dashed border-border text-center">
                    <AcademicCapIcon className="w-10 h-10 mx-auto text-muted-foreground/40 mb-4" />
                    <p className="text-muted-foreground text-sm font-bold">
                      {isKids ? 'No classes yet! Ask your teacher to enrol you 🎉' : 'Not enrolled in any program yet'}
                    </p>
                    <Link href="/dashboard/library" className="mt-4 inline-block text-blue-500 hover:text-foreground text-xs font-bold transition-colors">
                      {isKids ? 'Explore courses 🚀' : 'Browse courses →'}
                    </Link>
                  </div>
                ) : (
                  <div className="space-y-8">
                    {programs.map((prog, pi) => {
                      const courses = coursesByProgram[prog.id] ?? [];
                      const accentColors = [
                        { border: 'border-orange-500', bg: 'bg-orange-500', text: 'text-orange-500', light: 'bg-orange-500/10', bar: 'from-orange-600 to-orange-400' },
                        { border: 'border-blue-500', bg: 'bg-blue-500', text: 'text-blue-500', light: 'bg-blue-500/10', bar: 'from-blue-600 to-blue-400' },
                        { border: 'border-emerald-500', bg: 'bg-emerald-500', text: 'text-emerald-500', light: 'bg-emerald-500/10', bar: 'from-emerald-600 to-emerald-400' },
                        { border: 'border-violet-500', bg: 'bg-violet-500', text: 'text-violet-500', light: 'bg-violet-500/10', bar: 'from-violet-600 to-violet-400' },
                      ];
                      const accent = accentColors[pi % accentColors.length];
                      return (
                        <div key={prog.id} className="bg-card border border-border overflow-hidden">
                          {/* Program header */}
                          <div className={`h-1.5 bg-gradient-to-r ${accent.bar}`} />
                          <div className="p-6 pb-4">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                              <div className="flex items-center gap-4">
                                <div className={`w-12 h-12 ${accent.light} border ${accent.border}/30 flex items-center justify-center flex-shrink-0`}>
                                  <AcademicCapIcon className={`w-6 h-6 ${accent.text}`} />
                                </div>
                                <div>
                                  <h3 className="text-base font-black text-foreground">{prog.name}</h3>
                                  <p className="text-xs text-muted-foreground mt-0.5">
                                    {prog.difficulty_level || 'General'} · {prog.duration_weeks || 12} weeks · {courses.filter(c => (c.lessons?.length ?? 0) > 0).length} active course{courses.filter(c => (c.lessons?.length ?? 0) > 0).length !== 1 ? 's' : ''}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-3 flex-shrink-0">
                                <div className="text-right">
                                  <p className={`text-lg font-black ${accent.text}`}>{prog.progress_pct || 0}%</p>
                                  <p className="text-[9px] text-muted-foreground uppercase tracking-widest">Progress</p>
                                </div>
                                <Link href={`/dashboard/lessons?program=${prog.id}`}
                                  className={`px-4 py-2 ${accent.bg} hover:opacity-90 text-white text-xs font-black uppercase tracking-widest transition-all min-h-[44px] flex items-center justify-center`}>
                                  Continue
                                </Link>
                              </div>
                            </div>
                            {/* Progress bar */}
                            <div className="mt-4 h-1.5 w-full bg-muted/30 overflow-hidden">
                              <div className={`h-full bg-gradient-to-r ${accent.bar} transition-all duration-1000`} style={{ width: `${prog.progress_pct || 0}%` }} />
                            </div>
                          </div>

                          {/* Courses grid — only show courses that have at least 1 lesson */}
                          {courses.length > 0 ? (() => {
                            const activeCourses = courses.filter(c => (c.lessons?.length ?? 0) > 0);
                            return activeCourses.length > 0 ? (
                            <div className="px-6 pb-6">
                              <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-3">
                                {activeCourses.length} active course{activeCourses.length !== 1 ? 's' : ''} in this program
                              </p>
                              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                {activeCourses.map((c, ci) => {
                                  const totalLessons = c.lessons?.length ?? 0;
                                  const doneLessons = (c.lessons ?? []).filter(l => completedLessonIds.has(l.id)).length;
                                  const totalAssignments = c.assignments?.length ?? 0;
                                  const coursePct = totalLessons > 0 ? Math.round((doneLessons / totalLessons) * 100) : 0;
                                  return (
                                    <Link key={c.id} href={`/dashboard/courses/${c.id}`}
                                      className="group flex flex-col gap-3 p-4 bg-background border border-border hover:border-orange-500/40 hover:bg-orange-500/5 transition-all">
                                      {/* Top row: number badge + arrow */}
                                      <div className="flex items-center justify-between gap-2">
                                        <div className={`w-7 h-7 ${accent.light} flex items-center justify-center flex-shrink-0`}>
                                          <span className={`text-xs font-black ${accent.text}`}>{ci + 1}</span>
                                        </div>
                                        <ArrowRightIcon className="w-3.5 h-3.5 text-muted-foreground group-hover:text-orange-500 group-hover:translate-x-0.5 transition-all flex-shrink-0" />
                                      </div>
                                      {/* Title */}
                                      <p className="text-sm font-bold text-foreground group-hover:text-orange-500 transition-colors leading-snug">{c.title}</p>
                                      {/* Stats row */}
                                      <div className="flex items-center gap-3 text-[10px] text-muted-foreground flex-wrap">
                                        {totalLessons > 0 && (
                                          <span className="flex items-center gap-1">
                                            <PlayCircleIcon className="w-3 h-3" />{totalLessons} lesson{totalLessons !== 1 ? 's' : ''}
                                          </span>
                                        )}
                                        {totalAssignments > 0 && (
                                          <span className="flex items-center gap-1">
                                            <ClipboardDocumentListIcon className="w-3 h-3" />{totalAssignments} task{totalAssignments !== 1 ? 's' : ''}
                                          </span>
                                        )}
                                        {c.duration_hours && (
                                          <span className="flex items-center gap-1">
                                            <ClockIcon className="w-3 h-3" />{c.duration_hours}h
                                          </span>
                                        )}
                                      </div>
                                      {/* Per-course progress bar */}
                                      {totalLessons > 0 && (
                                        <div>
                                          <div className="flex justify-between text-[9px] text-muted-foreground mb-1">
                                            <span>{doneLessons}/{totalLessons} lessons done</span>
                                            <span className={coursePct === 100 ? 'text-emerald-500 font-bold' : ''}>{coursePct}%</span>
                                          </div>
                                          <div className="h-1 bg-muted/30 overflow-hidden">
                                            <div
                                              className={`h-full transition-all duration-700 ${coursePct === 100 ? 'bg-emerald-500' : `bg-gradient-to-r ${accent.bar}`}`}
                                              style={{ width: `${coursePct}%` }}
                                            />
                                          </div>
                                        </div>
                                      )}
                                    </Link>
                                  );
                                })}
                              </div>
                            </div>
                            ) : (
                            <div className="px-6 pb-6">
                              <p className="text-xs text-muted-foreground italic">
                                {isKids ? 'Your teacher hasn\'t added lessons yet — check back soon! 🎒' : 'No lessons added to any course in this program yet.'}
                              </p>
                            </div>
                            );
                          })() : (
                            <div className="px-6 pb-6">
                              <p className="text-xs text-muted-foreground italic">
                                {isKids ? 'No classes yet! 🎒' : 'No courses added to this program yet.'}
                              </p>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* Recent Lessons */}
              <section className="space-y-6">
                 <div className="flex items-center justify-between">
                    <div className="flex flex-col gap-1">
                      <h2 className="text-2xl font-black uppercase italic">
                        {isKids ? '📖 Latest Lessons' : isAdult ? 'Recent Content' : 'Recent Lessons'}
                      </h2>
                    </div>
                    <Link href="/dashboard/lessons" className="text-[9px] font-black text-orange-500 hover:text-foreground uppercase tracking-[0.2em] transition-colors">
                      All Lessons →
                    </Link>
                 </div>

                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {lessons.map(lesson => (
                      <Link key={lesson.id} href={`/dashboard/lessons/${lesson.id}`} className="group relative bg-card border border-border p-6 hover:border-orange-500/30 transition-all">
                         <div className="flex justify-between items-start mb-6">
                            <div className="w-10 h-10 bg-orange-600/10 border border-orange-600/20 flex items-center justify-center text-orange-500 group-hover:bg-orange-600 group-hover:text-foreground transition-all duration-300">
                               <PlayIcon className="w-5 h-5 ml-0.5" />
                            </div>
                            <span className="text-[8px] font-black uppercase tracking-widest px-2 py-0.5 border border-border text-muted-foreground">
                               {lesson.lesson_type || 'Lesson'}
                            </span>
                         </div>
                         <h3 className="text-base font-black text-foreground mb-2 leading-tight group-hover:text-orange-500 transition-colors uppercase tracking-tight">{lesson.title}</h3>
                         <div className="flex items-center gap-4 mt-6 pt-4 border-t border-border">
                            <div className="flex flex-col gap-0.5 min-w-0">
                               {(lesson as any).courses?.programs?.name && (
                                 <span className="text-[8px] font-black text-orange-500/60 uppercase tracking-widest truncate max-w-[140px]">{(lesson as any).courses.programs.name}</span>
                               )}
                               <div className="flex items-center gap-1.5">
                                 <AcademicCapIcon className="w-3 h-3 text-blue-400 shrink-0" />
                                 <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest truncate max-w-[130px]">{lesson.courses?.title}</span>
                               </div>
                            </div>
                            <div className="flex items-center gap-1.5 text-[9px] font-black text-muted-foreground ml-auto uppercase shrink-0">
                               <ClockIcon className="w-3.5 h-3.5" /> {lesson.duration_minutes || '45'}M
                            </div>
                         </div>
                      </Link>
                    ))}
                 </div>
              </section>
           </div>

           {/* Dashboard Sidebar: Leaderboard & Progress Hub */}
           <div className="space-y-10">
              
              {/* Profile Overview */}
              <div className="bg-card border border-border p-8 text-center">
                 <div className="relative w-20 h-20 mx-auto mb-6">
                    <div className="absolute inset-0 bg-gradient-to-br from-orange-600 to-orange-400 rotate-6 opacity-30" />
                    <div className="relative w-full h-full bg-background border border-border flex items-center justify-center text-3xl font-black text-foreground">
                       {profile?.full_name?.[0]?.toUpperCase() || '?'}
                    </div>
                 </div>
                 <h3 className="text-lg font-black text-foreground">{profile?.full_name}</h3>
                 <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mt-1">{profile?.school_name || 'Rillcod'}</p>
                 <span className={`inline-flex items-center gap-1 mt-2 px-2.5 py-0.5 rounded-full text-[10px] font-black border ${isKids ? 'bg-violet-500/20 border-violet-500/30 text-violet-400' : isAdult ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400' : 'bg-blue-500/20 border-blue-500/30 text-blue-400'}`}>
                   {isKids ? '🎒' : isAdult ? '🎓' : '📚'}
                   {profile.grade_level || (isKids ? 'Primary' : isAdult ? 'Professional' : 'Secondary')}
                 </span>

                 <div className="grid grid-cols-2 gap-3 mt-8">
                    <div className="p-4 bg-muted/30 border border-border">
                       <p className="text-xl font-black text-foreground">{stats.xp > 1000 ? (stats.xp/1000).toFixed(1) + 'k' : stats.xp}</p>
                       <p className="text-[8px] font-black text-muted-foreground uppercase tracking-widest mt-1">XP</p>
                    </div>
                    <div className="p-4 bg-muted/30 border border-border">
                       <p className="text-xl font-black text-foreground">{stats.lessonsDone}</p>
                       <p className="text-[8px] font-black text-muted-foreground uppercase tracking-widest mt-1">Done</p>
                    </div>
                 </div>
              </div>

              {/* Dynamic Leaderboard Sidebar */}
              <div className="bg-card border border-border p-8">
                 <div className="flex items-center justify-between mb-8">
                    <h3 className="font-black flex items-center gap-3 text-foreground uppercase tracking-tight text-base">
                       <TrophyIcon className="w-5 h-5 text-amber-500" />
                       Leaderboard
                    </h3>
                    <div className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 text-[8px] font-black uppercase tracking-widest border border-emerald-500/20 animate-pulse">Live</div>
                 </div>

                 <div className="space-y-3">
                    {leaderboard.map(member => (
                       <div key={member.name} className={`flex items-center justify-between p-4 border transition-all ${member.isMe ? 'bg-orange-600/10 border-orange-500/20' : 'bg-muted/30 border-border hover:border-border'}`}>
                          <div className="flex items-center gap-3 min-w-0">
                             <div className={`w-8 h-8 flex items-center justify-center text-[10px] font-black text-foreground ${member.rank===1?'bg-amber-500':member.rank===2?'bg-orange-600':'bg-slate-500'}`}>
                                {member.rank}
                             </div>
                             <p className={`text-xs font-black truncate ${member.isMe ? 'text-white' : 'text-foreground/50'}`}>{member.name} {member.isMe && '(You)'}</p>
                          </div>
                          <span className={`text-[10px] font-black tabular-nums ${member.rank===1?'text-amber-500':'text-muted-foreground'}`}>{member.pts.toLocaleString()} XP</span>
                       </div>
                    ))}
                    {leaderboard.length === 0 && (
                      <p className="text-center py-6 text-[10px] text-muted-foreground font-black uppercase tracking-widest">No rankings yet. Be the first!</p>
                    )}
                 </div>

                 <Link href="/dashboard/leaderboard" className="mt-6 block py-3 text-center text-[9px] font-black text-muted-foreground hover:text-foreground uppercase tracking-widest bg-muted/30 border border-border hover:border-border transition-all">
                    View all rankings →
                 </Link>
              </div>

              {/* Action Banner */}
              <div className="relative group bg-gradient-to-br from-[#7a0606] to-[#af0a0a] p-8 text-center overflow-hidden hover:scale-[1.01] transition-transform">
                 <div className="absolute top-0 right-0 w-32 h-32 bg-muted/20 blur-2xl -mr-16 -mt-16 group-hover:scale-150 transition-transform duration-1000" />
                 <BoltIcon className="w-10 h-10 text-foreground mx-auto mb-4 drop-shadow-[0_0_12px_rgba(255,255,255,0.4)]" />
                 <h4 className="text-xl font-black text-foreground mb-2 tracking-tight uppercase italic">
                   {isKids ? '🎮 Code Playground' : 'Coding Playground'}
                 </h4>
                 <p className="text-xs text-foreground/60 mb-6 leading-relaxed font-medium">
                   {isKids
                     ? 'Build cool stuff, try code, and show your teacher what you made! 🚀'
                     : isAdult
                     ? 'Practice real-world coding, experiment with concepts, and build portfolio projects.'
                     : 'Try out code, experiment with ideas, and build small projects in the playground.'}
                 </p>
                 <Link href="/dashboard/playground" className="block w-full py-3 bg-white text-[#7a0606] font-black text-[9px] uppercase tracking-widest shadow-xl transition-all active:scale-95 hover:bg-orange-50">
                    {isKids ? '🚀 Open Playground' : 'Open Playground'}
                 </Link>
              </div>
           </div>

        </div>

      </div>
    </div>
  );
}
