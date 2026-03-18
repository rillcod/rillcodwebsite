// @refresh reset
// Last fix: 2026-03-14 11:00
'use client';

import { useAuth } from '@/contexts/auth-context';
import {
  UserGroupIcon, AcademicCapIcon, BookOpenIcon, ChartBarIcon,
  CogIcon, BuildingOfficeIcon, ClipboardDocumentListIcon,
  PresentationChartLineIcon, ClockIcon, CheckCircleIcon,
  BellIcon, ArrowRightIcon, TrophyIcon, ArrowPathIcon,
  ExclamationTriangleIcon, ShieldCheckIcon, DocumentTextIcon, 
  BoltIcon, RocketLaunchIcon, EnvelopeIcon, UserIcon,
  ArrowRightOnRectangleIcon, Bars3Icon, XMarkIcon, SignalIcon,
  CodeBracketIcon, CalendarDaysIcon, BanknotesIcon, VideoCameraIcon,
  UserPlusIcon, DocumentChartBarIcon, ClipboardDocumentCheckIcon
} from '@/lib/icons';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useEffect, useCallback, useRef } from 'react';
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
    { label: 'Partner Schools', value: totalSchools, icon: BuildingOfficeIcon, gradient: 'from-orange-600 to-orange-400 from-orange-600 to-orange-400' },
    { label: 'Partner Accounts', value: totalPartners, icon: ShieldCheckIcon, gradient: 'from-orange-600 to-orange-400 from-orange-600 to-orange-400' },
    { label: 'Active Teachers', value: totalTeachers, icon: AcademicCapIcon, gradient: 'from-orange-600 to-orange-400' },
    { label: 'Total Students', value: totalStudents, icon: UserGroupIcon, gradient: 'from-orange-600 to-orange-400 from-orange-600 to-orange-400' },
    { label: 'Submissions Graded', value: totalGraded, icon: ChartBarIcon, gradient: 'from-orange-600 to-orange-400 from-orange-600 to-orange-400' },
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
      color: s.status === 'graded' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-orange-500/20 text-orange-400',
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
      color: s.status === 'passed' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-orange-500/20 text-orange-400',
    });
  });

  return activities.slice(0, 6);
}

