// @refresh reset
'use client';

import { useAuth } from '@/contexts/auth-context';
import {
  BookOpenIcon, RocketLaunchIcon,
  SparklesIcon, CheckBadgeIcon,
  ClipboardDocumentListIcon, AcademicCapIcon, ChartBarIcon, ClockIcon, LockClosedIcon, ShieldCheckIcon,
} from '@/lib/icons';
import Link from 'next/link';
import { learnerSubmissionState } from '@/lib/assignments/learner-state';
import { fetchActionJson } from '@/lib/async-timeout';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { motion } from 'framer-motion';
import StudentEngagementCard from '@/components/dashboard/StudentEngagementCard';
import { RadialRing, GaugeBar, CHART_COLORS } from '@/components/charts';
import {
  loadLearnerClassWeek,
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
  const studentId = profile?.id;
  const classId = profile?.class_id;
  const [data, setData] = useState<{
    xp: number; streak: number; level: string; lessonsDone: number; avgScore: number;
    nextLesson: any; thisWeekNumber: number | null; pendingAssignments: number; badges: any[]; leaderboardRank: number | null;
    recentActivity: any[]; isEnrolled: boolean;
    upcomingDue: { id: string; title: string; due_date: string; course: string | null }[];
    overdueDue: { id: string; title: string; due_date: string; course: string | null }[];
    recentGrades: { id: string; title: string; grade: number | null; max_points: number | null; submitted_at: string | null }[];
    cbtExams: Array<{
      id: string;
      title: string;
      duration_minutes: number | null;
      total_questions: number | null;
      start_date: string | null;
      end_date: string | null;
      session_status: string | null;
      session_score: number | null;
    }>;
    priorityMaterials: Array<{
      id: string;
      title: string;
      isProtected: boolean;
      fileType: string | null;
      lessonId: string;
      lessonTitle: string;
      examTitle: string | null;
    }>;
    examLock: { locked: boolean; examTitle?: string };
    lmsSettings: Record<string, string>;
  }>({
    xp: 0, streak: 0, level: 'Bronze', lessonsDone: 0, avgScore: 0,
    nextLesson: null, thisWeekNumber: null, pendingAssignments: 0, badges: [], leaderboardRank: null, recentActivity: [],
    isEnrolled: false, upcomingDue: [], overdueDue: [], recentGrades: [], cbtExams: [],
    priorityMaterials: [], examLock: { locked: false },
    lmsSettings: {} as Record<string, string>,
  });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (!studentId) return;
    let active = true;
    const controller = new AbortController();
    const updateData: typeof setData = value => { if (active) setData(value); };
    (async () => {
      setLoading(true);
      setLoadError(false);
      try {
        const { response: res, data: json } = await fetchActionJson<any>('/api/dashboard/stats', { cache: 'no-store', signal: controller.signal }, 'Your summary is taking longer than expected.', 20_000);
        if (!res.ok || !json.stats) throw new Error('Student summary unavailable');
        if (!active) return;

        if (json.stats) {
          const s = json.stats;
          updateData(prev => ({
            ...prev,
            xp: s.xp || 0,
            streak: s.streak || 0,
            level: s.level || 'Bronze',
            lessonsDone: s.lessonsDone || 0,
            avgScore: s.avgScore || 0,
            pendingAssignments: s.pendingAssignments || 0,
            badges: s.badges || [],
            leaderboardRank: s.leaderboardRank || null,
            isEnrolled: Boolean(classId) || s.enrolledCourses > 0,
            lmsSettings: json.lmsSettings || {},
          }));
        }

        // Still fetch dynamic/list data not in basic stats RPC
        const db = createClient();

        // Upcoming/overdue assignments come from the program-scoped API (service-role,
        // applies the same enrollment/program/class visibility as the assignments page) —
        // NOT a raw client query, which would leak other programmes' assignments and was
        // also hiding past-due work via a `.gte('due_date', now)` filter.
        const [assignmentsRes, recentGradesRes, activityRes, cbtExamsRes, cbtSessionsRes, priorityMaterialsRes] = await Promise.allSettled([
          fetchActionJson<any>('/api/assignments', { cache: 'no-store', signal: controller.signal }, 'Your assignments are taking longer than expected.', 20_000)
            .then(({ response, data }) => { if (!response.ok || !Array.isArray(data.data)) throw new Error('Assignments unavailable'); return data; }),
          db.from('assignment_submissions').select('id, grade, submitted_at, assignments(title, max_points, term_id)')
            .eq('portal_user_id', studentId).eq('status', 'graded').not('grade', 'is', null)
            .order('submitted_at', { ascending: false }).limit(12),
          db.from('assignment_submissions').select('status, submitted_at, assignments(title, term_id)')
            .eq('portal_user_id', studentId).order('submitted_at', { ascending: false }).limit(10),
          fetch('/api/cbt/exams', { cache: 'no-store', signal: controller.signal }).then((r) => (r.ok ? r.json() : { data: [] })),
          fetch('/api/cbt/sessions', { cache: 'no-store', signal: controller.signal }).then((r) => (r.ok ? r.json() : { data: [] })),
          fetch('/api/learning/priority-materials', { cache: 'no-store', signal: controller.signal }).then((r) => (r.ok ? r.json() : { materials: [], examLock: { locked: false } })),
        ]);
        if (!active) return;
        if (assignmentsRes.status === 'rejected') throw new Error('Assignments unavailable');

        const rawExams: any[] = cbtExamsRes.status === 'fulfilled' && Array.isArray(cbtExamsRes.value?.data) ? cbtExamsRes.value.data : [];
        const rawSessions: any[] = cbtSessionsRes.status === 'fulfilled' && Array.isArray(cbtSessionsRes.value?.data) ? cbtSessionsRes.value.data : [];
        const sessionByExam = new Map<string, any>();
        for (const ses of rawSessions) {
          if (ses?.exam_id && !sessionByExam.has(ses.exam_id)) sessionByExam.set(ses.exam_id, ses);
        }
        const nowForExam = Date.now();
        const cbtExams = rawExams
          .filter((e: any) => e && e.is_active !== false)
          .filter((e: any) => !e.end_date || new Date(e.end_date).getTime() >= nowForExam || sessionByExam.has(e.id))
          .map((e: any) => {
            const ses = sessionByExam.get(e.id);
            return {
              id: e.id,
              title: e.title || 'CBT Examination',
              duration_minutes: e.duration_minutes ?? null,
              total_questions: e.total_questions ?? (Array.isArray(e.cbt_questions) ? e.cbt_questions.length : null),
              start_date: e.start_date ?? null,
              end_date: e.end_date ?? null,
              session_status: ses?.status ?? null,
              session_score: typeof ses?.score === 'number' ? ses.score : null,
            };
          })
          .sort((a, b) => {
            const rank = (x: typeof a) => (x.session_status === 'in_progress' ? 0 : !x.session_status ? 1 : 2);
            return rank(a) - rank(b);
          })
          .slice(0, 4);

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
          return learnerSubmissionState(status) === 'action';
        });
        const toCard = (a: any) => ({ id: a.id, title: a.title, due_date: a.due_date, course: a.courses?.title ?? null });
        const upcomingDue = pending
          .filter((a: any) => !a.due_date || new Date(a.due_date).getTime() >= nowMs)
          .sort((x: any, y: any) => (x.due_date ? Date.parse(x.due_date) : Infinity) - (y.due_date ? Date.parse(y.due_date) : Infinity))
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
          updateData((prev) => ({ ...prev, avgScore: scopedAvg }));
        }

        // Next lesson is the first unfinished week this class has been shared —
        // the same package as Learning Center, not a catalogue ordered by id.
        let nextLesson = null;
        let thisWeekNumber: number | null = null;
        if (classId) {
          const { data: done } = await db.from('lesson_progress').select('lesson_id').eq('portal_user_id', studentId).eq('status', 'completed');
          const doneSet = new Set((done ?? []).map((d: any) => d.lesson_id));
          const pack = await loadLearnerClassWeek(db, classId);
          thisWeekNumber = pack.week;
          nextLesson = nextLessonInClassOrder(pack.thisWeekLessons, doneSet);
        }

        const priorityMatPayload = priorityMaterialsRes.status === 'fulfilled'
          ? priorityMaterialsRes.value
          : { materials: [], examLock: { locked: false } };

        updateData(prev => ({
          ...prev,
          priorityMaterials: Array.isArray(priorityMatPayload?.materials) ? priorityMatPayload.materials : [],
          examLock: priorityMatPayload?.examLock?.locked ? priorityMatPayload.examLock : { locked: false },
          upcomingDue,
          pendingAssignments: pending.length,
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
          thisWeekNumber,
          cbtExams,
        }));

      } catch (err) {
        if (!active) return;
        setLoadError(true);
        console.error('Failed to load student dashboard stats:', err);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; controller.abort(); };
  }, [studentId, classId, retryKey]);

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

  if (loading) return (
    <div className="space-y-4 p-4 sm:p-6">
      {[1, 2, 3].map(i => (
        <div key={i} className="h-24 bg-card/90 border border-border/80 animate-pulse rounded-2xl" />
      ))}
    </div>
  );

  if (loadError) return (
    <div role="alert" className="m-4 rounded-2xl border border-border bg-card p-5 space-y-3">
      <h2 className="font-semibold">Your learning summary could not be loaded</h2>
      <div className="flex flex-wrap gap-3">
        <button onClick={() => setRetryKey(v => v + 1)} className="min-h-11 rounded-lg bg-primary px-4 text-primary-foreground">Try again</button>
        <Link href="/dashboard/assignments" className="min-h-11 inline-flex items-center px-4 border border-border rounded-lg">My assignments</Link>
      </div>
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
        <p className="text-sm text-muted-foreground font-medium mt-2">Ask your teacher to add you to your class.</p>
      </div>

      {/* CTA */}
      <Link href="/dashboard/learning"
        className="flex flex-col gap-4 p-6 rounded-2xl bg-primary/10 border border-primary/20 hover:border-primary/40 hover:bg-primary/15 transition-all group shadow-sm">
        <div className="px-2.5 py-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold uppercase tracking-widest w-fit">Learning Center</div>
        <h3 className="text-base font-bold text-foreground tracking-tight group-hover:text-primary transition-colors">View available lessons &amp; coursework</h3>
        <div className="flex items-center gap-2 text-primary text-xs font-bold uppercase tracking-wider mt-auto">
          <RocketLaunchIcon className="w-4 h-4" /> Open Learning Center →
        </div>
      </Link>
    </div>
  );

  // Enrolled — full performance dashboard
  const readyExams = data.cbtExams.filter((e) => !e.session_status || e.session_status === 'in_progress');

  return (
    <div className="space-y-6 p-4 sm:p-6">

      {/* ── DIRECT ACCESS: ACTIVE EXAMINATIONS (1-CLICK START / RESUME) ── */}
      {data.cbtExams.length > 0 && (
        <section className="rounded-3xl border border-emerald-500/35 bg-card p-5 sm:p-6 shadow-lg space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300">
                <AcademicCapIcon className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-black tracking-tight text-foreground">
                  {readyExams.length > 0 ? 'Examinations Ready to Take' : 'Your Recent Examinations'}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {readyExams.length > 0
                    ? 'Tap Start or Resume below to enter your exam immediately — answers auto-save as you go.'
                    : 'View your completed exam results and answer reviews.'}
                </p>
              </div>
            </div>
            <Link
              href="/dashboard/cbt"
              className="text-xs font-black text-primary hover:underline shrink-0"
            >
              All Exams →
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {data.cbtExams.map((exam) => {
              const isInProgress = exam.session_status === 'in_progress';
              const isCompleted = !!exam.session_status && !isInProgress;
              const startsAtMs = exam.start_date ? new Date(exam.start_date).getTime() : null;
              const notYetOpen = !isInProgress && !isCompleted && startsAtMs !== null && Number.isFinite(startsAtMs) && Date.now() < startsAtMs;
              const actionHref = isCompleted || notYetOpen
                ? `/dashboard/cbt/${exam.id}`
                : `/dashboard/cbt/${exam.id}/take`;
              return (
                <div
                  key={exam.id}
                  className={`flex flex-col justify-between gap-3 rounded-2xl border p-4 transition-all ${
                    isInProgress
                      ? 'border-amber-500/45 bg-amber-500/5'
                      : !isCompleted && !notYetOpen
                        ? 'border-emerald-500/35 bg-emerald-500/5 hover:border-emerald-500/60'
                        : 'border-border bg-background'
                  }`}
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider ${
                        isInProgress
                          ? 'bg-amber-500/15 text-amber-800 dark:text-amber-200 border border-amber-500/35'
                          : isCompleted
                            ? 'bg-muted text-muted-foreground border border-border'
                            : notYetOpen
                              ? 'bg-primary/10 text-primary border border-primary/25'
                              : 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-200 border border-emerald-500/35'
                      }`}>
                        {isInProgress ? 'In Progress' : isCompleted ? (exam.session_status === 'pending_grading' ? 'Pending Grading' : `Completed · ${exam.session_score ?? 0}%`) : notYetOpen ? 'Scheduled' : 'Live Now'}
                      </span>
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">
                        <ClockIcon className="h-3.5 w-3.5" />
                        {exam.duration_minutes ?? 60} min
                        {exam.total_questions ? ` · ${exam.total_questions} Qs` : ''}
                      </span>
                    </div>
                    <h3 className="text-sm sm:text-base font-black text-foreground leading-snug line-clamp-2">
                      {exam.title}
                    </h3>
                    {notYetOpen && startsAtMs && (
                      <p className="text-[11px] font-semibold text-primary">
                        Opens {new Date(startsAtMs).toLocaleString()}
                      </p>
                    )}
                  </div>
                  <Link
                    href={actionHref}
                    className={`inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-4 py-2 text-xs font-black transition-all shadow-sm ${
                      isInProgress
                        ? 'bg-amber-700 hover:bg-amber-800 text-white'
                        : isCompleted || notYetOpen
                          ? 'border border-border bg-card text-foreground hover:bg-muted'
                          : 'bg-emerald-700 hover:bg-emerald-800 text-white'
                    }`}
                  >
                    {isInProgress ? 'Resume Exam Now →' : isCompleted ? 'View Result & Review →' : notYetOpen ? 'View Exam Details' : 'Start Exam Now →'}
                  </Link>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── PRIORITY EXAM STUDY MATERIALS (Same top-level preference as Exams) ── */}
      {data.priorityMaterials.length > 0 && (
        <section
          aria-label="Priority exam study materials"
          className="rounded-3xl border border-emerald-500/30 bg-card p-5 sm:p-6 shadow-sm space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-700 text-white shadow-sm">
                <BookOpenIcon className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-sm sm:text-base font-black text-foreground flex flex-wrap items-center gap-2">
                  Priority Exam Study Materials
                  <span className="rounded-full bg-emerald-700 px-2 py-0.5 text-[10px] font-black text-white">
                    {data.priorityMaterials.length}
                  </span>
                </h2>
                <p className="text-xs text-muted-foreground">
                  {data.examLock.locked
                    ? `Locked during active exam (${data.examLock.examTitle || 'Exam in progress'}) — unlocks automatically when the exam ends.`
                    : 'Pushed by your teacher to help you prepare — view inline before your exam begins.'}
                </p>
              </div>
            </div>
            <Link
              href="/dashboard/learning"
              className="text-xs font-black text-primary hover:underline shrink-0"
            >
              Learning Hub →
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {data.priorityMaterials.map((mat) => (
              <div
                key={mat.id}
                className={`flex flex-col justify-between gap-3 rounded-2xl border p-4 transition-all ${
                  data.examLock.locked
                    ? 'border-amber-500/35 bg-amber-500/5 opacity-85'
                    : 'border-emerald-500/30 bg-emerald-500/[0.04] hover:border-emerald-500/60'
                }`}
              >
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="inline-flex items-center rounded-full bg-emerald-700 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-white">
                      Priority Prep
                    </span>
                    {mat.isProtected && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-black text-primary">
                        <ShieldCheckIcon className="h-3 w-3" /> Protected Screen
                      </span>
                    )}
                    {mat.examTitle && (
                      <span className="truncate max-w-[180px] rounded-full border border-border bg-card px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
                        For: {mat.examTitle}
                      </span>
                    )}
                  </div>
                  <h3 className="text-sm font-black text-foreground leading-snug line-clamp-2">
                    {mat.title}
                  </h3>
                  <p className="text-[11px] font-semibold text-muted-foreground truncate">
                    Lesson: {mat.lessonTitle}
                  </p>
                </div>

                {data.examLock.locked ? (
                  <div className="inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-xs font-black text-amber-800 dark:text-amber-200">
                    <LockClosedIcon className="h-3.5 w-3.5" />
                    Locked During Live Exam
                  </div>
                ) : (
                  <Link
                    href={`/dashboard/lessons/${mat.lessonId}`}
                    className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 px-4 py-2 text-xs font-black text-white shadow-sm transition-colors"
                  >
                    Open Study Material →
                  </Link>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── TOP SECTION: PRIMARY LEARNING ACTIONS ── */}
      <div className="grid grid-cols-1 gap-4">

        {/* Next Mission / Learning Hub - BIG CARD */}
        <div className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-sm font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
              <RocketLaunchIcon className="w-4 h-4 text-primary" />
              {data.thisWeekNumber ? `This week · Week ${data.thisWeekNumber}` : 'This week'}
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
                <div className="px-3 py-1 bg-brand-red-accent text-white text-[9px] font-black uppercase tracking-widest rounded-full shadow-sm">THIS WEEK</div>
              </div>
              <div className="relative z-10">
                <p className="text-[10px] font-black text-primary uppercase tracking-[0.2em] mb-1.5">Your class this week</p>
                <h3 className="text-2xl sm:text-3xl lg:text-4xl font-black text-foreground uppercase tracking-tight leading-tight group-hover:text-primary transition-colors">
                  {data.nextLesson.title}
                </h3>
              </div>
              <div className="flex items-center gap-3 relative z-10 pt-2">
                <div className="px-8 py-3 bg-primary group-hover:bg-primary/90 text-primary-foreground text-[11px] font-black uppercase tracking-[0.2em] rounded-xl transition-all shadow-lg shadow-primary/25 active:scale-[0.98]">
                  Open this week
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
      </div>

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
                        {!a.due_date ? 'No deadline' : daysLeft <= 0 ? 'Today' : daysLeft === 1 ? '1 day' : `${daysLeft}d`}
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
