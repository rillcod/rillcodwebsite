'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { 
    TrophyIcon, 
    AcademicCapIcon, 
    SparklesIcon, 
    TagIcon, 
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
    const { profile } = useAuth();
    const [certificates, setCertificates] = useState<Certificate[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    
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

    useEffect(() => {
        fetchInitialData();
        fetchCertificates();
    }, [profile]);

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

    return (
        <div className="min-h-screen bg-[#0A0A0B] text-slate-400 font-sans selection:bg-primary/30">
            {/* Header Section */}
            <div className="p-8 border-b border-white/[0.05] bg-[#0D0D0F]/80 backdrop-blur-xl sticky top-0 z-[100] flex justify-between items-center">
                <div className="flex items-center gap-6">
                    <div className="w-12 h-12 bg-primary/10 border border-primary/20 flex items-center justify-center relative overflow-hidden group">
                        <TrophyIcon className="w-6 h-6 text-primary group-hover:scale-110 transition-transform" />
                        <div className="absolute inset-0 bg-primary/5 animate-pulse" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-black text-white uppercase italic tracking-tighter leading-none">
                            Certificate <span className="text-primary">Management</span>
                        </h1>
                        <p className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-500 mt-2">Issue and manage student certificates</p>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <div className="flex items-center bg-white/[0.02] border border-white/5 p-1 mr-4">
                        <button 
                            onClick={() => setViewMode('library')}
                            className={cn(
                                "px-6 py-2 text-[10px] font-black uppercase tracking-widest transition-all",
                                viewMode === 'library' ? "bg-white text-black" : "text-slate-500 hover:text-white"
                            )}
                        >Library</button>
                        <button 
                            onClick={() => setViewMode('builder')}
                            className={cn(
                                "px-6 py-2 text-[10px] font-black uppercase tracking-widest transition-all",
                                viewMode === 'builder' ? "bg-white text-black" : "text-slate-500 hover:text-white"
                            )}
                        >Builder</button>
                    </div>
                    
                    <button 
                        onClick={() => fetchCertificates()}
                        className="p-3 bg-white/[0.05] border border-white/[0.1] text-slate-400 hover:text-white transition-all"
                        title="Refresh Archive"
                    >
                        <ArrowPathIcon className={cn("w-4 h-4", isLoading && "animate-spin")} />
                    </button>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="p-8 max-w-[1600px] mx-auto space-y-12">
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
                        <div className="space-y-6">
                            <div className="relative group">
                                <MagnifyingGlassIcon className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-700 group-focus-within:text-primary transition-colors" />
                                <input 
                                    type="text"
                                    placeholder="SEARCH ARCHIVE BY STUDENT OR COURSE..."
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    className="w-full bg-[#111113] border border-white/[0.05] py-5 pl-16 pr-8 text-[11px] font-black uppercase tracking-[0.2em] text-white focus:border-primary/50 outline-none transition-all"
                                />
                            </div>

                            <div className="bg-[#111113] border border-white/[0.05] overflow-hidden shadow-2xl">
                                <table className="w-full text-left border-collapse">
                                    <thead className="bg-white/[0.02]">
                                        <tr>
                                            {['Certificate No.', 'Student', 'Course / Program', 'Status', 'Actions'].map(h => (
                                                <th key={h} className="px-8 py-5 text-[9px] font-black text-slate-500 uppercase tracking-[0.3em] italic">{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/[0.03]">
                                        {isLoading ? (
                                            <tr>
                                                <td colSpan={5} className="px-8 py-20 text-center animate-pulse">
                                                    <p className="text-[10px] font-black uppercase tracking-[0.5em]">Loading...</p>
                                                </td>
                                            </tr>
                                        ) : filteredCerts.length > 0 ? (
                                            filteredCerts.map(cert => (
                                                <tr key={cert.id} className="hover:bg-white/[0.01] transition-colors group">
                                                    <td className="px-8 py-6">
                                                        <span className="text-[11px] font-black text-slate-500 font-mono tracking-widest">{cert.certificate_number}</span>
                                                    </td>
                                                    <td className="px-8 py-6">
                                                        <div className="space-y-1">
                                                            <p className="text-white font-black uppercase text-[12px] italic tracking-tight">{cert.portal_users?.full_name}</p>
                                                            <p className="text-[9px] text-primary/60 font-black uppercase tracking-widest">{cert.portal_users?.school_name}</p>
                                                        </div>
                                                    </td>
                                                    <td className="px-8 py-6">
                                                        <div className="space-y-1">
                                                            <p className="text-slate-300 font-black uppercase text-[11px] italic tracking-tight">{cert.courses?.title}</p>
                                                            <p className="text-[9px] text-primary/60 font-black uppercase tracking-[0.2em]">{cert.courses?.program?.name}</p>
                                                        </div>
                                                    </td>
                                                    <td className="px-8 py-6">
                                                        {(cert.is_published || cert.metadata?.is_published) ? (
                                                            <span className="px-3 py-1 bg-primary/10 border border-primary/20 text-primary text-[8px] font-black uppercase tracking-widest italic">● Published</span>
                                                        ) : (
                                                            <span className="px-3 py-1 bg-white/[0.05] border border-white/[0.1] text-slate-500 text-[8px] font-black uppercase tracking-widest italic">Draft</span>
                                                        )}
                                                    </td>
                                                    <td className="px-8 py-6 text-right">
                                                        <div className="flex items-center justify-end gap-3">
                                                            <button
                                                                onClick={() => setViewingCert(cert)}
                                                                className="p-3 bg-white/[0.05] border border-white/[0.1] text-slate-400 hover:text-white transition-all active:scale-95"
                                                                title="View certificate"
                                                            >
                                                                <EyeIcon className="w-4 h-4" />
                                                            </button>
                                                            {!(cert.is_published || cert.metadata?.is_published) && (
                                                                <button
                                                                    onClick={() => handleAction(cert.id, 'publish')}
                                                                    className="p-3 bg-primary/10 border border-primary/20 text-primary hover:bg-primary hover:text-black transition-all active:scale-95"
                                                                    title="Publish certificate"
                                                                >
                                                                    <CheckCircleIcon className="w-4 h-4" />
                                                                </button>
                                                            )}
                                                            <button
                                                                onClick={() => handleAction(cert.id, 'delete')}
                                                                className="p-3 bg-red-950/10 border border-red-900/20 text-red-500 hover:bg-red-600 hover:text-white transition-all active:scale-95"
                                                                title="Delete certificate"
                                                            >
                                                                <TrashIcon className="w-4 h-4" />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))
                                        ) : (
                                            <tr>
                                                <td colSpan={5} className="px-8 py-20 text-center text-slate-600 uppercase text-[10px] font-black tracking-widest">No certificates found</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                ) : (
                    /* INTEGRATED BUILDER - No more popup */
                    <div className="animate-in fade-in slide-in-from-right-10 duration-500">
                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
                            {/* Formation Controls */}
                            <div className="lg:col-span-4 space-y-10">
                                <div>
                                    <h2 className="text-4xl font-black text-white italic uppercase tracking-tighter leading-none mb-4">
                                        Issue <span className="text-primary">Certificate</span>
                                    </h2>
                                    <p className="text-[11px] font-bold text-slate-500 uppercase tracking-[0.4em]">Select a student and course to issue</p>
                                </div>

                                <div className="space-y-8 bg-[#111113] border border-white/[0.05] p-8">
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

                            {/* Viewport Canvas */}
                            <div className="lg:col-span-8">
                                <div className="bg-[#111113] border border-white/[0.05] p-12 aspect-[1.414/1] flex items-center justify-center relative overflow-hidden group/canvas shadow-inner">
                                    <div className="absolute top-8 left-8 flex items-center gap-4">
                                        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] italic leading-none">Live Preview</span>
                                    </div>

                                    <div className="scale-[0.7] xl:scale-[0.8] transition-transform duration-700 group-hover/canvas:scale-[0.72] xl:group-hover/canvas:scale-[0.82]">
                                        <CertificatePreview 
                                            studentName={activeStudent?.full_name || "RECIPIENT NAME"}
                                            schoolName={activeSchool?.name || "ACADEMY NAME"}
                                            courseTitle={activeCourse?.title || "MODULE TITLE"}
                                            programName={activeProgram?.name || "PROGRAM TRACK"}
                                            issuedDate={new Date().toISOString()}
                                            certificateNumber="SYS-202X-PRV"
                                            verificationCode="7X2A9B"
                                            templateId={issueForm.templateId}
                                        />
                                    </div>
                                    
                                    <div className="absolute bottom-8 right-8 space-y-2 text-right">
                                        <p className="text-[9px] font-black text-slate-800 uppercase tracking-widest leading-none italic">Select a student and course to preview</p>
                                    </div>
                                </div>
                                <div className="mt-8 flex gap-4">
                                    {['modern-sharp', 'classic-heritage', 'cyber-minimal', 'executive-platinum', 'royal-diploma'].map(tid => (
                                        <button 
                                            key={tid}
                                            onClick={() => setIssueForm({...issueForm, templateId: tid})}
                                            className={cn(
                                                "flex-1 p-4 border text-[9px] font-black uppercase tracking-widest transition-all",
                                                issueForm.templateId === tid ? "bg-primary text-black border-primary" : "bg-white/[0.02] border-white/10 text-slate-500 hover:border-white/20"
                                            )}
                                        >
                                            {tid.split('-')[0]}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* VIEW DETAIL MODAL */}
            {viewingCert && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-6 bg-black/95 backdrop-blur-xl animate-fade-in overflow-y-auto pt-20">
                    <div className="bg-[#111113] border border-white/[0.1] w-full max-w-6xl shadow-2xl relative mb-20 overflow-hidden">
                        <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-primary via-orange-600 to-indigo-600" />
                        <div className="p-10">
                            <button 
                                onClick={() => setViewingCert(null)} 
                                className="absolute top-6 right-6 p-2 text-slate-500 hover:text-white transition-all z-20"
                            >
                                <XMarkIcon className="w-6 h-6" />
                            </button>
                            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
                                <div className="lg:col-span-5 space-y-10">
                                    <div className="space-y-4">
                                        <p className="text-[10px] font-black text-primary uppercase tracking-[0.4em] leading-none">Certificate Details</p>
                                        <h2 className="text-4xl font-black text-white italic uppercase tracking-tighter leading-none">{viewingCert.portal_users?.full_name}</h2>
                                        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-[0.3em] font-mono">{viewingCert.certificate_number}</p>
                                    </div>
                                    <div className="h-px bg-white/[0.05]" />
                                    <div className="space-y-6">
                                        <div className="space-y-1">
                                            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Course</p>
                                            <p className="text-xl font-black text-white uppercase italic">{viewingCert.courses?.title}</p>
                                        </div>
                                        <div className="p-6 bg-white/[0.02] border border-white/[0.05] inline-block">
                                            <QRCode value={`https://rillcod.com/verify/${viewingCert.id}`} size={120} fgColor="#121212" />
                                        </div>
                                    </div>
                                    <button 
                                        onClick={() => window.print()}
                                        className="w-full bg-white text-black py-4 text-[11px] font-black uppercase tracking-[0.3em] flex items-center justify-center gap-3 hover:bg-slate-200 transition-all"
                                    >
                                        <PrinterIcon className="w-4 h-4" /> Export for Archiving
                                    </button>
                                </div>
                                <div className="lg:col-span-7 bg-black/40 border border-white/5 flex items-center justify-center overflow-hidden relative aspect-[4/3]">
                                     <div className="scale-[0.45] origin-center -translate-y-2">
                                        <CertificatePreview
                                            studentName={viewingCert.portal_users?.full_name}
                                            schoolName={viewingCert.portal_users?.school_name}
                                            courseTitle={viewingCert.courses?.title}
                                            programName={viewingCert.courses?.program?.name}
                                            issuedDate={viewingCert.issued_date}
                                            certificateNumber={viewingCert.certificate_number}
                                            verificationCode={viewingCert.verification_code}
                                            templateId={viewingCert.template_id}
                                        />
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
