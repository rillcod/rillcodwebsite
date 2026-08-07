// @refresh reset
// Optimized Dashboard - Uses API routes and caching
'use client';

import { useAuth } from '@/contexts/auth-context';
import {
  ClockIcon, ExclamationTriangleIcon, BuildingOfficeIcon,
  AcademicCapIcon, ChartBarIcon, CogIcon, UserPlusIcon,
  UserGroupIcon, ClipboardDocumentListIcon, BookOpenIcon,
  RocketLaunchIcon, TrophyIcon, BanknotesIcon, ShieldCheckIcon, DocumentChartBarIcon
} from '@/lib/icons';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import StudentDashboardWidget from '@/components/dashboard/StudentDashboard';
import AdminDashboard from '@/components/dashboard/AdminDashboard';
import TeacherDashboard from '@/components/dashboard/TeacherDashboard';
import SchoolDashboard from '@/components/dashboard/SchoolDashboard';
import ParentDashboard from '@/components/dashboard/ParentDashboard';
import BillingStickyNotices from '@/components/billing/BillingStickyNotices';
import DashboardLoadingScreen from '@/components/dashboard/DashboardLoadingScreen';
import { DashboardSkeleton } from '@/components/dashboard/DashboardSkeleton';
import { useDashboardData, useDashboardAutoRefresh } from '@/hooks/useDashboardData';
import InboxPreviewWidget from '@/components/dashboard/InboxPreviewWidget';
import ReportCoverageWidget from '@/components/dashboard/ReportCoverageWidget';
import { formatAcademicSession, liveAcademicSession } from '@/lib/reports/academic-period';

/* ── Quick actions by role ────────────────────────────── */
const QUICK_ACTIONS = {
  admin: [
    { name: 'Partner Schools', href: '/dashboard/schools', icon: BuildingOfficeIcon, desc: 'View and approve partner schools' },
    { name: 'Manage Teachers', href: '/dashboard/teachers', icon: AcademicCapIcon, desc: 'View and manage staff accounts' },
    { name: 'Platform Operations', href: '/dashboard/platform-operations', icon: CogIcon, desc: 'LMS, AI, system activity and health' },
    { name: 'Office Center', href: '/dashboard/office', icon: BuildingOfficeIcon, desc: 'Support cases & customer directory' },
  ],
  // Register Students and Grading Center were dropped from here: the teacher
  // dashboard already gives each a richer surface — three explained registration
  // methods, and grading cards carrying the actual outstanding counts. Repeating
  // them as bare tiles added a second, worse copy of both.
  teacher: [
    { name: 'My Students', href: '/dashboard/students', icon: UserGroupIcon, desc: 'View & manage student roster' },
    { name: 'Progress Reports', href: '/dashboard/results', icon: DocumentChartBarIcon, desc: 'Write, publish and share report cards' },
    { name: 'Classes & Rosters', href: '/dashboard/classes', icon: BookOpenIcon, desc: 'Manage your teaching classes' },
  ],
  student: [
    { name: 'Learning Center', href: '/dashboard/learning', icon: RocketLaunchIcon, desc: 'View enrolled programs & lessons' },
    { name: 'Path Progress', href: '/dashboard/path-progress', icon: ChartBarIcon, desc: 'See your current path and week' },
    { name: 'Assignments', href: '/dashboard/assignments', icon: ClipboardDocumentListIcon, desc: 'View & submit homework' },
    { name: 'My Report Card', href: '/dashboard/results', icon: TrophyIcon, desc: 'Track grades & achievements' },
  ],
  school: [
    { name: 'My Students', href: '/dashboard/students', icon: UserGroupIcon, desc: 'View enrolled school students' },
    { name: 'Classes & Rosters', href: '/dashboard/classes', icon: BookOpenIcon, desc: 'View class rosters & schedules' },
    { name: 'Grades & Reports', href: '/dashboard/results', icon: TrophyIcon, desc: 'View student grades & report cards' },
    { name: 'My Invoices', href: '/dashboard/finance?workspace=invoices&ops=invoices', icon: BanknotesIcon, desc: 'Invoices, payments, and receipts' },
  ],
  parent: [
    { name: 'My Children', href: '/dashboard/my-children', icon: UserGroupIcon, desc: 'View linked child profiles' },
    { name: 'Report Cards', href: '/dashboard/parent-results', icon: TrophyIcon, desc: 'View academic progress & reports' },
    { name: 'Attendance', href: '/dashboard/parent-attendance', icon: ClipboardDocumentListIcon, desc: 'Check attendance records' },
    { name: 'Invoices & Pay', href: '/dashboard/parent-invoices', icon: BanknotesIcon, desc: 'Pay school fees & view receipts' },
  ],
};

