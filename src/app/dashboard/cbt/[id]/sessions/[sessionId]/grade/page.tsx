// @refresh reset
'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import {
    ArrowLeftIcon, UserCircleIcon, ClockIcon,
    CheckCircleIcon, XCircleIcon, CloudArrowUpIcon, SparklesIcon, BookOpenIcon,
    AcademicCapIcon, ChartBarIcon
} from '@/lib/icons';
import { roleHasCapability } from '@/lib/auth/capabilities';
import { gradeCbtWithManualScores, isCbtAnswerCorrect, isManualCbtQuestion } from '@/lib/cbt/grading';
import { parseEssayAnswer } from '@/lib/cbt/essay-attachments';
import CbtMarkdown from '@/components/cbt/CbtMarkdown';
import ExamIllustrationCard from '@/components/cbt/ExamIllustrationCard';

export default function GradeSessionPage() {
    const params = useParams() as { id: string, sessionId: string };
    const router = useRouter();
    const { profile, loading: authLoading } = useAuth();

    // cbt_sessions now includes manual_scores and grading_notes, but the
    // generated Supabase type doesn't. we'll use `any` when reading the result
    const [session, setSession] = useState<any>(null);
    const [exam, setExam] = useState<any>(null);
    const [questions, setQuestions] = useState<any[]>([]);
    const [manualScores, setManualScores] = useState<Record<string, number | null>>({});
    const [gradingNotes, setGradingNotes] = useState('');
    const [moderationStatus, setModerationStatus] = useState<'unreviewed' | 'reviewed' | 'approved' | 'returned'>('unreviewed');
    const [changeReason, setChangeReason] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [aiDraft, setAiDraft] = useState<{ scores: Record<string, number>; feedback: string }>({
        scores: {},
        feedback: '',
    });

    useEffect(() => {
        if (authLoading || !profile) return;
        if (!roleHasCapability(profile.role, 'grade')) {
            router.push('/dashboard/cbt');
            return;
        }

        async function fetchData() {
            try {
                const [sessionJson, examJson, usersJson] = await Promise.all([
                    fetch(`/api/cbt/sessions/${params.sessionId}`, { cache: 'no-store' }).then(async r => {
                        const payload = await r.json();
                        if (!r.ok) throw new Error(payload.error || 'Session not found');
                        return payload;
                    }),
                    fetch(`/api/cbt/exams/${params.id}`, { cache: 'no-store' }).then(async r => {
                        const payload = await r.json();
                        if (!r.ok) throw new Error(payload.error || 'Exam not found');
                        return payload;
                    }),
                    fetch('/api/portal-users?role=student&scoped=true', { cache: 'no-store' }).then(r => r.json()).catch(() => ({ data: [] })),
                ]);

                // Enrich session with student info from API (bypasses RLS on portal_users)
                const umap: Record<string, any> = {};
                (usersJson.data ?? []).forEach((u: any) => { umap[u.id] = u; });
                const sess = { ...(sessionJson.data as any), portal_users: umap[(sessionJson.data as any)?.user_id] ?? null };
                const examData = examJson.data;
                setSession(sess);
                setExam(examData);
                setQuestions([...(examData?.cbt_questions ?? [])].sort((a: any, b: any) => (a.order_index ?? 0) - (b.order_index ?? 0)));
                setManualScores(sess?.manual_scores ?? {});
                setGradingNotes(sess?.grading_notes ?? '');
                setModerationStatus(sess?.moderation_status ?? 'unreviewed');
                setChangeReason('');
            } catch (e: any) {
                setError(e.message);
            } finally {
                setLoading(false);
            }
        }
        fetchData();
    }, [params.id, params.sessionId, authLoading, profile]);

    const [aiGrading, setAiGrading] = useState(false);

    const handleAiGrade = async () => {
        if (!questions.length || !session?.answers) return;
        setAiGrading(true);
        setError(null);
        try {
            const res = await fetch('/api/ai/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'cbt-grading',
                    topic: exam?.title || 'CBT Grading',
                    questions: questions.map(q => ({
                        id: q.id,
                        text: q.question_text,
                        type: q.question_type,
                        points: q.points,
                        correct_answer: q.correct_answer
                    })),
                    studentAnswers: session.answers
                })
            });

            const payload = await res.json();
            if (!res.ok) throw new Error(payload.error || 'AI Grading failed');

            const manualQuestionMap = new Map(
                questions.filter(isManualCbtQuestion).map(question => [question.id, question]),
            );
            const safeScores = Object.fromEntries(
                Object.entries(payload.data?.scores ?? {})
                    .filter(([questionId]) => manualQuestionMap.has(questionId))
                    .map(([questionId, value]) => {
                        const question = manualQuestionMap.get(questionId);
                        const maximum = Math.max(0, Number(question?.points ?? 0));
                        const numeric = Number(value);
                        return [questionId, Math.max(0, Math.min(maximum, Number.isFinite(numeric) ? numeric : 0))];
                    }),
            );
            setAiDraft({
                scores: safeScores,
                feedback: typeof payload.data?.feedback === 'string' ? payload.data.feedback.trim() : '',
            });
        } catch (e: any) {
            setError(`AI Grading Error: ${e.message}`);
        } finally {
            setAiGrading(false);
        }
    };

    const applyAiDraft = () => {
        setManualScores(previous => {
            const next = { ...previous };
            for (const [questionId, score] of Object.entries(aiDraft.scores)) {
                if (next[questionId] === undefined || next[questionId] === null) {
                    next[questionId] = score;
                }
            }
            return next;
        });
        if (aiDraft.feedback) {
            setGradingNotes(previous => previous.trim()
                ? `${previous.trim()}\n\nAI draft: ${aiDraft.feedback}`
                : aiDraft.feedback);
        }
        setAiDraft({ scores: {}, feedback: '' });
    };

    const handleSaveGrade = async () => {
        setSaving(true);
        setError(null);
        try {
            const db = createClient();
            const grade = gradeCbtWithManualScores(exam, questions, session.answers ?? {}, manualScores);
            if (grade.needsGrading) {
                setError('Score every written response before finalizing this grade. A zero must be entered explicitly.');
                return;
            }

            const gradeRes = await fetch(`/api/cbt/sessions/${params.sessionId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    manual_scores: grade.manualScores,
                    grading_notes: gradingNotes,
                    moderation_status: moderationStatus,
                    ...(changeReason.trim() ? { change_reason: changeReason.trim() } : {}),
                    ...(typeof session.grading_version === 'number'
                        ? { expected_version: session.grading_version }
                        : {}),
                }),
            });
            const savedPayload = await gradeRes.json();
            if (!gradeRes.ok) {
                throw new Error(savedPayload.error || 'Grade could not be saved.');
            }

            // AUTO-ASSIGN CERTIFICATE IF PASSED
            const savedSession = Array.isArray(savedPayload.data) ? savedPayload.data[0] : savedPayload.data;
            if (savedSession?.status === 'passed' && session.user_id && exam.course_id) {
              try {
                const { data: existing } = await db.from('certificates').select('id').eq('portal_user_id', session.user_id).eq('course_id', exam.course_id).maybeSingle();
                if (!existing) {
                  await fetch('/api/certificates', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ studentId: session.user_id, courseId: exam.course_id })
                  });
                }
              } catch (certErr) {
                console.error('Auto-certificate issuance failed:', certErr);
              }
            }

            router.push(`/dashboard/cbt/${params.id}`);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setSaving(false);
        }
    };

    if (loading) return (
        <div className="min-h-screen bg-background flex items-center justify-center mobile-page-root">
            <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        </div>
    );

    if (error || !session) return (
        <div className="min-h-screen bg-background flex items-center justify-center text-foreground mobile-page-root">
            <div className="text-center">
                <XCircleIcon className="w-12 h-12 text-rose-600 dark:text-rose-400 mx-auto mb-4" />
                <p className="text-muted-foreground">{error || 'Session not found'}</p>
                <button onClick={() => router.back()} className="mt-4 text-emerald-600 dark:text-emerald-400 font-bold underline">Go Back</button>
            </div>
        </div>
    );

    const subjectiveQuestions = questions.filter(isManualCbtQuestion);

    return (
        <div className="min-h-screen bg-background text-foreground mobile-page-root">
            <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
                <button onClick={() => router.back()} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-all group">
                    <ArrowLeftIcon className="w-4 h-4 group-hover:-translate-x-1 transition-transform" /> Back to Exam Details
                </button>

                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                    <div className="space-y-2">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                                <BookOpenIcon className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                            </div>
                            <span className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-[0.2em]">{exam.title}</span>
                        </div>
                        <h1 className="text-3xl font-black tracking-tight">Grade assessment</h1>
                        <div className="flex items-center gap-4 text-xs font-bold text-muted-foreground">
                            <span className="flex items-center gap-2 px-3 py-1 bg-card shadow-sm rounded-full border border-border italic">
                                <UserCircleIcon className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" /> {session.portal_users?.full_name}
                            </span>
                            <span className="flex items-center gap-2 px-3 py-1 bg-card shadow-sm rounded-full border border-border italic">
                                <ClockIcon className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" /> {new Date(session.end_time).toLocaleDateString()} · {new Date(session.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                        </div>
                    </div>
                    
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
                        <button
                            onClick={handleAiGrade}
                            disabled={aiGrading || saving}
                            className="flex items-center justify-center gap-2 px-5 py-3 bg-primary/12 hover:bg-primary hover:text-primary-foreground border border-primary/35 text-primary font-black uppercase text-xs tracking-wider rounded-xl transition-all disabled:opacity-50 group"
                        >
                            {aiGrading ? <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <SparklesIcon className="w-4 h-4 group-hover:rotate-12 transition-transform" />}
                            {aiGrading ? 'Preparing draft…' : 'AI Grading Draft'}
                        </button>
                        <button
                            onClick={handleSaveGrade}
                            disabled={saving || aiGrading}
                            className="flex items-center justify-center gap-2 px-6 py-3 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white font-black uppercase text-xs tracking-wider rounded-xl transition-all shadow-lg shadow-emerald-900/25 group"
                        >
                            {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <CloudArrowUpIcon className="w-4 h-4 group-hover:scale-110 transition-transform" />}
                            {saving ? 'Saving…' : 'Finalize Grade'}
                        </button>
                    </div>
                </div>

                {Object.keys(aiDraft.scores).length > 0 && (
                    <div className="flex flex-col gap-4 rounded-2xl border border-primary/25 bg-primary/10 p-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <p className="text-sm font-bold text-foreground">AI grading draft ready</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                                {Object.keys(aiDraft.scores).length} written response suggestion{Object.keys(aiDraft.scores).length === 1 ? '' : 's'} prepared. Existing teacher-entered marks will not be replaced.
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={applyAiDraft}
                            className="flex-shrink-0 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground transition-opacity hover:opacity-90"
                        >
                            Fill unscored responses
                        </button>
                    </div>
                )}

                {/* Live Score Preview */}
                {(() => {
                   const preview = gradeCbtWithManualScores(exam, questions, session.answers ?? {}, manualScores);
                   const pct = preview.score;
                   const totalP = preview.totalPoints;
                   const total = preview.earnedPoints;
                   const complete = !preview.needsGrading;
                   const passes = complete && preview.status === 'passed';
                   const scoreTone = !complete
                     ? 'text-amber-600 dark:text-amber-400'
                     : passes
                       ? 'text-emerald-600 dark:text-emerald-400'
                       : 'text-rose-600 dark:text-rose-400';
                  return (
                    <div className="rounded-2xl bg-card border border-border p-5 sm:p-6 shadow-sm flex flex-col sm:flex-row items-center gap-5">
                      <div className="w-12 h-12 rounded-2xl bg-emerald-500/12 border border-emerald-500/25 flex items-center justify-center shrink-0">
                        <ChartBarIcon className="w-6 h-6 text-emerald-700 dark:text-emerald-400" />
                      </div>
                      <div className="flex-1 w-full">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Live Score Preview</p>
                          <span className={`text-2xl font-black tabular-nums ${scoreTone}`}>{pct}%</span>
                        </div>
                        <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden">
                          <div className={`h-full rounded-full transition-all duration-500 ${!complete ? 'bg-amber-500' : passes ? 'bg-emerald-600' : 'bg-rose-600'}`} style={{ width: `${Math.min(pct,100)}%` }} />
                        </div>
                        <div className="flex items-center justify-between mt-2 text-[10px] font-black uppercase tracking-wider">
                          <span className="text-muted-foreground">{total}/{totalP} pts · Pass: {exam?.passing_score ?? 70}%</span>
                          <span className={scoreTone}>{!complete ? 'Awaiting Marks' : passes ? 'Will Pass' : 'Will Fail'}</span>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Auto-graded questions summary */}
                {questions.filter(q => !isManualCbtQuestion(q)).length > 0 && (
                  <div className="rounded-2xl bg-card border border-border overflow-hidden shadow-sm">
                    <div className="px-5 py-3.5 border-b border-border bg-muted/25 flex items-center gap-2.5">
                      <AcademicCapIcon className="w-4 h-4 text-primary" />
                      <p className="text-[11px] font-black text-foreground uppercase tracking-widest">Auto-Graded Objective Questions</p>
                    </div>
                    <div className="divide-y divide-border">
                      {questions.filter(q => !isManualCbtQuestion(q)).map((q) => {
                        const studentAns = (session.answers?.[q.id] ?? '').trim();
                        const correctAns = (q.correct_answer ?? '').trim();
                        const isRight = isCbtAnswerCorrect(q, session.answers?.[q.id]);
                        return (
                          <div key={q.id} className="px-5 py-4 flex items-start gap-3.5">
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${isRight ? 'bg-emerald-500/15' : 'bg-rose-500/15'}`}>
                              {isRight ? <CheckCircleIcon className="w-4 h-4 text-emerald-700 dark:text-emerald-400" /> : <XCircleIcon className="w-4 h-4 text-rose-700 dark:text-rose-400" />}
                            </div>
                            <div className="flex-1 min-w-0 space-y-1.5">
                              <div className="text-sm font-semibold text-foreground leading-snug">
                                <CbtMarkdown text={String(q.question_text ?? '')} className="text-foreground" />
                              </div>
                              <ExamIllustrationCard question={q} compact />
                              <div className="flex flex-wrap gap-3 text-[11px] font-bold">
                                <span className="text-muted-foreground">Student: <span className={isRight ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}>{studentAns || '(no answer)'}</span></span>
                                {!isRight && <span className="text-muted-foreground">Correct: <span className="text-emerald-700 dark:text-emerald-400">{correctAns}</span></span>}
                              </div>
                            </div>
                            <span className={`text-sm font-black shrink-0 tabular-nums ${isRight ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground'}`}>
                              {isRight ? `+${q.points}` : '0'}/{q.points}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 gap-6">
                    {subjectiveQuestions.map((q, i) => {
                        const scoreWeight = (manualScores[q.id] || 0) / (q.points || 1);
                        const halfPts = Math.round((q.points || 1) / 2);
                        
                        return (
                            <div key={q.id} className="rounded-2xl bg-card border border-border overflow-hidden shadow-sm hover:border-emerald-500/35 transition-all">
                                <div className="p-5 sm:p-6 border-b border-border bg-muted/20 flex flex-col md:flex-row md:items-start justify-between gap-5">
                                    <div className="flex items-start gap-4 flex-1 min-w-0">
                                        <div className="w-11 h-11 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-base font-black text-emerald-800 dark:text-emerald-300 flex-shrink-0">
                                            {i + 1}
                                        </div>
                                        <div className="min-w-0 flex-1 space-y-2">
                                            <div className="text-base sm:text-lg font-bold text-foreground leading-snug">
                                                <CbtMarkdown text={String(q.question_text ?? '')} className="text-foreground" />
                                            </div>
                                            <ExamIllustrationCard question={q} compact />
                                            <div className="flex flex-wrap gap-2">
                                                <span className="px-2.5 py-0.5 rounded-full bg-card border border-border text-[10px] uppercase font-black tracking-wider text-muted-foreground">
                                                    {q.question_type.replace('_', ' ')}
                                                </span>
                                                <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/12 border border-emerald-500/25 text-[10px] uppercase font-black tracking-wider text-emerald-800 dark:text-emerald-300">
                                                    {q.points} Max Pts
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div className="flex flex-col items-center gap-2.5 p-3.5 bg-background rounded-2xl border border-border shrink-0">
                                        <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Awarded Marks</label>
                                        <div className="flex items-center gap-2">
                                            <button 
                                                type="button"
                                                aria-label={`Decrease score for question ${i + 1}`}
                                                onClick={() => setManualScores({ ...manualScores, [q.id]: Math.max(0, (manualScores[q.id] || 0) - 1) })}
                                                className="w-9 h-9 rounded-xl bg-card border border-border flex items-center justify-center hover:bg-rose-500/15 hover:border-rose-500/35 transition-all text-muted-foreground hover:text-rose-700 dark:hover:text-rose-400"
                                            >
                                                <XCircleIcon className="w-5 h-5" />
                                            </button>
                                            <input
                                                type="number"
                                                aria-label={`Awarded points for question ${i + 1}`}
                                                min="0"
                                                max={q.points}
                                                value={manualScores[q.id] ?? ''}
                                                placeholder="—"
                                                onChange={(e) => {
                                                    const val = Math.min(q.points, Math.max(0, Number(e.target.value)));
                                                    setManualScores({ ...manualScores, [q.id]: val });
                                                }}
                                                className="w-20 px-3 py-2 bg-emerald-500/10 border-2 border-emerald-500/40 rounded-xl text-center text-xl font-black text-emerald-800 dark:text-emerald-300 focus:outline-none focus:border-emerald-600 transition-all tabular-nums"
                                            />
                                            <button 
                                                type="button"
                                                aria-label={`Increase score for question ${i + 1}`}
                                                onClick={() => setManualScores({ ...manualScores, [q.id]: Math.min(q.points, (manualScores[q.id] || 0) + 1) })}
                                                className="w-9 h-9 rounded-xl bg-card border border-border flex items-center justify-center hover:bg-emerald-500/15 hover:border-emerald-500/35 transition-all text-muted-foreground hover:text-emerald-700 dark:hover:text-emerald-400"
                                            >
                                                <CheckCircleIcon className="w-5 h-5" />
                                            </button>
                                        </div>
                                        <div className="flex items-center gap-1.5 text-[10px]">
                                            <button type="button" onClick={() => setManualScores({ ...manualScores, [q.id]: 0 })} className="px-2 py-0.5 rounded-md border border-border bg-card hover:bg-muted font-black text-muted-foreground hover:text-foreground">0</button>
                                            <button type="button" onClick={() => setManualScores({ ...manualScores, [q.id]: halfPts })} className="px-2 py-0.5 rounded-md border border-border bg-card hover:bg-muted font-black text-muted-foreground hover:text-foreground">Half ({halfPts})</button>
                                            <button type="button" onClick={() => setManualScores({ ...manualScores, [q.id]: q.points })} className="px-2 py-0.5 rounded-md border border-emerald-500/35 bg-emerald-500/12 hover:bg-emerald-500/20 font-black text-emerald-800 dark:text-emerald-300">Full ({q.points})</button>
                                        </div>
                                        <div className="w-full bg-muted h-1.5 rounded-full overflow-hidden">
                                            <div 
                                                className="h-full bg-emerald-600 transition-all duration-300" 
                                                style={{ width: `${Math.min(100, scoreWeight * 100)}%` }} 
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="p-5 sm:p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
                                    <div className="space-y-3">
                                        <div className="flex items-center gap-2">
                                            <div className="w-6 h-6 rounded-lg bg-sky-500/15 border border-sky-500/30 flex items-center justify-center">
                                                <SparklesIcon className="w-3.5 h-3.5 text-sky-700 dark:text-sky-400" />
                                            </div>
                                            <p className="text-[10px] font-black uppercase tracking-widest text-sky-800 dark:text-sky-300">Student&apos;s Response</p>
                                        </div>
                                        <div className="p-4 sm:p-5 bg-muted/25 border border-border rounded-xl text-sm sm:text-base leading-relaxed text-foreground whitespace-pre-wrap font-medium">
                                                {q.question_type === 'coding_blocks' ? (
                                                    <div className="space-y-3">
                                                        <div className="flex flex-wrap items-center gap-2 leading-[2.5rem]">
                                                            {(q.metadata?.logic_sentence || "").split('[BLANK]').map((part: string, pi: number, arr: string[]) => (
                                                                <div key={pi} className="contents">
                                                                    <span className="text-muted-foreground">{part}</span>
                                                                    {pi < arr.length - 1 && (
                                                                        <span className="px-3 py-1 bg-emerald-500/20 border border-emerald-500/30 rounded-xl text-emerald-600 dark:text-emerald-400 font-black italic shadow-sm">
                                                                            {(session.answers[q.id] || "").split(',')[pi]?.trim() || "???"}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            ))}
                                                        </div>
                                                        <div className="flex items-center gap-2 mt-2 px-3 py-1.5 bg-card shadow-sm rounded-xl border border-border w-fit">
                                                            <div className={`w-2 h-2 rounded-full ${isCbtAnswerCorrect(q, session.answers?.[q.id]) ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]"}`} />
                                                            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground italic">
                                                                {isCbtAnswerCorrect(q, session.answers?.[q.id]) ? "Sequence Matched" : "Sequence Mismatch"}
                                                            </span>
                                                        </div>
                                                    </div>
                                                ) : (() => {
                                                    const parsed = parseEssayAnswer(session.answers?.[q.id]);
                                                    if (!parsed.text.trim() && parsed.attachments.length === 0) {
                                                        return '(No response provided by student)';
                                                    }
                                                    return (
                                                        <div className="space-y-4 not-italic">
                                                            {parsed.text.trim() ? (
                                                                <p className="whitespace-pre-wrap text-foreground font-medium">{parsed.text}</p>
                                                            ) : null}
                                                            {parsed.attachments.length > 0 && (
                                                                <div className="space-y-2 pt-2 border-t border-border/60">
                                                                    <p className="text-[10px] font-black uppercase tracking-widest text-primary">
                                                                        Attached Student Work ({parsed.attachments.length})
                                                                    </p>
                                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                                        {parsed.attachments.map((att) => (
                                                                            <a
                                                                                key={att.url}
                                                                                href={att.url}
                                                                                target="_blank"
                                                                                rel="noreferrer"
                                                                                className="block overflow-hidden rounded-xl border border-border bg-card hover:border-primary/50 transition-colors"
                                                                            >
                                                                                {att.isImage ? (
                                                                                    <img
                                                                                        src={att.url}
                                                                                        alt={att.name}
                                                                                        className="w-full max-h-56 object-contain bg-muted/40"
                                                                                    />
                                                                                ) : (
                                                                                    <div className="p-4 text-center text-xs font-bold text-primary">
                                                                                        Open PDF: {att.name}
                                                                                    </div>
                                                                                )}
                                                                                <div className="px-3 py-1.5 text-[11px] font-semibold text-muted-foreground truncate border-t border-border/60">
                                                                                    {att.name} · Click to open full size
                                                                                </div>
                                                                            </a>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })()}
                                            </div>
                                        </div>

                                        {q.correct_answer && (
                                            <div className="space-y-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-6 h-6 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                                                        <CheckCircleIcon className="w-3.5 h-3.5" />
                                                    </div>
                                                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-600/60 dark:text-emerald-400/60">Scoring Rubric / Answer Key</p>
                                                </div>
                                                <div className="p-6 bg-emerald-500/[0.03] border border-emerald-500/10 rounded-xl text-sm leading-relaxed text-emerald-700/70 dark:text-emerald-300/70 italic relative overflow-hidden group/rubric">
                                                    <div className="absolute top-0 right-0 p-3 opacity-10">
                                                        <BookOpenIcon className="w-12 h-12" />
                                                    </div>
                                                    {q.correct_answer}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                        );
                    })}

                    <div className="bg-card border border-border rounded-2xl p-5 sm:p-6 shadow-sm space-y-5">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center">
                                <SparklesIcon className="w-6 h-6 text-amber-600 dark:text-amber-400" />
                            </div>
                            <div>
                                <h3 className="font-black italic text-xl">Feedback & Notes</h3>
                                <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-black">Personalized Student Mentorship</p>
                            </div>
                        </div>
                        <textarea
                            value={gradingNotes}
                            onChange={(e) => setGradingNotes(e.target.value)}
                            placeholder="Provide constructive feedback for the student's growth..."
                            rows={5}
                            className="w-full px-6 py-5 bg-card shadow-sm border border-border rounded-[2rem] text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-emerald-500 transition-all resize-none shadow-inner"
                        />
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <label className="block">
                                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Review status (optional)</span>
                                <select
                                    value={moderationStatus}
                                    onChange={(event) => setModerationStatus(event.target.value as typeof moderationStatus)}
                                    className="mt-2 min-h-11 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                                >
                                    <option value="unreviewed">Normal teacher marking</option>
                                    <option value="reviewed">Checked</option>
                                    <option value="approved">Approved</option>
                                    <option value="returned">Changes requested</option>
                                </select>
                            </label>
                            <label className="block">
                                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Correction note (optional)</span>
                                <input
                                    value={changeReason}
                                    onChange={(event) => setChangeReason(event.target.value)}
                                    maxLength={500}
                                    placeholder={session.score != null ? 'Why was this mark changed?' : 'Add context for the activity trail'}
                                    className="mt-2 min-h-11 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20"
                                />
                            </label>
                        </div>
                        <p className="text-xs text-muted-foreground">Quality review is optional. Normal marking remains available, and every correction keeps its version and activity context.</p>
                        <div className="flex items-center gap-2 px-4 py-2 bg-amber-500/10 rounded-xl border border-amber-500/20 w-fit">
                            <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                            <p className="text-[10px] text-amber-600 dark:text-amber-400 font-bold italic tracking-tighter">Student will view these remarks on their dashboard</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
