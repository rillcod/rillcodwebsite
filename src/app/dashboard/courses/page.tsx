// @refresh reset
'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { fetchCourses, fetchStudentCourses } from '@/services/dashboard.service';
import {
  BookOpenIcon, AcademicCapIcon, UserGroupIcon, ClockIcon, ChartBarIcon,
  PlusIcon, PlayIcon, CheckCircleIcon, StarIcon, MagnifyingGlassIcon,
  EyeIcon, PencilIcon, TrashIcon, BoltIcon, RocketLaunchIcon,
  LockClosedIcon, LockOpenIcon,
} from '@/lib/icons';

const GRADIENTS = [
  'from-orange-600 to-orange-400', 'from-orange-600 to-orange-400 from-orange-600 to-orange-400',
  'from-orange-600 to-orange-400 from-orange-600 to-orange-400', 'from-orange-600 to-orange-400 from-orange-600 to-orange-400',
  'from-orange-600 to-orange-400 from-orange-600 to-orange-400', 'from-rose-600 to-rose-400',
];
const LEVEL_BADGE: Record<string, string> = {
  beginner: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  intermediate: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  advanced: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
};

function CourseCard({ course, i, canEdit, deleting, onDelete, programs, onAssignProgram, onToggleLock, locking }: {
  course: any; i: number; canEdit: boolean;
  deleting: string | null; onDelete: (id: string, title: string) => void;
  programs?: any[]; onAssignProgram?: (courseId: string, programId: string) => Promise<void>;
  onToggleLock?: (courseId: string, locked: boolean) => Promise<void>;
  locking?: string | null;
}) {
  const [assigning, setAssigning] = useState(false);
  const isUncategorized = !course.program_id;

  async function handleAssign(e: React.ChangeEvent<HTMLSelectElement>) {
    const pid = e.target.value;
    if (!pid || !onAssignProgram) return;
    setAssigning(true);
    await onAssignProgram(course.id, pid);
    setAssigning(false);
  }

  return (
    <div className={`bg-card shadow-sm border rounded-none overflow-hidden hover:border-orange-500/30 transition-all flex flex-col group ${isUncategorized && canEdit ? 'border-rose-500/40' : 'border-border'}`}>
      <div className={`h-1.5 bg-gradient-to-r ${GRADIENTS[i % GRADIENTS.length]}`} />
      <div className="p-5 flex-1 flex flex-col">
        <div className="flex items-center justify-between mb-2">
          <span className={`text-[9px] font-black uppercase tracking-widest ${isUncategorized ? 'text-rose-400' : 'text-orange-400'}`}>
            {course.programs?.name ?? 'No Program'}
          </span>
          <div className="flex items-center gap-1.5">
            {course.is_locked && (
              <span className="text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full border bg-amber-500/10 text-amber-400 border-amber-500/20 flex items-center gap-1">
                <LockClosedIcon className="w-2.5 h-2.5" /> Locked
              </span>
            )}
            <span className={`text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full border ${course.is_active ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-muted text-muted-foreground border-border'}`}>
              {course.is_active ? 'Active' : 'Inactive'}
            </span>
          </div>
        </div>
        <h3 className="font-bold text-foreground line-clamp-2 mb-2 group-hover:text-orange-400 transition-colors">{course.title}</h3>
        {course.description && <p className="text-xs text-muted-foreground line-clamp-2 mb-3 flex-1">{course.description}</p>}
        {isUncategorized && canEdit && programs && programs.length > 0 && (
          <div className="mb-3">
            <select
              defaultValue=""
              disabled={assigning}
              onChange={handleAssign}
              className="w-full px-3 py-1.5 bg-rose-500/10 border border-rose-500/30 rounded-none text-xs text-foreground focus:outline-none focus:border-primary disabled:opacity-50"
            >
              <option value="" disabled>⚠ Assign to a program…</option>
              {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        )}
        <div className="flex items-center gap-3 text-xs text-muted-foreground mb-4">
          {course.duration_hours && <span className="flex items-center gap-1"><ClockIcon className="w-3.5 h-3.5" />{course.duration_hours}h</span>}
          <span className="flex items-center gap-1"><UserGroupIcon className="w-3.5 h-3.5" />{course.assignment_submissions?.length ?? 0} submissions</span>
        </div>
        <div className="flex gap-2 mt-auto">
          <Link href={`/dashboard/courses/${course.id}`}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold text-orange-400 bg-orange-500/10 hover:bg-orange-500/20 rounded-none transition-colors">
            <EyeIcon className="w-3.5 h-3.5" /> View
          </Link>
          {canEdit && (
            <>
              <Link href={`/dashboard/courses/${course.id}/edit`}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold text-muted-foreground bg-card shadow-sm hover:bg-muted rounded-none transition-colors">
                <PencilIcon className="w-3.5 h-3.5" /> Edit
              </Link>
              <button
                onClick={() => onToggleLock?.(course.id, !course.is_locked)}
                disabled={locking === course.id}
                title={course.is_locked ? 'Unlock course for students' : 'Lock course from students'}
                className={`p-2 rounded-none transition-colors disabled:opacity-40 ${course.is_locked ? 'text-amber-400 bg-amber-500/10 hover:bg-amber-500/20' : 'text-muted-foreground bg-card hover:bg-amber-500/10 hover:text-amber-400'}`}>
                {course.is_locked
                  ? <LockClosedIcon className="w-3.5 h-3.5" />
                  : <LockOpenIcon className="w-3.5 h-3.5" />
                }
              </button>
              <button
                onClick={() => onDelete(course.id, course.title)}
                disabled={deleting === course.id}
                className="p-2 text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 rounded-none transition-colors disabled:opacity-40">
                <TrashIcon className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CoursesPage() {
  const { profile, loading: authLoading } = useAuth();
  const searchParams = useSearchParams();
  const [courses, setCourses] = useState<any[]>([]);
  const [programs, setPrograms] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [programFilter, setProgramFilter] = useState<string>(searchParams?.get('program') ?? 'all');
  const [deleting, setDeleting] = useState<string | null>(null);
  const [locking, setLocking] = useState<string | null>(null);
  const [bulkFixOpen, setBulkFixOpen] = useState(false);
  const [bulkProgramId, setBulkProgramId] = useState('');
  const [bulkFixing, setBulkFixing] = useState(false);

  const isStaff = profile?.role === 'admin' || profile?.role === 'teacher' || profile?.role === 'school';
  const canEdit = profile?.role === 'admin' || profile?.role === 'teacher';

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`Delete course "${title}"? This cannot be undone.`)) return;
    setDeleting(id);
    const res = await fetch(`/api/courses/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      alert(json.message || json.error || 'Delete failed');
    } else {
      setCourses(prev => prev.filter(c => c.id !== id));
    }
    setDeleting(null);
  };

  const handleToggleLock = async (courseId: string, locked: boolean) => {
    setLocking(courseId);
    const res = await fetch(`/api/courses/${courseId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_locked: locked }),
    });
    if (res.ok) {
      setCourses(prev => prev.map(c => c.id === courseId ? { ...c, is_locked: locked } : c));
    } else {
      const json = await res.json().catch(() => ({}));
      alert(json.message || json.error || 'Failed to update course lock');
    }
    setLocking(null);
  };

  const handleAssignProgram = async (courseId: string, programId: string) => {
    const program = programs.find(p => p.id === programId);
    const res = await fetch(`/api/courses/${courseId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ program_id: programId }),
    });
    if (res.ok) {
      setCourses(prev => prev.map(c =>
        c.id === courseId ? { ...c, program_id: programId, programs: program ?? null } : c
      ));
    } else {
      const json = await res.json().catch(() => ({}));
      alert(json.message || json.error || 'Failed to assign program');
    }
  };

  const handleBulkFix = async () => {
    if (!bulkProgramId) return;
    const uncat = courses.filter(c => !c.program_id);
    if (uncat.length === 0) return;
    setBulkFixing(true);
    const program = programs.find(p => p.id === bulkProgramId);
    await Promise.all(uncat.map(c =>
      fetch(`/api/courses/${c.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ program_id: bulkProgramId }),
      })
    ));
    setCourses(prev => prev.map(c =>
      !c.program_id ? { ...c, program_id: bulkProgramId, programs: program ?? null } : c
    ));
    setBulkFixing(false);
    setBulkFixOpen(false);
    setBulkProgramId('');
  };

  useEffect(() => {
    if (authLoading || !profile) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [data, progRes] = await Promise.all([
          isStaff
            ? fetchCourses(undefined, { schoolId: profile?.school_id || undefined, schoolName: profile?.school_name || undefined })
            : fetchStudentCourses(profile?.id || ''),
          fetch('/api/programs', { cache: 'no-store' }),
        ]);
        if (!cancelled) {
          const progList = progRes.ok ? ((await progRes.json()).data ?? []) : [];
          setPrograms(progList);
          // Hydrate courses: if the Supabase join didn't populate `programs`
          // (e.g. due to RLS on programs table), fill it from the API-fetched list
          const hydrated = (data as any[]).map(c => {
            if (c.program_id && !c.programs) {
              const match = progList.find((p: any) => p.id === c.program_id);
              return match ? { ...c, programs: match } : c;
            }
            return c;
          });
          setCourses(hydrated);
        }
      } catch (e: any) {
        if (!cancelled) setError(e.message ?? 'Failed to load courses');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [profile?.id, isStaff, authLoading, profile?.school_id, profile?.school_name]); // eslint-disable-line

  const filtered = courses.filter(c => {
    const title = isStaff ? (c.title ?? '') : (c.programs?.name ?? '');
    const matchSearch = title.toLowerCase().includes(search.toLowerCase());
    const matchProgram = programFilter === 'all' || (isStaff ? c.program_id === programFilter : c.programs?.id === programFilter);
    return matchSearch && matchProgram;
  });

  // Group staff courses by program for display
  const grouped: { programId: string; programName: string; courses: any[] }[] = [];
  if (isStaff && programFilter === 'all' && !search) {
    const seen = new Set<string>();
    for (const c of filtered) {
      const pid = c.program_id ?? '__none__';
      if (!seen.has(pid)) {
        seen.add(pid);
        grouped.push({ programId: pid, programName: c.programs?.name ?? 'Uncategorised', courses: [] });
      }
      grouped.find(g => g.programId === pid)!.courses.push(c);
    }
  }

  if (authLoading || loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-muted-foreground text-sm">Loading courses…</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <BookOpenIcon className="w-5 h-5 text-orange-400" />
              <span className="text-xs font-bold text-orange-400 uppercase tracking-widest">
                {isStaff ? 'Course Library' : 'My Learning'}
              </span>
            </div>
            <h1 className="text-3xl font-extrabold">{isStaff ? 'Course Management' : 'My Courses'}</h1>
            <p className="text-muted-foreground text-sm mt-1">{isStaff ? 'Manage all active courses' : 'Continue your learning journey'}</p>
          </div>
          {canEdit && (
            <Link href="/dashboard/courses/new"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-orange-600 hover:bg-orange-500 text-foreground font-bold text-sm rounded-none transition-all hover:scale-105 shadow-lg shadow-orange-900/30">
              <PlusIcon className="w-4 h-4" /> Add Course
            </Link>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="bg-rose-500/10 border border-rose-500/20 rounded-none p-4 text-rose-400 text-sm">{error}</div>
        )}

        {/* Uncategorised alert banner */}
        {canEdit && courses.filter(c => !c.program_id).length > 0 && (
          <div className="flex items-center justify-between gap-4 bg-rose-500/10 border border-rose-500/30 rounded-none px-5 py-3">
            <div className="flex items-center gap-3">
              <span className="text-rose-400 text-lg font-black">⚠</span>
              <div>
                <p className="text-sm font-black text-rose-400 uppercase tracking-widest">
                  {courses.filter(c => !c.program_id).length} course{courses.filter(c => !c.program_id).length !== 1 ? 's' : ''} not assigned to any program
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">All courses must be categorised into a program to be properly visible to students.</p>
              </div>
            </div>
            <button
              onClick={() => setBulkFixOpen(true)}
              className="flex-shrink-0 px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-black uppercase tracking-widest rounded-none transition-colors"
            >
              Fix All →
            </button>
          </div>
        )}

        {/* Bulk fix modal */}
        {bulkFixOpen && (
          <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
            <div className="bg-card border border-border rounded-none w-full max-w-md p-6 space-y-4">
              <h2 className="text-base font-black text-foreground uppercase tracking-widest">Assign Program to All Uncategorised Courses</h2>
              <p className="text-sm text-muted-foreground">
                This will assign <span className="font-black text-foreground">{courses.filter(c => !c.program_id).length} courses</span> to the selected program at once. You can move individual courses later from their edit pages.
              </p>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Select Program</label>
                <select
                  value={bulkProgramId}
                  onChange={e => setBulkProgramId(e.target.value)}
                  className="w-full px-4 py-2.5 bg-background border border-border rounded-none text-sm text-foreground focus:outline-none focus:border-primary"
                >
                  <option value="">— Choose a program —</option>
                  {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className="bg-muted/30 border border-border rounded-none p-3 max-h-40 overflow-y-auto space-y-1">
                {courses.filter(c => !c.program_id).map(c => (
                  <p key={c.id} className="text-xs text-muted-foreground truncate">• {c.title}</p>
                ))}
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => { setBulkFixOpen(false); setBulkProgramId(''); }}
                  className="flex-1 py-2.5 bg-card border border-border text-foreground text-xs font-black uppercase tracking-widest rounded-none hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleBulkFix}
                  disabled={!bulkProgramId || bulkFixing}
                  className="flex-1 py-2.5 bg-primary hover:bg-primary/90 disabled:opacity-40 text-white text-xs font-black uppercase tracking-widest rounded-none transition-colors flex items-center justify-center gap-2"
                >
                  {bulkFixing ? (
                    <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Assigning…</>
                  ) : 'Assign to All →'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Stats */}
        {(() => {
          const statItems = isStaff ? [
            { label: 'Total Courses', value: courses.length, icon: BookOpenIcon, color: 'text-orange-400', bg: 'bg-orange-500/10' },
            { label: 'Active', value: courses.filter((c: any) => c.is_active).length, icon: BoltIcon, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
            { label: 'Total Programs', value: new Set(courses.map((c: any) => c.program_id)).size, icon: AcademicCapIcon, color: 'text-blue-400', bg: 'bg-blue-500/10' },
            { label: 'Submissions', value: courses.reduce((s: number, c: any) => s + (c.assignment_submissions?.length ?? 0), 0), icon: UserGroupIcon, color: 'text-amber-400', bg: 'bg-amber-500/10' },
          ] : [
            { label: 'Enrolled', value: courses.length, icon: BookOpenIcon, color: 'text-orange-400', bg: 'bg-orange-500/10' },
            { label: 'In Progress', value: courses.filter((c: any) => c.status === 'active').length, icon: ClockIcon, color: 'text-blue-400', bg: 'bg-blue-500/10' },
            { label: 'Completed', value: courses.filter((c: any) => c.status === 'completed').length, icon: CheckCircleIcon, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
            { label: 'Programs', value: new Set(courses.map((c: any) => c.program_id)).size, icon: ChartBarIcon, color: 'text-amber-400', bg: 'bg-amber-500/10' },
          ];
          return (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {statItems.map((s) => (
                <div key={s.label} className="bg-card shadow-sm border border-border rounded-none p-5">
                  <div className={`w-10 h-10 ${s.bg} rounded-none flex items-center justify-center mb-3`}>
                    <s.icon className={`w-5 h-5 ${s.color}`} />
                  </div>
                  <p className={`text-2xl font-extrabold ${s.color}`}>{s.value}</p>
                  <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
                </div>
              ))}
            </div>
          );
        })()}

        {/* Search + Program Filter */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 max-w-md">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input type="text" placeholder="Search courses…" value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-card shadow-sm border border-border rounded-none text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-orange-500 transition-colors" />
          </div>
          {isStaff && programs.length > 0 && (
            <select
              value={programFilter}
              onChange={e => setProgramFilter(e.target.value)}
              className="px-4 py-3 bg-card shadow-sm border border-border rounded-none text-sm text-foreground focus:outline-none focus:border-orange-500 transition-colors min-w-[200px]"
            >
              <option value="all">All Programs</option>
              {programs.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          )}
        </div>

        {/* Empty */}
        {filtered.length === 0 ? (
          <div className="text-center py-24 bg-card shadow-sm border border-border rounded-none">
            <BookOpenIcon className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
            <p className="text-lg font-semibold text-muted-foreground">No courses found</p>
            <p className="text-sm text-muted-foreground mt-1">
              {isStaff ? 'Add your first course to get started.' : 'You haven\'t enrolled in any courses yet.'}
            </p>
          </div>
        ) : isStaff ? (
          /* Staff view — grouped by program when no filter, flat grid when filtered */
          grouped.length > 0 ? (
            <div className="space-y-10">
              {grouped.map((group, gi) => (
                <div key={group.programId}>
                  <div className="flex items-center gap-3 mb-4">
                    <AcademicCapIcon className={`w-5 h-5 flex-shrink-0 ${group.programId === '__none__' ? 'text-rose-400' : 'text-orange-400'}`} />
                    <h2 className={`text-base font-black uppercase tracking-tight ${group.programId === '__none__' ? 'text-rose-400' : 'text-foreground'}`}>{group.programName}</h2>
                    <span className="text-[10px] font-black text-muted-foreground bg-card border border-border px-2 py-0.5 rounded-full">{group.courses.length} courses</span>
                    {group.programId === '__none__' && canEdit && (
                      <span className="text-[9px] font-black text-rose-400 uppercase tracking-widest bg-rose-500/10 border border-rose-500/20 px-2 py-0.5">
                        ⚠ Needs program assignment
                      </span>
                    )}
                    <div className="flex-1 h-px bg-border" />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {group.courses.map((course: any, i: number) => (
                      <CourseCard key={course.id} course={course} i={gi * 10 + i} canEdit={canEdit} deleting={deleting} onDelete={handleDelete} programs={programs} onAssignProgram={handleAssignProgram} onToggleLock={handleToggleLock} locking={locking} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filtered.map((course: any, i: number) => (
                <CourseCard key={course.id} course={course} i={i} canEdit={canEdit} deleting={deleting} onDelete={handleDelete} programs={programs} onAssignProgram={handleAssignProgram} onToggleLock={handleToggleLock} locking={locking} />
              ))}
            </div>
          )
        ) : (
          /* Student list */
          <div className="space-y-4">
            {filtered.map((enr: any, i: number) => {
              const prog = enr.programs;
              return (
                <div key={enr.id} className="bg-card shadow-sm border border-border rounded-none overflow-hidden hover:border-border transition-all">
                  <div className={`h-1.5 bg-gradient-to-r ${GRADIENTS[i % GRADIENTS.length]}`} />
                  <div className="p-6 flex flex-col sm:flex-row items-start sm:items-center gap-5">
                    <div className={`w-14 h-14 rounded-none bg-gradient-to-br ${GRADIENTS[i % GRADIENTS.length]} flex items-center justify-center flex-shrink-0`}>
                      <BookOpenIcon className="w-7 h-7 text-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <h3 className="font-bold text-foreground">{prog?.name ?? 'Program'}</h3>
                        {prog?.difficulty_level && (
                          <span className={`px-2 py-0.5 rounded-full text-xs font-bold border ${LEVEL_BADGE[prog.difficulty_level] ?? 'bg-muted text-muted-foreground'}`}>
                            {prog.difficulty_level}
                          </span>
                        )}
                        {enr.status === 'completed' && (
                          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                            <CheckCircleIcon className="w-3 h-3" /> Completed
                          </span>
                        )}
                      </div>
                      {prog?.description && <p className="text-sm text-muted-foreground line-clamp-1">{prog.description}</p>}
                      <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                        {prog?.duration_weeks && <span>{prog.duration_weeks} weeks</span>}
                        <span>Enrolled {new Date(enr.enrollment_date).toLocaleDateString()}</span>
                        {enr.grade && <span className="text-amber-400 font-bold">Grade: {enr.grade}</span>}
                      </div>
                      {enr.progress_pct != null && (
                        <div className="flex items-center gap-2 mt-2">
                          <div className="flex-1 h-1.5 bg-card shadow-sm rounded-full overflow-hidden">
                            <div className="h-full bg-orange-500 rounded-full transition-all" style={{ width: `${enr.progress_pct}%` }} />
                          </div>
                          <span className="text-xs text-muted-foreground w-8 text-right">{enr.progress_pct}%</span>
                        </div>
                      )}
                    </div>
                    <div className="flex-shrink-0">
                      <Link
                        href={prog?.id ? `/dashboard/lessons?program=${prog.id}` : '/dashboard/lessons'}
                        className={`flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-none transition-all ${enr.status === 'completed'
                          ? 'bg-muted text-muted-foreground hover:bg-muted'
                          : 'bg-orange-600 text-foreground hover:bg-orange-500'
                        }`}>
                        {enr.status === 'completed' ? <><EyeIcon className="w-4 h-4" /> Review</> : <><PlayIcon className="w-4 h-4" /> Continue</>}
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

      </div>
    </div>
  );
}
