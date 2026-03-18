// @refresh reset
'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import { Database } from '@/types/supabase';
import ReportCard, { letterGrade as importedReportGrade } from '@/components/reports/ReportCard';
import { generateReportPDF, ScaledReportCard } from '@/lib/pdf-utils';
import {
    ArrowLeftIcon, CheckIcon, ArrowPathIcon, ExclamationTriangleIcon,
    UserGroupIcon, DocumentTextIcon, EyeIcon, XMarkIcon,
    Cog6ToothIcon, ArrowUpTrayIcon, ChevronDownIcon, ChevronUpIcon,
    PhotoIcon, RocketLaunchIcon, CloudArrowUpIcon, ChevronRightIcon,
    CheckCircleIcon, PrinterIcon, SparklesIcon,
} from '@/lib/icons';

type StudentReport = Database['public']['Tables']['student_progress_reports']['Row'];
type PortalUser = Database['public']['Tables']['portal_users']['Row'];
type Course = Database['public']['Tables']['courses']['Row'];

// ── Types ────────────────────────────────────────────────────────────────────

interface SessionConfig {
    instructor_name: string;
    report_date: string;
    report_term: string;
    report_period: string;
    course_id: string;
    course_name: string;
    school_name: string;
    section_class: string;
    current_module: string;
    next_module: string;
    course_duration: string;
    learning_milestones: string[];
    school_id?: string;
    // School structure & optional payment info
    school_section: string;   // '' | 'Primary' | 'Secondary' | 'Unified'
    fee_label: string;        // e.g. 'Coding Club Fee', 'Extra-Curricular Fee'
    fee_amount: string;       // optional numeric string, leave blank to omit
    show_payment_notice: boolean; // prints next-term Rillcod payment details on report
}

// ── Constants ─────────────────────────────────────────────────────────────────

const GRADE_OPTIONS = ['Excellent', 'Very Good', 'Good', 'Fair', 'Poor', 'Not Specified'];
const CLASS_PRESETS = [
    'Kindergarten',
    'Basic 1', 'Basic 2', 'Basic 3', 'Basic 4', 'Basic 5', 'Basic 6',
    'JSS 1', 'JSS 2', 'JSS 3',
    'SS 1', 'SS 2', 'SS 3',
    'Cohort A', 'Cohort B', 'Cohort C',
];
const TERM_OPTIONS = ['Termly', 'Mid-Term', 'First Term', 'Second Term', 'Third Term', 'Annual'];
const PROFICIENCY_OPTIONS = ['beginner', 'intermediate', 'advanced'];
const DURATION_OPTIONS = ['Termly', '4 weeks', '6 weeks', '8 weeks', '10 weeks', '12 weeks', '3 months', '6 months', 'Full Year'];
const PERIOD_PRESETS = ['2024/2025 First Term', '2024/2025 Second Term', '2024/2025 Third Term', '2025/2026 First Term', '2025/2026 Second Term', '2025/2026 Third Term'];

const INPUT = 'w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/25 focus:outline-none focus:border-violet-500 transition-colors';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div>
            <label className="block text-xs font-semibold text-white/40 uppercase tracking-wider mb-1.5">{label}</label>
            {children}
        </div>
    );
}

function Section({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
    return (
        <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-3 bg-white/[0.03] border-b border-white/10">
                <span>{icon}</span>
                <h3 className="text-xs font-bold text-white/60 uppercase tracking-widest">{title}</h3>
            </div>
            <div className="p-5 space-y-4">{children}</div>
        </div>
    );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ReportBuilderPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-[#0f0f1a] flex items-center justify-center">
                <div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
            </div>
        }>
            <ReportBuilderInner />
        </Suspense>
    );
}

