// @refresh reset
'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import { AcademicCapIcon, ArrowLeftIcon, CheckCircleIcon } from '@/lib/icons';
import { toast } from 'sonner';

export default function EditExamPage() {
  const { id } = useParams<{ id: string }>();
  const { profile, loading: authLoading } = useAuth();
  const router = useRouter();
  const [courses, setCourses] = useState<{ id: string; title: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    course_id: '', title: '', description: '', duration_minutes: 60,
    total_points: 100, passing_score: 70, max_attempts: 1,
    randomize_questions: true, randomize_options: true, is_active: false,
  });

  useEffect(() => {
    Promise.all([
      fetch(`/api/exams/${id}`).then(r => r.json()),
      fetch('/api/courses').then(r => r.json()),
    ]).then(([examJson, coursesJson]) => {
      const e = examJson.data;
      if (e) setForm({
        course_id: e.course_id ?? '',
        title: e.title ?? '',
        description: e.description ?? '',
        duration_minutes: e.duration_minutes ?? 60,
        total_points: e.total_points ?? 100,
        passing_score: e.passing_score ?? 70,
        max_attempts: e.max_attempts ?? 1,
        randomize_questions: e.randomize_questions ?? true,
        randomize_options: e.randomize_options ?? true,
        is_active: e.is_active ?? false,
      });
      setCourses(coursesJson.data ?? []);
      setLoading(false);
    });
  }, [id]);

  const canManage = profile?.role === 'admin' || profile?.role === 'teacher';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch(`/api/exams/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, duration_minutes: Number(form.duration_minutes), total_points: Number(form.total_points), passing_score: Number(form.passing_score), max_attempts: Number(form.max_attempts) }),
      });
      if (!res.ok) { const j = await res.json(); throw new Error(j.error); }
      toast.success('Exam updated!');
      router.push(`/dashboard/exams/${id}`);
    } catch (e: any) { toast.error(e.message || 'Failed to update'); }
    finally { setSubmitting(false); }
  }

  if (authLoading || loading) return <div className="flex items-center justify-center min-h-[60vh]"><div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" /></div>;
  if (!canManage) return <div className="p-6 text-center text-card-foreground/50">Access denied</div>;

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href={`/dashboard/exams/${id}`} className="p-2 hover:bg-white/5 rounded-xl transition-all">
          <ArrowLeftIcon className="w-5 h-5 text-card-foreground/50" />
        </Link>
        <h1 className="text-2xl font-black text-card-foreground flex items-center gap-2">
          <AcademicCapIcon className="w-7 h-7 text-blue-400" /> Edit Exam
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="bg-card border border-white/[0.08] rounded-2xl p-6 space-y-5">
        <div>
          <label className="block text-xs font-bold text-card-foreground/50 uppercase tracking-wider mb-1.5">Course</label>
          <select value={form.course_id} onChange={e => setForm(f => ({ ...f, course_id: e.target.value }))}
            className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-card-foreground focus:outline-none focus:border-blue-500/50">
            <option value="">Select a course…</option>
            {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-bold text-card-foreground/50 uppercase tracking-wider mb-1.5">Title</label>
          <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} required
            className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-card-foreground focus:outline-none focus:border-blue-500/50" />
        </div>
        <div>
          <label className="block text-xs font-bold text-card-foreground/50 uppercase tracking-wider mb-1.5">Description</label>
          <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3}
            className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-card-foreground focus:outline-none focus:border-blue-500/50 resize-none" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          {[
            { key: 'duration_minutes', label: 'Duration (min)' },
            { key: 'total_points', label: 'Total Points' },
            { key: 'passing_score', label: 'Pass Score (%)' },
            { key: 'max_attempts', label: 'Max Attempts' },
          ].map(f => (
            <div key={f.key}>
              <label className="block text-xs font-bold text-card-foreground/50 uppercase tracking-wider mb-1.5">{f.label}</label>
              <input type="number" min={1} value={(form as any)[f.key]} onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-card-foreground focus:outline-none focus:border-blue-500/50" />
            </div>
          ))}
        </div>
        <div className="space-y-3">
          {[
            { key: 'randomize_questions', label: 'Randomize question order' },
            { key: 'randomize_options', label: 'Randomize answer options' },
            { key: 'is_active', label: 'Active (visible to students)' },
          ].map(t => (
            <label key={t.key} className="flex items-center gap-3 cursor-pointer">
              <div onClick={() => setForm(f => ({ ...f, [t.key]: !(f as any)[t.key] }))}
                className={`w-10 h-5 rounded-full transition-all relative ${(form as any)[t.key] ? 'bg-blue-500' : 'bg-white/10'}`}>
                <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${(form as any)[t.key] ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </div>
              <span className="text-sm text-card-foreground/70">{t.label}</span>
            </label>
          ))}
        </div>
        <div className="flex gap-3 pt-2">
          <Link href={`/dashboard/exams/${id}`} className="flex-1 py-2.5 text-center bg-white/5 hover:bg-white/10 text-card-foreground/70 font-bold rounded-xl transition-all">Cancel</Link>
          <button type="submit" disabled={submitting}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-blue-500 hover:bg-blue-400 disabled:opacity-50 text-white font-bold rounded-xl transition-all">
            <CheckCircleIcon className="w-4 h-4" /> {submitting ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  );
}
