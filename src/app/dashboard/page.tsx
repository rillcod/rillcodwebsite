'use client';

import { useAuth } from '@/contexts/auth-context';
import {
  UserGroupIcon, AcademicCapIcon, BookOpenIcon, ChartBarIcon, CogIcon,
  BuildingOfficeIcon, ClipboardDocumentListIcon, PresentationChartLineIcon,
  ClockIcon, CheckCircleIcon, BellIcon, ArrowRightIcon, TrophyIcon,
  ArrowPathIcon, ExclamationTriangleIcon, ShieldCheckIcon, DocumentTextIcon,
  BoltIcon,
} from '@heroicons/react/24/outline';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

/* ── Types ────────────────────────────────────────────── */
interface DashStats { label: string; value: string | number; change?: string; icon: any; gradient: string }
interface Activity { id: string; title: string; desc: string; time: string; icon: any; color: string }
interface Slot { id: string; start_time: string; end_time: string; subject: string; room: string | null; school_name?: string }

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
  const [schools, teachers, students, partnerships, asgnSubs, cbtSubs] = await Promise.allSettled([
    supabase.from('schools').select('id, status', { count: 'exact', head: true }),
    supabase.from('portal_users').select('id', { count: 'exact', head: true }).eq('role', 'teacher').eq('is_active', true),
    supabase.from('students').select('id', { count: 'exact', head: true }),
    supabase.from('portal_users').select('id', { count: 'exact', head: true }).eq('role', 'school').eq('is_active', true),
    supabase.from('assignment_submissions').select('id', { count: 'exact', head: true }).not('grade', 'is', null),
    supabase.from('cbt_sessions').select('id', { count: 'exact', head: true }).not('score', 'is', null),
  ]);
  const totalSchools = schools.status === 'fulfilled' ? (schools.value.count ?? 0) : 0;
  const totalTeachers = teachers.status === 'fulfilled' ? (teachers.value.count ?? 0) : 0;
  const totalStudents = students.status === 'fulfilled' ? (students.value.count ?? 0) : 0;
  const totalPartners = partnerships.status === 'fulfilled' ? (partnerships.value.count ?? 0) : 0;
  const totalGraded = (asgnSubs.status === 'fulfilled' ? (asgnSubs.value.count ?? 0) : 0) + 
                    (cbtSubs.status === 'fulfilled' ? (cbtSubs.value.count ?? 0) : 0);

  return [
    { label: 'Partner Schools', value: totalSchools, icon: BuildingOfficeIcon, gradient: 'from-blue-600 to-blue-400' },
    { label: 'Partner Accounts', value: totalPartners, icon: ShieldCheckIcon, gradient: 'from-cyan-600 to-cyan-400' },
    { label: 'Active Teachers', value: totalTeachers, icon: AcademicCapIcon, gradient: 'from-violet-600 to-violet-400' },
    { label: 'Total Students', value: totalStudents, icon: UserGroupIcon, gradient: 'from-emerald-600 to-emerald-400' },
    { label: 'Submissions Graded', value: totalGraded, icon: ChartBarIcon, gradient: 'from-amber-600 to-amber-400' },
  ] as DashStats[];
}

