'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ExamInterface } from '@/components/exam/ExamInterface';
import { ArrowLeftIcon, ExclamationTriangleIcon } from '@/lib/icons';

type ExamSession = {
  attemptId: string;
  initialAnswers: Record<string, unknown>;
  remainingSeconds: number;
  exam: { id: string; title: string; duration_minutes: number };
  questions: Array<{
    id: string;
    question_text: string;
    question_type: string;
    points: number;
    options?: unknown;
  }>;
};

export default function TakeWrittenExamPage() {
  const { id } = useParams<{ id: string }>();
  const started = useRef(false);
  const [session, setSession] = useState<ExamSession | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id || started.current) return;
    started.current = true;
    void (async () => {
      try {
        const response = await fetch(`/api/exams/${id}/start`, { method: 'POST' });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || 'This exam could not be opened.');
        setSession(payload.data);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'This exam could not be opened.');
      }
    })();
  }, [id]);

  if (error) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-lg items-center p-4 mobile-page-root">
        <div className="w-full rounded-2xl border border-destructive/20 bg-card p-6 text-center shadow-sm">
          <ExclamationTriangleIcon className="mx-auto h-10 w-10 text-destructive" />
          <h1 className="mt-4 text-xl font-bold text-foreground">Exam unavailable</h1>
          <p className="mt-2 text-sm text-muted-foreground">{error}</p>
          <Link href="/dashboard/exams" className="mt-5 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
            <ArrowLeftIcon className="h-4 w-4" /> Back to written exams
          </Link>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center mobile-page-root" role="status" aria-label="Opening written exam">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <ExamInterface
      exam={session.exam}
      questions={session.questions}
      attemptId={session.attemptId}
      initialAnswers={session.initialAnswers}
      initialSeconds={session.remainingSeconds}
    />
  );
}
