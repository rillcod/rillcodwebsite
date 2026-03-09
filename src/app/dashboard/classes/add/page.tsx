'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import {
  ArrowLeftIcon, BookOpenIcon, CheckIcon,
  ExclamationTriangleIcon, ArrowPathIcon,
} from '@heroicons/react/24/outline';

export default function AddClassPage() {
  const router = useRouter();
  const { profile, loading: authLoading } = useAuth();
  const [programs, setPrograms] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [schools, setSchools] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: '',
    description: '',
    program_id: '',
    teacher_id: '',
    school_id: '',
    max_students: '20',
    start_date: '',
    end_date: '',
    schedule: '',
    status: 'scheduled',
  });

  useEffect(() => {
    if (authLoading || !profile) return;
    const db = createClient();

    async function loadData() {
      // 1. Basic lookups
      const [programsRes, teachersRes] = await Promise.all([
        db.from('programs').select('id, name').eq('is_active', true).order('name'),
        db.from('portal_users').select('id, full_name').eq('role', 'teacher').eq('is_active', true).order('full_name'),
      ]);

      // 2. Schools lookup (role-dependent)
      let schoolsQuery = db.from('schools').select('id, name').eq('status', 'approved').order('name');

      if (profile?.role === 'teacher') {
        const { data: assignments } = await db
          .from('teacher_schools')
          .select('school_id')
          .eq('teacher_id', profile.id);

        const schoolIds = assignments?.map(a => a.school_id) || [];
        if (schoolIds.length > 0) {
          schoolsQuery = schoolsQuery.in('id', schoolIds);
        } else if (profile.school_id) {
          schoolsQuery = schoolsQuery.eq('id', profile.school_id);
        }
      }

      const { data: sData } = await schoolsQuery;

      setPrograms(programsRes.data ?? []);
      setTeachers(teachersRes.data ?? []);
      setSchools(sData ?? []);
    }

    loadData();
  }, [profile?.id, authLoading]);

  const isStaff = profile?.role === 'admin' || profile?.role === 'teacher';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.program_id) {
      setError('Class name and programme are required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload: any = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        program_id: form.program_id,
        teacher_id: form.teacher_id || profile!.id,
        school_id: form.school_id || null,
        max_students: parseInt(form.max_students) || 20,
        status: form.status,
        schedule: form.schedule.trim() || null,
        current_students: 0,
      };
      if (form.start_date) payload.start_date = form.start_date;
      if (form.end_date) payload.end_date = form.end_date;

      const { error: err } = await createClient().from('classes').insert(payload);
      if (err) throw err;
      router.push('/dashboard/classes');
    } catch (e: any) {
      setError(e.message ?? 'Failed to create class');
    } finally {
      setSaving(false);
    }
  };

  if (authLoading) return (
    <div className="min-h-screen bg-[#0f0f1a] flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
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

        <Link href="/dashboard/classes"
          className="inline-flex items-center gap-2 text-sm text-white/40 hover:text-white transition-colors">
          <ArrowLeftIcon className="w-4 h-4" /> Back to Classes
        </Link>

        <div>
          <div className="flex items-center gap-2 mb-1">
            <BookOpenIcon className="w-5 h-5 text-blue-400" />
            <span className="text-xs font-bold text-blue-400 uppercase tracking-widest">New Class</span>
          </div>
          <h1 className="text-3xl font-extrabold">Create Class</h1>
          <p className="text-white/40 text-sm mt-1">Set up a new teaching group</p>
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
              Class Name <span className="text-rose-400">*</span>
            </label>
            <input type="text" required value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Python Beginners — Batch A"
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/25 focus:outline-none focus:border-blue-500 transition-colors" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-white/40 uppercase tracking-widest mb-1.5">
                Programme <span className="text-rose-400">*</span>
              </label>
              <select required value={form.program_id}
                onChange={e => setForm(f => ({ ...f, program_id: e.target.value }))}
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-blue-500 cursor-pointer">
                <option value="">Select programme…</option>
                {programs.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-white/40 uppercase tracking-widest mb-1.5">Assigned Teacher</label>
              <select value={form.teacher_id}
                onChange={e => setForm(f => ({ ...f, teacher_id: e.target.value }))}
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-blue-500 cursor-pointer">
                <option value="">— Self (current user) —</option>
                {teachers.map(t => (
                  <option key={t.id} value={t.id}>{t.full_name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Partner School */}
          <div>
            <label className="block text-xs font-semibold text-white/40 uppercase tracking-widest mb-1.5">
              Partner School <span className="text-white/25 font-normal normal-case">(optional — leave blank for bootcamp/online)</span>
            </label>
            <select value={form.school_id}
              onChange={e => setForm(f => ({ ...f, school_id: e.target.value }))}
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-blue-500 cursor-pointer">
              <option value="">— No specific school —</option>
              {schools.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-white/40 uppercase tracking-widest mb-1.5">Max Students</label>
              <input type="number" min="1" max="100" value={form.max_students}
                onChange={e => setForm(f => ({ ...f, max_students: e.target.value }))}
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-blue-500 transition-colors" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-white/40 uppercase tracking-widest mb-1.5">Start Date</label>
              <input type="date" value={form.start_date}
                onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-blue-500 transition-colors" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-white/40 uppercase tracking-widest mb-1.5">End Date</label>
              <input type="date" value={form.end_date}
                onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-blue-500 transition-colors" />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-white/40 uppercase tracking-widest mb-1.5">Schedule</label>
              <input type="text" value={form.schedule}
                onChange={e => setForm(f => ({ ...f, schedule: e.target.value }))}
                placeholder="e.g. Tuesdays 3–5pm"
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/25 focus:outline-none focus:border-blue-500 transition-colors" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-white/40 uppercase tracking-widest mb-1.5">Initial Status</label>
              <select value={form.status}
                onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-blue-500 cursor-pointer">
                <option value="scheduled">Scheduled</option>
                <option value="active">Active</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-white/40 uppercase tracking-widest mb-1.5">Description</label>
            <textarea rows={3} value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Optional class description or notes…"
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/25 focus:outline-none focus:border-blue-500 transition-colors resize-none" />
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Link href="/dashboard/classes"
              className="px-5 py-2.5 bg-white/5 hover:bg-white/10 text-white/50 text-sm font-bold rounded-xl transition-colors">
              Cancel
            </Link>
            <button type="submit" disabled={saving}
              className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded-xl transition-all disabled:opacity-50 shadow-lg shadow-blue-900/20">
              {saving ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : <CheckIcon className="w-4 h-4" />}
              {saving ? 'Creating…' : 'Create Class'}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
}
