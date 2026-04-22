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
    level_order: '1',
    next_course_id: '',
    subject: '',
    grade_levels: [] as string[],
  });

  // Nigerian school grade ladder (mirrors /dashboard/courses/new).
  const GRADE_OPTIONS = [
    'Pre-School',
    'Nursery',
    'KG1', 'KG2',
    'Primary 1', 'Primary 2', 'Primary 3', 'Primary 4', 'Primary 5', 'Primary 6',
    'JSS1', 'JSS2', 'JSS3',
    'SS1', 'SS2', 'SS3',
  ];

  function toggleGrade(g: string) {
    setForm(f => ({
      ...f,
      grade_levels: f.grade_levels.includes(g)
        ? f.grade_levels.filter(x => x !== g)
        : [...f.grade_levels, g],
    }));
  }

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
        const md = (c.metadata ?? {}) as Record<string, unknown>;
        setForm({
          title: c.title ?? '',
          description: c.description ?? '',
          program_id: c.program_id ?? '',
          duration_hours: c.duration_hours ? String(c.duration_hours) : '',
          content: c.content ?? '',
          is_published: c.is_published ?? false,
          level_order: String(c.level_order ?? 1),
          next_course_id: c.next_course_id ?? '',
          subject: typeof md.subject === 'string' ? md.subject : '',
          grade_levels: Array.isArray(md.grade_levels) ? md.grade_levels.filter((v: unknown): v is string => typeof v === 'string') : [],
        });
      }
      setPrograms(programsJson.data ?? []);
      setLoading(false);
    }).catch(e => {
      setError(e.message ?? 'Failed to load course');
      setLoading(false);
    });
  }, [profile?.id, authLoading, id]);

  const siblingCourses: any[] = programs
    .find((p: any) => p.id === form.program_id)
    ?.courses?.filter((c: any) => c.id !== id) ?? [];

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
        level_order: parseInt(form.level_order) || 1,
        next_course_id: form.next_course_id || null,
      };
      if (form.duration_hours) payload.duration_hours = parseInt(form.duration_hours);
      // Soft tagging — written even if empty so users can clear previous values.
      const metadata: Record<string, unknown> = {};
      if (form.grade_levels.length) metadata.grade_levels = form.grade_levels;
      if (form.subject.trim()) metadata.subject = form.subject.trim();
      payload.metadata = metadata;

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
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!isStaff) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <p className="text-muted-foreground">Staff access required.</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">

        <Link href="/dashboard/courses"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeftIcon className="w-4 h-4" /> Back to Courses
        </Link>

        <div>
          <div className="flex items-center gap-2 mb-1">
            <BookOpenIcon className="w-5 h-5 text-orange-400" />
            <span className="text-xs font-bold text-orange-400 uppercase tracking-widest">Edit Course</span>
          </div>
          <h1 className="text-3xl font-extrabold">Edit Course</h1>
          <p className="text-muted-foreground text-sm mt-1">Update course details</p>
        </div>

        {error && (
          <div className="flex items-center gap-3 bg-rose-500/10 border border-rose-500/20 rounded-none p-4">
            <ExclamationTriangleIcon className="w-5 h-5 text-rose-400 flex-shrink-0" />
            <p className="text-rose-400 text-sm">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="bg-card shadow-sm border border-border rounded-none p-6 space-y-5">

          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">
              Course Title <span className="text-rose-400">*</span>
            </label>
            <input type="text" required value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="e.g. Introduction to Python Variables"
              className="w-full px-4 py-3 bg-card shadow-sm border border-border rounded-none text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-orange-500 transition-colors" />
          </div>

          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">
              Programme <span className="text-rose-400">*</span>
            </label>
            <select required value={form.program_id}
              onChange={e => setForm(f => ({ ...f, program_id: e.target.value }))}
              className="w-full px-4 py-3 bg-card shadow-sm border border-border rounded-none text-sm text-foreground focus:outline-none focus:border-orange-500 cursor-pointer">
              <option value="">Select a programme…</option>
              {programs.map(p => (
                <option key={p.id} value={p.id}>{p.name} — {p.difficulty_level}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">Level Order</label>
              <input type="number" min="1" value={form.level_order}
                onChange={e => setForm(f => ({ ...f, level_order: e.target.value }))}
                placeholder="1"
                className="w-full px-4 py-3 bg-card shadow-sm border border-border rounded-none text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-orange-500 transition-colors" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">Next Course (promotes to)</label>
              <select value={form.next_course_id}
                onChange={e => setForm(f => ({ ...f, next_course_id: e.target.value }))}
                disabled={siblingCourses.length === 0}
                className="w-full px-4 py-3 bg-card shadow-sm border border-border rounded-none text-sm text-foreground focus:outline-none focus:border-orange-500 cursor-pointer disabled:opacity-40">
                <option value="">— End of track —</option>
                {siblingCourses.map((c: any) => (
                  <option key={c.id} value={c.id}>{c.title}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Subject */}
          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">
              Subject / Discipline
            </label>
            <input type="text" value={form.subject}
              onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
              placeholder="e.g. Computer Science, Robotics, Digital Literacy"
              className="w-full px-4 py-3 bg-card shadow-sm border border-border rounded-none text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-orange-500 transition-colors" />
          </div>

          {/* Target grades / classes */}
          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">
              Target Grades / Classes
              <span className="ml-1 text-[10px] text-muted-foreground/70 normal-case font-normal">
                (pick one or more — drives class filters on lesson plans)
              </span>
            </label>
            <div className="flex flex-wrap gap-1.5">
              {GRADE_OPTIONS.map(g => {
                const active = form.grade_levels.includes(g);
                return (
                  <button
                    key={g}
                    type="button"
                    onClick={() => toggleGrade(g)}
                    className={`px-2.5 py-1 text-[11px] font-black uppercase tracking-wider border transition ${
                      active
                        ? 'bg-orange-500/15 border-orange-500/40 text-orange-300'
                        : 'bg-card border-border text-muted-foreground hover:text-foreground hover:border-orange-500/30'
                    }`}
                  >
                    {g}
                  </button>
                );
              })}
            </div>
            {form.grade_levels.length > 0 && (
              <p className="mt-2 text-[10px] text-muted-foreground">
                Selected: <span className="text-orange-400 font-bold">{form.grade_levels.join(', ')}</span>
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">Duration (hours)</label>
              <input type="number" min="1" value={form.duration_hours}
                onChange={e => setForm(f => ({ ...f, duration_hours: e.target.value }))}
                placeholder="e.g. 8"
                className="w-full px-4 py-3 bg-card shadow-sm border border-border rounded-none text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-orange-500 transition-colors" />
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-3 cursor-pointer">
                <button type="button"
                  onClick={() => setForm(f => ({ ...f, is_published: !f.is_published }))}
                  className={`w-11 h-6 rounded-full transition-all relative flex-shrink-0 ${form.is_published ? 'bg-emerald-500' : 'bg-muted'}`}>
                  <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all ${form.is_published ? 'left-[22px]' : 'left-0.5'}`} />
                </button>
                <span className="text-sm text-muted-foreground">Published</span>
              </label>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">Description</label>
            <textarea rows={3} value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="What will students learn in this course?"
              className="w-full px-4 py-3 bg-card shadow-sm border border-border rounded-none text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-orange-500 transition-colors resize-none" />
          </div>

          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">Course Notes / Outline</label>
            <textarea rows={5} value={form.content}
              onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
              placeholder="Course topics, outline, or resources…"
              className="w-full px-4 py-3 bg-card shadow-sm border border-border rounded-none text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-orange-500 transition-colors resize-none" />
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Link href="/dashboard/courses"
              className="px-5 py-2.5 bg-card shadow-sm hover:bg-muted text-muted-foreground text-sm font-bold rounded-none transition-colors">
              Cancel
            </Link>
            <button type="submit" disabled={saving}
              className="flex items-center gap-2 px-6 py-2.5 bg-orange-600 hover:bg-orange-500 text-foreground text-sm font-bold rounded-none transition-all disabled:opacity-50 shadow-lg shadow-orange-900/20">
              {saving ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : <CheckIcon className="w-4 h-4" />}
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
}
