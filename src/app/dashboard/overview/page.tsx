'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import {
  ChartBarIcon, UserGroupIcon, AcademicCapIcon, BookOpenIcon,
  ClipboardDocumentListIcon, BuildingOfficeIcon, ArrowTrendingUpIcon,
  ClockIcon, CheckCircleIcon, BellIcon, ArrowRightIcon,
  TrophyIcon, CalendarIcon, ShieldCheckIcon, DocumentTextIcon,
} from '@heroicons/react/24/outline';

export default function OverviewPage() {
  const { profile, loading: authLoading } = useAuth();
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [recentSubmissions, setRecentSubmissions] = useState<any[]>([]);
  const [recentStudents, setRecentStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const role = profile?.role ?? '';

  useEffect(() => {
    if (authLoading || !profile) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      const supabase = createClient();
      try {
        if (role === 'admin') {
          const [schools, students, teachers, partnerships, programs] = await Promise.allSettled([
            supabase.from('schools').select('id', { count: 'exact', head: true }),
            supabase.from('students').select('id', { count: 'exact', head: true }),
            supabase.from('portal_users').select('id', { count: 'exact', head: true }).eq('role', 'teacher'),
            supabase.from('portal_users').select('id', { count: 'exact', head: true }).eq('role', 'school'),
            supabase.from('programs').select('id', { count: 'exact', head: true }),
          ]);
          const [recStudents] = await Promise.allSettled([
            supabase.from('students').select('id, full_name, school_name, status, created_at')
              .order('created_at', { ascending: false }).limit(5),
          ]);
          if (!cancelled) {
            setCounts({
              schools: schools.status === 'fulfilled' ? (schools.value.count ?? 0) : 0,
              students: students.status === 'fulfilled' ? (students.value.count ?? 0) : 0,
              teachers: teachers.status === 'fulfilled' ? (teachers.value.count ?? 0) : 0,
              partners: partnerships.status === 'fulfilled' ? (partnerships.value.count ?? 0) : 0,
              programs: programs.status === 'fulfilled' ? (programs.value.count ?? 0) : 0,
            });
            setRecentStudents(recStudents.status === 'fulfilled' ? (recStudents.value.data ?? []) : []);
          }
        } else if (role === 'teacher') {
          const [classes, subs, pending] = await Promise.allSettled([
            supabase.from('classes').select('id', { count: 'exact', head: true }).eq('teacher_id', profile!.id),
            supabase.from('assignment_submissions').select('id', { count: 'exact', head: true }),
            supabase.from('assignment_submissions').select('id', { count: 'exact', head: true }).eq('status', 'submitted'),
          ]);
          const recSubs = await supabase.from('assignment_submissions')
            .select(`id, status, submitted_at, portal_users!assignment_submissions_portal_user_id_fkey ( full_name ), assignments ( title )`)
            .order('submitted_at', { ascending: false }).limit(5);
          if (!cancelled) {
            setCounts({
              classes: classes.status === 'fulfilled' ? (classes.value.count ?? 0) : 0,
              submissions: subs.status === 'fulfilled' ? (subs.value.count ?? 0) : 0,
              pending: pending.status === 'fulfilled' ? (pending.value.count ?? 0) : 0,
            });
            setRecentSubmissions(recSubs.data ?? []);
          }
        } else if (role === 'school') {
          const [sStudents, sTeachers, sGraded] = await Promise.allSettled([
            supabase.from('students').select('id', { count: 'exact', head: true }).eq('school_id', profile!.school_id!),
            supabase.from('teacher_schools').select('id', { count: 'exact', head: true }).eq('school_id', profile!.school_id!),
            supabase.from('assignment_submissions')
              .select('id, portal_users!inner(school_id)', { count: 'exact', head: true })
              .eq('portal_users.school_id', profile!.school_id!)
              .not('grade', 'is', null),
          ]);
          const recent = await supabase.from('assignment_submissions')
            .select(`id, status, submitted_at, portal_users!inner(full_name, school_id), assignments(title, max_points)`)
            .eq('portal_users.school_id', profile!.school_id!)
            .order('submitted_at', { ascending: false }).limit(5);

          if (!cancelled) {
            setCounts({
              students: sStudents.status === 'fulfilled' ? (sStudents.value.count ?? 0) : 0,
              teachers: sTeachers.status === 'fulfilled' ? (sTeachers.value.count ?? 0) : 0,
              graded: sGraded.status === 'fulfilled' ? (sGraded.value.count ?? 0) : 0,
            });
            setRecentSubmissions(recent.data ?? []);
          }
        } else {
          // student
          const [mySubs, myEnr] = await Promise.allSettled([
            supabase.from('assignment_submissions').select('id', { count: 'exact', head: true }).eq('portal_user_id', profile!.id),
            supabase.from('enrollments').select('id', { count: 'exact', head: true }).eq('user_id', profile!.id),
          ]);
          const graded = await supabase.from('assignment_submissions')
            .select(`id, grade, status, submitted_at, assignments ( title, max_points )`)
            .eq('portal_user_id', profile!.id)
            .eq('status', 'graded')
            .order('submitted_at', { ascending: false }).limit(5);
          if (!cancelled) {
            setCounts({
              submissions: mySubs.status === 'fulfilled' ? (mySubs.value.count ?? 0) : 0,
              enrolled: myEnr.status === 'fulfilled' ? (myEnr.value.count ?? 0) : 0,
            });
            setRecentSubmissions(graded.data ?? []);
          }
        }
      } catch { /* ignore */ }
      finally { if (!cancelled) setLoading(false); }
    }
    load();
    return () => { cancelled = true; };
  }, [profile?.id, role, authLoading]); // eslint-disable-line

  if (authLoading || loading) return (
    <div className="min-h-screen bg-[#0f0f1a] text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div className="animate-pulse space-y-2">
          <div className="h-4 bg-white/10 rounded w-32" />
          <div className="h-8 bg-white/10 rounded w-64" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <div key={i} className="bg-white/5 border border-white/10 rounded-2xl h-28 animate-pulse" />)}
        </div>
        {[1, 2].map(i => <div key={i} className="bg-white/5 border border-white/10 rounded-2xl h-40 animate-pulse" />)}
      </div>
    </div>
  );

  if (!profile) return null;

  const adminStats = [
    { label: 'Partner Schools', value: counts.schools ?? 0, icon: BuildingOfficeIcon, color: 'text-blue-400', bg: 'bg-blue-500/10', href: '/dashboard/schools' },
    { label: 'Partner Accounts', value: counts.partners ?? 0, icon: ShieldCheckIcon, color: 'text-cyan-400', bg: 'bg-cyan-500/10', href: '/dashboard/schools' },
    { label: 'Total Students', value: counts.students ?? 0, icon: UserGroupIcon, color: 'text-violet-400', bg: 'bg-violet-500/10', href: '/dashboard/students' },
    { label: 'Teachers', value: counts.teachers ?? 0, icon: AcademicCapIcon, color: 'text-emerald-400', bg: 'bg-emerald-500/10', href: '/dashboard/teachers' },
  ];

  const teacherStats = [
    { label: 'My Classes', value: counts.classes ?? 0, icon: BookOpenIcon, color: 'text-violet-400', bg: 'bg-violet-500/10', href: '/dashboard/classes' },
    { label: 'Submissions', value: counts.submissions ?? 0, icon: ClipboardDocumentListIcon, color: 'text-blue-400', bg: 'bg-blue-500/10', href: '/dashboard/grades' },
    { label: 'Needs Grading', value: counts.pending ?? 0, icon: ClockIcon, color: 'text-amber-400', bg: 'bg-amber-500/10', href: '/dashboard/grades' },
    { label: 'Assignments', value: 0, icon: ClipboardDocumentListIcon, color: 'text-emerald-400', bg: 'bg-emerald-500/10', href: '/dashboard/assignments' },
  ];

  const studentStats = [
    { label: 'Submissions', value: counts.submissions ?? 0, icon: ClipboardDocumentListIcon, color: 'text-blue-400', bg: 'bg-blue-500/10', href: '/dashboard/grades' },
    { label: 'Enrolled In', value: counts.enrolled ?? 0, icon: BookOpenIcon, color: 'text-violet-400', bg: 'bg-violet-500/10', href: '/dashboard/courses' },
    { label: 'Assignments', value: 0, icon: ClockIcon, color: 'text-amber-400', bg: 'bg-amber-500/10', href: '/dashboard/assignments' },
    { label: 'Progress', value: 0, icon: TrophyIcon, color: 'text-emerald-400', bg: 'bg-emerald-500/10', href: '/dashboard/progress' },
  ];

  const schoolStats = [
    { label: 'My Students', value: counts.students ?? 0, icon: UserGroupIcon, color: 'text-blue-400', bg: 'bg-blue-500/10', href: '/dashboard/students' },
    { label: 'Active Teachers', value: counts.teachers ?? 0, icon: AcademicCapIcon, color: 'text-violet-400', bg: 'bg-violet-500/10', href: '/dashboard/teachers' },
    { label: 'Graded Results', value: counts.graded ?? 0, icon: CheckCircleIcon, color: 'text-emerald-400', bg: 'bg-emerald-500/10', href: '/dashboard/results' },
    { label: 'Analytics', value: 0, icon: ChartBarIcon, color: 'text-amber-400', bg: 'bg-amber-500/10', href: '/dashboard/analytics' },
  ];

  const stats = role === 'admin' ? adminStats : role === 'teacher' ? teacherStats : role === 'school' ? schoolStats : studentStats;

  const quickLinks = role === 'admin' ? [
    { label: 'Approvals Queue', href: '/dashboard/approvals', icon: ClipboardDocumentListIcon, color: 'bg-violet-600' },
    { label: 'School Management', href: '/dashboard/schools', icon: BuildingOfficeIcon, color: 'bg-blue-600' },
    { label: 'Analytics', href: '/dashboard/analytics', icon: ChartBarIcon, color: 'bg-emerald-600' },
    { label: 'Students', href: '/dashboard/students', icon: UserGroupIcon, color: 'bg-amber-600' },
  ] : role === 'teacher' ? [
    { label: 'Grade Submissions', href: '/dashboard/grades', icon: ClipboardDocumentListIcon, color: 'bg-violet-600' },
    { label: 'Assignments', href: '/dashboard/assignments', icon: CalendarIcon, color: 'bg-blue-600' },
    { label: 'Classes', href: '/dashboard/classes', icon: BookOpenIcon, color: 'bg-emerald-600' },
    { label: 'Progress', href: '/dashboard/progress', icon: ChartBarIcon, color: 'bg-amber-600' },
  ] : role === 'school' ? [
    { label: 'School Registry', href: '/dashboard/schools', icon: BuildingOfficeIcon, color: 'bg-violet-600' },
    { label: 'Student Roster', href: '/dashboard/students', icon: UserGroupIcon, color: 'bg-blue-600' },
    { label: 'Exam Results', href: '/dashboard/results', icon: DocumentTextIcon, color: 'bg-emerald-600' },
    { label: 'Messages', href: '/dashboard/messages', icon: BellIcon, color: 'bg-amber-600' },
  ] : [
    { label: 'My Assignments', href: '/dashboard/assignments', icon: ClipboardDocumentListIcon, color: 'bg-violet-600' },
    { label: 'My Courses', href: '/dashboard/courses', icon: BookOpenIcon, color: 'bg-blue-600' },
    { label: 'My Grades', href: '/dashboard/grades', icon: TrophyIcon, color: 'bg-emerald-600' },
    { label: 'Progress', href: '/dashboard/progress', icon: ChartBarIcon, color: 'bg-amber-600' },
  ];

  return (
    <div className="min-h-screen bg-[#0f0f1a] text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">

        {/* Header */}
        <div className="bg-gradient-to-r from-violet-600/20 via-blue-600/10 to-transparent border border-white/10 rounded-3xl p-7 relative overflow-hidden">
          <div className="absolute right-0 top-0 w-64 h-full bg-gradient-to-l from-violet-500/10 to-transparent rounded-3xl pointer-events-none" />
          <div className="relative">
            <span className="text-xs font-bold text-violet-400 uppercase tracking-widest">
              {role} Dashboard
            </span>
            <h1 className="text-3xl font-extrabold mt-1">
              Welcome back, {profile.full_name?.split(' ')[0] ?? 'User'}!
            </h1>
            <p className="text-white/40 text-sm mt-1" suppressHydrationWarning>
              {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map(s => (
            <Link key={s.label} href={s.href}
              className="bg-white/5 border border-white/10 rounded-2xl p-5 hover:bg-white/8 hover:border-white/20 transition-all group">
              <div className={`w-10 h-10 ${s.bg} rounded-xl flex items-center justify-center mb-3`}>
                <s.icon className={`w-5 h-5 ${s.color}`} />
              </div>
              <p className={`text-2xl font-extrabold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-white/40 mt-1 group-hover:text-white/60 transition-colors">{s.label}</p>
            </Link>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Quick Links */}
          <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
            <div className="p-5 border-b border-white/10">
              <h3 className="font-bold text-white">Quick Actions</h3>
            </div>
            <div className="p-4 space-y-2">
              {quickLinks.map(l => (
                <Link key={l.label} href={l.href}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-white/5 transition-colors group">
                  <div className={`w-8 h-8 ${l.color} rounded-xl flex items-center justify-center flex-shrink-0`}>
                    <l.icon className="w-4 h-4 text-white" />
                  </div>
                  <span className="text-sm font-semibold text-white/70 group-hover:text-white transition-colors">{l.label}</span>
                  <ArrowRightIcon className="w-3.5 h-3.5 text-white/20 group-hover:text-white/50 transition-colors ml-auto" />
                </Link>
              ))}
            </div>
          </div>

          {/* Recent Activity */}
          <div className="lg:col-span-2 bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
            <div className="p-5 border-b border-white/10 flex items-center justify-between">
              <h3 className="font-bold text-white">
                {role === 'admin' ? 'Recent Students' : 'Recent Submissions'}
              </h3>
              <Link href={role === 'admin' ? '/dashboard/students' : '/dashboard/grades'}
                className="text-xs text-white/40 hover:text-white transition-colors flex items-center gap-1">
                View All <ArrowRightIcon className="w-3 h-3" />
              </Link>
            </div>

            {role === 'admin' && recentStudents.length > 0 ? (
              <div className="divide-y divide-white/5">
                {recentStudents.map(s => (
                  <div key={s.id} className="px-5 py-3.5 flex items-center gap-3 hover:bg-white/5 transition-colors">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-600 to-blue-600 flex items-center justify-center text-xs font-black text-white flex-shrink-0">
                      {(s.full_name ?? '?')[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{s.full_name}</p>
                      <p className="text-xs text-white/30">{s.school_name ?? 'No school'} · {new Date(s.created_at).toLocaleDateString()}</p>
                    </div>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full border capitalize
                      ${s.status === 'approved' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' :
                        s.status === 'pending' ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' :
                          'bg-white/10 text-white/30 border-white/10'}`}>
                      {s.status}
                    </span>
                  </div>
                ))}
              </div>
            ) : recentSubmissions.length > 0 ? (
              <div className="divide-y divide-white/5">
                {recentSubmissions.map(s => {
                  const max = s.assignments?.max_points ?? 100;
                  const pct = s.grade != null ? Math.round((s.grade / max) * 100) : null;
                  return (
                    <div key={s.id} className="px-5 py-3.5 flex items-center gap-3 hover:bg-white/5 transition-colors">
                      <div className="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center flex-shrink-0">
                        <ClipboardDocumentListIcon className="w-4 h-4 text-white/30" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white truncate">{s.assignments?.title ?? '—'}</p>
                        {s.portal_users && <p className="text-xs text-white/30">{s.portal_users.full_name}</p>}
                        <p className="text-xs text-white/20">{s.submitted_at ? new Date(s.submitted_at).toLocaleDateString() : ''}</p>
                      </div>
                      {pct != null ? (
                        <span className={`text-sm font-extrabold ${pct >= 70 ? 'text-emerald-400' : pct >= 50 ? 'text-amber-400' : 'text-rose-400'}`}>
                          {pct}%
                        </span>
                      ) : (
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 capitalize">
                          {s.status}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <CheckCircleIcon className="w-12 h-12 text-white/10 mb-3" />
                <p className="text-white/30 text-sm">No recent activity yet</p>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}