async function loadAdminActivity(supabase: ReturnType<typeof createClient>): Promise<Activity[]> {
  // 2-step: avoid FK ambiguity — some submissions use portal_user_id, others user_id
  const [rawSubsRes, rawCbtRes] = await Promise.all([
    supabase.from('assignment_submissions')
      .select('id, status, submitted_at, portal_user_id, user_id, assignment_id, assignments(title)')
      .order('submitted_at', { ascending: false }).limit(8),
    supabase.from('cbt_sessions')
      .select('id, status, end_time, user_id, portal_user_id, cbt_exams(title)')
      .order('end_time', { ascending: false }).limit(8),
  ]);

  const rawSubs = rawSubsRes.data ?? [];
  const rawCbt = rawCbtRes.data ?? [];

  // Collect all user IDs to batch-lookup
  const allUids = [...new Set([
    ...rawSubs.map((s: any) => s.portal_user_id ?? s.user_id),
    ...rawCbt.map((s: any) => s.portal_user_id ?? s.user_id),
  ].filter(Boolean))];

  const umap: Record<string, string> = {};
  if (allUids.length > 0) {
    const { data: users } = await supabase.from('portal_users').select('id, full_name').in('id', allUids);
    (users ?? []).forEach((u: any) => { umap[u.id] = u.full_name; });
  }

  const activities: Activity[] = [];

  rawSubs.forEach((s: any) => {
    const name = umap[s.portal_user_id ?? s.user_id] ?? 'Student';
    activities.push({
      id: s.id,
      title: `${name} submitted`,
      desc: `Assignment: ${s.assignments?.title ?? '—'}`,
      time: timeAgo(s.submitted_at),
      icon: ClipboardDocumentListIcon,
      color: s.status === 'graded' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-violet-500/20 text-violet-400',
    });
  });

  rawCbt.forEach((s: any) => {
    const name = umap[s.portal_user_id ?? s.user_id] ?? 'Student';
    activities.push({
      id: s.id,
      title: `${name} completed`,
      desc: `Exam: ${s.cbt_exams?.title ?? '—'}`,
      time: timeAgo(s.end_time),
      icon: AcademicCapIcon,
      color: s.status === 'passed' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-violet-500/20 text-violet-400',
    });
  });

  return activities.slice(0, 6);
}

async function loadTeacherStats(supabase: ReturnType<typeof createClient>, userId: string) {
  // Step 1: get this teacher's assignment IDs
  const { data: myAsgns } = await supabase
    .from('assignments').select('id').eq('created_by', userId);
  const aIds = (myAsgns ?? []).map((a: any) => a.id);

  // Get schools this teacher is assigned to
  const { data: teacherSchools } = await supabase.from('teacher_schools').select('school_id').eq('teacher_id', userId);
  const schoolIds = teacherSchools?.map(s => s.school_id).filter(Boolean) || [];

  let studentQuery = supabase.from('students').select('id', { count: 'exact', head: true });
  if (schoolIds.length > 0) {
    studentQuery = studentQuery.or(`school_id.in.(${schoolIds.join(',')}),created_by.eq.${userId}`);
  } else {
    studentQuery = studentQuery.eq('created_by', userId);
  }

  const [classes, pendingAsgn, pendingCbt, subsAsgn, studentsHead] = await Promise.allSettled([
    supabase.from('classes').select('id', { count: 'exact', head: true }).eq('teacher_id', userId),
    aIds.length > 0
      ? supabase.from('assignment_submissions').select('id', { count: 'exact', head: true }).eq('status', 'submitted').in('assignment_id', aIds)
      : Promise.resolve({ count: 0 }),
    supabase.from('cbt_sessions').select('id', { count: 'exact', head: true }).eq('status', 'pending_grading'),
    aIds.length > 0
      ? supabase.from('assignment_submissions').select('grade').not('grade', 'is', null).in('assignment_id', aIds).limit(200)
      : Promise.resolve({ data: [] }),
    studentQuery
  ]);
  const myClasses = classes.status === 'fulfilled' ? (classes.value.count ?? 0) : 0;
  const pendingCbtCount = pendingCbt.status === 'fulfilled' ? (pendingCbt.value.count ?? 0) : 0;
  const pendingAsgnCount = pendingAsgn.status === 'fulfilled' ? ((pendingAsgn.value as any).count ?? 0) : 0;
  const pendingGrade = pendingAsgnCount + pendingCbtCount;
  const asgnGrades = subsAsgn.status === 'fulfilled' ? ((subsAsgn.value as any).data ?? []) : [];
  const totalStudents = studentsHead.status === 'fulfilled' ? (studentsHead.value.count ?? 0) : 0;

  const allGrades = asgnGrades.map((g: any) => g.grade).filter((g: any) => g != null);
  const avg = allGrades.length > 0
    ? Math.round(allGrades.reduce((s: number, g: any) => s + (g ?? 0), 0) / allGrades.length)
    : 0;

  return [
    { label: 'My Classes', value: myClasses, icon: BookOpenIcon, gradient: 'from-blue-600 to-blue-400' },
    { label: 'Total Students', value: totalStudents, icon: UserGroupIcon, gradient: 'from-emerald-600 to-emerald-400' },
    { label: 'Pending Grading', value: pendingGrade, icon: ClipboardDocumentListIcon, gradient: 'from-amber-600 to-amber-400' },
    { label: 'Avg Class Perf', value: `${avg}%`, icon: ChartBarIcon, gradient: 'from-violet-600 to-violet-400' },
  ] as DashStats[];
}

