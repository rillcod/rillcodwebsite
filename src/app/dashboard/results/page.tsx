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
    TrashIcon, XMarkIcon,
} from '@/lib/icons';
import ReportCard from '@/components/reports/ReportCard';
import ModernReportCard from '@/components/reports/ModernReportCard';
import { ScaledReportCard, generateReportPDF } from '@/lib/pdf-utils';
import { Database } from '@/types/supabase';

type StudentReport = Database['public']['Tables']['student_progress_reports']['Row'];
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
            else counts.F++; // Map E or others to F for consistency
        } else {
            counts.none++;
        }
    });

    const max = Math.max(...Object.values(counts).slice(0, 5), 1);
    const totalWithGrades = students.length - counts.none;

    return (
        <div className="bg-[#0a0a1a]/60 border border-white/10 rounded-2xl p-4 mb-4 shadow-xl overflow-hidden relative group">
            {/* Background Glow */}
            <div className="absolute -top-10 -right-10 w-32 h-32 bg-violet-600/10 blur-[50px] rounded-full pointer-events-none" />
            
            <div className="flex items-center justify-between mb-4 px-1">
                <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-violet-400 italic">Grade Distribution</p>
                    <p className="text-[8px] font-bold text-white/20 uppercase">Telemetry Analysis</p>
                </div>
                <div className="flex gap-2">
                   {['A','B','C','D','F'].map(g => (
                       <div key={g} className="flex flex-col items-center">
                           <span className="text-[8px] font-black text-white/30">{g}</span>
                           <span className="text-[10px] font-black text-white/60">{counts[g as keyof typeof counts]}</span>
                       </div>
                   ))}
                </div>
            </div>

            <div className="flex items-end gap-2 h-24 mb-1">
                {(['A', 'B', 'C', 'D', 'F'] as const).map(g => {
                    const count = counts[g];
                    const h = totalWithGrades > 0 ? (count / max) * 100 : 0;
                    const colors = { 
                        A: 'from-emerald-600 to-emerald-400 shadow-emerald-500/20', 
                        B: 'from-blue-600 to-blue-400 shadow-blue-500/20', 
                        C: 'from-amber-600 to-amber-400 shadow-amber-500/20', 
                        D: 'from-indigo-600 to-indigo-400 shadow-indigo-500/20', 
                        F: 'from-rose-600 to-rose-400 shadow-rose-500/20' 
                    };
                    return (
                        <div key={g} className="flex-1 flex flex-col items-center gap-2 group/bar">
                            <div className="w-full bg-white/[0.03] rounded-t-lg overflow-hidden flex flex-col justify-end h-full relative border border-white/5">
                                {count > 0 && (
                                    <div 
                                        className={`w-full bg-gradient-to-t ${colors[g]} opacity-80 group-hover/bar:opacity-100 transition-all duration-1000 ease-out shadow-lg relative`} 
                                        style={{ height: `${h}%` }}
                                    >
                                        {/* Animated Shine */}
                                        <div className="absolute inset-0 bg-gradient-to-t from-transparent via-white/10 to-transparent translate-y-full group-hover/bar:translate-y-[-100%] transition-transform duration-1000" />
                                        
                                        {/* Top Glow Dot */}
                                        <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)] opacity-0 group-hover/bar:opacity-100 transition-opacity" />
                                    </div>
                                )}
                            </div>
                            <span className="text-[10px] font-black text-white/20 group-hover/bar:text-white/60 transition-colors uppercase">{g}</span>
                        </div>
                    );
                })}
            </div>

            {/* Total Indicator */}
            <div className="mt-3 pt-3 border-t border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-[9px] font-bold text-white/40 uppercase tracking-widest">Active Monitoring</span>
                </div>
                <span className="text-[9px] font-bold text-white/20 italic">{totalWithGrades} Reports Analyzed</span>
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
    const [template, setTemplate] = useState<'standard' | 'modern'>('standard');

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
    const [isBatchDownloading, setIsBatchDownloading] = useState(false);
    const [batchProgress, setBatchProgress] = useState<{ current: number; total: number } | null>(null);
    const [captureReport, setCaptureReport] = useState<StudentReport | null>(null);

    const pdfRef = useRef<HTMLDivElement>(null);  // single-student capture
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
        const db = createClient();

        if (!isStaff) {
            // Student: load own latest published report
            Promise.all([
                db.from('student_progress_reports')
                    .select('*')
                    .eq('student_id', profile.id)
                    .eq('is_published', true)
                    .order('updated_at', { ascending: false })
                    .limit(1)
                    .maybeSingle(),
                db.from('report_settings').select('*').limit(1).maybeSingle(),
            ]).then(([rep, org]) => {
                setSelectedReport(rep.data as StudentReport | null);
                setOrgSettings(org.data);
                setLoading(false);
            });
            return;
        }

        async function loadStaffData() {
            // 1. Determine school scope
            const isAdmin = profile?.role === 'admin';
            const isSchoolRole = profile?.role === 'school';
            let assignedSchoolIds: string[] = [];
            let assignedSchoolNames: string[] = [];

            if (!isAdmin) {
                if (isSchoolRole) {
                    // School partner: use profile directly — no API call needed
                    if (profile?.school_id) assignedSchoolIds = [profile.school_id];
                    if (profile?.school_name) assignedSchoolNames = [profile.school_name];
                } else {
                    // Teacher: fetch assigned schools via API (service role bypasses RLS)
                    const schRes = await fetch('/api/schools', { cache: 'no-store' });
                    if (schRes.ok) {
                        const schJson = await schRes.json();
                        const schools = schJson.data ?? [];
                        assignedSchoolIds = schools.map((s: any) => s.id).filter(Boolean);
                        assignedSchoolNames = schools.map((s: any) => s.name).filter(Boolean);
                    }
                    // Always add teacher's own profile school as direct fallbacks
                    // (API may return schools table name which differs from stored school_name text)
                    if (profile?.school_id && !assignedSchoolIds.includes(profile.school_id)) {
                        assignedSchoolIds.push(profile.school_id);
                    }
                    if (profile?.school_name && !assignedSchoolNames.includes(profile.school_name)) {
                        assignedSchoolNames.push(profile.school_name);
                    }
                }
            }

            // 2. Build student query — join classes + schools for proper display names
            let finalQuery = db.from('portal_users')
                .select('id, full_name, email, school_name, section_class, school_id, profile_image_url, class_id, classes:class_id(id, name), schools:school_id(id, name)')
                .neq('is_deleted', true);

            if (!isAdmin) {
                finalQuery = finalQuery.eq('role', 'student');
                if (assignedSchoolIds.length > 0 || assignedSchoolNames.length > 0) {
                    // Build OR filter: school_id UUID match OR school_name text match
                    const parts: string[] = [];
                    if (assignedSchoolIds.length > 0) {
                        parts.push(`school_id.in.(${assignedSchoolIds.join(',')})`);
                    }
                    if (assignedSchoolNames.length > 0) {
                        assignedSchoolNames.forEach(n => parts.push(`school_name.eq."${n.replace(/"/g, '\\"')}"`));
                    }
                    finalQuery = (finalQuery as any).or(parts.join(','));
                } else {
                    finalQuery = finalQuery.eq('id', '00000000-0000-0000-0000-000000000000');
                }
            }

            const [sRes, orgRes] = await Promise.all([
                finalQuery.order('full_name').limit(isAdmin ? 10000 : 400),
                db.from('report_settings').select('*').limit(1).maybeSingle(),
            ]);

            if (sRes.error) throw sRes.error;

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

                (reports ?? []).forEach(r => {
                    // Latest report for each student (since they are ordered by updated_at desc)
                    if (r.student_id && !rMap[r.student_id]) rMap[r.student_id] = r;
                });
            }

            setReportsMap(rMap);

            if (prefStudentId) {
                const s = studs.find(x => x.id === prefStudentId);
                if (s) loadStudentReport(s);
            }
            setLoading(false);
        }

        loadStaffData();
        return;
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
            student_name: selectedReport.student_name || selectedStudent?.full_name || null,
            school_name: (selectedReport.school_name || (selectedStudent ? studentSchoolName(selectedStudent) : null) || null) as any,
            section_class: (selectedReport.section_class || (selectedStudent ? studentClassName(selectedStudent) : null) || null) as any,
          }
        : null;

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
    async function downloadSinglePDF() {
        if (!pdfRef.current || !selectedReport) return;
        setIsDownloadingPdf(true);
        try {
            const name = (selectedReport.student_name ?? 'Student').replace(/\s+/g, '_');
            await generateReportPDF(pdfRef.current, `Report_${name}.pdf`);
        } catch (err) {
            console.error('PDF failed:', err);
            alert('PDF failed. Try Print → Save as PDF instead.');
        } finally {
            setIsDownloadingPdf(false);
        }
    }

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
            const cls = (s as any).classes?.name ?? s.section_class ?? '—';
            const sch = (s as any).schools?.name ?? s.school_name ?? '—';
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
      <div class="org-name">${org?.org_name ?? 'Rillcod Academy'}</div>
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
    <div class="title-sub">Academic Progress Report Summary · ${org?.org_name ?? 'Rillcod Academy'}</div>
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
<div class="watermark">This document is computer-generated and constitutes an official academic record of ${org?.org_name ?? 'Rillcod Academy'}. Document Reference: ${docRef}</div>
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
        <div className="min-h-screen bg-[#0f0f1a] flex items-center justify-center">
            <div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
        </div>
    );

    // ── Render ─────────────────────────────────────────────────────────────────
    return (
        <>
        <style>{`@media print { @page { margin: 14mm 12mm; } body { background: white !important; } .print\\:hidden { display: none !important; } }`}</style>
        <div className="min-h-screen bg-[#0f0f1a] text-white print:bg-white print:text-black print:min-h-0">

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
                                <span className="text-xs text-white/40">{stats.total} students</span>
                                <span className="flex items-center gap-1 text-xs text-emerald-400">
                                    <CheckCircleIcon className="w-3.5 h-3.5" />
                                    {stats.published} published
                                </span>
                                <span className="text-xs text-amber-400">{stats.draft} drafts</span>
                                <span className="text-xs text-white/30">{stats.none} no report</span>
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                        {isEditor && (
                            <Link
                                href="/dashboard/reports/builder"
                                className="inline-flex items-center gap-2 px-4 py-2.5 bg-violet-600/20 border border-violet-500/30 hover:bg-violet-600/30 text-violet-400 font-bold text-sm rounded-xl transition-all"
                            >
                                <PencilSquareIcon className="w-4 h-4" /> Create / Edit Report
                            </Link>
                        )}
                        {/* Print performance datasheet */}
                        {isStaff && students.length > 0 && (
                            <button
                                onClick={handlePrintPerformanceSheet}
                                className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600/20 border border-emerald-500/30 hover:bg-emerald-600/30 text-emerald-400 font-bold text-sm rounded-xl transition-all"
                            >
                                <PrinterIcon className="w-4 h-4" /> Performance Sheet
                            </button>
                        )}
                        {/* Batch download button */}
                        {isStaff && selectedIds.size > 0 && (
                            <button
                                onClick={startBatchDownload}
                                disabled={isBatchDownloading}
                                className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold text-sm rounded-xl transition-all shadow-lg shadow-emerald-900/30"
                            >
                                {isBatchDownloading
                                    ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
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
                    <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl px-5 py-4">
                        <div className="flex items-center justify-between mb-2">
                            <p className="text-emerald-300 font-bold text-sm">
                                Generating PDFs — {batchProgress.current} of {batchProgress.total} complete
                            </p>
                            <span className="text-emerald-400 font-black text-sm">
                                {Math.round((batchProgress.current / batchProgress.total) * 100)}%
                            </span>
                        </div>
                        <div className="h-2 bg-white/10 rounded-full overflow-hidden">
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
                                <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                                <input
                                    type="text"
                                    placeholder="Search students…"
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/30 focus:outline-none focus:border-violet-500 transition-colors"
                                />
                            </div>

                            <div className="space-y-2">
                                <div className="grid grid-cols-2 gap-2">
                                    <select
                                        value={filterSchool}
                                        onChange={e => { setFilterSchool(e.target.value); setFilterClass(''); }}
                                        className="px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-violet-500 transition-colors"
                                    >
                                        <option value="">All Schools</option>
                                        {distinctSchools.map(s => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                    <select
                                        value={filterStatus}
                                        onChange={e => setFilterStatus(e.target.value as any)}
                                        className="px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-violet-500 transition-colors"
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
                                            className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider transition-all border ${!filterClass ? 'bg-violet-600 text-white border-violet-500' : 'bg-white/5 text-white/40 border-white/10 hover:bg-white/10'}`}
                                        >
                                            All
                                        </button>
                                        {distinctClasses.map(c => (
                                            <button key={c}
                                                onClick={() => setFilterClass(filterClass === c ? '' : c)}
                                                className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider transition-all border ${filterClass === c ? 'bg-violet-600 text-white border-violet-500' : 'bg-white/5 text-white/40 border-white/10 hover:bg-white/10'}`}
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
                            <div className="flex items-center justify-between px-3 py-2 bg-white/[0.03] border border-white/10 rounded-xl">
                                <button
                                    onClick={toggleSelectAll}
                                    className="flex items-center gap-2 text-xs text-white/60 hover:text-white transition-colors"
                                >
                                    <span className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${selectedIds.size === filtered.length && filtered.length > 0 ? 'bg-violet-600 border-violet-500' : 'border-white/30 hover:border-violet-400'}`}>
                                        {selectedIds.size === filtered.length && filtered.length > 0 && (
                                            <CheckIcon className="w-3 h-3 text-white" />
                                        )}
                                    </span>
                                    {selectedIds.size > 0 ? `${selectedIds.size} selected` : 'Select all'}
                                </button>
                                <span className="text-[10px] text-white/30">{filtered.length} shown</span>
                            </div>

                            {/* Student list */}
                            <div className="space-y-1.5 max-h-[calc(100vh-380px)] overflow-y-auto pr-0.5">
                                {filtered.length === 0 && (
                                    <p className="text-white/30 text-sm py-8 text-center">No students found</p>
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
                                            className={`flex items-center gap-2.5 p-3 rounded-xl border cursor-pointer transition-all ${isActive ? 'bg-violet-600/20 border-violet-500/40' : 'bg-white/5 border-white/10 hover:border-white/25 hover:bg-white/[0.07]'}`}
                                        >
                                            {/* Checkbox */}
                                            <button
                                                onClick={e => toggleSelect(s.id, e)}
                                                className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${isChecked ? 'bg-violet-600 border-violet-500' : 'border-white/25 hover:border-violet-400'}`}
                                            >
                                                {isChecked && <CheckIcon className="w-3 h-3 text-white" />}
                                            </button>

                                            {/* Avatar */}
                                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-600 to-blue-600 flex items-center justify-center text-xs font-black text-white flex-shrink-0">
                                                {s.full_name ? s.full_name[0].toUpperCase() : '?'}
                                            </div>

                                            {/* Info */}
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-semibold text-white truncate">{s.full_name ?? 'Unknown'}</p>
                                                <p className="text-[10px] text-white/40 truncate">
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
                                                    <span className="text-[10px] text-white/20">No report</span>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* ══ Report panel ══ */}
                    <div className="min-w-0">
                        {(selectedStudent || !isStaff) ? (

                            (loadingReport || selectedReport) ? (
                                <div className="border border-white/10 rounded-2xl overflow-hidden shadow-2xl flex flex-col">

                                    {/* Action bar */}
                                    <div className="bg-white/5 border-b border-white/10 px-3 sm:px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
                                        <div className="flex items-center gap-2 flex-1 min-w-0">
                                            {isStaff && (
                                                <button 
                                                    onClick={() => setShowSidebar(!showSidebar)}
                                                    className="lg:hidden p-2 bg-white/5 border border-white/10 rounded-lg text-white/60 hover:text-white transition-colors"
                                                >
                                                    <MagnifyingGlassIcon className="w-4 h-4" />
                                                </button>
                                            )}
                                            <DocumentTextIcon className="w-4 h-4 text-violet-400 flex-shrink-0" />
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-bold text-white truncate">
                                                    {selectedReport?.student_name ?? selectedStudent?.full_name ?? 'Student'}
                                                </p>
                                                {selectedReport && (
                                                    <p className="text-[10px] text-white/40 truncate">
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
                                                <div className="flex items-center gap-1.5 bg-white/5 p-1 rounded-xl border border-white/5 h-9 flex-shrink-0">
                                                    <button
                                                        onClick={() => navigateTo(currentIdx - 1)}
                                                        disabled={currentIdx <= 0 || loadingReport}
                                                        className="p-1.5 rounded-lg hover:bg-white/10 text-white/40 hover:text-white disabled:opacity-10 transition-colors"
                                                    >
                                                        <ArrowLeftIcon className="w-3.5 h-3.5" />
                                                    </button>
                                                    <span className="text-[10px] text-white/30 font-black tracking-tighter px-1 min-w-[3.5rem] text-center">{currentIdx + 1} / {filtered.length}</span>
                                                    <button
                                                        onClick={() => navigateTo(currentIdx + 1)}
                                                        disabled={currentIdx >= filtered.length - 1 || loadingReport}
                                                        className="p-1.5 rounded-lg hover:bg-white/10 text-white/40 hover:text-white disabled:opacity-10 transition-colors"
                                                    >
                                                        <ArrowRightIcon className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            )}

                                            {/* Template Toggle */}
                                            <div className="flex bg-white/5 p-1 rounded-xl border border-white/5 h-9 flex-shrink-0">
                                                <button 
                                                  onClick={() => setTemplate('standard')}
                                                  className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${template === 'standard' ? 'bg-violet-600 text-white shadow-lg shadow-violet-900/40' : 'text-white/30 hover:text-white/50'}`}
                                                >
                                                    Standard
                                                </button>
                                                <button 
                                                  onClick={() => setTemplate('modern')}
                                                  className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${template === 'modern' ? 'bg-violet-600 text-white shadow-lg shadow-violet-900/40' : 'text-white/30 hover:text-white/50'}`}
                                                >
                                                    Modern
                                                </button>
                                            </div>

                                            {/* Action set */}
                                            <div className="flex items-center gap-2 h-9">
                                                {isEditor && selectedStudent && (
                                                    <Link
                                                        href={`/dashboard/reports/builder?student=${selectedStudent.id}`}
                                                        className="h-full inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-violet-400 bg-violet-600/10 hover:bg-violet-600/20 rounded-xl border border-violet-500/20 transition-all"
                                                    >
                                                        <PencilSquareIcon className="w-3.5 h-3.5" /> Edit
                                                    </Link>
                                                )}
                                                {isEditor && selectedReport && (
                                                    <>
                                                        <button
                                                            onClick={() => { setEditCourseName(selectedReport.course_name ?? ''); setEditTerm(selectedReport.report_term ?? ''); setShowEditModal(true); }}
                                                            className="h-full inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 rounded-xl border border-amber-500/20 transition-all"
                                                        >
                                                            <PencilSquareIcon className="w-3.5 h-3.5" /> Rename
                                                        </button>
                                                        <button
                                                            onClick={handleDeleteReport}
                                                            disabled={isDeletingReport}
                                                            title="Delete this report"
                                                            className="h-full inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 disabled:opacity-50 rounded-xl border border-rose-500/20 transition-all"
                                                        >
                                                            {isDeletingReport
                                                                ? <div className="w-3 h-3 border-2 border-rose-400 border-t-transparent rounded-full animate-spin" />
                                                                : <TrashIcon className="w-3.5 h-3.5" />}
                                                        </button>
                                                    </>
                                                )}
                                                {selectedReport && (
                                                    <div className="flex items-center gap-2">
                                                        <button
                                                            onClick={() => window.print()}
                                                            className="h-full inline-flex items-center gap-2 px-4 py-1.5 bg-white/5 hover:bg-white/10 text-white/60 hover:text-white text-[10px] font-black uppercase tracking-widest rounded-xl border border-white/10 transition-all"
                                                        >
                                                            <PrinterIcon className="w-3.5 h-3.5" />
                                                            Print
                                                        </button>
                                                        <button
                                                            onClick={downloadSinglePDF}
                                                            disabled={isDownloadingPdf}
                                                            className="h-full inline-flex items-center gap-2 px-4 py-1.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-[10px] font-black uppercase tracking-widest rounded-xl transition-all shadow-lg shadow-violet-900/40 whitespace-nowrap"
                                                        >
                                                            {isDownloadingPdf
                                                                ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                                                : <ArrowDownTrayIcon className="w-3.5 h-3.5" />}
                                                            {isDownloadingPdf ? 'Downloading…' : 'Download PDF'}
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Report body */}
                                    {loadingReport ? (
                                        <div className="flex items-center justify-center h-72 bg-white/[0.02]">
                                            <div className="w-8 h-8 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
                                        </div>
                                    ) : reportToDisplay ? (
                                        <div className="overflow-auto bg-gray-100 p-4 sm:p-6 lg:p-8" style={{ maxHeight: '75vh' }}>
                                            <ScaledReportCard report={reportToDisplay}>
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
                                <div className="flex flex-col items-center justify-center min-h-[400px] bg-white/5 border border-white/10 rounded-2xl gap-3">
                                    <DocumentTextIcon className="w-12 h-12 text-white/10" />
                                    <p className="text-white/40 text-sm font-semibold">
                                        No report for {selectedStudent?.full_name}
                                    </p>
                                    {isEditor && selectedStudent && (
                                        <Link
                                            href={`/dashboard/reports/builder?student=${selectedStudent.id}`}
                                            className="inline-flex items-center gap-2 px-5 py-2.5 bg-violet-600/20 text-violet-400 text-sm font-bold rounded-xl border border-violet-500/30 hover:bg-violet-600/30 transition-colors"
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
                            <div className="flex flex-col items-center justify-center min-h-[500px] bg-white/5 border border-white/10 rounded-2xl gap-3">
                                <AcademicCapIcon className="w-14 h-14 text-white/10" />
                                <p className="text-white/30 text-sm font-semibold">Select a student to view their report</p>
                                <p className="text-white/20 text-xs">Or select multiple students and click Download PDFs</p>
                                {isEditor && (
                                    <Link
                                        href="/dashboard/reports/builder"
                                        className="mt-2 inline-flex items-center gap-2 px-5 py-2.5 bg-violet-600/20 text-violet-400 text-sm font-bold rounded-xl border border-violet-500/30 hover:bg-violet-600/30 transition-colors"
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
                  <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '2px' }}>26 Ogiesoba Avenue, Off Airport Road, GRA, Benin City &nbsp;·&nbsp; 08116600091 &nbsp;·&nbsp; rillcod@gmail.com</div>
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
                            <td style={{ padding: '6px 10px', fontWeight: 600 }}>{(s as any).full_name ?? '—'}</td>
                            <td style={{ padding: '6px 10px', color: '#6b7280' }}>{(s as any).school_name ?? '—'}</td>
                            <td style={{ padding: '6px 10px', color: '#6b7280' }}>{(s as any).section_class ?? '—'}</td>
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
                    Printed from Rillcod Academy portal — academy.rillcod.com &nbsp;·&nbsp; Confidential
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
            <div style={{ position: 'fixed', left: -9999, top: 0, width: 794, pointerEvents: 'none', zIndex: -1 }}>
                <div ref={pdfRef}>
                    {reportToDisplay && (
                        template === 'standard' ? (
                            <ReportCard report={reportToDisplay} orgSettings={orgSettings} />
                        ) : (
                            <ModernReportCard report={reportToDisplay} orgSettings={orgSettings} />
                        )
                    )}
                </div>
            </div>

            {/* ══ Off-screen div — batch PDF capture (one at a time) ══ */}
            <div style={{ position: 'fixed', left: -9999, top: 0, width: 794, pointerEvents: 'none', zIndex: -1 }}>
                <div ref={captureRef}>
                    {captureReport && (
                        template === 'standard' ? (
                            <ReportCard report={captureReport} orgSettings={orgSettings} />
                        ) : (
                            <ModernReportCard report={captureReport} orgSettings={orgSettings} />
                        )
                    )}
                </div>
            </div>

            {/* ══ Edit / Rename modal ══ */}
            {showEditModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm print:hidden" onClick={() => setShowEditModal(false)}>
                    <div className="bg-[#0f0f1a] border border-white/15 rounded-2xl p-6 w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-5">
                            <div>
                                <h3 className="text-base font-extrabold text-white">Rename / Reassign Report</h3>
                                <p className="text-xs text-white/40 mt-0.5">{selectedStudent?.full_name}</p>
                            </div>
                            <button onClick={() => setShowEditModal(false)} className="p-1.5 rounded-lg hover:bg-white/10 text-white/40 hover:text-white transition-colors">
                                <XMarkIcon className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-white/60 mb-1.5 uppercase tracking-wider">Course / Class Name</label>
                                <input
                                    type="text"
                                    value={editCourseName}
                                    onChange={e => setEditCourseName(e.target.value)}
                                    placeholder="e.g. Web Development, Python Basics"
                                    className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/25 focus:outline-none focus:border-violet-500 transition-colors"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-white/60 mb-1.5 uppercase tracking-wider">Report Term</label>
                                <input
                                    type="text"
                                    value={editTerm}
                                    onChange={e => setEditTerm(e.target.value)}
                                    placeholder="e.g. First Term 2025/2026"
                                    className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/25 focus:outline-none focus:border-violet-500 transition-colors"
                                />
                            </div>
                        </div>

                        <div className="flex gap-3 mt-6">
                            <button
                                onClick={() => setShowEditModal(false)}
                                className="flex-1 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white/60 hover:text-white hover:bg-white/10 transition-all font-semibold"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSaveEdit}
                                disabled={isSavingEdit || !editCourseName.trim()}
                                className="flex-1 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl text-sm text-white font-bold transition-all shadow-lg shadow-violet-900/30"
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
            <div className="min-h-screen bg-[#0f0f1a] flex items-center justify-center">
                <div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
            </div>
        }>
            <ResultsPageInner />
        </Suspense>
    );
}
