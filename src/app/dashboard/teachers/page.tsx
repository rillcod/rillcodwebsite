'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import {
  UserGroupIcon, BookOpenIcon, ClipboardDocumentListIcon, ChartBarIcon,
  CalendarIcon, CheckCircleIcon, ClockIcon, BellIcon, AcademicCapIcon,
  PlusIcon, ArrowRightIcon, StarIcon, FireIcon, TrophyIcon,
  PencilSquareIcon, DocumentTextIcon, EnvelopeIcon, MagnifyingGlassIcon,
  XMarkIcon, ArrowPathIcon, KeyIcon, ShieldCheckIcon,
  ClipboardIcon, ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import { generateTempPassword } from '@/lib/utils/password';

interface TeacherStats {
  myClasses: number;
  totalStudents: number;
  pendingGrades: number;
  avgPerformance: number;
}

interface RecentActivity {
  id: string;
  type: 'assignment' | 'class' | 'grade' | 'student';
  title: string;
  subtitle: string;
  time: string;
  color: string;
}

interface UpcomingClass {
  id: string;
  name: string;
  time: string;
  students: number;
  day: string;
}

const COLORS = [
  'bg-violet-500', 'bg-blue-500', 'bg-emerald-500',
  'bg-amber-500', 'bg-rose-500', 'bg-cyan-500'
];

