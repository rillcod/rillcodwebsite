// @refresh reset
// Optimized Dashboard - Uses API routes and caching
'use client';

import { useAuth } from '@/contexts/auth-context';
import {
  ClockIcon, ExclamationTriangleIcon, BuildingOfficeIcon,
  AcademicCapIcon, ChartBarIcon, CogIcon, UserPlusIcon,
  UserGroupIcon, ClipboardDocumentListIcon, BookOpenIcon,
  RocketLaunchIcon, TrophyIcon, BanknotesIcon, ShieldCheckIcon
} from '@/lib/icons';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import StudentDashboardWidget from '@/components/dashboard/StudentDashboard';
import AdminDashboard from '@/components/dashboard/AdminDashboard';
import TeacherDashboard from '@/components/dashboard/TeacherDashboard';
import SchoolDashboard from '@/components/dashboard/SchoolDashboard';
import ParentDashboard from '@/components/dashboard/ParentDashboard';
import BillingStickyNotices from '@/components/billing/BillingStickyNotices';
import { DashboardSkeleton } from '@/components/dashboard/DashboardSkeleton';
import { useDashboardData, useDashboardAutoRefresh } from '@/hooks/useDashboardData';
import InboxPreviewWidget from '@/components/dashboard/InboxPreviewWidget';

/* ── Quick actions by role ────────────────────────────── */
const QUICK_ACTIONS = {
  admin: [
    { name: 'Partner Schools', href: '/dashboard/schools', icon: BuildingOfficeIcon, desc: 'View and approve schools' },
    { name: 'Manage Teachers', href: '/dashboard/teachers', icon: AcademicCapIcon, desc: 'View and manage staff' },
    { name: 'Analytics', href: '/dashboard/analytics', icon: ChartBarIcon, desc: 'System-wide analytics' },
    { name: 'Settings', href: '/dashboard/settings', icon: CogIcon, desc: 'Account preferences' },
  ],
  teacher: [
    { name: 'Register Students', href: '/dashboard/students/bulk-register', icon: UserPlusIcon, desc: 'Add students individually or in bulk' },
    { name: 'My Students', href: '/dashboard/students', icon: UserGroupIcon, desc: 'View & manage student roster' },
    { name: 'Assignments', href: '/dashboard/assignments', icon: ClipboardDocumentListIcon, desc: 'Create & grade work' },
    { name: 'Classes', href: '/dashboard/classes', icon: BookOpenIcon, desc: 'Manage your classes' },
  ],
  student: [
    { name: 'Learning Center', href: '/dashboard/learning', icon: RocketLaunchIcon, desc: 'View enrolled programs' },
    { name: 'Path Progress', href: '/dashboard/path-progress', icon: ChartBarIcon, desc: 'See your current path and week' },
    { name: 'Assignments', href: '/dashboard/assignments', icon: ClipboardDocumentListIcon, desc: 'View & submit work' },
    { name: 'My Progress', href: '/dashboard/progress', icon: ChartBarIcon, desc: 'Track your progress' },
  ],
  school: [
    { name: 'My Students', href: '/dashboard/students', icon: UserGroupIcon, desc: 'View enrolled students' },
    { name: 'Classes', href: '/dashboard/classes', icon: BookOpenIcon, desc: 'View class rosters' },
    { name: 'Grades & Reports', href: '/dashboard/results', icon: TrophyIcon, desc: 'View student grades' },
    { name: 'My Billing', href: '/dashboard/finance?tab=billing_cycles', icon: BanknotesIcon, desc: 'Invoices, payments, and receipts for your school' },
  ],};

