'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import {
  ArrowLeftIcon, ClipboardDocumentListIcon, CalendarIcon,
  CheckIcon, ExclamationTriangleIcon, ArrowPathIcon, PlusIcon, TrashIcon,
  ChevronUpIcon, ChevronDownIcon, AcademicCapIcon,
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

export default function NewAssignmentPage() {
  const router = useRouter();
  const { profile, loading: authLoading } = useAuth();
  const [courses, setCourses] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    title: '',
    description: '',
    instructions: '',
    course_id: '',
    due_date: '',
    max_points: '100',
    assignment_type: 'homework',
  });
  const [questions, setQuestions] = useState<Question[]>([]);

  useEffect(() => {
    if (authLoading || !profile) return;
    createClient()
      .from('courses')
      .select('id, title, programs(name)')
      .eq('is_active', true)
      .order('title')
      .then(({ data }) => setCourses(data ?? []));
  }, [profile?.id, authLoading]);

  const addQuestion = () => setQuestions(q => [...q, emptyQuestion()]);
  const removeQuestion = (i: number) => setQuestions(q => q.filter((_, idx) => idx !== i));
  const updateQuestion = (i: number, patch: Partial<Question>) =>
    setQuestions(q => q.map((item, idx) => idx === i ? { ...item, ...patch } : item));
  const updateOption = (qi: number, oi: number, val: string) =>
    setQuestions(q => q.map((item, idx) => idx === qi ? { ...item, options: item.options.map((o, j) => j === oi ? val : o) } : item));
  const moveQuestion = (i: number, dir: -1 | 1) => {
    setQuestions(prev => {
      const next = [...prev];
      const target = i + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[i], next[target]] = [next[target], next[i]];
      return next;
    });
  };

  const isStaff = profile?.role === 'admin' || profile?.role === 'teacher';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || !form.course_id) {
      setError('Title and course are required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload: any = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        instructions: form.instructions.trim() || null,
        course_id: form.course_id,
        max_points: parseInt(form.max_points) || 100,
        assignment_type: form.assignment_type,
        is_active: true,
        created_by: profile!.id,
        questions: questions.length > 0 ? questions.filter(q => q.question_text.trim()) : null,
      };
      if (form.due_date) payload.due_date = new Date(form.due_date).toISOString();

      const { error: err } = await createClient().from('assignments').insert(payload);
      if (err) throw err;
      router.push('/dashboard/assignments');
    } catch (e: any) {
      setError(e.message ?? 'Failed to create assignment');
    } finally {
      setSaving(false);
    }
  };

  if (authLoading) return (
    <div className="min-h-screen bg-[#0f0f1a] flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
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

        <Link href="/dashboard/assignments"
          className="inline-flex items-center gap-2 text-sm text-white/40 hover:text-white transition-colors">
          <ArrowLeftIcon className="w-4 h-4" /> Back to Assignments
        </Link>

        <div>
          <div className="flex items-center gap-2 mb-1">
            <ClipboardDocumentListIcon className="w-5 h-5 text-amber-400" />
            <span className="text-xs font-bold text-amber-400 uppercase tracking-widest">New Assignment</span>
          </div>
          <h1 className="text-3xl font-extrabold">Create Assignment</h1>
          <p className="text-white/40 text-sm mt-1">Add a new assignment for your students</p>
        </div>

        {error && (
          <div className="flex items-center gap-3 bg-rose-500/10 border border-rose-500/20 rounded-xl p-4">
            <ExclamationTriangleIcon className="w-5 h-5 text-rose-400 flex-shrink-0" />
            <p className="text-rose-400 text-sm">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-5">

          {/* Title */}
          <div>
            <label className="block text-xs font-semibold text-white/40 uppercase tracking-widest mb-1.5">
              Title <span className="text-rose-400">*</span>
            </label>
            <input type="text" required value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="e.g. Python Functions Exercise"
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/25 focus:outline-none focus:border-amber-500 transition-colors" />
          </div>

          {/* Course */}
          <div>
            <label className="block text-xs font-semibold text-white/40 uppercase tracking-widest mb-1.5">
              Course <span className="text-rose-400">*</span>
            </label>
            <select required value={form.course_id}
              onChange={e => setForm(f => ({ ...f, course_id: e.target.value }))}
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-amber-500 cursor-pointer">
              <option value="">Select a course…</option>
              {courses.map(c => (
                <option key={c.id} value={c.id}>{c.title}{c.programs?.name ? ` — ${c.programs.name}` : ''}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Type */}
            <div>
              <label className="block text-xs font-semibold text-white/40 uppercase tracking-widest mb-1.5">Type</label>
              <select value={form.assignment_type}
                onChange={e => setForm(f => ({ ...f, assignment_type: e.target.value }))}
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-amber-500 cursor-pointer">
                <option value="homework">Homework</option>
                <option value="project">Project</option>
                <option value="quiz">Quiz</option>
                <option value="exam">Exam</option>
                <option value="presentation">Presentation</option>
              </select>
            </div>

            {/* Max Points */}
            <div>
              <label className="block text-xs font-semibold text-white/40 uppercase tracking-widest mb-1.5">Max Points</label>
              <input type="number" min="1" max="1000" value={form.max_points}
                onChange={e => setForm(f => ({ ...f, max_points: e.target.value }))}
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-amber-500 transition-colors" />
            </div>

            {/* Due Date */}
            <div>
              <label className="block text-xs font-semibold text-white/40 uppercase tracking-widest mb-1.5">
                <span className="flex items-center gap-1"><CalendarIcon className="w-3.5 h-3.5" /> Due Date</span>
              </label>
              <input type="datetime-local" value={form.due_date}
                onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-amber-500 transition-colors" />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-white/40 uppercase tracking-widest mb-1.5">Description</label>
            <textarea rows={3} value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Brief overview of the assignment…"
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/25 focus:outline-none focus:border-amber-500 transition-colors resize-none" />
          </div>

          {/* Instructions */}
          <div>
            <label className="block text-xs font-semibold text-white/40 uppercase tracking-widest mb-1.5">Instructions</label>
            <textarea rows={4} value={form.instructions}
              onChange={e => setForm(f => ({ ...f, instructions: e.target.value }))}
              placeholder="Step-by-step instructions for students…"
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/25 focus:outline-none focus:border-amber-500 transition-colors resize-none" />
          </div>

          {/* ── Question Canvas ── */}
          <div className="space-y-4 pt-4 border-t border-white/10">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-white/60 uppercase tracking-widest flex items-center gap-2">
                  <AcademicCapIcon className="w-4 h-4 text-amber-400" />
                  Questions ({questions.length})
                </h2>
                <p className="text-[10px] text-white/30 mt-0.5">Optional: Add questions for an interactive homework experience</p>
              </div>
              <button type="button" onClick={addQuestion}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 rounded-xl transition-colors">
                <PlusIcon className="w-3.5 h-3.5" /> Add Question
              </button>
            </div>

            {questions.map((q, qi) => (
              <div key={qi} className="bg-white/3 border border-white/10 rounded-2xl overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2 bg-white/5 border-b border-white/10">
                  <span className="text-[10px] font-black text-white/30 uppercase tracking-tighter">Q{qi + 1}</span>
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => moveQuestion(qi, -1)} disabled={qi === 0}
                      className="p-1 text-white/20 hover:text-white/60 disabled:opacity-0 transition-colors">
                      <ChevronUpIcon className="w-3.5 h-3.5" />
                    </button>
                    <button type="button" onClick={() => moveQuestion(qi, 1)} disabled={qi === questions.length - 1}
                      className="p-1 text-white/20 hover:text-white/60 disabled:opacity-0 transition-colors">
                      <ChevronDownIcon className="w-3.5 h-3.5" />
                    </button>
                    <button type="button" onClick={() => removeQuestion(qi)}
                      className="p-1 text-rose-400/60 hover:text-rose-400 transition-colors">
                      <TrashIcon className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <div className="p-4 space-y-4">
                  <textarea rows={2} value={q.question_text}
                    onChange={e => updateQuestion(qi, { question_text: e.target.value })}
                    placeholder="Enter question text…"
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/25 focus:outline-none focus:border-amber-500 transition-colors resize-none" />

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-[10px] text-white/40 uppercase tracking-widest mb-1">Type</label>
                      <select value={q.question_type}
                        onChange={e => updateQuestion(qi, { question_type: e.target.value, options: ['', '', '', ''], correct_answer: '' })}
                        className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-xs text-white focus:outline-none cursor-pointer">
                        <option value="multiple_choice">Multiple Choice</option>
                        <option value="true_false">True / False</option>
                        <option value="fill_blank">Fill in Blank</option>
                        <option value="essay">Essay</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] text-white/40 uppercase tracking-widest mb-1">Points</label>
                      <input type="number" min="1" value={q.points}
                        onChange={e => updateQuestion(qi, { points: parseInt(e.target.value) || 1 })}
                        className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-xs text-white focus:outline-none" />
                    </div>
                    <div>
                      <label className="block text-[10px] text-white/40 uppercase tracking-widest mb-1">Correct Answer</label>
                      {q.question_type === 'true_false' ? (
                        <select value={q.correct_answer}
                          onChange={e => updateQuestion(qi, { correct_answer: e.target.value })}
                          className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-xs text-white focus:outline-none cursor-pointer">
                          <option value="">Select…</option>
                          <option value="True">True</option>
                          <option value="False">False</option>
                        </select>
                      ) : (
                        <input type="text" value={q.correct_answer}
                          onChange={e => updateQuestion(qi, { correct_answer: e.target.value })}
                          placeholder="Correct answer…"
                          className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-xs text-white placeholder-white/20 focus:outline-none" />
                      )}
                    </div>
                  </div>

                  {q.question_type === 'multiple_choice' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {q.options.map((opt, oi) => (
                        <div key={oi} className="flex items-center gap-2">
                          <span className="text-[10px] text-white/30 w-4">{String.fromCharCode(65 + oi)}.</span>
                          <input type="text" value={opt}
                            onChange={e => updateOption(qi, oi, e.target.value)}
                            placeholder={`Option ${String.fromCharCode(65 + oi)}`}
                            className="flex-1 px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-xs text-white placeholder-white/20 focus:outline-none" />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Link href="/dashboard/assignments"
              className="px-5 py-2.5 bg-white/5 hover:bg-white/10 text-white/50 text-sm font-bold rounded-xl transition-colors">
              Cancel
            </Link>
            <button type="submit" disabled={saving}
              className="flex items-center gap-2 px-6 py-2.5 bg-amber-600 hover:bg-amber-500 text-white text-sm font-bold rounded-xl transition-all disabled:opacity-50 shadow-lg shadow-amber-900/20">
              {saving ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : <CheckIcon className="w-4 h-4" />}
              {saving ? 'Creating…' : 'Create Assignment'}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
}
