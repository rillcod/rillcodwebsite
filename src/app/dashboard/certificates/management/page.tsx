'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { 
    TrophyIcon, PlusIcon, MegaphoneIcon, 
    UserIcon, AcademicCapIcon, CheckBadgeIcon,
    ArrowPathIcon, XMarkIcon, MagnifyingGlassIcon
} from '@/lib/icons';
import { Badge } from '@/components/ui/badge';

export default function CertificateManagement() {
    const { profile } = useAuth();
    const [certificates, setCertificates] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isIssuing, setIsIssuing] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    // Form state
    const [showIssueModal, setShowIssueModal] = useState(false);
    const [issueForm, setIssueForm] = useState({ studentId: '', courseId: '', schoolId: '' });
    const [students, setStudents] = useState<any[]>([]);
    const [courses, setCourses] = useState<any[]>([]);
    const [schools, setSchools] = useState<any[]>([]);

    useEffect(() => {
        if (!profile) return;
        if (profile.role === 'school') {
            setIsLoading(false);
            return;
        }
        fetchCertificates();
        fetchFormData();
    }, [profile]);

    async function fetchCertificates() {
        try {
            const res = await fetch('/api/certificates');
            if (res.ok) {
                const json = await res.json();
                setCertificates(json.data);
            }
        } catch (error) {
            console.error('Error fetching certificates:', error);
        } finally {
            setIsLoading(false);
        }
    }

    async function fetchFormData() {
        // In a real app, these would be filtered by school for teachers
        try {
            const [stdRes, crsRes, schRes] = await Promise.all([
                fetch('/api/students'), // Simplified, assumes endpoints exist
                fetch('/api/courses'),
                fetch('/api/schools')
            ]);
            if (stdRes.ok) setStudents((await stdRes.json()).data || []);
            if (crsRes.ok) setCourses((await crsRes.json()).data || []);
            if (schRes.ok) setSchools((await schRes.json()).data || []);
        } catch (err) {
            console.error('Error fetching form data:', err);
        }
    }

    async function handlePublish(certId: string) {
        try {
            const res = await fetch(`/api/certificates/${certId}`, { method: 'PATCH' });
            if (res.ok) {
                setCertificates(prev => prev.map(c => c.id === certId ? { ...c, metadata: { ...c.metadata, is_published: true } } : c));
            }
        } catch (error) {
            console.error('Publish failed:', error);
        }
    }

    async function handleIssue(e: React.FormEvent) {
        e.preventDefault();
        setIsIssuing(true);
        try {
            const res = await fetch('/api/certificates', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(issueForm)
            });
            if (res.ok) {
                setShowIssueModal(false);
                fetchCertificates();
            }
        } catch (error) {
            console.error('Issue failed:', error);
        } finally {
            setIsIssuing(false);
        }
    }

    const isAdmin = profile?.role === 'admin';
    const isTeacher = profile?.role === 'teacher';
    const canManage = isAdmin || isTeacher;
    const isViewer = profile?.role === 'school';

    const filtered = certificates.filter(c => 
        c.portal_users?.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.courses?.title?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const titlePrefix = isAdmin ? 'Institutional' : 'School';

    return (
        <div className="min-h-screen bg-slate-950 p-6 lg:p-10 space-y-8">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-slate-900 border border-slate-800 p-8">
                <div className="space-y-2">
                    <div className="flex items-center gap-2">
                        <TrophyIcon className="w-5 h-5 text-teal-400" />
                        <span className="text-xs font-black uppercase tracking-[0.3em] text-teal-400">Management Portal</span>
                    </div>
                    <h1 className="text-3xl font-black text-white uppercase italic tracking-tighter">
                        {titlePrefix} <span className="text-teal-500">Certifications</span>
                    </h1>
                </div>

                <div className="flex items-center gap-4">
                    <div className="relative">
                        <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                        <input 
                            type="text" 
                            placeholder="SEARCH BY NAME..." 
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="bg-slate-950 border border-slate-800 py-2.5 pl-10 pr-4 text-xs font-black uppercase text-white w-64 focus:border-teal-500 outline-none"
                        />
                    </div>
                    {canManage && (
                        <button 
                            onClick={() => setShowIssueModal(true)}
                            className="px-6 py-2.5 bg-teal-600 hover:bg-teal-500 text-white text-xs font-black uppercase tracking-widest transition-all flex items-center gap-2"
                        >
                            <PlusIcon className="w-4 h-4" /> Issue Certificate
                        </button>
                    )}
                </div>
            </div>

            {/* List */}
            <div className="bg-slate-950 border border-slate-800 overflow-hidden">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-slate-900 border-b border-slate-800">
                            <th className="px-6 py-4 text-xs font-black uppercase tracking-widest text-slate-400">Recipient</th>
                            <th className="px-6 py-4 text-xs font-black uppercase tracking-widest text-slate-400">Course</th>
                            <th className="px-6 py-4 text-xs font-black uppercase tracking-widest text-slate-400">Status</th>
                            <th className="px-6 py-4 text-xs font-black uppercase tracking-widest text-slate-400 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50">
                        {isLoading ? (
                            <tr><td colSpan={4} className="p-12 text-center text-slate-500 uppercase font-black text-xs animate-pulse">Syncing Vault...</td></tr>
                        ) : filtered.length === 0 ? (
                            <tr><td colSpan={4} className="p-12 text-center text-slate-500 uppercase font-bold text-xs italic">No relevant records found.</td></tr>
                        ) : filtered.map(cert => (
                            <tr key={cert.id} className="hover:bg-white/[0.02] transition-colors group">
                                <td className="px-6 py-5">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-[10px] font-black text-teal-500">
                                            {cert.portal_users?.full_name?.charAt(0)}
                                        </div>
                                        <div>
                                            <p className="text-sm font-black text-white uppercase tracking-tight">{cert.portal_users?.full_name}</p>
                                            <p className="text-[10px] text-slate-500 font-mono">{cert.certificate_number}</p>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-6 py-5">
                                    <p className="text-xs font-bold text-slate-300 uppercase">{cert.courses?.title}</p>
                                    <p className="text-[10px] text-slate-500 uppercase tracking-widest">{cert.issued_date}</p>
                                </td>
                                <td className="px-6 py-5">
                                    {cert.metadata?.is_published ? (
                                        <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 rounded-none uppercase text-xs font-black tracking-widest px-2.5 py-1">
                                            Published
                                        </Badge>
                                    ) : (
                                        <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/20 rounded-none uppercase text-xs font-black tracking-widest px-2.5 py-1">
                                            Draft
                                        </Badge>
                                    )}
                                </td>
                                <td className="px-6 py-5 text-right">
                                    {!cert.metadata?.is_published && canManage && (
                                        <button 
                                            onClick={() => handlePublish(cert.id)}
                                            className="px-4 py-1.5 bg-indigo-600/20 hover:bg-indigo-600 text-indigo-400 hover:text-white border border-indigo-500/30 text-xs font-black uppercase tracking-widest transition-all"
                                        >
                                            Publish
                                        </button>
                                    )}
                                    {(cert.metadata?.is_published || isViewer) && (
                                        <span className="text-xs font-black text-slate-500 uppercase tracking-[0.2em]">
                                            {cert.metadata?.is_published ? 'Verified' : 'Draft'}
                                        </span>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Issue Modal */}
            {showIssueModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setShowIssueModal(false)} />
                    <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
                        <div className="p-6 border-b border-slate-800 flex justify-between items-center">
                            <h2 className="text-xs font-black text-white uppercase tracking-widest italic">Issue New Certificate</h2>
                            <button onClick={() => setShowIssueModal(false)}><XMarkIcon className="w-5 h-5 text-slate-500" /></button>
                        </div>
                        <form onSubmit={handleIssue} className="p-6 space-y-6">
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Select Student</label>
                                    <select 
                                        required
                                        value={issueForm.studentId}
                                        onChange={e => setIssueForm({...issueForm, studentId: e.target.value})}
                                        className="w-full bg-slate-950 border border-slate-800 p-3 text-xs text-white focus:border-teal-500 outline-none"
                                    >
                                        <option value="">Choose Student...</option>
                                        {students.map(s => <option key={s.id} value={s.id}>{s.user?.full_name}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Course</label>
                                    <select 
                                        required
                                        value={issueForm.courseId}
                                        onChange={e => setIssueForm({...issueForm, courseId: e.target.value})}
                                        className="w-full bg-slate-950 border border-slate-800 p-3 text-xs text-white focus:border-teal-500 outline-none"
                                    >
                                        <option value="">Choose Course...</option>
                                        {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                                    </select>
                                </div>
                                {profile?.role === 'admin' && (
                                    <div>
                                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">School Affiliation</label>
                                        <select 
                                            required
                                            value={issueForm.schoolId}
                                            onChange={e => setIssueForm({...issueForm, schoolId: e.target.value})}
                                            className="w-full bg-slate-950 border border-slate-800 p-3 text-xs text-white focus:border-teal-500 outline-none"
                                        >
                                            <option value="">Choose School...</option>
                                            {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                        </select>
                                    </div>
                                )}
                            </div>
                            <button 
                                type="submit" 
                                disabled={isIssuing}
                                className="w-full py-3 bg-teal-600 hover:bg-teal-500 text-white text-xs font-black uppercase tracking-widest transition-all disabled:opacity-50"
                            >
                                {isIssuing ? <ArrowPathIcon className="w-4 h-4 animate-spin mx-auto" /> : 'Issue Certificate'}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
