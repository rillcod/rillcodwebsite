// @refresh reset
'use client';

import { useAuth } from '@/contexts/auth-context';
import {
  BookOpenIcon, RocketLaunchIcon,
  SparklesIcon, CheckBadgeIcon,
  ClipboardDocumentListIcon, AcademicCapIcon, ChartBarIcon,
  ArchiveBoxIcon,
} from '@/lib/icons';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { motion } from 'framer-motion';
import StudentEngagementCard from '@/components/dashboard/StudentEngagementCard';
import RecommendedForYou from '@/components/dashboard/RecommendedForYou';
import { RadialRing, GaugeBar, CHART_COLORS } from '@/components/charts';
import {
  loadLessonsForClassPlans,
  nextLessonInClassOrder,
} from '@/lib/learning/lesson-plan-scope';

const LEVEL_COLORS: Record<string, { label: string; emoji: string; bar: string; text: string; border: string }> = {
  Bronze: { label: 'Bronze', emoji: '🥉', bar: 'bg-amber-700', text: 'text-amber-700 dark:text-amber-300', border: 'border-amber-700/40' },
  Silver: { label: 'Silver', emoji: '🥈', bar: 'bg-slate-400', text: 'text-muted-foreground/70', border: 'border-slate-400/40' },
  Gold: { label: 'Gold', emoji: '🥇', bar: 'bg-amber-400', text: 'text-amber-600 dark:text-amber-400', border: 'border-amber-400/40' },
  Platinum: { label: 'Platinum', emoji: '💎', bar: 'bg-cyan-400', text: 'text-cyan-600 dark:text-cyan-400', border: 'border-cyan-400/40' },
  Modern: { label: 'Level', emoji: '⭐', bar: 'bg-primary', text: 'text-primary', border: 'border-primary/40' },
};
const NEXT_THRESHOLD: Record<string, number> = { Bronze: 500, Silver: 2000, Gold: 5000, Platinum: 5000 };
const CUR_THRESHOLD: Record<string, number> = { Bronze: 0, Silver: 500, Gold: 2000, Platinum: 5000 };
const NEXT_LEVEL: Record<string, string> = { Bronze: 'Silver', Silver: 'Gold', Gold: 'Platinum', Platinum: '∞' };

