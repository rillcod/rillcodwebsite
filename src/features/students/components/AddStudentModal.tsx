// @refresh reset
'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/auth-context';
import {
    XMarkIcon, UserIcon, EnvelopeIcon, PhoneIcon,
    BuildingOfficeIcon, BookOpenIcon, CheckIcon, ArrowPathIcon,
    ExclamationTriangleIcon, ClipboardDocumentListIcon,
} from '@/lib/icons';
import { toast } from 'sonner';

const GRADE_LEVELS = ['Primary 1', 'Primary 2', 'Primary 3', 'Primary 4', 'Primary 5', 'Primary 6',
    'JSS1', 'JSS2', 'JSS3', 'SS1', 'SS2', 'SS3'] as const;

interface AddStudentModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    initialData?: any;
    /** If provided, the student is auto-activated and enrolled into this class after registration */
    classId?: string;
    inline?: boolean;
}

const DEFAULT_FORM = {
    full_name: '', student_email: '', parent_name: '', parent_phone: '',
    school_name: '', grade_level: '', section_class: '', city: '', state: '',
};

interface Credentials {
    email: string;
    tempPassword: string;
    name: string;
    section_class: string;
    grade_level: string;
    cardIssued?: boolean;
    cardId?: string | null;
}

export function AddStudentModal({ isOpen, onClose, onSuccess, initialData, classId, inline }: AddStudentModalProps) {
    const { profile } = useAuth();
    const [form, setForm] = useState(DEFAULT_FORM);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [schools, setSchools] = useState<{ id: string; name: string }[]>([]);
    const [credentials, setCredentials] = useState<Credentials | null>(null);
    const [customSchool, setCustomSchool] = useState(false);

    useEffect(() => {
        if (!isOpen) return;

        setCustomSchool(false);
        setCredentials(null);

        if (initialData) {
            setForm({
                full_name: initialData.full_name || '',
                student_email: initialData.student_email || initialData.parent_email || '',
                parent_name: initialData.parent_name || '',
                parent_phone: initialData.parent_phone || '',
                school_name: initialData.school_name || '',
                grade_level: initialData.grade_level || '',
                section_class: initialData.section_class || '',
                city: initialData.city || '',
                state: initialData.state || '',
            });
        } else if (profile?.role === 'school') {
            setForm({ ...DEFAULT_FORM, school_name: profile.school_name || '' });
        } else {
            setForm(DEFAULT_FORM);
        }

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
        if (!form.full_name.trim() || !form.student_email.trim()) {
            setError('Full name and student email are required.');
            return;
        }
        if (!initialData && !form.school_name.trim()) {
            setError('School is required.');
            return;
        }
        setLoading(true);
        setError('');
        try {
            if (initialData) {
                const schoolId = profile?.role === 'school'
                    ? profile.school_id
                    : schools.find(s => s.name === form.school_name)?.id;
                const res = await fetch(`/api/students/${initialData.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        ...form,
                        name: form.full_name,
                        ...(schoolId ? { school_id: schoolId } : {}),
                    }),
                });
                const json = await res.json();
                if (!res.ok) throw new Error(json.error || 'Failed to update student');
            } else {
                const schoolId = profile?.role === 'school'
                    ? profile.school_id
                    : schools.find(s => s.name === form.school_name)?.id;
                const res = await fetch('/api/students', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        ...form,
                        name: form.full_name,
                        enrollment_type: 'in_person',
                        status: 'pending',
                        school_id: schoolId || null,
                        created_by: profile?.id,
                    }),
                });
                const json = await res.json();
                if (!res.ok) throw new Error(json.error || 'Failed to add student');

                if (json.student?.id) {
                    const actRes = await fetch('/api/students/activate', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ studentId: json.student.id }),
                    });
                    const actJson = await actRes.json();

                    if (actRes.ok && actJson.portalUserId) {
                        if (actJson.cardId) {
                            toast.success(actJson.cardIssued ? 'Card ready' : 'Card already exists');
                        } else {
                            toast.message('Student activated', { description: 'Card sync is in progress.' });
                        }
                        if (classId) {
                            await fetch(`/api/classes/${classId}/enroll`, {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ studentIds: [actJson.portalUserId] }),
                            });
                        }

                        if (!actJson.alreadyActivated && actJson.tempPassword) {
                            // Capture all values BEFORE resetting form
                            const savedName = form.full_name;
                            const savedSectionClass = form.section_class;
                            const savedGradeLevel = form.grade_level;
                            setForm(DEFAULT_FORM);
                            setCredentials({
                                email: actJson.email,
                                tempPassword: actJson.tempPassword,
                                name: savedName,
                                section_class: savedSectionClass,
                                grade_level: savedGradeLevel,
                                cardIssued: actJson.cardIssued,
                                cardId: actJson.cardId || null,
                            });
                            return;
                        }
                    }
                }
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

    if (!isOpen && !inline) return null;

    // ── Credentials screen ────────────────────────────────────────────────────
    if (credentials) {
        const handlePrint = () => {
            const dateStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
            const classLabel = credentials.section_class || credentials.grade_level || '';
            const qrData = encodeURIComponent('https://rillcod.com/login');
            const html = `
                <html><head><title>Access Card — ${credentials.name}</title>
                <style>
                    @page { size: A4 portrait; margin: 20mm; }
                    * { box-sizing: border-box; margin: 0; padding: 0; }
                    body { font-family: 'Inter', 'Segoe UI', system-ui, sans-serif; color: #111827; background: #fff; display: flex; align-items: flex-start; justify-content: center; }
                    .card { border: 1px solid #d1d5db; width: 100%; max-width: 480px; display: flex; flex-direction: column; overflow: hidden; }
                    .chdr { background: #ea580c; padding: 12px 18px; display: flex; align-items: center; gap: 10px; }
                    .logo { width: 32px; height: 32px; object-fit: contain; flex-shrink: 0; }
                    .org-name { font-size: 14px; font-weight: 900; color: #fff; text-transform: uppercase; letter-spacing: 0.5px; line-height: 1; }
                    .org-web { font-size: 9px; color: rgba(255,255,255,0.8); font-weight: 700; margin-top: 3px; }
                    .cbadge { margin-left: auto; background: rgba(0,0,0,0.22); color: #fff; padding: 5px 12px; font-size: 9px; font-weight: 900; text-transform: uppercase; letter-spacing: 1px; flex-shrink: 0; }
                    .cbody { display: flex; min-height: 160px; }
                    .info { flex: 1; padding: 18px 20px; display: flex; flex-direction: column; gap: 10px; border-right: 1px solid #f3f4f6; }
                    .sname { font-size: 22px; font-weight: 900; color: #111; text-transform: uppercase; line-height: 1.15; }
                    .grade-tag { display: inline-block; background: #ea580c; color: #fff; padding: 2px 10px; font-size: 9px; font-weight: 900; text-transform: uppercase; }
                    .sep { height: 1px; background: #f3f4f6; }
                    .field { display: flex; flex-direction: column; gap: 3px; }
                    .lbl { font-size: 7.5px; font-weight: 700; color: #9ca3af; text-transform: uppercase; letter-spacing: 1px; }
                    .val { font-size: 13px; font-weight: 700; font-family: monospace; color: #111; word-break: break-all; }
                    .val-accent { font-size: 13px; font-weight: 800; font-family: monospace; color: #ea580c; }
                    .qrp { width: 160px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; padding: 18px 16px; background: #fafafa; flex-shrink: 0; }
                    .qr { width: 130px; height: 130px; border: 1px solid #e5e7eb; display: block; }
                    .qrl { font-size: 7px; color: #9ca3af; text-transform: uppercase; letter-spacing: 1px; text-align: center; font-weight: 600; }
                    .cftr { display: flex; justify-content: space-between; align-items: center; padding: 8px 18px; border-top: 1px solid #f3f4f6; font-size: 7.5px; color: #9ca3af; font-weight: 600; background: #fafafa; }
                    .cftr-r { font-family: monospace; color: #374151; font-weight: 900; font-size: 8px; }
                    @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
                </style>
                </head><body>
                <div class="card">
                    <div class="chdr">
                        <img src="${window.location.origin}/logo.png" class="logo" />
                        <div>
                            <div class="org-name">RILLCOD TECHNOLOGIES</div>
                            <div class="org-web">www.rillcod.com</div>
                        </div>
                        <div class="cbadge">Student Access Card</div>
                    </div>
                    <div class="cbody">
                        <div class="info">
                            <div class="sname">${credentials.name}</div>
                            ${classLabel ? `<div class="grade-tag">${classLabel}</div>` : ''}
                            <div class="sep"></div>
                            <div class="field">
                                <div class="lbl">Login Email</div>
                                <div class="val">${credentials.email}</div>
                            </div>
                            <div class="field">
                                <div class="lbl">Temporary Password</div>
                                <div class="val-accent">${credentials.tempPassword}</div>
                            </div>
                        </div>
                        <div class="qrp">
                            <img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${qrData}" class="qr" crossorigin="anonymous" />
                            <div class="qrl">Scan to login</div>
                        </div>
                    </div>
                    <div class="cftr">
                        <span>rillcod.com/login · Keep this card safe</span>
                        <span class="cftr-r">Issued ${dateStr}</span>
                    </div>
                </div>
                <script>window.onload = () => { window.print(); window.close(); }</script>
                </body></html>
            `;
            const win = window.open('', '_blank');
            win?.document.write(html);
            win?.document.close();
        };

        return (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="dialog" aria-modal="true">
                <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
                <div className="relative w-full max-w-md bg-background border border-border border-l-4 border-l-emerald-500 rounded-none shadow-2xl overflow-hidden">
                    <div className="p-6 border-b border-border flex items-center gap-4">
                        <div className="w-10 h-10 bg-emerald-500/10 border border-emerald-500/20 rounded-none flex items-center justify-center flex-shrink-0">
                            <CheckIcon className="w-5 h-5 text-emerald-500" />
                        </div>
                        <div>
                            <h2 className="font-bold text-foreground">Account Created</h2>
                            <p className="text-xs text-muted-foreground mt-0.5">Credentials for {credentials.name}</p>
                        </div>
                    </div>

                    <div className="p-6 space-y-4">
                        <div className="bg-amber-500/10 border border-amber-500/20 rounded-none p-3 flex items-start gap-3">
                            <ExclamationTriangleIcon className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                            <p className="text-xs text-amber-300 leading-relaxed">
                                Save these credentials now. The student must update their password on first login.
                            </p>
                        </div>
                        {credentials.cardId && (
                            <div className={`rounded-none p-3 border text-xs font-semibold ${credentials.cardIssued ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300' : 'bg-blue-500/10 border-blue-500/25 text-blue-300'}`}>
                                {credentials.cardIssued ? 'Card ready: identity card issued automatically.' : 'Card already exists: linked to this student.'}
                            </div>
                        )}

                        <div className="space-y-3">
                            {[
                                { label: 'Email', value: credentials.email },
                                { label: 'Temporary Password', value: credentials.tempPassword },
                            ].map(({ label, value }) => (
                                <div key={label}>
                                    <p className="text-xs text-muted-foreground mb-1.5">{label}</p>
                                    <div className="flex items-center gap-px">
                                        <div className="flex-1 px-4 py-3 bg-card border border-border text-foreground font-mono text-sm select-all truncate rounded-none">
                                            {value}
                                        </div>
                                        <button
                                            onClick={() => navigator.clipboard.writeText(value)}
                                            className="p-3 bg-muted hover:bg-muted/80 border border-border text-muted-foreground hover:text-foreground transition-colors rounded-none"
                                            title="Copy to clipboard">
                                            <ClipboardDocumentListIcon className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="flex gap-px border-t border-border">
                        <button
                            onClick={handlePrint}
                            className="flex-1 py-3.5 bg-muted hover:bg-muted/80 text-foreground text-xs font-bold transition-all border-r border-border rounded-none"
                        >
                            Print Card
                        </button>
                        <button
                            onClick={() => { setCredentials(null); onSuccess(); onClose(); }}
                            className="flex-[2] py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-all rounded-none"
                        >
                            Done
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // ── Main form ─────────────────────────────────────────────────────────────
    const content = (
        <div className={`relative w-full bg-background border border-border border-t-4 border-t-orange-600 rounded-none shadow-2xl overflow-hidden flex flex-col ${inline ? '' : 'max-w-lg max-h-[90vh]'}`}>

            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-border flex-shrink-0">
                <div>
                    <h2 className="font-bold text-foreground">
                        {initialData ? 'Edit Student' : 'Register Student'}
                    </h2>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        {initialData ? 'Update student details' : 'Add a new student to the platform'}
                    </p>
                </div>
                {!inline && (
                    <button onClick={onClose}
                        className="p-2 hover:bg-muted rounded-none text-muted-foreground hover:text-foreground transition-all">
                        <XMarkIcon className="w-5 h-5" />
                    </button>
                )}
            </div>

            {/* Scrollable form */}
            <form onSubmit={handleSubmit} className={`flex flex-col ${inline ? 'flex-1' : 'overflow-y-auto flex-1'}`}>
                <div className="p-6 space-y-5">

                    {error && (
                        <div className="flex items-start gap-3 bg-rose-500/10 border border-rose-500/20 border-l-4 border-l-rose-500 px-4 py-3 rounded-none">
                            <ExclamationTriangleIcon className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
                            <p className="text-xs text-rose-400">{error}</p>
                        </div>
                    )}

                    {/* Full Name */}
                    <Field label="Full Name" required>
                        <IconInput icon={UserIcon} name="full_name" type="text" placeholder="Student's full name"
                            value={form.full_name} onChange={handleChange} required />
                    </Field>

                    {/* Parent + Email */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Field label="Parent / Guardian Name">
                            <IconInput icon={UserIcon} name="parent_name" type="text" placeholder="Guardian name"
                                value={form.parent_name} onChange={handleChange} />
                        </Field>
                        <Field label="Student Email" required>
                            <IconInput icon={EnvelopeIcon} name="student_email" type="email" placeholder="student@email.com"
                                value={form.student_email} onChange={handleChange} required />
                        </Field>
                    </div>

                    <Field label="Parent Phone">
                        <IconInput icon={PhoneIcon} name="parent_phone" type="tel" placeholder="+234 XXX XXX XXXX"
                            value={form.parent_phone} onChange={handleChange} />
                    </Field>

                    {/* School */}
                    <Field label="School" required={!initialData}>
                        <div className="relative group">
                            <BuildingOfficeIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-orange-500 transition-colors z-10" />
                            {profile?.role === 'school' ? (
                                <div className="w-full pl-9 pr-4 py-2.5 bg-card border border-border rounded-none text-sm text-foreground flex items-center gap-2">
                                    <span className="flex-1 truncate">{form.school_name || 'Your school'}</span>
                                    <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Fixed</span>
                                </div>
                            ) : schools.length > 0 && !customSchool ? (
                                <select
                                    name="school_name"
                                    value={form.school_name}
                                    onChange={e => {
                                        if (e.target.value === '__other__') {
                                            setCustomSchool(true);
                                            setForm(prev => ({ ...prev, school_name: '' }));
                                        } else {
                                            handleChange(e);
                                        }
                                    }}
                                    required={!initialData}
                                    className="w-full pl-9 pr-4 py-2.5 bg-card border border-border rounded-none text-sm text-foreground focus:outline-none focus:border-orange-500 transition-colors appearance-none cursor-pointer">
                                    <option value="" className="bg-background">Select school…</option>
                                    {schools.map(s => <option key={s.id} value={s.name} className="bg-background">{s.name}</option>)}
                                    <option value="__other__" className="bg-background">Other (type below)</option>
                                </select>
                            ) : (
                                <div className="flex gap-1">
                                    <input name="school_name" type="text" placeholder="School name" value={form.school_name}
                                        onChange={handleChange} required={!initialData}
                                        className="flex-1 pl-9 pr-4 py-2.5 bg-card border border-border rounded-none text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-orange-500 transition-colors" />
                                    {schools.length > 0 && (
                                        <button type="button" onClick={() => { setCustomSchool(false); setForm(prev => ({ ...prev, school_name: '' })); }}
                                            className="px-3 py-2.5 bg-muted border border-border text-muted-foreground hover:text-foreground text-xs font-semibold transition-all rounded-none">
                                            ← List
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    </Field>

                    {/* Grade + Section */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Field label="Grade / Level">
                            <div className="relative group">
                                <BookOpenIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-orange-500 transition-colors z-10" />
                                <select name="grade_level" value={form.grade_level} onChange={handleChange}
                                    className="w-full pl-9 pr-4 py-2.5 bg-card border border-border rounded-none text-sm text-foreground focus:outline-none focus:border-orange-500 transition-colors appearance-none cursor-pointer">
                                    <option value="" className="bg-background">Select grade…</option>
                                    {GRADE_LEVELS.map(g => <option key={g} value={g} className="bg-background">{g}</option>)}
                                </select>
                            </div>
                        </Field>
                        <Field label="Section / Class">
                            <IconInput icon={BookOpenIcon} name="section_class" type="text" placeholder="e.g. Alpha, A, Gold"
                                value={form.section_class} onChange={handleChange} />
                        </Field>
                    </div>

                    {/* Location */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Field label="City">
                            <input name="city" type="text" placeholder="City" value={form.city} onChange={handleChange}
                                className="w-full px-4 py-2.5 bg-card border border-border rounded-none text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-orange-500 transition-colors" />
                        </Field>
                        <Field label="State">
                            <input name="state" type="text" placeholder="State" value={form.state} onChange={handleChange}
                                className="w-full px-4 py-2.5 bg-card border border-border rounded-none text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-orange-500 transition-colors" />
                        </Field>
                    </div>
                </div>

                {/* Footer actions */}
                <div className="flex gap-px border-t border-border flex-shrink-0 mt-auto">
                    {!inline && (
                        <button type="button" onClick={onClose}
                            className="flex-1 py-3.5 bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground text-xs font-bold transition-all border-r border-border rounded-none">
                            Cancel
                        </button>
                    )}
                    <button type="submit" disabled={loading}
                        className="flex-[2] flex items-center justify-center gap-2 py-3.5 bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold transition-all disabled:opacity-50 active:scale-[0.98] rounded-none">
                        {loading
                            ? <><ArrowPathIcon className="w-4 h-4 animate-spin" /> Saving…</>
                            : <><CheckIcon className="w-4 h-4" /> {initialData ? 'Save Changes' : 'Register Student'}</>}
                    </button>
                </div>
            </form>
        </div>
    );

    if (inline) return content;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
            {content}
        </div>
    );
}

/* ── Sub-components ─────────────────────────────────────── */
function Field({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) {
    return (
        <div className="space-y-1.5">
            <label className="block text-xs text-muted-foreground font-semibold">
                {label}{required && <span className="text-orange-500 ml-1">*</span>}
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
        <div className="relative group">
            <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-orange-500 transition-colors z-10" />
            <input name={name} type={type} placeholder={placeholder} value={value}
                onChange={onChange} required={required}
                className="w-full pl-9 pr-4 py-2.5 bg-card border border-border rounded-none text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-orange-500 transition-colors" />
        </div>
    );
}
