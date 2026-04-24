// @refresh reset
'use client';

import { useAuth } from '@/contexts/auth-context';
import {
  BookOpenIcon, TrophyIcon, StarIcon, RocketLaunchIcon,
  SparklesIcon, FireIcon, BoltIcon, CheckBadgeIcon,
  ClipboardDocumentListIcon, AcademicCapIcon, ChartBarIcon,
  ArchiveBoxIcon, CommandLineIcon, UserGroupIcon, ChatBubbleLeftRightIcon,
  ArrowRightIcon,
} from '@/lib/icons';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { motion } from 'framer-motion';
import StudentEngagementCard from '@/components/dashboard/StudentEngagementCard';
import { RadialRing, GaugeBar, CHART_COLORS } from '@/components/charts';

const LEVEL_COLORS: Record<string, { label: string; emoji: string; bar: string; text: string; border: string }> = {
  Bronze:   { label: 'Bronze',   emoji: '🥉', bar: 'bg-amber-700',  text: 'text-amber-700',  border: 'border-amber-700/40' },
  Silver:   { label: 'Silver',   emoji: '🥈', bar: 'bg-slate-400',  text: 'text-slate-400',  border: 'border-slate-400/40' },
  Gold:     { label: 'Gold',     emoji: '🥇', bar: 'bg-amber-400',  text: 'text-amber-400',  border: 'border-amber-400/40' },
  Platinum: { label: 'Platinum', emoji: '💎', bar: 'bg-cyan-400',   text: 'text-cyan-400',   border: 'border-cyan-400/40' },
  Modern:   { label: 'Level',    emoji: '⭐', bar: 'bg-orange-500', text: 'text-orange-500', border: 'border-orange-500/40' },
};
const NEXT_THRESHOLD: Record<string, number> = { Bronze: 500, Silver: 2000, Gold: 5000, Platinum: 5000 };
const CUR_THRESHOLD:  Record<string, number>  = { Bronze: 0,   Silver: 500,  Gold: 2000, Platinum: 5000 };
const NEXT_LEVEL:     Record<string, string>  = { Bronze: 'Silver', Silver: 'Gold', Gold: 'Platinum', Platinum: '∞' };

