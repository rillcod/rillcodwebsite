'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { AlertTriangle, CheckCircle, ChevronLeft, ChevronRight, Save, Timer } from 'lucide-react';
import { toast } from 'sonner';

interface Question {
  id: string;
  question_text: string;
  question_type: string;
  points: number;
  options?: unknown;
}

interface ExamProps {
  exam: { id: string; title: string; duration_minutes: number };
  questions: Question[];
  attemptId: string;
  initialAnswers?: Record<string, unknown>;
  initialSeconds?: number;
}

export function ExamInterface({
  exam,
  questions,
  attemptId,
  initialAnswers = {},
  initialSeconds,
}: ExamProps) {
  const router = useRouter();
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, unknown>>(initialAnswers);
  const [timeLeft, setTimeLeft] = useState(initialSeconds ?? exam.duration_minutes * 60);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [tabSwitches, setTabSwitches] = useState(0);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const submittedRef = useRef(false);

  const saveProgress = useCallback(async (currentAnswers: Record<string, unknown>, announce = false) => {
    setSaveState('saving');
    try {
      const response = await fetch(`/api/exams/${exam.id}/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attemptId, answers: currentAnswers }),
      });
      if (!response.ok) throw new Error('Save failed');
      setSaveState('saved');
      if (announce) toast.success('Progress saved');
      return true;
    } catch (error) {
      setSaveState('error');
      if (announce) toast.error('Progress could not be saved. Check your connection and try again.');
      console.error('Auto-save failed', error);
      return false;
    }
  }, [attemptId, exam.id]);

  const handleSubmit = useCallback(async () => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/exams/${exam.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attemptId, answers }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Submission failed.');
      toast.success('Exam submitted successfully');
      router.replace(`/dashboard/exams/${exam.id}/result/${attemptId}`);
    } catch (error) {
      submittedRef.current = false;
      toast.error(error instanceof Error ? error.message : 'Submission failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }, [answers, attemptId, exam.id, router]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!submittedRef.current && Object.keys(answers).length > 0) void saveProgress(answers);
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [answers, saveProgress]);

  useEffect(() => {
    if (timeLeft <= 0) {
      void handleSubmit();
      return;
    }
    const timer = window.setTimeout(() => setTimeLeft(previous => Math.max(0, previous - 1)), 1_000);
    return () => window.clearTimeout(timer);
  }, [handleSubmit, timeLeft]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'hidden' || submittedRef.current) return;
      setTabSwitches(count => count + 1);
      toast.warning('Leaving this exam tab is recorded.');
      void fetch(`/api/exams/${exam.id}/track-cheat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attemptId, type: 'tab_switch' }),
      });
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [attemptId, exam.id]);

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainder = seconds % 60;
    return `${hours > 0 ? `${hours}:` : ''}${minutes.toString().padStart(2, '0')}:${remainder.toString().padStart(2, '0')}`;
  };

  const currentQuestion = questions[currentQuestionIndex];
  const answeredCount = questions.filter(question => (
    Object.prototype.hasOwnProperty.call(answers, question.id)
      && String(answers[question.id] ?? '').trim() !== ''
  )).length;
  const progress = questions.length ? (answeredCount / questions.length) * 100 : 0;
  const options = Array.isArray(currentQuestion?.options)
    ? currentQuestion.options.filter((option): option is string => typeof option === 'string')
    : [];
  const answerValue = currentQuestion ? String(answers[currentQuestion.id] ?? '') : '';

  const setAnswer = (value: unknown) => {
    if (!currentQuestion) return;
    setAnswers(previous => ({ ...previous, [currentQuestion.id]: value }));
    setSaveState('idle');
  };

  const requestSubmit = () => {
    if (window.confirm(`Submit this exam now? You answered ${answeredCount} of ${questions.length} questions.`)) {
      void handleSubmit();
    }
  };

  if (!currentQuestion) return null;

  return (
    <div className="min-h-screen bg-muted/30 p-3 sm:p-6 mobile-page-root">
      <div className="mx-auto max-w-6xl space-y-4">
        <header className="sticky top-0 z-20 flex flex-col gap-3 rounded-2xl border border-border bg-card/95 p-4 shadow-sm backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold text-foreground sm:text-2xl">{exam.title}</h1>
            <p className="mt-1 text-xs text-muted-foreground">
              {answeredCount} of {questions.length} answered · Saved securely to your attempt
            </p>
          </div>
          <div className="flex items-center justify-between gap-2 sm:justify-end">
            <div className={`flex items-center gap-2 rounded-xl px-3 py-2 font-mono text-sm font-bold ${timeLeft < 300 ? 'bg-destructive/10 text-destructive' : 'bg-muted text-foreground'}`} aria-label={`${timeLeft} seconds remaining`}>
              <Timer className="h-4 w-4" /> {formatTime(timeLeft)}
            </div>
            <Button onClick={requestSubmit} disabled={isSubmitting} className="min-w-28">
              {isSubmitting ? 'Submitting…' : 'Submit exam'}
            </Button>
          </div>
        </header>

        <Progress value={progress} className="h-2" aria-label={`${Math.round(progress)} percent answered`} />

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_17rem]">
          <main className="space-y-4">
            <Card className="overflow-hidden border-border shadow-sm">
              <CardHeader className="flex-row items-center justify-between space-y-0 border-b border-border bg-muted/30 p-4">
                <Badge variant="secondary">Question {currentQuestionIndex + 1} of {questions.length}</Badge>
                <span className="text-sm font-semibold text-muted-foreground">{currentQuestion.points} point{currentQuestion.points === 1 ? '' : 's'}</span>
              </CardHeader>
              <CardContent className="min-h-[22rem] p-4 sm:p-7">
                <h2 className="mb-6 text-lg font-semibold leading-relaxed text-foreground sm:text-xl">{currentQuestion.question_text}</h2>

                {currentQuestion.question_type === 'multiple_choice' && (
                  <fieldset className="space-y-3">
                    <legend className="sr-only">Choose one answer</legend>
                    {options.map((option, index) => (
                      <label key={`${currentQuestion.id}-${index}`} className={`flex cursor-pointer items-center rounded-xl border p-3 transition-colors sm:p-4 ${answerValue === option ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'}`}>
                        <input type="radio" name={currentQuestion.id} checked={answerValue === option} onChange={() => setAnswer(option)} className="h-4 w-4 accent-primary" />
                        <span className="mx-3 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-bold">{String.fromCharCode(65 + index)}</span>
                        <span className="text-sm text-foreground sm:text-base">{option}</span>
                      </label>
                    ))}
                  </fieldset>
                )}

                {currentQuestion.question_type === 'true_false' && (
                  <div className="grid grid-cols-2 gap-3">
                    {['True', 'False'].map(option => (
                      <Button key={option} type="button" variant={answerValue.toLowerCase() === option.toLowerCase() ? 'default' : 'outline'} className="h-14 text-base" onClick={() => setAnswer(option)}>
                        {option}
                      </Button>
                    ))}
                  </div>
                )}

                {!['multiple_choice', 'true_false'].includes(currentQuestion.question_type) && (
                  <textarea
                    className="min-h-52 w-full resize-y rounded-xl border border-input bg-background p-4 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                    placeholder={currentQuestion.question_type === 'essay' ? 'Write your response…' : 'Enter your answer…'}
                    value={answerValue}
                    onChange={event => setAnswer(event.target.value)}
                  />
                )}
              </CardContent>
            </Card>

            <div className="flex items-center justify-between gap-2 rounded-2xl border border-border bg-card p-3 shadow-sm">
              <Button variant="ghost" onClick={() => setCurrentQuestionIndex(index => Math.max(0, index - 1))} disabled={currentQuestionIndex === 0}>
                <ChevronLeft className="mr-1 h-4 w-4" /> Previous
              </Button>
              <Button variant="outline" onClick={() => void saveProgress(answers, true)} disabled={saveState === 'saving'} className="hidden sm:inline-flex">
                <Save className="mr-1 h-4 w-4" /> {saveState === 'saving' ? 'Saving…' : 'Save'}
              </Button>
              <Button onClick={() => setCurrentQuestionIndex(index => Math.min(questions.length - 1, index + 1))} disabled={currentQuestionIndex === questions.length - 1}>
                Next <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </main>

          <aside className="space-y-4">
            <Card className="border-border shadow-sm">
              <CardHeader className="p-4 pb-2 text-sm font-semibold">Question navigation</CardHeader>
              <CardContent className="grid grid-cols-6 gap-2 p-4 pt-2 sm:grid-cols-10 lg:grid-cols-5">
                {questions.map((question, index) => {
                  const answered = Object.prototype.hasOwnProperty.call(answers, question.id) && String(answers[question.id] ?? '').trim() !== '';
                  return (
                    <button key={question.id} onClick={() => setCurrentQuestionIndex(index)} aria-label={`Go to question ${index + 1}${answered ? ', answered' : ''}`} className={`h-10 rounded-lg text-sm font-bold transition-colors ${currentQuestionIndex === index ? 'bg-primary text-primary-foreground' : answered ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>
                      {index + 1}
                    </button>
                  );
                })}
              </CardContent>
            </Card>

            {saveState === 'error' && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Not saved</AlertTitle>
                <AlertDescription>Check your connection, then use Save before submitting.</AlertDescription>
              </Alert>
            )}

            {tabSwitches > 0 && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Exam activity recorded</AlertTitle>
                <AlertDescription>You left this tab {tabSwitches} time{tabSwitches === 1 ? '' : 's'}.</AlertDescription>
              </Alert>
            )}

            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-center dark:border-emerald-900 dark:bg-emerald-950/40">
              <CheckCircle className="mx-auto h-6 w-6 text-emerald-600" />
              <p className="mt-2 text-sm font-semibold text-emerald-900 dark:text-emerald-100">Auto-save is on</p>
              <p className="mt-1 text-xs text-emerald-800/70 dark:text-emerald-200/70">Your answers save every 30 seconds.</p>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
