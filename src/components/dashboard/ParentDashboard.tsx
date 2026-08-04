'use client';

import { useEffect, useState } from 'react';
import {
  UserGroupIcon, DocumentChartBarIcon, ClipboardDocumentCheckIcon,
  ArrowRightIcon, ArrowPathIcon, AcademicCapIcon, EnvelopeIcon,
  ClipboardDocumentListIcon, TrophyIcon, BanknotesIcon, BellIcon,
  ExclamationTriangleIcon, CheckCircleIcon, BookOpenIcon,
  ChevronDownIcon,
} from '@/lib/icons';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useIsNativeApp } from '@/hooks/useIsNativeApp';
import { parentEnrollmentIsGood, parentEnrollmentLabel } from '@/lib/parents/enrollment-label';

interface ChildSummary {
  id: string;
  /** Portal-user id (students.user_id) — the key used by stats/invoice/enrollment tables. */
  user_id?: string | null;
  full_name: string;
  school_name: string | null;
  grade_level: string | null;
  status: string;
  stats?: {
    whatsappGroupLink?: string | null;
  } | null;
}

interface ParentDashboardProps {
  profile: { id: string; full_name: string | null; email: string };
  /** Linked child summaries — renamed from `children` to avoid React's reserved children prop. */
  kids: ChildSummary[];
  dataLoading: boolean;
  onRefresh: () => void;
}

interface DashStats {
  outstandingBalance: number;
  currency: string;
  unreadNotifications: number;
  overdueinvoices: number;
}

const QUICK_ACTIONS = [
  { name: 'My Children',    href: '/dashboard/my-children',        icon: UserGroupIcon,              desc: 'View all linked children',      bg: 'from-primary to-primary',   ring: 'border-primary/30 bg-primary/5 hover:bg-primary/10' },
  { name: 'Report Cards',   href: '/dashboard/parent-results',     icon: DocumentChartBarIcon,       desc: 'View academic progress',        bg: 'from-primary to-primary',   ring: 'border-primary/30 bg-primary/5 hover:bg-primary/10' },
  { name: 'Path Progress',  href: '/dashboard/parent-path-progress',icon: BookOpenIcon,                desc: 'See current week and path',     bg: 'from-fuchsia-600 to-fuchsia-400', ring: 'border-fuchsia-500/30 bg-fuchsia-500/5 hover:bg-fuchsia-500/10' },
  { name: 'Attendance',     href: '/dashboard/parent-attendance',  icon: ClipboardDocumentCheckIcon, desc: 'Check attendance records',      bg: 'from-emerald-600 to-emerald-400', ring: 'border-emerald-500/30 bg-emerald-500/5 hover:bg-emerald-500/10' },
  { name: 'Grades',         href: '/dashboard/parent-grades',      icon: ClipboardDocumentListIcon,  desc: 'View grades & assignments',     bg: 'from-primary to-primary',       ring: 'border-primary/30 bg-primary/5 hover:bg-primary/10' },
  { name: 'Certificates',   href: '/dashboard/parent-certificates',icon: TrophyIcon,                 desc: "View child's certificates",     bg: 'from-amber-600 to-amber-400',     ring: 'border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10' },
  { name: 'Invoices & Pay', href: '/dashboard/parent-invoices',    icon: BanknotesIcon,              desc: 'Pay fees & view invoices',      bg: 'from-rose-600 to-rose-400',       ring: 'border-rose-500/30 bg-rose-500/5 hover:bg-rose-500/10' },
  { name: 'WhatsApp Inbox', href: '/dashboard/inbox',              icon: EnvelopeIcon,               desc: 'Message teachers & school',     bg: 'from-cyan-600 to-cyan-400',       ring: 'border-cyan-500/30 bg-cyan-500/5 hover:bg-cyan-500/10' },
];

interface CurriculumMilestone {
  child_id: string;
  child_name: string;
  school_name: string | null;
  course_name: string;
  current_term: number;
  current_week: number;
  total_weeks: number;
  last_topic: string;
  progress_pct: number;
}

