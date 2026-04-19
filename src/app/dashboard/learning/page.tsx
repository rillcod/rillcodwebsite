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
        streak: streakRes.data?.current_streak || 0,
        xp: xpRes.data?.total_xp || 0,
        level: xpRes.data?.level || 1
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

      // 4. Fetch Enrollments and Programs (using sequential level enrollments if available)
      const { data: levelEnr } = await db.from('student_level_enrollments')
        .select('*, courses(*, programs(*))')
        .eq('student_id', profile.id)
        .eq('status', 'active');
      
      let enrolledPrograms = [];
      if (levelEnr?.length) {
        enrolledPrograms = levelEnr.map(le => ({
          ...(le.courses?.programs as any || {}),
          status: le.status,
          current_course: le.courses
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

      const pIds = Array.from(new Set(enrolledPrograms.map(p => p.id)));

      // 5. Fetch Courses & Lessons
      if (pIds.length) {
        const { data: rawCourses } = await db.from('courses')
          .select('id, title, description, duration_hours, program_id, lessons(id), assignments(id)')
          .in('program_id', pIds)
          .eq('is_active', true)
          .order('level_order', { ascending: true });
        
        const cmap: Record<string, any[]> = {};
        (rawCourses || []).forEach(c => {
          if (!cmap[c.program_id]) cmap[c.program_id] = [];
          cmap[c.program_id].push(c);
        });
        setCoursesByProgram(cmap);

        const { data: recentLessons } = await db.from('lessons')
          .select('*, courses(title, programs(name))')
          .in('course_id', rawCourses?.map(c => c.id) || [])
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
        
        const doneSet = new Set(completedIds?.map(c => c.lesson_id));
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
            xp: payload.new.total_xp,
            level: payload.new.level
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
            streak: payload.new.current_streak
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
        color: 'border-l-orange-500 bg-orange-400/5 text-orange-400'
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
        color: 'border-l-violet-500 bg-violet-400/5 text-violet-400'
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
    { name: 'Silver', min: 500, max: 1999, color: 'text-slate-400', bar: 'bg-slate-400', bg: 'bg-slate-500/10' },
    { name: 'Gold', min: 2000, max: 4999, color: 'text-amber-400', bar: 'bg-amber-400', bg: 'bg-amber-500/10' },
    { name: 'Platinum', min: 5000, max: 9999, color: 'text-cyan-400', bar: 'bg-cyan-400', bg: 'bg-cyan-500/10' },
  ], []);

  const currentLevelConfig = LEVEL_CONFIG.find(l => stats.xp >= l.min && stats.xp <= l.max) || LEVEL_CONFIG[0];
  const nextLevelConfig = LEVEL_CONFIG[LEVEL_CONFIG.indexOf(currentLevelConfig) + 1];
  const xpProgress = nextLevelConfig
    ? Math.min(100, ((stats.xp - currentLevelConfig.min) / (nextLevelConfig.min - currentLevelConfig.min)) * 100)
    : 100;

  if (authLoading || profileLoading || loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="flex flex-col items-center gap-6">
        <div className="w-12 h-12 border-4 border-orange-600 border-t-transparent animate-spin rounded-full shadow-[0_0_20px_rgba(234,88,12,0.2)]" />
        <p className="text-muted-foreground text-[10px] font-black tracking-[0.4em] uppercase animate-pulse">
           Synchronizing Neural Path...
        </p>
      </div>
    </div>
  );

  if (!profile) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center space-y-4">
        <p className="text-muted-foreground text-sm font-medium">Session expired. Please sign in again.</p>
        <a href="/login" className="inline-block px-6 py-3 bg-orange-600 text-white text-sm font-bold hover:bg-orange-500 transition-colors rounded-lg">
          Sign In
        </a>
      </div>
    </div>
  );

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

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-12">

        {/* Error banner */}
        {loadError && (
          <div className="bg-destructive/10 border border-destructive/30 rounded-none p-4 flex items-center justify-between gap-4">
            <p className="text-destructive text-xs font-bold">{loadError}</p>
            <button onClick={() => { setLoadError(null); loadData(); }}
              className="text-[10px] font-black text-destructive uppercase tracking-widest border border-destructive/40 px-3 py-1 hover:bg-destructive/10 transition-colors flex-shrink-0">
              Retry Sync
            </button>
          </div>
        )}

        {/* Unified Hero Section */}
        <section className={`relative overflow-hidden border p-6 sm:p-10 lg:p-14 group ${isKids ? 'bg-gradient-to-br from-violet-600/10 via-card to-orange-500/10 border-violet-500/30' : 'bg-card border-border'}`}>
          <div className={`absolute top-0 right-0 w-[600px] h-[600px] blur-[150px] -mr-64 -mt-64 pointer-events-none transition-all duration-1000 ${isKids ? 'bg-violet-600/15 group-hover:bg-violet-600/20' : 'bg-orange-600/5 group-hover:bg-orange-600/8'}`} />
          <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-blue-600/5 blur-[120px] -ml-48 -mb-48 pointer-events-none" />

          {/* Learner tier badge */}
          <div className={`relative z-10 inline-flex items-center gap-2 px-3 py-1 rounded-none text-[10px] font-black uppercase tracking-widest mb-4 border ${isKids ? 'bg-violet-500/20 border-violet-500/40 text-violet-400' : isAdult ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400' : 'bg-blue-500/20 border-blue-500/40 text-blue-400'}`}>
            {isKids ? '🎒' : isAdult ? '🎓' : '📚'}
            {profile.grade_level || (isKids ? 'Primary School' : isAdult ? 'Professional Learner' : 'Secondary School')}
          </div>

          <div className="relative z-10 flex flex-col lg:flex-row items-center justify-between gap-8 sm:gap-12">
            <div className="space-y-4 sm:space-y-6 text-center lg:text-left flex-1">
              <h1 className={`font-black tracking-tighter leading-[0.9] italic ${isKids ? 'text-4xl sm:text-6xl' : 'text-4xl sm:text-6xl lg:text-8xl'}`}>
                {greeting},<br />
                <span className={`text-transparent bg-clip-text ${isKids ? 'bg-gradient-to-r from-violet-500 via-pink-500 to-orange-500' : 'bg-gradient-to-r from-orange-600 via-orange-500 to-amber-500'}`}>
                  {profile?.full_name?.split(' ')[0]}!
                </span>
                {isKids && <span className="ml-2 not-italic">🚀</span>}
              </h1>
              <p className="text-sm sm:text-base text-muted-foreground max-w-xl font-medium leading-relaxed">
                {isKids
                  ? 'Your learning adventure is waiting! Complete missions, earn XP, and have fun! 🌟'
                  : isAdult
                  ? 'Professional development at your pace. Tackle missions, assessments, and certifications.'
                  : 'Everything you need for your courses, lessons, and assignments — synchronized and ready.'}
              </p>
              
              <div className="flex flex-col sm:flex-row flex-wrap gap-3 sm:gap-4 pt-4 justify-center lg:justify-start w-full sm:w-auto">
                <div 
                  className="flex items-center gap-4 px-6 py-4 bg-muted/20 border border-border group relative transition-all hover:border-orange-500/30"
                  title="Weekly streak: Active if you complete tasks in a week."
                >
                   <FireIcon className="w-8 h-8 text-orange-600 flex-shrink-0" />
                   <div>
                      <p className="text-3xl font-black tabular-nums leading-none tracking-tighter">{stats.streak}</p>
                      <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mt-1">Week Streak</p>
                   </div>
                </div>
                <div className="flex items-center gap-4 px-6 py-4 bg-muted/20 border border-border transition-all hover:border-emerald-500/30">
                   <TrophyIcon className="w-8 h-8 text-amber-500 flex-shrink-0" />
                   <div>
                      <p className="text-3xl font-black tabular-nums leading-none tracking-tighter">{stats.xp.toLocaleString()}</p>
                      <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mt-1">Total Points</p>
                   </div>
                </div>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-3 sm:gap-4 w-full lg:w-auto">
               <div className={`p-6 sm:p-10 text-center flex flex-col items-center justify-center min-w-0 sm:min-w-[240px] group/card hover:border-blue-500/30 transition-all border ${isKids ? 'bg-blue-500/10 border-blue-500/30' : 'bg-background border-border'}`}>
                  <div className={`w-12 h-12 flex items-center justify-center mb-2 sm:mb-4 transition-transform group-hover/card:scale-110 ${isKids ? 'text-3xl' : 'bg-blue-500/10 border border-blue-500/20 text-blue-400'}`}>
                     {isKids ? '⭐' : <ChartBarIcon className="w-8 h-8" />}
                  </div>
                  <p className="text-3xl sm:text-5xl font-black tabular-nums tracking-tighter">{stats.avgScore}%</p>
                  <p className="text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground mt-2">
                    {isKids ? 'My Grade' : isAdult ? 'Accuracy Avg' : 'Grade Avg'}
                  </p>
               </div>
               <div className={`p-6 sm:p-10 text-center flex flex-col items-center justify-center min-w-0 sm:min-w-[240px] group/card hover:border-emerald-500/30 transition-all border ${isKids ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-background border-border'}`}>
                  <div className={`w-12 h-12 flex items-center justify-center mb-2 sm:mb-4 transition-transform group-hover/card:scale-110 ${isKids ? '🏅' : 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'}`}>
                     <CheckBadgeIcon className="w-8 h-8" />
                  </div>
                  <p className="text-3xl sm:text-5xl font-black tabular-nums tracking-tighter">{stats.lessonsDone}</p>
                  <p className="text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground mt-2">
                    {isKids ? 'Lessons Cleared!' : 'Lessons Done'}
                  </p>
               </div>
            </div>
          </div>
        </section>

        {/* Missions Section */}
        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-black uppercase italic flex items-center gap-3">
              {isKids ? '⭐ Morning Missions' : 'Today\'s Critical Path'}
              <span className="text-orange-500">{isKids ? '🎮' : '🎯'}</span>
            </h2>
            <div className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] hidden sm:block">
              Daily reset in 14 hours
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {dailyMissions.map((mission, idx) => (
              <motion.a
                key={mission.id}
                href={mission.href}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: idx * 0.1 }}
                className={`relative group flex flex-col gap-5 p-6 bg-card border border-l-8 ${mission.color} border-border transition-all ${mission.done ? 'opacity-60 saturate-0' : 'hover:border-orange-500/30 hover:-translate-y-1'}`}
              >
                {mission.done && (
                  <div className="absolute top-4 right-4 w-6 h-6 bg-emerald-500 text-white flex items-center justify-center rounded-full text-xs shadow-lg">✓</div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-4xl filter drop-shadow-md">{mission.emoji}</span>
                  <span className="text-[10px] font-black text-orange-400 uppercase tracking-widest px-3 py-1 border border-orange-500/20 bg-orange-500/5">
                    +{mission.xp} XP
                  </span>
                </div>
                <div>
                  <p className="text-base font-black text-foreground uppercase tracking-tight leading-tight mb-1">
                    {mission.done ? <s className="opacity-50">{mission.label}</s> : mission.label}
                  </p>
                  <p className="text-[11px] text-muted-foreground font-bold leading-relaxed">{mission.desc}</p>
                </div>
              </motion.a>
            ))}
          </div>
        </section>

        {/* XP Level Progress Card */}
        <section className="bg-card border border-border p-8 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-orange-500/5 blur-3xl pointer-events-none" />
          <div className="flex flex-col lg:flex-row items-center gap-8 lg:gap-12">
            <div className="flex items-center gap-6 flex-1 w-full">
              <div className={`w-20 h-20 border-4 ${currentLevelConfig.bar.replace('bg-', 'border-')} flex items-center justify-center shrink-0`}>
                <span className="text-4xl font-black">
                  {currentLevelConfig.name === 'Bronze' ? '🥉' : currentLevelConfig.name === 'Silver' ? '🥈' : currentLevelConfig.name === 'Gold' ? '🥇' : '💎'}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className={`text-xs font-black uppercase tracking-[0.3em] ${currentLevelConfig.color}`}>{currentLevelConfig.name} Protocol</p>
                    <p className="text-[10px] text-muted-foreground font-black uppercase mt-1">Status: Level {stats.level}</p>
                  </div>
                  {nextLevelConfig && (
                    <div className="text-right">
                      <p className="text-[10px] font-black text-foreground uppercase tracking-widest">
                        {nextLevelConfig.name} Gateway
                      </p>
                      <p className="text-[10px] text-muted-foreground font-black tabular-nums">
                        -{(nextLevelConfig.min - stats.xp).toLocaleString()} XP
                      </p>
                    </div>
                  )}
                </div>
                <div className="h-4 w-full bg-muted/20 border border-border overflow-hidden">
                  <motion.div
                    className={`h-full ${currentLevelConfig.bar} shadow-[0_0_15px_rgba(234,88,12,0.3)]`}
                    initial={{ width: 0 }}
                    animate={{ width: `${xpProgress}%` }}
                    transition={{ duration: 1.5, ease: 'circOut' }}
                  />
                </div>
                <div className="flex justify-between mt-2">
                  <p className="text-[9px] font-black text-muted-foreground uppercase tabular-nums">{stats.xp.toLocaleString()} XP ACHIEVED</p>
                  {nextLevelConfig && <p className="text-[9px] font-black text-muted-foreground uppercase tabular-nums">{nextLevelConfig.min.toLocaleString()} XP THRESHOLD</p>}
                </div>
              </div>
            </div>
            
            {badges.length > 0 && (
              <div className="flex flex-col gap-3 shrink-0 w-full lg:w-auto pt-6 lg:pt-0 border-t lg:border-t-0 lg:border-l border-border lg:pl-10">
                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest text-center lg:text-left">Recent Achievements</p>
                <div className="flex flex-wrap items-center gap-3 justify-center lg:justify-start">
                  {badges.map((badge: any, i: number) => (
                    <div key={badge.id} title={badge.badge_label} className="w-12 h-12 bg-muted/20 border border-border flex items-center justify-center text-2xl hover:scale-110 transition-transform cursor-help">
                      {badge.badge_icon || '🏅'}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Journey Map Section */}
        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-black flex items-center gap-4 uppercase italic">
              {isKids ? '🗺️ My Adventure Path' : 'Mission Critical: Lessons'}
            </h2>
            {nextLesson && (
               <Link href={`/dashboard/lessons/${nextLesson.id}`} className="text-[10px] font-black text-orange-400 hover:text-foreground uppercase tracking-[0.2em] transition-colors border-b-2 border-orange-500/20 pb-1">
                 Next Up: {nextLesson.title} →
               </Link>
            )}
          </div>

          <div className="relative bg-card border border-border p-8 lg:p-16 overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-orange-500/[0.03] via-transparent to-transparent pointer-events-none" />
            
            <div className="relative overflow-x-auto pb-12 custom-scrollbar scroll-smooth">
              <div className="flex items-center gap-8 sm:gap-14 min-w-max px-10">
                {lessons.length > 0 ? (
                  lessons.map((lesson, idx) => {
                    const isCompleted = completedLessonIds.has(lesson.id);
                    const isNext = nextLesson?.id === lesson.id;
                    const isLocked = !isCompleted && !isNext;
                    
                    return (
                      <div key={lesson.id} className="flex items-center">
                        {idx > 0 && (
                          <div className={`h-1 w-16 sm:w-28 transition-all duration-1000 mr-8 sm:mr-14 ${completedLessonIds.has(lessons[idx - 1]?.id) ? 'bg-orange-600 shadow-[0_0_15px_rgba(234,88,12,0.4)]' : 'bg-muted/30'}`} />
                        )}
                        <motion.a
                          href={`/dashboard/lessons/${lesson.id}`}
                          whileHover={{ scale: 1.1, y: -5 }}
                          className={`relative flex flex-col items-center gap-4 group cursor-pointer ${isLocked ? 'pointer-events-none' : ''}`}
                        >
                          <div className={`w-16 h-16 sm:w-20 sm:h-20 flex items-center justify-center border-4 transition-all duration-500 relative ${
                            isCompleted
                              ? 'bg-orange-600 border-orange-400 text-white shadow-[0_0_20px_rgba(234,88,12,0.4)]'
                              : isNext
                              ? 'bg-orange-600/10 border-orange-600 text-orange-500 animate-[pulse_2s_infinite] shadow-[0_0_25px_rgba(234,88,12,0.2)]'
                              : 'bg-muted/40 border-border text-muted-foreground/30 saturate-0'
                          }`}>
                            {isCompleted ? <CheckBadgeIcon className="w-10 h-10" /> : isNext ? <RocketLaunchIcon className="w-10 h-10" /> : <LockClosedIcon className="w-6 h-6" />}
                            
                            {isNext && (
                              <div className="absolute -top-12 left-1/2 -translate-x-1/2 bg-orange-600 text-white text-[9px] font-black uppercase px-3 py-2 whitespace-nowrap tracking-widest shadow-2xl skew-x-[-10deg]">
                                ACTIVE SECTOR
                                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 w-3 h-3 bg-orange-600 rotate-45" />
                              </div>
                            )}
                          </div>
                          <div className="text-center max-w-[120px]">
                            <p className={`text-[8px] font-black uppercase tracking-widest leading-none mb-1.5 ${isNext ? 'text-orange-500' : 'text-muted-foreground/60'}`}>
                              {lesson?.courses?.programs?.name?.split(' ')[0] || 'Core'} · {lesson.lesson_type || 'Module'}
                            </p>
                            <p className={`text-xs font-black leading-tight truncate w-full px-1 ${isCompleted ? 'text-muted-foreground' : isNext ? 'text-foreground' : 'text-muted-foreground/40'}`}>
                              {lesson.title}
                            </p>
                            <p className="text-[9px] font-black text-orange-500/60 mt-1 uppercase">+10 XP</p>
                          </div>
                        </motion.a>
                      </div>
                    );
                  })
                ) : (
                  <div className="flex-1 text-center py-20 opacity-30 text-xs uppercase font-black tracking-widest min-w-[400px]">
                     Neural Map Offline — Awaiting Teacher Deployment
                  </div>
                )}
              </div>
            </div>

            <div className="mt-12 flex flex-col sm:flex-row items-center justify-between gap-6 pt-8 border-t border-border">
              <div className="flex flex-wrap items-center gap-8 justify-center sm:justify-start">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 bg-orange-600 shadow-[0_0_10px_rgba(234,88,12,0.4)]" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Synchronized</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 border-2 border-orange-600 animate-pulse" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Neural Active</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 bg-muted/40" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Inaccessible</span>
                </div>
              </div>
              <Link
                href={nextLesson ? `/dashboard/lessons/${nextLesson.id}` : '/dashboard/lessons'}
                className="px-10 py-4 bg-orange-600 hover:bg-orange-500 text-white text-[11px] font-black uppercase tracking-[0.3em] transition-all shadow-[0_0_30px_rgba(234,88,12,0.3)] hover:-translate-y-1 active:translate-y-0"
              >
                {nextLesson ? 'Resume Mission' : 'Browse Modules'}
              </Link>
            </div>
          </div>
        </section>

        {/* Programs Catalog */}
        <section className="space-y-10">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-black uppercase italic">{isKids ? '🎒 My Grimoires' : 'Neural Tracks: Programs'}</h2>
            <span className="text-[11px] font-black text-muted-foreground uppercase tracking-widest">{programs.length} active tracks</span>
          </div>

          <div className="grid grid-cols-1 gap-12">
            {programs.length === 0 ? (
              <div className="py-24 bg-muted/10 border-2 border-dashed border-border text-center flex flex-col items-center">
                <AcademicCapIcon className="w-16 h-16 text-muted-foreground/30 mb-6" />
                <p className="text-muted-foreground text-sm font-black uppercase tracking-widest">
                  {isKids ? 'Empty Backpack! Ask a teacher for books ✨' : 'No active neural tracks detected'}
                </p>
                <Link href="/dashboard/library" className="mt-6 inline-flex items-center gap-2 text-orange-500 hover:text-orange-400 text-xs font-black uppercase tracking-widest transition-all">
                  Browse Archives <ArrowRightIcon className="w-4 h-4" />
                </Link>
              </div>
            ) : (
              programs.map((prog, pi) => {
                const courses = coursesByProgram[prog.id] ?? [];
                const accent = [
                  { border: 'border-orange-500', text: 'text-orange-500', bg: 'bg-orange-500/10', bar: 'bg-orange-600' },
                  { border: 'border-blue-500', text: 'text-blue-500', bg: 'bg-blue-500/10', bar: 'bg-blue-600' },
                  { border: 'border-emerald-500', text: 'text-emerald-500', bg: 'bg-emerald-500/10', bar: 'bg-emerald-600' },
                ][pi % 3];

                return (
                  <div key={prog.id} className="bg-card border border-border group overflow-hidden">
                    <div className="grid grid-cols-1 lg:grid-cols-4">
                      {/* Program Info */}
                      <div className="p-8 lg:p-10 lg:border-r border-border bg-muted/[0.03] space-y-6">
                        <div className={`w-14 h-14 ${accent.bg} border ${accent.border}/30 flex items-center justify-center`}>
                          <AcademicCapIcon className={`w-8 h-8 ${accent.text}`} />
                        </div>
                        <div>
                          <h3 className="text-xl font-black uppercase tracking-tight italic">{prog.name}</h3>
                          <p className="text-xs text-muted-foreground font-bold mt-1 uppercase tracking-widest">
                            {prog.difficulty_level || 'Level 1'} Track · {prog.duration_weeks || 12} Weeks
                          </p>
                        </div>
                        <Link href={`/dashboard/learning/track/${prog.id}`} className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-orange-500 hover:text-orange-400">
                          View Syllabus <ArrowRightIcon className="w-3 h-3" />
                        </Link>
                      </div>

                      {/* Course Grid */}
                      <div className="lg:col-span-3 p-8 lg:p-10 bg-card">
                        <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] mb-8">Active Modules in this Track</p>
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                          {courses.map((c) => {
                            const total = c.lessons?.length || 0;
                            const done = (c.lessons || []).filter(l => completedLessonIds.has(l.id)).length;
                            const pct = total > 0 ? Math.round((done/total)*100) : 0;
                            
                            return (
                              <Link key={c.id} href={`/dashboard/courses/${c.id}`} className="p-5 bg-background border border-border hover:border-orange-500/30 transition-all flex flex-col gap-4">
                                <div className="flex justify-between items-start">
                                   <p className="text-sm font-black italic uppercase leading-none tracking-tight">{c.title}</p>
                                   <div className={`px-2 py-1 ${pct === 100 ? 'bg-emerald-500/10 text-emerald-500' : 'bg-muted text-muted-foreground'} text-[8px] font-black uppercase`}>
                                      {pct === 100 ? 'CLEARED' : `${pct}%`}
                                   </div>
                                </div>
                                <div className="space-y-2">
                                  <div className="h-1 w-full bg-muted/30">
                                    <div className={`h-full transition-all duration-1000 ${pct === 100 ? 'bg-emerald-500' : accent.bar}`} style={{ width: `${pct}%` }} />
                                  </div>
                                  <div className="flex justify-between text-[8px] font-black text-muted-foreground uppercase">
                                    <span>{done}/{total} Modules</span>
                                    <span>{c.duration_hours || 0} Hours</span>
                                  </div>
                                </div>
                              </Link>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

      </div>
    </div>
  );
}
