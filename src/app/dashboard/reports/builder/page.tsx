// @refresh reset
'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import { Database } from '@/types/supabase';
import ReportCard from '@/components/reports/ReportCard';
import { generateReportPDF, ScaledReportCard } from '@/lib/pdf-utils';
import {
    ArrowLeftIcon, CheckIcon, ArrowPathIcon, ExclamationTriangleIcon,
    UserGroupIcon, DocumentTextIcon, EyeIcon, XMarkIcon,
    Cog6ToothIcon, ArrowUpTrayIcon, ChevronDownIcon, ChevronUpIcon,
} from '@heroicons/react/24/outline';
import { Sparkles } from 'lucide-react';

type StudentReport = Database['public']['Tables']['student_progress_reports']['Row'];
type PortalUser    = Database['public']['Tables']['portal_users']['Row'];
type Course        = Database['public']['Tables']['courses']['Row'];

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

    const { profile, loading: authLoading } = useAuth();

    // ── Data ──────────────────────────────────────────────────────────────────
    const [students, setStudents] = useState<PortalUser[]>([]);
    const [courses, setCourses] = useState<Course[]>([]);
    const [schools, setSchools] = useState<{ id: string; name: string }[]>([]);
    const [search, setSearch] = useState('');

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
        assignments_grade: 'Good',
        proficiency_level: 'intermediate',
        key_strengths: '',
        areas_for_growth: '',
        instructor_assessment: '',
        is_published: false,
        photo_url: '',
        fee_status: '' as '' | 'paid' | 'outstanding' | 'partial' | 'sponsored' | 'waived',
    });

    // ── UI state ──────────────────────────────────────────────────────────────
    const [saving, setSaving] = useState(false);
    const [publishing, setPublishing] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [generating, setGenerating] = useState<string | null>(null);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [showPreview, setShowPreview] = useState(false);
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [milestoneInput, setMilestoneInput] = useState('');
    const pdfRef = useRef<HTMLDivElement>(null);

    const [branding, setBranding] = useState({
        org_name: '', org_tagline: '', org_address: '',
        org_phone: '', org_email: '', org_website: '', logo_url: '',
    });

    const isStaff = profile?.role === 'admin' || profile?.role === 'teacher';

    // ── Restore session config from localStorage + init date ──────────────────
    useEffect(() => {
        try {
            const saved = localStorage.getItem('rillcod_session_config');
            if (saved) {
                const parsed = JSON.parse(saved) as Partial<SessionConfig>;
                setSessionConfig(s => ({ ...s, ...parsed }));
            }
        } catch { /* ignore */ }
        setSessionConfig(s => ({ ...s, report_date: new Date().toISOString().split('T')[0] }));
    }, []);

    // ── Persist session config to localStorage on every change ────────────────
    useEffect(() => {
        try {
            localStorage.setItem('rillcod_session_config', JSON.stringify(sessionConfig));
        } catch { /* ignore */ }
    }, [sessionConfig]);

    // ── Load students, courses, branding ─────────────────────────────────────
    useEffect(() => {
        if (authLoading || !profile) return;
        const db = createClient();
        const q = db.from('portal_users').select('*').eq('role', 'student');
        const query = (profile.role === 'teacher' && profile.school_id) ? q.eq('school_id', profile.school_id) : q;

        Promise.all([
            query.order('full_name').limit(200),
            db.from('courses').select('*').eq('is_active', true).order('title'),
            db.from('report_settings').select('*').limit(1).maybeSingle(),
            db.from('schools').select('id, name').order('name'),
        ]).then(([sRes, cRes, bRes, schRes]) => {
            setStudents(sRes.data ?? []);
            setCourses(cRes.data ?? []);
            setSchools((schRes.data ?? []) as { id: string; name: string }[]);
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
            setSessionConfig(s => ({ ...s, instructor_name: s.instructor_name || profile?.full_name || '' }));

            if (prefStudentId) {
                const s = (sRes.data ?? []).find(x => x.id === prefStudentId);
                if (s) selectStudent(s as PortalUser, 0);
            }
        });
    }, [profile?.id, authLoading]); // eslint-disable-line

    const filteredStudents = students.filter(s =>
        !search || s.full_name?.toLowerCase().includes(search.toLowerCase()) || s.email?.toLowerCase().includes(search.toLowerCase())
    );

    const distinctClasses = [...new Set(students.map(s => (s as any).section_class).filter(Boolean))].sort() as string[];

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
            assignments_grade: report?.assignments_grade ?? 'Good',
            proficiency_level: report?.proficiency_level ?? 'intermediate',
            key_strengths: report?.key_strengths ?? '',
            areas_for_growth: report?.areas_for_growth ?? '',
            instructor_assessment: report?.instructor_assessment ?? '',
            is_published: report?.is_published ?? false,
            photo_url: report?.photo_url ?? (s as any).photo_url ?? '',
            fee_status: ((report as any)?.fee_status ?? '') as any,
        });
        setStep('edit');
        setSessionExpanded(false);
    }

    const overallScore = Math.round(
        parseFloat(form.theory_score || '0') * 0.4 +
        parseFloat(form.practical_score || '0') * 0.4 +
        parseFloat(form.attendance_score || '0') * 0.2
    );

    const letterGrade = (pct: number) => {
        if (pct >= 85) return 'A';
        if (pct >= 70) return 'B';
        if (pct >= 55) return 'C';
        if (pct >= 45) return 'D';
        return 'E';
    };

    // ── Save report ───────────────────────────────────────────────────────────
    const handleSave = async (publish = false) => {
        if (!selectedStudent) return;
        if (publish) setPublishing(true); else setSaving(true);
        setError(''); setSuccess('');

        try {
            const db = createClient();
            const payload: Database['public']['Tables']['student_progress_reports']['Insert'] = {
                student_id: selectedStudent.id,
                teacher_id: profile!.id,
                school_id: (selectedStudent as any).school_id ?? profile?.school_id ?? null,
                course_id: sessionConfig.course_id || null,
                student_name: form.student_name,
                school_name: sessionConfig.school_name || null,
                section_class: form.section_class || sessionConfig.section_class || null,
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
                assignments_grade: form.assignments_grade,
                overall_grade: letterGrade(overallScore),
                overall_score: overallScore,
                key_strengths: form.key_strengths || null,
                areas_for_growth: form.areas_for_growth || null,
                instructor_assessment: form.instructor_assessment || null,
                has_certificate: overallScore >= 45,
                certificate_text: overallScore >= 45
                    ? `This document officially recognizes that ${form.student_name} has successfully completed the intensive study programme in ${sessionConfig.course_name || 'the enrolled course'}.`
                    : null,
                course_completed: overallScore >= 45 ? `Completed — ${sessionConfig.report_term}` : null,
                proficiency_level: form.proficiency_level as 'beginner' | 'intermediate' | 'advanced',
                is_published: publish ? true : form.is_published,
                photo_url: form.photo_url || null,
                updated_at: new Date().toISOString(),
                // Payment / school section fields
                school_section: sessionConfig.school_section || null,
                fee_label: sessionConfig.fee_label || null,
                fee_amount: sessionConfig.fee_amount || null,
                fee_status: form.fee_status || null,
                show_payment_notice: sessionConfig.show_payment_notice,
            };

            if (existingReport) {
                const { error: updErr } = await db.from('student_progress_reports').update(payload).eq('id', existingReport.id);
                if (updErr) throw updErr;
            } else {
                const { data: created, error: insErr } = await db.from('student_progress_reports').insert(payload).select('id').single();
                if (insErr) throw insErr;
                setExistingReport({ ...payload, id: created.id } as StudentReport);
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
    const handleAIGenerate = async (field: 'key_strengths' | 'areas_for_growth') => {
        setGenerating(field);
        setError('');
        try {
            await new Promise(r => setTimeout(r, 1500));
            const responses: Record<string, string> = {
                key_strengths: `${form.student_name} demonstrates exceptional grasp of ${sessionConfig.current_module} concepts, particularly in practical implementation. Their ${form.projects_grade} project performance highlights strong problem-solving abilities.`,
                areas_for_growth: `While proficient in theory, ${form.student_name} can improve by dedicating more time to independent research and collaborative projects. Increasing class participation will also help solidify understanding.`,
            };
            setForm(f => ({ ...f, [field]: responses[field] }));
            setSuccess('AI evaluation generated!');
        } catch {
            setError('AI generation failed');
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

    const previewData = {
        ...sessionConfig,
        ...form,
        // explicit overrides so correct types and priorities are preserved
        id: existingReport?.id || 'Preview',
        section_class: form.section_class || sessionConfig.section_class || undefined,
        school_name: sessionConfig.school_name || undefined,
        theory_score: parseFloat(form.theory_score),
        practical_score: parseFloat(form.practical_score),
        attendance_score: parseFloat(form.attendance_score),
        overall_score: overallScore,
        has_certificate: overallScore >= 45,
        certificate_text: overallScore >= 45
            ? `This document officially recognizes that ${form.student_name} has successfully completed the intensive study programme in ${sessionConfig.course_name || 'the enrolled course'}.`
            : undefined,
        fee_status: form.fee_status || undefined,
        fee_label: sessionConfig.fee_label || undefined,
        fee_amount: sessionConfig.fee_amount || undefined,
        school_section: sessionConfig.school_section || undefined,
    };

    // ── Guards ────────────────────────────────────────────────────────────────
    if (authLoading) return (
        <div className="min-h-screen bg-[#0f0f1a] flex items-center justify-center">
            <div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
        </div>
    );
    if (!isStaff) return (
        <div className="min-h-screen bg-[#0f0f1a] flex items-center justify-center">
            <p className="text-white/40">Staff access required.</p>
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
                                {CLASS_PRESETS.map(c => <option key={c} value={c}>{c}</option>)}
                                {distinctClasses.filter(c => !CLASS_PRESETS.includes(c)).map(c => <option key={c} value={c}>{c}</option>)}
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
                                    <Sparkles className="w-3.5 h-3.5" /> Preview
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
                                        onChange={e => setSessionConfig(s => ({ ...s, school_name: e.target.value }))}
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
                                        {CLASS_PRESETS.map(c => <option key={c} value={c}>{c}</option>)}
                                        {distinctClasses.filter(c => !CLASS_PRESETS.includes(c)).map(c => <option key={c} value={c}>{c}</option>)}
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
                                <input
                                    type="search" placeholder="Search…"
                                    value={search} onChange={e => setSearch(e.target.value)}
                                    className="ml-auto bg-white/5 border border-white/10 text-white text-sm px-3 py-1.5 rounded-xl placeholder:text-white/30 focus:outline-none focus:border-violet-500 w-44" />
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                {filteredStudents.map((s, idx) => (
                                    <button key={s.id} onClick={() => selectStudent(s as PortalUser, idx)}
                                        className="text-left p-4 bg-white/5 border border-white/10 hover:border-violet-500/50 hover:bg-violet-600/10 rounded-xl transition-all">
                                        <div className="flex items-center gap-3">
                                            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-600 to-blue-600 flex items-center justify-center text-sm font-black text-white flex-shrink-0">
                                                {s.full_name ? s.full_name[0] : '?'}
                                            </div>
                                            <div className="min-w-0">
                                                <p className="font-semibold text-white text-sm truncate">{s.full_name ?? 'Unnamed'}</p>
                                                <p className="text-xs text-white/40 truncate">{(s as any).section_class ?? s.email}</p>
                                            </div>
                                            <span className="ml-auto text-[10px] text-white/20 font-mono flex-shrink-0">#{idx + 1}</span>
                                        </div>
                                    </button>
                                ))}
                                {filteredStudents.length === 0 && (
                                    <p className="text-white/30 text-sm col-span-3 py-8 text-center">No students found.</p>
                                )}
                            </div>
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
                                    <div className="flex flex-col sm:flex-row items-start gap-4">
                                        <div className="relative group">
                                            <div className="w-24 h-24 rounded-2xl bg-white/5 border-2 border-dashed border-white/20 flex items-center justify-center overflow-hidden">
                                                {form.photo_url ? (
                                                    <img src={form.photo_url} className="w-full h-full object-cover" alt="Student" />
                                                ) : (
                                                    <UserGroupIcon className="w-8 h-8 text-white/20" />
                                                )}
                                                {uploading && (
                                                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                                                        <ArrowPathIcon className="w-6 h-6 animate-spin text-white" />
                                                    </div>
                                                )}
                                            </div>
                                            <label className="absolute -bottom-2 -right-2 bg-violet-600 hover:bg-violet-500 p-1.5 rounded-xl border border-white/10 cursor-pointer transition-colors shadow-lg">
                                                <ArrowUpTrayIcon className="w-3.5 h-3.5 text-white" />
                                                <input type="file" className="hidden" accept="image/*" onChange={handlePhotoUpload} />
                                            </label>
                                        </div>
                                        <div className="flex-1 space-y-3">
                                            <Field label="Full Name">
                                                <input value={form.student_name} onChange={e => setForm(f => ({ ...f, student_name: e.target.value }))} className={INPUT} />
                                            </Field>
                                            <div className="p-3 bg-white/[0.03] border border-white/10 rounded-xl space-y-2">
                                                <div>
                                                    <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-0.5">School</p>
                                                    <p className="text-sm text-white/70 font-semibold">{sessionConfig.school_name || '—'}</p>
                                                </div>
                                                <div>
                                                    <label className="text-[10px] font-bold text-white/30 uppercase tracking-widest block mb-1">Class</label>
                                                    <select
                                                        value={form.section_class}
                                                        onChange={e => setForm(f => ({ ...f, section_class: e.target.value }))}
                                                        className="w-full px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-violet-500 transition-colors">
                                                        <option value="">— Select class —</option>
                                                        {CLASS_PRESETS.map(c => <option key={c} value={c}>{c}</option>)}
                                                        {distinctClasses.filter(c => !CLASS_PRESETS.includes(c)).map(c => <option key={c} value={c}>{c}</option>)}
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
                                                        <option value="">— Not specified (won't show on report) —</option>
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
                                <Section title="Performance Scores (0 – 100)" icon="📊">
                                    {(['theory_score', 'practical_score', 'attendance_score'] as const).map((key) => {
                                        const labels: Record<string, string> = {
                                            theory_score: 'Theory Score (40%)',
                                            practical_score: 'Practical Score (40%)',
                                            attendance_score: 'Attendance Score (20%)',
                                        };
                                        const colors: Record<string, string> = {
                                            theory_score: 'text-indigo-400',
                                            practical_score: 'text-emerald-400',
                                            attendance_score: 'text-amber-400',
                                        };
                                        const val = parseInt(form[key]) || 0;
                                        return (
                                            <div key={key}>
                                                <div className="flex justify-between mb-1.5">
                                                    <label className="text-xs font-semibold text-white/40 uppercase tracking-wider">{labels[key]}</label>
                                                    <span className={`text-sm font-black ${colors[key]}`}>{val}%</span>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <input
                                                        type="range" min="0" max="100" value={val}
                                                        onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                                                        className="flex-1 accent-violet-500 cursor-pointer" />
                                                    <input
                                                        type="number" min="0" max="100" value={form[key]}
                                                        onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                                                        className="w-16 text-center px-2 py-1.5 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-violet-500" />
                                                </div>
                                            </div>
                                        );
                                    })}

                                    {/* Overall display */}
                                    <div className="mt-2 p-4 bg-violet-600/10 border border-violet-500/20 rounded-2xl flex items-center justify-between">
                                        <div>
                                            <p className="text-xs font-bold text-violet-300/60 uppercase tracking-widest">Weighted Overall</p>
                                            <p className="text-3xl font-black text-white mt-0.5">{overallScore}%</p>
                                        </div>
                                        <div className="text-center">
                                            <p className="text-xs font-bold text-violet-300/60 uppercase tracking-widest mb-1">Grade</p>
                                            <div className="w-14 h-14 rounded-2xl bg-violet-600 flex items-center justify-center">
                                                <span className="text-2xl font-black text-white">{letterGrade(overallScore)}</span>
                                            </div>
                                        </div>
                                    </div>
                                </Section>

                                {/* Grades */}
                                <Section title="Grade Qualifiers" icon="🏅">
                                    <div className="grid grid-cols-3 gap-3">
                                        {[
                                            { key: 'participation_grade', label: 'Participation' },
                                            { key: 'projects_grade', label: 'Project Work' },
                                            { key: 'homework_grade', label: 'Homework' },
                                        ].map(({ key, label }) => (
                                            <Field key={key} label={label}>
                                                <select value={(form as any)[key]}
                                                    onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                                                    className={INPUT}>
                                                    {GRADE_OPTIONS.map(g => <option key={g} value={g}>{g}</option>)}
                                                </select>
                                            </Field>
                                        ))}
                                    </div>
                                    {/* Auto-certificate notice */}
                                    <div className="flex items-center gap-2 px-3 py-2 bg-amber-500/10 border border-amber-500/20 rounded-xl mt-1">
                                        <span className="text-amber-400 text-xs">🏆</span>
                                        <p className="text-xs text-amber-300/80">
                                            Certificate is automatically awarded when overall score ≥ 45% (Grade D)
                                            {overallScore > 0 && (
                                                <span className={`ml-1 font-bold ${overallScore >= 45 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                    — {overallScore >= 45 ? 'Will be awarded' : 'Not awarded'} ({overallScore}%)
                                                </span>
                                            )}
                                        </p>
                                    </div>
                                </Section>
                            </div>

                            {/* Right column */}
                            <div className="space-y-4">

                                {/* Evaluation */}
                                <Section title="Instructor Evaluation" icon="✍️">
                                    {(['key_strengths', 'areas_for_growth'] as const).map(field => {
                                        const labels: Record<string, string> = {
                                            key_strengths: 'Key Strengths',
                                            areas_for_growth: 'Areas for Growth',
                                        };
                                        return (
                                            <div key={field}>
                                                <div className="flex items-center justify-between mb-1.5">
                                                    <label className="text-xs font-semibold text-white/40 uppercase tracking-wider">{labels[field]}</label>
                                                    <button onClick={() => handleAIGenerate(field)} disabled={!!generating}
                                                        className="flex items-center gap-1 text-[10px] font-bold text-violet-400 hover:text-violet-300 disabled:opacity-50 transition-colors">
                                                        {generating === field
                                                            ? <ArrowPathIcon className="w-3 h-3 animate-spin" />
                                                            : <Sparkles className="w-3 h-3" />}
                                                        {generating === field ? 'Generating…' : 'AI Draft'}
                                                    </button>
                                                </div>
                                                <textarea rows={3} value={(form as any)[field]}
                                                    onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
                                                    placeholder={`Enter ${labels[field].toLowerCase()}…`}
                                                    className={`${INPUT} resize-none`} />
                                            </div>
                                        );
                                    })}
                                </Section>

                            </div>
                        </div>

                        {/* ── Sticky action bar ── */}
                        <div className="sticky bottom-0 bg-[#0f0f1a]/97 backdrop-blur-md border-t border-white/10 px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] flex items-center gap-2 flex-wrap">
                            <button onClick={() => handleSave(false)} disabled={saving || publishing}
                                className="flex items-center gap-1.5 px-4 py-2.5 bg-white/10 hover:bg-white/15 text-white text-xs font-bold rounded-xl transition-all disabled:opacity-50">
                                {saving ? <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" /> : <CheckIcon className="w-3.5 h-3.5" />}
                                {saving ? 'Saving…' : 'Save Draft'}
                            </button>
                            <button onClick={() => handleSave(true)} disabled={saving || publishing}
                                className="flex items-center gap-1.5 px-4 py-2.5 bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-bold rounded-xl transition-all disabled:opacity-50">
                                {publishing ? <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" /> : <EyeIcon className="w-3.5 h-3.5" />}
                                {publishing ? 'Publishing…' : 'Save & Publish'}
                            </button>
                            <button onClick={() => setShowPreview(true)}
                                className="flex items-center gap-1.5 px-3 py-2.5 bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-bold rounded-xl transition-all">
                                <Sparkles className="w-3.5 h-3.5" /> Preview
                            </button>
                            <div className="ml-auto flex gap-2">
                                {currentStudentIdx < filteredStudents.length - 1 ? (
                                    <button onClick={() => saveAndNext(false)} disabled={saving || publishing}
                                        className="flex items-center gap-1.5 px-5 py-2.5 bg-violet-600 hover:bg-violet-500 text-white text-xs font-black rounded-xl transition-all disabled:opacity-50 shadow-lg shadow-violet-900/30">
                                        {saving ? <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" /> : null}
                                        Save & Next Student →
                                    </button>
                                ) : (
                                    <button onClick={() => { handleSave(false); setStep('pick'); }} disabled={saving || publishing}
                                        className="flex items-center gap-1.5 px-5 py-2.5 bg-violet-600 hover:bg-violet-500 text-white text-xs font-black rounded-xl transition-all disabled:opacity-50">
                                        Save & Done ✓
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* ── Branding Settings Modal ── */}
            {showSettings && (
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
                                            <Layout className="w-8 h-8 text-white/20" />
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
                                        className={INPUT} placeholder="e.g. Rillcod Academy" />
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
                                    const db = createClient();
                                    const { error: setErr } = await db.from('report_settings').upsert({
                                        ...branding,
                                        teacher_id: profile?.id,
                                        school_id: profile?.school_id || null,
                                        updated_at: new Date().toISOString(),
                                    }, { onConflict: 'teacher_id' });
                                    if (setErr) throw setErr;
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
            )}

            {/* ── Live Preview Modal ── */}
            {showPreview && (
                <div className="fixed inset-0 z-50 flex flex-col bg-[#0a0a14]">
                    <div className="flex items-center gap-2 px-4 sm:px-6 py-3 border-b border-white/10 bg-white/5 flex-shrink-0 flex-wrap">
                        <button onClick={() => setShowPreview(false)}
                            className="p-2 hover:bg-white/10 rounded-xl transition-colors">
                            <ArrowLeftIcon className="w-5 h-5 text-white/60" />
                        </button>
                        <div className="flex-1 min-w-0">
                            <p className="text-white font-black text-sm truncate">{form.student_name || 'Preview'}</p>
                            <p className="text-white/30 text-[10px]">Live Report Preview</p>
                        </div>
                        <button onClick={downloadPDF} disabled={isGeneratingPdf}
                            className="flex items-center gap-1.5 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold rounded-xl transition-all disabled:opacity-50 flex-shrink-0">
                            {isGeneratingPdf
                                ? <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" />
                                : <ArrowUpTrayIcon className="w-3.5 h-3.5" />}
                            {isGeneratingPdf ? 'Generating…' : 'Download PDF'}
                        </button>
                    </div>
                    <div className="flex-1 overflow-auto bg-[#1a1a2e]/40 p-4 sm:p-8">
                        <div className="mx-auto shadow-2xl" style={{ maxWidth: 794 }}>
                            <ScaledReportCard report={previewData} orgSettings={branding as any} />
                        </div>
                    </div>
                </div>
            )}

            {/* ── PDF capture div — off-screen; no opacity so html2canvas captures full color ── */}
            <div style={{ position: 'fixed', left: -9999, top: 0, width: 794, pointerEvents: 'none', zIndex: -1 }}>
                <div ref={pdfRef}>
                    <ReportCard report={previewData} orgSettings={branding as any} />
                </div>
            </div>
        </div>
    );
}
