// @refresh reset
'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import {
    ArrowLeftIcon, BookOpenIcon, CheckIcon,
    ExclamationTriangleIcon, ArrowPathIcon,
    UserGroupIcon, ArrowsRightLeftIcon,
} from '@/lib/icons';
import { liveAcademicSession } from '@/lib/reports/academic-period';

type AcademicTermOption = {
    id: string;
    academic_year: string;
    term_number: number;
    term_label: string;
    start_date: string | null;
    end_date: string | null;
    is_current: boolean;
};

export default function EditClassPage() {
    const router = useRouter();
    const params = useParams();
    const id = params.id as string;
    const { profile, loading: authLoading } = useAuth();

    const [programs, setPrograms] = useState<any[]>([]);
    const [courses, setCourses] = useState<any[]>([]);
    const [teachers, setTeachers] = useState<any[]>([]);
    const [schools, setSchools] = useState<any[]>([]);
    const [academicTerms, setAcademicTerms] = useState<AcademicTermOption[]>([]);

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [form, setForm] = useState({
        name: '',
        description: '',
        program_id: '',
        current_course_id: '',
        teacher_id: '',
        school_id: '',
        max_students: '20',
        start_date: '',
        end_date: '',
        term_id: '',
        schedule: '',
        status: 'scheduled',
    });

    const setTerm = (termId: string) => {
        const term = academicTerms.find(t => t.id === termId);
        setForm(f => ({
            ...f,
            term_id: termId,
            start_date: term?.start_date ?? f.start_date,
            end_date: term?.end_date ?? f.end_date,
        }));
    };

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
                    current_course_id: cls.current_course_id || '',
                    teacher_id: cls.teacher_id || '',
                    school_id: cls.school_id || '',
                    max_students: (cls.max_students || 20).toString(),
                    start_date: cls.start_date || '',
                    end_date: cls.end_date || '',
                    term_id: cls.term_id || '',
                    schedule: cls.schedule || '',
                    status: cls.status || 'scheduled',
                });

                // 2. Fetch lookups
                const [programsRes, coursesRes, teachersRes, termsRes] = await Promise.all([
                    db.from('programs').select('id, name').eq('is_active', true).order('name'),
                    db.from('courses').select('id, title, program_id, is_active').eq('is_active', true).order('title'),
                    db.from('portal_users').select('id, full_name').eq('role', 'teacher').eq('is_active', true).order('full_name'),
                    fetch('/api/settings/academic-year', { cache: 'no-store' }).then(r => r.json()).catch(() => ({ terms: [] })),
                ]);
                const terms = ((termsRes as any).terms ?? []) as AcademicTermOption[];

                // 3. Schools lookup
                let schoolsQuery = db.from('schools').select('id, name').eq('status', 'approved').order('name');
                if (profile?.role === 'teacher') {
                    const { data: assignments } = await db.from('teacher_schools').select('school_id').eq('teacher_id', profile?.id || '');
                    const schoolIds = assignments?.map(a => a.school_id).filter(Boolean) || [];
                    if (profile?.school_id && !schoolIds.includes(profile.school_id)) schoolIds.push(profile.school_id);

                    if (schoolIds.length > 0) schoolsQuery = schoolsQuery.in('id', schoolIds);
                }
                const { data: sData } = await schoolsQuery;

                // Always include the class's CURRENT programme in the dropdown, even if it is
                // inactive — otherwise the select has no matching option and shows blank
                // instead of following the class's real programme.
                let programList = programsRes.data ?? [];
                if (cls.program_id && !programList.some((p: any) => p.id === cls.program_id)) {
                    const { data: currentProg } = await db.from('programs').select('id, name').eq('id', cls.program_id).maybeSingle();
                    if (currentProg) programList = [currentProg, ...programList];
                }

                setPrograms(programList);
                let courseList = coursesRes.data ?? [];
                if (cls.current_course_id && !courseList.some((course: any) => course.id === cls.current_course_id)) {
                    const { data: currentCourse } = await db.from('courses').select('id, title, program_id, is_active').eq('id', cls.current_course_id).maybeSingle();
                    if (currentCourse) courseList = [currentCourse, ...courseList];
                }
                setCourses(courseList);
                setTeachers(teachersRes.data ?? []);
                setSchools(sData ?? []);
                setAcademicTerms(terms);
            } catch (err: any) {
                setError(err.message || 'Failed to load class details');
            } finally {
                setLoading(false);
            }
        }

        loadData();
    }, [id, profile?.id, authLoading]);

    const isStaff = profile?.role === 'admin' || profile?.role === 'teacher' || profile?.role === 'school';

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.name.trim() || !form.program_id || !form.school_id) {
            setError('Class name, programme, and school are required.');
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
                current_course_id: form.current_course_id || null,
                teacher_id: form.teacher_id || null,
                school_id: form.school_id || null,
                max_students: parseInt(form.max_students) || 20,
                status: form.status,
                schedule: form.schedule.trim() || null,
                updated_at: new Date().toISOString(),
            };
            if (form.start_date) payload.start_date = form.start_date;
            if (form.end_date) payload.end_date = form.end_date;
            if (form.term_id) payload.term_id = form.term_id;

            const patchRes = await fetch(`/api/classes/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (!patchRes.ok) { const j = await patchRes.json(); throw new Error(j.error || 'Failed to update class'); }

            // Editing a class only changes its SETTINGS. Enrolling students happens at class
            // creation; moving students between classes is the dedicated Transfer flow — so
            // this page no longer touches the roster (no repeated student-selection).
            router.push(`/dashboard/classes/${id}`);
        } catch (e: any) {
            setError(e.message ?? 'Failed to update class');
        } finally {
            setSaving(false);
        }
    };

    if (authLoading || loading) return (
        <div className="min-h-screen bg-background flex items-center justify-center">
            <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
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

                <Link href={`/dashboard/classes/${id}`}
                    className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                    <ArrowLeftIcon className="w-4 h-4" /> Back to Class Details
                </Link>

                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <BookOpenIcon className="w-5 h-5 text-primary" />
                        <span className="text-xs font-bold text-primary uppercase tracking-widest">Edit Class</span>
                    </div>
                    <h1 className="text-3xl font-extrabold">Edit Class</h1>
                    <p className="text-muted-foreground text-sm mt-1">Update class settings and manage enrolled students.</p>
                </div>

                {error && (
                    <div className="flex items-center gap-3 bg-rose-500/10 border border-rose-500/20 rounded-xl p-4">
                        <ExclamationTriangleIcon className="w-5 h-5 text-rose-400 flex-shrink-0" />
                        <p className="text-rose-400 text-sm">{error}</p>
                    </div>
                )}

                <form onSubmit={handleSubmit} className="bg-card shadow-sm border border-border rounded-xl p-6 space-y-5">

                    <div>
                        <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">
                            Class Name <span className="text-rose-400">*</span>
                        </label>
                        <input type="text" required value={form.name}
                            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                            className="w-full px-4 py-3 bg-card shadow-sm border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-primary transition-colors" />
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">Description</label>
                        <textarea value={form.description} rows={3}
                            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                            placeholder="Optional — brief description of this class"
                            className="w-full px-4 py-3 bg-card shadow-sm border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-primary transition-colors resize-none" />
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">Academic Year / Term</label>
                        <select value={form.term_id}
                            onChange={e => setTerm(e.target.value)}
                            className="w-full px-4 py-3 bg-card shadow-sm border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-primary">
                            <option value="">Keep / clear term</option>
                            {academicTerms.map(term => {
                                const live = liveAcademicSession();
                                const isLive = term.academic_year === live.periodLabel && term.term_label === live.termLabel;
                                return (
                                <option key={term.id} value={term.id}>
                                    {term.academic_year} · {term.term_label}{isLive ? ' (Current)' : ''}
                                </option>
                                );
                            })}
                        </select>
                        <p className="text-[10px] text-muted-foreground mt-1.5">
                            Changing this affects new roster, attendance, lesson-plan and report activity for this class. Existing historical reports remain preserved.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">
                                Programme <span className="text-rose-400">*</span>
                            </label>
                            <select required value={form.program_id}
                                onChange={e => setForm(f => ({ ...f, program_id: e.target.value, current_course_id: '' }))}
                                className="w-full px-4 py-3 bg-card shadow-sm border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-primary">
                                <option value="">— Select Programme —</option>
                                {programs.map(p => (
                                    <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">Teacher</label>
                            <select value={form.teacher_id}
                                onChange={e => setForm(f => ({ ...f, teacher_id: e.target.value }))}
                                className="w-full px-4 py-3 bg-card shadow-sm border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-primary">
                                <option value="">— Unassigned —</option>
                                {teachers.map(t => (
                                    <option key={t.id} value={t.id}>{t.full_name}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">Course Focus</label>
                        <select value={form.current_course_id}
                            onChange={e => setForm(f => ({ ...f, current_course_id: e.target.value }))}
                            disabled={!form.program_id || courses.filter(c => c.program_id === form.program_id).length === 0}
                            className="w-full px-4 py-3 bg-card shadow-sm border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-primary disabled:cursor-not-allowed disabled:opacity-60">
                            <option value="">
                                {!form.program_id
                                    ? 'Select a programme first'
                                    : courses.some(c => c.program_id === form.program_id)
                                        ? 'Select the course used for result entry'
                                        : 'No active courses in this programme'}
                            </option>
                            {courses.filter(c => c.program_id === form.program_id).map(c => (
                                <option key={c.id} value={c.id}>{c.title}{c.is_active === false ? ' (Inactive)' : ''}</option>
                            ))}
                        </select>
                        <p className="text-[10px] text-muted-foreground mt-1.5">Report Builder opens with this course selected for the class.</p>
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">Partner School <span className="text-rose-400">*</span></label>
                        <select required value={form.school_id}
                            onChange={e => setForm(f => ({ ...f, school_id: e.target.value }))}
                            className="w-full px-4 py-3 bg-card shadow-sm border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-primary">
                            <option value="">— Select School —</option>
                            {schools.map(s => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Roster is managed elsewhere — this page edits class SETTINGS only. */}
                    <div className="pt-4 border-t border-border">
                        <div className="flex items-start gap-3 rounded-xl border border-sky-500/20 bg-sky-500/[0.06] p-4">
                            <UserGroupIcon className="w-5 h-5 text-sky-400 flex-shrink-0 mt-0.5" />
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-bold text-foreground">Editing class settings only</p>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                    Students are enrolled when a class is created. To move students between classes, use the dedicated <strong>Transfer</strong> tool — no need to re-pick students here.
                                </p>
                                <Link href="/dashboard/classes/transfer"
                                    className="inline-flex items-center gap-1.5 mt-2 text-xs font-black text-sky-400 hover:text-sky-300">
                                    <ArrowsRightLeftIcon className="w-4 h-4" /> Open Transfer
                                </Link>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">Status</label>
                            <select value={form.status}
                                onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                                className="w-full px-4 py-3 bg-card shadow-sm border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-primary">
                                <option value="scheduled">Scheduled</option>
                                <option value="active">Active</option>
                                <option value="completed">Completed</option>
                                <option value="cancelled">Cancelled</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">Schedule</label>
                            <input type="text" value={form.schedule}
                                onChange={e => setForm(f => ({ ...f, schedule: e.target.value }))}
                                placeholder="e.g. Mon / Wed 9am"
                                className="w-full px-4 py-3 bg-card shadow-sm border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-primary" />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">Max Students</label>
                            <input type="number" min="1" max="500" value={form.max_students}
                                onChange={e => setForm(f => ({ ...f, max_students: e.target.value }))}
                                className="w-full px-4 py-3 bg-card shadow-sm border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-primary" />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">Start Date</label>
                            <input type="date" value={form.start_date}
                                onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
                                className="w-full px-4 py-3 bg-card shadow-sm border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-primary [color-scheme:dark]" />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">End Date</label>
                            <input type="date" value={form.end_date}
                                onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
                                className="w-full px-4 py-3 bg-card shadow-sm border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-primary [color-scheme:dark]" />
                        </div>
                    </div>

                    <button type="submit" disabled={saving}
                        className="w-full py-4 bg-primary hover:bg-primary disabled:bg-muted disabled:text-muted-foreground text-foreground font-bold rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-900/20">
                        {saving ? <ArrowPathIcon className="w-5 h-5 animate-spin" /> : <CheckIcon className="w-5 h-5" />}
                        {saving ? 'Saving changes…' : 'Save Class Settings'}
                    </button>

                </form>
            </div>
        </div>
    );
}
