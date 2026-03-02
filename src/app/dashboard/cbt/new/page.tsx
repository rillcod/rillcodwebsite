'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import {
  ArrowLeftIcon, AcademicCapIcon, PlusIcon, TrashIcon,
  CheckIcon, ArrowPathIcon, ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';

interface Question {
  question_text: string;
  question_type: string;
  options: string[];
  correct_answer: string;
  points: number;
}

const emptyQuestion = (): Question => ({
  question_text: '',
  question_type: 'multiple_choice',
  options: ['', '', '', ''],
  correct_answer: '',
  points: 5,
});

export default function NewExamPage() {
  const router = useRouter();
  const { profile, loading: authLoading } = useAuth();
  const [programs, setPrograms] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
  const [questions, setQuestions] = useState<Question[]>([emptyQuestion()]);

  useEffect(() => {
    if (authLoading || !profile) return;
    createClient().from('programs').select('id, name').eq('is_active', true).order('name')
      .then(({ data }) => setPrograms(data ?? []));
  }, [profile?.id, authLoading]); // eslint-disable-line

  const isStaff = profile?.role === 'admin' || profile?.role === 'teacher';

  const addQuestion = () => setQuestions(q => [...q, emptyQuestion()]);
  const removeQuestion = (i: number) => setQuestions(q => q.filter((_, idx) => idx !== i));
  const updateQuestion = (i: number, patch: Partial<Question>) =>
    setQuestions(q => q.map((item, idx) => idx === i ? { ...item, ...patch } : item));
  const updateOption = (qi: number, oi: number, val: string) =>
    setQuestions(q => q.map((item, idx) => idx === qi ? { ...item, options: item.options.map((o, j) => j === oi ? val : o) } : item));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || !form.program_id) {
      setError('Title and programme are required.');
      return;
    }
    const validQuestions = questions.filter(q => q.question_text.trim());
    if (validQuestions.length === 0) {
      setError('Add at least one question.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const db = createClient();
      const examPayload: any = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        program_id: form.program_id,
        duration_minutes: parseInt(form.duration_minutes) || 60,
        passing_score: parseInt(form.passing_score) || 70,
        total_questions: validQuestions.length,
        is_active: form.is_active,
      };
      if (form.start_date) examPayload.start_date = new Date(form.start_date).toISOString();
      if (form.end_date) examPayload.end_date = new Date(form.end_date).toISOString();

      const { data: examData, error: examErr } = await db.from('cbt_exams').insert(examPayload).select('id').single();
      if (examErr) throw examErr;

      const qPayloads = validQuestions.map((q, i) => ({
        exam_id: examData.id,
        question_text: q.question_text.trim(),
        question_type: q.question_type,
        options: q.question_type === 'multiple_choice' ? q.options.filter(o => o.trim()) : null,
        correct_answer: q.correct_answer.trim(),
        points: q.points,
        order_index: i + 1,
      }));
      const { error: qErr } = await db.from('cbt_questions').insert(qPayloads);
      if (qErr) throw qErr;

      router.push('/dashboard/cbt');
    } catch (e: any) {
      setError(e.message ?? 'Failed to create exam');
    } finally {
      setSaving(false);
    }
  };

  if (authLoading) return (
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
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <Link href="/dashboard/cbt" className="inline-flex items-center gap-2 text-sm text-white/40 hover:text-white transition-colors">
          <ArrowLeftIcon className="w-4 h-4" /> Back to CBT
        </Link>
        <div>
          <div className="flex items-center gap-2 mb-1">
            <AcademicCapIcon className="w-5 h-5 text-emerald-400" />
            <span className="text-xs font-bold text-emerald-400 uppercase tracking-widest">New Exam</span>
          </div>
          <h1 className="text-3xl font-extrabold">Create CBT Exam</h1>
          <p className="text-white/40 text-sm mt-1">Set up a computer-based test for students</p>
        </div>

        {error && (
          <div className="flex items-center gap-3 bg-rose-500/10 border border-rose-500/20 rounded-xl p-4">
            <ExclamationTriangleIcon className="w-5 h-5 text-rose-400 flex-shrink-0" />
            <p className="text-rose-400 text-sm">{error}</p>
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
                placeholder="e.g. Python Programming Midterm"
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
                placeholder="Optional exam description…"
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/25 focus:outline-none focus:border-emerald-500 transition-colors resize-none" />
            </div>
          </div>

          {/* Questions */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-white/60 uppercase tracking-widest">
                Questions ({questions.length})
              </h2>
              <button type="button" onClick={addQuestion}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 rounded-xl transition-colors">
                <PlusIcon className="w-3.5 h-3.5" /> Add Question
              </button>
            </div>

            {questions.map((q, qi) => (
              <div key={qi} className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white/40 uppercase">Question {qi + 1}</span>
                  {questions.length > 1 && (
                    <button type="button" onClick={() => removeQuestion(qi)}
                      className="p-1.5 text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 rounded-lg transition-colors">
                      <TrashIcon className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <textarea rows={2} value={q.question_text}
                  onChange={e => updateQuestion(qi, { question_text: e.target.value })}
                  placeholder="Enter question text…"
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/25 focus:outline-none focus:border-emerald-500 transition-colors resize-none" />

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs text-white/40 uppercase tracking-widest mb-1">Type</label>
                    <select value={q.question_type}
                      onChange={e => updateQuestion(qi, { question_type: e.target.value, options: ['', '', '', ''], correct_answer: '' })}
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
                      onChange={e => updateQuestion(qi, { points: parseInt(e.target.value) || 1 })}
                      className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-emerald-500 transition-colors" />
                  </div>
                  <div>
                    <label className="block text-xs text-white/40 uppercase tracking-widest mb-1">Correct Answer</label>
                    {q.question_type === 'true_false' ? (
                      <select value={q.correct_answer}
                        onChange={e => updateQuestion(qi, { correct_answer: e.target.value })}
                        className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-emerald-500 cursor-pointer">
                        <option value="">Select…</option>
                        <option value="True">True</option>
                        <option value="False">False</option>
                      </select>
                    ) : (
                      <input type="text" value={q.correct_answer}
                        onChange={e => updateQuestion(qi, { correct_answer: e.target.value })}
                        placeholder="Correct answer…"
                        className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/25 focus:outline-none focus:border-emerald-500 transition-colors" />
                    )}
                  </div>
                </div>

                {q.question_type === 'multiple_choice' && (
                  <div>
                    <label className="block text-xs text-white/40 uppercase tracking-widest mb-2">Options</label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {q.options.map((opt, oi) => (
                        <div key={oi} className="flex items-center gap-2">
                          <span className="text-xs text-white/30 w-4">{String.fromCharCode(65 + oi)}.</span>
                          <input type="text" value={opt}
                            onChange={e => updateOption(qi, oi, e.target.value)}
                            placeholder={`Option ${String.fromCharCode(65 + oi)}`}
                            className="flex-1 px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/20 focus:outline-none focus:border-emerald-500 transition-colors" />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2">
            <Link href="/dashboard/cbt"
              className="px-5 py-2.5 bg-white/5 hover:bg-white/10 text-white/50 text-sm font-bold rounded-xl transition-colors">
              Cancel
            </Link>
            <button type="submit" disabled={saving}
              className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold rounded-xl transition-all disabled:opacity-50 shadow-lg shadow-emerald-900/20">
              {saving ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : <CheckIcon className="w-4 h-4" />}
              {saving ? 'Creating…' : 'Create Exam'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
