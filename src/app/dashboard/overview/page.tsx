// @refresh reset
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import {
  ChartBarIcon, UserGroupIcon, AcademicCapIcon, BookOpenIcon,
  ClipboardDocumentListIcon, BuildingOfficeIcon, ArrowTrendingUpIcon,
  ClockIcon, CheckCircleIcon, BellIcon, ArrowRightIcon, TrophyIcon,
  CalendarIcon, ShieldCheckIcon, DocumentTextIcon
} from '@/lib/icons';

export default function OverviewPage() {
  const { profile, loading: authLoading } = useAuth();
  const router = useRouter();
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [recentSubmissions, setRecentSubmissions] = useState<any[]>([]);
  const [recentStudents, setRecentStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Parent child-link suggestions
  const [childSuggestions, setChildSuggestions] = useState<{ id: string; full_name: string; section_class: string | null; school_name: string | null }[]>([]);
  const [childSuggestionsLeadId, setChildSuggestionsLeadId] = useState<string | null>(null);
  const [childSuggestionsChild, setChildSuggestionsChild] = useState('');
  const [confirmingChildId, setConfirmingChildId] = useState<string | null>(null);
  const [childLinked, setChildLinked] = useState(false);

  const role = profile?.role ?? '';

  // Partner schools use School Overview; staff use the main dashboard home.
  useEffect(() => {
    if (authLoading) return;
    if (role === 'school') {
      router.replace('/dashboard/school-overview');
      return;
    }
    if (role === 'admin' || role === 'teacher') {
      router.replace('/dashboard');
    }
  }, [authLoading, role, router]);

  useEffect(() => {
    if (authLoading || !profile || role === 'school') return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      const supabase = createClient();
      try {
        if (role === 'admin') {
          const [schools, students, teachers, partnerships, programs] = await Promise.allSettled([
            supabase.from('schools').select('id', { count: 'exact', head: true }).in('status', ['approved', 'active']).neq('is_deleted', true),
            supabase.from('portal_users').select('id', { count: 'exact', head: true }).eq('role', 'student').eq('is_active', true).neq('is_deleted', true),
            supabase.from('portal_users').select('id', { count: 'exact', head: true }).eq('role', 'teacher').eq('is_active', true).neq('is_deleted', true),
            supabase.from('portal_users').select('id', { count: 'exact', head: true }).eq('role', 'school').eq('is_active', true).neq('is_deleted', true),
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
          const { resolveAssignmentTermId, matchesAssignmentSession } = await import('@/lib/assignments/session');
          const liveTermId = await resolveAssignmentTermId(supabase as any, {});

          // Fetch classes via API (same scoping as classes page: teacher_id OR teacher_schools)
          const [myAsgnsRes, classesRes, portalUsersRes] = await Promise.all([
            supabase.from('assignments').select('id, title, term_id').eq('created_by', profile!.id),
            fetch('/api/classes', { cache: 'no-store' }).then(r => r.json()).catch(() => ({ data: [] })),
            fetch('/api/portal-users?role=student&scoped=true', { cache: 'no-store' }).then(r => r.json()).catch(() => ({ data: [] })),
          ]);

          const myAsgns = ((myAsgnsRes.data ?? []) as any[]).filter((a) =>
            matchesAssignmentSession(a.term_id, liveTermId, true),
          );
          const myClasses: any[] = classesRes.data ?? [];
          const aIds = myAsgns.map((a: any) => a.id);
          const aTitleMap: Record<string, string> = {};
          myAsgns.forEach((a: any) => { aTitleMap[a.id] = a.title; });
          // Build user name map from API result (bypasses RLS)
          const umap: Record<string, string> = {};
          (portalUsersRes.data ?? []).forEach((u: any) => { umap[u.id] = u.full_name; });

          // Total students across all teacher's classes
          const totalStudents = myClasses.reduce((sum: number, c: any) => sum + (c.current_students ?? 0), 0);

          const [subs, pending] = await Promise.allSettled([
            aIds.length > 0
              ? supabase.from('assignment_submissions').select('id', { count: 'exact', head: true }).in('assignment_id', aIds)
              : Promise.resolve({ count: 0 }),
            aIds.length > 0
              ? supabase.from('assignment_submissions').select('id', { count: 'exact', head: true }).in('assignment_id', aIds).eq('status', 'submitted')
              : Promise.resolve({ count: 0 }),
          ]);

          let recSubsData: any[] = [];
          if (aIds.length > 0) {
            const { data: rawSubs } = await supabase.from('assignment_submissions')
              .select('id, status, submitted_at, assignment_id, portal_user_id, user_id')
              .in('assignment_id', aIds)
              .order('submitted_at', { ascending: false }).limit(5);
            recSubsData = (rawSubs ?? []).map((s: any) => ({
              ...s,
              portal_users: { full_name: umap[s.portal_user_id ?? s.user_id] ?? 'Student' },
              assignments: { title: aTitleMap[s.assignment_id] ?? '—' },
            }));
          }

          if (!cancelled) {
            setCounts({
              classes: myClasses.length,
              students: totalStudents,
              submissions: subs.status === 'fulfilled' ? ((subs.value as any).count ?? 0) : 0,
              pending: pending.status === 'fulfilled' ? ((pending.value as any).count ?? 0) : 0,
              assignments: myAsgns.length,
            });
            setRecentSubmissions(recSubsData);
          }
        } else if (role === 'school') {
          const [sStudents, sTeachers] = await Promise.allSettled([
            supabase.from('students').select('id', { count: 'exact', head: true }).eq('school_id', profile!.school_id || ''),
            supabase.from('teacher_schools').select('id', { count: 'exact', head: true }).eq('school_id', profile!.school_id || ''),
          ]);
          // Fetch school students via API (bypasses RLS) to enrich submission records
          const schoolUsersRes = await fetch('/api/portal-users?role=student&scoped=true', { cache: 'no-store' })
            .then(r => r.json()).catch(() => ({ data: [] }));
          const schoolUmap: Record<string, any> = {};
          (schoolUsersRes.data ?? []).forEach((u: any) => { schoolUmap[u.id] = u; });

          const { resolveAssignmentTermId, filterByAssignmentSession } = await import('@/lib/assignments/session');
          const liveTermId = await resolveAssignmentTermId(supabase as any, {});
          const { data: rawSubs } = await supabase.from('assignment_submissions')
            .select('id, status, submitted_at, portal_user_id, user_id, assignments(title, max_points, term_id)')
            .not('grade', 'is', null)
            .order('submitted_at', { ascending: false }).limit(80);

          let schoolSubs: any[] = [];
          if (rawSubs && rawSubs.length > 0) {
            schoolSubs = filterByAssignmentSession(
              rawSubs
                .map((s: any) => ({ ...s, portal_users: schoolUmap[s.portal_user_id ?? s.user_id] ?? null }))
                .filter((s: any) => s.portal_users?.school_id === profile!.school_id),
              liveTermId,
            );
          }

          if (!cancelled) {
            setCounts({
              students: sStudents.status === 'fulfilled' ? (sStudents.value.count ?? 0) : 0,
              teachers: sTeachers.status === 'fulfilled' ? (sTeachers.value.count ?? 0) : 0,
              graded: schoolSubs.length,
            });
            setRecentSubmissions(schoolSubs.slice(0, 5));
          }
        } else if (role === 'parent') {
          // Fetch child suggestions in parallel
          const sugRes = await fetch('/api/parents/child-suggestions', { cache: 'no-store' }).then(r => r.json()).catch(() => ({}));
          if (!cancelled && sugRes.suggestions?.length > 0) {
            setChildSuggestions(sugRes.suggestions);
            setChildSuggestionsLeadId(sugRes.leadId ?? null);
            setChildSuggestionsChild(sugRes.childName ?? '');
          }
        } else {
          // student — live session only (year + term)
          const { resolveAssignmentTermId, filterByAssignmentSession } = await import('@/lib/assignments/session');
          const liveTermId = await resolveAssignmentTermId(supabase as any, {});
          const [mySubsRows, myEnr] = await Promise.allSettled([
            supabase.from('assignment_submissions')
              .select('id, assignments(term_id)')
              .or(`portal_user_id.eq.${profile!.id},user_id.eq.${profile!.id}`),
            supabase.from('enrollments').select('id', { count: 'exact', head: true }).eq('user_id', profile!.id),
          ]);
          const scopedSubs =
            mySubsRows.status === 'fulfilled'
              ? filterByAssignmentSession((mySubsRows.value.data ?? []) as any[], liveTermId)
              : [];
          const graded = await supabase.from('assignment_submissions')
            .select(`id, grade, status, submitted_at, assignments ( title, max_points, term_id )`)
            .or(`portal_user_id.eq.${profile!.id},user_id.eq.${profile!.id}`)
            .eq('status', 'graded')
            .order('submitted_at', { ascending: false }).limit(20);
          const recentGraded = filterByAssignmentSession((graded.data ?? []) as any[], liveTermId).slice(0, 5);
          if (!cancelled) {
            setCounts({
              submissions: scopedSubs.length,
              enrolled: myEnr.status === 'fulfilled' ? (myEnr.value.count ?? 0) : 0,
            });
            setRecentSubmissions(recentGraded);
          }
        }
      } catch { /* ignore */ }
      finally { if (!cancelled) setLoading(false); }
    }
    load();
    return () => { cancelled = true; };
  }, [profile?.id, role, authLoading]); // eslint-disable-line

  if (authLoading || loading) return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div className="animate-pulse space-y-2">
          <div className="h-4 bg-muted rounded w-32" />
          <div className="h-8 bg-muted rounded w-64" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <div key={i} className="bg-card shadow-sm border border-border rounded-xl h-28 animate-pulse" />)}
        </div>
        {[1, 2].map(i => <div key={i} className="bg-card shadow-sm border border-border rounded-xl h-40 animate-pulse" />)}
      </div>
    </div>
  );

  if (!profile) return null;

  async function confirmChildLink(studentPortalId: string) {
    setConfirmingChildId(studentPortalId);
    try {
      const res = await fetch('/api/parents/child-suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_portal_id: studentPortalId, lead_id: childSuggestionsLeadId }),
      });
      if (res.ok) {
        setChildLinked(true);
        setChildSuggestions([]);
      } else {
        const j = await res.json();
        alert(j.error ?? 'Failed to link. Please contact your school.');
      }
    } finally {
      setConfirmingChildId(null);
    }
  }

  const adminStats = [
    { label: 'Approved Schools', value: counts.schools ?? 0, icon: BuildingOfficeIcon, color: 'text-primary', bg: 'bg-primary/10', href: '/dashboard/schools' },
    { label: 'School Accounts', value: counts.partners ?? 0, icon: ShieldCheckIcon, color: 'text-cyan-400', bg: 'bg-cyan-500/10', href: '/dashboard/schools' },
    { label: 'Active Students', value: counts.students ?? 0, icon: UserGroupIcon, color: 'text-primary', bg: 'bg-primary/10', href: '/dashboard/students' },
    { label: 'Active Teachers', value: counts.teachers ?? 0, icon: AcademicCapIcon, color: 'text-emerald-400', bg: 'bg-emerald-500/10', href: '/dashboard/teachers' },
  ];

  const teacherStats = [
    { label: 'My Classes', value: counts.classes ?? 0, icon: BookOpenIcon, color: 'text-primary', bg: 'bg-primary/10', href: '/dashboard/classes' },
    { label: 'My Students', value: counts.students ?? 0, icon: UserGroupIcon, color: 'text-primary', bg: 'bg-primary/10', href: '/dashboard/students' },
    { label: 'Needs Grading', value: counts.pending ?? 0, icon: ClockIcon, color: 'text-amber-400', bg: 'bg-amber-500/10', href: '/dashboard/grades' },
    { label: 'Assignments', value: counts.assignments ?? 0, icon: ClipboardDocumentListIcon, color: 'text-emerald-400', bg: 'bg-emerald-500/10', href: '/dashboard/assignments' },
  ];

  const studentStats = [
    { label: 'Submissions', value: counts.submissions ?? 0, icon: ClipboardDocumentListIcon, color: 'text-primary', bg: 'bg-primary/10', href: '/dashboard/grades' },
    { label: 'Enrolled In', value: counts.enrolled ?? 0, icon: BookOpenIcon, color: 'text-primary', bg: 'bg-primary/10', href: '/dashboard/courses' },
    { label: 'Assignments', value: 0, icon: ClockIcon, color: 'text-amber-400', bg: 'bg-amber-500/10', href: '/dashboard/assignments' },
    { label: 'Progress', value: 0, icon: TrophyIcon, color: 'text-emerald-400', bg: 'bg-emerald-500/10', href: '/dashboard/progress' },
  ];

  const schoolStats = [
    { label: 'My Students', value: counts.students ?? 0, icon: UserGroupIcon, color: 'text-primary', bg: 'bg-primary/10', href: '/dashboard/students' },
    { label: 'Classes', value: counts.classes ?? 0, icon: BookOpenIcon, color: 'text-primary', bg: 'bg-primary/10', href: '/dashboard/classes' },
    { label: 'Graded Results', value: counts.graded ?? 0, icon: CheckCircleIcon, color: 'text-emerald-400', bg: 'bg-emerald-500/10', href: '/dashboard/results' },
    { label: 'School Overview', value: 0, icon: ChartBarIcon, color: 'text-amber-400', bg: 'bg-amber-500/10', href: '/dashboard/school-overview' },
  ];

  const stats = role === 'admin' ? adminStats : role === 'teacher' ? teacherStats : role === 'school' ? schoolStats : studentStats;

  const quickLinks = role === 'admin' ? [
    { label: 'Approvals Queue', href: '/dashboard/approvals', icon: ClipboardDocumentListIcon, color: 'bg-primary' },
    { label: 'School Management', href: '/dashboard/schools', icon: BuildingOfficeIcon, color: 'bg-primary' },
    { label: 'Analytics', href: '/dashboard/analytics', icon: ChartBarIcon, color: 'bg-emerald-600' },
    { label: 'Students', href: '/dashboard/students', icon: UserGroupIcon, color: 'bg-amber-600' },
  ] : role === 'teacher' ? [
    { label: 'Grade Submissions', href: '/dashboard/grades', icon: ClipboardDocumentListIcon, color: 'bg-primary' },
    { label: 'Assignments', href: '/dashboard/assignments', icon: CalendarIcon, color: 'bg-primary' },
    { label: 'Classes', href: '/dashboard/classes', icon: BookOpenIcon, color: 'bg-emerald-600' },
    { label: 'Progress', href: '/dashboard/progress', icon: ChartBarIcon, color: 'bg-amber-600' },
  ] : role === 'school' ? [
    { label: 'School Overview', href: '/dashboard/school-overview', icon: ChartBarIcon, color: 'bg-primary' },
    { label: 'Student Roster', href: '/dashboard/students', icon: UserGroupIcon, color: 'bg-primary' },
    { label: 'Exam Results', href: '/dashboard/results', icon: DocumentTextIcon, color: 'bg-emerald-600' },
    { label: 'WhatsApp Inbox', href: '/dashboard/inbox', icon: BellIcon, color: 'bg-amber-600' },
  ] : [
    { label: 'My Assignments', href: '/dashboard/assignments', icon: ClipboardDocumentListIcon, color: 'bg-primary' },
    { label: 'My Courses', href: '/dashboard/courses', icon: BookOpenIcon, color: 'bg-primary' },
    { label: 'My Grades', href: '/dashboard/grades', icon: TrophyIcon, color: 'bg-emerald-600' },
    { label: 'Progress', href: '/dashboard/progress', icon: ChartBarIcon, color: 'bg-amber-600' },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">

        {/* Header */}
        <div className="bg-gradient-to-r from-primary/20 via-primary/10 to-transparent border border-border rounded-xl p-7 relative overflow-hidden">
          <div className="absolute right-0 top-0 w-64 h-full bg-gradient-to-l from-primary/10 to-transparent rounded-xl pointer-events-none" />
          <div className="relative">
            <span className="text-xs font-bold text-primary uppercase tracking-widest">
              {role} Dashboard
            </span>
            <h1 className="text-3xl font-extrabold mt-1">
              Welcome back, {profile.full_name?.split(' ')[0] ?? 'User'}!
            </h1>
            <p className="text-muted-foreground text-sm mt-1" suppressHydrationWarning>
              {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </div>
        </div>

        {/* ── Parent: Connect Your Child ──────────────────────────────────── */}
        {role === 'parent' && !childLinked && childSuggestions.length > 0 && (
          <div className="bg-amber-500/5 border border-amber-500/30 rounded-2xl overflow-hidden">
            <div className="flex items-center gap-3 px-5 pt-5 pb-4 border-b border-amber-500/20">
              <div className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center text-xl shrink-0">🧒</div>
              <div>
                <p className="text-sm font-black text-foreground">Connect With Your Child</p>
                <p className="text-xs text-muted-foreground">
                  We found possible matches for <strong>{childSuggestionsChild}</strong> in our system.
                  Is one of these your child?
                </p>
              </div>
            </div>
            <div className="p-5 space-y-2.5">
              {childSuggestions.map(s => (
                <div key={s.id} className="flex items-center gap-4 bg-card border border-border/50 rounded-xl px-4 py-3">
                  <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center text-base shrink-0">👤</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-foreground">{s.full_name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {[s.section_class, s.school_name].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <button
                    disabled={!!confirmingChildId}
                    onClick={() => confirmChildLink(s.id)}
                    className="shrink-0 px-3 py-1.5 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 font-black text-[10px] uppercase tracking-widest rounded-xl border border-emerald-500/20 transition-colors disabled:opacity-50"
                  >
                    {confirmingChildId === s.id ? '…' : 'Yes, my child'}
                  </button>
                </div>
              ))}
              <p className="text-[10px] text-muted-foreground pt-1">
                Not seeing your child? Contact your school or teacher — they can link your account manually.
              </p>
            </div>
          </div>
        )}

        {role === 'parent' && childLinked && (
          <div className="flex items-center gap-3 px-5 py-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl">
            <span className="text-xl">✅</span>
            <div>
              <p className="text-sm font-black text-emerald-400">Child linked successfully!</p>
              <p className="text-xs text-muted-foreground">You can now view your child&apos;s progress, results and activity from your dashboard.</p>
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map(s => (
            <Link key={s.label} href={s.href}
              className="bg-card shadow-sm border border-border rounded-xl p-5 hover:bg-white/8 hover:border-border transition-all group">
              <div className={`w-10 h-10 ${s.bg} rounded-xl flex items-center justify-center mb-3`}>
                <s.icon className={`w-5 h-5 ${s.color}`} />
              </div>
              <p className={`text-2xl font-extrabold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-muted-foreground mt-1 group-hover:text-muted-foreground transition-colors">{s.label}</p>
            </Link>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Quick Links */}
          <div className="bg-card shadow-sm border border-border rounded-xl overflow-hidden">
            <div className="p-5 border-b border-border">
              <h3 className="font-bold text-foreground">Quick Actions</h3>
            </div>
            <div className="p-4 space-y-2">
              {quickLinks.map(l => (
                <Link key={l.label} href={l.href}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-card shadow-sm transition-colors group">
                  <div className={`w-8 h-8 ${l.color} rounded-xl flex items-center justify-center flex-shrink-0`}>
                    <l.icon className="w-4 h-4 text-foreground" />
                  </div>
                  <span className="text-sm font-semibold text-muted-foreground group-hover:text-foreground transition-colors">{l.label}</span>
                  <ArrowRightIcon className="w-3.5 h-3.5 text-muted-foreground group-hover:text-muted-foreground transition-colors ml-auto" />
                </Link>
              ))}
            </div>
          </div>

          {/* Recent Activity */}
          <div className="lg:col-span-2 bg-card shadow-sm border border-border rounded-xl overflow-hidden">
            <div className="p-5 border-b border-border flex items-center justify-between">
              <h3 className="font-bold text-foreground">
                {role === 'admin' ? 'Recent Students' : 'Recent Submissions'}
              </h3>
              <Link href={role === 'admin' ? '/dashboard/students' : '/dashboard/grades'}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
                View All <ArrowRightIcon className="w-3 h-3" />
              </Link>
            </div>

            {role === 'admin' && recentStudents.length > 0 ? (
              <div className="divide-y divide-white/5">
                {recentStudents.map(s => (
                  <div key={s.id} className="px-5 py-3.5 flex items-center gap-3 hover:bg-card shadow-sm transition-colors">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary from-primary to-primary flex items-center justify-center text-xs font-black text-foreground flex-shrink-0">
                      {(s.full_name ?? '?')[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{s.full_name}</p>
                      <p className="text-xs text-muted-foreground">{s.school_name ?? 'No school'} · {new Date(s.created_at).toLocaleDateString()}</p>
                    </div>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full border capitalize
                      ${s.status === 'approved' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' :
                        s.status === 'pending' ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' :
                          'bg-muted text-muted-foreground border-border'}`}>
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
                    <div key={s.id} className="px-5 py-3.5 flex items-center gap-3 hover:bg-card shadow-sm transition-colors">
                      <div className="w-8 h-8 rounded-xl bg-card shadow-sm flex items-center justify-center flex-shrink-0">
                        <ClipboardDocumentListIcon className="w-4 h-4 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">{s.assignments?.title ?? '—'}</p>
                        {s.portal_users && <p className="text-xs text-muted-foreground">{s.portal_users.full_name}</p>}
                        <p className="text-xs text-muted-foreground">{s.submitted_at ? new Date(s.submitted_at).toLocaleDateString() : ''}</p>
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
                <CheckCircleIcon className="w-12 h-12 text-muted-foreground mb-3" />
                <p className="text-muted-foreground text-sm">No recent activity yet</p>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}