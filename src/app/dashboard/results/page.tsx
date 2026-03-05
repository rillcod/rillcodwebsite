'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
    PrinterIcon, AcademicCapIcon, MagnifyingGlassIcon,
    TrophyIcon, DocumentTextIcon, UserGroupIcon, PencilSquareIcon, StarIcon,
    CheckIcon,
} from '@heroicons/react/24/solid';
import { Crown, Target, Sparkles, User, UserCheck } from 'lucide-react';
import QRCode from 'react-qr-code';
import { Database } from '@/types/supabase';

type StudentReport = Database['public']['Tables']['student_progress_reports']['Row'];
type PortalUser = Database['public']['Tables']['portal_users']['Row'];
type Course = Database['public']['Tables']['courses']['Row'];
type ReportSettings = Database['public']['Tables']['report_settings']['Row'];

// ─── helpers ──────────────────────────────────────────────────
function letterGrade(pct: number) {
    if (pct >= 90) return { g: 'A+', label: 'Distinction', color: '#1a6b3c' };
    if (pct >= 80) return { g: 'A', label: 'Excellent', color: '#1a6b3c' };
    if (pct >= 70) return { g: 'B', label: 'Very Good', color: '#1a4d8c' };
    if (pct >= 60) return { g: 'C', label: 'Good', color: '#7c6b15' };
    if (pct >= 50) return { g: 'D', label: 'Pass', color: '#8c3a14' };
    return { g: 'F', label: 'Fail', color: '#8c1414' };
}