/* ── Main Component ───────────────────────────────────── */
export default function DashboardPage() {
  const { user, profile, loading: authLoading, profileLoading, refreshProfile, signOut, signingOut } = useAuth();
  const router = useRouter();
  const [now, setNow] = useState<Date | null>(null);
  const [parentChildren, setParentChildren] = useState<any[]>([]);
  const [upcomingSlots, setUpcomingSlots] = useState<any[]>([]);

  // Use optimized data fetching hook
  const { data, loading: dataLoading, error, refetch } = useDashboardData(!authLoading && !profileLoading && !!profile);

  // Auto-refresh for teachers and admins
  const shouldAutoRefresh = profile?.role === 'teacher' || profile?.role === 'admin';
  useDashboardAutoRefresh(refetch, shouldAutoRefresh, 60_000);

  // Live clock
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.replace('/login');
    }
  }, [authLoading, user, router]);

  // Load parent-specific data
  useEffect(() => {
    if (profile?.role === 'parent') {
      fetch('/api/parents/portal?section=summary')
        .then(res => res.json())
        .then(data => setParentChildren(data.children ?? []))
        .catch(err => console.error('Failed to load parent data:', err));
    }
  }, [profile?.role]);

  // Load timetable slots for teachers and schools
  useEffect(() => {
    if (profile?.role === 'teacher' || profile?.role === 'school') {
      fetch('/api/dashboard/timetable')
        .then(res => res.json())
        .then(data => setUpcomingSlots(data.slots ?? []))
        .catch(err => console.error('Failed to load timetable:', err));
    }
  }, [profile?.role]);

  // ── Loading / guard screens ────────────────────────────────────

  // Auth session resolving
  if (authLoading) {
    return <DashboardLoadingScreen message="Loading your dashboard…" />;
  }

  // No user — redirect queued
  if (!user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center mobile-page-root">
        <div className="flex flex-col items-center gap-4 text-center px-4">
          <div className="w-10 h-10 border-4 border-rose-500/20 border-t-rose-500 rounded-full animate-spin" />
          <p className="text-foreground font-semibold">Redirecting to login…</p>
        </div>
      </div>
    );
  }

  // Profile still fetching
  if (profileLoading) {
    return <DashboardLoadingScreen message="Setting up your workspace…" />;
  }

  // Session exists but profile could not be loaded (API error, no profile row, expired cookies).
  if (!profile) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4 mobile-page-root">
        <div className="max-w-md w-full border border-rose-500/25 bg-rose-500/5 p-6 sm:p-8 text-center space-y-4">
          <ExclamationTriangleIcon className="w-12 h-12 text-rose-600 dark:text-rose-400 mx-auto" />
          <h2 className="text-lg font-black text-foreground">We couldn&apos;t load your account</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            You still appear to be signed in, but your profile did not load. This often happens after a network hiccup,
            a server timeout, or if your session needs refreshing. Try again, or sign out and log back in.
          </p>
          <div className="flex flex-col sm:flex-row gap-2 justify-center pt-2">
            <button
              type="button"
              onClick={() => { void refreshProfile(); }}
              className="px-5 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-sm rounded-xl transition"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={() => { void signOut(); }}
              disabled={signingOut}
              className="px-5 py-2.5 border border-border text-foreground font-bold text-sm rounded-xl hover:bg-muted transition disabled:opacity-60"
            >
              {signingOut ? 'Signing out…' : 'Sign out'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Data loading - show skeleton
  if (dataLoading && !data.stats) {
    return (
      <div className="space-y-4 sm:space-y-6">
        {/* Welcome Banner */}
        <WelcomeBanner profile={profile} now={now} />
        <BillingStickyNotices />
        <DashboardSkeleton />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="space-y-4 sm:space-y-6">
        <WelcomeBanner profile={profile} now={now} />
        <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-6 text-center">
          <ExclamationTriangleIcon className="w-12 h-12 text-rose-600 dark:text-rose-400 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-foreground mb-2">Failed to Load Dashboard</h3>
          <p className="text-sm text-muted-foreground mb-4">{error}</p>
          <button
            onClick={() => refetch()}
            className="px-6 py-2 bg-rose-600 hover:bg-rose-500 text-foreground font-bold rounded-xl transition-all"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const role = profile.role as 'admin' | 'teacher' | 'student' | 'school' | 'parent';
  const quickActions = (QUICK_ACTIONS as any)[role] ?? QUICK_ACTIONS.student;

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Parents get a tailored welcome inside ParentDashboard — skip the shared banner. */}
      {role !== 'parent' && <WelcomeBanner profile={profile} now={now} />}
      <BillingStickyNotices />

      {/* Role-specific dashboard */}
      {role === 'admin' && (
        <AdminDashboard
          profile={profile}
          stats={transformStatsForAdmin(data.stats)}
          partnerSchoolStats={data.stats?.partnerSchoolStats || []}
          activities={transformActivities(data.activities)}
          schoolPayments={data.stats?.schoolPayments || []}
          quickActions={quickActions}
          dataLoading={dataLoading}
          onRefresh={refetch}
        />
      )}
      {role === 'teacher' && (
        <TeacherDashboard
          profile={profile}
          stats={transformStatsForTeacher(data.stats)}
          activities={transformActivities(data.activities)}
          upcomingSlots={upcomingSlots}
          teacherActionCenter={data.stats ? {
            ungradedAssignments: data.stats.ungradedAssignments || 0,
            ungradedExams: data.stats.ungradedExams || 0,
          } : null}
          quickActions={quickActions}
          dataLoading={dataLoading}
          onRefresh={refetch}
        />
      )}
      {role === 'school' && (
        <SchoolDashboard
          profile={profile}
          stats={transformStatsForSchool(data.stats)}
          activities={transformActivities(data.activities)}
          upcomingSlots={upcomingSlots}
          quickActions={quickActions}
          dataLoading={dataLoading}
          onRefresh={refetch}
        />
      )}
      {role === 'student' && <StudentDashboardWidget />}

      {role === 'parent' && (
        <ParentDashboard
          profile={profile}
          kids={parentChildren}
          dataLoading={dataLoading}
          onRefresh={refetch}
        />
      )}

      {/* Progress-report coverage — who still needs a report this term (staff + school) */}
      {['admin', 'teacher', 'school'].includes(role) && <ReportCoverageWidget />}

      {/* Inbox preview — role-scoped for staff, parent and student */}
      {['admin', 'teacher', 'school', 'parent', 'student'].includes(role) && <InboxPreviewWidget />}
    </div>
  );
}