export default function TeacherDashboardPage() {
  const { profile, loading: authLoading } = useAuth();
  const [stats, setStats] = useState<TeacherStats>({
    myClasses: 0, totalStudents: 0, pendingGrades: 0, avgPerformance: 0,
  });
  const [upcomingClasses, setUpcomingClasses] = useState<UpcomingClass[]>([]);
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);
  const [perfData, setPerfData] = useState<{ label: string; value: number; color: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (authLoading || !profile) return;
    const supabase = createClient();
    let cancelled = false;

    async function loadStats() {
      setLoading(true);
      try {
        const [classesRes, pendingRes, studentsRes, gradesRes, recentSubsRes] = await Promise.allSettled([
          supabase.from('classes').select('id, name, max_students, current_students, schedule, status', { count: 'exact' }).eq('teacher_id', profile!.id),
          supabase.from('assignment_submissions').select('id', { count: 'exact' }).eq('status', 'submitted'),
          supabase.from('classes').select('current_students').eq('teacher_id', profile!.id),
          supabase.from('assignment_submissions').select('grade, assignments!inner(created_by)').eq('assignments.created_by', profile!.id).eq('status', 'graded'),
          supabase.from('assignment_submissions')
            .select('id, status, submitted_at, portal_users!assignment_submissions_portal_user_id_fkey(full_name), assignments(title)')
            .order('submitted_at', { ascending: false })
            .limit(5),
        ]);

        const classRows = classesRes.status === 'fulfilled' ? (classesRes.value.data ?? []) : [];
        const pendingCnt = pendingRes.status === 'fulfilled' ? (pendingRes.value.count ?? 0) : 0;
        const studentRows = studentsRes.status === 'fulfilled' ? (studentsRes.value.data ?? []) : [];
        const gradeRows = gradesRes.status === 'fulfilled' ? (gradesRes.value.data ?? []) : [];
        const recentSubs = recentSubsRes.status === 'fulfilled' ? (recentSubsRes.value.data ?? []) : [];

        const totalStudents = studentRows.reduce((s: number, c: any) => s + (c.current_students ?? 0), 0);
        const grades = gradeRows.map((g: any) => Number(g.grade)).filter(Boolean);
        const avgPerf = grades.length ? Math.round(grades.reduce((a: number, b: number) => a + b, 0) / grades.length) : 0;

        if (!cancelled) {
          setStats({ myClasses: classesRes.status === 'fulfilled' ? (classesRes.value.count ?? 0) : 0, totalStudents, pendingGrades: pendingCnt, avgPerformance: avgPerf });

          // Build upcoming classes from real data
          const PALETTE = ['bg-violet-500', 'bg-blue-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500', 'bg-cyan-500'];
          setUpcomingClasses(classRows.slice(0, 4).map((c: any, i: number) => ({
            id: c.id,
            name: c.name,
            time: c.schedule ?? '—',
            students: c.current_students ?? 0,
            day: c.status === 'active' ? 'Active' : 'Scheduled',
          })));

          // Build activity from recent submissions
          setRecentActivity(recentSubs.map((s: any) => ({
            id: s.id,
            type: 'grade',
            title: s.status === 'submitted' ? 'New Submission' : 'Submission Graded',
            subtitle: `${(s.portal_users as any)?.full_name ?? 'Student'} — ${(s.assignments as any)?.title ?? 'Assignment'}`,
            time: s.submitted_at ? new Date(s.submitted_at).toLocaleDateString() : '—',
            color: s.status === 'submitted' ? 'text-amber-400' : 'text-emerald-400',
          })));

          // Performance bars from real classes
          const COLORS_PERF = ['bg-violet-500', 'bg-blue-500', 'bg-emerald-500', 'bg-amber-500'];
          setPerfData(classRows.slice(0, 4).map((c: any, i: number) => ({
            label: c.name,
            value: c.current_students && c.max_students ? Math.round((c.current_students / c.max_students) * 100) : 0,
            color: COLORS_PERF[i % COLORS_PERF.length],
          })));
        }
      } catch {
        // keep defaults
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadStats();
    return () => { cancelled = true; };
  }, [profile?.id, authLoading]); // eslint-disable-line

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0f0f1a]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-14 h-14 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-white/50 text-sm font-medium tracking-widest uppercase">Loading…</p>
        </div>
      </div>
    );
  }

  // ── ADMIN VIEW: Full teacher roster ────────────────────────────
  if (profile?.role === 'admin') return <AdminTeacherView />;

  const statCards = [
    { label: 'My Classes', value: stats.myClasses, icon: BookOpenIcon, color: 'from-violet-600 to-violet-400', change: '+1 this month', href: '/dashboard/classes' },
    { label: 'Total Students', value: stats.totalStudents, icon: UserGroupIcon, color: 'from-blue-600 to-blue-400', change: '+5 this week', href: '/dashboard/students' },
    { label: 'Pending Grades', value: stats.pendingGrades, icon: ClipboardDocumentListIcon, color: 'from-amber-600 to-amber-400', change: 'Needs attention', href: '/dashboard/assignments' },
    { label: 'Avg Performance', value: `${stats.avgPerformance}%`, icon: ChartBarIcon, color: 'from-emerald-600 to-emerald-400', change: '+2% vs last week', href: '/dashboard/progress' },
  ];

  const quickActions = [
    { label: 'Create Assignment', icon: PlusIcon, href: '/dashboard/assignments', color: 'bg-violet-600 hover:bg-violet-700' },
    { label: 'Take Attendance', icon: CheckCircleIcon, href: '/dashboard/classes', color: 'bg-blue-600 hover:bg-blue-700' },
    { label: 'Grade Submissions', icon: PencilSquareIcon, href: '/dashboard/assignments', color: 'bg-amber-600 hover:bg-amber-700' },
    { label: 'View Progress', icon: ChartBarIcon, href: '/dashboard/progress', color: 'bg-emerald-600 hover:bg-emerald-700' },
    { label: 'Lesson Plans', icon: DocumentTextIcon, href: '/dashboard/lessons', color: 'bg-cyan-600 hover:bg-cyan-700' },
    { label: 'Notifications', icon: BellIcon, href: '/dashboard/settings', color: 'bg-rose-600 hover:bg-rose-700' },
  ];

  return (
    <div className="min-h-screen bg-[#0f0f1a] text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">

        {/* ── WELCOME BANNER ── */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-violet-900 via-[#1a1040] to-[#0f0f1a] border border-white/10 p-8">
          {/* decorative blobs */}
          <div className="absolute -top-20 -right-20 w-64 h-64 rounded-full bg-violet-600/20 blur-3xl pointer-events-none" />
          <div className="absolute -bottom-20 -left-10 w-48 h-48 rounded-full bg-blue-600/20 blur-3xl pointer-events-none" />

          <div className="relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-violet-600/30 border border-violet-500/40 text-violet-300 text-xs font-semibold uppercase tracking-widest">
                  <FireIcon className="w-3.5 h-3.5" /> Teacher Portal
                </span>
                <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-600/20 border border-emerald-500/30 text-emerald-400 text-xs font-bold">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block" />
                  ONLINE
                </span>
              </div>
              <h1 className="text-3xl sm:text-4xl font-extrabold leading-tight">
                Welcome back, <span className="text-violet-400">{profile?.full_name?.split(' ')[0] ?? 'Teacher'}!</span>
              </h1>
              <p className="text-white/50 mt-1 text-sm" suppressHydrationWarning>
                {now ? now.toLocaleDateString('en-NG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : ''}
              </p>
            </div>
            <div className="text-right bg-black/30 border border-white/10 rounded-xl px-6 py-4 backdrop-blur-sm">
              <div className="text-4xl font-mono font-black text-violet-400 tabular-nums">
                {now ? now.toLocaleTimeString('en-NG', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '--:--:--'}
              </div>
              <div className="text-white/40 text-xs mt-1 font-medium uppercase tracking-wider">WAT — Nigeria</div>
            </div>
          </div>
        </div>

        {/* ── STAT CARDS ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {statCards.map((card) => (
            <Link key={card.label} href={card.href} className="group relative overflow-hidden rounded-2xl bg-white/5 border border-white/10 p-6 hover:border-white/20 hover:bg-white/10 transition-all duration-300">
              <div className={`absolute inset-0 bg-gradient-to-br ${card.color} opacity-0 group-hover:opacity-5 transition-opacity duration-300`} />
              <div className="flex items-start justify-between mb-4">
                <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${card.color} flex items-center justify-center shadow-lg`}>
                  <card.icon className="w-5 h-5 text-white" />
                </div>
                <ArrowRightIcon className="w-4 h-4 text-white/20 group-hover:text-white/60 group-hover:translate-x-1 transition-all duration-200" />
              </div>
              <p className="text-3xl font-extrabold text-white mb-1">{card.value}</p>
              <p className="text-white/50 text-sm font-medium">{card.label}</p>
              <p className="text-xs text-white/30 mt-1">{card.change}</p>
            </Link>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* ── TODAY'S CLASSES ── */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <CalendarIcon className="w-5 h-5 text-violet-400" />
                Upcoming Classes
              </h2>
              <Link href="/dashboard/classes" className="text-sm text-violet-400 hover:text-violet-300 flex items-center gap-1 transition-colors">
                View all <ArrowRightIcon className="w-3.5 h-3.5" />
              </Link>
            </div>
            <div className="space-y-3">
              {upcomingClasses.map((cls, i) => (
                <div key={cls.id} className="flex items-center gap-4 bg-white/5 border border-white/10 rounded-xl p-5 hover:bg-white/8 hover:border-white/20 transition-all duration-200">
                  <div className={`w-12 h-12 rounded-xl ${COLORS[i % COLORS.length]} flex items-center justify-center flex-shrink-0`}>
                    <BookOpenIcon className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-white truncate">{cls.name}</p>
                    <div className="flex items-center gap-3 mt-1 text-sm text-white/40">
                      <span className="flex items-center gap-1"><ClockIcon className="w-3.5 h-3.5" />{cls.time}</span>
                      <span className="flex items-center gap-1"><UserGroupIcon className="w-3.5 h-3.5" />{cls.students} students</span>
                    </div>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-bold ${cls.day === 'Today' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-white/10 text-white/50'
                    }`}>
                    {cls.day}
                  </span>
                </div>
              ))}
            </div>

            {/* ── QUICK ACTIONS ── */}
            <div>
              <h2 className="text-xl font-bold text-white mb-3 flex items-center gap-2 mt-2">
                <TrophyIcon className="w-5 h-5 text-amber-400" />
                Quick Actions
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {quickActions.map((action) => (
                  <Link key={action.label} href={action.href}
                    className={`flex items-center gap-3 ${action.color} text-white font-semibold text-sm px-4 py-3 rounded-xl transition-all duration-200 hover:scale-[1.02] active:scale-95`}
                  >
                    <action.icon className="w-5 h-5 flex-shrink-0" />
                    {action.label}
                  </Link>
                ))}
              </div>
            </div>
          </div>

          {/* ── SIDEBAR: Activity + Performance ── */}
          <div className="space-y-4">

            {/* Recent Activity */}
            <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
              <div className="p-5 border-b border-white/10 flex items-center justify-between">
                <h3 className="font-bold text-white flex items-center gap-2">
                  <BellIcon className="w-4 h-4 text-blue-400" /> Recent Activity
                </h3>
              </div>
              <div className="divide-y divide-white/5">
                {recentActivity.map((act) => (
                  <div key={act.id} className="p-4 hover:bg-white/5 transition-colors">
                    <p className={`text-sm font-semibold ${act.color}`}>{act.title}</p>
                    <p className="text-xs text-white/40 mt-0.5">{act.subtitle}</p>
                    <p className="text-xs text-white/25 mt-1">{act.time}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Performance Summary */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
              <h3 className="font-bold text-white mb-4 flex items-center gap-2">
                <StarIcon className="w-4 h-4 text-amber-400" /> Class Performance
              </h3>
              <div className="space-y-3">
                {perfData.length === 0 ? (
                  <p className="text-white/30 text-sm">No class data yet.</p>
                ) : perfData.map((item) => (
                  <div key={item.label}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-white/60 truncate pr-2">{item.label}</span>
                      <span className="text-white font-bold">{item.value}%</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-white/10">
                      <div
                        className={`h-2 rounded-full ${item.color} transition-all duration-500`}
                        style={{ width: `${item.value}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Pending Grading */}
            <div className="bg-amber-600/10 border border-amber-500/20 rounded-2xl p-5">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center flex-shrink-0">
                  <ClipboardDocumentListIcon className="w-5 h-5 text-amber-400" />
                </div>
                <div className="flex-1">
                  <p className="font-bold text-white text-sm">{stats.pendingGrades} Submissions Pending</p>
                  <p className="text-amber-300/70 text-xs mt-0.5">Students are waiting for their grades</p>
                  <Link href="/dashboard/assignments"
                    className="inline-flex items-center gap-1.5 mt-3 text-xs font-bold text-amber-400 hover:text-amber-300 transition-colors"
                  >
                    Grade now <ArrowRightIcon className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── FOOTER STATS — real DB values ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'My Classes', value: stats.myClasses, icon: AcademicCapIcon, color: 'text-violet-400' },
            { label: 'Total Students', value: stats.totalStudents, icon: UserGroupIcon, color: 'text-blue-400' },
            { label: 'Pending Grades', value: stats.pendingGrades, icon: DocumentTextIcon, color: 'text-amber-400' },
            { label: 'Avg Performance', value: `${stats.avgPerformance}%`, icon: CheckCircleIcon, color: 'text-emerald-400' },
          ].map((item) => (
            <div key={item.label} className="bg-white/5 border border-white/10 rounded-xl p-5 text-center">
              <item.icon className={`w-6 h-6 ${item.color} mx-auto mb-2`} />
              <p className="text-2xl font-extrabold text-white">{item.value}</p>
              <p className="text-xs text-white/40 mt-1">{item.label}</p>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   ADMIN VIEW — Full teacher roster
════════════════════════════════════════════════════════════ */
function AdminTeacherView() {
  const { profile } = useAuth();
  const [teachers, setTeachers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showInvite, setShowInvite] = useState(false);
  const [inviteForm, setInviteForm] = useState({ full_name: '', email: '', phone: '' });
  const [inviting, setInviting] = useState(false);
  const [inviteErr, setInviteErr] = useState('');
  const [inviteOk, setInviteOk] = useState('');
  const [toggling, setToggling] = useState<string | null>(null);
  const [resetTarget, setResetTarget] = useState<{ id: string; name: string } | null>(null);
  const [resetPw, setResetPw] = useState('');
  const [resetting, setResetting] = useState(false);
  const [resetMsg, setResetMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [credentials, setCredentials] = useState<{ email: string; tempPassword: string; name: string } | null>(null);
  const [editingTeacher, setEditingTeacher] = useState<any | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await createClient()
      .from('portal_users')
      .select('id, full_name, email, phone, is_active, created_at')
      .eq('role', 'teacher')
      .order('created_at', { ascending: false });
    setTeachers(data ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const toggleActive = async (id: string, current: boolean) => {
    setToggling(id);
    await createClient().from('portal_users').update({ is_active: !current }).eq('id', id);
    setTeachers(prev => prev.map(t => t.id === id ? { ...t, is_active: !current } : t));
    setToggling(null);
  };

  const sendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteForm.full_name || !inviteForm.email) {
      setInviteErr('Full name and email are required.'); return;
    }
    setInviting(true); setInviteErr(''); setInviteOk('');
    try {
      const db = createClient();
      const payload = {
        full_name: inviteForm.full_name,
        email: inviteForm.email,
        phone: inviteForm.phone || null,
        role: 'teacher',
        is_active: true,
      };

      if (editingTeacher) {
        const { error } = await db
          .from('portal_users')
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq('id', editingTeacher.id);
        if (error) throw error;
        setInviteOk(`Teacher ${inviteForm.full_name} updated successfully.`);
        setEditingTeacher(null);
      } else {
        const tempPassword = generateTempPassword();
        const res = await fetch('/api/auth/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: inviteForm.email,
            password: tempPassword,
            fullName: inviteForm.full_name,
            role: 'teacher',
          }),
        });

        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? 'Failed to create teacher account');

        setCredentials({
          email: inviteForm.email,
          tempPassword,
          name: inviteForm.full_name,
        });
        setInviteOk(`Teacher account created for ${inviteForm.full_name}.`);
      }

      setInviteForm({ full_name: '', email: '', phone: '' });
      setShowInvite(false);
      load();
    } catch (err: any) {
      setInviteErr(err?.message ?? 'Failed to save teacher.');
    } finally {
      setInviting(false);
    }
  };

  const handleDeleteTeacher = async (id: string) => {
    if (!confirm('Are you sure you want to delete this teacher? This will soft-delete the profile.')) return;
    setDeleting(id);
    try {
      const { error } = await createClient()
        .from('portal_users')
        .update({ is_deleted: true, is_active: false, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
      setTeachers(prev => prev.filter(t => t.id !== id));
    } catch (err: any) {
      alert(err.message ?? 'Failed to delete teacher');
    } finally {
      setDeleting(null);
    }
  };

  const startEdit = (t: any) => {
    setEditingTeacher(t);
    setInviteForm({
      full_name: t.full_name || '',
      email: t.email || '',
      phone: t.phone || '',
    });
    setShowInvite(true);
  };

  const handleResetPw = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTarget || resetPw.length < 8) return;
    setResetting(true); setResetMsg(null);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: resetTarget.id, newPassword: resetPw }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed');
      setResetMsg({ ok: true, text: `Password updated for ${resetTarget.name}` });
      setResetPw('');
      setTimeout(() => { setResetTarget(null); setResetMsg(null); }, 2000);
    } catch (err: any) {
      setResetMsg({ ok: false, text: err.message });
    } finally {
      setResetting(false);
    }
  };

  const filtered = teachers.filter(t =>
    (t.full_name ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (t.email ?? '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-[#0f0f1a] text-white">
      {/* Credentials Modal */}
      {credentials && (
        <div className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#161628] border border-white/10 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-emerald-500/20 border border-emerald-500/30 rounded-xl flex items-center justify-center">
                  <ShieldCheckIcon className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <h3 className="font-bold text-white">Teacher Account Created</h3>
                  <p className="text-xs text-white/40">Credentials for {credentials.name}</p>
                </div>
              </div>
              <button onClick={() => setCredentials(null)} className="p-2 hover:bg-white/10 rounded-xl transition-colors">
                <XMarkIcon className="w-5 h-5 text-white/40" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-xs text-amber-300 flex items-start gap-2">
                <ExclamationTriangleIcon className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>Copy these now. The teacher should change their password on first login.</span>
              </div>
              {[
                { label: 'Login Email', value: credentials.email },
                { label: 'Temporary Password', value: credentials.tempPassword },
              ].map(({ label, value }) => (
                <div key={label}>
                  <p className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-1.5">{label}</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white font-mono text-sm select-all">
                      {value}
                    </code>
                    <button
                      onClick={() => navigator.clipboard.writeText(value)}
                      className="p-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-white/40 hover:text-white transition-colors">
                      <ClipboardIcon className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
              <button
                onClick={() => {
                  navigator.clipboard.writeText(`Email: ${credentials.email}\nPassword: ${credentials.tempPassword}`);
                  setCredentials(null);
                }}
                className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold rounded-xl transition-all">
                <ClipboardIcon className="w-4 h-4" /> Copy & Close
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <AcademicCapIcon className="w-5 h-5 text-violet-400" />
              <span className="text-xs font-bold text-violet-400 uppercase tracking-widest">Admin · Teacher Management</span>
            </div>
            <h1 className="text-3xl font-extrabold">Teachers</h1>
            <p className="text-white/40 text-sm mt-1">{teachers.length} teacher{teachers.length !== 1 ? 's' : ''} registered</p>
          </div>
          <button onClick={() => { setEditingTeacher(null); setShowInvite(true); }}
            className="flex items-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-500 text-white text-sm font-bold rounded-xl transition-all shadow-lg shadow-violet-600/20">
            <PlusIcon className="w-4 h-4" /> Add Teacher
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {[
            { label: 'Total', value: teachers.length, color: 'text-white', bg: 'bg-white/5' },
            { label: 'Active', value: teachers.filter(t => t.is_active).length, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
            { label: 'Inactive', value: teachers.filter(t => !t.is_active).length, color: 'text-rose-400', bg: 'bg-rose-500/10' },
          ].map(s => (
            <div key={s.label} className={`${s.bg} border border-white/10 rounded-2xl p-5`}>
              <p className={`text-2xl font-extrabold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-white/40 mt-1">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Search */}
        <div className="relative">
          <MagnifyingGlassIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or email…"
            className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-violet-500 transition-colors placeholder-white/25" />
        </div>

        {/* Teacher list */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <div key={i} className="h-20 bg-white/5 border border-white/10 rounded-2xl animate-pulse" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <AcademicCapIcon className="w-12 h-12 mx-auto text-white/10 mb-3" />
            <p className="text-white/30">{search ? 'No teachers match that search' : 'No teachers registered yet'}</p>
          </div>
        ) : (
          <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
            <div className="divide-y divide-white/5">
              {filtered.map(t => (
                <div key={t.id} className="flex items-center gap-4 p-5 hover:bg-white/5 transition-colors">
                  <div className="w-11 h-11 rounded-full bg-gradient-to-br from-violet-600 to-blue-600 flex items-center justify-center text-sm font-black text-white flex-shrink-0">
                    {(t.full_name ?? '?').split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-white truncate">{t.full_name}</p>
                    <div className="flex items-center gap-3 text-xs text-white/40 mt-0.5">
                      <span className="flex items-center gap-1"><EnvelopeIcon className="w-3 h-3" />{t.email}</span>
                      {t.phone && <span>{t.phone}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${t.is_active
                      ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                      : 'bg-rose-500/20 text-rose-400 border-rose-500/30'}`}>
                      {t.is_active ? 'Active' : 'Inactive'}
                    </span>
                    <button onClick={() => toggleActive(t.id, t.is_active)}
                      disabled={toggling === t.id}
                      className="px-3 py-1.5 text-xs font-bold rounded-lg border border-white/10 hover:border-white/30 text-white/40 hover:text-white transition-all disabled:opacity-50">
                      {toggling === t.id ? '…' : t.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                    <button onClick={() => startEdit(t)}
                      className="px-3 py-1.5 text-xs font-bold rounded-lg border border-white/10 hover:border-white/30 text-white/40 hover:text-white transition-all">
                      Edit
                    </button>
                    <button onClick={() => handleDeleteTeacher(t.id)} disabled={deleting === t.id}
                      className="px-3 py-1.5 text-xs font-bold rounded-lg border border-rose-500/20 hover:border-rose-500/40 text-rose-400/60 hover:text-rose-400 transition-all disabled:opacity-50">
                      {deleting === t.id ? '…' : 'Delete'}
                    </button>
                    <button onClick={() => { setResetTarget({ id: t.id, name: t.full_name }); setResetPw(''); setResetMsg(null); }}
                      className="px-3 py-1.5 text-xs font-bold rounded-lg border border-amber-500/20 hover:border-amber-500/40 text-amber-400/60 hover:text-amber-400 transition-all">
                      Reset PW
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Reset Password Modal */}
      {resetTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setResetTarget(null)} />
          <div className="relative w-full max-w-md bg-[#0f0f1a] border border-white/10 rounded-3xl shadow-2xl">
            <div className="flex items-center justify-between p-6 border-b border-white/10">
              <div>
                <p className="text-xs font-bold text-amber-400 uppercase tracking-widest mb-0.5">Admin Action</p>
                <h2 className="text-lg font-extrabold text-white">Reset Password</h2>
                <p className="text-sm text-white/40 mt-0.5">For: <span className="text-white/70 font-semibold">{resetTarget.name}</span></p>
              </div>
              <button onClick={() => setResetTarget(null)} className="p-2 rounded-xl hover:bg-white/10 text-white/40 hover:text-white transition-colors">
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleResetPw} className="p-6 space-y-4">
              {resetMsg && (
                <div className={`rounded-xl px-4 py-3 text-sm border ${resetMsg.ok ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-rose-500/10 border-rose-500/20 text-rose-400'}`}>
                  {resetMsg.text}
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-white/40 uppercase tracking-widest mb-1.5">New Password</label>
                <input type="password" required minLength={8} value={resetPw} onChange={e => setResetPw(e.target.value)}
                  placeholder="Minimum 8 characters"
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-amber-500 transition-colors placeholder-white/25" />
                <p className="text-xs text-white/25 mt-1.5">Share this new password with the teacher via phone or in person.</p>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setResetTarget(null)}
                  className="flex-1 py-3 bg-white/5 hover:bg-white/10 text-white/60 text-sm font-bold rounded-xl border border-white/10 transition-all">
                  Cancel
                </button>
                <button type="submit" disabled={resetting || resetPw.length < 8}
                  className="flex-1 flex items-center justify-center gap-2 py-3 bg-amber-600 hover:bg-amber-500 text-white text-sm font-bold rounded-xl transition-all disabled:opacity-50">
                  {resetting ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : <CheckCircleIcon className="w-4 h-4" />}
                  {resetting ? 'Updating…' : 'Set Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Invite Modal */}
      {showInvite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShowInvite(false)} />
          <div className="relative w-full max-w-md bg-[#0f0f1a] border border-white/10 rounded-3xl shadow-2xl">
            <div className="flex items-center justify-between p-6 border-b border-white/10">
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <AcademicCapIcon className="w-4 h-4 text-violet-400" />
                  <span className="text-xs font-bold text-violet-400 uppercase tracking-widest">Staff</span>
                </div>
                <h2 className="text-lg font-extrabold text-white">{editingTeacher ? 'Edit Teacher' : 'Add Teacher'}</h2>
              </div>
              <button onClick={() => { setShowInvite(false); setEditingTeacher(null); setInviteErr(''); setInviteOk(''); }}
                className="p-2 rounded-xl hover:bg-white/10 text-white/40 hover:text-white transition-colors">
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={sendInvite} className="p-6 space-y-4">
              {inviteErr && <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3 text-rose-400 text-sm">{inviteErr}</div>}
              {inviteOk && <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3 text-emerald-400 text-sm">{inviteOk}</div>}
              {[
                { label: 'Full Name *', name: 'full_name', type: 'text', placeholder: "Teacher's full name", required: true },
                { label: 'Email *', name: 'email', type: 'email', placeholder: 'teacher@email.com', required: true },
                { label: 'Phone', name: 'phone', type: 'tel', placeholder: '+234 800 000 0000', required: false },
              ].map(f => (
                <div key={f.name}>
                  <label className="block text-xs font-semibold text-white/40 uppercase tracking-widest mb-1.5">{f.label}</label>
                  <input name={f.name} type={f.type} required={f.required} placeholder={f.placeholder}
                    value={(inviteForm as any)[f.name]}
                    onChange={e => setInviteForm(p => ({ ...p, [f.name]: e.target.value }))}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-violet-500 transition-colors placeholder-white/25" />
                </div>
              ))}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowInvite(false)}
                  className="flex-1 py-3 bg-white/5 hover:bg-white/10 text-white/60 text-sm font-bold rounded-xl border border-white/10 transition-all">
                  Cancel
                </button>
                <button type="submit" disabled={inviting}
                  className="flex-1 flex items-center justify-center gap-2 py-3 bg-violet-600 hover:bg-violet-500 text-white text-sm font-bold rounded-xl transition-all disabled:opacity-50">
                  {inviting ? <><ArrowPathIcon className="w-4 h-4 animate-spin" /> Saving…</> : <><CheckCircleIcon className="w-4 h-4" /> {editingTeacher ? 'Update Teacher' : 'Create Teacher'}</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}