async function loadTeacherActivity(supabase: ReturnType<typeof createClient>, userId: string): Promise<Activity[]> {
  // Step 1: get teacher's assignment IDs to filter submissions correctly
  const { data: myAsgns } = await supabase.from('assignments').select('id, title').eq('created_by', userId);
  const aIds = (myAsgns ?? []).map((a: any) => a.id);
  const aTitleMap: Record<string, string> = {};
  (myAsgns ?? []).forEach((a: any) => { aTitleMap[a.id] = a.title; });

  const [asgnRes, cbtRes] = await Promise.all([
    aIds.length > 0
      ? supabase.from('assignment_submissions')
          .select('id, status, submitted_at, assignment_id, portal_user_id, user_id')
          .in('assignment_id', aIds).order('submitted_at', { ascending: false }).limit(5)
      : Promise.resolve({ data: [] }),
    supabase.from('cbt_sessions')
      .select('id, status, end_time, user_id, cbt_exams(title)')
      .order('end_time', { ascending: false }).limit(5)
  ]);

  // Enrich submission user names via separate lookup
  const subsData: any[] = (asgnRes as any).data ?? [];
  if (subsData.length > 0) {
    const uids = [...new Set(subsData.map((s: any) => s.portal_user_id ?? s.user_id).filter(Boolean))];
    const { data: users } = await supabase.from('portal_users').select('id, full_name').in('id', uids);
    const umap: Record<string, string> = {};
    (users ?? []).forEach((u: any) => { umap[u.id] = u.full_name; });
    subsData.forEach((s: any) => { s._name = umap[s.portal_user_id ?? s.user_id] ?? 'Student'; });
  }

  const cbtData: any[] = (cbtRes as any).data ?? [];
  if (cbtData.length > 0) {
    const uids = [...new Set(cbtData.map((s: any) => s.user_id).filter(Boolean))];
    const { data: users } = await supabase.from('portal_users').select('id, full_name').in('id', uids);
    const umap: Record<string, string> = {};
    (users ?? []).forEach((u: any) => { umap[u.id] = u.full_name; });
    cbtData.forEach((s: any) => { s._name = umap[s.user_id] ?? 'Student'; });
  }

  const activities: Activity[] = [];

  subsData.forEach((s: any) => {
    activities.push({
      id: s.id,
      title: `${s._name} submitted`,
      desc: aTitleMap[s.assignment_id] ?? '—',
      time: timeAgo(s.submitted_at),
      icon: ClipboardDocumentListIcon,
      color: s.status === 'graded' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-blue-500/20 text-blue-400',
    });
  });

  cbtData.forEach((s: any) => {
    activities.push({
      id: s.id,
      title: `${s._name} exam`,
      desc: s.cbt_exams?.title ?? '—',
      time: timeAgo(s.end_time),
      icon: AcademicCapIcon,
      color: s.status === 'passed' ? 'bg-emerald-500/20 text-emerald-400' : s.status === 'pending_grading' ? 'bg-amber-500/20 text-amber-400' : 'bg-rose-500/20 text-rose-400',
    });
  });

  return activities.slice(0, 5);
}

