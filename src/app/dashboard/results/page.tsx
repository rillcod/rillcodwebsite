// @refresh reset
'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
    PrinterIcon, AcademicCapIcon, MagnifyingGlassIcon,
    TrophyIcon, DocumentTextIcon, PencilSquareIcon, CheckCircleIcon,
    ArrowDownTrayIcon, ArrowLeftIcon, ArrowRightIcon, CheckIcon,
    TrashIcon, XMarkIcon
} from '@/lib/icons';

function WhatsAppIcon({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
            <path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.558 4.122 1.533 5.849L.057 23.852a.5.5 0 0 0 .611.611l6.003-1.476A11.952 11.952 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.89 0-3.663-.523-5.176-1.432l-.372-.22-3.849.946.964-3.849-.24-.381A9.953 9.953 0 0 1 2 12C2 6.478 6.478 2 12 2s10 4.478 10 10-4.478 10-10 10z"/>
        </svg>
    );
}



import ReportCard from '@/components/reports/ReportCard';
import ModernReportCard from '@/components/reports/ModernReportCard';
import PrintableReport from '@/components/reports/PrintableReport';
import { ScaledReportCard, generateReportPDF, shareReportCard } from '@/lib/pdf-utils';
import { Database } from '@/types/supabase';
import { cn } from '@/lib/utils';

type StudentReport = Database['public']['Tables']['student_progress_reports']['Row'] & {
  template_id?: string | null;
};
type PortalUser = Database['public']['Tables']['portal_users']['Row'];
type OrgSettings = Database['public']['Tables']['report_settings']['Row'];

