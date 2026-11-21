'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import CbtMarkdown from '@/components/cbt/CbtMarkdown';
import {
  AlertTriangle,
  Bookmark,
  Check,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  Save,
  Timer,
  X,
} from 'lucide-react';
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
  const [flaggedIds, setFlaggedIds] = useState<Set<string>>(new Set());
  const [timeLeft, setTimeLeft] = useState(initialSeconds ?? exam.duration_minutes * 60);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [tabSwitches, setTabSwitches] = useState(0);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const submittedRef = useRef(false);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

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
    setReviewOpen(false);
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

  // Desktop keyboard navigation (Left / Right arrows when not inside an input/textarea)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'TEXTAREA' || tag === 'INPUT' || reviewOpen || drawerOpen) return;
      if (e.key === 'ArrowRight') {
        setCurrentQuestionIndex((i) => Math.min(questions.length - 1, i + 1));
      } else if (e.key === 'ArrowLeft') {
        setCurrentQuestionIndex((i) => Math.max(0, i - 1));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [questions.length, reviewOpen, drawerOpen]);

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainder = seconds % 60;
    return `${hours > 0 ? `${hours}:` : ''}${minutes.toString().padStart(2, '0')}:${remainder.toString().padStart(2, '0')}`;
  };

  const currentQuestion = questions[currentQuestionIndex];
  const isAnswered = (qId: string) =>
    Object.prototype.hasOwnProperty.call(answers, qId) && String(answers[qId] ?? '').trim() !== '';

  const answeredCount = questions.filter((q) => isAnswered(q.id)).length;
  const unansweredCount = Math.max(0, questions.length - answeredCount);
  const progress = questions.length ? (answeredCount / questions.length) * 100 : 0;
  const options = Array.isArray(currentQuestion?.options)
    ? currentQuestion.options.filter((option): option is string => typeof option === 'string')
    : [];
  const answerValue = currentQuestion ? String(answers[currentQuestion.id] ?? '') : '';
  const isFlagged = currentQuestion ? flaggedIds.has(currentQuestion.id) : false;
  const isLastQuestion = currentQuestionIndex === questions.length - 1;

  const setAnswer = (value: unknown) => {
    if (!currentQuestion) return;
    setAnswers(previous => ({ ...previous, [currentQuestion.id]: value }));
    setSaveState('idle');
  };

  const toggleFlag = () => {
    if (!currentQuestion) return;
    setFlaggedIds((prev) => {
      const next = new Set(prev);
      if (next.has(currentQuestion.id)) next.delete(currentQuestion.id);
      else next.add(currentQuestion.id);
      return next;
    });
  };

  if (!currentQuestion) return null;

  return (
    <div
      className="min-h-screen bg-muted/30 pb-24 lg:pb-8"
      onTouchStart={(e) => {
        if (e.touches.length !== 1) return;
        touchStartX.current = e.touches[0].clientX;
        touchStartY.current = e.touches[0].clientY;
      }}
      onTouchEnd={(e) => {
        if (touchStartX.current === null || touchStartY.current === null) return;
        const dx = e.changedTouches[0].clientX - touchStartX.current;
        const dy = e.changedTouches[0].clientY - touchStartY.current;
        touchStartX.current = null;
        touchStartY.current = null;
        if (Math.abs(dx) > 64 && Math.abs(dx) > Math.abs(dy) * 1.4) {
          if (dx < 0 && currentQuestionIndex < questions.length - 1) {
            setCurrentQuestionIndex((i) => i + 1);
          } else if (dx > 0 && currentQuestionIndex > 0) {
            setCurrentQuestionIndex((i) => i - 1);
          }
        }
      }}
    >
      {/* Distraction-Free Sticky Top Exam Bar (iPhone safe-area ready) */}
      <header className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur pt-[env(safe-area-inset-top)] shadow-sm">
        <div className="mx-auto max-w-6xl px-3.5 sm:px-6 py-2.5 sm:py-3">
          <div className="flex items-center justify-between gap-2.5">
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-sm sm:text-lg font-black text-foreground">{exam.title}</h1>
              <p className="text-[11px] text-muted-foreground font-medium">
                {answeredCount}/{questions.length} answered
                {flaggedIds.size > 0 ? ` · ${flaggedIds.size} flagged` : ''}
                {saveState === 'saved' ? ' · Saved' : saveState === 'saving' ? ' · Saving…' : ''}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <div
                className={`inline-flex items-center gap-1.5 rounded-xl px-2.5 sm:px-3 py-1.5 sm:py-2 font-mono text-xs sm:text-sm font-black tabular-nums ${
                  timeLeft < 300
                    ? 'bg-destructive/15 text-destructive animate-pulse border border-destructive/30'
                    : 'bg-muted text-foreground border border-border'
                }`}
                aria-label={`${timeLeft} seconds remaining`}
              >
                <Timer className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
                {formatTime(timeLeft)}
              </div>
              <Button
                size="sm"
                onClick={() => setReviewOpen(true)}
                disabled={isSubmitting}
                className="min-h-9 sm:min-h-10 px-3 sm:px-4 text-xs font-black"
              >
                {isSubmitting ? 'Submitting…' : 'Submit'}
              </Button>
            </div>
          </div>
          <Progress value={progress} className="mt-2 h-1.5" aria-label={`${Math.round(progress)} percent answered`} />
        </div>
      </header>

      {/* Main Responsive Exam Workspace */}
      <div className="mx-auto max-w-6xl px-3.5 sm:px-6 pt-4 sm:pt-6">
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <main className="space-y-4">
            <Card className="overflow-hidden border-border shadow-sm rounded-2xl">
              <CardHeader className="flex-row items-center justify-between gap-2 space-y-0 border-b border-border bg-muted/30 px-4 py-3 sm:px-6">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="font-black text-xs">
                    Q {currentQuestionIndex + 1} / {questions.length}
                  </Badge>
                  <span className="text-xs font-bold text-muted-foreground">
                    {currentQuestion.points} pt{currentQuestion.points === 1 ? '' : 's'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={toggleFlag}
                  aria-pressed={isFlagged}
                  className={`inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-bold transition-colors ${
                    isFlagged
                      ? 'border-amber-500/45 bg-amber-500/15 text-amber-800 dark:text-amber-200'
                      : 'border-border bg-card text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Bookmark className={`h-3.5 w-3.5 ${isFlagged ? 'fill-current' : ''}`} />
                  {isFlagged ? 'Flagged' : 'Flag'}
                </button>
              </CardHeader>

              <CardContent className="min-h-[20rem] p-4 sm:p-7 space-y-5">
                <div className="text-base sm:text-lg font-semibold leading-relaxed text-foreground">
                  <CbtMarkdown text={currentQuestion.question_text} />
                </div>

                {currentQuestion.question_type === 'multiple_choice' && (
                  <fieldset className="space-y-2.5">
                    <legend className="sr-only">Choose one answer</legend>
                    {options.map((option, index) => {
                      const selected = answerValue === option;
                      return (
                        <label
                          key={`${currentQuestion.id}-${index}`}
                          className={`flex min-h-[3.25rem] cursor-pointer items-center gap-3 rounded-xl border p-3.5 transition-all active:scale-[0.99] ${
                            selected
                              ? 'border-primary bg-primary/10 shadow-sm ring-1 ring-primary/30'
                              : 'border-border bg-card hover:border-primary/40 hover:bg-muted/40'
                          }`}
                        >
                          <input
                            type="radio"
                            name={currentQuestion.id}
                            checked={selected}
                            onChange={() => setAnswer(option)}
                            className="sr-only"
                          />
                          <span
                            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-black transition-colors ${
                              selected
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-muted text-muted-foreground'
                            }`}
                          >
                            {selected ? <Check className="h-4 w-4" /> : String.fromCharCode(65 + index)}
                          </span>
                          <span className="flex-1 text-base sm:text-[15px] leading-snug text-foreground break-words">
                            {option}
                          </span>
                        </label>
                      );
                    })}
                  </fieldset>
                )}

                {currentQuestion.question_type === 'true_false' && (
                  <div className="grid grid-cols-2 gap-3">
                    {['True', 'False'].map(option => {
                      const selected = answerValue.toLowerCase() === option.toLowerCase();
                      return (
                        <button
                          key={option}
                          type="button"
                          onClick={() => setAnswer(option)}
                          className={`min-h-14 rounded-xl border text-base font-black transition-all active:scale-[0.99] ${
                            selected
                              ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                              : 'border-border bg-card text-foreground hover:border-primary/40'
                          }`}
                        >
                          {option}
                        </button>
                      );
                    })}
                  </div>
                )}

                {!['multiple_choice', 'true_false'].includes(currentQuestion.question_type) && (
                  <div className="space-y-1.5">
                    <textarea
                      aria-label={`Your response for question ${currentQuestionIndex + 1}`}
                      className="min-h-52 w-full resize-y rounded-xl border border-input bg-background p-4 text-base sm:text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                      placeholder={currentQuestion.question_type === 'essay' ? 'Write your detailed response here…' : 'Type your answer here…'}
                      value={answerValue}
                      onChange={event => setAnswer(event.target.value)}
                    />
                    <p className="text-right text-[11px] text-muted-foreground tabular-nums">
                      {answerValue.trim() ? `${answerValue.trim().split(/\s+/).length} words` : 'No response yet'}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Desktop Footer Navigation */}
            <div className="hidden lg:flex items-center justify-between gap-2 rounded-2xl border border-border bg-card p-3 shadow-sm">
              <Button variant="ghost" onClick={() => setCurrentQuestionIndex(index => Math.max(0, index - 1))} disabled={currentQuestionIndex === 0}>
                <ChevronLeft className="mr-1 h-4 w-4" /> Previous
              </Button>
              <Button variant="outline" onClick={() => void saveProgress(answers, true)} disabled={saveState === 'saving'}>
                <Save className="mr-1 h-4 w-4" /> {saveState === 'saving' ? 'Saving…' : 'Save Progress'}
              </Button>
              {isLastQuestion ? (
                <Button onClick={() => setReviewOpen(true)} disabled={isSubmitting}>
                  Review &amp; Submit
                </Button>
              ) : (
                <Button onClick={() => setCurrentQuestionIndex(index => Math.min(questions.length - 1, index + 1))}>
                  Next <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              )}
            </div>
          </main>

          {/* Desktop Sticky Sidebar Navigator */}
          <aside className="hidden lg:block space-y-4">
            <div className="sticky top-24 space-y-4">
              <Card className="border-border shadow-sm rounded-2xl">
                <CardHeader className="p-4 pb-2 flex-row items-center justify-between space-y-0">
                  <span className="text-sm font-black text-foreground">Questions</span>
                  <span className="text-xs font-bold text-muted-foreground">{answeredCount}/{questions.length}</span>
                </CardHeader>
                <CardContent className="grid grid-cols-5 gap-2 p-4 pt-2">
                  {questions.map((question, index) => {
                    const answered = isAnswered(question.id);
                    const flagged = flaggedIds.has(question.id);
                    return (
                      <button
                        key={question.id}
                        type="button"
                        onClick={() => setCurrentQuestionIndex(index)}
                        aria-label={`Go to question ${index + 1}${answered ? ', answered' : ''}${flagged ? ', flagged' : ''}`}
                        className={`relative h-10 rounded-xl text-xs font-black transition-all ${
                          currentQuestionIndex === index
                            ? 'bg-primary text-primary-foreground shadow-sm'
                            : answered
                              ? 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-200 border border-emerald-500/30'
                              : 'bg-muted text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {index + 1}
                        {flagged && (
                          <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-amber-500 ring-2 ring-card" />
                        )}
                      </button>
                    );
                  })}
                </CardContent>
              </Card>

              {saveState === 'error' && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Not saved</AlertTitle>
                  <AlertDescription>Check your connection, then click Save Progress.</AlertDescription>
                </Alert>
              )}

              {tabSwitches > 0 && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Exam activity recorded</AlertTitle>
                  <AlertDescription>You left this tab {tabSwitches} time{tabSwitches === 1 ? '' : 's'}.</AlertDescription>
                </Alert>
              )}

              <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-center">
                <CheckCircle className="mx-auto h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                <p className="mt-1.5 text-xs font-black text-emerald-900 dark:text-emerald-100">Auto-save active</p>
                <p className="mt-0.5 text-[11px] text-emerald-800/80 dark:text-emerald-200/80">Answers save automatically every 30s.</p>
              </div>
            </div>
          </aside>
        </div>
      </div>

      {/* Mobile / iPhone Single-Row Compact Bottom Dock (safe-area aware) */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 backdrop-blur px-3 py-2.5 pb-[max(0.65rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(0,0,0,0.08)] lg:hidden">
        <div className="mx-auto flex max-w-lg items-center justify-between gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentQuestionIndex((i) => Math.max(0, i - 1))}
            disabled={currentQuestionIndex === 0}
            className="min-h-11 px-3 text-xs font-black"
          >
            <ChevronLeft className="h-4 w-4 mr-0.5" /> Prev
          </Button>
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-border bg-background px-3 text-xs font-black text-foreground"
          >
            <LayoutGrid className="h-4 w-4 text-primary" />
            Q {currentQuestionIndex + 1}/{questions.length}
            {flaggedIds.size > 0 ? <span className="ml-1 rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[10px] text-amber-800 dark:text-amber-200">{flaggedIds.size}</span> : null}
          </button>
          {isLastQuestion ? (
            <Button size="sm" onClick={() => setReviewOpen(true)} disabled={isSubmitting} className="min-h-11 px-3.5 text-xs font-black">
              Finish
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={() => setCurrentQuestionIndex((i) => Math.min(questions.length - 1, i + 1))}
              className="min-h-11 px-3.5 text-xs font-black"
            >
              Next <ChevronRight className="h-4 w-4 ml-0.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Mobile Slide-Up Question Navigator Drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/50 backdrop-blur-xs lg:hidden" onClick={() => setDrawerOpen(false)}>
          <div
            className="w-full max-h-[75vh] overflow-y-auto rounded-t-3xl border-t border-border bg-card p-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] space-y-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-black text-foreground">Jump to Question</h2>
                <p className="text-xs text-muted-foreground">{answeredCount} answered · {unansweredCount} left · {flaggedIds.size} flagged</p>
              </div>
              <button type="button" aria-label="Close question navigator" onClick={() => setDrawerOpen(false)} className="rounded-xl p-2 hover:bg-muted">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="grid grid-cols-6 gap-2">
              {questions.map((question, index) => {
                const answered = isAnswered(question.id);
                const flagged = flaggedIds.has(question.id);
                return (
                  <button
                    key={`m-${question.id}`}
                    type="button"
                    onClick={() => {
                      setCurrentQuestionIndex(index);
                      setDrawerOpen(false);
                    }}
                    className={`relative h-11 rounded-xl text-sm font-black ${
                      currentQuestionIndex === index
                        ? 'bg-primary text-primary-foreground'
                        : answered
                          ? 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-200 border border-emerald-500/30'
                          : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {index + 1}
                    {flagged && <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-amber-500 ring-2 ring-card" />}
                  </button>
                );
              })}
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1 min-h-11 font-bold" onClick={() => { void saveProgress(answers, true); setDrawerOpen(false); }}>
                <Save className="h-4 w-4 mr-1.5" /> Save Now
              </Button>
              <Button className="flex-1 min-h-11 font-black" onClick={() => { setDrawerOpen(false); setReviewOpen(true); }}>
                Review &amp; Submit
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Clean Review & Submit Confirmation Modal */}
      {reviewOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-xs p-4" onClick={() => setReviewOpen(false)}>
          <div className="w-full max-w-md rounded-3xl border border-border bg-card p-6 shadow-2xl space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="text-lg font-black text-foreground">Ready to submit?</h2>
                <p className="text-xs text-muted-foreground mt-0.5">{exam.title}</p>
              </div>
              <button type="button" aria-label="Close submit review" onClick={() => setReviewOpen(false)} className="rounded-xl p-1.5 hover:bg-muted">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-3">
                <p className="text-xl font-black text-emerald-700 dark:text-emerald-300 tabular-nums">{answeredCount}</p>
                <p className="text-[10px] font-bold uppercase text-muted-foreground">Answered</p>
              </div>
              <div className="rounded-2xl border border-border bg-muted/40 p-3">
                <p className="text-xl font-black text-foreground tabular-nums">{unansweredCount}</p>
                <p className="text-[10px] font-bold uppercase text-muted-foreground">Unanswered</p>
              </div>
              <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3">
                <p className="text-xl font-black text-amber-700 dark:text-amber-300 tabular-nums">{flaggedIds.size}</p>
                <p className="text-[10px] font-bold uppercase text-muted-foreground">Flagged</p>
              </div>
            </div>

            {unansweredCount > 0 && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200 space-y-1.5">
                <p className="font-bold">You still have {unansweredCount} unanswered question{unansweredCount === 1 ? '' : 's'}:</p>
                <div className="flex flex-wrap gap-1.5">
                  {questions.map((q, idx) => !isAnswered(q.id) ? (
                    <button
                      key={`unans-${q.id}`}
                      type="button"
                      onClick={() => { setCurrentQuestionIndex(idx); setReviewOpen(false); }}
                      className="rounded-lg border border-amber-500/40 bg-card px-2 py-0.5 text-[11px] font-black text-amber-900 dark:text-amber-200"
                    >
                      Q{idx + 1}
                    </button>
                  ) : null)}
                </div>
              </div>
            )}

            <div className="flex gap-2.5 pt-1">
              <Button variant="outline" className="flex-1 min-h-11 font-bold" onClick={() => setReviewOpen(false)} disabled={isSubmitting}>
                Keep Checking
              </Button>
              <Button className="flex-1 min-h-11 font-black" onClick={() => void handleSubmit()} disabled={isSubmitting}>
                {isSubmitting ? 'Submitting…' : 'Submit Exam'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
