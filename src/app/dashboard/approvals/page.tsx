'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import {
    ClipboardDocumentCheckIcon, CheckCircleIcon, XCircleIcon,
    ClockIcon, BuildingOfficeIcon, AcademicCapIcon,
    EnvelopeIcon, PhoneIcon, UserGroupIcon, ExclamationTriangleIcon,
    SunIcon,
} from '@heroicons/react/24/outline';

function StatusBadge({ status }: { status: string }) {
    const map: Record<string, string> = {
        approved: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
        pending: 'bg-amber-500/20  text-amber-400  border-amber-500/30',
        rejected: 'bg-rose-500/20   text-rose-400   border-rose-500/30',
    };
    return (
        <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border capitalize ${map[status] ?? 'bg-white/10 text-white/40'}`}>
            {status}
        </span>
    );
}

function EnrollTypeBadge({ type }: { type?: string }) {
    const map: Record<string, string> = {
        school: 'bg-violet-500/20 text-violet-400 border-violet-500/30',
        bootcamp: 'bg-[#FF914D]/20 text-[#FF914D] border-[#FF914D]/30',
        online: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    };
    const label: Record<string, string> = {
        school: 'Partner School', bootcamp: 'Bootcamp', online: 'Online School',
    };
    if (!type) return null;
    return (
        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${map[type] ?? 'bg-white/10 text-white/30 border-white/10'}`}>
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
                    supabase.from('students').select('*').eq('status', 'pending').order('created_at', { ascending: true }),
                    supabase.from('schools').select('*').eq('status', 'pending').order('created_at', { ascending: true }),
                    supabase.from('prospective_students').select('*').eq('is_deleted', false).eq('is_active', false).order('created_at', { ascending: true }),
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
        setActing(id);
        try {
            const supabase = createClient();
            await supabase.from('students').update({
                status: action,
                approved_by: profile?.id,
                approved_at: action === 'approved' ? new Date().toISOString() : null,
            }).eq('id', id);
            setStudents(prev => prev.filter(s => s.id !== id));
        } catch { /* ignore */ }
        setActing(null);
    };

    const handleSchool = async (id: string, action: 'approved' | 'rejected') => {
        setActing(id);
        try {
            const supabase = createClient();
            await supabase.from('schools').update({ status: action }).eq('id', id);
            setSchools(prev => prev.filter(s => s.id !== id));
        } catch { /* ignore */ }
        setActing(null);
    };

    const handleProspective = async (id: string, action: 'approved' | 'rejected') => {
        setActing(id);
        try {
            const supabase = createClient();
            if (action === 'rejected') {
                await supabase.from('prospective_students').update({ is_deleted: true, is_active: false }).eq('id', id);
            } else {
                await supabase.from('prospective_students').update({ is_active: true }).eq('id', id);
            }
            setProspective(prev => prev.filter(s => s.id !== id));
        } catch { /* ignore */ }
        setActing(null);
    };

    // Loading
    if (authLoading || loading) return (
        <div className="min-h-screen bg-[#0f0f1a] text-white">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
                <div className="animate-pulse space-y-2">
                    <div className="h-4 bg-white/10 rounded w-40" />
                    <div className="h-8 bg-white/10 rounded w-64" />
                </div>
                {[1, 2, 3].map(i => <div key={i} className="bg-white/5 border border-white/10 rounded-2xl h-24 animate-pulse" />)}
            </div>
        </div>
    );

    if (!isStaff) return (
        <div className="min-h-screen bg-[#0f0f1a] flex items-center justify-center">
            <p className="text-white/40">Admin or Teacher access required.</p>
        </div>
    );

    const currentList = tab === 'students' ? students : tab === 'schools' ? schools : prospective;

    return (
        <div className="min-h-screen bg-[#0f0f1a] text-white">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">

                {/* Header */}
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <ClipboardDocumentCheckIcon className="w-5 h-5 text-violet-400" />
                        <span className="text-xs font-bold text-violet-400 uppercase tracking-widest">Registration Queue · {profile?.role}</span>
                    </div>
                    <h1 className="text-3xl font-extrabold">Approvals</h1>
                    <p className="text-white/40 text-sm mt-1">Review and action pending registrations</p>
                </div>

                {error && (
                    <div className="flex items-center gap-3 bg-rose-500/10 border border-rose-500/20 rounded-xl p-4">
                        <ExclamationTriangleIcon className="w-5 h-5 text-rose-400" />
                        <p className="text-rose-400 text-sm">{error}</p>
                    </div>
                )}

                {/* Summary */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
                        <div className="w-10 h-10 bg-amber-500/10 rounded-xl flex items-center justify-center mb-3">
                            <UserGroupIcon className="w-5 h-5 text-amber-400" />
                        </div>
                        <p className="text-2xl font-extrabold text-amber-400">{students.length}</p>
                        <p className="text-xs text-white/40 mt-1">Pending Students</p>
                    </div>
                    <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
                        <p className="text-2xl font-extrabold text-violet-400">{students.filter(s => s.enrollment_type === 'school' || !s.enrollment_type).length}</p>
                        <p className="text-xs text-white/40 mt-1">Partner School</p>
                    </div>
                    <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
                        <p className="text-2xl font-extrabold text-[#FF914D]">{students.filter(s => s.enrollment_type === 'bootcamp').length}</p>
                        <p className="text-xs text-white/40 mt-1">Bootcamp</p>
                    </div>
                    <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
                        <p className="text-2xl font-extrabold text-emerald-400">{students.filter(s => s.enrollment_type === 'online').length}</p>
                        <p className="text-xs text-white/40 mt-1">Online School</p>
                    </div>
                </div>
                {profile?.role === 'admin' && schools.length > 0 && (
                    <div className="bg-white/5 border border-white/10 rounded-2xl p-5 flex items-center gap-4">
                        <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center flex-shrink-0">
                            <BuildingOfficeIcon className="w-5 h-5 text-blue-400" />
                        </div>
                        <div>
                            <p className="text-2xl font-extrabold text-blue-400">{schools.length}</p>
                            <p className="text-xs text-white/40 mt-0.5">Pending School Applications</p>
                        </div>
                    </div>
                )}

                {/* Tabs */}
                <div className="flex gap-2 bg-white/5 p-1 rounded-xl border border-white/10 w-fit">
                    <button onClick={() => setTab('students')}
                        className={`px-5 py-2 rounded-lg text-sm font-bold transition-all ${tab === 'students' ? 'bg-violet-600 text-white' : 'text-white/40 hover:text-white'}`}>
                        Students ({students.length})
                    </button>
                    <button onClick={() => setTab('prospective')}
                        className={`px-5 py-2 rounded-lg text-sm font-bold transition-all ${tab === 'prospective' ? 'bg-[#FF914D] text-white' : 'text-white/40 hover:text-white'}`}>
                        Summer School ({prospective.length})
                    </button>
                    {profile?.role === 'admin' && (
                        <button onClick={() => setTab('schools')}
                            className={`px-5 py-2 rounded-lg text-sm font-bold transition-all ${tab === 'schools' ? 'bg-violet-600 text-white' : 'text-white/40 hover:text-white'}`}>
                            Schools ({schools.length})
                        </button>
                    )}
                </div>

                {/* Empty */}
                {currentList.length === 0 && (
                    <div className="text-center py-20 bg-white/5 border border-white/10 rounded-2xl">
                        <CheckCircleIcon className="w-14 h-14 mx-auto text-emerald-400/30 mb-4" />
                        <p className="text-lg font-semibold text-white/30">All clear!</p>
                        <p className="text-sm text-white/20 mt-1">No pending {tab} registrations</p>
                    </div>
                )}

                {/* Student list */}
                {tab === 'students' && students.length > 0 && (
                    <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
                        <div className="p-5 border-b border-white/10">
                            <h3 className="font-bold text-white">Pending Student Applications</h3>
                        </div>
                        <div className="divide-y divide-white/5">
                            {students.map(s => (
                                <div key={s.id} className="p-5 hover:bg-white/5 transition-colors">
                                    <div className="flex items-start gap-4">
                                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-600 to-blue-600 flex items-center justify-center text-sm font-black text-white flex-shrink-0">
                                            {(s.full_name ?? '?')[0]}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap mb-0.5">
                                                <p className="font-bold text-white">{s.full_name}</p>
                                                <EnrollTypeBadge type={s.enrollment_type} />
                                            </div>
                                            <div className="flex flex-wrap gap-3 mt-1 text-xs text-white/40">
                                                {s.parent_email && <span className="flex items-center gap-1"><EnvelopeIcon className="w-3.5 h-3.5" />{s.parent_email}</span>}
                                                {s.parent_phone && <span className="flex items-center gap-1"><PhoneIcon className="w-3.5 h-3.5" />{s.parent_phone}</span>}
                                                {s.school_name && <span className="flex items-center gap-1"><BuildingOfficeIcon className="w-3.5 h-3.5" />{s.school_name}</span>}
                                                {s.current_class && <span className="flex items-center gap-1"><AcademicCapIcon className="w-3.5 h-3.5" />Class: {s.current_class}</span>}
                                            </div>
                                            {s.goals && <p className="text-xs text-white/30 mt-2 line-clamp-2">Goal: {s.goals}</p>}
                                            <p className="text-xs text-white/20 mt-1">Applied {new Date(s.created_at).toLocaleDateString()}</p>
                                        </div>
                                        <div className="flex flex-col sm:flex-row gap-2 flex-shrink-0">
                                            <button onClick={() => handleStudent(s.id, 'approved')} disabled={acting === s.id}
                                                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition-all disabled:opacity-50">
                                                <CheckCircleIcon className="w-4 h-4" /> Approve
                                            </button>
                                            <button onClick={() => handleStudent(s.id, 'rejected')} disabled={acting === s.id}
                                                className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-xl transition-all disabled:opacity-50">
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
                    <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
                        <div className="p-5 border-b border-white/10">
                            <h3 className="font-bold text-white">Pending School Applications</h3>
                        </div>
                        <div className="divide-y divide-white/5">
                            {schools.map(s => (
                                <div key={s.id} className="p-5 hover:bg-white/5 transition-colors">
                                    <div className="flex items-start gap-4">
                                        <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                                            <BuildingOfficeIcon className="w-5 h-5 text-blue-400" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-bold text-white">{s.name}</p>
                                            <div className="flex flex-wrap gap-3 mt-1 text-xs text-white/40">
                                                {s.email && <span className="flex items-center gap-1"><EnvelopeIcon className="w-3.5 h-3.5" />{s.email}</span>}
                                                {s.phone && <span className="flex items-center gap-1"><PhoneIcon className="w-3.5 h-3.5" />{s.phone}</span>}
                                                {s.city && <span>{s.city}{s.state ? `, ${s.state}` : ''}</span>}
                                            </div>
                                            <p className="text-xs text-white/20 mt-1">Applied {new Date(s.created_at).toLocaleDateString()}</p>
                                        </div>
                                        <div className="flex flex-col sm:flex-row gap-2 flex-shrink-0">
                                            <button onClick={() => handleSchool(s.id, 'approved')} disabled={acting === s.id}
                                                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition-all disabled:opacity-50">
                                                <CheckCircleIcon className="w-4 h-4" /> Approve
                                            </button>
                                            <button onClick={() => handleSchool(s.id, 'rejected')} disabled={acting === s.id}
                                                className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-xl transition-all disabled:opacity-50">
                                                <XCircleIcon className="w-4 h-4" /> Reject
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Prospective list */}
                {tab === 'prospective' && prospective.length > 0 && (
                    <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
                        <div className="p-5 border-b border-white/10 flex items-center justify-between">
                            <h3 className="font-bold text-white">Prospective Student Queue (Summer School)</h3>
                            <div className="flex items-center gap-2">
                                <SunIcon className="w-4 h-4 text-[#FF914D]" />
                                <span className="text-[10px] uppercase font-black text-[#FF914D] tracking-widest">Summer School 2026</span>
                            </div>
                        </div>
                        <div className="divide-y divide-white/5">
                            {prospective.map(s => (
                                <div key={s.id} className="p-5 hover:bg-white/5 transition-colors">
                                    <div className="flex items-start gap-4">
                                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#FF914D] to-amber-500 flex items-center justify-center text-sm font-black text-white flex-shrink-0">
                                            {(s.full_name ?? '?')[0]}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap mb-0.5">
                                                <p className="font-bold text-white">{s.full_name}</p>
                                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold border bg-amber-500/20 text-amber-400 border-amber-500/30">
                                                    Summer Applicant
                                                </span>
                                            </div>
                                            <div className="flex flex-wrap gap-3 mt-1 text-xs text-white/40">
                                                {s.parent_email && <span className="flex items-center gap-1"><EnvelopeIcon className="w-3.5 h-3.5" />{s.parent_email}</span>}
                                                {s.parent_phone && <span className="flex items-center gap-1"><PhoneIcon className="w-3.5 h-3.5" />{s.parent_phone}</span>}
                                                {s.school_name && <span className="flex items-center gap-1"><BuildingOfficeIcon className="w-3.5 h-3.5" />{s.school_name}</span>}
                                                {s.grade && <span className="flex items-center gap-1"><AcademicCapIcon className="w-3.5 h-3.5" />Grade: {s.grade}</span>}
                                            </div>
                                            {s.course_interest && <p className="text-xs text-white/30 mt-2 line-clamp-1">Interest: {s.course_interest}</p>}
                                            <p className="text-xs text-white/20 mt-1">Applied {new Date(s.created_at).toLocaleDateString()}</p>
                                        </div>
                                        <div className="flex flex-col sm:flex-row gap-2 flex-shrink-0">
                                            <button onClick={() => handleProspective(s.id, 'approved')} disabled={acting === s.id}
                                                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition-all disabled:opacity-50">
                                                <CheckCircleIcon className="w-4 h-4" /> Approve
                                            </button>
                                            <button onClick={() => handleProspective(s.id, 'rejected')} disabled={acting === s.id}
                                                className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-xl transition-all disabled:opacity-50">
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
