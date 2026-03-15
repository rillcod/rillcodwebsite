// @refresh reset
'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import {
    ArrowLeftIcon, BookOpenIcon, CheckIcon,
    ExclamationTriangleIcon, ArrowPathIcon, UserIcon,
    BuildingOfficeIcon,
} from '@/lib/icons';

export default function EditClassPage() {
    const router = useRouter();
    const params = useParams();
    const id = params.id as string;
    const { profile, loading: authLoading } = useAuth();

    const [programs, setPrograms] = useState<any[]>([]);
    const [teachers, setTeachers] = useState<any[]>([]);
    const [schools, setSchools] = useState<any[]>([]);
    const [availableStudents, setAvailableStudents] = useState<any[]>([]);
    const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
    const [initialStudents, setInitialStudents] = useState<string[]>([]);
    // originalName removed — student assignment now uses class_id FK instead of name matching

    const [loading, setLoading] = useState(true);
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
        if (authLoading || !profile || !id) return;
        const db = createClient();

        async function loadData() {
            setLoading(true);
            try {
                // 1. Fetch class data via admin API (bypasses RLS)
                const clsApiRes = await fetch(`/api/classes/${id}`, { cache: 'no-store' });
                if (!clsApiRes.ok) { const j = await clsApiRes.json(); throw new Error(j.error || 'Class not found'); }
                const { data: cls } = await clsApiRes.json();

                // class_id FK is the enrollment key — no need to track originalName
                setForm({
                    name: cls.name || '',
                    description: cls.description || '',
                    program_id: cls.program_id || '',
                    teacher_id: cls.teacher_id || '',
                    school_id: cls.school_id || '',
                    max_students: (cls.max_students || 20).toString(),
                    start_date: cls.start_date || '',
                    end_date: cls.end_date || '',
                    schedule: cls.schedule || '',
                    status: cls.status || 'scheduled',
                });

                // 2. Fetch lookups
                const [programsRes, teachersRes] = await Promise.all([
                    db.from('programs').select('id, name').eq('is_active', true).order('name'),
                    db.from('portal_users').select('id, full_name').eq('role', 'teacher').eq('is_active', true).order('full_name'),
                ]);

                // 3. Schools lookup
                let schoolsQuery = db.from('schools').select('id, name').eq('status', 'approved').order('name');
                if (profile?.role === 'teacher') {
                    const { data: assignments } = await db.from('teacher_schools').select('school_id').eq('teacher_id', profile?.id || '');
                    const schoolIds = assignments?.map(a => a.school_id).filter(Boolean) || [];
                    if (profile?.school_id && !schoolIds.includes(profile.school_id)) schoolIds.push(profile.school_id);

                    if (schoolIds.length > 0) schoolsQuery = schoolsQuery.in('id', schoolIds);
                }
                const { data: sData } = await schoolsQuery;

                // 4. Fetch currently assigned students (those with class_id = this class)
                const { data: currentStuds } = await db.from('portal_users')
                    .select('id')
                    .eq('role', 'student')
                    .eq('class_id', id);

                const currentIds = (currentStuds ?? []).map(s => s.id);
                setSelectedStudents(currentIds);
                setInitialStudents(currentIds);

                setPrograms(programsRes.data ?? []);
                setTeachers(teachersRes.data ?? []);
                setSchools(sData ?? []);
            } catch (err: any) {
                setError(err.message || 'Failed to load class details');
            } finally {
                setLoading(false);
            }
        }

        loadData();
    }, [id, profile?.id, authLoading]);

    // Fetch available students when program or school changes
    useEffect(() => {
        if (!form.program_id || loading) {
            if (!form.program_id) setAvailableStudents([]);
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
                    .eq('teacher_id', profile?.id || '');
                const assignedSchoolIds = assignments?.map(a => a.school_id).filter(Boolean) || [];
                if (profile?.school_id && !assignedSchoolIds.includes(profile.school_id)) assignedSchoolIds.push(profile.school_id);

                // 2. Fetch the "Pool" from portal_users (active students who can be assigned)
                let poolQuery = db.from('portal_users')
                    .select('id, full_name, email, school_id, school_name, section_class')
                    .eq('role', 'student')
                    .neq('is_deleted', true);

                // Jurisdiction rule:
                //   Admin:   school_id match + school_name match + truly unassigned (both null)
                //   Teacher: school_id match + school_name match ONLY — no unclaimed students
                if (profile?.role === 'admin') {
                    if (form.school_id) {
                        const sName = schools.find(s => s.id === form.school_id)?.name;
                        const unassigned = 'and(school_id.is.null,school_name.is.null)';
                        if (sName) {
                            poolQuery = poolQuery.or(`school_id.eq.${form.school_id},school_name.eq."${sName}",${unassigned}`);
                        } else {
                            poolQuery = poolQuery.or(`school_id.eq.${form.school_id},${unassigned}`);
                        }
                    }
                } else {
                    // Teachers only see students from schools within their jurisdiction
                    if (form.school_id) {
                        const sName = schools.find(s => s.id === form.school_id)?.name;
                        if (sName) {
                            poolQuery = poolQuery.or(`school_id.eq.${form.school_id},school_name.eq."${sName}"`);
                        } else {
                            poolQuery = poolQuery.in('school_id', [form.school_id]);
                        }
                    } else if (assignedSchoolIds.length > 0) {
                        const schoolNames = schools.filter(s => assignedSchoolIds.includes(s.id)).map(s => s.name).filter(Boolean);
                        const idPart = `school_id.in.(${assignedSchoolIds.join(',')})`;
                        const namePart = schoolNames.map(n => `school_name.eq.${n}`).join(',');
                        poolQuery = (poolQuery as any).or(namePart ? `${idPart},${namePart}` : idPart);
                    } else {
                        // Teacher with no school assignment — show nothing
                        setAvailableStudents([]);
                        setLoadingStudents(false);
                        return;
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
                        pendingQuery = pendingQuery.or(`school_id.eq.${form.school_id},school_name.eq."${sName}",created_by.eq.${profile?.id || ''}`);
                    } else {
                        pendingQuery = pendingQuery.or(`school_id.eq.${form.school_id},created_by.eq.${profile?.id || ''}`);
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
    }, [form.program_id, form.school_id, loading]);

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
            const newName = form.name.trim();
            const payload: any = {
                name: newName,
                description: form.description.trim() || null,
                program_id: form.program_id,
                teacher_id: form.teacher_id || null,
                school_id: form.school_id || null,
                max_students: parseInt(form.max_students) || 20,
                status: form.status,
                schedule: form.schedule.trim() || null,
                current_students: selectedStudents.length,
                updated_at: new Date().toISOString(),
            };
            if (form.start_date) payload.start_date = form.start_date;
            if (form.end_date) payload.end_date = form.end_date;

            const patchRes = await fetch(`/api/classes/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (!patchRes.ok) { const j = await patchRes.json(); throw new Error(j.error || 'Failed to update class'); }

            // Update student assignments via API (bypasses RLS — teachers can't update other users)
            // 1. Remove students who were unselected (clear their class_id)
            const removed = initialStudents.filter(sid => !selectedStudents.includes(sid));
            if (removed.length > 0) {
                await fetch('/api/portal-users', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ids: removed, update: { class_id: null } }),
                });
            }

            // 2. Assign newly selected students (and all kept) via class_id FK
            if (selectedStudents.length > 0) {
                const patchUpdate: Record<string, string | null> = { class_id: id };
                if (form.school_id) patchUpdate.school_id = form.school_id;

                await fetch('/api/portal-users', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ids: selectedStudents, update: patchUpdate }),
                });

                // Ensure enrollment exists for each student in this program
                await fetch('/api/students/bulk-enroll', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        userIds: selectedStudents,
                        program_id: form.program_id,
                        class_id: id,
                        school_id: form.school_id || undefined,
                    }),
                });
            }

            router.push(`/dashboard/classes/${id}`);
        } catch (e: any) {
            setError(e.message ?? 'Failed to update class');
        } finally {
            setSaving(false);
        }
    };

    if (authLoading || loading) return (
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

                <Link href={`/dashboard/classes/${id}`}
                    className="inline-flex items-center gap-2 text-sm text-white/40 hover:text-white transition-colors">
                    <ArrowLeftIcon className="w-4 h-4" /> Back to Class Details
                </Link>

                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <BookOpenIcon className="w-5 h-5 text-blue-400" />
                        <span className="text-xs font-bold text-blue-400 uppercase tracking-widest">Edit Class</span>
                    </div>
                    <h1 className="text-3xl font-extrabold">Manage Group</h1>
                    <p className="text-white/40 text-sm mt-1">Update settings and students</p>
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
                            className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-blue-500 transition-colors" />
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-white/40 uppercase tracking-widest mb-1.5">Description</label>
                        <textarea value={form.description} rows={3}
                            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                            placeholder="Optional — brief description of this class"
                            className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-blue-500 transition-colors resize-none" />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-white/40 uppercase tracking-widest mb-1.5">
                                Programme <span className="text-rose-400">*</span>
                            </label>
                            <select required value={form.program_id}
                                onChange={e => setForm(f => ({ ...f, program_id: e.target.value }))}
                                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-blue-500">
                                <option value="">— Select Programme —</option>
                                {programs.map(p => (
                                    <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-white/40 uppercase tracking-widest mb-1.5">Teacher</label>
                            <select value={form.teacher_id}
                                onChange={e => setForm(f => ({ ...f, teacher_id: e.target.value }))}
                                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-blue-500">
                                <option value="">— Unassigned —</option>
                                {teachers.map(t => (
                                    <option key={t.id} value={t.id}>{t.full_name}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-white/40 uppercase tracking-widest mb-1.5">Partner School</label>
                        <select value={form.school_id}
                            onChange={e => setForm(f => ({ ...f, school_id: e.target.value }))}
                            className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-blue-500">
                            <option value="">— No specific school —</option>
                            {schools.map(s => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Student Selection */}
                    <div className="pt-4 border-t border-white/10">
                        <label className="block text-xs font-semibold text-white/40 uppercase tracking-widest mb-3">
                            Manage Enrolled Students <span className="text-white/20 font-normal normal-case">({selectedStudents.length} selected)</span>
                        </label>

                        {loadingStudents ? (
                            <div className="flex items-center gap-2 text-sm text-white/40 p-4">
                                <ArrowPathIcon className="w-4 h-4 animate-spin" /> Refreshing student list…
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
                                                className="w-4 h-4 rounded border-white/10 bg-white/5 text-blue-500 focus:ring-blue-500"
                                            />
                                            <div className="min-w-0">
                                                <p className="text-sm font-semibold text-white truncate">{student.full_name}</p>
                                                <p className="text-xs text-white/30 truncate">
                                                    {student.email} {student.class_id && student.class_id !== id && (
                                                        <span className="ml-2 text-[10px] bg-amber-500/10 px-1.5 py-0.5 rounded text-amber-400 uppercase">In another class</span>
                                                    )}
                                                </p>
                                            </div>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-white/40 uppercase tracking-widest mb-1.5">Status</label>
                            <select value={form.status}
                                onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-blue-500">
                                <option value="scheduled">Scheduled</option>
                                <option value="active">Active</option>
                                <option value="completed">Completed</option>
                                <option value="cancelled">Cancelled</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-white/40 uppercase tracking-widest mb-1.5">Schedule</label>
                            <input type="text" value={form.schedule}
                                onChange={e => setForm(f => ({ ...f, schedule: e.target.value }))}
                                placeholder="e.g. Mon / Wed 9am"
                                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-blue-500" />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-white/40 uppercase tracking-widest mb-1.5">Max Students</label>
                            <input type="number" min="1" max="500" value={form.max_students}
                                onChange={e => setForm(f => ({ ...f, max_students: e.target.value }))}
                                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-blue-500" />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-white/40 uppercase tracking-widest mb-1.5">Start Date</label>
                            <input type="date" value={form.start_date}
                                onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
                                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-blue-500 [color-scheme:dark]" />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-white/40 uppercase tracking-widest mb-1.5">End Date</label>
                            <input type="date" value={form.end_date}
                                onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
                                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-blue-500 [color-scheme:dark]" />
                        </div>
                    </div>

                    <button type="submit" disabled={saving}
                        className="w-full py-4 bg-blue-600 hover:bg-blue-500 disabled:bg-white/10 disabled:text-white/20 text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-900/20">
                        {saving ? <ArrowPathIcon className="w-5 h-5 animate-spin" /> : <CheckIcon className="w-5 h-5" />}
                        {saving ? 'Saving changes…' : 'Save Class Settings'}
                    </button>

                </form>
            </div>
        </div>
    );
}
