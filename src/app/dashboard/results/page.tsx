// @refresh reset
'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import { compareReportsByPeriodDesc } from '@/lib/reports/academic-period';
import { fetchJsonWithTimeout, withTimeout } from '@/lib/async-timeout';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
    PrinterIcon, AcademicCapIcon, MagnifyingGlassIcon,
    TrophyIcon, DocumentTextIcon, PencilSquareIcon, CheckCircleIcon,
    ArrowDownTrayIcon, ArrowLeftIcon, ArrowRightIcon, CheckIcon,
    TrashIcon, XMarkIcon, CalendarIcon
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
import { buildReportEmail } from '@/lib/email/rillcod-transactional-email';
import { Database } from '@/types/supabase';
import { cn } from '@/lib/utils';

type StudentReport = Database['public']['Tables']['student_progress_reports']['Row'] & {
  template_id?: string | null;
  gender?: string | null;
};
type PortalUser = Database['public']['Tables']['portal_users']['Row'];
type OrgSettings = Database['public']['Tables']['report_settings']['Row'];

// WAEC tier groups shown in the distribution chart
const WAEC_TIERS = [
    { codes: ['A1'],         label: 'A1',    bar: 'from-emerald-500/80 to-emerald-400/40', text: 'text-emerald-400' },
    { codes: ['B2', 'B3'],   label: 'B2/B3', bar: 'from-green-500/80   to-green-400/40',   text: 'text-green-400'   },
    { codes: ['C4','C5','C6'],label: 'C',    bar: 'from-primary/80    to-primary/40',    text: 'text-primary'    },
    { codes: ['D7'],         label: 'D7',    bar: 'from-amber-500/80   to-amber-400/40',   text: 'text-amber-400'   },
    { codes: ['E8'],         label: 'E8',    bar: 'from-primary/80  to-primary/40',  text: 'text-primary'  },
    { codes: ['F9'],         label: 'F9',    bar: 'from-rose-500/80    to-rose-400/40',    text: 'text-rose-400'    },
];

const REPORT_TERMS = ['First Term', 'Second Term', 'Third Term', 'Annual'];
function academicYearOptions() {
    const now = new Date();
    const start = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
    return Array.from({ length: 6 }, (_, i) => {
        const y = start - 2 + i;
        return `${y}/${y + 1}`;
    }).reverse();
}

