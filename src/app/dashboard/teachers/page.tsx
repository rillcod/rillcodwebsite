'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import {
  UserGroupIcon, BookOpenIcon, ClipboardDocumentListIcon, ChartBarIcon,
  CalendarIcon, CheckCircleIcon, ClockIcon, BellIcon, AcademicCapIcon,
  PlusIcon, ArrowRightIcon, StarIcon, FireIcon, TrophyIcon,
  BuildingOfficeIcon, PencilSquareIcon, DocumentTextIcon, EnvelopeIcon, MagnifyingGlassIcon,
  XMarkIcon, ArrowPathIcon, KeyIcon, ShieldCheckIcon,
  ClipboardIcon, ExclamationTriangleIcon, TrashIcon, PhoneIcon,
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

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0f0f1a]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-14 h-14 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-white/50 text-sm font-medium tracking-widest uppercase">Loading Portal…</p>
        </div>
      </div>
    );
  }

  // ── ADMIN VIEW: Separate Manager View ──
  if ((profile?.role as any) === 'admin') return <AdminTeacherView />;

  // ── TEACHER VIEW: Separate Personal View ──
  return <TeacherPersonalDashboard />;
}

/* ════════════════════════════════════════════════════════════
   TEACHER PERSONAL DASHBOARD — For individual staff
════════════════════════════════════════════════════════════ */
function TeacherPersonalDashboard() {
  const { profile } = useAuth();
  const [stats, setStats] = useState<TeacherStats>({
    myClasses: 0, totalStudents: 0, pendingGrades: 0, avgPerformance: 0,
  });
  const [upcomingClasses, setUpcomingClasses] = useState<UpcomingClass[]>([]);
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);
  const [recentStudents, setRecentStudents] = useState<any[]>([]);
  const [perfData, setPerfData] = useState<{ label: string; value: number; color: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!profile) return;
    const supabase = createClient();
    let cancelled = false;

    async function loadStats() {
      setLoading(true);
      try {
        // Step 1: get teacher's own assignment IDs
        const { data: myAsgns } = await supabase.from('assignments').select('id, title').eq('created_by', profile?.id || '');
        const aIds = (myAsgns ?? []).map((a: any) => a.id);
        const aTitleMap: Record<string, string> = {};
        (myAsgns ?? []).forEach((a: any) => { aTitleMap[a.id] = a.title; });

        // Get schools this teacher is assigned to
        const { data: schools } = await supabase.from('teacher_schools').select('school_id').eq('teacher_id', profile?.id || '');
        const schoolIds = schools?.map(s => s.school_id).filter(Boolean) || [];

        let studentCountQuery = supabase.from('students').select('id', { count: 'exact', head: true });
        if (schoolIds.length > 0) {
          studentCountQuery = studentCountQuery.or(`school_id.in.(${schoolIds.join(',')}),created_by.eq.${profile?.id || ''}`);
        } else {
          studentCountQuery = studentCountQuery.eq('created_by', profile?.id || '');
        }

        const [classesRes, pendingRes, studentsHead, gradesRes, recentStudentsRes] = await Promise.allSettled([
          supabase.from('classes').select('id, name, max_students, current_students, schedule, status', { count: 'exact' }).eq('teacher_id', profile?.id || ''),
          aIds.length > 0
            ? supabase.from('assignment_submissions').select('id', { count: 'exact' }).eq('status', 'submitted').in('assignment_id', aIds)
            : Promise.resolve({ count: 0, data: [] }),
          studentCountQuery,
          aIds.length > 0
            ? supabase.from('assignment_submissions').select('grade').eq('status', 'graded').in('assignment_id', aIds)
            : Promise.resolve({ data: [] }),
          supabase.from('students').select('*').eq('created_by', profile?.id || '').order('created_at', { ascending: false }).limit(5),
        ]);

        // Recent activity: fetch submissions + enrich with user names
        let recentSubs: any[] = [];
        if (aIds.length > 0) {
          const { data: rawSubs } = await supabase.from('assignment_submissions')
            .select('id, status, submitted_at, assignment_id, portal_user_id, user_id')
            .in('assignment_id', aIds)
            .order('submitted_at', { ascending: false })
            .limit(5);
          if (rawSubs && rawSubs.length > 0) {
            const uids = [...new Set(rawSubs.map((s: any) => s.portal_user_id ?? s.user_id).filter(Boolean))];
            const { data: uData } = await supabase.from('portal_users').select('id, full_name').in('id', uids);
            const umap: Record<string, string> = {};
            (uData ?? []).forEach((u: any) => { umap[u.id] = u.full_name; });
            recentSubs = rawSubs.map((s: any) => ({
              ...s,
              portal_users: { full_name: umap[s.portal_user_id ?? s.user_id] ?? 'Student' },
              assignments: { title: aTitleMap[s.assignment_id] ?? '—' },
            }));
          }
        }

        const classRows = classesRes.status === 'fulfilled' ? (classesRes.value.data ?? []) : [];
        const pendingCnt = pendingRes.status === 'fulfilled' ? (pendingRes.value.count ?? 0) : 0;
        const totalStudents = studentsHead.status === 'fulfilled' ? (studentsHead.value.count ?? 0) : 0;
        const gradeRows = gradesRes.status === 'fulfilled' ? (gradesRes.value.data ?? []) : [];
        const registeredStudents = recentStudentsRes.status === 'fulfilled' ? (recentStudentsRes.value.data ?? []) : [];
        const grades = gradeRows.map((g: any) => Number(g.grade)).filter(Boolean);
        const avgPerf = grades.length ? Math.round(grades.reduce((a: number, b: number) => a + b, 0) / grades.length) : 0;

        if (!cancelled) {
          setStats({ myClasses: classesRes.status === 'fulfilled' ? (classesRes.value.count ?? 0) : 0, totalStudents, pendingGrades: pendingCnt, avgPerformance: avgPerf });

          // Build upcoming classes from real data
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

          setRecentStudents(registeredStudents);

          // Performance bars from real classes
          const COLORS_PERF = ['bg-violet-500', 'bg-blue-500', 'bg-emerald-500', 'bg-amber-500'];
          setPerfData(classRows.slice(0, 4).map((c: any, i: number) => ({
            label: c.name,
            value: c.current_students && c.max_students ? Math.round((c.current_students / c.max_students) * 100) : 0,
            color: COLORS_PERF[i % COLORS_PERF.length],
          })));
        }
      } catch { /* fail silently */ } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadStats();
    return () => { cancelled = true; };
  }, [profile?.id]); // eslint-disable-line

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0f0f1a]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-14 h-14 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-white/50 text-sm font-medium tracking-widest uppercase">Syncing Dashboard…</p>
        </div>
      </div>
    );
  }

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
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6 sm:space-y-8">

        {/* Header */}
        <div className="bg-[#0a0a1a] border border-violet-500/20 rounded-[2.5rem] sm:rounded-[4rem] p-8 sm:p-16 relative overflow-hidden shadow-2xl group">
          <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-violet-600/10 blur-[120px] -mr-64 -mt-64 pointer-events-none group-hover:bg-violet-600/20 transition-all duration-1000" />
          <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-indigo-600/10 blur-[100px] -ml-32 -mb-32 pointer-events-none" />
          
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-10">
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <div className="px-5 py-2 bg-violet-500/10 border border-violet-500/20 text-violet-400 text-[10px] font-black uppercase tracking-[0.3em] rounded-2xl shadow-xl">
                   Teacher Nucleus
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-[10px] font-black text-white/20 uppercase tracking-widest">Active Session</span>
                </div>
              </div>
              
              <h1 className="text-4xl sm:text-7xl font-black text-white tracking-tighter leading-[0.9]">
                Greetings, <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-indigo-400">
                  {profile?.full_name?.split(' ')?.[0] || 'Educator'}
                </span>
              </h1>
              
              <div className="flex items-center gap-6 pt-2">
                <div className="flex items-center gap-2.5 px-6 py-3 bg-white/5 border border-white/10 rounded-2xl text-[11px] font-black uppercase tracking-widest text-white/40 shadow-xl" suppressHydrationWarning>
                   <ClockIcon className="w-4 h-4 text-violet-500" />
                   {now ? now.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) : ''}
                </div>
              </div>
            </div>

            <div className="hidden lg:block relative">
               <div className="w-32 h-32 sm:w-48 sm:h-48 rounded-[2.5rem] bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center text-5xl sm:text-7xl font-black text-white shadow-3xl -rotate-3 hover:rotate-0 transition-transform duration-500">
                 {profile?.full_name?.[0].toUpperCase()}
               </div>
               <div className="absolute -top-4 -right-4 w-12 h-12 sm:w-16 sm:h-16 bg-white rounded-2xl sm:rounded-3xl flex items-center justify-center text-black shadow-2xl rotate-12">
                 <AcademicCapIcon className="w-6 h-6 sm:w-8 sm:h-8 text-violet-600" />
               </div>
            </div>
          </div>
        </div>

        {/* ── STAT CARDS ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {statCards.map((card) => (
            <Link key={card.label} href={card.href} className="group relative overflow-hidden rounded-2xl bg-white/5 border border-white/10 p-5 sm:p-6 hover:border-violet-500/30 hover:bg-white/8 transition-all duration-300">
              <div className={`absolute inset-0 bg-gradient-to-br ${card.color} opacity-0 group-hover:opacity-10 transition-opacity duration-300`} />
              <div className="flex items-start justify-between mb-4 sm:mb-6">
                <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center group-hover:scale-110 transition-transform`}>
                  <card.icon className="w-5 h-5 sm:w-6 sm:h-6 text-white/50 group-hover:text-white transition-colors" />
                </div>
                <ArrowRightIcon className="w-4 h-4 text-white/10 group-hover:text-white group-hover:translate-x-1 transition-all" />
              </div>
              <p className="text-2xl sm:text-3xl font-black text-white mb-0.5 sm:mb-1">{card.value}</p>
              <p className="text-[10px] sm:text-xs text-white/40 font-black uppercase tracking-widest">{card.label}</p>
              <div className="mt-4 pt-4 border-t border-white/5 flex items-center justify-between">
                 <span className="text-[9px] font-bold text-white/30 uppercase tracking-widest">{card.change}</span>
                 <div className={`w-1.5 h-1.5 rounded-full bg-gradient-to-r ${card.color}`} />
              </div>
            </Link>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

          {/* ── TODAY'S CLASSES ── */}
          <div className="lg:col-span-2 space-y-6">
            <div className="flex items-center justify-between border-b border-white/5 pb-4">
              <h2 className="text-xl font-black text-white flex items-center gap-3">
                <CalendarIcon className="w-6 h-6 text-violet-500" />
                Schedules
              </h2>
              <Link href="/dashboard/classes" className="text-[10px] font-black text-violet-400 hover:text-white uppercase tracking-widest flex items-center gap-2 transition-all">
                Registry <ArrowRightIcon className="w-3.5 h-3.5" />
              </Link>
            </div>
            
            <div className="grid grid-cols-1 gap-4">
              {upcomingClasses.length === 0 ? (
                <div className="py-12 text-center bg-white/5 border border-white/10 rounded-2xl">
                  <p className="text-white/20 text-xs font-black uppercase tracking-widest italic">No classes scheduled yet</p>
                </div>
              ) : (
                upcomingClasses.map((cls, i) => (
                  <div key={cls.id} className="group flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6 bg-white/5 border border-white/10 rounded-2xl p-5 sm:p-6 hover:bg-white/10 hover:border-violet-500/30 transition-all">
                    <div className={`w-14 h-14 rounded-2xl ${COLORS[i % COLORS.length]} flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform shadow-2xl`}>
                      <BookOpenIcon className="w-7 h-7 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-black text-white mb-1.5 truncate group-hover:text-violet-400 transition-colors">{cls.name}</h3>
                      <div className="flex flex-wrap items-center gap-4 text-[10px] font-bold uppercase tracking-widest text-white/40">
                        <span className="flex items-center gap-2"><ClockIcon className="w-4 h-4 text-violet-500" />{cls.time}</span>
                        <span className="flex items-center gap-2"><UserGroupIcon className="w-4 h-4 text-blue-500" />{cls.students} Enrollments</span>
                      </div>
                    </div>
                    <div className={`mt-2 sm:mt-0 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${cls.day === 'Active' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-white/5 text-white/30 border-white/5'}`}>
                      {cls.day}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* ── QUICK ACTIONS ── */}
            <div className="pt-6 sm:pt-8">
              <h2 className="text-xl font-black text-white mb-6 flex items-center gap-3">
                <TrophyIcon className="w-6 h-6 text-amber-500" />
                Tools
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {quickActions.map((action) => (
                  <Link key={action.label} href={action.href}
                    className={`flex flex-col gap-3 ${action.color} text-white font-black text-[10px] uppercase tracking-widest px-5 py-6 rounded-2xl transition-all duration-300 hover:scale-[1.05] hover:shadow-2xl hover:shadow-black active:scale-95 border border-white/5`}
                  >
                    <action.icon className="w-6 h-6 opacity-60" />
                    {action.label}
                  </Link>
                ))}
              </div>
            </div>
          </div>

          {/* ── SIDEBAR: Activity + Performance ── */}
          <div className="space-y-6">

            {/* Recent Activity */}
            <div className="bg-white/5 border border-white/10 rounded-2xl sm:rounded-3xl overflow-hidden shadow-2xl">
              <div className="p-5 sm:p-6 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
                <h3 className="text-xs font-black text-white uppercase tracking-widest flex items-center gap-3">
                  <BellIcon className="w-4 h-4 text-blue-500" /> Live Logs
                </h3>
              </div>
              <div className="divide-y divide-white/5">
                {recentActivity.length === 0 ? (
                  <div className="p-10 text-center opacity-20 italic text-xs font-bold uppercase tracking-widest uppercase">Idle</div>
                ) : (
                  recentActivity.map((act) => (
                    <div key={act.id} className="p-5 hover:bg-white/5 transition-colors group">
                      <div className="flex items-center justify-between mb-1">
                        <p className={`text-[10px] font-black uppercase tracking-widest ${act.color}`}>{act.title}</p>
                        <span className="text-[9px] font-bold text-white/20">{act.time}</span>
                      </div>
                      <p className="text-sm font-bold text-white/80 group-hover:text-white transition-colors">{act.subtitle}</p>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Performance Summary */}
            <div className="bg-[#0a0a20] border border-white/10 rounded-3xl p-6 sm:p-8 shadow-2xl shadow-violet-500/5">
              <h3 className="text-xs font-black text-white uppercase tracking-widest mb-6 flex items-center gap-3">
                <StarIcon className="w-4 h-4 text-amber-400 shadow-xl" /> Scores
              </h3>
              <div className="space-y-6">
                {perfData.length === 0 ? (
                  <p className="text-white/20 text-xs italic font-bold tracking-widest uppercase px-2 py-8 text-center border-2 border-dashed border-white/5 rounded-2xl">No metrics yet</p>
                ) : perfData.map((item) => (
                  <div key={item.label} className="space-y-2">
                    <div className="flex justify-between items-center px-1">
                      <span className="text-[10px] font-black uppercase tracking-widest text-white/40 truncate pr-4">{item.label}</span>
                      <span className="text-xs font-black text-white">{item.value}%</span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-white/5 p-[1px]">
                      <div
                        className={`h-full rounded-full ${item.color.replace('bg-', 'bg-gradient-to-r from-')} to-white transition-all duration-1000 shadow-[0_0_8px_rgba(255,255,255,0.2)]`}
                        style={{ width: `${item.value}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Pending Grading Banner */}
            {stats.pendingGrades > 0 && (
              <div className="relative group overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-amber-600 to-rose-600 rounded-3xl opacity-10 group-hover:opacity-20 transition-opacity"></div>
                <div className="relative bg-white/5 border border-amber-500/20 rounded-3xl p-6 sm:p-8">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-amber-500/20 flex items-center justify-center flex-shrink-0 animate-bounce">
                      <ClipboardDocumentListIcon className="w-6 h-6 text-amber-400" />
                    </div>
                    <div className="flex-1">
                      <p className="text-xs font-black text-white uppercase tracking-widest">{stats.pendingGrades} Due Tasks</p>
                      <p className="text-white/40 text-[10px] mt-1 font-bold uppercase tracking-widest">Grading backlog detected</p>
                      <Link href="/dashboard/assignments"
                        className="inline-flex items-center gap-2 mt-4 text-[10px] font-black text-amber-400 hover:text-white uppercase tracking-widest transition-all"
                      >
                        Action <ArrowRightIcon className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── FOOTER STATS ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 bg-white/5 p-4 sm:p-6 rounded-3xl border border-white/10">
          {[
            { label: 'Classes', value: stats.myClasses, icon: AcademicCapIcon, color: 'text-violet-400' },
            { label: 'Students', value: stats.totalStudents, icon: UserGroupIcon, color: 'text-blue-400' },
            { label: 'Pending', value: stats.pendingGrades, icon: DocumentTextIcon, color: 'text-amber-400' },
            { label: 'Efficiency', value: `${stats.avgPerformance}%`, icon: FireIcon, color: 'text-emerald-400' },
          ].map((item) => (
            <div key={item.label} className="flex flex-col items-center justify-center py-4 px-2 hover:bg-white/5 rounded-2xl transition-all group">
              <item.icon className={`w-5 h-5 ${item.color} mb-3 group-hover:scale-110 transition-transform`} />
              <p className="text-xl sm:text-2xl font-black text-white group-hover:text-violet-400 transition-colors tabular-nums">{item.value}</p>
              <p className="text-[9px] text-white/30 font-black uppercase tracking-widest mt-1">{item.label}</p>
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
  const [schools, setSchools] = useState<any[]>([]); // All available schools
  const [selectedSchools, setSelectedSchools] = useState<string[]>([]); // Schools for current teacher
  const [staffDeployment, setStaffDeployment] = useState<Record<string, any[]>>({}); // teacherId -> teacher_schools

  const load = async () => {
    setLoading(true);
    const db = createClient();

    // 1. Fetch teachers with their school assignments
    const { data: teachersData, error: teachersErr } = await db
      .from('portal_users')
      .select('id, full_name, email, phone, is_active, created_at, teacher_schools:teacher_schools!teacher_schools_teacher_id_fkey(id, school_id, schools(name))')
      .eq('role', 'teacher')
      .order('created_at', { ascending: false });

    if (teachersErr) console.error('Error fetching teachers:', teachersErr);

    // 2. Fetch all schools for the dropdown
    const { data: schoolsData, error: schoolsErr } = await db
      .from('schools')
      .select('id, name')
      .order('name');

    if (schoolsErr) console.error('Error fetching schools:', schoolsErr);

    setTeachers(teachersData as any ?? []);
    setSchools(schoolsData as any ?? []);

    // Build staff deployment map for easy lookup
    const assignmentsMap: Record<string, any[]> = {};
    (teachersData as any ?? []).forEach((t: any) => {
      assignmentsMap[t.id] = t.teacher_schools ?? [];
    });
    setStaffDeployment(assignmentsMap);

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

      let newTeacherId = '';

      if (editingTeacher) {
        const { error } = await db
          .from('portal_users')
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq('id', editingTeacher.id);
        if (error) throw error;
        setInviteOk(`Teacher ${inviteForm.full_name} updated successfully.`);
        newTeacherId = editingTeacher.id;
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
        newTeacherId = json.user_id;

        setCredentials({
          email: inviteForm.email,
          tempPassword,
          name: inviteForm.full_name,
        });
        setInviteOk(`Teacher account created for ${inviteForm.full_name}.`);
      }

      setInviteForm({ full_name: '', email: '', phone: '' });
      setSelectedSchools([]);
      setShowInvite(false);

      if (newTeacherId) {
        // Sync assignments (Institutional Staff Deployment)
        const existingAssignments = editingTeacher ? (staffDeployment[newTeacherId] || []) : [];
        const toRemove = existingAssignments.filter(a => !selectedSchools.includes(a.school_id));
        const toAdd = selectedSchools.filter(sid => !existingAssignments.some(a => a.school_id === sid));

        for (const a of toRemove) {
          await db.from('teacher_schools').delete().eq('id', a.id);
        }
        for (const sid of toAdd) {
          await db.from('teacher_schools').insert({
            teacher_id: newTeacherId,
            school_id: sid,
            assigned_by: profile?.id,
          });
        }
      }
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
    setSelectedSchools((staffDeployment[t.id] ?? []).map(a => a.school_id));
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
                    <p className="font-semibold text-white truncate text-lg group-hover:text-blue-400 transition-colors">{t.full_name}</p>
                    <div className="flex items-center gap-3 text-xs text-white/40 mt-1">
                      <span className="flex items-center gap-1"><EnvelopeIcon className="w-3 h-3" />{t.email}</span>
                      {t.phone && <span className="flex items-center gap-1"><PhoneIcon className="w-3 h-3" />{t.phone}</span>}
                    </div>

                    {/* Deployment Status Badges */}
                    <div className="mt-3">
                      {staffDeployment[t.id]?.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {staffDeployment[t.id].map(a => (
                            <span key={a.id} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-500/10 border border-blue-500/20 text-[10px] font-bold text-blue-400 uppercase tracking-wider">
                              <BuildingOfficeIcon className="w-3 h-3" />
                              {a.schools?.name ?? 'Assigned School'}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <button onClick={() => startEdit(t)} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[10px] font-bold text-amber-500 uppercase tracking-wider hover:bg-amber-500/20 transition-all">
                          <ExclamationTriangleIcon className="w-3.5 h-3.5" />
                          Not Assigned to any School
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex items-center bg-white/5 p-1 rounded-xl border border-white/10">
                      <button onClick={() => startEdit(t)}
                        className="flex items-center gap-2 px-4 py-2 text-xs font-black rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-all shadow-lg shadow-blue-900/40 uppercase tracking-tighter">
                        <BuildingOfficeIcon className="w-3.5 h-3.5" />
                        Manage Deployment
                      </button>
                    </div>

                    <div className="flex items-center gap-1.5 opacity-40 hover:opacity-100 transition-opacity">
                      <button onClick={() => toggleActive(t.id, t.is_active)}
                        disabled={toggling === t.id}
                        className="p-2 text-xs font-bold rounded-xl border border-white/10 hover:border-white/30 text-white/40 hover:text-white transition-all disabled:opacity-50"
                        title={t.is_active ? 'Deactivate' : 'Activate'}>
                        {toggling === t.id ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : (t.is_active ? <CheckCircleIcon className="w-4 h-4 text-emerald-400" /> : <XMarkIcon className="w-4 h-4 text-rose-400" />)}
                      </button>
                      <button onClick={() => startEdit(t)}
                        className="p-2 text-xs font-bold rounded-xl border border-white/10 hover:border-white/30 text-white/40 hover:text-white transition-all"
                        title="Edit Details">
                        <PencilSquareIcon className="w-4 h-4" />
                      </button>
                      <button onClick={() => { setResetTarget({ id: t.id, name: t.full_name }); setResetPw(''); setResetMsg(null); }}
                        className="p-2 text-xs font-bold rounded-xl border border-amber-500/20 hover:border-amber-500/40 text-amber-400/60 hover:text-amber-400 transition-all"
                        title="Reset Password">
                        <KeyIcon className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDeleteTeacher(t.id)} disabled={deleting === t.id}
                        className="p-2 text-xs font-bold rounded-xl border border-rose-500/20 hover:border-rose-500/40 text-rose-400/60 hover:text-rose-400 transition-all disabled:opacity-50"
                        title="Delete Teacher">
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </div>
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

              {/* School Assignment */}
              <div>
                <label className="block text-xs font-semibold text-white/40 uppercase tracking-widest mb-1.5 flex items-center gap-2">
                  <BuildingOfficeIcon className="w-3.5 h-3.5" /> Assign Schools
                </label>
                <div className="bg-white/5 border border-white/10 rounded-xl p-3 space-y-2 max-h-40 overflow-y-auto custom-scrollbar">
                  {schools.length === 0 ? (
                    <p className="text-white/20 text-xs text-center py-2 italic">No schools found. Create a school first.</p>
                  ) : (
                    schools.map(s => (
                      <label key={s.id} className="flex items-center gap-3 px-3 py-2 hover:bg-white/5 rounded-lg cursor-pointer transition-colors group">
                        <input
                          type="checkbox"
                          checked={selectedSchools.includes(s.id)}
                          onChange={e => {
                            if (e.target.checked) setSelectedSchools(p => [...p, s.id]);
                            else setSelectedSchools(p => p.filter(id => id !== s.id));
                          }}
                          className="w-4 h-4 rounded border-white/10 bg-white/5 text-violet-600 focus:ring-violet-500 flex-shrink-0"
                        />
                        <span className={`text-sm font-medium transition-colors ${selectedSchools.includes(s.id) ? 'text-white' : 'text-white/40 group-hover:text-white/60'}`}>
                          {s.name}
                        </span>
                      </label>
                    ))
                  )}
                </div>
                <p className="text-[10px] text-white/20 mt-1.5 italic">Teachers assigned to schools can manage results and students for those schools.</p>
              </div>
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