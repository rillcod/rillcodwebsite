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
import StudentDashboardWidget from '@/components/dashboard/StudentDashboard';
import AdminDashboard from '@/components/dashboard/AdminDashboard';
import TeacherDashboard from '@/components/dashboard/TeacherDashboard';
import SchoolDashboard from '@/components/dashboard/SchoolDashboard';
import ParentDashboard from '@/components/dashboard/ParentDashboard';
import BillingStickyNotices from '@/components/billing/BillingStickyNotices';

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
    (users ?? []).forEach((u: any) => { umap[u.id] = u.full_name ?? 'Student'; });
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
    if (schoolNames.length > 0) schoolNames.forEach(n => orParts.push(`school_name.eq.${n}`));
    // Only count pre-portal students (user_id IS NULL) to avoid double-counting with portal_users
    appsQuery = supabase.from('students').select('id', { count: 'exact', head: true }).is('user_id', null).or(orParts.join(','));
  } else {
    appsQuery = Promise.resolve({ count: 0 });
  }

  // 4. Assignments Performance (Instructor assignments)
  const { data: myAsgns } = await supabase.from('assignments').select('id').eq('created_by', userId);
  const aIds = (myAsgns ?? []).map((a: any) => a.id);

  // Get teacher's exam IDs to scope CBT stats
  const { data: myExams } = await supabase.from('cbt_exams').select('id').eq('created_by', userId);
  const eIds = (myExams ?? []).map((e: any) => e.id);

  const [classes, portalStus, apps, pendingAsgn, pendingCbt, subsAsgn] = await Promise.allSettled([
    classQuery,
    portalStudentQuery,
    appsQuery,
    aIds.length > 0
      ? supabase.from('assignment_submissions').select('id', { count: 'exact', head: true }).eq('status', 'submitted').in('assignment_id', aIds)
      : Promise.resolve({ count: 0 }),
    eIds.length > 0
      ? supabase.from('cbt_sessions').select('id', { count: 'exact', head: true }).eq('status', 'pending_grading').in('exam_id', eIds)
      : Promise.resolve({ count: 0 }),
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

async function loadTeacherActionCenter(supabase: ReturnType<typeof createClient>, userId: string) {
  // Scope to THIS teacher's own assignments and exams only
  const [myAsgns, myExams] = await Promise.all([
    supabase.from('assignments').select('id').eq('created_by', userId),
    supabase.from('cbt_exams').select('id').eq('created_by', userId),
  ]);
  const aIds = (myAsgns.data ?? []).map((a: any) => a.id);
  const eIds = (myExams.data ?? []).map((e: any) => e.id);

  const [ungradedSubs, ungradedCbt] = await Promise.allSettled([
    aIds.length > 0
      ? supabase
        .from('assignment_submissions')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'submitted')
        .is('grade', null)
        .in('assignment_id', aIds)
      : Promise.resolve({ count: 0 }),
    eIds.length > 0
      ? supabase
        .from('cbt_sessions')
        .select('id', { count: 'exact', head: true })
        .eq('needs_grading', true)
        .in('exam_id', eIds)
      : Promise.resolve({ count: 0 }),
  ]);

  const ungradedAssignments = ungradedSubs.status === 'fulfilled' ? (ungradedSubs.value.count ?? 0) : 0;
  const ungradedExams = ungradedCbt.status === 'fulfilled' ? (ungradedCbt.value.count ?? 0) : 0;

  return { ungradedAssignments, ungradedExams };
}

async function loadTeacherActivity(supabase: ReturnType<typeof createClient>, userId: string): Promise<Activity[]> {
  // Step 1: get teacher's assignment IDs to filter submissions correctly
  const { data: myAsgns } = await supabase.from('assignments').select('id, title').eq('created_by', userId);
  const aIds = (myAsgns ?? []).map((a: any) => a.id);
  const aTitleMap: Record<string, string> = {};
  (myAsgns ?? []).forEach((a: any) => { aTitleMap[a.id] = a.title; });

  // Get teacher's exam IDs to scope CBT activity
  const { data: myExamsAct } = await supabase.from('cbt_exams').select('id').eq('created_by', userId);
  const eIdsAct = (myExamsAct ?? []).map((e: any) => e.id);

  const [asgnRes, cbtRes] = await Promise.all([
    aIds.length > 0
      ? supabase.from('assignment_submissions')
        .select('id, status, submitted_at, assignment_id, portal_user_id, user_id')
        .in('assignment_id', aIds).order('submitted_at', { ascending: false }).limit(5)
      : Promise.resolve({ data: [] }),
    eIdsAct.length > 0
      ? supabase.from('cbt_sessions')
        .select('id, status, end_time, user_id, cbt_exams(title)')
        .in('exam_id', eIdsAct)
        .order('end_time', { ascending: false }).limit(5)
      : Promise.resolve({ data: [] }),
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
    studentQuery = studentQuery.or(`school_id.eq.${schoolId},school_name.eq.${schoolName}`);
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



async function loadAdminSchoolPayments(supabase: ReturnType<typeof createClient>) {
  const { data } = await supabase
    .from('invoices')
    .select('id, invoice_number, amount, currency, status, due_date, created_at, schools(name)')
    .not('school_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(15);
  return (data ?? []) as unknown as {
    id: string;
    invoice_number: string;
    amount: number;
    currency: string;
    status: string;
    due_date: string;
    created_at: string;
    schools: { name: string } | null;
  }[];
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
    { name: 'Register Students', href: '/dashboard/students/bulk-register', icon: UserPlusIcon, desc: 'Add students individually or in bulk' },
    { name: 'My Students', href: '/dashboard/students', icon: UserGroupIcon, desc: 'View & manage student roster' },
    { name: 'Assignments', href: '/dashboard/assignments', icon: ClipboardDocumentListIcon, desc: 'Create & grade work' },
    { name: 'Classes', href: '/dashboard/classes', icon: BookOpenIcon, desc: 'Manage your classes' },
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
  const [teacherActionCenter, setTeacherActionCenter] = useState<{ ungradedAssignments: number; ungradedExams: number } | null>(null);
  const [schoolPayments, setSchoolPayments] = useState<Awaited<ReturnType<typeof loadAdminSchoolPayments>>>([]);
  const [parentChildren, setParentChildren] = useState<any[]>([]);
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
      if (role === 'teacher') {
        const actionCenter = await loadTeacherActionCenter(supabase, profile.id);
        setTeacherActionCenter(actionCenter);
      }
      if (role === 'admin') {
        const sp = await loadAdminSchoolPayments(supabase);
        setSchoolPayments(sp);
      }
      if (role === 'parent') {
        fetch('/api/parents/portal?section=summary')
          .then(res => res.json())
          .then(data => {
            setParentChildren(data.children ?? []);
          })
          .catch(err => console.error('Failed to load parent dashboard data:', err));
      }
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

  const role = profile.role as 'admin' | 'teacher' | 'student' | 'school' | 'parent';
  const quickActions = (QUICK_ACTIONS as Record<string, typeof QUICK_ACTIONS.student>)[role] ?? QUICK_ACTIONS.student;

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

      {/* Sticky Billing Notices (web + mobile responsive card) */}
      <BillingStickyNotices />

      {/* ── Role-specific dashboard ── */}
      {role === 'admin' && (
        <AdminDashboard
          profile={profile}
          stats={stats}
          activities={activities}
          schoolPayments={schoolPayments}
          quickActions={quickActions}
          dataLoading={dataLoading}
          onRefresh={fetchDashData}
        />
      )}
      {role === 'teacher' && (
        <TeacherDashboard
          profile={profile}
          stats={stats}
          activities={activities}
          upcomingSlots={upcomingSlots}
          teacherActionCenter={teacherActionCenter}
          quickActions={quickActions}
          dataLoading={dataLoading}
          onRefresh={fetchDashData}
        />
      )}
      {role === 'school' && (
        <SchoolDashboard
          profile={profile}
          stats={stats}
          activities={activities}
          upcomingSlots={upcomingSlots}
          quickActions={quickActions}
          dataLoading={dataLoading}
          onRefresh={fetchDashData}
        />
      )}
      {role === 'student' && <StudentDashboardWidget />}
      {role === 'parent' && (
        <ParentDashboard
          profile={profile}
          children={parentChildren}
          dataLoading={dataLoading}
          onRefresh={fetchDashData}
        />
      )}
    </div>
  );
}