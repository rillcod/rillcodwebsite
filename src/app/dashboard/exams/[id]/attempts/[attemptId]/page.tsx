'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeftIcon, CheckCircleIcon, ClockIcon, ExclamationTriangleIcon } from '@/lib/icons';

type Question = {
  id: string;
  question_text: string;
  question_type: string | null;
  points: number | null;
  correct_answer: unknown;
};

type Attempt = {
  id: string;
  status: string | null;
  score: number | null;
  total_points: number | null;
  percentage: number | null;
  submitted_at: string | null;
  tab_switches: number | null;
  grading_version?: number | null;
  moderation_status?: 'unreviewed' | 'reviewed' | 'approved' | 'returned' | null;
  grading_change_reason?: string | null;
  answers: Record<string, unknown>;
  grading: { manual_scores: Record<string, number>; feedback: string | null };
  questions: Question[];
  student: { full_name: string | null; email: string | null } | null;
  exam: { title?: string } | null;
};

const MANUAL_TYPES = new Set(['essay', 'short_answer', 'fill_in_blank', 'fill_blank', 'coding_blocks']);

export default function WrittenAttemptReviewPage() {
  const { id, attemptId } = useParams<{ id: string; attemptId: string }>();
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [scores, setScores] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState('');
  const [moderationStatus, setModerationStatus] = useState<NonNullable<Attempt['moderation_status']>>('unreviewed');
  const [changeReason, setChangeReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const response = await fetch(`/api/exams/${id}/attempts/${attemptId}`, { cache: 'no-store' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(payload.error || 'Attempt could not be loaded.');
      setLoading(false);
      return;
    }
    const next = payload.data as Attempt;
    setAttempt(next);
    setScores(Object.fromEntries(Object.entries(next.grading?.manual_scores ?? {}).map(([questionId, score]) => [questionId, String(score)])));
    setFeedback(next.grading?.feedback ?? '');
    setModerationStatus(next.moderation_status ?? 'unreviewed');
    setChangeReason('');
    setError(null);
    setLoading(false);
  }, [attemptId, id]);

  useEffect(() => { void load(); }, [load]);

  const manualQuestions = useMemo(() => (
    attempt?.questions.filter(question => MANUAL_TYPES.has(String(question.question_type ?? '').toLowerCase())) ?? []
  ), [attempt]);
  const completedManual = manualQuestions.filter(question => scores[question.id] !== undefined && scores[question.id] !== '').length;

  const saveReview = async () => {
    setSaving(true);
    try {
      const numericScores = Object.fromEntries(Object.entries(scores)
        .filter(([, value]) => value !== '')
        .map(([questionId, value]) => [questionId, Number(value)]));
      const response = await fetch(`/api/exams/${id}/attempts/${attemptId}/grade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scores: numericScores,
          feedback: feedback || null,
          ...(typeof attempt?.grading_version === 'number' ? { expected_version: attempt.grading_version } : {}),
          moderation_status: moderationStatus,
          ...(changeReason.trim() ? { change_reason: changeReason.trim() } : {}),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Review could not be saved.');
      toast.success(payload.message || 'Review saved');
      await load();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Review could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex min-h-[60vh] items-center justify-center mobile-page-root"><div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>;
  if (error || !attempt) return <div className="mx-auto max-w-lg p-5 text-center text-sm text-destructive mobile-page-root">{error || 'Attempt not found.'}</div>;

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6 mobile-page-root">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link href={`/dashboard/exams/${id}`} className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground"><ArrowLeftIcon className="h-4 w-4" /> Exam workspace</Link>
          <h1 className="mt-3 text-2xl font-bold text-foreground">{attempt.exam?.title || 'Written exam review'}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{attempt.student?.full_name || 'Learner'} · {attempt.student?.email || 'No email'}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={attempt.status === 'graded' ? 'default' : 'secondary'}>{attempt.status === 'graded' ? 'Graded' : 'Needs review'}</Badge>
          {attempt.moderation_status === 'approved' && <Badge variant="outline" className="border-emerald-300 text-emerald-700 dark:text-emerald-300">Verified</Badge>}
          {(attempt.tab_switches ?? 0) > 0 && <Badge variant="destructive">{attempt.tab_switches} tab switch{attempt.tab_switches === 1 ? '' : 'es'}</Badge>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card><CardContent className="p-4"><p className="text-xs font-semibold uppercase text-muted-foreground">Current score</p><p className="mt-1 text-xl font-bold">{attempt.score ?? 0}/{attempt.total_points ?? 0}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs font-semibold uppercase text-muted-foreground">Percentage</p><p className="mt-1 text-xl font-bold">{Number(attempt.percentage ?? 0).toFixed(1)}%</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs font-semibold uppercase text-muted-foreground">Manual review</p><p className="mt-1 text-xl font-bold">{completedManual}/{manualQuestions.length}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs font-semibold uppercase text-muted-foreground">Submitted</p><p className="mt-1 text-sm font-bold">{attempt.submitted_at ? new Date(attempt.submitted_at).toLocaleString() : 'Not submitted'}</p></CardContent></Card>
      </div>

      <div className="space-y-3">
        {attempt.questions.map((question, index) => {
          const manual = MANUAL_TYPES.has(String(question.question_type ?? '').toLowerCase());
          const answer = attempt.answers?.[question.id];
          const maximum = Math.max(0, Number(question.points ?? 0));
          return (
            <Card key={question.id} className="border-border shadow-sm">
              <CardHeader className="flex-row items-start justify-between gap-3 space-y-0 p-4 pb-3">
                <div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Question {index + 1} · {String(question.question_type ?? 'question').replaceAll('_', ' ')}</p><CardTitle className="mt-2 text-base leading-relaxed">{question.question_text}</CardTitle></div>
                <Badge variant="outline">{maximum} pts</Badge>
              </CardHeader>
              <CardContent className="space-y-3 p-4 pt-0">
                <div className="rounded-xl bg-muted/60 p-3"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Learner answer</p><p className="mt-2 whitespace-pre-wrap text-sm text-foreground">{String(answer ?? 'No answer submitted')}</p></div>
                {!manual && <div className="flex items-start gap-2 text-sm text-muted-foreground"><CheckCircleIcon className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /><span>Automatically checked against the approved answer: <strong className="text-foreground">{String(question.correct_answer ?? 'Not set')}</strong></span></div>}
                {manual && (
                  <label className="block max-w-xs text-sm font-semibold text-foreground">
                    Score for this response
                    <div className="mt-2 flex items-center gap-2">
                      <input type="number" min={0} max={maximum} step="0.5" value={scores[question.id] ?? ''} onChange={event => setScores(previous => ({ ...previous, [question.id]: event.target.value }))} className="w-28 rounded-xl border border-input bg-background px-3 py-2 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" aria-label={`Score question ${index + 1} out of ${maximum}`} />
                      <span className="text-muted-foreground">/ {maximum}</span>
                    </div>
                  </label>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="border-border shadow-sm">
        <CardHeader><CardTitle className="text-lg">Reviewer feedback</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <textarea value={feedback} onChange={event => setFeedback(event.target.value)} maxLength={5000} className="min-h-32 w-full rounded-xl border border-input bg-background p-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" placeholder="Give concise, constructive feedback the learner can act on." />
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-semibold text-foreground">
              Review state
              <select value={moderationStatus} onChange={event => setModerationStatus(event.target.value as NonNullable<Attempt['moderation_status']>)} className="mt-2 min-h-11 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20">
                <option value="unreviewed">Marked — no second review</option>
                <option value="reviewed">Reviewed</option>
                <option value="approved" disabled={completedManual < manualQuestions.length}>Verified and approved</option>
                <option value="returned">Needs correction</option>
              </select>
              <span className="mt-1 block text-xs font-normal text-muted-foreground">Optional quality control; normal marking remains available.</span>
            </label>
            <label className="text-sm font-semibold text-foreground">
              Change note <span className="font-normal text-muted-foreground">(optional)</span>
              <input value={changeReason} onChange={event => setChangeReason(event.target.value)} maxLength={500} className="mt-2 min-h-11 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" placeholder={attempt.status === 'graded' ? 'Why this result is being corrected' : 'Note for the review trail'} />
              <span className="mt-1 block text-xs font-normal text-muted-foreground">Visible in the staff audit trail, not the learner result.</span>
            </label>
          </div>
          {completedManual < manualQuestions.length && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
              <ClockIcon className="mt-0.5 h-4 w-4 shrink-0" /> Progress can be saved now. The result publishes only after all {manualQuestions.length} written responses have a score, including zero where appropriate.
            </div>
          )}
          {manualQuestions.length === 0 && <div className="flex items-start gap-2 rounded-xl border border-border bg-muted/50 p-3 text-sm text-muted-foreground"><ExclamationTriangleIcon className="mt-0.5 h-4 w-4" /> This paper contains no manually graded questions.</div>}
          <Button onClick={() => void saveReview()} disabled={saving || manualQuestions.length === 0} className="min-h-11 w-full sm:w-auto">
            {saving ? 'Saving review…' : completedManual === manualQuestions.length ? (attempt.status === 'graded' ? 'Save grade correction' : 'Complete marking') : 'Save review progress'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