async function loadStudentStats(supabase: ReturnType<typeof createClient>, userId: string) {
  const [enr, subs, graded, points] = await Promise.allSettled([
    supabase.from('enrollments').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    supabase.from('assignment_submissions').select('id', { count: 'exact', head: true })
      .or(`portal_user_id.eq.${userId},user_id.eq.${userId}`),
    supabase.from('assignment_submissions').select('grade, assignments(max_points)')
      .or(`portal_user_id.eq.${userId},user_id.eq.${userId}`).not('grade', 'is', null).limit(50),
    supabase.from('user_points').select('*').eq('portal_user_id', userId).maybeSingle(),
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
  const ptsData = points.status === 'fulfilled' ? (points.value as any).data : null;
  const xp = ptsData?.total_points || 0;
  const streak = ptsData?.current_streak || 0;
  const level = ptsData?.achievement_level || 'Bronze';

  return [
    { label: 'Enrolled Courses', value: enrolled, icon: BookOpenIcon, gradient: 'from-blue-600 to-blue-400' },
    { label: 'XP Points', value: xp, icon: TrophyIcon, gradient: 'from-amber-600 to-amber-400' },
    { label: 'Daily Streak', value: `${streak}d 🔥`, icon: BoltIcon, gradient: 'from-rose-600 to-rose-400' },
    { label: 'Current Level', value: level, icon: AcademicCapIcon, gradient: 'from-violet-600 to-violet-400' },
  ] as DashStats[];
}

async function loadLeaderboard(supabase: ReturnType<typeof createClient>) {
  const { data: lpRes } = await supabase
    .from('user_points')
    .select('portal_user_id, total_points, achievement_level, portal_users(full_name, profile_image_url)')
    .order('total_points', { ascending: false })
    .limit(5);
  
  return (lpRes ?? []).map((item: any, idx: number) => ({
    rank: idx + 1,
    name: item.portal_users?.full_name || 'Anonymous',
    points: item.total_points,
    level: item.achievement_level,
    avatar: item.portal_users?.profile_image_url
  }));
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

async function loadSchoolStats(supabase: ReturnType<typeof createClient>, schoolId: string, schoolName?: string | null) {
  let studentQuery = supabase.from('students').select('id', { count: 'exact', head: true });
  if (schoolName) {
    studentQuery = studentQuery.or(`school_id.eq.${schoolId},school_name.eq."${schoolName}"`);
  } else {
    studentQuery = studentQuery.eq('school_id', schoolId);
  }

  // Use 2-step for submissions to avoid FK ambiguity
  const subsQuery = supabase.from('assignment_submissions')
    .select('id, grade, portal_user_id, user_id')
    .not('grade', 'is', null)
    .limit(200);

  const [students, teachers, graded] = await Promise.allSettled([
    studentQuery,
    supabase.from('teacher_schools').select('id', { count: 'exact', head: true }).eq('school_id', schoolId),
    subsQuery,
  ]);

  const totalStudents = students.status === 'fulfilled' ? (students.value.count ?? 0) : 0;
  const totalTeachers = teachers.status === 'fulfilled' ? (teachers.value.count ?? 0) : 0;
  
  // Enrich submissions with user data and filter by school
  let gradedData = graded.status === 'fulfilled' ? (graded.value.data ?? []) : [];
  if (gradedData.length > 0) {
    const uids = [...new Set(gradedData.map((s: any) => s.portal_user_id ?? s.user_id).filter(Boolean))];
    const { data: users } = await supabase.from('portal_users').select('id, school_id, school_name').in('id', uids);
    const umap: Record<string, any> = {};
    (users ?? []).forEach((u: any) => { umap[u.id] = u; });
    gradedData = gradedData
      .map((s: any) => ({ ...s, _u: umap[s.portal_user_id ?? s.user_id] }))
      .filter((s: any) => s._u?.school_id === schoolId || s._u?.school_name === schoolName);
  }

  const avg = gradedData.length > 0
    ? Math.round(gradedData.reduce((s: number, g: any) => s + (Number(g.grade) || 0), 0) / gradedData.length)
    : 0;

  return [
    { label: 'Registered Students', value: totalStudents, icon: UserGroupIcon, gradient: 'from-blue-600 to-blue-400' },
    { label: 'Assigned Teachers', value: totalTeachers, icon: AcademicCapIcon, gradient: 'from-violet-600 to-violet-400' },
    { label: 'Student Perf. Avg', value: `${avg}%`, icon: ChartBarIcon, gradient: 'from-emerald-600 to-emerald-400' },
    { label: 'Submissions Count', value: gradedData.length, icon: ClipboardDocumentListIcon, gradient: 'from-amber-600 to-amber-400' },
  ] as DashStats[];
}

async function loadSchoolActivity(supabase: ReturnType<typeof createClient>, schoolId: string, schoolName?: string | null): Promise<Activity[]> {
  // 2-step: fetch submissions then enrich with user data
  const { data: rawSubs } = await supabase
    .from('assignment_submissions')
    .select('id, status, submitted_at, portal_user_id, user_id, assignments(title)')
    .order('submitted_at', { ascending: false })
    .limit(20);

  if (!rawSubs || rawSubs.length === 0) return [];

  const uids = [...new Set(rawSubs.map((s: any) => s.portal_user_id ?? s.user_id).filter(Boolean))];
  const { data: users } = await supabase.from('portal_users').select('id, full_name, school_id, school_name').in('id', uids);
  const umap: Record<string, any> = {};
  (users ?? []).forEach((u: any) => { umap[u.id] = u; });

  return rawSubs
    .map((s: any) => ({ ...s, portal_users: umap[s.portal_user_id ?? s.user_id] ?? null }))
    .filter((s: any) => s.portal_users?.school_id === schoolId || s.portal_users?.school_name === schoolName)
    .slice(0, 5)
    .map((s: any) => ({
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
    { name: 'Manage Teachers', href: '/dashboard/teachers', icon: AcademicCapIcon, desc: 'View assigned staff' },
    { name: 'Grades & Reports', href: '/dashboard/results', icon: TrophyIcon, desc: 'View student grades' },
    { name: 'Activity', href: '/dashboard/progress', icon: ChartBarIcon, desc: 'Track student progress' },
  ],
};

/* ── Main Component ───────────────────────────────────── */
export default function DashboardPage() {
  const { user, profile, loading, profileLoading } = useAuth();
  const router = useRouter();
  const [now, setNow] = useState<Date | null>(null);
  const [stats, setStats] = useState<DashStats[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [upcomingSlots, setUpcomingSlots] = useState<Slot[]>([]);
  const [dataLoading, setDataLoading] = useState(false);

  // Helper to load upcoming slots
  const loadUpcomingSlots = async (supabase: any, role: string, userId: string, schoolId?: string) => {
    try {
      const today = new Date().toLocaleDateString('en-US', { weekday: 'long' });
      let query = supabase.from('timetable_slots').select('*, timetables(school_id, schools(name))').eq('day_of_week', today);
      
      if (role === 'teacher') query = query.eq('teacher_id', userId);
      else if (role === 'school') query = query.eq('timetables.school_id', schoolId);
      // For students, we'd need to link through classes, but for now we show school-wide if they are in a portal
      
      const { data } = await query.order('start_time').limit(3);
      if (data) {
        setUpcomingSlots(data.map((s: any) => ({
          id: s.id,
          start_time: s.start_time,
          end_time: s.end_time,
          subject: s.subject,
          room: s.room,
          school_name: s.timetables?.schools?.name
        })));
      }
    } catch (e) { console.error('Failed to load upcoming slots', e); }
  };

  // Live clock — set only on client to avoid SSR hydration mismatch
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Redirect to login only once auth is fully resolved with no user
  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login');
    }
  }, [loading, user, router]);

  // Fetch live stats once we know the role
  const fetchDashData = useCallback(async () => {
    if (!profile) return;
    setDataLoading(true);
    try {
      const supabase = createClient();
      const role = profile.role;
      const [s, a, l] = await Promise.all([
        role === 'admin' ? loadAdminStats(supabase) :
          role === 'teacher' ? loadTeacherStats(supabase, profile?.id || '') :
            role === 'school' ? loadSchoolStats(supabase, profile?.school_id || '', profile?.school_name) :
              loadStudentStats(supabase, profile?.id || ''),
        role === 'admin' ? loadAdminActivity(supabase) :
          role === 'teacher' ? loadTeacherActivity(supabase, profile?.id || '') :
            role === 'school' ? loadSchoolActivity(supabase, profile?.school_id || '', profile?.school_name) :
              loadStudentActivity(supabase, profile?.id || ''),
        role === 'student' ? loadLeaderboard(supabase) : Promise.resolve([])
      ]);
      setStats(s as any[]);
      setActivities(a);
      setLeaderboard(l);
      await loadUpcomingSlots(supabase, role, profile.id, profile.school_id || undefined);
    } catch { /* silent */ } finally {
      setDataLoading(false);
    }
  }, [profile?.id, profile?.role]); // eslint-disable-line

  useEffect(() => { fetchDashData(); }, [fetchDashData]);

  // ── Loading / guard screens ────────────────────────────────────

  // Auth session resolving (fresh visit or expired token being refreshed)
  if (loading) return (
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

  // No user — redirect is queued in useEffect
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

  // User is authenticated but profile row is still being fetched — show spinner, NOT an error
  if (profileLoading || !profile) {
    // Profile fetch finished but returned null → account is inactive or missing portal_users row
    if (!profileLoading && !profile) return (
      <div className="min-h-screen bg-[#050a17] flex flex-col items-center justify-center p-6 text-center">
        <div className="flex flex-col items-center gap-6">
          <div className="w-20 h-20 bg-rose-500/10 border border-rose-500/20 rounded-[2rem] flex items-center justify-center shadow-2xl shadow-rose-500/10 mb-2">
            <ExclamationTriangleIcon className="w-10 h-10 text-rose-400" />
          </div>
          <div className="space-y-2">
            <h2 className="text-white font-black text-2xl tracking-tight">Account Not Found</h2>
            <p className="text-white/40 text-sm max-w-sm leading-relaxed">
              Your login was successful but your portal profile could not be loaded. Your account may be inactive or not yet set up.
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
      </div>
    );

    // Profile fetch still in flight — show a clean spinner
    return (
      <div className="min-h-screen bg-[#050a17] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-white/10 border-t-violet-500 rounded-full animate-spin" />
          <p className="text-white/40 text-sm">Setting up your workspace…</p>
        </div>
      </div>
    );
  }

  const role = profile.role as 'admin' | 'teacher' | 'student' | 'school';
  const quickActions = QUICK_ACTIONS[role] ?? QUICK_ACTIONS.student;

  return (
    <div className="space-y-6">

      {/* ── Welcome Banner ── */}
      <div className="bg-gradient-to-r from-[#0B132B] to-[#1a2b54] rounded-2xl sm:rounded-[2.5rem] shadow-2xl p-6 sm:p-10
        flex flex-col lg:flex-row lg:items-center justify-between gap-6 sm:gap-8 relative overflow-hidden">
        {/* Decorative blobs */}
        <div className="absolute top-0 right-0 -translate-y-12 translate-x-12 w-64 h-64 bg-white opacity-[0.03] rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 translate-y-12 -translate-x-12 w-48 h-48 bg-violet-600 opacity-20 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center gap-6">
          <div className="flex-shrink-0 p-4 bg-white/10 backdrop-blur-md rounded-[2.5rem] border border-white/20 shadow-2xl">
            <img src="/images/logo.png" alt="Rillcod Logo" className="w-16 h-16 sm:w-20 sm:h-20 object-contain drop-shadow-[0_0_15px_rgba(255,255,255,0.3)]" />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-4">
              <span className="px-3 py-1 bg-violet-600/80 text-white text-[10px] font-black uppercase tracking-widest rounded-full">
                {role} Portal
              </span>
              <div className="h-px w-8 bg-white/20" />
              <span className="text-[10px] font-bold text-blue-300/60 uppercase tracking-widest">Global Status: Online</span>
            </div>
            <h1 className="text-3xl sm:text-5xl font-black text-white tracking-tight leading-tight">
              Welcome back,<br className="sm:hidden" /> {profile.full_name?.split(' ')?.[0] || 'User'}!
            </h1>
            <p className="text-blue-200/60 text-sm sm:text-base mt-3 font-medium flex items-center gap-2">
              <ClockIcon className="w-4 h-4" />
              {now ? now.toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : ''}
            </p>
          </div>
        </div>

        <div className="relative z-10 flex sm:flex-row items-center gap-4 sm:gap-6 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-2xl">
          <div className="text-3xl sm:text-5xl font-black text-white tracking-tighter tabular-nums">
            {now ? now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' }) : '--:--'}
          </div>
          <div className="h-8 w-px bg-white/10 hidden sm:block" />
          <div className="flex flex-col items-start gap-1">
             <div className="flex items-center gap-1.5 px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full">
                <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse shadow-[0_0_8px_rgba(74,222,128,0.8)]" />
                <span className="text-[8px] sm:text-[10px] text-emerald-400 font-black uppercase tracking-widest">Active</span>
             </div>
             <p className="text-[10px] text-white/30 font-bold uppercase tracking-widest ml-1">Live Feed</p>
          </div>
        </div>
      </div>

      {/* ── Stats Grid ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6">
        {dataLoading
          ? Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white/5 border border-white/10 rounded-2xl sm:rounded-3xl p-5 sm:p-6 animate-pulse">
              <div className="h-10 w-10 bg-white/10 rounded-xl mb-4" />
              <div className="h-8 bg-white/10 rounded w-1/2 mb-2" />
              <div className="h-4 bg-white/5 rounded w-2/3" />
            </div>
          ))
          : stats.map(({ label, value, icon: Icon, gradient }) => (
            <div key={label} className="bg-white/5 border border-white/10 rounded-2xl sm:rounded-3xl p-5 sm:p-7 hover:bg-white/8 hover:border-white/20 transition-all group relative overflow-hidden">
              <div className={`absolute top-0 right-0 w-24 h-24 bg-gradient-to-br ${gradient} opacity-[0.03] blur-2xl -mr-12 -mt-12 group-hover:scale-150 transition-transform`} />
              <div className="flex items-start justify-between mb-5 relative z-10">
                <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-gradient-to-br ${gradient} flex items-center justify-center shadow-xl group-hover:scale-110 transition-transform`}>
                  <Icon className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
                </div>
                <span className="text-[8px] sm:text-[10px] font-black text-white/20 uppercase tracking-[0.2em] bg-white/5 px-2 py-0.5 rounded-full border border-white/5">Live</span>
              </div>
              <p className="text-2xl sm:text-4xl font-black text-white tracking-tight tabular-nums relative z-10">{value}</p>
              <p className="text-[10px] sm:text-xs text-white/30 font-black uppercase tracking-widest mt-1.5 relative z-10">{label}</p>
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
          <div className="bg-[#0a0a1a] border border-white/10 rounded-[2rem] p-6 sm:p-8 shadow-2xl">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="text-xl font-black text-white tracking-tight">Recent Activity</h2>
                <p className="text-xs text-white/30 font-medium uppercase tracking-widest mt-1">Live Platform Pulse</p>
              </div>
              <button onClick={fetchDashData} className="p-3 rounded-xl bg-white/5 hover:bg-white/10 text-white/30 hover:text-white border border-white/10 transition-all group" title="Refresh">
                <ArrowPathIcon className={`w-4 h-4 ${dataLoading ? 'animate-spin' : 'group-active:rotate-180 transition-transform'}`} />
              </button>
            </div>
            {dataLoading ? (
              <div className="space-y-4">
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className="flex items-center gap-4 animate-pulse">
                    <div className="w-11 h-11 bg-white/5 rounded-2xl flex-shrink-0" />
                    <div className="flex-1 space-y-3">
                      <div className="h-4 bg-white/5 rounded w-3/4" />
                      <div className="h-3 bg-white/5 rounded w-1/2 opacity-50" />
                    </div>
                  </div>
                ))}
              </div>
            ) : activities.length === 0 ? (
              <div className="text-center py-16 bg-white/[0.02] border border-dashed border-white/10 rounded-3xl">
                <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4 border border-white/5">
                  <ClipboardDocumentListIcon className="w-8 h-8 text-white/10" />
                </div>
                <p className="text-white/30 font-bold uppercase tracking-widest text-xs">No recent activity yet</p>
              </div>
            ) : (
              <div className="space-y-2">
                {activities.map((a, i) => (
                  <div key={a.id} className="group flex items-start gap-4 p-4 rounded-2xl hover:bg-white/[0.03] transition-all border border-transparent hover:border-white/5">
                    <div className={`w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-lg ${a.color} group-hover:scale-110 transition-transform`}>
                      <a.icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-white text-sm tracking-tight group-hover:text-blue-300 transition-colors uppercase leading-none mt-1">
                        {a.title}
                      </p>
                      <p className="text-xs text-white/30 mt-2 font-medium truncate">{a.desc}</p>
                    </div>
                    <span className="text-[10px] font-black text-white/20 uppercase tracking-widest whitespace-nowrap mt-1 bg-white/5 px-2 py-0.5 rounded-full border border-white/5 group-hover:text-white/40 transition-colors">
                      {a.time}
                    </span>
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

          {/* Upcoming Schedule */}
          {(role === 'teacher' || role === 'student' || role === 'school') && (
            <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-white text-sm">What's Next</h3>
                <Link href="/dashboard/timetable" className="text-[10px] font-black text-violet-400 uppercase tracking-widest hover:underline">Full View</Link>
              </div>
              <div className="space-y-2">
                {upcomingSlots.length > 0 ? (
                  upcomingSlots.map(slot => (
                    <div key={slot.id} className="p-3 bg-white/5 border border-white/10 rounded-xl relative overflow-hidden group">
                      <div className="absolute top-0 left-0 bottom-0 w-1 bg-violet-600" />
                      <div className="flex justify-between items-start gap-2">
                        <p className="text-xs font-bold text-white truncate">{slot.subject}</p>
                        <span className="text-[9px] font-black text-violet-400 bg-violet-400/10 px-1.5 py-0.5 rounded shadow-sm whitespace-nowrap">{slot.start_time}</span>
                      </div>
                      <p className="text-[10px] text-white/40 mt-1 truncate">
                        {slot.room ? `📍 ${slot.room}` : 'No room set'}
                        {slot.school_name && ` · ${slot.school_name}`}
                      </p>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-6 border border-dashed border-white/10 rounded-xl">
                    <p className="text-[10px] text-white/20 font-bold uppercase tracking-widest">No classes today</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {role === 'student' && leaderboard.length > 0 && (
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 relative overflow-hidden group">
               <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 blur-3xl -mr-16 -mt-16 group-hover:bg-amber-500/10 transition-all" />
               <div className="flex items-center justify-between mb-8 relative z-10">
                  <h2 className="text-lg font-black text-white uppercase tracking-tight flex items-center gap-3">
                    <TrophyIcon className="w-6 h-6 text-amber-500" /> Hall of Fame
                  </h2>
                  <span className="text-[10px] font-black text-white/20 uppercase tracking-widest">Global Rank</span>
               </div>
               <div className="space-y-1 relative z-10">
                  {leaderboard.map((u, i) => (
                    <div key={i} className={`flex items-center justify-between p-3 rounded-xl transition-all ${u.name === profile.full_name ? 'bg-violet-600/20 border border-violet-500/20' : 'hover:bg-white/5'}`}>
                      <div className="flex items-center gap-4">
                        <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-black ${i === 0 ? 'bg-amber-500 text-black' : i === 1 ? 'bg-slate-300 text-black' : i === 2 ? 'bg-orange-400 text-black' : 'text-white/20'}`}>
                          {u.rank}
                        </div>
                        <div className="w-8 h-8 rounded-full border border-white/10 bg-[#0a0a20] flex items-center justify-center text-[10px] font-bold text-white/40 overflow-hidden">
                          {u.avatar ? <img src={u.avatar} className="w-full h-full object-cover" alt="" /> : u.name[0]}
                        </div>
                        <div className="min-w-0">
                           <p className="text-xs font-black text-white/90 truncate max-w-[100px]">{u.name}</p>
                           <p className="text-[8px] font-black text-white/20 uppercase tracking-widest">{u.level}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-black text-white tabular-nums">{u.points}</p>
                        <p className="text-[8px] font-black text-white/20 uppercase tracking-widest">XP</p>
                      </div>
                    </div>
                  ))}
               </div>
               <Link href="/dashboard/leaderboard" className="mt-8 w-full block text-center py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-[9px] font-black text-white/30 hover:text-white uppercase tracking-widest transition-all">View All Champions</Link>
            </div>
          )}

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