// Helper component for welcome banner
function currentTermLabel(now: Date): { term: string; months: string; number: number; period: string; display: string } {
  const live = liveAcademicSession(now);
  const m = now.getMonth() + 1;
  const months = m >= 9 ? 'Sept – Dec' : m >= 5 ? 'May – Aug' : 'Jan – Apr';
  const number = live.termLabel === 'Third Term' ? 3 : live.termLabel === 'Second Term' ? 2 : 1;
  return {
    term: live.termLabel,
    months,
    number,
    period: live.periodLabel,
    display: formatAcademicSession(live),
  };
}

function WelcomeBanner({ profile, now }: { profile: any; now: Date | null }) {
  const role = profile.role;
  const termInfo = now ? currentTermLabel(now) : null;
  const firstName = profile.full_name?.split(' ')?.[0] || 'User';

  return (
    <section className="relative overflow-hidden rounded-2xl border border-border bg-card p-4 shadow-sm sm:rounded-3xl sm:p-8 sm:shadow-xl">
      <div className="pointer-events-none absolute right-0 top-0 hidden h-56 w-56 -translate-y-1/2 translate-x-1/3 rounded-full bg-primary/10 blur-3xl sm:block" />

      <div className="relative z-10 flex items-center justify-between gap-4 sm:gap-8">
        <div className="flex min-w-0 items-center gap-4 sm:gap-6">
          <div className="hidden h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-border bg-background p-3 shadow-sm sm:flex">
            <img src="/images/logo.png" alt="" className="h-full w-full object-contain" />
          </div>

          <div className="min-w-0">
            <div className="mb-2 flex min-w-0 items-center gap-2">
              <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-bold capitalize text-primary">
                {role} portal
              </span>
              {termInfo && (
                <span className="flex min-w-0 items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-[10px] font-semibold text-muted-foreground">
                  <AcademicCapIcon className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate sm:hidden">{termInfo.term}</span>
                  <span className="hidden truncate sm:inline">{termInfo.display} · {termInfo.months}</span>
                </span>
              )}
            </div>

            <h1 className="truncate text-xl font-bold tracking-tight text-foreground sm:text-4xl">
              Welcome back, <span className="text-primary">{firstName}</span>
            </h1>
            <p className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground sm:text-sm">
              <ClockIcon className="h-4 w-4 shrink-0 text-primary" />
              {now ? now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }) : ''}
            </p>
          </div>
        </div>

        <div className="relative z-10 hidden shrink-0 items-center gap-4 rounded-2xl border border-border bg-background/80 px-5 py-3 sm:flex">
          <div className="text-3xl font-bold tabular-nums text-foreground">
            {now ? now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' }) : '--:--'}
          </div>
          <div className="h-8 w-px bg-border" />
          <div>
            <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">Online</p>
            <p className="text-[10px] text-muted-foreground">Live updates</p>
          </div>
        </div>
      </div>
    </section>
  );
}
// Transform functions to match existing component interfaces
function transformStatsForAdmin(stats: any) {
  if (!stats) return [];
  return [
    { label: 'Approved Schools', value: stats.activeSchools || stats.totalSchools || 0, icon: BuildingOfficeIcon, gradient: 'from-primary to-primary' },
    { label: 'School Accounts', value: stats.totalPartners || 0, icon: ShieldCheckIcon, gradient: 'from-primary to-primary' },
    { label: 'Active Teachers', value: stats.totalTeachers || 0, icon: AcademicCapIcon, gradient: 'from-primary to-primary' },
    { label: 'Active Students', value: stats.totalStudents || 0, icon: UserGroupIcon, gradient: 'from-primary to-primary' },
    { label: 'Graded Results', value: stats.totalGraded || 0, icon: ChartBarIcon, gradient: 'from-primary to-primary' },
  ];
}