function GradeDistribution({ students, reportsMap }: { students: PortalUser[], reportsMap: Record<string, any> }) {
    // Count per WAEC tier
    const counts = WAEC_TIERS.map(() => 0);
    let noneCount = 0;

    students.forEach(s => {
        const grade: string | undefined = reportsMap[s.id]?.overall_grade;
        if (!grade) { noneCount++; return; }
        const g = grade.toUpperCase().trim();
        const idx = WAEC_TIERS.findIndex(t => t.codes.includes(g));
        if (idx >= 0) counts[idx]++;
        else {
            // Legacy single-letter grades (A→A1, B→B2, C→C4, D→D7, F→F9)
            const legacyMap: Record<string, number> = { A: 0, B: 1, C: 2, D: 3, F: 5 };
            const ti = legacyMap[g[0]] ?? 5;
            counts[ti]++;
        }
    });

    const totalWithGrades = students.length - noneCount;
    const max = Math.max(...counts, 1);

    return (
        <div className="bg-card border border-border p-5 shadow-2xl overflow-hidden relative">
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-primary italic leading-none mb-4">
                WAEC Grade Distribution
            </p>

            {/* Bars row — fixed height so flex-col justify-end works */}
            <div className="flex items-end gap-1.5" style={{ height: '80px' }}>
                {WAEC_TIERS.map((tier, i) => {
                    const count = counts[i];
                    const h = max > 0 ? (count / max) * 100 : 0;
                    return (
                        <div key={tier.label} className="flex-1 h-full flex flex-col justify-end">
                            <div
                                className={`w-full rounded-t bg-gradient-to-t ${tier.bar} transition-all duration-700 ease-out`}
                                style={{ height: count > 0 ? `${Math.max(h, 5)}%` : '0%' }}
                            />
                        </div>
                    );
                })}
            </div>

            {/* Labels row */}
            <div className="flex gap-1.5 mt-1.5 mb-3">
                {WAEC_TIERS.map((tier, i) => (
                    <div key={tier.label} className="flex-1 text-center">
                        <span className={`block text-[9px] font-black ${tier.text}`}>{tier.label}</span>
                        <span className="block text-[9px] font-bold text-muted-foreground">{counts[i]}</span>
                    </div>
                ))}
            </div>

            <div className="pt-3 border-t border-border flex items-center justify-between">
                <span className="text-[9px] font-black text-muted-foreground uppercase tracking-[0.2em]">
                    {totalWithGrades} graded · {noneCount} pending
                </span>
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
    // All of the selected student's reports (across terms / academic sessions) so the
    // viewer can switch between them — a 3rd-term report must not hide the 2nd-term one.
    const [reportHistory, setReportHistory] = useState<StudentReport[]>([]);
    const [loadingReport, setLoadingReport] = useState(false);
    // Students see the standard (official) report card by default; staff can switch
    const [template, setTemplate] = useState<'standard' | 'modern' | 'printable'>(
        profile?.role === 'student' ? 'standard' : 'modern'
    );
    const [modernTemplateId, setModernTemplateId] = useState<'industrial' | 'executive' | 'futuristic'>('industrial');

    // ── Filters ────────────────────────────────────────────────────────────────
    const [search, setSearch] = useState('');
    const [filterSchool, setFilterSchool] = useState('');
    const [filterClass, setFilterClass] = useState('');
    const [filterGrade, setFilterGrade] = useState('');
    const [filterStatus, setFilterStatus] = useState<'all' | 'published' | 'draft' | 'none'>('all');
    const [filterParentEmail, setFilterParentEmail] = useState<'all' | 'has' | 'missing'>('all');
    const [periodDraft, setPeriodDraft] = useState({ year: academicYearOptions()[0] ?? '', term: '' });
    const [confirmedPeriod, setConfirmedPeriod] = useState<{ year: string; term: string } | null>(null);

    // ── Multi-select ───────────────────────────────────────────────────────────
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    // ── Edit / Delete state ────────────────────────────────────────────────────
    const [showEditModal, setShowEditModal] = useState(false);
    const [editCourseName, setEditCourseName] = useState('');
    const [editTerm, setEditTerm] = useState('');
    const [isSavingEdit, setIsSavingEdit] = useState(false);
    const [isDeletingReport, setIsDeletingReport] = useState(false);
    const [isTogglingInvoice, setIsTogglingInvoice] = useState(false);
    const [isTogglingPublish, setIsTogglingPublish] = useState(false);

    // ── PDF state ──────────────────────────────────────────────────────────────
    const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
    const [isSharingPdf, setIsSharingPdf] = useState(false);
    const [emailShareOpen, setEmailShareOpen] = useState(false);
    const [emailShareTo, setEmailShareTo] = useState('');
    const [emailShareSending, setEmailShareSending] = useState(false);
    const [emailShareError, setEmailShareError] = useState<string | null>(null);
    const [isBatchDownloading, setIsBatchDownloading] = useState(false);
    const [isBulkPrinting, setIsBulkPrinting] = useState(false);
    const [isBulkEmailing, setIsBulkEmailing] = useState(false);
    const [reportEmailEvents, setReportEmailEvents] = useState<{ id: string; event: string; email: string | null; occurred_at: string | null }[]>([]);
    const [loadingEmailEvents, setLoadingEmailEvents] = useState(false);
    const [bulkEmailResults, setBulkEmailResults] = useState<{ studentName: string; email: string; success: boolean; error?: string }[]>([]);
    const [showBulkEmailSummary, setShowBulkEmailSummary] = useState(false);
    const bulkEmailResultsRef = useRef<{ studentName: string; email: string; success: boolean; error?: string }[]>([]);
    const [batchProgress, setBatchProgress] = useState<{ current: number; total: number; mode: 'download' | 'print' | 'email' } | null>(null);
    const [captureReport, setCaptureReport] = useState<StudentReport | null>(null);
    const [bulkPrintReports, setBulkPrintReports] = useState<StudentReport[] | null>(null);

    const pdfRef = useRef<HTMLDivElement>(null);  // single-student capture (legacy/standard)
    const printableRef = useRef<HTMLDivElement>(null); // modern capture
    const captureRef = useRef<HTMLDivElement>(null);  // batch capture
    const captureQueue = useRef<StudentReport[]>([]);
    const captureIdx = useRef<number>(0);
    const batchMode = useRef<'download' | 'print' | 'email'>('download');
    const pdfPages = useRef<{ dataUrl: string; format: 'JPEG'; w: number; h: number }[]>([]);
    const bulkPrintTemplateRef = useRef<'standard' | 'modern' | 'printable'>('standard');
    const [showSidebar, setShowSidebar] = useState(true);

    const isStaff = profile?.role === 'admin' || profile?.role === 'teacher' || profile?.role === 'school';
    // School partners can VIEW and PRINT but cannot create or edit reports
    const isEditor = profile?.role === 'admin' || profile?.role === 'teacher';
    const staffPeriodReady = !isStaff || !!(confirmedPeriod?.year && confirmedPeriod?.term);

    // ── Data loading ───────────────────────────────────────────────────────────
    useEffect(() => {
        if (authLoading || !profile) return;

        // Staff must confirm a term/year first so the centre never mixes periods.
        if (isStaff && !confirmedPeriod) {
            setStudents([]);
            setReportsMap({});
            setSelectedStudent(null);
            setSelectedReport(null);
            setReportHistory([]);
            setLoading(false);
            return;
        }

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
                const [repRes, orgRes] = await withTimeout(Promise.all([
                    db.from('student_progress_reports')
                        .select('*')
                        .eq('student_id', profile.id)
                        .eq('is_published', true)
                        .order('updated_at', { ascending: false }),
                    db.from('report_settings').select('*').limit(1).maybeSingle(),
                ]), [{ data: [] }, { data: null }], 'student results startup');
                if (aborted) return;

                let reports = (repRes.data ?? []) as StudentReport[];

                // Fallback: pre-portal reports created before the portal account existed
                if (reports.length === 0 && profile.full_name) {
                    let fallbackQuery = db
                        .from('student_progress_reports')
                        .select('*')
                        .is('student_id', null)
                        .eq('student_name', profile.full_name)
                        .eq('is_published', true)
                        .order('updated_at', { ascending: false });
                    if (profile.school_id) fallbackQuery = fallbackQuery.eq('school_id', profile.school_id) as typeof fallbackQuery;
                    const { data: fallback } = await withTimeout(
                        fallbackQuery,
                        { data: [], error: null },
                        'student report fallback lookup',
                    );
                    if (!aborted) reports = (fallback ?? []) as StudentReport[];
                }

                if (!aborted) {
                    // Order by academic year + term (newest first) so the switcher reads
                    // chronologically for every viewer — not by whichever was last edited.
                    const ordered = [...reports].sort(compareReportsByPeriodDesc);
                    setReportHistory(ordered);
                    setSelectedReport(ordered[0] ?? null);
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
            const isTeacher = profile?.role === 'teacher';
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
                        fetchJsonWithTimeout('/api/schools', { data: [] }, 'results assigned schools'),
                        withTimeout(
                            db.from('classes').select('id, school_id').eq('teacher_id', profile!.id),
                            { data: [], error: null },
                            'results teacher classes',
                        ),
                    ]);

                    const schools = schRes.data ?? [];
                    assignedSchoolIds = schools.map((s: any) => s.id).filter(Boolean);
                    assignedSchoolNames = schools.map((s: any) => s.name).filter(Boolean);

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
                .select('id, full_name, email, school_name, section_class, school_id, profile_image_url, class_id, gender, classes:class_id(id, name), schools:school_id(id, name)')
                .neq('is_deleted', true);

            if (!isAdmin) {
                finalQuery = finalQuery.eq('role', 'student');
                const parts: string[] = [];
                
                // DATA SCOPE: Ensure strictly their own school's records
                if (isSchoolRole && profile?.school_id) {
                    finalQuery = finalQuery.eq('school_id', profile.school_id);
                } else if (!isAdmin) {
                    if (isTeacher) {
                        // Teacher scope:
                        //   1. Students currently in the teacher's classes (class_id FK)
                        //   2. Students who have at least one report authored by this teacher
                        //      (covers cases where a student was moved to another class but the
                        //      teacher still owns the report record — e.g. after a class reshuffle)
                        const { data: ownedReports } = await withTimeout(
                            db
                                .from('student_progress_reports')
                                .select('student_id')
                                .eq('teacher_id', profile!.id)
                                .not('student_id', 'is', null),
                            { data: [], error: null },
                            'results teacher owned reports',
                        );
                        const reportedStudentIds = [...new Set(
                            (ownedReports ?? []).map((r: any) => r.student_id).filter(Boolean)
                        )];

                        const orParts: string[] = [];
                        if (teacherClassIds.length > 0) orParts.push(`class_id.in.(${teacherClassIds.join(',')})`);
                        if (reportedStudentIds.length > 0) orParts.push(`id.in.(${reportedStudentIds.join(',')})`);

                        if (orParts.length > 0) {
                            finalQuery = finalQuery.or(orParts.join(','));
                        } else {
                            finalQuery = finalQuery.eq('id', '00000000-0000-0000-0000-000000000000');
                        }
                    } else {
                        // Other staff: scope by assigned schools or classes
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
            }

            const [sRes, orgRes] = await withTimeout(Promise.all([
                finalQuery.order('full_name').limit(isAdmin ? 10000 : 400),
                db.from('report_settings').select('*').limit(1).maybeSingle(),
            ]), [{ data: [], error: null }, { data: null, error: null }], 'results staff roster startup');

            if (sRes.error) throw sRes.error;
            if (aborted) return;

            const studs = (sRes.data ?? []) as unknown as PortalUser[];

            // Enrich with grade_level + parent_email from the students shadow table
            const portalIds = studs.map(s => s.id).filter(Boolean);
            const gradeByUserId: Record<string, string> = {};
            const parentEmailByUserId: Record<string, string> = {};
            if (portalIds.length > 0) {
                // Batch to prevent HTTP 400 Bad Request URL length limits
                const chunkSize = 100;
                const chunks: string[][] = [];
                for (let i = 0; i < portalIds.length; i += chunkSize) {
                    chunks.push(portalIds.slice(i, i + chunkSize));
                }
                
                await Promise.all(chunks.map(async (chunk) => {
                    const { data: gradeRows } = await withTimeout(
                        db.from('students')
                            .select('user_id, grade_level, parent_email')
                            .in('user_id', chunk),
                        { data: [], error: null },
                        'results student grade chunk',
                    );
                    
                    (gradeRows ?? []).forEach((r: any) => {
                        if (r.user_id && r.grade_level) gradeByUserId[r.user_id] = r.grade_level;
                        if (r.user_id && r.parent_email) parentEmailByUserId[r.user_id] = r.parent_email;
                    });
                }));
            }
            const studsWithGrade = studs.map(s => ({
                ...s,
                grade_level: gradeByUserId[(s as any).id] ?? '',
                parent_email: parentEmailByUserId[(s as any).id] ?? null,
            }));
            setStudents(studsWithGrade as unknown as PortalUser[]);
            setOrgSettings(orgRes.data);

            const studentIds = studs.map(s => s.id);
            const rMap: Record<string, any> = {};
            if (studentIds.length > 0) {
                // Batch report queries to prevent URL length limits (HTTP 400 Bad Request)
                const chunkSize = 100;
                const chunks: string[][] = [];
                for (let i = 0; i < studentIds.length; i += chunkSize) {
                    chunks.push(studentIds.slice(i, i + chunkSize));
                }

                const allReports: any[] = [];
                await Promise.all(chunks.map(async (chunk) => {
                    let reportsQuery = db.from('student_progress_reports')
                        .select('student_id, overall_grade, is_published, updated_at, report_term, report_period')
                        .in('student_id', chunk);

                    if (confirmedPeriod) {
                        reportsQuery = reportsQuery
                            .eq('report_term', confirmedPeriod.term)
                            .eq('report_period', confirmedPeriod.year) as typeof reportsQuery;
                    }

                    if (profile?.role === 'teacher') {
                        reportsQuery = reportsQuery.eq('teacher_id', profile.id);
                    }

                    const { data, error } = await withTimeout(
                        reportsQuery,
                        { data: [], error: null },
                        'results report map chunk',
                    );
                    if (!error && data) {
                        allReports.push(...data);
                    }
                }));

                if (aborted) return;

                // Sort allReports by is_published desc, updated_at desc to make sure latest is prioritized
                allReports.sort((a, b) => {
                    if (a.is_published !== b.is_published) {
                        return a.is_published ? -1 : 1;
                    }
                    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
                });

                allReports.forEach(r => {
                    // Latest report for each student (since they are sorted)
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
    }, [profile?.id, authLoading, confirmedPeriod?.year, confirmedPeriod?.term]); // eslint-disable-line

    // ── Auto-print when ?autoprint=1 is in the URL ────────────────────────────
    const autoPrintFired = useRef(false);
    useEffect(() => {
        if (autoPrintFired.current) return;
        if (!searchParams.get('autoprint')) return;
        if (!selectedReport || loadingReport) return;
        autoPrintFired.current = true;
        // Give React time to render the report card before opening the print dialog
        const t = setTimeout(() => window.print(), 900);
        return () => clearTimeout(t);
    }, [selectedReport, loadingReport]); // eslint-disable-line

    // ── Load single student report ─────────────────────────────────────────────
    async function loadStudentReport(s: PortalUser) {
        setSelectedStudent(s);
        setLoadingReport(true);
        setSelectedReport(null);
        setReportHistory([]);
        setReportEmailEvents([]);
        // On mobile, auto-hide sidebar when student is selected
        if (typeof window !== 'undefined' && window.innerWidth < 1024) {
            setShowSidebar(false);
        }
        // Load ALL of the student's reports (across terms / academic sessions) so staff
        // can switch between them; default to the most recent published one.
        let reportQuery = createClient()
            .from('student_progress_reports')
            .select('*')
            .eq('student_id', s.id)
            .order('is_published', { ascending: false })
            .order('updated_at', { ascending: false });
        if (isStaff && confirmedPeriod) {
            reportQuery = reportQuery
                .eq('report_term', confirmedPeriod.term)
                .eq('report_period', confirmedPeriod.year) as typeof reportQuery;
        }
        if (profile?.role === 'teacher') reportQuery = reportQuery.eq('teacher_id', profile.id) as typeof reportQuery;
        const { data } = await withTimeout(
            reportQuery,
            { data: [], error: null },
            'selected student report history',
        );
        // Order by academic year + term (newest first) so the term/session switcher is
        // consistent for staff and matches what students/parents see.
        const history = ((data ?? []) as StudentReport[]).slice().sort(compareReportsByPeriodDesc);
        setReportHistory(history);
        const data0 = history[0] ?? null;
        setSelectedReport(data0);
        setLoadingReport(false);
        if (data0?.id) {
            setLoadingEmailEvents(true);
            fetchJsonWithTimeout(`/api/progress-reports/${data0.id}/email-events`, { events: [] }, 'selected report email events')
                .then(j => { if (j.events) setReportEmailEvents(j.events); })
                .catch(() => null)
                .finally(() => setLoadingEmailEvents(false));
        }
    }

    // Short label for a report in the term/session switcher (Term · Year · Course).
    const reportLabel = (r: StudentReport): string => {
        const parts = [r.report_term, (r as any).report_period, r.course_name].filter(Boolean);
        return `${parts.join(' · ') || 'Report'}${r.is_published ? '' : ' (draft)'}`;
    };

    // Switch the displayed report (term/session) and refresh its email events.
    const pickReport = (r: StudentReport | null) => {
        setSelectedReport(r);
        if (r?.id) {
            setLoadingEmailEvents(true);
            fetchJsonWithTimeout(`/api/progress-reports/${r.id}/email-events`, { events: [] }, 'picked report email events')
                .then(j => { if (j.events) setReportEmailEvents(j.events); else setReportEmailEvents([]); })
                .catch(() => setReportEmailEvents([]))
                .finally(() => setLoadingEmailEvents(false));
        }
    };

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

    const distinctGrades = [...new Set(
        students.map(s => (s as any).grade_level).filter(Boolean)
    )].sort() as string[];

    const filtered = students.filter(s => {
        const matchSearch = !search
            || (s.full_name ?? '').toLowerCase().includes(search.toLowerCase())
            || (s.email ?? '').toLowerCase().includes(search.toLowerCase());
        const matchSchool = !filterSchool || studentSchoolName(s) === filterSchool;
        const matchClass = !filterClass || studentClassName(s) === filterClass;
        const matchGrade = !filterGrade || ((s as any).grade_level ?? '') === filterGrade;
        const r = reportsMap[s.id];
        const matchStatus =
            filterStatus === 'all' ? true :
                filterStatus === 'published' ? r?.is_published === true :
                    filterStatus === 'draft' ? (r && r.is_published === false) :
            /* none */ !r;
        const hasParentEmail = !!(s as any).parent_email;
        const matchParentEmail =
            filterParentEmail === 'all' ? true :
                filterParentEmail === 'has' ? hasParentEmail :
            /* missing */ !hasParentEmail;
        return matchSearch && matchSchool && matchClass && matchGrade && matchStatus && matchParentEmail;
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
            gender: (selectedReport as any).gender || (selectedStudent as any)?.gender || null,
            school_name: selectedReport.school_name || (selectedStudent ? studentSchoolName(selectedStudent) : null) || null,
            section_class: selectedReport.section_class || (selectedStudent ? studentClassName(selectedStudent) : null) || null,
            // Class = grade (isolated from Section/cohort); prefer the report's stored grade.
            student_grade: (selectedReport as any).student_grade || (selectedStudent as any)?.grade || (selectedStudent as any)?.grade_level || null,
          }
        : null;

    const downloadSinglePDF = async () => {
        if (!reportToDisplay) return;
        setIsDownloadingPdf(true);
        try {
            const fileName = `${reportToDisplay.student_name || 'Student'}_Report_${reportToDisplay.report_term || ''}.pdf`.replace(/\s+/g, '_');
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

    const sendReportByEmail = async () => {
        if (!printableRef.current || !reportToDisplay || !emailShareTo.trim()) return;
        setEmailShareSending(true);
        setEmailShareError(null);
        try {
            const { generateReportPDFBase64 } = await import('@/lib/pdf-utils');
            const base64 = await generateReportPDFBase64(printableRef.current);
            const name = (reportToDisplay.student_name || 'Student').replace(/\s+/g, '_');
            const term = (reportToDisplay.report_term || 'Report').replace(/\s+/g, '_');
            const filename = `${name}_${term}.pdf`;
            const subject = `Progress Report — ${reportToDisplay.student_name || 'Student'} (${reportToDisplay.report_term || ''})`;
            const appOrigin = typeof window !== 'undefined' ? window.location.origin : 'https://rillcod.com';
            const trackToken = reportToDisplay.id
                ? btoa(JSON.stringify({ reportId: reportToDisplay.id, email: emailShareTo.trim(), type: 'report' }))
                : null;
            const htmlBody = buildReportEmail({
                recipientName: emailShareTo.trim().split('@')[0],
                studentName: reportToDisplay.student_name || 'Your Child',
                term: reportToDisplay.report_term || 'Current Term',
                schoolName: (orgSettings as any)?.school_name || (selectedStudent as any)?.school_name || undefined,
                overallGrade: reportToDisplay.overall_grade || undefined,
                portalUrl: emailShareTo.trim() === selectedStudent?.email
                    ? `${appOrigin}/dashboard/results?student=${selectedStudent?.id}`
                    : `${appOrigin}/dashboard/parent-results`,
                trackingPixelUrl: trackToken ? `${appOrigin}/api/inbox/track/${trackToken}` : undefined,
            });
            const res = await fetch('/api/inbox/email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    to: emailShareTo.trim(),
                    subject,
                    body: htmlBody,
                    attachments: [{ filename, content: base64 }],
                }),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || 'Failed to send email');
            // Log send in report metadata
            if (reportToDisplay.id) {
                const rd = reportToDisplay as any;
                fetch(`/api/progress-reports/${reportToDisplay.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        metadata: {
                            ...(rd.metadata && typeof rd.metadata === 'object' ? rd.metadata : {}),
                            email_sent_at: new Date().toISOString(),
                            email_sent_to: emailShareTo.trim(),
                        },
                    }),
                }).catch(() => null);
            }
            setEmailShareOpen(false);
            setEmailShareTo('');
            // Refresh email activity strip
            if (reportToDisplay.id) {
                fetch(`/api/progress-reports/${reportToDisplay.id}/email-events`)
                    .then(r => r.json())
                    .then(j => { if (j.events) setReportEmailEvents(j.events); })
                    .catch(() => null);
            }
        } catch (err: any) {
            setEmailShareError(err.message || 'Failed to send. Try again.');
        } finally {
            setEmailShareSending(false);
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
            if (next.has(id)) next.delete(id); else next.add(id);
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

    // Scope bulk operations (PDF / print / email) to the term + academic session
    // currently in view (the selected report), so a class export never silently
    // mixes terms by grabbing "whatever is latest". Falls back to latest-per-student
    // only when no specific report/term is in view.
    function scopedBulkReportsQuery(ids: string[]) {
        let q = createClient()
            .from('student_progress_reports')
            .select('*')
            .in('student_id', ids);
        const term = selectedReport?.report_term ?? null;
        const period = (selectedReport as any)?.report_period ?? null;
        if (term) q = q.eq('report_term', term) as typeof q;
        if (period) q = q.eq('report_period', period) as typeof q;
        return q.order('updated_at', { ascending: false });
    }

    function bulkScopeNote(base: string): string {
        const term = selectedReport?.report_term;
        const period = (selectedReport as any)?.report_period;
        const scope = [term, period].filter(Boolean).join(' · ');
        return scope ? `${base} for ${scope}.` : `${base}.`;
    }

    // ── Batch PDF ──────────────────────────────────────────────────────────────
    async function startBatchDownload() {
        const ids = [...selectedIds];
        if (ids.length === 0) return;
        batchMode.current = 'download';
        setIsBatchDownloading(true);

        const { data: reports } = await scopedBulkReportsQuery(ids);

        if (!reports || reports.length === 0) {
            setIsBatchDownloading(false);
            alert(bulkScopeNote('No reports found for the selected students'));
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
        pdfPages.current = [];
        setBatchProgress({ current: 0, total: queue.length, mode: batchMode.current });
        setCaptureReport(queue[0]);
    }

    // ── Bulk Print — DOM native ──
    async function startBulkPrint(targetIds?: string[]) {
        const ids = targetIds ?? (selectedIds.size > 0 ? [...selectedIds] : filtered.map(s => s.id));
        if (ids.length === 0) return;
        setIsBulkPrinting(true);

        const { data: reports } = await scopedBulkReportsQuery(ids);

        if (!reports || reports.length === 0) {
            setIsBulkPrinting(false);
            alert(bulkScopeNote('No reports found for the selected students'));
            return;
        }

        const seen = new Set<string>();
        const queue: StudentReport[] = [];
        for (const r of reports) {
            if (!seen.has(r.student_id)) { seen.add(r.student_id); queue.push(r as StudentReport); }
        }

        setBulkPrintReports(queue);
        
        // Wait a short moment for React to render the components into the hidden print div
        setTimeout(() => {
            window.print();
            // Wait before cleaning up so the print dialog completes setup
            setTimeout(() => {
                setIsBulkPrinting(false);
                setBulkPrintReports(null);
            }, 1000);
        }, 1500);
    }

    // ── Bulk Email to Parents ──────────────────────────────────────────────────
    async function sendBulkReportEmails() {
        const ids = [...selectedIds];
        if (ids.length === 0) return;
        batchMode.current = 'email';
        setIsBulkEmailing(true);

        const { data: reports } = await scopedBulkReportsQuery(ids);

        if (!reports || reports.length === 0) {
            setIsBulkEmailing(false);
            alert(bulkScopeNote('No reports found for the selected students'));
            return;
        }

        // Dedupe: keep latest per student; only include students with a parent_email on file
        const seen = new Set<string>();
        const queue: StudentReport[] = [];
        for (const r of reports) {
            if (!seen.has(r.student_id)) {
                const stu = students.find(s => s.id === r.student_id);
                if ((stu as any)?.parent_email) {
                    seen.add(r.student_id);
                    queue.push(r as StudentReport);
                }
            }
        }

        if (queue.length === 0) {
            setIsBulkEmailing(false);
            alert('None of the selected students have a parent email on file.');
            return;
        }

        bulkEmailResultsRef.current = [];
        captureQueue.current = queue;
        captureIdx.current = 0;
        pdfPages.current = [];
        setBatchProgress({ current: 0, total: queue.length, mode: 'email' });
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
            const mode = batchMode.current;
            setBatchProgress({ current: idx + 1, total, mode });

            try {
                if (mode === 'download') {
                    const name = (captureReport.student_name ?? 'Student').replace(/\s+/g, '_');
                    await generateReportPDF(captureRef.current, `Report_${name}.pdf`);
                } else if (mode === 'email') {
                    const stu = students.find(s => s.id === captureReport.student_id);
                    const dest = (stu as any)?.parent_email as string | undefined;
                    const sDisplayName = captureReport.student_name || 'Unknown';
                    if (dest) {
                        try {
                            const { generateReportPDFBase64 } = await import('@/lib/pdf-utils');
                            const base64 = await generateReportPDFBase64(captureRef.current!);
                            const sName = sDisplayName.replace(/\s+/g, '_');
                            const term = (captureReport.report_term || 'Report').replace(/\s+/g, '_');
                            const bulkTrackToken = captureReport.id
                                ? btoa(JSON.stringify({ reportId: captureReport.id, email: dest, type: 'report' }))
                                : null;
                            const htmlBody = buildReportEmail({
                                recipientName: dest.split('@')[0],
                                studentName: captureReport.student_name || 'Your Child',
                                term: captureReport.report_term || 'Current Term',
                                schoolName: (stu as any)?.school_name || undefined,
                                overallGrade: captureReport.overall_grade || undefined,
                                portalUrl: `${window.location.origin}/dashboard/parent-results`,
                                trackingPixelUrl: bulkTrackToken ? `${window.location.origin}/api/inbox/track/${bulkTrackToken}` : undefined,
                            });
                            const res = await fetch('/api/inbox/email', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    to: dest,
                                    subject: `Progress Report — ${captureReport.student_name || 'Student'} (${captureReport.report_term || ''})`,
                                    body: htmlBody,
                                    attachments: [{ filename: `${sName}_${term}.pdf`, content: base64 }],
                                }),
                            });
                            if (res.ok) {
                                bulkEmailResultsRef.current.push({ studentName: sDisplayName, email: dest, success: true });
                            } else {
                                const j = await res.json().catch(() => ({}));
                                bulkEmailResultsRef.current.push({ studentName: sDisplayName, email: dest, success: false, error: j.error || 'Send failed' });
                            }
                        } catch (sendErr: any) {
                            bulkEmailResultsRef.current.push({ studentName: sDisplayName, email: dest, success: false, error: sendErr?.message || 'Unknown error' });
                        }
                    } else {
                        bulkEmailResultsRef.current.push({ studentName: sDisplayName, email: '—', success: false, error: 'No parent email recorded' });
                    }
                }
            } catch (err) {
                console.error('Capture failed for:', captureReport.student_name, err);
            }

            if (cancelled) return;

            const next = idx + 1;
            captureIdx.current = next;

            if (next < captureQueue.current.length) {
                setCaptureReport(captureQueue.current[next]);
            } else {
                // Batch done
                setCaptureReport(null);
                setBatchProgress(null);

                if (mode === 'download') {
                    setIsBatchDownloading(false);
                    setSelectedIds(new Set());
                } else if (mode === 'email') {
                    setIsBulkEmailing(false);
                    setSelectedIds(new Set());
                    setBulkEmailResults([...bulkEmailResultsRef.current]);
                    setShowBulkEmailSummary(true);
                }
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

    // ── Toggle Invoice ────────────────────────────────────────────────────────
    async function handlePublishToggle() {
        if (!selectedReport) return;
        setIsTogglingPublish(true);
        const nextVal = !selectedReport.is_published;
        try {
            const res = await fetch(`/api/progress-reports/${selectedReport.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ is_published: nextVal }),
            });
            if (!res.ok) {
                const j = await res.json().catch(() => ({}));
                alert(j.error ?? 'Failed to update publish status.');
                return;
            }
            const updated = { ...selectedReport, is_published: nextVal };
            setSelectedReport(updated as StudentReport);
            if (selectedStudent) {
                setReportsMap(prev => ({ ...prev, [selectedStudent.id]: updated }));
            }
        } finally {
            setIsTogglingPublish(false);
        }
    }

    async function handleInvoiceToggle() {
        if (!selectedReport) return;
        setIsTogglingInvoice(true);
        const nextVal = !(selectedReport as any).show_payment_notice;
        try {
            const res = await fetch(`/api/progress-reports/${selectedReport.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ show_payment_notice: nextVal }),
            });
            if (!res.ok) {
                const j = await res.json().catch(() => ({}));
                alert(j.error ?? 'Failed to toggle invoice.');
                return;
            }
            const updated = { ...selectedReport, show_payment_notice: nextVal };
            setSelectedReport(updated as StudentReport);
            if (selectedStudent) {
                setReportsMap(prev => ({ ...prev, [selectedStudent.id]: updated }));
            }
        } finally {
            setIsTogglingInvoice(false);
        }
    }

    // ── Print the in-page performance report (letterhead + student grade table) ──
    function handlePrintSummary() {
        setSelectedReport(null);
        setBulkPrintReports(null);
        setTimeout(() => window.print(), 80);
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
            const code = g.toUpperCase().trim();
            if (code === 'A1')                       return '#10b981'; // emerald
            if (code === 'B2' || code === 'B3')      return '#22c55e'; // green
            if (code === 'C4' || code === 'C5' || code === 'C6') return '#3b82f6'; // blue
            if (code === 'D7')                       return '#f59e0b'; // amber
            if (code === 'E8')                       return '#f97316'; // orange
            if (code === 'F9')                       return '#ef4444'; // rose
            // Legacy single-letter fallback
            const c = code[0];
            if (c === 'A') return '#10b981';
            if (c === 'B') return '#22c55e';
            if (c === 'C') return '#3b82f6';
            if (c === 'D') return '#f59e0b';
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
            <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
    );

    // ── Render ─────────────────────────────────────────────────────────────────
    return (
        <>
        <style>{`@media print { @page { margin: 14mm 12mm; } body { background: white !important; } .print\\:hidden { display: none !important; } }`}</style>
        <div className="min-h-screen bg-background text-foreground print:bg-card print:text-black print:min-h-0">

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
                        {isStaff && staffPeriodReady && (
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

                    {isStaff && (
                        <div className="w-full sm:w-auto bg-card border border-border rounded-2xl p-4 space-y-3">
                            <div className="flex items-center gap-2">
                                <CalendarIcon className="w-4 h-4 text-primary" />
                                <div>
                                    <p className="text-[10px] font-black uppercase tracking-widest text-primary">Academic Period Lock</p>
                                    <p className="text-[11px] text-muted-foreground">Confirm year and term before viewing reports.</p>
                                </div>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2">
                                <select
                                    value={periodDraft.year}
                                    onChange={e => setPeriodDraft(p => ({ ...p, year: e.target.value }))}
                                    className="px-3 py-2 bg-background border border-border rounded-xl text-xs text-foreground focus:outline-none focus:border-primary"
                                >
                                    <option value="">Academic Year</option>
                                    {academicYearOptions().map(y => <option key={y} value={y}>{y}</option>)}
                                </select>
                                <select
                                    value={periodDraft.term}
                                    onChange={e => setPeriodDraft(p => ({ ...p, term: e.target.value }))}
                                    className="px-3 py-2 bg-background border border-border rounded-xl text-xs text-foreground focus:outline-none focus:border-primary"
                                >
                                    <option value="">Select Term</option>
                                    {REPORT_TERMS.map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                                <button
                                    onClick={() => {
                                        if (!periodDraft.year || !periodDraft.term) return;
                                        setConfirmedPeriod({ year: periodDraft.year, term: periodDraft.term });
                                        setSelectedIds(new Set());
                                    }}
                                    disabled={!periodDraft.year || !periodDraft.term}
                                    className="px-4 py-2 bg-primary hover:bg-primary/90 disabled:opacity-40 text-primary-foreground rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                                >
                                    Confirm
                                </button>
                            </div>
                            {confirmedPeriod ? (
                                <p className="text-[11px] text-emerald-400 font-bold">
                                    Showing only {confirmedPeriod.term} · {confirmedPeriod.year}
                                </p>
                            ) : (
                                <p className="text-[11px] text-amber-400 font-bold">
                                    Reports, exports, printing, and email actions stay hidden until confirmed.
                                </p>
                            )}
                        </div>
                    )}

                    {(!isStaff || staffPeriodReady) && (
                    <div className="flex w-full sm:w-auto items-center gap-2 overflow-x-auto sm:overflow-visible pb-1 sm:pb-0 flex-nowrap sm:flex-wrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                        {isEditor && (
                            <Link
                                href="/dashboard/reports/builder"
                                className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary/20 border border-primary/30 hover:bg-primary/30 text-primary font-bold text-sm rounded-xl transition-all"
                            >
                                <PencilSquareIcon className="w-4 h-4" /> Create / Edit Report
                            </Link>
                        )}
                        {/* Print performance report — letterhead + grade table */}
                        {isStaff && students.length > 0 && (
                            <button
                                onClick={handlePrintSummary}
                                className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600/20 border border-blue-500/30 hover:bg-blue-600/30 text-blue-400 font-bold text-sm rounded-xl transition-all"
                            >
                                <PrinterIcon className="w-4 h-4" /> Print Performance Report
                            </button>
                        )}
                        {/* Print all students — standard report card format */}
                        {isStaff && students.length > 0 && (
                            <button
                                onClick={() => startBulkPrint(filtered.map(s => s.id))}
                                disabled={isBulkPrinting || isBatchDownloading}
                                className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary/20 border border-primary/30 hover:bg-primary/30 disabled:opacity-60 disabled:cursor-not-allowed text-primary font-bold text-sm rounded-xl transition-all"
                            >
                                {isBulkPrinting
                                    ? <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                                    : <PrinterIcon className="w-4 h-4" />}
                                {isBulkPrinting
                                    ? 'Preparing...'
                                    : `Print All Reports (${filtered.length})`}
                            </button>
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
                                disabled={isBatchDownloading || isBulkPrinting || isBulkEmailing}
                                className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 disabled:cursor-not-allowed text-foreground font-bold text-sm rounded-xl transition-all shadow-lg shadow-emerald-900/30"
                            >
                                {isBatchDownloading
                                    ? <div className="w-4 h-4 border-2 border-border border-t-transparent rounded-full animate-spin" />
                                    : <ArrowDownTrayIcon className="w-4 h-4" />}
                                {isBatchDownloading && batchProgress
                                    ? `Downloading ${batchProgress.current}/${batchProgress.total}…`
                                    : `Export ${selectedIds.size} PDF${selectedIds.size > 1 ? 's' : ''}`}
                            </button>
                        )}
                        {/* Bulk email to parents */}
                        {isStaff && selectedIds.size > 0 && (
                            <button
                                onClick={sendBulkReportEmails}
                                disabled={isBulkEmailing || isBatchDownloading || isBulkPrinting}
                                className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold text-sm rounded-xl transition-all shadow-lg shadow-blue-900/30"
                            >
                                {isBulkEmailing
                                    ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                    : <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                                {isBulkEmailing && batchProgress
                                    ? `Emailing ${batchProgress.current}/${batchProgress.total}…`
                                    : `Email ${selectedIds.size} to Parents`}
                            </button>
                        )}
                    </div>
                    )}
                </div>

                {/* ── Batch progress bar ── */}
                {batchProgress && (
                    <div className={`border rounded-xl px-5 py-4 ${batchProgress.mode === 'print' ? 'bg-violet-500/10 border-violet-500/20' : batchProgress.mode === 'email' ? 'bg-blue-500/10 border-blue-500/20' : 'bg-emerald-500/10 border-emerald-500/20'}`}>
                        <div className="flex items-center justify-between mb-2">
                            <p className={`font-bold text-sm ${batchProgress.mode === 'print' ? 'text-violet-300' : batchProgress.mode === 'email' ? 'text-blue-300' : 'text-emerald-300'}`}>
                                {batchProgress.mode === 'print'
                                    ? `Building print PDF — ${batchProgress.current} of ${batchProgress.total} rendered`
                                    : batchProgress.mode === 'email'
                                    ? `Emailing reports — ${batchProgress.current} of ${batchProgress.total} sent`
                                    : `Generating PDFs — ${batchProgress.current} of ${batchProgress.total} complete`}
                            </p>
                            <span className={`font-black text-sm ${batchProgress.mode === 'print' ? 'text-violet-400' : batchProgress.mode === 'email' ? 'text-blue-400' : 'text-emerald-400'}`}>
                                {Math.round((batchProgress.current / batchProgress.total) * 100)}%
                            </span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <div
                                className={`h-full rounded-full transition-all duration-300 ${batchProgress.mode === 'print' ? 'bg-violet-500' : batchProgress.mode === 'email' ? 'bg-blue-500' : 'bg-emerald-500'}`}
                                style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
                            />
                        </div>
                        <p className={`text-xs mt-2 ${batchProgress.mode === 'print' ? 'text-violet-300/50' : batchProgress.mode === 'email' ? 'text-blue-300/50' : 'text-emerald-300/50'}`}>
                            {batchProgress.mode === 'print'
                                ? 'Rendering each report — combined PDF will open for printing when done.'
                                : batchProgress.mode === 'email'
                                ? 'Sending each report PDF to the parent email on file. Do not navigate away.'
                                : 'Files are saved one at a time. Allow each download to complete.'}
                        </p>
                    </div>
                )}

                {isStaff && !staffPeriodReady && (
                    <div className="bg-card border border-dashed border-border rounded-3xl p-8 sm:p-12 text-center">
                        <AcademicCapIcon className="w-14 h-14 mx-auto text-muted-foreground/40 mb-4" />
                        <h2 className="text-lg font-black text-foreground">Confirm Academic Year And Term</h2>
                        <p className="text-sm text-muted-foreground mt-2 max-w-xl mx-auto">
                            Select the exact academic year and term above. The centre will then load only matching reports, so reports from other terms cannot mix into printing, export, or parent email workflows.
                        </p>
                    </div>
                )}

                {/* ── Main layout ── */}
                {staffPeriodReady && (
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
                                    className="w-full pl-10 pr-4 py-2.5 bg-card shadow-sm border border-border rounded-xl text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary transition-colors"
                                />
                            </div>

                            <div className="space-y-2">
                                <div className="grid grid-cols-2 gap-2">
                                    <select
                                        value={filterSchool}
                                        onChange={e => { setFilterSchool(e.target.value); setFilterClass(''); setFilterGrade(''); }}
                                        className="px-3 py-2 bg-card shadow-sm border border-border rounded-xl text-xs text-foreground focus:outline-none focus:border-primary transition-colors"
                                    >
                                        <option value="">All Schools</option>
                                        {distinctSchools.map(s => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                    <select
                                        value={filterStatus}
                                        onChange={e => setFilterStatus(e.target.value as 'all' | 'published' | 'draft' | 'none')}
                                        className="px-3 py-2 bg-card shadow-sm border border-border rounded-xl text-xs text-foreground focus:outline-none focus:border-primary transition-colors"
                                    >
                                        <option value="all">All Status</option>
                                        <option value="published">Published</option>
                                        <option value="draft">Draft</option>
                                        <option value="none">No Report</option>
                                    </select>
                                </div>
                                {/* Parent email filter */}
                                <div className="flex items-center gap-2">
                                    <span className="text-[9px] font-black text-muted-foreground/50 uppercase tracking-widest whitespace-nowrap">Parent Email</span>
                                    <div className="flex gap-1 flex-wrap">
                                        {(['all', 'has', 'missing'] as const).map(v => (
                                            <button key={v}
                                                onClick={() => setFilterParentEmail(v)}
                                                className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider transition-all border ${filterParentEmail === v
                                                    ? v === 'missing' ? 'bg-orange-500 text-white border-orange-500' : 'bg-emerald-600 text-white border-emerald-600'
                                                    : 'bg-card shadow-sm text-muted-foreground border-border hover:bg-muted'}`}
                                            >
                                                {v === 'all' ? 'All' : v === 'has' ? '✓ Has' : '⚠ Missing'}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                {/* Grade filter chips */}
                                {distinctGrades.length > 0 && (
                                    <div className="space-y-1">
                                        <p className="text-[9px] font-black text-muted-foreground/50 uppercase tracking-widest">Grade</p>
                                        <div className="flex flex-wrap gap-1.5">
                                            <button
                                                onClick={() => setFilterGrade('')}
                                                className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider transition-all border ${!filterGrade ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-card shadow-sm text-muted-foreground border-border hover:bg-muted'}`}
                                            >All</button>
                                            {distinctGrades.map(g => (
                                                <button key={g}
                                                    onClick={() => setFilterGrade(filterGrade === g ? '' : g)}
                                                    className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider transition-all border ${filterGrade === g ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-card shadow-sm text-muted-foreground border-border hover:bg-muted'}`}
                                                >{g}</button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                {/* Section (cohort) filter chips */}
                                {distinctClasses.length > 0 && (
                                    <div className="space-y-1">
                                        <p className="text-[9px] font-black text-muted-foreground/50 uppercase tracking-widest">Section</p>
                                        <div className="flex flex-wrap gap-1.5">
                                            <button
                                                onClick={() => setFilterClass('')}
                                                className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider transition-all border ${!filterClass ? 'bg-primary text-foreground border-primary' : 'bg-card shadow-sm text-muted-foreground border-border hover:bg-muted'}`}
                                            >All</button>
                                            {distinctClasses.map(c => (
                                                <button key={c}
                                                    onClick={() => setFilterClass(filterClass === c ? '' : c)}
                                                    className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider transition-all border ${filterClass === c ? 'bg-primary text-foreground border-primary' : 'bg-card shadow-sm text-muted-foreground border-border hover:bg-muted'}`}
                                                >{c}</button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Grade Distribution */}
                            <GradeDistribution students={filtered} reportsMap={reportsMap} />

                            {/* Select-all bar */}
                            <div className="flex items-center justify-between px-3 py-2 bg-white/[0.03] border border-border rounded-xl">
                                <button
                                    onClick={toggleSelectAll}
                                    className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
                                >
                                    <span className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${selectedIds.size === filtered.length && filtered.length > 0 ? 'bg-primary border-primary' : 'border-border hover:border-primary'}`}>
                                        {selectedIds.size === filtered.length && filtered.length > 0 && (
                                            <CheckIcon className="w-3 h-3 text-foreground" />
                                        )}
                                    </span>
                                    {selectedIds.size > 0 ? `${selectedIds.size} selected` : 'Select all'}
                                </button>
                                <span className="text-[10px] text-muted-foreground">{filtered.length} shown</span>
                            </div>

                            {/* Parent email legend */}
                            <div className="flex items-center gap-3 px-1 text-[9px] text-muted-foreground/60 font-bold uppercase tracking-wider">
                                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> Parent email</span>
                                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-500 inline-block" /> No email</span>
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
                                    const hasParentEmail = !!(s as any).parent_email;

                                    return (
                                        <div
                                            key={s.id}
                                            onClick={() => loadStudentReport(s)}
                                            className={`flex items-center gap-2.5 p-3 rounded-xl border cursor-pointer transition-all ${isActive ? 'bg-primary/20 border-primary/40' : 'bg-card shadow-sm border-border hover:border-border hover:bg-white/[0.07]'}`}
                                        >
                                            {/* Checkbox */}
                                            <button
                                                onClick={e => toggleSelect(s.id, e)}
                                                className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${isChecked ? 'bg-primary border-primary' : 'border-border hover:border-primary'}`}
                                            >
                                                {isChecked && <CheckIcon className="w-3 h-3 text-foreground" />}
                                            </button>

                                            {/* Avatar with parent-email indicator dot */}
                                            <div className="relative flex-shrink-0">
                                                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary from-primary to-primary flex items-center justify-center text-xs font-black text-foreground">
                                                    {s.full_name ? s.full_name[0].toUpperCase() : '?'}
                                                </div>
                                                <span
                                                    title={hasParentEmail ? `Parent email: ${(s as any).parent_email}` : 'No parent email on file'}
                                                    className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-card ${hasParentEmail ? 'bg-emerald-500' : 'bg-orange-500'}`}
                                                />
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
                                <div className="border border-border rounded-xl overflow-hidden shadow-2xl flex flex-col">

                                    {/* Action bar */}
                                    <div className="bg-card shadow-sm border-b border-border px-3 sm:px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
                                        <div className="flex items-center gap-2 flex-1 min-w-0">
                                            {isStaff && (
                                                <button
                                                    onClick={() => { setShowSidebar(true); setSelectedStudent(null); setSelectedReport(null); }}
                                                    className="lg:hidden flex items-center gap-1.5 px-3 py-2 bg-card shadow-sm border border-border rounded-xl text-muted-foreground hover:text-foreground transition-colors text-[10px] font-black uppercase tracking-widest flex-shrink-0"
                                                >
                                                    <ArrowLeftIcon className="w-3.5 h-3.5" />
                                                    Students
                                                </button>
                                            )}
                                            <DocumentTextIcon className="w-4 h-4 text-primary flex-shrink-0" />
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

                                        {/* On phones this becomes one tidy swipeable strip (no tall wrap); the
                                            primary Print/Download/Share/Email + editor actions are ordered first
                                            so staff reach them without scrolling. Desktop keeps the normal wrap. */}
                                        <div className="flex flex-nowrap lg:flex-wrap items-center gap-2 overflow-x-auto lg:overflow-visible pb-1 lg:pb-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                                            {/* Term / Academic session switcher — only when the student has more than one report */}
                                            {reportHistory.length > 1 && (
                                                <select
                                                    value={selectedReport?.id ?? ''}
                                                    onChange={(e) => pickReport(reportHistory.find(x => x.id === e.target.value) ?? null)}
                                                    className="bg-card shadow-sm rounded-xl border border-border h-9 px-2 text-[10px] font-bold text-foreground flex-shrink-0 cursor-pointer max-w-[14rem] outline-none"
                                                    title="Switch term / academic session"
                                                >
                                                    {reportHistory.map(r => (
                                                        <option key={r.id} value={r.id} className="bg-card text-foreground">{reportLabel(r)}</option>
                                                    ))}
                                                </select>
                                            )}

                                            {/* Prev / Next */}
                                            {isStaff && currentIdx >= 0 && (
                                                <div className="flex items-center gap-1.5 bg-card shadow-sm p-1 rounded-xl border border-border h-9 flex-shrink-0">
                                                    <button
                                                        onClick={() => navigateTo(currentIdx - 1)}
                                                        disabled={currentIdx <= 0 || loadingReport}
                                                        className="p-1.5 rounded-xl hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-10 transition-colors"
                                                    >
                                                        <ArrowLeftIcon className="w-3.5 h-3.5" />
                                                    </button>
                                                    <span className="text-[10px] text-muted-foreground font-black tracking-tighter px-1 min-w-[3.5rem] text-center">{currentIdx + 1} / {filtered.length}</span>
                                                    <button
                                                        onClick={() => navigateTo(currentIdx + 1)}
                                                        disabled={currentIdx >= filtered.length - 1 || loadingReport}
                                                        className="p-1.5 rounded-xl hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-10 transition-colors"
                                                    >
                                                        <ArrowRightIcon className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            )}

                                            {/* Template Toggle */}
                                            <div className="flex bg-card shadow-sm p-1 rounded-xl border border-border h-9 flex-shrink-0">
                                                <button
                                                  onClick={() => setTemplate('standard')}
                                                  className={`px-3 py-1 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${template === 'standard' ? 'bg-primary text-foreground' : 'text-muted-foreground hover:text-muted-foreground'}`}
                                                >
                                                    Standard
                                                </button>
                                                <button
                                                  onClick={() => setTemplate('modern')}
                                                  className={`px-3 py-1 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${template === 'modern' ? 'bg-primary text-foreground' : 'text-muted-foreground hover:text-muted-foreground'}`}
                                                >
                                                    Modern
                                                </button>
                                                <button
                                                  onClick={() => setTemplate('printable')}
                                                  className={`px-3 py-1 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${template === 'printable' ? 'bg-primary text-foreground' : 'text-muted-foreground hover:text-muted-foreground'}`}
                                                >
                                                    Printable
                                                </button>
                                            </div>

                                            {template === 'modern' && (
                                                <div className="flex bg-card shadow-sm p-1 rounded-xl border border-border h-9 flex-shrink-0 items-center gap-1.5 px-2">
                                                    {[
                                                        { id: 'industrial', name: 'Ind.', color: 'bg-slate-900', border: 'border-primary' },
                                                        { id: 'executive', name: 'Exec.', color: 'bg-[#FDFBF2]', border: 'border-slate-800' },
                                                        { id: 'futuristic', name: 'Fut.', color: 'bg-[#050510]', border: 'border-cyan-500' }
                                                    ].map((t) => (
                                                        <button
                                                            key={t.id}
                                                            onClick={() => setModernTemplateId(t.id as 'industrial' | 'executive' | 'futuristic')}
                                                            title={t.name}
                                                            className={cn(
                                                                "relative w-7 h-5 flex items-center justify-center transition-all overflow-hidden border border-white/10",
                                                                modernTemplateId === t.id ? "ring-2 ring-primary ring-offset-1 ring-offset-card scale-110" : "opacity-40 hover:opacity-100"
                                                            )}
                                                        >
                                                            <div className={cn("absolute inset-0", t.color)} />
                                                            <div className={cn("absolute inset-0.5 border-[0.5px]", t.border, "opacity-20")} />
                                                        </button>
                                                    ))}
                                                </div>
                                            )}

                                            {/* Editor actions — grouped pill (ordered first on mobile) */}
                                            {isEditor && (selectedStudent || selectedReport) && (
                                                <div className="flex items-center gap-0.5 bg-card border border-border rounded-xl px-1 h-9 flex-shrink-0 -order-1 lg:order-none">
                                                    {selectedStudent && (
                                                        <Link
                                                            href={`/dashboard/reports/builder?student=${selectedStudent.id}`}
                                                            className="h-7 inline-flex items-center gap-1 px-2.5 text-[10px] font-black uppercase tracking-widest text-primary hover:bg-primary/10 rounded-lg transition-all"
                                                        >
                                                            <PencilSquareIcon className="w-3.5 h-3.5" /> Edit
                                                        </Link>
                                                    )}
                                                    {selectedReport && (
                                                        <>
                                                            {selectedStudent && <div className="w-px h-4 bg-border mx-0.5" />}
                                                            <button
                                                                onClick={() => { setEditCourseName(selectedReport.course_name ?? ''); setEditTerm(selectedReport.report_term ?? ''); setShowEditModal(true); }}
                                                                className="h-7 inline-flex items-center gap-1 px-2.5 text-[10px] font-black uppercase tracking-widest text-amber-400 hover:bg-amber-500/10 rounded-lg transition-all"
                                                            >
                                                                <PencilSquareIcon className="w-3 h-3" /> Rename
                                                            </button>
                                                            <div className="w-px h-4 bg-border mx-0.5" />
                                                            <button
                                                                onClick={handleInvoiceToggle}
                                                                disabled={isTogglingInvoice}
                                                                title="Toggle Invoice Visibility"
                                                                className="h-7 inline-flex items-center gap-1 px-2.5 text-[10px] font-black uppercase tracking-widest text-indigo-400 hover:bg-indigo-500/10 disabled:opacity-50 rounded-lg transition-all"
                                                            >
                                                                {isTogglingInvoice
                                                                    ? <div className="w-3 h-3 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                                                                    : ((selectedReport as any).show_payment_notice ? 'Hide Invoice' : 'Show Invoice')}
                                                            </button>
                                                            <div className="w-px h-4 bg-border mx-0.5" />
                                                            <button
                                                                onClick={handlePublishToggle}
                                                                disabled={isTogglingPublish}
                                                                title={selectedReport.is_published ? 'Unpublish report' : 'Publish report — makes it visible to student'}
                                                                className={`h-7 inline-flex items-center gap-1 px-2.5 text-[10px] font-black uppercase tracking-widest disabled:opacity-50 rounded-lg transition-all ${selectedReport.is_published ? 'text-amber-400 hover:bg-amber-500/10' : 'text-emerald-400 hover:bg-emerald-500/10'}`}
                                                            >
                                                                {isTogglingPublish
                                                                    ? <div className={`w-3 h-3 border-2 border-t-transparent rounded-full animate-spin ${selectedReport.is_published ? 'border-amber-400' : 'border-emerald-400'}`} />
                                                                    : selectedReport.is_published ? 'Unpublish' : 'Publish'}
                                                            </button>
                                                            <div className="w-px h-4 bg-border mx-0.5" />
                                                            <button
                                                                onClick={handleDeleteReport}
                                                                disabled={isDeletingReport}
                                                                title="Delete this report"
                                                                className="h-7 inline-flex items-center gap-1 px-2 text-[10px] font-black uppercase tracking-widest text-rose-400 hover:bg-rose-500/10 disabled:opacity-50 rounded-lg transition-all"
                                                            >
                                                                {isDeletingReport
                                                                    ? <div className="w-3 h-3 border-2 border-rose-400 border-t-transparent rounded-full animate-spin" />
                                                                    : <TrashIcon className="w-3.5 h-3.5" />}
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            )}

                                            {/* Print / Download / Share — flat row (ordered first on mobile) */}
                                            {selectedReport && (
                                                <div className="flex items-center gap-1.5 flex-shrink-0 -order-1 lg:order-none">
                                                    <button
                                                        onClick={() => window.print()}
                                                        title="Print"
                                                        className="h-9 inline-flex items-center gap-1.5 px-3 text-[10px] font-black uppercase tracking-widest text-foreground bg-card hover:bg-muted border border-border rounded-xl transition-all"
                                                    >
                                                        <PrinterIcon className="w-3.5 h-3.5 flex-shrink-0" /> Print
                                                    </button>
                                                    <button
                                                        onClick={downloadSinglePDF}
                                                        disabled={isDownloadingPdf}
                                                        title="Download PDF"
                                                        className="h-9 inline-flex items-center gap-1.5 px-3 text-[10px] font-black uppercase tracking-widest text-white bg-primary hover:bg-primary/90 disabled:opacity-50 rounded-xl transition-all shadow-md shadow-primary/30"
                                                    >
                                                        {isDownloadingPdf
                                                            ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                                            : <ArrowDownTrayIcon className="w-3.5 h-3.5 flex-shrink-0" />}
                                                        Download
                                                    </button>
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
                                                        className="h-9 inline-flex items-center gap-1.5 px-3 text-[10px] font-black uppercase tracking-widest text-white bg-green-600 hover:bg-green-500 disabled:opacity-50 rounded-xl transition-all shadow-md shadow-green-900/30"
                                                    >
                                                        {isSharingPdf
                                                            ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                                            : <WhatsAppIcon className="w-4 h-4 flex-shrink-0" />}
                                                        Share
                                                    </button>
                                                    <button
                                                        title="Send via Email"
                                                        onClick={() => {
                                                            setEmailShareTo((selectedStudent as any)?.parent_email || selectedStudent?.email || '');
                                                            setEmailShareError(null);
                                                            setEmailShareOpen(true);
                                                        }}
                                                        className="h-9 inline-flex items-center gap-1.5 px-3 text-[10px] font-black uppercase tracking-widest text-white bg-blue-600 hover:bg-blue-500 rounded-xl transition-all shadow-md shadow-blue-900/30"
                                                    >
                                                        <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                                        Email
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* ── Email Activity Strip ── */}
                                    {isStaff && reportToDisplay && (
                                        <div className="mx-0 border-t border-white/5">
                                            {/* Header row */}
                                            <div className="flex items-center justify-between px-4 py-2">
                                                <p className="text-[9px] font-black uppercase tracking-widest text-white/30">Email Activity</p>
                                                {loadingEmailEvents && (
                                                    <div className="w-3 h-3 border border-white/20 border-t-white/60 rounded-full animate-spin" />
                                                )}
                                                {!loadingEmailEvents && reportToDisplay.id && (
                                                    <button
                                                        onClick={() => {
                                                            setLoadingEmailEvents(true);
                                                            fetch(`/api/progress-reports/${reportToDisplay.id}/email-events`)
                                                                .then(r => r.json())
                                                                .then(j => { if (j.events) setReportEmailEvents(j.events); })
                                                                .catch(() => null)
                                                                .finally(() => setLoadingEmailEvents(false));
                                                        }}
                                                        className="text-[9px] text-white/20 hover:text-white/50 transition-colors"
                                                    >↺ Refresh</button>
                                                )}
                                            </div>

                                            {/* Sent badge from report metadata */}
                                            {(() => {
                                                const meta = (reportToDisplay as any).metadata;
                                                const sentAt = meta?.email_sent_at as string | undefined;
                                                const sentTo = meta?.email_sent_to as string | undefined;
                                                if (!sentAt) return null;
                                                return (
                                                    <div className="mx-4 mb-2 flex items-center gap-2 px-3 py-2 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                                                        <svg className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-[10px] font-bold text-blue-300 truncate">Sent to {sentTo || 'parent'}</p>
                                                            <p className="text-[9px] text-blue-400/50">{new Date(sentAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                                                        </div>
                                                        <span className="text-[9px] font-black uppercase tracking-widest text-blue-400/60">Sent</span>
                                                    </div>
                                                );
                                            })()}

                                            {/* Open events */}
                                            {reportEmailEvents.length > 0 ? (
                                                <div className="px-4 pb-3 space-y-1.5">
                                                    {reportEmailEvents.map(ev => (
                                                        <div key={ev.id} className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${ev.event === 'opened' ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-white/[0.03] border-white/5'}`}>
                                                            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${ev.event === 'opened' ? 'bg-emerald-400' : 'bg-white/20'}`} />
                                                            <div className="flex-1 min-w-0">
                                                                <p className={`text-[10px] font-bold truncate ${ev.event === 'opened' ? 'text-emerald-300' : 'text-white/40'}`}>
                                                                    {ev.email || 'Unknown recipient'}
                                                                </p>
                                                                <p className="text-[9px] text-white/25">
                                                                    {ev.occurred_at ? new Date(ev.occurred_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                                                                </p>
                                                            </div>
                                                            <span className={`text-[9px] font-black uppercase tracking-widest flex-shrink-0 ${ev.event === 'opened' ? 'text-emerald-400' : 'text-white/25'}`}>
                                                                {ev.event === 'opened' ? '✓ Opened' : ev.event}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : !loadingEmailEvents ? (
                                                <p className="px-4 pb-3 text-[9px] text-white/20 italic">No opens recorded yet.</p>
                                            ) : null}
                                        </div>
                                    )}

                                    {/* Email share modal */}
                                    {emailShareOpen && reportToDisplay && (
                                        <div className="fixed inset-0 z-[300] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
                                            <div className="w-full max-w-sm bg-[#0f0f1a] border border-white/10 rounded-2xl shadow-2xl p-5 space-y-4">
                                                <div className="flex items-center justify-between">
                                                    <p className="text-sm font-black text-white">Email Report PDF</p>
                                                    <button onClick={() => setEmailShareOpen(false)} className="text-white/40 hover:text-white">
                                                        <XMarkIcon className="w-4 h-4" />
                                                    </button>
                                                </div>
                                                <p className="text-[11px] text-white/50">The report will be attached as a PDF. Enter the recipient's email address below.</p>
                                                {(selectedStudent as any)?.parent_email && (
                                                    <p className="text-[10px] text-emerald-400 font-bold">
                                                        ✓ Pre-filled with parent email on file
                                                    </p>
                                                )}
                                                <div>
                                                    <label className="block text-[10px] font-black text-white/40 uppercase tracking-widest mb-1.5">Recipient Email</label>
                                                    <input
                                                        type="email"
                                                        value={emailShareTo}
                                                        onChange={e => setEmailShareTo(e.target.value)}
                                                        placeholder="parent@example.com"
                                                        className="w-full px-4 py-2.5 bg-white/5 border border-white/10 text-sm text-white placeholder-white/30 focus:outline-none focus:border-blue-500/50 rounded-lg font-mono"
                                                        autoFocus
                                                    />
                                                </div>
                                                {emailShareError && (
                                                    <p className="text-xs text-red-400 font-bold">{emailShareError}</p>
                                                )}
                                                <div className="flex gap-2">
                                                    <button onClick={() => setEmailShareOpen(false)}
                                                        className="flex-1 py-2.5 border border-white/10 text-white/50 hover:text-white text-[10px] font-black uppercase tracking-widest rounded-lg transition-colors">
                                                        Cancel
                                                    </button>
                                                    <button onClick={sendReportByEmail}
                                                        disabled={!emailShareTo.trim() || emailShareSending}
                                                        className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-[10px] font-black uppercase tracking-widest rounded-lg transition-colors flex items-center justify-center gap-2">
                                                        {emailShareSending
                                                            ? <><div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> Sending…</>
                                                            : <>Send PDF</>}
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Bulk email summary modal */}
                                    {showBulkEmailSummary && bulkEmailResults.length > 0 && (
                                        <div className="fixed inset-0 z-[300] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
                                            <div className="w-full max-w-lg bg-[#0f0f1a] border border-white/10 rounded-2xl shadow-2xl p-5 space-y-4 max-h-[80vh] flex flex-col">
                                                <div className="flex items-center justify-between">
                                                    <p className="text-sm font-black text-white">Bulk Email Results</p>
                                                    <button onClick={() => setShowBulkEmailSummary(false)} className="text-white/40 hover:text-white">
                                                        <XMarkIcon className="w-4 h-4" />
                                                    </button>
                                                </div>
                                                <div className="flex gap-4 text-xs font-bold">
                                                    <span className="text-emerald-400">{bulkEmailResults.filter(r => r.success).length} sent</span>
                                                    <span className="text-red-400">{bulkEmailResults.filter(r => !r.success).length} failed</span>
                                                </div>
                                                <div className="overflow-y-auto flex-1 space-y-2 pr-1">
                                                    {bulkEmailResults.map((r, i) => (
                                                        <div key={i} className={`flex items-start gap-3 p-3 rounded-xl border ${r.success ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-red-500/20 bg-red-500/5'}`}>
                                                            <div className={`mt-0.5 flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center ${r.success ? 'bg-emerald-500' : 'bg-red-500'}`}>
                                                                {r.success
                                                                    ? <CheckIcon className="w-2.5 h-2.5 text-white" />
                                                                    : <XMarkIcon className="w-2.5 h-2.5 text-white" />}
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <p className="text-xs font-bold text-white truncate">{r.studentName}</p>
                                                                <p className="text-[10px] text-white/40 truncate">{r.email}</p>
                                                                {!r.success && r.error && (
                                                                    <p className="text-[10px] text-red-400 mt-0.5">{r.error}</p>
                                                                )}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                                <button
                                                    onClick={() => setShowBulkEmailSummary(false)}
                                                    className="w-full py-2.5 bg-white/5 hover:bg-white/10 text-white/70 text-[10px] font-black uppercase tracking-widest rounded-lg transition-colors"
                                                >
                                                    Close
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {/* Report body */}
                                    {loadingReport ? (
                                        <div className="flex items-center justify-center h-72 bg-white/[0.02]">
                                            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                                        </div>
                                    ) : reportToDisplay ? (
                                         <div className="overflow-auto bg-muted p-2 sm:p-6 lg:p-8" style={{ maxHeight: '75vh' }}>
                                            <ScaledReportCard report={reportToDisplay} responsive={template === 'modern'}>
                                                {template === 'standard' ? (
                                                    <ReportCard report={reportToDisplay} orgSettings={orgSettings} />
                                                ) : template === 'printable' ? (
                                                    <PrintableReport report={reportToDisplay} orgSettings={orgSettings} />
                                                ) : (
                                                    <ModernReportCard report={reportToDisplay} orgSettings={orgSettings} />
                                                )}
                                            </ScaledReportCard>
                                        </div>
                                    ) : null}
                                </div>

                            ) : (
                                /* Student selected but has no report */
                                <div className="flex flex-col items-center justify-center min-h-[400px] bg-card shadow-sm border border-border rounded-xl gap-3">
                                    <DocumentTextIcon className="w-12 h-12 text-muted-foreground" />
                                    <p className="text-muted-foreground text-sm font-semibold">
                                        No report for {selectedStudent?.full_name}
                                    </p>
                                    {isEditor && selectedStudent && (
                                        <Link
                                            href={`/dashboard/reports/builder?student=${selectedStudent.id}`}
                                            className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary/20 text-primary text-sm font-bold rounded-xl border border-primary/30 hover:bg-primary/30 transition-colors"
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
                            <div className="flex flex-col items-center justify-center min-h-[500px] bg-card shadow-sm border border-border rounded-xl gap-3">
                                <AcademicCapIcon className="w-14 h-14 text-muted-foreground" />
                                <p className="text-muted-foreground text-sm font-semibold">Select a student to view their report</p>
                                <p className="text-muted-foreground text-xs">Or select multiple students and click Download PDFs</p>
                                {isEditor && (
                                    <Link
                                        href="/dashboard/reports/builder"
                                        className="mt-2 inline-flex items-center gap-2 px-5 py-2.5 bg-primary/20 text-primary text-sm font-bold rounded-xl border border-primary/30 hover:bg-primary/30 transition-colors"
                                    >
                                        <PencilSquareIcon className="w-4 h-4" /> Create First Report
                                    </Link>
                                )}
                            </div>
                        )}
                    </div>
                </div>
                )}
            </div>

            {/* ══ Print view — branded letterhead + performance table (list only, no report selected) ══ */}
            <div className={(selectedReport || bulkPrintReports) ? 'hidden' : 'hidden print:block'} style={{ fontFamily: 'system-ui, sans-serif', color: '#111827' }}>

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
                    <div style={{ display: 'flex', gap: '10px' }}>
                      {WAEC_TIERS.map(tier => {
                        const cnt = filtered.filter(s => {
                          const g = (reportsMap[s.id]?.overall_grade ?? '').toUpperCase().trim();
                          return tier.codes.includes(g) ||
                            (g.length === 1 && tier.codes.some(c => c[0] === g));
                        }).length;
                        const hexMap: Record<string, string> = {
                          'A1': '#10b981', 'B2/B3': '#22c55e', 'C': '#3b82f6',
                          'D7': '#f59e0b', 'E8': '#f97316', 'F9': '#ef4444',
                        };
                        return cnt > 0 ? (
                          <div key={tier.label} style={{ textAlign: 'center', color: '#fff' }}>
                            <div style={{ fontSize: '16px', fontWeight: 900, lineHeight: 1 }}>{cnt}</div>
                            <div style={{ fontSize: '9px', fontWeight: 700, color: hexMap[tier.label] ?? '#9ca3af', background: 'rgba(255,255,255,0.15)', borderRadius: '4px', padding: '1px 5px', marginTop: '2px' }}>{tier.label}</div>
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
                        const grade = r?.overall_grade ?? null;
                        const gradeColors: Record<string,string> = { A1:'#10b981', B2:'#22c55e', B3:'#22c55e', C4:'#3b82f6', C5:'#3b82f6', C6:'#3b82f6', D7:'#f59e0b', E8:'#f97316', F9:'#ef4444' };
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
            {bulkPrintReports ? (
                <div className="hidden print:block print:w-[794px] print:mx-auto">
                    {bulkPrintReports.map((report, idx) => (
                        <div key={report.id || idx} style={{ pageBreakAfter: 'always' }}>
                            {template === 'standard' ? (
                                <ReportCard report={report} orgSettings={orgSettings} />
                            ) : template === 'printable' ? (
                                <PrintableReport report={report} orgSettings={orgSettings} />
                            ) : (
                                <ModernReportCard report={report} orgSettings={orgSettings} />
                            )}
                        </div>
                    ))}
                </div>
            ) : reportToDisplay ? (
                <div className="hidden print:block print:w-[794px] print:mx-auto">
                    {template === 'standard' ? (
                        <ReportCard report={reportToDisplay} orgSettings={orgSettings} />
                    ) : template === 'printable' ? (
                        <PrintableReport report={reportToDisplay} orgSettings={orgSettings} />
                    ) : (
                        <ModernReportCard report={reportToDisplay} orgSettings={orgSettings} />
                    )}
                </div>
            ) : null}

            {/* ══ Off-screen div — single PDF capture ══ */}
            <div className="print:hidden" style={{ position: 'fixed', left: -9999, top: 0, pointerEvents: 'none', zIndex: -100 }} aria-hidden="true">
                <div ref={printableRef}>
                    {reportToDisplay && (
                        template === 'modern' ? (
                            <ModernReportCard report={reportToDisplay} orgSettings={orgSettings} />
                        ) : template === 'printable' ? (
                            <PrintableReport report={reportToDisplay} orgSettings={orgSettings} />
                        ) : (
                            <ReportCard report={reportToDisplay} orgSettings={orgSettings} />
                        )
                    )}
                </div>
            </div>

            {/* ══ Off-screen div — batch PDF capture (one at a time) ══ */}
            <div className="print:hidden" style={{ position: 'fixed', left: -9999, top: 0, pointerEvents: 'none', zIndex: -100 }} aria-hidden="true">
                <div ref={captureRef}>
                    {captureReport && (
                        template === 'modern' ? (
                            <ModernReportCard report={captureReport} orgSettings={orgSettings} />
                        ) : template === 'printable' ? (
                            <PrintableReport report={captureReport} orgSettings={orgSettings} />
                        ) : (
                            <ReportCard report={captureReport} orgSettings={orgSettings} />
                        )
                    )}
                </div>
            </div>

            {/* ══ Edit / Rename modal ══ */}
            {showEditModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm print:hidden" onClick={() => setShowEditModal(false)}>
                    <div className="bg-background border border-border rounded-xl p-6 w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-5">
                            <div>
                                <h3 className="text-base font-extrabold text-foreground">Rename / Reassign Report</h3>
                                <p className="text-xs text-muted-foreground mt-0.5">{selectedStudent?.full_name}</p>
                            </div>
                            <button onClick={() => setShowEditModal(false)} className="p-1.5 rounded-xl hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
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
                                    className="w-full px-4 py-2.5 bg-card shadow-sm border border-border rounded-xl text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary transition-colors"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-muted-foreground mb-1.5 uppercase tracking-wider">Report Term</label>
                                <input
                                    type="text"
                                    value={editTerm}
                                    onChange={e => setEditTerm(e.target.value)}
                                    placeholder="e.g. First Term 2025/2026"
                                    className="w-full px-4 py-2.5 bg-card shadow-sm border border-border rounded-xl text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary transition-colors"
                                />
                            </div>
                        </div>

                        <div className="flex gap-3 mt-6">
                            <button
                                onClick={() => setShowEditModal(false)}
                                className="flex-1 py-2.5 bg-card shadow-sm border border-border rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-all font-semibold"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSaveEdit}
                                disabled={isSavingEdit || !editCourseName.trim()}
                                className="flex-1 py-2.5 bg-primary hover:bg-primary disabled:opacity-50 disabled:cursor-not-allowed rounded-xl text-sm text-foreground font-bold transition-all shadow-lg shadow-primary/30"
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
                <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
        }>
            <ResultsPageInner />
        </Suspense>
    );
}
