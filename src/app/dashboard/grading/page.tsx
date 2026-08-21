'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import {
  ClipboardDocumentListIcon,
  CheckCircleIcon,
  StarIcon,
  ChartBarIcon,
  ClipboardDocumentCheckIcon,
  DocumentTextIcon,
  ExclamationTriangleIcon,
  FunnelIcon,
  XMarkIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  AcademicCapIcon,
  BuildingOfficeIcon,
  UserGroupIcon,
  ClockIcon,
  SparklesIcon,
  BookOpenIcon,
} from '@/lib/icons';
import { GradingAssessmentView } from '@/components/grading/GradingAssessmentView';
import { AcademicSessionScopeStrip } from '@/components/reports/ReportSessionContextBanner';
import { gradingEvidenceSession } from '@/lib/reports/session-workflows';
import Link from 'next/link';
import { fetchJsonWithTimeout } from '@/lib/async-timeout';
import { roleHasCapability } from '@/lib/auth/capabilities';
import { buildGradingReviewQueue, type GradingReviewFilter } from '@/lib/grading-review-queue';

// ─── Types ────────────────────────────────────────────────────────────────────

type GradingScope = {
  term_id?: string | null;
  term_label?: string | null;
  class_id?: string | null;
  class_name?: string | null;
};

interface CbtQueueItem {
  id: string;
  exam_id: string;
  status: string | null;
  score: number | null;
  end_time: string | null;
  portal_users?: { full_name: string; email: string };
  cbt_exams?: {
    id: string;
    title: string;
    class_id?: string | null;
    school_id?: string | null;
    school_name?: string | null;
    classes?: { name?: string } | { name?: string }[] | null;
  };
}

interface WrittenQueueItem {
  id: string;
  exam_id: string;
  status: string | null;
  score: number | null;
  total_points: number | null;
  submitted_at: string | null;
  tab_switches: number | null;
  student?: { full_name: string | null; email: string | null } | null;
  exam?: { title?: string; courses?: { title?: string } | null } | null;
}

