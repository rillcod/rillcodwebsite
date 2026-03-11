'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import {
    ArrowLeftIcon, UserIcon, ClockIcon,
    CheckCircleIcon, XCircleIcon, SaveIcon, SparklesIcon, BookOpenIcon
} from 'lucide-react';

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
                const [sessionRes, examRes, questionsRes] = await Promise.all([
                    db.from('cbt_sessions').select('*, portal_users(full_name, email)').eq('id', params.sessionId).single(),
                    db.from('cbt_exams').select('*').eq('id', params.id).single(),
                    db.from('cbt_questions').select('*').eq('exam_id', params.id).order('order_index')
                ]);

                if (sessionRes.error) throw sessionRes.error;
                if (examRes.error) throw examRes.error;

                // the row may include manual_scores & grading_notes; TS doesn't
                // know about them so treat as any.
                const sess = sessionRes.data as any;
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

    const handleSaveGrade = async () => {
        setSaving(true);
        setError(null);
        try {
            const db = createClient();

            // Calculate final score
            let autoPoints = 0;
            let manualPoints = 0;
            let totalMaxPoints = 0;

            questions.forEach(q => {
                totalMaxPoints += (q.points ?? 0);
                const studentAnswer = (session.answers[q.id] ?? '').trim().toLowerCase();
                const correctAnswer = (q.correct_answer ?? '').trim().toLowerCase();

                if (q.question_type === 'essay' || q.question_type === 'fill_blank') {
                    manualPoints += (manualScores[q.id] ?? 0);
                } else if (studentAnswer === correctAnswer) {
                    autoPoints += (q.points ?? 0);
                }
            });

            const totalEarned = autoPoints + manualPoints;
            const finalScore = totalMaxPoints > 0 ? Math.round((totalEarned / totalMaxPoints) * 100) : 0;
            const passed = finalScore >= (exam.passing_score ?? 70);

            const { data: saved, error } = await db.from('cbt_sessions').update({
                score: finalScore,
                status: passed ? 'passed' : 'failed',
                manual_scores: manualScores,
                grading_notes: gradingNotes,
                needs_grading: false,
                updated_at: new Date().toISOString()
            }).eq('id', params.sessionId).select('id, score, status');

            if (error) throw error;
            if (!saved || saved.length === 0) {
                throw new Error('Grade could not be saved — permission denied. Make sure you are logged in as a teacher or admin.');
            }
            router.push(`/dashboard/cbt/${params.id}`);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setSaving(false);
        }
    };

    if (loading) return (
        <div className="min-h-screen bg-[#0f0f1a] flex items-center justify-center">
            <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        </div>
    );

    if (error || !session) return (
        <div className="min-h-screen bg-[#0f0f1a] flex items-center justify-center text-white">
            <div className="text-center">
                <XCircleIcon className="w-12 h-12 text-rose-500 mx-auto mb-4" />
                <p className="text-white/60">{error || 'Session not found'}</p>
                <button onClick={() => router.back()} className="mt-4 text-emerald-400 font-bold underline">Go Back</button>
            </div>
        </div>
    );

    const subjectiveQuestions = questions.filter(q => q.question_type === 'essay' || q.question_type === 'fill_blank');

    return (
        <div className="min-h-screen bg-[#0f0f1a] text-white">
            <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
                <button onClick={() => router.back()} className="inline-flex items-center gap-2 text-sm text-white/40 hover:text-white transition-all group">
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
                        <div className="flex items-center gap-4 text-xs font-bold text-white/40">
                            <span className="flex items-center gap-2 px-3 py-1 bg-white/5 rounded-full border border-white/10 italic">
                                <UserIcon className="w-3.5 h-3.5 text-cyan-400" /> {session.portal_users?.full_name}
                            </span>
                            <span className="flex items-center gap-2 px-3 py-1 bg-white/5 rounded-full border border-white/10 italic">
                                <ClockIcon className="w-3.5 h-3.5 text-amber-400" /> {new Date(session.end_time).toLocaleDateString()} · {new Date(session.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-3">
                        <div className="text-right hidden sm:block">
                            <p className="text-[10px] font-black uppercase text-white/20 tracking-widest">Grading Status</p>
                            <p className="text-xs font-bold text-amber-400 italic">Reviewing Subjective Tasks</p>
                        </div>
                        <button
                            onClick={handleSaveGrade}
                            disabled={saving}
                            className="flex items-center justify-center gap-3 px-8 py-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-black uppercase text-[10px] tracking-[0.2em] rounded-2xl transition-all shadow-2xl shadow-emerald-900/40 border border-emerald-400/20 group"
                        >
                            {saving ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <SaveIcon className="w-4 h-4 group-hover:scale-125 transition-transform" />}
                            {saving ? 'Saving...' : 'Finalize Grade'}
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-10">
                    {subjectiveQuestions.map((q, i) => {
                        const studentAnswer = session.answers[q.id] || '(No response provided by student)';
                        const scoreWeight = (manualScores[q.id] || 0) / (q.points || 1);
                        
                        return (
                            <div key={q.id} className="relative group">
                                {/* Decorative line */}
                                <div className="absolute -left-4 top-0 bottom-0 w-[2px] bg-gradient-to-b from-emerald-500/50 to-transparent group-hover:from-emerald-400 transition-all" />
                                
                                <div className="bg-white/[0.03] border border-white/10 rounded-[2.5rem] overflow-hidden backdrop-blur-sm transition-all group-hover:bg-white/[0.05] group-hover:border-emerald-500/20">
                                    <div className="p-8 border-b border-white/10 bg-gradient-to-r from-emerald-500/[0.02] to-transparent flex flex-col md:flex-row md:items-center justify-between gap-6">
                                        <div className="flex items-start gap-6">
                                            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-emerald-500/30 flex items-center justify-center text-xl font-black text-emerald-400 flex-shrink-0 shadow-lg shadow-emerald-900/40">
                                                {i + 1}
                                            </div>
                                            <div>
                                                <h3 className="text-xl font-bold text-white mb-2 leading-tight">{q.question_text}</h3>
                                                <div className="flex flex-wrap gap-2">
                                                    <span className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] uppercase font-black tracking-widest text-white/40 italic">
                                                        {q.question_type.replace('_', ' ')}
                                                    </span>
                                                    <span className="px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[10px] uppercase font-black tracking-widest text-emerald-400 italic">
                                                        {q.points} Max Points
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                        
                                        <div className="flex flex-col items-center gap-3 p-4 bg-black/20 rounded-3xl border border-white/5">
                                            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30">Awarded Points</label>
                                            <div className="flex items-center gap-3">
                                                <button 
                                                    type="button"
                                                    onClick={() => setManualScores({ ...manualScores, [q.id]: Math.max(0, (manualScores[q.id] || 0) - 1) })}
                                                    className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-rose-500/20 hover:border-rose-500/30 transition-all text-white/40 hover:text-rose-400"
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
                                                    className="w-24 px-4 py-3 bg-emerald-500/10 border-2 border-emerald-500/40 rounded-2xl text-center text-2xl font-black text-emerald-400 focus:outline-none focus:border-emerald-400 transition-all"
                                                />
                                                <button 
                                                    type="button"
                                                    onClick={() => setManualScores({ ...manualScores, [q.id]: Math.min(q.points, (manualScores[q.id] || 0) + 1) })}
                                                    className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-emerald-500/20 hover:border-emerald-500/30 transition-all text-white/40 hover:text-emerald-400"
                                                >
                                                    <CheckCircleIcon className="w-5 h-5" />
                                                </button>
                                            </div>
                                            <div className="w-full bg-white/5 h-1.5 rounded-full mt-1 overflow-hidden">
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
                                                <div className="w-6 h-6 rounded-lg bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center">
                                                    <SparklesIcon className="w-3.5 h-3.5 text-cyan-400" />
                                                </div>
                                                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-400/60">Student's Response</p>
                                            </div>
                                            <div className="p-6 bg-white/[0.02] border border-white/10 rounded-3xl text-base leading-relaxed text-white/80 whitespace-pre-wrap font-medium shadow-inner italic">
                                                "{studentAnswer}"
                                            </div>
                                        </div>

                                        {q.correct_answer && (
                                            <div className="space-y-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-6 h-6 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                                                        <CheckCircleIcon className="w-3.5 h-3.5" />
                                                    </div>
                                                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-400/60">Scoring Rubric / Answer Key</p>
                                                </div>
                                                <div className="p-6 bg-emerald-500/[0.03] border border-emerald-500/10 rounded-3xl text-sm leading-relaxed text-emerald-300/70 italic relative overflow-hidden group/rubric">
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

                    <div className="bg-gradient-to-br from-white/[0.03] to-transparent border border-white/10 rounded-[2.5rem] p-8 space-y-6">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center">
                                <SparklesIcon className="w-6 h-6 text-amber-500" />
                            </div>
                            <div>
                                <h3 className="font-black italic text-xl">Feedback & Notes</h3>
                                <p className="text-[10px] text-white/30 uppercase tracking-widest font-black">Personalized Student Mentorship</p>
                            </div>
                        </div>
                        <textarea
                            value={gradingNotes}
                            onChange={(e) => setGradingNotes(e.target.value)}
                            placeholder="Provide constructive feedback for the student's growth..."
                            rows={5}
                            className="w-full px-6 py-5 bg-white/5 border border-white/10 rounded-[2rem] text-sm text-white placeholder-white/20 focus:outline-none focus:border-emerald-500 transition-all resize-none shadow-inner"
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
