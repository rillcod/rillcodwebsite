'use client';

import { useAuth } from '@/contexts/auth-context';
import {
  UserGroupIcon, AcademicCapIcon, BookOpenIcon, ChartBarIcon, CogIcon,
  BuildingOfficeIcon, ClipboardDocumentListIcon, PresentationChartLineIcon,
  ClockIcon, CheckCircleIcon, BellIcon, ArrowRightIcon, TrophyIcon,
  ArrowPathIcon, ExclamationTriangleIcon, ShieldCheckIcon, DocumentTextIcon,
} from '@heroicons/react/24/outline';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

/* ── Types ────────────────────────────────────────────── */
interface DashStats { label: string; value: string | number; change?: string; icon: any; gradient: string }
interface Activity { id: string; title: string; desc: string; time: string; icon: any; color: string }

/* ── Helpers ──────────────────────────────────────────── */
function timeAgo(iso: string | null): string {
  if (!iso) return '—';
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

/* ── Real-data hooks per role ─────────────────────────── */
async function loadAdminStats(supabase: ReturnType<typeof createClient>) {
  const [schools, teachers, students, partnerships, submissions] = await Promise.allSettled([
    supabase.from('schools').select('id, status', { count: 'exact', head: true }),
    supabase.from('portal_users').select('id', { count: 'exact', head: true }).eq('role', 'teacher').eq('is_active', true),
    supabase.from('students').select('id', { count: 'exact', head: true }),
    supabase.from('portal_users').select('id', { count: 'exact', head: true }).eq('role', 'school').eq('is_active', true),
    supabase.from('assignment_submissions').select('id, grade', { count: 'exact', head: false }).not('grade', 'is', null),
  ]);
  const totalSchools = schools.status === 'fulfilled' ? (schools.value.count ?? 0) : 0;
  const totalTeachers = teachers.status === 'fulfilled' ? (teachers.value.count ?? 0) : 0;
  const totalStudents = students.status === 'fulfilled' ? (students.value.count ?? 0) : 0;
  const totalPartners = partnerships.status === 'fulfilled' ? (partnerships.value.count ?? 0) : 0;

  return [
    { label: 'Partner Schools', value: totalSchools, icon: BuildingOfficeIcon, gradient: 'from-blue-600 to-blue-400' },
    { label: 'Partner Accounts', value: totalPartners, icon: ShieldCheckIcon, gradient: 'from-cyan-600 to-cyan-400' },
    { label: 'Active Teachers', value: totalTeachers, icon: AcademicCapIcon, gradient: 'from-violet-600 to-violet-400' },
    { label: 'Total Students', value: totalStudents, icon: UserGroupIcon, gradient: 'from-emerald-600 to-emerald-400' },
    { label: 'Submissions Graded', value: submissions.status === 'fulfilled' ? (submissions.value.count ?? 0) : 0, icon: ChartBarIcon, gradient: 'from-amber-600 to-amber-400' },
  ] as DashStats[];
}

async function loadAdminActivity(supabase: ReturnType<typeof createClient>): Promise<Activity[]> {
  const { data } = await supabase
    .from('assignment_submissions')
    .select('id, status, submitted_at, portal_users!assignment_submissions_portal_user_id_fkey(full_name), assignments(title)')
    .order('submitted_at', { ascending: false })
    .limit(5);
  return (data ?? []).map((s: any) => ({
    id: s.id,
    title: `${s.portal_users?.full_name ?? 'Student'} submitted`,
    desc: s.assignments?.title ?? '—',
    time: timeAgo(s.submitted_at),
    icon: ClipboardDocumentListIcon,
    color: 'bg-violet-500/20 text-violet-400',
  }));
}

async function loadTeacherStats(supabase: ReturnType<typeof createClient>, userId: string) {
  const [classes, pending, subs] = await Promise.allSettled([
    supabase.from('classes').select('id', { count: 'exact', head: true }).eq('teacher_id', userId),
    supabase.from('assignment_submissions')
      .select('id, assignments!inner(created_by)', { count: 'exact', head: true })
      .eq('status', 'submitted')
      .eq('assignments.created_by', userId),
    supabase.from('assignment_submissions')
      .select('grade, assignments!inner(created_by)')
      .eq('assignments.created_by', userId)
      .not('grade', 'is', null)
      .limit(100),
  ]);
  const myClasses = classes.status === 'fulfilled' ? (classes.value.count ?? 0) : 0;
  const pendingGrade = pending.status === 'fulfilled' ? (pending.value.count ?? 0) : 0;
  const grades = subs.status === 'fulfilled' ? (subs.value.data ?? []) : [];
  const avg = grades.length > 0
    ? Math.round(grades.reduce((s: number, g: any) => s + (g.grade ?? 0), 0) / grades.length)
    : 0;
  return [
    { label: 'My Classes', value: myClasses, icon: BookOpenIcon, gradient: 'from-blue-600 to-blue-400' },
    { label: 'Pending Grading', value: pendingGrade, icon: ClipboardDocumentListIcon, gradient: 'from-amber-600 to-amber-400' },
    { label: 'Avg Score (My Asgn)', value: `${avg}%`, icon: ChartBarIcon, gradient: 'from-violet-600 to-violet-400' },
    { label: 'Graded Total', value: grades.length, icon: CheckCircleIcon, gradient: 'from-emerald-600 to-emerald-400' },
  ] as DashStats[];
}

async function loadTeacherActivity(supabase: ReturnType<typeof createClient>, userId: string): Promise<Activity[]> {
  const { data } = await supabase
    .from('assignment_submissions')
    .select('id, status, submitted_at, portal_users!assignment_submissions_portal_user_id_fkey(full_name), assignments!inner(title, created_by)')
    .eq('assignments.created_by', userId)
    .order('submitted_at', { ascending: false })
    .limit(5);
  return (data ?? []).map((s: any) => ({
    id: s.id,
    title: `${s.portal_users?.full_name ?? 'Student'} submitted`,
    desc: s.assignments?.title ?? '—',
    time: timeAgo(s.submitted_at),
    icon: ClipboardDocumentListIcon,
    color: s.status === 'graded' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-blue-500/20 text-blue-400',
  }));
}

async function loadStudentStats(supabase: ReturnType<typeof createClient>, userId: string) {
  const [enr, subs, graded] = await Promise.allSettled([
    supabase.from('enrollments').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    supabase.from('assignment_submissions').select('id', { count: 'exact', head: true }).eq('portal_user_id', userId),
    supabase.from('assignment_submissions').select('grade, assignments(max_points)')
      .eq('portal_user_id', userId).not('grade', 'is', null).limit(50),
  ]);
  const enrolled = enr.status === 'fulfilled' ? (enr.value.count ?? 0) : 0;
  const totalSubs = subs.status === 'fulfilled' ? (subs.value.count ?? 0) : 0;
  const gradedData = graded.status === 'fulfilled' ? (graded.value.data ?? []) : [];
  const avgPct = gradedData.length > 0
    ? Math.round(gradedData.reduce((s: number, g: any) => {
      const max = g.assignments?.max_points ?? 100;
      return s + (g.grade / max) * 100;
    }, 0) / gradedData.length)
    : 0;
  const { letter } = avgPct >= 90 ? { letter: 'A' } : avgPct >= 80 ? { letter: 'B' } :
    avgPct >= 70 ? { letter: 'C' } : avgPct >= 60 ? { letter: 'D' } : { letter: 'F' };
  return [
    { label: 'Enrolled Courses', value: enrolled, icon: BookOpenIcon, gradient: 'from-blue-600 to-blue-400' },
    { label: 'Assignments Done', value: totalSubs, icon: ClipboardDocumentListIcon, gradient: 'from-violet-600 to-violet-400' },
    { label: 'Graded Work', value: gradedData.length, icon: CheckCircleIcon, gradient: 'from-emerald-600 to-emerald-400' },
    { label: 'Overall Grade', value: gradedData.length ? `${letter} (${avgPct}%)` : '—', icon: TrophyIcon, gradient: 'from-amber-600 to-amber-400' },
  ] as DashStats[];
}

async function loadStudentActivity(supabase: ReturnType<typeof createClient>, userId: string): Promise<Activity[]> {
  const { data } = await supabase
    .from('assignment_submissions')
    .select('id, grade, status, submitted_at, assignments(title, max_points)')
    .eq('portal_user_id', userId)
    .order('submitted_at', { ascending: false })
    .limit(5);
  return (data ?? []).map((s: any) => ({
    id: s.id,
    title: s.status === 'graded' ? 'Grade received' : 'Assignment submitted',
    desc: `${s.assignments?.title ?? '—'}${s.grade != null ? ` · ${s.grade}/${s.assignments?.max_points ?? 100}` : ''}`,
    time: timeAgo(s.submitted_at),
    icon: s.status === 'graded' ? TrophyIcon : ClipboardDocumentListIcon,
    color: s.status === 'graded' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-blue-500/20 text-blue-400',
  }));
}

async function loadSchoolStats(supabase: ReturnType<typeof createClient>, schoolId: string) {
  const [students, teachers, graded] = await Promise.allSettled([
    supabase.from('students').select('id', { count: 'exact', head: true }).eq('school_id', schoolId),
    supabase.from('teacher_schools').select('id', { count: 'exact', head: true }).eq('school_id', schoolId),
    supabase.from('assignment_submissions')
      .select('grade, portal_users!inner(school_id)')
      .eq('portal_users.school_id', schoolId)
      .not('grade', 'is', null)
      .limit(200),
  ]);
  const totalStudents = students.status === 'fulfilled' ? (students.value.count ?? 0) : 0;
  const totalTeachers = teachers.status === 'fulfilled' ? (teachers.value.count ?? 0) : 0;
  const grades = graded.status === 'fulfilled' ? (graded.value.data ?? []) : [];
  const avg = grades.length > 0
    ? Math.round(grades.reduce((s: number, g: any) => s + (Number(g.grade) || 0), 0) / grades.length)
    : 0;

  return [
    { label: 'Registered Students', value: totalStudents, icon: UserGroupIcon, gradient: 'from-blue-600 to-blue-400' },
    { label: 'Assigned Teachers', value: totalTeachers, icon: AcademicCapIcon, gradient: 'from-violet-600 to-violet-400' },
    { label: 'Student Perf. Avg', value: `${avg}%`, icon: ChartBarIcon, gradient: 'from-emerald-600 to-emerald-400' },
    { label: 'Submissions Count', value: grades.length, icon: ClipboardDocumentListIcon, gradient: 'from-amber-600 to-amber-400' },
  ] as DashStats[];
}

async function loadSchoolActivity(supabase: ReturnType<typeof createClient>, schoolId: string): Promise<Activity[]> {
  const { data } = await supabase
    .from('assignment_submissions')
    .select('id, status, submitted_at, portal_users!inner(full_name, school_id), assignments(title)')
    .eq('portal_users.school_id', schoolId)
    .order('submitted_at', { ascending: false })
    .limit(5);
  return (data ?? []).map((s: any) => ({
    id: s.id,
    title: `${s.portal_users?.full_name ?? 'Student'} submitted`,
    desc: s.assignments?.title ?? '—',
    time: timeAgo(s.submitted_at),
    icon: ClipboardDocumentListIcon,
    color: 'bg-emerald-500/20 text-emerald-400',
  }));
}

/* ── Quick actions by role ────────────────────────────── */
const QUICK_ACTIONS = {
  admin: [
    { name: 'Partner Schools', href: '/dashboard/schools', icon: BuildingOfficeIcon, desc: 'View and approve schools' },
    { name: 'Manage Teachers', href: '/dashboard/teachers', icon: AcademicCapIcon, desc: 'View and manage staff' },
    { name: 'Analytics', href: '/dashboard/analytics', icon: ChartBarIcon, desc: 'System-wide analytics' },
    { name: 'Settings', href: '/dashboard/settings', icon: CogIcon, desc: 'Account preferences' },
  ],
  teacher: [
    { name: 'My Students', href: '/dashboard/students', icon: UserGroupIcon, desc: 'View student roster' },
    { name: 'Assignments', href: '/dashboard/assignments', icon: ClipboardDocumentListIcon, desc: 'Create & grade work' },
    { name: 'Classes', href: '/dashboard/classes', icon: BookOpenIcon, desc: 'Manage your classes' },
    { name: 'My Schools', href: '/dashboard/settings', icon: BuildingOfficeIcon, desc: 'View assigned schools' },
  ],
  student: [
    { name: 'My Courses', href: '/dashboard/courses', icon: BookOpenIcon, desc: 'View enrolled courses' },
    { name: 'Assignments', href: '/dashboard/assignments', icon: ClipboardDocumentListIcon, desc: 'View & submit work' },
    { name: 'My Progress', href: '/dashboard/progress', icon: ChartBarIcon, desc: 'Track your progress' },
    { name: 'Grades', href: '/dashboard/grades', icon: TrophyIcon, desc: 'See your grades' },
  ],
  school: [
    { name: 'My Students', href: '/dashboard/students', icon: UserGroupIcon, desc: 'View enrolled students' },
    { name: 'Grades & Reports', href: '/dashboard/grades', icon: TrophyIcon, desc: 'View student grades' },
    { name: 'Activity', href: '/dashboard/progress', icon: ChartBarIcon, desc: 'Track student progress' },
    { name: 'Messages', href: '/dashboard/messages', icon: ClipboardDocumentListIcon, desc: 'Contact teachers & admin' },
  ],
};

/* ── Main Component ───────────────────────────────────── */
export default function DashboardPage() {
  const { user, profile, loading } = useAuth();
  const router = useRouter();
  const [now, setNow] = useState<Date | null>(null);
  const [authHardStop, setAuthHardStop] = useState(false);
  const [profileHardStop, setProfileHardStop] = useState(false);
  const [stats, setStats] = useState<DashStats[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [dataLoading, setDataLoading] = useState(false);

  // Live clock — set only on client to avoid SSR hydration mismatch
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Auth hard-stop: 2s to handle no-user redirect
  useEffect(() => {
    const t = setTimeout(() => setAuthHardStop(true), 2000);
    return () => clearTimeout(t);
  }, []);

  // Profile hard-stop: 8s — only show error if user exists but profile never loaded
  // (mobile / slow connections need more time for the Supabase profile fetch)
  useEffect(() => {
    const t = setTimeout(() => setProfileHardStop(true), 8000);
    return () => clearTimeout(t);
  }, []);

  // Only redirect after the hard stop fires (2s), giving onAuthStateChange time to propagate.
  // NEVER use ?clear=1 here — that destroys a valid server-side session and creates a loop.
  useEffect(() => {
    if (authHardStop && !user) {
      router.replace('/login');
    }
  }, [authHardStop, user, router]);

  // Fetch live stats once we know the role
  const fetchDashData = useCallback(async () => {
    if (!profile) return;
    setDataLoading(true);
    try {
      const supabase = createClient();
      const role = profile.role;
      const [s, a] = await Promise.all([
        role === 'admin' ? loadAdminStats(supabase) :
          role === 'teacher' ? loadTeacherStats(supabase, profile.id) :
            role === 'school' ? loadSchoolStats(supabase, profile.school_id!) :
              loadStudentStats(supabase, profile.id),
        role === 'admin' ? loadAdminActivity(supabase) :
          role === 'teacher' ? loadTeacherActivity(supabase, profile.id) :
            role === 'school' ? loadSchoolActivity(supabase, profile.school_id!) :
              loadStudentActivity(supabase, profile.id),
      ]);
      setStats(s);
      setActivities(a);
    } catch { /* silent */ } finally {
      setDataLoading(false);
    }
  }, [profile?.id, profile?.role]); // eslint-disable-line

  useEffect(() => { fetchDashData(); }, [fetchDashData]);

  // ── Loading / guard screens ────────────────────────────────────
  // Show spinner while: auth is loading, OR auth resolved with no user but hard-stop hasn't fired yet
  // (the 2s window gives onAuthStateChange time to propagate a SIGNED_IN event)
  if (loading || (!user && !authHardStop)) return (
    <div className="min-h-screen bg-[#050a17] flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-4 border-white/10 border-t-violet-500 rounded-full animate-spin" />
        <p className="text-white/40 text-sm">Loading your dashboard…</p>
        <a href="/login" className="mt-2 text-xs text-violet-400 hover:text-violet-300 underline underline-offset-2 transition-colors">
          Sign in instead →
        </a>
      </div>
    </div>
  );

  // Auth fully resolved with no user — redirect is queued in useEffect above
  if (!user) return (
    <div className="min-h-screen bg-[#050a17] flex items-center justify-center">
      <div className="flex flex-col items-center gap-4 text-center px-4">
        <div className="w-10 h-10 border-4 border-rose-500/20 border-t-rose-500 rounded-full animate-spin" />
        <p className="text-white font-semibold">Redirecting to login…</p>
        <a href="/login"
          className="mt-2 px-6 py-2 bg-rose-600/20 hover:bg-rose-600/40 text-rose-400 text-sm font-bold rounded-xl border border-rose-600/30 transition-colors">
          Go to Login
        </a>
      </div>
    </div>
  );

  // ── Session exists but profile hasn't resolved yet ────────────────
  if (!profile) return (
    <div className="min-h-screen bg-[#050a17] flex flex-col items-center justify-center p-6 text-center">
      {profileHardStop ? (
        <div className="flex flex-col items-center gap-6 animate-in fade-in zoom-in duration-500">
          <div className="w-20 h-20 bg-rose-500/10 border border-rose-500/20 rounded-[2rem] flex items-center justify-center shadow-2xl shadow-rose-500/10 mb-2">
            <ExclamationTriangleIcon className="w-10 h-10 text-rose-400" />
          </div>
          <div className="space-y-2">
            <h2 className="text-white font-black text-2xl tracking-tight">Portal Insight Required</h2>
            <p className="text-white/40 text-sm max-w-sm leading-relaxed">
              Your authentication was successful, but we couldn't resolve your portal privileges in time. This could be a slow connection or a missing profile.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 w-full max-w-xs">
            <button onClick={() => window.location.reload()}
              className="px-6 py-3 bg-white/5 hover:bg-white/10 text-white text-sm font-bold rounded-2xl border border-white/10 transition-all">
              Reload Page
            </button>
            <a href="/login?clear=1"
              className="px-6 py-3 bg-rose-600 hover:bg-rose-500 text-white text-sm font-bold rounded-2xl transition-all shadow-lg shadow-rose-900/40">
              Sign Out &amp; Retry
            </a>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-6">
          <div className="relative">
            <div className="w-16 h-16 border-4 border-white/5 border-t-violet-500 rounded-full animate-spin" />
            <div className="absolute inset-x-0 -bottom-8 flex justify-center">
              <span className="text-[10px] font-black text-violet-400 uppercase tracking-[0.2em] animate-pulse">Initializing</span>
            </div>
          </div>
          <div className="mt-4">
            <p className="text-white/20 text-xs font-medium italic">Fetching secure portal session...</p>
          </div>
        </div>
      )}
    </div>
  );

  const role = profile.role as 'admin' | 'teacher' | 'student' | 'school';
  const quickActions = QUICK_ACTIONS[role] ?? QUICK_ACTIONS.student;

  return (
    <div className="space-y-6">

      {/* ── Welcome Banner ── */}
      <div className="bg-gradient-to-r from-[#0B132B] to-[#1a2b54] rounded-2xl shadow-lg p-6 sm:p-8
        flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 relative overflow-hidden">
        {/* Decorative blobs */}
        <div className="absolute top-0 right-0 -translate-y-12 translate-x-12 w-64 h-64 bg-white opacity-5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 translate-y-12 -translate-x-12 w-48 h-48 bg-violet-600 opacity-20 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10">
          <span className="inline-block px-3 py-1 bg-violet-600/80 text-white text-xs font-bold uppercase tracking-wider rounded-full mb-3">
            {role} Portal
          </span>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Welcome back, {profile.full_name?.split(' ')?.[0] || 'User'}!
          </h1>
          <p className="text-blue-200 text-sm mt-2 font-medium">
            {now ? now.toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : ''}
          </p>
        </div>

        <div className="relative z-10 flex-shrink-0 bg-white/10 backdrop-blur-md border border-white/20 rounded-xl px-6 py-4 flex flex-col items-center">
          <div className="text-3xl font-mono font-bold text-white tracking-widest">
            {now ? now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' }) : '--:--'}
          </div>
          <div className="flex items-center gap-2 mt-2 bg-white/10 px-3 py-1 rounded-full">
            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse shadow-[0_0_8px_rgba(74,222,128,0.8)]" />
            <span className="text-xs text-white font-medium uppercase tracking-wider">System Online</span>
          </div>
        </div>
      </div>

      {/* ── Stats Grid ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {dataLoading
          ? Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white/5 border border-white/10 rounded-2xl p-6 animate-pulse">
              <div className="h-10 w-10 bg-white/10 rounded-xl mb-4" />
              <div className="h-8 bg-white/10 rounded w-1/2 mb-2" />
              <div className="h-4 bg-white/5 rounded w-2/3" />
            </div>
          ))
          : stats.map(({ label, value, icon: Icon, gradient }) => (
            <div key={label} className="bg-white/5 border border-white/10 rounded-2xl p-6 hover:bg-white/8 hover:border-white/20 transition-all group">
              <div className="flex items-start justify-between mb-4">
                <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center shadow-lg`}>
                  <Icon className="h-5 w-5 text-white" />
                </div>
                <span className="text-[10px] font-bold text-white/25 uppercase tracking-widest bg-white/5 px-2 py-0.5 rounded-full">Live</span>
              </div>
              <p className="text-3xl font-extrabold text-white">{value}</p>
              <p className="text-white/40 text-sm mt-1">{label}</p>
            </div>
          ))
        }
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* ── Left: Quick Actions + Activity ── */}
        <div className="xl:col-span-2 space-y-6">

          {/* Quick Actions */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
            <h2 className="text-lg font-bold text-white mb-5">Quick Actions</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {quickActions.map(({ name, href, icon: Icon, desc }) => (
                <Link key={name} href={href}
                  className="group flex items-start gap-4 p-4 rounded-xl border border-white/10 hover:border-violet-500/40 hover:bg-violet-500/5 transition-all">
                  <div className="w-10 h-10 rounded-xl bg-violet-500/15 border border-violet-500/20 flex items-center justify-center flex-shrink-0 group-hover:bg-violet-500/25 transition-colors">
                    <Icon className="h-5 w-5 text-violet-400" />
                  </div>
                  <div>
                    <p className="font-semibold text-white text-sm group-hover:text-violet-200 transition-colors">{name}</p>
                    <p className="text-xs text-white/40 mt-0.5">{desc}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          {/* Recent Activity — live from DB */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-white">Recent Activity</h2>
              <button onClick={fetchDashData} className="p-1.5 rounded-lg hover:bg-white/10 text-white/30 hover:text-white transition-colors" title="Refresh">
                <ArrowPathIcon className={`w-4 h-4 ${dataLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>
            {dataLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => (
                  <div key={i} className="flex items-center gap-3 animate-pulse">
                    <div className="w-9 h-9 bg-white/10 rounded-xl flex-shrink-0" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3.5 bg-white/10 rounded w-3/4" />
                      <div className="h-3 bg-white/5 rounded w-1/2" />
                    </div>
                    <div className="h-3 bg-white/5 rounded w-12" />
                  </div>
                ))}
              </div>
            ) : activities.length === 0 ? (
              <div className="text-center py-8">
                <ClipboardDocumentListIcon className="w-10 h-10 mx-auto text-white/10 mb-2" />
                <p className="text-white/25 text-sm">No recent activity yet</p>
              </div>
            ) : (
              <div className="space-y-1">
                {activities.map((a, i) => (
                  <div key={a.id} className={`flex items-start gap-3 py-3 ${i < activities.length - 1 ? 'border-b border-white/5' : ''}`}>
                    <div className={`w-9 h-9 rounded-xl ${a.color} flex items-center justify-center flex-shrink-0 mt-0.5`}>
                      <a.icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-white text-sm">{a.title}</p>
                      <p className="text-xs text-white/40 truncate mt-0.5">{a.desc}</p>
                    </div>
                    <span className="text-xs text-white/25 whitespace-nowrap mt-0.5">{a.time}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Right: Role-specific sidebar ── */}
        <div className="space-y-5">

          {/* Role summary card */}
          <div className="bg-gradient-to-br from-violet-600/20 to-blue-600/20 border border-violet-500/20 rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-600 to-blue-600 flex items-center justify-center text-xl font-black text-white">
                {(profile.full_name ?? 'U')[0].toUpperCase()}
              </div>
              <div>
                <p className="font-bold text-white truncate">{profile.full_name}</p>
                <p className="text-xs text-white/40 truncate">{profile.email}</p>
              </div>
            </div>
            <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold border capitalize ${role === 'admin' ? 'bg-red-500/20 text-red-400 border-red-500/30' :
              role === 'teacher' ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' :
                role === 'school' ? 'bg-violet-500/20 text-violet-400 border-violet-500/30' :
                  'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
              }`}>{role}</span>
            <div className="mt-4 pt-4 border-t border-white/10 flex flex-col gap-2">
              <Link href="/dashboard/settings"
                className="flex items-center gap-2 text-xs text-white/50 hover:text-white transition-colors">
                <CogIcon className="w-4 h-4" /> Account Settings
              </Link>
              <Link href="/dashboard/profile"
                className="flex items-center gap-2 text-xs text-white/50 hover:text-white transition-colors">
                <AcademicCapIcon className="w-4 h-4" /> Edit Profile
              </Link>
            </div>
          </div>

          {/* Useful links */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
            <h3 className="font-bold text-white text-sm mb-4">Navigate To</h3>
            <div className="space-y-1">
              {role === 'admin' && [
                { label: 'Approvals', href: '/dashboard/approvals', icon: CheckCircleIcon },
                { label: 'Analytics', href: '/dashboard/analytics', icon: ChartBarIcon },
                { label: 'Grades', href: '/dashboard/grades', icon: TrophyIcon },
                { label: 'Schools', href: '/dashboard/schools', icon: BuildingOfficeIcon },
              ].map(({ label, href, icon: Icon }) => (
                <Link key={label} href={href}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-white/50 hover:bg-white/5 hover:text-white transition-all group">
                  <Icon className="w-4 h-4 group-hover:text-violet-400 transition-colors" />
                  {label}
                  <ArrowRightIcon className="w-3.5 h-3.5 ml-auto opacity-0 group-hover:opacity-60 transition-opacity" />
                </Link>
              ))}
              {role === 'teacher' && [
                { label: 'Grades', href: '/dashboard/grades', icon: TrophyIcon },
                { label: 'Lessons', href: '/dashboard/lessons', icon: BookOpenIcon },
                { label: 'Progress', href: '/dashboard/progress', icon: ChartBarIcon },
                { label: 'Profile', href: '/dashboard/profile', icon: AcademicCapIcon },
              ].map(({ label, href, icon: Icon }) => (
                <Link key={label} href={href}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-white/50 hover:bg-white/5 hover:text-white transition-all group">
                  <Icon className="w-4 h-4 group-hover:text-blue-400 transition-colors" />
                  {label}
                  <ArrowRightIcon className="w-3.5 h-3.5 ml-auto opacity-0 group-hover:opacity-60 transition-opacity" />
                </Link>
              ))}
              {role === 'student' && [
                { label: 'Lessons', href: '/dashboard/lessons', icon: BookOpenIcon },
                { label: 'Progress', href: '/dashboard/progress', icon: PresentationChartLineIcon },
                { label: 'Classes', href: '/dashboard/classes', icon: ClockIcon },
                { label: 'Profile', href: '/dashboard/profile', icon: BellIcon },
              ].map(({ label, href, icon: Icon }) => (
                <Link key={label} href={href}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-white/50 hover:bg-white/5 hover:text-white transition-all group">
                  <Icon className="w-4 h-4 group-hover:text-emerald-400 transition-colors" />
                  {label}
                  <ArrowRightIcon className="w-3.5 h-3.5 ml-auto opacity-0 group-hover:opacity-60 transition-opacity" />
                </Link>
              ))}
              {role === 'school' && [
                { label: 'Students', href: '/dashboard/students', icon: UserGroupIcon },
                { label: 'Grades', href: '/dashboard/grades', icon: TrophyIcon },
                { label: 'Reports', href: '/dashboard/results', icon: DocumentTextIcon },
                { label: 'Teachers', href: '/dashboard/teachers', icon: AcademicCapIcon },
              ].map(({ label, href, icon: Icon }) => (
                <Link key={label} href={href}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-white/50 hover:bg-white/5 hover:text-white transition-all group">
                  <Icon className="w-4 h-4 group-hover:text-violet-400 transition-colors" />
                  {label}
                  <ArrowRightIcon className="w-3.5 h-3.5 ml-auto opacity-0 group-hover:opacity-60 transition-opacity" />
                </Link>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}