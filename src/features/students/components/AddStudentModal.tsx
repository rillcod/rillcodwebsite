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
    /** If provided, the student is auto-activated and enrolled into this class after registration */
    classId?: string;
    inline?: boolean;
}

const DEFAULT_FORM = {
    full_name: '', student_email: '', parent_name: '', parent_phone: '',
    school_name: '', grade_level: '', section_class: '', city: '', state: '',
};

export function AddStudentModal({ isOpen, onClose, onSuccess, initialData, classId, inline }: AddStudentModalProps) {
    const { profile } = useAuth();
    const [form, setForm] = useState(DEFAULT_FORM);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [schools, setSchools] = useState<{ id: string; name: string }[]>([]);
    const [credentials, setCredentials] = useState<{ email: string; tempPassword: string; name: string } | null>(null);

    // Fetch partner schools for dropdown (not needed for school role — locked to their own school)
    useEffect(() => {
        if (!isOpen) return;

        // Initialize form first so school_name is never overwritten
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
        if (!form.full_name.trim() || !form.student_email.trim() || !form.school_name.trim()) {
            setError('Full name, student email, and school are required.');
            return;
        }
        setLoading(true);
        setError('');
        try {
            if (initialData) {
                const res = await fetch(`/api/students/${initialData.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ...form, name: form.full_name }),
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
                        status: 'pending',
                        school_id: schoolId || null,
                        created_by: profile?.id,
                    }),
                });
                const json = await res.json();
                if (!res.ok) throw new Error(json.error || 'Failed to add student');

                // If called from a class page, or just adding a new student, auto-activate 
                if (json.student?.id) {
                    const actRes = await fetch('/api/students/activate', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ studentId: json.student.id }),
                    });
                    const actJson = await actRes.json();
                    
                    if (actRes.ok && actJson.portalUserId) {
                        // Enroll the new portal user into the class if classId is provided
                        if (classId) {
                            await fetch(`/api/classes/${classId}/enroll`, {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ studentIds: [actJson.portalUserId] }),
                            });
                        }
                        
                        // Show credentials to teacher (modal stays open until Done clicked)
                        if (!actJson.alreadyActivated && actJson.tempPassword) {
                            const nameToUse = form.full_name || initialData?.full_name || 'Student';
                            setForm(DEFAULT_FORM);
                            setCredentials({ 
                                email: actJson.email, 
                                tempPassword: actJson.tempPassword, 
                                name: nameToUse 
                            });
                            return; // don't fall through to onSuccess/onClose yet
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

    if (!isOpen && !inline) return null;    // Credentials display after class auto-enrolment
    if (credentials) {
        const handlePrint = () => {
            const dateStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
            const html = `
                <html><head><title>Access Card - ${credentials.name}</title>                <style>
                    @page { margin: 0; size: auto; }
                    body { font-family: system-ui, -apple-system, sans-serif; height: 100vh; margin: 0; display: flex; align-items: center; justify-content: center; background: #fff; }
                    .card { width: 340px; border: 1.5px solid #ea580c; padding: 25px; background: white; box-sizing: border-box; position: relative; }
                    .header { border-bottom: 2px solid #f3f4f6; margin-bottom: 20px; padding-bottom: 10px; display: flex; align-items:flex-end; gap: 10px;}
                    .brand { font-weight: 900; font-size: 20px; font-style: italic; color: #000; letter-spacing: -0.02em; }
                    .dot { color: #ea580c; font-style: normal; }
                    .tagline { font-size: 7px; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.4em; font-black: 900; margin-top: 4px; }
                    .title { font-size: 10px; font-weight: 900; color: #ea580c; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 15px; }
                    .student-name { font-size: 15px; font-weight: 800; color: #111827; margin-bottom: 20px; text-transform: uppercase; border-bottom: 1px solid #111; padding-bottom: 4px; display:flex; justify-content: space-between; align-items:center;}
                    .student-name span.cls { font-size: 9px; font-style: italic; color: #ea580c; border: 1px solid #ea580c; padding: 2px 5px;}
                    .field { margin-bottom: 12px; }
                    .label { font-size: 8px; font-weight: 900; color: #6b7280; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 4px; }
                    .value { font-size: 12px; font-weight: 700; color: #111827; background: #f9fafb; border: 1px solid #e5e7eb; padding: 8px; font-family: 'JetBrains Mono', monospace; }
                    .footer { margin-top: 25px; padding-top: 12px; border-top: 1px dashed #e5e7eb; font-size: 7.5px; color: #9ca3af; line-height: 1.5; font-weight: 600; }
                    .checksum { position: absolute; bottom: 25px; right: 25px; font-size: 18px; color: #f3f4f6; font-weight: 900; transform: rotate(-45deg); pointer-events: none; }
                </style>
                </head><body>
                <div class="card">
                    <div class="checksum">AUTH:OK</div>
                    <div class="header">
                        <img src="${window.location.origin}/logo.png" style="height: 32px;"/>
                        <div>
                           <div class="brand">RILLCOD<span class="dot">.</span></div>
                           <div class="tagline">STEM Excellence • Official Node</div>
                        </div>
                    </div>
                    <div class="title">Security Uplink Credentials</div>
                    <div class="student-name">
                      <span>${credentials.name}</span>
                      ${form.section_class || form.grade_level ? `<span class="cls">${form.section_class || form.grade_level}</span>` : ''}
                    </div>
                    <div class="field">
                        <div class="label">System Identity (Email)</div>
                        <div class="value">${credentials.email}</div>
                    </div>
                    <div class="field">
                        <div class="label">Temporary Cipher (Password)</div>
                        <div class="value">${credentials.tempPassword}</div>
                    </div>
                    <div class="footer">
                        PORTAL: https://rillcod.com/login<br/>
                        EXPIRY: Manual Rotation Recommended • Issued ${dateStr}
                    </div></div>
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
                <div className="absolute inset-0 bg-black/95 backdrop-blur-xl" />
                <div className="relative w-full max-w-md bg-[#1a1a1a] border-l-8 border-l-emerald-500 border border-white/10 rounded-none shadow-latest p-0 overflow-hidden">
                    <div className="p-8 border-b border-white/5 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center rotate-3">
                                <CheckIcon className="w-6 h-6 text-emerald-500" />
                            </div>
                            <div>
                                <h2 className="text-xl font-black text-white uppercase tracking-tight italic">Uplink Success</h2>
                                <p className="text-[10px] font-black text-white/30 uppercase tracking-widest leading-none mt-1">Authorized Credentials Created</p>
                            </div>
                        </div>
                    </div>

                    <div className="p-8 space-y-6">
                        <div className="flex flex-col items-center py-6 border border-white/5 bg-black/20 mb-4">
                            <div className="text-[10px] font-black text-white uppercase italic tracking-widest mb-1">RILLCOD<span className="text-orange-500 not-italic">.</span></div>
                            <div className="text-[7px] font-black text-white/20 uppercase tracking-[0.5em] mb-4">Identity Protocol</div>
                            <div className="text-lg font-black text-white uppercase tracking-tighter italic">{credentials.name}</div>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <p className="text-[9px] font-black text-slate-600 uppercase tracking-[0.3em] mb-2">Secure Email (Port)</p>
                                <div className="p-4 bg-black/40 border border-white/10 text-blue-400 font-mono text-sm font-bold flex items-center justify-between">
                                    <span className="select-all">{credentials.email}</span>
                                    <button onClick={() => navigator.clipboard.writeText(credentials.email)} className="text-white/20 hover:text-white"><ArrowPathIcon className="w-4 h-4" /></button>
                                </div>
                            </div>
                            <div>
                                <p className="text-[9px] font-black text-slate-600 uppercase tracking-[0.3em] mb-2">Access Cipher (Key)</p>
                                <div className="p-4 bg-black/40 border border-white/10 text-amber-500 font-mono text-sm font-bold flex items-center justify-between">
                                    <span className="select-all">{credentials.tempPassword}</span>
                                    <button onClick={() => navigator.clipboard.writeText(credentials.tempPassword)} className="text-white/20 hover:text-white"><ArrowPathIcon className="w-4 h-4" /></button>
                                </div>
                            </div>
                        </div>

                        <div className="bg-amber-500/5 border border-amber-500/20 p-4 flex items-start gap-4">
                            <ExclamationTriangleIcon className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                            <p className="text-[10px] font-bold text-amber-500/60 italic leading-relaxed uppercase tracking-widest">
                                Protocol: Copy credentials immediately. Passwords are encrypted post-transmission. Manual rotation required at first sector login.
                            </p>
                        </div>
                    </div>

                    <div className="flex gap-px p-8 pt-0 border-t border-white/5 bg-black/20">
                        <button
                            onClick={handlePrint}
                            className="flex-1 py-4 bg-white/5 hover:bg-white/10 text-white text-[10px] font-black uppercase tracking-widest transition-all border border-white/10"
                        >
                            Print Card
                        </button>
                        <button
                            onClick={() => { setCredentials(null); onSuccess(); onClose(); }}
                            className="flex-[2] py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-[10px] uppercase tracking-[0.4em] transition-all shadow-xl shadow-emerald-600/20"
                        >
                            Finalize Access
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    const content = (
        <div className={`relative w-full border border-white/10 rounded-none shadow-2xl overflow-hidden flex flex-col border-t-8 border-t-orange-500 ${inline ? 'bg-[#0d1526]' : 'max-w-lg bg-[#1a1a1a] max-h-[90vh]'}`}>

            {/* Header */}
            <div className="flex items-center justify-between p-10 border-b border-white/5 flex-shrink-0 relative">
                <div className="absolute top-0 right-0 w-32 h-32 bg-orange-500/5 blur-[60px] pointer-events-none"></div>
                <div>
                    <div className="flex items-center gap-3 mb-1">
                        <UserIcon className="w-4 h-4 text-orange-500" />
                        <span className="text-[10px] font-black text-orange-500 uppercase tracking-[0.3em]">Sector: Students</span>
                    </div>
                    <h2 className="text-2xl font-black text-white uppercase italic tracking-tight">{initialData ? 'Update Record' : 'Initialize Enrollment'}</h2>
                </div>
                {!inline && (
                    <button onClick={onClose}
                        className="p-3 rounded-none bg-white/5 border border-white/5 hover:border-orange-500/30 text-white/40 hover:text-white transition-all">
                        <XMarkIcon className="w-6 h-6" />
                    </button>
                )}
            </div>

            {/* Scrollable form */}
            <form onSubmit={handleSubmit} className={inline ? 'flex-1' : 'overflow-y-auto flex-1 custom-scrollbar'}>
                    <div className="p-10 space-y-10">

                        {error && (
                            <div className="flex items-start gap-4 bg-rose-500/5 border border-rose-500/20 rounded-none px-6 py-4 border-l-4 border-l-rose-500">
                                <ExclamationTriangleIcon className="w-5 h-5 text-rose-500 flex-shrink-0" />
                                <p className="text-[10px] font-black uppercase tracking-widest text-rose-500 leading-relaxed">{error}</p>
                            </div>
                        )}

                        {/* Full Name */}
                        <Field label="Protocol: Full Student Name" required>
                            <IconInput icon={UserIcon} name="full_name" type="text" placeholder="Identity String"
                                value={form.full_name} onChange={handleChange} required />
                        </Field>

                        {/* Parent info */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                            <Field label="Guardian Name">
                                <IconInput icon={UserIcon} name="parent_name" type="text" placeholder="Primary Guardian"
                                    value={form.parent_name} onChange={handleChange} />
                            </Field>
                            <Field label="System Email" required>
                                <IconInput icon={EnvelopeIcon} name="student_email" type="email" placeholder="uplink@node.com"
                                    value={form.student_email} onChange={handleChange} required />
                            </Field>
                        </div>

                        <Field label="Primary Uplink (Phone)">
                            <IconInput icon={PhoneIcon} name="parent_phone" type="tel" placeholder="+234 XXX XXX XXXX"
                                value={form.parent_phone} onChange={handleChange} />
                        </Field>

                        {/* School */}
                        <Field label="Entity: Partner Institution" required>
                            <div className="relative group">
                                <BuildingOfficeIcon className="absolute left-6 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-800 group-focus-within:text-orange-500 transition-colors z-10" />
                                {profile?.role === 'school' ? (
                                    <div className="w-full pl-14 pr-6 py-5 bg-[#121212] border border-white/10 rounded-none text-sm text-white font-bold flex items-center gap-3 italic">
                                        <span className="flex-1 truncate">{form.school_name || 'Active Institution'}</span>
                                        <span className="text-[9px] text-orange-500 font-black uppercase bg-orange-500/10 px-3 py-1 rounded-none border border-orange-500/20">Locked Protocol</span>
                                    </div>
                                ) : schools.length > 0 ? (
                                    <select name="school_name" value={form.school_name} onChange={handleChange} required
                                        className="w-full pl-14 pr-10 py-5 bg-[#121212] border border-white/10 rounded-none text-sm text-white font-bold focus:outline-none focus:border-orange-500 transition-all appearance-none cursor-pointer">
                                        <option value="" className="bg-[#1a1a1a]">SELECT VERIFIED NODE…</option>
                                        {schools.map(s => <option key={s.id} value={s.name} className="bg-[#1a1a1a] uppercase">{s.name}</option>)}
                                        <option value="__other__" className="bg-[#1a1a1a]">OTHER SECTOR</option>
                                    </select>
                                ) : (
                                    <input name="school_name" type="text" placeholder="Institution Name" value={form.school_name}
                                        onChange={handleChange} required
                                        className="w-full pl-14 pr-6 py-5 bg-[#121212] border border-white/10 rounded-none text-sm text-white font-bold focus:outline-none focus:border-orange-500 transition-all placeholder:text-slate-900" />
                                )}
                            </div>
                        </Field>

                        {/* Grade + Section */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                            <Field label="Academic Tier">
                                <div className="relative group">
                                    <BookOpenIcon className="absolute left-6 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-800 group-focus-within:text-orange-500 transition-colors z-10" />
                                    <select name="grade_level" value={form.grade_level} onChange={handleChange}
                                        className="w-full pl-14 pr-10 py-5 bg-[#121212] border border-white/10 rounded-none text-sm text-white font-bold focus:outline-none focus:border-orange-500 transition-all appearance-none cursor-pointer">
                                        <option value="" className="bg-[#1a1a1a]">SELECT TIER…</option>
                                        {GRADE_LEVELS.map(g => <option key={g} value={g} className="bg-[#1a1a1a] uppercase">{g}</option>)}
                                    </select>
                                </div>
                            </Field>
                            <Field label="Section Class">
                                <IconInput icon={BookOpenIcon} name="section_class" type="text" placeholder="e.g. ALPHA"
                                    value={form.section_class} onChange={handleChange} />
                            </Field>
                        </div>

                        {/* Location */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                            <Field label="City Node">
                                <input name="city" type="text" placeholder="City" value={form.city} onChange={handleChange}
                                    className="w-full px-6 py-5 bg-[#121212] border border-white/10 rounded-none text-sm text-white font-bold focus:outline-none focus:border-orange-500 transition-all placeholder:text-slate-900 shadow-inner shadow-black/20" />
                            </Field>
                            <Field label="State Sector">
                                <input name="state" type="text" placeholder="State" value={form.state} onChange={handleChange}
                                    className="w-full px-6 py-5 bg-[#121212] border border-white/10 rounded-none text-sm text-white font-bold focus:outline-none focus:border-orange-500 transition-all placeholder:text-slate-900 shadow-inner shadow-black/20" />
                            </Field>
                        </div>
                    </div>

                    {/* Footer actions */}
                    <div className="flex gap-px p-10 pt-4 border-t border-white/5 flex-shrink-0">
                        {!inline && (
                            <button type="button" onClick={onClose}
                                className="flex-1 py-6 bg-white/5 hover:bg-white/10 text-slate-500 hover:text-white text-[10px] font-black uppercase tracking-[0.4em] transition-all border border-white/5">
                                ABORT
                            </button>
                        )}
                        <button type="submit" disabled={loading}
                            className="flex-[2] flex items-center justify-center gap-4 py-6 bg-orange-500 text-white text-[10px] font-black uppercase tracking-[0.4em] transition-all disabled:opacity-50 shadow-xl shadow-orange-500/20 hover:bg-orange-600">
                            {loading
                                ? <><ArrowPathIcon className="w-5 h-5 animate-spin" /> EXECUTING…</>
                                : <><CheckIcon className="w-5 h-5" /> {initialData ? 'COMMIT UPDATE' : 'INITIALIZE RECORD'}</>}
                        </button>
                    </div>
                </form>
            </div>
    );

    if (inline) return content;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={onClose} />
            {content}
        </div>
    );
}

/* ── Sub-components ─────────────────────────────────────── */
function Field({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) {
    return (
        <div className="space-y-3">
            <label className="block text-[10px] font-black text-slate-600 uppercase tracking-widest ml-1 italic leading-none">
                {label}{required && <span className="text-orange-500 ml-1.5">*</span>}
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
            <Icon className="absolute left-6 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-800 group-focus-within:text-orange-500 transition-colors z-10" />
            <input name={name} type={type} placeholder={placeholder} value={value}
                onChange={onChange} required={required}
                className="w-full pl-14 pr-6 py-5 bg-[#121212] border border-white/10 rounded-none text-sm text-white font-bold focus:outline-none focus:border-orange-500 transition-all placeholder:text-slate-900 shadow-inner shadow-black/20" />
        </div>
    );
}