interface Submission {
  id: string;
  portal_user_id: string;
  assignment_id: string;
  status: string;
  submitted_at: string;
  grade: number | null;
  feedback: string | null;
  submission_text: string | null;
  file_url: string | null;
  ai_suggested_grade: number | null;
  ai_suggested_feedback?: string | null;
  grading_mode: string | null;
  portal_users?: { full_name: string; email: string; section_class?: string | null };
  assignments?: {
    title: string;
    max_points: number;
    grading_mode: string;
    assignment_type?: string | null;
    class_id?: string | null;
    school_id?: string | null;
    school_name?: string | null;
    course_id?: string | null;
    description?: string | null;
    instructions?: string | null;
    metadata?: { rubric?: Array<{ criterion: string; description?: string; maxPoints: number }> } | null;
    classes?: { id?: string; name?: string } | { id?: string; name?: string }[] | null;
    courses?: { id?: string; title?: string } | { id?: string; title?: string }[] | null;
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function classNameFromJoin(classes: unknown): string | null {
  if (!classes) return null;
  const row = Array.isArray(classes) ? classes[0] : classes;
  return (row as { name?: string } | null)?.name ?? null;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function initials(name?: string) {
  if (!name) return '?';
  return name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
}

const MAX_QUEUE_PAGES = 100;

async function fetchAllAssignmentQueue(url: string) {
  const rows: Submission[] = [];
  const seen = new Set<string>();
  let cursor: string | null = null;
  let scope: GradingScope | null = null;

  for (let page = 0; page < MAX_QUEUE_PAGES; page += 1) {
    const pageUrl = new URL(url, window.location.origin);
    if (cursor) pageUrl.searchParams.set('cursor', cursor);
    const result = await fetchJsonWithTimeout(
      `${pageUrl.pathname}${pageUrl.search}`,
      { data: [], error: 'Assignment submissions timed out.' },
      'grading-assignments',
    ) as { data?: Submission[]; error?: string; nextCursor?: string | null; scope?: GradingScope };
    if (result.error) return { data: [] as Submission[], error: result.error, scope };
    rows.push(...(result.data ?? []));
    if (!scope && result.scope) scope = result.scope;
    if (!result.nextCursor) return { data: rows, scope };
    if (seen.has(result.nextCursor)) {
      return { data: [] as Submission[], error: 'Assignment queue pagination repeated a page.', scope };
    }
    seen.add(result.nextCursor);
    cursor = result.nextCursor;
  }

  return { data: [] as Submission[], error: 'Assignment queue is too large to load safely. Apply a class or term filter.', scope };
}

async function fetchAllOffsetQueue<T>(url: string, label: string, timeoutMessage: string) {
  const rows: T[] = [];
  const pageSize = 200;
  let scope: GradingScope | null = null;

  for (let page = 0; page < MAX_QUEUE_PAGES; page += 1) {
    const pageUrl = new URL(url, window.location.origin);
    pageUrl.searchParams.set('limit', String(pageSize));
    pageUrl.searchParams.set('offset', String(page * pageSize));
    const result = await fetchJsonWithTimeout(
      `${pageUrl.pathname}${pageUrl.search}`,
      { data: [], error: timeoutMessage },
      label,
    ) as {
      data?: T[];
      error?: string;
      pagination?: { has_more?: boolean };
      scope?: GradingScope;
    };
    if (result.error) return { data: [] as T[], error: result.error, scope };
    const pageRows = result.data ?? [];
    rows.push(...pageRows);
    if (!scope && result.scope) scope = result.scope;
    if (!result.pagination?.has_more) return { data: rows, scope };
    if (pageRows.length === 0) {
      return { data: [] as T[], error: `${label} stopped before the complete queue was loaded.`, scope };
    }
  }

  return { data: [] as T[], error: `${label} is too large to load safely. Apply a class or term filter.`, scope };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ContextPill({ icon, label, color }: { icon: React.ReactNode; label: string; color: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest ${color}`}>
      {icon}
      {label}
    </span>
  );
}

function courseTitleFromJoin(courses: unknown): string | null {
  if (!courses) return null;
  const row = Array.isArray(courses) ? courses[0] : courses;
  return (row as { title?: string } | null)?.title ?? null;
}

function formatAssignmentKind(kind?: string | null): string {
  if (!kind) return 'Assignment';
  const k = kind.toLowerCase();
  if (k === 'homework') return 'Homework';
  if (k === 'project') return 'Project';
  if (k === 'quiz') return 'Quiz';
  if (k === 'coding') return 'Coding Task';
  if (k === 'exam') return 'Exam';
  if (k === 'presentation') return 'Presentation';
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}

function SubmissionContextBar({
  sub,
  scope,
}: {
  sub: Submission;
  scope: GradingScope | null;
}) {
  const hasAI = sub.ai_suggested_grade != null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {/* Submission Status */}
      <ContextPill
        icon={null}
        label={`Status: ${sub.status.replace(/_/g, ' ')}`}
        color="border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"
      />
      {/* AI Suggestion */}
      {hasAI && (
        <ContextPill
          icon={<SparklesIcon className="w-3 h-3" />}
          label={`AI Suggested: ${sub.ai_suggested_grade}/${sub.assignments?.max_points ?? 100}`}
          color="border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
        />
      )}
    </div>
  );
}

function QueueSidebar({
  submissions,
  activeIdx,
  saved,
  onSelect,
  scope,
}: {
  submissions: Submission[];
  activeIdx: number;
  saved: Set<string>;
  onSelect: (i: number) => void;
  scope: GradingScope | null;
}) {
  return (
    <aside className="hidden xl:flex flex-col gap-1 w-72 shrink-0">
      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-1 mb-1">
        Queue · {submissions.length} pending
      </p>
      <div className="flex flex-col gap-1 max-h-[calc(100vh-220px)] overflow-y-auto pr-1">
        {submissions.map((s, idx) => {
          const cls = classNameFromJoin(s.assignments?.classes);
          const isActive = idx === activeIdx;
          const isDone = saved.has(s.id);
          return (
            <button
              key={s.id}
              onClick={() => onSelect(idx)}
              className={`w-full text-left rounded-xl border px-3.5 py-3 transition-all ${
                isActive
                  ? 'border-primary/50 bg-primary/10 shadow-md shadow-primary/5'
                  : isDone
                    ? 'border-emerald-500/20 bg-emerald-500/5 opacity-50'
                    : 'border-border bg-card hover:border-primary/30 hover:bg-card/80'
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className={`text-[9px] font-black uppercase tracking-widest ${isActive ? 'text-primary' : 'text-muted-foreground'}`}>
                  #{idx + 1}
                </span>
                {isDone && <span className="text-[9px] font-black text-emerald-600 dark:text-emerald-400">✓ Graded</span>}
              </div>
              <p className={`text-xs font-bold truncate ${isActive ? 'text-foreground' : 'text-muted-foreground'}`}>
                {s.portal_users?.full_name ?? 'Student'}
              </p>
              <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                {s.assignments?.title ?? 'Assignment'}
              </p>
              {cls && (
                <p className="text-[9px] text-primary/70 truncate mt-0.5">{cls}</p>
              )}
            </button>
          );
        })}
      </div>
    </aside>
  );
}

function EmptyQueue({ scoped }: { scoped: boolean }) {
  return (
    <div className="text-center py-20 bg-card border border-dashed border-border rounded-2xl flex flex-col items-center gap-3">
      <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center">
        <CheckCircleIcon className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
      </div>
      <div>
        <p className="font-black text-foreground text-lg">All caught up!</p>
        <p className="text-muted-foreground text-sm mt-1 max-w-xs mx-auto">
          {scoped
            ? 'No submissions pending in this class or term.'
            : 'No assignments are waiting to be graded right now.'}
        </p>
      </div>
      <Link
        href="/dashboard/grades"
        className="inline-flex items-center gap-2 text-xs font-bold text-primary hover:underline mt-2"
      >
        View Gradebook <ArrowRightIcon className="w-3.5 h-3.5" />
      </Link>
    </div>
  );
}

function QueueUnavailable({ label, onRetry }: { label: string; onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-5 py-16 text-center">
      <ExclamationTriangleIcon className="h-10 w-10 text-rose-600 dark:text-rose-400" />
      <div>
        <p className="font-black text-foreground">{label} is temporarily unavailable</p>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">No empty or all-clear state is shown until the complete queue loads.</p>
      </div>
      <button type="button" onClick={onRetry} className="min-h-11 rounded-xl border border-rose-500/30 bg-card px-4 py-2 text-xs font-black text-rose-700 dark:text-rose-300">
        Try again
      </button>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function GradingQueuePage() {
  const { profile } = useAuth();
  const searchParams = useSearchParams();
  const classId = searchParams.get('class_id');
  const termId = searchParams.get('term_id');

  const [tab, setTab] = useState<'assignments' | 'written' | 'cbt'>('assignments');
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [cbtSessions, setCbtSessions] = useState<CbtQueueItem[]>([]);
  const [writtenAttempts, setWrittenAttempts] = useState<WrittenQueueItem[]>([]);
  const [scope, setScope] = useState<GradingScope | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeIdx, setActiveIdx] = useState(0);
  const [grade, setGrade] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [sourceErrors, setSourceErrors] = useState<Record<'assignments' | 'written' | 'cbt', string | null>>({
    assignments: null,
    written: null,
    cbt: null,
  });
  const [assignmentView, setAssignmentView] = useState<GradingReviewFilter>('priority');

  const mayGrade = roleHasCapability(profile?.role, 'grade');

  const queryString = useMemo(() => {
    const p = new URLSearchParams({ status: 'actionable' });
    if (classId) p.set('class_id', classId);
    if (termId) p.set('term_id', termId);
    return p.toString();
  }, [classId, termId]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    const cbtP = new URLSearchParams();
    if (classId) cbtP.set('class_id', classId);
    if (termId) cbtP.set('term_id', termId);

    const [aJson, cJson, wJson] = await Promise.all([
      fetchAllAssignmentQueue(`/api/grading/submissions?${queryString}`),
      fetchAllOffsetQueue<CbtQueueItem>(
        `/api/grading/cbt-sessions${cbtP.toString() ? `?${cbtP}` : ''}`,
        'CBT response queue',
        'CBT sessions timed out.',
      ),
      fetchAllOffsetQueue<WrittenQueueItem>(
        '/api/grading/written-attempts',
        'Written exam queue',
        'Written exam reviews timed out.',
      ),
    ]);

    const nextSourceErrors = {
      assignments: aJson.error ?? null,
      cbt: cJson.error ?? null,
      written: wJson.error ?? null,
    };
    setSourceErrors(nextSourceErrors);
    const msgs = Object.values(nextSourceErrors).filter(Boolean);
    if (msgs.length) setError(msgs.join(' · '));

    const subs = (aJson.data ?? []) as Submission[];
    setSubmissions(subs);
    setCbtSessions((cJson.data ?? []) as CbtQueueItem[]);
    setWrittenAttempts((wJson.data ?? []) as WrittenQueueItem[]);
    setScope(aJson.scope ?? cJson.scope ?? null);
    setActiveIdx(0);

    // Preserve any existing teacher draft. AI suggestions remain visibly separate
    // until the teacher explicitly chooses Use AI draft or Accept AI.
    const g: Record<string, string> = {};
    const f: Record<string, string> = {};
    for (const s of subs) {
      if (s.grade != null) g[s.id] = String(s.grade);
      if (s.feedback) f[s.id] = s.feedback;
    }
    setGrade(g);
    setFeedback(f);
    setLoading(false);
  }, [classId, queryString, termId]);

  useEffect(() => { if (mayGrade) void loadAll(); }, [mayGrade, loadAll]);

  // ── Grading actions ──────────────────────────────────────────────────────

  async function doGrade(id: string, action: 'accept_ai' | 'override', andNext = false) {
    setSaving(id);
    setError(null);
    const body: Record<string, unknown> = { action };
    if (action === 'override') {
      const g = Number(grade[id]);
      if (!grade[id] || Number.isNaN(g)) { setSaving(null); return; }
      body.grade = g;
      body.feedback = feedback[id] || null;
    }
    try {
      const res = await fetch(`/api/grading/submissions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'Grading failed. Please try again.');
      }
      setSaved(prev => new Set([...prev, id]));
      setTimeout(() => {
        setSubmissions(prev => {
          const next = prev.filter(s => s.id !== id);
          const nextVisible = buildGradingReviewQueue(next, assignmentView);
          setActiveIdx(index => Math.min(index, Math.max(0, nextVisible.length - 1)));
          return next;
        });
        setSaved(prev => { const n = new Set(prev); n.delete(id); return n; });
      }, andNext ? 500 : 700);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Grading failed. Please try again.');
    } finally {
      setSaving(null);
    }
  }

  // ── Derived state ────────────────────────────────────────────────────────

  const evidenceSession = useMemo(() => gradingEvidenceSession(scope), [scope]);

  if (!mayGrade) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center mobile-page-root">
        <p className="text-muted-foreground text-sm">Staff access required.</p>
      </div>
    );
  }

  const scoped = Boolean(scope?.class_id || scope?.term_label);
  const reviewSubmissions = buildGradingReviewQueue(submissions, assignmentView);
  const aiReadyCount = submissions.filter((item) => item.ai_suggested_grade != null).length;
  const manualCount = submissions.length - aiReadyCount;
  const sub = reviewSubmissions[activeIdx] ?? null;

  return (
    <div className="min-h-screen bg-background text-foreground mobile-page-root">
      <div className="max-w-7xl mx-auto px-4 py-8 space-y-5">

        {/* ── Page header ─────────────────────────────────────────────────── */}
        <div className="bg-card/90 backdrop-blur-2xl border border-border/80 rounded-3xl p-6 sm:p-8 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-48 h-48 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="relative z-10 flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 border border-amber-500/30 text-white shadow-xl shadow-amber-500/25 flex items-center justify-center shrink-0">
              <ClipboardDocumentCheckIcon className="w-6 h-6 text-white" />
            </div>
            <div>
              <span className="inline-block px-3 py-1 bg-brand-red-accent text-white text-[9px] font-black uppercase tracking-widest rounded-full shadow-sm mb-1">
                Teacher Workspace
              </span>
              <h1 className="text-2xl sm:text-3xl font-black text-foreground uppercase tracking-tight">Grading Queue</h1>
              <p className="text-xs sm:text-sm text-muted-foreground font-medium mt-0.5 max-w-2xl">
                All submissions awaiting evaluation. Each card shows exactly where the work comes from —
                school, class, term — so you always know the context before marking.
              </p>
            </div>
          </div>
        </div>

        <AcademicSessionScopeStrip
          purpose="Grading & evaluation evidence"
          workingSession={evidenceSession}
          hint="Assignments, CBT evaluations, and written exams shown here attach to this evidence session. Batch-sync and Auto-fill pull from the same term when building report cards."
        />

        {/* ── Tab bar ─────────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-1 bg-card border border-border rounded-xl p-1">
          {/* Assignments */}
          <button
            onClick={() => setTab('assignments')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-black transition-all ${
              tab === 'assignments' ? 'bg-amber-600 text-white shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
          >
            <ClipboardDocumentCheckIcon className="w-4 h-4" />
            Assignment Queue
            {submissions.length > 0 && (
              <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-black ${tab === 'assignments' ? 'bg-white/25' : 'bg-amber-500/20 text-amber-600 dark:text-amber-400'}`}>
                {submissions.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setTab('written')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-black transition-all ${
              tab === 'written' ? 'bg-blue-600 text-white shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
          >
            <DocumentTextIcon className="w-4 h-4" />
            Written Exams
            {writtenAttempts.length > 0 && (
              <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-black ${tab === 'written' ? 'bg-white/25' : 'bg-blue-500/20 text-blue-600 dark:text-blue-400'}`}>
                {writtenAttempts.length}
              </span>
            )}
          </button>

          {/* CBT */}
          <button
            onClick={() => setTab('cbt')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-black transition-all ${
              tab === 'cbt' ? 'bg-violet-600 text-white shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
          >
            <AcademicCapIcon className="w-4 h-4" />
            CBT Evaluations
            {cbtSessions.length > 0 && (
              <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-black ${tab === 'cbt' ? 'bg-white/25' : 'bg-violet-500/20 text-violet-600 dark:text-violet-400'}`}>
                {cbtSessions.length}
              </span>
            )}
          </button>

          <div className="h-5 w-px bg-border mx-1" />

          {/* Gradebook link */}
          <Link href="/dashboard/grades" className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 text-xs font-bold transition-all">
            <ChartBarIcon className="w-4 h-4" /> Gradebook
          </Link>
          <Link href="/dashboard/grades/waec" className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 text-xs font-bold transition-all">
            <DocumentTextIcon className="w-4 h-4" /> Grading Guide
          </Link>
        </div>

        {/* ── Scope banner ────────────────────────────────────────────────── */}
        {scoped && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/25 bg-primary/5 px-4 py-3">
            <FunnelIcon className="h-4 w-4 text-primary shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[9px] font-black uppercase tracking-widest text-primary">Filtered to</p>
              <p className="text-sm font-bold text-foreground">
                {[scope?.class_name, scope?.term_label].filter(Boolean).join(' · ') || 'Custom filter active'}
              </p>
            </div>
            <Link href="/dashboard/grading" className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-[10px] font-bold text-muted-foreground hover:text-foreground transition-all">
              <XMarkIcon className="h-3 w-3" /> Clear
            </Link>
          </div>
        )}

        {/* ── Error ───────────────────────────────────────────────────────── */}
        {error && (
          <div className="flex items-start gap-3 rounded-xl border border-rose-500/25 bg-rose-500/10 px-4 py-3">
            <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-rose-600 dark:text-rose-400">Notice</p>
              <p className="text-[11px] text-rose-600/80 dark:text-rose-400/80 mt-0.5">{error}</p>
            </div>
            <button onClick={() => void loadAll()} className="text-[10px] font-black uppercase tracking-widest text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 shrink-0">
              Retry
            </button>
          </div>
        )}

        {/* ── Loading ──────────────────────────────────────────────────────── */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-muted-foreground">Loading submissions…</p>
          </div>
        ) : (
          <>
            {/* ══════════════════════════════════════════════════════════════
                ASSIGNMENT TAB
            ══════════════════════════════════════════════════════════════ */}
            {tab === 'assignments' && (
              sourceErrors.assignments ? (
                <QueueUnavailable label="Assignment grading queue" onRetry={() => void loadAll()} />
              ) : submissions.length === 0 ? <EmptyQueue scoped={scoped} /> : (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card p-2">
                    {([
                      { value: 'priority', label: 'Priority review', count: submissions.length },
                      { value: 'manual', label: 'Manual judgement', count: manualCount },
                      { value: 'ai_ready', label: 'AI-ready', count: aiReadyCount },
                    ] as const).map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => { setAssignmentView(option.value); setActiveIdx(0); }}
                        className={`inline-flex min-h-10 items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold transition-colors ${assignmentView === option.value
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
                      >
                        {option.value === 'ai_ready' && <SparklesIcon className="h-3.5 w-3.5" />}
                        {option.label}
                        <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-black ${assignmentView === option.value ? 'bg-white/20' : 'bg-muted'}`}>
                          {option.count}
                        </span>
                      </button>
                    ))}
                    <p className="ml-auto px-2 text-[10px] text-muted-foreground">
                      Suggestions stay separate until you explicitly use or accept them.
                    </p>
                  </div>

                  {reviewSubmissions.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-border bg-card py-16 text-center">
                      <CheckCircleIcon className="mx-auto mb-3 h-10 w-10 text-emerald-600 dark:text-emerald-400" />
                      <p className="font-black text-foreground">No submissions in this review lane</p>
                      <button type="button" onClick={() => { setAssignmentView('priority'); setActiveIdx(0); }} className="mt-2 text-xs font-bold text-primary hover:underline">
                        Return to priority review
                      </button>
                    </div>
                  ) : (
                  <div className="flex gap-5 items-start">

                  {/* Sidebar queue list (xl+) */}
                  <QueueSidebar
                    submissions={reviewSubmissions}
                    activeIdx={activeIdx}
                    saved={saved}
                    onSelect={setActiveIdx}
                    scope={scope}
                  />

                  {/* Main grading panel */}
                  <div className="flex-1 min-w-0 space-y-4">

                    {/* Queue progress bar + navigation */}
                    <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
                      <button
                        disabled={activeIdx <= 0}
                        onClick={() => setActiveIdx(i => Math.max(0, i - 1))}
                        className="rounded-lg border border-border bg-background p-2 text-muted-foreground hover:text-foreground disabled:opacity-30 transition-all"
                      >
                        <ArrowLeftIcon className="w-4 h-4" />
                      </button>

                      <div className="flex-1 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                            Submission {activeIdx + 1} of {reviewSubmissions.length}
                          </span>
                          <span className="text-[10px] font-bold text-muted-foreground">
                            {reviewSubmissions.length - activeIdx - 1} remaining
                          </span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full bg-amber-500 transition-all duration-500"
                            style={{ width: `${((activeIdx + 1) / reviewSubmissions.length) * 100}%` }}
                          />
                        </div>
                      </div>

                      <button
                        disabled={activeIdx >= reviewSubmissions.length - 1}
                        onClick={() => setActiveIdx(i => Math.min(reviewSubmissions.length - 1, i + 1))}
                        className="rounded-lg border border-border bg-background p-2 text-muted-foreground hover:text-foreground disabled:opacity-30 transition-all"
                      >
                        <ArrowRightIcon className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Current submission card */}
                    {sub && (() => {
                      const assignment = sub.assignments;
                      const maxPts = assignment?.max_points ?? 100;
                      const rubric = Array.isArray(assignment?.metadata?.rubric) ? assignment.metadata.rubric : [];
                      const className = classNameFromJoin(assignment?.classes);
                      const gradingMode = sub.grading_mode || assignment?.grading_mode || null;
                      const isSaving = saving === sub.id;
                      const isSaved = saved.has(sub.id);
                      const scoreValue = Number(grade[sub.id]);
                      const canGrade = grade[sub.id] !== '' && Number.isFinite(scoreValue) && scoreValue >= 0 && scoreValue <= maxPts;

                      return (
                        <div className={`rounded-2xl border overflow-hidden transition-all ${
                          isSaved ? 'border-emerald-500/40 shadow-emerald-500/10 shadow-lg' : 'border-primary/25 shadow-primary/5 shadow-lg'
                        }`}>

                          {/* Saved flash */}
                          {isSaved && (
                            <div className="flex items-center gap-2 bg-emerald-600 px-5 py-2.5 text-white text-xs font-black">
                              <CheckCircleIcon className="w-4 h-4" />
                              Grade saved successfully — moving to next…
                            </div>
                          )}

                          {/* ── Context header (school / class / term / status) ── */}
                          <div className="border-b border-border bg-card/50 px-5 py-4 space-y-3">
                            <SubmissionContextBar sub={sub} scope={scope} />

                            {/* Student identity */}
                            <div className="flex items-center gap-3">
                              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-primary/25 to-primary/5 border border-primary/20 flex items-center justify-center text-primary font-black text-sm shrink-0">
                                {initials(sub.portal_users?.full_name)}
                              </div>
                              <div className="min-w-0">
                                <p className="font-black text-foreground text-sm">{sub.portal_users?.full_name ?? 'Unknown Student'}</p>
                                <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                                  {sub.portal_users?.email ?? ''}
                                  {sub.submitted_at ? ` · Submitted ${fmtDate(sub.submitted_at)}` : ''}
                                </p>
                              </div>
                            </div>

                            {/* Assignment / Kind / Class / Section / School / Course detail grid */}
                            {(() => {
                              const courseTitle = courseTitleFromJoin(assignment?.courses);
                              const kind = formatAssignmentKind(assignment?.assignment_type);
                              const studentSection = sub.portal_users?.section_class;
                              return (
                                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                                  <div className="rounded-lg border border-border bg-background/60 px-3 py-2">
                                    <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Kind / Type</p>
                                    <p className="text-xs font-bold text-purple-600 dark:text-purple-400 mt-0.5 truncate">{kind}</p>
                                  </div>
                                  <div className="rounded-lg border border-border bg-background/60 px-3 py-2">
                                    <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Assignment</p>
                                    <p className="text-xs font-bold text-foreground mt-0.5 truncate">{assignment?.title || 'Untitled Assignment'}</p>
                                  </div>
                                  <div className="rounded-lg border border-border bg-background/60 px-3 py-2">
                                    <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Class</p>
                                    <p className="text-xs font-bold text-primary mt-0.5 truncate">{className || 'Unassigned Class'}</p>
                                  </div>
                                  <div className="rounded-lg border border-border bg-background/60 px-3 py-2">
                                    <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Section</p>
                                    <p className="text-xs font-bold text-teal-600 dark:text-teal-400 mt-0.5 truncate">{studentSection || 'No Section'}</p>
                                  </div>
                                  <div className="rounded-lg border border-border bg-background/60 px-3 py-2">
                                    <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">School</p>
                                    <p className="text-xs font-bold text-blue-600 dark:text-blue-400 mt-0.5 truncate">{assignment?.school_name || 'Rillcod Online School'}</p>
                                  </div>
                                  <div className="rounded-lg border border-border bg-background/60 px-3 py-2">
                                    <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">{courseTitle ? 'Course' : 'Term'}</p>
                                    <p className="text-xs font-bold text-foreground mt-0.5 truncate">{courseTitle || scope?.term_label || 'Current Term'}</p>
                                  </div>
                                </div>
                              );
                            })()}
                          </div>

                          {/* ── Submission content ─────────────────────────── */}
                          <div className="px-5 pt-5 pb-0">
                            <GradingAssessmentView
                              assignmentTitle={assignment?.title ?? 'Assignment'}
                              description={assignment?.description}
                              instructions={assignment?.instructions}
                              rubric={rubric}
                              gradingMode={gradingMode}
                              maxPoints={maxPts}
                              className={className}
                              termLabel={scope?.term_label ?? null}
                              status={sub.status}
                              studentName={sub.portal_users?.full_name}
                              studentEmail={sub.portal_users?.email}
                              submittedAt={sub.submitted_at}
                              submissionText={sub.submission_text}
                              fileUrl={sub.file_url}
                              aiSuggestedGrade={sub.ai_suggested_grade}
                              aiSuggestedFeedback={sub.ai_suggested_feedback}
                              existingFeedback={sub.feedback}
                            />
                          </div>

                          {/* ── Grading panel ──────────────────────────────── */}
                          <div className="px-5 pb-5 pt-4 border-t border-border mt-5 bg-background/40 space-y-4">
                            <div className="flex items-center justify-between flex-wrap gap-2">
                              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                                Evaluation & Score
                              </p>
                              {sub.ai_suggested_grade != null && (
                                <button
                                  onClick={() => {
                                    setGrade(g => ({ ...g, [sub.id]: String(sub.ai_suggested_grade) }));
                                    setFeedback(f => ({ ...f, [sub.id]: sub.ai_suggested_feedback ?? '' }));
                                  }}
                                  className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
                                >
                                  <SparklesIcon className="w-3.5 h-3.5" />
                                  Pre-fill AI score ({sub.ai_suggested_grade}/{maxPts})
                                </button>
                              )}
                            </div>

                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[13rem_1fr]">
                              <div>
                                <label className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1.5">
                                  Score out of {maxPts}
                                </label>
                                <input
                                  type="number"
                                  min={0}
                                  max={maxPts}
                                  value={grade[sub.id] ?? ''}
                                  onChange={e => setGrade(g => ({ ...g, [sub.id]: e.target.value }))}
                                  className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm font-bold text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                                  placeholder={`0 – ${maxPts}`}
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1.5">
                                  Teacher Feedback (optional)
                                </label>
                                <textarea
                                  rows={3}
                                  value={feedback[sub.id] ?? ''}
                                  onChange={e => setFeedback(f => ({ ...f, [sub.id]: e.target.value }))}
                                  className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
                                  placeholder="What was done well, what needs improvement, next steps for the student…"
                                />
                              </div>
                            </div>

                            {/* Action buttons — clearly ordered */}
                            <div className="flex flex-col gap-2 sm:flex-row">
                              {/* Primary: Accept AI (only when AI score exists) */}
                              {sub.ai_suggested_grade != null && (
                                <button
                                  onClick={() => void doGrade(sub.id, 'accept_ai')}
                                  disabled={isSaving}
                                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-xs font-black text-white hover:bg-emerald-500 disabled:opacity-40 transition-colors shadow-sm shadow-emerald-500/20"
                                >
                                  <StarIcon className="w-4 h-4" />
                                  {isSaving ? 'Saving…' : `Accept AI · ${sub.ai_suggested_grade}/${maxPts}`}
                                </button>
                              )}
                              {/* Manual save */}
                              <button
                                onClick={() => void doGrade(sub.id, 'override', false)}
                                disabled={!canGrade || isSaving}
                                className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-xs font-black uppercase tracking-widest text-primary-foreground hover:opacity-90 disabled:opacity-40 transition-all shadow-sm shadow-primary/20"
                              >
                                {isSaving ? 'Saving…' : 'Save Score'}
                              </button>
                              {/* Save & next */}
                              <button
                                onClick={() => void doGrade(sub.id, 'override', true)}
                                disabled={!canGrade || isSaving}
                                className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-5 py-3 text-xs font-black uppercase tracking-widest text-primary hover:bg-primary/20 disabled:opacity-40 transition-all"
                              >
                                Save & Next <ArrowRightIcon className="w-4 h-4" />
                              </button>
                            </div>

                            <p className="text-[10px] text-muted-foreground text-center">
                              Grades are saved immediately and update the student's gradebook record in real time.
                            </p>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                  </div>
                  )}
                </div>
              )
            )}

            {/* ══════════════════════════════════════════════════════════════
                CBT TAB
            ══════════════════════════════════════════════════════════════ */}
            {tab === 'written' && (
              <div className="space-y-4">
                <div>
                  <div className="mb-1 flex items-center gap-2">
                    <DocumentTextIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    <span className="text-xs font-black uppercase tracking-widest text-blue-600 dark:text-blue-400">Written Exam Review Queue</span>
                  </div>
                  <p className="text-sm text-muted-foreground">Submitted essay and short-answer papers waiting for an authorised reviewer. Scores are validated against each question and publish only when the full paper is complete.</p>
                </div>

                {sourceErrors.written ? (
                  <QueueUnavailable label="Written exam review queue" onRetry={() => void loadAll()} />
                ) : writtenAttempts.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border bg-card py-20 text-center">
                    <CheckCircleIcon className="mx-auto mb-3 h-12 w-12 text-emerald-600 dark:text-emerald-400" />
                    <p className="font-black text-foreground">No written papers pending</p>
                    <p className="mt-1 text-sm text-muted-foreground">All submitted written exams have been reviewed.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                    {writtenAttempts.map((attempt, index) => (
                      <div key={attempt.id} className="rounded-2xl border border-blue-500/20 bg-card p-5">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="mb-2 flex flex-wrap items-center gap-2">
                              <ContextPill icon={<DocumentTextIcon className="h-3 w-3" />} label="Written exam" color="border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400" />
                              {(attempt.tab_switches ?? 0) > 0 && <ContextPill icon={null} label={`${attempt.tab_switches} tab switch${attempt.tab_switches === 1 ? '' : 'es'}`} color="border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400" />}
                            </div>
                            <p className="truncate font-black text-foreground">{attempt.student?.full_name || 'Learner'}</p>
                            <p className="truncate text-xs text-muted-foreground">{attempt.student?.email || 'No email'}</p>
                          </div>
                          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">#{index + 1}</span>
                        </div>
                        <div className="mt-4 rounded-xl bg-muted/50 p-3">
                          <p className="text-xs font-bold text-foreground">{attempt.exam?.title || 'Written examination'}</p>
                          <p className="mt-1 text-[11px] text-muted-foreground">{attempt.exam?.courses?.title || 'Course'}{attempt.submitted_at ? ` · Submitted ${fmtDate(attempt.submitted_at)}` : ''}</p>
                        </div>
                        <Link href={`/dashboard/exams/${attempt.exam_id}/attempts/${attempt.id}`} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-black text-white transition-colors hover:bg-blue-500">
                          Review & Grade <ArrowRightIcon className="h-3.5 w-3.5" />
                        </Link>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {tab === 'cbt' && (
              <div className="space-y-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <AcademicCapIcon className="w-5 h-5 text-violet-600 dark:text-violet-400" />
                    <span className="text-xs font-black uppercase tracking-widest text-violet-600 dark:text-violet-400">CBT Written Response Queue</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Computer-based test sessions with written responses that need manual teacher scoring.
                    Each card shows the student, exam, and class so you know exactly where it came from.
                  </p>
                </div>

                {sourceErrors.cbt ? (
                  <QueueUnavailable label="CBT written-response queue" onRetry={() => void loadAll()} />
                ) : cbtSessions.length === 0 ? (
                  <div className="text-center py-20 bg-card border border-dashed border-border rounded-2xl">
                    <CheckCircleIcon className="w-12 h-12 mx-auto text-emerald-600 dark:text-emerald-400 mb-3" />
                    <p className="font-black text-foreground">No CBT responses pending</p>
                    <p className="text-sm text-muted-foreground mt-1">All written responses have been reviewed.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {cbtSessions.map((session, i) => {
                      const exam = session.cbt_exams;
                      const cls = classNameFromJoin(exam?.classes);
                      const schoolName = exam?.school_name;
                      return (
                        <div key={session.id} className="rounded-2xl border border-violet-500/20 bg-card overflow-hidden">
                          {/* Context header */}
                          <div className="border-b border-border bg-violet-500/5 px-5 py-3 flex flex-wrap items-center gap-2">
                            <ContextPill
                              icon={<AcademicCapIcon className="w-3 h-3" />}
                              label="CBT Evaluation"
                              color="border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-400"
                            />
                            {schoolName && (
                              <ContextPill
                                icon={<BuildingOfficeIcon className="w-3 h-3" />}
                                label={schoolName}
                                color="border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400"
                              />
                            )}
                            {cls && (
                              <ContextPill
                                icon={<UserGroupIcon className="w-3 h-3" />}
                                label={cls}
                                color="border-primary/30 bg-primary/10 text-primary"
                              />
                            )}
                            {scope?.term_label && (
                              <ContextPill
                                icon={<ClockIcon className="w-3 h-3" />}
                                label={scope.term_label}
                                color="border-border bg-muted/40 text-muted-foreground"
                              />
                            )}
                          </div>

                          {/* Content row */}
                          <div className="flex flex-col sm:flex-row sm:items-center gap-4 px-5 py-4">
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              <div className="w-11 h-11 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-600 dark:text-violet-400 font-black text-sm shrink-0">
                                {initials(session.portal_users?.full_name)}
                              </div>
                              <div className="min-w-0">
                                <p className="font-black text-sm text-foreground truncate">
                                  {session.portal_users?.full_name ?? 'Student'}
                                </p>
                                <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                                  {session.portal_users?.email ?? ''}
                                </p>
                              </div>
                            </div>

                            {/* Exam info */}
                            <div className="flex-1 min-w-0">
                              <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Exam</p>
                              <p className="text-sm font-bold text-foreground truncate">{exam?.title ?? 'Evaluation'}</p>
                              {session.end_time && (
                                <p className="text-[10px] text-muted-foreground mt-0.5">
                                  Submitted: {fmtDate(session.end_time)}
                                </p>
                              )}
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">#{i + 1}</span>
                              <Link
                                href={`/dashboard/cbt/${session.exam_id}/sessions/${session.id}/grade`}
                                className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-xs font-black text-white hover:bg-violet-500 transition-colors"
                              >
                                Review & Grade <ArrowRightIcon className="w-3.5 h-3.5" />
                              </Link>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
