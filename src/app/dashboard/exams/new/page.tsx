// @refresh reset
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import {
  AcademicCapIcon, ArrowLeftIcon, CheckCircleIcon, InformationCircleIcon, SparklesIcon, ArrowPathIcon,
} from '@/lib/icons';
import { toast } from 'sonner';

export default function NewExamPage() {
  const { profile, loading: authLoading } = useAuth();
  const router = useRouter();
  const [courses, setCourses] = useState<{ id: string; title: string }[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    course_id: '',
    title: '',
    description: '',
    duration_minutes: 60,
    total_points: 100,
    passing_score: 70,
    max_attempts: 1,
    randomize_questions: true,
    randomize_options: true,
    is_active: false,
  });

  useEffect(() => {
    fetch('/api/courses').then(r => r.json()).then(j => setCourses(j.data ?? []));
  }, []);

  const canManage = profile?.role === 'admin' || profile?.role === 'teacher';
  const [genDesc, setGenDesc] = useState(false);

  async function generateDescription() {
    if (!form.title) { toast.error('Enter an exam title first'); return; }
    const course = courses.find(c => c.id === form.course_id);
    setGenDesc(true);
    try {
      const prompt = `You are an expert Nigerian secondary school exam designer.
Write concise student-facing exam instructions for the following written exam:

Exam Title: "${form.title}"${course ? `\nSubject/Course: "${course.title}"` : ''}
Duration: ${form.duration_minutes} minutes | Total Points: ${form.total_points} | Pass Mark: ${form.passing_score}%

Return ONLY the instruction text (2-4 sentences). Mention: time allowed, how to answer questions, any material restrictions, and a brief encouragement. No JSON, no headings.`;

      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'custom', prompt }),
      });
      const j = await res.json();
      const text = (j.content ?? j.text ?? j.result ?? '').trim();
      if (!text) { toast.error('AI returned empty — try again'); return; }
      setForm(f => ({ ...f, description: text }));
      toast.success('AI instructions generated');
    } catch (e: any) {
      toast.error(e.message ?? 'AI generation failed');
    } finally {
      setGenDesc(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.course_id || !form.title) { toast.error('Course and title are required'); return; }
    setSubmitting(true);
    try {
      const res = await fetch('/api/exams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          duration_minutes: Number(form.duration_minutes),
          total_points: Number(form.total_points),
          passing_score: Number(form.passing_score),
          max_attempts: Number(form.max_attempts),
        }),
      });
      if (!res.ok) { const j = await res.json(); throw new Error(j.error || 'Failed'); }
      const j = await res.json();
      toast.success('Written exam created! Now add your questions.');
      router.push(`/dashboard/exams/${j.data.id}`);
    } catch (e: any) {
      toast.error(e.message || 'Failed to create exam');
    } finally {
      setSubmitting(false);
    }
  }

  if (authLoading || !profile) {
    return <div className="flex items-center justify-center min-h-[60vh]"><div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" /></div>;
  }

  if (!canManage) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <AcademicCapIcon className="w-16 h-16 text-rose-500/40" />
        <p className="text-card-foreground/50 text-lg font-semibold">Access denied</p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/exams" className="p-2 hover:bg-white/5 rounded-xl transition-all">
          <ArrowLeftIcon className="w-5 h-5 text-card-foreground/50" />
        </Link>
        <div>
          <h1 className="text-2xl font-black text-card-foreground flex items-center gap-2">
            <AcademicCapIcon className="w-7 h-7 text-blue-400" /> Create Written Exam
          </h1>
          <p className="text-card-foreground/50 text-sm">For essays, matching, short-answer. Add questions after creating.</p>
        </div>
      </div>

      {/* CBT tip */}
      <div className="flex items-start gap-3 bg-blue-500/[0.07] border border-blue-500/20 rounded-xl p-4 text-sm">
        <InformationCircleIcon className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
        <p className="text-blue-300/80">
          Need auto-graded MCQ or coding-block tests?{' '}
          <Link href="/dashboard/cbt/new" className="underline underline-offset-2 hover:text-blue-200 font-semibold">Create a CBT Exam instead.</Link>
        </p>
      </div>

      <form onSubmit={handleSubmit} className="bg-card border border-white/[0.08] rounded-2xl p-6 space-y-5">
        <div>
          <label className="block text-xs font-bold text-card-foreground/50 uppercase tracking-wider mb-1.5">Course <span className="text-rose-400">*</span></label>
          <select value={form.course_id} onChange={e => setForm(f => ({ ...f, course_id: e.target.value }))}
            required className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-card-foreground focus:outline-none focus:border-blue-500/50">
            <option value="">Select a course…</option>
            {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-xs font-bold text-card-foreground/50 uppercase tracking-wider mb-1.5">Exam Title <span className="text-rose-400">*</span></label>
          <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} required
            placeholder="e.g. Mid-Term Written Examination — Unit 1"
            className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-card-foreground placeholder-card-foreground/30 focus:outline-none focus:border-blue-500/50" />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-bold text-card-foreground/50 uppercase tracking-wider">Instructions for Students</label>
            <button type="button" onClick={generateDescription} disabled={genDesc || !form.title}
              className="flex items-center gap-1.5 px-3 py-1 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white text-[10px] font-black rounded-lg transition-all">
              {genDesc ? <><ArrowPathIcon className="w-3 h-3 animate-spin" /> Generating…</> : <><SparklesIcon className="w-3 h-3" /> AI Draft</>}
            </button>
          </div>
          <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3}
            placeholder="Topics covered, time allocation, permitted materials…"
            className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-card-foreground placeholder-card-foreground/30 focus:outline-none focus:border-blue-500/50 resize-none" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          {[
            { key: 'duration_minutes', label: 'Duration (minutes)', min: 1 },
            { key: 'total_points', label: 'Total Points', min: 1 },
            { key: 'passing_score', label: 'Passing Score (%)', min: 1, max: 100 },
            { key: 'max_attempts', label: 'Max Attempts', min: 1 },
          ].map(f => (
            <div key={f.key}>
              <label className="block text-xs font-bold text-card-foreground/50 uppercase tracking-wider mb-1.5">{f.label}</label>
              <input type="number" min={f.min} max={f.max}
                value={(form as any)[f.key]}
                onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-card-foreground focus:outline-none focus:border-blue-500/50" />
            </div>
          ))}
        </div>

        <div className="space-y-3">
          {[
            { key: 'randomize_questions', label: 'Randomize question order for each student' },
            { key: 'randomize_options', label: 'Randomize answer options (MCQ questions)' },
            { key: 'is_active', label: 'Make active immediately (students can see and attempt it)' },
          ].map(t => (
            <label key={t.key} className="flex items-center gap-3 cursor-pointer">
              <div onClick={() => setForm(f => ({ ...f, [t.key]: !(f as any)[t.key] }))}
                className={`w-10 h-5 rounded-full transition-all relative ${(form as any)[t.key] ? 'bg-blue-500' : 'bg-white/10'}`}>
                <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-card shadow transition-transform ${(form as any)[t.key] ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </div>
              <span className="text-sm text-card-foreground/70">{t.label}</span>
            </label>
          ))}
        </div>

        <div className="pt-2 flex gap-3">
          <Link href="/dashboard/exams" className="flex-1 py-2.5 text-center bg-white/5 hover:bg-white/10 text-card-foreground/70 font-bold rounded-xl transition-all">Cancel</Link>
          <button type="submit" disabled={submitting || !form.course_id || !form.title}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-blue-500 hover:bg-blue-400 disabled:opacity-50 text-white font-bold rounded-xl transition-all">
            <CheckCircleIcon className="w-4 h-4" />
            {submitting ? 'Creating…' : 'Create Exam'}
          </button>
        </div>
      </form>
    </div>
  );
}
