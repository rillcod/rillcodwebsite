'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import {
  ClipboardDocumentListIcon, CheckCircleIcon, StarIcon, ChartBarIcon,
  ClipboardDocumentCheckIcon, DocumentTextIcon, PaperClipIcon,
  ExclamationTriangleIcon, ArrowPathIcon,
} from '@/lib/icons';
import { fetchJsonWithTimeout } from '@/lib/async-timeout';
import Link from 'next/link';

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
  grading_mode: string | null;
  portal_users?: { full_name: string; email: string };
  assignments?: { title: string; max_points: number; grading_mode: string; class_id?: string | null };
}

export default function GradingQueuePage() {
  const { profile } = useAuth();
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [gradingId, setGradingId] = useState<string | null>(null);
  const [grade, setGrade] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isTeacher = ['teacher', 'admin', 'school'].includes(profile?.role ?? '');

  useEffect(() => { if (isTeacher) loadSubmissions(); }, [isTeacher]);

  async function loadSubmissions() {
    setLoading(true);
    setError(null);
    const json = await fetchJsonWithTimeout(
      '/api/grading/submissions?status=pending_review',
      { data: [], error: 'The grading queue took too long to load.' },
      'grading queue submissions',
    );
    if ((json as any).error) setError(String((json as any).error));
    setSubmissions((json.data ?? []) as Submission[]);
    setLoading(false);
  }

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
    setSubmissions(prev => prev.filter(s => s.id !== id));
    setSaving(null);
  }

  async function overrideGrade(id: string) {
    const g = Number(grade[id]);
    if (!grade[id] || isNaN(g)) return;
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
    setSubmissions(prev => prev.filter(s => s.id !== id));
    setSaving(null);
    setGradingId(null);
  }

  if (!isTeacher) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <p className="text-muted-foreground">Unauthorized</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">

        {/* ── Assessment Tab Bar ── */}
        <div className="flex items-center gap-1 bg-card border border-border rounded-xl p-1 w-fit flex-wrap">
          <Link href="/dashboard/grades"
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 text-sm font-bold transition-all">
            <ChartBarIcon className="w-4 h-4" /> Grades
          </Link>
          <span className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-600 text-white text-sm font-black">
            <ClipboardDocumentCheckIcon className="w-4 h-4" /> Grading Queue
          </span>
          <Link href="/dashboard/grading-guide"
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 text-sm font-bold transition-all">
            <DocumentTextIcon className="w-4 h-4" /> Grading Guide
          </Link>
        </div>

        <div>
          <div className="flex items-center gap-2 mb-1">
            <ClipboardDocumentListIcon className="w-5 h-5 text-primary" />
            <span className="text-xs font-bold text-primary uppercase tracking-widest">Submissions</span>
          </div>
          <h1 className="text-3xl font-black">Grading Queue</h1>
          <p className="text-muted-foreground text-sm mt-1">Read the student work first, then accept AI support or enter your own score and feedback.</p>
        </div>

        {error && (
          <div className="flex items-start gap-3 rounded-xl border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-400">
            <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <div className="flex-1">
              <p className="font-bold">Grading queue notice</p>
              <p className="text-xs opacity-80">{error}</p>
            </div>
            <button onClick={loadSubmissions} className="text-xs font-black uppercase tracking-widest hover:text-rose-300">
              Retry
            </button>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>
        ) : submissions.length === 0 ? (
          <div className="text-center py-16 bg-card border border-border rounded-xl">
            <CheckCircleIcon className="w-12 h-12 mx-auto text-emerald-400 mb-3" />
            <p className="font-bold text-foreground mb-1">All caught up!</p>
            <p className="text-muted-foreground text-sm">No submissions pending review.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {submissions.map(sub => {
              const isOpen = gradingId === sub.id;
              const maxPts = sub.assignments?.max_points ?? 100;
              const scorePct = sub.ai_suggested_grade != null ? Math.round((sub.ai_suggested_grade / maxPts) * 100) : null;
              const hasSubmissionContent = Boolean(sub.submission_text?.trim() || sub.file_url);
              return (
                <div key={sub.id} className={`bg-card border rounded-2xl transition-all overflow-hidden ${isOpen ? 'border-primary/40 shadow-lg shadow-primary/5' : 'border-border'}`}>
                  <div className="p-5 flex flex-col gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <p className="font-bold text-base text-foreground truncate">{sub.assignments?.title ?? 'Assignment'}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {sub.portal_users?.full_name ?? 'Student'} · {sub.portal_users?.email ?? 'No email'} · {new Date(sub.submitted_at).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-widest ${
                            hasSubmissionContent ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-400' : 'border-amber-500/25 bg-amber-500/10 text-amber-400'
                          }`}>
                            {hasSubmissionContent ? 'Content attached' : 'No content'}
                          </span>
                          {sub.ai_suggested_grade != null && (
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/25 bg-amber-500/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-amber-400">
                              <StarIcon className="w-3.5 h-3.5" />
                              AI {sub.ai_suggested_grade}/{maxPts}{scorePct != null ? ` · ${scorePct}%` : ''}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-[1fr_18rem]">
                        <div className="rounded-xl border border-border bg-background/60 p-4">
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Student Submission</p>
                            {sub.file_url && (
                              <a
                                href={sub.file_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-primary hover:text-primary/80"
                              >
                                <PaperClipIcon className="h-3.5 w-3.5" />
                                Open file
                              </a>
                            )}
                          </div>
                          {sub.submission_text?.trim() ? (
                            <div className="max-h-56 overflow-y-auto rounded-lg border border-border bg-card p-3">
                              <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{sub.submission_text}</p>
                            </div>
                          ) : (
                            <div className="rounded-lg border border-dashed border-border bg-card p-4 text-sm text-muted-foreground">
                              {sub.file_url
                                ? 'This student submitted a file only. Open the attachment before grading.'
                                : 'No text or file was submitted. Confirm whether this was verbal/in-person work before grading.'}
                            </div>
                          )}
                          {sub.feedback && (
                            <div className="mt-3 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3">
                              <p className="text-[10px] font-black uppercase tracking-widest text-emerald-400">Existing Feedback</p>
                              <p className="mt-1 text-sm text-foreground">{sub.feedback}</p>
                            </div>
                          )}
                        </div>

                        <div className="rounded-xl border border-border bg-background/60 p-4 space-y-3">
                          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Evaluation Decision</p>
                          {sub.ai_suggested_grade != null ? (
                            <button
                              onClick={() => acceptAI(sub.id)}
                              disabled={saving === sub.id}
                              className="w-full px-3 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-bold rounded-xl transition-colors"
                            >
                              {saving === sub.id ? 'Saving…' : `Accept AI (${sub.ai_suggested_grade}/${maxPts})`}
                            </button>
                          ) : (
                            <p className="rounded-xl border border-border bg-card p-3 text-xs text-muted-foreground">No AI score exists. Enter a manual score below.</p>
                          )}
                          <button
                            onClick={() => setGradingId(isOpen ? null : sub.id)}
                            className="w-full px-3 py-2.5 bg-muted hover:bg-muted/80 text-foreground text-xs font-bold rounded-xl transition-colors"
                          >
                            {isOpen ? 'Hide manual grading' : 'Manual grade / feedback'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Override form */}
                  {isOpen && (
                    <div className="border-t border-border px-5 pb-5 pt-4 space-y-3 bg-background/40">
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[10rem_1fr]">
                        <div className="flex-1">
                          <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest block mb-1">Grade (0–{maxPts})</label>
                          <input
                            type="number"
                            min={0}
                            max={maxPts}
                            value={grade[sub.id] ?? ''}
                            onChange={e => setGrade(g => ({ ...g, [sub.id]: e.target.value }))}
                            className="w-full bg-background border border-border text-foreground px-4 py-2.5 rounded-xl text-sm focus:outline-none focus:border-primary"
                            placeholder={`0–${maxPts}`}
                          />
                        </div>
                        <div>
                          <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest block mb-1">Feedback for student</label>
                          <textarea
                            rows={3}
                            value={feedback[sub.id] ?? ''}
                            onChange={e => setFeedback(f => ({ ...f, [sub.id]: e.target.value }))}
                            className="w-full bg-background border border-border text-foreground px-4 py-2.5 rounded-xl text-sm focus:outline-none focus:border-primary"
                            placeholder="Explain what was good, what needs correction, and the next step…"
                          />
                        </div>
                      </div>
                      <button
                        onClick={() => overrideGrade(sub.id)}
                        disabled={!grade[sub.id] || saving === sub.id}
                        className="w-full sm:w-auto px-4 py-2.5 bg-primary hover:bg-primary disabled:opacity-40 text-primary-foreground text-sm font-bold rounded-xl transition-colors"
                      >
                        {saving === sub.id ? 'Saving…' : 'Save Grade'}
                      </button>
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