function transformStatsForTeacher(stats: any) {
  if (!stats) return [];
  return [
    { label: 'My Classes', value: stats.classes || 0, icon: BookOpenIcon, gradient: 'from-primary to-primary' },
    { label: 'Total Students', value: stats.totalStudents || 0, icon: UserGroupIcon, gradient: 'from-primary to-primary' },
    { label: 'Pending Grading', value: stats.pendingGrading || 0, icon: ClipboardDocumentListIcon, gradient: 'from-primary to-primary' },
    { label: 'Avg Class Perf', value: `${stats.avgPerformance || 0}%`, icon: ChartBarIcon, gradient: 'from-primary to-primary' },
  ];
}

function transformStatsForSchool(stats: any) {
  if (!stats) return [];
  return [
    { label: 'Registered Students', value: stats.totalStudents || 0, icon: UserGroupIcon, gradient: 'from-primary to-primary' },
    { label: 'Assigned Teachers', value: stats.assignedTeachers || 0, icon: AcademicCapIcon, gradient: 'from-primary to-primary' },
    { label: 'Student Perf. Avg', value: `${stats.avgPerformance || 0}%`, icon: ChartBarIcon, gradient: 'from-primary to-primary' },
    { label: 'Graded Results', value: stats.submissionsCount || 0, icon: ClipboardDocumentListIcon, gradient: 'from-primary to-primary' },
  ];
}

function transformActivities(activities: any[]) {
  if (!activities) return [];
  return activities.map((a: any) => ({
    id: a.id,
    title: a.title,
    desc: a.description,
    time: a.time_ago,
    icon: a.icon_type === 'trophy' ? TrophyIcon : ClipboardDocumentListIcon,
    color: a.color_class === 'emerald' ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400' : 'bg-primary/20 text-primary',
  }));
}
