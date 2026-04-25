// @refresh reset
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import {
    ClipboardDocumentCheckIcon, CheckCircleIcon, XCircleIcon,
    ClockIcon, BuildingOfficeIcon, AcademicCapIcon,
    EnvelopeIcon, PhoneIcon, UserGroupIcon, ExclamationTriangleIcon,
    SunIcon, UserPlusIcon, ShieldCheckIcon,
} from '@/lib/icons';

function StatusBadge({ status }: { status: string }) {
    const map: Record<string, string> = {
        approved: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
        pending: 'bg-amber-500/20  text-amber-400  border-amber-500/30',
        rejected: 'bg-rose-500/20   text-rose-400   border-rose-500/30',
    };
    return (
        <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border capitalize ${map[status] ?? 'bg-muted text-muted-foreground'}`}>
            {status}
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
    const [credentials, setCredentials] = useState<{ email: string; password: string; name: string } | null>(null);

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
                    supabase.from('prospective_students').select('*').neq('is_deleted', true).eq('is_active', false).order('created_at', { ascending: true }),
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
            const res = await fetch('/api/approvals/prospective', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, action }),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || 'Action failed');
            setProspective(prev => prev.filter(s => s.id !== id));
        } catch (e: any) {
            setActingError(e.message ?? 'Action failed. Please try again.');
        } finally {
            setActing(null);
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
                {[1, 2, 3].map(i => <div key={i} className="bg-card shadow-sm border border-border rounded-none h-24 animate-pulse" />)}
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
                    <span className="flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-black">
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
                    <div className="flex items-center gap-3 bg-rose-500/10 border border-rose-500/20 rounded-none p-4">
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
                    <div className="bg-card shadow-sm border border-border rounded-none p-5">
                        <div className="w-10 h-10 bg-amber-500/10 rounded-none flex items-center justify-center mb-3">
                            <UserGroupIcon className="w-5 h-5 text-amber-400" />
                        </div>
                        <p className="text-2xl font-extrabold text-amber-400">{students.length}</p>
                        <p className="text-xs text-muted-foreground mt-1">Pending Students</p>
                    </div>
                    <div className="bg-card shadow-sm border border-border rounded-none p-5">
                        <p className="text-2xl font-extrabold text-primary">{students.filter(s => s.enrollment_type === 'school' || !s.enrollment_type).length}</p>
                        <p className="text-xs text-muted-foreground mt-1">Partner School</p>
                    </div>
                    <div className="bg-card shadow-sm border border-border rounded-none p-5">
                        <p className="text-2xl font-extrabold text-amber-500">{students.filter(s => s.enrollment_type === 'bootcamp').length}</p>
                        <p className="text-xs text-muted-foreground mt-1">Bootcamp</p>
                    </div>
                    <div className="bg-card shadow-sm border border-border rounded-none p-5">
                        <p className="text-2xl font-extrabold text-emerald-400">{students.filter(s => s.enrollment_type === 'online').length}</p>
                        <p className="text-xs text-muted-foreground mt-1">Online School</p>
                    </div>
                </div>
                {profile?.role === 'admin' && schools.length > 0 && (
                    <div className="bg-card shadow-sm border border-border rounded-none p-5 flex items-center gap-4">
                        <div className="w-10 h-10 bg-blue-500/10 rounded-none flex items-center justify-center flex-shrink-0">
                            <BuildingOfficeIcon className="w-5 h-5 text-blue-400" />
                        </div>
                        <div>
                            <p className="text-2xl font-extrabold text-blue-400">{schools.length}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">Pending School Applications</p>
                        </div>
                    </div>
                )}

                {/* Tabs */}
                <div className="flex gap-2 bg-card shadow-sm p-1 rounded-none border border-border w-fit">
                    <button onClick={() => setTab('students')}
                        className={`px-5 py-2 rounded-none text-sm font-bold transition-all ${tab === 'students' ? 'bg-primary text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                        Students ({students.length})
                    </button>
                    <button onClick={() => setTab('prospective')}
                        className={`px-5 py-2 rounded-none text-sm font-bold transition-all ${tab === 'prospective' ? 'bg-amber-500 text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                        Summer School ({prospective.length})
                    </button>
                    {profile?.role === 'admin' && (
                        <button onClick={() => setTab('schools')}
                            className={`px-5 py-2 rounded-none text-sm font-bold transition-all ${tab === 'schools' ? 'bg-primary text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                            Schools ({schools.length})
                        </button>
                    )}
                </div>

                {/* Empty */}
                {currentList.length === 0 && (
                    <div className="text-center py-20 bg-card shadow-sm border border-border rounded-none">
                        <CheckCircleIcon className="w-14 h-14 mx-auto text-emerald-400/30 mb-4" />
                        <p className="text-lg font-semibold text-muted-foreground">All clear!</p>
                        <p className="text-sm text-muted-foreground mt-1">No pending {tab} registrations</p>
                    </div>
                )}

                {/* Student list */}
                {tab === 'students' && students.length > 0 && (
                    <div className="bg-card shadow-sm border border-border rounded-none overflow-hidden">
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
                                            </div>
                                            <div className="flex flex-wrap gap-3 mt-1 text-xs text-muted-foreground">
                                                {s.parent_email && <span className="flex items-center gap-1"><EnvelopeIcon className="w-3.5 h-3.5" />{s.parent_email}</span>}
                                                {s.parent_phone && <span className="flex items-center gap-1"><PhoneIcon className="w-3.5 h-3.5" />{s.parent_phone}</span>}
                                                {s.school_name && <span className="flex items-center gap-1"><BuildingOfficeIcon className="w-3.5 h-3.5" />{s.school_name}{s.school_id ? <span className="text-emerald-500/60 ml-0.5">✓</span> : <span className="text-amber-400/70 ml-0.5" title="No school ID resolved">!</span>}</span>}
                                                {s.current_class && <span className="flex items-center gap-1"><AcademicCapIcon className="w-3.5 h-3.5" />Class: {s.current_class}</span>}
                                            </div>
                                            {s.goals && <p className="text-xs text-muted-foreground mt-2 line-clamp-2">Goal: {s.goals}</p>}
                                            <p className="text-xs text-muted-foreground mt-1">Applied {new Date(s.created_at).toLocaleDateString()}</p>
                                        </div>
                                        <div className="flex flex-col sm:flex-row gap-2 flex-shrink-0">
                                            <button onClick={() => handleStudent(s.id, 'approved')} disabled={acting === s.id}
                                                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-foreground text-xs font-bold rounded-none transition-all disabled:opacity-50">
                                                <CheckCircleIcon className="w-4 h-4" /> Approve
                                            </button>
                                            <button onClick={() => handleStudent(s.id, 'rejected')} disabled={acting === s.id}
                                                className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-foreground text-xs font-bold rounded-none transition-all disabled:opacity-50">
                                                <XCircleIcon className="w-4 h-4" /> Reject
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
                    <div className="bg-card shadow-sm border border-border rounded-none overflow-hidden">
                        <div className="p-5 border-b border-border">
                            <h3 className="font-bold text-foreground">Pending School Applications</h3>
                        </div>
                        <div className="divide-y divide-border">
                            {schools.map(s => (
                                <div key={s.id} className="p-5 hover:bg-card shadow-sm transition-colors">
                                    <div className="flex items-start gap-4">
                                        <div className="w-10 h-10 rounded-none bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                                            <BuildingOfficeIcon className="w-5 h-5 text-blue-400" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap mb-0.5">
                                                <p className="font-bold text-foreground">{s.name}</p>
                                                {s.school_type && (
                                                    <span className="px-2 py-0.5 text-[9px] font-bold border bg-blue-500/10 text-blue-400 border-blue-500/20">{s.school_type}</span>
                                                )}
                                            </div>
                                            <div className="flex flex-wrap gap-3 mt-1 text-xs text-muted-foreground">
                                                {s.email && <span className="flex items-center gap-1"><EnvelopeIcon className="w-3.5 h-3.5" />{s.email}</span>}
                                                {s.phone && <span className="flex items-center gap-1"><PhoneIcon className="w-3.5 h-3.5" />{s.phone}</span>}
                                                {s.city && <span>{s.city}{s.state ? `, ${s.state}` : ''}</span>}
                                                {s.principal_name && <span className="flex items-center gap-1"><UserGroupIcon className="w-3.5 h-3.5" />Principal: {s.principal_name}</span>}
                                                {s.student_count && <span className="flex items-center gap-1"><AcademicCapIcon className="w-3.5 h-3.5" />{Number(s.student_count).toLocaleString()} students</span>}
                                                {s.program_interest && <span className="text-primary font-medium">{s.program_interest}</span>}
                                            </div>
                                            <p className="text-xs text-muted-foreground mt-1">Applied {new Date(s.created_at).toLocaleDateString()}</p>
                                        </div>
                                        <div className="flex flex-col sm:flex-row gap-2 flex-shrink-0">
                                            <button onClick={() => handleSchool(s.id, 'approved')} disabled={acting === s.id}
                                                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-foreground text-xs font-bold rounded-none transition-all disabled:opacity-50">
                                                <CheckCircleIcon className="w-4 h-4" /> Approve
                                            </button>
                                            <button onClick={() => handleSchool(s.id, 'rejected')} disabled={acting === s.id}
                                                className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-foreground text-xs font-bold rounded-none transition-all disabled:opacity-50">
                                                <XCircleIcon className="w-4 h-4" /> Reject
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
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
                        <div className="bg-background border border-border rounded-none w-full max-w-sm shadow-2xl p-6 space-y-4">
                            <div className="flex items-center gap-3">
                                <CheckCircleIcon className="w-7 h-7 text-emerald-400 flex-shrink-0" />
                                <div>
                                    <p className="font-extrabold text-foreground">Account Created</p>
                                    <p className="text-xs text-muted-foreground">{credentials.name}</p>
                                </div>
                            </div>
                            <p className="text-sm text-muted-foreground">Share these credentials with the user. They can change their password after signing in.</p>
                            <div className="bg-card shadow-sm border border-border rounded-none p-4 space-y-3 font-mono text-sm">
                                <div>
                                    <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-0.5">Email</p>
                                    <p className="text-foreground select-all">{credentials.email}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-0.5">Password</p>
                                    <p className="text-emerald-400 font-bold select-all">{credentials.password}</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setCredentials(null)}
                                className="w-full py-2.5 bg-primary hover:bg-primary text-foreground font-bold rounded-none text-sm transition-all"
                            >
                                Done — I've noted the credentials
                            </button>
                        </div>
                    </div>
                )}

                {/* Prospective list */}
                {tab === 'prospective' && prospective.length > 0 && (
                    <div className="bg-card shadow-sm border border-border rounded-none overflow-hidden">
                        <div className="p-5 border-b border-border flex items-center justify-between">
                            <h3 className="font-bold text-foreground">Prospective Student Queue (Summer School)</h3>
                            <div className="flex items-center gap-2">
                                <SunIcon className="w-4 h-4 text-amber-500" />
                                <span className="text-[10px] uppercase font-black text-amber-500 tracking-widest">Summer School 2026</span>
                            </div>
                        </div>
                        <div className="divide-y divide-border">
                            {prospective.map(s => (
                                <div key={s.id} className="p-5 hover:bg-card shadow-sm transition-colors">
                                    <div className="flex items-start gap-4">
                                        <div className="w-10 h-10 bg-gradient-to-br from-primary to-primary flex items-center justify-center text-sm font-black text-foreground flex-shrink-0">
                                            {(s.full_name ?? '?')[0]}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap mb-0.5">
                                                <p className="font-bold text-foreground">{s.full_name}</p>
                                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold border bg-amber-500/20 text-amber-400 border-amber-500/30">
                                                    Summer Applicant
                                                </span>
                                            </div>
                                            <div className="flex flex-wrap gap-3 mt-1 text-xs text-muted-foreground">
                                                {s.parent_email && <span className="flex items-center gap-1"><EnvelopeIcon className="w-3.5 h-3.5" />{s.parent_email}</span>}
                                                {s.parent_phone && <span className="flex items-center gap-1"><PhoneIcon className="w-3.5 h-3.5" />{s.parent_phone}</span>}
                                                {s.school_name && <span className="flex items-center gap-1"><BuildingOfficeIcon className="w-3.5 h-3.5" />{s.school_name}</span>}
                                                {s.grade && <span className="flex items-center gap-1"><AcademicCapIcon className="w-3.5 h-3.5" />Grade: {s.grade}</span>}
                                            </div>
                                            {s.course_interest && <p className="text-xs text-muted-foreground mt-2 line-clamp-1">Interest: {s.course_interest}</p>}
                                            <p className="text-xs text-muted-foreground mt-1">Applied {new Date(s.created_at).toLocaleDateString()}</p>
                                        </div>
                                        <div className="flex flex-col sm:flex-row gap-2 flex-shrink-0">
                                            <button onClick={() => handleProspective(s.id, 'approved')} disabled={acting === s.id}
                                                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-foreground text-xs font-bold rounded-none transition-all disabled:opacity-50">
                                                <CheckCircleIcon className="w-4 h-4" /> Approve
                                            </button>
                                            <button onClick={() => handleProspective(s.id, 'rejected')} disabled={acting === s.id}
                                                className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-foreground text-xs font-bold rounded-none transition-all disabled:opacity-50">
                                                <XCircleIcon className="w-4 h-4" /> Reject
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

            </div>
        </div>
    );
}
