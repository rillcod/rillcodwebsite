// @refresh reset
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import { fetchStudentAssignments } from '@/services/dashboard.service';
import {
  ClipboardDocumentListIcon, PlusIcon, MagnifyingGlassIcon, ClockIcon,
  CheckCircleIcon, EyeIcon, PencilIcon, TrashIcon, CalendarIcon,
  ArrowUpTrayIcon, ExclamationTriangleIcon, AcademicCapIcon, DocumentTextIcon
} from '@/lib/icons';

const TYPE_BADGE: Record<string, string> = {
  quiz: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  project: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  homework: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  exam: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
  presentation: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
};

const SUB_BADGE: Record<string, string> = {
  graded: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  submitted: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  late: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  missing: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
  pending: 'bg-muted text-muted-foreground border-border',
};

function isOverdue(due?: string | null) {
  return due ? new Date(due) < new Date() : false;
}

// ─── Skeleton loader ─────────────────────────────────────────
function Skeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map(i => (
        <div key={i} className="bg-card shadow-sm border border-border rounded-none p-6 animate-pulse">
          <div className="h-5 bg-muted rounded w-2/3 mb-3" />
          <div className="h-4 bg-card shadow-sm rounded w-1/3 mb-2" />
          <div className="h-3 bg-card shadow-sm rounded w-1/2" />
        </div>
      ))}
    </div>
  );
}

