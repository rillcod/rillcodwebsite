// @refresh reset
'use client';

import { useAuth } from '@/contexts/auth-context';
import {
  BookOpenIcon, TrophyIcon, StarIcon, RocketLaunchIcon,
  SparklesIcon, FireIcon, BoltIcon, CheckBadgeIcon,
  ClipboardDocumentListIcon, AcademicCapIcon, ChartBarIcon,
} from '@/lib/icons';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { motion } from 'framer-motion';

const LEVEL_COLORS: Record<string, { label: string; emoji: string; bar: string; text: string; border: string }> = {
  Bronze:   { label: 'Bronze',   emoji: '🥉', bar: 'bg-amber-700',  text: 'text-amber-700',  border: 'border-amber-700/40' },
  Silver:   { label: 'Silver',   emoji: '🥈', bar: 'bg-slate-400',  text: 'text-slate-400',  border: 'border-slate-400/40' },
  Gold:     { label: 'Gold',     emoji: '🥇', bar: 'bg-amber-400',  text: 'text-amber-400',  border: 'border-amber-400/40' },
  Platinum: { label: 'Platinum', emoji: '💎', bar: 'bg-cyan-400',   text: 'text-cyan-400',   border: 'border-cyan-400/40' },
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
  }>({
    xp: 0, streak: 0, level: 'Bronze', lessonsDone: 0, avgScore: 0,
    nextLesson: null, pendingAssignments: 0, badges: [], leaderboardRank: null, recentActivity: [],
    isEnrolled: false,
  });
  const [loading, setLoading] = useState(true);
  const [aiHook, setAiHook] = useState<{ hook_title: string; real_world_example: string; challenge_question: string } | null>(null);
  const [loadingHook, setLoadingHook] = useState(false);

  useEffect(() => {
    if (!profile) return;
    (async () => {
      setLoading(true);
      const db = createClient();
      try {
        const [
          pointsRes, progressRes, subsRes, pendingRes, badgesRes, lbRes, activityRes, enrollRes
        ] = await Promise.allSettled([
          db.from('user_points').select('*').eq('portal_user_id', profile.id).maybeSingle(),
          db.from('lesson_progress').select('id', { count: 'exact', head: true })
            .eq('portal_user_id', profile.id).eq('status', 'completed'),
          db.from('assignment_submissions').select('grade, assignments(max_points)')
            .eq('portal_user_id', profile.id).not('grade', 'is', null).limit(30),
          db.from('assignment_submissions').select('id', { count: 'exact', head: true })
            .eq('portal_user_id', profile.id).eq('status', 'submitted').is('grade', null),
          db.from('user_badges').select('badges(name, description, icon_url)')
            .eq('user_id', profile.id).order('awarded_at', { ascending: false }).limit(4),
          db.from('user_points').select('portal_user_id, total_points')
            .order('total_points', { ascending: false }).limit(100),
          db.from('assignment_submissions').select('status, submitted_at, assignments(title)')
            .eq('portal_user_id', profile.id).order('submitted_at', { ascending: false }).limit(3),
          db.from('enrollments').select('program_id, programs(id, name)').eq('user_id', profile.id).limit(1) as any,
        ]);

        const pts = pointsRes.status === 'fulfilled' ? (pointsRes.value as any).data : null;
        const lessonsDone = progressRes.status === 'fulfilled' ? (progressRes.value.count ?? 0) : 0;
        const subs = subsRes.status === 'fulfilled' ? (subsRes.value.data ?? []) : [];
        const avgScore = subs.length > 0
          ? Math.round(subs.reduce((s: number, sub: any) => s + (sub.grade / (sub.assignments?.max_points || 100)) * 100, 0) / subs.length)
          : 0;
        const pendingAssignments = pendingRes.status === 'fulfilled' ? (pendingRes.value.count ?? 0) : 0;
        const badgesRaw = badgesRes.status === 'fulfilled' ? (badgesRes.value.data ?? []) : [];
        const badges = badgesRaw.map((b: any) => b.badges).filter(Boolean);

        // Leaderboard rank
        let leaderboardRank: number | null = null;
        if (lbRes.status === 'fulfilled') {
          const lbData = lbRes.value.data ?? [];
          const idx = lbData.findIndex((u: any) => u.portal_user_id === profile.id);
          if (idx !== -1) leaderboardRank = idx + 1;
        }

        // Recent activity
        const recentActivity = activityRes.status === 'fulfilled'
          ? (activityRes.value.data ?? []).map((s: any) => ({
              title: s.status === 'graded' ? 'Assignment graded' : 'Assignment submitted',
              desc: s.assignments?.title ?? '—',
              time: s.submitted_at,
            }))
          : [];

        // Next lesson from first enrolled program
        let nextLesson = null;
        if (enrollRes.status === 'fulfilled' && enrollRes.value.data?.length) {
          const prog = enrollRes.value.data[0]?.programs;
          if (prog?.id) {
            const { data: courses } = await db.from('courses').select('id').eq('program_id', prog.id);
            if (courses?.length) {
              const cIds = courses.map((c: any) => c.id);
              const { data: allLessons } = await db.from('lessons').select('id, title').in('course_id', cIds).eq('status', 'active').order('order_index', { ascending: true }).limit(20);
              const { data: done } = await db.from('lesson_progress').select('lesson_id').eq('portal_user_id', profile.id).eq('status', 'completed');
              const doneSet = new Set((done ?? []).map((d: any) => d.lesson_id));
              nextLesson = (allLessons ?? []).find((l: any) => !doneSet.has(l.id)) || (allLessons ?? [])[0];
            }
          }
        }

        const isEnrolled = enrollRes.status === 'fulfilled' && (enrollRes.value.data?.length ?? 0) > 0;

        setData({
          xp: pts?.total_points ?? 0,
          streak: pts?.current_streak ?? 0,
          level: pts?.achievement_level ?? 'Bronze',
          lessonsDone,
          avgScore,
          nextLesson,
          pendingAssignments,
          badges,
          leaderboardRank,
          recentActivity,
          isEnrolled,
        });
      } finally {
        setLoading(false);
      }
    })();
  }, [profile?.id]);

  const levelConf = LEVEL_COLORS[data.level] ?? LEVEL_COLORS.Bronze;
  const nextThreshold = NEXT_THRESHOLD[data.level] ?? 500;
  const curThreshold  = CUR_THRESHOLD[data.level]  ?? 0;
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
          Welcome, <span className="text-orange-500">{profile?.full_name?.split(' ')[0]}!</span>
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
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { href: '/dashboard/learning', icon: BookOpenIcon, label: 'Learning Center', color: 'bg-blue-600/10 border-blue-600/20 text-blue-400 hover:border-blue-500/40' },
          { href: '/dashboard/cbt', icon: AcademicCapIcon, label: 'Take a Quiz', color: 'bg-violet-600/10 border-violet-600/20 text-violet-400 hover:border-violet-500/40' },
          { href: '/dashboard/leaderboard', icon: TrophyIcon, label: 'Leaderboard', color: 'bg-amber-600/10 border-amber-600/20 text-amber-400 hover:border-amber-500/40' },
          { href: '/dashboard/playground', icon: BoltIcon, label: 'Playground', color: 'bg-emerald-600/10 border-emerald-600/20 text-emerald-400 hover:border-emerald-500/40' },
        ].map(({ href, icon: Icon, label, color }) => (
          <Link key={href} href={href}
            className={`group flex flex-col items-center gap-3 p-4 sm:p-5 border transition-all hover:scale-[1.02] ${color}`}>
            <Icon className="w-6 h-6" />
            <span className="text-[9px] font-black uppercase tracking-wider text-center leading-tight">{label}</span>
          </Link>
        ))}
      </div>
    </div>
  );

  // Enrolled — full performance dashboard
  return (
    <div className="space-y-6 p-4 sm:p-6">

      {/* Hero: XP + Streak + Level */}
      <div className="relative overflow-hidden bg-gradient-to-br from-card to-background border border-border p-6 sm:p-8">
        <div className="absolute top-0 right-0 w-64 h-64 bg-orange-500/5 blur-[80px] -mr-32 -mt-32 pointer-events-none" />
        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center gap-6">
          {/* Avatar + Level */}
          <div className="relative shrink-0">
            <div className={`w-16 h-16 border-2 ${levelConf.border} bg-card flex items-center justify-center text-3xl shadow-xl`}>
              {levelConf.emoji}
            </div>
            <div className={`absolute -bottom-1 -right-1 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-widest ${levelConf.text} bg-background border ${levelConf.border}`}>
              {levelConf.label}
            </div>
          </div>

          {/* Greeting + Stats */}
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl sm:text-3xl font-black text-foreground tracking-tight leading-tight">
              Welcome back, <span className="text-orange-500">{profile?.full_name?.split(' ')[0]}!</span>
            </h1>
            <p className="text-xs text-muted-foreground font-medium mt-1">Ready to level up today?</p>

            <div className="flex flex-wrap gap-4 mt-4">
              <div className="flex items-center gap-2">
                <FireIcon className="w-4 h-4 text-orange-500" />
                <span className="text-sm font-black text-foreground">{data.streak}</span>
                <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Day Streak</span>
              </div>
              <div className="flex items-center gap-2">
                <TrophyIcon className="w-4 h-4 text-amber-500" />
                <span className="text-sm font-black text-foreground">{data.xp.toLocaleString()}</span>
                <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">XP</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckBadgeIcon className="w-4 h-4 text-emerald-500" />
                <span className="text-sm font-black text-foreground">{data.lessonsDone}</span>
                <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Lessons Done</span>
              </div>
              {data.leaderboardRank && (
                <div className="flex items-center gap-2">
                  <StarIcon className="w-4 h-4 text-cyan-400" />
                  <span className="text-sm font-black text-foreground">#{data.leaderboardRank}</span>
                  <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Global Rank</span>
                </div>
              )}
            </div>
          </div>

          {/* Score */}
          <div className="shrink-0 text-center p-4 bg-card border border-border shadow-sm min-w-[80px]">
            <p className="text-3xl font-black text-foreground tabular-nums">{data.avgScore}%</p>
            <p className="text-[8px] font-black text-muted-foreground uppercase tracking-widest mt-1">Avg Score</p>
          </div>
        </div>

        {/* XP Progress Bar */}
        <div className="mt-6 relative z-10">
          <div className="flex justify-between text-[9px] font-black text-muted-foreground uppercase tracking-widest mb-1.5">
            <span>{levelConf.label}</span>
            <span>{data.level !== 'Platinum' ? `${(nextThreshold - data.xp).toLocaleString()} XP to ${NEXT_LEVEL[data.level]}` : 'Max Level!'}</span>
          </div>
          <div className="h-1.5 bg-muted overflow-hidden">
            <motion.div
              className={`h-full ${levelConf.bar}`}
              initial={{ width: 0 }}
              animate={{ width: `${xpPct}%` }}
              transition={{ duration: 1.4, ease: 'easeOut' }}
            />
          </div>
        </div>
      </div>

      {/* Next Mission + Smart Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">

        {/* Resume Learning */}
        {data.nextLesson ? (
          <Link href={`/dashboard/lessons/${data.nextLesson.id}`}
            className="group col-span-1 sm:col-span-2 lg:col-span-1 flex flex-col gap-4 p-6 bg-orange-600/10 border border-orange-600/20 hover:border-orange-500/40 hover:bg-orange-600/15 transition-all">
            <div className="flex items-center justify-between">
              <div className="px-2.5 py-1 bg-orange-600 text-white text-[8px] font-black uppercase tracking-widest">Next Up</div>
              <span className="text-[9px] font-black text-orange-400/60 uppercase tracking-widest">+10 XP</span>
            </div>
            <div>
              <p className="text-[9px] font-black text-orange-400/60 uppercase tracking-widest mb-1">Resume Learning</p>
              <h3 className="text-base font-black text-foreground uppercase tracking-tight leading-tight group-hover:text-orange-400 transition-colors line-clamp-2">
                {data.nextLesson.title}
              </h3>
            </div>
            <div className="flex items-center gap-2 text-orange-400 text-[9px] font-black uppercase tracking-widest mt-auto">
              <RocketLaunchIcon className="w-4 h-4" /> Start Lesson →
            </div>
          </Link>
        ) : (
          <Link href="/dashboard/learning"
            className="group col-span-1 sm:col-span-2 lg:col-span-1 flex flex-col gap-4 p-6 bg-blue-600/10 border border-blue-600/20 hover:border-blue-500/40 transition-all">
            <div className="px-2.5 py-1 bg-blue-600 text-white text-[8px] font-black uppercase tracking-widest w-fit">Explore</div>
            <h3 className="text-base font-black text-foreground uppercase tracking-tight">Browse Programs</h3>
            <p className="text-[10px] text-muted-foreground font-medium">Find a program to enroll in and start learning.</p>
          </Link>
        )}

        {/* Pending Assignments */}
        <Link href="/dashboard/assignments"
          className={`group flex flex-col gap-4 p-6 border transition-all hover:scale-[1.01] ${data.pendingAssignments > 0 ? 'bg-rose-500/5 border-rose-500/20 hover:border-rose-500/40' : 'bg-card border-border hover:border-orange-500/20'}`}>
          <div className="flex items-center justify-between">
            <ClipboardDocumentListIcon className={`w-7 h-7 ${data.pendingAssignments > 0 ? 'text-rose-400' : 'text-muted-foreground'}`} />
            {data.pendingAssignments > 0 && (
              <span className="px-2 py-0.5 bg-rose-500 text-white text-[9px] font-black rounded-none animate-pulse">
                {data.pendingAssignments}
              </span>
            )}
          </div>
          <div>
            <p className={`text-2xl font-black tabular-nums ${data.pendingAssignments > 0 ? 'text-rose-400' : 'text-foreground'}`}>
              {data.pendingAssignments}
            </p>
            <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mt-0.5">
              {data.pendingAssignments > 0 ? 'Pending Submission' : 'No Pending Work'}
            </p>
          </div>
        </Link>

        {/* Badges */}
        <div className="group flex flex-col gap-4 p-6 bg-card border border-border">
          <div className="flex items-center justify-between">
            <SparklesIcon className="w-7 h-7 text-amber-500" />
            <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">{data.badges.length} Earned</span>
          </div>
          {data.badges.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {data.badges.slice(0, 4).map((badge: any, i: number) => (
                <div key={i} title={badge.name}
                  className="w-9 h-9 bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-lg">
                  {badge.icon_url ? <img src={badge.icon_url} alt={badge.name} className="w-5 h-5" /> : '🏅'}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[10px] text-muted-foreground font-medium">Complete lessons to earn badges</p>
          )}
          <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mt-auto">Achievements</p>
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
                <div className="flex items-center gap-4">
                  <div>
                    <p className="text-sm font-black text-foreground">{data.nextLesson.title}</p>
                    <p className="text-[10px] text-muted-foreground font-medium mt-0.5">Get an AI-powered preview of what you'll learn</p>
                  </div>
                  <button onClick={generateHook} disabled={loadingHook}
                    className="shrink-0 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-[9px] font-black uppercase tracking-[0.2em] transition-all flex items-center gap-2">
                    {loadingHook ? <><div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> Loading...</> : '✦ Preview'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Quick Nav Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { href: '/dashboard/learning', icon: BookOpenIcon, label: 'Learning Center', color: 'bg-blue-600/10 border-blue-600/20 text-blue-400 hover:border-blue-500/40' },
          { href: '/dashboard/cbt', icon: AcademicCapIcon, label: 'Take a Quiz', color: 'bg-violet-600/10 border-violet-600/20 text-violet-400 hover:border-violet-500/40' },
          { href: '/dashboard/leaderboard', icon: TrophyIcon, label: 'Leaderboard', color: 'bg-amber-600/10 border-amber-600/20 text-amber-400 hover:border-amber-500/40' },
          { href: '/dashboard/playground', icon: BoltIcon, label: 'Playground', color: 'bg-emerald-600/10 border-emerald-600/20 text-emerald-400 hover:border-emerald-500/40' },
        ].map(({ href, icon: Icon, label, color }) => (
          <Link key={href} href={href}
            className={`group flex flex-col items-center gap-3 p-4 sm:p-5 border transition-all hover:scale-[1.02] ${color}`}>
            <Icon className="w-6 h-6" />
            <span className="text-[9px] font-black uppercase tracking-wider text-center leading-tight">{label}</span>
          </Link>
        ))}
      </div>

      {/* Recent Activity */}
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
