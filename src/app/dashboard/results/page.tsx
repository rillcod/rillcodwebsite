'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
    PrinterIcon, AcademicCapIcon, MagnifyingGlassIcon,
    TrophyIcon, DocumentTextIcon, UserGroupIcon, PencilSquareIcon, StarIcon,
    CheckIcon, ArrowDownTrayIcon
} from '@heroicons/react/24/solid';
import { Crown, Target, Sparkles, User, UserCheck, FileDown } from 'lucide-react';
import QRCode from 'react-qr-code';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { Database } from '@/types/supabase';
import ReportCard from '@/components/reports/ReportCard';

type StudentReport = Database['public']['Tables']['student_progress_reports']['Row'];
type PortalUser = Database['public']['Tables']['portal_users']['Row'];
type Course = Database['public']['Tables']['courses']['Row'];
type ReportSettings = Database['public']['Tables']['report_settings']['Row'];

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

// ─── Student list sidebar ─────────────────────────────────────
function ResultsPageInner() {
    const searchParams = useSearchParams();
    const prefStudentId = searchParams.get('student');
    const { profile, loading: authLoading } = useAuth();
    const [students, setStudents] = useState<any[]>([]);
    const [courses, setCourses] = useState<Course[]>([]);
    const [reportsMap, setReportsMap] = useState<Record<string, any>>({});
    const [orgSettings, setOrgSettings] = useState<ReportSettings | null>(null);
    const [selectedStudent, setSelectedStudent] = useState<any | null>(null);
    const [selectedReport, setSelectedReport] = useState<StudentReport | null>(null);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
    const pdfRef = useRef<HTMLDivElement>(null);

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
        const q = db.from('portal_users').select('id, full_name, email, school_name, section_class, school_id, profile_image_url').eq('role', 'student');
        const query = (profile.role === 'school' && profile.school_id) ? q.eq('school_id', profile.school_id) : q;

        Promise.all([
            query.order('full_name').limit(200),
            db.from('student_progress_reports').select('student_id, overall_grade, is_published, updated_at'),
            db.from('report_settings').select('*').limit(1).maybeSingle(),
            db.from('courses').select('*'),
        ]).then(([sRes, rRes, orgRes, cRes]) => {
            if (sRes.error) console.error("Students fetch error:", sRes.error);
            if (rRes.error) console.error("Reports fetch error:", rRes.error);
            if (orgRes.error) console.error("Org fetch error:", orgRes.error);
            if (cRes.error) console.error("Courses fetch error:", cRes.error);

            setStudents(sRes.data ?? []);
            setCourses(cRes.data ?? []);
            const rMap: Record<string, any> = {};
            (rRes.data ?? []).forEach((r) => {
                if (r.student_id && !rMap[r.student_id]) rMap[r.student_id] = r;
            });
            setReportsMap(rMap);
            setOrgSettings(orgRes.data);

            if (prefStudentId && sRes.data) {
                const s = sRes.data.find((x: any) => x.id === prefStudentId);
                if (s) selectStudent(s as PortalUser);
            }
        }).catch(err => {
            console.error("Results module Promise.all error:", err);
        }).finally(() => {
            setLoading(false);
        });
    }, [profile?.id, authLoading, isStaff, profile?.role, profile?.school_id, prefStudentId]);

    async function selectStudent(s: PortalUser) {
        setSelectedStudent(s);
        const { data } = await createClient()
            .from('student_progress_reports')
            .select('*')
            .eq('student_id', s.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
        setSelectedReport(data as StudentReport | null);
    }

    const filtered = students.filter(s =>
        (s.full_name ?? '').toLowerCase().includes((search ?? '').toLowerCase()) ||
        (s.email ?? '').toLowerCase().includes((search ?? '').toLowerCase())
    );

    async function downloadPDF() {
        const element = pdfRef.current;
        if (!element) return;

        setIsGeneratingPdf(true);
        try {
            const canvas = await html2canvas(element, {
                scale: 2,
                useCORS: true,
                logging: false,
                backgroundColor: '#ffffff',
                windowWidth: 794, // 210mm at 96dpi
                windowHeight: 1123 // 297mm at 96dpi
            });
            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: 'a4'
            });

            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = pdf.internal.pageSize.getHeight();

            pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
            pdf.save(`Report_${selectedReport?.student_name?.replace(/\s+/g, '_')}_${new Date().toLocaleDateString()}.pdf`);
        } catch (err) {
            console.error('PDF generation failed:', err);
            alert('Failed to generate PDF. Please try using the Print option.');
        } finally {
            setIsGeneratingPdf(false);
        }
    }

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
                            <div className="flex gap-2">
                                <button onClick={() => window.print()}
                                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-white/5 border border-white/10 hover:bg-white/10 text-white font-bold text-sm rounded-xl transition-all">
                                    <PrinterIcon className="w-4 h-4" /> Print
                                </button>
                                <button onClick={downloadPDF} disabled={isGeneratingPdf}
                                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-sm rounded-xl transition-all hover:scale-105 shadow-lg shadow-violet-900/30">
                                    {isGeneratingPdf ? (
                                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                    ) : (
                                        <FileDown className="w-4 h-4" />
                                    )}
                                    {isGeneratingPdf ? 'Generating...' : 'Download PDF'}
                                </button>
                            </div>
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
                                {/* Report preview — horizontally scrollable on small screens */}
                                <div className="overflow-auto bg-gray-100 p-2 sm:p-6 lg:p-8" style={{ maxHeight: '70vh' }}>
                                    <div className="flex justify-center min-w-max">
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
                <div className="hidden print:block print:w-[794px] print:mx-auto">
                    <ReportCard report={selectedReport} orgSettings={orgSettings} />
                </div>
            )}

            {/* ── HIDDEN PDF CAPTURE DIV ── */}
            <div className="fixed top-0 left-0 w-0 h-0 overflow-hidden pointer-events-none opacity-0">
                <div ref={pdfRef} className="w-[794px] h-[1123px] bg-white text-black">
                    {selectedReport && <ReportCard report={selectedReport} orgSettings={orgSettings} />}
                </div>
            </div>
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
