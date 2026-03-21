'use client';

import React, { useEffect, useState, useMemo, useRef } from 'react';
import { generateReportPDF } from '@/lib/pdf-utils';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { 
    TrophyIcon,
    AcademicCapIcon,
    MagnifyingGlassIcon,
    PlusIcon,
    ArrowPathIcon,
    ShieldCheckIcon,
    DocumentTextIcon,
    XMarkIcon,
    CheckCircleIcon,
    ChevronDownIcon,
    RectangleStackIcon,
    ArrowDownTrayIcon,
    TrashIcon,
    EyeIcon,
    FingerprintIcon,
    ExclamationTriangleIcon,
    CheckBadgeIcon,
    UserCircleIcon,
    PrinterIcon,
    RectangleGroupIcon,
    ClockIcon
} from '@/lib/icons';
import NextImage from 'next/image';
import { cn } from '@/lib/utils';
import { toast } from 'react-hot-toast';
import QRCode from 'react-qr-code';
import type { Database } from '@/types/supabase';
import CertificatePreview from '@/components/certificates/CertificatePreview';

type Certificate = Omit<Database['public']['Tables']['certificates']['Row'], 'metadata'> & {
    is_published?: boolean;
    metadata?: {
        is_published?: boolean;
        school_id?: string;
        issued_by?: string;
        [key: string]: any;
    } | null;
    courses?: {
        title: string;
        program?: {
            name: string;
        } | null;
    } | null;
    portal_users?: {
        full_name: string;
        school_name?: string | null;
        section_class?: string | null;
    } | null;
};

