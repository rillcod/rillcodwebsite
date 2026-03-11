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

            const { error } = await db.from('cbt_sessions').update({
                score: finalScore,
                status: passed ? 'passed' : 'failed',
                manual_scores: manualScores,
                grading_notes: gradingNotes,
                needs_grading: false,
                updated_at: new Date().toISOString()
            }).eq('id', params.sessionId);

            if (error) throw error;
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
            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
                <button onClick={() => router.back()} className="inline-flex items-center gap-2 text-sm text-white/40 hover:text-white transition-colors">
                    <ArrowLeftIcon className="w-4 h-4" /> Back to Exam Details
                </button>

                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="space-y-1">
                        <div className="flex items-center gap-2">
                            <BookOpenIcon className="w-5 h-5 text-emerald-400" />
                            <span className="text-xs font-bold text-emerald-400 uppercase tracking-widest">{exam.title}</span>
                        </div>
                        <h1 className="text-3xl font-extrabold tracking-tight">Manual Evaluation</h1>
                        <div className="flex items-center gap-4 text-sm text-white/40 mt-1">
                            <span className="flex items-center gap-1.5"><UserIcon className="w-4 h-4" />{session.portal_users?.full_name}</span>
                            <span className="flex items-center gap-1.5"><ClockIcon className="w-4 h-4" />{new Date(session.end_time).toLocaleString()}</span>
                        </div>
                    </div>
                    <button
                        onClick={handleSaveGrade}
                        disabled={saving}
                        className="flex items-center justify-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-black rounded-xl transition-all shadow-lg shadow-emerald-900/40"
                    >
                        {saving ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <SaveIcon className="w-5 h-5" />}
                        Finalize Grading
                    </button>
                </div>

                <div className="grid grid-cols-1 gap-8">
                    {subjectiveQuestions.map((q, i) => {
                        const studentAnswer = session.answers[q.id] || '(No answer provided)';
                        return (
                            <div key={q.id} className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
                                <div className="p-6 border-b border-white/10 bg-white/[0.02]">
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="flex items-start gap-4">
                                            <span className="w-10 h-10 rounded-xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center text-sm font-bold text-violet-400 flex-shrink-0">
                                                {i + 1}
                                            </span>
                                            <div>
                                                <p className="text-white font-bold leading-relaxed">{q.question_text}</p>
                                                <span className="inline-block mt-2 px-2 py-0.5 rounded-lg bg-white/5 border border-white/10 text-[10px] uppercase font-black tracking-widest text-white/40">
                                                    {q.question_type.replace('_', ' ')} · {q.points} Max Points
                                                </span>
                                            </div>
                                        </div>
                                        <div className="flex flex-col items-end gap-2">
                                            <label className="text-[10px] font-black uppercase tracking-widest text-white/30">Award Points</label>
                                            <input
                                                type="number"
                                                min="0"
                                                max={q.points}
                                                value={manualScores[q.id] ?? 0}
                                                onChange={(e) => setManualScores({ ...manualScores, [q.id]: Number(e.target.value) })}
                                                className="w-20 px-3 py-2 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-center font-bold text-emerald-400 focus:outline-none focus:border-emerald-500 transition-colors"
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="p-6 space-y-6">
                                    <div className="space-y-2">
                                        <p className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-2 flex items-center gap-2">
                                            <span className="w-1 h-1 bg-white/40 rounded-full" /> Student's Response
                                        </p>
                                        <div className="p-4 bg-white/5 border border-white/10 rounded-xl text-sm leading-relaxed text-white/80 whitespace-pre-wrap">
                                            {studentAnswer}
                                        </div>
                                    </div>

                                    {q.correct_answer && (
                                        <div className="space-y-2">
                                            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-400/60 mb-2 flex items-center gap-2">
                                                <span className="w-1 h-1 bg-emerald-400/40 rounded-full" /> Reference Answer / Guide
                                            </p>
                                            <div className="p-4 bg-emerald-500/[0.03] border border-emerald-500/10 rounded-xl text-xs leading-relaxed text-emerald-300/70 italic">
                                                {q.correct_answer}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}

                    <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">
                        <div className="flex items-center gap-2">
                            <SparklesIcon className="w-4 h-4 text-amber-400" />
                            <h3 className="font-bold text-sm">Overall Feedback & Notes</h3>
                        </div>
                        <textarea
                            value={gradingNotes}
                            onChange={(e) => setGradingNotes(e.target.value)}
                            placeholder="Provide evaluation feedback for the student…"
                            rows={4}
                            className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/25 focus:outline-none focus:border-emerald-500 transition-colors resize-none"
                        />
                        <p className="text-[10px] text-white/30 italic">These notes will be visible to the student along with their final score.</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