function BarChart({ theory, practical, attendance }: { theory: number; practical: number; attendance: number }) {
    const bars = [
        { label: 'Theory', value: theory, color: '#4f7ef7', bg: 'bg-blue-500/10' },
        { label: 'Practical', value: practical, color: '#22c55e', bg: 'bg-emerald-500/10' },
        { label: 'Attendance', value: attendance, color: '#a855f7', bg: 'bg-purple-500/10' },
    ];
    return (
        <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
            <div className="flex items-end gap-10 justify-center h-[160px] relative">
                {/* Y-axis lines */}
                <div className="absolute inset-x-0 top-0 h-full flex flex-col justify-between pointer-events-none">
                    {[100, 75, 50, 25, 0].map(v => (
                        <div key={v} className="w-full border-t border-gray-50 flex items-center">
                            <span className="text-[8px] text-gray-300 absolute -left-6">{v}%</span>
                        </div>
                    ))}
                </div>

                {bars.map(b => (
                    <div key={b.label} className="flex flex-col items-center gap-3 relative z-10 w-16">
                        <div className="flex flex-col-reverse w-full items-center">
                            <div className={`w-full rounded-t-lg transition-all duration-1000 ease-out shadow-lg`}
                                style={{
                                    height: `${(b.value / 100) * 120}px`,
                                    backgroundColor: b.color,
                                    boxShadow: `0 4px 12px ${b.color}40`
                                }} />
                            <span className="text-[12px] font-black mb-1" style={{ color: b.color }}>{b.value}%</span>
                        </div>
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">{b.label}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ─── The report card component (both screen + print) ──────────
function ReportCard({ report, orgSettings }: { report: StudentReport; orgSettings: ReportSettings | null }) {
    const today = new Date(report.report_date ?? Date.now()).toLocaleDateString('en-GB', {
        day: '2-digit', month: 'long', year: 'numeric',
    });

    const theory = report.theory_score ?? 0;
    const practical = report.practical_score ?? 0;
    const attendance = report.attendance_score ?? 0;
    const overall = report.overall_score ?? Math.round(theory * 0.4 + practical * 0.4 + attendance * 0.2);
    const grade = letterGrade(overall);

    const org = orgSettings || {
        org_name: 'Rillcod Technologies',
        org_tagline: 'Excellence in Educational Technology',
        org_address: '26 Ogiesoba Avenue, GRA, Benin City',
        org_phone: '08116600091',
        org_email: 'rillcod@gmail.com',
        logo_url: null,
    };

    const milestones = Array.isArray(report.learning_milestones) ? report.learning_milestones : [];

    return (
        <div
            id="report-card"
            className="bg-white text-gray-900 font-sans shadow-2xl relative overflow-hidden"
            style={{ width: '210mm', minHeight: '297mm', margin: '0 auto', fontSize: 11, border: '16px solid #1a1a2e' }}
        >
            {/* Background Sophistication */}
            <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-indigo-50/50 rounded-full blur-3xl -z-10 -mr-40 -mt-40" />
            <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-violet-50/50 rounded-full blur-3xl -z-10 -ml-40 -mb-40" />
            <div className="absolute inset-0 border-[1px] border-gray-100 m-4 pointer-events-none" />

            {/* ── HEADER ── */}
            <div className="relative pt-12 pb-8 px-12 bg-[#1a1a2e] text-white">
                <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 skew-x-12 -mr-16" />
                <div className="flex items-center justify-between relative z-10">
                    <div className="flex items-center gap-6">
                        {org.logo_url ? (
                            <img src={org.logo_url} alt="Logo" className="w-20 h-20 object-contain brightness-0 invert" />
                        ) : (
                            <div className="w-16 h-16 bg-gradient-to-br from-violet-600 to-indigo-600 rounded-2xl flex items-center justify-center font-black text-3xl italic shadow-2xl shadow-violet-500/20">
                                R
                            </div>
                        )}
                        <div>
                            <h1 className="text-2xl font-black tracking-tighter uppercase leading-none mb-1">
                                {org.org_name || 'Rillcod Academy'}
                            </h1>
                            <p className="text-[10px] font-bold text-violet-400 uppercase tracking-[0.3em] opacity-80">
                                {org.org_tagline || 'Pioneering Technical Excellence'}
                            </p>
                        </div>
                    </div>
                    <div className="text-right">
                        <div className="inline-block px-3 py-1 bg-amber-500/10 border border-amber-500/20 rounded-full mb-2">
                            <span className="text-[10px] font-black text-amber-400 uppercase tracking-widest">Official Record</span>
                        </div>
                        <h2 className="text-3xl font-black text-white/90 uppercase tracking-tighter">Progress Report</h2>
                    </div>
                </div>
            </div>

            {/* ── STATS BAR ── */}
            <div className="bg-gray-50 border-y border-gray-100 px-12 py-3 flex justify-between items-center text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                <div className="flex gap-6">
                    <span>ID: <span className="text-gray-900">{report.id?.slice(0, 8).toUpperCase()}</span></span>
                    <span>Date: <span className="text-gray-900">{today}</span></span>
                </div>
                <div className="flex gap-6">
                    <span>Verify: <span className="text-gray-900">rillcod.com/verify</span></span>
                </div>
            </div>

            <div className="p-12 space-y-10">
                {/* ── PROFILE & PERFORMANCE ── */}
                <div className="grid grid-cols-12 gap-10">
                    {/* Left: Identity */}
                    <div className="col-span-4 space-y-6">
                        <div className="relative group">
                            <div className="w-full aspect-[4/5] bg-gray-50 border-4 border-white rounded-3xl shadow-xl overflow-hidden relative">
                                {report.photo_url ? (
                                    <img src={report.photo_url} alt="Student" className="w-full h-full object-cover" />
                                ) : (
                                    <div className="flex flex-col items-center justify-center h-full text-gray-200">
                                        <UserCheck className="w-16 h-16" />
                                        <span className="text-[8px] font-black uppercase mt-2">No Photo Provided</span>
                                    </div>
                                )}
                            </div>
                            <div className="absolute -bottom-3 -right-3 w-12 h-12 bg-white rounded-2xl shadow-lg flex items-center justify-center border border-gray-50">
                                <Crown className="w-6 h-6 text-amber-500" />
                            </div>
                        </div>

                        <div className="space-y-4">
                            <ReportField label="Student Participant" value={report.student_name ?? '—'} bold />
                            <ReportField label="Enrolled Programme" value={report.course_name ?? '—'} />
                            <ReportField label="Section / Class" value={report.section_class ?? '—'} />
                            <ReportField label="Academic Term" value={report.report_term ?? '—'} />
                        </div>
                    </div>

                    {/* Right: Academic Metrics */}
                    <div className="col-span-8 flex flex-col">
                        <SectionHeaderPremium title="Final Performance Assessment" />
                        <div className="flex-1 mt-6 grid grid-cols-2 gap-8">
                            <div className="space-y-6">
                                <MetricBar label="Theory (40%)" value={theory} color="#6366f1" />
                                <MetricBar label="Practical (40%)" value={practical} color="#10b981" />
                                <MetricBar label="Attendance (20%)" value={attendance} color="#f59e0b" />

                                <div className="grid grid-cols-2 gap-4 mt-8">
                                    <div className="p-3 bg-gray-50 rounded-2xl border border-gray-100">
                                        <p className="text-[8px] font-black text-gray-400 uppercase mb-1">Participation</p>
                                        <p className="text-xs font-bold text-gray-900">{report.participation_grade ?? '—'}</p>
                                    </div>
                                    <div className="p-3 bg-gray-50 rounded-2xl border border-gray-100">
                                        <p className="text-[8px] font-black text-gray-400 uppercase mb-1">Project Output</p>
                                        <p className="text-xs font-bold text-gray-900">{report.projects_grade ?? '—'}</p>
                                    </div>
                                </div>
                            </div>

                            <div className="flex flex-col items-center justify-center bg-[#1a1a2e] rounded-[32px] p-6 text-white relative overflow-hidden group">
                                <div className="absolute inset-0 bg-gradient-to-br from-violet-600/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                                <div className="relative z-10 text-center">
                                    <Sparkles className="w-10 h-10 text-amber-400 mx-auto mb-2 animate-pulse" />
                                    <p className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mb-1">Final Weighted Grade</p>
                                    <h3 className="text-8xl font-black text-white drop-shadow-[0_10px_10px_rgba(0,0,0,0.3)]">{grade.g}</h3>
                                    <div className="mt-4 px-4 py-1.5 bg-white/10 rounded-full border border-white/10">
                                        <span className="text-xs font-black uppercase tracking-widest text-white/80">{grade.label}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ── MILESTONES ── */}
                {milestones.length > 0 && (
                    <div className="relative">
                        <SectionHeaderPremium title="Learning Milestones & Objectives" />
                        <div className="mt-6 grid grid-cols-2 gap-x-12 gap-y-4">
                            {milestones.map((m, i) => (
                                <div key={i} className="flex gap-4 group">
                                    <div className="w-6 h-6 rounded-full bg-violet-600/10 flex items-center justify-center flex-shrink-0 group-hover:bg-violet-600 transition-colors">
                                        <CheckIcon className="w-3.5 h-3.5 text-violet-600 group-hover:text-white transition-colors" />
                                    </div>
                                    <p className="text-[11.5px] leading-relaxed text-gray-600 font-medium">{m}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* ── EVALUATION ── */}
                <div className="grid grid-cols-2 gap-10">
                    <div className="space-y-4">
                        <SectionHeaderPremium title="Core Strengths" />
                        <div className="p-5 bg-emerald-50/50 border border-emerald-100 rounded-3xl min-h-[120px]">
                            <p className="text-[11.5px] leading-relaxed text-emerald-900/80 italic font-medium">
                                "{report.key_strengths || 'The student shows consistent effort and a dedicated approach to theoretical concepts, displaying high focus during complex sessions.'}"
                            </p>
                        </div>
                    </div>
                    <div className="space-y-4">
                        <SectionHeaderPremium title="Growth Focus" />
                        <div className="p-5 bg-amber-50/50 border border-amber-100 rounded-3xl min-h-[120px]">
                            <p className="text-[11.5px] leading-relaxed text-amber-900/80 italic font-medium">
                                "{report.areas_for_growth || 'Further immersion in practical projects will help build implementation confidence and speed in real-world environments.'}"
                            </p>
                        </div>
                    </div>
                </div>

                {/* ── CERTIFICATE CALLOUT ── */}
                {report.has_certificate && (
                    <div className="bg-gradient-to-r from-[#1a1a2e] to-[#252545] rounded-[40px] p-8 text-white relative overflow-hidden text-center shadow-2xl">
                        <div className="absolute top-0 right-0 w-24 h-24 bg-white/5 -mr-12 -mt-12 rounded-full" />
                        <Crown className="w-10 h-10 text-amber-400 mx-auto mb-4" />
                        <h4 className="text-xl font-black uppercase tracking-[0.2em] mb-3">Academic Excellence Award</h4>
                        <p className="text-sm text-white/60 leading-relaxed max-w-2xl mx-auto italic font-medium">
                            {report.certificate_text || `This document officially recognizes that ${report.student_name} has successfully completed with merit the intensive study programme in ${report.course_name}.`}
                        </p>
                    </div>
                )}

                {/* ── SIGNATURES & QR ── */}
                <div className="pt-10 flex items-end justify-between border-t-2 border-gray-100">
                    <div className="space-y-8">
                        <div>
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-10">Signatory Authority</p>
                            <div className="space-y-2">
                                <div className="w-48 h-[1px] bg-gray-900" />
                                <p className="text-xs font-black text-gray-900">{report.instructor_name || 'Class Instructor'}</p>
                                <p className="text-[9px] font-bold text-gray-400 uppercase">Head of Academics, Rillcod</p>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col items-center">
                        <div className="p-3 bg-white border-4 border-gray-50 rounded-[32px] shadow-sm mb-4">
                            <QRCode value={`https://rillcod.com/verify/${report.id?.slice(0, 8)}`} size={80} />
                        </div>
                        <p className="text-[10px] font-black text-gray-900 tracking-[0.3em] uppercase">
                            VERIFY {report.id?.slice(0, 8).toUpperCase()}
                        </p>
                    </div>
                </div>
            </div>

            {/* Footer Design */}
            <div className="absolute bottom-0 inset-x-0 h-2 bg-gradient-to-r from-violet-600 via-indigo-600 to-emerald-500" />
        </div>
    );
}

function SectionHeaderPremium({ title }: { title: string }) {
    return (
        <div className="flex items-center gap-4">
            <h3 className="text-[11px] font-black text-gray-900 uppercase tracking-[0.15em] shrink-0">{title}</h3>
            <div className="h-[2px] w-full bg-gray-50 flex items-center">
                <div className="h-[2px] w-8 bg-violet-600/30" />
            </div>
        </div>
    );
}

function ReportField({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
    return (
        <div>
            <p className="text-[9px] font-black text-gray-300 uppercase tracking-widest mb-0.5">{label}</p>
            <p className={`text-[12px] ${bold ? 'font-black' : 'font-bold'} text-gray-900`}>{value}</p>
        </div>
    );
}

function MetricBar({ label, value, color }: { label: string; value: number; color: string }) {
    return (
        <div className="space-y-1.5">
            <div className="flex justify-between items-end">
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{label}</span>
                <span className="text-xs font-black" style={{ color }}>{value}%</span>
            </div>
            <div className="h-2 w-full bg-gray-50 rounded-full overflow-hidden border border-gray-100">
                <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${value}%`, backgroundColor: color }} />
            </div>
        </div>
    );
}

// ─── Student list sidebar ─────────────────────────────────────
function ResultsPageInner() {
    const searchParams = useSearchParams();
    const prefStudentId = searchParams.get('student');
    const { profile, loading: authLoading } = useAuth();
    const [students, setStudents] = useState<PortalUser[]>([]);
    const [courses, setCourses] = useState<Course[]>([]);
    const [reportsMap, setReportsMap] = useState<Record<string, StudentReport>>({});
    const [orgSettings, setOrgSettings] = useState<ReportSettings | null>(null);
    const [selectedStudent, setSelectedStudent] = useState<PortalUser | null>(null);
    const [selectedReport, setSelectedReport] = useState<StudentReport | null>(null);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');

    const isStaff = profile?.role === 'admin' || profile?.role === 'teacher' || profile?.role === 'school';

    useEffect(() => {
        if (authLoading || !profile) return;
        const db = createClient();

        if (!isStaff) {
            // Student: load own report
            Promise.all([
                db.from('student_progress_reports').select('*').eq('student_id', profile.id).eq('is_published', true).order('created_at', { ascending: false }).limit(1).maybeSingle(),
                db.from('report_settings').select('*').limit(1).maybeSingle(),
            ]).then(([rep, org]) => {
                setSelectedReport(rep.data);
                setOrgSettings(org.data);
                setLoading(false);
            });
            return;
        }

        // Staff: load students + their reports
        const q = db.from('portal_users').select('id, full_name, email, school_name, section_class, school_id, photo_url').eq('role', 'student').eq('is_active', true);
        const query = (profile.role === 'school' && profile.school_id) ? q.eq('school_id', profile.school_id) : q;

        Promise.all([
            query.order('full_name').limit(200),
            db.from('student_progress_reports').select('student_id, overall_grade, is_published, updated_at').order('updated_at', { ascending: false }),
            db.from('report_settings').select('*').limit(1).maybeSingle(),
            db.from('courses').select('*'),
        ]).then(([sRes, rRes, orgRes, cRes]) => {
            setStudents((sRes.data as any as PortalUser[]) ?? []);
            setCourses(cRes.data ?? []);
            const rMap: Record<string, StudentReport> = {};
            (rRes.data ?? []).forEach((r) => { if (r.student_id && !rMap[r.student_id]) rMap[r.student_id] = r as any as StudentReport; });
            setReportsMap(rMap);
            setOrgSettings(orgRes.data);

            if (prefStudentId) {
                const s = (sRes.data ?? []).find(x => x.id === prefStudentId);
                if (s) selectStudent(s as PortalUser);
            }
            setLoading(false);
        });
    }, [profile?.id, authLoading, isStaff, profile?.role, profile?.school_id]);

    async function selectStudent(s: PortalUser) {
        setSelectedStudent(s);
        const { data } = await createClient()
            .from('student_progress_reports')
            .select('*')
            .eq('student_id', s.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
        setSelectedReport(data);
    }

    const filtered = students.filter(s =>
        (s.full_name ?? '').toLowerCase().includes((search ?? '').toLowerCase()) ||
        (s.email ?? '').toLowerCase().includes((search ?? '').toLowerCase())
    );

    if (authLoading || loading) return (
        <div className="min-h-screen bg-[#0f0f1a] flex items-center justify-center">
            <div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
        </div>
    );

    return (
        <div className="min-h-screen bg-[#0f0f1a] text-white">
            {/* Screen UI */}
            <div className="print:hidden max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">

                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <TrophyIcon className="w-5 h-5 text-amber-400" />
                            <span className="text-xs font-bold text-amber-400 uppercase tracking-widest">
                                {isStaff ? 'Academic Results Centre' : 'My Progress Report'}
                            </span>
                        </div>
                        <h1 className="text-3xl font-extrabold">Student Progress Reports</h1>
                        <p className="text-white/40 text-sm mt-1">Rillcod-branded progress reports with performance charts & certificates</p>
                    </div>
                    <div className="flex gap-3">
                        {isStaff && (
                            <Link href="/dashboard/reports/builder"
                                className="inline-flex items-center gap-2 px-4 py-2.5 bg-violet-600/20 border border-violet-500/30 hover:bg-violet-600/30 text-violet-400 font-bold text-sm rounded-xl transition-all">
                                <PencilSquareIcon className="w-4 h-4" /> Create / Edit Report
                            </Link>
                        )}
                        {selectedReport && (
                            <button onClick={() => window.print()}
                                className="inline-flex items-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-500 text-white font-bold text-sm rounded-xl transition-all hover:scale-105 shadow-lg shadow-violet-900/30">
                                <PrinterIcon className="w-4 h-4" /> Print / Save PDF
                            </button>
                        )}
                    </div>
                </div>

                <div className={`${isStaff ? 'grid grid-cols-1 lg:grid-cols-4 gap-6' : ''}`}>

                    {/* Left: student list */}
                    {isStaff && (
                        <div className="lg:col-span-1 space-y-3">
                            <div className="relative">
                                <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                                <input type="text" placeholder="Search students…" value={search} onChange={e => setSearch(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/30 focus:outline-none focus:border-violet-500 transition-colors" />
                            </div>
                            <div className="space-y-1.5 max-h-[75vh] overflow-y-auto pr-1">
                                {filtered.length === 0 && <p className="text-white/30 text-sm py-8 text-center">No students found</p>}
                                {filtered.map((s: any) => {
                                    const r = reportsMap[s.id];
                                    const isActive = selectedStudent?.id === s.id;
                                    return (
                                        <button key={s.id} onClick={() => selectStudent(s)}
                                            className={`w-full text-left p-3 rounded-xl border transition-all ${isActive ? 'bg-violet-600/20 border-violet-500/40' : 'bg-white/5 border-white/10 hover:border-white/20'}`}>
                                            <div className="flex items-center gap-2.5">
                                                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-600 to-blue-600 flex items-center justify-center text-xs font-black text-white flex-shrink-0">
                                                    {s.full_name ? s.full_name[0] : '?'}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-semibold text-white truncate">{s.full_name}</p>
                                                    <p className="text-xs text-white/40 truncate">{s.section_class ?? s.email}</p>
                                                </div>
                                                <div className="flex-shrink-0 text-right">
                                                    {r ? (
                                                        <span className={`text-lg font-black ${r.is_published ? 'text-emerald-400' : 'text-amber-400'}`}>{r.overall_grade ?? '?'}</span>
                                                    ) : (
                                                        <span className="text-xs text-white/20">No report</span>
                                                    )}
                                                </div>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Right: Report preview */}
                    <div className={`${isStaff ? 'lg:col-span-3' : 'w-full'}`}>
                        {selectedReport ? (
                            <div className="border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
                                <div className="bg-white/5 border-b border-white/10 px-5 py-3 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <DocumentTextIcon className="w-4 h-4 text-violet-400" />
                                        <span className="text-sm font-semibold text-white">{selectedReport.student_name ?? 'Student'}</span>
                                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${selectedReport.is_published ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
                                            {selectedReport.is_published ? 'Published' : 'Draft'}
                                        </span>
                                    </div>
                                    {isStaff && selectedStudent && (
                                        <Link href={`/dashboard/reports/builder?student=${selectedStudent.id}`}
                                            className="text-xs text-violet-400 hover:text-violet-300 font-semibold underline underline-offset-2">
                                            Edit Report
                                        </Link>
                                    )}
                                </div>
                                {/* Report preview — scales down on screen */}
                                <div className="overflow-auto bg-white" style={{ maxHeight: '75vh' }}>
                                    <div style={{ transform: 'scale(0.72)', transformOrigin: 'top left', width: '138.9%' }}>
                                        <ReportCard report={selectedReport} orgSettings={orgSettings} />
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center min-h-[400px] bg-white/5 border border-white/10 rounded-2xl">
                                {isStaff ? (
                                    <>
                                        <AcademicCapIcon className="w-14 h-14 text-white/10 mb-3" />
                                        <p className="text-white/30 text-sm">Select a student to view their report</p>
                                        <Link href="/dashboard/reports/builder"
                                            className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 bg-violet-600/20 text-violet-400 text-sm font-bold rounded-xl border border-violet-500/30 hover:bg-violet-600/30 transition-colors">
                                            <PencilSquareIcon className="w-4 h-4" /> Create First Report
                                        </Link>
                                    </>
                                ) : (
                                    <>
                                        <TrophyIcon className="w-14 h-14 text-white/10 mb-3" />
                                        <p className="text-white/30 text-sm font-semibold">No report available yet</p>
                                        <p className="text-white/20 text-xs mt-1">Your teacher will publish your progress report here</p>
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* ── PRINT VIEW — full page, no navbar ── */}
            {selectedReport && (
                <div className="hidden print:block">
                    <ReportCard report={selectedReport} orgSettings={orgSettings} />
                </div>
            )}
        </div>
    );
}

export default function ResultsPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-[#0f0f1a] flex items-center justify-center">
                <div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
            </div>
        }>
            <ResultsPageInner />
        </Suspense>
    );
}