/* ── Main Component ───────────────────────────────────── */
export default function DashboardPage() {
  const { user, profile, loading: authLoading, profileLoading, refreshProfile, signOut } = useAuth();
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
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-border border-t-orange-500 rounded-full animate-spin" />
          <p className="text-muted-foreground text-sm">Loading your dashboard…</p>
        </div>
      </div>
    );
  }

  // No user — redirect queued
  if (!user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-center px-4">
          <div className="w-10 h-10 border-4 border-rose-500/20 border-t-rose-500 rounded-full animate-spin" />
          <p className="text-foreground font-semibold">Redirecting to login…</p>
        </div>
      </div>
    );
  }

  // Profile still fetching
  if (profileLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-border border-t-orange-500 rounded-full animate-spin" />
          <p className="text-muted-foreground text-sm">Setting up your workspace…</p>
        </div>
      </div>
    );
  }

  // Session exists but profile could not be loaded (API error, no profile row, expired cookies).
  // Previously this branch matched `!profile` forever and showed an infinite spinner.
  if (!profile) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="max-w-md w-full border border-rose-500/25 bg-rose-500/5 p-6 sm:p-8 text-center space-y-4">
          <ExclamationTriangleIcon className="w-12 h-12 text-rose-400 mx-auto" />
          <h2 className="text-lg font-black text-foreground">We couldn&apos;t load your account</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            You still appear to be signed in, but your profile did not load. This often happens after a network hiccup,
            a server timeout, or if your session needs refreshing. Try again, or sign out and log back in.
          </p>
          <div className="flex flex-col sm:flex-row gap-2 justify-center pt-2">
            <button
              type="button"
              onClick={() => { void refreshProfile(); }}
              className="px-5 py-2.5 bg-orange-600 hover:bg-orange-500 text-white font-bold text-sm rounded-none transition"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={() => { void signOut(); }}
              className="px-5 py-2.5 border border-border text-foreground font-bold text-sm rounded-none hover:bg-muted transition"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Data loading - show skeleton
  if (dataLoading && !data.stats) {
    return (
      <div className="space-y-6">
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
      <div className="space-y-6">
        <WelcomeBanner profile={profile} now={now} />
        <div className="bg-rose-500/10 border border-rose-500/20 rounded-none p-6 text-center">
          <ExclamationTriangleIcon className="w-12 h-12 text-rose-400 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-foreground mb-2">Failed to Load Dashboard</h3>
          <p className="text-sm text-muted-foreground mb-4">{error}</p>
          <button
            onClick={() => refetch()}
            className="px-6 py-2 bg-rose-600 hover:bg-rose-500 text-foreground font-bold rounded-none transition-all"
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
    <div className="space-y-6">
      <WelcomeBanner profile={profile} now={now} />
      <BillingStickyNotices />

      {/* Role-specific dashboard */}
      {role === 'admin' && (
        <AdminDashboard
          profile={profile}
          stats={transformStatsForAdmin(data.stats)}
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

      {/* Inbox preview — role-scoped for staff, parent and student */}
      {['admin', 'teacher', 'school', 'parent', 'student'].includes(role) && <InboxPreviewWidget />}

      {role === 'parent' && (
        <ParentDashboard
          profile={profile}
          kids={parentChildren}
          dataLoading={dataLoading}
          onRefresh={refetch}
        />
      )}
    </div>
  );
}

// Helper component for welcome banner
function WelcomeBanner({ profile, now }: { profile: any; now: Date | null }) {
  const role = profile.role;
  
  return (
    <div className="bg-background border border-border rounded-none shadow-2xl p-6 sm:p-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6 sm:gap-8 relative overflow-hidden">
      <div className="absolute top-0 right-0 -translate-y-12 translate-x-12 w-64 h-64 bg-card opacity-[0.03] rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 translate-y-12 -translate-x-12 w-48 h-48 bg-brand-red-600 opacity-20 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center gap-6">
        <div className="flex-shrink-0 p-4 bg-muted backdrop-blur-md rounded-none border border-border shadow-2xl">
          <img src="/images/logo.png" alt="Rillcod Logo" className="w-16 h-16 sm:w-20 sm:h-20 object-contain drop-shadow-[0_0_15px_rgba(255,255,255,0.3)]" />
        </div>
        <div>
          <div className="flex items-center gap-2 mb-4">
            <span className="px-3 py-1 bg-brand-red-600 text-white text-[10px] font-black uppercase tracking-widest rounded-full">
              {role} Portal
            </span>
            <div className="h-px w-8 bg-muted" />
            <span className="text-[10px] font-bold text-orange-500/60 uppercase tracking-widest">Global Status: Online</span>
          </div>
          <h1 className="text-3xl sm:text-5xl font-black text-foreground tracking-tight leading-tight">
            Welcome back,<br className="sm:hidden" /> {profile.full_name?.split(' ')?.[0] || 'User'}!
          </h1>
          <p className="text-orange-500/60 text-sm sm:text-base mt-3 font-medium flex items-center gap-2">
            <ClockIcon className="w-4 h-4" />
            {now ? now.toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : ''}
          </p>
        </div>
      </div>

      <div className="relative z-10 flex sm:flex-row items-center gap-4 sm:gap-6 bg-card shadow-sm backdrop-blur-xl border border-border rounded-none p-4 sm:p-6 shadow-2xl">
        <div className="text-3xl sm:text-5xl font-black text-foreground tracking-tighter tabular-nums">
          {now ? now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' }) : '--:--'}
        </div>
        <div className="h-8 w-px bg-muted hidden sm:block" />
        <div className="flex flex-col items-start gap-1">
          <div className="flex items-center gap-1.5 px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full">
            <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse shadow-[0_0_8px_rgba(74,222,128,0.8)]" />
            <span className="text-[8px] sm:text-[10px] text-emerald-400 font-black uppercase tracking-widest">Active</span>
          </div>
          <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest ml-1">Live Feed</p>
        </div>
      </div>
    </div>
  );
}

// Transform functions to match existing component interfaces
function transformStatsForAdmin(stats: any) {
  if (!stats) return [];
  return [
    { label: 'Partner Schools', value: stats.totalSchools || 0, icon: BuildingOfficeIcon, gradient: 'from-orange-600 to-orange-400' },
    { label: 'Active Teachers', value: stats.totalTeachers || 0, icon: AcademicCapIcon, gradient: 'from-orange-600 to-orange-400' },
    { label: 'Total Students', value: stats.totalStudents || 0, icon: UserGroupIcon, gradient: 'from-orange-600 to-orange-400' },
    { label: 'Submissions Graded', value: stats.totalGraded || 0, icon: ChartBarIcon, gradient: 'from-orange-600 to-orange-400' },
  ];
}

function transformStatsForTeacher(stats: any) {
  if (!stats) return [];
  return [
    { label: 'My Classes', value: stats.classes || 0, icon: BookOpenIcon, gradient: 'from-orange-600 to-orange-400' },
    { label: 'Total Students', value: stats.totalStudents || 0, icon: UserGroupIcon, gradient: 'from-orange-600 to-orange-400' },
    { label: 'Pending Grading', value: stats.pendingGrading || 0, icon: ClipboardDocumentListIcon, gradient: 'from-orange-600 to-orange-400' },
    { label: 'Avg Class Perf', value: `${stats.avgPerformance || 0}%`, icon: ChartBarIcon, gradient: 'from-orange-600 to-orange-400' },
  ];
}

function transformStatsForSchool(stats: any) {
  if (!stats) return [];
  return [
    { label: 'Registered Students', value: stats.portalStudents || 0, icon: UserGroupIcon, gradient: 'from-orange-600 to-orange-400' },
    { label: 'Assigned Teachers', value: stats.assignedTeachers || 0, icon: AcademicCapIcon, gradient: 'from-orange-600 to-orange-400' },
    { label: 'Student Perf. Avg', value: `${stats.avgPerformance || 0}%`, icon: ChartBarIcon, gradient: 'from-orange-600 to-orange-400' },
    { label: 'Submissions Count', value: stats.submissionsCount || 0, icon: ClipboardDocumentListIcon, gradient: 'from-orange-600 to-orange-400' },
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
    color: a.color_class === 'emerald' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-orange-500/20 text-orange-400',
  }));
}
