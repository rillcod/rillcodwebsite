// @refresh reset
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { studentApprovalPaymentState } from '@/lib/registration/payment-state';
import {
    ClipboardDocumentCheckIcon, CheckCircleIcon, XCircleIcon,
    ClockIcon, BuildingOfficeIcon, AcademicCapIcon,
    EnvelopeIcon, PhoneIcon, UserGroupIcon, ExclamationTriangleIcon,
    SunIcon, UserPlusIcon, ShieldCheckIcon,
} from '@/lib/icons';

function parseProspectNotes(notes: string | null) {
    if (!notes) {
        return { studentPhone: null, plan: null, method: null, receiptUrl: null, trackChoice: null, cleanNotes: '' };
    }
    
    const phoneMatch = notes.match(/\[Student Phone:\s*([^\]]+)\]/);
    const planMatch = notes.match(/\[Plan:\s*([^\]]+)\]/);
    const methodMatch = notes.match(/\[Method:\s*([^\]]+)\]/);
    const refMatch = notes.match(/\[Ref:\s*([^\]]+)\]/);
    const trackMatch = notes.match(/\[Track Choice:\s*([^\]]+)\]/);
    
    const cleanNotes = notes
        .replace(/\[Student Phone:\s*([^\]]+)\]/g, '')
        .replace(/\[Plan:\s*([^\]]+)\]/g, '')
        .replace(/\[Method:\s*([^\]]+)\]/g, '')
        .replace(/\[Ref:\s*([^\]]+)\]/g, '')
        .replace(/\[Track Choice:[^\]]+\]/g, '')
        .trim();
        
    return {
        studentPhone: phoneMatch ? phoneMatch[1].trim() : null,
        plan: planMatch ? planMatch[1].trim() : null,
        method: methodMatch ? methodMatch[1].trim() : null,
        receiptUrl: refMatch ? refMatch[1].trim() : null,
        trackChoice: trackMatch ? trackMatch[1].trim() : null,
        cleanNotes: cleanNotes
    };
}

function StatusBadge({ status }: { status: string }) {
    const map: Record<string, string> = {
        approved: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
        pending: 'bg-amber-500/20  text-amber-400  border-amber-500/30',
        pending_verification: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
        partially_paid: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
        unpaid: 'bg-muted text-muted-foreground border-border',
        paid: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
        rejected: 'bg-rose-500/20   text-rose-400   border-rose-500/30',
    };
    const labels: Record<string, string> = {
        pending_verification: 'awaiting verification',
        partially_paid: 'deposit paid — balance due',
        unpaid: 'awaiting payment',
    };
    return (
        <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border capitalize ${map[status] ?? 'bg-muted text-muted-foreground'}`}>
            {labels[status] ?? status.replace(/_/g, ' ')}
        </span>
    );
}

function EnrollTypeBadge({ type }: { type?: string }) {
    const map: Record<string, string> = {
        school: 'bg-primary/20 text-primary border-primary/30',
        bootcamp: 'bg-amber-500/20 text-amber-500 border-amber-500/30',
        online: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    };
    const label: Record<string, string> = {
        school: 'Partner School', bootcamp: 'Bootcamp', online: 'Online School',
    };
    if (!type) return null;
    return (
        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${map[type] ?? 'bg-muted text-muted-foreground border-border'}`}>
            {label[type] ?? type}
        </span>
    );
}

