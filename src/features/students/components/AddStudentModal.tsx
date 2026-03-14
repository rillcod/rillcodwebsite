// @refresh reset
'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/auth-context';
import {
    XMarkIcon, UserIcon, EnvelopeIcon, PhoneIcon,
    BuildingOfficeIcon, BookOpenIcon, CheckIcon, ArrowPathIcon,
    ExclamationTriangleIcon,
} from '@/lib/icons';

const GRADE_LEVELS = ['Primary 1', 'Primary 2', 'Primary 3', 'Primary 4', 'Primary 5', 'Primary 6',
    'JSS1', 'JSS2', 'JSS3', 'SS1', 'SS2', 'SS3'] as const;

interface AddStudentModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    initialData?: any;
}

const DEFAULT_FORM = {
    full_name: '', parent_email: '', parent_name: '', parent_phone: '',
    school_name: '', grade_level: '', city: '', state: '',
};

export function AddStudentModal({ isOpen, onClose, onSuccess, initialData }: AddStudentModalProps) {
    const { profile } = useAuth();
    const [form, setForm] = useState(DEFAULT_FORM);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [schools, setSchools] = useState<{ id: string; name: string }[]>([]);

    // Fetch partner schools for dropdown (not needed for school role — locked to their own school)
    useEffect(() => {
        if (!isOpen) return;

        // Initialize form first so school_name is never overwritten
        if (initialData) {
            setForm({
                full_name: initialData.full_name || '',
                parent_email: initialData.parent_email || '',
                parent_name: initialData.parent_name || '',
                parent_phone: initialData.parent_phone || '',
                school_name: initialData.school_name || '',
                grade_level: initialData.grade_level || '',
                city: initialData.city || '',
                state: initialData.state || '',
            });
        } else if (profile?.role === 'school') {
            // School role: lock to their own school
            setForm({ ...DEFAULT_FORM, school_name: profile.school_name || '' });
        } else {
            setForm(DEFAULT_FORM);
        }

        // Now handle school list population
        if (profile?.role === 'school') {
            setSchools([]);
        } else {
            const client = createClient();
            const fetchSchools = async () => {
                let query = client
                    .from('schools')
                    .select('id, name')
                    .eq('status', 'approved')
                    .order('name');

                if (profile?.role === 'teacher') {
                    const { data: assignments } = await client
                        .from('teacher_schools')
                        .select('school_id')
                        .eq('teacher_id', profile.id);
                    const ids = assignments?.map((a: any) => a.school_id).filter(Boolean) || [];
                    if (profile.school_id) ids.push(profile.school_id);
                    const uniqueIds = Array.from(new Set(ids));
                    if (uniqueIds.length > 0) query = query.in('id', uniqueIds);
                }

                const { data } = await query;
                const schoolList = data ?? [];
                setSchools(schoolList);

                if (profile?.role === 'teacher' && schoolList.length === 1 && !initialData) {
                    setForm(prev => ({ ...prev, school_name: schoolList[0].name }));
                }
            };
            fetchSchools();
        }
    }, [isOpen, initialData, profile]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
        setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.full_name.trim() || !form.parent_email.trim() || !form.school_name.trim()) {
            setError('Full name, parent email, and school are required.');
            return;
        }
        setLoading(true);
        setError('');
        try {
            const client = createClient();
            if (initialData) {
                const { error: updateError } = await client
                    .from('students')
                    .update({ ...form, name: form.full_name })
                    .eq('id', initialData.id);
                if (updateError) throw updateError;
            } else {
                const schoolId = profile?.role === 'school'
                    ? profile.school_id
                    : schools.find(s => s.name === form.school_name)?.id;
                const { error: insertError } = await client
                    .from('students')
                    .insert([{
                        ...form,
                        name: form.full_name,
                        status: 'pending',
                        school_id: schoolId || null,
                        created_by: profile?.id
                    }]);
                if (insertError) throw insertError;
            }
            setForm(DEFAULT_FORM);
            onSuccess();
            onClose();
        } catch (err: any) {
            setError(err?.message ?? 'Failed to add student. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

            {/* Panel */}
            <div className="relative w-full max-w-lg bg-[#0f0f1a] border border-white/10 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">

                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-white/10 flex-shrink-0">
                    <div>
                        <div className="flex items-center gap-2 mb-0.5">
                            <UserIcon className="w-4 h-4 text-blue-400" />
                            <span className="text-xs font-bold text-blue-400 uppercase tracking-widest">Students</span>
                        </div>
                        <h2 className="text-lg font-extrabold text-white">{initialData ? 'Edit Student' : 'Add New Student'}</h2>
                    </div>
                    <button onClick={onClose}
                        className="p-2 rounded-xl hover:bg-white/10 text-white/40 hover:text-white transition-colors"
                        aria-label="Close">
                        <XMarkIcon className="w-5 h-5" />
                    </button>
                </div>

                {/* Scrollable form */}
                <form onSubmit={handleSubmit} className="overflow-y-auto flex-1">
                    <div className="p-6 space-y-4">

                        {error && (
                            <div className="flex items-start gap-3 bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3">
                                <ExclamationTriangleIcon className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
                                <p className="text-sm font-semibold text-rose-400">{error}</p>
                            </div>
                        )}

                        {/* Full Name */}
                        <Field label="Student Full Name" required>
                            <IconInput icon={UserIcon} name="full_name" type="text" placeholder="Student's full name"
                                value={form.full_name} onChange={handleChange} required />
                        </Field>

                        {/* Parent info */}
                        <div className="grid grid-cols-2 gap-4">
                            <Field label="Parent / Guardian Name">
                                <IconInput icon={UserIcon} name="parent_name" type="text" placeholder="Parent name"
                                    value={form.parent_name} onChange={handleChange} />
                            </Field>
                            <Field label="Parent Email" required>
                                <IconInput icon={EnvelopeIcon} name="parent_email" type="email" placeholder="parent@email.com"
                                    value={form.parent_email} onChange={handleChange} required />
                            </Field>
                        </div>

                        <Field label="Parent Phone">
                            <IconInput icon={PhoneIcon} name="parent_phone" type="tel" placeholder="+234 800 000 0000"
                                value={form.parent_phone} onChange={handleChange} />
                        </Field>

                        {/* School — locked for school role, dropdown for admin/teacher */}
                        <Field label="Partner School" required>
                            <div className="relative">
                                <BuildingOfficeIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                                {profile?.role === 'school' ? (
                                    <div className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white flex items-center gap-2">
                                        <span className="flex-1 truncate">{form.school_name || 'Your school'}</span>
                                        <span className="text-[10px] text-violet-400 font-bold uppercase bg-violet-500/10 px-2 py-0.5 rounded-full flex-shrink-0">Your School</span>
                                    </div>
                                ) : schools.length > 0 ? (
                                    <select name="school_name" value={form.school_name} onChange={handleChange} required
                                        className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-blue-500 transition-colors appearance-none">
                                        <option value="">Select school…</option>
                                        {schools.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                                        <option value="__other__">Other / Not listed</option>
                                    </select>
                                ) : (
                                    <input name="school_name" type="text" placeholder="School name" value={form.school_name}
                                        onChange={handleChange} required
                                        className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-blue-500 transition-colors placeholder-white/25" />
                                )}
                            </div>
                        </Field>

                        {/* Manual entry when "Other" selected (admin/teacher only) */}
                        {form.school_name === '__other__' && profile?.role !== 'school' && (
                            <Field label="School Name (manual)">
                                <IconInput icon={BuildingOfficeIcon} name="school_name_manual" type="text" placeholder="Type school name"
                                    value={(form as any).school_name_manual ?? ''}
                                    onChange={e => setForm(p => ({ ...p, school_name: e.target.value }))} />
                            </Field>
                        )}

                        {/* Grade + Location */}
                        <div className="grid grid-cols-2 gap-4">
                            <Field label="Grade / Class">
                                <div className="relative">
                                    <BookOpenIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                                    <select name="grade_level" value={form.grade_level} onChange={handleChange}
                                        className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-blue-500 transition-colors appearance-none">
                                        <option value="">Select…</option>
                                        {GRADE_LEVELS.map(g => <option key={g} value={g}>{g}</option>)}
                                    </select>
                                </div>
                            </Field>
                            <Field label="City">
                                <input name="city" type="text" placeholder="City" value={form.city} onChange={handleChange}
                                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-blue-500 transition-colors placeholder-white/25" />
                            </Field>
                        </div>

                        <Field label="State">
                            <input name="state" type="text" placeholder="State" value={form.state} onChange={handleChange}
                                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-blue-500 transition-colors placeholder-white/25" />
                        </Field>

                    </div>

                    {/* Footer actions */}
                    <div className="flex gap-3 px-6 pb-6 pt-2 border-t border-white/10 flex-shrink-0">
                        <button type="button" onClick={onClose}
                            className="flex-1 py-3 bg-white/5 hover:bg-white/10 text-white/60 hover:text-white text-sm font-bold rounded-xl border border-white/10 transition-all">
                            Cancel
                        </button>
                        <button type="submit" disabled={loading}
                            className="flex-1 flex items-center justify-center gap-2 py-3 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded-xl transition-all disabled:opacity-50">
                            {loading
                                ? <><ArrowPathIcon className="w-4 h-4 animate-spin" /> Saving…</>
                                : <><CheckIcon className="w-4 h-4" /> {initialData ? 'Update Student' : 'Add Student'}</>}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

/* ── Sub-components ─────────────────────────────────────── */
function Field({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) {
    return (
        <div>
            <label className="block text-xs font-semibold text-white/40 uppercase tracking-widest mb-1.5">
                {label}{required && <span className="text-rose-400 ml-0.5">*</span>}
            </label>
            {children}
        </div>
    );
}

function IconInput({ icon: Icon, name, type, placeholder, value, onChange, required }: {
    icon: any; name: string; type: string; placeholder: string;
    value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; required?: boolean;
}) {
    return (
        <div className="relative">
            <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
            <input name={name} type={type} placeholder={placeholder} value={value}
                onChange={onChange} required={required}
                className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-blue-500 transition-colors placeholder-white/25" />
        </div>
    );
}
