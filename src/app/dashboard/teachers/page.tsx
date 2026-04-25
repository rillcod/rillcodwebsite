// @refresh reset
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
  UserPlusIcon, ClipboardDocumentCheckIcon,
} from '@/lib/icons';
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
  'bg-primary', 'bg-blue-500', 'bg-emerald-500',
  'bg-amber-500', 'bg-rose-500', 'bg-cyan-500'
];

export default function TeacherDashboardPage() {
  const { profile, loading: authLoading } = useAuth();

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="w-14 h-14 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-muted-foreground text-sm font-medium tracking-widest uppercase">Loading Portal…</p>
        </div>
      </div>
    );
  }

  // ── ADMIN VIEW: Separate Manager View ──
  if (profile?.role === 'admin') return <AdminTeacherView schoolId={profile?.school_id || undefined} />;

  // ── TEACHER VIEW: Separate Personal View ──
  if (profile?.role === 'teacher') return <TeacherPersonalDashboard />;

  // ── ALL OTHER ROLES: No access ──
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <p className="text-muted-foreground">You don&apos;t have access to this page.</p>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   TEACHER PERSONAL DASHBOARD — For individual staff
════════════════════════════════════════════════════════════ */
function TeacherPersonalDashboard() {
  const { profile, loading: authLoading } = useAuth();
  const [stats, setStats] = useState<TeacherStats>({
    myClasses: 0, totalStudents: 0, pendingGrades: 0, avgPerformance: 0,
  });
  const [upcomingClasses, setUpcomingClasses] = useState<UpcomingClass[]>([]);
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);
  const [, setRecentStudents] = useState<any[]>([]);
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
      if (!profile?.id) return;
      const teacherId = profile.id;
      setLoading(true);
      try {
        // Step 1: get teacher's own assignment IDs
        const { data: myAsgns, error: asgnErr } = await supabase.from('assignments').select('id, title').eq('created_by', teacherId);
        if (asgnErr) throw asgnErr;

        const aIds = (myAsgns || []).map((a: any) => a.id);
        const aTitleMap: Record<string, string> = {};
        (myAsgns || []).forEach((a: any) => { aTitleMap[a.id] = a.title; });

        // Get schools this teacher is assigned to
        const { data: schools, error: schErr } = await supabase.from('teacher_schools').select('school_id').eq('teacher_id', teacherId);
        if (schErr) throw schErr;
        const schoolIds = (schools || []).map(s => s.school_id).filter((sid): sid is string => !!sid);

        let studentCountQuery = supabase.from('students').select('id', { count: 'exact', head: true });
        if (schoolIds.length > 0) {
          studentCountQuery = studentCountQuery.or(`school_id.in.(${schoolIds.join(',')}),created_by.eq.${teacherId}`);
        } else {
          studentCountQuery = studentCountQuery.eq('created_by', teacherId);
        }

        const [classesRes, pendingRes, studentsHead, gradesRes, recentStudentsRes] = await Promise.allSettled([
          supabase.from('classes').select('id, name, max_students, current_students, schedule, status', { count: 'exact' }).eq('teacher_id', teacherId),
          aIds.length > 0
            ? supabase.from('assignment_submissions').select('id', { count: 'exact' }).eq('status', 'submitted').in('assignment_id', aIds)
            : Promise.resolve({ count: 0, data: [] }),
          studentCountQuery,
          aIds.length > 0
            ? supabase.from('assignment_submissions').select('grade').eq('status', 'graded').in('assignment_id', aIds)
            : Promise.resolve({ data: [] }),
          supabase.from('students').select('*').eq('created_by', teacherId).order('created_at', { ascending: false }).limit(5),
        ]);

        // Fetch student names via API (bypasses RLS) then enrich recent submissions
        const portalUsersRes = await fetch('/api/portal-users?role=student&scoped=true', { cache: 'no-store' })
          .then(r => r.json()).catch(() => ({ data: [] }));
        const umap: Record<string, string> = {};
        (portalUsersRes.data ?? []).forEach((u: any) => { umap[u.id] = u.full_name; });

        let recentSubs: any[] = [];
        if (aIds.length > 0) {
          const { data: rawSubs } = await supabase.from('assignment_submissions')
            .select('id, status, submitted_at, assignment_id, portal_user_id, user_id')
            .in('assignment_id', aIds)
            .order('submitted_at', { ascending: false })
            .limit(5);
          recentSubs = (rawSubs ?? []).map((s: any) => ({
            ...s,
            portal_users: { full_name: umap[s.portal_user_id ?? s.user_id] ?? 'Student' },
            assignments: { title: aTitleMap[s.assignment_id] ?? '—' },
          }));
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

          // Build upcoming classes from real data - sort by schedule time
          const sortedClasses = [...classRows].sort((a: any, b: any) => {
            // Parse schedule time (format: "HH:MM" or "HH:MM AM/PM")
            const timeA = a.schedule ?? '';
            const timeB = b.schedule ?? '';
            return timeA.localeCompare(timeB);
          });
          
          setUpcomingClasses(sortedClasses.slice(0, 4).map((c: any, i: number) => ({
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
          const COLORS_PERF = ['bg-primary', 'bg-blue-500', 'bg-emerald-500', 'bg-amber-500'];
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

  if (authLoading || !profile) return null;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="w-14 h-14 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-muted-foreground text-sm font-medium tracking-widest uppercase">Syncing Dashboard…</p>
        </div>
      </div>
    );
  }

  const statCards = [
    { label: 'My Classes', value: stats.myClasses, icon: BookOpenIcon, color: 'from-primary to-primary', change: '+1 this month', href: '/dashboard/classes' },
    { label: 'Total Students', value: stats.totalStudents, icon: UserGroupIcon, color: 'from-primary to-primary from-primary to-primary', change: '+5 this week', href: '/dashboard/students' },
    { label: 'Pending Grades', value: stats.pendingGrades, icon: ClipboardDocumentListIcon, color: 'from-primary to-primary from-primary to-primary', change: 'Needs attention', href: '/dashboard/assignments' },
    { label: 'Avg Performance', value: `${stats.avgPerformance}%`, icon: ChartBarIcon, color: 'from-primary to-primary from-primary to-primary', change: '+2% vs last week', href: '/dashboard/progress' },
  ];

  const quickActions = [
    { label: 'Create Assignment', icon: PlusIcon, href: '/dashboard/assignments', color: 'bg-primary hover:bg-orange-700' },
    { label: 'Take Attendance', icon: CheckCircleIcon, href: '/dashboard/classes', color: 'bg-blue-600 hover:bg-blue-700' },
    { label: 'Grade Submissions', icon: PencilSquareIcon, href: '/dashboard/assignments', color: 'bg-amber-600 hover:bg-amber-700' },
    { label: 'View Progress', icon: ChartBarIcon, href: '/dashboard/progress', color: 'bg-emerald-600 hover:bg-emerald-700' },
    { label: 'Lesson Plans', icon: DocumentTextIcon, href: '/dashboard/lessons', color: 'bg-cyan-600 hover:bg-cyan-700' },
    { label: 'Notifications', icon: BellIcon, href: '/dashboard/settings', color: 'bg-rose-600 hover:bg-rose-700' },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6 sm:space-y-8">

        {/* Header */}
        <div className="bg-background border border-primary/20 rounded-[2.5rem] sm:rounded-[4rem] p-8 sm:p-16 relative overflow-hidden shadow-2xl group">
          <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/10 blur-[120px] -mr-64 -mt-64 pointer-events-none group-hover:bg-primary/20 transition-all duration-1000" />
          <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-indigo-600/10 blur-[100px] -ml-32 -mb-32 pointer-events-none" />
          
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-10">
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <div className="px-5 py-2 bg-primary/10 border border-primary/20 text-primary text-xs font-black uppercase tracking-[0.3em] rounded-none shadow-xl">
                   Teacher Nucleus
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-xs font-black text-muted-foreground/70 uppercase tracking-widest">Active Session</span>
                </div>
              </div>
              
              <h1 className="text-4xl sm:text-7xl font-black text-foreground tracking-tighter leading-[0.9]">
                Greetings, <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-indigo-400">
                  {profile?.full_name?.split(' ')?.[0] || 'Educator'}
                </span>
              </h1>
              
              <div className="flex items-center gap-6 pt-2">
                <div className="flex items-center gap-2.5 px-6 py-3 bg-card shadow-sm border border-border rounded-none text-[11px] font-black uppercase tracking-widest text-muted-foreground shadow-xl" suppressHydrationWarning>
                   <ClockIcon className="w-4 h-4 text-primary" />
                   {now ? now.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) : ''}
                </div>
              </div>
            </div>

            <div className="hidden lg:block relative">
               <div className="w-32 h-32 sm:w-48 sm:h-48 rounded-[2.5rem] bg-gradient-to-br from-primary to-indigo-600 flex items-center justify-center text-5xl sm:text-7xl font-black text-foreground shadow-3xl -rotate-3 hover:rotate-0 transition-transform duration-500">
                 {profile?.full_name?.[0]?.toUpperCase() || '?'}
               </div>
               <div className="absolute -top-4 -right-4 w-12 h-12 sm:w-16 sm:h-16 bg-card rounded-none flex items-center justify-center text-black shadow-2xl rotate-12">
                 <AcademicCapIcon className="w-6 h-6 sm:w-8 sm:h-8 text-primary" />
               </div>
            </div>
          </div>
        </div>

        {/* ── STAT CARDS ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {statCards.map((card) => (
            <Link key={card.label} href={card.href} className="group relative overflow-hidden rounded-none bg-card shadow-sm border border-border p-5 sm:p-6 hover:border-primary/30 hover:bg-white/8 transition-all duration-300">
              <div className={`absolute inset-0 bg-gradient-to-br ${card.color} opacity-0 group-hover:opacity-10 transition-opacity duration-300`} />
              <div className="flex items-start justify-between mb-4 sm:mb-6">
                <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-none bg-card shadow-sm border border-border flex items-center justify-center group-hover:scale-110 transition-transform`}>
                  <card.icon className="w-5 h-5 sm:w-6 sm:h-6 text-muted-foreground group-hover:text-foreground transition-colors" />
                </div>
                <ArrowRightIcon className="w-4 h-4 text-muted-foreground group-hover:text-foreground group-hover:translate-x-1 transition-all" />
              </div>
              <p className="text-2xl sm:text-3xl font-black text-foreground mb-0.5 sm:mb-1">{card.value}</p>
              <p className="text-xs text-muted-foreground/70 font-black uppercase tracking-widest">{card.label}</p>
              <div className="mt-4 pt-4 border-t border-border flex items-center justify-between">
                 <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">{card.change}</span>
                 <div className={`w-1.5 h-1.5 rounded-full bg-gradient-to-r ${card.color}`} />
              </div>
            </Link>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

          {/* ── TODAY'S CLASSES ── */}
          <div className="lg:col-span-2 space-y-6">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <h2 className="text-xl font-black text-foreground flex items-center gap-3">
                <CalendarIcon className="w-6 h-6 text-primary" />
                Schedules
              </h2>
              <Link href="/dashboard/classes" className="text-[10px] font-black text-primary hover:text-foreground uppercase tracking-widest flex items-center gap-2 transition-all">
                Registry <ArrowRightIcon className="w-3.5 h-3.5" />
              </Link>
            </div>
            
            <div className="grid grid-cols-1 gap-4">
              {upcomingClasses.length === 0 ? (
                <div className="py-12 text-center bg-card shadow-sm border border-border rounded-none">
                  <p className="text-muted-foreground text-xs font-black uppercase tracking-widest italic">No classes scheduled yet</p>
                </div>
              ) : (
                upcomingClasses.map((cls, i) => (
                  <div key={cls.id} className="group flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6 bg-card shadow-sm border border-border rounded-none p-5 sm:p-6 hover:bg-muted hover:border-primary/30 transition-all">
                    <div className={`w-14 h-14 rounded-none ${COLORS[i % COLORS.length]} flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform shadow-2xl`}>
                      <BookOpenIcon className="w-7 h-7 text-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-black text-foreground mb-1.5 truncate group-hover:text-primary transition-colors">{cls.name}</h3>
                      <div className="flex flex-wrap items-center gap-4 text-xs font-bold uppercase tracking-widest text-muted-foreground/70">
                        <span className="flex items-center gap-2"><ClockIcon className="w-4 h-4 text-primary" />{cls.time}</span>
                        <span className="flex items-center gap-2"><UserGroupIcon className="w-4 h-4 text-blue-500" />{cls.students} Enrollments</span>
                      </div>
                    </div>
                    <div className={`mt-2 sm:mt-0 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${cls.day === 'Active' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-card shadow-sm text-muted-foreground border-border'}`}>
                      {cls.day}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* ── QUICK ACTIONS ── */}
            <div className="pt-6 sm:pt-8">
              <h2 className="text-xl font-black text-foreground mb-6 flex items-center gap-3">
                <TrophyIcon className="w-6 h-6 text-amber-500" />
                Tools
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {quickActions.map((action) => (
                  <Link key={action.label} href={action.href}
                    className={`flex flex-col gap-3 ${action.color} text-foreground font-black text-[10px] uppercase tracking-widest px-5 py-6 rounded-none transition-all duration-300 hover:scale-[1.05] hover:shadow-2xl hover:shadow-black active:scale-95 border border-border`}
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
            <div className="bg-card shadow-sm border border-border rounded-none overflow-hidden shadow-2xl">
              <div className="p-5 sm:p-6 border-b border-border flex items-center justify-between bg-white/[0.02]">
                <h3 className="text-xs font-black text-foreground uppercase tracking-widest flex items-center gap-3">
                  <BellIcon className="w-4 h-4 text-blue-500" /> Live Logs
                </h3>
              </div>
              <div className="divide-y divide-white/5">
                {recentActivity.length === 0 ? (
                  <div className="p-10 text-center opacity-20 italic text-xs font-bold uppercase tracking-widest uppercase">Idle</div>
                ) : (
                  recentActivity.map((act) => (
                    <div key={act.id} className="p-5 hover:bg-card shadow-sm transition-colors group">
                      <div className="flex items-center justify-between mb-1">
                        <p className={`text-xs font-black uppercase tracking-widest ${act.color}`}>{act.title}</p>
                        <span className="text-xs font-bold text-muted-foreground/70">{act.time}</span>
                      </div>
                      <p className="text-sm font-bold text-slate-300 group-hover:text-foreground transition-colors">{act.subtitle}</p>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Performance Summary */}
            <div className="bg-background border border-border rounded-none p-6 sm:p-8 shadow-2xl shadow-primary/5">
              <h3 className="text-xs font-black text-foreground uppercase tracking-widest mb-6 flex items-center gap-3">
                <StarIcon className="w-4 h-4 text-amber-400 shadow-xl" /> Scores
              </h3>
              <div className="space-y-6">
                {perfData.length === 0 ? (
                  <p className="text-muted-foreground text-xs italic font-bold tracking-widest uppercase px-2 py-8 text-center border-2 border-dashed border-border rounded-none">No metrics yet</p>
                ) : perfData.map((item) => (
                  <div key={item.label} className="space-y-2">
                    <div className="flex justify-between items-center px-1">
                      <span className="text-xs font-black uppercase tracking-widest text-muted-foreground/70 truncate pr-4">{item.label}</span>
                      <span className="text-xs font-black text-foreground">{item.value}%</span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-card shadow-sm p-[1px]">
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
                <div className="absolute inset-0 bg-gradient-to-r from-primary to-primary to-rose-600 rounded-none opacity-10 group-hover:opacity-20 transition-opacity"></div>
                <div className="relative bg-card shadow-sm border border-amber-500/20 rounded-none p-6 sm:p-8">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-none bg-amber-500/20 flex items-center justify-center flex-shrink-0 animate-bounce">
                      <ClipboardDocumentListIcon className="w-6 h-6 text-amber-400" />
                    </div>
                    <div className="flex-1">
                      <p className="text-xs font-black text-foreground uppercase tracking-widest">{stats.pendingGrades} Due Tasks</p>
                      <p className="text-muted-foreground text-[10px] mt-1 font-bold uppercase tracking-widest">Grading backlog detected</p>
                      <Link href="/dashboard/assignments"
                        className="inline-flex items-center gap-2 mt-4 text-[10px] font-black text-amber-400 hover:text-foreground uppercase tracking-widest transition-all"
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
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 bg-card shadow-sm p-4 sm:p-6 rounded-none border border-border">
          {[
            { label: 'Classes', value: stats.myClasses, icon: AcademicCapIcon, color: 'text-primary' },
            { label: 'Students', value: stats.totalStudents, icon: UserGroupIcon, color: 'text-blue-400' },
            { label: 'Pending', value: stats.pendingGrades, icon: DocumentTextIcon, color: 'text-amber-400' },
            { label: 'Efficiency', value: `${stats.avgPerformance}%`, icon: FireIcon, color: 'text-emerald-400' },
          ].map((item) => (
            <div key={item.label} className="flex flex-col items-center justify-center py-4 px-2 hover:bg-card shadow-sm rounded-none transition-all group">
              <item.icon className={`w-5 h-5 ${item.color} mb-3 group-hover:scale-110 transition-transform`} />
              <p className="text-xl sm:text-2xl font-black text-foreground group-hover:text-primary transition-colors tabular-nums">{item.value}</p>
              <p className="text-xs text-muted-foreground/70 font-black uppercase tracking-widest mt-1">{item.label}</p>
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
function AdminTeacherView({ schoolId }: { schoolId?: string }) {
  const { profile, loading: authLoading } = useAuth();
  const [teachers, setTeachers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showInvite, setShowInvite] = useState(false);
  const [inviteForm, setInviteForm] = useState({ full_name: '', email: '', phone: '', subject: '', password: '' });
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

    let query = db
      .from('portal_users')
      .select('id, full_name, email, phone, is_active, created_at, teacher_schools:teacher_schools!teacher_schools_teacher_id_fkey(id, school_id, schools(name))')
      .eq('role', 'teacher')
      .neq('is_deleted', true);

    if (schoolId) {
      // Fetch teachers assigned via teacher_schools junction table
      const { data: assignments } = await db.from('teacher_schools').select('teacher_id').eq('school_id', schoolId);
      const tIds = (assignments ?? []).map((a: any) => a.teacher_id).filter(Boolean);
      // Also include teachers whose school_id is directly set on portal_users
      if (tIds.length > 0) {
        query = query.or(`id.in.(${tIds.join(',')}),school_id.eq.${schoolId}`);
      } else {
        query = query.eq('school_id', schoolId);
      }
    }

    const { data: teachersData, error: teachersErr } = await query.order('created_at', { ascending: false });

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

  const [promoting, setPromoting] = useState<string | null>(null);

  if (authLoading || !profile) {
    return null;
  }

  const toggleActive = async (id: string, current: boolean) => {
    setToggling(id);
    await fetch(`/api/portal-users/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !current }),
    });
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
      const payload = {
        full_name: inviteForm.full_name,
        email: inviteForm.email,
        phone: inviteForm.phone || null,
        role: 'teacher',
        is_active: true,
        ...(inviteForm.subject ? { bio: `Subject: ${inviteForm.subject}` } : {}),
      };

      let newTeacherId = '';

      if (editingTeacher) {
        const res = await fetch(`/api/portal-users/${editingTeacher.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...payload, updated_at: new Date().toISOString() }),
        });
        if (!res.ok) { const j = await res.json(); throw new Error(j.error || 'Update failed'); }
        setInviteOk(`Teacher ${inviteForm.full_name} updated successfully.`);
        newTeacherId = editingTeacher.id;
        setEditingTeacher(null);
      } else {
        const tempPassword = inviteForm.password.trim() || generateTempPassword();
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

      setInviteForm({ full_name: '', email: '', phone: '', subject: '', password: '' });
      setSelectedSchools([]);
      setShowInvite(false);

      if (newTeacherId) {
        // Sync assignments (Institutional Staff Deployment)
        const existingAssignments = editingTeacher ? (staffDeployment[newTeacherId] || []) : [];
        const toRemove = existingAssignments.filter(a => !selectedSchools.includes(a.school_id));
        const toAdd = selectedSchools.filter(sid => !existingAssignments.some(a => a.school_id === sid));

        for (const a of toRemove) {
          await fetch('/api/teacher-schools', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: a.id }),
          });
        }
        for (const sid of toAdd) {
          await fetch('/api/teacher-schools', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ teacher_id: newTeacherId, school_id: sid }),
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
      const res = await fetch(`/api/portal-users/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_deleted: true, is_active: false }),
      });
      if (!res.ok) { const j = await res.json(); throw new Error(j.error || 'Failed to delete'); }
      setTeachers(prev => prev.filter(t => t.id !== id));
    } catch (err: any) {
      alert(err.message ?? 'Failed to delete teacher');
    } finally {
      setDeleting(null);
    }
  };

  const handlePromoteToAdmin = async (t: any) => {
    if (!confirm(`Promote ${t.full_name} to Admin? They will have full platform access and will no longer appear in the teachers list.`)) return;
    setPromoting(t.id);
    try {
      const res = await fetch(`/api/portal-users/${t.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'admin' }),
      });
      if (!res.ok) { const j = await res.json(); throw new Error(j.error || 'Failed to promote'); }
      setTeachers(prev => prev.filter(x => x.id !== t.id));
    } catch (err: any) {
      alert(err.message ?? 'Failed to promote');
    } finally {
      setPromoting(null);
    }
  };

  const startEdit = (t: any) => {
    setEditingTeacher(t);
    setInviteForm({
      full_name: t.full_name || '',
      email: t.email || '',
      phone: t.phone || '',
      subject: '',
      password: '',
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
    <div className="min-h-screen bg-background text-foreground">
      {/* Credentials Modal */}
      {credentials && (
        <div className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#161628] border border-border rounded-none w-full max-w-md shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-emerald-500/20 border border-emerald-500/30 rounded-none flex items-center justify-center">
                  <ShieldCheckIcon className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <h3 className="font-bold text-foreground">Teacher Account Created</h3>
                  <p className="text-xs text-muted-foreground">Credentials for {credentials.name}</p>
                </div>
              </div>
              <button onClick={() => setCredentials(null)} className="p-2 hover:bg-muted rounded-none transition-colors">
                <XMarkIcon className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-none p-3 text-xs text-amber-300 flex items-start gap-2">
                <ExclamationTriangleIcon className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>Copy these now. The teacher should change their password on first login.</span>
              </div>
              {[
                { label: 'Login Email', value: credentials.email },
                { label: 'Temporary Password', value: credentials.tempPassword },
              ].map(({ label, value }) => (
                <div key={label}>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">{label}</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 px-4 py-2.5 bg-card shadow-sm border border-border rounded-none text-foreground font-mono text-sm select-all">
                      {value}
                    </code>
                    <button
                      onClick={() => navigator.clipboard.writeText(value)}
                      className="p-2.5 bg-card shadow-sm hover:bg-muted border border-border rounded-none text-muted-foreground hover:text-foreground transition-colors">
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
                className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-600 hover:bg-emerald-500 text-foreground text-sm font-bold rounded-none transition-all">
                <ClipboardIcon className="w-4 h-4" /> Copy & Close
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">

        {/* Tab bar — People */}
        <div className="flex items-center gap-1 bg-card border border-border rounded-xl p-1 w-fit flex-wrap">
          <Link href="/dashboard/schools" className="flex items-center gap-2 px-4 py-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 text-sm font-bold transition-all">
            <BuildingOfficeIcon className="w-4 h-4" /> Schools
          </Link>
          <span className="flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-black">
            <AcademicCapIcon className="w-4 h-4" /> Teachers
          </span>
          <Link href="/dashboard/students" className="flex items-center gap-2 px-4 py-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 text-sm font-bold transition-all">
            <UserGroupIcon className="w-4 h-4" /> Students
          </Link>
          <Link href="/dashboard/parents" className="flex items-center gap-2 px-4 py-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 text-sm font-bold transition-all">
            <UserPlusIcon className="w-4 h-4" /> Parents
          </Link>
          <Link href="/dashboard/users" className="flex items-center gap-2 px-4 py-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 text-sm font-bold transition-all">
            <ShieldCheckIcon className="w-4 h-4" /> Users
          </Link>
          <Link href="/dashboard/approvals" className="flex items-center gap-2 px-4 py-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 text-sm font-bold transition-all">
            <ClipboardDocumentCheckIcon className="w-4 h-4" /> Approvals
          </Link>
        </div>

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <AcademicCapIcon className="w-5 h-5 text-primary" />
              <span className="text-xs font-bold text-primary uppercase tracking-widest">Admin · Teacher Management</span>
            </div>
            <h1 className="text-3xl font-extrabold">Teachers</h1>
            <p className="text-muted-foreground text-sm mt-1">{teachers.length} teacher{teachers.length !== 1 ? 's' : ''} registered</p>
          </div>
          <button onClick={() => { setEditingTeacher(null); setShowInvite(true); }}
            className="flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary text-foreground text-sm font-bold rounded-none transition-all shadow-lg shadow-primary/20">
            <PlusIcon className="w-4 h-4" /> Add Teacher
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {[
            { label: 'Total', value: teachers.length, color: 'text-foreground', bg: 'bg-card shadow-sm' },
            { label: 'Active', value: teachers.filter(t => t.is_active).length, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
            { label: 'Inactive', value: teachers.filter(t => !t.is_active).length, color: 'text-rose-400', bg: 'bg-rose-500/10' },
          ].map(s => (
            <div key={s.label} className={`${s.bg} border border-border rounded-none p-5`}>
              <p className={`text-2xl font-extrabold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Search */}
        <div className="relative">
          <MagnifyingGlassIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or email…"
            className="w-full pl-10 pr-4 py-3 bg-card shadow-sm border border-border rounded-none text-sm text-foreground focus:outline-none focus:border-primary transition-colors placeholder-muted-foreground" />
        </div>

        {/* Teacher list */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <div key={i} className="h-20 bg-card shadow-sm border border-border rounded-none animate-pulse" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <AcademicCapIcon className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">{search ? 'No teachers match that search' : 'No teachers registered yet'}</p>
          </div>
        ) : (
          <div className="bg-card shadow-sm border border-border rounded-[2rem] overflow-hidden">
            <div className="divide-y divide-white/5">
              {filtered.map(t => (
                <div key={t.id} className="p-5 sm:p-7 hover:bg-white/[0.02] transition-all">
                  <div className="flex flex-col lg:flex-row lg:items-center gap-6 sm:gap-8">
                    
                  <div className="flex items-center gap-4 sm:gap-6 flex-1 min-w-0">
                      <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-none bg-gradient-to-br from-primary to-primary flex items-center justify-center text-sm sm:text-base font-black text-foreground shrink-0 shadow-2xl">
                        {(t.full_name ?? '?').split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-foreground text-lg sm:text-xl truncate tracking-tight">{t.full_name}</h3>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground mt-1.5">
                          <span className="flex items-center gap-1.5 min-w-0 truncate"><EnvelopeIcon className="w-3.5 h-3.5 text-primary shrink-0" /><span className="truncate">{t.email}</span></span>
                          {t.phone && <span className="flex items-center gap-1.5 shrink-0"><PhoneIcon className="w-3.5 h-3.5 text-blue-400" />{t.phone}</span>}
                        </div>
                      </div>
                    </div>

                    {/* Middle: Deployment Status — always visible */}
                    <div className="flex flex-wrap items-center gap-2 lg:w-[240px] shrink-0">
                      <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mr-1 lg:hidden">Schools:</span>
                      {staffDeployment[t.id]?.length > 0 ? (
                        staffDeployment[t.id].map(a => (
                          <div key={a.id} className="flex items-center gap-1.5 px-2.5 py-1 rounded-none bg-blue-500/10 border border-blue-500/20 text-[10px] font-bold text-blue-400 uppercase tracking-widest max-w-[180px]">
                            <BuildingOfficeIcon className="w-3 h-3 shrink-0" />
                            <span className="truncate">{a.schools?.name ?? 'Assigned'}</span>
                          </div>
                        ))
                      ) : (
                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-none bg-amber-500/10 border border-amber-500/20 text-[10px] font-black text-amber-500 uppercase tracking-widest">
                          <ExclamationTriangleIcon className="w-3.5 h-3.5 shrink-0" />
                          Unassigned
                        </div>
                      )}
                    </div>

                    {/* Right: Actions */}
                    <div className="flex items-center gap-2 shrink-0 pt-3 lg:pt-0 border-t lg:border-0 border-border w-full lg:w-auto justify-between lg:justify-end">
                      {/* Manage Deployment — prominent on mobile */}
                      <button onClick={() => startEdit(t)}
                        className="flex items-center gap-1.5 px-3 py-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20 rounded-none text-xs font-bold transition-all lg:hidden">
                        <PencilSquareIcon className="w-3.5 h-3.5" /> Manage
                      </button>

                      <div className="flex items-center gap-1 bg-card shadow-sm p-1 rounded-none border border-border">
                        <button onClick={() => toggleActive(t.id, t.is_active)}
                          disabled={toggling === t.id}
                          className="p-2.5 rounded-none hover:bg-muted text-muted-foreground hover:text-foreground transition-all disabled:opacity-50"
                          title={t.is_active ? 'Deactivate' : 'Activate'}>
                          {toggling === t.id ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : (t.is_active ? <CheckCircleIcon className="w-4 h-4 text-emerald-400" /> : <XMarkIcon className="w-4 h-4 text-rose-400" />)}
                        </button>
                        <button onClick={() => startEdit(t)}
                          className="hidden lg:block p-2.5 rounded-none hover:bg-blue-500/10 text-blue-400/60 hover:text-blue-400 transition-all"
                          title="Edit / Manage Deployment">
                          <PencilSquareIcon className="w-4 h-4" />
                        </button>
                        <button onClick={() => { setResetTarget({ id: t.id, name: t.full_name }); setResetPw(''); setResetMsg(null); }}
                          className="p-2.5 rounded-none hover:bg-amber-500/10 text-amber-400/40 hover:text-amber-400 transition-all"
                          title="Reset Password">
                          <KeyIcon className="w-4 h-4" />
                        </button>
                        <Link
                          href={`/dashboard/card-studio?mode=issuance&type=teacher&q=${encodeURIComponent(t.full_name || t.email || '')}`}
                          className="p-2.5 rounded-none hover:bg-primary/10 text-primary/40 hover:text-primary transition-all"
                          title="Print Access Card"
                        >
                          <ClipboardIcon className="w-4 h-4" />
                        </Link>
                        <button onClick={() => handlePromoteToAdmin(t)} disabled={promoting === t.id}
                          className="p-2.5 rounded-none hover:bg-primary/10 text-primary/40 hover:text-primary transition-all disabled:opacity-50"
                          title="Promote to Admin">
                          {promoting === t.id ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : <ShieldCheckIcon className="w-4 h-4" />}
                        </button>
                        <button onClick={() => handleDeleteTeacher(t.id)} disabled={deleting === t.id}
                          className="p-2.5 rounded-none hover:bg-rose-500/10 text-rose-400/40 hover:text-rose-400 transition-all disabled:opacity-50"
                          title="Delete Teacher">
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      </div>
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
          <div className="relative w-full max-w-md bg-background border border-border rounded-none shadow-2xl">
            <div className="flex items-center justify-between p-6 border-b border-border">
              <div>
                <p className="text-xs font-bold text-amber-400 uppercase tracking-widest mb-0.5">Admin Action</p>
                <h2 className="text-lg font-extrabold text-foreground">Reset Password</h2>
                <p className="text-sm text-muted-foreground mt-0.5">For: <span className="text-muted-foreground font-semibold">{resetTarget.name}</span></p>
              </div>
              <button onClick={() => setResetTarget(null)} className="p-2 rounded-none hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleResetPw} className="p-6 space-y-4">
              {resetMsg && (
                <div className={`rounded-none px-4 py-3 text-sm border ${resetMsg.ok ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-rose-500/10 border-rose-500/20 text-rose-400'}`}>
                  {resetMsg.text}
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">New Password</label>
                <input type="password" required minLength={8} value={resetPw} onChange={e => setResetPw(e.target.value)}
                  placeholder="Minimum 8 characters"
                  className="w-full px-4 py-3 bg-card shadow-sm border border-border rounded-none text-sm text-foreground focus:outline-none focus:border-amber-500 transition-colors placeholder-muted-foreground" />
                <p className="text-xs text-white/25 mt-1.5">Share this new password with the teacher via phone or in person.</p>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setResetTarget(null)}
                  className="flex-1 py-3 bg-card shadow-sm hover:bg-muted text-muted-foreground text-sm font-bold rounded-none border border-border transition-all">
                  Cancel
                </button>
                <button type="submit" disabled={resetting || resetPw.length < 8}
                  className="flex-1 flex items-center justify-center gap-2 py-3 bg-amber-600 hover:bg-amber-500 text-foreground text-sm font-bold rounded-none transition-all disabled:opacity-50">
                  {resetting ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : <CheckCircleIcon className="w-4 h-4" />}
                  {resetting ? 'Updating…' : 'Set Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Add / Edit Teacher Modal ── */}
      {showInvite && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShowInvite(false)} />
          <div className="relative w-full sm:max-w-lg bg-[#0b1020] border border-border rounded-t-3xl rounded-none shadow-2xl flex flex-col max-h-[92vh]">

            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-border flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-none bg-primary/20 flex items-center justify-center">
                  <AcademicCapIcon className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h2 className="text-base font-extrabold text-foreground">
                    {editingTeacher ? 'Edit Teacher' : 'Add Teacher'}
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {editingTeacher ? 'Update staff information' : 'Create a new staff account'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => { setShowInvite(false); setEditingTeacher(null); setInviteErr(''); setInviteOk(''); }}
                className="p-2 rounded-none hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            {/* Modal body — scrollable */}
            <form onSubmit={sendInvite} className="overflow-y-auto flex-1">
              <div className="px-6 py-5 space-y-5">

                {/* Alerts */}
                {inviteErr && (
                  <div className="flex items-start gap-2 bg-rose-500/10 border border-rose-500/20 rounded-none px-4 py-3 text-rose-400 text-sm">
                    <ExclamationTriangleIcon className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    {inviteErr}
                  </div>
                )}
                {inviteOk && (
                  <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-none px-4 py-3 text-emerald-400 text-sm">
                    {inviteOk}
                  </div>
                )}

                {/* ─── Personal Info ─── */}
                <div>
                  <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-3 flex items-center gap-2">
                    <span className="h-px flex-1 bg-card shadow-sm" /><span className="shrink-0">Personal Information</span><span className="h-px flex-1 bg-card shadow-sm" />
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">
                        Full Name <span className="text-rose-400">*</span>
                      </label>
                      <input
                        name="full_name" type="text" required
                        placeholder="e.g. Adeola Johnson"
                        value={inviteForm.full_name}
                        onChange={e => setInviteForm(p => ({ ...p, full_name: e.target.value }))}
                        className="w-full px-4 py-3 bg-card shadow-sm border border-border rounded-none text-sm text-foreground focus:outline-none focus:border-primary transition-colors placeholder-muted-foreground"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">
                        Phone
                      </label>
                      <input
                        name="phone" type="tel"
                        placeholder="+234 800 000 0000"
                        value={inviteForm.phone}
                        onChange={e => setInviteForm(p => ({ ...p, phone: e.target.value }))}
                        className="w-full px-4 py-3 bg-card shadow-sm border border-border rounded-none text-sm text-foreground focus:outline-none focus:border-primary transition-colors placeholder-muted-foreground"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">
                        Subject / Specialisation
                      </label>
                      <input
                        name="subject" type="text"
                        placeholder="e.g. Robotics, Python"
                        value={inviteForm.subject}
                        onChange={e => setInviteForm(p => ({ ...p, subject: e.target.value }))}
                        className="w-full px-4 py-3 bg-card shadow-sm border border-border rounded-none text-sm text-foreground focus:outline-none focus:border-primary transition-colors placeholder-muted-foreground"
                      />
                    </div>
                  </div>
                </div>

                {/* ─── Account Setup ─── */}
                <div>
                  <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-3 flex items-center gap-2">
                    <span className="h-px flex-1 bg-card shadow-sm" /><span className="shrink-0">Account Setup</span><span className="h-px flex-1 bg-card shadow-sm" />
                  </p>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">
                        Email Address <span className="text-rose-400">*</span>
                      </label>
                      <input
                        name="email" type="email" required
                        placeholder="teacher@email.com"
                        value={inviteForm.email}
                        onChange={e => setInviteForm(p => ({ ...p, email: e.target.value }))}
                        className="w-full px-4 py-3 bg-card shadow-sm border border-border rounded-none text-sm text-foreground focus:outline-none focus:border-primary transition-colors placeholder-muted-foreground"
                      />
                    </div>
                    {!editingTeacher && (
                      <div>
                        <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">
                          Password <span className="text-muted-foreground normal-case font-normal">(leave blank to auto-generate)</span>
                        </label>
                        <input
                          name="password" type="text"
                          placeholder="Min 8 characters — auto-generated if empty"
                          value={inviteForm.password}
                          onChange={e => setInviteForm(p => ({ ...p, password: e.target.value }))}
                          className="w-full px-4 py-3 bg-card shadow-sm border border-border rounded-none text-sm text-foreground font-mono focus:outline-none focus:border-primary transition-colors placeholder-muted-foreground"
                        />
                        <p className="text-[10px] text-muted-foreground mt-1.5">
                          The teacher will be prompted to change their password on first login.
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* ─── School Assignment ─── */}
                <div>
                  <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-3 flex items-center gap-2">
                    <span className="h-px flex-1 bg-card shadow-sm" /><span className="shrink-0">School Assignment</span><span className="h-px flex-1 bg-card shadow-sm" />
                  </p>
                  {schools.length === 0 ? (
                    <div className="px-4 py-6 bg-white/3 border border-border rounded-none text-center">
                      <BuildingOfficeIcon className="w-8 h-8 text-white/15 mx-auto mb-2" />
                      <p className="text-white/25 text-sm">No schools yet — create a school first.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto pr-1">
                      {schools.map(s => {
                        const checked = selectedSchools.includes(s.id);
                        return (
                          <label
                            key={s.id}
                            className={`flex items-center gap-3 px-4 py-3 rounded-none cursor-pointer transition-all border ${
                              checked
                                ? 'bg-primary/10 border-primary/30 text-foreground'
                                : 'bg-white/3 border-border text-muted-foreground hover:bg-white/6 hover:text-muted-foreground'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={e => {
                                if (e.target.checked) setSelectedSchools(p => [...p, s.id]);
                                else setSelectedSchools(p => p.filter(id => id !== s.id));
                              }}
                              className="w-4 h-4 rounded border-border bg-card shadow-sm text-primary focus:ring-primary flex-shrink-0 accent-primary"
                            />
                            <div className="flex-1 min-w-0">
                              <p className={`text-sm font-semibold truncate ${checked ? 'text-foreground' : 'text-muted-foreground'}`}>
                                {s.name}
                              </p>
                            </div>
                            {checked && (
                              <CheckCircleIcon className="w-4 h-4 text-primary flex-shrink-0" />
                            )}
                          </label>
                        );
                      })}
                    </div>
                  )}
                  <p className="text-[10px] text-muted-foreground mt-2">
                    Teachers assigned to schools can manage results and students for those schools.
                  </p>
                </div>

              </div>

              {/* Modal footer */}
              <div className="flex gap-3 px-6 py-4 border-t border-border flex-shrink-0">
                <button
                  type="button"
                  onClick={() => { setShowInvite(false); setEditingTeacher(null); setInviteErr(''); setInviteOk(''); }}
                  className="flex-1 py-3 bg-card shadow-sm hover:bg-muted text-muted-foreground text-sm font-bold rounded-none border border-border transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={inviting}
                  className="flex-1 flex items-center justify-center gap-2 py-3 bg-primary hover:bg-primary text-foreground text-sm font-bold rounded-none transition-all disabled:opacity-50"
                >
                  {inviting
                    ? <><ArrowPathIcon className="w-4 h-4 animate-spin" /> Saving…</>
                    : <><CheckCircleIcon className="w-4 h-4" /> {editingTeacher ? 'Update Teacher' : 'Create Teacher'}</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}