export default function StudentDashboard() {
  const { profile } = useAuth();
  const [data, setData] = useState<{
    xp: number; streak: number; level: string; lessonsDone: number; avgScore: number;
    nextLesson: any; pendingAssignments: number; badges: any[]; leaderboardRank: number | null;
    recentActivity: any[]; isEnrolled: boolean;
    upcomingDue: { id: string; title: string; due_date: string; course: string | null }[];
    overdueDue: { id: string; title: string; due_date: string; course: string | null }[];
    recentGrades: { id: string; title: string; grade: number | null; max_points: number | null; submitted_at: string | null }[];
    lmsSettings: Record<string, string>;
  }>({
    xp: 0, streak: 0, level: 'Bronze', lessonsDone: 0, avgScore: 0,
    nextLesson: null, pendingAssignments: 0, badges: [], leaderboardRank: null, recentActivity: [],
    isEnrolled: false, upcomingDue: [], overdueDue: [], recentGrades: [],
    lmsSettings: {} as Record<string, string>,
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
            lmsSettings: json.lmsSettings || {},
          }));
        }

        // Still fetch dynamic/list data not in basic stats RPC
        const db = createClient();

        // Upcoming/overdue assignments come from the program-scoped API (service-role,
        // applies the same enrollment/program/class visibility as the assignments page) —
        // NOT a raw client query, which would leak other programmes' assignments and was
        // also hiding past-due work via a `.gte('due_date', now)` filter.
        const [assignmentsRes, recentGradesRes, activityRes] = await Promise.allSettled([
          fetch('/api/assignments', { cache: 'no-store' }).then(r => r.ok ? r.json() : { data: [] }),
          db.from('assignment_submissions').select('id, grade, submitted_at, assignments(title, max_points, term_id)')
            .eq('portal_user_id', profile.id).eq('status', 'graded').not('grade', 'is', null)
            .order('submitted_at', { ascending: false }).limit(12),
          db.from('assignment_submissions').select('status, submitted_at, assignments(title, term_id)')
            .eq('portal_user_id', profile.id).order('submitted_at', { ascending: false }).limit(10),
        ]);

        const { resolveAssignmentTermId, filterByAssignmentSession } = await import('@/lib/assignments/session');
        const liveTermId = await resolveAssignmentTermId(db as any, {});
        const recentGradesRaw = recentGradesRes.status === 'fulfilled' ? (recentGradesRes.value.data ?? []) : [];
        const activityRaw = activityRes.status === 'fulfilled' ? (activityRes.value.data ?? []) : [];
        const recentGradesScoped = filterByAssignmentSession(recentGradesRaw as any[], liveTermId).slice(0, 4);
        const activityScoped = filterByAssignmentSession(activityRaw as any[], liveTermId).slice(0, 3);

        // Split scoped assignments into "due soon" vs "overdue" — pending (unsubmitted) only.
        const scopedAssignments = assignmentsRes.status === 'fulfilled' ? (assignmentsRes.value?.data ?? []) : [];
        const nowMs = Date.now();
        const pending = scopedAssignments.filter((a: any) => {
          const sub = (a.assignment_submissions ?? [])[0];
          const status = sub?.status ?? 'missing';
          return status !== 'graded' && status !== 'submitted' && status !== 'pending_review';
        });
        const toCard = (a: any) => ({ id: a.id, title: a.title, due_date: a.due_date, course: a.courses?.title ?? null });
        const upcomingDue = pending
          .filter((a: any) => !a.due_date || new Date(a.due_date).getTime() >= nowMs)
          .sort((x: any, y: any) => new Date(x.due_date ?? 0).getTime() - new Date(y.due_date ?? 0).getTime())
          .slice(0, 5).map(toCard);
        const overdueDue = pending
          .filter((a: any) => a.due_date && new Date(a.due_date).getTime() < nowMs)
          .sort((x: any, y: any) => new Date(y.due_date).getTime() - new Date(x.due_date).getTime())
          .slice(0, 5).map(toCard);

        const scopedAvg = recentGradesScoped.length
          ? Math.round(
              recentGradesScoped.reduce(
                (sum: number, sub: any) => sum + ((Number(sub.grade) || 0) / (Number(sub.assignments?.max_points) || 100)) * 100,
                0,
              ) / recentGradesScoped.length,
            )
          : null;
        const recentGrades = recentGradesScoped;
        const recentActivity = activityScoped.map((s: any) => ({
            title: s.status === 'graded' ? 'Assignment graded' : 'Assignment submitted',
            desc: s.assignments?.title ?? '—',
            time: s.submitted_at,
          }));

        if (scopedAvg != null) {
          setData((prev) => ({ ...prev, avgScore: scopedAvg }));
        }

        // Next lesson is the first unfinished week this class has been shared —
        // the same package as Learning Center, not a catalogue ordered by id.
        let nextLesson = null;
        if (profile.class_id) {
          const { data: done } = await db.from('lesson_progress').select('lesson_id').eq('portal_user_id', profile.id).eq('status', 'completed');
          const doneSet = new Set((done ?? []).map((d: any) => d.lesson_id));
          const scoped = await loadLessonsForClassPlans(db, profile.class_id);
          nextLesson = nextLessonInClassOrder(scoped, doneSet);
        }

        setData(prev => ({
          ...prev,
          upcomingDue,
          overdueDue,
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
  let curThreshold = CUR_THRESHOLD[data.level] ?? 0;
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
        <div key={i} className="h-24 bg-card/90 border border-border/80 animate-pulse rounded-2xl" />
      ))}
    </div>
  );

  // Not enrolled — focused "get started" view
  if (!data.isEnrolled) return (
    <div className="space-y-6 p-4 sm:p-6">
      {/* Greeting */}
      <div className="bg-gradient-to-br from-card to-background border border-border p-6 sm:p-8">
        <h1 className="text-2xl sm:text-3xl font-black text-foreground tracking-tight leading-tight">
          Welcome, <span className="text-primary">{profile?.full_name?.split(' ')?.[0] ?? 'there'}!</span>
        </h1>
        <p className="text-sm text-muted-foreground font-medium mt-2">You're not enrolled in a course yet. Ask your teacher to enrol you, or open the Learning Center to see what is available.</p>
      </div>

      {/* CTA */}
      <Link href="/dashboard/learning"
        className="flex flex-col gap-4 p-6 rounded-2xl bg-primary/10 border border-primary/20 hover:border-primary/40 hover:bg-primary/15 transition-all group shadow-sm">
        <div className="px-2.5 py-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold uppercase tracking-widest w-fit">Learning Center</div>
        <h3 className="text-base font-bold text-foreground tracking-tight group-hover:text-primary transition-colors">View available lessons &amp; coursework</h3>
        <p className="text-xs text-muted-foreground font-medium">Enrollment is managed by your school or administrator. Open the Learning Center to browse available coursework, or use the menu for quick access to your assignments and reports.</p>
        <div className="flex items-center gap-2 text-primary text-xs font-bold uppercase tracking-wider mt-auto">
          <RocketLaunchIcon className="w-4 h-4" /> Open Learning Center →
        </div>
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
              <RocketLaunchIcon className="w-4 h-4 text-primary" />
              Your Next Lesson
            </h2>
            <Link href="/dashboard/learning" className="text-[10px] font-black text-primary uppercase tracking-widest hover:underline">
              Learning Center →
            </Link>
          </div>

          {data.nextLesson ? (
            <Link href={`/dashboard/lessons/${data.nextLesson.id}`}
              className="group flex flex-col gap-5 p-6 sm:p-8 bg-card/90 backdrop-blur-2xl border border-primary/30 hover:border-primary/60 rounded-3xl transition-all relative overflow-hidden shadow-xl hover:shadow-2xl">
              <div className="absolute top-0 right-0 w-48 h-48 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
              <div className="flex items-center justify-between relative z-10">
                <div className="px-3 py-1 bg-brand-red-accent text-white text-[9px] font-black uppercase tracking-widest rounded-full shadow-sm">CONTINUE</div>
                <div className="flex items-center gap-1.5 px-3 py-1 bg-primary/10 border border-primary/20 text-primary text-[10px] font-black uppercase tracking-widest rounded-full">
                  <SparklesIcon className="w-4 h-4 animate-pulse" /> +15 XP
                </div>
              </div>
              <div className="relative z-10">
                <p className="text-[10px] font-black text-primary uppercase tracking-[0.2em] mb-1.5">Up Next</p>
                <h3 className="text-2xl sm:text-3xl lg:text-4xl font-black text-foreground uppercase tracking-tight leading-tight group-hover:text-primary transition-colors">
                  {data.nextLesson.title}
                </h3>
              </div>
              <div className="flex items-center gap-3 relative z-10 pt-2">
                <div className="px-8 py-3 bg-primary group-hover:bg-primary/90 text-primary-foreground text-[11px] font-black uppercase tracking-[0.2em] rounded-xl transition-all shadow-lg shadow-primary/25 active:scale-[0.98]">
                  Resume Now
                </div>
              </div>
            </Link>
          ) : (
            <Link href="/dashboard/learning"
              className="group flex flex-col gap-6 p-10 bg-card/90 backdrop-blur-xl border border-dashed border-border hover:border-primary/40 rounded-3xl transition-all text-center items-center justify-center min-h-[220px] shadow-sm">
              <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center text-3xl">📚</div>
              <div>
                <h3 className="text-lg font-black text-foreground uppercase tracking-tight">Open Learning Center</h3>
                <p className="text-xs text-muted-foreground mt-1">Your teacher has not shared a week with this class yet.</p>
              </div>
              <div className="px-8 py-3 bg-primary text-primary-foreground text-[11px] font-black uppercase tracking-[0.2em] rounded-xl shadow-md">Continue</div>
            </Link>
          )}
        </div>

        {/* Programme Sidebar Card */}
        <div className="space-y-4">
          <h2 className="text-sm font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2 px-1">
            <ArchiveBoxIcon className="w-4 h-4 text-primary" />
            My Programme
          </h2>
          <div className="bg-card/90 backdrop-blur-2xl border border-border/80 rounded-3xl p-6 flex flex-col gap-6 h-[calc(100%-2rem)] shadow-xl">
            <div className="flex-1">
              <div className="flex items-center justify-between mb-4">
                <span className="px-2.5 py-0.5 bg-primary/10 border border-primary/20 text-primary text-[8px] font-black uppercase tracking-widest rounded-full">Enrolled</span>
                <span className="text-[10px] font-black text-muted-foreground">{data.lessonsDone} lessons done</span>
              </div>
              <h4 className="text-lg font-black text-foreground uppercase tracking-tight leading-tight mb-2">
                {profile?.enrollment_type || 'Core Learning'}
              </h4>
              <p className="text-[10px] text-muted-foreground font-medium leading-relaxed">
                Your learning path is kept up to date with the latest Rillcod lessons.
              </p>
            </div>

            {/* Two tiles stood here — Path Progress and Assignments — both already
                Quick Actions on this same page. The Assignments tile carried only a
                dot to say something was pending, while the Overdue and Due Soon
                sections below name the actual work and how late it is. A learner
                reading top to bottom met assignments three times before reaching
                the one place that said what was due. */}
          </div>
        </div>
      </div>

      {/* ── SMART RECOMMENDATIONS ── */}
      <RecommendedForYou />

      {/* ── STATS & PROGRESS SECTION ── */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">

        {/* Profile/Level Card */}
        <div className="lg:col-span-3 bg-card/90 backdrop-blur-2xl border border-border/80 rounded-3xl p-6 sm:p-8 relative overflow-hidden shadow-xl">
          <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 blur-3xl pointer-events-none" />

          <div className="flex flex-col sm:flex-row items-center gap-8">
            {data.lmsSettings.lms_gamification_enabled !== 'false' && (
              <div className="relative shrink-0">
                <div className={`w-20 h-20 border-2 ${levelConf.border} bg-background flex items-center justify-center text-4xl shadow-2xl`}>
                  {levelConf.emoji}
                </div>
                <div className={`absolute -bottom-2 -right-2 px-2 py-1 text-[9px] font-black uppercase tracking-widest ${levelConf.text} bg-card border ${levelConf.border} shadow-lg`}>
                  {levelConf.label}
                </div>
              </div>
            )}

            <div className="flex-1 min-w-0 w-full">
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
                <div>
                  <h2 className="text-xl font-black text-foreground uppercase tracking-tight">Your Progress</h2>
                  <p className="text-[10px] text-muted-foreground font-black uppercase tracking-widest mt-1">
                    {data.lessonsDone} lesson{data.lessonsDone === 1 ? '' : 's'} completed
                  </p>
                </div>
                <div className="flex items-center gap-6">
                  <div className="text-center">
                    <p className="text-2xl font-black text-primary tabular-nums leading-none">{data.streak}</p>
                    <p className="text-[8px] font-black text-muted-foreground uppercase tracking-widest mt-1">Streak</p>
                  </div>
                  {data.lmsSettings.lms_gamification_enabled !== 'false' && (
                    <div className="text-center">
                      <p className="text-2xl font-black text-amber-600 dark:text-amber-400 tabular-nums leading-none">{data.xp.toLocaleString()}</p>
                      <p className="text-[8px] font-black text-muted-foreground uppercase tracking-widest mt-1">XP</p>
                    </div>
                  )}
                  <div className="text-center">
                    <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400 tabular-nums leading-none">{data.avgScore}%</p>
                    <p className="text-[8px] font-black text-muted-foreground uppercase tracking-widest mt-1">Avg</p>
                  </div>
                </div>
              </div>

              <GaugeBar
                value={Math.round(xpPct)}
                label={data.lmsSettings.lms_gamification_enabled !== 'false' 
                  ? `${levelConf.label} · ${data.xp.toLocaleString()} XP${data.level !== 'Platinum' ? ` — ${(nextThreshold - data.xp).toLocaleString()} to ${nextLevelName}` : ' — Max Level!'}`
                  : `Overall Average Score: ${data.avgScore}%`}
                color={data.avgScore >= 75 ? CHART_COLORS.emerald : data.avgScore >= 50 ? CHART_COLORS.amber : CHART_COLORS.primary}
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
              <CheckBadgeIcon className="w-5 h-5 text-emerald-600/50 dark:text-emerald-400/50" />
            </div>
          </div>
          <div className="bg-card border border-border p-4 flex flex-col justify-between">
            <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Badges</p>
            <div className="flex items-end justify-between mt-2">
              <p className="text-2xl font-black text-foreground tabular-nums">{data.badges.length}</p>
              <SparklesIcon className="w-5 h-5 text-amber-600/50 dark:text-amber-400/50" />
            </div>
          </div>
        </div>
      </div>


      {/* AI Lesson Hook */}
      {data.nextLesson && (
        <div className="bg-indigo-600/5 border border-indigo-500/20 p-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 blur-3xl -mr-16 -mt-16" />
          <div className="relative z-10 flex flex-col sm:flex-row items-start gap-6">
            <div className="w-12 h-12 bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center shrink-0 text-indigo-600 dark:text-indigo-400">
              <SparklesIcon className="w-6 h-6" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[9px] font-black text-brand-red-600 uppercase tracking-[0.4em] mb-1">What You&apos;ll Learn Next</p>
              {aiHook ? (
                <div className="space-y-3">
                  <h4 className="text-sm font-black text-foreground uppercase tracking-tight">{aiHook.hook_title}</h4>
                  <p className="text-xs text-muted-foreground leading-relaxed italic">{aiHook.real_world_example}</p>
                  <div className="p-3 bg-indigo-500/5 border border-indigo-500/10">
                    <p className="text-[9px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest mb-1">Think About This</p>
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
                    <p className="text-[10px] text-muted-foreground font-medium mt-0.5">Get an AI-powered preview of what you&apos;ll learn</p>
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

      {/* ── One launcher ──────────────────────────────────────────────────────
          This was three stacked blocks: a tile grid, a full-width Student Hub
          banner, and a card set headed "Everything in one place" — the third
          such block on the screen. Student Hub and My Saved Work each appeared
          in two of them. One grid, each destination once. */}
      <div className="space-y-3">
        <h2 className="px-1 text-sm font-black uppercase tracking-widest text-muted-foreground">
          What to do now
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { href: '/dashboard/learning', icon: BookOpenIcon, label: 'Continue learning', color: 'bg-primary/10 border-primary/20 text-primary hover:border-primary/40' },
            { href: '/dashboard/assignments', icon: ClipboardDocumentListIcon, label: 'My assignments', color: 'bg-cyan-500/10 border-cyan-500/20 text-cyan-600 dark:text-cyan-400 hover:border-cyan-500/40' },
            { href: '/dashboard/cbt', icon: AcademicCapIcon, label: 'CBT Exams', color: 'bg-primary/10 border-primary/20 text-primary hover:border-primary/40' },
            { href: '/dashboard/grades', icon: CheckBadgeIcon, label: 'My grades', color: 'bg-brand-red-600/10 border-brand-red-600/20 text-brand-red-600 dark:text-brand-red-500 hover:border-brand-red-600/40' },
          ].map(({ href, icon: Icon, label, color }) => (
            <Link key={href} href={href}
              className={`group flex flex-col items-center gap-3 p-4 sm:p-5 border transition-all hover:scale-[1.02] ${color}`}>
              <Icon className="w-6 h-6" />
              <span className="text-[9px] font-black uppercase tracking-wider text-center leading-tight">{label}</span>
            </Link>
          ))}
        </div>
      </div>

      {/* Upcoming Due + Recent Grades */}
      {/* Overdue (pending) — full width alert so missed work is never hidden */}
      {data.overdueDue.length > 0 && (
        <div className="bg-rose-500/5 border border-rose-500/20 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[10px] font-black text-rose-600 dark:text-rose-400 uppercase tracking-[0.3em]">
              Overdue — {data.overdueDue.length} pending
            </h3>
            <Link href="/dashboard/assignments" className="text-[9px] font-black text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 uppercase tracking-widest transition-colors">
              Submit Now →
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {data.overdueDue.map((a) => {
              const daysLate = a.due_date ? Math.floor((Date.now() - new Date(a.due_date).getTime()) / (1000 * 60 * 60 * 24)) : 0;
              return (
                <Link key={a.id} href={`/dashboard/assignments/${a.id}`} className="flex items-center gap-3 p-3 bg-background border border-rose-500/20 hover:border-rose-500/40 transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-black text-foreground truncate">{a.title}</p>
                    {a.course && <p className="text-[9px] text-muted-foreground font-medium truncate mt-0.5">{a.course}</p>}
                  </div>
                  <span className="shrink-0 text-[9px] font-black uppercase tracking-widest px-2 py-0.5 border text-rose-600 dark:text-rose-400 bg-rose-500/10 border-rose-500/20">
                    {daysLate <= 0 ? 'Due' : daysLate === 1 ? '1d late' : `${daysLate}d late`}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {(data.upcomingDue.length > 0 || data.recentGrades.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* Upcoming Due Assignments */}
          {data.upcomingDue.length > 0 && (
            <div className="bg-card border border-border p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.3em]">Due Soon</h3>
                <Link href="/dashboard/assignments" className="text-[9px] font-black text-primary hover:text-primary uppercase tracking-widest transition-colors">
                  View All →
                </Link>
              </div>
              <div className="space-y-2">
                {data.upcomingDue.map((a) => {
                  const due = new Date(a.due_date);
                  const daysLeft = Math.ceil((due.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                  const urgency = daysLeft <= 1 ? 'text-rose-600 dark:text-rose-400 bg-rose-500/10 border-rose-500/20'
                    : daysLeft <= 3 ? 'text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/20'
                      : 'text-primary bg-primary/10 border-primary/20';
                  // Opens the assignment itself, the way the overdue rows above
                  // already do. Every row landing on the same list made the due
                  // dates read as decoration.
                  return (
                    <Link key={a.id} href={`/dashboard/assignments/${a.id}`} className="flex items-center gap-3 p-3 bg-background border border-border hover:border-primary/30 transition-colors">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-black text-foreground truncate">{a.title}</p>
                        {a.course && <p className="text-[9px] text-muted-foreground font-medium truncate mt-0.5">{a.course}</p>}
                      </div>
                      <span className={`shrink-0 text-[9px] font-black uppercase tracking-widest px-2 py-0.5 border ${urgency}`}>
                        {daysLeft <= 0 ? 'Today' : daysLeft === 1 ? '1 day' : `${daysLeft}d`}
                      </span>
                    </Link>
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
                {/* Was pointing at Assignments — "View all" under Recent Grades
                    has to open the grades. */}
                <Link href="/dashboard/grades" className="text-[9px] font-black text-primary hover:text-primary uppercase tracking-widest transition-colors">
                  View All →
                </Link>
              </div>
              <div className="space-y-2">
                {data.recentGrades.map((g) => {
                  const pct = g.max_points && g.max_points > 0 && g.grade != null
                    ? Math.min(100, Math.round((g.grade / g.max_points) * 100))
                    : g.grade ?? 0;
                  const color = pct >= 70 ? 'text-emerald-600 dark:text-emerald-400' : pct >= 55 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400';
                  const bar = pct >= 70 ? 'bg-emerald-500' : pct >= 55 ? 'bg-amber-500' : 'bg-rose-500';
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
                <div className="w-8 h-8 bg-primary/10 border border-primary/20 flex items-center justify-center">
                  <ChartBarIcon className="w-4 h-4 text-primary" />
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