export default function ApprovalsPage() {
    const { profile, loading: authLoading } = useAuth();
    const [tab, setTab] = useState<'students' | 'schools' | 'prospective'>('students');
    const [students, setStudents] = useState<any[]>([]);
    const [schools, setSchools] = useState<any[]>([]);
    const [prospective, setProspective] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [acting, setActing] = useState<string | null>(null);
    const [actingError, setActingError] = useState<string | null>(null);
    const [credentials, setCredentials] = useState<{
        email: string;
        password: string;
        name: string;
        student?: { email: string; password?: string | null } | null;
        parent?: { email: string; password?: string | null } | null;
    } | null>(null);

    // Manual (offline / physical) payment → admit flow
    const [payModal, setPayModal] = useState<any | null>(null);
    const [payAmount, setPayAmount] = useState('');
    const [payMethod, setPayMethod] = useState('cash');
    const [payRef, setPayRef] = useState('');
    const [payFile, setPayFile] = useState<File | null>(null);
    const [paying, setPaying] = useState(false);
    const [removing, setRemoving] = useState<string | null>(null);

    const isStaff = profile?.role === 'admin' || profile?.role === 'teacher';

    useEffect(() => {
        if (authLoading || !profile || !isStaff) return;
        let cancelled = false;

        async function load() {
            setLoading(true);
            setError(null);
            try {
                const supabase = createClient();
                const [studRes, schRes, prosRes] = await Promise.allSettled([
                    supabase.from('students').select('*').eq('status', 'pending').neq('is_deleted', true).order('created_at', { ascending: true }),
                    supabase.from('schools').select('*').eq('status', 'pending').neq('is_deleted', true).order('created_at', { ascending: true }),
                    supabase.from('prospective_students').select('*').neq('is_deleted', true).eq('is_active', false).ilike('course_interest', '%Summer School%').order('created_at', { ascending: true }),
                ]);
                if (!cancelled) {
                    setStudents(studRes.status === 'fulfilled' ? (studRes.value.data ?? []) : []);
                    setSchools(schRes.status === 'fulfilled' ? (schRes.value.data ?? []) : []);
                    setProspective(prosRes.status === 'fulfilled' ? (prosRes.value.data ?? []) : []);
                }
            } catch (e: any) {
                if (!cancelled) setError(e.message ?? 'Failed to load');
            } finally {
                if (!cancelled) setLoading(false);
            }
        }
        load();
        return () => { cancelled = true; };
    }, [profile?.id, isStaff, authLoading]); // eslint-disable-line

    const handleStudent = async (id: string, action: 'approved' | 'rejected') => {
        setActing(id); setActingError(null);
        try {
            const student = students.find(s => s.id === id);
            const res = await fetch('/api/approvals/students', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, action }),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || 'Action failed');
            setStudents(prev => prev.filter(s => s.id !== id));
            if (action === 'approved' && json.credentials) {
                setCredentials({ ...json.credentials, name: student?.full_name ?? 'Student' });
            }
        } catch (e: any) {
            setActingError(e.message ?? 'Action failed. Please try again.');
        } finally {
            setActing(null);
        }
    };

    const handleSchool = async (id: string, action: 'approved' | 'rejected') => {
        setActing(id); setActingError(null);
        try {
            const school = schools.find(s => s.id === id);
            const res = await fetch('/api/approvals/schools', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, action }),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || 'Action failed');
            setSchools(prev => prev.filter(s => s.id !== id));
            if (action === 'approved' && json.credentials) {
                setCredentials({ ...json.credentials, name: school?.name ?? 'School' });
            }
        } catch (e: any) {
            setActingError(e.message ?? 'Action failed. Please try again.');
        } finally {
            setActing(null);
        }
    };

    const handleProspective = async (id: string, action: 'approved' | 'rejected') => {
        setActing(id); setActingError(null);
        try {
            const prospect = prospective.find(s => s.id === id);
            const res = await fetch('/api/approvals/prospective', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, action }),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || 'Action failed');
            setProspective(prev => prev.filter(s => s.id !== id));
            if (action === 'approved' && json.credentials) {
                setCredentials({
                    email: json.credentials.student?.email || '',
                    password: json.credentials.student?.password || '',
                    name: prospect?.full_name ?? 'Summer Student',
                    parent: json.credentials.parent,
                    student: json.credentials.student,
                });
            }
        } catch (e: any) {
            setActingError(e.message ?? 'Action failed. Please try again.');
        } finally {
            setActing(null);
        }
    };

    // Record a PHYSICAL/offline payment (upload evidence) and admit the student in one step.
    const recordManualPayment = async () => {
        if (!payModal) return;
        if (!payFile) { toast.error('Upload the payment evidence (receipt / screenshot) first.'); return; }
        const amt = Number(payAmount);
        if (!Number.isFinite(amt) || amt <= 0) { toast.error('Enter a valid payment amount.'); return; }
        setPaying(true);
        try {
            // 1. Upload the evidence to R2.
            const fd = new FormData();
            fd.append('file', payFile);
            const upRes = await fetch('/api/files/upload', { method: 'POST', body: fd });
            const upJson = await upRes.json();
            if (!upRes.ok || !upJson.success) throw new Error(upJson.error || upJson.message || 'Evidence upload failed');
            const evidenceUrl = upJson.data?.public_url;
            if (!evidenceUrl) throw new Error('Upload did not return a file URL — try again.');

            // 2. Record payment + admit.
            const res = await fetch('/api/summer-school/manual-payment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prospectId: payModal.id, amount: amt, method: payMethod, reference: payRef.trim(), evidenceUrl }),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || 'Failed to record payment');

            setProspective(prev => prev.filter(p => p.id !== payModal.id));
            setCredentials({
                email: json.studentLogin || '',
                password: json.studentPassword || '',
                name: payModal.full_name ?? 'Summer Student',
                student: json.studentLogin ? { email: json.studentLogin, password: json.studentPassword } : null,
                parent: json.parentLogin ? { email: json.parentLogin, password: json.parentPassword } : null,
            });
            toast.success(json.message || 'Payment recorded and student admitted.');
            setPayModal(null); setPayAmount(''); setPayRef(''); setPayFile(null); setPayMethod('cash');
        } catch (e: any) {
            toast.error(e.message || 'Failed to record payment.');
        } finally {
            setPaying(false);
        }
    };

    // Full CRUD removal of an unwanted / duplicate / failed entry.
    // Summer prospects → HARD CASCADE delete (row + any account it created).
    // Pending students/schools (no account yet) → soft retire from the queue.
    const removeEntry = async (kind: 'students' | 'schools' | 'prospective', id: string, label: string) => {
        const hard = kind === 'prospective';
        const msg = hard
            ? `Permanently delete "${label}"? This removes the applicant AND any student/parent account created from it. This cannot be undone.`
            : `Remove "${label}" from the queue? This hides the entry — an admin can restore it from the database if needed.`;
        if (!confirm(msg)) return;
        setRemoving(id); setActingError(null);
        try {
            if (hard) {
                const res = await fetch(`/api/summer-school/prospect/${id}`, { method: 'DELETE' });
                const json = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(json.error || 'Delete failed');
                setProspective(prev => prev.filter(s => s.id !== id));
                toast.success(json.deletedStudent ? 'Applicant + account deleted.' : 'Applicant deleted.');
            } else {
                const supabase = createClient();
                const table = kind === 'students' ? 'students' : 'schools';
                const { error } = await supabase
                    .from(table)
                    .update({ is_deleted: true, is_active: false, updated_at: new Date().toISOString() })
                    .eq('id', id);
                if (error) throw new Error(error.message);
                if (kind === 'students') setStudents(prev => prev.filter(s => s.id !== id));
                else setSchools(prev => prev.filter(s => s.id !== id));
                toast.success('Entry removed from the queue.');
            }
        } catch (e: any) {
            setActingError(`Could not remove entry: ${e.message}`);
        } finally {
            setRemoving(null);
        }
    };

    // Loading
    if (authLoading || loading) return (
        <div className="min-h-screen bg-background text-foreground">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
                <div className="animate-pulse space-y-2">
                    <div className="h-4 bg-muted rounded w-40" />
                    <div className="h-8 bg-muted rounded w-64" />
                </div>
                {[1, 2, 3].map(i => <div key={i} className="bg-card shadow-sm border border-border rounded-xl h-24 animate-pulse" />)}
            </div>
        </div>
    );

    if (!isStaff) return (
        <div className="min-h-screen bg-background flex items-center justify-center">
            <p className="text-muted-foreground">Admin or Teacher access required.</p>
        </div>
    );

    const currentList = tab === 'students' ? students : tab === 'schools' ? schools : prospective;

    return (
        <div className="min-h-screen bg-background text-foreground">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">

                {/* Tab bar — People */}
                <div className="flex items-center gap-1 bg-card border border-border rounded-xl p-1 w-fit flex-wrap">
                    <Link href="/dashboard/schools" className="flex items-center gap-2 px-4 py-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 text-sm font-bold transition-all">
                        <BuildingOfficeIcon className="w-4 h-4" /> Schools
                    </Link>
                    <Link href="/dashboard/teachers" className="flex items-center gap-2 px-4 py-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 text-sm font-bold transition-all">
                        <AcademicCapIcon className="w-4 h-4" /> Teachers
                    </Link>
                    <Link href="/dashboard/students" className="flex items-center gap-2 px-4 py-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 text-sm font-bold transition-all">
                        <UserGroupIcon className="w-4 h-4" /> Students
                    </Link>
                    <Link href="/dashboard/parents" className="flex items-center gap-2 px-4 py-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 text-sm font-bold transition-all">
                        <UserPlusIcon className="w-4 h-4" /> Parents
                    </Link>
                    <Link href="/dashboard/users" className="flex items-center gap-2 px-4 py-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 text-sm font-bold transition-all">
                        <ShieldCheckIcon className="w-4 h-4" /> Users
                    </Link>
                    <span className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-black">
                        <ClipboardDocumentCheckIcon className="w-4 h-4" /> Approvals
                    </span>
                </div>

                {/* Header */}
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <ClipboardDocumentCheckIcon className="w-5 h-5 text-primary" />
                        <span className="text-xs font-bold text-primary uppercase tracking-widest">Registration Queue · {profile?.role}</span>
                    </div>
                    <h1 className="text-3xl font-extrabold">Approvals</h1>
                    <p className="text-muted-foreground text-sm mt-1">Review and action pending registrations</p>
                </div>

                {error && (
                    <div className="flex items-center gap-3 bg-rose-500/10 border border-rose-500/20 rounded-xl p-4">
                        <ExclamationTriangleIcon className="w-5 h-5 text-rose-400" />
                        <p className="text-rose-400 text-sm">{error}</p>
                    </div>
                )}
                {actingError && (
                    <div className="flex items-center justify-between gap-3 bg-rose-500/10 border border-rose-500/20 p-4">
                        <div className="flex items-center gap-3">
                            <ExclamationTriangleIcon className="w-5 h-5 text-rose-400 flex-shrink-0" />
                            <p className="text-rose-400 text-sm">{actingError}</p>
                        </div>
                        <button onClick={() => setActingError(null)} className="text-rose-400 hover:text-rose-300 text-xs font-bold flex-shrink-0">Dismiss</button>
                    </div>
                )}

                {/* Summary */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div className="bg-card shadow-sm border border-border rounded-xl p-5">
                        <div className="w-10 h-10 bg-amber-500/10 rounded-xl flex items-center justify-center mb-3">
                            <UserGroupIcon className="w-5 h-5 text-amber-400" />
                        </div>
                        <p className="text-2xl font-extrabold text-amber-400">{students.length}</p>
                        <p className="text-xs text-muted-foreground mt-1">Pending Students</p>
                    </div>
                    <div className="bg-card shadow-sm border border-border rounded-xl p-5">
                        <p className="text-2xl font-extrabold text-primary">{students.filter(s => s.enrollment_type === 'school' || !s.enrollment_type).length}</p>
                        <p className="text-xs text-muted-foreground mt-1">Partner School</p>
                    </div>
                    <div className="bg-card shadow-sm border border-border rounded-xl p-5">
                        <p className="text-2xl font-extrabold text-amber-500">{students.filter(s => s.enrollment_type === 'bootcamp').length}</p>
                        <p className="text-xs text-muted-foreground mt-1">Bootcamp</p>
                    </div>
                    <div className="bg-card shadow-sm border border-border rounded-xl p-5">
                        <p className="text-2xl font-extrabold text-emerald-400">{students.filter(s => s.enrollment_type === 'online').length}</p>
                        <p className="text-xs text-muted-foreground mt-1">Online School</p>
                    </div>
                </div>
                {profile?.role === 'admin' && schools.length > 0 && (
                    <div className="bg-card shadow-sm border border-border rounded-xl p-5 flex items-center gap-4">
                        <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center flex-shrink-0">
                            <BuildingOfficeIcon className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                            <p className="text-2xl font-extrabold text-primary">{schools.length}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">Pending School Applications</p>
                        </div>
                    </div>
                )}

                {/* Tabs */}
                <div className="flex gap-2 bg-card shadow-sm p-1 rounded-xl border border-border w-fit">
                    <button onClick={() => setTab('students')}
                        className={`px-5 py-2 rounded-xl text-sm font-bold transition-all ${tab === 'students' ? 'bg-primary text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                        Students ({students.length})
                    </button>
                    <button onClick={() => setTab('prospective')}
                        className={`px-5 py-2 rounded-xl text-sm font-bold transition-all ${tab === 'prospective' ? 'bg-amber-500 text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                        Summer School ({prospective.length})
                    </button>
                    {profile?.role === 'admin' && (
                        <button onClick={() => setTab('schools')}
                            className={`px-5 py-2 rounded-xl text-sm font-bold transition-all ${tab === 'schools' ? 'bg-primary text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                            Schools ({schools.length})
                        </button>
                    )}
                </div>

                {/* Empty */}
                {currentList.length === 0 && (
                    <div className="text-center py-20 bg-card shadow-sm border border-border rounded-xl">
                        <CheckCircleIcon className="w-14 h-14 mx-auto text-emerald-400/30 mb-4" />
                        <p className="text-lg font-semibold text-muted-foreground">All clear!</p>
                        <p className="text-sm text-muted-foreground mt-1">No pending {tab} registrations</p>
                    </div>
                )}

                {/* Student list */}
                {tab === 'students' && students.length > 0 && (
                    <div className="bg-card shadow-sm border border-border rounded-xl overflow-hidden">
                        <div className="p-5 border-b border-border">
                            <h3 className="font-bold text-foreground">Pending Student Applications</h3>
                        </div>
                        <div className="divide-y divide-border">
                            {students.map(s => (
                                <div key={s.id} className="p-5 hover:bg-card shadow-sm transition-colors">
                                    <div className="flex items-start gap-4">
                                        <div className="w-10 h-10 bg-gradient-to-br from-primary to-primary flex items-center justify-center text-sm font-black text-foreground flex-shrink-0">
                                            {(s.full_name ?? '?')[0]}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap mb-0.5">
                                                <p className="font-bold text-foreground">{s.full_name}</p>
                                                <EnrollTypeBadge type={s.enrollment_type} />
                                                {studentApprovalPaymentState(s) === 'awaiting_payment' && (
                                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold border bg-rose-500/10 text-rose-400 border-rose-500/30">
                                                        Awaiting payment
                                                    </span>
                                                )}
                                                {studentApprovalPaymentState(s) === 'paid' && (
                                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold border bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
                                                        Payment confirmed
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex flex-wrap gap-3 mt-1 text-xs text-muted-foreground">
                                                {s.parent_email && (
                                                    <span className="flex items-center gap-1 bg-muted/40 px-2 py-0.5 rounded border border-border/50">
                                                        <EnvelopeIcon className="w-3.5 h-3.5 text-primary" />
                                                        <a href={`mailto:${s.parent_email}`} className="hover:text-primary hover:underline transition-colors block truncate max-w-[180px]">{s.parent_email}</a>
                                                        <button onClick={() => { navigator.clipboard.writeText(s.parent_email); toast.success('Email copied!'); }} className="text-[9px] font-black text-muted-foreground hover:text-foreground uppercase tracking-widest ml-1 border border-border/60 px-1 rounded bg-background">Copy</button>
                                                    </span>
                                                )}
                                                {s.parent_phone && (
                                                    <span className="flex items-center gap-1 bg-muted/40 px-2 py-0.5 rounded border border-border/50">
                                                        <PhoneIcon className="w-3.5 h-3.5 text-primary" />
                                                        <a href={`tel:${s.parent_phone}`} className="hover:text-primary hover:underline transition-colors font-semibold">{s.parent_phone}</a>
                                                        <a href={`https://wa.me/${s.parent_phone.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="text-emerald-500 hover:text-emerald-400 font-bold ml-1" title="WhatsApp Chat">WA</a>
                                                        <button onClick={() => { navigator.clipboard.writeText(s.parent_phone); toast.success('Phone copied!'); }} className="text-[9px] font-black text-muted-foreground hover:text-foreground uppercase tracking-widest ml-1 border border-border/60 px-1 rounded bg-background">Copy</button>
                                                    </span>
                                                )}
                                                {s.school_name && <span className="flex items-center gap-1"><BuildingOfficeIcon className="w-3.5 h-3.5" />{s.school_name}{s.school_id ? <span className="text-emerald-500/60 ml-0.5">✓</span> : <span className="text-amber-400/70 ml-0.5" title="No school ID resolved">!</span>}</span>}
                                                {s.current_class && <span className="flex items-center gap-1"><AcademicCapIcon className="w-3.5 h-3.5" />Class: {s.current_class}</span>}
                                            </div>
                                            {s.goals && <p className="text-xs text-muted-foreground mt-2 line-clamp-2">Goal: {s.goals}</p>}
                                            <p className="text-xs text-muted-foreground mt-1">Applied {new Date(s.created_at).toLocaleDateString()}</p>
                                        </div>
                                        <div className="flex flex-col sm:flex-row gap-2 flex-shrink-0">
                                            <button
                                                onClick={() => handleStudent(s.id, 'approved')}
                                                disabled={acting === s.id || studentApprovalPaymentState(s) === 'awaiting_payment'}
                                                title={studentApprovalPaymentState(s) === 'awaiting_payment' ? 'Payment has not been confirmed for this public registration.' : undefined}
                                                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-foreground text-xs font-bold rounded-xl transition-all disabled:opacity-50">
                                                <CheckCircleIcon className="w-4 h-4" /> Approve
                                            </button>
                                            <button onClick={() => handleStudent(s.id, 'rejected')} disabled={acting === s.id}
                                                className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-foreground text-xs font-bold rounded-xl transition-all disabled:opacity-50">
                                                <XCircleIcon className="w-4 h-4" /> Reject
                                            </button>
                                            <button onClick={() => removeEntry('students', s.id, s.full_name ?? 'this student')} disabled={removing === s.id}
                                                title="Remove a duplicate / failed / unwanted entry"
                                                className="flex items-center gap-1.5 px-3 py-1.5 text-muted-foreground hover:text-rose-400 text-xs font-bold rounded-xl transition-all disabled:opacity-50 border border-border hover:border-rose-500/30">
                                                {removing === s.id ? '…' : '🗑'}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* School list */}
                {tab === 'schools' && schools.length > 0 && profile?.role === 'admin' && (
                    <div className="bg-card shadow-sm border border-border rounded-xl overflow-hidden">
                        <div className="p-5 border-b border-border">
                            <h3 className="font-bold text-foreground">Pending School Applications</h3>
                        </div>
                        <div className="divide-y divide-border">
                            {schools.map(s => (
                                <div key={s.id} className="p-5 hover:bg-card shadow-sm transition-colors">
                                    <div className="flex items-start gap-4">
                                        <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center flex-shrink-0">
                                            <BuildingOfficeIcon className="w-5 h-5 text-primary" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap mb-0.5">
                                                <p className="font-bold text-foreground">{s.name}</p>
                                                {s.school_type && (
                                                    <span className="px-2 py-0.5 text-[9px] font-bold border bg-primary/10 text-primary border-primary/20">{s.school_type}</span>
                                                )}
                                            </div>
                                            <div className="flex flex-wrap gap-3 mt-1 text-xs text-muted-foreground">
                                                {s.email && (
                                                    <span className="flex items-center gap-1 bg-muted/40 px-2 py-0.5 rounded border border-border/50">
                                                        <EnvelopeIcon className="w-3.5 h-3.5 text-primary" />
                                                        <a href={`mailto:${s.email}`} className="hover:text-primary hover:underline transition-colors block truncate max-w-[180px]">{s.email}</a>
                                                        <button onClick={() => { navigator.clipboard.writeText(s.email); toast.success('Email copied!'); }} className="text-[9px] font-black text-muted-foreground hover:text-foreground uppercase tracking-widest ml-1 border border-border/60 px-1 rounded bg-background">Copy</button>
                                                    </span>
                                                )}
                                                {s.phone && (
                                                    <span className="flex items-center gap-1 bg-muted/40 px-2 py-0.5 rounded border border-border/50">
                                                        <PhoneIcon className="w-3.5 h-3.5 text-primary" />
                                                        <a href={`tel:${s.phone}`} className="hover:text-primary hover:underline transition-colors font-semibold">{s.phone}</a>
                                                        <a href={`https://wa.me/${s.phone.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="text-emerald-500 hover:text-emerald-400 font-bold ml-1" title="WhatsApp Chat">WA</a>
                                                        <button onClick={() => { navigator.clipboard.writeText(s.phone); toast.success('Phone copied!'); }} className="text-[9px] font-black text-muted-foreground hover:text-foreground uppercase tracking-widest ml-1 border border-border/60 px-1 rounded bg-background">Copy</button>
                                                    </span>
                                                )}
                                                {s.city && <span>{s.city}{s.state ? `, ${s.state}` : ''}</span>}
                                                {s.principal_name && <span className="flex items-center gap-1"><UserGroupIcon className="w-3.5 h-3.5" />Principal: {s.principal_name}</span>}
                                                {s.student_count && <span className="flex items-center gap-1"><AcademicCapIcon className="w-3.5 h-3.5" />{Number(s.student_count).toLocaleString()} students</span>}
                                                {s.program_interest && <span className="text-primary font-medium">{s.program_interest}</span>}
                                            </div>
                                            <p className="text-xs text-muted-foreground mt-1">Applied {new Date(s.created_at).toLocaleDateString()}</p>
                                        </div>
                                        <div className="flex flex-col sm:flex-row gap-2 flex-shrink-0">
                                            <button onClick={() => handleSchool(s.id, 'approved')} disabled={acting === s.id}
                                                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-foreground text-xs font-bold rounded-xl transition-all disabled:opacity-50">
                                                <CheckCircleIcon className="w-4 h-4" /> Approve
                                            </button>
                                            <button onClick={() => handleSchool(s.id, 'rejected')} disabled={acting === s.id}
                                                className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-foreground text-xs font-bold rounded-xl transition-all disabled:opacity-50">
                                                <XCircleIcon className="w-4 h-4" /> Reject
                                            </button>
                                            <button onClick={() => removeEntry('schools', s.id, s.name ?? 'this school')} disabled={removing === s.id}
                                                title="Remove a duplicate / failed / unwanted entry"
                                                className="flex items-center gap-1.5 px-3 py-1.5 text-muted-foreground hover:text-rose-400 text-xs font-bold rounded-xl transition-all disabled:opacity-50 border border-border hover:border-rose-500/30">
                                                {removing === s.id ? '…' : '🗑'}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                 {/* ── Credentials modal — shown after approving a student/school ── */}
                 {credentials && (
                     <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/35 backdrop-blur-sm">
                         <div className="bg-card border border-border rounded-xl w-full max-w-md shadow-2xl p-6 space-y-4">
                             <div className="flex items-center gap-3">
                                 <CheckCircleIcon className="w-7 h-7 text-emerald-400 flex-shrink-0" />
                                 <div>
                                     <p className="font-extrabold text-foreground">Account Created Successfully</p>
                                     <p className="text-xs text-muted-foreground">{credentials.name}</p>
                                 </div>
                             </div>
                             <p className="text-xs text-muted-foreground">Share these credentials with the user. They can change their password after signing in.</p>
                             
                             <div className="space-y-3">
                                 {credentials.student || credentials.parent ? (
                                     <>
                                         {/* Student Details */}
                                         {credentials.student && (
                                             <div className="bg-muted/30 border border-border rounded-xl p-4 space-y-2">
                                                 <p className="text-[10px] font-black uppercase tracking-widest text-violet-400">🎓 Student Account</p>
                                                 <div className="text-xs space-y-1">
                                                     <p className="text-muted-foreground font-medium">Username / Email:</p>
                                                     <p className="font-mono text-foreground select-all bg-background border border-border p-1.5 rounded">{credentials.student.email}</p>
                                                     <p className="text-muted-foreground font-medium mt-1">Temporary Password:</p>
                                                     <p className="font-mono text-amber-500 select-all bg-background border border-border p-1.5 rounded">{credentials.student.password || 'Existing Account'}</p>
                                                 </div>
                                             </div>
                                         )}
                                         {/* Parent Details */}
                                         {credentials.parent && (
                                             <div className="bg-muted/30 border border-border rounded-xl p-4 space-y-2">
                                                 <p className="text-[10px] font-black uppercase tracking-widest text-emerald-400">👨‍👩‍👧 Parent Account</p>
                                                 <div className="text-xs space-y-1">
                                                     <p className="text-muted-foreground font-medium">Username / Email:</p>
                                                     <p className="font-mono text-foreground select-all bg-background border border-border p-1.5 rounded">{credentials.parent.email}</p>
                                                     {credentials.parent.password && (
                                                         <>
                                                             <p className="text-muted-foreground font-medium mt-1">Temporary Password:</p>
                                                             <p className="font-mono text-amber-500 select-all bg-background border border-border p-1.5 rounded">{credentials.parent.password}</p>
                                                         </>
                                                     )}
                                                 </div>
                                             </div>
                                         )}
                                     </>
                                 ) : (
                                     <div className="bg-card shadow-sm border border-border rounded-xl p-4 space-y-3 font-mono text-sm">
                                         <div>
                                             <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-0.5">Email</p>
                                             <p className="text-foreground select-all">{credentials.email}</p>
                                         </div>
                                         <div>
                                             <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-0.5">Password</p>
                                             <p className="text-emerald-400 font-bold select-all">{credentials.password}</p>
                                         </div>
                                     </div>
                                 )}
                             </div>

                             <div className="flex gap-2 justify-end pt-2">
                                 {(credentials.student || credentials.parent) && (
                                     <button
                                         onClick={() => {
                                             let txt = `Rillcod Academy Credentials for ${credentials.name}\n\n`;
                                             if (credentials.student) {
                                                 txt += `🎓 Student Portal:\nEmail: ${credentials.student.email}\nPassword: ${credentials.student.password || 'Existing Account'}\n\n`;
                                             }
                                             if (credentials.parent) {
                                                 txt += `👨‍👩‍👧 Parent Portal:\nEmail: ${credentials.parent.email}\n`;
                                                 if (credentials.parent.password) {
                                                     txt += `Password: ${credentials.parent.password}\n`;
                                                 }
                                             }
                                             navigator.clipboard.writeText(txt);
                                             toast.success('Credentials copied to clipboard');
                                             setCredentials(null);
                                         }}
                                         className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-xs font-semibold transition-all"
                                     >
                                         Copy All & Close
                                     </button>
                                 )}
                                 <button
                                     onClick={() => setCredentials(null)}
                                     className="px-4 py-2 bg-muted hover:bg-muted/80 border border-border text-foreground rounded-xl text-xs font-semibold transition-all"
                                 >
                                     Close
                                 </button>
                             </div>
                         </div>
                     </div>
                 )}

                {/* ── Manual payment modal — upload offline proof and admit an unpaid applicant ── */}
                {payModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/35 backdrop-blur-sm overflow-y-auto">
                        <div className="bg-card border border-border rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-4 my-8">
                            <div className="flex items-center gap-3">
                                <span className="text-2xl">💵</span>
                                <div>
                                    <p className="font-extrabold text-foreground">Record Payment &amp; Admit</p>
                                    <p className="text-xs text-muted-foreground">{payModal.full_name}{payModal.parent_email ? ` · ${payModal.parent_email}` : ''}</p>
                                </div>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                For a student who paid <span className="font-bold text-foreground">physically / by bank transfer</span> (not online).
                                Upload the proof, enter the amount, and the student is admitted with login credentials created automatically.
                            </p>

                            <div className="space-y-3">
                                {/* Evidence upload */}
                                <div>
                                    <label className="text-[11px] font-bold text-foreground uppercase tracking-wider block mb-1.5">Payment Evidence <span className="text-rose-400">*</span></label>
                                    <input
                                        type="file"
                                        accept="image/jpeg,image/png,image/webp,application/pdf"
                                        onChange={(e) => setPayFile(e.target.files?.[0] ?? null)}
                                        className="block w-full text-xs text-muted-foreground file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-primary file:text-primary-foreground hover:file:opacity-90 cursor-pointer bg-background border border-border rounded-xl p-2"
                                    />
                                    {payFile && <p className="text-[11px] text-emerald-400 mt-1 font-medium truncate">✓ {payFile.name} ({(payFile.size / 1024).toFixed(0)} KB)</p>}
                                    <p className="text-[10px] text-muted-foreground mt-1">Receipt, bank alert or transfer screenshot — JPEG, PNG, WebP or PDF (max 10 MB).</p>
                                </div>
                                {/* Amount */}
                                <div>
                                    <label className="text-[11px] font-bold text-foreground uppercase tracking-wider block mb-1.5">Amount Paid (₦) <span className="text-rose-400">*</span></label>
                                    <input
                                        type="number" min="0" inputMode="decimal" value={payAmount}
                                        onChange={(e) => setPayAmount(e.target.value)} placeholder="e.g. 25000"
                                        className="w-full px-4 py-2.5 bg-background border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-primary"
                                    />
                                </div>
                                {/* Method + reference */}
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-[11px] font-bold text-foreground uppercase tracking-wider block mb-1.5">Method</label>
                                        <select value={payMethod} onChange={(e) => setPayMethod(e.target.value)}
                                            className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-primary">
                                            <option value="cash">Cash</option>
                                            <option value="bank_transfer">Bank Transfer</option>
                                            <option value="pos">POS</option>
                                            <option value="cheque">Cheque</option>
                                            <option value="other">Other</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-[11px] font-bold text-foreground uppercase tracking-wider block mb-1.5">Reference</label>
                                        <input type="text" value={payRef} onChange={(e) => setPayRef(e.target.value)} placeholder="Optional"
                                            className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-primary" />
                                    </div>
                                </div>
                            </div>

                            <div className="flex gap-2 justify-end pt-2">
                                <button onClick={() => { if (!paying) { setPayModal(null); } }} disabled={paying}
                                    className="px-4 py-2 bg-muted hover:bg-muted/80 border border-border text-foreground rounded-xl text-xs font-semibold transition-all disabled:opacity-50">
                                    Cancel
                                </button>
                                <button onClick={recordManualPayment} disabled={paying}
                                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50 flex items-center gap-2">
                                    {paying ? 'Processing…' : 'Confirm Payment & Admit'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Prospective list */}
                {tab === 'prospective' && prospective.length > 0 && (
                    <div className="bg-card shadow-sm border border-border rounded-xl overflow-hidden">
                        <div className="p-5 border-b border-border flex items-center justify-between">
                            <h3 className="font-bold text-foreground">Prospective Student Queue (Summer School)</h3>
                            <div className="flex items-center gap-2">
                                <SunIcon className="w-4 h-4 text-amber-500" />
                                <span className="text-[10px] uppercase font-black text-amber-500 tracking-widest">Summer School 2026</span>
                            </div>
                        </div>
                        <div className="divide-y divide-border">
                            {prospective.map(s => {
                                const parsed = parseProspectNotes(s.notes);
                                return (
                                    <div key={s.id} className="p-6 hover:bg-muted/10 transition-colors">
                                        <div className="flex flex-col lg:flex-row items-start gap-6">
                                            {/* Left Column: Avatar & Core Information */}
                                            <div className="flex-1 min-w-0 space-y-4">
                                                <div className="flex items-start gap-4">
                                                    <div className="w-12 h-12 bg-gradient-to-br from-amber-500/20 to-amber-600/30 border border-amber-500/20 rounded-xl flex items-center justify-center text-base font-black text-amber-400 flex-shrink-0 shadow-inner">
                                                        {(s.full_name ?? '?')[0].toUpperCase()}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <p className="font-bold text-base text-foreground truncate">{s.full_name}</p>
                                                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold border bg-amber-500/20 text-amber-400 border-amber-500/30">
                                                                Summer Applicant
                                                            </span>
                                                            {s.status && <StatusBadge status={s.status} />}
                                                        </div>
                                                        {s.parent_name && (
                                                            <p className="text-xs text-muted-foreground mt-0.5">
                                                                Parent/Guardian: <span className="font-semibold text-foreground">{s.parent_name}</span>
                                                            </p>
                                                        )}
                                                        <p className="text-[10px] text-muted-foreground mt-1">Applied {new Date(s.created_at).toLocaleDateString()}</p>
                                                    </div>
                                                </div>

                                                {/* Grid: Student Application Parameters */}
                                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 bg-muted/20 p-4 rounded-xl border border-border/50">
                                                    <div>
                                                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-extrabold">Age / Gender</p>
                                                        <p className="text-xs font-bold text-foreground mt-0.5">
                                                            {s.age ? `${s.age} yrs` : 'Not specified'} / <span className="capitalize">{s.gender || 'Not specified'}</span>
                                                        </p>
                                                    </div>
                                                    <div>
                                                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-extrabold">Class / Grade</p>
                                                        <p className="text-xs font-bold text-foreground mt-0.5">{s.grade || 'Not specified'}</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-extrabold">Preferred Mode</p>
                                                        <p className="text-xs font-bold text-foreground mt-0.5 capitalize">{s.preferred_schedule || 'Not specified'}</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-extrabold">School</p>
                                                        <p className="text-xs font-bold text-foreground mt-0.5 truncate" title={s.school_name}>{s.school_name || 'Not specified'}</p>
                                                    </div>
                                                    {parsed.trackChoice && (
                                                        <div className="col-span-2 sm:col-span-3 md:col-span-4 border-t border-border/40 pt-2 mt-1">
                                                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-extrabold">Track Choice</p>
                                                            <p className="text-xs font-bold text-primary mt-0.5">{parsed.trackChoice}</p>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Actionable Contacts */}
                                                <div className="flex flex-wrap gap-2.5">
                                                    {s.parent_email && (
                                                        <span className="inline-flex items-center gap-1.5 bg-muted/40 px-2.5 py-1 rounded-lg border border-border/50 text-xs text-muted-foreground">
                                                            <EnvelopeIcon className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                                                            <span className="font-medium">Parent:</span>
                                                            <a href={`mailto:${s.parent_email}`} className="hover:text-primary hover:underline transition-colors block truncate max-w-[160px] font-bold text-foreground">{s.parent_email}</a>
                                                            <button onClick={() => { navigator.clipboard.writeText(s.parent_email); toast.success('Parent email copied!'); }} className="text-[9px] font-black text-muted-foreground hover:text-foreground uppercase tracking-widest ml-1 border border-border/60 px-1.5 py-0.5 rounded bg-background transition-colors">Copy</button>
                                                        </span>
                                                    )}
                                                    {s.parent_phone && (
                                                        <span className="inline-flex items-center gap-1.5 bg-muted/40 px-2.5 py-1 rounded-lg border border-border/50 text-xs text-muted-foreground">
                                                            <PhoneIcon className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                                                            <span className="font-medium">Parent Phone:</span>
                                                            <a href={`tel:${s.parent_phone}`} className="hover:text-primary hover:underline transition-colors font-bold text-foreground">{s.parent_phone}</a>
                                                            <a href={`https://wa.me/${s.parent_phone.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="text-emerald-500 hover:text-emerald-400 font-extrabold ml-1.5" title="WhatsApp Chat">WA</a>
                                                            <button onClick={() => { navigator.clipboard.writeText(s.parent_phone); toast.success('Parent phone copied!'); }} className="text-[9px] font-black text-muted-foreground hover:text-foreground uppercase tracking-widest ml-1 border border-border/60 px-1.5 py-0.5 rounded bg-background transition-colors">Copy</button>
                                                        </span>
                                                    )}
                                                    {parsed.studentPhone && (
                                                        <span className="inline-flex items-center gap-1.5 bg-muted/40 px-2.5 py-1 rounded-lg border border-border/50 text-xs text-muted-foreground">
                                                            <PhoneIcon className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                                                            <span className="font-medium">Student Phone:</span>
                                                            <a href={`tel:${parsed.studentPhone}`} className="hover:text-primary hover:underline transition-colors font-bold text-foreground">{parsed.studentPhone}</a>
                                                            <a href={`https://wa.me/${parsed.studentPhone!.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="text-emerald-500 hover:text-emerald-400 font-extrabold ml-1.5" title="WhatsApp Chat">WA</a>
                                                            <button onClick={() => { navigator.clipboard.writeText(parsed.studentPhone!); toast.success('Student phone copied!'); }} className="text-[9px] font-black text-muted-foreground hover:text-foreground uppercase tracking-widest ml-1 border border-border/60 px-1.5 py-0.5 rounded bg-background transition-colors">Copy</button>
                                                        </span>
                                                    )}
                                                </div>

                                                {/* Structured Payment Info & Receipt Preview */}
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-border/40 pt-4 mt-2">
                                                    <div className="bg-card shadow-sm border border-border/50 rounded-xl p-3.5 space-y-1.5">
                                                        <h4 className="text-[10px] font-extrabold text-amber-500 uppercase tracking-widest">Payment Meta</h4>
                                                        <div className="grid grid-cols-2 gap-2 text-xs">
                                                            <div>
                                                                <span className="text-muted-foreground block text-[10px] uppercase">Plan</span>
                                                                <span className="font-bold text-foreground capitalize">{parsed.plan || 'Not specified'}</span>
                                                            </div>
                                                            <div>
                                                                <span className="text-muted-foreground block text-[10px] uppercase">Method</span>
                                                                <span className="font-bold text-foreground capitalize">{parsed.method || 'Not specified'}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    {parsed.receiptUrl && (
                                                        <div className="space-y-1.5">
                                                            <h4 className="text-[10px] font-extrabold text-amber-500 uppercase tracking-widest">Receipt Upload</h4>
                                                            <div className="flex flex-wrap items-center gap-3">
                                                                <a href={parsed.receiptUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 text-xs font-bold rounded-lg border border-amber-500/20 transition-all">
                                                                    View Receipt Screenshot →
                                                                </a>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Inline Receipt Preview Image */}
                                                {parsed.receiptUrl && (
                                                    <div className="mt-3 bg-muted/10 p-2.5 rounded-xl border border-border/40 max-w-sm">
                                                        <p className="text-[10px] font-bold text-muted-foreground mb-1.5 uppercase tracking-wider">Receipt Thumbnail Preview</p>
                                                        <div className="relative group max-w-full rounded-lg overflow-hidden border border-border bg-black/20 flex items-center justify-center">
                                                            <img 
                                                                src={parsed.receiptUrl} 
                                                                alt="Payment Receipt" 
                                                                className="max-h-48 w-auto object-contain rounded transition-transform group-hover:scale-105"
                                                                onError={(e) => { e.currentTarget.style.display = 'none'; }} 
                                                            />
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Parent Notes / Message */}
                                                {parsed.cleanNotes && (
                                                    <div className="bg-card shadow-sm border border-border/50 rounded-xl p-3.5 space-y-1">
                                                        <span className="text-[10px] font-extrabold text-primary uppercase tracking-widest block">Parent Note / Message</span>
                                                        <p className="text-xs text-foreground italic">"{parsed.cleanNotes}"</p>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Right Column: Actions (Approve / Record Payment / Reject) */}
                                            <div className="flex lg:flex-col gap-2 w-full lg:w-auto flex-shrink-0 self-stretch justify-end lg:justify-start pt-2">
                                                <button onClick={() => handleProspective(s.id, 'approved')} disabled={acting === s.id || s.status === 'unpaid'}
                                                    title={s.status === 'unpaid' ? 'Applicant has not paid online — use “Record Payment & Admit” to admit with offline proof' : undefined}
                                                    className="flex items-center justify-center gap-1.5 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-foreground text-xs font-bold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed w-full lg:w-44 shadow-sm border border-emerald-500/20">
                                                    <CheckCircleIcon className="w-4 h-4" /> Approve
                                                </button>
                                                {s.status === 'unpaid' && (
                                                    <button onClick={() => { setPayModal(s); setPayAmount(''); setPayRef(''); setPayFile(null); setPayMethod('cash'); }} disabled={acting === s.id}
                                                        title="Upload proof of a physical / bank payment and admit this student"
                                                        className="flex items-center justify-center gap-1.5 px-4 py-2.5 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded-xl transition-all disabled:opacity-50 w-full lg:w-44 shadow-sm border border-amber-500/30">
                                                        💵 Record Payment &amp; Admit
                                                    </button>
                                                )}
                                                <button onClick={() => handleProspective(s.id, 'rejected')} disabled={acting === s.id}
                                                    className="flex items-center justify-center gap-1.5 px-4 py-2.5 bg-rose-600 hover:bg-rose-500 text-foreground text-xs font-bold rounded-xl transition-all disabled:opacity-50 w-full lg:w-44 shadow-sm border border-rose-500/20">
                                                    <XCircleIcon className="w-4 h-4" /> Reject
                                                </button>
                                                <button onClick={() => removeEntry('prospective', s.id, s.full_name ?? 'this applicant')} disabled={removing === s.id}
                                                    title="Remove a duplicate / failed / unwanted entry from the queue"
                                                    className="flex items-center justify-center gap-1.5 px-4 py-2 text-muted-foreground hover:text-rose-400 text-[11px] font-bold rounded-xl transition-all disabled:opacity-50 w-full lg:w-44 border border-border hover:border-rose-500/30">
                                                    {removing === s.id ? 'Removing…' : '🗑 Remove entry'}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

            </div>
        </div>
    );
}
