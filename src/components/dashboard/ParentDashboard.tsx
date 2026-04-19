'use client';

import { useEffect, useState } from 'react';
import {
  UserGroupIcon, DocumentChartBarIcon, ClipboardDocumentCheckIcon,
  ArrowRightIcon, ArrowPathIcon, AcademicCapIcon, EnvelopeIcon,
  ClipboardDocumentListIcon, TrophyIcon, BanknotesIcon, BellIcon,
  ExclamationTriangleIcon, CheckCircleIcon, BookOpenIcon,
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
}

interface ParentDashboardProps {
  profile: { id: string; full_name: string | null; email: string };
  children: ChildSummary[];
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
  { name: 'My Children',    href: '/dashboard/my-children',        icon: UserGroupIcon,              desc: 'View all linked children',      bg: 'from-orange-600 to-orange-400',   ring: 'border-orange-500/30 bg-orange-500/5 hover:bg-orange-500/10' },
  { name: 'Report Cards',   href: '/dashboard/parent-results',     icon: DocumentChartBarIcon,       desc: 'View academic progress',        bg: 'from-violet-600 to-violet-400',   ring: 'border-violet-500/30 bg-violet-500/5 hover:bg-violet-500/10' },
  { name: 'Attendance',     href: '/dashboard/parent-attendance',  icon: ClipboardDocumentCheckIcon, desc: 'Check attendance records',      bg: 'from-emerald-600 to-emerald-400', ring: 'border-emerald-500/30 bg-emerald-500/5 hover:bg-emerald-500/10' },
  { name: 'Grades',         href: '/dashboard/parent-grades',      icon: ClipboardDocumentListIcon,  desc: 'View grades & assignments',     bg: 'from-blue-600 to-blue-400',       ring: 'border-blue-500/30 bg-blue-500/5 hover:bg-blue-500/10' },
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

export default function ParentDashboard({ profile, children, dataLoading, onRefresh }: ParentDashboardProps) {
  const firstName = profile.full_name?.split(' ')[0] ?? 'Parent';
  const [stats, setStats] = useState<DashStats | null>(null);
  const [milestones, setMilestones] = useState<CurriculumMilestone[]>([]);

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
      <div className="bg-card border border-border rounded-none p-6 sm:p-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-72 h-72 bg-gradient-to-br from-orange-600 to-orange-400 opacity-[0.04] blur-3xl -mr-20 -mt-20 pointer-events-none" />
        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-orange-500 mb-1">Parent Portal</p>
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
          <div className={`bg-card border p-5 flex items-center gap-4 ${stats.outstandingBalance > 0 ? 'border-rose-500/30' : 'border-border'}`}>
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
          <div className="bg-card border border-border p-5 flex items-center gap-4">
            <RadialRing
              value={children.length}
              max={Math.max(children.length, 5)}
              size={64}
              strokeWidth={6}
              color={CHART_COLORS.orange}
              label="Children"
            />
            <div>
              <p className="text-lg font-black text-foreground leading-none">{children.length}</p>
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mt-1">Children Enrolled</p>
              <Link href="/dashboard/my-children" className="text-[9px] text-orange-400 font-black mt-1 inline-flex items-center gap-1 hover:underline">
                View all children →
              </Link>
            </div>
          </div>

          {/* Notifications */}
          <div className="bg-card border border-border p-5 flex items-center gap-4">
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
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-3">My Children</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {children.map(child => (
              <div key={child.id} className="bg-card border border-border p-5 hover:bg-white/5 transition-all group relative overflow-hidden">
                <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-orange-600 to-orange-400 opacity-[0.03] blur-2xl -mr-12 -mt-12 group-hover:scale-150 transition-transform pointer-events-none" />

                <div className="flex items-start gap-3 relative z-10">
                  <div className="w-10 h-10 bg-gradient-to-br from-orange-600 to-orange-400 flex items-center justify-center flex-shrink-0">
                    <AcademicCapIcon className="w-5 h-5 text-white" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-black text-foreground text-sm truncate">{child.full_name}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{child.school_name ?? '—'}</p>
                    {child.grade_level && (
                      <p className="text-[10px] font-bold text-orange-500 uppercase tracking-wider mt-0.5">{child.grade_level}</p>
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
                    className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-orange-500 hover:text-orange-400 transition-colors">
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
                      className="flex flex-col items-center gap-1 py-2 bg-muted hover:bg-orange-500/10 hover:border-orange-500/20 border border-transparent transition-all text-center">
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
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-3">My Children</p>
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

      {/* Curriculum Milestone — "Your child is on Week X of Term Y" */}
      {milestones.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <BookOpenIcon className="w-4 h-4 text-violet-400" />
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Class Learning Progress</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {milestones.map((m, i) => (
              <div key={i} className="bg-card border border-border p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-black text-foreground truncate">{m.child_name}</p>
                    <p className="text-[10px] text-muted-foreground">{m.course_name}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[10px] font-black text-violet-400 uppercase tracking-widest">
                      Term {m.current_term}
                    </p>
                    <p className="text-sm font-black text-foreground">
                      Week {m.current_week}/{m.total_weeks}
                    </p>
                  </div>
                </div>

                {/* Progress bar */}
                <div>
                  <div className="flex justify-between text-[9px] font-bold mb-1">
                    <span className="text-muted-foreground truncate max-w-[70%]">{m.last_topic}</span>
                    <span className="text-violet-400">{m.progress_pct}% done</span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-violet-500 rounded-full transition-all duration-700"
                      style={{ width: `${Math.max(m.progress_pct, 3)}%` }}
                    />
                  </div>
                </div>

                <Link
                  href="/dashboard/parent-results"
                  className="text-[9px] font-black text-violet-400 uppercase tracking-widest hover:underline flex items-center gap-1"
                >
                  View full report <ArrowRightIcon className="w-3 h-3" />
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div>
        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-3">Quick Access</p>
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
