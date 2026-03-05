'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import {
    ArrowLeftIcon, AcademicCapIcon, PlusIcon, TrashIcon,
    CheckIcon, ArrowPathIcon, ExclamationTriangleIcon, PencilSquareIcon,
    ChevronUpIcon, ChevronDownIcon,
} from '@heroicons/react/24/outline';

interface Question {
    id?: string;
    question_text: string;
    question_type: string;
    options: string[];
    correct_answer: string;
    points: number;
    order_index: number;
    _new?: boolean;
    _deleted?: boolean;
}

export default function EditExamPage() {
    const params = useParams();
    const id = params?.id as string;
    const router = useRouter();
    const { profile, loading: authLoading } = useAuth();
    const [programs, setPrograms] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState('');

    const [form, setForm] = useState({
        title: '',
        description: '',
        program_id: '',
        duration_minutes: '60',
        passing_score: '70',
        start_date: '',
        end_date: '',
        is_active: true,
    });
    const [questions, setQuestions] = useState<Question[]>([]);

    const isStaff = profile?.role === 'admin' || profile?.role === 'teacher';

    useEffect(() => {
        if (authLoading || !profile || !id) return;
        const db = createClient();
        Promise.all([
            db.from('cbt_exams').select('*').eq('id', id).single(),
            db.from('cbt_questions').select('*').eq('exam_id', id).order('order_index'),
            db.from('programs').select('id, name').eq('is_active', true).order('name'),
        ]).then(([examRes, qRes, progRes]) => {
            if (examRes.data) {
                const e = examRes.data;
                setForm({
                    title: e.title ?? '',
                    description: e.description ?? '',
                    program_id: e.program_id ?? '',
                    duration_minutes: String(e.duration_minutes ?? 60),
                    passing_score: String(e.passing_score ?? 70),
                    start_date: e.start_date ? new Date(e.start_date).toISOString().slice(0, 16) : '',
                    end_date: e.end_date ? new Date(e.end_date).toISOString().slice(0, 16) : '',
                    is_active: e.is_active ?? true,
                });
            } else {
                setError('Exam not found.');
            }
            setQuestions((qRes.data ?? []).map((q: any) => ({
                ...q,
                options: Array.isArray(q.options) ? q.options : ['', '', '', ''],
            })));
            setPrograms(progRes.data ?? []);
            setLoading(false);
        });
    }, [profile?.id, authLoading, id]);

    const addQuestion = () => setQuestions(q => [...q, {
        question_text: '',
        question_type: 'multiple_choice',
        options: ['', '', '', ''],
        correct_answer: '',
        points: 5,
        order_index: q.length + 1,
        _new: true,
    }]);

    const removeQuestion = (i: number) => {
        setQuestions(prev => {
            const updated = [...prev];
            if (updated[i].id && !updated[i]._new) {
                // Mark for deletion
                updated[i] = { ...updated[i], _deleted: true };
            } else {
                updated.splice(i, 1);
            }
            return updated;
        });
    };

    const updateQuestion = (i: number, patch: Partial<Question>) =>
        setQuestions(prev => prev.map((item, idx) => idx === i ? { ...item, ...patch } : item));

    const updateOption = (qi: number, oi: number, val: string) =>
        setQuestions(prev => prev.map((item, idx) => idx === qi
            ? { ...item, options: item.options.map((o, j) => j === oi ? val : o) } : item));

    const moveQuestion = (i: number, dir: -1 | 1) => {
        const newArr = [...questions.filter(q => !q._deleted)];
        const target = i + dir;
        if (target < 0 || target >= newArr.length) return;
        [newArr[i], newArr[target]] = [newArr[target], newArr[i]];
        setQuestions(newArr.map((q, idx) => ({ ...q, order_index: idx + 1 })));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.title.trim() || !form.program_id) {
            setError('Title and programme are required.');
            return;
        }
        const activeQuestions = questions.filter(q => !q._deleted);
        if (activeQuestions.length === 0) {
            setError('Add at least one question.');
            return;
        }
        setSaving(true);
        setError(null);
        setSuccess('');
        try {
            const db = createClient();

            // Update exam
            const examPayload: any = {
                title: form.title.trim(),
                description: form.description.trim() || null,
                program_id: form.program_id,
                duration_minutes: parseInt(form.duration_minutes) || 60,
                passing_score: parseInt(form.passing_score) || 70,
                total_questions: activeQuestions.length,
                is_active: form.is_active,
                updated_at: new Date().toISOString(),
            };
            if (form.start_date) examPayload.start_date = new Date(form.start_date).toISOString();
            else examPayload.start_date = null;
            if (form.end_date) examPayload.end_date = new Date(form.end_date).toISOString();
            else examPayload.end_date = null;

            const { error: examErr } = await db.from('cbt_exams').update(examPayload).eq('id', id);
            if (examErr) throw examErr;

            // Handle deleted questions
            const deletedIds = questions.filter(q => q._deleted && q.id).map(q => q.id!);
            if (deletedIds.length > 0) {
                await db.from('cbt_questions').delete().in('id', deletedIds);
            }

            // Insert new questions
            const newQs = activeQuestions.filter(q => q._new);
            if (newQs.length > 0) {
                const { error: newQErr } = await db.from('cbt_questions').insert(newQs.map((q, i) => ({
                    exam_id: id,
                    question_text: q.question_text.trim(),
                    question_type: q.question_type,
                    options: q.question_type === 'multiple_choice' ? q.options.filter(o => o.trim()) : null,
                    correct_answer: q.correct_answer.trim(),
                    points: q.points,
                    order_index: q.order_index,
                })));
                if (newQErr) throw newQErr;
            }

            // Update existing questions
            const existingQs = activeQuestions.filter(q => q.id && !q._new);
            for (const q of existingQs) {
                await db.from('cbt_questions').update({
                    question_text: q.question_text.trim(),
                    question_type: q.question_type,
                    options: q.question_type === 'multiple_choice' ? q.options.filter(o => o.trim()) : null,
                    correct_answer: q.correct_answer.trim(),
                    points: q.points,
                    order_index: q.order_index,
                    updated_at: new Date().toISOString(),
                }).eq('id', q.id!);
            }

            setSuccess('Exam updated successfully!');
            setTimeout(() => router.push(`/dashboard/cbt/${id}`), 1200);
        } catch (e: any) {
            setError(e.message ?? 'Failed to update exam');
        } finally {
            setSaving(false);
        }
    };

    const visibleQuestions = questions.filter(q => !q._deleted);

    if (authLoading || loading) return (
        <div className="min-h-screen bg-[#0f0f1a] flex items-center justify-center">
            <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        </div>
    );
    if (!isStaff) return (
        <div className="min-h-screen bg-[#0f0f1a] flex items-center justify-center">
            <p className="text-white/40">Staff access required.</p>
        </div>
    );

    return (
        <div className="min-h-screen bg-[#0f0f1a] text-white">
            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
                <Link href={`/dashboard/cbt/${id}`} className="inline-flex items-center gap-2 text-sm text-white/40 hover:text-white transition-colors">
                    <ArrowLeftIcon className="w-4 h-4" /> Back to Exam
                </Link>

                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <AcademicCapIcon className="w-5 h-5 text-emerald-400" />
                        <span className="text-xs font-bold text-emerald-400 uppercase tracking-widest">Edit Exam</span>
                    </div>
                    <h1 className="text-3xl font-extrabold">Edit CBT Exam</h1>
                    <p className="text-white/40 text-sm mt-1">Update exam settings and manage questions</p>
                </div>

                {error && (
                    <div className="flex items-center gap-3 bg-rose-500/10 border border-rose-500/20 rounded-xl p-4">
                        <ExclamationTriangleIcon className="w-5 h-5 text-rose-400 flex-shrink-0" />
                        <p className="text-rose-400 text-sm">{error}</p>
                    </div>
                )}
                {success && (
                    <div className="flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4">
                        <CheckIcon className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                        <p className="text-emerald-400 text-sm font-semibold">{success}</p>
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Exam Details */}
                    <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-5">
                        <h2 className="text-sm font-bold text-white/60 uppercase tracking-widest">Exam Details</h2>

                        <div>
                            <label className="block text-xs font-semibold text-white/40 uppercase tracking-widest mb-1.5">
                                Exam Title <span className="text-rose-400">*</span>
                            </label>
                            <input type="text" required value={form.title}
                                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/25 focus:outline-none focus:border-emerald-500 transition-colors" />
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-white/40 uppercase tracking-widest mb-1.5">
                                Programme <span className="text-rose-400">*</span>
                            </label>
                            <select required value={form.program_id}
                                onChange={e => setForm(f => ({ ...f, program_id: e.target.value }))}
                                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-emerald-500 cursor-pointer">
                                <option value="">Select programme…</option>
                                {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div>
                                <label className="block text-xs font-semibold text-white/40 uppercase tracking-widest mb-1.5">Duration (min)</label>
                                <input type="number" min="5" value={form.duration_minutes}
                                    onChange={e => setForm(f => ({ ...f, duration_minutes: e.target.value }))}
                                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-emerald-500 transition-colors" />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-white/40 uppercase tracking-widest mb-1.5">Passing Score (%)</label>
                                <input type="number" min="1" max="100" value={form.passing_score}
                                    onChange={e => setForm(f => ({ ...f, passing_score: e.target.value }))}
                                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-emerald-500 transition-colors" />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-white/40 uppercase tracking-widest mb-1.5">Status</label>
                                <select value={form.is_active ? 'active' : 'inactive'}
                                    onChange={e => setForm(f => ({ ...f, is_active: e.target.value === 'active' }))}
                                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-emerald-500 cursor-pointer">
                                    <option value="active">Active</option>
                                    <option value="inactive">Inactive</option>
                                </select>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-semibold text-white/40 uppercase tracking-widest mb-1.5">Start Date/Time</label>
                                <input type="datetime-local" value={form.start_date}
                                    onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
                                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-emerald-500 transition-colors" />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-white/40 uppercase tracking-widest mb-1.5">End Date/Time</label>
                                <input type="datetime-local" value={form.end_date}
                                    onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
                                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-emerald-500 transition-colors" />
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-white/40 uppercase tracking-widest mb-1.5">Description</label>
                            <textarea rows={2} value={form.description}
                                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/25 focus:outline-none focus:border-emerald-500 transition-colors resize-none" />
                        </div>
                    </div>

                    {/* ── Question Canvas ── */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between bg-white/3 border border-white/10 rounded-2xl px-5 py-4">
                            <div>
                                <h2 className="font-bold text-white">Question Bank</h2>
                                <p className="text-xs text-white/40 mt-0.5">
                                    {visibleQuestions.length} question{visibleQuestions.length !== 1 ? 's' : ''} ·&nbsp;
                                    {visibleQuestions.reduce((s, q) => s + (q.points || 0), 0)} total points
                                </p>
                            </div>
                            <button type="button" onClick={addQuestion}
                                className="flex items-center gap-1.5 px-4 py-2 text-sm font-bold text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 rounded-xl transition-colors">
                                <PlusIcon className="w-4 h-4" /> Add Question
                            </button>
                        </div>

                        {visibleQuestions.length === 0 && (
                            <div className="text-center py-16 bg-white/5 border border-dashed border-white/10 rounded-2xl">
                                <PencilSquareIcon className="w-10 h-10 mx-auto text-white/10 mb-3" />
                                <p className="text-white/30 text-sm">No questions yet. Click "Add Question" to begin.</p>
                            </div>
                        )}

                        {visibleQuestions.map((q, qi) => (
                            <div key={q.id ?? `new-${qi}`} className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
                                {/* Question header */}
                                <div className="flex items-center justify-between px-5 py-3 bg-white/3 border-b border-white/10">
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-black text-white/40 w-6">{qi + 1}</span>
                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${q._new ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/10 text-white/40'}`}>
                                            {q._new ? 'New' : 'Existing'}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <button type="button" onClick={() => moveQuestion(qi, -1)} disabled={qi === 0}
                                            className="p-1.5 text-white/30 hover:text-white/70 hover:bg-white/10 rounded-lg transition-colors disabled:opacity-20">
                                            <ChevronUpIcon className="w-3.5 h-3.5" />
                                        </button>
                                        <button type="button" onClick={() => moveQuestion(qi, 1)} disabled={qi === visibleQuestions.length - 1}
                                            className="p-1.5 text-white/30 hover:text-white/70 hover:bg-white/10 rounded-lg transition-colors disabled:opacity-20">
                                            <ChevronDownIcon className="w-3.5 h-3.5" />
                                        </button>
                                        <button type="button" onClick={() => removeQuestion(questions.indexOf(q))}
                                            className="p-1.5 text-rose-400/60 bg-rose-500/10 hover:bg-rose-500/20 hover:text-rose-400 rounded-lg transition-colors">
                                            <TrashIcon className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                </div>

                                <div className="p-5 space-y-4">
                                    <textarea rows={2} value={q.question_text}
                                        onChange={e => updateQuestion(questions.indexOf(q), { question_text: e.target.value })}
                                        placeholder="Enter question text…"
                                        className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/25 focus:outline-none focus:border-emerald-500 transition-colors resize-none" />

                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                        <div>
                                            <label className="block text-xs text-white/40 uppercase tracking-widest mb-1">Type</label>
                                            <select value={q.question_type}
                                                onChange={e => updateQuestion(questions.indexOf(q), { question_type: e.target.value, options: ['', '', '', ''], correct_answer: '' })}
                                                className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-emerald-500 cursor-pointer">
                                                <option value="multiple_choice">Multiple Choice</option>
                                                <option value="true_false">True / False</option>
                                                <option value="fill_blank">Fill in Blank</option>
                                                <option value="essay">Essay</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-xs text-white/40 uppercase tracking-widest mb-1">Points</label>
                                            <input type="number" min="1" value={q.points}
                                                onChange={e => updateQuestion(questions.indexOf(q), { points: parseInt(e.target.value) || 1 })}
                                                className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-emerald-500 transition-colors" />
                                        </div>
                                        <div>
                                            <label className="block text-xs text-white/40 uppercase tracking-widest mb-1">Correct Answer</label>
                                            {q.question_type === 'true_false' ? (
                                                <select value={q.correct_answer}
                                                    onChange={e => updateQuestion(questions.indexOf(q), { correct_answer: e.target.value })}
                                                    className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-emerald-500 cursor-pointer">
                                                    <option value="">Select…</option>
                                                    <option value="True">True</option>
                                                    <option value="False">False</option>
                                                </select>
                                            ) : q.question_type === 'multiple_choice' ? (
                                                <select value={q.correct_answer}
                                                    onChange={e => updateQuestion(questions.indexOf(q), { correct_answer: e.target.value })}
                                                    className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-emerald-500 cursor-pointer">
                                                    <option value="">Select correct…</option>
                                                    {q.options.filter(o => o.trim()).map((opt, oi) => (
                                                        <option key={oi} value={opt}>{String.fromCharCode(65 + oi)}. {opt}</option>
                                                    ))}
                                                </select>
                                            ) : (
                                                <input type="text" value={q.correct_answer}
                                                    onChange={e => updateQuestion(questions.indexOf(q), { correct_answer: e.target.value })}
                                                    placeholder="Correct answer…"
                                                    className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/25 focus:outline-none focus:border-emerald-500 transition-colors" />
                                            )}
                                        </div>
                                    </div>

                                    {q.question_type === 'multiple_choice' && (
                                        <div>
                                            <label className="block text-xs text-white/40 uppercase tracking-widest mb-2">Answer Options</label>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                                {q.options.map((opt, oi) => (
                                                    <div key={oi} className={`flex items-center gap-2 px-3 py-2 rounded-xl border transition-colors ${opt === q.correct_answer && opt.trim() ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-white/10 bg-white/5'}`}>
                                                        <span className={`text-xs font-bold w-5 flex-shrink-0 ${opt === q.correct_answer && opt.trim() ? 'text-emerald-400' : 'text-white/30'}`}>
                                                            {String.fromCharCode(65 + oi)}.
                                                        </span>
                                                        <input type="text" value={opt}
                                                            onChange={e => updateOption(questions.indexOf(q), oi, e.target.value)}
                                                            placeholder={`Option ${String.fromCharCode(65 + oi)}`}
                                                            className="flex-1 bg-transparent text-sm text-white placeholder-white/20 focus:outline-none" />
                                                        {opt.trim() && (
                                                            <button type="button"
                                                                onClick={() => updateQuestion(questions.indexOf(q), { correct_answer: opt })}
                                                                className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full transition-colors ${opt === q.correct_answer ? 'bg-emerald-500/30 text-emerald-400' : 'text-white/20 hover:text-emerald-400 hover:bg-emerald-500/10'}`}>
                                                                {opt === q.correct_answer ? '✓ Correct' : 'Set correct'}
                                                            </button>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-3 pt-2">
                        <Link href={`/dashboard/cbt/${id}`}
                            className="px-5 py-2.5 bg-white/5 hover:bg-white/10 text-white/50 text-sm font-bold rounded-xl transition-colors">
                            Cancel
                        </Link>
                        <button type="submit" disabled={saving}
                            className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold rounded-xl transition-all disabled:opacity-50 shadow-lg shadow-emerald-900/20">
                            {saving ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : <CheckIcon className="w-4 h-4" />}
                            {saving ? 'Saving…' : 'Save Exam'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
