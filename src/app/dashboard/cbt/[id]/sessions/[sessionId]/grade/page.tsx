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

export default function GradeSessionPage() {
    const params = useParams() as { id: string, sessionId: string };
    const router = useRouter();
    const { profile, loading: authLoading } = useAuth();

    // cbt_sessions now includes manual_scores and grading_notes, but the
    // generated Supabase type doesn't. we'll use `any` when reading the result
    const [session, setSession] = useState<any>(null);
    const [exam, setExam] = useState<any>(null);
    const [questions, setQuestions] = useState<any[]>([]);
    const [manualScores, setManualScores] = useState<Record<string, number>>({});
    const [gradingNotes, setGradingNotes] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (authLoading || !profile) return;
        if (profile.role === 'student') {
            router.push('/dashboard/cbt');
            return;
        }

        const db = createClient();
        async function fetchData() {
            try {
                const [sessionRes, examRes, questionsRes, usersJson] = await Promise.all([
                    db.from('cbt_sessions').select('*').eq('id', params.sessionId).single(),
                    db.from('cbt_exams').select('*').eq('id', params.id).single(),
                    db.from('cbt_questions').select('*').eq('exam_id', params.id).order('order_index'),
                    fetch('/api/portal-users?role=student&scoped=true', { cache: 'no-store' }).then(r => r.json()).catch(() => ({ data: [] })),
                ]);

                if (sessionRes.error) throw sessionRes.error;
                if (examRes.error) throw examRes.error;

                // Enrich session with student info from API (bypasses RLS on portal_users)
                const umap: Record<string, any> = {};
                (usersJson.data ?? []).forEach((u: any) => { umap[u.id] = u; });
                const sess = { ...(sessionRes.data as any), portal_users: umap[(sessionRes.data as any)?.user_id] ?? null };
                setSession(sess);
                setExam(examRes.data);
                setQuestions(questionsRes.data ?? []);
                setManualScores(sess?.manual_scores ?? {});
                setGradingNotes(sess?.grading_notes ?? '');
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

            const { scores, feedback } = payload.data;
            setManualScores(prev => ({ ...prev, ...scores }));
            if (feedback) setGradingNotes(prev => prev ? `${prev}\n\nAI Insight: ${feedback}` : `AI Insight: ${feedback}`);
        } catch (e: any) {
            setError(`AI Grading Error: ${e.message}`);
        } finally {
            setAiGrading(false);
        }
    };

    const handleSaveGrade = async () => {
        setSaving(true);
        setError(null);
        try {
            const db = createClient();

            // Calculate final score
            const sectionWeights: Record<string, number> = exam?.metadata?.section_weights ?? {};
            const hasWeights = Object.values(sectionWeights).some((w: any) => w > 0);
            const isManualType = (q: any) => ['essay', 'fill_blank', 'coding_blocks'].includes(q.question_type);

            let finalScore: number;
            if (hasWeights) {
              const sections = ['objective', 'subjective', 'practical'] as const;
              const activeTotal = sections.reduce((s, sec) => {
                const qs = questions.filter(q => (q.metadata?.section ?? 'objective') === sec);
                return qs.length > 0 ? s + (sectionWeights[sec] ?? 0) : s;
              }, 0);
              let weightedScore = 0;
              for (const sec of sections) {
                const secQs = questions.filter(q => (q.metadata?.section ?? 'objective') === sec);
                const secWeight = sectionWeights[sec] ?? 0;
                if (secQs.length === 0 || secWeight === 0) continue;
                const secTotal = secQs.reduce((s, q) => s + (q.points ?? 0), 0);
                let secEarned = 0;
                secQs.forEach(q => {
                  const studentAnswer = (session.answers[q.id] ?? '').trim().toLowerCase();
                  const correctAnswer = (q.correct_answer ?? '').trim().toLowerCase();
                  if (isManualType(q) && manualScores[q.id] !== undefined) {
                    secEarned += manualScores[q.id] ?? 0;
                  } else if (!isManualType(q) && studentAnswer === correctAnswer) {
                    secEarned += q.points ?? 0;
                  }
                });
                const normalizedWeight = activeTotal > 0 ? (secWeight / activeTotal) * 100 : secWeight;
                weightedScore += secTotal > 0 ? (secEarned / secTotal) * normalizedWeight : 0;
              }
              finalScore = Math.round(weightedScore);
            } else {
              let autoPoints = 0, manualPoints = 0, totalMaxPoints = 0;
              questions.forEach(q => {
                totalMaxPoints += (q.points ?? 0);
                const studentAnswer = (session.answers[q.id] ?? '').trim().toLowerCase();
                const correctAnswer = (q.correct_answer ?? '').trim().toLowerCase();
                if (isManualType(q) && manualScores[q.id] !== undefined) {
                  manualPoints += manualScores[q.id] ?? 0;
                } else if (!isManualType(q) && studentAnswer === correctAnswer) {
                  autoPoints += q.points ?? 0;
                }
              });
              const totalEarned = autoPoints + manualPoints;
              finalScore = totalMaxPoints > 0 ? Math.round((totalEarned / totalMaxPoints) * 100) : 0;
            }
            const passed = finalScore >= (exam.passing_score ?? 70);

            const gradeRes = await fetch(`/api/cbt/sessions/${params.sessionId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    score: finalScore,
                    status: passed ? 'passed' : 'failed',
                    manual_scores: manualScores,
                    grading_notes: gradingNotes,
                    needs_grading: false,
                }),
            });
            if (!gradeRes.ok) {
                const j = await gradeRes.json();
                throw new Error(j.error || 'Grade could not be saved.');
            }

            // AUTO-ASSIGN CERTIFICATE IF PASSED
            if (passed && session.user_id) {
              try {
                // 1. Get first course for this program
                const { data: course } = await db.from('courses').select('id').eq('program_id', exam.program_id).order('order_index').limit(1).single();
                
                if (course) {
                  // 2. Check if student already has a certificate for this course
                  const { data: existing } = await db.from('certificates').select('id').eq('portal_user_id', session.user_id).eq('course_id', course.id).maybeSingle();
                  
                  if (!existing) {
                    await fetch('/api/certificates', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ studentId: session.user_id, courseId: course.id })
                    });
                  }
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
        <div className="min-h-screen bg-background flex items-center justify-center">
            <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        </div>
    );

    if (error || !session) return (
        <div className="min-h-screen bg-background flex items-center justify-center text-foreground">
            <div className="text-center">
                <XCircleIcon className="w-12 h-12 text-rose-500 mx-auto mb-4" />
                <p className="text-muted-foreground">{error || 'Session not found'}</p>
                <button onClick={() => router.back()} className="mt-4 text-emerald-400 font-bold underline">Go Back</button>
            </div>
        </div>
    );

    const subjectiveQuestions = questions.filter(q => 
        q.question_type === 'essay' || 
        q.question_type === 'fill_blank' || 
        q.question_type === 'coding_blocks'
    );

    return (
        <div className="min-h-screen bg-background text-foreground">
            <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
                <button onClick={() => router.back()} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-all group">
                    <ArrowLeftIcon className="w-4 h-4 group-hover:-translate-x-1 transition-transform" /> Back to Exam Details
                </button>

                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                    <div className="space-y-2">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                                <BookOpenIcon className="w-4 h-4 text-emerald-400" />
                            </div>
                            <span className="text-[10px] font-black text-emerald-400 uppercase tracking-[0.2em]">{exam.title}</span>
                        </div>
                        <h1 className="text-4xl font-black italic tracking-tighter">Evaluation Canvas</h1>
                        <div className="flex items-center gap-4 text-xs font-bold text-muted-foreground">
                            <span className="flex items-center gap-2 px-3 py-1 bg-card shadow-sm rounded-full border border-border italic">
                                <UserCircleIcon className="w-3.5 h-3.5 text-cyan-400" /> {session.portal_users?.full_name}
                            </span>
                            <span className="flex items-center gap-2 px-3 py-1 bg-card shadow-sm rounded-full border border-border italic">
                                <ClockIcon className="w-3.5 h-3.5 text-amber-400" /> {new Date(session.end_time).toLocaleDateString()} · {new Date(session.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-3">
                        <button
                            onClick={handleAiGrade}
                            disabled={aiGrading || saving}
                            className="flex items-center justify-center gap-2 px-6 py-4 bg-primary/20 hover:bg-primary border border-primary/50 text-primary hover:text-foreground font-black uppercase text-[10px] tracking-[0.2em] rounded-xl transition-all disabled:opacity-50 group"
                        >
                            {aiGrading ? <div className="w-4 h-4 border-2 border-border border-t-transparent rounded-full animate-spin" /> : <SparklesIcon className="w-4 h-4 group-hover:rotate-12 transition-transform" />}
                            {aiGrading ? 'AI Evaluating...' : 'Magic Auto-Grade'}
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

                {/* Live Score Preview */}
                {(() => {
                  const sw: Record<string, number> = exam?.metadata?.section_weights ?? {};
                  const hw = Object.values(sw).some((w: any) => w > 0);
                  const isManT = (q: any) => ['essay', 'fill_blank', 'coding_blocks'].includes(q.question_type);
                  let pct = 0;
                  if (hw) {
                    const secs = ['objective', 'subjective', 'practical'];
                    const aT = secs.reduce((s, sec) => {
                      const qs = questions.filter(q => (q.metadata?.section ?? 'objective') === sec);
                      return qs.length > 0 ? s + (sw[sec] ?? 0) : s;
                    }, 0);
                    let ws = 0;
                    for (const sec of secs) {
                      const sQs = questions.filter(q => (q.metadata?.section ?? 'objective') === sec);
                      const sW = sw[sec] ?? 0; if (sQs.length === 0 || sW === 0) continue;
                      const sT = sQs.reduce((s, q) => s + (q.points ?? 0), 0); let sE = 0;
                      sQs.forEach(q => {
                        if (isManT(q) && manualScores[q.id] !== undefined) sE += manualScores[q.id] ?? 0;
                        else if (!isManT(q) && (session.answers?.[q.id] ?? '').trim().toLowerCase() === (q.correct_answer ?? '').trim().toLowerCase()) sE += q.points ?? 0;
                      });
                      ws += sT > 0 ? (sE / sT) * (aT > 0 ? (sW / aT) * 100 : sW) : 0;
                    }
                    pct = Math.round(ws);
                  } else {
                    let autoP = 0, manualP = 0, totalP = 0;
                    questions.forEach(q => {
                      totalP += (q.points ?? 0);
                      if (isManT(q) && manualScores[q.id] !== undefined) manualP += manualScores[q.id] ?? 0;
                      else if (!isManT(q) && (session.answers?.[q.id] ?? '').trim().toLowerCase() === (q.correct_answer ?? '').trim().toLowerCase()) autoP += q.points ?? 0;
                    });
                    pct = totalP > 0 ? Math.round(((autoP + manualP) / totalP) * 100) : 0;
                  }
                  const totalP = questions.reduce((s, q) => s + (q.points ?? 0), 0);
                  const total = questions.reduce((s, q) => {
                    if (isManT(q) && manualScores[q.id] !== undefined) return s + (manualScores[q.id] ?? 0);
                    if (!isManT(q) && (session.answers?.[q.id] ?? '').trim().toLowerCase() === (q.correct_answer ?? '').trim().toLowerCase()) return s + (q.points ?? 0);
                    return s;
                  }, 0);
                  const passes = pct >= (exam?.passing_score ?? 70);
                  return (
                    <div className="bg-white/[0.02] border border-white/10 p-6 flex flex-col sm:flex-row items-center gap-6">
                      <ChartBarIcon className="w-8 h-8 text-emerald-400 shrink-0" />
                      <div className="flex-1 w-full">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-[9px] font-black text-white/30 uppercase tracking-[0.3em]">Live Score Preview</p>
                          <span className={`text-2xl font-black ${passes ? 'text-emerald-400' : 'text-rose-400'}`}>{pct}%</span>
                        </div>
                        <div className="h-2 w-full bg-white/5 overflow-hidden">
                          <div className={`h-full transition-all duration-500 ${passes ? 'bg-emerald-500' : 'bg-rose-500'}`} style={{ width: `${Math.min(pct,100)}%` }} />
                        </div>
                        <div className="flex items-center justify-between mt-2 text-[9px] font-black uppercase tracking-widest">
                          <span className="text-white/20">{total}/{totalP} pts · Pass: {exam?.passing_score ?? 70}%</span>
                          <span className={passes ? 'text-emerald-400' : 'text-rose-400'}>{passes ? 'WILL PASS' : 'WILL FAIL'}</span>
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
                        const isRight = studentAns.toLowerCase() === correctAns.toLowerCase();
                        return (
                          <div key={q.id} className="px-6 py-4 flex items-start gap-4">
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${isRight ? 'bg-emerald-500/20' : 'bg-rose-500/20'}`}>
                              {isRight ? <CheckCircleIcon className="w-4 h-4 text-emerald-400" /> : <XCircleIcon className="w-4 h-4 text-rose-400" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-white/70 leading-snug">{q.question_text}</p>
                              <div className="flex flex-wrap gap-4 mt-1.5 text-[10px] font-black uppercase tracking-widest">
                                <span className="text-white/30">Student: <span className={isRight ? 'text-emerald-400' : 'text-rose-400'}>{studentAns || '(no answer)'}</span></span>
                                {!isRight && <span className="text-white/30">Correct: <span className="text-emerald-400">{correctAns}</span></span>}
                              </div>
                            </div>
                            <span className={`text-sm font-black shrink-0 ${isRight ? 'text-emerald-400' : 'text-white/20'}`}>
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
                                            <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-primary to-primary/20 to-teal-500/20 border border-emerald-500/30 flex items-center justify-center text-xl font-black text-emerald-400 flex-shrink-0 shadow-lg shadow-emerald-900/40">
                                                {i + 1}
                                            </div>
                                            <div>
                                                <h3 className="text-xl font-bold text-foreground mb-2 leading-tight">{q.question_text}</h3>
                                                <div className="flex flex-wrap gap-2">
                                                    <span className="px-3 py-1 rounded-full bg-card shadow-sm border border-border text-[10px] uppercase font-black tracking-widest text-muted-foreground italic">
                                                        {q.question_type.replace('_', ' ')}
                                                    </span>
                                                    <span className="px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[10px] uppercase font-black tracking-widest text-emerald-400 italic">
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
                                                    className="w-10 h-10 rounded-xl bg-card shadow-sm border border-border flex items-center justify-center hover:bg-rose-500/20 hover:border-rose-500/30 transition-all text-muted-foreground hover:text-rose-400"
                                                >
                                                    <XCircleIcon className="w-5 h-5" />
                                                </button>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    max={q.points}
                                                    value={manualScores[q.id] ?? 0}
                                                    onChange={(e) => {
                                                        const val = Math.min(q.points, Math.max(0, Number(e.target.value)));
                                                        setManualScores({ ...manualScores, [q.id]: val });
                                                    }}
                                                    className="w-24 px-4 py-3 bg-emerald-500/10 border-2 border-emerald-500/40 rounded-xl text-center text-2xl font-black text-emerald-400 focus:outline-none focus:border-emerald-400 transition-all"
                                                />
                                                <button 
                                                    type="button"
                                                    onClick={() => setManualScores({ ...manualScores, [q.id]: Math.min(q.points, (manualScores[q.id] || 0) + 1) })}
                                                    className="w-10 h-10 rounded-xl bg-card shadow-sm border border-border flex items-center justify-center hover:bg-emerald-500/20 hover:border-emerald-500/30 transition-all text-muted-foreground hover:text-emerald-400"
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
                                                    <SparklesIcon className="w-3.5 h-3.5 text-cyan-400" />
                                                </div>
                                                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-400/60">Student's Response</p>
                                            </div>
                                            <div className="p-6 bg-white/[0.02] border border-border rounded-xl text-base leading-relaxed text-muted-foreground whitespace-pre-wrap font-medium shadow-inner italic">
                                                {q.question_type === 'coding_blocks' ? (
                                                    <div className="space-y-3">
                                                        <div className="flex flex-wrap items-center gap-2 leading-[2.5rem]">
                                                            {(q.metadata?.logic_sentence || "").split('[BLANK]').map((part: string, pi: number, arr: string[]) => (
                                                                <div key={pi} className="contents">
                                                                    <span className="text-muted-foreground">{part}</span>
                                                                    {pi < arr.length - 1 && (
                                                                        <span className="px-3 py-1 bg-emerald-500/20 border border-emerald-500/30 rounded-xl text-emerald-400 font-black italic shadow-sm">
                                                                            {(session.answers[q.id] || "").split(',')[pi]?.trim() || "???"}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            ))}
                                                        </div>
                                                        <div className="flex items-center gap-2 mt-2 px-3 py-1.5 bg-card shadow-sm rounded-xl border border-border w-fit">
                                                            <div className={`w-2 h-2 rounded-full ${ (session.answers[q.id] || "").trim().toLowerCase() === (q.correct_answer || "").trim().toLowerCase() ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]" }`} />
                                                            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground italic">
                                                                {(session.answers[q.id] || "").trim().toLowerCase() === (q.correct_answer || "").trim().toLowerCase() ? "Sequence Matched" : "Sequence Mismatch"}
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
                                                    <div className="w-6 h-6 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                                                        <CheckCircleIcon className="w-3.5 h-3.5" />
                                                    </div>
                                                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-400/60">Scoring Rubric / Answer Key</p>
                                                </div>
                                                <div className="p-6 bg-emerald-500/[0.03] border border-emerald-500/10 rounded-xl text-sm leading-relaxed text-emerald-300/70 italic relative overflow-hidden group/rubric">
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
                                <SparklesIcon className="w-6 h-6 text-amber-500" />
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
                        <div className="flex items-center gap-2 px-4 py-2 bg-amber-500/10 rounded-xl border border-amber-500/20 w-fit">
                            <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                            <p className="text-[10px] text-amber-400 font-bold italic tracking-tighter">Student will view these remarks on their dashboard</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
