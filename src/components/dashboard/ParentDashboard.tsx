'use client';

import { useEffect, useState } from 'react';
import {
  UserGroupIcon, DocumentChartBarIcon, ClipboardDocumentCheckIcon,
  ArrowRightIcon, ArrowPathIcon, AcademicCapIcon, EnvelopeIcon,
  ClipboardDocumentListIcon, TrophyIcon, BanknotesIcon, BellIcon,
  ExclamationTriangleIcon, CheckCircleIcon, BookOpenIcon,
  FireIcon, RocketLaunchIcon, CommandLineIcon, ChartBarIcon,
} from '@/lib/icons';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { RadialRing, GaugeBar, CHART_COLORS } from '@/components/charts';

interface ChildSummary {
  id: string;
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
  { name: 'Messages',       href: '/dashboard/messages',           icon: EnvelopeIcon,               desc: 'Contact teachers & staff',      bg: 'from-cyan-600 to-cyan-400',       ring: 'border-cyan-500/30 bg-cyan-500/5 hover:bg-cyan-500/10' },
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

  const selectedChild = children.find(c => c.id === selectedChildId);
  const selectedCockpit = selectedChildId ? childCockpits[selectedChildId] : null;

  useEffect(() => {
    if (!profile?.id || children.length === 0) return;
    const supabase = createClient();
    const childUserIds = children.map(c => c.id).filter(Boolean);

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
        supabase.from('assignment_submissions').select('portal_user_id, grade, assignments(max_points)').not('grade', 'is', null).in('portal_user_id', childUserIds),
        supabase.from('student_badges').select('*').in('student_id', childUserIds).order('earned_at', { ascending: false }),
        supabase.from('enrollments').select('user_id, programs(courses(lessons(id)))').in('user_id', childUserIds)
      ]).then(([xpRes, streakRes, progressRes, subsRes, badgeRes, lessonsRes]) => {
        const cockpitsMap: Record<string, any> = {};

        for (const childId of childUserIds) {
          const childXp = xpRes.data?.find((x: any) => x.student_id === childId);
          const childStreak = streakRes.data?.find((s: any) => s.student_id === childId);
          const childProgress = progressRes.data?.filter((p: any) => p.portal_user_id === childId) || [];
          const childSubs = subsRes.data?.filter((s: any) => s.portal_user_id === childId) || [];
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
          let levelColor = 'text-amber-700';
          if (xp >= 5000) {
            levelName = 'Solomon Sage';
            levelColor = 'text-cyan-400';
          } else if (xp >= 2000) {
            levelName = 'Joshua Commander';
            levelColor = 'text-amber-400';
          } else if (xp >= 500) {
            levelName = 'Gideon Scout';
            levelColor = 'text-slate-400';
          }

          cockpitsMap[childId] = {
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
        setSelectedChildId(childUserIds[0]);
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
          const child = children.find(c => c.id === enr.user_id);
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

  return (
    <div className="space-y-6">

      {/* Welcome Banner */}
      <div className="bg-card border border-border rounded-xl p-6 sm:p-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-72 h-72 bg-gradient-to-br from-primary to-primary opacity-[0.04] blur-3xl -mr-20 -mt-20 pointer-events-none" />
        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-brand-red-600 mb-1">Parent Portal</p>
            <h1 className="text-2xl font-black text-foreground tracking-tight">Welcome back, {firstName}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {children.length > 0
                ? `You have ${children.length} child${children.length > 1 ? 'ren' : ''} enrolled.`
                : 'No children linked yet. Contact admin to link your child.'}
            </p>
          </div>
          <button onClick={onRefresh} disabled={dataLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-foreground bg-muted border border-border transition-all disabled:opacity-40 flex-shrink-0">
            <ArrowPathIcon className={`w-3.5 h-3.5 ${dataLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Alert bar — overdue invoices */}
        {stats && stats.overdueinvoices > 0 && (
          <div className="relative z-10 mt-4 flex items-center gap-3 px-4 py-2.5 bg-rose-500/10 border border-rose-500/30">
            <ExclamationTriangleIcon className="w-4 h-4 text-rose-400 flex-shrink-0" />
            <span className="text-xs text-rose-400 font-bold">
              {stats.overdueinvoices} overdue invoice{stats.overdueinvoices > 1 ? 's' : ''} —
            </span>
            <Link href="/dashboard/parent-invoices" className="text-xs font-black text-rose-400 hover:text-rose-300 underline underline-offset-2">
              Pay Now
            </Link>
          </div>
        )}
      </div>

      {/* Stats row with visual rings */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Outstanding Balance */}
          <div className={`bg-card border border-t-2 border-t-brand-red-600/40 p-5 flex items-center gap-4 ${stats.outstandingBalance > 0 ? 'border-rose-500/30' : 'border-border'}`}>
            <RadialRing
              value={stats.overdueinvoices > 0 ? 100 : stats.outstandingBalance > 0 ? 50 : 0}
              max={100}
              size={64}
              strokeWidth={6}
              color={stats.outstandingBalance > 0 ? CHART_COLORS.rose : CHART_COLORS.emerald}
              label="Balance"
            />
            <div>
              <p className={`text-lg font-black leading-none ${stats.outstandingBalance > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                {stats.outstandingBalance > 0 ? formatCurrency(stats.outstandingBalance, stats.currency) : 'All Clear'}
              </p>
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mt-1">Outstanding Balance</p>
              {stats.overdueinvoices > 0 && (
                <Link href="/dashboard/parent-invoices" className="text-[9px] text-rose-400 font-black mt-1 inline-flex items-center gap-1 hover:underline">
                  {stats.overdueinvoices} overdue → Pay now
                </Link>
              )}
            </div>
          </div>

          {/* Children Enrolled */}
          <div className="bg-card border border-border border-t-2 border-t-brand-red-600/40 p-5 flex items-center gap-4">
            <RadialRing
              value={children.length}
              max={Math.max(children.length, 5)}
              size={64}
              strokeWidth={6}
              color={CHART_COLORS.primary}
              label="Children"
            />
            <div>
              <p className="text-lg font-black text-foreground leading-none">{children.length}</p>
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mt-1">Children Enrolled</p>
              <Link href="/dashboard/my-children" className="text-[9px] text-primary font-black mt-1 inline-flex items-center gap-1 hover:underline">
                View all children →
              </Link>
            </div>
          </div>

          {/* Notifications */}
          <div className="bg-card border border-border border-t-2 border-t-brand-red-600/40 p-5 flex items-center gap-4">
            <RadialRing
              value={Math.min(stats.unreadNotifications * 10, 100)}
              max={100}
              size={64}
              strokeWidth={6}
              color={stats.unreadNotifications > 0 ? CHART_COLORS.amber : CHART_COLORS.emerald}
              label="Alerts"
            />
            <div>
              <Link href="/dashboard/messages" className="flex items-center gap-2 group">
                <p className={`text-lg font-black leading-none ${stats.unreadNotifications > 0 ? 'text-amber-400' : 'text-foreground'}`}>
                  {stats.unreadNotifications}
                </p>
                {stats.unreadNotifications > 0 && <BellIcon className="w-4 h-4 text-amber-400 animate-pulse" />}
              </Link>
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mt-1">Unread Notifications</p>
            </div>
          </div>
        </div>
      )}

      {/* Children Cards */}
      {!dataLoading && children.length > 0 && (
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-brand-red-600 mb-3">My Children</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {children.map(child => (
              <div key={child.id} className="bg-card border border-border p-5 hover:bg-white/5 transition-all group relative overflow-hidden">
                <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-primary to-primary opacity-[0.03] blur-2xl -mr-12 -mt-12 group-hover:scale-150 transition-transform pointer-events-none" />

                <div className="flex items-start gap-3 relative z-10">
                  <div className="w-10 h-10 bg-gradient-to-br from-primary to-primary flex items-center justify-center flex-shrink-0">
                    <AcademicCapIcon className="w-5 h-5 text-white" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-black text-foreground text-sm truncate">{child.full_name}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{child.school_name ?? '—'}</p>
                    {child.grade_level && (
                      <p className="text-[10px] font-bold text-primary uppercase tracking-wider mt-0.5">{child.grade_level}</p>
                    )}
                    {child.stats?.whatsappGroupLink && (
                      <a href={child.stats.whatsappGroupLink} target="_blank" rel="noopener noreferrer"
                        className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500 hover:bg-emerald-400 text-black font-black text-[9px] uppercase tracking-widest rounded-full transition-all w-fit relative z-30">
                        💬 Join Class Chat
                      </a>
                    )}
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between relative z-10">
                  <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 border ${
                    child.status === 'approved'
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                      : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                  }`}>
                    {child.status}
                  </span>
                  <Link href={`/dashboard/parent-results?student=${child.id}`}
                    className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-brand-red-600 hover:text-primary transition-colors">
                    Progress <ArrowRightIcon className="w-3 h-3" />
                  </Link>
                </div>

                {/* Per-child quick links */}
                <div className="mt-3 pt-3 border-t border-border grid grid-cols-3 gap-1.5 relative z-10">
                  {[
                    { label: 'Attendance', href: `/dashboard/parent-attendance?student=${child.id}`, icon: ClipboardDocumentCheckIcon },
                    { label: 'Grades', href: `/dashboard/parent-grades?student=${child.id}`, icon: ClipboardDocumentListIcon },
                    { label: 'Invoices', href: `/dashboard/parent-invoices?student=${child.id}`, icon: BanknotesIcon },
                  ].map(({ label, href, icon: Icon }) => (
                    <Link key={label} href={href}
                      className="flex flex-col items-center gap-1 py-2 bg-muted hover:bg-primary/10 hover:border-primary/20 border border-transparent transition-all text-center">
                      <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="text-[8px] font-black uppercase tracking-wider text-muted-foreground">{label}</span>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Loading skeleton */}
      {dataLoading && (
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-brand-red-600 mb-3">My Children</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="bg-card border border-border p-5 animate-pulse">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-muted" />
                  <div className="flex-1">
                    <div className="h-4 bg-muted rounded w-2/3 mb-2" />
                    <div className="h-3 bg-muted rounded w-1/2" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Family Academic & Prototyping Growth Cockpit ── */}
      {children.length > 0 && selectedChildId && (
        <div className="space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <BookOpenIcon className="w-4 h-4 text-primary" />
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Family Growth Cockpit & Milestones</p>
            </div>
            
            {/* Child switcher tabs */}
            {children.length > 1 && (
              <div className="flex flex-wrap gap-1 bg-muted p-1 rounded-xl border border-border">
                {children.map(child => {
                  const isActive = selectedChildId === child.id;
                  return (
                    <button
                      key={child.id}
                      onClick={() => setSelectedChildId(child.id)}
                      className={`px-3 py-1 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${
                        isActive 
                          ? 'bg-primary text-white shadow-sm' 
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {child.full_name.split(' ')[0]}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {selectedCockpit ? (
            <div className="space-y-6">
              {/* Radial performance indicators & stats grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                
                {/* 1. Academic Performance (GPA) */}
                <div className="bg-card border border-border rounded-[24px] p-6 flex flex-col items-center justify-between text-center relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 blur-3xl pointer-events-none" />
                  <div className="w-full">
                    <h3 className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-4">Grade Point Average</h3>
                    
                    {/* SVG Radial Progress */}
                    <div className="relative w-32 h-32 mx-auto flex items-center justify-center">
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
                          strokeDashoffset={251.2 - (251.2 * Math.min(selectedCockpit.avgScore, 100)) / 100}
                          strokeLinecap="round"
                        />
                      </svg>
                      <div className="absolute flex flex-col items-center justify-center">
                        <span className="text-2xl font-black tracking-tight tabular-nums text-foreground">{selectedCockpit.avgScore}%</span>
                        <span className="text-[8px] font-black text-muted-foreground uppercase tracking-widest">GPA Index</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 w-full">
                    <p className="text-[10px] text-muted-foreground leading-relaxed px-2">
                      Assignment performance index across all homework, quizzes, and Capstone deliverables.
                    </p>
                  </div>
                </div>

                {/* 2. Syllabus Module completions */}
                <div className="bg-card border border-border rounded-[24px] p-6 flex flex-col justify-between relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 blur-3xl pointer-events-none" />
                  <div className="w-full">
                    <h3 className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-4">Syllabus Completion</h3>
                    
                    <div className="space-y-4">
                      <div className="flex justify-between items-baseline">
                        <p className="text-2xl font-black tabular-nums text-foreground">
                          {selectedCockpit.lessonsDone} / {selectedCockpit.totalLessons}
                        </p>
                        <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Lessons Completed</p>
                      </div>

                      <div className="space-y-1">
                        <div className="h-2.5 w-full bg-muted rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                            style={{ width: `${Math.min(100, (selectedCockpit.lessonsDone / selectedCockpit.totalLessons) * 100)}%` }}
                          />
                        </div>
                        <div className="flex justify-between text-[8px] font-bold text-muted-foreground uppercase tracking-wider">
                          <span>Milestone progress</span>
                          <span>{Math.round((selectedCockpit.lessonsDone / selectedCockpit.totalLessons) * 100)}% Complete</span>
                        </div>
                      </div>

                      {/* Active milestone timeline brief */}
                      {milestones.find(m => m.child_id === selectedChildId) && (
                        <div className="border-t border-border/80 pt-3 flex justify-between items-center text-xs">
                          <span className="text-muted-foreground font-bold">Current Timeline:</span>
                          <span className="font-black text-foreground">
                            Term {milestones.find(m => m.child_id === selectedChildId)?.current_term} · Week {milestones.find(m => m.child_id === selectedChildId)?.current_week}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* 3. Knowledge streaks */}
                <div className="bg-card border border-border rounded-[24px] p-6 flex flex-col justify-between relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 blur-3xl pointer-events-none" />
                  <div className="w-full">
                    <h3 className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-4">Consistency Index</h3>
                    
                    <div className="space-y-3">
                      <div className="flex items-center gap-3 bg-muted/40 border border-border/60 p-3 rounded-2xl">
                        <span className="text-2xl">🔥</span>
                        <div>
                          <p className="text-lg font-black text-foreground tabular-nums leading-tight">{selectedCockpit.streak} Week{selectedCockpit.streak !== 1 ? 's' : ''}</p>
                          <p className="text-[8px] font-black text-muted-foreground uppercase tracking-widest mt-0.5">Active Pacing Streak</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 bg-muted/40 border border-border/60 p-3 rounded-2xl">
                        <span className="text-2xl">💎</span>
                        <div>
                          <p className="text-lg font-black text-foreground tabular-nums leading-tight">{selectedCockpit.xp.toLocaleString()}</p>
                          <p className="text-[8px] font-black text-muted-foreground uppercase tracking-widest mt-0.5">Total Knowledge Points</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

              </div>

              {/* Badges and BroadSheetremarks */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* Verified badges */}
                <div className="lg:col-span-2 bg-card border border-border rounded-[24px] p-6 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-48 h-48 bg-primary/5 blur-3xl pointer-events-none" />
                  <h3 className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-4">Mastered Competency Badges</h3>
                  
                  {selectedCockpit.badges.length === 0 ? (
                    <div className="py-10 text-center text-xs text-muted-foreground font-bold">
                      🏆 No verified badges logged for this child yet.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {selectedCockpit.badges.map((badge: any) => (
                        <div key={badge.id} className="flex items-center gap-3.5 p-3.5 bg-muted/40 border border-border rounded-2xl hover:bg-muted/60 transition-all">
                          <div className="w-10 h-10 bg-card border border-border flex items-center justify-center text-2xl rounded-xl shrink-0">
                            {badge.badge_icon || '🏅'}
                          </div>
                          <div>
                            <p className="text-xs font-black uppercase tracking-tight text-foreground">{badge.badge_label}</p>
                            <p className="text-[8px] text-muted-foreground font-bold mt-0.5">
                              Mastered on {new Date(badge.earned_at).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* CharacterRemark */}
                <div className="bg-card border border-border rounded-[24px] p-6 relative overflow-hidden flex flex-col justify-between">
                  <div className="absolute bottom-0 right-0 w-32 h-32 bg-emerald-500/5 blur-3xl pointer-events-none" />
                  <div>
                    <h3 className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-4">Academic & Character Assessment</h3>
                    <p className="text-xs text-foreground leading-relaxed italic">
                      "{selectedChild?.full_name?.split(' ')[0]} is currently demonstrating healthy computational progress at the level of <strong className={selectedCockpit.levelColor}>{selectedCockpit.levelName}</strong>. We highly encourage continued weekly streaks to lock in database structures and algorithmic planning."
                    </p>
                  </div>
                  
                  <div className="mt-5 pt-3 border-t border-border/80 flex items-center justify-between text-[8px] font-black uppercase tracking-widest text-muted-foreground">
                    <span>Office of Academic Affairs</span>
                    <span className="text-emerald-500 font-bold">✓ Verified Report Card</span>
                  </div>
                </div>

              </div>
            </div>
          ) : (
            <div className="bg-card border border-border rounded-[24px] p-12 text-center flex flex-col items-center justify-center gap-3">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent animate-spin rounded-full" />
              <p className="text-xs text-muted-foreground font-bold uppercase tracking-widest animate-pulse">Loading Growth Cockpit...</p>
            </div>
          )}
        </div>
      )}

      {/* Quick Actions */}
      <div>
        <p className="text-[10px] font-black uppercase tracking-widest text-brand-red-600 mb-3">Quick Access</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
          {QUICK_ACTIONS.map(({ name, href, icon: Icon, desc, bg, ring }) => (
            <Link key={name} href={href}
              className={`border p-4 transition-all group flex flex-col gap-3 ${ring}`}>
              <div className={`w-9 h-9 bg-gradient-to-br ${bg} flex items-center justify-center group-hover:scale-110 transition-transform shadow-sm`}>
                <Icon className="w-4 h-4 text-white" />
              </div>
              <div>
                <p className="text-xs font-black text-foreground uppercase tracking-wider leading-tight">{name}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug">{desc}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>

    </div>
  );
}