function GradeDistribution({ students, reportsMap }: { students: PortalUser[], reportsMap: Record<string, any> }) {
    const counts = { A: 0, B: 0, C: 0, D: 0, F: 0, none: 0 };
    students.forEach(s => {
        const r = reportsMap[s.id];
        if (r?.overall_grade) {
            const gradeChar = r.overall_grade[0].toUpperCase();
            if (gradeChar === 'A') counts.A++;
            else if (gradeChar === 'B') counts.B++;
            else if (gradeChar === 'C') counts.C++;
            else if (gradeChar === 'D') counts.D++;
            else if (gradeChar === 'F') counts.F++;
            else counts.F++; 
        } else {
            counts.none++;
        }
    });

    const max = Math.max(...Object.values(counts).slice(0, 5), 1);
    const totalWithGrades = students.length - counts.none;

    return (
        <div className="bg-[#111113] border border-white/[0.05] p-5 shadow-2xl overflow-hidden relative group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 blur-[60px] rounded-full pointer-events-none" />
            
            <div className="flex items-center justify-between mb-6">
                <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-primary italic leading-none mb-1.5">Cohort Distribution</p>
                </div>
            </div>

            <div className="flex items-end gap-3 h-28 mb-4">
                {(['A', 'B', 'C', 'D', 'F'] as const).map(g => {
                    const count = counts[g];
                    const h = totalWithGrades > 0 ? (count / max) * 100 : 0;
                    const colors = { 
                        A: 'from-primary/80 to-primary/40', 
                        B: 'from-blue-600/80 to-blue-400/40', 
                        C: 'from-amber-600/80 to-amber-400/40', 
                        D: 'from-indigo-600/80 to-indigo-400/40', 
                        F: 'from-rose-600/80 to-rose-400/40' 
                    };
                    return (
                        <div key={g} className="flex-1 flex flex-col items-center gap-3 group/bar">
                            <div className="w-full bg-white/[0.02] border border-white/[0.05] flex flex-col justify-end h-full relative overflow-hidden">
                                {count > 0 && (
                                    <div 
                                        className={`w-full bg-gradient-to-t ${colors[g]} transition-all duration-700 ease-out relative`} 
                                        style={{ height: `${h}%` }}
                                    >
                                        <div className="absolute top-0 inset-x-0 h-px bg-white/20" />
                                    </div>
                                )}
                            </div>
                            <div className="text-center space-y-0.5">
                                <span className="block text-[10px] font-black text-slate-300">{g}</span>
                                <span className="block text-[9px] font-bold text-slate-500">{count}</span>
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className="pt-4 border-t border-white/[0.05] flex items-center justify-between">
                <span className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em]">{totalWithGrades} DATA POINTS ANALYZED</span>
                <div className="flex -space-x-1.5">
                    {[1,2,3].map(i => (
                        <div key={i} className="w-4 h-4 rounded-full border border-[#111113] bg-slate-800" />
                    ))}
                </div>
            </div>
        </div>
    );
}

// ─── Inner component ───────────────────────────────────────────────────────────
function ResultsPageInner() {
    const searchParams = useSearchParams();
    const prefStudentId = searchParams.get('student');
    const { profile, loading: authLoading } = useAuth();

    // ── Core data ──────────────────────────────────────────────────────────────
    const [students, setStudents] = useState<PortalUser[]>([]);
    const [reportsMap, setReportsMap] = useState<Record<string, any>>({});
    const [orgSettings, setOrgSettings] = useState<OrgSettings | null>(null);
    const [loading, setLoading] = useState(true);

    // ── Selection / view ───────────────────────────────────────────────────────
    const [selectedStudent, setSelectedStudent] = useState<PortalUser | null>(null);
    const [selectedReport, setSelectedReport] = useState<StudentReport | null>(null);
    const [loadingReport, setLoadingReport] = useState(false);
    const [template, setTemplate] = useState<'standard' | 'modern'>('modern');
    const [modernTemplateId, setModernTemplateId] = useState<'industrial' | 'executive' | 'futuristic'>('industrial');

    // ── Filters ────────────────────────────────────────────────────────────────
    const [search, setSearch] = useState('');
    const [filterSchool, setFilterSchool] = useState('');
    const [filterClass, setFilterClass] = useState('');
    const [filterStatus, setFilterStatus] = useState<'all' | 'published' | 'draft' | 'none'>('all');

    // ── Multi-select ───────────────────────────────────────────────────────────
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    // ── Edit / Delete state ────────────────────────────────────────────────────
    const [showEditModal, setShowEditModal] = useState(false);
    const [editCourseName, setEditCourseName] = useState('');
    const [editTerm, setEditTerm] = useState('');
    const [isSavingEdit, setIsSavingEdit] = useState(false);
    const [isDeletingReport, setIsDeletingReport] = useState(false);

    // ── PDF state ──────────────────────────────────────────────────────────────
    const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
    const [isSharingPdf, setIsSharingPdf] = useState(false);
    const [isBatchDownloading, setIsBatchDownloading] = useState(false);
    const [batchProgress, setBatchProgress] = useState<{ current: number; total: number } | null>(null);
    const [captureReport, setCaptureReport] = useState<StudentReport | null>(null);

    const pdfRef = useRef<HTMLDivElement>(null);  // single-student capture (legacy/standard)
    const printableRef = useRef<HTMLDivElement>(null); // modern capture
    const captureRef = useRef<HTMLDivElement>(null);  // batch capture
    const captureQueue = useRef<StudentReport[]>([]);
    const captureIdx = useRef<number>(0);
    const [showSidebar, setShowSidebar] = useState(true);

    const isStaff = profile?.role === 'admin' || profile?.role === 'teacher' || profile?.role === 'school';
    // School partners can VIEW and PRINT but cannot create or edit reports
    const isEditor = profile?.role === 'admin' || profile?.role === 'teacher';

    // ── Data loading ───────────────────────────────────────────────────────────
    useEffect(() => {
        if (authLoading || !profile) return;

        // Reset stale state immediately so the UI shows spinner, not cached data
        setStudents([]);
        setReportsMap({});
        setSelectedStudent(null);
        setSelectedReport(null);
        setLoading(true);

        let aborted = false;
        const db = createClient();

        if (!isStaff) {
            // Student: load own latest published report.
            // Primary: match by student_id (portal_user UUID).
            // Fallback: some reports were created before the student had a portal account
            // and have student_id = null — match by student_name in that case.
            (async () => {
                const [repRes, orgRes] = await Promise.all([
                    db.from('student_progress_reports')
                        .select('*')
                        .eq('student_id', profile.id)
                        .eq('is_published', true)
                        .order('updated_at', { ascending: false })
                        .limit(1)
                        .maybeSingle(),
                    db.from('report_settings').select('*').limit(1).maybeSingle(),
                ]);
                if (aborted) return;

                let report = repRes.data as StudentReport | null;

                // Fallback: pre-portal report created before portal account existed
                if (!report && profile.full_name) {
                    const { data: fallback } = await db
                        .from('student_progress_reports')
                        .select('*')
                        .is('student_id', null)
                        .eq('student_name', profile.full_name)
                        .eq('is_published', true)
                        .order('updated_at', { ascending: false })
                        .limit(1)
                        .maybeSingle();
                    if (!aborted) report = fallback as StudentReport | null;
                }

                if (!aborted) {
                    setSelectedReport(report);
                    setOrgSettings(orgRes.data);
                    setLoading(false);
                }
            })();
            return () => { aborted = true; };
        }

        async function loadStaffData() {
            // 1. Determine school scope
            const isAdmin = profile?.role === 'admin';
            const isSchoolRole = profile?.role === 'school';
            let assignedSchoolIds: string[] = [];
            let assignedSchoolNames: string[] = [];
            let teacherClassIds: string[] = [];

            if (!isAdmin) {
                if (isSchoolRole) {
                    // School partner: use profile directly — no API call needed
                    if (profile?.school_id) assignedSchoolIds = [profile.school_id];
                    if (profile?.school_name) assignedSchoolNames = [profile.school_name];
                } else {
                    // Teacher: fetch assigned schools via API + class-based lookup
                    const [schRes, classRes] = await Promise.all([
                        fetch('/api/schools', { cache: 'no-store' }),
                        db.from('classes').select('id, school_id').eq('teacher_id', profile!.id),
                    ]);

                    if (schRes.ok) {
                        const schJson = await schRes.json();
                        const schools = schJson.data ?? [];
                        assignedSchoolIds = schools.map((s: any) => s.id).filter(Boolean);
                        assignedSchoolNames = schools.map((s: any) => s.name).filter(Boolean);
                    }

                    // Get class IDs teacher directly teaches — catches students via class_id
                    teacherClassIds = (classRes.data ?? []).map((c: any) => c.id).filter(Boolean);

                    // Pull school_ids from teacher's own classes (supplements API)
                    (classRes.data ?? []).forEach((c: any) => {
                        if (c.school_id && !assignedSchoolIds.includes(c.school_id))
                            assignedSchoolIds.push(c.school_id);
                    });

                    // Profile school as direct text fallback
                    if (profile?.school_id && !assignedSchoolIds.includes(profile.school_id))
                        assignedSchoolIds.push(profile.school_id);
                    if (profile?.school_name && !assignedSchoolNames.includes(profile.school_name))
                        assignedSchoolNames.push(profile.school_name);
                }
            }

            // 2. Build student query — join classes + schools for proper display names
            let finalQuery = db.from('portal_users')
                .select('id, full_name, email, school_name, section_class, school_id, profile_image_url, class_id, classes:class_id(id, name), schools:school_id(id, name)')
                .neq('is_deleted', true);

            if (!isAdmin) {
                finalQuery = finalQuery.eq('role', 'student');
                const parts: string[] = [];
                
                // DATA SCOPE: Ensure strictly their own school's records
                if (isSchoolRole && profile?.school_id) {
                    finalQuery = finalQuery.eq('school_id', profile.school_id);
                } else if (!isAdmin) {
                    // Teacher or other staff: scope by assigned schools or classes
                    if (assignedSchoolIds.length > 0)
                        parts.push(`school_id.in.(${assignedSchoolIds.join(',')})`);
                    assignedSchoolNames.forEach(n =>
                        parts.push(`school_name.eq.${JSON.stringify(n)}`)
                    );
                    if (teacherClassIds.length > 0)
                        parts.push(`class_id.in.(${teacherClassIds.join(',')})`);

                    if (parts.length > 0) {
                        finalQuery = finalQuery.or(parts.join(','));
                    } else {
                        finalQuery = finalQuery.eq('id', '00000000-0000-0000-0000-000000000000');
                    }
                }
            }

            const [sRes, orgRes] = await Promise.all([
                finalQuery.order('full_name').limit(isAdmin ? 10000 : 400),
                db.from('report_settings').select('*').limit(1).maybeSingle(),
            ]);

            if (sRes.error) throw sRes.error;
            if (aborted) return;

            const studs = (sRes.data ?? []) as unknown as PortalUser[];
            setStudents(studs);
            setOrgSettings(orgRes.data);

            const studentIds = studs.map(s => s.id);
            const rMap: Record<string, any> = {};
            if (studentIds.length > 0) {
                const { data: reports } = await db.from('student_progress_reports')
                    .select('student_id, overall_grade, is_published, updated_at')
                    .in('student_id', studentIds)
                    .order('is_published', { ascending: false })
                    .order('updated_at', { ascending: false });

                if (aborted) return;
                (reports ?? []).forEach(r => {
                    // Latest report for each student (since they are ordered by updated_at desc)
                    if (r.student_id && !rMap[r.student_id]) rMap[r.student_id] = r;
                });
            }

            setReportsMap(rMap);

            if (prefStudentId) {
                const s = studs.find(x => x.id === prefStudentId);
                if (s && !aborted) loadStudentReport(s);
            }
            if (!aborted) setLoading(false);
        }

        loadStaffData().catch(() => { if (!aborted) setLoading(false); });
        return () => { aborted = true; };
    }, [profile?.id, authLoading]); // eslint-disable-line

    // ── Load single student report ─────────────────────────────────────────────
    async function loadStudentReport(s: PortalUser) {
        setSelectedStudent(s);
        setLoadingReport(true);
        setSelectedReport(null);
        // On mobile, auto-hide sidebar when student is selected
        if (typeof window !== 'undefined' && window.innerWidth < 1024) {
            setShowSidebar(false);
        }
        const { data } = await createClient()
            .from('student_progress_reports')
            .select('*')
            .eq('student_id', s.id)
            .order('is_published', { ascending: false })
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle();
        setSelectedReport(data as StudentReport | null);
        setLoadingReport(false);
    }

    // ── Derived data ───────────────────────────────────────────────────────────
    // Helpers: prefer joined FK name over legacy text fields
    const studentClassName = (s: any): string => s.classes?.name ?? s.section_class ?? '';
    const studentSchoolName = (s: any): string => s.schools?.name ?? s.school_name ?? '';

    const distinctSchools = [...new Set(
        students.map(s => studentSchoolName(s)).filter(Boolean)
    )].sort() as string[];

    const distinctClasses = [...new Set(
        students.map(s => studentClassName(s)).filter(Boolean)
    )].sort() as string[];

    const filtered = students.filter(s => {
        const matchSearch = !search
            || (s.full_name ?? '').toLowerCase().includes(search.toLowerCase())
            || (s.email ?? '').toLowerCase().includes(search.toLowerCase());
        const matchSchool = !filterSchool || studentSchoolName(s) === filterSchool;
        const matchClass = !filterClass || studentClassName(s) === filterClass;
        const r = reportsMap[s.id];
        const matchStatus =
            filterStatus === 'all' ? true :
                filterStatus === 'published' ? r?.is_published === true :
                    filterStatus === 'draft' ? (r && r.is_published === false) :
            /* none */ !r;
        return matchSearch && matchSchool && matchClass && matchStatus;
    });

    const stats = {
        total: filtered.length,
        published: filtered.filter(s => reportsMap[s.id]?.is_published === true).length,
        draft: filtered.filter(s => reportsMap[s.id] && reportsMap[s.id].is_published === false).length,
        none: filtered.filter(s => !reportsMap[s.id]).length,
    };

    const currentIdx = selectedStudent
        ? filtered.findIndex(s => s.id === selectedStudent.id)
        : -1;

    // Merge student portal data as fallback for missing report fields
    const reportToDisplay: StudentReport | null = selectedReport
        ? {
            ...selectedReport,
            template_id: modernTemplateId,
            student_name: selectedReport.student_name || selectedStudent?.full_name || null,
            school_name: selectedReport.school_name || (selectedStudent ? studentSchoolName(selectedStudent) : null) || null,
            section_class: selectedReport.section_class || (selectedStudent ? studentClassName(selectedStudent) : null) || null,
          }
        : null;

    const downloadSinglePDF = async () => {
        if (!reportToDisplay) return;
        setIsDownloadingPdf(true);
        try {
            const fileName = `${reportToDisplay.student_name || 'Student'}_Report_${reportToDisplay.report_term || ''}.pdf`.replace(/\s+/g, '_');
            
            // We capture the HIDDEN printable component instead of the responsive screen component
            const captureArea = printableRef.current;
            if (!captureArea) throw new Error("Printable area not found");
            
            await generateReportPDF(captureArea, fileName);
        } catch (err) {
            console.error('PDF Error:', err);
            alert('Could not generate PDF. Please try again.');
        } finally {
            setIsDownloadingPdf(false);
        }
    };

    // ── Multi-select ───────────────────────────────────────────────────────────
    function toggleSelectAll() {
        if (selectedIds.size === filtered.length && filtered.length > 0) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(filtered.map(s => s.id)));
        }
    }

    function toggleSelect(id: string, e: React.MouseEvent) {
        e.stopPropagation();
        setSelectedIds(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    }

    // ── Single PDF ─────────────────────────────────────────────────────────────
    // async function downloadSinglePDF() {
    //     if (!pdfRef.current || !selectedReport) return;
    //     setIsDownloadingPdf(true);
    //     try {
    //         const name = (selectedReport.student_name ?? 'Student').replace(/\s+/g, '_');
    //         await generateReportPDF(pdfRef.current, `Report_${name}.pdf`);
    //     } catch (err) {
    //         console.error('PDF failed:', err);
    //         alert('PDF failed. Try Print → Save as PDF instead.');
    //     } finally {
    //         setIsDownloadingPdf(false);
    //     }
    // }

    // ── Batch PDF ──────────────────────────────────────────────────────────────
    async function startBatchDownload() {
        const ids = [...selectedIds];
        if (ids.length === 0) return;
        setIsBatchDownloading(true);

        const { data: reports } = await createClient()
            .from('student_progress_reports')
            .select('*')
            .in('student_id', ids)
            .order('updated_at', { ascending: false });

        if (!reports || reports.length === 0) {
            setIsBatchDownloading(false);
            alert('No reports found for the selected students.');
            return;
        }

        // Dedupe: keep latest per student
        const seen = new Set<string>();
        const queue: StudentReport[] = [];
        for (const r of reports) {
            if (!seen.has(r.student_id)) {
                seen.add(r.student_id);
                queue.push(r as StudentReport);
            }
        }

        captureQueue.current = queue;
        captureIdx.current = 0;
        setBatchProgress({ current: 0, total: queue.length });
        setCaptureReport(queue[0]);
    }

    // ── Batch capture effect ───────────────────────────────────────────────────
    // After each setCaptureReport(), React re-renders the capture div,
    // then this effect fires after paint — we capture and advance the queue.
    useEffect(() => {
        if (!captureReport || !captureRef.current) return;

        let cancelled = false;
        const timer = setTimeout(async () => {
            if (cancelled || !captureRef.current) return;

            const idx = captureIdx.current;
            const total = captureQueue.current.length;
            setBatchProgress({ current: idx + 1, total });

            try {
                const name = (captureReport.student_name ?? 'Student').replace(/\s+/g, '_');
                await generateReportPDF(captureRef.current, `Report_${name}.pdf`);
            } catch (err) {
                console.error('PDF failed for:', captureReport.student_name, err);
            }

            if (cancelled) return;

            const next = idx + 1;
            captureIdx.current = next;

            if (next < captureQueue.current.length) {
                setCaptureReport(captureQueue.current[next]);
            } else {
                // Batch done
                setCaptureReport(null);
                setIsBatchDownloading(false);
                setBatchProgress(null);
                setSelectedIds(new Set());
            }
        }, 450); // wait for DOM paint

        return () => { cancelled = true; clearTimeout(timer); };
    }, [captureReport]);

    // ── Navigate prev/next ─────────────────────────────────────────────────────
    async function navigateTo(idx: number) {
        if (idx < 0 || idx >= filtered.length) return;
        await loadStudentReport(filtered[idx]);
    }

    // ── Delete report ──────────────────────────────────────────────────────────
    async function handleDeleteReport() {
        if (!selectedReport) return;
        if (!confirm(`Delete this report for ${selectedReport.student_name ?? 'this student'}? This cannot be undone.`)) return;
        setIsDeletingReport(true);
        try {
            const res = await fetch(`/api/progress-reports/${selectedReport.id}`, { method: 'DELETE' });
            if (!res.ok) {
                const j = await res.json().catch(() => ({}));
                alert(j.error ?? 'Failed to delete report.');
                return;
            }
            // Remove from local map and clear selected
            if (selectedStudent) {
                setReportsMap(prev => {
                    const next = { ...prev };
                    delete next[selectedStudent.id];
                    return next;
                });
            }
            setSelectedReport(null);
        } finally {
            setIsDeletingReport(false);
        }
    }

    // ── Patch report (rename course / term) ────────────────────────────────────
    async function handleSaveEdit() {
        if (!selectedReport) return;
        setIsSavingEdit(true);
        try {
            const res = await fetch(`/api/progress-reports/${selectedReport.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ course_name: editCourseName.trim(), report_term: editTerm.trim() }),
            });
            if (!res.ok) {
                const j = await res.json().catch(() => ({}));
                alert(j.error ?? 'Failed to save changes.');
                return;
            }
            const updated = { ...selectedReport, course_name: editCourseName.trim(), report_term: editTerm.trim() };
            setSelectedReport(updated as StudentReport);
            setShowEditModal(false);
        } finally {
            setIsSavingEdit(false);
        }
    }

    // ── Print group performance datasheet ─────────────────────────────────────
    async function handlePrintPerformanceSheet() {
        const db2 = createClient();
        const studentsToSheet = filtered.length > 0 ? filtered : students;
        if (studentsToSheet.length === 0) { alert('No students to print.'); return; }

        // Fetch full reports for these students
        const ids = studentsToSheet.map(s => s.id);
        const { data: allReports } = await db2
            .from('student_progress_reports')
            .select('student_id, course_name, report_term, theory_score, practical_score, attendance_score, overall_score, overall_grade, is_published, instructor_name')
            .in('student_id', ids)
            .order('is_published', { ascending: false })
            .order('updated_at', { ascending: false });

        // Latest report per student
        const fullRMap: Record<string, any> = {};
        (allReports ?? []).forEach(r => { if (!fullRMap[r.student_id]) fullRMap[r.student_id] = r; });

        const org = orgSettings;
        const titleLine = [filterClass, filterSchool].filter(Boolean).join(' — ');
        const docRef = `RPT-${Date.now().toString(36).toUpperCase()}`;
        const now = new Date();
        const dateStr = now.toLocaleDateString('en-NG', { year: 'numeric', month: 'long', day: 'numeric' });

        const gradeColor = (g: string | null | undefined) => {
            if (!g) return '#6b7280';
            const c = g[0].toUpperCase();
            if (c === 'A') return '#10b981';
            if (c === 'B') return '#3b82f6';
            if (c === 'C') return '#f59e0b';
            if (c === 'D') return '#8b5cf6';
            return '#ef4444';
        };

        const rows = studentsToSheet.map((s, i) => {
            const r = fullRMap[s.id];
            const cls = studentClassName(s) || '—';
            const sch = studentSchoolName(s) || '—';
            const hasTh = r?.theory_score != null;
            const hasPr = r?.practical_score != null;
            const hasAt = r?.attendance_score != null;
            const gColor = gradeColor(r?.overall_grade);
            return `<tr style="border-bottom:1px solid #e5e7eb">
                <td style="padding:5px 6px;text-align:center;font-size:11px;color:#6b7280">${i + 1}</td>
                <td style="padding:5px 6px;font-size:12px;font-weight:600;color:#111827">${s.full_name ?? '—'}</td>
                <td style="padding:5px 6px;font-size:11px;color:#374151">${cls}</td>
                <td style="padding:5px 6px;font-size:11px;color:#374151">${sch}</td>
                <td style="padding:5px 6px;font-size:11px;text-align:center;color:#374151">${r?.course_name ?? '—'}</td>
                <td style="padding:5px 6px;font-size:11px;text-align:center">${hasTh ? r.theory_score : '—'}</td>
                <td style="padding:5px 6px;font-size:11px;text-align:center">${hasPr ? r.practical_score : '—'}</td>
                <td style="padding:5px 6px;font-size:11px;text-align:center">${hasAt ? r.attendance_score : '—'}</td>
                <td style="padding:5px 6px;font-size:11px;text-align:center;font-weight:700;color:#111827">${r?.overall_score ?? '—'}</td>
                <td style="padding:5px 6px;text-align:center"><span style="display:inline-block;padding:2px 10px;border-radius:20px;font-weight:800;font-size:12px;color:white;background:${gColor}">${r?.overall_grade ?? 'N/A'}</span></td>
                <td style="padding:5px 6px;text-align:center;font-size:10px;color:${r?.is_published ? '#10b981' : r ? '#f59e0b' : '#9ca3af'}">${r?.is_published ? '✓ Published' : r ? 'Draft' : 'No Report'}</td>
            </tr>`;
        }).join('');

        const statsLine = `Total: ${studentsToSheet.length} | Published: ${studentsToSheet.filter(s => fullRMap[s.id]?.is_published).length} | Draft: ${studentsToSheet.filter(s => fullRMap[s.id] && !fullRMap[s.id].is_published).length} | No Report: ${studentsToSheet.filter(s => !fullRMap[s.id]).length}`;

        const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
<title>Student Performance Sheet — ${titleLine || 'All Students'}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',Arial,sans-serif;background:#fff;color:#111;padding:20px}
@page{size:A4 landscape;margin:14mm 12mm}
@media print{body{padding:0}}
.header{display:flex;align-items:flex-start;justify-content:space-between;border-bottom:3px solid #7c3aed;padding-bottom:14px;margin-bottom:16px}
.logo-block{display:flex;align-items:center;gap:12px}
.logo-circle{width:48px;height:48px;border-radius:50%;background:linear-gradient(135deg,#7c3aed,#4f46e5);display:flex;align-items:center;justify-content:center;color:white;font-weight:900;font-size:18px;letter-spacing:-1px}
.org-name{font-size:20px;font-weight:900;color:#7c3aed;letter-spacing:-0.5px}
.org-sub{font-size:10px;color:#6b7280;margin-top:2px}
.doc-meta{text-align:right;font-size:10px;color:#6b7280;line-height:1.6}
.doc-meta strong{color:#374151}
.title-row{background:linear-gradient(135deg,#7c3aed11,#4f46e511);border:1px solid #7c3aed33;border-radius:8px;padding:10px 16px;margin-bottom:14px;display:flex;align-items:center;justify-content:space-between}
.title-main{font-size:15px;font-weight:900;color:#4c1d95;letter-spacing:-0.3px}
.title-sub{font-size:10px;color:#7c3aed;margin-top:2px}
.stats-bar{font-size:10px;color:#374151;background:#f3f4f6;border-radius:6px;padding:4px 12px;white-space:nowrap}
table{width:100%;border-collapse:collapse;font-size:12px}
thead tr{background:#4c1d95;color:white}
thead th{padding:7px 6px;text-align:left;font-size:10px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase}
thead th:nth-child(1),thead th:nth-child(6),thead th:nth-child(7),thead th:nth-child(8),thead th:nth-child(9),thead th:nth-child(10),thead th:nth-child(11){text-align:center}
tbody tr:nth-child(even){background:#f9fafb}
tbody tr:hover{background:#f3f4f6}
.footer{margin-top:24px;border-top:1px solid #e5e7eb;padding-top:14px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:20px}
.sig-box{text-align:center}
.sig-line{border-bottom:1px solid #374151;height:36px;margin-bottom:6px}
.sig-label{font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px}
.watermark{text-align:center;margin-top:16px;font-size:9px;color:#9ca3af}
</style></head><body>
<div class="header">
  <div class="logo-block">
    <div class="logo-circle">R</div>
    <div>
      <div class="org-name">${org?.org_name ?? 'Rillcod Technologies'}</div>
      <div class="org-sub">${org?.org_address ?? 'Technology &amp; Innovation in Education'}</div>
    </div>
  </div>
  <div class="doc-meta">
    <div><strong>Document Ref:</strong> ${docRef}</div>
    <div><strong>Generated:</strong> ${dateStr}</div>
    <div><strong>Generated by:</strong> ${profile?.full_name ?? 'Staff'}</div>
    <div><strong>Classification:</strong> Official — Confidential</div>
  </div>
</div>
<div class="title-row">
  <div>
    <div class="title-main">Student Performance &amp; Score Sheet${titleLine ? ' — ' + titleLine : ''}</div>
    <div class="title-sub">Academic Progress Report Summary · ${org?.org_name ?? 'Rillcod Technologies'}</div>
  </div>
  <div class="stats-bar">${statsLine}</div>
</div>
<table>
<thead><tr>
  <th>#</th><th>Student Name</th><th>Class/Grade</th><th>School</th>
  <th>Course</th><th>Theory</th><th>Practical</th><th>Attendance</th>
  <th>Overall</th><th>Grade</th><th>Status</th>
</tr></thead>
<tbody>${rows}</tbody>
</table>
<div class="footer">
  <div class="sig-box"><div class="sig-line"></div><div class="sig-label">Class Teacher / Facilitator</div></div>
  <div class="sig-box"><div class="sig-line"></div><div class="sig-label">Academic Coordinator</div></div>
  <div class="sig-box"><div class="sig-line"></div><div class="sig-label">School Authority / Stamp</div></div>
</div>
<div class="watermark">This document is computer-generated and constitutes an official academic record of ${org?.org_name ?? 'Rillcod Technologies'}. Document Reference: ${docRef}</div>
</body></html>`;

        const w = window.open('', '_blank', 'width=1100,height=800');
        if (!w) { alert('Pop-up blocked. Please allow pop-ups for this site.'); return; }
        w.document.write(html);
        w.document.close();
        w.focus();
        setTimeout(() => { w.print(); }, 600);
    }

    // ── Loading screen ─────────────────────────────────────────────────────────
    if (authLoading || loading) return (
        <div className="min-h-screen bg-background flex items-center justify-center">
            <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
        </div>
    );

    // ── Render ─────────────────────────────────────────────────────────────────
    return (
        <>
        <style>{`@media print { @page { margin: 14mm 12mm; } body { background: white !important; } .print\\:hidden { display: none !important; } }`}</style>
        <div className="min-h-screen bg-background text-foreground print:bg-white print:text-black print:min-h-0">

            {/* ══ Screen UI ══ */}
            <div className="print:hidden max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-5">

                {/* ── Page header ── */}
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <TrophyIcon className="w-5 h-5 text-amber-400" />
                            <span className="text-xs font-bold text-amber-400 uppercase tracking-widest">
                                {isStaff ? 'Academic Results Centre' : 'My Progress Report'}
                            </span>
                        </div>
                        <h1 className="text-xl sm:text-2xl lg:text-3xl font-extrabold tracking-tight">Student Progress Reports</h1>
                        {isStaff && (
                            <div className="flex items-center gap-4 mt-2 flex-wrap">
                                <span className="text-xs text-muted-foreground">{stats.total} students</span>
                                <span className="flex items-center gap-1 text-xs text-emerald-400">
                                    <CheckCircleIcon className="w-3.5 h-3.5" />
                                    {stats.published} published
                                </span>
                                <span className="text-xs text-amber-400">{stats.draft} drafts</span>
                                <span className="text-xs text-muted-foreground">{stats.none} no report</span>
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                        {isEditor && (
                            <Link
                                href="/dashboard/reports/builder"
                                className="inline-flex items-center gap-2 px-4 py-2.5 bg-orange-600/20 border border-orange-500/30 hover:bg-orange-600/30 text-orange-400 font-bold text-sm rounded-none transition-all"
                            >
                                <PencilSquareIcon className="w-4 h-4" /> Create / Edit Report
                            </Link>
                        )}
                        {/* Print performance datasheet */}
                        {isStaff && students.length > 0 && (
                            <button
                                onClick={handlePrintPerformanceSheet}
                                className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600/20 border border-emerald-500/30 hover:bg-emerald-600/30 text-emerald-400 font-bold text-sm rounded-none transition-all"
                            >
                                <PrinterIcon className="w-4 h-4" /> Performance Sheet
                            </button>
                        )}
                        {/* Batch download button */}
                        {isStaff && selectedIds.size > 0 && (
                            <button
                                onClick={startBatchDownload}
                                disabled={isBatchDownloading}
                                className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 disabled:cursor-not-allowed text-foreground font-bold text-sm rounded-none transition-all shadow-lg shadow-emerald-900/30"
                            >
                                {isBatchDownloading
                                    ? <div className="w-4 h-4 border-2 border-border border-t-transparent rounded-full animate-spin" />
                                    : <ArrowDownTrayIcon className="w-4 h-4" />}
                                {isBatchDownloading && batchProgress
                                    ? `Downloading ${batchProgress.current}/${batchProgress.total}…`
                                    : `Download ${selectedIds.size} PDF${selectedIds.size > 1 ? 's' : ''}`}
                            </button>
                        )}
                    </div>
                </div>

                {/* ── Batch progress bar ── */}
                {batchProgress && (
                    <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-none px-5 py-4">
                        <div className="flex items-center justify-between mb-2">
                            <p className="text-emerald-300 font-bold text-sm">
                                Generating PDFs — {batchProgress.current} of {batchProgress.total} complete
                            </p>
                            <span className="text-emerald-400 font-black text-sm">
                                {Math.round((batchProgress.current / batchProgress.total) * 100)}%
                            </span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <div
                                className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                                style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
                            />
                        </div>
                        <p className="text-emerald-300/50 text-xs mt-2">
                            Files are saved one at a time. Allow each download to complete.
                        </p>
                    </div>
                )}

                {/* ── Main layout ── */}
                <div className={isStaff ? 'flex flex-col lg:flex-row gap-5 items-start' : ''}>
                    
                    {/* ══ Sidebar — staff only ══ */}
                    {isStaff && (
                        <div className={`w-full lg:w-[320px] flex-shrink-0 space-y-3 lg:sticky lg:top-6 ${showSidebar ? 'block' : 'hidden lg:block'}`}>

                            {/* Search */}
                            <div className="relative">
                                <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                <input
                                    type="text"
                                    placeholder="Search students…"
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2.5 bg-card shadow-sm border border-border rounded-none text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-orange-500 transition-colors"
                                />
                            </div>

                            <div className="space-y-2">
                                <div className="grid grid-cols-2 gap-2">
                                    <select
                                        value={filterSchool}
                                        onChange={e => { setFilterSchool(e.target.value); setFilterClass(''); }}
                                        className="px-3 py-2 bg-card shadow-sm border border-border rounded-none text-xs text-foreground focus:outline-none focus:border-orange-500 transition-colors"
                                    >
                                        <option value="">All Schools</option>
                                        {distinctSchools.map(s => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                    <select
                                        value={filterStatus}
                                        onChange={e => setFilterStatus(e.target.value as 'all' | 'published' | 'draft' | 'none')}
                                        className="px-3 py-2 bg-card shadow-sm border border-border rounded-none text-xs text-foreground focus:outline-none focus:border-orange-500 transition-colors"
                                    >
                                        <option value="all">All Status</option>
                                        <option value="published">Published</option>
                                        <option value="draft">Draft</option>
                                        <option value="none">No Report</option>
                                    </select>
                                </div>
                                {/* Class filter chips */}
                                {distinctClasses.length > 0 && (
                                    <div className="flex flex-wrap gap-1.5 pt-1">
                                        <button
                                            onClick={() => setFilterClass('')}
                                            className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider transition-all border ${!filterClass ? 'bg-orange-600 text-foreground border-orange-500' : 'bg-card shadow-sm text-muted-foreground border-border hover:bg-muted'}`}
                                        >
                                            All
                                        </button>
                                        {distinctClasses.map(c => (
                                            <button key={c}
                                                onClick={() => setFilterClass(filterClass === c ? '' : c)}
                                                className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider transition-all border ${filterClass === c ? 'bg-orange-600 text-foreground border-orange-500' : 'bg-card shadow-sm text-muted-foreground border-border hover:bg-muted'}`}
                                            >
                                                {c}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Grade Distribution */}
                            <GradeDistribution students={filtered} reportsMap={reportsMap} />

                            {/* Select-all bar */}
                            <div className="flex items-center justify-between px-3 py-2 bg-white/[0.03] border border-border rounded-none">
                                <button
                                    onClick={toggleSelectAll}
                                    className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
                                >
                                    <span className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${selectedIds.size === filtered.length && filtered.length > 0 ? 'bg-orange-600 border-orange-500' : 'border-border hover:border-orange-400'}`}>
                                        {selectedIds.size === filtered.length && filtered.length > 0 && (
                                            <CheckIcon className="w-3 h-3 text-foreground" />
                                        )}
                                    </span>
                                    {selectedIds.size > 0 ? `${selectedIds.size} selected` : 'Select all'}
                                </button>
                                <span className="text-[10px] text-muted-foreground">{filtered.length} shown</span>
                            </div>

                            {/* Student list */}
                            <div className="space-y-1.5 max-h-[calc(100vh-380px)] overflow-y-auto pr-0.5">
                                {filtered.length === 0 && (
                                    <p className="text-muted-foreground text-sm py-8 text-center">No students found</p>
                                )}
                                {filtered.map(s => {
                                    const r = reportsMap[s.id];
                                    const isActive = selectedStudent?.id === s.id;
                                    const isChecked = selectedIds.has(s.id);
                                    const cls = studentClassName(s) || undefined;
                                    const sch = studentSchoolName(s) || undefined;

                                    return (
                                        <div
                                            key={s.id}
                                            onClick={() => loadStudentReport(s)}
                                            className={`flex items-center gap-2.5 p-3 rounded-none border cursor-pointer transition-all ${isActive ? 'bg-orange-600/20 border-orange-500/40' : 'bg-card shadow-sm border-border hover:border-border hover:bg-white/[0.07]'}`}
                                        >
                                            {/* Checkbox */}
                                            <button
                                                onClick={e => toggleSelect(s.id, e)}
                                                className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${isChecked ? 'bg-orange-600 border-orange-500' : 'border-border hover:border-orange-400'}`}
                                            >
                                                {isChecked && <CheckIcon className="w-3 h-3 text-foreground" />}
                                            </button>

                                            {/* Avatar */}
                                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-600 from-orange-600 to-orange-400 flex items-center justify-center text-xs font-black text-foreground flex-shrink-0">
                                                {s.full_name ? s.full_name[0].toUpperCase() : '?'}
                                            </div>

                                            {/* Info */}
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-semibold text-foreground truncate">{s.full_name ?? 'Unknown'}</p>
                                                <p className="text-[10px] text-muted-foreground truncate">
                                                    {[cls, sch].filter(Boolean).join(' · ') || s.email}
                                                </p>
                                            </div>

                                            {/* Grade / status */}
                                            <div className="flex-shrink-0 text-right">
                                                {r ? (
                                                    <div>
                                                        <p className={`text-base font-black leading-tight ${r.is_published ? 'text-emerald-400' : 'text-amber-400'}`}>
                                                            {r.overall_grade ?? '?'}
                                                        </p>
                                                        <p className={`text-[9px] font-bold ${r.is_published ? 'text-emerald-400/60' : 'text-amber-400/60'}`}>
                                                            {r.is_published ? 'Published' : 'Draft'}
                                                        </p>
                                                    </div>
                                                ) : (
                                                    <span className="text-[10px] text-muted-foreground">No report</span>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* ══ Report panel ══ */}
                    <div className="min-w-0 flex-1 w-full">
                        {(selectedStudent || !isStaff) ? (

                            (loadingReport || selectedReport) ? (
                                <div className="border border-border rounded-none overflow-hidden shadow-2xl flex flex-col">

                                    {/* Action bar */}
                                    <div className="bg-card shadow-sm border-b border-border px-3 sm:px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
                                        <div className="flex items-center gap-2 flex-1 min-w-0">
                                            {isStaff && (
                                                <button
                                                    onClick={() => { setShowSidebar(true); setSelectedStudent(null); setSelectedReport(null); }}
                                                    className="lg:hidden flex items-center gap-1.5 px-3 py-2 bg-card shadow-sm border border-border rounded-none text-muted-foreground hover:text-foreground transition-colors text-[10px] font-black uppercase tracking-widest flex-shrink-0"
                                                >
                                                    <ArrowLeftIcon className="w-3.5 h-3.5" />
                                                    Students
                                                </button>
                                            )}
                                            <DocumentTextIcon className="w-4 h-4 text-orange-400 flex-shrink-0" />
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-bold text-foreground truncate">
                                                    {selectedReport?.student_name ?? selectedStudent?.full_name ?? 'Student'}
                                                </p>
                                                {selectedReport && (
                                                    <p className="text-[10px] text-muted-foreground truncate">
                                                        {[selectedReport.course_name, selectedReport.report_term, selectedReport.section_class]
                                                            .filter(Boolean).join(' · ')}
                                                    </p>
                                                )}
                                            </div>
                                            {selectedReport && (
                                                <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold flex-shrink-0 ${selectedReport.is_published ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
                                                    {selectedReport.is_published ? 'Published' : 'Draft'}
                                                </span>
                                            )}
                                        </div>

                                        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1 sm:pb-0">
                                            {/* Prev / Next */}
                                            {isStaff && currentIdx >= 0 && (
                                                <div className="flex items-center gap-1.5 bg-card shadow-sm p-1 rounded-none border border-border h-9 flex-shrink-0">
                                                    <button
                                                        onClick={() => navigateTo(currentIdx - 1)}
                                                        disabled={currentIdx <= 0 || loadingReport}
                                                        className="p-1.5 rounded-none hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-10 transition-colors"
                                                    >
                                                        <ArrowLeftIcon className="w-3.5 h-3.5" />
                                                    </button>
                                                    <span className="text-[10px] text-muted-foreground font-black tracking-tighter px-1 min-w-[3.5rem] text-center">{currentIdx + 1} / {filtered.length}</span>
                                                    <button
                                                        onClick={() => navigateTo(currentIdx + 1)}
                                                        disabled={currentIdx >= filtered.length - 1 || loadingReport}
                                                        className="p-1.5 rounded-none hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-10 transition-colors"
                                                    >
                                                        <ArrowRightIcon className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            )}

                                            {/* Template Toggle */}
                                            <div className="flex bg-card shadow-sm p-1 rounded-none border border-border h-9 flex-shrink-0">
                                                <button 
                                                  onClick={() => setTemplate('standard')}
                                                  className={`px-3 py-1 rounded-none text-[9px] font-black uppercase tracking-widest transition-all ${template === 'standard' ? 'bg-orange-600 text-foreground' : 'text-muted-foreground hover:text-muted-foreground'}`}
                                                >
                                                    Standard
                                                </button>
                                                <button 
                                                  onClick={() => setTemplate('modern')}
                                                  className={`px-3 py-1 rounded-none text-[9px] font-black uppercase tracking-widest transition-all ${template === 'modern' ? 'bg-orange-600 text-foreground' : 'text-muted-foreground hover:text-muted-foreground'}`}
                                                >
                                                    Modern
                                                </button>
                                            </div>

                                            {template === 'modern' && (
                                                <div className="flex bg-card shadow-sm p-1 rounded-none border border-border h-9 flex-shrink-0 items-center gap-1.5 px-2">
                                                    {[
                                                        { id: 'industrial', name: 'Ind.', color: 'bg-slate-900', border: 'border-orange-500' },
                                                        { id: 'executive', name: 'Exec.', color: 'bg-[#FDFBF2]', border: 'border-slate-800' },
                                                        { id: 'futuristic', name: 'Fut.', color: 'bg-[#050510]', border: 'border-cyan-500' }
                                                    ].map((t) => (
                                                        <button 
                                                            key={t.id}
                                                            onClick={() => setModernTemplateId(t.id as 'industrial' | 'executive' | 'futuristic')}
                                                            title={t.name}
                                                            className={cn(
                                                                "relative w-7 h-5 flex items-center justify-center transition-all overflow-hidden border border-white/10",
                                                                modernTemplateId === t.id ? "ring-2 ring-orange-500 ring-offset-1 ring-offset-card scale-110" : "opacity-40 hover:opacity-100"
                                                            )}
                                                        >
                                                            <div className={cn("absolute inset-0", t.color)} />
                                                            <div className={cn("absolute inset-0.5 border-[0.5px]", t.border, "opacity-20")} />
                                                        </button>
                                                    ))}
                                                </div>
                                            )}

                                            {/* Action set */}
                                            <div className="flex items-center gap-2 h-9">
                                                {isEditor && selectedStudent && (
                                                    <Link
                                                        href={`/dashboard/reports/builder?student=${selectedStudent.id}`}
                                                        className="h-full inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-orange-400 bg-orange-600/10 hover:bg-orange-600/20 rounded-none border border-orange-500/20 transition-all"
                                                    >
                                                        <PencilSquareIcon className="w-3.5 h-3.5" /> Edit
                                                    </Link>
                                                )}
                                                {isEditor && selectedReport && (
                                                    <>
                                                        <button
                                                            onClick={() => { setEditCourseName(selectedReport.course_name ?? ''); setEditTerm(selectedReport.report_term ?? ''); setShowEditModal(true); }}
                                                            className="h-full inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 rounded-none border border-amber-500/20 transition-all"
                                                        >
                                                            <PencilSquareIcon className="w-3.5 h-3.5" /> Rename
                                                        </button>
                                                        <button
                                                            onClick={handleDeleteReport}
                                                            disabled={isDeletingReport}
                                                            title="Delete this report"
                                                            className="h-full inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 disabled:opacity-50 rounded-none border border-rose-500/20 transition-all"
                                                        >
                                                            {isDeletingReport
                                                                ? <div className="w-3 h-3 border-2 border-rose-400 border-t-transparent rounded-full animate-spin" />
                                                                : <TrashIcon className="w-3.5 h-3.5" />}
                                                        </button>
                                                    </>
                                                )}
                                                {selectedReport && (
                                                    <div className="flex items-center gap-1">
                                                        {/* Print */}
                                                        <button
                                                            onClick={() => window.print()}
                                                            title="Print"
                                                            className="w-8 h-8 flex items-center justify-center bg-card hover:bg-muted text-muted-foreground hover:text-foreground border border-border transition-all rounded-none"
                                                        >
                                                            <PrinterIcon className="w-4 h-4" />
                                                        </button>
                                                        {/* Download PDF */}
                                                        <button
                                                            onClick={downloadSinglePDF}
                                                            disabled={isDownloadingPdf}
                                                            title="Download PDF"
                                                            className="w-8 h-8 flex items-center justify-center bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white transition-all rounded-none shadow-lg shadow-orange-900/40"
                                                        >
                                                            {isDownloadingPdf
                                                                ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                                                : <ArrowDownTrayIcon className="w-4 h-4" />}
                                                        </button>
                                                        {/* Share via WhatsApp */}
                                                        <button
                                                            disabled={isSharingPdf}
                                                            title="Share via WhatsApp"
                                                            onClick={async () => {
                                                                if (!printableRef.current || !reportToDisplay) return;
                                                                setIsSharingPdf(true);
                                                                try {
                                                                    const name = (reportToDisplay.student_name || 'Student').replace(/\s+/g, '_');
                                                                    const term = (reportToDisplay.report_term || 'Report').replace(/\s+/g, '_');
                                                                    const filename = `${name}_${term}.pdf`;
                                                                    const result = await shareReportCard(
                                                                        printableRef.current,
                                                                        filename,
                                                                        `Progress report for ${reportToDisplay.student_name || 'your child'} — ${reportToDisplay.report_term || ''} — Rillcod Academy`,
                                                                    );
                                                                    if (result === 'downloaded') {
                                                                        alert('Web Share not supported on this browser. The PDF has been downloaded instead.');
                                                                    }
                                                                } catch (err: unknown) {
                                                                    const msg = err instanceof Error ? err.message : '';
                                                                    if (!msg.toLowerCase().includes('cancel') && !msg.toLowerCase().includes('abort')) {
                                                                        alert('Could not share PDF. Try downloading instead.');
                                                                    }
                                                                } finally {
                                                                    setIsSharingPdf(false);
                                                                }
                                                            }}
                                                            className="w-8 h-8 flex items-center justify-center bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white transition-all rounded-none shadow-lg shadow-green-900/40"
                                                        >
                                                            {isSharingPdf
                                                                ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                                                : <WhatsAppIcon className="w-4 h-4" />}
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Report body */}
                                    {loadingReport ? (
                                        <div className="flex items-center justify-center h-72 bg-white/[0.02]">
                                            <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
                                        </div>
                                    ) : reportToDisplay ? (
                                         <div className="overflow-auto bg-gray-100 p-2 sm:p-6 lg:p-8" style={{ maxHeight: '75vh' }}>
                                            <ScaledReportCard report={reportToDisplay} responsive={template === 'modern'}>
                                                {template === 'standard' ? (
                                                    <ReportCard report={reportToDisplay} orgSettings={orgSettings} />
                                                ) : (
                                                    <ModernReportCard report={reportToDisplay} orgSettings={orgSettings} />
                                                )}
                                            </ScaledReportCard>
                                        </div>
                                    ) : null}
                                </div>

                            ) : (
                                /* Student selected but has no report */
                                <div className="flex flex-col items-center justify-center min-h-[400px] bg-card shadow-sm border border-border rounded-none gap-3">
                                    <DocumentTextIcon className="w-12 h-12 text-muted-foreground" />
                                    <p className="text-muted-foreground text-sm font-semibold">
                                        No report for {selectedStudent?.full_name}
                                    </p>
                                    {isEditor && selectedStudent && (
                                        <Link
                                            href={`/dashboard/reports/builder?student=${selectedStudent.id}`}
                                            className="inline-flex items-center gap-2 px-5 py-2.5 bg-orange-600/20 text-orange-400 text-sm font-bold rounded-none border border-orange-500/30 hover:bg-orange-600/30 transition-colors"
                                        >
                                            <PencilSquareIcon className="w-4 h-4" /> Create Report
                                        </Link>
                                    )}
                                    {!isEditor && (
                                        <p className="text-white/25 text-xs">No report has been published for this student yet.</p>
                                    )}
                                </div>
                            )

                        ) : (
                            /* Staff — no student selected yet */
                            <div className="flex flex-col items-center justify-center min-h-[500px] bg-card shadow-sm border border-border rounded-none gap-3">
                                <AcademicCapIcon className="w-14 h-14 text-muted-foreground" />
                                <p className="text-muted-foreground text-sm font-semibold">Select a student to view their report</p>
                                <p className="text-muted-foreground text-xs">Or select multiple students and click Download PDFs</p>
                                {isEditor && (
                                    <Link
                                        href="/dashboard/reports/builder"
                                        className="mt-2 inline-flex items-center gap-2 px-5 py-2.5 bg-orange-600/20 text-orange-400 text-sm font-bold rounded-none border border-orange-500/30 hover:bg-orange-600/30 transition-colors"
                                    >
                                        <PencilSquareIcon className="w-4 h-4" /> Create First Report
                                    </Link>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* ══ Print view — branded letterhead + performance table (list only, no report selected) ══ */}
            <div className={selectedReport ? 'hidden' : 'hidden print:block'} style={{ fontFamily: 'system-ui, sans-serif', color: '#111827' }}>

              {/* Letterhead */}
              <div style={{ borderBottom: '3px solid #1d4ed8', paddingBottom: '14px', marginBottom: '18px', display: 'flex', alignItems: 'center', gap: '16px' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo.png" alt="Rillcod Technologies" style={{ width: '64px', height: '64px', objectFit: 'contain', flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '20px', fontWeight: 900, color: '#1d4ed8', letterSpacing: '-0.5px', lineHeight: 1.1 }}>RILLCOD TECHNOLOGIES</div>
                  <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>Coding Today, Innovating Tomorrow</div>
                  <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '2px' }}>26 Ogiesoba Avenue, Off Airport Road, GRA, Benin City &nbsp;·&nbsp; 08116600091 &nbsp;·&nbsp; support@rillcod.com</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: '10px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '1.5px' }}>Document</div>
                  <div style={{ fontSize: '14px', fontWeight: 800, color: '#1d4ed8', textTransform: 'uppercase' }}>Performance Report</div>
                  <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '4px' }}>
                    {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}
                  </div>
                </div>
              </div>

              {/* Summary strip + student table */}
              <>
                  <div style={{
                    background: 'linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%)',
                    borderRadius: '10px', padding: '12px 20px', marginBottom: '16px',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  }}>
                    <div>
                      <div style={{ fontSize: '16px', fontWeight: 900, color: '#fff' }}>Student Progress Reports</div>
                      <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.7)', marginTop: '2px' }}>
                        {filterSchool && `School: ${filterSchool}  ·  `}
                        {filterClass && `Class: ${filterClass}  ·  `}
                        {filtered.length} student{filtered.length !== 1 ? 's' : ''}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '16px' }}>
                      {(['A','B','C','D','F'] as const).map(g => {
                        const cnt = filtered.filter(s => reportsMap[s.id]?.overall_grade?.[0]?.toUpperCase() === g).length;
                        const colors: Record<string,string> = { A:'#059669', B:'#2563eb', C:'#d97706', D:'#7c3aed', F:'#dc2626' };
                        return cnt > 0 ? (
                          <div key={g} style={{ textAlign: 'center', color: '#fff' }}>
                            <div style={{ fontSize: '18px', fontWeight: 900, lineHeight: 1 }}>{cnt}</div>
                            <div style={{ fontSize: '9px', fontWeight: 700, color: colors[g], background: 'rgba(255,255,255,0.15)', borderRadius: '4px', padding: '1px 4px', marginTop: '2px' }}>{g}</div>
                          </div>
                        ) : null;
                      })}
                    </div>
                  </div>

                  {/* Students table */}
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                    <thead>
                      <tr style={{ background: '#1e3a8a', color: '#fff' }}>
                        <th style={{ padding: '7px 10px', textAlign: 'left', fontWeight: 700, width: '4%' }}>#</th>
                        <th style={{ padding: '7px 10px', textAlign: 'left', fontWeight: 700, width: '28%' }}>Student Name</th>
                        <th style={{ padding: '7px 10px', textAlign: 'left', fontWeight: 700, width: '20%' }}>School</th>
                        <th style={{ padding: '7px 10px', textAlign: 'left', fontWeight: 700, width: '12%' }}>Class</th>
                        <th style={{ padding: '7px 10px', textAlign: 'center', fontWeight: 700, width: '10%' }}>Grade</th>
                        <th style={{ padding: '7px 10px', textAlign: 'center', fontWeight: 700, width: '12%' }}>Status</th>
                        <th style={{ padding: '7px 10px', textAlign: 'left', fontWeight: 700, width: '14%' }}>Last Updated</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((s, i) => {
                        const r = reportsMap[s.id];
                        const grade = r?.overall_grade?.[0]?.toUpperCase();
                        const gradeColors: Record<string,string> = { A:'#059669', B:'#2563eb', C:'#d97706', D:'#7c3aed', F:'#dc2626' };
                        return (
                          <tr key={s.id} style={{ background: i % 2 === 0 ? '#fff' : '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                            <td style={{ padding: '6px 10px', color: '#9ca3af' }}>{i + 1}</td>
                            <td style={{ padding: '6px 10px', fontWeight: 600 }}>{s.full_name ?? '—'}</td>
                            <td style={{ padding: '6px 10px', color: '#6b7280' }}>{studentSchoolName(s) || '—'}</td>
                            <td style={{ padding: '6px 10px', color: '#6b7280' }}>{s.section_class ?? '—'}</td>
                            <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                              {grade ? (
                                <span style={{ fontWeight: 900, fontSize: '13px', color: gradeColors[grade] ?? '#374151' }}>{grade}</span>
                              ) : <span style={{ color: '#d1d5db' }}>—</span>}
                            </td>
                            <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                              {!r ? (
                                <span style={{ fontSize: '9px', fontWeight: 700, background: '#f3f4f6', color: '#9ca3af', borderRadius: '9999px', padding: '2px 7px' }}>No Report</span>
                              ) : r.is_published ? (
                                <span style={{ fontSize: '9px', fontWeight: 700, background: '#d1fae5', color: '#065f46', borderRadius: '9999px', padding: '2px 7px' }}>Published</span>
                              ) : (
                                <span style={{ fontSize: '9px', fontWeight: 700, background: '#fef9c3', color: '#92400e', borderRadius: '9999px', padding: '2px 7px' }}>Draft</span>
                              )}
                            </td>
                            <td style={{ padding: '6px 10px', color: '#9ca3af', fontSize: '10px' }}>
                              {r?.updated_at ? new Date(r.updated_at).toLocaleDateString('en-GB') : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  <div style={{ marginTop: '16px', fontSize: '10px', color: '#9ca3af', borderTop: '1px solid #e5e7eb', paddingTop: '10px' }}>
                    Printed from Rillcod Technologies portal — academy.rillcod.com &nbsp;·&nbsp; Confidential
                  </div>
              </>

            </div>

            {/* ══ Print view — individual report card (untouched) ══ */}
            {reportToDisplay && (
                <div className="hidden print:block print:w-[794px] print:mx-auto">
                    {template === 'standard' ? (
                        <ReportCard report={reportToDisplay} orgSettings={orgSettings} />
                    ) : (
                        <ModernReportCard report={reportToDisplay} orgSettings={orgSettings} />
                    )}
                </div>
            )}

            {/* ══ Off-screen div — single PDF capture ══ */}
            <div style={{ position: 'fixed', left: -9999, top: 0, pointerEvents: 'none', zIndex: -100 }} aria-hidden="true">
                <div ref={printableRef}>
                    {reportToDisplay && (
                        template === 'modern' ? (
                            <ModernReportCard report={reportToDisplay} orgSettings={orgSettings} />
                        ) : (
                            <ReportCard report={reportToDisplay} orgSettings={orgSettings} />
                        )
                    )}
                </div>
            </div>

            {/* ══ Off-screen div — batch PDF capture (one at a time) ══ */}
            <div style={{ position: 'fixed', left: -9999, top: 0, pointerEvents: 'none', zIndex: -100 }} aria-hidden="true">
                <div ref={captureRef}>
                    {captureReport && (
                        template === 'modern' ? (
                            <ModernReportCard report={captureReport} orgSettings={orgSettings} />
                        ) : (
                            <ReportCard report={captureReport} orgSettings={orgSettings} />
                        )
                    )}
                </div>
            </div>

            {/* ══ Edit / Rename modal ══ */}
            {showEditModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm print:hidden" onClick={() => setShowEditModal(false)}>
                    <div className="bg-background border border-border rounded-none p-6 w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-5">
                            <div>
                                <h3 className="text-base font-extrabold text-foreground">Rename / Reassign Report</h3>
                                <p className="text-xs text-muted-foreground mt-0.5">{selectedStudent?.full_name}</p>
                            </div>
                            <button onClick={() => setShowEditModal(false)} className="p-1.5 rounded-none hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                                <XMarkIcon className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-muted-foreground mb-1.5 uppercase tracking-wider">Course / Class Name</label>
                                <input
                                    type="text"
                                    value={editCourseName}
                                    onChange={e => setEditCourseName(e.target.value)}
                                    placeholder="e.g. Web Development, Python Basics"
                                    className="w-full px-4 py-2.5 bg-card shadow-sm border border-border rounded-none text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-orange-500 transition-colors"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-muted-foreground mb-1.5 uppercase tracking-wider">Report Term</label>
                                <input
                                    type="text"
                                    value={editTerm}
                                    onChange={e => setEditTerm(e.target.value)}
                                    placeholder="e.g. First Term 2025/2026"
                                    className="w-full px-4 py-2.5 bg-card shadow-sm border border-border rounded-none text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-orange-500 transition-colors"
                                />
                            </div>
                        </div>

                        <div className="flex gap-3 mt-6">
                            <button
                                onClick={() => setShowEditModal(false)}
                                className="flex-1 py-2.5 bg-card shadow-sm border border-border rounded-none text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-all font-semibold"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSaveEdit}
                                disabled={isSavingEdit || !editCourseName.trim()}
                                className="flex-1 py-2.5 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-none text-sm text-foreground font-bold transition-all shadow-lg shadow-orange-900/30"
                            >
                                {isSavingEdit ? 'Saving…' : 'Save Changes'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
        </>
    );
}

// ── Suspense boundary (useSearchParams requirement) ────────────────────────────
export default function ResultsPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-background flex items-center justify-center">
                <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
            </div>
        }>
            <ResultsPageInner />
        </Suspense>
    );
}
