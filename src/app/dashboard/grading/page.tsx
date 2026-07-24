'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import {
  ClipboardDocumentListIcon, CheckCircleIcon, StarIcon, ChartBarIcon,
  ClipboardDocumentCheckIcon, DocumentTextIcon,
  ExclamationTriangleIcon, FunnelIcon, XMarkIcon,
} from '@/lib/icons';
import { fetchJsonWithTimeout } from '@/lib/async-timeout';
import { GradingAssessmentView } from '@/components/grading/GradingAssessmentView';
import Link from 'next/link';

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
  portal_users?: { full_name: string; email: string };
  assignments?: {
    title: string;
    max_points: number;
    grading_mode: string;
    class_id?: string | null;
    description?: string | null;
    instructions?: string | null;
    metadata?: { rubric?: Array<{ criterion: string; description?: string; maxPoints: number }> } | null;
    classes?: { name?: string } | { name?: string }[] | null;
  };
}

function classLabelFromJoin(classes: unknown): string | null {
  if (!classes) return null;
  const row = Array.isArray(classes) ? classes[0] : classes;
  return (row as { name?: string } | null)?.name ?? null;
}

export default function GradingQueuePage() {
  const { profile } = useAuth();
  const searchParams = useSearchParams();
  const classId = searchParams.get('class_id');
  const termId = searchParams.get('term_id');

  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [cbtSessions, setCbtSessions] = useState<CbtQueueItem[]>([]);
  const [scope, setScope] = useState<GradingScope | null>(null);
  const [loading, setLoading] = useState(true);
  const [gradingId, setGradingId] = useState<string | null>(null);
  const [grade, setGrade] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isTeacher = ['teacher', 'admin', 'school'].includes(profile?.role ?? '');

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    params.set('status', 'actionable');
    if (classId) params.set('class_id', classId);
    if (termId) params.set('term_id', termId);
    return params.toString();
  }, [classId, termId]);

  const loadSubmissions = useCallback(async () => {
    setLoading(true);
    setError(null);
    const cbtParams = new URLSearchParams();
    if (classId) cbtParams.set('class_id', classId);
    if (termId) cbtParams.set('term_id', termId);

    const [assignmentJson, cbtJson] = await Promise.all([
      fetchJsonWithTimeout(
        `/api/grading/submissions?${queryString}`,
        { data: [], error: 'Assignment submissions took too long to load.' },
        'grading center assignments',
      ),
      fetchJsonWithTimeout(
        `/api/grading/cbt-sessions${cbtParams.toString() ? `?${cbtParams}` : ''}`,
        { data: [], error: 'Evaluation submissions took too long to load.' },
        'grading center evaluations',
      ),
    ]);

    const messages = [assignmentJson, cbtJson].map((result) => (result as any).error).filter(Boolean);
    if (messages.length) setError(messages.join(' '));

    setSubmissions((assignmentJson.data ?? []) as Submission[]);
    setCbtSessions((cbtJson.data ?? []) as CbtQueueItem[]);
    setScope((assignmentJson as any).scope ?? (cbtJson as any).scope ?? null);
    setLoading(false);
  }, [classId, queryString, termId]);

  useEffect(() => {
    if (isTeacher) void loadSubmissions();
  }, [isTeacher, loadSubmissions]);

  async function acceptAI(id: string) {
    setSaving(id);
    const res = await fetch(`/api/grading/submissions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'accept_ai' }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json.error || 'Failed to accept AI grade');
      setSaving(null);
      return;
    }
    setSubmissions((prev) => prev.filter((s) => s.id !== id));
    setSaving(null);
  }

  async function overrideGrade(id: string) {
    const g = Number(grade[id]);
    if (!grade[id] || Number.isNaN(g)) return;
    setSaving(id);
    const res = await fetch(`/api/grading/submissions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'override', grade: g, feedback: feedback[id] || null }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json.error || 'Failed to save grade');
      setSaving(null);
      return;
    }
    setSubmissions((prev) => prev.filter((s) => s.id !== id));
    setSaving(null);
    setGradingId(null);
  }

  if (!isTeacher) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Unauthorized</p>
      </div>
    );
  }

  const scoped = Boolean(scope?.class_id || scope?.term_label);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center gap-1 bg-card border border-border rounded-xl p-1 w-fit flex-wrap">
          <span className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-amber-600 text-white text-xs sm:text-sm font-black shadow-sm">
            <ClipboardDocumentCheckIcon className="w-4 h-4" /> 1. Grading Queue (Pending Work)
          </span>
          <Link
            href="/dashboard/grades"
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 text-xs sm:text-sm font-bold transition-all"
          >
            <ChartBarIcon className="w-4 h-4" /> 2. Master Gradebook &amp; Outcomes
          </Link>
          <Link
            href="/dashboard/grades/waec"
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 text-xs sm:text-sm font-bold transition-all"
          >
            <DocumentTextIcon className="w-4 h-4" /> 3. Grading Guide
          </Link>
        </div>

        <div>
          <div className="flex items-center gap-2 mb-1">
            <ClipboardDocumentListIcon className="w-5 h-5 text-amber-500" />
            <span className="text-xs font-bold text-amber-500 uppercase tracking-widest">Pending Submissions Queue</span>
          </div>
          <h1 className="text-3xl font-black">Grading Queue (Pending Work)</h1>
          <p className="text-muted-foreground text-sm mt-1 max-w-3xl">
            Your marking tray for student submissions awaiting evaluation. Scores confirmed here will automatically update the student&apos;s record in the <strong className="text-foreground">Master Gradebook</strong>.
          </p>
        </div>

        {scoped && (
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-primary/25 bg-primary/5 px-4 py-3">
            <FunnelIcon className="h-4 w-4 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-black uppercase tracking-widest text-primary">Active scope</p>
              <p className="text-sm font-bold text-foreground">
                {[scope?.class_name, scope?.term_label].filter(Boolean).join(' · ') || 'Filtered view'}
              </p>
            </div>
            <Link
              href="/dashboard/grading"
              className="inline-flex items-center gap-1 rounded-xl border border-border bg-card px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-foreground"
            >
              <XMarkIcon className="h-3.5 w-3.5" /> Clear filters
            </Link>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-3 rounded-xl border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-400">
            <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <div className="flex-1">
              <p className="font-bold">Grading Center notice</p>
              <p className="text-xs opacity-80">{error}</p>
            </div>
            <button onClick={() => void loadSubmissions()} className="text-xs font-black uppercase tracking-widest hover:text-rose-300">
              Retry
            </button>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : submissions.length === 0 && cbtSessions.length === 0 ? (
          <div className="text-center py-16 bg-card border border-border rounded-xl">
            <CheckCircleIcon className="w-12 h-12 mx-auto text-emerald-400 mb-3" />
            <p className="font-bold text-foreground mb-1">All caught up!</p>
            <p className="text-muted-foreground text-sm">
              {scoped ? 'Nothing in this class or term still needs grading.' : 'No assignment or evaluation submissions need grading.'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {cbtSessions.length > 0 && (
              <section className="rounded-2xl border border-violet-500/25 bg-violet-500/5 p-5">
                <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs font-black uppercase tracking-widest text-violet-400">Evaluations</p>
                    <h2 className="text-lg font-black">Written responses needing teacher grading</h2>
                  </div>
                  <span className="w-fit rounded-full bg-violet-500/15 px-3 py-1 text-xs font-black text-violet-300">
                    {cbtSessions.length} pending
                  </span>
                </div>
                <div className="space-y-2">
                  {cbtSessions.map((session) => {
                    const exam = session.cbt_exams;
                    const className = classLabelFromJoin(exam?.classes);
                    return (
                      <div
                        key={session.id}
                        className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-bold">{exam?.title ?? 'Evaluation'}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {session.portal_users?.full_name ?? 'Student'} · {session.portal_users?.email ?? 'No email'}
                            {className ? ` · ${className}` : ''}
                            {session.end_time ? ` · Submitted ${new Date(session.end_time).toLocaleDateString()}` : ''}
                          </p>
                        </div>
                        <Link
                          href={`/dashboard/cbt/${session.exam_id}/sessions/${session.id}/grade`}
                          className="shrink-0 rounded-xl bg-violet-600 px-4 py-2.5 text-center text-xs font-black text-white hover:bg-violet-500"
                        >
                          Open responses &amp; grade
                        </Link>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {submissions.map((sub) => {
              const isOpen = gradingId === sub.id;
              const assignment = sub.assignments;
              const maxPts = assignment?.max_points ?? 100;
              const rubric = Array.isArray(assignment?.metadata?.rubric) ? assignment.metadata.rubric : [];
              const className = classLabelFromJoin(assignment?.classes);
              const gradingMode = sub.grading_mode || assignment?.grading_mode || null;

              return (
                <div
                  key={sub.id}
                  className={`overflow-hidden rounded-2xl border bg-card transition-all ${
                    isOpen ? 'border-primary/40 shadow-lg shadow-primary/5' : 'border-border'
                  }`}
                >
                  <div className="space-y-4 p-5">
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

                    <div className="rounded-2xl border border-border bg-background/60 p-4">
                      <p className="mb-3 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                        Evaluation decision
                      </p>
                      <div className="flex flex-col gap-3 sm:flex-row">
                        {sub.ai_suggested_grade != null ? (
                          <button
                            onClick={() => void acceptAI(sub.id)}
                            disabled={saving === sub.id}
                            className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white transition-colors hover:bg-emerald-500 disabled:opacity-40"
                          >
                            <StarIcon className="h-4 w-4" />
                            {saving === sub.id ? 'Saving…' : `Accept AI (${sub.ai_suggested_grade}/${maxPts})`}
                          </button>
                        ) : (
                          <p className="flex-1 rounded-xl border border-border bg-card px-4 py-2.5 text-xs text-muted-foreground">
                            No AI score exists. Enter a manual score below.
                          </p>
                        )}
                        <button
                          onClick={() => {
                            const willOpen = gradingId !== sub.id;
                            setGradingId(willOpen ? sub.id : null);
                            if (willOpen) {
                              setGrade((g) => ({
                                ...g,
                                [sub.id]: g[sub.id] ?? (sub.ai_suggested_grade != null ? String(sub.ai_suggested_grade) : (sub.grade != null ? String(sub.grade) : '')),
                              }));
                              setFeedback((f) => ({
                                ...f,
                                [sub.id]: f[sub.id] ?? sub.ai_suggested_feedback ?? sub.feedback ?? '',
                              }));
                            }
                          }}
                          className="inline-flex flex-1 items-center justify-center rounded-xl bg-muted px-4 py-2.5 text-xs font-bold text-foreground transition-colors hover:bg-muted/80"
                        >
                          {isOpen ? 'Hide manual grading' : 'Manual grade / feedback'}
                        </button>
                      </div>
                    </div>
                  </div>

                  {isOpen && (
                    <div className="space-y-4 border-t border-border bg-background/40 px-5 pb-5 pt-4">
                      <div className="flex items-center justify-between">
                        <p className="text-[10px] font-black uppercase tracking-widest text-primary">Manual Evaluation &amp; Override</p>
                        {sub.ai_suggested_grade != null && (
                          <button
                            type="button"
                            onClick={() => {
                              setGrade((g) => ({ ...g, [sub.id]: String(sub.ai_suggested_grade) }));
                              setFeedback((f) => ({ ...f, [sub.id]: sub.ai_suggested_feedback ?? '' }));
                            }}
                            className="text-[10px] font-bold text-amber-500 hover:underline uppercase tracking-wider"
                          >
                            Fill AI Suggested Score ({sub.ai_suggested_grade}/{maxPts})
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[12rem_1fr]">
                        <div>
                          <label className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-muted-foreground">
                            Score (Max: {maxPts})
                          </label>
                          <input
                            type="number"
                            min={0}
                            max={maxPts}
                            value={grade[sub.id] ?? ''}
                            onChange={(e) => setGrade((g) => ({ ...g, [sub.id]: e.target.value }))}
                            className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm font-bold text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                            placeholder={`0–${maxPts}`}
                          />
                        </div>
                        <div>
                          <label className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-muted-foreground">
                            Student Feedback &amp; Next Steps
                          </label>
                          <textarea
                            rows={3}
                            value={feedback[sub.id] ?? ''}
                            onChange={(e) => setFeedback((f) => ({ ...f, [sub.id]: e.target.value }))}
                            className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm font-medium text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                            placeholder="Explain what was done well, what needs correction, and guidance for next week…"
                          />
                        </div>
                      </div>
                      <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-2">
                        <button
                          type="button"
                          onClick={() => setGradingId(null)}
                          className="w-full sm:w-auto px-5 py-2.5 rounded-xl border border-border text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => void overrideGrade(sub.id)}
                          disabled={!grade[sub.id] || saving === sub.id}
                          className="w-full sm:w-auto rounded-xl bg-primary px-6 py-2.5 text-xs font-black uppercase tracking-widest text-primary-foreground transition-all hover:opacity-95 disabled:opacity-40 shadow-lg shadow-primary/20"
                        >
                          {saving === sub.id ? 'Saving Grade…' : 'Confirm & Save Score'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