export default function ParentDashboard({ profile, kids: children, dataLoading, onRefresh }: ParentDashboardProps) {
  const isNativeApp = useIsNativeApp();
  const firstName = profile.full_name?.split(' ')[0] ?? 'Parent';
  const [stats, setStats] = useState<DashStats | null>(null);
  const [milestones, setMilestones] = useState<CurriculumMilestone[]>([]);
  const [childCockpits, setChildCockpits] = useState<Record<string, {
    avgScore: number;
    lessonsDone: number;
    totalLessons: number;
    streak: number;
    xp: number;
    level: number;
    levelName: string;
    levelColor: string;
    badges: any[];
  }>>({});
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  const [showMoreForChild, setShowMoreForChild] = useState(false);
  const [showAllQuickAccess, setShowAllQuickAccess] = useState(false);

  const selectedChild = children.find(c => c.id === selectedChildId);
  const selectedCockpit = selectedChildId ? childCockpits[selectedChildId] : null;
  const selectedMilestone = milestones.find(m => m.child_id === selectedChildId);

  // Always have a child selected when any exist — so the cockpit section renders
  // (with live stats, or a clear "not activated yet" state) instead of vanishing.
  useEffect(() => {
    if (children.length > 0 && !selectedChildId) setSelectedChildId(children[0].id);
  }, [children, selectedChildId]);

  useEffect(() => {
    if (!profile?.id || children.length === 0) return;
    const supabase = createClient();
    // Stats / invoices / enrolments all key on the PORTAL-USER id (students.user_id),
    // not the students-table id. Use portal ids for queries, but keep a map back to
    // the child's selection id so the cockpit UI (keyed by child.id) still resolves.
    const childUserIds = children.map(c => c.user_id).filter(Boolean) as string[];
    const studentIdByPortal: Record<string, string> = {};
    children.forEach(c => { if (c.user_id) studentIdByPortal[c.user_id] = c.id; });

    // ── Invoice + notification stats ──────────────────────────────────────────
    Promise.all([
      childUserIds.length > 0
        ? supabase.from('invoices').select('amount, currency, status')
            .in('portal_user_id', childUserIds).in('status', ['pending', 'overdue'])
        : Promise.resolve({ data: [] }),
      supabase.from('notifications').select('id', { count: 'exact', head: true })
        .eq('user_id', profile.id).eq('is_read', false),
    ]).then(([invRes, notifRes]) => {
      const invoices = (invRes as any).data ?? [];
      const total = invoices.reduce((sum: number, inv: any) => sum + Number(inv.amount), 0);
      const overdue = invoices.filter((inv: any) => inv.status === 'overdue').length;
      const currency = invoices[0]?.currency ?? 'NGN';
      setStats({ outstandingBalance: total, currency, unreadNotifications: (notifRes as any).count ?? 0, overdueinvoices: overdue });
    });

    // ── Child Growth Cockpits fetch ───────────────────────────────────────────
    if (childUserIds.length > 0) {
      Promise.all([
        supabase.from('student_xp_summary').select('*').in('student_id', childUserIds),
        supabase.from('student_streaks').select('*').in('student_id', childUserIds),
        supabase.from('lesson_progress').select('portal_user_id, status').eq('status', 'completed').in('portal_user_id', childUserIds),
        supabase.from('assignment_submissions').select('portal_user_id, grade, assignments(max_points, term_id)').not('grade', 'is', null).in('portal_user_id', childUserIds),
        supabase.from('student_badges').select('*').in('student_id', childUserIds).order('earned_at', { ascending: false }),
        supabase.from('enrollments').select('user_id, programs(courses(lessons(id)))').in('user_id', childUserIds)
      ]).then(async ([xpRes, streakRes, progressRes, subsRes, badgeRes, lessonsRes]) => {
        const { resolveAssignmentTermId, filterByAssignmentSession } = await import('@/lib/assignments/session');
        const liveTermId = await resolveAssignmentTermId(supabase as any, {});
        const scopedSubsAll = filterByAssignmentSession((subsRes.data ?? []) as any[], liveTermId);
        const cockpitsMap: Record<string, any> = {};

        for (const childId of childUserIds) {
          const childXp = xpRes.data?.find((x: any) => x.student_id === childId);
          const childStreak = streakRes.data?.find((s: any) => s.student_id === childId);
          const childProgress = progressRes.data?.filter((p: any) => p.portal_user_id === childId) || [];
          const childSubs = scopedSubsAll.filter((s: any) => s.portal_user_id === childId);
          const childBadges = badgeRes.data?.filter((b: any) => b.student_id === childId) || [];
          
          // Calculate total lessons count
          const childEnr = lessonsRes.data?.find((e: any) => e.user_id === childId);
          let totalLessonsCount = 0;
          const courses = (childEnr as any)?.programs?.courses || [];
          courses.forEach((c: any) => {
            totalLessonsCount += c.lessons?.length || 0;
          });
          if (totalLessonsCount === 0) totalLessonsCount = 24; // fallback standard curriculum depth

          const avgScore = childSubs.length 
            ? Math.round(childSubs.reduce((sum: number, sub: any) => sum + (sub.grade / (sub.assignments?.max_points || 100)) * 100, 0) / childSubs.length)
            : 0;

          const xp = childXp?.total_xp || 0;
          const level = childXp?.level || 1;
          const streak = childStreak?.current_streak || 0;

          // Determine level tier matching Biblical configurations
          let levelName = 'Nehemiah Builder';
          let levelColor = 'text-amber-700 dark:text-amber-300';
          if (xp >= 5000) {
            levelName = 'Solomon Sage';
            levelColor = 'text-cyan-600 dark:text-cyan-400';
          } else if (xp >= 2000) {
            levelName = 'Joshua Commander';
            levelColor = 'text-amber-600 dark:text-amber-400';
          } else if (xp >= 500) {
            levelName = 'Gideon Scout';
            levelColor = 'text-slate-600 dark:text-slate-400';
          }

          // Key by the child's selection id (students.id) so the render resolves it.
          const selectionId = studentIdByPortal[childId] ?? childId;
          cockpitsMap[selectionId] = {
            avgScore,
            lessonsDone: childProgress.length,
            totalLessons: totalLessonsCount,
            streak,
            xp,
            level,
            levelName,
            levelColor,
            badges: childBadges.slice(0, 4)
          };
        }

        setChildCockpits(cockpitsMap);
        setSelectedChildId(prev => prev ?? children[0]?.id ?? null);
      }).catch(err => console.error('Failed to load child stats:', err));
    }

    // ── Curriculum milestone fetch ─────────────────────────────────────────────
    ;(async () => {
      try {
        const { data } = await supabase
          .from('enrollments')
          .select('user_id, programs(courses(id, title, course_curricula(id, content, curriculum_week_tracking(term_number, week_number, status))))')
          .in('user_id', childUserIds)
          .limit(10);
        if (!data) return;
        const ms: CurriculumMilestone[] = [];
        for (const enr of data) {
          const child = children.find(c => c.user_id === enr.user_id);
          if (!child) continue;
          const courses = (enr as any).programs?.courses ?? [];
          for (const course of courses) {
            const curric = (course.course_curricula ?? [])[0];
            if (!curric?.content) continue;
            const tracking: any[] = curric.curriculum_week_tracking ?? [];
            const completed = tracking
              .filter((t: any) => t.status === 'completed')
              .sort((a: any, b: any) => b.term_number - a.term_number || b.week_number - a.week_number);
            const latest = completed[0];
            const currentTerm = latest?.term_number ?? 1;
            const currentWeek = latest?.week_number ?? 0;
            const terms = (curric.content as any)?.terms ?? [];
            const weekObj = (terms.find((t: any) => t.term === currentTerm)?.weeks ?? [])
              .find((w: any) => w.week === currentWeek);
            ms.push({
              child_id: child.id,
              child_name: child.full_name,
              school_name: child.school_name,
              course_name: course.title ?? 'Course',
              current_term: currentTerm,
              current_week: currentWeek,
              total_weeks: 8,
              last_topic: weekObj?.topic ?? 'In progress',
              progress_pct: Math.round((completed.length / 24) * 100),
            });
          }
        }
        setMilestones(ms);
      } catch { /* silent */ }
    })();
  }, [profile?.id, children.length]); // eslint-disable-line

  const formatCurrency = (amount: number, currency: string) =>
    new Intl.NumberFormat('en-NG', { style: 'currency', currency, minimumFractionDigits: 0 }).format(amount);

  const balanceDue = (stats?.outstandingBalance ?? 0) > 0;
  const primaryJob = !children.length
    ? null
    : balanceDue
      ? {
          title: stats!.overdueinvoices > 0 ? 'Payment overdue' : 'Balance due',
          detail: formatCurrency(stats!.outstandingBalance, stats!.currency),
          href: '/dashboard/parent-invoices',
          cta: isNativeApp ? 'View invoices' : 'Pay now',
          tone: 'rose' as const,
        }
      : {
          title: 'Check report cards',
          detail: selectedChild
            ? `See ${selectedChild.full_name.split(' ')[0]}'s latest results`
            : 'View academic progress',
          href: selectedChild
            ? `/dashboard/parent-results?student=${selectedChild.id}`
            : '/dashboard/parent-results',
          cta: 'Open reports',
          tone: 'primary' as const,
        };

  const reportSignalLabel = selectedCockpit
    ? selectedCockpit.avgScore > 0
      ? `${selectedCockpit.avgScore}% avg`
      : 'View reports'
    : selectedMilestone
      ? `T${selectedMilestone.current_term} · W${selectedMilestone.current_week}`
      : 'Report cards';

  return (
    <div className="space-y-5">

      {/* ── First viewport: calm, action-first home ── */}
      <div className="relative overflow-hidden rounded-3xl border border-border/80 bg-card/90 backdrop-blur-2xl p-6 sm:p-8 shadow-xl">
        <div className="absolute -right-16 -top-16 h-56 w-56 pointer-events-none bg-gradient-to-br from-primary to-indigo-600 opacity-10 blur-3xl" />
        <div className="relative z-10 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <span className="inline-block px-3 py-1 bg-brand-red-accent text-white text-[10px] font-black uppercase tracking-widest rounded-full shadow-sm mb-2">Parent Portal</span>
            <h1 className="text-2xl sm:text-4xl font-black tracking-tight text-foreground">Hi, <span className="bg-gradient-to-r from-primary to-indigo-500 dark:from-white dark:to-slate-300 bg-clip-text text-transparent">{firstName}</span></h1>
            <p className="mt-1 text-sm text-muted-foreground font-medium">
              {children.length > 0
                ? "Here's what needs your attention."
                : 'No children linked yet. Claim your child with a report QR code, or ask your school to link them.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            disabled={dataLoading}
            className="inline-flex min-h-11 flex-shrink-0 items-center gap-1.5 rounded-xl border border-border bg-muted px-3 py-2 text-xs font-black uppercase tracking-wider text-muted-foreground transition-all hover:text-foreground disabled:opacity-40"
          >
            <ArrowPathIcon className={`h-4 w-4 ${dataLoading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>

        {children.length === 0 && (
          <div className="relative z-10 mt-4 flex flex-col gap-2 sm:flex-row">
            <Link
              href="/parent-claim"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-black text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Claim my child
            </Link>
            <Link
              href="/dashboard/support"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-muted px-4 py-2.5 text-xs font-black text-foreground transition-colors hover:bg-muted/80"
            >
              Contact support
            </Link>
          </div>
        )}

        {/* One primary job */}
        {primaryJob && (
          <Link
            href={primaryJob.href}
            className={`relative z-10 mt-4 flex items-center justify-between gap-3 rounded-xl border px-4 py-3.5 transition-colors ${
              primaryJob.tone === 'rose'
                ? 'border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/15'
                : 'border-primary/25 bg-primary/10 hover:bg-primary/15'
            }`}
          >
            <div className="min-w-0 flex items-start gap-3">
              {primaryJob.tone === 'rose' ? (
                <ExclamationTriangleIcon className="mt-0.5 h-5 w-5 flex-shrink-0 text-rose-600 dark:text-rose-400" />
              ) : (
                <DocumentChartBarIcon className="mt-0.5 h-5 w-5 flex-shrink-0 text-primary" />
              )}
              <div className="min-w-0">
                <p className={`text-sm font-black ${primaryJob.tone === 'rose' ? 'text-rose-600 dark:text-rose-400' : 'text-foreground'}`}>
                  {primaryJob.title}
                </p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">{primaryJob.detail}</p>
              </div>
            </div>
            <span className={`inline-flex flex-shrink-0 items-center gap-1 text-xs font-black ${primaryJob.tone === 'rose' ? 'text-rose-600 dark:text-rose-400' : 'text-primary'}`}>
              {primaryJob.cta}
              <ArrowRightIcon className="h-3.5 w-3.5" />
            </span>
          </Link>
        )}

        {/* Selected child summary */}
        {selectedChild && (
          <div className="relative z-10 mt-4 rounded-xl border border-border bg-muted/30 p-3.5">
            {children.length > 1 && (
              <div className="mb-3 flex flex-wrap gap-1.5">
                {children.map(child => {
                  const isActive = selectedChildId === child.id;
                  return (
                    <button
                      key={child.id}
                      type="button"
                      onClick={() => setSelectedChildId(child.id)}
                      className={`min-h-9 rounded-lg px-3 py-1.5 text-xs font-black uppercase tracking-wider transition-all ${
                        isActive
                          ? 'bg-primary text-white shadow-sm'
                          : 'bg-card text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {child.full_name.split(' ')[0]}
                    </button>
                  );
                })}
              </div>
            )}
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center bg-gradient-to-br from-primary to-primary">
                <AcademicCapIcon className="h-5 w-5 text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-black text-foreground">{selectedChild.full_name}</p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {[selectedChild.grade_level, selectedChild.school_name].filter(Boolean).join(' · ') || '—'}
                </p>
              </div>
              <span className={`flex-shrink-0 rounded border px-2 py-1 text-[11px] font-black uppercase tracking-wider ${
                parentEnrollmentIsGood(selectedChild.status)
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                  : 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400'
              }`}>
                {parentEnrollmentLabel(selectedChild.status)}
              </span>
            </div>
            {selectedMilestone && selectedMilestone.current_week > 0 && (
              <Link
                href="/dashboard/parent-path-progress"
                className="mt-3 flex items-start justify-between gap-3 rounded-lg border border-border/80 bg-card/60 px-3 py-2.5 transition-colors hover:border-primary/30"
              >
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    This week · Term {selectedMilestone.current_term} · Week {selectedMilestone.current_week}
                  </p>
                  <p className="mt-0.5 truncate text-sm font-bold text-foreground">
                    {selectedMilestone.last_topic}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {selectedMilestone.course_name}
                  </p>
                </div>
                <span className="shrink-0 text-[10px] font-black uppercase tracking-widest text-primary">
                  Path →
                </span>
              </Link>
            )}
          </div>
        )}

        {/* Up to 3 priority signals */}
        {stats && children.length > 0 && (
          <div className="relative z-10 mt-4 grid grid-cols-3 gap-2">
            <Link
              href="/dashboard/parent-invoices"
              className={`rounded-xl border p-3 transition-colors hover:bg-muted/40 ${
                balanceDue ? 'border-rose-500/30 bg-rose-500/5' : 'border-border bg-muted/20'
              }`}
            >
              <p className={`truncate text-sm font-black leading-tight ${balanceDue ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                {balanceDue ? formatCurrency(stats.outstandingBalance, stats.currency) : 'Clear'}
              </p>
              <p className="mt-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Balance</p>
            </Link>
            <Link
              href={selectedChild ? `/dashboard/parent-results?student=${selectedChild.id}` : '/dashboard/parent-results'}
              className="rounded-xl border border-border bg-muted/20 p-3 transition-colors hover:bg-muted/40"
            >
              <p className="truncate text-sm font-black leading-tight text-foreground">{reportSignalLabel}</p>
              <p className="mt-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Reports</p>
            </Link>
            <Link
              href="/dashboard/notifications"
              className={`rounded-xl border p-3 transition-colors hover:bg-muted/40 ${
                stats.unreadNotifications > 0 ? 'border-amber-500/30 bg-amber-500/5' : 'border-border bg-muted/20'
              }`}
            >
              <p className={`flex items-center gap-1 text-sm font-black leading-tight ${stats.unreadNotifications > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-foreground'}`}>
                {stats.unreadNotifications}
                {stats.unreadNotifications > 0 && <BellIcon className="h-3.5 w-3.5" />}
              </p>
              <p className="mt-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Inbox</p>
            </Link>
          </div>
        )}

        {/* 2–3 primary CTAs */}
        {children.length > 0 && (
          <div className="relative z-10 mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Link
              href={selectedChild ? `/dashboard/parent-results?student=${selectedChild.id}` : '/dashboard/parent-results'}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-black text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <DocumentChartBarIcon className="h-4 w-4" />
              Report cards
            </Link>
            <Link
              href="/dashboard/parent-invoices"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-muted px-4 py-2.5 text-xs font-black text-foreground transition-colors hover:bg-muted/80"
            >
              <BanknotesIcon className="h-4 w-4" />
              {isNativeApp ? 'Invoices' : 'Pay / invoices'}
            </Link>
            <Link
              href="/dashboard/my-children"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-muted px-4 py-2.5 text-xs font-black text-foreground transition-colors hover:bg-muted/80"
            >
              <UserGroupIcon className="h-4 w-4" />
              My children
            </Link>
          </div>
        )}
      </div>

      {/* Loading skeleton */}
      {dataLoading && children.length === 0 && (
        <div className="animate-pulse rounded-xl border border-border bg-card p-5">
          <div className="h-4 w-2/3 rounded bg-muted" />
          <div className="mt-3 h-3 w-1/2 rounded bg-muted" />
        </div>
      )}

      {/* ── More for this child (cockpit behind disclosure) ── */}
      {children.length > 0 && selectedChildId && (
        <div className="rounded-3xl border border-border/80 bg-card/90 backdrop-blur-2xl overflow-hidden shadow-xl">
          <button
            type="button"
            onClick={() => setShowMoreForChild(v => !v)}
            className="flex min-h-12 w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition-colors hover:bg-muted/30"
          >
            <div className="flex min-w-0 items-center gap-2">
              <BookOpenIcon className="h-4 w-4 flex-shrink-0 text-primary" />
              <div className="min-w-0">
                <p className="text-sm font-black text-foreground">
                  More for {selectedChild?.full_name.split(' ')[0] ?? 'this child'}
                </p>
                <p className="text-xs text-muted-foreground">Progress, XP, badges & milestones</p>
              </div>
            </div>
            <ChevronDownIcon className={`h-5 w-5 flex-shrink-0 text-muted-foreground transition-transform ${showMoreForChild ? 'rotate-180' : ''}`} />
          </button>

          {showMoreForChild && (
            <div className="space-y-4 border-t border-border p-4 sm:p-6">
              {selectedCockpit ? (
                <>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl border border-border bg-muted/20 p-4 text-center">
                      <p className="text-2xl font-black tabular-nums text-foreground">{selectedCockpit.avgScore}%</p>
                      <p className="mt-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">Avg score</p>
                    </div>
                    <div className="rounded-2xl border border-border bg-muted/20 p-4">
                      <p className="text-2xl font-black tabular-nums text-foreground">
                        {selectedCockpit.lessonsDone}/{selectedCockpit.totalLessons}
                      </p>
                      <p className="mt-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">Lessons done</p>
                      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-emerald-500 transition-all"
                          style={{ width: `${Math.min(100, (selectedCockpit.lessonsDone / selectedCockpit.totalLessons) * 100)}%` }}
                        />
                      </div>
                      {selectedMilestone && (
                        <p className="mt-2 text-xs text-muted-foreground">
                          Term {selectedMilestone.current_term} · Week {selectedMilestone.current_week}
                        </p>
                      )}
                    </div>
                    <div className="space-y-2 rounded-2xl border border-border bg-muted/20 p-4">
                      <div>
                        <p className="text-lg font-black tabular-nums text-foreground">{selectedCockpit.streak} wk</p>
                        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Streak</p>
                      </div>
                      <div>
                        <p className="text-lg font-black tabular-nums text-foreground">{selectedCockpit.xp.toLocaleString()} XP</p>
                        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Knowledge points</p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-border bg-muted/20 p-4">
                    <p className="mb-3 text-xs font-black uppercase tracking-wider text-muted-foreground">Learning badges</p>
                    {selectedCockpit.badges.length === 0 ? (
                      <p className="py-4 text-center text-xs text-muted-foreground">
                        No badges yet. They appear as your child completes milestones.
                      </p>
                    ) : (
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {selectedCockpit.badges.map((badge: any) => (
                          <div key={badge.id} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3">
                            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-border text-xl">
                              {badge.badge_icon || '🏅'}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-xs font-black uppercase tracking-tight text-foreground">{badge.badge_label}</p>
                              <p className="mt-0.5 text-[11px] font-bold text-muted-foreground">
                                Earned {new Date(badge.earned_at).toLocaleDateString()}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: 'Attendance', href: `/dashboard/parent-attendance?student=${selectedChildId}`, icon: ClipboardDocumentCheckIcon },
                      { label: 'Grades', href: `/dashboard/parent-grades?student=${selectedChildId}`, icon: ClipboardDocumentListIcon },
                      { label: 'Path', href: `/dashboard/parent-path-progress?student=${selectedChildId}`, icon: BookOpenIcon },
                    ].map(({ label, href, icon: Icon }) => (
                      <Link
                        key={label}
                        href={href}
                        className="flex min-h-11 flex-col items-center justify-center gap-1 rounded-2xl border border-border bg-muted/30 py-2.5 text-center transition-colors hover:bg-primary/10"
                      >
                        <Icon className="h-4 w-4 text-muted-foreground" />
                        <span className="text-[11px] font-black uppercase tracking-wider text-muted-foreground">{label}</span>
                      </Link>
                    ))}
                  </div>
                </>
              ) : selectedChild && !selectedChild.user_id ? (
                <div className="flex flex-col items-center gap-2 py-8 text-center">
                  <AcademicCapIcon className="h-10 w-10 text-muted-foreground/40" />
                  <p className="text-sm font-black text-foreground">
                    {selectedChild.full_name.split(' ')[0]}&apos;s student account isn&apos;t active yet
                  </p>
                  <p className="max-w-md text-xs text-muted-foreground">
                    Growth stats appear once the student portal account is activated and they start learning.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3 py-10">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Loading progress…</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── More quick access (secondary links) ── */}
      {children.length > 0 && (
        <div className="rounded-3xl border border-border/80 bg-card/90 backdrop-blur-2xl overflow-hidden shadow-xl">
          <button
            type="button"
            onClick={() => setShowAllQuickAccess(v => !v)}
            className="flex min-h-12 w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition-colors hover:bg-muted/30"
          >
            <div>
              <p className="text-sm font-black text-foreground">More links</p>
              <p className="text-xs text-muted-foreground">Attendance, grades, certificates & inbox</p>
            </div>
            <ChevronDownIcon className={`h-5 w-5 flex-shrink-0 text-muted-foreground transition-transform ${showAllQuickAccess ? 'rotate-180' : ''}`} />
          </button>
          {showAllQuickAccess && (
            <div className="grid grid-cols-2 gap-2 border-t border-border p-3 sm:grid-cols-3 lg:grid-cols-4">
              {QUICK_ACTIONS
                .map((action) => isNativeApp && action.name === 'Invoices & Pay' ? { ...action, name: 'Invoices', desc: 'View invoices and payment status' } : action)
                .map(({ name, href, icon: Icon, desc, bg, ring }) => (
                  <Link
                    key={name}
                    href={href}
                    className={`flex min-h-11 flex-col gap-2 border rounded-2xl p-3 transition-all group ${ring}`}
                  >
                    <div className={`flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br ${bg} shadow-sm transition-transform group-hover:scale-110`}>
                      <Icon className="h-4 w-4 text-white" />
                    </div>
                    <div>
                      <p className="text-xs font-black uppercase tracking-wider leading-tight text-foreground">{name}</p>
                      <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{desc}</p>
                    </div>
                  </Link>
                ))}
            </div>
          )}
        </div>
      )}

      {/* Empty-state helper when no kids and not loading */}
      {!dataLoading && children.length === 0 && (
        <div className="flex items-start gap-3 rounded-3xl border border-border/80 bg-card/90 backdrop-blur-2xl p-4 sm:p-6 shadow-xl">
          <CheckCircleIcon className="mt-0.5 h-5 w-5 flex-shrink-0 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Once a child is linked, you’ll see balances, report cards, and school messages here.
          </p>
        </div>
      )}

    </div>
  );
}
