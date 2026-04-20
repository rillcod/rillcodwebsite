// @refresh reset
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import { fetchStudentAssignments } from '@/services/dashboard.service';
import {
  ClipboardDocumentListIcon, PlusIcon, MagnifyingGlassIcon, ClockIcon,
  CheckCircleIcon, EyeIcon, PencilIcon, TrashIcon, CalendarIcon,
  ArrowUpTrayIcon, ExclamationTriangleIcon, AcademicCapIcon, DocumentTextIcon, CodeBracketIcon,
  RocketLaunchIcon, CommandLineIcon
} from '@/lib/icons';
import ShareToParentModal from '@/components/share/ShareToParentModal';

const TYPE_BADGE: Record<string, string> = {
  quiz: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  project: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  homework: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  exam: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
  presentation: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  coding: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  essay: 'bg-violet-500/20 text-violet-400 border-violet-500/30',
  research: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
  lab: 'bg-teal-500/20 text-teal-400 border-teal-500/30',
  discussion: 'bg-pink-500/20 text-pink-400 border-pink-500/30',
};

// Left accent bar colors per type
const TYPE_ACCENT: Record<string, string> = {
  quiz: 'bg-blue-500',
  project: 'bg-orange-500',
  homework: 'bg-cyan-500',
  exam: 'bg-rose-500',
  presentation: 'bg-amber-500',
  coding: 'bg-emerald-500',
  essay: 'bg-violet-500',
  research: 'bg-indigo-500',
  lab: 'bg-teal-500',
  discussion: 'bg-pink-500',
};

const SUB_BADGE: Record<string, string> = {
  graded: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  submitted: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  late: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  missing: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
  pending: 'bg-muted text-muted-foreground border-border',
};

const SUB_ACCENT: Record<string, string> = {
  graded: 'bg-emerald-500',
  submitted: 'bg-blue-500',
  late: 'bg-amber-500',
  missing: 'bg-rose-500',
  pending: 'bg-muted',
};

function isOverdue(due?: string | null) {
  if (!due) return false;
  // Use UTC comparison to avoid timezone issues
  // Compare ISO strings directly for consistent server-side behavior
  const dueDate = new Date(due);
  const now = new Date();
  // Normalize both to UTC midnight for fair comparison
  const dueDateUTC = Date.UTC(dueDate.getUTCFullYear(), dueDate.getUTCMonth(), dueDate.getUTCDate());
  const nowUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return dueDateUTC < nowUTC;
}