async function loadTeacherStats(supabase: ReturnType<typeof createClient>, userId: string) {
  // Step 1: get teacher's profile and assigned schools
  const { data: profile } = await supabase.from('portal_users').select('school_id, school_name').eq('id', userId).single();
  const { data: teacherSchools } = await supabase.from('teacher_schools').select('school_id').eq('teacher_id', userId);
  // Also include schools from classes this teacher is currently instructing
  const { data: classSchools } = await supabase.from('classes').select('school_id').eq('teacher_id', userId);
  
  const schoolIds = [...new Set([
    profile?.school_id, 
    ...(teacherSchools?.map(s => s.school_id) || []),
    ...(classSchools?.map(c => c.school_id) || [])
  ])].filter(Boolean) as string[];

  // Get school names for the text-based filtering in 'students' table
  let schoolNames: string[] = [];
  if (profile?.school_name) schoolNames.push(profile.school_name);
  if (schoolIds.length > 0) {
    const { data: schools } = await supabase.from('schools').select('name').in('id', schoolIds);
    (schools ?? []).forEach(s => { if (s.name && !schoolNames.includes(s.name)) schoolNames.push(s.name); });
  }

  // 1. Classes Count (Instructing OR in assigned schools)
  let classQuery = supabase.from('classes').select('id', { count: 'exact', head: true });
  if (schoolIds.length > 0) {
    classQuery = classQuery.or(`teacher_id.eq.${userId},school_id.in.(${schoolIds.join(',')})`);
  } else {
    classQuery = classQuery.eq('teacher_id', userId);
  }

  // 2. Portal Students Count (Unified with Registry 'Enrolled' count)
  let portalStudentQuery: any;
  if (schoolIds.length > 0) {
    portalStudentQuery = supabase.from('portal_users')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'student')
      .in('school_id', schoolIds);
  } else {
    // Only count students in classes this teacher owns
    const { data: teacherClasses } = await supabase.from('classes').select('id').eq('teacher_id', userId);
    const classIds = (teacherClasses ?? []).map((c: any) => c.id);
    if (classIds.length > 0) {
      portalStudentQuery = supabase.from('portal_users').select('id', { count: 'exact', head: true }).eq('role', 'student').in('class_id', classIds);
    } else {
      portalStudentQuery = Promise.resolve({ count: 0 });
    }
  }

  // 3. Applications Count (Unified with Registry 'Applications' count)
  let appsQuery: any;
  if (schoolIds.length > 0 || schoolNames.length > 0) {
    const orParts: string[] = [];
    if (schoolIds.length > 0) orParts.push(`school_id.in.(${schoolIds.join(',')})`);
    if (schoolNames.length > 0) schoolNames.forEach(n => orParts.push(`school_name.eq."${n}"`));
    appsQuery = supabase.from('students').select('id', { count: 'exact', head: true }).or(orParts.join(','));
  } else {
    appsQuery = Promise.resolve({ count: 0 });
  }

  // 4. Assignments Performance (Instructor assignments)
  const { data: myAsgns } = await supabase.from('assignments').select('id').eq('created_by', userId);
  const aIds = (myAsgns ?? []).map((a: any) => a.id);

  const [classes, portalStus, apps, pendingAsgn, pendingCbt, subsAsgn] = await Promise.allSettled([
    classQuery,
    portalStudentQuery,
    appsQuery,
    aIds.length > 0
      ? supabase.from('assignment_submissions').select('id', { count: 'exact', head: true }).eq('status', 'submitted').in('assignment_id', aIds)
      : Promise.resolve({ count: 0 }),
    supabase.from('cbt_sessions').select('id', { count: 'exact', head: true }).eq('status', 'pending_grading'),
    aIds.length > 0
      ? supabase.from('assignment_submissions').select('grade').not('grade', 'is', null).in('assignment_id', aIds).limit(200)
      : Promise.resolve({ data: [] }),
  ]);

  const myClasses = (classes.status === 'fulfilled' ? classes.value.count : 0) ?? 0;
  const enrolledCount = (portalStus.status === 'fulfilled' ? portalStus.value.count : 0) ?? 0;
  const applicationsCount = (apps.status === 'fulfilled' ? apps.value.count : 0) ?? 0;
  const totalStudents = enrolledCount + applicationsCount;

  const pendingCbtCount = (pendingCbt.status === 'fulfilled' ? pendingCbt.value.count : 0) ?? 0;
  const pendingAsgnCount = (pendingAsgn.status === 'fulfilled' ? (pendingAsgn.value as any).count : 0) ?? 0;
  const pendingGrade = pendingAsgnCount + pendingCbtCount;
  
  const asgnGrades = (subsAsgn.status === 'fulfilled' ? (subsAsgn.value as any).data : []) ?? [];
  const allGrades = asgnGrades.map((g: any) => g.grade).filter((g: any) => g != null);
  const avg = allGrades.length > 0
    ? Math.round(allGrades.reduce((s: number, g: any) => s + (g ?? 0), 0) / allGrades.length)
    : 0;

  return [
    { label: 'My Classes', value: myClasses, icon: BookOpenIcon, gradient: 'from-orange-600 to-orange-400 from-orange-600 to-orange-400' },
    { label: 'Total Students', value: totalStudents, icon: UserGroupIcon, gradient: 'from-orange-600 to-orange-400 from-orange-600 to-orange-400' },
    { label: 'Pending Grading', value: pendingGrade, icon: ClipboardDocumentListIcon, gradient: 'from-orange-600 to-orange-400 from-orange-600 to-orange-400' },
    { label: 'Avg Class Perf', value: `${avg}%`, icon: ChartBarIcon, gradient: 'from-orange-600 to-orange-400' },
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
      color: s.status === 'graded' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-orange-500/20 text-orange-400',
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
    { label: 'Enrolled Courses', value: enrolled, icon: BookOpenIcon, gradient: 'from-orange-600 to-orange-400 from-orange-600 to-orange-400' },
    { label: 'XP Points', value: xp, icon: TrophyIcon, gradient: 'from-orange-600 to-orange-400 from-orange-600 to-orange-400' },
    { label: 'Daily Streak', value: `${streak}d 🔥`, icon: BoltIcon, gradient: 'from-orange-600 to-orange-400 from-orange-600 to-orange-400' },
    { label: 'Current Level', value: level, icon: AcademicCapIcon, gradient: 'from-orange-600 to-orange-400' },
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
    color: s.status === 'graded' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-orange-500/20 text-orange-400',
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
    { label: 'Registered Students', value: totalStudents, icon: UserGroupIcon, gradient: 'from-orange-600 to-orange-400 from-orange-600 to-orange-400' },
    { label: 'Assigned Teachers', value: totalTeachers, icon: AcademicCapIcon, gradient: 'from-orange-600 to-orange-400' },
    { label: 'Student Perf. Avg', value: `${avg}%`, icon: ChartBarIcon, gradient: 'from-orange-600 to-orange-400 from-orange-600 to-orange-400' },
    { label: 'Submissions Count', value: gradedData.length, icon: ClipboardDocumentListIcon, gradient: 'from-orange-600 to-orange-400 from-orange-600 to-orange-400' },
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
    { name: 'Learning Center', href: '/dashboard/learning', icon: RocketLaunchIcon, desc: 'View enrolled programs' },
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
  const { user, profile, loading, profileLoading, refreshProfile } = useAuth();
  const router = useRouter();
  const [now, setNow] = useState<Date | null>(null);
  const [stats, setStats] = useState<DashStats[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [upcomingSlots, setUpcomingSlots] = useState<Slot[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  // Track how many auto-retries we've done before showing the "not found" error
  const profileRetryCount = useRef(0);

  // Helper to load upcoming slots
  const loadUpcomingSlots = async (supabase: any, role: string, userId: string, schoolId?: string) => {
    try {
      const today = new Date().toLocaleDateString('en-US', { weekday: 'long' });
      let query = supabase.from('timetable_slots').select('*, timetables(school_id, schools(name))').eq('day_of_week', today);
      
      if (role === 'teacher') {
        query = query.eq('teacher_id', userId);
      } else if (role === 'school' && schoolId) {
        // 2-step approach: find active timetable for this school first
        const { data: tt } = await supabase.from('timetables')
          .select('id').eq('school_id', schoolId).eq('is_active', true).maybeSingle();
        if (tt) query = query.eq('timetable_id', tt.id);
        else { setUpcomingSlots([]); return; }
      }
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

  // Auto-refresh stats every 60 seconds for teachers (live class/student counts)
  useEffect(() => {
    if (profile?.role !== 'teacher' && profile?.role !== 'admin') return;
    const interval = setInterval(() => { fetchDashData(); }, 60_000);
    return () => clearInterval(interval);
  }, [profile?.role, fetchDashData]);

  // Auto-retry profile fetch if it came back null (up to 2 extra attempts, short delays)
  useEffect(() => {
    if (!profileLoading && !profile && user && profileRetryCount.current < 2) {
      profileRetryCount.current += 1;
      const delay = profileRetryCount.current * 500; // 500 ms, then 1000 ms
      const t = setTimeout(() => { refreshProfile(); }, delay);
      return () => clearTimeout(t);
    }
  }, [profileLoading, profile, user, refreshProfile]);

  // ── Loading / guard screens ────────────────────────────────────

  // Auth session resolving (fresh visit or expired token being refreshed)
  if (loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-4 border-border border-t-orange-500 rounded-full animate-spin" />
        <p className="text-muted-foreground text-sm">Loading your dashboard…</p>
        <a href="/login" className="mt-2 text-xs text-orange-400 hover:text-orange-500 underline underline-offset-2 transition-colors">
          Sign in instead →
        </a>
      </div>
    </div>
  );

  // No user — redirect is queued in useEffect
  if (!user) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="flex flex-col items-center gap-4 text-center px-4">
        <div className="w-10 h-10 border-4 border-rose-500/20 border-t-rose-500 rounded-full animate-spin" />
        <p className="text-foreground font-semibold">Redirecting to login…</p>
        <a href="/login"
          className="mt-2 px-6 py-2 bg-rose-600/20 hover:bg-rose-600/40 text-rose-400 text-sm font-bold rounded-none border border-rose-600/30 transition-colors">
          Go to Login
        </a>
      </div>
    </div>
  );

  // User is authenticated but profile row is still being fetched — show spinner, NOT an error
  if (profileLoading || !profile) {
    // Profile fetch finished but returned null → show error only after retries exhausted
    if (!profileLoading && !profile && profileRetryCount.current >= 2) return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
        <div className="flex flex-col items-center gap-6">
          <div className="w-20 h-20 bg-rose-500/10 border border-rose-500/20 rounded-none flex items-center justify-center shadow-2xl shadow-rose-500/10 mb-2">
            <ExclamationTriangleIcon className="w-10 h-10 text-rose-400" />
          </div>
          <div className="space-y-2">
            <h2 className="text-foreground font-black text-2xl tracking-tight">Account Not Found</h2>
            <p className="text-muted-foreground text-sm max-w-sm leading-relaxed">
              Your login was successful but your portal profile could not be loaded. Your account may be inactive or not yet set up.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 w-full max-w-xs">
            <button onClick={() => window.location.reload()}
              className="px-6 py-3 bg-card shadow-sm hover:bg-muted text-foreground text-sm font-bold rounded-none border border-border transition-all">
              Reload Page
            </button>
            <a href="/login?clear=1"
              className="px-6 py-3 bg-rose-600 hover:bg-rose-500 text-foreground text-sm font-bold rounded-none transition-all shadow-lg shadow-rose-900/40">
              Sign Out &amp; Retry
            </a>
          </div>
        </div>
      </div>
    );

    // Profile fetch still in flight — show a clean spinner
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-border border-t-orange-500 rounded-full animate-spin" />
          <p className="text-muted-foreground text-sm">Setting up your workspace…</p>
        </div>
      </div>
    );
  }

  const role = profile.role as 'admin' | 'teacher' | 'student' | 'school';
  const quickActions = QUICK_ACTIONS[role] ?? QUICK_ACTIONS.student;

  return (
    <div className="space-y-6">

      {/* ── Welcome Banner ── */}
      <div className="bg-background border border-border rounded-none shadow-2xl p-6 sm:p-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6 sm:gap-8 relative overflow-hidden">
        {/* Decorative blobs */}
        <div className="absolute top-0 right-0 -translate-y-12 translate-x-12 w-64 h-64 bg-white opacity-[0.03] rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 translate-y-12 -translate-x-12 w-48 h-48 bg-orange-600 opacity-20 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center gap-6">
          <div className="flex-shrink-0 p-4 bg-muted backdrop-blur-md rounded-none border border-border shadow-2xl">
            <img src="/images/logo.png" alt="Rillcod Logo" className="w-16 h-16 sm:w-20 sm:h-20 object-contain drop-shadow-[0_0_15px_rgba(255,255,255,0.3)]" />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-4">
              <span className="px-3 py-1 bg-orange-600/80 text-foreground text-[10px] font-black uppercase tracking-widest rounded-full">
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

      {/* ── Stats Grid ── */}
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Live Stats</p>
        <button
          onClick={fetchDashData}
          disabled={dataLoading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-foreground bg-card shadow-sm hover:bg-muted border border-border rounded-none transition-all disabled:opacity-40"
        >
          <ArrowPathIcon className={`w-3.5 h-3.5 ${dataLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6">
        {dataLoading
          ? Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-card shadow-sm border border-border rounded-none p-5 sm:p-6 animate-pulse">
              <div className="h-10 w-10 bg-muted rounded-none mb-4" />
              <div className="h-8 bg-muted rounded w-1/2 mb-2" />
              <div className="h-4 bg-card shadow-sm rounded w-2/3" />
            </div>
          ))
          : stats.map(({ label, value, icon: Icon, gradient }) => (
            <div key={label} className="bg-card shadow-sm border border-border rounded-none p-5 sm:p-7 hover:bg-white/8 hover:border-border transition-all group relative overflow-hidden">
              <div className={`absolute top-0 right-0 w-24 h-24 bg-gradient-to-br ${gradient} opacity-[0.03] blur-2xl -mr-12 -mt-12 group-hover:scale-150 transition-transform`} />
              <div className="flex items-start justify-between mb-5 relative z-10">
                <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-none bg-gradient-to-br ${gradient} flex items-center justify-center shadow-xl group-hover:scale-110 transition-transform`}>
                  <Icon className="h-5 w-5 sm:h-6 sm:w-6 text-foreground" />
                </div>
                <span className="text-[8px] sm:text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] bg-card shadow-sm px-2 py-0.5 rounded-full border border-border">Live</span>
              </div>
              <p className="text-2xl sm:text-4xl font-black text-foreground tracking-tight tabular-nums relative z-10">{value}</p>
              <p className="text-[10px] sm:text-xs text-muted-foreground font-black uppercase tracking-widest mt-1.5 relative z-10">{label}</p>
            </div>
          ))
        }
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* ── Left: Quick Actions + Activity ── */}
        <div className="xl:col-span-2 space-y-6">

          {/* Quick Actions */}
          <div className="bg-card shadow-sm border border-border rounded-none p-6">
            <h2 className="text-lg font-bold text-foreground mb-5">Quick Actions</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {quickActions.map(({ name, href, icon: Icon, desc }) => (
                <Link key={name} href={href}
                  className="group flex items-start gap-4 p-4 rounded-none border border-border hover:border-orange-500/40 hover:bg-orange-500/5 transition-all">
                  <div className="w-10 h-10 rounded-none bg-orange-500/15 border border-orange-500/20 flex items-center justify-center flex-shrink-0 group-hover:bg-orange-500/25 transition-colors">
                    <Icon className="h-5 w-5 text-orange-400" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground text-sm group-hover:text-orange-500 transition-colors">{name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          {/* Recent Activity — live from DB */}
          <div className="bg-background border border-border rounded-none p-6 sm:p-8 shadow-2xl">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="text-xl font-black text-foreground tracking-tight">Recent Activity</h2>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-widest mt-1">Live Platform Pulse</p>
              </div>
              <button onClick={fetchDashData} className="p-3 rounded-none bg-card shadow-sm hover:bg-muted text-muted-foreground hover:text-foreground border border-border transition-all group" title="Refresh">
                <ArrowPathIcon className={`w-4 h-4 ${dataLoading ? 'animate-spin' : 'group-active:rotate-180 transition-transform'}`} />
              </button>
            </div>
            {dataLoading ? (
              <div className="space-y-4">
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className="flex items-center gap-4 animate-pulse">
                    <div className="w-11 h-11 bg-card shadow-sm rounded-none flex-shrink-0" />
                    <div className="flex-1 space-y-3">
                      <div className="h-4 bg-card shadow-sm rounded w-3/4" />
                      <div className="h-3 bg-card shadow-sm rounded w-1/2 opacity-50" />
                    </div>
                  </div>
                ))}
              </div>
            ) : activities.length === 0 ? (
              <div className="text-center py-16 bg-white/[0.02] border border-dashed border-border rounded-none">
                <div className="w-16 h-16 bg-card shadow-sm rounded-full flex items-center justify-center mx-auto mb-4 border border-border">
                  <ClipboardDocumentListIcon className="w-8 h-8 text-muted-foreground" />
                </div>
                <p className="text-muted-foreground font-bold uppercase tracking-widest text-xs">No recent activity yet</p>
              </div>
            ) : (
              <div className="space-y-2">
                {activities.map((a, i) => (
                  <div key={a.id} className="group flex items-start gap-4 p-4 rounded-none hover:bg-white/[0.03] transition-all border border-transparent hover:border-border">
                    <div className={`w-11 h-11 rounded-none flex items-center justify-center flex-shrink-0 shadow-lg ${a.color} group-hover:scale-110 transition-transform`}>
                      <a.icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-foreground text-sm tracking-tight group-hover:text-orange-500 transition-colors uppercase leading-none mt-1">
                        {a.title}
                      </p>
                      <p className="text-xs text-muted-foreground mt-2 font-medium truncate">{a.desc}</p>
                    </div>
                    <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest whitespace-nowrap mt-1 bg-card shadow-sm px-2 py-0.5 rounded-full border border-border group-hover:text-muted-foreground transition-colors">
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
          <div className="bg-gradient-to-br from-orange-600/20 from-orange-600 to-orange-400/20 border border-orange-500/20 rounded-none p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-none bg-gradient-to-br from-orange-600 from-orange-600 to-orange-400 flex items-center justify-center text-xl font-black text-foreground">
                {(profile.full_name ?? 'U')[0].toUpperCase()}
              </div>
              <div>
                <p className="font-bold text-foreground truncate">{profile.full_name}</p>
                <p className="text-xs text-muted-foreground truncate">{profile.email}</p>
              </div>
            </div>
            <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold border capitalize ${role === 'admin' ? 'bg-red-500/20 text-red-400 border-red-500/30' :
              role === 'teacher' ? 'bg-orange-500/20 text-orange-400 border-blue-500/30' :
                role === 'school' ? 'bg-orange-500/20 text-orange-400 border-orange-500/30' :
                  'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
              }`}>{role}</span>
            <div className="mt-4 pt-4 border-t border-border flex flex-col gap-2">
              <Link href="/dashboard/settings"
                className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors">
                <CogIcon className="w-4 h-4" /> Account Settings
              </Link>
              <Link href="/dashboard/profile"
                className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors">
                <AcademicCapIcon className="w-4 h-4" /> Edit Profile
              </Link>
            </div>
          </div>

          {/* Upcoming Schedule */}
          {(role === 'teacher' || role === 'student' || role === 'school') && (
            <div className="bg-card shadow-sm border border-border rounded-none p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-foreground text-sm">What's Next</h3>
                <Link href="/dashboard/timetable" className="text-[10px] font-black text-orange-400 uppercase tracking-widest hover:underline">Full View</Link>
              </div>
              <div className="space-y-2">
                {upcomingSlots.length > 0 ? (
                  upcomingSlots.map(slot => (
                    <div key={slot.id} className="p-3 bg-card shadow-sm border border-border rounded-none relative overflow-hidden group">
                      <div className="absolute top-0 left-0 bottom-0 w-1 bg-orange-600" />
                      <div className="flex justify-between items-start gap-2">
                        <p className="text-xs font-bold text-foreground truncate">{slot.subject}</p>
                        <span className="text-[9px] font-black text-orange-400 bg-orange-400/10 px-1.5 py-0.5 rounded shadow-sm whitespace-nowrap">{slot.start_time}</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-1 truncate">
                        {slot.room ? `📍 ${slot.room}` : 'No room set'}
                        {slot.school_name && ` · ${slot.school_name}`}
                      </p>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-6 border border-dashed border-border rounded-none">
                    <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">No classes today</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {role === 'student' && leaderboard.length > 0 && (
            <div className="bg-card shadow-sm border border-border rounded-none p-6 relative overflow-hidden group">
               <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 blur-3xl -mr-16 -mt-16 group-hover:bg-amber-500/10 transition-all" />
               <div className="flex items-center justify-between mb-8 relative z-10">
                  <h2 className="text-lg font-black text-foreground uppercase tracking-tight flex items-center gap-3">
                    <TrophyIcon className="w-6 h-6 text-amber-500" /> Hall of Fame
                  </h2>
                  <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Global Rank</span>
               </div>
               <div className="space-y-1 relative z-10">
                  {leaderboard.map((u, i) => (
                    <div key={i} className={`flex items-center justify-between p-3 rounded-none transition-all ${u.name === profile.full_name ? 'bg-orange-600/20 border border-orange-500/20' : 'hover:bg-card shadow-sm'}`}>
                      <div className="flex items-center gap-4">
                        <div className={`w-6 h-6 rounded-none flex items-center justify-center text-[10px] font-black ${i === 0 ? 'bg-amber-500 text-black' : i === 1 ? 'bg-slate-300 text-black' : i === 2 ? 'bg-orange-400 text-black' : 'text-muted-foreground'}`}>
                          {u.rank}
                        </div>
                        <div className="w-8 h-8 rounded-full border border-border bg-background flex items-center justify-center text-[10px] font-bold text-muted-foreground overflow-hidden">
                          {u.avatar ? <img src={u.avatar} className="w-full h-full object-cover" alt="" /> : u.name[0]}
                        </div>
                        <div className="min-w-0">
                           <p className="text-xs font-black text-muted-foreground truncate max-w-[100px]">{u.name}</p>
                           <p className="text-[8px] font-black text-muted-foreground uppercase tracking-widest">{u.level}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-black text-foreground tabular-nums">{u.points}</p>
                        <p className="text-[8px] font-black text-muted-foreground uppercase tracking-widest">XP</p>
                      </div>
                    </div>
                  ))}
               </div>
               <Link href="/dashboard/leaderboard" className="mt-8 w-full block text-center py-3 bg-card shadow-sm hover:bg-muted border border-border rounded-none text-[9px] font-black text-muted-foreground hover:text-foreground uppercase tracking-widest transition-all">View All Champions</Link>
            </div>
          )}

          {/* Useful links */}
          <div className="bg-card shadow-sm border border-border rounded-none p-5">
            <h3 className="font-bold text-foreground text-sm mb-4">Navigate To</h3>
            <div className="space-y-1">
              {role === 'admin' && [
                { label: 'Approvals', href: '/dashboard/approvals', icon: CheckCircleIcon },
                { label: 'Analytics', href: '/dashboard/analytics', icon: ChartBarIcon },
                { label: 'Grades', href: '/dashboard/grades', icon: TrophyIcon },
                { label: 'Schools', href: '/dashboard/schools', icon: BuildingOfficeIcon },
              ].map(({ label, href, icon: Icon }) => (
                <Link key={label} href={href}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-none text-sm text-muted-foreground hover:bg-card shadow-sm hover:text-foreground transition-all group">
                  <Icon className="w-4 h-4 group-hover:text-orange-400 transition-colors" />
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
                  className="flex items-center gap-3 px-3 py-2.5 rounded-none text-sm text-muted-foreground hover:bg-card shadow-sm hover:text-foreground transition-all group">
                  <Icon className="w-4 h-4 group-hover:text-orange-400 transition-colors" />
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
                  className="flex items-center gap-3 px-3 py-2.5 rounded-none text-sm text-muted-foreground hover:bg-card shadow-sm hover:text-foreground transition-all group">
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
                  className="flex items-center gap-3 px-3 py-2.5 rounded-none text-sm text-muted-foreground hover:bg-card shadow-sm hover:text-foreground transition-all group">
                  <Icon className="w-4 h-4 group-hover:text-orange-400 transition-colors" />
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