export default function CertificateManagement() {
    const { profile, loading: authLoading } = useAuth();
    const router = useRouter();
    const [certificates, setCertificates] = useState<Certificate[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [isDownloadingPDF, setIsDownloadingPDF] = useState(false);
    const certPdfRef = useRef<HTMLDivElement>(null);
    
    // Cascading Dropdown Data
    const [schools, setSchools] = useState<any[]>([]);
    const [classes, setClasses] = useState<any[]>([]);
    const [students, setStudents] = useState<any[]>([]);
    const [programs, setPrograms] = useState<any[]>([]);
    const [courses, setCourses] = useState<any[]>([]);
    
    // Loading States for Cascades
    const [loadingDropdowns, setLoadingDropdowns] = useState({
        schools: false,
        classes: false,
        students: false,
        programs: false,
        courses: false
    });

    // Form State
    const [isIssueModalOpen, setIsIssueModalOpen] = useState(false);
    const [isIssuing, setIsIssuing] = useState(false);
    const [issueForm, setIssueForm] = useState({
        schoolId: '',
        classId: '',
        studentId: '',
        programId: '',
        courseId: '',
        isBulk: false,
        templateId: 'modern-sharp'
    });

    // View Modal State
    const [viewingCert, setViewingCert] = useState<Certificate | null>(null);

    // Live Preview Data
    const activeStudent = useMemo(() => students.find(s => s.id === issueForm.studentId), [students, issueForm.studentId]);
    const activeCourse = useMemo(() => courses.find(c => c.id === issueForm.courseId), [courses, issueForm.courseId]);
    const activeProgram = useMemo(() => programs.find(p => p.id === issueForm.programId), [programs, issueForm.programId]);
    const activeSchool = useMemo(() => schools.find(s => s.id === issueForm.schoolId), [schools, issueForm.schoolId]);

    const canManage = profile?.role === 'admin' || profile?.role === 'teacher';
    const canView = canManage || profile?.role === 'school';

    // Redirect students and other non-authorised roles
    useEffect(() => {
        if (authLoading) return;
        if (profile && !canView) {
            router.replace('/dashboard/certificates');
        }
    }, [authLoading, profile]);

    useEffect(() => {
        if (authLoading || !profile || !canView) return;
        fetchInitialData();
        fetchCertificates();
    }, [profile?.id, authLoading]);

    const fetchCertificates = async () => {
        try {
            const res = await fetch('/api/certificates');
            if (res.ok) {
                const json = await res.json();
                setCertificates(json.data || []);
            }
        } catch (error) {
            console.error('Error fetching certificates:', error);
            toast.error('Failed to load certificates library');
        } finally {
            setIsLoading(false);
        }
    };

    const fetchInitialData = async () => {
        setLoadingDropdowns(prev => ({ ...prev, schools: true, programs: true }));
        try {
            const [schoolRes, programRes] = await Promise.all([
                fetch('/api/schools'),
                fetch('/api/programs')
            ]);
            
            if (schoolRes.ok) {
                const json = await schoolRes.json();
                const fetchedSchools = json.data || [];
                setSchools(fetchedSchools);
                
                // Auto-pre-select for School/Teacher roles
                // If the profile has a school_id, use it. 
                // Otherwise, if a teacher has exactly one school assigned, use that.
                const preSelectId = profile?.school_id || (profile?.role === 'teacher' && fetchedSchools.length === 1 ? fetchedSchools[0].id : '');
                
                if (preSelectId) {
                    setIssueForm(prev => ({ ...prev, schoolId: preSelectId }));
                    fetchClasses(preSelectId);
                }
            }
            if (programRes.ok) {
                const json = await programRes.json();
                setPrograms(json.data || []);
            }
        } catch (err) {
            console.error('Fetch error:', err);
        } finally {
            setLoadingDropdowns(prev => ({ ...prev, schools: false, programs: false }));
        }
    };

    const fetchClasses = async (sid: string) => {
        if (!sid) return;
        setLoadingDropdowns(prev => ({ ...prev, classes: true }));
        try {
            const res = await fetch(`/api/classes?school_id=${sid}`);
            if (res.ok) {
                const json = await res.json();
                const fetchedClasses = json.data || [];
                setClasses(fetchedClasses);
                
                // If only one class, auto-select it for teachers
                if (profile?.role === 'teacher' && fetchedClasses.length === 1) {
                    const cid = fetchedClasses[0].id;
                    setIssueForm(prev => ({ ...prev, classId: cid }));
                    fetchStudents(cid);
                }
            }
        } catch (err) {
            console.error('Classes fetch error:', err);
        } finally {
            setLoadingDropdowns(prev => ({ ...prev, classes: false }));
        }
    };

    const fetchStudents = async (cid: string) => {
        if (!cid) return;
        setLoadingDropdowns(prev => ({ ...prev, students: true }));
        try {
            const res = await fetch(`/api/portal-users?role=student&class_id=${cid}`);
            if (res.ok) {
                const json = await res.json();
                setStudents(json.data || []);
            }
        } catch (err) {
            console.error('Students fetch error:', err);
        } finally {
            setLoadingDropdowns(prev => ({ ...prev, students: false }));
        }
    };

    const fetchCourses = async (pid: string) => {
        if (!pid) return;
        setLoadingDropdowns(prev => ({ ...prev, courses: true }));
        try {
            const res = await fetch(`/api/courses?program_id=${pid}`);
            if (res.ok) {
                const json = await res.json();
                setCourses(json.data || []);
            }
        } catch (err) {
            console.error('Courses fetch error:', err);
        } finally {
            setLoadingDropdowns(prev => ({ ...prev, courses: false }));
        }
    };

    // Cascade Triggers
    useEffect(() => {
        if (issueForm.schoolId) fetchClasses(issueForm.schoolId);
        else setClasses([]);
    }, [issueForm.schoolId]);

    useEffect(() => {
        if (issueForm.classId) fetchStudents(issueForm.classId);
        else setStudents([]);
    }, [issueForm.classId]);

    useEffect(() => {
        if (issueForm.programId) fetchCourses(issueForm.programId);
        else setCourses([]);
    }, [issueForm.programId]);

    const handleIssue = async (e: React.FormEvent) => {
        e.preventDefault();
        
        const isReady = issueForm.isBulk 
            ? (issueForm.classId && issueForm.courseId && issueForm.schoolId)
            : (issueForm.studentId && issueForm.courseId && issueForm.schoolId);

        if (!isReady) {
            toast.error('Complete all required selections');
            return;
        }

        setIsIssuing(true);
        try {
            const res = await fetch('/api/certificates', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(issueForm)
            });
            const result = await res.json();
            
            if (res.ok) {
                if (issueForm.isBulk) {
                    toast.success(`Issued ${result.data.count}/${result.data.total} certificates successfully.`);
                } else {
                    toast.success('Certificate issued successfully!');
                }
                setIsIssueModalOpen(false);
                fetchCertificates();
                // Reset form but keep school/class for convenience if possible, 
                // but simpler to reset student/course
                setIssueForm(prev => ({...prev, studentId: '', courseId: '', isBulk: false}));
            } else {
                toast.error(result.error || 'Failed to issue certificate');
            }
        } catch (err) {
            toast.error('Network error. Please try again.');
        } finally {
            setIsIssuing(false);
        }
    };

    const handleAction = async (id: string, action: 'publish' | 'delete') => {
        const confirmMsg = action === 'delete' ? 'Permanently delete this certificate? This cannot be undone.' : 'Publish this certificate? The student will be able to see it.';
        if (!confirm(confirmMsg)) return;

        try {
            const method = action === 'delete' ? 'DELETE' : 'PATCH';
            const res = await fetch(`/api/certificates/${id}`, { method });
            if (res.ok) {
                toast.success(action === 'delete' ? 'Certificate deleted' : 'Certificate published');
                fetchCertificates();
                if (viewingCert?.id === id) setViewingCert(null);
            } else {
                const err = await res.json();
                toast.error(err.error || 'Operation failed');
            }
        } catch (err) {
            toast.error('Network error. Please try again.');
        }
    };

    const filteredCerts = useMemo(() => {
        return certificates.filter(c => 
            (c.portal_users?.full_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
            (c.portal_users?.school_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
            (c.courses?.title || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
            (c.certificate_number || '').toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [certificates, searchQuery]);

    const stats = useMemo(() => ({
        total: certificates.length,
        published: certificates.filter(c => c.is_published || c.metadata?.is_published).length,
        pending: certificates.filter(c => !c.is_published && !c.metadata?.is_published).length
    }), [certificates]);

    const [viewMode, setViewMode] = useState<'library' | 'builder'>('library');

    if (authLoading) return (
        <div className="min-h-screen bg-[#0A0A0B] flex items-center justify-center">
            <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
    );

    if (!profile || !canView) return null;

    return (
        <div className="bg-[#0A0A0B] text-slate-400 font-sans selection:bg-primary/30">
            {/* Header */}
            <div className="px-4 py-3 sm:px-6 sm:py-4 border-b border-white/[0.05] bg-[#0D0D0F] flex flex-wrap justify-between items-center gap-3">
                <div className="flex items-center gap-3 sm:gap-6 min-w-0">
                    <button
                        onClick={() => router.push('/dashboard')}
                        className="p-2 bg-white/[0.04] border border-white/[0.08] text-slate-400 hover:text-white hover:border-white/20 transition-all flex-shrink-0"
                        title="Back to Dashboard"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
                        </svg>
                    </button>
                    <div className="w-10 h-10 sm:w-12 sm:h-12 bg-primary/10 border border-primary/20 flex items-center justify-center relative overflow-hidden group flex-shrink-0">
                        <TrophyIcon className="w-5 h-5 sm:w-6 sm:h-6 text-primary group-hover:scale-110 transition-transform" />
                        <div className="absolute inset-0 bg-primary/5 animate-pulse" />
                    </div>
                    <div className="min-w-0">
                        <h1 className="text-lg sm:text-2xl font-black text-white uppercase italic tracking-tighter leading-none">
                            Certificates
                        </h1>
                        <p className="text-xs text-slate-500 mt-1">Issue and manage student certificates</p>
                    </div>
                </div>

                <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
                    <div className="flex items-center bg-white/[0.02] border border-white/5 p-1">
                        <button
                            onClick={() => setViewMode('library')}
                            className={cn(
                                "px-3 sm:px-5 py-2 text-[10px] font-black uppercase tracking-widest transition-all",
                                viewMode === 'library' ? "bg-white text-black" : "text-slate-500 hover:text-white"
                            )}
                        >Library</button>
                        {canManage && (
                            <button
                                onClick={() => setViewMode('builder')}
                                className={cn(
                                    "px-3 sm:px-5 py-2 text-[10px] font-black uppercase tracking-widest transition-all",
                                    viewMode === 'builder' ? "bg-white text-black" : "text-slate-500 hover:text-white"
                                )}
                            >Issue</button>
                        )}
                    </div>

                    <button
                        onClick={() => fetchCertificates()}
                        className="p-2.5 bg-white/[0.05] border border-white/[0.1] text-slate-400 hover:text-white transition-all"
                        title="Refresh"
                    >
                        <ArrowPathIcon className={cn("w-4 h-4", isLoading && "animate-spin")} />
                    </button>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="p-4 sm:p-6 lg:p-8 max-w-[1600px] mx-auto space-y-8 sm:space-y-12">
                {viewMode === 'library' ? (
                    <div className="space-y-10 animate-fade-in">
                        {/* Stats Dashboard */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            {[
                                { label: 'Total Issued', value: stats.total, icon: ShieldCheckIcon, color: 'text-indigo-400' },
                                { label: 'Published', value: stats.published, icon: CheckCircleIcon, color: 'text-primary' },
                                { label: 'Pending', value: stats.pending, icon: ClockIcon, color: 'text-slate-500' }
                            ].map(stat => (
                                <div key={stat.label} className="bg-[#111113] border border-white/[0.05] p-6 relative group overflow-hidden">
                                     <div className="absolute top-0 right-0 w-24 h-24 bg-white/[0.01] rotate-45 translate-x-12 -translate-y-12" />
                                     <div className="flex items-center gap-4 mb-4">
                                        <stat.icon className={cn("w-5 h-5", stat.color)} />
                                        <p className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-500">{stat.label}</p>
                                     </div>
                                     <p className="text-4xl font-black text-white italic tabular-nums">{stat.value}</p>
                                </div>
                            ))}
                        </div>

                        {/* Search & Table */}
                        <div className="space-y-4 sm:space-y-6">
                            <div className="relative group">
                                <MagnifyingGlassIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-700 group-focus-within:text-primary transition-colors" />
                                <input
                                    type="text"
                                    placeholder="Search by student, course or certificate no..."
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    className="w-full bg-[#111113] border border-white/[0.05] py-3 sm:py-4 pl-11 pr-4 text-[11px] text-white placeholder:text-slate-600 focus:border-primary/50 outline-none transition-all"
                                />
                            </div>

                            {/* Mobile card list */}
                            <div className="sm:hidden space-y-2">
                                {isLoading ? (
                                    <div className="py-12 text-center text-[10px] font-black uppercase tracking-widest text-slate-600 animate-pulse">Loading...</div>
                                ) : filteredCerts.length > 0 ? filteredCerts.map(cert => (
                                    <div key={cert.id} className="bg-[#111113] border border-white/[0.05] p-4 space-y-3">
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="min-w-0">
                                                <p className="text-white font-black uppercase text-xs italic truncate">{cert.portal_users?.full_name}</p>
                                                <p className="text-[9px] text-slate-500 font-mono mt-0.5 truncate">{cert.certificate_number}</p>
                                            </div>
                                            {(cert.is_published || cert.metadata?.is_published) ? (
                                                <span className="px-2 py-0.5 bg-primary/10 border border-primary/20 text-primary text-[8px] font-black uppercase tracking-widest italic flex-shrink-0">Published</span>
                                            ) : (
                                                <span className="px-2 py-0.5 bg-white/[0.05] border border-white/[0.1] text-slate-500 text-[8px] font-black uppercase tracking-widest italic flex-shrink-0">Draft</span>
                                            )}
                                        </div>
                                        <div>
                                            <p className="text-slate-300 text-[11px] font-bold italic truncate">{cert.courses?.title}</p>
                                            <p className="text-[9px] text-slate-600 mt-0.5">{cert.portal_users?.school_name}</p>
                                        </div>
                                        <div className="flex items-center gap-2 pt-1 border-t border-white/[0.04]">
                                            <button onClick={() => setViewingCert(cert)}
                                                className="flex items-center gap-1.5 px-3 py-2 bg-white/[0.05] border border-white/[0.1] text-slate-400 hover:text-white transition-all text-[10px] font-bold flex-1 justify-center">
                                                <EyeIcon className="w-3.5 h-3.5" /> View
                                            </button>
                                            {canManage && !(cert.is_published || cert.metadata?.is_published) && (
                                                <button onClick={() => handleAction(cert.id, 'publish')}
                                                    className="flex items-center gap-1.5 px-3 py-2 bg-primary/10 border border-primary/20 text-primary hover:bg-primary hover:text-black transition-all text-[10px] font-bold flex-1 justify-center">
                                                    <CheckCircleIcon className="w-3.5 h-3.5" /> Publish
                                                </button>
                                            )}
                                            {canManage && (
                                                <button onClick={() => handleAction(cert.id, 'delete')}
                                                    className="flex items-center gap-1.5 px-3 py-2 bg-red-950/10 border border-red-900/20 text-red-500 hover:bg-red-600 hover:text-white transition-all text-[10px] font-bold flex-1 justify-center">
                                                    <TrashIcon className="w-3.5 h-3.5" /> Delete
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                )) : (
                                    <div className="py-16 text-center text-slate-600 text-[10px] font-black uppercase tracking-widest">No certificates found</div>
                                )}
                            </div>

                            {/* Desktop table */}
                            <div className="hidden sm:block bg-[#111113] border border-white/[0.05] overflow-hidden shadow-2xl">
                                <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead className="bg-white/[0.02]">
                                        <tr>
                                            {['Certificate No.', 'Student', 'Course / Program', 'Status', 'Actions'].map(h => (
                                                <th key={h} className="px-4 sm:px-6 py-4 text-[9px] font-black text-slate-500 uppercase tracking-[0.3em] italic">{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/[0.03]">
                                        {isLoading ? (
                                            <tr>
                                                <td colSpan={5} className="px-6 py-20 text-center animate-pulse">
                                                    <p className="text-[10px] font-black uppercase tracking-[0.5em]">Loading...</p>
                                                </td>
                                            </tr>
                                        ) : filteredCerts.length > 0 ? (
                                            filteredCerts.map(cert => (
                                                <tr key={cert.id} className="hover:bg-white/[0.01] transition-colors group">
                                                    <td className="px-4 sm:px-6 py-4">
                                                        <span className="text-[11px] font-black text-slate-500 font-mono tracking-widest">{cert.certificate_number}</span>
                                                    </td>
                                                    <td className="px-4 sm:px-6 py-4">
                                                        <div className="space-y-1">
                                                            <p className="text-white font-black uppercase text-[12px] italic tracking-tight">{cert.portal_users?.full_name}</p>
                                                            <p className="text-[9px] text-primary/60 font-black uppercase tracking-widest">{cert.portal_users?.school_name}</p>
                                                        </div>
                                                    </td>
                                                    <td className="px-4 sm:px-6 py-4">
                                                        <div className="space-y-1">
                                                            <p className="text-slate-300 font-black uppercase text-[11px] italic tracking-tight">{cert.courses?.title}</p>
                                                            <p className="text-[9px] text-primary/60 font-black uppercase tracking-[0.2em]">{cert.courses?.program?.name}</p>
                                                        </div>
                                                    </td>
                                                    <td className="px-4 sm:px-6 py-4">
                                                        {(cert.is_published || cert.metadata?.is_published) ? (
                                                            <span className="px-3 py-1 bg-primary/10 border border-primary/20 text-primary text-[8px] font-black uppercase tracking-widest italic">● Published</span>
                                                        ) : (
                                                            <span className="px-3 py-1 bg-white/[0.05] border border-white/[0.1] text-slate-500 text-[8px] font-black uppercase tracking-widest italic">Draft</span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 sm:px-6 py-4 text-right">
                                                        <div className="flex items-center justify-end gap-2">
                                                            <button
                                                                onClick={() => setViewingCert(cert)}
                                                                className="p-2.5 bg-white/[0.05] border border-white/[0.1] text-slate-400 hover:text-white transition-all active:scale-95"
                                                                title="View certificate"
                                                            >
                                                                <EyeIcon className="w-4 h-4" />
                                                            </button>
                                                            {canManage && !(cert.is_published || cert.metadata?.is_published) && (
                                                                <button
                                                                    onClick={() => handleAction(cert.id, 'publish')}
                                                                    className="p-2.5 bg-primary/10 border border-primary/20 text-primary hover:bg-primary hover:text-black transition-all active:scale-95"
                                                                    title="Publish"
                                                                >
                                                                    <CheckCircleIcon className="w-4 h-4" />
                                                                </button>
                                                            )}
                                                            {canManage && (
                                                                <button
                                                                    onClick={() => handleAction(cert.id, 'delete')}
                                                                    className="p-2.5 bg-red-950/10 border border-red-900/20 text-red-500 hover:bg-red-600 hover:text-white transition-all active:scale-95"
                                                                    title="Delete"
                                                                >
                                                                    <TrashIcon className="w-4 h-4" />
                                                                </button>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))
                                        ) : (
                                            <tr>
                                                <td colSpan={5} className="px-6 py-20 text-center text-slate-600 uppercase text-[10px] font-black tracking-widest">No certificates found</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                                </div>
                            </div>
                        </div>
                    </div>
                ) : canManage ? (
                    /* INTEGRATED BUILDER — admin/teacher only */
                    <div className="animate-in fade-in slide-in-from-right-10 duration-500">
                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-12">
                            {/* Certificate Details */}
                            <div className="lg:col-span-4 space-y-6 lg:space-y-10">
                                <div>
                                    <h2 className="text-2xl sm:text-4xl font-black text-white italic uppercase tracking-tighter leading-none mb-2 sm:mb-4">
                                        Issue <span className="text-primary">Certificate</span>
                                    </h2>
                                    <p className="text-[11px] font-bold text-slate-500 uppercase tracking-[0.4em]">Select a student and course to issue</p>
                                </div>

                                <div className="space-y-5 sm:space-y-8 bg-[#111113] border border-white/[0.05] p-4 sm:p-8">
                                    <div className="flex items-center justify-between bg-white/[0.02] border border-white/5 p-4">
                                        <div className="space-y-1">
                                            <p className="text-[10px] font-black text-white uppercase tracking-widest italic">Issue to Entire Class</p>
                                            <p className="text-[8px] text-slate-500 uppercase tracking-widest">Issue to entire class at once</p>
                                        </div>
                                        <button 
                                            onClick={() => setIssueForm({...issueForm, isBulk: !issueForm.isBulk, studentId: ''})}
                                            className={cn(
                                                "w-12 h-6 rounded-full relative transition-all duration-300",
                                                issueForm.isBulk ? "bg-primary" : "bg-white/10"
                                            )}
                                        >
                                            <div className={cn(
                                                "absolute top-1 w-4 h-4 bg-white rounded-full transition-all",
                                                issueForm.isBulk ? "left-7" : "left-1"
                                            )} />
                                        </button>
                                    </div>

                                    <div className="space-y-4">
                                        <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">1. School</label>
                                        <select 
                                            value={issueForm.schoolId}
                                            onChange={e => setIssueForm({...issueForm, schoolId: e.target.value})}
                                            className="w-full bg-[#0A0A0B] border border-white/10 p-4 text-[11px] font-black uppercase text-white outline-none focus:border-primary transition-all"
                                        >
                                            <option value="">-- SELECT SCHOOL --</option>
                                            {schools.map(s => <option key={s.id} value={s.id}>{s.name || s.school_name}</option>)}
                                        </select>
                                    </div>

                                    <div className="space-y-4">
                                        <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                                            2. {issueForm.isBulk ? 'Class' : 'Class & Student'}
                                        </label>
                                        <select 
                                            value={issueForm.classId}
                                            onChange={e => setIssueForm({...issueForm, classId: e.target.value})}
                                            className="w-full bg-[#0A0A0B] border border-white/10 p-4 text-[11px] font-black uppercase text-white outline-none focus:border-primary transition-all"
                                        >
                                            <option value="">-- SELECT CLASS --</option>
                                            {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                        </select>
                                        {issueForm.classId && !issueForm.isBulk && (
                                            <select 
                                                value={issueForm.studentId}
                                                onChange={e => setIssueForm({...issueForm, studentId: e.target.value})}
                                                className="w-full bg-[#0A0A0B] border border-white/10 p-4 mt-4 text-[11px] font-black uppercase text-white outline-none focus:border-primary transition-all"
                                            >
                                                <option value="">-- SELECT STUDENT --</option>
                                                {students.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
                                            </select>
                                        )}
                                    </div>

                                    <div className="space-y-4">
                                        <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">3. Program & Course</label>
                                        <select 
                                            value={issueForm.programId}
                                            onChange={e => setIssueForm({...issueForm, programId: e.target.value})}
                                            className="w-full bg-[#0A0A0B] border border-white/10 p-4 text-[11px] font-black uppercase text-white outline-none focus:border-primary transition-all"
                                        >
                                            <option value="">-- SELECT PROGRAM --</option>
                                            {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                        </select>
                                        {issueForm.programId && (
                                            <select 
                                                value={issueForm.courseId}
                                                onChange={e => setIssueForm({...issueForm, courseId: e.target.value})}
                                                className="w-full bg-[#0A0A0B] border border-white/10 p-4 mt-4 text-[11px] font-black uppercase text-white outline-none focus:border-primary transition-all"
                                            >
                                                <option value="">-- SELECT MODULE --</option>
                                                {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                                            </select>
                                        )}
                                    </div>

                                    <button 
                                        onClick={handleIssue}
                                        disabled={isIssuing || !issueForm.courseId || (issueForm.isBulk ? !issueForm.classId : !issueForm.studentId)}
                                        className="w-full bg-primary text-black py-5 text-[11px] font-black uppercase tracking-[0.3em] hover:bg-primary/90 transition-all disabled:opacity-30 active:scale-[0.98]"
                                    >
                                        {isIssuing ? 'Issuing...' : issueForm.isBulk ? 'Issue to Entire Class' : 'Issue Certificate'}
                                    </button>
                                </div>
                            </div>

                            {/* Live Preview */}
                            <div className="lg:col-span-8">
                                <div className="bg-[#111113] border border-white/[0.05] relative overflow-hidden group/canvas shadow-inner" style={{aspectRatio: '1.414/1'}}>
                                    <div className="absolute top-3 sm:top-6 left-3 sm:left-6 flex items-center gap-2 z-10">
                                        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-[0.3em] italic leading-none">Live Preview</span>
                                    </div>

                                    <div className="absolute inset-0 flex items-center justify-center overflow-hidden p-4">
                                        <div className="w-full h-full flex items-center justify-center" style={{transform: 'scale(0.42)', transformOrigin: 'center center'}}>
                                            <CertificatePreview
                                                studentName={activeStudent?.full_name || "RECIPIENT NAME"}
                                                schoolName={activeSchool?.name || "ACADEMY NAME"}
                                                courseTitle={activeCourse?.title || "MODULE TITLE"}
                                                programName={activeProgram?.name || "PROGRAM TRACK"}
                                                issuedDate={new Date().toISOString()}
                                                certificateNumber="SYS-202X-PRV"
                                                verificationCode="7X2A9B"
                                                templateId={issueForm.templateId}
                                                isLandscape={true}
                                            />
                                        </div>
                                    </div>
                                </div>
                                <div className="mt-3 sm:mt-5 flex flex-wrap gap-2">
                                    {[
                                        { id: 'modern-sharp', label: 'Modern' },
                                        { id: 'classic-heritage', label: 'Classic' },
                                        { id: 'cyber-minimal', label: 'Cyber' },
                                        { id: 'executive-platinum', label: 'Executive' },
                                        { id: 'royal-diploma', label: 'Royal' },
                                    ].map(t => (
                                        <button
                                            key={t.id}
                                            onClick={() => setIssueForm({...issueForm, templateId: t.id})}
                                            className={cn(
                                                "px-3 sm:px-4 py-2.5 border text-[9px] font-black uppercase tracking-widest transition-all flex-1 min-w-[70px]",
                                                issueForm.templateId === t.id ? "bg-primary text-black border-primary" : "bg-white/[0.02] border-white/10 text-slate-500 hover:border-white/20"
                                            )}
                                        >
                                            {t.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                ) : null}
            </div>

            {/* VIEW DETAIL MODAL */}
            {viewingCert && (
                <div className="fixed inset-0 z-[110] flex items-start justify-center p-3 sm:p-6 bg-black/95 backdrop-blur-xl animate-fade-in overflow-y-auto">
                    <div className="bg-[#111113] border border-white/[0.1] w-full max-w-5xl shadow-2xl relative mt-4 sm:mt-10 mb-10 overflow-hidden">
                        <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-primary via-orange-600 to-indigo-600" />
                        <div className="p-4 sm:p-8">
                            <button
                                onClick={() => setViewingCert(null)}
                                className="absolute top-3 right-3 sm:top-5 sm:right-5 p-2 text-slate-500 hover:text-white transition-all z-20"
                            >
                                <XMarkIcon className="w-5 h-5" />
                            </button>
                            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-10">
                                <div className="lg:col-span-5 space-y-5 sm:space-y-8">
                                    <div className="space-y-2 sm:space-y-4">
                                        <p className="text-[10px] font-black text-primary uppercase tracking-[0.4em] leading-none">Certificate Details</p>
                                        <h2 className="text-2xl sm:text-3xl font-black text-white italic uppercase tracking-tighter leading-none">{viewingCert.portal_users?.full_name}</h2>
                                        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-[0.3em] font-mono">{viewingCert.certificate_number}</p>
                                    </div>
                                    <div className="h-px bg-white/[0.05]" />
                                    <div className="space-y-4">
                                        <div className="space-y-1">
                                            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Course</p>
                                            <p className="text-base sm:text-xl font-black text-white uppercase italic">{viewingCert.courses?.title}</p>
                                        </div>
                                        <div className="p-4 bg-white/[0.02] border border-white/[0.05] inline-block">
                                            <QRCode value={`https://rillcod.com/verify/${viewingCert.id}`} size={100} fgColor="#121212" />
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => {
                                                const style = document.createElement('style');
                                                style.id = '__cert-landscape-print';
                                                style.textContent = '@page { size: A4 landscape; margin: 0; }';
                                                document.head.appendChild(style);
                                                document.body.setAttribute('data-printing', 'certificate');
                                                window.print();
                                                setTimeout(() => {
                                                    document.getElementById('__cert-landscape-print')?.remove();
                                                    document.body.removeAttribute('data-printing');
                                                }, 1000);
                                            }}
                                            className="flex-1 bg-white text-black py-3 sm:py-4 text-[11px] font-black uppercase tracking-[0.3em] flex items-center justify-center gap-2 hover:bg-slate-200 transition-all"
                                        >
                                            <PrinterIcon className="w-4 h-4" /> Print
                                        </button>
                                        <button
                                            onClick={async () => {
                                                if (!certPdfRef.current || !viewingCert) return;
                                                setIsDownloadingPDF(true);
                                                try {
                                                    const name = viewingCert.portal_users?.full_name?.replace(/\s+/g, '_') || 'Certificate';
                                                    await generateReportPDF(certPdfRef.current, `Certificate_${name}_${viewingCert.verification_code}.pdf`, true);
                                                } catch (e) {
                                                    console.error(e);
                                                } finally {
                                                    setIsDownloadingPDF(false);
                                                }
                                            }}
                                            disabled={isDownloadingPDF}
                                            className="flex-1 bg-primary text-black py-3 sm:py-4 text-[11px] font-black uppercase tracking-[0.3em] flex items-center justify-center gap-2 hover:bg-primary/90 disabled:opacity-50 transition-all"
                                        >
                                            <ArrowDownTrayIcon className="w-4 h-4" />
                                            {isDownloadingPDF ? 'Saving...' : 'Download PDF'}
                                        </button>
                                    </div>
                                    {/* Hidden full-size cert for PDF capture */}
                                    <div ref={certPdfRef} style={{ position: 'fixed', left: '-9999px', top: 0, zIndex: -1 }}>
                                        {viewingCert && (
                                            <CertificatePreview
                                                studentName={viewingCert.portal_users?.full_name}
                                                schoolName={viewingCert.portal_users?.school_name}
                                                courseTitle={viewingCert.courses?.title}
                                                programName={viewingCert.courses?.program?.name}
                                                issuedDate={viewingCert.issued_date}
                                                certificateNumber={viewingCert.certificate_number}
                                                verificationCode={viewingCert.verification_code}
                                                templateId={viewingCert.template_id}
                                                isLandscape={true}
                                            />
                                        )}
                                    </div>
                                </div>
                                <div id="cert-print-root" className="lg:col-span-7 bg-black/40 border border-white/5 flex items-center justify-center overflow-hidden relative" style={{aspectRatio: '4/3'}}>
                                    <div className="absolute inset-0 flex items-center justify-center overflow-hidden p-3">
                                        <div className="w-full h-full flex items-center justify-center" style={{transform: 'scale(0.38)', transformOrigin: 'center center'}}>
                                            <CertificatePreview
                                                studentName={viewingCert.portal_users?.full_name}
                                                schoolName={viewingCert.portal_users?.school_name}
                                                courseTitle={viewingCert.courses?.title}
                                                programName={viewingCert.courses?.program?.name}
                                                issuedDate={viewingCert.issued_date}
                                                certificateNumber={viewingCert.certificate_number}
                                                verificationCode={viewingCert.verification_code}
                                                templateId={viewingCert.template_id}
                                                isLandscape={true}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
