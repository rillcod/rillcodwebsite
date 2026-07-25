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
import Link from 'next/link';
import { fetchJsonWithTimeout } from '@/lib/async-timeout';

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

function SubmissionContextBar({ sub, scope }: { sub: Submission; scope: GradingScope | null }) {
  const className = classNameFromJoin(sub.assignments?.classes);
  const schoolName = sub.assignments?.school_name;
  const kind = formatAssignmentKind(sub.assignments?.assignment_type);
  const hasAI = sub.ai_suggested_grade != null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {/* Kind / Type */}
      <ContextPill
        icon={<BookOpenIcon className="w-3 h-3" />}
        label={`Kind: ${kind}`}
        color="border-purple-500/30 bg-purple-500/10 text-purple-400"
      />
      {/* School */}
      {(schoolName || sub.assignments?.school_id) && (
        <ContextPill
          icon={<BuildingOfficeIcon className="w-3 h-3" />}
          label={schoolName || 'School'}
          color="border-blue-500/30 bg-blue-500/10 text-blue-500"
        />
      )}
      {/* Class */}
      {className && (
        <ContextPill
          icon={<UserGroupIcon className="w-3 h-3" />}
          label={className}
          color="border-primary/30 bg-primary/10 text-primary"
        />
      )}
      {/* Term */}
      {scope?.term_label && (
        <ContextPill
          icon={<ClockIcon className="w-3 h-3" />}
          label={scope.term_label}
          color="border-border bg-muted/40 text-muted-foreground"
        />
      )}
      {/* Status */}
      <ContextPill
        icon={null}
        label={sub.status.replace(/_/g, ' ')}
        color="border-amber-500/30 bg-amber-500/10 text-amber-500"
      />
      {/* AI available */}
      {hasAI && (
        <ContextPill
          icon={<SparklesIcon className="w-3 h-3" />}
          label={`AI: ${sub.ai_suggested_grade}/${sub.assignments?.max_points ?? 100}`}
          color="border-emerald-500/30 bg-emerald-500/10 text-emerald-500"
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
                {isDone && <span className="text-[9px] font-black text-emerald-400">✓ Graded</span>}
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
        <CheckCircleIcon className="w-8 h-8 text-emerald-400" />
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

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function GradingQueuePage() {
  const { profile } = useAuth();
  const searchParams = useSearchParams();
  const classId = searchParams.get('class_id');
  const termId = searchParams.get('term_id');

  const [tab, setTab] = useState<'assignments' | 'cbt'>('assignments');
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [cbtSessions, setCbtSessions] = useState<CbtQueueItem[]>([]);
  const [scope, setScope] = useState<GradingScope | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeIdx, setActiveIdx] = useState(0);
  const [grade, setGrade] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const isStaff = ['teacher', 'admin', 'school'].includes(profile?.role ?? '');

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

    const [aJson, cJson] = await Promise.all([
      fetchJsonWithTimeout(`/api/grading/submissions?${queryString}`,
        { data: [], error: 'Assignment submissions timed out.' }, 'grading-assignments'),
      fetchJsonWithTimeout(`/api/grading/cbt-sessions${cbtP.toString() ? `?${cbtP}` : ''}`,
        { data: [], error: 'CBT sessions timed out.' }, 'grading-cbt'),
    ]);

    const msgs = [aJson, cJson].map((r: any) => r.error).filter(Boolean);
    if (msgs.length) setError(msgs.join(' · '));

    const subs = (aJson.data ?? []) as Submission[];
    setSubmissions(subs);
    setCbtSessions((cJson.data ?? []) as CbtQueueItem[]);
    setScope((aJson as any).scope ?? (cJson as any).scope ?? null);
    setActiveIdx(0);

    // Pre-fill AI suggestions
    const g: Record<string, string> = {};
    const f: Record<string, string> = {};
    for (const s of subs) {
      if (s.ai_suggested_grade != null) g[s.id] = String(s.ai_suggested_grade);
      if (s.ai_suggested_feedback) f[s.id] = s.ai_suggested_feedback;
    }
    setGrade(g);
    setFeedback(f);
    setLoading(false);
  }, [classId, queryString, termId]);

  useEffect(() => { if (isStaff) void loadAll(); }, [isStaff, loadAll]);

  // ── Grading actions ──────────────────────────────────────────────────────

  async function doGrade(id: string, action: 'accept_ai' | 'override', andNext = false) {
    setSaving(id);
    const body: Record<string, unknown> = { action };
    if (action === 'override') {
      const g = Number(grade[id]);
      if (!grade[id] || Number.isNaN(g)) { setSaving(null); return; }
      body.grade = g;
      body.feedback = feedback[id] || null;
    }
    const res = await fetch(`/api/grading/submissions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error || 'Grading failed. Please try again.');
      setSaving(null);
      return;
    }
    setSaved(prev => new Set([...prev, id]));
    setSaving(null);
    setTimeout(() => {
      setSubmissions(prev => {
        const next = prev.filter(s => s.id !== id);
        if (andNext) setActiveIdx(i => Math.min(i, Math.max(0, next.length - 1)));
        return next;
      });
      setSaved(prev => { const n = new Set(prev); n.delete(id); return n; });
    }, 700);
  }

  // ── Derived state ────────────────────────────────────────────────────────

  if (!isStaff) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground text-sm">Staff access required.</p>
      </div>
    );
  }

  const scoped = Boolean(scope?.class_id || scope?.term_label);
  const sub = submissions[activeIdx] ?? null;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-7xl mx-auto px-4 py-8 space-y-5">

        {/* ── Page header ─────────────────────────────────────────────────── */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <ClipboardDocumentCheckIcon className="w-5 h-5 text-amber-500" />
            <span className="text-xs font-black uppercase tracking-widest text-amber-500">Grading Center</span>
          </div>
          <h1 className="text-3xl font-black text-foreground">Grading Queue</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            All submissions awaiting evaluation. Each card shows exactly where the work comes from —
            school, class, term — so you always know the context before marking.
          </p>
        </div>

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
              <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-black ${tab === 'assignments' ? 'bg-white/25' : 'bg-amber-500/20 text-amber-500'}`}>
                {submissions.length}
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
              <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-black ${tab === 'cbt' ? 'bg-white/25' : 'bg-violet-500/20 text-violet-400'}`}>
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
            <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-rose-400">Notice</p>
              <p className="text-[11px] text-rose-400/80 mt-0.5">{error}</p>
            </div>
            <button onClick={() => void loadAll()} className="text-[10px] font-black uppercase tracking-widest text-rose-400 hover:text-rose-300 shrink-0">
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
              submissions.length === 0 ? <EmptyQueue scoped={scoped} /> : (
                <div className="flex gap-5 items-start">

                  {/* Sidebar queue list (xl+) */}
                  <QueueSidebar
                    submissions={submissions}
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
                            Submission {activeIdx + 1} of {submissions.length}
                          </span>
                          <span className="text-[10px] font-bold text-muted-foreground">
                            {submissions.length - activeIdx - 1} remaining
                          </span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full bg-amber-500 transition-all duration-500"
                            style={{ width: `${((activeIdx + 1) / submissions.length) * 100}%` }}
                          />
                        </div>
                      </div>

                      <button
                        disabled={activeIdx >= submissions.length - 1}
                        onClick={() => setActiveIdx(i => Math.min(submissions.length - 1, i + 1))}
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
                      const canGrade = !!grade[sub.id] && !Number.isNaN(Number(grade[sub.id]));

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

                            {/* Assignment / Kind / Class / School / Course detail grid */}
                            {(() => {
                              const courseTitle = courseTitleFromJoin(assignment?.courses);
                              const kind = formatAssignmentKind(assignment?.assignment_type);
                              const studentSection = sub.portal_users?.section_class;
                              return (
                                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                                  <div className="rounded-lg border border-border bg-background/60 px-3 py-2">
                                    <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Kind / Type</p>
                                    <p className="text-xs font-bold text-purple-400 mt-0.5 truncate">{kind}</p>
                                  </div>
                                  <div className="rounded-lg border border-border bg-background/60 px-3 py-2">
                                    <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Assignment</p>
                                    <p className="text-xs font-bold text-foreground mt-0.5 truncate">{assignment?.title ?? '—'}</p>
                                  </div>
                                  <div className="rounded-lg border border-border bg-background/60 px-3 py-2">
                                    <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Class &amp; Section</p>
                                    <p className="text-xs font-bold text-foreground mt-0.5 truncate">
                                      {className ?? 'Not assigned'}
                                      {studentSection ? ` (${studentSection})` : ''}
                                    </p>
                                  </div>
                                  <div className="rounded-lg border border-border bg-background/60 px-3 py-2">
                                    <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">School</p>
                                    <p className="text-xs font-bold text-foreground mt-0.5 truncate">{assignment?.school_name ?? 'School Scope'}</p>
                                  </div>
                                  <div className="rounded-lg border border-border bg-background/60 px-3 py-2">
                                    <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">{courseTitle ? 'Course' : 'Term'}</p>
                                    <p className="text-xs font-bold text-foreground mt-0.5 truncate">{courseTitle || scope?.term_label || 'Current term'}</p>
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
                                  className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-emerald-500 hover:text-emerald-400 transition-colors"
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
              )
            )}

            {/* ══════════════════════════════════════════════════════════════
                CBT TAB
            ══════════════════════════════════════════════════════════════ */}
            {tab === 'cbt' && (
              <div className="space-y-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <AcademicCapIcon className="w-5 h-5 text-violet-400" />
                    <span className="text-xs font-black uppercase tracking-widest text-violet-400">CBT Written Response Queue</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Computer-based test sessions with written responses that need manual teacher scoring.
                    Each card shows the student, exam, and class so you know exactly where it came from.
                  </p>
                </div>

                {cbtSessions.length === 0 ? (
                  <div className="text-center py-20 bg-card border border-dashed border-border rounded-2xl">
                    <CheckCircleIcon className="w-12 h-12 mx-auto text-emerald-400 mb-3" />
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
                              color="border-violet-500/30 bg-violet-500/10 text-violet-400"
                            />
                            {schoolName && (
                              <ContextPill
                                icon={<BuildingOfficeIcon className="w-3 h-3" />}
                                label={schoolName}
                                color="border-blue-500/30 bg-blue-500/10 text-blue-500"
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
                              <div className="w-11 h-11 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400 font-black text-sm shrink-0">
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