export default function StudentDashboard() {
  const { profile } = useAuth();
  const [data, setData] = useState<{
    xp: number; streak: number; level: string; lessonsDone: number; avgScore: number;
    nextLesson: any; pendingAssignments: number; badges: any[]; leaderboardRank: number | null;
    recentActivity: any[]; isEnrolled: boolean;
    upcomingDue: { id: string; title: string; due_date: string; course: string | null }[];
    recentGrades: { id: string; title: string; grade: number | null; max_points: number | null; submitted_at: string | null }[];
  }>({
    xp: 0, streak: 0, level: 'Bronze', lessonsDone: 0, avgScore: 0,
    nextLesson: null, pendingAssignments: 0, badges: [], leaderboardRank: null, recentActivity: [],
    isEnrolled: false, upcomingDue: [], recentGrades: [],
  });
  const [loading, setLoading] = useState(true);
  const [aiHook, setAiHook] = useState<{ hook_title: string; real_world_example: string; challenge_question: string } | null>(null);
  const [loadingHook, setLoadingHook] = useState(false);

  useEffect(() => {
    if (!profile) return;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/dashboard/stats');
        const json = await res.json();
        
        if (json.stats) {
          const s = json.stats;
          setData(prev => ({
            ...prev,
            xp: s.xp || 0,
            streak: s.streak || 0,
            level: s.level || 'Bronze',
            lessonsDone: s.lessonsDone || 0,
            avgScore: s.avgScore || 0,
            pendingAssignments: s.pendingAssignments || 0,
            badges: s.badges || [],
            leaderboardRank: s.leaderboardRank || null,
            isEnrolled: s.enrolledCourses > 0,
          }));
        }

        // Still fetch dynamic/list data not in basic stats RPC
        const db = createClient();
        const now = new Date().toISOString();
        
        const [upcomingRes, recentGradesRes, activityRes, enrollRes] = await Promise.allSettled([
          // Fix: assignments don't have 'status', we just need upcoming ones
          // In a real scenario, we'd filter out already submitted ones via a join or secondary check
          db.from('assignments').select('id, title, due_date, courses(title)')
            .gte('due_date', now).eq('is_active', true).order('due_date', { ascending: true }).limit(5) as any,
          db.from('assignment_submissions').select('id, grade, submitted_at, assignments(title, max_points)')
            .eq('portal_user_id', profile.id).eq('status', 'graded').not('grade', 'is', null)
            .order('submitted_at', { ascending: false }).limit(4),
          db.from('assignment_submissions').select('status, submitted_at, assignments(title)')
            .eq('portal_user_id', profile.id).order('submitted_at', { ascending: false }).limit(3),
          db.from('enrollments').select('program_id, programs(id, name)').eq('user_id', profile.id).limit(1) as any
        ]);

        const upcomingDue = upcomingRes.status === 'fulfilled' ? (upcomingRes.value.data ?? []) : [];
        const recentGrades = recentGradesRes.status === 'fulfilled' ? (recentGradesRes.value.data ?? []) : [];
        const recentActivity = activityRes.status === 'fulfilled' 
          ? (activityRes.value.data ?? []).map((s: any) => ({
              title: s.status === 'graded' ? 'Assignment graded' : 'Assignment submitted',
              desc: s.assignments?.title ?? '—',
              time: s.submitted_at,
            }))
          : [];

        // Next lesson logic
        let nextLesson = null;
        if (enrollRes.status === 'fulfilled' && enrollRes.value.data?.length) {
          const prog = enrollRes.value.data[0]?.programs;
          if (prog?.id) {
            // Mirror the learning-hub visibility rule: only surface
            // courses that are active, not locked (unless flagship)
            // AND have at least one lesson — so the "next lesson"
            // pointer never lands in an empty placeholder course.
            const { data: rawCourses } = await db
              .from('courses')
              .select('id, is_active, is_locked, programs(name), lessons(id), assignments(id)')
              .eq('program_id', prog.id)
              .eq('is_active', true);
            const { isCourseVisibleToLearners } = await import('@/lib/courses/visibility');
            const courses = (rawCourses ?? []).filter((c: any) =>
              isCourseVisibleToLearners(c, { requireContent: true }),
            );
            if (courses?.length) {
              const cIds = courses.map((c: any) => c.id);
              const { data: allLessons } = await db.from('lessons').select('id, title').in('course_id', cIds).eq('status', 'active').order('order_index', { ascending: true }).limit(20);
              const { data: done } = await db.from('lesson_progress').select('lesson_id').eq('portal_user_id', profile.id).eq('status', 'completed');
              const doneSet = new Set((done ?? []).map((d: any) => d.lesson_id));
              nextLesson = (allLessons ?? []).find((l: any) => !doneSet.has(l.id)) || (allLessons ?? [])[0];
            }
          }
        }

        setData(prev => ({
          ...prev,
          upcomingDue: upcomingDue.map((a: any) => ({
            id: a.id,
            title: a.title,
            due_date: a.due_date,
            course: a.courses?.title ?? null,
          })),
          recentGrades: recentGrades.map((s: any) => ({
            id: s.id,
            title: s.assignments?.title ?? '—',
            grade: s.grade,
            max_points: s.assignments?.max_points ?? 100,
            submitted_at: s.submitted_at,
          })),
          recentActivity,
          nextLesson,
        }));

      } catch (err) {
        console.error('Failed to load student dashboard stats:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [profile?.id]);

  let levelConf = LEVEL_COLORS[data.level] ?? LEVEL_COLORS.Bronze;
  let nextThreshold = NEXT_THRESHOLD[data.level] ?? 500;
  let curThreshold  = CUR_THRESHOLD[data.level]  ?? 0;
  let nextLevelName = NEXT_LEVEL[data.level] ?? 'Next Level';

  if (data.level?.startsWith('Level ')) {
    const levelNum = parseInt(data.level.split(' ')[1]) || 1;
    levelConf = { ...LEVEL_COLORS.Modern, label: data.level };
    curThreshold = (levelNum - 1) * 500;
    nextThreshold = levelNum * 500;
    nextLevelName = `Level ${levelNum + 1}`;
  }

  const xpPct = data.level === 'Platinum' ? 100 : Math.min(100, ((data.xp - curThreshold) / (nextThreshold - curThreshold)) * 100);

  const generateHook = async () => {
    if (!data.nextLesson || loadingHook) return;
    setLoadingHook(true);
    try {
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'lesson-hook', topic: data.nextLesson.title, gradeLevel: 'JSS1–SS3' }),
      });
      if (!res.ok) throw new Error('AI hook generation failed');
      const d = await res.json();
      if (d.data) setAiHook(d.data);
    } finally {
      setLoadingHook(false);
    }
  };

  if (loading) return (
    <div className="space-y-4 p-4 sm:p-6">
      {[1, 2, 3].map(i => (
        <div key={i} className="h-24 bg-card border border-border animate-pulse rounded-none" />
      ))}
    </div>
  );

  // Not enrolled — focused "get started" view
  if (!data.isEnrolled) return (
    <div className="space-y-6 p-4 sm:p-6">
      {/* Greeting */}
      <div className="bg-gradient-to-br from-card to-background border border-border p-6 sm:p-8">
        <h1 className="text-2xl sm:text-3xl font-black text-foreground tracking-tight leading-tight">
          Welcome, <span className="text-orange-500">{profile?.full_name?.split(' ')?.[0] ?? 'there'}!</span>
        </h1>
        <p className="text-sm text-muted-foreground font-medium mt-2">You're not enrolled in any course yet. Get started by exploring available programmes below.</p>
      </div>

      {/* CTA */}
      <Link href="/dashboard/learning"
        className="flex flex-col gap-4 p-6 bg-orange-600/10 border border-orange-600/20 hover:border-orange-500/40 hover:bg-orange-600/15 transition-all group">
        <div className="px-2.5 py-1 bg-orange-600 text-white text-[8px] font-black uppercase tracking-widest w-fit">Get Started</div>
        <h3 className="text-base font-black text-foreground uppercase tracking-tight group-hover:text-orange-400 transition-colors">Browse Programmes</h3>
        <p className="text-[10px] text-muted-foreground font-medium">Find a programme to enrol in and start your learning journey.</p>
        <div className="flex items-center gap-2 text-orange-400 text-[9px] font-black uppercase tracking-widest mt-auto">
          <RocketLaunchIcon className="w-4 h-4" /> Explore Now →
        </div>
      </Link>

      {/* Quick Nav */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { href: '/dashboard/learning',     icon: BookOpenIcon,  label: 'Learning Center', color: 'bg-blue-600/10 border-blue-600/20 text-blue-400 hover:border-blue-500/40' },
          { href: '/dashboard/path-progress', icon: ChartBarIcon, label: 'Path Progress', color: 'bg-violet-600/10 border-violet-600/20 text-violet-400 hover:border-violet-500/40' },
          { href: '/dashboard/cbt',          icon: AcademicCapIcon, label: 'Take a Quiz',   color: 'bg-violet-600/10 border-violet-600/20 text-violet-400 hover:border-violet-500/40' },
          { href: '/dashboard/leaderboard',  icon: TrophyIcon,    label: 'Leaderboard',     color: 'bg-amber-600/10 border-amber-600/20 text-amber-400 hover:border-amber-500/40' },
          { href: '/dashboard/activity-hub', icon: SparklesIcon,  label: 'Activity Hub',    color: 'bg-emerald-600/10 border-emerald-600/20 text-emerald-400 hover:border-emerald-500/40' },
          { href: '/dashboard/vault',        icon: ArchiveBoxIcon, label: 'Mission Vault',   color: 'bg-fuchsia-600/10 border-fuchsia-600/20 text-fuchsia-400 hover:border-fuchsia-500/40' },
        ].map(({ href, icon: Icon, label, color }) => (
          <Link key={href} href={href}
            className={`group flex flex-col items-center gap-3 p-4 sm:p-5 border transition-all hover:scale-[1.02] ${color}`}>
            <Icon className="w-6 h-6" />
            <span className="text-[9px] font-black uppercase tracking-wider text-center leading-tight">{label}</span>
          </Link>
        ))}
      </div>

      <Link href="/dashboard/activity-hub"
        className="group flex items-center gap-5 p-5 bg-gradient-to-r from-emerald-600/10 to-teal-600/10 border border-emerald-500/20 hover:border-emerald-500/40 transition-all">
        <div className="w-12 h-12 bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center shrink-0 text-2xl">🚀</div>
        <div className="flex-1 min-w-0">
          <p className="text-[9px] font-black text-emerald-400 uppercase tracking-widest mb-0.5">Student Hub</p>
          <h3 className="text-sm font-black text-foreground group-hover:text-emerald-400 transition-colors">Activity Hub</h3>
          <p className="text-[10px] text-muted-foreground font-medium mt-0.5">Social Hub · Code Vault · Skill Quests · Mastery Protocol</p>
        </div>
        <div className="text-emerald-400 text-[9px] font-black uppercase tracking-widest shrink-0 hidden sm:block">Open →</div>
      </Link>
    </div>
  );

  // Enrolled — full performance dashboard
  return (
    <div className="space-y-6 p-4 sm:p-6">

      {/* ── TOP SECTION: PRIMARY LEARNING ACTIONS ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        
        {/* Next Mission / Learning Hub - BIG CARD */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-sm font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
              <RocketLaunchIcon className="w-4 h-4 text-orange-500" />
              Active Mission
            </h2>
            <Link href="/dashboard/learning" className="text-[10px] font-black text-orange-400 uppercase tracking-widest hover:underline">
              Learning Center →
            </Link>
          </div>

          {data.nextLesson ? (
            <Link href={`/dashboard/lessons/${data.nextLesson.id}`}
              className="group flex flex-col gap-5 p-8 bg-gradient-to-br from-orange-600/10 via-card to-background border border-orange-500/30 hover:border-orange-500/50 transition-all relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-orange-500/5 blur-3xl pointer-events-none" />
              <div className="flex items-center justify-between relative z-10">
                <div className="px-3 py-1 bg-orange-600 text-white text-[9px] font-black uppercase tracking-widest skew-x-[-10deg]">CONTINUE</div>
                <div className="flex items-center gap-1 text-orange-400 text-[10px] font-black uppercase tracking-widest">
                  <SparklesIcon className="w-4 h-4 animate-pulse" /> +15 XP
                </div>
              </div>
              <div className="relative z-10">
                <p className="text-[10px] font-black text-orange-400/70 uppercase tracking-[0.2em] mb-1.5">Current Module</p>
                <h3 className="text-2xl sm:text-3xl font-black text-foreground uppercase tracking-tight leading-none group-hover:text-orange-400 transition-colors">
                  {data.nextLesson.title}
                </h3>
              </div>
              <div className="flex items-center gap-3 relative z-10 pt-2">
                 <div className="px-10 py-3 bg-orange-600 group-hover:bg-orange-500 text-white text-[11px] font-black uppercase tracking-[0.2em] transition-all shadow-lg shadow-orange-950/20">
                    Resume Now
                 </div>
                 <span className="text-[10px] font-bold text-muted-foreground italic">Estimated: 45m</span>
              </div>
            </Link>
          ) : (
            <Link href="/dashboard/learning"
              className="group flex flex-col gap-6 p-10 bg-card border border-dashed border-border hover:border-orange-500/30 transition-all text-center items-center justify-center min-h-[200px]">
              <div className="w-16 h-16 bg-muted/50 rounded-full flex items-center justify-center text-3xl">📚</div>
              <div>
                <h3 className="text-lg font-black text-foreground uppercase tracking-tight">Select a Programme</h3>
                <p className="text-xs text-muted-foreground mt-1">You don't have an active mission. Start one in the Learning Center.</p>
              </div>
              <div className="px-8 py-3 bg-orange-600 text-white text-[11px] font-black uppercase tracking-[0.2em]">Open Catalog</div>
            </Link>
          )}
        </div>

        {/* Programme Sidebar Card */}
        <div className="space-y-4">
          <h2 className="text-sm font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2 px-1">
            <ArchiveBoxIcon className="w-4 h-4 text-blue-500" />
            Enrollment
          </h2>
          <div className="bg-card border border-border p-6 flex flex-col gap-6 h-[calc(100%-2rem)]">
            <div className="flex-1">
              <div className="flex items-center justify-between mb-4">
                <span className="px-2 py-0.5 bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[8px] font-black uppercase tracking-widest">Active Track</span>
                <span className="text-[10px] font-black text-muted-foreground">LVL {data.lessonsDone}</span>
              </div>
              <h4 className="text-lg font-black text-foreground uppercase tracking-tight leading-tight mb-2">
                {profile?.enrollment_type || 'Core Learning'}
              </h4>
              <p className="text-[10px] text-muted-foreground font-medium leading-relaxed">
                Your current learning path is synchronized with the latest Rillcod curriculum.
              </p>
            </div>
            
            <div className="space-y-3 pt-4 border-t border-border">
               <Link href="/dashboard/path-progress" className="flex items-center justify-between p-3 bg-muted/20 border border-border hover:border-blue-500/30 transition-all">
                  <span className="text-[9px] font-black uppercase tracking-widest text-foreground">Detailed Progress</span>
                  <ArrowRightIcon className="w-3.5 h-3.5 text-blue-500" />
               </Link>
               <Link href="/dashboard/assignments" className="flex items-center justify-between p-3 bg-muted/20 border border-border hover:border-rose-500/30 transition-all">
                  <span className="text-[9px] font-black uppercase tracking-widest text-foreground">Tasks & HW</span>
                  <div className="flex items-center gap-2">
                    {data.pendingAssignments > 0 && <span className="w-1.5 h-1.5 bg-rose-500 rounded-full animate-pulse" />}
                    <ArrowRightIcon className="w-3.5 h-3.5 text-rose-500" />
                  </div>
               </Link>
            </div>
          </div>
        </div>
      </div>

      {/* ── STATS & PROGRESS SECTION ── */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        
        {/* Profile/Level Card */}
        <div className="lg:col-span-3 bg-card border border-border p-6 sm:p-8 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-orange-500/5 blur-3xl pointer-events-none" />
          
          <div className="flex flex-col sm:flex-row items-center gap-8">
            <div className="relative shrink-0">
              <div className={`w-20 h-20 border-2 ${levelConf.border} bg-background flex items-center justify-center text-4xl shadow-2xl`}>
                {levelConf.emoji}
              </div>
              <div className={`absolute -bottom-2 -right-2 px-2 py-1 text-[9px] font-black uppercase tracking-widest ${levelConf.text} bg-card border ${levelConf.border} shadow-lg`}>
                {levelConf.label}
              </div>
            </div>

            <div className="flex-1 min-w-0 w-full">
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
                <div>
                  <h2 className="text-xl font-black text-foreground uppercase tracking-tight">Performance Matrix</h2>
                  <p className="text-[10px] text-muted-foreground font-black uppercase tracking-widest mt-1">
                    Global Rank: {data.leaderboardRank ? `#${data.leaderboardRank}` : 'Unranked'}
                  </p>
                </div>
                <div className="flex items-center gap-6">
                  <div className="text-center">
                    <p className="text-2xl font-black text-orange-500 tabular-nums leading-none">{data.streak}</p>
                    <p className="text-[8px] font-black text-muted-foreground uppercase tracking-widest mt-1">Streak</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-black text-amber-500 tabular-nums leading-none">{data.xp.toLocaleString()}</p>
                    <p className="text-[8px] font-black text-muted-foreground uppercase tracking-widest mt-1">XP</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-black text-emerald-500 tabular-nums leading-none">{data.avgScore}%</p>
                    <p className="text-[8px] font-black text-muted-foreground uppercase tracking-widest mt-1">Avg</p>
                  </div>
                </div>
              </div>

              <GaugeBar
                value={Math.round(xpPct)}
                label={`${levelConf.label} · ${data.xp.toLocaleString()} XP${data.level !== 'Platinum' ? ` — ${(nextThreshold - data.xp).toLocaleString()} to ${nextLevelName}` : ' — Max Level!'}`}
                color={data.avgScore >= 75 ? CHART_COLORS.emerald : data.avgScore >= 50 ? CHART_COLORS.amber : CHART_COLORS.orange}
                height={8}
              />
            </div>
          </div>
        </div>

        {/* Quick Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-1 gap-4">
          <div className="bg-card border border-border p-4 flex flex-col justify-between">
            <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Lessons Done</p>
            <div className="flex items-end justify-between mt-2">
              <p className="text-2xl font-black text-foreground tabular-nums">{data.lessonsDone}</p>
              <CheckBadgeIcon className="w-5 h-5 text-emerald-500/50" />
            </div>
          </div>
          <div className="bg-card border border-border p-4 flex flex-col justify-between">
            <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Badges</p>
            <div className="flex items-end justify-between mt-2">
              <p className="text-2xl font-black text-foreground tabular-nums">{data.badges.length}</p>
              <SparklesIcon className="w-5 h-5 text-amber-500/50" />
            </div>
          </div>
        </div>
      </div>


      {/* AI Lesson Hook */}
      {data.nextLesson && (
        <div className="bg-indigo-600/5 border border-indigo-500/20 p-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 blur-3xl -mr-16 -mt-16" />
          <div className="relative z-10 flex flex-col sm:flex-row items-start gap-6">
            <div className="w-12 h-12 bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center shrink-0 text-indigo-400">
              <SparklesIcon className="w-6 h-6" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[9px] font-black text-indigo-500 uppercase tracking-[0.4em] mb-1">AI Lesson Preview</p>
              {aiHook ? (
                <div className="space-y-3">
                  <h4 className="text-sm font-black text-foreground uppercase tracking-tight">{aiHook.hook_title}</h4>
                  <p className="text-xs text-muted-foreground leading-relaxed italic">{aiHook.real_world_example}</p>
                  <div className="p-3 bg-indigo-500/5 border border-indigo-500/10">
                    <p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest mb-1">Challenge Question</p>
                    <p className="text-xs text-foreground font-medium">"{aiHook.challenge_question}"</p>
                  </div>
                  <Link href={`/dashboard/lessons/${data.nextLesson.id}`}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-[9px] font-black uppercase tracking-[0.2em] transition-all">
                    Start This Lesson →
                  </Link>
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-black text-foreground break-words">{data.nextLesson.title}</p>
                    <p className="text-[10px] text-muted-foreground font-medium mt-0.5">Get an AI-powered preview of what you'll learn</p>
                  </div>
                  <button type="button" onClick={generateHook} disabled={loadingHook}
                    className="w-full sm:w-auto shrink-0 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-[9px] font-black uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2">
                    {loadingHook ? <><div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> Loading...</> : '✦ Preview'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Quick Nav Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
        {[
          { href: '/dashboard/learning',     icon: BookOpenIcon,  label: 'Learning Center', color: 'bg-blue-600/10 border-blue-600/20 text-blue-400 hover:border-blue-500/40' },
          { href: '/dashboard/path-progress', icon: ChartBarIcon, label: 'Path Progress', color: 'bg-violet-600/10 border-violet-600/20 text-violet-400 hover:border-violet-500/40' },
          { href: '/dashboard/cbt',          icon: AcademicCapIcon, label: 'Take a Quiz',   color: 'bg-violet-600/10 border-violet-600/20 text-violet-400 hover:border-violet-500/40' },
          { href: '/dashboard/leaderboard',  icon: TrophyIcon,    label: 'Leaderboard',     color: 'bg-amber-600/10 border-amber-600/20 text-amber-400 hover:border-amber-500/40' },
          { href: '/dashboard/activity-hub', icon: SparklesIcon,  label: 'Activity Hub',    color: 'bg-emerald-600/10 border-emerald-600/20 text-emerald-400 hover:border-emerald-500/40' },
          { href: '/dashboard/vault',        icon: ArchiveBoxIcon, label: 'Mission Vault',   color: 'bg-fuchsia-600/10 border-fuchsia-600/20 text-fuchsia-400 hover:border-fuchsia-500/40' },
        ].map(({ href, icon: Icon, label, color }) => (
          <Link key={href} href={href}
            className={`group flex flex-col items-center gap-3 p-4 sm:p-5 border transition-all hover:scale-[1.02] ${color}`}>
            <Icon className="w-6 h-6" />
            <span className="text-[9px] font-black uppercase tracking-wider text-center leading-tight">{label}</span>
          </Link>
        ))}
      </div>

      {/* Activity Hub Feature Banner */}
      <Link href="/dashboard/activity-hub"
        className="group flex items-center gap-5 p-5 bg-gradient-to-r from-emerald-600/10 to-teal-600/10 border border-emerald-500/20 hover:border-emerald-500/40 transition-all">
        <div className="w-12 h-12 bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center shrink-0 text-2xl">
          🚀
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[9px] font-black text-emerald-400 uppercase tracking-widest mb-0.5">Student Hub</p>
          <h3 className="text-sm font-black text-foreground group-hover:text-emerald-400 transition-colors">Activity Hub</h3>
          <p className="text-[10px] text-muted-foreground font-medium mt-0.5">Social Hub · Code Vault · Skill Quests · Mastery Protocol</p>
        </div>
        <div className="text-emerald-400 text-[9px] font-black uppercase tracking-widest shrink-0 hidden sm:block">
          Open →
        </div>
      </Link>

      <div className="bg-card border border-border p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-5">
          <div>
            <p className="text-[9px] font-black text-cyan-400 uppercase tracking-[0.35em]">Student Activity Stack</p>
            <h3 className="text-lg sm:text-xl font-black text-foreground uppercase tracking-tight">Build, Engage, Compete</h3>
          </div>
          <p className="text-[10px] sm:text-xs text-muted-foreground font-medium max-w-xl">
            Your community, missions, protocol track, vault, and collaboration tools now sit directly inside the student dashboard flow.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
          {[
            {
              href: '/dashboard/engage',
              icon: ChatBubbleLeftRightIcon,
              label: 'Community Feed',
              detail: 'Share ideas, code, and peer wins',
              color: 'text-cyan-400 border-cyan-500/20 bg-cyan-500/5 hover:border-cyan-500/40',
            },
            {
              href: '/dashboard/vault',
              icon: ArchiveBoxIcon,
              label: 'Mission Vault',
              detail: 'Keep snippets, notes, and reusable builds',
              color: 'text-fuchsia-400 border-fuchsia-500/20 bg-fuchsia-500/5 hover:border-fuchsia-500/40',
            },
            {
              href: '/dashboard/missions',
              icon: RocketLaunchIcon,
              label: 'Skill Quests',
              detail: 'Practice with structured challenge missions',
              color: 'text-emerald-400 border-emerald-500/20 bg-emerald-500/5 hover:border-emerald-500/40',
            },
            {
              href: '/dashboard/protocol',
              icon: CommandLineIcon,
              label: 'Mastery Protocol',
              detail: 'Follow the guided path to deeper mastery',
              color: 'text-blue-400 border-blue-500/20 bg-blue-500/5 hover:border-blue-500/40',
            },
            {
              href: '/dashboard/study-groups',
              icon: UserGroupIcon,
              label: 'Study Groups',
              detail: 'Find your people and learn together',
              color: 'text-amber-400 border-amber-500/20 bg-amber-500/5 hover:border-amber-500/40',
            },
          ].map(({ href, icon: Icon, label, detail, color }) => (
            <Link
              key={href}
              href={href}
              className={`group flex min-h-[150px] flex-col gap-4 border p-4 transition-all hover:-translate-y-0.5 ${color}`}
            >
              <div className="flex items-center justify-between">
                <Icon className="w-6 h-6" />
                <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground group-hover:text-foreground transition-colors">
                  Open →
                </span>
              </div>
              <div className="space-y-2">
                <h4 className="text-sm font-black uppercase tracking-tight text-foreground">{label}</h4>
                <p className="text-[10px] sm:text-[11px] text-muted-foreground font-medium leading-relaxed">{detail}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Upcoming Due + Recent Grades */}
      {(data.upcomingDue.length > 0 || data.recentGrades.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* Upcoming Due Assignments */}
          {data.upcomingDue.length > 0 && (
            <div className="bg-card border border-border p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.3em]">Due Soon</h3>
                <Link href="/dashboard/assignments" className="text-[9px] font-black text-orange-500 hover:text-orange-400 uppercase tracking-widest transition-colors">
                  View All →
                </Link>
              </div>
              <div className="space-y-2">
                {data.upcomingDue.map((a) => {
                  const due = new Date(a.due_date);
                  const daysLeft = Math.ceil((due.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                  const urgency = daysLeft <= 1 ? 'text-rose-400 bg-rose-500/10 border-rose-500/20'
                                : daysLeft <= 3 ? 'text-amber-400 bg-amber-500/10 border-amber-500/20'
                                : 'text-blue-400 bg-blue-500/10 border-blue-500/20';
                  return (
                    <div key={a.id} className="flex items-center gap-3 p-3 bg-background border border-border">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-black text-foreground truncate">{a.title}</p>
                        {a.course && <p className="text-[9px] text-muted-foreground font-medium truncate mt-0.5">{a.course}</p>}
                      </div>
                      <span className={`shrink-0 text-[9px] font-black uppercase tracking-widest px-2 py-0.5 border ${urgency}`}>
                        {daysLeft <= 0 ? 'Today' : daysLeft === 1 ? '1 day' : `${daysLeft}d`}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Recent Grades */}
          {data.recentGrades.length > 0 && (
            <div className="bg-card border border-border p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.3em]">Recent Grades</h3>
                <Link href="/dashboard/assignments" className="text-[9px] font-black text-orange-500 hover:text-orange-400 uppercase tracking-widest transition-colors">
                  View All →
                </Link>
              </div>
              <div className="space-y-2">
                {data.recentGrades.map((g) => {
                  const pct = g.max_points && g.max_points > 0 && g.grade != null
                    ? Math.min(100, Math.round((g.grade / g.max_points) * 100))
                    : g.grade ?? 0;
                  const color = pct >= 70 ? 'text-emerald-400' : pct >= 55 ? 'text-amber-400' : 'text-rose-400';
                  const bar   = pct >= 70 ? 'bg-emerald-500'   : pct >= 55 ? 'bg-amber-500'   : 'bg-rose-500';
                  return (
                    <div key={g.id} className="p-3 bg-background border border-border">
                      <div className="flex items-center justify-between mb-1.5">
                        <p className="text-xs font-black text-foreground truncate flex-1 mr-3">{g.title}</p>
                        <span className={`shrink-0 text-sm font-black tabular-nums ${color}`}>{pct}%</span>
                      </div>
                      <div className="h-1 bg-muted overflow-hidden">
                        <div className={`h-full ${bar} transition-all`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Recent Activity */}
      {/* ── WAEC Engagement Card ── */}
      {profile?.id && (
        <StudentEngagementCard studentId={profile.id} />
      )}

      {data.recentActivity.length > 0 && (
        <div className="bg-card border border-border p-6">
          <h3 className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.3em] mb-4">Recent Activity</h3>
          <div className="space-y-3">
            {data.recentActivity.map((a, i) => (
              <div key={i} className="flex items-center gap-4 p-3 bg-background border border-border">
                <div className="w-8 h-8 bg-orange-500/10 border border-orange-500/20 flex items-center justify-center">
                  <ChartBarIcon className="w-4 h-4 text-orange-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-black text-foreground uppercase tracking-tight truncate">{a.title}</p>
                  <p className="text-[10px] text-muted-foreground font-medium truncate">{a.desc}</p>
                </div>
                <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest whitespace-nowrap">
                  {a.time ? new Date(a.time).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
