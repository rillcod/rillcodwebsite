'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import {
  ClockIcon, CheckCircleIcon, XCircleIcon, ChevronLeftIcon, ChevronRightIcon,
} from '@heroicons/react/24/outline';

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
  const [result, setResult] = useState<{ score: number; passed: boolean; correct: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const startTimeRef = useRef<Date>(new Date());
  const submitRef = useRef<any>(null);

  useEffect(() => {
    if (authLoading || !profile) return;
    if (profile.role !== 'student') { router.push('/dashboard/cbt'); return; }
    const id = params?.id as string;
    if (!id) return;
    const db = createClient();
    // Check if already attempted
    db.from('cbt_sessions').select('id').eq('exam_id', id).eq('user_id', profile.id).maybeSingle()
      .then(({ data: existing }) => {
        if (existing) { router.push(`/dashboard/cbt/${id}`); return; }
        Promise.all([
          db.from('cbt_exams').select('*').eq('id', id).single(),
          db.from('cbt_questions').select('*').eq('exam_id', id).order('order_index'),
        ]).then(([examRes, qRes]) => {
          setExam(examRes.data);
          setQuestions(qRes.data ?? []);
          setTimeLeft((examRes.data?.duration_minutes ?? 60) * 60);
          setLoading(false);
        });
      });
  }, [profile?.id, authLoading]); // eslint-disable-line

  const handleSubmit = useCallback(async (auto = false) => {
    if (submitting || submitted) return;
    if (!auto && !confirm('Submit exam? You cannot change answers after submission.')) return;
    setSubmitting(true);
    try {
      // Calculate score for auto-gradable questions
      let correct = 0;
      let manualGradingRequired = false;

      questions.forEach(q => {
        if (q.question_type === 'essay' || q.question_type === 'fill_blank') {
          manualGradingRequired = true;
        }

        if ((answers[q.id] ?? '').trim().toLowerCase() === (q.correct_answer ?? '').trim().toLowerCase()) {
          if (q.question_type !== 'essay') { // Essays never auto-match unless maybe it's a perfect string, but we want manual review anyway
            correct++;
          }
        }
      });

      const totalPoints = questions.reduce((s, q) => s + (q.points ?? 0), 0);
      const earnedPoints = questions.reduce((s, q) => {
        if (q.question_type === 'essay' || q.question_type === 'fill_blank') return s; // These will be added later
        if ((answers[q.id] ?? '').trim().toLowerCase() === (q.correct_answer ?? '').trim().toLowerCase()) {
          return s + (q.points ?? 0);
        }
        return s;
      }, 0);

      const score = totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 0;
      const passed = score >= (exam?.passing_score ?? 70);
      const finalStatus = manualGradingRequired ? 'pending_grading' : (passed ? 'passed' : 'failed');

      await createClient().from('cbt_sessions').insert({
        exam_id: exam.id,
        user_id: profile!.id,
        start_time: startTimeRef.current.toISOString(),
        end_time: new Date().toISOString(),
        score,
        status: finalStatus,
        answers,
        needs_grading: manualGradingRequired,
      });

      setResult({ score, passed, correct: manualGradingRequired ? -1 : correct });
      setSubmitted(true);
    } finally {
      setSubmitting(false);
    }
  }, [submitting, submitted, questions, answers, exam, profile]);

  useEffect(() => {
    submitRef.current = handleSubmit;
  }, [handleSubmit]);

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
    <div className="min-h-screen bg-[#0f0f1a] flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!loading && questions.length === 0) return (
    <div className="min-h-screen bg-[#0f0f1a] flex items-center justify-center text-white">
      <div className="text-center pb-12">
        <XCircleIcon className="w-16 h-16 mx-auto text-amber-400 mb-4" />
        <h1 className="text-2xl font-bold">No Questions Yet</h1>
        <p className="text-white/40 mt-2">This exam hasn't been configured with any questions.</p>
        <button onClick={() => router.push('/dashboard/cbt')} className="mt-6 px-6 py-2.5 bg-white/10 hover:bg-white/20 text-sm font-bold rounded-xl transition-colors">Return to CBT Centre</button>
      </div>
    </div>
  );

  if (submitted && result) {
    const isPending = result.correct === -1; // Flag from handleSubmit

    return (
      <div className="min-h-screen bg-[#0f0f1a] flex items-center justify-center text-white p-4">
        <div className="max-w-md w-full text-center space-y-6">
          <div className={`w-24 h-24 mx-auto rounded-full flex items-center justify-center border-4 ${isPending ? 'border-amber-500 bg-amber-500/10' : (result.passed ? 'border-emerald-500 bg-emerald-500/10' : 'border-rose-500 bg-rose-500/10')}`}>
            {isPending ? <ClockIcon className="w-12 h-12 text-amber-400" /> : (result.passed ? <CheckCircleIcon className="w-12 h-12 text-emerald-400" /> : <XCircleIcon className="w-12 h-12 text-rose-400" />)}
          </div>
          <div>
            <h1 className={`text-4xl font-extrabold ${isPending ? 'text-amber-400' : (result.passed ? 'text-emerald-400' : 'text-rose-400')}`}>
              {isPending ? 'Submitted!' : (result.passed ? 'Passed!' : 'Not Passed')}
            </h1>
            <p className="text-white/40 mt-2">{exam?.title}</p>
          </div>
          {isPending ? (
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
              <p className="text-sm text-white/70 leading-relaxed">
                Your exam contains questions that require manual evaluation by your instructor (Essays/Fill-in-the-blanks).
              </p>
              <p className="text-xs text-white/40 mt-3 font-medium uppercase tracking-widest">
                Final score will be updated soon.
              </p>
            </div>
          ) : (
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-white/40">Your Score</span>
                <span className="font-bold text-2xl">{result.score}%</span>
              </div>
              <div className="w-full h-3 bg-white/10 rounded-full">
                <div className={`h-3 rounded-full ${result.passed ? 'bg-emerald-500' : 'bg-rose-500'}`}
                  style={{ width: `${Math.min(result.score, 100)}%` }} />
              </div>
              <div className="flex justify-between text-xs text-white/30">
                <span>{result.correct}/{questions.length} correct</span>
                <span>{exam?.passing_score ?? 70}% required to pass</span>
              </div>
            </div>
          )}
          <button onClick={() => router.push('/dashboard/cbt')}
            className="w-full py-3 bg-white/10 hover:bg-white/20 text-white font-bold rounded-xl transition-colors">
            Back to CBT Centre
          </button>
        </div>
      </div>
    );
  }

  const q = questions[current];
  const progress = ((current + 1) / questions.length) * 100;
  const answered = Object.keys(answers).length;

  return (
    <div className="min-h-screen bg-[#0f0f1a] text-white flex flex-col">
      {/* Sticky header */}
      <div className="sticky top-0 z-10 bg-[#0f0f1a]/90 backdrop-blur border-b border-white/10 px-4 py-3">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-4">
          <div className="flex-1">
            <p className="text-xs text-white/40 truncate">{exam?.title}</p>
            <div className="flex items-center gap-2 mt-1">
              <div className="flex-1 h-1.5 bg-white/10 rounded-full max-w-48">
                <div className="h-1.5 bg-emerald-500 rounded-full transition-all" style={{ width: `${progress}%` }} />
              </div>
              <span className="text-xs text-white/40">{current + 1}/{questions.length}</span>
            </div>
          </div>
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-bold ${timeLeft < 120 ? 'bg-rose-500/20 text-rose-400 animate-pulse' : 'bg-white/5 text-white/60'}`}>
            <ClockIcon className="w-4 h-4" />
            {formatTime(timeLeft)}
          </div>
        </div>
      </div>

      {/* Question */}
      <div className="flex-1 max-w-3xl mx-auto w-full px-4 sm:px-6 py-8 space-y-6">
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">
          <div className="flex items-start gap-3">
            <span className="w-7 h-7 bg-emerald-500/20 border border-emerald-500/30 rounded-lg flex items-center justify-center text-xs font-bold text-emerald-400 flex-shrink-0 mt-0.5">
              {current + 1}
            </span>
            <p className="text-white font-medium leading-relaxed">{q?.question_text}</p>
          </div>

          {q?.question_type === 'multiple_choice' && Array.isArray(q.options) && (
            <div className="space-y-2 pl-10">
              {q.options.filter((o: string) => o.trim()).map((opt: string, oi: number) => (
                <button key={oi} type="button"
                  onClick={() => setAnswers(a => ({ ...a, [q.id]: opt }))}
                  className={`w-full text-left flex items-center gap-3 px-4 py-3 rounded-xl border transition-all ${answers[q.id] === opt
                    ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                    : 'bg-white/5 border-white/10 hover:bg-white/10 text-white/70'
                    }`}>
                  <span className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-bold flex-shrink-0 ${answers[q.id] === opt ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-white/30'}`}>
                    {String.fromCharCode(65 + oi)}
                  </span>
                  {opt}
                </button>
              ))}
            </div>
          )}

          {q?.question_type === 'true_false' && (
            <div className="flex gap-3 pl-10">
              {['True', 'False'].map(val => (
                <button key={val} type="button"
                  onClick={() => setAnswers(a => ({ ...a, [q.id]: val }))}
                  className={`flex-1 py-3 font-bold rounded-xl border transition-all ${answers[q.id] === val
                    ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                    : 'bg-white/5 border-white/10 hover:bg-white/10 text-white/70'
                    }`}>
                  {val}
                </button>
              ))}
            </div>
          )}

          {(q?.question_type === 'fill_blank' || q?.question_type === 'essay') && (
            <div className="pl-10">
              <textarea
                rows={q.question_type === 'essay' ? 5 : 2}
                value={answers[q?.id] ?? ''}
                onChange={e => setAnswers(a => ({ ...a, [q.id]: e.target.value }))}
                placeholder={q.question_type === 'essay' ? 'Write your answer…' : 'Fill in the blank…'}
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/25 focus:outline-none focus:border-emerald-500 transition-colors resize-none"
              />
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between">
          <button onClick={() => setCurrent(c => Math.max(0, c - 1))} disabled={current === 0}
            className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-bold text-white/50 bg-white/5 hover:bg-white/10 rounded-xl transition-colors disabled:opacity-30">
            <ChevronLeftIcon className="w-4 h-4" /> Previous
          </button>

          <div className="flex items-center gap-1 text-xs text-white/30">
            <span>{answered}/{questions.length} answered</span>
          </div>

          {current < questions.length - 1 ? (
            <button onClick={() => setCurrent(c => Math.min(questions.length - 1, c + 1))}
              className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-bold text-white/70 bg-white/5 hover:bg-white/10 rounded-xl transition-colors">
              Next <ChevronRightIcon className="w-4 h-4" />
            </button>
          ) : (
            <button onClick={() => handleSubmit(false)} disabled={submitting}
              className="flex items-center gap-1.5 px-5 py-2.5 text-sm font-bold bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl transition-colors disabled:opacity-50">
              {submitting ? 'Submitting…' : 'Submit Exam'}
            </button>
          )}
        </div>

        {/* Question map */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
          <p className="text-xs text-white/40 uppercase tracking-widest mb-3">Question Map</p>
          <div className="flex flex-wrap gap-2">
            {questions.map((_, i) => (
              <button key={i} onClick={() => setCurrent(i)}
                className={`w-8 h-8 rounded-lg text-xs font-bold transition-all ${i === current
                  ? 'bg-emerald-500 text-white'
                  : answers[questions[i]?.id]
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : 'bg-white/5 text-white/40 hover:bg-white/10'
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
