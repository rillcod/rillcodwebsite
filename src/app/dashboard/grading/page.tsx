'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { ClipboardDocumentListIcon, CheckCircleIcon, AcademicCapIcon, StarIcon, ChartBarIcon, ClipboardDocumentCheckIcon, DocumentTextIcon } from '@/lib/icons';
import Link from 'next/link';

interface Submission {
  id: string;
  portal_user_id: string;
  assignment_id: string;
  status: string;
  submitted_at: string;
  grade: number | null;
  ai_suggested_grade: number | null;
  grading_mode: string | null;
  portal_users?: { full_name: string; email: string };
  assignments?: { title: string; max_points: number; grading_mode: string };
}

export default function GradingQueuePage() {
  const { profile } = useAuth();
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [gradingId, setGradingId] = useState<string | null>(null);
  const [grade, setGrade] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const isTeacher = ['teacher', 'admin', 'school'].includes(profile?.role ?? '');

  useEffect(() => { if (isTeacher) loadSubmissions(); }, [isTeacher]);

  async function loadSubmissions() {
    setLoading(true);
    const res = await fetch('/api/grading/submissions?status=pending_review');
    const json = await res.json();
    setSubmissions(json.data ?? []);
    setLoading(false);
  }

  async function acceptAI(id: string) {
    setSaving(id);
    await fetch(`/api/grading/submissions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'accept_ai' }),
    });
    setSubmissions(prev => prev.filter(s => s.id !== id));
    setSaving(null);
  }

  async function overrideGrade(id: string) {
    const g = Number(grade[id]);
    if (!grade[id] || isNaN(g)) return;
    setSaving(id);
    await fetch(`/api/grading/submissions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'override', grade: g, feedback: feedback[id] || null }),
    });
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
          <p className="text-muted-foreground text-sm mt-1">Review AI-suggested grades and override as needed</p>
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>
        ) : submissions.length === 0 ? (
          <div className="text-center py-16 bg-card border border-border rounded-xl">
            <CheckCircleIcon className="w-12 h-12 mx-auto text-emerald-400 mb-3" />
            <p className="font-bold text-foreground mb-1">All caught up!</p>
            <p className="text-muted-foreground text-sm">No submissions pending review.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {submissions.map(sub => {
              const isOpen = gradingId === sub.id;
              const maxPts = sub.assignments?.max_points ?? 100;
              return (
                <div key={sub.id} className={`bg-card border rounded-xl transition-all ${isOpen ? 'border-primary/40' : 'border-border'}`}>
                  <div className="p-5 flex flex-col sm:flex-row sm:items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm text-foreground truncate">{sub.assignments?.title ?? 'Assignment'}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{sub.portal_users?.full_name ?? 'Student'} · {new Date(sub.submitted_at).toLocaleDateString()}</p>
                      {sub.ai_suggested_grade != null && (
                        <div className="mt-1.5 flex items-center gap-1.5">
                          <StarIcon className="w-3.5 h-3.5 text-amber-400" />
                          <span className="text-xs text-amber-400">AI suggests {sub.ai_suggested_grade} / {maxPts}</span>
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      {sub.ai_suggested_grade != null && (
                        <button
                          onClick={() => acceptAI(sub.id)}
                          disabled={saving === sub.id}
                          className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-bold rounded-xl transition-colors"
                        >
                          {saving === sub.id ? '…' : '✓ Accept AI'}
                        </button>
                      )}
                      <button
                        onClick={() => setGradingId(isOpen ? null : sub.id)}
                        className="px-3 py-2 bg-muted hover:bg-muted/80 text-foreground text-xs font-bold rounded-xl transition-colors"
                      >
                        {isOpen ? 'Cancel' : 'Override'}
                      </button>
                    </div>
                  </div>

                  {/* Override form */}
                  {isOpen && (
                    <div className="border-t border-border px-5 pb-5 pt-4 space-y-3">
                      <div className="flex gap-3">
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
                        <div className="flex-[2]">
                          <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest block mb-1">Feedback (optional)</label>
                          <input
                            value={feedback[sub.id] ?? ''}
                            onChange={e => setFeedback(f => ({ ...f, [sub.id]: e.target.value }))}
                            className="w-full bg-background border border-border text-foreground px-4 py-2.5 rounded-xl text-sm focus:outline-none focus:border-primary"
                            placeholder="Brief feedback for the student…"
                          />
                        </div>
                      </div>
                      <button
                        onClick={() => overrideGrade(sub.id)}
                        disabled={!grade[sub.id] || saving === sub.id}
                        className="px-4 py-2.5 bg-primary hover:bg-primary disabled:opacity-40 text-white text-sm font-bold rounded-xl transition-colors"
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
