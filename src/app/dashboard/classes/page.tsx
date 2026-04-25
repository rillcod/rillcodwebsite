// @refresh reset
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import {
  BookOpenIcon, PlusIcon, MagnifyingGlassIcon, AcademicCapIcon,
  ClockIcon, UserGroupIcon, ChartBarIcon, DocumentTextIcon,
  EyeIcon, PencilIcon, TrashIcon, BuildingOfficeIcon,
  ArrowPathIcon, ExclamationTriangleIcon, CalendarDaysIcon,
  ClipboardDocumentCheckIcon,
} from '@/lib/icons';

const STATUS_BADGE: Record<string, string> = {
  active:    'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  scheduled: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  completed: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
};

export default function ClassesPage() {
  const { profile, loading: authLoading } = useAuth();
  const [classes, setClasses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(deleteTarget.id);
    setDeleteTarget(null);
    const res = await fetch(`/api/classes/${deleteTarget.id}`, { method: 'DELETE' });
    if (!res.ok) {
      const j = await res.json();
      setError(j.error || 'Delete failed');
    } else {
      setClasses(prev => prev.filter(c => c.id !== deleteTarget.id));
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
        const res = await fetch('/api/classes', { cache: 'no-store' });
        if (!res.ok) { const j = await res.json(); throw new Error(j.error || 'Failed to load classes'); }
        const { data } = await res.json();
        if (!cancelled) setClasses(data ?? []);
      } catch (e: any) {
        if (!cancelled) setError(e.message ?? 'Failed to load classes');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [profile?.id, authLoading]);

  const filtered = classes.filter(c => {
    const q = searchTerm.toLowerCase();
    const matchName = (c.name ?? '').toLowerCase().includes(q) || (c.programs?.name ?? '').toLowerCase().includes(q);
    const matchStatus = filterStatus === 'all' || c.status === filterStatus;
    return matchName && matchStatus;
  });

  const totalStudents = classes.reduce((sum, c) => sum + (c.current_students ?? 0), 0);
  const activeCount = classes.filter(c => c.status === 'active').length;
  const programCount = new Set(classes.map(c => c.program_id).filter(Boolean)).size;

  if (authLoading || loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-8 pb-20">

      {/* ── My Classes Tab Bar ── */}
      <div className="flex items-center gap-1 bg-card border border-border rounded-xl p-1 w-fit flex-wrap">
        <span className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-black">
          <UserGroupIcon className="w-4 h-4" /> Classes
        </span>
        <Link href="/dashboard/timetable"
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 text-sm font-bold transition-all">
          <CalendarDaysIcon className="w-4 h-4" /> Timetable
        </Link>
        <Link href="/dashboard/attendance"
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 text-sm font-bold transition-all">
          <ClipboardDocumentCheckIcon className="w-4 h-4" /> Attendance
        </Link>
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <AcademicCapIcon className="w-5 h-5 text-primary" />
            <span className="text-xs font-bold text-primary uppercase tracking-widest">Class Management</span>
          </div>
          <h1 className="text-3xl font-extrabold text-foreground">My Classes</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Create and manage classes, track enrolment, and assign lessons and assessments.
          </p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {profile?.role !== 'school' && (
            <Link
              href="/dashboard/reports/builder"
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-card border border-border hover:border-primary/50 text-foreground font-bold text-sm rounded-none transition-colors"
            >
              <ChartBarIcon className="w-4 h-4 text-primary" />
              Reports
            </Link>
          )}
          {profile?.role !== 'school' && (
            <Link
              href="/dashboard/classes/add"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary text-white font-bold text-sm rounded-none transition-colors shadow-lg shadow-orange-900/30"
            >
              <PlusIcon className="w-4 h-4" />
              Add Class
            </Link>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 p-4 bg-rose-500/10 border border-rose-500/30 text-rose-400 text-sm rounded-none">
          <ExclamationTriangleIcon className="w-4 h-4 flex-shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => window.location.reload()} className="text-xs underline hover:text-rose-300 transition-colors">
            Retry
          </button>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Classes',   value: classes.length, icon: AcademicCapIcon, bg: 'bg-primary/10', color: 'text-primary' },
          { label: 'Total Students',  value: totalStudents,  icon: UserGroupIcon,   bg: 'bg-blue-500/10',   color: 'text-blue-400'   },
          { label: 'Active Classes',  value: activeCount,    icon: BookOpenIcon,    bg: 'bg-emerald-500/10',color: 'text-emerald-400' },
          { label: 'Programmes',      value: programCount,   icon: ChartBarIcon,    bg: 'bg-purple-500/10', color: 'text-purple-400'  },
        ].map(s => (
          <div key={s.label} className="bg-card shadow-sm border border-border rounded-none p-5">
            <div className={`w-10 h-10 ${s.bg} rounded-none flex items-center justify-center mb-3`}>
              <s.icon className={`w-5 h-5 ${s.color}`} />
            </div>
            <p className={`text-2xl font-extrabold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Search & Filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by class name or programme..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-card shadow-sm border border-border rounded-none text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors"
          />
        </div>
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="px-4 py-2.5 bg-card shadow-sm border border-border rounded-none text-sm text-foreground focus:outline-none focus:border-primary cursor-pointer transition-colors"
        >
          <option value="all">All Statuses</option>
          <option value="active">Active</option>
          <option value="scheduled">Scheduled</option>
          <option value="completed">Completed</option>
        </select>
      </div>

      {/* Classes list */}
      {filtered.length === 0 ? (
        <div className="bg-card shadow-sm border border-border rounded-none p-16 flex flex-col items-center justify-center text-center">
          <div className="w-12 h-12 bg-primary/10 rounded-none flex items-center justify-center mb-4">
            <AcademicCapIcon className="w-6 h-6 text-primary" />
          </div>
          <h3 className="text-base font-bold text-foreground mb-1">No classes found</h3>
          <p className="text-sm text-muted-foreground max-w-xs">
            {filterStatus !== 'all' || searchTerm
              ? 'No classes match your search. Try adjusting the filters.'
              : 'No classes yet. Click "Add Class" to create your first one.'}
          </p>
          {profile?.role !== 'school' && !searchTerm && filterStatus === 'all' && (
            <Link
              href="/dashboard/classes/add"
              className="mt-5 inline-flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary text-white font-bold text-sm rounded-none transition-colors"
            >
              <PlusIcon className="w-4 h-4" /> Add Class
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(cls => (
            <div key={cls.id} className="bg-card shadow-sm border border-border rounded-none flex flex-col">

              {/* Card top accent by status */}
              <div className={`h-1 w-full ${
                cls.status === 'active' ? 'bg-emerald-500' :
                cls.status === 'scheduled' ? 'bg-amber-500' : 'bg-blue-500'
              }`} />

              <div className="p-5 flex flex-col gap-4 flex-1">

                {/* Title row */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-base text-foreground truncate">{cls.name}</h3>
                    {cls.programs?.name && (
                      <p className="text-xs text-muted-foreground mt-0.5">{cls.programs.name}</p>
                    )}
                  </div>
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border capitalize flex-shrink-0 ${
                    STATUS_BADGE[cls.status] ?? 'bg-white/5 text-muted-foreground border-border'
                  }`}>
                    {cls.status}
                  </span>
                </div>

                {/* Meta row */}
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <ClockIcon className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="truncate">{cls.schedule || 'No schedule'}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <UserGroupIcon className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>{cls.current_students ?? 0} / {cls.max_students ?? '∞'} students</span>
                  </div>
                </div>

                {/* School & teacher */}
                <div className="space-y-1.5">
                  {cls.schools?.name && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <BuildingOfficeIcon className="w-3.5 h-3.5 flex-shrink-0" />
                      <span className="truncate">{cls.schools.name}</span>
                    </div>
                  )}
                  {cls.portal_users?.full_name && profile?.role !== 'school' && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <div className="w-4 h-4 bg-primary flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0">
                        {cls.portal_users.full_name.charAt(0).toUpperCase()}
                      </div>
                      <span className="truncate">{cls.portal_users.full_name}</span>
                    </div>
                  )}
                </div>

                {/* Enrolment progress bar */}
                {cls.max_students && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] text-muted-foreground">
                      <span>Enrolment</span>
                      <span>{Math.round(((cls.current_students ?? 0) / cls.max_students) * 100)}%</span>
                    </div>
                    <div className="h-1.5 bg-border rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all"
                        style={{ width: `${Math.min(100, Math.round(((cls.current_students ?? 0) / cls.max_students) * 100))}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Card footer actions */}
              <div className="border-t border-border flex items-center">
                <Link
                  href={`/dashboard/classes/${cls.id}`}
                  className="flex-1 flex items-center justify-center gap-2 py-3 text-xs font-bold text-muted-foreground hover:text-primary hover:bg-primary/5 transition-colors border-r border-border"
                >
                  <EyeIcon className="w-3.5 h-3.5" />
                  View
                </Link>
                {profile?.role !== 'school' && (
                  <>
                    <Link
                      href={`/dashboard/classes/${cls.id}/edit`}
                      className="flex-1 flex items-center justify-center gap-2 py-3 text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors border-r border-border"
                    >
                      <PencilIcon className="w-3.5 h-3.5" />
                      Edit
                    </Link>
                    <button
                      onClick={() => setDeleteTarget({ id: cls.id, name: cls.name })}
                      disabled={deleting === cls.id}
                      className="flex-1 flex items-center justify-center gap-2 py-3 text-xs font-bold text-muted-foreground hover:text-rose-400 hover:bg-rose-500/5 transition-colors disabled:opacity-40"
                    >
                      {deleting === cls.id
                        ? <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" />
                        : <TrashIcon className="w-3.5 h-3.5" />}
                      Delete
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Quick links — staff only */}
      {profile?.role !== 'school' && (
        <div className="bg-card shadow-sm border border-border rounded-none p-6">
          <h2 className="text-sm font-bold text-foreground mb-4">Quick Links</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: 'Students',    desc: 'Student records',    icon: UserGroupIcon,   color: 'text-primary', bg: 'bg-primary/10', href: '/dashboard/students'    },
              { label: 'Assignments', desc: 'Tasks & grades',     icon: DocumentTextIcon,color: 'text-blue-400',   bg: 'bg-blue-500/10',   href: '/dashboard/assignments' },
              { label: 'CBT Exams',   desc: 'Online tests',       icon: AcademicCapIcon, color: 'text-emerald-400',bg: 'bg-emerald-500/10',href: '/dashboard/cbt'         },
              { label: 'Lessons',     desc: 'Curriculum content', icon: BookOpenIcon,    color: 'text-purple-400', bg: 'bg-purple-500/10', href: '/dashboard/lessons'     },
            ].map(a => (
              <Link
                key={a.label}
                href={a.href}
                className="flex items-center gap-3 p-3 border border-border hover:border-primary/40 hover:bg-primary/5 transition-colors rounded-none group"
              >
                <div className={`w-8 h-8 ${a.bg} flex items-center justify-center flex-shrink-0`}>
                  <a.icon className={`w-4 h-4 ${a.color}`} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-foreground group-hover:text-primary transition-colors">{a.label}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{a.desc}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setDeleteTarget(null)}>
          <div className="bg-card border border-border w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="h-1 w-full bg-rose-600" />
            <div className="p-6 space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-rose-500/10 border border-rose-500/20 flex items-center justify-center flex-shrink-0">
                  <ExclamationTriangleIcon className="w-5 h-5 text-rose-400" />
                </div>
                <div>
                  <p className="text-sm font-black text-foreground uppercase tracking-tight">Delete Class</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Delete <span className="text-foreground font-bold">"{deleteTarget.name}"</span>? All sessions, enrolments, and related data will be permanently removed.
                  </p>
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setDeleteTarget(null)}
                  className="flex-1 py-2.5 text-xs font-black uppercase tracking-widest text-muted-foreground border border-border hover:bg-muted transition-all">
                  Cancel
                </button>
                <button onClick={handleDelete}
                  className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-black uppercase tracking-widest transition-all">
                  Delete Permanently
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
