'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import { fetchCourses, fetchStudentCourses } from '@/services/dashboard.service';
import {
  BookOpenIcon, AcademicCapIcon, UserGroupIcon, ClockIcon, ChartBarIcon,
  PlusIcon, PlayIcon, CheckCircleIcon, StarIcon, MagnifyingGlassIcon,
  EyeIcon, PencilIcon, TrashIcon, BoltIcon,
} from '@heroicons/react/24/outline';

const GRADIENTS = [
  'from-violet-600 to-violet-400', 'from-blue-600 to-blue-400',
  'from-cyan-600 to-cyan-400', 'from-emerald-600 to-emerald-400',
  'from-amber-600 to-amber-400', 'from-rose-600 to-rose-400',
];
const LEVEL_BADGE: Record<string, string> = {
  beginner: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  intermediate: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  advanced: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
};

export default function CoursesPage() {
  const { profile, loading: authLoading } = useAuth();
  const [courses, setCourses] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);

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

  useEffect(() => {
    if (authLoading || !profile) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = isStaff
          ? await fetchCourses()
          : await fetchStudentCourses(profile!.id);
        if (!cancelled) setCourses(data);
      } catch (e: any) {
        if (!cancelled) setError(e.message ?? 'Failed to load courses');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [profile?.id, isStaff, authLoading]); // eslint-disable-line

  const filtered = courses.filter(c => {
    const title = isStaff ? (c.title ?? '') : (c.programs?.name ?? '');
    return title.toLowerCase().includes(search.toLowerCase());
  });

  if (authLoading || loading) return (
    <div className="min-h-screen bg-[#0f0f1a] flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-white/40 text-sm">Loading courses…</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0f0f1a] text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <BookOpenIcon className="w-5 h-5 text-violet-400" />
              <span className="text-xs font-bold text-violet-400 uppercase tracking-widest">
                {isStaff ? 'Course Library' : 'My Learning'}
              </span>
            </div>
            <h1 className="text-3xl font-extrabold">{isStaff ? 'Course Management' : 'My Courses'}</h1>
            <p className="text-white/40 text-sm mt-1">{isStaff ? 'Manage all active courses' : 'Continue your learning journey'}</p>
          </div>
          {canEdit && (
            <Link href="/dashboard/courses/new"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-500 text-white font-bold text-sm rounded-xl transition-all hover:scale-105 shadow-lg shadow-violet-900/30">
              <PlusIcon className="w-4 h-4" /> Add Course
            </Link>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-4 text-rose-400 text-sm">{error}</div>
        )}

        {/* Stats */}
        {(() => {
          const statItems = isStaff ? [
            { label: 'Total Courses', value: courses.length, icon: BookOpenIcon, color: 'text-violet-400', bg: 'bg-violet-500/10' },
            { label: 'Active', value: courses.filter((c: any) => c.is_active).length, icon: BoltIcon, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
            { label: 'Total Programs', value: new Set(courses.map((c: any) => c.program_id)).size, icon: AcademicCapIcon, color: 'text-blue-400', bg: 'bg-blue-500/10' },
            { label: 'Submissions', value: courses.reduce((s: number, c: any) => s + (c.assignment_submissions?.length ?? 0), 0), icon: UserGroupIcon, color: 'text-amber-400', bg: 'bg-amber-500/10' },
          ] : [
            { label: 'Enrolled', value: courses.length, icon: BookOpenIcon, color: 'text-violet-400', bg: 'bg-violet-500/10' },
            { label: 'In Progress', value: courses.filter((c: any) => c.status === 'active').length, icon: ClockIcon, color: 'text-blue-400', bg: 'bg-blue-500/10' },
            { label: 'Completed', value: courses.filter((c: any) => c.status === 'completed').length, icon: CheckCircleIcon, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
            { label: 'Programs', value: new Set(courses.map((c: any) => c.program_id)).size, icon: ChartBarIcon, color: 'text-amber-400', bg: 'bg-amber-500/10' },
          ];
          return (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {statItems.map((s) => (
                <div key={s.label} className="bg-white/5 border border-white/10 rounded-2xl p-5">
                  <div className={`w-10 h-10 ${s.bg} rounded-xl flex items-center justify-center mb-3`}>
                    <s.icon className={`w-5 h-5 ${s.color}`} />
                  </div>
                  <p className={`text-2xl font-extrabold ${s.color}`}>{s.value}</p>
                  <p className="text-xs text-white/40 mt-1">{s.label}</p>
                </div>
              ))}
            </div>
          );
        })()}

        {/* Search */}
        <div className="relative max-w-md">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
          <input type="text" placeholder="Search courses…" value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/30 focus:outline-none focus:border-violet-500 transition-colors" />
        </div>

        {/* Empty */}
        {filtered.length === 0 ? (
          <div className="text-center py-24 bg-white/5 border border-white/10 rounded-2xl">
            <BookOpenIcon className="w-16 h-16 mx-auto text-white/10 mb-4" />
            <p className="text-lg font-semibold text-white/30">No courses found</p>
            <p className="text-sm text-white/20 mt-1">
              {isStaff ? 'Add your first course to get started.' : 'You haven\'t enrolled in any courses yet.'}
            </p>
          </div>
        ) : isStaff ? (
          /* Staff grid */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filtered.map((course: any, i: number) => (
              <div key={course.id} className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden hover:border-white/20 hover:bg-white/8 transition-all flex flex-col">
                <div className={`h-28 bg-gradient-to-br ${GRADIENTS[i % GRADIENTS.length]} relative overflow-hidden flex items-center justify-center`}>
                  <AcademicCapIcon className="w-14 h-14 text-white/20" />
                  <span className="absolute top-3 right-3 px-2.5 py-1 rounded-full text-xs font-bold border bg-black/20 text-white border-white/20">
                    {course.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <div className="p-5 flex-1 flex flex-col">
                  <p className="text-xs text-white/40 mb-1">{course.programs?.name}</p>
                  <h3 className="font-bold text-white line-clamp-2 mb-2">{course.title}</h3>
                  {course.description && <p className="text-xs text-white/30 line-clamp-2 mb-3 flex-1">{course.description}</p>}
                  <div className="flex items-center gap-3 text-xs text-white/40 mb-4">
                    {course.duration_hours && <span className="flex items-center gap-1"><ClockIcon className="w-3.5 h-3.5" />{course.duration_hours}h</span>}
                    <span className="flex items-center gap-1"><UserGroupIcon className="w-3.5 h-3.5" />{course.assignment_submissions?.length ?? 0} submissions</span>
                  </div>
                  <div className="flex gap-2 mt-auto">
                    <Link href={`/dashboard/courses/${course.id}`}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold text-violet-400 bg-violet-500/10 hover:bg-violet-500/20 rounded-xl transition-colors">
                      <EyeIcon className="w-3.5 h-3.5" /> View
                    </Link>
                    {canEdit && (
                      <>
                        <Link href={`/dashboard/courses/${course.id}/edit`}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold text-white/50 bg-white/5 hover:bg-white/10 rounded-xl transition-colors">
                          <PencilIcon className="w-3.5 h-3.5" /> Edit
                        </Link>
                        <button
                          onClick={() => handleDelete(course.id, course.title)}
                          disabled={deleting === course.id}
                          className="p-2 text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 rounded-xl transition-colors disabled:opacity-40">
                          <TrashIcon className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* Student list */
          <div className="space-y-4">
            {filtered.map((enr: any, i: number) => {
              const prog = enr.programs;
              return (
                <div key={enr.id} className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden hover:border-white/20 transition-all">
                  <div className={`h-1.5 bg-gradient-to-r ${GRADIENTS[i % GRADIENTS.length]}`} />
                  <div className="p-6 flex flex-col sm:flex-row items-start sm:items-center gap-5">
                    <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${GRADIENTS[i % GRADIENTS.length]} flex items-center justify-center flex-shrink-0`}>
                      <BookOpenIcon className="w-7 h-7 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <h3 className="font-bold text-white">{prog?.name ?? 'Program'}</h3>
                        {prog?.difficulty_level && (
                          <span className={`px-2 py-0.5 rounded-full text-xs font-bold border ${LEVEL_BADGE[prog.difficulty_level] ?? 'bg-white/10 text-white/50'}`}>
                            {prog.difficulty_level}
                          </span>
                        )}
                        {enr.status === 'completed' && (
                          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                            <CheckCircleIcon className="w-3 h-3" /> Completed
                          </span>
                        )}
                      </div>
                      {prog?.description && <p className="text-sm text-white/40 line-clamp-1">{prog.description}</p>}
                      <div className="flex items-center gap-3 mt-2 text-xs text-white/30">
                        {prog?.duration_weeks && <span>{prog.duration_weeks} weeks</span>}
                        <span>Enrolled {new Date(enr.enrollment_date).toLocaleDateString()}</span>
                        {enr.grade && <span className="text-amber-400 font-bold">Grade: {enr.grade}</span>}
                      </div>
                    </div>
                    <div className="flex-shrink-0">
                      <Link href={`/dashboard/courses/${prog?.id}`}
                        className={`flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-xl transition-all ${enr.status === 'completed'
                          ? 'bg-white/10 text-white/60 hover:bg-white/20'
                          : 'bg-violet-600 text-white hover:bg-violet-500'
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
