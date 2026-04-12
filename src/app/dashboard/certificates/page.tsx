'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { CertificateCard } from '@/components/ui/CertificateCard';
import { TrophyIcon, MagnifyingGlassIcon, ShieldCheckIcon, PlusIcon, ArrowPathIcon, CheckIcon, XMarkIcon } from '@/lib/icons';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';

// ── Issue Certificate Modal (admin / teacher only) ────────────
function IssueCertModal({ onClose, onIssued }: { onClose: () => void; onIssued: () => void }) {
    const [studentSearch, setStudentSearch] = useState('');
    const [students, setStudents] = useState<any[]>([]);
    const [courses, setCourses] = useState<any[]>([]);
    const [selectedStudent, setSelectedStudent] = useState<any>(null);
    const [courseId, setCourseId] = useState('');
    const [schoolId, setSchoolId] = useState('');
    const [issuing, setIssuing] = useState(false);
    const [searchLoading, setSearchLoading] = useState(false);

    // Load courses once
    useEffect(() => {
        createClient()
            .from('courses')
            .select('id, title, programs(name)')
            .eq('is_active', true)
            .order('title')
            .then(({ data }) => setCourses(data ?? []));
    }, []);

    // Search students by name
    useEffect(() => {
        if (studentSearch.length < 2) { setStudents([]); return; }
        setSearchLoading(true);
        const timeout = setTimeout(async () => {
            const { data } = await createClient()
                .from('portal_users')
                .select('id, full_name, email, school_id, school_name')
                .eq('role', 'student')
                .ilike('full_name', `%${studentSearch}%`)
                .limit(10);
            setStudents(data ?? []);
            setSearchLoading(false);
        }, 300);
        return () => clearTimeout(timeout);
    }, [studentSearch]);

    const handleIssue = async () => {
        if (!selectedStudent || !courseId) return;
        setIssuing(true);
        try {
            const res = await fetch('/api/certificates', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    studentId: selectedStudent.id,
                    courseId,
                    schoolId: schoolId || selectedStudent.school_id || null,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error ?? 'Issue failed');
            toast.success(`Certificate issued for ${selectedStudent.full_name}`);
            onIssued();
            onClose();
        } catch (e: any) {
            toast.error(e.message ?? 'Failed to issue certificate');
        } finally {
            setIssuing(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <div className="bg-[#111113] border border-white/[0.08] w-full max-w-md shadow-2xl">
                <div className="flex items-center justify-between p-5 border-b border-white/[0.05]">
                    <p className="font-black text-white text-sm uppercase tracking-widest">Issue Certificate</p>
                    <button onClick={onClose} className="text-slate-500 hover:text-white font-black text-xl">✕</button>
                </div>
                <div className="p-5 space-y-4">
                    {/* Student search */}
                    <div>
                        <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Student</label>
                        {selectedStudent ? (
                            <div className="flex items-center justify-between px-4 py-3 bg-white/5 border border-white/10">
                                <div>
                                    <p className="font-bold text-white text-sm">{selectedStudent.full_name}</p>
                                    <p className="text-xs text-slate-500">{selectedStudent.email}</p>
                                </div>
                                <button onClick={() => { setSelectedStudent(null); setStudentSearch(''); }}
                                    className="text-slate-500 hover:text-rose-400 transition-colors">
                                    <XMarkIcon className="w-4 h-4" />
                                </button>
                            </div>
                        ) : (
                            <div className="relative">
                                <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
                                <input
                                    type="text"
                                    placeholder="Search student name…"
                                    value={studentSearch}
                                    onChange={e => setStudentSearch(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-primary transition-colors"
                                />
                                {searchLoading && (
                                    <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-slate-600 border-t-primary rounded-full animate-spin" />
                                )}
                                {students.length > 0 && (
                                    <div className="absolute top-full left-0 right-0 bg-[#111113] border border-white/10 z-10 max-h-48 overflow-y-auto shadow-xl">
                                        {students.map(s => (
                                            <button key={s.id} onClick={() => { setSelectedStudent(s); setStudents([]); setStudentSearch(''); }}
                                                className="w-full text-left px-4 py-3 hover:bg-white/5 transition-colors border-b border-white/[0.03] last:border-0">
                                                <p className="font-bold text-white text-xs">{s.full_name}</p>
                                                <p className="text-[10px] text-slate-500">{s.email} · {s.school_name ?? 'No school'}</p>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Course */}
                    <div>
                        <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Course</label>
                        <select
                            value={courseId}
                            onChange={e => setCourseId(e.target.value)}
                            className="w-full px-4 py-2.5 bg-white/5 border border-white/10 text-sm text-white focus:outline-none focus:border-primary transition-colors">
                            <option value="">Select course…</option>
                            {courses.map(c => (
                                <option key={c.id} value={c.id}>{c.title}{c.programs?.name ? ` · ${c.programs.name}` : ''}</option>
                            ))}
                        </select>
                    </div>

                    <div className="pt-2 flex gap-3">
                        <button onClick={onClose} className="flex-1 py-2.5 text-sm font-bold text-slate-400 bg-white/5 border border-white/10 hover:bg-white/10 transition-colors">Cancel</button>
                        <button onClick={handleIssue} disabled={!selectedStudent || !courseId || issuing}
                            className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold bg-primary hover:bg-primary/90 text-black disabled:opacity-50 transition-colors">
                            {issuing ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : <CheckIcon className="w-4 h-4" />}
                            {issuing ? 'Issuing…' : 'Issue Certificate'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function CertificateVault() {
    const { profile, loading: authLoading } = useAuth();
    const [certificates, setCertificates] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [showIssueModal, setShowIssueModal] = useState(false);

    const isStaff = profile?.role === 'admin' || profile?.role === 'teacher';

    const fetchCertificates = async () => {
        setIsLoading(true);
        try {
            const res = await fetch('/api/certificates');
            if (res.ok) {
                const json = await res.json();
                setCertificates(json.data || []);
            }
        } catch (error) {
            console.error('Error fetching certificates:', error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (authLoading || !profile) return;
        fetchCertificates();
    }, [profile?.id, authLoading]);

    const filteredCerts = certificates.filter(cert =>
        (cert.courses?.title?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
        (cert.certificate_number?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
        (cert.portal_users?.full_name?.toLowerCase() || '').includes(searchQuery.toLowerCase())
    );

    if (authLoading) return (
        <div className="min-h-screen bg-[#0A0A0B] flex items-center justify-center">
            <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
    );

    return (
        <div className="bg-[#0A0A0B] p-4 sm:p-6 lg:p-8 space-y-8">
            {/* Header */}
            <div className="bg-[#111113] border border-white/[0.05] p-6 sm:p-10">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
                    <div className="space-y-3">
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 bg-primary/10 border border-primary/20">
                                <TrophyIcon className="w-6 h-6 text-primary" />
                            </div>
                            <div>
                                <h1 className="text-2xl sm:text-3xl font-black text-white uppercase italic tracking-tighter">
                                    {isStaff ? 'Certificates' : 'My Certificates'}
                                </h1>
                                <p className="text-xs text-slate-500 mt-0.5">
                                    {isStaff ? `${certificates.length} certificate${certificates.length !== 1 ? 's' : ''} issued` : 'Certificates you have earned'}
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="relative max-w-sm w-full group">
                            <MagnifyingGlassIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600 group-focus-within:text-primary transition-colors" />
                            <input
                                type="text"
                                placeholder={isStaff ? 'Search by student, course or cert ID…' : 'Search by course or certificate ID...'}
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full bg-[#0A0A0B] border border-white/[0.1] py-3 pl-12 pr-4 text-xs text-white placeholder:text-slate-700 focus:outline-none focus:border-primary transition-all"
                            />
                        </div>
                        {isStaff && (
                            <button
                                onClick={() => setShowIssueModal(true)}
                                className="flex items-center gap-2 px-5 py-3 bg-primary hover:bg-primary/90 text-black text-xs font-black uppercase tracking-widest transition-all whitespace-nowrap flex-shrink-0">
                                <PlusIcon className="w-4 h-4" />
                                Issue
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Content */}
            {isLoading ? (
                <div className="space-y-8">
                    {[1, 2].map(i => (
                        <div key={i} style={{ aspectRatio: '297/210' }} className="w-full bg-white/[0.02] border border-white/[0.05] relative overflow-hidden">
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.03] to-transparent -translate-x-full animate-[shimmer_2s_infinite]" />
                        </div>
                    ))}
                </div>
            ) : filteredCerts.length > 0 ? (
                <div className="space-y-12">
                    {filteredCerts.map(cert => (
                        <div key={cert.id} className="group relative max-w-4xl mx-auto">
                            {isStaff && cert.portal_users?.full_name && (
                                <div className="mb-2 flex items-center gap-2">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Student:</span>
                                    <span className="text-xs font-bold text-white">{cert.portal_users.full_name}</span>
                                </div>
                            )}
                            <CertificateCard cert={cert} />
                        </div>
                    ))}
                </div>
            ) : (
                <div className="h-[360px] flex flex-col items-center justify-center border border-dashed border-white/[0.05] bg-white/[0.01] text-center space-y-4">
                    <div className="p-6 bg-white/[0.02] border border-white/[0.05]">
                        <ShieldCheckIcon className="w-12 h-12 text-slate-800" />
                    </div>
                    <div className="space-y-1">
                        <h3 className="text-white font-bold text-sm">No certificates yet</h3>
                        <p className="text-slate-600 text-xs">
                            {isStaff ? 'Click "Issue" to award a certificate to a student.' : 'Your certificates will appear here once issued.'}
                        </p>
                    </div>
                </div>
            )}

            {showIssueModal && (
                <IssueCertModal
                    onClose={() => setShowIssueModal(false)}
                    onIssued={fetchCertificates}
                />
            )}
        </div>
    );
}