// ─── Main page ───────────────────────────────────────────────
export default function AssignmentsPage() {
  const { profile, loading: authLoading } = useAuth();

  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [deleting, setDeleting] = useState<string | null>(null);

  const role = profile?.role ?? 'student';
  const schoolId = (profile as any)?.school_id ?? undefined;

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`Delete assignment "${title}"? This cannot be undone.`)) return;
    setDeleting(id);
    const res = await fetch(`/api/assignments/${id}`, { method: 'DELETE' });
    if (!res.ok) { const j = await res.json(); alert(j.error || 'Delete failed'); }
    else { setItems(prev => prev.filter((a: any) => a.id !== id)); }
    setDeleting(null);
  };
  const isStaff = role === 'admin' || role === 'teacher' || role === 'school';

  // Only fetch after auth has resolved and we have a profile
  useEffect(() => {
    if (authLoading || !profile) return;

    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        let data: any[];
        if (isStaff) {
          const res = await fetch('/api/assignments', { cache: 'no-store' });
          if (!res.ok) { const j = await res.json(); throw new Error(j.error || 'Failed to load'); }
          const json = await res.json();
          data = json.data ?? [];
        } else {
          data = await fetchStudentAssignments(profile?.id || '');
        }
        if (!cancelled) setItems(data);
      } catch (e: any) {
        if (!cancelled) setError(e.message ?? 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [profile?.id, isStaff, authLoading]); // eslint-disable-line

  /** search + filter */
  const filtered = items.filter((a: any) => {
    const title = isStaff ? (a.title ?? '') : (a.assignments?.title ?? '');
    const ms = title.toLowerCase().includes(search.toLowerCase());
    const status = isStaff ? 'active' : (a.status ?? 'pending');
    const mf = filter === 'all' || status === filter;
    const type = isStaff ? (a.assignment_type ?? '') : (a.assignments?.assignment_type ?? '');
    const mt = typeFilter === 'all' || type === typeFilter;
    return ms && mf && mt;
  });

  // Stats derived from real data
  const totalItems = items.length;
  const pendingCount = isStaff
    ? items.filter((a: any) => (a.assignment_submissions ?? []).some((s: any) => s.status === 'submitted')).length
    : items.filter((a: any) => a.status === 'submitted').length;
  const gradedCount = isStaff
    ? items.filter((a: any) => (a.assignment_submissions ?? []).some((s: any) => s.status === 'graded')).length
    : items.filter((a: any) => a.status === 'graded').length;
  const overdueCount = isStaff
    ? items.filter((a: any) => isOverdue(a.due_date)).length
    : items.filter((a: any) => isOverdue(a.assignments?.due_date) && a.status !== 'graded').length;

  // ── LOADING ──────────────────────────────────────────────────
  if (authLoading || loading) return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        <div>
          <div className="h-4 bg-muted rounded w-48 mb-2 animate-pulse" />
          <div className="h-8 bg-muted rounded w-72 animate-pulse" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <div key={i} className="bg-card shadow-sm border border-border rounded-none p-5 h-24 animate-pulse" />)}
        </div>
        <Skeleton />
      </div>
    </div>
  );

  // ── NO PROFILE ───────────────────────────────────────────────
  if (!profile) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center">
        <ClipboardDocumentListIcon className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
        <p className="text-muted-foreground">Please sign in to view assignments.</p>
        <Link href="/login" className="mt-4 inline-block px-6 py-2 bg-orange-600 text-foreground rounded-none text-sm font-bold">Sign In</Link>
      </div>
    </div>
  );

  // ── RENDER ───────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <ClipboardDocumentListIcon className="w-5 h-5 text-amber-400" />
              <span className="text-xs font-bold text-amber-400 uppercase tracking-widest">
                {isStaff ? 'Assignment Manager' : 'My Work'} · {role}
              </span>
            </div>
            <h1 className="text-3xl font-extrabold">Assignments</h1>
            <p className="text-muted-foreground text-sm mt-1">
              {isStaff ? 'Manage, grade, and track all assignments' : 'View and submit your coursework'}
            </p>
          </div>
          {isStaff && (
            <Link href="/dashboard/assignments/new"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-amber-600 hover:bg-amber-500 text-foreground font-bold text-sm rounded-none transition-all hover:scale-105 shadow-lg shadow-amber-900/30">
              <PlusIcon className="w-4 h-4" /> Create Assignment
            </Link>
          )}
        </div>

        {/* Error banner */}
        {error && (
          <div className="flex items-center gap-3 bg-rose-500/10 border border-rose-500/20 rounded-none p-4">
            <ExclamationTriangleIcon className="w-5 h-5 text-rose-400 flex-shrink-0" />
            <p className="text-rose-400 text-sm">{error}</p>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Total', value: totalItems, icon: DocumentTextIcon, color: 'text-amber-400', bg: 'bg-amber-500/10' },
            { label: isStaff ? 'Pending Review' : 'Submitted', value: pendingCount, icon: ClockIcon, color: 'text-blue-400', bg: 'bg-blue-500/10' },
            { label: 'Graded', value: gradedCount, icon: CheckCircleIcon, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
            { label: 'Overdue', value: overdueCount, icon: ExclamationTriangleIcon, color: overdueCount > 0 ? 'text-rose-400' : 'text-muted-foreground', bg: 'bg-rose-500/10' },
          ].map((s) => (
            <div key={s.label} className="bg-card shadow-sm border border-border rounded-none p-5">
              <div className={`w-10 h-10 ${s.bg} rounded-none flex items-center justify-center mb-3`}>
                <s.icon className={`w-5 h-5 ${s.color}`} />
              </div>
              <p className={`text-2xl font-extrabold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search assignments…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-card shadow-sm border border-border rounded-none text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-amber-500 transition-colors"
            />
          </div>
          {!isStaff && (
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="px-4 py-3 bg-card shadow-sm border border-border rounded-none text-sm text-foreground focus:outline-none focus:border-amber-500 cursor-pointer"
            >
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="submitted">Submitted</option>
              <option value="graded">Graded</option>
              <option value="late">Late</option>
              <option value="missing">Missing</option>
            </select>
          )}
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-4 py-3 bg-card shadow-sm border border-border rounded-none text-sm text-foreground focus:outline-none focus:border-amber-500 cursor-pointer"
          >
            <option value="all">All Types</option>
            <option value="homework">📚 Homework</option>
            <option value="project">🛠 Project</option>
            <option value="quiz">📝 Quiz</option>
            <option value="exam">🎯 Exam</option>
            <option value="presentation">🎤 Presentation</option>
          </select>
        </div>

        {/* Empty state */}
        {!error && filtered.length === 0 && (
          <div className="text-center py-24 bg-card shadow-sm border border-border rounded-none">
            <ClipboardDocumentListIcon className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
            <p className="text-lg font-semibold text-muted-foreground">No assignments found</p>
            <p className="text-sm text-muted-foreground mt-1">
              {isStaff ? 'Create your first assignment to get started.' : 'No assignments have been assigned yet.'}
            </p>
            {isStaff && (
              <Link href="/dashboard/assignments/new"
                className="inline-flex items-center gap-2 mt-4 px-5 py-2.5 bg-amber-600 hover:bg-amber-500 text-foreground font-bold text-sm rounded-none transition-all">
                <PlusIcon className="w-4 h-4" /> Create Assignment
              </Link>
            )}
          </div>
        )}

        {/* ── STAFF VIEW: table ─────────────────────────────── */}
        {isStaff && filtered.length > 0 && (
          <div className="bg-card shadow-sm border border-border rounded-none overflow-hidden">
            <div className="p-5 border-b border-border flex items-center justify-between">
              <h3 className="font-bold text-foreground flex items-center gap-2">
                <AcademicCapIcon className="w-5 h-5 text-amber-400" /> All Assignments
              </h3>
              <span className="text-xs text-muted-foreground">{filtered.length} total</span>
            </div>
            <div className="divide-y divide-white/5">
              {filtered.map((a: any) => {
                const subs = a.assignment_submissions ?? [];
                const submittedCnt = subs.filter((s: any) => s.status === 'submitted').length;
                const gradedCnt = subs.filter((s: any) => s.status === 'graded').length;
                const overdue = isOverdue(a.due_date);
                return (
                  <div key={a.id} className="p-5 hover:bg-card shadow-sm transition-colors">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <h4 className="font-semibold text-foreground">{a.title}</h4>
                          {a.assignment_type && (
                            <span className={`px-2 py-0.5 rounded-full text-xs font-bold border ${TYPE_BADGE[a.assignment_type] ?? 'bg-muted text-muted-foreground'}`}>
                              {a.assignment_type}
                            </span>
                          )}
                          {overdue && (
                            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">
                              <ExclamationTriangleIcon className="w-3 h-3" /> Overdue
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground truncate">
                          {a.courses?.title}
                          {a.courses?.programs?.name ? ` · ${a.courses.programs.name}` : ''}
                        </p>
                        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground flex-wrap">
                          {a.due_date && (
                            <span className="flex items-center gap-1">
                              <CalendarIcon className="w-3.5 h-3.5" />
                              Due {new Date(a.due_date).toLocaleDateString()}
                            </span>
                          )}
                          <span>{a.max_points ?? 100} pts</span>
                          {subs.length > 0 && (
                            <>
                              <span className="text-blue-400">{submittedCnt} submitted</span>
                              <span className="text-emerald-400">{gradedCnt} graded</span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Link href={`/dashboard/assignments/${a.id}`}
                          className="p-2 text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 rounded-none transition-colors">
                          <EyeIcon className="w-4 h-4" />
                        </Link>
                        <Link href={`/dashboard/assignments/${a.id}/edit`}
                          className="p-2 text-muted-foreground bg-card shadow-sm hover:bg-muted rounded-none transition-colors">
                          <PencilIcon className="w-4 h-4" />
                        </Link>
                        <button
                          onClick={() => handleDelete(a.id, a.title)}
                          disabled={deleting === a.id}
                          className="p-2 text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 rounded-none transition-colors disabled:opacity-40">
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── STUDENT VIEW: card list ────────────────────────── */}
        {!isStaff && filtered.length > 0 && (
          <div className="space-y-4">
            {filtered.map((sub: any) => {
              const a = sub.assignments ?? {};
              const overdue = isOverdue(a.due_date) && sub.status !== 'graded' && sub.status !== 'submitted';
              return (
                <div
                  key={sub.id}
                  className={`bg-card shadow-sm rounded-none p-6 hover:bg-white/8 transition-all border ${overdue ? 'border-rose-500/30' : 'border-border'}`}
                >
                  <div className="flex flex-col sm:flex-row items-start gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <h4 className="font-bold text-foreground">{a.title ?? 'Assignment'}</h4>
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${SUB_BADGE[sub.status ?? 'pending'] ?? 'bg-muted text-muted-foreground'}`}>
                          {sub.status ?? 'Pending'}
                        </span>
                        {a.assignment_type && (
                          <span className={`px-2 py-0.5 rounded-full text-xs border ${TYPE_BADGE[a.assignment_type] ?? 'bg-muted text-muted-foreground'}`}>
                            {a.assignment_type}
                          </span>
                        )}
                        {overdue && (
                          <span className="flex items-center gap-1 text-xs text-rose-400 font-bold">
                            <ExclamationTriangleIcon className="w-3.5 h-3.5" /> Overdue
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {a.courses?.title}{a.courses?.programs?.name ? ` · ${a.courses.programs.name}` : ''}
                      </p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground flex-wrap">
                        {a.due_date && (
                          <span className="flex items-center gap-1">
                            <CalendarIcon className="w-3.5 h-3.5" />
                            Due {new Date(a.due_date).toLocaleDateString()}
                          </span>
                        )}
                        {sub.submitted_at && (
                          <span>Submitted {new Date(sub.submitted_at).toLocaleDateString()}</span>
                        )}
                        {sub.grade != null && (
                          <span className="text-amber-400 font-bold">{sub.grade}/{a.max_points ?? 100} pts</span>
                        )}
                      </div>
                      {sub.feedback && (
                        <div className="mt-3 p-3 bg-card shadow-sm rounded-none border border-border">
                          <p className="text-xs text-muted-foreground mb-1">Teacher Feedback</p>
                          <p className="text-sm text-muted-foreground">{sub.feedback}</p>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col gap-2 flex-shrink-0">
                      {sub.status !== 'graded' && (
                        <Link href={`/dashboard/assignments/${sub.assignment_id ?? a.id}`}
                          className="flex items-center gap-1.5 px-3 py-2 text-sm font-bold text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 rounded-none transition-colors">
                          <ArrowUpTrayIcon className="w-4 h-4" /> Submit
                        </Link>
                      )}
                      <Link href={`/dashboard/assignments/${sub.assignment_id ?? a.id}`}
                        className="flex items-center gap-1.5 px-3 py-2 text-sm text-muted-foreground bg-card shadow-sm hover:bg-muted rounded-none transition-colors">
                        <EyeIcon className="w-4 h-4" /> View
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