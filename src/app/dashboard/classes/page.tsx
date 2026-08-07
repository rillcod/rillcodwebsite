// @refresh reset
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import {
  BookOpenIcon, PlusIcon, MagnifyingGlassIcon, AcademicCapIcon,
  ClockIcon, UserGroupIcon, ChartBarIcon, DocumentTextIcon,
  EyeIcon, PencilIcon, TrashIcon, BuildingOfficeIcon,
  ArrowPathIcon, ExclamationTriangleIcon, CalendarDaysIcon,
  ClipboardDocumentCheckIcon, ArrowsRightLeftIcon, ChevronDownIcon,
} from '@/lib/icons';
import { MOBILE_PAGE_BOTTOM } from '@/components/mobile/mobile-styles';
import MobileScrollStrip from '@/components/mobile/MobileScrollStrip';

const STATUS_BADGE: Record<string, string> = {
  active:    'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
  scheduled: 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30',
  completed: 'bg-primary/20 text-primary border-primary/30',
};

export default function ClassesPage() {
  const router = useRouter();
  const { profile, loading: authLoading } = useAuth();
  const [classes, setClasses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterTerm, setFilterTerm] = useState('all');
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [showMoreMenu, setShowMoreMenu] = useState(false);

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
    const classTermKey = c.academic_terms
      ? `${c.academic_terms.term_label} ${c.academic_terms.academic_year}`
      : 'No term';
    const matchTerm = filterTerm === 'all' || classTermKey === filterTerm;
    return matchName && matchStatus && matchTerm;
  });

  const totalStudents = classes.reduce((sum, c) => sum + (c.current_students ?? 0), 0);
  const activeCount = classes.filter(c => c.status === 'active').length;
  const programCount = new Set(classes.map(c => c.program_id).filter(Boolean)).size;
  const termOptions = Array.from(new Set(classes.map(c =>
    c.academic_terms ? `${c.academic_terms.term_label} ${c.academic_terms.academic_year}` : 'No term'
  ))).sort();

  if (authLoading || loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center mobile-page-root">
      <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className={`min-w-0 space-y-8 overflow-x-hidden ${MOBILE_PAGE_BOTTOM}`}>

      {/* ── My Classes hub — mobile strip + desktop tabs ── */}
      <MobileScrollStrip
        label="Class hub"
        ariaLabel="Classes section navigation"
        items={[
          { id: 'classes', label: 'Classes', icon: UserGroupIcon, selected: true },
          { id: 'timetable', label: 'Timetable', icon: CalendarDaysIcon, onClick: () => router.push('/dashboard/timetable') },
          { id: 'attendance', label: 'Attendance', icon: ClipboardDocumentCheckIcon, onClick: () => router.push('/dashboard/attendance') },
        ]}
      />
      <div className="hidden md:flex w-full max-w-full flex-wrap items-center gap-1 rounded-xl border border-border bg-card p-1">
        <span className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-black text-white">
          <UserGroupIcon className="h-4 w-4" /> Classes
        </span>
        <Link href="/dashboard/timetable"
          className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold text-muted-foreground transition-all hover:bg-muted/50 hover:text-foreground">
          <CalendarDaysIcon className="h-4 w-4" /> Timetable
        </Link>
        <Link href="/dashboard/attendance"
          className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold text-muted-foreground transition-all hover:bg-muted/50 hover:text-foreground">
          <ClipboardDocumentCheckIcon className="h-4 w-4" /> Attendance
        </Link>
      </div>

      {/* Header */}
      <div className="bg-card/90 backdrop-blur-2xl border border-border/80 rounded-3xl p-6 sm:p-8 shadow-xl relative overflow-hidden flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="absolute top-0 right-0 w-48 h-48 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary to-indigo-600 text-white border border-primary/30 flex items-center justify-center shadow-xl shadow-primary/30 flex-shrink-0">
            <UserGroupIcon className="w-6 h-6 text-white" />
          </div>
          <div className="min-w-0">
            <span className="inline-block px-3 py-1 bg-brand-red-accent text-white text-[9px] font-black uppercase tracking-widest rounded-full shadow-sm mb-1">
              Class Management
            </span>
            <h1 className="text-2xl sm:text-3xl font-black text-foreground uppercase tracking-tight">My Classes</h1>
            <p className="mt-0.5 text-xs sm:text-sm text-muted-foreground font-medium">
              Create and manage classes, track enrolment, and assign lessons and assessments.
            </p>
          </div>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
          <div className="relative">
            <button
              onClick={() => setShowMoreMenu(!showMoreMenu)}
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-bold text-foreground transition-colors hover:border-primary/50"
            >
              More <ChevronDownIcon className="h-4 w-4" />
            </button>
            {showMoreMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowMoreMenu(false)} />
                <div className="absolute right-0 top-full mt-1 z-50 w-52 bg-card border border-border rounded-xl shadow-2xl p-1.5 space-y-0.5">
                  <Link
                    href="/dashboard/classes/transfer-requests"
                    onClick={() => setShowMoreMenu(false)}
                    className="flex items-center gap-2.5 w-full px-3 py-2.5 text-sm font-bold text-foreground rounded-lg hover:bg-muted/60 transition-colors"
                  >
                    <ArrowsRightLeftIcon className="h-4 w-4 text-amber-500" />
                    Transfer Requests
                  </Link>
                  <Link
                    href="/dashboard/classes/transfer"
                    onClick={() => setShowMoreMenu(false)}
                    className="flex items-center gap-2.5 w-full px-3 py-2.5 text-sm font-bold text-foreground rounded-lg hover:bg-muted/60 transition-colors"
                  >
                    <ArrowsRightLeftIcon className="h-4 w-4 text-primary" />
                    Transfer
                  </Link>
                  {profile?.role !== 'school' && (
                    <Link
                      href="/dashboard/reports/builder"
                      onClick={() => setShowMoreMenu(false)}
                      className="flex items-center gap-2.5 w-full px-3 py-2.5 text-sm font-bold text-foreground rounded-lg hover:bg-muted/60 transition-colors"
                    >
                      <ChartBarIcon className="h-4 w-4 text-primary" />
                      Reports
                    </Link>
                  )}
                </div>
              </>
            )}
          </div>
          {profile?.role !== 'school' && (
            <Link
              href="/dashboard/classes/add"
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-primary/30 transition-colors hover:bg-primary"
            >
              <PlusIcon className="h-4 w-4" />
              Add Class
            </Link>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 p-4 bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-sm rounded-xl">
          <ExclamationTriangleIcon className="w-4 h-4 flex-shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => window.location.reload()} className="text-xs underline hover:text-rose-700 dark:hover:text-rose-300 transition-colors">
            Retry
          </button>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Classes',   value: classes.length, icon: AcademicCapIcon, bg: 'bg-primary/10', border: 'border-primary/10 hover:border-primary/20', color: 'text-primary', mobile: true },
          { label: 'Total Students',  value: totalStudents,  icon: UserGroupIcon,   bg: 'bg-primary/10',   border: 'border-primary/10 hover:border-primary/20', color: 'text-primary', mobile: false },
          { label: 'Active Classes',  value: activeCount,    icon: BookOpenIcon,    bg: 'bg-emerald-500/10', border: 'border-emerald-500/10 hover:border-emerald-500/20', color: 'text-emerald-600 dark:text-emerald-400', mobile: true },
          { label: 'Programmes',      value: programCount,   icon: ChartBarIcon,    bg: 'bg-purple-500/10', border: 'border-purple-500/10 hover:border-purple-500/20', color: 'text-purple-600 dark:text-purple-400', mobile: false },
        ].map(s => (
          <div key={s.label} className={`relative overflow-hidden bg-white/[0.01] backdrop-blur-md border ${s.border} rounded-2xl p-5 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl ${!s.mobile ? 'hidden sm:block' : ''}`}>
            <div className={`absolute top-0 right-0 w-20 h-20 ${s.bg} rounded-full blur-3xl opacity-30 -mr-8 -mt-8`} />
            <div className={`w-10 h-10 ${s.bg} rounded-xl flex items-center justify-center mb-4 transition-transform duration-300 hover:scale-110`}>
              <s.icon className={`w-5 h-5 ${s.color}`} />
            </div>
            <p className={`text-2xl font-black ${s.color} tracking-tight`}>{s.value}</p>
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mt-1.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Search & Filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input aria-label="Search classes"
            type="text"
            placeholder="Search classes by name or programme..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-card hover:bg-muted/40 border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 transition-all font-medium"
          />
        </div>
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="px-4 py-2.5 bg-card hover:bg-muted/40 border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-primary/50 cursor-pointer transition-all font-bold"
        >
          <option value="all">All Statuses</option>
          <option value="active">Active</option>
          <option value="scheduled">Scheduled</option>
          <option value="completed">Completed</option>
        </select>
        <select
          value={filterTerm}
          onChange={e => setFilterTerm(e.target.value)}
          className="px-4 py-2.5 bg-card hover:bg-muted/40 border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-primary/50 cursor-pointer transition-all font-bold"
        >
          <option value="all">All Terms</option>
          {termOptions.map(term => (
            <option key={term} value={term}>{term}</option>
          ))}
        </select>
      </div>

      {/* Classes list */}
      {filtered.length === 0 ? (
        <div className="bg-card/50 backdrop-blur-md shadow-sm border border-border rounded-2xl p-16 flex flex-col items-center justify-center text-center">
          <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mb-4">
            <AcademicCapIcon className="w-6 h-6 text-primary" />
          </div>
          <h3 className="text-base font-bold text-foreground mb-1">No classes found</h3>
          <p className="text-sm text-muted-foreground max-w-xs">
            {filterStatus !== 'all' || filterTerm !== 'all' || searchTerm
              ? 'No classes match your search. Try adjusting the filters.'
              : 'No classes yet. Click "Add Class" to create your first one.'}
          </p>
          {profile?.role !== 'school' && !searchTerm && filterStatus === 'all' && filterTerm === 'all' && (
            <Link
              href="/dashboard/classes/add"
              className="mt-5 inline-flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary text-white font-bold text-sm rounded-xl transition-colors"
            >
              <PlusIcon className="w-4 h-4" /> Add Class
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(cls => {
            const isFull = cls.max_students > 0 && (cls.current_students ?? 0) >= cls.max_students;
            const nearFull = !isFull && cls.max_students > 0 && (cls.current_students ?? 0) / cls.max_students >= 0.9;
            return (
              <div key={cls.id} className="relative flex flex-col overflow-hidden rounded-2xl border border-border bg-white/[0.01] shadow-sm backdrop-blur-md transition-all duration-300 hover:-translate-y-1 hover:border-primary/20 hover:shadow-xl hover:shadow-primary/5">

                {/* Card top accent by status */}
                <div className={`h-1 w-full ${
                  cls.status === 'active' 
                    ? isFull 
                      ? 'bg-rose-500' 
                      : 'bg-emerald-500' 
                    : 'bg-primary'
                }`} />

                <div className="flex flex-1 flex-col gap-4 p-5">

                  {/* Title row */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="break-words text-base font-bold text-foreground transition-colors">{cls.name}</h3>
                      {cls.programs?.name && (
                        <p className="mt-0.5 break-words text-xs font-medium text-muted-foreground">{cls.programs.name}</p>
                      )}
                      <p className="mt-1 text-[10px] font-black uppercase tracking-widest text-primary">
                        {cls.academic_terms
                          ? `${cls.academic_terms.term_label} ${cls.academic_terms.academic_year}`
                          : 'No term assigned'}
                      </p>
                    </div>
                    <span className={`flex-shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider capitalize ${
                      STATUS_BADGE[cls.status] ?? 'bg-white/5 text-muted-foreground border-border'
                    }`}>
                      {cls.status}
                    </span>
                  </div>

                  {/* Meta row */}
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="flex items-center gap-1.5 text-muted-foreground font-medium">
                      <ClockIcon className="w-3.5 h-3.5 flex-shrink-0 text-primary/70" />
                      <span className="truncate">{cls.schedule || 'No schedule'}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-muted-foreground font-medium">
                      <UserGroupIcon className={`w-3.5 h-3.5 flex-shrink-0 ${isFull ? 'text-rose-600 dark:text-rose-400' : 'text-primary/70'}`} />
                      <span className={isFull ? 'text-rose-600 dark:text-rose-400 font-bold' : ''}>
                        {cls.current_students ?? 0} / {cls.max_students ?? '∞'} students
                      </span>
                    </div>
                  </div>

                  {/* School & teacher */}
                  <div className="space-y-1.5">
                    {cls.schools?.name && (
                      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                        <BuildingOfficeIcon className="h-3.5 w-3.5 flex-shrink-0 text-primary/70" />
                        <span className="break-words">{cls.schools.name}</span>
                      </div>
                    )}
                    {cls.portal_users?.full_name && profile?.role !== 'school' && (
                      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                        <div className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border border-primary/20 bg-primary/10 text-[9px] font-bold text-primary">
                          {cls.portal_users.full_name.charAt(0).toUpperCase()}
                        </div>
                        <span className="break-words">{cls.portal_users.full_name}</span>
                      </div>
                    )}
                  </div>

                  {/* Enrolment progress bar */}
                  {cls.max_students && (
                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] text-muted-foreground font-bold">
                        <span>Enrolment</span>
                        <span className={isFull ? 'text-rose-600 dark:text-rose-400' : nearFull ? 'text-amber-600 dark:text-amber-400' : 'text-primary'}>
                          {Math.round(((cls.current_students ?? 0) / cls.max_students) * 100)}%
                        </span>
                      </div>
                      <div className="h-1.5 bg-white/5 border border-white/5 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            isFull 
                              ? 'bg-rose-500' 
                              : nearFull 
                                ? 'bg-amber-500' 
                                : 'bg-primary'
                          }`}
                          style={{ width: `${Math.min(100, Math.round(((cls.current_students ?? 0) / cls.max_students) * 100))}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Card footer actions */}
                <div className="flex flex-wrap items-stretch border-t border-white/5 bg-white/[0.01]">
                  <Link
                    href={`/dashboard/classes/${cls.id}`}
                    className="flex min-w-[33%] flex-1 items-center justify-center gap-2 border-r border-white/5 py-3.5 text-xs font-black uppercase tracking-wider text-muted-foreground transition-all hover:bg-primary/5 hover:text-primary"
                  >
                    <EyeIcon className="h-3.5 w-3.5" />
                    View
                  </Link>
                  {profile?.role !== 'school' && (
                    <>
                      <Link
                        href={`/dashboard/classes/${cls.id}/edit`}
                        className="flex min-w-[33%] flex-1 items-center justify-center gap-2 border-r border-white/5 py-3.5 text-xs font-black uppercase tracking-wider text-muted-foreground transition-all hover:bg-white/5 hover:text-foreground"
                      >
                        <PencilIcon className="h-3.5 w-3.5" />
                        Edit
                      </Link>
                      <button
                        onClick={() => setDeleteTarget({ id: cls.id, name: cls.name })}
                        disabled={deleting === cls.id}
                        className="flex min-w-[33%] flex-1 items-center justify-center gap-2 py-3.5 text-xs font-black uppercase tracking-wider text-muted-foreground transition-all hover:bg-rose-500/5 hover:text-rose-600 dark:hover:text-rose-400 disabled:opacity-40"
                      >
                        {deleting === cls.id
                          ? <ArrowPathIcon className="h-3.5 w-3.5 animate-spin" />
                          : <TrashIcon className="h-3.5 w-3.5" />}
                        Delete
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div className="mobile-native-dialog fixed inset-0 z-50 bg-foreground/35 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setDeleteTarget(null)}>
          <div className="bg-card border border-border w-full max-w-sm shadow-2xl max-h-[85dvh] overflow-y-auto overscroll-contain" onClick={e => e.stopPropagation()}>
            <div className="h-1 w-full bg-rose-600" />
            <div className="p-6 space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-rose-500/10 border border-rose-500/20 flex items-center justify-center flex-shrink-0">
                  <ExclamationTriangleIcon className="w-5 h-5 text-rose-600 dark:text-rose-400" />
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
                  className="flex-1 py-2.5 bg-destructive hover:bg-destructive/90 text-destructive-foreground text-xs font-black uppercase tracking-widest transition-all">
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
