// @refresh reset
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import {
  ClockIcon, CheckCircleIcon, XCircleIcon, ChevronLeftIcon, ChevronRightIcon
} from '@/lib/icons';
import CbtMarkdown from '@/components/cbt/CbtMarkdown';
import { isObjectiveQuestion, normalizeCbtOptions } from '@/lib/cbt/print-utils';

function CodingBlocksChallenge({
  question,
  value,
  onChange
}: {
  question: any,
  value: string,
  onChange: (val: string) => void
}) {
  const sentence = question.metadata?.logic_sentence || "Logic: [BLANK]";
  const parts = sentence.split('[BLANK]');
  const blocks = question.metadata?.logic_blocks || [];

  const currentAnswers = value ? value.split(',').map(s => s.trim()) : [];

  const updateAt = (idx: number, newVal: string) => {
    const newAns = [...currentAnswers];
    for (let i = 0; i < parts.length - 1; i++) {
      if (newAns[i] === undefined) newAns[i] = '';
    }
    newAns[idx] = newVal;
    onChange(newAns.slice(0, parts.length - 1).join(', '));
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="p-4 sm:p-6 bg-muted/30 border border-border rounded-2xl sm:rounded-[2rem] flex flex-wrap items-center gap-x-2 sm:gap-x-3 gap-y-3 sm:gap-y-4 leading-9 sm:leading-[3rem]">
        {parts.map((p: string, pi: number) => (
          <div key={pi} className="contents">
            <span className="text-sm sm:text-lg font-medium text-muted-foreground break-words">{p}</span>
            {pi < parts.length - 1 && (
              <div className="inline-flex min-w-[72px] sm:min-w-[100px] min-h-9 sm:h-10 bg-emerald-500/10 border-2 border-emerald-500/30 rounded-xl px-3 sm:px-4 text-xs sm:text-sm font-black text-emerald-600 dark:text-emerald-400 items-center justify-center italic shadow-[0_0_20px_rgba(16,185,129,0.1)] break-words">
                {currentAnswers[pi] || "???"}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        {blocks.map((block: string, bi: number) => (
          <button
            key={bi}
            type="button"
            onClick={() => {
              const firstEmpty = currentAnswers.findIndex((a, i) => i < parts.length - 1 && !a);
              const targetIdx = firstEmpty === -1 ? 0 : firstEmpty;
              if (targetIdx < parts.length - 1) updateAt(targetIdx, block);
            }}
          className="px-4 sm:px-5 py-2.5 sm:py-3 bg-card shadow-sm hover:bg-emerald-500/20 border border-border hover:border-emerald-500/30 rounded-xl text-xs sm:text-sm font-bold text-muted-foreground hover:text-emerald-600 dark:hover:text-emerald-400 transition-all active:scale-95 break-words"
          >
            {block}
          </button>
        ))}
        <button
          type="button"
          onClick={() => onChange('')}
          className="px-4 py-2.5 sm:py-3 bg-card shadow-sm hover:bg-rose-500/20 border border-border hover:border-rose-500/30 rounded-xl text-[10px] uppercase font-black text-muted-foreground hover:text-rose-600 dark:hover:text-rose-400 sm:ml-auto transition-all"
        >
          Clear Blocks
        </button>
      </div>
    </div>
  );
}

export default function TakeExamPage() {
  const params = useParams() as { id?: string };
  const router = useRouter();
  const { profile, loading: authLoading } = useAuth();
  const [exam, setExam] = useState<any>(null);
  const [questions, setQuestions] = useState<any[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [current, setCurrent] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [result, setResult] = useState<{ score: number; passed: boolean; correct: number; status: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [examError, setExamError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const startTimeRef = useRef<Date>(new Date());
  const submitRef = useRef<any>(null);

  useEffect(() => {
    if (authLoading || !profile) return;
    if (profile.role !== 'student') { router.push('/dashboard/cbt'); return; }
    const id = params?.id as string;
    if (!id) return;
    const finalStatuses = new Set(['completed', 'passed', 'failed', 'pending_grading']);
    fetch(`/api/cbt/sessions?exam_id=${id}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(({ data: existing }) => {
        if (existing && finalStatuses.has(existing.status)) { router.push(`/dashboard/cbt/${id}`); return; }
        return fetch(`/api/cbt/exams/${id}`, { cache: 'no-store' })
          .then(async r => {
            const payload = await r.json();
            if (!r.ok) throw new Error(payload.error || 'This exam is not available.');
            return payload;
          })
          .then(async ({ data: examData }) => {
            if (!examData) { throw new Error('This exam is not available.'); }
            const session = existing ?? await fetch('/api/cbt/sessions', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'start', exam_id: id }),
            }).then(async r => {
              const payload = await r.json();
              if (!r.ok) throw new Error(payload.error || 'Unable to start this exam.');
              return payload.data;
            });
            const startedAt = session?.start_time ? new Date(session.start_time) : new Date();
            startTimeRef.current = startedAt;
            setSessionId(session?.id ?? null);
            if (session?.answers && typeof session.answers === 'object' && !Array.isArray(session.answers)) {
              setAnswers(session.answers);
            }
            setExam(examData);
            setQuestions([...(examData.cbt_questions ?? [])].sort((a: any, b: any) => (a.order_index ?? 0) - (b.order_index ?? 0)));
            const durationDeadline = startedAt.getTime() + (examData.duration_minutes ?? 60) * 60_000;
            const windowDeadline = examData.end_date ? new Date(examData.end_date).getTime() : Number.POSITIVE_INFINITY;
            const deadline = Math.min(durationDeadline, windowDeadline);
            setTimeLeft(Math.max(0, Math.floor((deadline - Date.now()) / 1000)));
            setLoading(false);
          });
      })
      .catch((e) => {
        setExamError(e?.message || 'Unable to open this exam.');
        setLoading(false);
      });
  }, [profile?.id, authLoading]); // eslint-disable-line

  const handleSubmit = useCallback(async (auto = false) => {
    if (submitting || submitted) return;
    if (!auto && !confirm('Submit exam? You cannot change answers after submission.')) return;
    setSubmitting(true);
    setExamError(null);
    try {
      const sessionRes = await fetch('/api/cbt/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          exam_id: exam.id,
          action: 'submit',
          answers,
          auto_submitted: auto,
        }),
      });
      if (!sessionRes.ok) {
        const j = await sessionRes.json();
        throw new Error(j.error || 'Failed to submit exam');
      }
      const { data: savedSession } = await sessionRes.json();

      setResult({
        score: savedSession?.score ?? 0,
        passed: !!savedSession?.passed,
        correct: savedSession?.correct ?? 0,
        status: savedSession?.status ?? 'completed',
      });
      setSubmitted(true);

      // Certificate is auto-issued by the database trigger on cbt_sessions INSERT.
      // No client-side call needed — and students are blocked from POST /api/certificates anyway.
    } catch (e: any) {
      setExamError(e?.message || 'Failed to submit exam.');
    } finally {
      setSubmitting(false);
    }
  }, [submitting, submitted, questions, answers, exam, profile]);

  useEffect(() => {
    submitRef.current = handleSubmit;
  }, [handleSubmit]);

  useEffect(() => {
    if (!sessionId || submitted || loading) return;
    const save = () => {
      fetch(`/api/cbt/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers }),
      }).catch(() => {
        // Autosave is best-effort; final submission still reports hard failures.
      });
    };
    const t = setInterval(save, 10_000);
    return () => clearInterval(t);
  }, [answers, loading, sessionId, submitted]);

  // Countdown timer
  useEffect(() => {
    if (loading || submitted || questions.length === 0) return;
    const t = setInterval(() => setTimeLeft(s => {
      if (s <= 1) { clearInterval(t); submitRef.current?.(true); return 0; }
      return s - 1;
    }), 1000);
    return () => clearInterval(t);
  }, [loading, submitted, questions.length]);

  const formatTime = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  if (authLoading || loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center mobile-page-root">
      <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (examError && !exam) return (
    <div className="min-h-screen bg-background flex items-center justify-center text-foreground mobile-page-root">
      <div className="text-center max-w-md px-6 pb-12">
        <XCircleIcon className="w-16 h-16 mx-auto text-amber-600 dark:text-amber-400 mb-4" />
        <h1 className="text-2xl font-bold">Exam Not Available</h1>
        <p className="text-muted-foreground mt-2">{examError}</p>
        <button onClick={() => router.push('/dashboard/cbt')} className="mt-6 px-6 py-2.5 bg-muted hover:bg-muted text-sm font-bold rounded-xl transition-colors">Return to CBT Centre</button>
      </div>
    </div>
  );

  if (!loading && questions.length === 0) return (
    <div className="min-h-screen bg-background flex items-center justify-center text-foreground mobile-page-root">
      <div className="text-center pb-12">
        <XCircleIcon className="w-16 h-16 mx-auto text-amber-600 dark:text-amber-400 mb-4" />
        <h1 className="text-2xl font-bold">No Questions Yet</h1>
        <p className="text-muted-foreground mt-2">This exam hasn't been configured with any questions.</p>
        <button onClick={() => router.push('/dashboard/cbt')} className="mt-6 px-6 py-2.5 bg-muted hover:bg-muted text-sm font-bold rounded-xl transition-colors">Return to CBT Centre</button>
      </div>
    </div>
  );

  if (submitted && result) {
    const isPending = result.status === 'pending_grading';

    return (
      <div className="min-h-screen bg-background flex items-center justify-center text-foreground p-6 relative overflow-hidden mobile-page-root">
        {/* Animated Background Accents */}
        <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-emerald-500/10 blur-[120px] rounded-full animate-pulse" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/10 blur-[120px] rounded-full animate-pulse delay-700" />

        <div className="max-w-xl w-full relative z-10">
          <div className="bg-card/80 backdrop-blur-3xl border border-border rounded-[2.5rem] p-12 shadow-2xl space-y-8 text-center">
            <div className={`w-32 h-32 mx-auto rounded-[2rem] flex items-center justify-center border-2 rotate-3 transition-transform hover:rotate-0 duration-500 ${isPending ? 'border-amber-500/50 bg-amber-500/10' : (result.passed ? 'border-emerald-500/50 bg-emerald-500/10' : 'border-rose-500/50 bg-rose-500/10')}`}>
              {isPending ? <ClockIcon className="w-16 h-16 text-amber-600 dark:text-amber-400" /> : (result.passed ? <CheckCircleIcon className="w-16 h-16 text-emerald-600 dark:text-emerald-400" /> : <XCircleIcon className="w-16 h-16 text-rose-600 dark:text-rose-400" />)}
            </div>

            <div className="space-y-2">
              <h1 className={`text-5xl font-black italic tracking-tighter ${isPending ? 'text-amber-600 dark:text-amber-400' : (result.passed ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400')}`}>
                {isPending ? 'SUBMITTED' : (result.passed ? 'EXCELLENT' : 'COMPLETE')}
              </h1>
              <p className="text-muted-foreground font-medium tracking-widest uppercase text-xs">
                {exam?.title}
              </p>
            </div>

            {isPending ? (
              <div className="bg-card shadow-sm border border-border rounded-xl p-8 space-y-4">
                <p className="text-lg text-muted-foreground font-medium leading-relaxed">
                  Your objective answers have been recorded. Subjective answers are awaiting instructor review.
                </p>
                <div className="flex justify-between items-end">
                  <span className="text-muted-foreground text-xs font-black uppercase tracking-widest">
                    Current Auto Score
                  </span>
                  <span className="text-4xl font-black text-amber-600 dark:text-amber-400">{result.score}%</span>
                </div>
                <div className="flex flex-col gap-2">
                  <span className="px-4 py-2 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[10px] font-black uppercase tracking-widest border border-amber-500/20 w-fit mx-auto">
                    Awaiting Manual Evaluation
                  </span>
                  <p className="text-sm text-muted-foreground italic">
                    Essays & Subjective answers are being reviewed by your instructor.
                  </p>
                </div>
              </div>
            ) : (
              <div className="bg-card shadow-sm border border-border rounded-xl p-8 space-y-6">
                <div className="space-y-2">
                  <div className="flex justify-between items-end">
                    <span className="text-muted-foreground text-xs font-black uppercase tracking-widest">
                      Final Grade
                    </span>
                    <span className={`text-4xl font-black ${result.passed ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>{result.score}%</span>
                  </div>
                  <div className="w-full h-4 bg-card shadow-sm rounded-full overflow-hidden border border-border p-0.5">
                    <div className={`h-full rounded-full transition-all duration-1000 ease-out ${result.passed ? 'bg-gradient-to-r from-primary to-primary from-primary to-primary' : 'bg-gradient-to-r from-rose-600 to-rose-400'}`}
                      style={{ width: `${Math.min(result.score, 100)}%` }} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-card shadow-sm rounded-xl p-4 border border-border">
                    <p className="text-[10px] text-muted-foreground font-black uppercase mb-1">Status</p>
                    <p className="text-sm font-bold">{result.passed ? 'PASSED' : 'FAILED'}</p>
                  </div>
                  <div className="bg-card shadow-sm rounded-xl p-4 border border-border">
                    <p className="text-[10px] text-muted-foreground font-black uppercase mb-1">Requirement</p>
                    <p className="text-xl font-bold text-muted-foreground">{exam?.passing_score ?? 70}%</p>
                  </div>
                </div>
              </div>
            )}

            <button onClick={() => router.push('/dashboard/cbt')}
              className="group relative w-full py-4 bg-gradient-to-r from-border to-border hover:from-border hover:to-border border border-border text-foreground font-black uppercase tracking-widest text-xs rounded-xl transition-all overflow-hidden">
              <span className="relative z-10">Return to CBT Center</span>
              <div className="absolute inset-0 bg-card shadow-sm translate-x-[-100%] group-hover:translate-x-0 transition-transform duration-500" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  const q = questions[current];
  const progress = ((current + 1) / questions.length) * 100;
  const answered = questions.filter((question) => String(answers[question.id] ?? '').trim().length > 0).length;
  const mcqOptions = q ? normalizeCbtOptions(q.options, q.question_type) : [];
  const showMcq = q && isObjectiveQuestion(q) && mcqOptions.length > 0 && q.question_type !== 'true_false';

  return (
    <div className={"min-h-screen bg-background text-foreground flex flex-col font-sans selection:bg-emerald-500/30 pb-[calc(var(--app-bottom-nav-height)+9.5rem)] md:pb-0 mobile-page-root"}>
      {/* Cinematic Header */}
      <div className="sticky top-0 z-50 bg-background/90 backdrop-blur-2xl border-b border-border px-3 sm:px-6 py-3 sm:py-4">
        <div className="max-w-5xl mx-auto flex items-start sm:items-center justify-between gap-3 sm:gap-8">
          <div className="flex-1 min-w-0 flex items-center gap-3 sm:gap-6">
            <div className="min-w-0 flex-1 sm:flex-shrink-0">
              <div className="text-[9px] sm:text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-[0.16em] sm:tracking-[0.2em] mb-1">Live Examination</div>
              <h2 className="text-xs sm:text-sm font-bold text-muted-foreground truncate max-w-[56vw] sm:max-w-md">{exam?.title}</h2>
            </div>
            <div className="hidden sm:flex flex-1 items-center gap-3">
              <div className="flex-1 h-1 bg-card shadow-sm rounded-full overflow-hidden max-w-[120px]">
                <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${progress}%` }} />
              </div>
              <span className="text-[10px] font-black text-muted-foreground tracking-tighter uppercase">{current + 1} of {questions.length}</span>
            </div>
          </div>

          <div className={`flex items-center gap-2 sm:gap-3 px-3 sm:px-5 py-2 sm:py-2.5 rounded-xl border transition-all duration-500 flex-shrink-0 ${timeLeft < 120 ? 'bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400 animate-pulse' : 'bg-muted/30 border-border text-muted-foreground'}`}>
            <ClockIcon className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${timeLeft < 120 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600/50 dark:text-emerald-400/50'}`} />
            <span className="text-sm sm:text-lg font-black tracking-widest leading-none">{formatTime(timeLeft)}</span>
          </div>
        </div>
        {examError && (
          <div className="max-w-5xl mx-auto mt-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-xs font-bold text-rose-600 dark:text-rose-400">
            {examError}
          </div>
        )}
      </div>

      {/* Main Examination Canvas */}
      <div className="flex-1 flex flex-col items-stretch sm:items-center justify-start sm:justify-center px-3 sm:px-6 py-4 sm:py-6 relative overflow-hidden">
        {/* Subtle Ambient Glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80%] h-[80%] bg-emerald-500/[0.02] blur-[150px] rounded-full pointer-events-none" />

        <div className="max-w-4xl w-full space-y-5 sm:space-y-8 relative z-10 py-4 sm:py-12">
          <div className="space-y-5 sm:space-y-8 min-h-[auto] sm:min-h-[400px]">
            <div className="space-y-3 sm:space-y-4">
              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                <span className="px-3 py-1 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-black text-emerald-600 dark:text-emerald-400 tracking-widest uppercase">Question {current + 1}</span>
                <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">{q?.points} Points</span>
                <span className="sm:hidden text-[10px] text-muted-foreground font-bold uppercase tracking-widest ml-auto">{current + 1}/{questions.length}</span>
              </div>
              <div className="text-lg sm:text-3xl font-bold text-foreground leading-snug sm:leading-tight break-words">
                <CbtMarkdown text={q?.question_text ?? ''} />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:gap-4 pt-2 sm:pt-4">
              {showMcq && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  {mcqOptions.map((opt: string, oi: number) => (
                    <button key={oi} type="button"
                      onClick={() => setAnswers(a => ({ ...a, [q.id]: opt }))}
                      className={`group relative flex items-start gap-3 sm:gap-5 p-4 sm:p-5 rounded-2xl sm:rounded-[1.5rem] border-2 transition-all duration-300 text-left ${answers[q.id] === opt
                        ? 'bg-emerald-500/10 border-emerald-500/50 sm:scale-[1.02]'
                        : 'bg-muted/20 border-border hover:bg-muted hover:border-border'
                        }`}>
                      <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-xl border-2 flex items-center justify-center text-xs font-black transition-all flex-shrink-0 ${answers[q.id] === opt ? 'bg-emerald-500 border-emerald-500 text-foreground sm:rotate-6' : 'bg-card shadow-sm border-border text-muted-foreground'}`}>
                        {String.fromCharCode(65 + oi)}
                      </div>
                      <div className={`text-sm sm:text-base font-medium transition-colors flex-1 min-w-0 break-words ${answers[q.id] === opt ? 'text-foreground' : 'text-muted-foreground group-hover:text-muted-foreground'}`}>
                        <CbtMarkdown text={opt} className="text-sm sm:text-base" />
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {q?.question_type === 'true_false' && (
                <div className="grid grid-cols-2 gap-3 sm:gap-6">
                  {['True', 'False'].map(val => (
                    <button key={val} type="button"
                      onClick={() => setAnswers(a => ({ ...a, [q.id]: val }))}
                      className={`h-24 sm:h-32 rounded-2xl sm:rounded-[2rem] border-2 flex flex-col items-center justify-center gap-2 sm:gap-3 transition-all duration-300 ${answers[q.id] === val
                        ? 'bg-emerald-500/10 border-emerald-500/50 sm:scale-[1.05]'
                        : 'bg-muted/20 border-border hover:bg-muted'
                        }`}>
                      <div className={`w-3 h-3 rounded-full transition-all ${answers[q.id] === val ? 'bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.5)]' : 'bg-muted'}`} />
                      <span className={`text-base sm:text-xl font-black italic tracking-tighter uppercase transition-all ${answers[q.id] === val ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}`}>
                        {val}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {(q?.question_type === 'fill_blank' || q?.question_type === 'essay') && (
                <div className="relative group">
                  <div className="absolute inset-0 bg-emerald-500/5 blur-2xl rounded-[2rem] opacity-0 group-focus-within:opacity-100 transition-opacity" />
                  <textarea
                    rows={q.question_type === 'essay' ? 8 : 3}
                    value={answers[q?.id] ?? ''}
                    onChange={e => setAnswers(a => ({ ...a, [q.id]: e.target.value }))}
                    placeholder={q.question_type === 'essay' ? 'Compose your comprehensive response here…' : 'Provide the specific answer…'}
                    className="relative w-full px-4 sm:px-8 py-4 sm:py-6 bg-muted/20 border-2 border-border rounded-2xl sm:rounded-[2rem] text-base sm:text-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-emerald-500/50 focus:bg-muted/30 transition-all resize-y shadow-2xl"
                  />
                </div>
              )}

              {q?.question_type === 'coding_blocks' && (
                <CodingBlocksChallenge
                  question={q}
                  value={answers[q.id] ?? ''}
                  onChange={(val) => setAnswers(a => ({ ...a, [q.id]: val }))}
                />
              )}
            </div>
          </div>

          {/* Navigation Controls — desktop inline; mobile uses fixed bar below */}
          <div className="hidden sm:flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 sm:gap-4 pt-6 sm:pt-12 border-t border-border">
            <button onClick={() => setCurrent(c => Math.max(0, c - 1))} disabled={current === 0}
              className="group flex items-center justify-center sm:justify-start gap-3 px-4 sm:px-6 py-3 text-xs sm:text-sm font-bold text-muted-foreground hover:text-foreground transition-all disabled:opacity-40 disabled:pointer-events-none order-2 sm:order-1">
              <ChevronLeftIcon className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
              <span className="uppercase tracking-widest italic">Previous</span>
            </button>

            <div className="flex-1 flex justify-center order-1 sm:order-2">
              <div className="w-full sm:w-auto bg-card shadow-sm border border-border rounded-2xl sm:rounded-full px-3 sm:px-4 py-2 flex items-center justify-center gap-3 sm:gap-4">
                <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">{answered} Submitted</span>
                <div className="w-1 h-1 bg-muted rounded-full" />
                <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">{questions.length - answered} Remaining</span>
              </div>
            </div>

            {current < questions.length - 1 ? (
              <button onClick={() => setCurrent(c => Math.min(questions.length - 1, c + 1))}
                className="group flex items-center justify-center sm:justify-end gap-3 px-4 sm:px-6 py-3 text-xs sm:text-sm font-bold text-muted-foreground hover:text-foreground transition-all order-3">
                <span className="uppercase tracking-widest italic">Proceed</span>
                <ChevronRightIcon className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </button>
            ) : (
              <button onClick={() => handleSubmit(false)} disabled={submitting}
                className="relative group overflow-hidden px-6 sm:px-10 py-4 bg-emerald-600 hover:bg-emerald-500 text-foreground font-black uppercase tracking-[0.16em] sm:tracking-[0.2em] italic text-xs rounded-xl transition-all shadow-xl shadow-emerald-900/40 disabled:opacity-50 order-3">
                <span className="relative z-10">{submitting ? 'Finalizing…' : 'Complete Exam'}</span>
                <div className="absolute inset-0 bg-muted translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Mobile exam controls + jump grid — fixed above app dock */}
      <div className="md:hidden fixed inset-x-0 bottom-[var(--app-bottom-nav-height)] z-[55] border-t border-border bg-background/95 backdrop-blur-md shadow-[0_-8px_24px_rgba(0,0,0,0.1)]">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border/60">
          <button
            type="button"
            onClick={() => setCurrent(c => Math.max(0, c - 1))}
            disabled={current === 0}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-border bg-card disabled:opacity-30"
            aria-label="Previous question"
          >
            <ChevronLeftIcon className="w-5 h-5" />
          </button>
          <div className="min-w-0 flex-1 text-center">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              Question {current + 1} / {questions.length}
            </p>
            <p className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
              {answered} answered · {questions.length - answered} left
            </p>
          </div>
          {current < questions.length - 1 ? (
            <button
              type="button"
              onClick={() => setCurrent(c => Math.min(questions.length - 1, c + 1))}
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-border bg-card"
              aria-label="Next question"
            >
              <ChevronRightIcon className="w-5 h-5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => handleSubmit(false)}
              disabled={submitting}
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-emerald-600 px-4 text-[10px] font-black uppercase tracking-wider text-white disabled:opacity-50"
            >
              {submitting ? '…' : 'Submit'}
            </button>
          )}
        </div>
        <div className="px-3 py-2.5">
          <p className="mb-1.5 text-[9px] font-black uppercase tracking-widest text-muted-foreground">Jump to</p>
          <div className="flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {questions.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setCurrent(i)}
                className={`h-9 w-9 shrink-0 rounded-lg text-xs font-black transition-all ${
                  i === current
                    ? 'bg-emerald-500 text-white shadow-md'
                    : answers[questions[i]?.id]
                      ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                      : 'bg-muted/30 text-muted-foreground border border-border'
                }`}
              >
                {i + 1}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Desktop question grid footer */}
      <div className="hidden md:block bg-background/90 backdrop-blur-xl border-t border-border px-3 sm:px-6 py-3 sm:py-6">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6">
          <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest flex-shrink-0">Jump To</span>
          <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
            {questions.map((_, i) => (
              <button key={i} onClick={() => setCurrent(i)}
                className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl text-xs font-black transition-all duration-300 flex-shrink-0 ${i === current
                  ? 'bg-emerald-500 text-white shadow-[0_0_20px_rgba(16,185,129,0.4)] sm:scale-110'
                  : answers[questions[i]?.id]
                    ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                    : 'bg-muted/30 text-muted-foreground border border-border hover:border-emerald-500/30'
                  }`}>
                {i + 1}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