// ─── Skeleton loader ─────────────────────────────────────────
function Skeleton() {
  return (
    <div className="space-y-2">
      {[1, 2, 3].map(i => (
        <div key={i} className="relative bg-card border border-border overflow-hidden animate-pulse">
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-orange-600/30" />
          <div className="pl-7 pr-6 py-5 space-y-3">
            <div className="h-5 bg-muted w-1/2" />
            <div className="h-4 bg-muted w-1/3" />
            <div className="h-3 bg-muted w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

const STATUS_PILLS = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'graded', label: 'Graded' },
  { value: 'late', label: 'Late' },
  { value: 'missing', label: 'Missing' },
];

const STAFF_FILTER_TABS = [
  { value: 'all', label: 'All' },
  { value: 'needs_grading', label: 'Needs Grading' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'draft', label: 'Drafts' },
  { value: 'active', label: 'Active' },
];

// ─── Main page ───────────────────────────────────────────────
export default function AssignmentsPage() {
  const { profile, loading: authLoading } = useAuth();

  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [staffTab, setStaffTab] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [deleting, setDeleting] = useState<string | null>(null);
  const [sharing, setSharing] = useState<any | null>(null);

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
    const type = isStaff ? (a.assignment_type ?? '') : (a.assignments?.assignment_type ?? '');
    const mt = typeFilter === 'all' || type === typeFilter;

    if (isStaff) {
      const subs = a.assignment_submissions ?? [];
      const hasPending = subs.some((s: any) => s.status === 'submitted');
      const overdue = isOverdue(a.due_date);
      let mTab = true;
      if (staffTab === 'needs_grading') mTab = hasPending;
      else if (staffTab === 'overdue') mTab = overdue;
      else if (staffTab === 'draft') mTab = a.is_active === false;
      else if (staffTab === 'active') mTab = a.is_active !== false;
      return ms && mt && mTab;
    }

    const status = a.status ?? 'pending';
    const mf = filter === 'all' || status === filter;
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
    ? items.filter((a: any) => isOverdue(a.due_date) && a.is_active !== false).length
    : items.filter((a: any) => isOverdue(a.assignments?.due_date) && a.status !== 'graded').length;
  const draftCount = isStaff ? items.filter((a: any) => a.is_active === false).length : 0;

  // ── LOADING ──────────────────────────────────────────────────
  if (authLoading || loading) return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Hero skeleton */}
        <div className="relative overflow-hidden bg-card border border-border p-6 sm:p-8 animate-pulse">
          <div className="flex items-start justify-between gap-6">
            <div className="flex items-start gap-5">
              <div className="w-14 h-14 bg-orange-600/30" />
              <div className="space-y-2 pt-1">
                <div className="h-9 bg-muted w-64" />
                <div className="h-3 bg-muted w-40" />
                <div className="h-4 bg-muted w-52 mt-2" />
              </div>
            </div>
            <div className="hidden sm:flex gap-3">
              {[1, 2, 3, 4].map(i => <div key={i} className="w-24 h-16 bg-muted" />)}
            </div>
          </div>
        </div>
        {/* Filters skeleton */}
        <div className="flex gap-3">
          <div className="h-12 bg-card border border-border animate-pulse flex-1" />
          <div className="h-12 w-40 bg-card border border-border animate-pulse" />
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
        <Link href="/login" className="mt-4 inline-block px-6 py-2 bg-orange-600 text-foreground text-sm font-bold">Sign In</Link>
      </div>
    </div>
  );

  // ── RENDER ───────────────────────────────────────────────────
  const buildShareMsg = (a: any) => {
    const course = a.courses?.title || 'STEM / AI / Coding';
    const due = a.due_date
      ? new Date(a.due_date).toLocaleDateString('en-NG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
      : null;
    const type = (a.assignment_type || 'Assignment').charAt(0).toUpperCase() + (a.assignment_type || 'assignment').slice(1);
    let msg = `📚 *${type}: ${a.title}*\n`;
    msg += `📖 Course: ${course}\n`;
    if (due) msg += `📅 Due: *${due}*\n`;
    msg += `🏆 Total marks: ${a.max_points ?? 100}\n`;
    if (a.instructions) {
      const brief = a.instructions.length > 200 ? a.instructions.slice(0, 200).trimEnd() + '…' : a.instructions;
      msg += `\n📝 *Instructions:*\n${brief}\n`;
    }
    msg += `\nDear Parent/Guardian, please ensure your child completes and submits this assignment before the due date.\n`;
    msg += `\n🔗 View: ${typeof window !== 'undefined' ? window.location.origin : 'https://rillcod.com'}/dashboard/assignments/${a.id}`;
    msg += `\n\n_Rillcod Technologies — www.rillcod.com_`;
    return msg;
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <ShareToParentModal
        open={!!sharing}
        onClose={() => setSharing(null)}
        defaultMessage={sharing ? buildShareMsg(sharing) : ''}
        title={sharing?.title}
      />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">

        {/* ── Assignments & Exams Tab Bar ── */}
        <div className="flex items-center gap-1 bg-card border border-border rounded-xl p-1 w-fit flex-wrap">
          <span className="flex items-center gap-2 px-4 py-2 rounded-lg bg-orange-600 text-white text-sm font-black">
            <ClipboardDocumentListIcon className="w-4 h-4" /> Assignments
          </span>
          <Link href="/dashboard/projects"
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 text-sm font-bold transition-all">
            <RocketLaunchIcon className="w-4 h-4" /> Projects
          </Link>
          <Link href="/dashboard/cbt"
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 text-sm font-bold transition-all">
            <CommandLineIcon className="w-4 h-4" /> CBT Exams
          </Link>
        </div>

        {/* ── HERO HEADER ── */}
        <div className="relative overflow-hidden bg-card border border-border p-6 sm:p-8">
          {/* Ambient glow */}
          <div className="absolute -right-32 -top-32 w-96 h-96 bg-orange-500/5 rounded-full blur-[120px] pointer-events-none" />

          <div className="relative flex flex-col sm:flex-row items-start justify-between gap-6">
            {/* Left: icon + title */}
            <div className="flex items-start gap-5">
              <div className="w-14 h-14 bg-orange-600 flex items-center justify-center shadow-2xl shadow-orange-900/40 border border-orange-400/30 flex-shrink-0">
                <ClipboardDocumentListIcon className="w-7 h-7 text-white" />
              </div>
              <div>
                <h1 className="text-3xl sm:text-4xl font-black italic uppercase tracking-tighter text-foreground leading-none">
                  Assignments
                </h1>
                <p className="text-[9px] font-black uppercase tracking-[0.4em] text-orange-400 mt-1">
                  {isStaff ? 'Assignment Manager' : 'My Work'}
                </p>
                <p className="text-sm text-muted-foreground mt-1.5">
                  {isStaff ? 'Manage, grade, and track all assignments' : 'View and submit your coursework'}
                </p>
              </div>
            </div>

            {/* Right: stats + create */}
            <div className="flex flex-col items-end gap-3 flex-shrink-0">
              <div className="flex gap-px border border-border">
                {[
                  { label: 'Total', value: totalItems, color: 'text-orange-400' },
                  { label: isStaff ? 'Pending Review' : 'Submitted', value: pendingCount, color: 'text-blue-400' },
                  { label: 'Graded', value: gradedCount, color: 'text-emerald-400' },
                  {
                    label: 'Overdue',
                    value: overdueCount,
                    color: overdueCount > 0 ? 'text-rose-400' : 'text-muted-foreground',
                    pulse: overdueCount > 0,
                  },
                ].map((stat, idx) => (
                  <div key={stat.label} className={`bg-background px-5 py-3 text-center min-w-[72px] ${idx > 0 ? 'border-l border-border' : ''}`}>
                    <p className="text-[8px] font-black uppercase tracking-[0.2em] text-muted-foreground mb-1">{stat.label}</p>
                    <div className="flex items-center justify-center gap-1.5">
                      {(stat as any).pulse && (
                        <span className="w-1.5 h-1.5 bg-rose-500 rounded-full animate-pulse" />
                      )}
                      <p className={`text-2xl font-black ${stat.color}`}>{stat.value}</p>
                    </div>
                  </div>
                ))}
              </div>
              {isStaff && (
                <Link
                  href="/dashboard/assignments/new"
                  className="inline-flex items-center gap-2 bg-orange-600 hover:bg-orange-500 text-white font-black text-[10px] uppercase tracking-widest px-5 py-2.5 transition-colors"
                >
                  <PlusIcon className="w-4 h-4" /> Create Assignment
                </Link>
              )}
            </div>
          </div>
        </div>

        {/* ── ERROR BANNER ── */}
        {error && (
          <div className="flex items-center gap-3 bg-rose-500/10 border border-rose-500/20 p-4">
            <ExclamationTriangleIcon className="w-5 h-5 text-rose-400 flex-shrink-0" />
            <p className="text-rose-400 text-sm">{error}</p>
          </div>
        )}

        {/* ── NEEDS GRADING ALERT (staff) ── */}
        {isStaff && pendingCount > 0 && (
          <div className="bg-amber-500/5 border border-amber-500/20 p-4 flex items-center gap-4">
            <ClipboardDocumentListIcon className="w-5 h-5 text-amber-400 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-black text-amber-400 uppercase tracking-tight">
                {pendingCount} submission{pendingCount > 1 ? 's' : ''} awaiting your review
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">Open each submission to grade and leave feedback.</p>
            </div>
            <button
              onClick={() => setStaffTab('needs_grading')}
              className="px-4 py-2 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/20 text-amber-400 text-[9px] font-black uppercase tracking-widest transition-all flex-shrink-0"
            >
              Show Pending
            </button>
          </div>
        )}

        {/* ── OVERDUE ALERT STRIP ── */}
        {!isStaff && overdueCount > 0 && (
          <div className="bg-rose-500/5 border border-rose-500/20 p-4 flex items-center gap-4">
            <ExclamationTriangleIcon className="w-5 h-5 text-rose-400 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-black text-rose-400 uppercase tracking-tight">
                {overdueCount} overdue assignment{overdueCount > 1 ? 's' : ''}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">Submit now to avoid missing marks.</p>
            </div>
            <button
              onClick={() => setFilter('missing')}
              className="px-4 py-2 bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/20 text-rose-400 text-[9px] font-black uppercase tracking-widest transition-all"
            >
              Show Overdue
            </button>
          </div>
        )}

        {/* ── FILTERS ── */}
        {/* Staff tab bar */}
        {isStaff && (
          <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-none">
            {STAFF_FILTER_TABS.map(tab => {
              const badge = tab.value === 'needs_grading' ? pendingCount
                : tab.value === 'overdue' ? overdueCount
                : tab.value === 'draft' ? draftCount
                : null;
              return (
                <button
                  key={tab.value}
                  onClick={() => setStaffTab(tab.value)}
                  className={`flex-shrink-0 flex items-center gap-1.5 px-4 py-2 text-[9px] font-black uppercase tracking-[0.2em] border transition-colors ${
                    staffTab === tab.value
                      ? 'bg-orange-500/20 border-orange-500/30 text-orange-400'
                      : 'bg-card border-border text-muted-foreground hover:border-orange-500/20 hover:text-foreground'
                  }`}
                >
                  {tab.label}
                  {badge != null && badge > 0 && (
                    <span className={`px-1.5 py-0.5 text-[8px] font-black rounded-sm ${
                      staffTab === tab.value ? 'bg-orange-500/30 text-orange-300' : 'bg-rose-500/20 text-rose-400'
                    }`}>{badge}</span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3">
          {/* Search */}
          <div className="relative flex-1">
            <MagnifyingGlassIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search assignments…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-card border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-orange-500/50 transition-colors"
            />
          </div>

          {/* Status pills (student only) */}
          {!isStaff && (
            <div className="flex gap-1 w-fit flex-wrap">
              {STATUS_PILLS.map(pill => (
                <button
                  key={pill.value}
                  onClick={() => setFilter(pill.value)}
                  className={`px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.2em] border transition-colors ${
                    filter === pill.value
                      ? 'bg-orange-500/20 border-orange-500/30 text-orange-400'
                      : 'bg-card border-border text-muted-foreground hover:border-orange-500/20 hover:text-foreground'
                  }`}
                >
                  {pill.label}
                </button>
              ))}
            </div>
          )}

          {/* Type filter */}
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-4 py-3 bg-card border border-border text-sm text-foreground focus:outline-none focus:border-orange-500/50 cursor-pointer transition-colors"
          >
            <option value="all">All Types</option>
            <option value="homework">Homework</option>
            <option value="project">Project</option>
            <option value="quiz">Quiz</option>
            <option value="exam">Exam</option>
            <option value="presentation">Presentation</option>
            <option value="coding">Coding</option>
            <option value="essay">Essay</option>
            <option value="research">Research</option>
            <option value="lab">Lab</option>
            <option value="discussion">Discussion</option>
          </select>
        </div>

        {/* ── EMPTY STATE ── */}
        {!error && filtered.length === 0 && (
          <div className="text-center py-24 bg-card border border-border">
            <ClipboardDocumentListIcon className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
            <p className="text-lg font-black italic uppercase tracking-tighter text-muted-foreground">No Assignments Found</p>
            <p className="text-sm text-muted-foreground mt-1">
              {isStaff ? 'Create your first assignment to get started.' : 'No assignments have been assigned yet.'}
            </p>
            {isStaff && (
              <Link
                href="/dashboard/assignments/new"
                className="inline-flex items-center gap-2 mt-6 bg-orange-600 hover:bg-orange-500 text-white font-black text-[10px] uppercase tracking-widest px-5 py-2.5 transition-colors"
              >
                <PlusIcon className="w-4 h-4" /> Create Assignment
              </Link>
            )}
          </div>
        )}

        {/* ── STAFF VIEW: cards ── */}
        {isStaff && filtered.length > 0 && (
          <div className="space-y-2">
            {filtered.map((a: any) => {
              const subs = a.assignment_submissions ?? [];
              const submittedCnt = subs.filter((s: any) => s.status === 'submitted').length;
              const gradedCnt = subs.filter((s: any) => s.status === 'graded').length;
              const totalSubs = subs.length;
              const overdue = isOverdue(a.due_date) && a.is_active !== false;
              const isDraft = a.is_active === false;
              const accentColor = isDraft ? 'bg-muted-foreground/40' : (TYPE_ACCENT[a.assignment_type ?? ''] ?? 'bg-orange-600');

              return (
                <div
                  key={a.id}
                  className={`group relative bg-card border transition-all overflow-hidden ${
                    submittedCnt > 0 ? 'border-amber-500/30 hover:border-amber-500/50' : 'border-border hover:border-orange-500/20'
                  }`}
                >
                  {/* Left accent bar */}
                  <div className={`absolute left-0 top-0 bottom-0 w-1 ${accentColor}`} />

                  {/* Needs grading alert strip */}
                  {submittedCnt > 0 && (
                    <div className="pl-7 pr-6 py-2 bg-amber-500/5 border-b border-amber-500/20 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-pulse" />
                        <span className="text-[9px] font-black uppercase tracking-[0.2em] text-amber-400">
                          {submittedCnt} submission{submittedCnt > 1 ? 's' : ''} awaiting review
                        </span>
                      </div>
                      <Link
                        href={`/dashboard/assignments/${a.id}`}
                        className="flex items-center gap-1.5 px-3 py-1 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 text-amber-400 font-black text-[8px] uppercase tracking-widest transition-colors"
                      >
                        <AcademicCapIcon className="w-3 h-3" /> Grade Now
                      </Link>
                    </div>
                  )}

                  <div className="pl-7 pr-6 py-5">
                    <div className="flex items-start justify-between gap-4">
                      {/* Left content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <h4 className="font-black text-foreground text-base">{a.title}</h4>
                          {isDraft && (
                            <span className="px-2.5 py-0.5 text-[9px] font-black uppercase border bg-muted text-muted-foreground border-border">
                              Draft
                            </span>
                          )}
                          {a.assignment_type && (
                            <span className={`px-2.5 py-0.5 text-[9px] font-black uppercase border ${TYPE_BADGE[a.assignment_type] ?? 'bg-muted text-muted-foreground border-border'}`}>
                              {a.assignment_type}
                            </span>
                          )}
                          {overdue && (
                            <span className="flex items-center gap-1 px-2.5 py-0.5 text-[9px] font-black uppercase bg-rose-500/20 text-rose-400 border border-rose-500/30">
                              <ExclamationTriangleIcon className="w-3 h-3" /> Overdue
                            </span>
                          )}
                        </div>

                        <p className="text-xs text-muted-foreground">
                          {a.courses?.title}{a.courses?.programs?.name ? ` · ${a.courses.programs.name}` : ''}
                        </p>

                        <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2">
                          {a.due_date && (
                            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                              <CalendarIcon className="w-3.5 h-3.5" />
                              Due {new Date(a.due_date).toLocaleDateString()}
                            </span>
                          )}
                          <span className="text-[11px] text-muted-foreground">{a.max_points ?? 100} pts</span>
                          {totalSubs > 0 && (
                            <>
                              <span className="text-[11px] text-blue-400">{submittedCnt} pending</span>
                              <span className="text-[11px] text-emerald-400">{gradedCnt}/{totalSubs} graded</span>
                            </>
                          )}
                        </div>

                        {/* Grading progress bar */}
                        {totalSubs > 0 && (
                          <div className="mt-3 flex items-center gap-2">
                            <div className="flex-1 h-1 bg-muted overflow-hidden">
                              <div
                                className="h-full bg-emerald-500 transition-all"
                                style={{ width: `${Math.round((gradedCnt / totalSubs) * 100)}%` }}
                              />
                            </div>
                            <span className="text-[9px] text-muted-foreground font-bold">
                              {Math.round((gradedCnt / totalSubs) * 100)}% graded
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Right: actions */}
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button
                          onClick={() => setSharing(a)}
                          className="p-2.5 text-[#25D366] bg-[#25D366]/10 hover:bg-[#25D366]/20 transition-colors border border-[#25D366]/20"
                          title="Share to parent via WhatsApp"
                        >
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.890-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                          </svg>
                        </button>
                        <Link
                          href={`/dashboard/assignments/${a.id}`}
                          className="p-2.5 text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 transition-colors"
                          title="View"
                        >
                          <EyeIcon className="w-4 h-4" />
                        </Link>
                        <Link
                          href={`/dashboard/assignments/${a.id}/edit`}
                          className="p-2.5 text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 transition-colors"
                          title="Edit"
                        >
                          <PencilIcon className="w-4 h-4" />
                        </Link>
                        <button
                          onClick={() => handleDelete(a.id, a.title)}
                          disabled={deleting === a.id}
                          className="p-2.5 text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 transition-colors disabled:opacity-40"
                          title="Delete"
                        >
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── STUDENT VIEW: cards ── */}
        {!isStaff && filtered.length > 0 && (
          <div className="space-y-2">
            {filtered.map((sub: any) => {
              const a = sub.assignments ?? {};
              const overdue = isOverdue(a.due_date) && sub.status !== 'graded' && sub.status !== 'submitted';
              const accentColor = SUB_ACCENT[sub.status ?? 'pending'] ?? 'bg-muted';

              return (
                <div
                  key={sub.id}
                  className="group relative bg-card border border-border hover:border-orange-500/20 transition-all overflow-hidden"
                >
                  {/* Left accent bar */}
                  <div className={`absolute left-0 top-0 bottom-0 w-1 ${accentColor}`} />

                  <div className="pl-7 pr-6 py-5">
                    <div className="flex flex-col sm:flex-row items-start gap-4">
                      {/* Left content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <h4 className="font-black text-foreground text-base">{a.title ?? 'Assignment'}</h4>
                          <span className={`px-2.5 py-0.5 text-[9px] font-black uppercase border ${SUB_BADGE[sub.status ?? 'pending'] ?? 'bg-muted text-muted-foreground border-border'}`}>
                            {sub.status ?? 'Pending'}
                          </span>
                          {a.assignment_type && (
                            <span className={`px-2.5 py-0.5 text-[9px] font-black uppercase border ${TYPE_BADGE[a.assignment_type] ?? 'bg-muted text-muted-foreground border-border'}`}>
                              {a.assignment_type}
                            </span>
                          )}
                          {overdue && (
                            <span className="flex items-center gap-1 text-[9px] font-black uppercase text-rose-400">
                              <ExclamationTriangleIcon className="w-3.5 h-3.5" /> Overdue
                            </span>
                          )}
                        </div>

                        <p className="text-xs text-muted-foreground">
                          {a.courses?.title}{a.courses?.programs?.name ? ` · ${a.courses.programs.name}` : ''}
                        </p>

                        <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2">
                          {a.due_date && (
                            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                              <CalendarIcon className="w-3.5 h-3.5" />
                              Due {new Date(a.due_date).toLocaleDateString()}
                            </span>
                          )}
                          {sub.submitted_at && (
                            <span className="text-[11px] text-muted-foreground">
                              Submitted {new Date(sub.submitted_at).toLocaleDateString()}
                            </span>
                          )}
                          {sub.grade != null && (
                            <span className="text-[11px] text-amber-400 font-bold">
                              {sub.grade}/{a.max_points ?? 100} pts
                            </span>
                          )}
                        </div>

                        {sub.feedback && (
                          <div className="mt-3 bg-background border border-border p-3">
                            <p className="text-[9px] font-black uppercase tracking-[0.3em] text-muted-foreground mb-1.5">
                              Teacher Feedback
                            </p>
                            <p className="text-sm text-muted-foreground">{sub.feedback}</p>
                          </div>
                        )}
                      </div>

                      {/* Right: action buttons */}
                      <div className="flex flex-col gap-1.5 flex-shrink-0">
                        {sub.status !== 'graded' && a.assignment_type === 'coding' && (
                          <Link
                            href={`/dashboard/playground?assignmentId=${sub.assignment_id ?? a.id}`}
                            className="flex items-center gap-2 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-emerald-400 font-black text-[9px] uppercase tracking-widest px-4 py-2 transition-colors"
                          >
                            <CodeBracketIcon className="w-3.5 h-3.5" /> Code It
                          </Link>
                        )}
                        {sub.status !== 'graded' && a.assignment_type !== 'coding' && (
                          <Link
                            href={`/dashboard/assignments/${sub.assignment_id ?? a.id}`}
                            className="flex items-center gap-2 bg-orange-600 hover:bg-orange-500 text-white font-black text-[9px] uppercase tracking-widest px-4 py-2 transition-colors"
                          >
                            <ArrowUpTrayIcon className="w-3.5 h-3.5" /> Submit
                          </Link>
                        )}
                        <Link
                          href={`/dashboard/assignments/${sub.assignment_id ?? a.id}`}
                          className="flex items-center gap-2 bg-card hover:bg-muted border border-border text-muted-foreground font-black text-[9px] uppercase tracking-widest px-4 py-2 transition-colors"
                        >
                          <EyeIcon className="w-3.5 h-3.5" /> View
                        </Link>
                      </div>
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
