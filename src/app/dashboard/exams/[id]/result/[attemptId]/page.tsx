'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeftIcon, CheckCircleIcon, ClockIcon, DocumentCheckIcon } from '@/lib/icons';

type Result = {
  id: string;
  attempt_number: number | null;
  status: string | null;
  score: number | null;
  total_points: number | null;
  percentage: number | null;
  submitted_at: string | null;
  feedback: string | null;
  exam: { title?: string; passing_score?: number | null } | null;
};

export default function WrittenExamResultPage() {
  const { id, attemptId } = useParams<{ id: string; attemptId: string }>();
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const response = await fetch(`/api/exams/${id}/attempts/${attemptId}`, { cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(payload.error || 'Result could not be loaded.');
        return;
      }
      setResult(payload.data);
    })();
  }, [attemptId, id]);

  if (!result && !error) {
    return <div className="flex min-h-[60vh] items-center justify-center mobile-page-root"><div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>;
  }

  if (error || !result) {
    return (
      <div className="mx-auto max-w-lg p-4 text-center mobile-page-root">
        <Card><CardContent className="p-6"><p className="text-sm text-destructive">{error || 'Result not found.'}</p><Link href="/dashboard/exams" className="mt-4 inline-flex text-sm font-semibold text-primary">Back to written exams</Link></CardContent></Card>
      </div>
    );
  }

  const pending = result.status !== 'graded';
  const passingScore = Number(result.exam?.passing_score ?? 50);
  const passed = !pending && Number(result.percentage ?? 0) >= passingScore;

  return (
    <div className="mx-auto max-w-2xl space-y-5 p-4 sm:p-6 mobile-page-root">
      <Link href="/dashboard/exams" className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="h-4 w-4" /> Written exams
      </Link>

      <Card className="overflow-hidden border-border shadow-sm">
        <CardHeader className="border-b border-border bg-muted/30 text-center">
          {pending ? <ClockIcon className="mx-auto h-10 w-10 text-amber-500" /> : <CheckCircleIcon className={`mx-auto h-10 w-10 ${passed ? 'text-emerald-600' : 'text-primary'}`} />}
          <CardTitle className="mt-3 text-2xl">{result.exam?.title || 'Written exam'}</CardTitle>
          <Badge variant={pending ? 'secondary' : 'default'} className="mx-auto mt-2">
            {pending ? 'Awaiting teacher review' : passed ? 'Passed' : 'Graded'}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-5 p-5 sm:p-7">
          {pending ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
              Your answers were submitted successfully. This paper includes written responses, so your final score will appear after an authorised reviewer completes marking.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-muted p-4 text-center"><p className="text-3xl font-bold text-foreground">{Number(result.percentage ?? 0).toFixed(1)}%</p><p className="mt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Final result</p></div>
              <div className="rounded-xl bg-muted p-4 text-center"><p className="text-3xl font-bold text-foreground">{result.score ?? 0}/{result.total_points ?? 0}</p><p className="mt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Points</p></div>
            </div>
          )}

          {result.feedback && (
            <div className="rounded-xl border border-border p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Reviewer feedback</p>
              <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">{result.feedback}</p>
            </div>
          )}

          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <DocumentCheckIcon className="h-4 w-4" /> Attempt {result.attempt_number ?? 1}
            {result.submitted_at && <span>Submitted {new Date(result.submitted_at).toLocaleString()}</span>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
