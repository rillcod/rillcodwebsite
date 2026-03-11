'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import {
  ArrowLeftIcon, BookOpenIcon, CheckIcon,
  ExclamationTriangleIcon, ArrowPathIcon, UserIcon,
  BuildingOfficeIcon,
} from '@heroicons/react/24/outline';

export default function AddClassPage() {
  const router = useRouter();
  const { profile, loading: authLoading } = useAuth();
  const [programs, setPrograms] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [schools, setSchools] = useState<any[]>([]);
  const [availableStudents, setAvailableStudents] = useState<any[]>([]);
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
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

        const schoolIds = assignments?.map(a => a.school_id).filter(Boolean) || [];
        if (profile.school_id && !schoolIds.includes(profile.school_id)) schoolIds.push(profile.school_id);

        if (schoolIds.length > 0) {
          schoolsQuery = schoolsQuery.in('id', schoolIds);
        }
      }

      const { data: sData } = await schoolsQuery;

      setPrograms(programsRes.data ?? []);
      setTeachers(teachersRes.data ?? []);
      setSchools(sData ?? []);
    }

    loadData();
  }, [profile?.id, authLoading]);

  // Fetch available students when program or school changes
  useEffect(() => {
    if (!form.program_id) {
      setAvailableStudents([]);
      setSelectedStudents([]);
      return;
    }
    const db = createClient();
    setLoadingStudents(true);
    async function fetchStudents() {
      try {
        // 1. Get schools for permissions (teachers only)
        const { data: assignments } = await db
          .from('teacher_schools')
          .select('school_id')
          .eq('teacher_id', profile!.id);
        const assignedSchoolIds = assignments?.map(a => a.school_id).filter(Boolean) || [];
        if (profile!.school_id && !assignedSchoolIds.includes(profile!.school_id)) assignedSchoolIds.push(profile!.school_id);

        // 2. Fetch the "Pool" from portal_users (active students who can be assigned)
        let poolQuery = db.from('portal_users')
          .select('id, full_name, email, school_id, school_name, section_class')
          .eq('role', 'student')
          .neq('is_deleted', true);

        if (profile?.role === 'admin') {
          // Admins see all students in selected school
          if (form.school_id) {
            const sName = schools.find(s => s.id === form.school_id)?.name;
            if (sName) {
              poolQuery = poolQuery.or(`school_id.eq.${form.school_id},school_name.eq."${sName}"`);
            } else {
              poolQuery = poolQuery.eq('school_id', form.school_id);
            }
          }
        } else {
          // Staff/Teachers see students in their school
          if (form.school_id) {
            const sName = schools.find(s => s.id === form.school_id)?.name;
            if (sName) {
              poolQuery = poolQuery.or(`school_id.eq.${form.school_id},school_name.eq."${sName}"`);
            } else {
              poolQuery = poolQuery.eq('school_id', form.school_id);
            }
          } else if (assignedSchoolIds.length > 0) {
            // Match any assigned school ID or matching school name
            const names = schools.filter(s => assignedSchoolIds.includes(s.id)).map(s => `"${s.name}"`);
            if (names.length > 0) {
              poolQuery = poolQuery.or(`school_id.in.(${assignedSchoolIds.join(',')}),school_name.in.(${names.join(',')})`);
            } else {
              poolQuery = poolQuery.in('school_id', assignedSchoolIds);
            }
          }
        }

        const { data: studs } = await poolQuery.order('full_name');
        setAvailableStudents(studs ?? []);

        // 3. Count "Pending Admission" (students registry table where user_id is null)
        let pendingQuery = db.from('students')
          .select('id')
          .is('user_id', null);

        if (form.school_id) {
          const sName = schools.find(s => s.id === form.school_id)?.name;
          if (sName) {
            pendingQuery = pendingQuery.or(`school_id.eq.${form.school_id},school_name.eq."${sName}",created_by.eq.${profile!.id}`);
          } else {
            pendingQuery = pendingQuery.or(`school_id.eq.${form.school_id},created_by.eq.${profile!.id}`);
          }
        } else if (profile?.role === 'teacher') {
          if (assignedSchoolIds.length > 0) {
            pendingQuery = pendingQuery.or(`school_id.in.(${assignedSchoolIds.join(',')}),created_by.eq.${profile.id}`);
          } else {
            pendingQuery = pendingQuery.eq('created_by', profile.id);
          }
        }

        const { data: pData } = await pendingQuery;
        setPendingCount(pData?.length ?? 0);

      } catch (err) {
        console.error('Error fetching students:', err);
      } finally {
        setLoadingStudents(false);
      }
    }
    fetchStudents();
  }, [form.program_id, form.school_id]);

  const isStaff = profile?.role === 'admin' || profile?.role === 'teacher' || profile?.role === 'school';

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
        current_students: selectedStudents.length,
      };
      if (form.start_date) payload.start_date = form.start_date;
      if (form.end_date) payload.end_date = form.end_date;

      const db = createClient();
      const { error: err } = await db.from('classes').insert(payload);
      if (err) throw err;

      // 2. Update students' section_class and ensure they are enrolled in the program
      if (selectedStudents.length > 0) {
        // Update class assignment and school_id sync
        const updatePayload: any = { section_class: form.name.trim() };
        if (form.school_id) updatePayload.school_id = form.school_id;

        await db.from('portal_users')
          .update(updatePayload)
          .in('id', selectedStudents);

        // Ensure enrollment exists for each student in this program
        const enrollments = selectedStudents.map(userId => ({
          user_id: userId,
          program_id: form.program_id,
          role: 'student',
          status: 'active'
        }));

        // Use upsert to avoid duplicates, requires a unique constraint or primary key 
        // In our schema, we'll try to insert. If it fails due to duplicates, it's fine.
        await db.from('enrollments').upsert(enrollments, { onConflict: 'user_id,program_id,role' });
      }

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
            <label className="block text-xs font-semibold text-white/40 uppercase tracking-widest mb-3">
              Manual Student Selection <span className="text-white/20 font-normal normal-case">({selectedStudents.length} selected)</span>
            </label>

            {!form.program_id ? (
              <p className="text-sm text-white/20 italic bg-white/5 border border-dashed border-white/10 rounded-xl p-4">
                Please select a programme first to see eligible students.
              </p>
            ) : loadingStudents ? (
              <div className="flex items-center gap-2 text-sm text-white/40 p-4">
                <ArrowPathIcon className="w-4 h-4 animate-spin" /> Fetching students…
              </div>
            ) : availableStudents.length === 0 ? (
              <div className="space-y-3">
                <p className="text-sm text-amber-400/60 italic bg-amber-500/5 border border-dashed border-amber-500/10 rounded-xl p-4">
                  No students found matching this programme/school. Only students with active portal accounts appear here.
                </p>
                {pendingCount > 0 && (
                  <div className="flex items-center gap-3 bg-blue-500/10 border border-blue-500/20 rounded-xl p-4">
                    <UserIcon className="w-5 h-5 text-blue-400" />
                    <p className="text-xs text-blue-300">
                      <strong>{pendingCount} student{pendingCount !== 1 ? 's' : ''}</strong> you registered are still <strong>Pending Admission</strong>. They will appear here once approved by an administrator.
                    </p>
                  </div>
                )}
                {!form.program_id && (
                  <p className="text-xs text-white/30 px-1">Please select a <strong>Programme</strong> above to see eligible students.</p>
                )}
              </div>
            ) : (
              <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
                <div className="max-h-60 overflow-y-auto divide-y divide-white/5">
                  {availableStudents.map(student => (
                    <label key={student.id} className="flex items-center gap-3 px-4 py-3 hover:bg-white/10 cursor-pointer transition-colors">
                      <input
                        type="checkbox"
                        checked={selectedStudents.includes(student.id)}
                        onChange={e => {
                          if (e.target.checked) setSelectedStudents(prev => [...prev, student.id]);
                          else setSelectedStudents(prev => prev.filter(id => id !== student.id));
                        }}
                        className="w-4 h-4 rounded border-white/10 bg-white/5 text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-white truncate">{student.full_name}</p>
                        <p className="text-xs text-white/30 truncate">{student.email}</p>
                      </div>
                    </label>
                  ))}
                </div>
                <div className="px-4 py-2 bg-white/5 border-t border-white/5 flex justify-between items-center">
                  <span className="text-[10px] text-white/30 uppercase font-bold tracking-wider">
                    {availableStudents.length} Available
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedStudents.length === availableStudents.length) setSelectedStudents([]);
                      else setSelectedStudents(availableStudents.map(s => s.id));
                    }}
                    className="text-[10px] font-bold text-blue-400 hover:text-blue-300 transition-colors uppercase tracking-wider"
                  >
                    {selectedStudents.length === availableStudents.length ? 'Deselect All' : 'Select All'}
                  </button>
                </div>
              </div>
            )}
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
