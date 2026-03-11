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
} from '@heroicons/react/24/outline';

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
    const [originalName, setOriginalName] = useState('');

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
                // 1. Fetch class data
                const { data: cls, error: clsErr } = await db.from('classes').select('*').eq('id', id).single();
                if (clsErr) throw clsErr;

                setOriginalName(cls.name || '');
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
                    const { data: assignments } = await db.from('teacher_schools').select('school_id').eq('teacher_id', profile.id);
                    const schoolIds = assignments?.map(a => a.school_id).filter(Boolean) || [];
                    if (profile.school_id && !schoolIds.includes(profile.school_id)) schoolIds.push(profile.school_id);

                    if (schoolIds.length > 0) schoolsQuery = schoolsQuery.in('id', schoolIds);
                }
                const { data: sData } = await schoolsQuery;

                // 4. Fetch currently assigned students (those with matching section_class)
                const { data: currentStuds } = await db.from('portal_users')
                    .select('id')
                    .eq('role', 'student')
                    .eq('section_class', cls.name);

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
            const db = createClient();
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

            const { error: err } = await db.from('classes').update(payload).eq('id', id);
            if (err) throw err;

            // Update student assignments
            // 1. Remove students who were unselected (set section_class to null if it was the old name)
            const removed = initialStudents.filter(sid => !selectedStudents.includes(sid));
            if (removed.length > 0) {
                await db.from('portal_users')
                    .update({ section_class: null })
                    .in('id', removed)
                    .eq('section_class', originalName);
            }

            // 2. Clear old name for ALL students if name changed (to prevent orphaned students if they weren't in initialList)
            if (originalName && originalName !== newName) {
                await db.from('portal_users')
                    .update({ section_class: null })
                    .eq('section_class', originalName);
            }

            // 3. Add newly selected students and ensure enrollment
            if (selectedStudents.length > 0) {
                const updatePayload: any = { section_class: newName };
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
                await db.from('enrollments').upsert(enrollments, { onConflict: 'user_id,program_id,role' });
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

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-white/40 uppercase tracking-widest mb-1.5">
                                Programme <span className="text-rose-400">*</span>
                            </label>
                            <select required value={form.program_id}
                                onChange={e => setForm(f => ({ ...f, program_id: e.target.value }))}
                                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-blue-500">
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
                                                    {student.email} {student.section_class && student.section_class !== form.name && (
                                                        <span className="ml-2 text-[10px] bg-white/10 px-1.5 py-0.5 rounded text-white/40 uppercase">In: {student.section_class}</span>
                                                    )}
                                                </p>
                                            </div>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-white/40 uppercase tracking-widest mb-1.5">Initial Status</label>
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
                                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-blue-500" />
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
