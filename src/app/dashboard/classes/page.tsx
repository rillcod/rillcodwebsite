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
import { SessionPromotionModal } from '@/components/classes/SessionPromotionModal';

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
  const [filterSchool, setFilterSchool] = useState('all');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const schoolParam = params.get('school');
    if (schoolParam) setFilterSchool(schoolParam);
  }, []);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [graduationModalOpen, setGraduationModalOpen] = useState(false);
  const [promotionDue, setPromotionDue] = useState<{
    show_menu: boolean;
    total_due: number;
    schools: Array<{
      school_id: string;
      school_name: string | null;
      young_to_teen_exit_grade: 'Basic 5' | 'Basic 6';
      tracks: Array<{
        track_id: 'basic5_to_6' | 'young_to_teen' | 'jss_to_ss';
        short_label: string;
        due_count: number;
        class_count: number;
      }>;
    }>;
  } | null>(null);

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

  useEffect(() => {
    if (authLoading || !profile) return;
    if (profile.role !== 'admin' && profile.role !== 'school') return;
    let cancelled = false;
    fetch('/api/classes/promotion-due', { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => { if (!cancelled) setPromotionDue(data); })
      .catch(() => { if (!cancelled) setPromotionDue(null); });
    return () => { cancelled = true; };
  }, [profile?.id, profile?.role, authLoading, classes.length]);

  const filtered = classes.filter(c => {
    const q = searchTerm.toLowerCase();
    const matchName = (c.name ?? '').toLowerCase().includes(q)
      || (c.programs?.name ?? '').toLowerCase().includes(q)
      || (c.schools?.name ?? '').toLowerCase().includes(q);
    const matchStatus = filterStatus === 'all' || c.status === filterStatus;
    const classTermKey = c.academic_terms
      ? `${c.academic_terms.term_label} ${c.academic_terms.academic_year}`
      : 'No term';
    const matchTerm = filterTerm === 'all' || classTermKey === filterTerm;
    const matchSchool = filterSchool === 'all' || (c.schools?.name ?? 'Direct / Unassigned') === filterSchool;
    return matchName && matchStatus && matchTerm && matchSchool;
  });

  // Compute student count from the active filtered view so old-term + new-term classes
  // never double-count the same students when a term or school filter is applied.
  const totalStudents = filtered.reduce((sum, c) => sum + (c.current_students ?? 0), 0);
  const activeCount = classes.filter(c => c.status === 'active').length;
  const scheduledCount = classes.filter(c => c.status === 'scheduled').length;
  const completedCount = classes.filter(c => c.status === 'completed').length;
  const programCount = new Set(classes.map(c => c.program_id).filter(Boolean)).size;
  const termOptions = Array.from(new Set(classes.map(c =>
    c.academic_terms ? `${c.academic_terms.term_label} ${c.academic_terms.academic_year}` : 'No term'
  ))).sort();
  const schoolOptions = Array.from(new Set(classes.map(c => c.schools?.name ?? 'Direct / Unassigned'))).sort();

  const showGraduationTool = promotionDue?.show_menu === true;

  const reloadClasses = async () => {
    const res = await fetch('/api/classes', { cache: 'no-store' });
    if (res.ok) {
      const { data } = await res.json();
      setClasses(data ?? []);
    }
    if (profile?.role === 'admin' || profile?.role === 'school') {
      const dueRes = await fetch('/api/classes/promotion-due', { cache: 'no-store' });
      if (dueRes.ok) setPromotionDue(await dueRes.json());
    }
  };

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
          { id: 'assessments', label: 'Assessments', icon: DocumentTextIcon, onClick: () => router.push('/dashboard/assignments') },
          { id: 'grades', label: 'Mark Work', icon: AcademicCapIcon, onClick: () => router.push('/dashboard/grades') },
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
        <Link href="/dashboard/assignments"
          className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold text-muted-foreground transition-all hover:bg-muted/50 hover:text-foreground">
          <DocumentTextIcon className="h-4 w-4" /> Assessments
        </Link>
        <Link href="/dashboard/grades"
          className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold text-primary transition-all hover:bg-primary/10">
          <AcademicCapIcon className="h-4 w-4" /> Mark Work &amp; Gradebook
        </Link>
      </div>

      {/* Header */}
      <div className="bg-card/90 backdrop-blur-2xl border border-border/80 rounded-3xl p-6 sm:p-8 shadow-xl relative flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="absolute inset-0 overflow-hidden rounded-3xl pointer-events-none">
          <div className="absolute top-0 right-0 w-48 h-48 bg-primary/10 rounded-full blur-3xl" />
        </div>
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
                <div className="fixed inset-0 z-[110] bg-black/50 backdrop-blur-[1px] sm:bg-transparent sm:backdrop-blur-none" onClick={() => setShowMoreMenu(false)} />
                <div className="fixed inset-x-3 bottom-3 z-[120] max-h-[75vh] overflow-y-auto rounded-2xl border border-border bg-card p-2 shadow-2xl space-y-1 sm:absolute sm:inset-auto sm:right-0 sm:top-full sm:mt-1.5 sm:w-56 sm:rounded-xl sm:p-1.5 sm:space-y-0.5">
                  <div className="flex items-center justify-between border-b border-border px-3 py-2 sm:hidden">
                    <span className="text-xs font-black uppercase tracking-wider text-muted-foreground">Class Actions</span>
                    <button type="button" onClick={() => setShowMoreMenu(false)} className="rounded-lg px-2 py-1 text-xs font-black text-muted-foreground hover:bg-muted">Close</button>
                  </div>
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
                      href="/dashboard/students/bulk-enroll"
                      onClick={() => setShowMoreMenu(false)}
                      className="flex items-center gap-2.5 w-full px-3 py-2.5 text-sm font-bold text-foreground rounded-lg hover:bg-muted/60 transition-colors"
                    >
                      <UserGroupIcon className="h-4 w-4 text-emerald-500" />
                      Bulk Enrol Students
                    </Link>
                  )}
                  {(profile?.role === 'admin' || profile?.role === 'school') && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowMoreMenu(false);
                        setGraduationModalOpen(true);
                      }}
                      className="flex items-center gap-2.5 w-full px-3 py-2.5 text-sm font-bold text-foreground rounded-lg hover:bg-muted/60 transition-colors"
                    >
                      <AcademicCapIcon className="h-4 w-4 text-muted-foreground" />
                      {showGraduationTool
                        ? `Session promotion (${promotionDue?.total_due ?? 0})`
                        : 'Promotion setup'}
                    </button>
                  )}
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

      <SessionPromotionModal
        open={graduationModalOpen}
        onClose={() => setGraduationModalOpen(false)}
        dueSnapshot={promotionDue}
        onComplete={reloadClasses}
      />

      {/* Search & Filter */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { key: 'all', label: 'All Classes', count: classes.length },
            { key: 'active', label: 'Active', count: activeCount },
            { key: 'scheduled', label: 'Scheduled', count: scheduledCount },
            { key: 'completed', label: 'Completed', count: completedCount },
          ].map(pill => (
            <button
              key={pill.key}
              type="button"
              onClick={() => setFilterStatus(pill.key)}
              aria-pressed={filterStatus === pill.key}
              className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-black transition-all ${
                filterStatus === pill.key
                  ? 'border-primary bg-primary text-white shadow-sm'
                  : 'border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground'
              }`}
            >
              <span>{pill.label}</span>
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-black ${
                filterStatus === pill.key ? 'bg-white/20 text-white' : 'bg-muted text-muted-foreground'
              }`}>
                {pill.count}
              </span>
            </button>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input aria-label="Search classes"
              type="text"
              placeholder="Search classes by name, programme, or school..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-card hover:bg-muted/40 border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 transition-all font-medium"
            />
          </div>
          {schoolOptions.length > 1 && (
            <select
              aria-label="Filter classes by school"
              value={filterSchool}
              onChange={e => setFilterSchool(e.target.value)}
              className="px-4 py-2.5 bg-card hover:bg-muted/40 border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-primary/50 cursor-pointer transition-all font-bold"
            >
              <option value="all">All Schools ({schoolOptions.length})</option>
              {schoolOptions.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          )}
          <select
            aria-label="Filter classes by term"
            value={filterTerm}
            onChange={e => setFilterTerm(e.target.value)}
            className="px-4 py-2.5 bg-card hover:bg-muted/40 border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-primary/50 cursor-pointer transition-all font-bold"
          >
            <option value="all">All Terms</option>
            {termOptions.map(term => (
              <option key={term} value={term}>{term}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={reloadClasses}
            aria-label="Refresh classes"
            title="Refresh classes"
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-card hover:bg-muted/40 border border-border rounded-xl text-sm font-bold text-muted-foreground hover:text-foreground transition-all"
          >
            <ArrowPathIcon className="w-4 h-4" />
            <span className="sm:hidden">Refresh</span>
          </button>
        </div>
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
              <div key={cls.id} className="group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg">

                {/* Card top accent by status */}
                <div className={`h-1.5 w-full ${
                  cls.status === 'active'
                    ? isFull
                      ? 'bg-rose-500'
                      : 'bg-emerald-500'
                    : 'bg-primary'
                }`} />

                <div className="flex flex-1 flex-col gap-3.5 p-5">

                  {/* Title row */}
                  <div className="flex items-start justify-between gap-3">
                    <Link href={`/dashboard/classes/${cls.id}`} className="min-w-0 flex-1 group/title">
                      <h3 className="break-words text-base font-black text-foreground group-hover/title:text-primary transition-colors">{cls.name}</h3>
                      {cls.programs?.name && (
                        <p className="mt-0.5 break-words text-xs font-medium text-muted-foreground">{cls.programs.name}</p>
                      )}
                      <p className="mt-1 text-[10px] font-black uppercase tracking-widest text-primary">
                        {cls.academic_terms
                          ? `${cls.academic_terms.term_label} ${cls.academic_terms.academic_year}`
                          : 'No term assigned'}
                      </p>
                    </Link>
                    <span className={`flex-shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider capitalize ${
                      STATUS_BADGE[cls.status] ?? 'bg-muted text-muted-foreground border-border'
                    }`}>
                      {cls.status}
                    </span>
                  </div>

                  {/* Meta & School info */}
                  <div className="space-y-1.5 rounded-xl border border-border/60 bg-muted/25 px-3 py-2.5 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Link
                        href={`/dashboard/classes/${cls.id}?operation=roster`}
                        title="Open class student roster"
                        className="inline-flex items-center gap-1.5 font-bold text-foreground hover:text-primary transition-colors"
                      >
                        <UserGroupIcon className={`w-3.5 h-3.5 flex-shrink-0 ${isFull ? 'text-rose-600 dark:text-rose-400' : 'text-primary'}`} />
                        <span className={isFull ? 'text-rose-600 dark:text-rose-400' : ''}>
                          {cls.current_students ?? 0}{cls.max_students ? ` / ${cls.max_students}` : ''} students
                        </span>
                      </Link>
                      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground truncate max-w-[55%]">
                        <ClockIcon className="w-3.5 h-3.5 flex-shrink-0 text-primary/70" />
                        <span className="truncate">{cls.schedule || 'Flexible schedule'}</span>
                      </span>
                    </div>
                    {cls.schools?.name && (
                      <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                        <BuildingOfficeIcon className="h-3.5 w-3.5 flex-shrink-0 text-primary/70" />
                        <span className="truncate">{cls.schools.name}</span>
                      </div>
                    )}
                    {cls.portal_users?.full_name && profile?.role !== 'school' && (
                      <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                        <div className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded bg-primary/10 border border-primary/20 text-[9px] font-black text-primary">
                          {cls.portal_users.full_name.charAt(0).toUpperCase()}
                        </div>
                        <span className="truncate">{cls.portal_users.full_name}</span>
                      </div>
                    )}
                    {cls.max_students && (
                      <div className="pt-1">
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              isFull ? 'bg-rose-500' : nearFull ? 'bg-amber-500' : 'bg-primary'
                            }`}
                            style={{ width: `${Math.min(100, Math.round(((cls.current_students ?? 0) / cls.max_students) * 100))}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Primary 2x2 Action Grid — clean, spacious, high-contrast */}
                  <div className="grid grid-cols-2 gap-2 pt-0.5">
                    <Link
                      href={`/dashboard/classes/${cls.id}?operation=roster`}
                      className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2.5 text-xs font-bold text-foreground hover:border-primary/50 hover:bg-primary/5 transition-colors"
                    >
                      <UserGroupIcon className="h-4 w-4 shrink-0 text-primary" />
                      <span className="truncate">Roster &amp; Grades</span>
                    </Link>
                    <Link
                      href={`/dashboard/classes/${cls.id}/cards`}
                      title="ID Cards, Student Login + Password + RC PDF"
                      className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2.5 text-xs font-bold text-foreground hover:border-primary/50 hover:bg-primary/5 transition-colors"
                    >
                      <ClipboardDocumentCheckIcon className="h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-400" />
                      <span className="truncate">ID &amp; Login PDF</span>
                    </Link>
                    <Link
                      href={`/dashboard/classes/${cls.id}?operation=assessment`}
                      className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2.5 text-xs font-bold text-foreground hover:border-primary/50 hover:bg-primary/5 transition-colors"
                    >
                      <AcademicCapIcon className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                      <span className="truncate">CBT &amp; Exams</span>
                    </Link>
                    {profile?.role !== 'school' ? (
                      <Link
                        href={`/dashboard/reports/builder?class_id=${cls.id}${cls.current_course_id ? `&course_id=${cls.current_course_id}` : ''}${cls.school_id ? `&school_id=${cls.school_id}` : ''}`}
                        className="flex items-center gap-2 rounded-xl border border-emerald-500/35 bg-emerald-500/10 px-3 py-2.5 text-xs font-bold text-emerald-800 dark:text-emerald-200 hover:bg-emerald-500/20 transition-colors"
                      >
                        <DocumentTextIcon className="h-4 w-4 shrink-0" />
                        <span className="truncate">Result Builder</span>
                      </Link>
                    ) : (
                      <Link
                        href={`/dashboard/results?class_id=${encodeURIComponent(cls.name)}${cls.school_id ? `&school_id=${cls.school_id}` : ''}`}
                        className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2.5 text-xs font-bold text-foreground hover:border-primary/50 hover:bg-primary/5 transition-colors"
                      >
                        <EyeIcon className="h-4 w-4 shrink-0 text-primary" />
                        <span className="truncate">Report View</span>
                      </Link>
                    )}
                  </div>

                  {/* Secondary quick shortcuts */}
                  <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1 text-[11px] font-semibold">
                    <Link
                      href={`/dashboard/classes/${cls.id}?operation=teaching`}
                      className="rounded-lg border border-border/70 bg-muted/30 px-2.5 py-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    >
                      Teach
                    </Link>
                    {profile?.role !== 'school' && (
                      <>
                        <Link
                          href={`/dashboard/cbt/new?class_id=${cls.id}${cls.current_course_id ? `&course_id=${cls.current_course_id}` : ''}${cls.program_id ? `&program_id=${cls.program_id}` : ''}${cls.school_id ? `&school_id=${cls.school_id}` : ''}`}
                          className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-emerald-800 dark:text-emerald-200 hover:bg-emerald-500/20 transition-colors"
                        >
                          + New CBT
                        </Link>
                        <Link
                          href={`/dashboard/grades?class_id=${cls.id}`}
                          className="rounded-lg border border-border/70 bg-muted/30 px-2.5 py-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                        >
                          Mark Work
                        </Link>
                      </>
                    )}
                    <Link
                      href={`/dashboard/attendance?class_id=${cls.id}`}
                      className="rounded-lg border border-border/70 bg-muted/30 px-2.5 py-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    >
                      Attendance
                    </Link>
                    <Link
                      href={`/dashboard/results?class_id=${encodeURIComponent(cls.name)}${cls.school_id ? `&school_id=${cls.school_id}` : ''}`}
                      className="rounded-lg border border-border/70 bg-muted/30 px-2.5 py-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    >
                      Reports
                    </Link>
                  </div>
                </div>

                {/* Clean Card Footer */}
                <div className="flex items-center gap-2 border-t border-border bg-muted/20 px-4 py-2.5">
                  <Link
                    href={`/dashboard/classes/${cls.id}`}
                    className="inline-flex flex-1 min-h-9 items-center justify-center gap-1.5 rounded-xl bg-primary px-3.5 py-1.5 text-xs font-black text-primary-foreground hover:opacity-90 transition-opacity shadow-sm"
                  >
                    Open Class →
                  </Link>
                  {profile?.role !== 'school' && (
                    <>
                      <Link
                        href={`/dashboard/classes/${cls.id}/edit`}
                        title="Edit class settings"
                        aria-label={`Edit ${cls.name}`}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-background text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                      >
                        <PencilIcon className="h-4 w-4" />
                      </Link>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget({ id: cls.id, name: cls.name })}
                        disabled={deleting === cls.id}
                        title="Delete class"
                        aria-label={`Delete ${cls.name}`}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-background text-muted-foreground hover:border-rose-500/40 hover:bg-rose-500/10 hover:text-rose-600 dark:hover:text-rose-400 transition-colors disabled:opacity-40"
                      >
                        {deleting === cls.id
                          ? <ArrowPathIcon className="h-4 w-4 animate-spin" />
                          : <TrashIcon className="h-4 w-4" />}
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
          <div role="dialog" aria-modal="true" className="bg-card border border-border w-full max-w-sm shadow-2xl max-h-[85dvh] overflow-y-auto overscroll-contain" onClick={e => e.stopPropagation()}>
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
