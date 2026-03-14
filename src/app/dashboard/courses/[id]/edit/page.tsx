// @refresh reset
'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import {
  ArrowLeftIcon, BookOpenIcon, CheckIcon,
  ExclamationTriangleIcon, ArrowPathIcon,
} from '@/lib/icons';

export default function EditCoursePage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;
  const { profile, loading: authLoading } = useAuth();

  const [programs, setPrograms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    title: '',
    description: '',
    program_id: '',
    duration_hours: '',
    content: '',
    is_published: false,
  });

  const isStaff = profile?.role === 'admin' || profile?.role === 'teacher';

  // Load course + programs in parallel
  useEffect(() => {
    if (authLoading || !profile || !id) return;

    Promise.all([
      fetch(`/api/courses/${id}`).then(r => r.json()),
      fetch('/api/programs').then(r => r.json()),
    ]).then(([courseJson, programsJson]) => {
      const c = courseJson.data;
      if (c) {
        setForm({
          title: c.title ?? '',
          description: c.description ?? '',
          program_id: c.program_id ?? '',
          duration_hours: c.duration_hours ? String(c.duration_hours) : '',
          content: c.content ?? '',
          is_published: c.is_published ?? false,
        });
      }
      setPrograms(programsJson.data ?? []);
      setLoading(false);
    }).catch(e => {
      setError(e.message ?? 'Failed to load course');
      setLoading(false);
    });
  }, [profile?.id, authLoading, id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || !form.program_id) {
      setError('Title and programme are required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload: any = {
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        program_id: form.program_id,
        content: form.content.trim() || undefined,
        is_published: form.is_published,
      };
      if (form.duration_hours) payload.duration_hours = parseInt(form.duration_hours);

      const res = await fetch(`/api/courses/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || json.error || 'Failed to update course');
      router.push('/dashboard/courses');
    } catch (e: any) {
      setError(e.message ?? 'Failed to update course');
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || loading) return (
    <div className="min-h-screen bg-[#0f0f1a] flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
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

        <Link href="/dashboard/courses"
          className="inline-flex items-center gap-2 text-sm text-white/40 hover:text-white transition-colors">
          <ArrowLeftIcon className="w-4 h-4" /> Back to Courses
        </Link>

        <div>
          <div className="flex items-center gap-2 mb-1">
            <BookOpenIcon className="w-5 h-5 text-violet-400" />
            <span className="text-xs font-bold text-violet-400 uppercase tracking-widest">Edit Course</span>
          </div>
          <h1 className="text-3xl font-extrabold">Edit Course</h1>
          <p className="text-white/40 text-sm mt-1">Update course details</p>
        </div>

        {error && (
          <div className="flex items-center gap-3 bg-rose-500/10 border border-rose-500/20 rounded-xl p-4">
            <ExclamationTriangleIcon className="w-5 h-5 text-rose-400 flex-shrink-0" />
            <p className="text-rose-400 text-sm">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-5">

          <div>
            <label className="block text-xs font-semibold text-white/40 uppercase tracking-widest mb-1.5">
              Course Title <span className="text-rose-400">*</span>
            </label>
            <input type="text" required value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="e.g. Introduction to Python Variables"
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/25 focus:outline-none focus:border-violet-500 transition-colors" />
          </div>

          <div>
            <label className="block text-xs font-semibold text-white/40 uppercase tracking-widest mb-1.5">
              Programme <span className="text-rose-400">*</span>
            </label>
            <select required value={form.program_id}
              onChange={e => setForm(f => ({ ...f, program_id: e.target.value }))}
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-violet-500 cursor-pointer">
              <option value="">Select a programme…</option>
              {programs.map(p => (
                <option key={p.id} value={p.id}>{p.name} — {p.difficulty_level}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-white/40 uppercase tracking-widest mb-1.5">Duration (hours)</label>
              <input type="number" min="1" value={form.duration_hours}
                onChange={e => setForm(f => ({ ...f, duration_hours: e.target.value }))}
                placeholder="e.g. 8"
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/25 focus:outline-none focus:border-violet-500 transition-colors" />
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-3 cursor-pointer">
                <button type="button"
                  onClick={() => setForm(f => ({ ...f, is_published: !f.is_published }))}
                  className={`w-11 h-6 rounded-full transition-all relative flex-shrink-0 ${form.is_published ? 'bg-emerald-500' : 'bg-white/10'}`}>
                  <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all ${form.is_published ? 'left-[22px]' : 'left-0.5'}`} />
                </button>
                <span className="text-sm text-white/60">Published</span>
              </label>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-white/40 uppercase tracking-widest mb-1.5">Description</label>
            <textarea rows={3} value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="What will students learn in this course?"
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/25 focus:outline-none focus:border-violet-500 transition-colors resize-none" />
          </div>

          <div>
            <label className="block text-xs font-semibold text-white/40 uppercase tracking-widest mb-1.5">Course Notes / Outline</label>
            <textarea rows={5} value={form.content}
              onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
              placeholder="Course topics, outline, or resources…"
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/25 focus:outline-none focus:border-violet-500 transition-colors resize-none" />
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Link href="/dashboard/courses"
              className="px-5 py-2.5 bg-white/5 hover:bg-white/10 text-white/50 text-sm font-bold rounded-xl transition-colors">
              Cancel
            </Link>
            <button type="submit" disabled={saving}
              className="flex items-center gap-2 px-6 py-2.5 bg-violet-600 hover:bg-violet-500 text-white text-sm font-bold rounded-xl transition-all disabled:opacity-50 shadow-lg shadow-violet-900/20">
              {saving ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : <CheckIcon className="w-4 h-4" />}
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
}