function ReportBuilderInner() {
    const searchParams = useSearchParams();
    const prefStudentId = searchParams.get('student');

    const { profile, loading: authLoading, profileLoading } = useAuth();
    
    // ── Permissions ──────────────────────────────────────────────────────────
    const isStaff = profile?.role === 'admin' || profile?.role === 'teacher' || profile?.role === 'school';
    const isAdmin = profile?.role === 'admin';

    // ── Data ──────────────────────────────────────────────────────────────────
    const [students, setStudents] = useState<PortalUser[]>([]);
    const [courses, setCourses] = useState<Course[]>([]);
    const [schools, setSchools] = useState<{ id: string; name: string }[]>([]);
    const [search, setSearch] = useState('');
    const [classFilter, setClassFilter] = useState('');

    // ── Step: 'session' | 'pick' | 'edit' ────────────────────────────────────
    const [step, setStep] = useState<'session' | 'pick' | 'edit'>('session');
    const [sessionDone, setSessionDone] = useState(false); // true once user clicks "Start Grading"

    // ── Session config (shared for all students in this grading session) ──────
    const [sessionConfig, setSessionConfig] = useState<SessionConfig>({
        instructor_name: '',
        report_date: '',
        report_term: 'First Term',
        report_period: '',
        course_id: '',
        course_name: '',
        school_name: '',
        section_class: '',
        current_module: '',
        next_module: '',
        course_duration: 'Termly',
        learning_milestones: [],
        school_section: 'school',
        fee_label: '',
        fee_amount: '',
        show_payment_notice: false,
    });
    const [sessionExpanded, setSessionExpanded] = useState(true); // collapsed after "Start Grading"

    // ── Per-student state ─────────────────────────────────────────────────────
    const [selectedStudent, setSelectedStudent] = useState<PortalUser | null>(null);
    const [existingReport, setExistingReport] = useState<StudentReport | null>(null);
    const [currentStudentIdx, setCurrentStudentIdx] = useState(-1);

    const [form, setForm] = useState({
        student_name: '',
        section_class: '',
        theory_score: '0',
        practical_score: '0',
        attendance_score: '0',
        participation_grade: 'Good',
        projects_grade: 'Good',
        homework_grade: 'Good',
        proficiency_level: 'intermediate',
        key_strengths: '',
        areas_for_growth: '',
        is_published: false,
        photo_url: '',
        fee_status: '' as '' | 'paid' | 'outstanding' | 'partial' | 'sponsored' | 'waived',
        participation_score: '0',
    });

    // ── UI state ──────────────────────────────────────────────────────────────
    const [saving, setSaving] = useState(false);
    const [publishing, setPublishing] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [generating, setGenerating] = useState<string | null>(null);
    const [fetchingStats, setFetchingStats] = useState(false);
    const [studentStats, setStudentStats] = useState({ attendance: 0, totalSessions: 0, assignments: 0, totalAssignments: 0 });
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [showPreview, setShowPreview] = useState(false);
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [milestoneInput, setMilestoneInput] = useState('');
    const [isBulkBuilding, setIsBulkBuilding] = useState(false);
    const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0 });
    const pdfRef = useRef<HTMLDivElement>(null);

    const [branding, setBranding] = useState({
        org_name: '', org_tagline: '', org_address: '',
        org_phone: '', org_email: '', org_website: '', logo_url: '',
    });

    // ── Local Grade Helper (Avoids conflict with imported one) ─────────────
    const reportGrade = (score: number) => {
        if (score >= 90) return { g: 'A+', label: 'Exceptional' };
        if (score >= 80) return { g: 'A', label: 'Excellent' };
        if (score >= 70) return { g: 'B', label: 'Very Good' };
        if (score >= 60) return { g: 'C', label: 'Good' };
        if (score >= 50) return { g: 'D', label: 'Fair' };
        return { g: 'F', label: 'Needs Improvement' };
    };

    // ── Restore session config from localStorage + init date ──────────────────
    // ── Restore session config from localStorage + init date ──────────────────
    useEffect(() => {
        if (typeof window === 'undefined' || !profile?.id) return;
        const storageKey = `rillcod_report_session_${profile.id}`;
        try {
            const saved = localStorage.getItem(storageKey);
            if (saved) {
                const parsed = JSON.parse(saved) as Partial<SessionConfig>;
                setSessionConfig(s => ({ ...s, ...parsed }));
            }
        } catch { /* ignore */ }
        setSessionConfig(s => ({ ...s, report_date: new Date().toISOString().split('T')[0] }));
    }, [profile?.id]);

    // ── Persist session config to localStorage on every change ────────────────
    // ── Persist session config to localStorage on every change ────────────────
    useEffect(() => {
        if (typeof window === 'undefined' || !profile?.id) return;
        const storageKey = `rillcod_report_session_${profile.id}`;
        try {
            localStorage.setItem(storageKey, JSON.stringify(sessionConfig));
        } catch { /* ignore */ }
    }, [sessionConfig, profile?.id]);

    // ── Load students, courses, branding ─────────────────────────────────────
    useEffect(() => {
        if (authLoading) return;
        if (!profile) {
            // Clear state if not authenticated
            setStudents([]);
            setCourses([]);
            setSchools([]);
            return;
        }

        const db = createClient();

        async function loadData() {
            // 1. Fetch assigned schools via API (service role — bypasses RLS for teachers)
            let schoolsList: { id: string; name: string }[] = [];

            // Fetch schools via API (uses service role — bypasses RLS for teachers)
            const schRes = await fetch('/api/schools', { cache: 'no-store' });
            if (schRes.ok) {
                const schJson = await schRes.json();
                schoolsList = (schJson.data ?? []).map((s: any) => ({ id: s.id, name: s.name }));
            }

            // 2. Fetch the "Pool" from portal_users — always scoped to assigned schools for non-admins
            let studentQuery = db.from('portal_users')
                .select('*')
                .neq('is_deleted', true);

            if (!isAdmin) {
                studentQuery = studentQuery.eq('role', 'student');
                if (schoolsList.length > 0) {
                    // Build or-filter: match by school_id (primary) OR by school_name for legacy records
                    const schoolIds = schoolsList.map(s => s.id).filter(Boolean);
                    const schoolNames = schoolsList.map(s => s.name).filter(Boolean);
                    const idPart = `school_id.in.(${schoolIds.join(',')})`;
                    const namePart = schoolNames.length > 0
                        ? schoolNames.map(n => `school_name.eq.${n}`).join(',')
                        : '';
                    const orClause = namePart ? `${idPart},${namePart}` : idPart;
                    studentQuery = (studentQuery as any).or(orClause);
                } else {
                    // No schools assigned — show nothing
                    studentQuery = studentQuery.eq('id', '00000000-0000-0000-0000-000000000000');
                }
            }

            const [sRes, cRes, bRes] = await Promise.all([
                studentQuery.order('full_name').limit(isAdmin ? 5000 : 1000),
                db.from('courses').select('*').eq('is_active', true).order('title'),
                db.from('report_settings').select('*').limit(1).maybeSingle(),
            ]);

            setStudents(sRes.data ?? []);
            setCourses(cRes.data ?? []);
            setSchools(schoolsList);
            // Note: school auto-fill is handled below in the instructor_name setSessionConfig call
            if (bRes.data) {
                setBranding({
                    org_name: bRes.data.org_name ?? '',
                    org_tagline: bRes.data.org_tagline ?? '',
                    org_address: bRes.data.org_address ?? '',
                    org_phone: bRes.data.org_phone ?? '',
                    org_email: bRes.data.org_email ?? '',
                    org_website: bRes.data.org_website ?? '',
                    logo_url: bRes.data.logo_url ?? '',
                });
            }
            setSessionConfig(s => ({
                ...s,
                instructor_name: s.instructor_name || profile?.full_name || '',
                // Auto-fill school from profile if not already set
                school_name: s.school_name || profile?.school_name || (schoolsList.length === 1 ? schoolsList[0].name : ''),
                school_id: s.school_id || profile?.school_id || (schoolsList.length === 1 ? schoolsList[0].id : ''),
            }));

            if (prefStudentId) {
                const s = (sRes.data ?? []).find(x => x.id === prefStudentId);
                if (s) selectStudent(s as PortalUser, 0);
            }
        }

        loadData();
    }, [profile?.id, authLoading]); // eslint-disable-line

    const filteredStudents = students.filter(s => {
        const matchesSearch = !search || s.full_name?.toLowerCase().includes(search.toLowerCase()) || s.email?.toLowerCase().includes(search.toLowerCase());

        // School filter: for non-admins the DB query already scopes to their schools,
        // but if they've also picked a specific school in Step 1 narrow it further.
        // Admins can bypass the school filter when searching.
        const matchesSchool = isAdmin
            ? (!sessionConfig.school_name || s.school_name === sessionConfig.school_name || !!search)
            : (!sessionConfig.school_name || s.school_name === sessionConfig.school_name);

        // Class filter: classFilter (step-2 dropdown) takes precedence over session class
        const effectiveClass = classFilter || sessionConfig.section_class;
        const matchesClass = !effectiveClass || (s as any).section_class === effectiveClass;

        return matchesSearch && matchesSchool && matchesClass;
    });

    const distinctClasses = [...new Set(
        students
            .filter(s => !sessionConfig.school_name || s.school_name === sessionConfig.school_name)
            .map(s => (s as any).section_class)
            .filter(Boolean)
    )].sort() as string[];

    // ── Select student: load existing report, fill form ───────────────────────
    async function selectStudent(s: PortalUser, idx: number) {
        setSelectedStudent(s);
        setCurrentStudentIdx(idx);
        setError(''); setSuccess('');

        const db = createClient();
        const { data: report } = await db
            .from('student_progress_reports')
            .select('*')
            .eq('student_id', s.id)
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        setExistingReport(report ?? null);

        // If an existing report has session-level fields, hydrate sessionConfig so
        // editing via direct URL (?student=id) doesn't overwrite them with blanks on save.
        if (report) {
            setSessionConfig(prev => ({
                instructor_name: report.instructor_name ?? prev.instructor_name,
                report_date: report.report_date ?? prev.report_date,
                report_term: report.report_term ?? prev.report_term,
                report_period: report.report_period ?? prev.report_period,
                course_id: report.course_id ?? prev.course_id,
                course_name: report.course_name ?? prev.course_name,
                school_id: report.school_id ?? prev.school_id,
                school_name: (report.school_name ?? prev.school_name) || (s as any).school_name || '',
                section_class: (report.section_class ?? prev.section_class) || (s as any).section_class || '',
                current_module: report.current_module ?? prev.current_module,
                next_module: report.next_module ?? prev.next_module,
                course_duration: report.course_duration ?? prev.course_duration,
                learning_milestones: Array.isArray(report.learning_milestones) && report.learning_milestones.length > 0
                    ? report.learning_milestones as string[]
                    : prev.learning_milestones,
                school_section: (report as any).school_section ?? prev.school_section,
                fee_label: (report as any).fee_label ?? prev.fee_label,
                fee_amount: (report as any).fee_amount ?? prev.fee_amount,
                show_payment_notice: (report as any).show_payment_notice ?? prev.show_payment_notice,
            }));
        }

        setForm({
            student_name: s.full_name ?? '',
            section_class: report?.section_class ?? (s as any).section_class ?? '',
            theory_score: String(report?.theory_score ?? 0),
            practical_score: String(report?.practical_score ?? 0),
            attendance_score: String(report?.attendance_score ?? 0),
            participation_grade: report?.participation_grade ?? 'Good',
            projects_grade: report?.projects_grade ?? 'Good',
            homework_grade: report?.homework_grade ?? 'Good',
            proficiency_level: report?.proficiency_level ?? 'intermediate',
            key_strengths: report?.key_strengths ?? '',
            areas_for_growth: report?.areas_for_growth ?? '',
            is_published: report?.is_published ?? false,
            photo_url: report?.photo_url ?? (s as any).photo_url ?? '',
            fee_status: ((report as any)?.fee_status ?? '') as any,
            participation_score: String(report?.participation_score ?? 0),
        });

        // ── Fetch realistic stats ─────────────────────────────────────────────
        setFetchingStats(true);
        try {
            // 1. Find the class ID for this student by matching section_class and school
            const studentSchoolId = s.school_id;
            const studentClassName = (s as any).section_class;

            let targetClassId = (s as any).class_id;

            if (!targetClassId && studentClassName) {
                const { data: clsData } = await db.from('classes')
                    .select('id')
                    .eq('name', studentClassName)
                    .eq('school_id', studentSchoolId || '')
                    .maybeSingle();
                targetClassId = clsData?.id;
            }

            // 2. Fetch sessions for that class
            const { data: sessions } = targetClassId
                ? await db.from('class_sessions').select('id').eq('class_id', targetClassId).eq('is_active', true)
                : { data: [] };
            const sessionIds = sessions?.map(x => x.id) || [];

            const [attRes, subRes, allAssignments] = await Promise.all([
                sessionIds.length > 0 ? db.from('attendance').select('id').eq('user_id', s.id).in('session_id', sessionIds).eq('status', 'present') : { data: [] },
                db.from('assignment_submissions').select('id').eq('portal_user_id', s.id).eq('status', 'graded'),
                db.from('assignments').select('id').eq('course_id', sessionConfig.course_id).eq('is_active', true)
            ]);

            setStudentStats({
                attendance: attRes.data?.length || 0,
                totalSessions: sessionIds.length || 12, // fallback to typical term length
                assignments: subRes.data?.length || 0,
                totalAssignments: allAssignments.data?.length || 8, // fallback
            });

            // Fallback / Suggestion for participation if unset
            if (form.participation_score === '0' || !form.participation_score) {
                const attRatio = (attRes.data?.length || 0) / (sessionIds.length || 12);
                const subRatio = (subRes.data?.length || 0) / (allAssignments.data?.length || 8);
                const suggested = Math.min(100, Math.round(attRatio * 70 + subRatio * 30));
                setForm(f => ({ ...f, participation_score: String(suggested) }));
            }
        } catch { /* silent fail */ } finally {
            setFetchingStats(false);
        }

        setStep('edit');
        setSessionExpanded(false);
    }

    const overallScore = Math.round(
        (parseFloat(form.theory_score) || 0) * 0.35 +
        (parseFloat(form.practical_score) || 0) * 0.35 +
        (parseFloat(form.attendance_score) || 0) * 0.15 +
        (parseFloat(form.participation_score) || 0) * 0.15
    );

    // We use the helper from ReportCard which returns an object with {g,label,color}.
    // convert it to a simple string when rendering or saving, otherwise React will
    // try to render the object and throw an error ("Objects are not valid as a
    // React child").
    const overallGradeObj = reportGrade(overallScore);
    const overallGradeLetter = overallGradeObj.g; // e.g. "A", "B" etc.

    // ── Bulk Build: Process all students in current view ─────────────────────
    const handleBulkBuild = async () => {
        if (filteredStudents.length === 0) return;
        if (!confirm(`Are you sure you want to automatically generate reports for ${filteredStudents.length} students? This will overwrite individual drafts.`)) return;
        
        setIsBulkBuilding(true);
        setBulkProgress({ current: 0, total: filteredStudents.length });
        const db = createClient();

        try {
            // Find current program ID from course
            const { data: courseData } = await db.from('courses').select('program_id').eq('id', sessionConfig.course_id).single();
            const programId = courseData?.program_id;

            for (let i = 0; i < filteredStudents.length; i++) {
                const s = filteredStudents[i];
                setBulkProgress({ current: i + 1, total: filteredStudents.length });

                // 1. Fetch Stats (Attendance, Assignments, CBT)
                const studentSchoolId = s.school_id;
                const studentClassName = (s as any).section_class;
                let targetClassId = (s as any).class_id;
                if (!targetClassId && studentClassName) {
                    const { data: clsData } = await db.from('classes').select('id').eq('name', studentClassName).eq('school_id', studentSchoolId || '').maybeSingle();
                    targetClassId = clsData?.id;
                }
                const { data: sessions } = targetClassId ? await db.from('class_sessions').select('id').eq('class_id', targetClassId).eq('is_active', true) : { data: [] };
                const sessionIds = sessions?.map(x => x.id) || [];

                const [attRes, subRes, allAsgn, cbtRes] = await Promise.all([
                    sessionIds.length > 0 ? db.from('attendance').select('id').eq('user_id', s.id).in('session_id', sessionIds).eq('status', 'present') : { data: [] },
                    db.from('assignment_submissions').select('grade').eq('portal_user_id', s.id).eq('status', 'graded'),
                    db.from('assignments').select('id').eq('course_id', sessionConfig.course_id).eq('is_active', true),
                    programId ? db.from('cbt_sessions').select('score').eq('user_id', s.id).eq('exam_id', programId).order('score', { ascending: false }).limit(1) : { data: [] }
                ]);

                // 2. Calculate scores
                const attPct = sessionIds.length > 0 ? Math.min(100, Math.round((attRes.data?.length || 0) / sessionIds.length * 100)) : 80;
                const cbtScore = cbtRes.data?.[0]?.score || 0;
                const asgnGrades = subRes.data?.map(sub => sub.grade).filter(g => g !== null) || [];
                const asgnAvg = asgnGrades.length > 0 ? Math.round(asgnGrades.reduce((a, b) => a + b, 0) / asgnGrades.length) : 0;
                const assigPct = allAsgn.data?.length ? Math.round((subRes.data?.length || 0) / allAsgn.data.length * 100) : 0;

                // 3. Map to Report Fields
                const theory = cbtScore || Math.min(100, asgnAvg + 5); 
                const practical = asgnAvg || theory;
                const participation = Math.min(100, Math.round(attPct * 0.7 + assigPct * 0.3));

                // 4. Check for existing report
                const { data: existing } = await db.from('student_progress_reports').select('id').eq('student_id', s.id).eq('report_term', sessionConfig.report_term).order('updated_at', { ascending: false }).maybeSingle();

                const overall = Math.round(theory * 0.35 + practical * 0.35 + attPct * 0.15 + participation * 0.15);
                const gradeLetter = reportGrade(overall).g;

                const payload: any = {
                    student_id: s.id,
                    teacher_id: profile!.id,
                    school_id: sessionConfig.school_id || s.school_id || null,
                    course_id: sessionConfig.course_id || null,
                    student_name: s.full_name,
                    school_name: sessionConfig.school_name || s.school_name,
                    section_class: (s as any).section_class || sessionConfig.section_class,
                    course_name: sessionConfig.course_name,
                    report_date: sessionConfig.report_date,
                    report_term: sessionConfig.report_term,
                    report_period: sessionConfig.report_period,
                    instructor_name: sessionConfig.instructor_name,
                    theory_score: theory,
                    practical_score: practical,
                    attendance_score: attPct,
                    participation_score: participation,
                    overall_score: overall,
                    overall_grade: gradeLetter,
                    proficiency_level: overall >= 80 ? 'advanced' : overall >= 50 ? 'intermediate' : 'beginner',
                    is_published: false,
                    updated_at: new Date().toISOString(),
                };

                const bulkRes = await fetch('/api/progress-reports', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ...payload, existing_id: existing?.id ?? null }),
                });
                if (!bulkRes.ok) {
                    const j = await bulkRes.json();
                    throw new Error(j.error || 'Failed to save report');
                }
            }
            setSuccess(`Successfully generated ${filteredStudents.length} report drafts!`);
            // Trigger a data refresh for student list
            selectStudent(filteredStudents[0], 0); 
        } catch (err: any) {
            setError('Bulk build failed: ' + err.message);
        } finally {
            setIsBulkBuilding(false);
        }
    };

    // ── Save report ───────────────────────────────────────────────────────────
    const handleSave = async (publish = false) => {
        if (!selectedStudent) return;
        if (publish) setPublishing(true); else setSaving(true);
        setError(''); setSuccess('');

        try {
            const payload = {
                student_id: selectedStudent.id,
                school_id: sessionConfig.school_id || (selectedStudent as any).school_id || profile?.school_id || null,
                course_id: sessionConfig.course_id || null,
                student_name: form.student_name,
                school_name: sessionConfig.school_name || (selectedStudent as any).school_name || null,
                section_class: form.section_class || sessionConfig.section_class || (selectedStudent as any).section_class || null,
                course_name: sessionConfig.course_name,
                report_date: sessionConfig.report_date,
                report_term: sessionConfig.report_term,
                report_period: sessionConfig.report_period || null,
                instructor_name: sessionConfig.instructor_name,
                current_module: sessionConfig.current_module || null,
                next_module: sessionConfig.next_module || null,
                learning_milestones: sessionConfig.learning_milestones,
                course_duration: sessionConfig.course_duration || null,
                theory_score: parseFloat(form.theory_score) || 0,
                practical_score: parseFloat(form.practical_score) || 0,
                attendance_score: parseFloat(form.attendance_score) || 0,
                participation_grade: form.participation_grade,
                projects_grade: form.projects_grade,
                homework_grade: form.homework_grade,
                overall_grade: overallGradeLetter,
                overall_score: overallScore,
                key_strengths: form.key_strengths || null,
                areas_for_growth: form.areas_for_growth || null,
                has_certificate: overallScore >= 45,
                certificate_text: overallScore >= 45
                    ? `This document officially recognizes that ${form.student_name} has successfully completed the intensive study programme in ${sessionConfig.course_name || 'the enrolled course'}.`
                    : null,
                course_completed: overallScore >= 45 ? `Completed — ${sessionConfig.report_term}` : null,
                proficiency_level: form.proficiency_level as 'beginner' | 'intermediate' | 'advanced',
                is_published: publish ? true : form.is_published,
                photo_url: form.photo_url || null,
                // Payment / school section fields
                school_section: sessionConfig.school_section || null,
                fee_label: sessionConfig.fee_label || null,
                fee_amount: sessionConfig.fee_amount || null,
                fee_status: form.fee_status || null,
                show_payment_notice: sessionConfig.show_payment_notice,
                participation_score: parseFloat(form.participation_score) || 0,
                engagement_metrics: {
                    attendanceRate: Math.round((studentStats.attendance / (studentStats.totalSessions || 1)) * 100),
                    assignmentCompletion: Math.round((studentStats.assignments / (studentStats.totalAssignments || 1)) * 100),
                },
            };

            const res = await fetch('/api/progress-reports', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...payload, existing_id: existingReport?.id ?? null }),
            });
            const j = await res.json();
            if (!res.ok) throw new Error(j.error || 'Failed to save');
            if (!existingReport) {
                setExistingReport({ ...payload, id: j.data.id } as unknown as StudentReport);
            }

            setSuccess(publish ? 'Report published — visible to student!' : 'Draft saved!');
            if (publish) setForm(f => ({ ...f, is_published: true }));
        } catch (err: any) {
            setError(err.message ?? 'Failed to save');
        } finally {
            setSaving(false); setPublishing(false);
        }
    };

    // ── Save & move to next student ───────────────────────────────────────────
    async function saveAndNext(publish = false) {
        await handleSave(publish);
        const nextIdx = currentStudentIdx + 1;
        if (nextIdx < filteredStudents.length) {
            await selectStudent(filteredStudents[nextIdx] as PortalUser, nextIdx);
        } else {
            setStep('pick');
        }
    }

    // ── AI generate ───────────────────────────────────────────────────────────
    const handleAIGenerate = async (field: 'key_strengths' | 'areas_for_growth' | 'participation_grade' | 'projects_grade' | 'homework_grade') => {
        setGenerating(field);
        setError('');
        try {
            const { attendance, totalSessions, assignments, totalAssignments } = studentStats;
            const attPct = (attendance / totalSessions) * 100;
            const assigPct = (assignments / totalAssignments) * 100;

            // Technical qualifiers are logic-based for accuracy
            if (['participation_grade', 'projects_grade', 'homework_grade'].includes(field)) {
                await new Promise(r => setTimeout(r, 600)); // Brief delay for UX
                
                let prefix = '';
                const currentText = (form as any)[field] || '';
                if (currentText && currentText !== 'Good' && !currentText.includes('Completed') && !currentText.includes('Attended')) {
                    prefix = `${currentText} — `;
                } else if (field !== 'participation_grade' && sessionConfig.current_module) {
                    prefix = `${sessionConfig.current_module} — `;
                }

                const responses: Record<string, string> = {
                    participation_grade: `${prefix}${attendance}/${totalSessions} Meetings Attended (${attPct >= 80 ? 'Excellent' : attPct >= 60 ? 'Active' : 'Moderate'})`,
                    projects_grade: `${prefix}${assignments}/${totalAssignments} Lab Tasks Completed (${assigPct >= 90 ? 'Outstanding' : assigPct >= 70 ? 'Proficient' : 'Developing'})`,
                    homework_grade: `${prefix}${Math.round(assigPct)}% Assignment Completion Rate — ${assigPct >= 80 ? 'Reliable' : 'Inconsistent'}`,
                };
                setForm(f => ({ ...f, [field]: (responses as any)[field] }));
                setSuccess(`Realistic ${(field as string).replace('_grade', '')} generated!`);
                return;
            }

            // Qualitative evaluation uses actual AI with a robust fallback system
            const fallbackThemes = {
                key_strengths: [
                    `${form.student_name} demonstrates a strong intuitive grasp of ${sessionConfig.current_module || 'the course material'}. They excel at practical implementation and show consistent curiosity.`,
                    `Consistently active in class, ${form.student_name} has shown remarkable progress in building complex logic and debugging code independently.`,
                    `The student exhibits excellent teamwork and logical thinking skills, particularly during the ${sessionConfig.current_module || 'latest'} project phase.`
                ],
                areas_for_growth: [
                    `To reach the next level, ${form.student_name} should focus on documenting their code and exploring more advanced architectural patterns.`,
                    `We recommend additional practice with ${sessionConfig.current_module || 'core concepts'} to increase speed and confidence during time-constrained tasks.`,
                    `Improving attention to detail in syntax will help ${form.student_name} minimize minor errors and build more robust applications.`
                ]
            };

            const getRandomFallback = (type: 'key_strengths' | 'areas_for_growth') => {
                const list = fallbackThemes[type];
                return list[Math.floor(Math.random() * list.length)];
            };

            try {
                const res = await fetch('/api/ai/generate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        type: 'report-feedback',
                        topic: sessionConfig.current_module,
                        studentName: form.student_name,
                        gradeLevel: form.section_class,
                        attendance: `${attendance}/${totalSessions} sessions`,
                        assignments: `${assignments}/${totalAssignments} labs`,
                        theoryScore: form.theory_score,
                        practicalScore: form.practical_score,
                        participationScore: form.participation_score,
                    }),
                });

                if (!res.ok) throw new Error('AI Service unavailable');
                const result = await res.json();
                const aiData = result.data || {};

                setForm(f => ({
                    ...f,
                    key_strengths: aiData.key_strengths || getRandomFallback('key_strengths'),
                    areas_for_growth: aiData.areas_for_growth || getRandomFallback('areas_for_growth')
                }));
                setSuccess('AI-assisted evaluation ready!');
            } catch (err) {
                console.warn('AI failed, using high-quality fallback:', err);
                setForm(f => ({
                    ...f,
                    key_strengths: f.key_strengths || getRandomFallback('key_strengths'),
                    areas_for_growth: f.areas_for_growth || getRandomFallback('areas_for_growth')
                }));
                setSuccess('Generated detailed report insights (Fallback System Activated).');
            }
        } catch (err: any) {
            setError(err.message ?? 'Generation failed');
        } finally {
            setGenerating(null);
        }
    };

    // ── Photo upload ──────────────────────────────────────────────────────────
    const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !selectedStudent) return;
        setUploading(true); setError('');
        try {
            const db = createClient();
            const ext = file.name.split('.').pop();
            const fileName = `${selectedStudent.id}/${Date.now()}.${ext}`;
            const { error: uploadErr } = await db.storage.from('reports').upload(fileName, file);
            if (uploadErr) throw uploadErr;
            const { data: { publicUrl } } = db.storage.from('reports').getPublicUrl(fileName);
            setForm(f => ({ ...f, photo_url: publicUrl }));
            setSuccess('Photo uploaded!');
        } catch (err: any) {
            setError('Upload failed: ' + err.message);
        } finally {
            setUploading(false);
        }
    };

    // ── PDF download ──────────────────────────────────────────────────────────
    async function downloadPDF() {
        if (!pdfRef.current) { setError('Open Live Preview first, then download.'); return; }
        setIsGeneratingPdf(true); setError('');
        try {
            const name = form.student_name.replace(/\s+/g, '_') || 'Student';
            const term = sessionConfig.report_term || 'Term';
            await generateReportPDF(pdfRef.current, `Report_${name}_${term}.pdf`);
        } catch (err: any) {
            setError('PDF failed: ' + (err?.message ?? 'Try opening Live Preview first.'));
        } finally {
            setIsGeneratingPdf(false);
        }
    }

    const previewData: any = {
        ...sessionConfig,
        ...form,
        id: existingReport?.id || 'Preview',
        theory_score: parseFloat(form.theory_score),
        practical_score: parseFloat(form.practical_score),
        attendance_score: parseFloat(form.attendance_score),
        overall_score: overallScore,
        has_certificate: overallScore >= 45,
        certificate_text: overallScore >= 45
            ? `This document officially recognizes that ${form.student_name} has successfully completed the intensive study programme in ${sessionConfig.course_name || 'the enrolled course'}.`
            : undefined,
        section_class: form.section_class || sessionConfig.section_class || undefined,
        school_name: sessionConfig.school_name || undefined,
        fee_status: form.fee_status || undefined,
        fee_label: sessionConfig.fee_label || undefined,
        fee_amount: sessionConfig.fee_amount || undefined,
        school_section: sessionConfig.school_section || undefined,
    };

    // ── Guards ────────────────────────────────────────────────────────────────
    if (authLoading || profileLoading) return (
        <div className="min-h-screen bg-[#0f0f1a] flex items-center justify-center">
            <div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
        </div>
    );

    // Ensure isStaff is definitely defined and checked
    if (profile && !isStaff) return (
        <div className="min-h-screen bg-[#0f0f1a] flex flex-col items-center justify-center p-4">
            <ExclamationTriangleIcon className="w-12 h-12 text-amber-500 mb-4" />
            <h1 className="text-xl font-bold text-white mb-2">Access Restricted</h1>
            <p className="text-white/40 text-sm text-center max-w-md">
                You do not have permission to create or edit progress reports.
                Please visit the <Link href="/dashboard/results" className="text-violet-400 font-bold hover:underline">Results Record Centre</Link> to view and print reports for your school.
            </p>
            <Link href="/dashboard/results" className="mt-4 inline-flex items-center gap-2 px-6 py-3 bg-violet-600 hover:bg-violet-500 text-white font-bold rounded-xl transition-all shadow-lg shadow-violet-900/20">
                <EyeIcon className="w-4 h-4" /> Go to Results Centre
            </Link>
        </div>
    );

    // ── Session summary bar (shown in pick/edit steps) ────────────────────────
    const SessionSummaryBar = () => (
        <div className="bg-[#0d1526] border border-white/10 rounded-2xl overflow-hidden">
            <button
                onClick={() => setSessionExpanded(e => !e)}
                className="w-full flex items-center gap-3 px-5 py-3 hover:bg-white/5 transition-colors"
            >
                <Cog6ToothIcon className="w-4 h-4 text-violet-400 flex-shrink-0" />
                <div className="flex-1 text-left min-w-0">
                    <p className="text-xs font-bold text-violet-300 uppercase tracking-widest">Session Settings</p>
                    <p className="text-xs text-white/40 truncate mt-0.5">
                        {sessionConfig.report_term}
                        {sessionConfig.school_name && ` · ${sessionConfig.school_name}`}
                        {sessionConfig.section_class && ` · ${sessionConfig.section_class}`}
                        {sessionConfig.course_name && ` · ${sessionConfig.course_name}`}
                        {sessionConfig.current_module && ` · Module: ${sessionConfig.current_module}`}
                        {` · ${sessionConfig.instructor_name}`}
                    </p>
                </div>
                {sessionExpanded
                    ? <ChevronUpIcon className="w-4 h-4 text-white/30 flex-shrink-0" />
                    : <ChevronDownIcon className="w-4 h-4 text-white/30 flex-shrink-0" />}
            </button>

            {sessionExpanded && (
                <div className="border-t border-white/10 p-5 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Field label="Instructor Name">
                            <input value={sessionConfig.instructor_name}
                                onChange={e => setSessionConfig(s => ({ ...s, instructor_name: e.target.value }))}
                                className={INPUT} placeholder="Your full name" />
                        </Field>
                        <Field label="Report Date">
                            <input type="date" value={sessionConfig.report_date}
                                onChange={e => setSessionConfig(s => ({ ...s, report_date: e.target.value }))}
                                className={INPUT} />
                        </Field>
                        {sessionConfig.school_section === 'school' ? (
                            <Field label="Term">
                                <select value={sessionConfig.report_term}
                                    onChange={e => setSessionConfig(s => ({ ...s, report_term: e.target.value }))}
                                    className={INPUT}>
                                    {TERM_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                            </Field>
                        ) : (
                            <Field label="Duration">
                                <select value={sessionConfig.course_duration}
                                    onChange={e => setSessionConfig(s => ({ ...s, course_duration: e.target.value }))}
                                    className={INPUT}>
                                    {DURATION_OPTIONS.map(d => <option key={d} value={d}>{d}</option>)}
                                </select>
                            </Field>
                        )}
                        <Field label="Programme / Course">
                            <input
                                list="course-list-bar"
                                value={sessionConfig.course_name}
                                onChange={e => {
                                    const match = courses.find(c => c.title === e.target.value);
                                    setSessionConfig(s => ({ ...s, course_name: e.target.value, course_id: match?.id ?? s.course_id }));
                                }}
                                className={INPUT}
                                placeholder="e.g. Python Programming" />
                            <datalist id="course-list-bar">
                                {courses.map(c => <option key={c.id} value={c.title} />)}
                            </datalist>
                        </Field>
                        <Field label="School">
                            <select
                                value={sessionConfig.school_name}
                                onChange={e => setSessionConfig(s => ({ ...s, school_name: e.target.value }))}
                                className={INPUT}>
                                <option value="">— Select a school —</option>
                                {schools.map(sc => <option key={sc.id} value={sc.name}>{sc.name}</option>)}
                            </select>
                        </Field>
                        <Field label="Class / Section">
                            <select
                                value={sessionConfig.section_class}
                                onChange={e => setSessionConfig(s => ({ ...s, section_class: e.target.value }))}
                                className={INPUT}>
                                <option value="">— Select class —</option>
                                {distinctClasses.map(c => <option key={c} value={c}>{c}</option>)}
                                {CLASS_PRESETS.filter(c => !distinctClasses.includes(c)).map(c => <option key={`preset-${c}`} value={c}>{c}</option>)}
                            </select>
                        </Field>
                        <Field label="Current Module">
                            <input value={sessionConfig.current_module}
                                onChange={e => setSessionConfig(s => ({ ...s, current_module: e.target.value }))}
                                className={INPUT} placeholder="e.g. Control Statements" />
                        </Field>
                        <Field label="Next Module">
                            <input value={sessionConfig.next_module}
                                onChange={e => setSessionConfig(s => ({ ...s, next_module: e.target.value }))}
                                className={INPUT} placeholder="e.g. Loops & Automation" />
                        </Field>
                        <Field label="Duration">
                            <select value={sessionConfig.course_duration}
                                onChange={e => setSessionConfig(s => ({ ...s, course_duration: e.target.value }))}
                                className={INPUT}>
                                {DURATION_OPTIONS.map(d => <option key={d} value={d}>{d}</option>)}
                            </select>
                        </Field>
                    </div>

                    {/* Next-term payment notice toggle (also accessible from summary bar) */}
                    <div className="flex items-center gap-4 px-1 pt-1">
                        <button
                            type="button"
                            onClick={() => setSessionConfig(s => ({ ...s, show_payment_notice: !s.show_payment_notice }))}
                            className={`relative w-10 h-6 rounded-full transition-colors flex-shrink-0 ${sessionConfig.show_payment_notice ? 'bg-violet-600' : 'bg-white/10'}`}
                        >
                            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${sessionConfig.show_payment_notice ? 'translate-x-4' : 'translate-x-0'}`} />
                        </button>
                        <div>
                            <p className="text-sm text-white/70 font-semibold">Show Next Term Payment Notice</p>
                            <p className="text-[10px] text-white/30">Prints ₦20,000 Rillcod payment details on each report</p>
                        </div>
                    </div>

                    <div className="flex justify-end">
                        <button onClick={() => setSessionExpanded(false)}
                            className="px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold rounded-xl transition-colors">
                            <CheckIcon className="w-3.5 h-3.5 inline mr-1" /> Done — Collapse
                        </button>
                    </div>
                </div>
            )}
        </div>
    );

    return (
        <div className="min-h-screen bg-[#0f0f1a] text-white">
            <div className="max-w-5xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-8 space-y-4 sm:space-y-5">

                {/* ── Page header ── */}
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <DocumentTextIcon className="w-4 h-4 text-violet-400" />
                            <span className="text-xs font-bold text-violet-400 uppercase tracking-widest">Report Builder</span>
                        </div>
                        <h1 className="text-xl sm:text-3xl font-extrabold">Progress Reports</h1>
                        <p className="text-white/40 text-xs sm:text-sm mt-0.5">Create and publish branded progress reports for each student</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <button onClick={() => setShowSettings(true)}
                            className="inline-flex items-center gap-1.5 px-3 py-2 bg-white/5 border border-white/10 hover:bg-white/10 text-white/60 text-xs font-bold rounded-xl transition-colors">
                            <Cog6ToothIcon className="w-3.5 h-3.5" /> Branding
                        </button>
                        {step === 'edit' && selectedStudent && (
                            <>
                                <button onClick={() => setShowPreview(true)}
                                    className="inline-flex items-center gap-1.5 px-3 py-2 bg-amber-500/10 border border-amber-500/20 hover:bg-amber-500/20 text-amber-400 text-xs font-bold rounded-xl transition-colors">
                                    <SparklesIcon className="w-3.5 h-3.5" /> Preview
                                </button>
                                <Link href={`/dashboard/results?student=${selectedStudent.id}`}
                                    className="inline-flex items-center gap-1.5 px-3 py-2 bg-violet-600/20 hover:bg-violet-600/30 text-violet-400 text-xs font-bold rounded-xl transition-colors">
                                    <EyeIcon className="w-3.5 h-3.5" /> View Result
                                </Link>
                            </>
                        )}
                    </div>
                </div>

                {/* ══════════════════════════════════════════════════════════════
                    STEP 0: Initial Session Setup
                    Show full form with "Start Grading" button.
                    Once clicked → collapses and goes to step='pick'
                ══════════════════════════════════════════════════════════════ */}
                {step === 'session' && (
                    <div className="space-y-4">
                        <div className="bg-violet-600/10 border border-violet-500/20 rounded-2xl px-5 py-4">
                            <p className="text-violet-300 font-bold text-sm">Step 1 of 3 — Session Setup</p>
                            <p className="text-violet-300/60 text-xs mt-0.5">
                                Enter details that are shared for ALL students in this grading session.
                                These will be locked when you move to individual student grading.
                            </p>
                        </div>

                        {/* Session fields */}
                        <div className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-4">
                            <div className="flex items-center gap-2 border-b border-white/10 pb-3 mb-2">
                                <span>📋</span>
                                <h3 className="text-xs font-bold text-white/60 uppercase tracking-widest">Session Info</h3>
                            </div>
                            {/* Context type */}
                            <div>
                                <label className="block text-xs font-semibold text-white/40 uppercase tracking-wider mb-1.5">Report Context *</label>
                                <div className="flex gap-2">
                                    {(['school', 'bootcamp', 'online'] as const).map(type => (
                                        <button key={type} type="button"
                                            onClick={() => setSessionConfig(s => ({ ...s, school_section: type }))}
                                            className={`flex-1 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors border ${sessionConfig.school_section === type ? 'bg-violet-600 border-violet-500 text-white' : 'bg-white/5 border-white/10 text-white/40 hover:bg-white/10'}`}>
                                            {type === 'school' ? '🏫 School' : type === 'bootcamp' ? '💻 Bootcamp' : '🌐 Online'}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <Field label="Instructor Name *">
                                    <input value={sessionConfig.instructor_name}
                                        onChange={e => setSessionConfig(s => ({ ...s, instructor_name: e.target.value }))}
                                        className={INPUT} placeholder="Your full name" />
                                </Field>
                                <Field label="Report Date *">
                                    <input type="date" value={sessionConfig.report_date}
                                        onChange={e => setSessionConfig(s => ({ ...s, report_date: e.target.value }))}
                                        className={INPUT} />
                                </Field>
                                {sessionConfig.school_section === 'school' ? (
                                    <>
                                        <Field label="Term *">
                                            <select value={sessionConfig.report_term}
                                                onChange={e => setSessionConfig(s => ({ ...s, report_term: e.target.value }))}
                                                className={INPUT}>
                                                {TERM_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                                            </select>
                                        </Field>
                                        <Field label="Academic Year">
                                            <input
                                                list="academic-year-list"
                                                value={sessionConfig.report_period}
                                                onChange={e => setSessionConfig(s => ({ ...s, report_period: e.target.value }))}
                                                className={INPUT}
                                                placeholder="e.g. 2025/2026" />
                                            <datalist id="academic-year-list">
                                                <option value="2025/2026" />
                                                <option value="2026/2027" />
                                                <option value="2027/2028" />
                                                <option value="2028/2029" />
                                            </datalist>
                                        </Field>
                                    </>
                                ) : (
                                    <Field label="Duration *">
                                        <select value={sessionConfig.course_duration}
                                            onChange={e => setSessionConfig(s => ({ ...s, course_duration: e.target.value }))}
                                            className={INPUT}>
                                            {DURATION_OPTIONS.map(d => <option key={d} value={d}>{d}</option>)}
                                        </select>
                                    </Field>
                                )}
                            </div>
                        </div>

                        <div className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-4">
                            <div className="flex items-center gap-2 border-b border-white/10 pb-3 mb-2">
                                <span>🏫</span>
                                <h3 className="text-xs font-bold text-white/60 uppercase tracking-widest">School & Class</h3>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <Field label="School *">
                                    <select
                                        value={sessionConfig.school_name}
                                        onChange={e => {
                                            const name = e.target.value;
                                            const match = schools.find(sc => sc.name === name);
                                            setSessionConfig(s => ({ ...s, school_name: name, school_id: match?.id }));
                                        }}
                                        className={INPUT}>
                                        <option value="">— Select a school —</option>
                                        {schools.map(sc => <option key={sc.id} value={sc.name}>{sc.name}</option>)}
                                    </select>
                                </Field>
                                <Field label="Class / Section *">
                                    <select
                                        value={sessionConfig.section_class}
                                        onChange={e => setSessionConfig(s => ({ ...s, section_class: e.target.value }))}
                                        className={INPUT}>
                                        <option value="">— Select class —</option>
                                        {distinctClasses.map(c => <option key={c} value={c}>{c}</option>)}
                                        {CLASS_PRESETS.filter(c => !distinctClasses.includes(c)).map(c => <option key={`preset-${c}`} value={c}>{c}</option>)}
                                    </select>
                                </Field>
                            </div>
                        </div>

                        {/* Payment / Fee Section — optional, won't appear on report if left blank */}
                        <div className="bg-white/[0.03] border border-white/10 rounded-2xl overflow-hidden">
                            <div className="flex items-center gap-2 px-5 py-3 bg-white/[0.02] border-b border-white/10">
                                <span>💳</span>
                                <h3 className="text-xs font-bold text-white/50 uppercase tracking-widest">Payment / Fee Info</h3>
                                <span className="ml-auto text-[10px] text-white/25 font-semibold">Optional — only appears on report if filled in</span>
                            </div>
                            <div className="p-5 space-y-4">
                                <p className="text-[11px] text-white/30 leading-relaxed">
                                    Use this for schools where coding is offered as an <strong className="text-white/50">extra-curricular activity</strong> (paid separately) or when different school sections (Primary vs Secondary) have separate fee structures or management. Leave blank if fees are handled by the school directly or not applicable.
                                </p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <Field label="Fee Label">
                                        <input
                                            value={sessionConfig.fee_label}
                                            onChange={e => setSessionConfig(s => ({ ...s, fee_label: e.target.value }))}
                                            className={INPUT}
                                            placeholder="e.g. Coding Club Fee, Extra-Curricular Fee" />
                                    </Field>
                                    <Field label="Fee Amount (₦)">
                                        <input
                                            type="number"
                                            value={sessionConfig.fee_amount}
                                            onChange={e => setSessionConfig(s => ({ ...s, fee_amount: e.target.value }))}
                                            className={INPUT}
                                            placeholder="e.g. 15000" />
                                    </Field>
                                </div>
                                <p className="text-[10px] text-white/20">Per-student payment status (Paid / Outstanding / Sponsored) is set individually on each student's form in Step 3.</p>

                                {/* Next-term Rillcod payment notice toggle */}
                                <div className="flex items-center gap-4 pt-2 border-t border-white/10">
                                    <button
                                        type="button"
                                        onClick={() => setSessionConfig(s => ({ ...s, show_payment_notice: !s.show_payment_notice }))}
                                        className={`relative w-10 h-6 rounded-full transition-colors flex-shrink-0 ${sessionConfig.show_payment_notice ? 'bg-violet-600' : 'bg-white/10'}`}
                                    >
                                        <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${sessionConfig.show_payment_notice ? 'translate-x-4' : 'translate-x-0'}`} />
                                    </button>
                                    <div>
                                        <p className="text-sm text-white/70 font-semibold">Show Next Term Payment Notice</p>
                                        <p className="text-[10px] text-white/30">Prints ₦20,000 Rillcod payment details on each report (Providus Bank · 7901178957)</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-4">
                            <div className="flex items-center gap-2 border-b border-white/10 pb-3 mb-2">
                                <span>📖</span>
                                <h3 className="text-xs font-bold text-white/60 uppercase tracking-widest">Course Details</h3>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <Field label="Programme / Course *">
                                    <input
                                        list="course-list-step1"
                                        value={sessionConfig.course_name}
                                        onChange={e => {
                                            const match = courses.find(c => c.title === e.target.value);
                                            setSessionConfig(s => ({ ...s, course_name: e.target.value, course_id: match?.id ?? s.course_id }));
                                        }}
                                        className={INPUT}
                                        placeholder="e.g. Python Programming" />
                                    <datalist id="course-list-step1">
                                        {courses.map(c => <option key={c.id} value={c.title} />)}
                                    </datalist>
                                </Field>
                                {sessionConfig.school_section === 'school' && (
                                    <Field label="Duration">
                                        <select value={sessionConfig.course_duration}
                                            onChange={e => setSessionConfig(s => ({ ...s, course_duration: e.target.value }))}
                                            className={INPUT}>
                                            {DURATION_OPTIONS.map(d => <option key={d} value={d}>{d}</option>)}
                                        </select>
                                    </Field>
                                )}
                                <Field label="Current Module">
                                    <input value={sessionConfig.current_module}
                                        onChange={e => setSessionConfig(s => ({ ...s, current_module: e.target.value }))}
                                        className={INPUT} placeholder="e.g. Control Statements" />
                                </Field>
                                <Field label="Next Module">
                                    <input value={sessionConfig.next_module}
                                        onChange={e => setSessionConfig(s => ({ ...s, next_module: e.target.value }))}
                                        className={INPUT} placeholder="e.g. Loops & Automation" />
                                </Field>
                            </div>
                        </div>

                        <button
                            onClick={() => {
                                setSessionDone(true);
                                setSessionExpanded(false);
                                setClassFilter(sessionConfig.section_class); // pre-filter by selected class
                                setStep('pick');
                            }}
                            className="w-full py-4 bg-violet-600 hover:bg-violet-500 text-white font-black text-base rounded-2xl transition-all shadow-lg shadow-violet-900/30 flex items-center justify-center gap-2">
                            <UserGroupIcon className="w-5 h-5" /> Step 2: Select Students →
                        </button>
                    </div>
                )}

                {/* ══════════════════════════════════════════════════════════════
                    STEP 1: Pick a student
                ══════════════════════════════════════════════════════════════ */}
                {step === 'pick' && (
                    <div className="space-y-4">
                        <div className="bg-violet-600/10 border border-violet-500/20 rounded-2xl px-5 py-3">
                            <p className="text-violet-300 font-bold text-sm">Step 2 of 3 — Select a Student to Grade</p>
                            <p className="text-violet-300/60 text-xs mt-0.5">Session settings are locked. Click a student to enter their individual scores.</p>
                        </div>

                        {/* Collapsible session summary */}
                        <SessionSummaryBar />

                        {/* Student grid */}
                        <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
                            <div className="flex items-center gap-3 mb-4 flex-wrap">
                                <h2 className="font-bold text-white flex items-center gap-2">
                                    <UserGroupIcon className="w-5 h-5 text-violet-400" /> Students
                                </h2>
                                <span className="text-xs text-white/30 bg-white/5 px-2 py-0.5 rounded-full">{filteredStudents.length} total</span>
                                {filteredStudents.length > 0 && (
                                    <button
                                        onClick={handleBulkBuild}
                                        disabled={isBulkBuilding}
                                        className="inline-flex items-center gap-2 px-4 py-1.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-[10px] font-black uppercase tracking-[0.2em] rounded-xl transition-all shadow-lg shadow-violet-900/20 group"
                                    >
                                        {isBulkBuilding ? (
                                            <>
                                                <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" />
                                                {bulkProgress.current} / {bulkProgress.total} Building...
                                            </>
                                        ) : (
                                            <>
                                                <RocketLaunchIcon className="w-3.5 h-3.5 group-hover:translate-y-[-2px] transition-transform" />
                                                Magic Bulk Build
                                            </>
                                        )}
                                    </button>
                                )}
                                {/* Quick-filter chips per class */}
                                <div className="flex flex-wrap gap-1.5 mb-3">
                                    <button
                                        onClick={() => setClassFilter('')}
                                        className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider transition-all border ${!classFilter ? 'bg-violet-600 text-white border-violet-500' : 'bg-white/5 text-white/40 border-white/10 hover:bg-white/10'}`}
                                    >
                                        All ({students.filter(s => !sessionConfig.school_name || s.school_name === sessionConfig.school_name).length})
                                    </button>
                                    {distinctClasses.map(c => (
                                        <button key={c}
                                            onClick={() => setClassFilter(classFilter === c ? '' : c)}
                                            className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider transition-all border ${classFilter === c ? 'bg-violet-600 text-white border-violet-500' : 'bg-white/5 text-white/40 border-white/10 hover:bg-white/10'}`}
                                        >
                                            {c} ({students.filter(s => (s as any).section_class === c && (!sessionConfig.school_name || s.school_name === sessionConfig.school_name)).length})
                                        </button>
                                    ))}
                                </div>
                                <input
                                    type="search" placeholder="Search student…"
                                    value={search} onChange={e => setSearch(e.target.value)}
                                    className="w-full mb-4 bg-white/5 border border-white/10 text-white text-sm px-4 py-2 rounded-xl placeholder:text-white/30 focus:outline-none focus:border-violet-500" />
                            </div>
                            {/* Grouped student grid */}
                            {(() => {
                                const schoolScopedFiltered = filteredStudents;
                                if (schoolScopedFiltered.length === 0) {
                                    return <p className="text-white/30 text-sm py-8 text-center">No students found.</p>;
                                }
                                // Group by section_class; ungrouped falls under '— Unassigned —'
                                const groups: Record<string, typeof filteredStudents> = {};
                                let globalIdx = 0;
                                const withIdx = schoolScopedFiltered.map(s => ({ s, idx: globalIdx++ }));
                                withIdx.forEach(({ s, idx }) => {
                                    const key = (s as any).section_class || '— Unassigned —';
                                    if (!groups[key]) groups[key] = [];
                                    (groups[key] as any[]).push({ s, idx });
                                });
                                const sortedGroups = Object.entries(groups).sort(([a], [b]) => {
                                    if (a === '— Unassigned —') return 1;
                                    if (b === '— Unassigned —') return -1;
                                    return a.localeCompare(b);
                                });
                                return (
                                    <div className="space-y-5">
                                        {sortedGroups.map(([groupName, items]) => (
                                            <div key={groupName}>
                                                <div className="flex items-center gap-2 mb-2">
                                                    <span className="text-[10px] font-black text-violet-400/80 uppercase tracking-widest">{groupName}</span>
                                                    <span className="text-[9px] text-white/20 bg-white/5 px-2 py-0.5 rounded-full">{(items as any[]).length}</span>
                                                    <div className="flex-1 h-px bg-white/5" />
                                                </div>
                                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                                    {(items as any[]).map(({ s, idx }) => (
                                                        <button key={s.id} onClick={() => selectStudent(s as PortalUser, idx)}
                                                            className="text-left p-4 bg-white/5 border border-white/10 hover:border-violet-500/50 hover:bg-violet-600/10 rounded-xl transition-all">
                                                            <div className="flex items-center gap-3">
                                                                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-600 to-blue-600 flex items-center justify-center text-sm font-black text-white flex-shrink-0">
                                                                    {s.full_name ? s.full_name[0] : '?'}
                                                                </div>
                                                                <div className="min-w-0">
                                                                    <p className="font-semibold text-white text-sm truncate">{s.full_name ?? 'Unnamed'}</p>
                                                                    <p className="text-xs text-white/40 truncate">{s.school_name ?? s.email}</p>
                                                                </div>
                                                                <span className="ml-auto text-[10px] text-white/20 font-mono flex-shrink-0">#{idx + 1}</span>
                                                            </div>
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                );
                            })()}
                        </div>
                    </div>
                )}

                {/* ══════════════════════════════════════════════════════════════
                    STEP 2: Edit per-student report
                ══════════════════════════════════════════════════════════════ */}
                {step === 'edit' && selectedStudent && (
                    <div className="space-y-4">
                        {/* Step label */}
                        <div className="bg-emerald-600/10 border border-emerald-500/20 rounded-2xl px-5 py-3 flex items-center gap-3">
                            <div className="flex-1">
                                <p className="text-emerald-300 font-bold text-sm">Step 3 of 3 — Enter Student Scores</p>
                                <p className="text-emerald-300/60 text-xs mt-0.5">Session details are pre-filled. Just enter scores and evaluation for this student.</p>
                            </div>
                            <span className="text-white/30 text-xs font-mono flex-shrink-0">
                                {currentStudentIdx + 1} / {filteredStudents.length}
                            </span>
                        </div>

                        {/* Collapsible session summary */}
                        <SessionSummaryBar />

                        {/* Student navigator */}
                        <div className="bg-[#0d1526] border border-white/10 rounded-2xl px-4 py-3 flex items-center gap-3">
                            <button onClick={() => setStep('pick')}
                                className="flex items-center gap-1 text-xs text-white/40 hover:text-white transition-colors flex-shrink-0">
                                <ArrowLeftIcon className="w-3.5 h-3.5" />
                                <span className="hidden sm:inline">All Students</span>
                            </button>
                            <div className="w-px h-4 bg-white/10" />
                            <button
                                disabled={currentStudentIdx <= 0}
                                onClick={async () => {
                                    const idx = currentStudentIdx - 1;
                                    if (idx >= 0) await selectStudent(filteredStudents[idx] as PortalUser, idx);
                                }}
                                className="p-1.5 rounded-lg bg-white/5 text-white/40 hover:text-white disabled:opacity-20 transition-colors flex-shrink-0">
                                <ArrowLeftIcon className="w-3.5 h-3.5" />
                            </button>
                            <div className="flex-1 flex items-center gap-2 min-w-0">
                                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-600 to-blue-600 flex items-center justify-center text-xs font-black text-white flex-shrink-0">
                                    {selectedStudent.full_name ? selectedStudent.full_name[0] : '?'}
                                </div>
                                <div className="min-w-0">
                                    <p className="font-bold text-white text-sm truncate">{selectedStudent.full_name}</p>
                                    {existingReport && (
                                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${form.is_published ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
                                            {form.is_published ? '✓ Published' : 'Draft'}
                                        </span>
                                    )}
                                </div>
                            </div>
                            <button
                                disabled={currentStudentIdx >= filteredStudents.length - 1}
                                onClick={async () => {
                                    const idx = currentStudentIdx + 1;
                                    if (idx < filteredStudents.length) await selectStudent(filteredStudents[idx] as PortalUser, idx);
                                }}
                                className="p-1.5 rounded-lg bg-white/5 text-white/40 hover:text-white disabled:opacity-20 transition-colors flex-shrink-0">
                                <ArrowLeftIcon className="w-3.5 h-3.5 rotate-180" />
                            </button>
                        </div>

                        {/* Alerts */}
                        {error && (
                            <div className="flex items-center gap-3 bg-rose-500/10 border border-rose-500/20 rounded-xl p-4">
                                <ExclamationTriangleIcon className="w-5 h-5 text-rose-400 flex-shrink-0" />
                                <p className="text-rose-400 text-sm">{error}</p>
                            </div>
                        )}
                        {success && (
                            <div className="flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4">
                                <CheckIcon className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                                <p className="text-emerald-400 text-sm font-semibold">{success}</p>
                            </div>
                        )}

                        {/* Per-student form */}
                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">

                            {/* Left column */}
                            <div className="space-y-4">

                                {/* Identity & Photo */}
                                <Section title="Student Identity" icon="👤">
                                    <div className="flex flex-col sm:flex-row items-start gap-6">
                                        <div className="relative group">
                                            <div className="w-28 h-28 rounded-2xl bg-white/5 border-2 border-dashed border-white/20 flex items-center justify-center overflow-hidden transition-colors group-hover:border-violet-500/50">
                                                {form.photo_url ? (
                                                    <img src={form.photo_url} className="w-full h-full object-cover" alt="Student" />
                                                ) : (
                                                    <UserGroupIcon className="w-8 h-8 text-white/20" />
                                                )}
                                                {uploading && (
                                                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center backdrop-blur-sm">
                                                        <ArrowPathIcon className="w-6 h-6 animate-spin text-white" />
                                                    </div>
                                                )}
                                            </div>
                                            <label className="absolute -bottom-2 -right-2 bg-violet-600 hover:bg-violet-500 p-2 rounded-xl border border-white/10 cursor-pointer transition-all shadow-lg hover:scale-110 active:scale-95">
                                                <ArrowUpTrayIcon className="w-4 h-4 text-white" />
                                                <input type="file" className="hidden" accept="image/*" onChange={handlePhotoUpload} />
                                            </label>
                                        </div>
                                        <div className="flex-1 space-y-4">
                                            <Field label="Full Name">
                                                <input value={form.student_name} onChange={e => setForm(f => ({ ...f, student_name: e.target.value }))} className={INPUT} />
                                            </Field>
                                            <div className="grid grid-cols-2 gap-3">
                                                <div className="p-3 bg-white/[0.03] border border-white/10 rounded-xl">
                                                    <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-0.5">School</p>
                                                    <p className="text-sm text-white/70 font-semibold truncate">{sessionConfig.school_name || '—'}</p>
                                                </div>
                                                <div className="p-3 bg-white/[0.03] border border-white/10 rounded-xl">
                                                    <label className="text-[10px] font-bold text-white/30 uppercase tracking-widest block mb-1">Class</label>
                                                    <select
                                                        value={form.section_class}
                                                        onChange={e => setForm(f => ({ ...f, section_class: e.target.value }))}
                                                        className="w-full bg-transparent text-sm text-white focus:outline-none transition-colors cursor-pointer">
                                                        <option value="" className="bg-[#0f0f1a]">Select —</option>
                                                        {CLASS_PRESETS.map(c => <option key={c} value={c} className="bg-[#0f0f1a]">{c}</option>)}
                                                        {distinctClasses.filter(c => !CLASS_PRESETS.includes(c)).map(c => <option key={c} value={c} className="bg-[#0f0f1a]">{c}</option>)}
                                                    </select>
                                                </div>
                                            </div>
                                            {/* Per-student fee status — only shown when session has fee info */}
                                            {(sessionConfig.fee_label || sessionConfig.fee_amount) && (
                                                <Field label={`Payment Status${sessionConfig.fee_label ? ` — ${sessionConfig.fee_label}` : ''}`}>
                                                    <select
                                                        value={form.fee_status}
                                                        onChange={e => setForm(f => ({ ...f, fee_status: e.target.value as any }))}
                                                        className={INPUT}>
                                                        <option value="">— Not specified (won't show) —</option>
                                                        <option value="paid">✅ Paid</option>
                                                        <option value="outstanding">⚠️ Outstanding</option>
                                                        <option value="partial">🔶 Partial Payment</option>
                                                        <option value="sponsored">🎓 Sponsored</option>
                                                        <option value="waived">✨ Waived</option>
                                                    </select>
                                                </Field>
                                            )}
                                        </div>
                                    </div>
                                </Section>

                                {/* Scores */}
                                <Section title="Performance Scores" icon="📊">
                                    <div className="space-y-5">
                                        {(['theory_score', 'practical_score', 'attendance_score', 'participation_score'] as const).map((key) => {
                                            const labels: Record<string, string> = {
                                                theory_score: 'Theory Protocols (35%)',
                                                practical_score: 'Practical Efficiency (35%)',
                                                attendance_score: 'Operational Presence (15%)',
                                                participation_score: 'Class Participation & Engagement (15%)',
                                            };
                                            const colors: Record<string, string> = {
                                                theory_score: '#6366f1',
                                                practical_score: '#06b6d4',
                                                attendance_score: '#10b981',
                                                participation_score: '#8b5cf6',
                                            };
                                            
                                            const val = parseInt(form[key]) || 0;
                                            return (
                                                <div key={key}>
                                                    <div className="flex justify-between mb-2">
                                                        <label className="text-[10px] font-bold text-white/30 uppercase tracking-widest">{labels[key]}</label>
                                                        <span className="text-xs font-black text-white">{val}%</span>
                                                    </div>
                                                    <div className="flex items-center gap-4">
                                                        <input
                                                            type="range"
                                                            min="0"
                                                            max="100"
                                                            value={form[key]}
                                                            onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                                                            className={`flex-1 h-3 rounded-full appearance-none cursor-pointer outline-none bg-white/10 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-lg ${
                                                                key === 'theory_score' ? '[&::-webkit-slider-thumb]:bg-indigo-500' : 
                                                                key === 'practical_score' ? '[&::-webkit-slider-thumb]:bg-cyan-500' : 
                                                                key === 'attendance_score' ? '[&::-webkit-slider-thumb]:bg-emerald-500' : 
                                                                '[&::-webkit-slider-thumb]:bg-violet-500'
                                                            }`}
                                                            style={{
                                                                background: `linear-gradient(to right, ${colors[key]} ${val}%, rgba(255, 255, 255, 0.1) ${val}%)`
                                                            }}
                                                        />
                                                        <input
                                                            type="number" min="0" max="100" value={form[key]}
                                                            onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                                                            className="w-14 text-center py-1 bg-white/5 border border-white/10 rounded-lg text-xs font-bold text-white focus:outline-none focus:border-violet-500" />
                                                    </div>
                                                </div>
                                            );
                                        })}


                                        {/* Overall display */}
                                        <div className="mt-2 p-5 bg-gradient-to-br from-violet-600/20 to-indigo-600/20 border border-violet-500/20 rounded-2xl flex items-center justify-between">
                                            <div>
                                                <p className="text-[10px] font-bold text-violet-300/40 uppercase tracking-widest">Weighted Overall</p>
                                                <p className="text-4xl font-black text-white">{overallScore}%</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-[10px] font-bold text-violet-300/40 uppercase tracking-widest mb-1">Grade</p>
                                                <div className="inline-flex w-12 h-12 rounded-xl bg-violet-600 items-center justify-center shadow-lg shadow-violet-900/40">
                                                    <span className="text-xl font-black text-white">{overallGradeLetter}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </Section>

                                {/* Grades */}
                                <Section title="Grade Qualifiers" icon="🏅">
                                    <div className="space-y-5">
                                        {[
                                            { key: 'projects_grade', label: 'Project Work' },
                                            { key: 'homework_grade', label: 'Homework' },
                                        ].map(({ key, label }) => (
                                            <div key={key}>
                                                <div className="flex items-center justify-between mb-2">
                                                    <label className="text-[10px] font-bold text-white/30 uppercase tracking-widest">{label}</label>
                                                    <button onClick={() => handleAIGenerate(key as any)} disabled={!!generating}
                                                        className="flex items-center gap-1.5 text-[10px] font-bold text-violet-400 hover:text-violet-300 disabled:opacity-50 transition-all hover:translate-x-1">
                                                        {generating === key ? <ArrowPathIcon className="w-3 h-3 animate-spin" /> : <SparklesIcon className="w-3 h-3" />}
                                                        Generate Realistic Status
                                                    </button>
                                                </div>
                                                <input
                                                    value={(form as any)[key]}
                                                    onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                                                    className={INPUT}
                                                    placeholder={`e.g. 12/15 Meetings Attended`}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                </Section>
                            </div>

                            {/* Right column */}
                            <div className="space-y-6">
                                {/* Evaluation */}
                                <Section title="Instructor Evaluation" icon="✍️">
                                    <div className="space-y-5">
                                        {(['key_strengths', 'areas_for_growth'] as const).map(field => {
                                            const labels: Record<string, string> = {
                                                key_strengths: 'Key Strengths',
                                                areas_for_growth: 'Areas for Growth',
                                            };
                                            return (
                                                <div key={field}>
                                                    <div className="flex items-center justify-between mb-2">
                                                        <label className="text-[10px] font-bold text-white/30 uppercase tracking-widest">{labels[field]}</label>
                                                        <button onClick={() => handleAIGenerate(field)} disabled={!!generating}
                                                            className="flex items-center gap-1.5 text-[10px] font-bold text-violet-400 hover:text-violet-300 disabled:opacity-50 transition-all hover:translate-x-1">
                                                            {generating === field
                                                                ? <ArrowPathIcon className="w-3 h-3 animate-spin" />
                                                                : <SparklesIcon className="w-3 h-3" />}
                                                            {generating === field ? 'Thinking...' : 'AI Draft'}
                                                        </button>
                                                    </div>
                                                    <textarea rows={5} value={(form as any)[field]}
                                                        onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
                                                        placeholder={`Detailed observations...`}
                                                        className={`${INPUT} resize-none text-sm leading-relaxed`} />
                                                </div>
                                            );
                                        })}
                                    </div>
                                </Section>
                            </div>

                        </div>

                        {/* Sticky Action Bar */}
                        <div className="sticky bottom-0 z-40 bg-[#0f0f1a]/80 backdrop-blur-xl border-t border-white/10 p-4 transition-all mt-6 -mx-3 sm:-mx-6 lg:-mx-8">
                            <div className="max-w-5xl mx-auto flex items-center gap-3">
                                <button onClick={() => handleSave(false)} disabled={saving || publishing}
                                    className="flex items-center gap-2 px-5 py-3 bg-white/5 hover:bg-white/10 text-white text-xs font-bold rounded-2xl transition-all disabled:opacity-50">
                                    {saving ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : <CloudArrowUpIcon className="w-4 h-4" />}
                                    {saving ? 'Saving...' : 'Save Draft'}
                                </button>
                                <button onClick={() => handleSave(true)} disabled={saving || publishing}
                                    className="flex items-center gap-2 px-5 py-3 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-2xl transition-all disabled:opacity-50 shadow-lg shadow-emerald-900/20">
                                    {publishing ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : <RocketLaunchIcon className="w-4 h-4" />}
                                    {publishing ? 'Publishing...' : 'Publish'}
                                </button>
                                <button onClick={() => setShowPreview(true)}
                                    className="flex items-center gap-2 px-5 py-3 bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold rounded-2xl transition-all shadow-lg shadow-violet-900/40">
                                    <EyeIcon className="w-4 h-4" /> Preview
                                </button>

                                <div className="ml-auto">
                                    {currentStudentIdx < filteredStudents.length - 1 ? (
                                        <button onClick={() => saveAndNext(false)} disabled={saving || publishing}
                                            className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white text-xs font-black rounded-2xl transition-all disabled:opacity-50 shadow-xl shadow-violet-900/30">
                                            Next Student <ChevronRightIcon className="w-4 h-4" />
                                        </button>
                                    ) : (
                                        <button onClick={() => { handleSave(false); setStep('pick'); }} disabled={saving || publishing}
                                            className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white text-xs font-black rounded-2xl transition-all disabled:opacity-50 shadow-xl shadow-violet-900/30">
                                            Finish All <CheckCircleIcon className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )
                }
            </div >

            {/* ── Branding Settings Modal ── */}
            {
                showSettings && (
                    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/80 backdrop-blur-sm">
                        <div className="bg-[#0f0f1a] border border-white/10 rounded-t-[32px] sm:rounded-[32px] w-full sm:max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
                            <div className="px-6 py-5 border-b border-white/10 flex items-center justify-between bg-white/[0.03]">
                                <div>
                                    <h3 className="text-xl font-extrabold text-white">Branding Settings</h3>
                                    <p className="text-white/40 text-xs mt-0.5">Configure report header & organization details</p>
                                </div>
                                <button onClick={() => setShowSettings(false)} className="p-2 hover:bg-white/10 rounded-xl transition-colors">
                                    <XMarkIcon className="w-5 h-5 text-white/40" />
                                </button>
                            </div>

                            <div className="p-6 overflow-y-auto space-y-5">
                                <div className="flex items-center gap-4 p-5 bg-white/5 border border-white/10 rounded-2xl">
                                    <div className="relative group">
                                        <div className="w-20 h-20 rounded-2xl bg-white/5 border-2 border-dashed border-white/20 flex items-center justify-center overflow-hidden">
                                            {branding.logo_url ? (
                                                <img src={branding.logo_url} className="w-full h-full object-contain p-2" alt="Logo" />
                                            ) : (
                                                <PhotoIcon className="w-8 h-8 text-white/20" />
                                            )}
                                            {uploading && (
                                                <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                                                    <ArrowPathIcon className="w-6 h-6 animate-spin text-white" />
                                                </div>
                                            )}
                                        </div>
                                        <label className="absolute -bottom-2 -right-2 bg-violet-600 hover:bg-violet-500 p-2 rounded-xl border border-white/10 cursor-pointer transition-colors shadow-lg">
                                            <ArrowUpTrayIcon className="w-4 h-4 text-white" />
                                            <input type="file" className="hidden" accept="image/*" onChange={async (e) => {
                                                const file = e.target.files?.[0];
                                                if (!file) return;
                                                setUploading(true);
                                                try {
                                                    const db = createClient();
                                                    const path = `branding/${profile?.id}/${Date.now()}_logo.png`;
                                                    const { error: upErr } = await db.storage.from('reports').upload(path, file);
                                                    if (upErr) throw upErr;
                                                    const { data: { publicUrl } } = db.storage.from('reports').getPublicUrl(path);
                                                    setBranding(b => ({ ...b, logo_url: publicUrl }));
                                                } catch (err: any) {
                                                    setError(err.message);
                                                } finally {
                                                    setUploading(false);
                                                }
                                            }} />
                                        </label>
                                    </div>
                                    <div className="flex-1 space-y-1">
                                        <h4 className="text-sm font-bold text-white">Organization Logo</h4>
                                        <p className="text-xs text-white/40">PNG with transparent background works best.</p>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <Field label="Organization Name">
                                        <input value={branding.org_name} onChange={e => setBranding(b => ({ ...b, org_name: e.target.value }))}
                                            className={INPUT} placeholder="e.g. Rillcod Technologies" />
                                    </Field>
                                    <Field label="Tagline / Motto">
                                        <input value={branding.org_tagline} onChange={e => setBranding(b => ({ ...b, org_tagline: e.target.value }))}
                                            className={INPUT} placeholder="e.g. Learning Reimagined" />
                                    </Field>
                                    <Field label="Business Email">
                                        <input value={branding.org_email} onChange={e => setBranding(b => ({ ...b, org_email: e.target.value }))}
                                            className={INPUT} placeholder="contact@rillcod.com" />
                                    </Field>
                                    <Field label="Business Phone">
                                        <input value={branding.org_phone} onChange={e => setBranding(b => ({ ...b, org_phone: e.target.value }))}
                                            className={INPUT} placeholder="+234..." />
                                    </Field>
                                    <Field label="Website URL">
                                        <input value={branding.org_website} onChange={e => setBranding(b => ({ ...b, org_website: e.target.value }))}
                                            className={INPUT} placeholder="www.rillcod.com" />
                                    </Field>
                                    <Field label="Full Address">
                                        <input value={branding.org_address} onChange={e => setBranding(b => ({ ...b, org_address: e.target.value }))}
                                            className={INPUT} placeholder="26 Ogiesoba Avenue..." />
                                    </Field>
                                </div>
                            </div>

                            <div className="p-6 bg-white/[0.03] border-t border-white/10 flex justify-end gap-3">
                                <button onClick={() => setShowSettings(false)}
                                    className="px-5 py-2.5 text-sm font-bold text-white/40 hover:text-white transition-colors">
                                    Cancel
                                </button>
                                <button onClick={async () => {
                                    setSaving(true);
                                    try {
                                        const res = await fetch('/api/report-settings', {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify(branding),
                                        });
                                        if (!res.ok) { const j = await res.json(); throw new Error(j.error || 'Failed to save'); }
                                        setSuccess('Branding settings saved!');
                                        setShowSettings(false);
                                    } catch (err: any) {
                                        setError(err.message);
                                    } finally {
                                        setSaving(false);
                                    }
                                }} className="flex items-center gap-2 px-6 py-2.5 bg-violet-600 hover:bg-violet-500 text-white text-sm font-bold rounded-xl transition-all shadow-lg shadow-violet-900/40">
                                    <CheckIcon className="w-4 h-4" /> Save Branding
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* ── Live Preview Modal ── */}
            {showPreview && (
                <div className="fixed inset-0 z-50 flex flex-col bg-[#05050a]">
                    <div className="flex items-center gap-4 px-8 py-4 border-b border-white/5 bg-[#0a0a14]">
                        <button onClick={() => setShowPreview(false)} className="p-2 hover:bg-white/5 rounded-xl transition-colors">
                            <ArrowLeftIcon className="w-6 h-6 text-white/40" />
                        </button>
                        <div className="flex-1">
                            <h3 className="text-white font-black">{form.student_name}</h3>
                            <p className="text-[10px] text-white/20 uppercase tracking-[0.2em] font-bold">Report Card Preview</p>
                        </div>
                        <button onClick={downloadPDF} disabled={isGeneratingPdf}
                            className="flex items-center gap-2 px-6 py-3 bg-violet-600 hover:bg-violet-500 text-white text-sm font-black rounded-2xl shadow-xl shadow-violet-900/30 transition-all disabled:opacity-50">
                            {isGeneratingPdf ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : <PrinterIcon className="w-4 h-4" />}
                            {isGeneratingPdf ? 'Processing...' : 'Export PDF'}
                        </button>
                    </div>
                    <div className="flex-1 overflow-auto p-4 sm:p-8 bg-black/40">
                        <div className="mx-auto rounded-[2rem] bg-white overflow-hidden shadow-2xl"
                            style={{ width: '210mm', minHeight: '297mm', transform: 'scale(0.85)', transformOrigin: 'top center' }}>
                            <ReportCard report={previewData} orgSettings={branding as any} />
                        </div>
                    </div>
                </div>
            )}

            <div style={{ position: 'fixed', left: -9999, top: 0, width: '210mm', pointerEvents: 'none', zIndex: -1 }}>
                <div ref={pdfRef}>
                    <ReportCard report={previewData} orgSettings={branding as any} />
                </div>
            </div>
        </div >
    );
}
