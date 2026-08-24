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

    const subjectiveQuestions = questions.filter(q => 
        q.question_type === 'essay' || 
        q.question_type === 'fill_blank' || 
        q.question_type === 'coding_blocks'
    );

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
                    
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                        <button
                            onClick={handleAiGrade}
                            disabled={aiGrading || saving}
                            className="flex items-center justify-center gap-2 px-6 py-4 bg-primary/20 hover:bg-primary border border-primary/50 text-primary hover:text-foreground font-black uppercase text-[10px] tracking-[0.2em] rounded-xl transition-all disabled:opacity-50 group"
                        >
                            {aiGrading ? <div className="w-4 h-4 border-2 border-border border-t-transparent rounded-full animate-spin" /> : <SparklesIcon className="w-4 h-4 group-hover:rotate-12 transition-transform" />}
                            {aiGrading ? 'Preparing draft...' : 'Generate AI draft'}
                        </button>
                        <button
                            onClick={handleSaveGrade}
                            disabled={saving || aiGrading}
                            className="flex items-center justify-center gap-3 px-8 py-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-foreground font-black uppercase text-[10px] tracking-[0.2em] rounded-xl transition-all shadow-2xl shadow-emerald-900/40 border border-emerald-400/20 group"
                        >
                            {saving ? <div className="w-5 h-5 border-2 border-border border-t-transparent rounded-full animate-spin" /> : <CloudArrowUpIcon className="w-4 h-4 group-hover:scale-125 transition-transform" />}
                            {saving ? 'Saving...' : 'Finalize Grade'}
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
                    <div className="rounded-2xl bg-white/[0.02] border border-white/10 p-6 flex flex-col sm:flex-row items-center gap-6">
                      <ChartBarIcon className="w-8 h-8 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <div className="flex-1 w-full">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-[9px] font-black text-muted-foreground uppercase tracking-[0.3em]">Live Score Preview</p>
                          <span className={`text-2xl font-black ${scoreTone}`}>{pct}%</span>
                        </div>
                        <div className="h-2 w-full bg-white/5 overflow-hidden">
                          <div className={`h-full transition-all duration-500 ${!complete ? 'bg-amber-500' : passes ? 'bg-emerald-500' : 'bg-rose-500'}`} style={{ width: `${Math.min(pct,100)}%` }} />
                        </div>
                        <div className="flex items-center justify-between mt-2 text-[9px] font-black uppercase tracking-widest">
                          <span className="text-muted-foreground">{total}/{totalP} pts · Pass: {exam?.passing_score ?? 70}%</span>
                          <span className={scoreTone}>{!complete ? 'AWAITING MARKS' : passes ? 'WILL PASS' : 'WILL FAIL'}</span>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Auto-graded questions summary */}
                {questions.filter(q => q.question_type !== 'essay' && q.question_type !== 'fill_blank' && q.question_type !== 'coding_blocks').length > 0 && (
                  <div className="bg-white/[0.02] border border-white/5 overflow-hidden">
                    <div className="px-6 py-4 border-b border-white/5 flex items-center gap-3">
                      <AcademicCapIcon className="w-4 h-4 text-primary" />
                      <p className="text-[10px] font-black text-primary uppercase tracking-[0.3em]">Auto-Graded Questions</p>
                    </div>
                    <div className="divide-y divide-white/5">
                      {questions.filter(q => q.question_type !== 'essay' && q.question_type !== 'fill_blank' && q.question_type !== 'coding_blocks').map((q, i) => {
                        const studentAns = (session.answers?.[q.id] ?? '').trim();
                        const correctAns = (q.correct_answer ?? '').trim();
                        const isRight = isCbtAnswerCorrect(q, session.answers?.[q.id]);
                        return (
                          <div key={q.id} className="px-6 py-4 flex items-start gap-4">
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${isRight ? 'bg-emerald-500/20' : 'bg-rose-500/20'}`}>
                              {isRight ? <CheckCircleIcon className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /> : <XCircleIcon className="w-4 h-4 text-rose-600 dark:text-rose-400" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-muted-foreground leading-snug">{q.question_text}</p>
                              <div className="flex flex-wrap gap-4 mt-1.5 text-[10px] font-black uppercase tracking-widest">
                                <span className="text-muted-foreground">Student: <span className={isRight ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>{studentAns || '(no answer)'}</span></span>
                                {!isRight && <span className="text-muted-foreground">Correct: <span className="text-emerald-600 dark:text-emerald-400">{correctAns}</span></span>}
                              </div>
                            </div>
                            <span className={`text-sm font-black shrink-0 ${isRight ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}`}>
                              {isRight ? `+${q.points}` : '0'}/{q.points}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 gap-10">
                    {subjectiveQuestions.map((q, i) => {
                        const studentAnswer = session.answers[q.id] || '(No response provided by student)';
                        const scoreWeight = (manualScores[q.id] || 0) / (q.points || 1);
                        
                        return (
                            <div key={q.id} className="relative group">
                                {/* Decorative line */}
                                <div className="absolute -left-4 top-0 bottom-0 w-[2px] bg-gradient-to-b from-primary to-primary/50 to-transparent group-hover:from-primary to-primary transition-all" />
                                
                                <div className="bg-white/[0.03] border border-border rounded-[2.5rem] overflow-hidden backdrop-blur-sm transition-all group-hover:bg-white/[0.05] group-hover:border-emerald-500/20">
                                    <div className="p-8 border-b border-border bg-gradient-to-r from-primary to-primary/[0.02] to-transparent flex flex-col md:flex-row md:items-center justify-between gap-6">
                                        <div className="flex items-start gap-6">
                                            <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-primary to-primary/20 to-teal-500/20 border border-emerald-500/30 flex items-center justify-center text-xl font-black text-emerald-600 dark:text-emerald-400 flex-shrink-0 shadow-lg shadow-emerald-900/40">
                                                {i + 1}
                                            </div>
                                            <div>
                                                <h3 className="text-xl font-bold text-foreground mb-2 leading-tight">{q.question_text}</h3>
                                                <div className="flex flex-wrap gap-2">
                                                    <span className="px-3 py-1 rounded-full bg-card shadow-sm border border-border text-[10px] uppercase font-black tracking-widest text-muted-foreground italic">
                                                        {q.question_type.replace('_', ' ')}
                                                    </span>
                                                    <span className="px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[10px] uppercase font-black tracking-widest text-emerald-600 dark:text-emerald-400 italic">
                                                        {q.points} Max Points
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                        
                                        <div className="flex flex-col items-center gap-3 p-4 bg-black/20 rounded-xl border border-border">
                                            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Awarded Points</label>
                                            <div className="flex items-center gap-3">
                                                <button 
                                                    type="button"
                                                    onClick={() => setManualScores({ ...manualScores, [q.id]: Math.max(0, (manualScores[q.id] || 0) - 1) })}
                                                    className="w-10 h-10 rounded-xl bg-card shadow-sm border border-border flex items-center justify-center hover:bg-rose-500/20 hover:border-rose-500/30 transition-all text-muted-foreground hover:text-rose-600 dark:hover:text-rose-400"
                                                >
                                                    <XCircleIcon className="w-5 h-5" />
                                                </button>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    max={q.points}
                                                    value={manualScores[q.id] ?? ''}
                                                    placeholder="—"
                                                    onChange={(e) => {
                                                        const val = Math.min(q.points, Math.max(0, Number(e.target.value)));
                                                        setManualScores({ ...manualScores, [q.id]: val });
                                                    }}
                                                    className="w-24 px-4 py-3 bg-emerald-500/10 border-2 border-emerald-500/40 rounded-xl text-center text-2xl font-black text-emerald-600 dark:text-emerald-400 focus:outline-none focus:border-emerald-400 transition-all"
                                                />
                                                <button 
                                                    type="button"
                                                    onClick={() => setManualScores({ ...manualScores, [q.id]: Math.min(q.points, (manualScores[q.id] || 0) + 1) })}
                                                    className="w-10 h-10 rounded-xl bg-card shadow-sm border border-border flex items-center justify-center hover:bg-emerald-500/20 hover:border-emerald-500/30 transition-all text-muted-foreground hover:text-emerald-600 dark:hover:text-emerald-400"
                                                >
                                                    <CheckCircleIcon className="w-5 h-5" />
                                                </button>
                                            </div>
                                            <div className="w-full bg-card shadow-sm h-1.5 rounded-full mt-1 overflow-hidden">
                                                <div 
                                                    className="h-full bg-emerald-500 transition-all duration-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]" 
                                                    style={{ width: `${scoreWeight * 100}%` }} 
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="p-8 grid grid-cols-1 lg:grid-cols-2 gap-8">
                                        <div className="space-y-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-6 h-6 rounded-xl bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center">
                                                    <SparklesIcon className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                                                </div>
                                                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-600/60 dark:text-cyan-400/60">Student's Response</p>
                                            </div>
                                            <div className="p-6 bg-white/[0.02] border border-border rounded-xl text-base leading-relaxed text-muted-foreground whitespace-pre-wrap font-medium shadow-inner italic">
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
                                                ) : (
                                                    `"${studentAnswer}"`
                                                )}
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
                            </div>
                        );
                    })}

                    <div className="bg-gradient-to-br from-white/[0.03] to-transparent border border-border rounded-[2.5rem] p-8 space-y-6">
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
