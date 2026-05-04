// @refresh reset
'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import { Database } from '@/types/supabase';
import ReportCard from '@/components/reports/ReportCard';
import ModernReportCard from '@/components/reports/ModernReportCard';
import PrintableReport from '@/components/reports/PrintableReport';
import { generateReportPDF, ScaledReportCard, shareReportCard } from '@/lib/pdf-utils';
import {
    ArrowLeftIcon, CheckIcon, ArrowPathIcon, ExclamationTriangleIcon,
    UserGroupIcon, DocumentTextIcon, EyeIcon, XMarkIcon,
    Cog6ToothIcon, ArrowUpTrayIcon, ChevronDownIcon, ChevronUpIcon,
    PhotoIcon, RocketLaunchIcon, CloudArrowUpIcon, ChevronRightIcon,
    CheckCircleIcon, PrinterIcon, SparklesIcon, PlusIcon,
} from '@/lib/icons';

function WhatsAppIcon({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
            <path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.558 4.122 1.533 5.849L.057 23.852a.5.5 0 0 0 .611.611l6.003-1.476A11.952 11.952 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.89 0-3.663-.523-5.176-1.432l-.372-.22-3.849.946.964-3.849-.24-.381A9.953 9.953 0 0 1 2 12C2 6.478 6.478 2 12 2s10 4.478 10 10-4.478 10-10 10z"/>
        </svg>
    );
}


import { cn } from '@/lib/utils';

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

// ── WAEC 6-component weights ──────────────────────────────────────────────────
const WAEC_WEIGHTS = { theory: 0.20, classwork: 0.10, practical: 0.25, assignments: 0.20, attendance: 0.10, assessment: 0.15 };

// ── Activity qualifier quick-picks (curriculum-mapped, no overlap) ────────────
const CLASSWORK_PICKS = [
    'Fully Engaged', 'Active Learner', 'Consistently Attentive', 'Shows Initiative',
    'Mostly Engaged', 'Improving Steadily', 'Needs Encouragement', 'Rarely Participates',
    'Task Focused', 'Asks Good Questions', 'Helps Peers', 'Easily Distracted',
];
const PROJECTS_PICKS = [
    'All Delivered', 'Strong Deliverables', 'Outstanding Work', 'Projects Complete',
    'Mostly Complete', 'Partially Submitted', 'Needs Improvement', 'Incomplete Labs',
    'Built & Deployed', 'Creative Solutions', 'Logic Correct', 'Requires Rework',
];
const HOMEWORK_PICKS = [
    'Always Submitted', 'Consistently On-time', 'Mostly Punctual', 'Above Average',
    'Partially Complete', 'Often Late', 'Rarely Submitted', 'Below Expectation',
    'Improving Pattern', 'Needs Catch-up', 'Reliable Output', 'Inconsistent Effort',
];

// ── Module suggestions (curriculum-aware) ─────────────────────────────────────
const MODULE_SUGGESTIONS: Record<string, { modules: string[]; next: string[] }> = {
    python: {
        modules: ['Variables & Data Types', 'Control Flow & Loops', 'Functions & Scope', 'Lists & Dictionaries', 'OOP Basics', 'File Handling', 'APIs & Libraries', 'Final Project'],
        next:    ['Control Flow & Loops', 'Functions & Scope', 'Lists & Dictionaries', 'OOP Basics', 'File Handling', 'APIs & Libraries', 'Final Project', 'Course Complete'],
    },
    javascript: {
        modules: ['Variables & Data Types', 'Control Flow & Conditionals', 'Functions & Scope', 'Arrays & Objects', 'DOM Manipulation', 'Events & Listeners', 'Async JS & Fetch API', 'Final JS Project'],
        next:    ['Control Flow & Conditionals', 'Functions & Scope', 'Arrays & Objects', 'DOM Manipulation', 'Events & Listeners', 'Async JS & Fetch API', 'Final JS Project', 'Course Complete'],
    },
    html: {
        modules: ['HTML Structure & Tags', 'Text, Links & Media', 'Tables & Forms', 'Semantic HTML5', 'CSS Selectors & Properties', 'Box Model & Layout', 'Flexbox & Grid', 'Final Webpage Project'],
        next:    ['Text, Links & Media', 'Tables & Forms', 'Semantic HTML5', 'CSS Selectors & Properties', 'Box Model & Layout', 'Flexbox & Grid', 'Final Webpage Project', 'Course Complete'],
    },
    web: {
        modules: ['HTML Fundamentals', 'CSS Styling & Layout', 'Flexbox & Grid', 'JavaScript Basics', 'DOM Manipulation', 'Forms & Validation', 'Responsive Design', 'Deployment'],
        next:    ['CSS Styling & Layout', 'Flexbox & Grid', 'JavaScript Basics', 'DOM Manipulation', 'Forms & Validation', 'Responsive Design', 'Deployment', 'Course Complete'],
    },
    ai: {
        modules: ['Intro to AI & ML', 'Data Collection & Cleaning', 'Supervised Learning', 'Model Training', 'Evaluation & Metrics', 'Neural Networks Basics', 'Real-world Projects', 'AI Ethics'],
        next:    ['Data Collection & Cleaning', 'Supervised Learning', 'Model Training', 'Evaluation & Metrics', 'Neural Networks Basics', 'Real-world Projects', 'AI Ethics', 'Course Complete'],
    },
    robotics: {
        modules: ['Circuit Fundamentals', 'Arduino Setup', 'Sensors & Actuators', 'Motor Control', 'LED & Display Programming', 'Line Follower Build', 'Autonomous Systems', 'Final Robot Project'],
        next:    ['Arduino Setup', 'Sensors & Actuators', 'Motor Control', 'LED & Display Programming', 'Line Follower Build', 'Autonomous Systems', 'Final Robot Project', 'Course Complete'],
    },
    scratch: {
        modules: ['Scratch Interface & Sprites', 'Motion & Events', 'Loops & Conditions', 'Variables & Operators', 'Interactive Stories', 'Game Design', 'Animation Project', 'Sharing & Publishing'],
        next:    ['Motion & Events', 'Loops & Conditions', 'Variables & Operators', 'Interactive Stories', 'Game Design', 'Animation Project', 'Sharing & Publishing', 'Course Complete'],
    },
    game: {
        modules: ['Game Design Principles', 'Engine Setup (Unity/GDevelop)', 'Player Movement', 'Collision & Physics', 'Score & UI', 'Levels & Progression', 'Sound & Effects', 'Publish & Share'],
        next:    ['Engine Setup (Unity/GDevelop)', 'Player Movement', 'Collision & Physics', 'Score & UI', 'Levels & Progression', 'Sound & Effects', 'Publish & Share', 'Course Complete'],
    },
    default: {
        modules: ['Introduction & Setup', 'Core Concepts Week 1-2', 'Practical Skills Week 3-4', 'Mid-term Assessment', 'Advanced Topics Week 5-6', 'Project Development', 'Final Assessment', 'Course Review'],
        next:    ['Core Concepts Week 1-2', 'Practical Skills Week 3-4', 'Mid-term Assessment', 'Advanced Topics Week 5-6', 'Project Development', 'Final Assessment', 'Course Review', 'Course Complete'],
    },
};

function getModuleSuggestions(courseName: string): { modules: string[]; next: string[] } {
    const lower = (courseName || '').toLowerCase();
    if (lower.includes('python'))                                                       return MODULE_SUGGESTIONS.python;
    if (lower.includes('javascript') || lower.includes('js ') || lower === 'js')       return MODULE_SUGGESTIONS.javascript;
    if (lower.startsWith('html') || lower.startsWith('css') || (lower.includes('html') && lower.includes('css') && !lower.includes('javascript'))) return MODULE_SUGGESTIONS.html;
    if (lower.includes('web') || lower.includes('html') || lower.includes('css'))      return MODULE_SUGGESTIONS.web;
    if (lower.includes('ai') || lower.includes('machine') || lower.includes('ml'))     return MODULE_SUGGESTIONS.ai;
    if (lower.includes('robot') || lower.includes('arduino'))                          return MODULE_SUGGESTIONS.robotics;
    if (lower.includes('scratch'))                                                      return MODULE_SUGGESTIONS.scratch;
    if (lower.includes('game'))                                                         return MODULE_SUGGESTIONS.game;
    return MODULE_SUGGESTIONS.default;
}
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

const MILESTONE_SUGGESTIONS: Record<string, string[]> = {
    default: [
        'Completed all assigned coursework for the term',
        'Demonstrated strong problem-solving skills',
        'Successfully built and submitted a project',
        'Showed consistent attendance and participation',
        'Improved coding speed and accuracy significantly',
        'Passed all assessments above the pass mark',
    ],
    python: [
        'Mastered Python syntax: variables, loops, and functions',
        'Built a working Python project (calculator / quiz / game)',
        'Understood object-oriented programming concepts',
        'Successfully used Python libraries (e.g. math, random)',
        'Debugged and fixed at least 3 real code errors',
        'Completed Python exercises with 80%+ accuracy',
    ],
    javascript: [
        'Mastered JS fundamentals: variables, functions, and arrays',
        'Built interactive web features using DOM manipulation',
        'Handled user events with event listeners and callbacks',
        'Fetched and displayed live data from a public API',
        'Debugged JavaScript errors using the browser console',
        'Completed a final JavaScript project with real functionality',
    ],
    html: [
        'Built well-structured HTML pages using semantic tags',
        'Styled layouts using CSS properties and the box model',
        'Created responsive designs with Flexbox or Grid',
        'Built working forms with labels, validation, and inputs',
        'Understood the difference between block and inline elements',
        'Delivered a final multi-page styled HTML/CSS website',
    ],
    web: [
        'Built a fully styled HTML/CSS webpage from scratch',
        'Applied responsive design using Flexbox or Grid',
        'Added interactivity to a page using JavaScript',
        'Deployed a live website (GitHub Pages or Netlify)',
        'Understood DOM manipulation and event handling',
        'Created a personal portfolio website',
    ],
    ai: [
        'Understood core concepts of Artificial Intelligence',
        'Trained a basic classification model using real data',
        'Explored AI tools and their real-world applications',
        'Completed a machine learning project end-to-end',
        'Understood bias, fairness, and ethics in AI systems',
        'Applied AI techniques to solve a local problem',
    ],
    robotics: [
        'Assembled and programmed an Arduino-based circuit',
        'Controlled LEDs, motors, and sensors using code',
        'Built a functional robot prototype for a real task',
        'Understood basic electronics: voltage, current, resistance',
        'Completed wiring and debugging of a hardware project',
        'Demonstrated safe and proper use of lab equipment',
    ],
    scratch: [
        'Created an interactive Scratch animation story',
        'Built a working game using Scratch sprites and blocks',
        'Used loops, conditions, and events correctly in Scratch',
        'Recorded and shared a Scratch project with the class',
        'Demonstrated computational thinking through block logic',
        'Helped a classmate fix their Scratch project',
    ],
    game: [
        'Designed and built a playable 2D game',
        'Applied game logic: score, lives, levels, and collision',
        'Used a game engine or framework to develop the project',
        'Created original game art or used free assets ethically',
        'Playtested and improved game based on peer feedback',
        'Wrote a brief game design document (GDD)',
    ],
};

function getMilestoneSuggestions(courseName: string): string[] {
    const lower = (courseName || '').toLowerCase();
    if (lower.includes('python'))                                                       return MILESTONE_SUGGESTIONS.python;
    if (lower.includes('javascript') || lower.includes('js ') || lower === 'js')       return MILESTONE_SUGGESTIONS.javascript;
    if (lower.startsWith('html') || lower.startsWith('css') || (lower.includes('html') && lower.includes('css') && !lower.includes('javascript'))) return MILESTONE_SUGGESTIONS.html;
    if (lower.includes('web') || lower.includes('html') || lower.includes('css'))      return MILESTONE_SUGGESTIONS.web;
    if (lower.includes('ai') || lower.includes('machine') || lower.includes('ml'))     return MILESTONE_SUGGESTIONS.ai;
    if (lower.includes('robot') || lower.includes('arduino') || lower.includes('iot')) return MILESTONE_SUGGESTIONS.robotics;
    if (lower.includes('scratch'))                                                      return MILESTONE_SUGGESTIONS.scratch;
    if (lower.includes('game'))                                                         return MILESTONE_SUGGESTIONS.game;
    return MILESTONE_SUGGESTIONS.default;
}

const INPUT = 'w-full px-4 py-2.5 bg-card shadow-sm border border-border rounded-xl text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary transition-colors';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">{label}</label>
            {children}
        </div>
    );
}

function Section({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
    return (
        <div className="bg-card shadow-sm border border-border rounded-xl overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-3 bg-white/[0.03] border-b border-border">
                <span>{icon}</span>
                <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">{title}</h3>
            </div>
            <div className="p-5 space-y-4">{children}</div>
        </div>
    );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ReportBuilderPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-background flex items-center justify-center">
                <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
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
    const [programs, setPrograms] = useState<{ id: string; name: string }[]>([]);
    const [schools, setSchools] = useState<{ id: string; name: string }[]>([]);
    const [sessionProgramId, setSessionProgramId] = useState('');
    const [teacherClasses, setTeacherClasses] = useState<{ id: string; name: string; school_id: string | null }[]>([]);
    const [search, setSearch] = useState('');
    const [classFilter, setClassFilter] = useState('');
    const [overrideFilters, setOverrideFilters] = useState(false);
    const [manualName, setManualName] = useState('');

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
        school_section: '',
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
        // ── WAEC 6-component scores ──────────────────────────────────────────
        theory_score:       '0',   // Theory/Written    20%
        classwork_score:    '0',   // Classwork         10%  (→ engagement_metrics)
        practical_score:    '0',   // Practical/Projects 25%
        attendance_score:   '0',   // Assignments       20%  (DB: attendance_score)
        participation_score:'0',   // Attendance        10%  (DB: participation_score)
        assessment_score:   '0',   // Mid-term          15%  (→ engagement_metrics)
        // ── Qualitative ─────────────────────────────────────────────────────
        participation_grade: '',   // Classwork qualifier comment
        projects_grade: '',        // Practical/Projects qualifier comment
        homework_grade: '',        // Assignments qualifier comment
        proficiency_level: 'intermediate',
        key_strengths: '',
        areas_for_growth: '',
        is_published: false,
        photo_url: '',
        fee_status: '' as '' | 'paid' | 'outstanding' | 'partial' | 'sponsored' | 'waived',
        student_current_module: '',
        student_next_module: '',
    });

    // ── UI state ──────────────────────────────────────────────────────────────
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [publishing, setPublishing] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [generating, setGenerating] = useState<string | null>(null);
    const [generatingAll, setGeneratingAll] = useState(false);
    const [fetchingStats, setFetchingStats] = useState(false);
    const [studentStats, setStudentStats] = useState({
        attendance: 0, totalSessions: 0,
        assignments: 0, totalAssignments: 0,
        cbtScore: 0,
        assignmentAvg: 0,
        assignmentPct: 0,
        projects: 0,
    });
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    // null = no issue | 'published' = already published this term | 'cross-session' = loaded from different course/term
    const [duplicateWarning, setDuplicateWarning] = useState<null | 'published' | 'cross-session'>(null);
    const [duplicateDetail, setDuplicateDetail] = useState<string>('');

    // Auto-clear success after 4 seconds
    const setSuccessMsg = (msg: string) => {
        setSuccess(msg);
        if (successTimerRef.current) clearTimeout(successTimerRef.current);
        successTimerRef.current = setTimeout(() => setSuccess(''), 4000);
    };
    const [showPreview, setShowPreview] = useState(false);
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
    const [isSharingPdf, setIsSharingPdf] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [milestoneInput, setMilestoneInput] = useState('');
    const [showMilestoneSuggestions, setShowMilestoneSuggestions] = useState(false);
    const [forceCertificate, setForceCertificate] = useState(false);
    const [isBulkBuilding, setIsBulkBuilding] = useState(false);
    const [reportStyle, setReportStyle] = useState<'standard'|'modern'|'printable'>('modern');
    const [modernTemplateId, setModernTemplateId] = useState<'industrial'|'executive'|'futuristic'>('industrial');
    const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0 });
    const [previewScale, setPreviewScale] = useState(0.85);
    const previewContainerRef = useRef<HTMLDivElement>(null);
    const pdfRef = useRef<HTMLDivElement>(null);

    // ── Per-student module suggestion (derived from student's previous report) ──
    const [suggestedModule, setSuggestedModule] = useState<{ current: string; next: string } | null>(null);

    // ── Refs for restoring session after data load ────────────────────────────
    const pendingRestoreStudentId = useRef<string | null>(null);
    const pendingRestoreStudentIdx = useRef<number>(-1);

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
    useEffect(() => {
        if (typeof window === 'undefined' || !profile?.id) return;
        const storageKey = `rillcod_report_session_${profile.id}`;
        try {
            const saved = localStorage.getItem(storageKey);
            if (saved) {
                const parsed = JSON.parse(saved) as Partial<SessionConfig> & {
                    _step?: string; _sessionDone?: boolean;
                    _selectedStudentId?: string; _currentStudentIdx?: number;
                };
                const { _step, _sessionDone, _selectedStudentId, _currentStudentIdx, ...config } = parsed;
                setSessionConfig(s => ({ ...s, ...config }));
                if (_step && _step !== 'session') {
                    setStep(_step as any);
                    if (_sessionDone) setSessionDone(true);
                }
                if (_selectedStudentId) {
                    pendingRestoreStudentId.current = _selectedStudentId;
                    pendingRestoreStudentIdx.current = _currentStudentIdx ?? -1;
                }
            }
        } catch { /* ignore */ }
        setSessionConfig(s => ({ ...s, report_date: new Date().toISOString().split('T')[0] }));
    }, [profile?.id]);

    // ── Dynamic preview scale based on container width ────────────────────────
    useEffect(() => {
        if (!showPreview) return;
        const A4_PX = 794;
        function updateScale() {
            const el = previewContainerRef.current;
            if (!el) return;
            const availW = el.clientWidth - 32;
            setPreviewScale(Math.min(0.85, availW / A4_PX));
        }
        const timer = setTimeout(updateScale, 50); // wait for mount
        const obs = typeof ResizeObserver !== 'undefined'
            ? new ResizeObserver(updateScale) : null;
        if (obs && previewContainerRef.current) obs.observe(previewContainerRef.current);
        return () => { clearTimeout(timer); obs?.disconnect(); };
    }, [showPreview]);

    // ── Persist session config + navigation state to localStorage ────────────
    useEffect(() => {
        if (typeof window === 'undefined' || !profile?.id) return;
        const storageKey = `rillcod_report_session_${profile.id}`;
        try {
            localStorage.setItem(storageKey, JSON.stringify({
                ...sessionConfig,
                _step: step,
                _sessionDone: sessionDone,
                _selectedStudentId: selectedStudent?.id ?? null,
                _currentStudentIdx: currentStudentIdx,
            }));
        } catch { /* ignore */ }
    }, [sessionConfig, step, sessionDone, selectedStudent?.id, currentStudentIdx, profile?.id]);

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
            setLoading(true);
            try {
                // 1. Fetch assigned schools via API (service role — bypasses RLS for teachers)
                let schoolsList: { id: string; name: string }[] = [];

            // Fetch schools via API (uses service role — bypasses RLS for teachers)
            const schRes = await fetch('/api/schools', { cache: 'no-store' });
            if (schRes.ok) {
                const schJson = await schRes.json();
                schoolsList = (schJson.data ?? []).map((s: any) => ({ id: s.id, name: s.name }));
            }

            // 2. Fetch portal students via API (service_role — bypasses RLS so teachers see their school's students)
            const portalRes = await fetch(`/api/portal-users?role=student&scoped=true`, { cache: 'no-store' });
            const portalJson = portalRes.ok ? await portalRes.json() : { data: [] };

            // Build shared school filter parts for the pre-portal students query
            const schoolIds = schoolsList.map(s => s.id).filter(Boolean);
            const schoolNames = schoolsList.map(s => s.name).filter(Boolean);
            const idPart = schoolIds.length > 0 ? `school_id.in.(${schoolIds.join(',')})` : '';
            const namePart = schoolNames.length > 0
                ? schoolNames.map(n => `school_name.eq.${JSON.stringify(n)}`).join(',')
                : '';
            const orParts = [idPart, namePart].filter(Boolean);

            // Pre-portal students query (students table, user_id is null or not yet linked)
            let prePortalQuery = db.from('students')
                .select('id, full_name, email, school_name, school_id, current_class, grade_level, section, status, user_id')
                .neq('is_deleted', true)
                .neq('status', 'rejected') as any;

            if (!isAdmin) {
                if (orParts.length > 0) {
                    prePortalQuery = prePortalQuery.or(orParts.join(','));
                } else if (profile?.school_id) {
                    prePortalQuery = prePortalQuery.or(`school_id.eq.${profile.school_id}`);
                }
            }

            // 3. Fetch programs via API (handles role-based visibility correctly)
            const progRes = await fetch('/api/programs?is_active=true', { cache: 'no-store' });
            const progJson = progRes.ok ? await progRes.json() : { data: [] };

            // 4. Fetch courses via API (handles role-based visibility and relationships correctly)
            const coursesRes = await fetch('/api/courses?limit=1000&is_published=true', { cache: 'no-store' });
            const coursesJson = coursesRes.ok ? await coursesRes.json() : { data: [] };

            // 5. Fetch classes via API — teachers only see their own classes
            const isTeacher = profile?.role === 'teacher';
            const classesRes = await fetch(isTeacher ? '/api/classes?mine=true' : '/api/classes', { cache: 'no-store' });
            const classesJson = classesRes.ok ? await classesRes.json() : { data: [] };

            // 6. Fetch pre-portal students via API
            const prePortalRes = await fetch('/api/students', { cache: 'no-store' });
            const prePortalJson = prePortalRes.ok ? await prePortalRes.json() : { data: [] };

            // 7. Fetch report settings (direct DB for now)
            const { data: brandingData } = await db.from('report_settings').select('*').limit(1).maybeSingle();

            // Normalize portal_users results
            const portalStudents = (portalJson.data ?? []).map((u: any) => ({
                ...u,
                section_class: u.section_class || '',
                class_id: u.class_id || null,
                _source: 'portal',
            }));

            // Collect portal user_ids to avoid duplicates from students table
            const portalUserIds = new Set(portalStudents.map((u: any) => u.id));
            // Also collect portal users that came from linked pre-portal students
            const linkedUserIds = new Set(portalStudents.map((u: any) => u.students?.[0]?.user_id).filter(Boolean));

            // Normalize pre-portal students — skip any already present as portal users
            const prePortalStudents = (prePortalJson.data ?? [])
                .filter((s: any) => {
                    // Skip if they have a portal account that's already in portalStudents
                    const uid = s.user_id;
                    if (uid && portalUserIds.has(uid)) return false;
                    // Skip if already linked to a portal user we fetched
                    if (uid && linkedUserIds.has(uid)) return false;
                    return true;
                })
                .map((s: any) => ({
                    // Shape to match PortalUser enough for the builder to work
                    id: `students-${s.id}`,  // prefixed ID — signals pre-portal in save handler
                    full_name: s.full_name ?? s.name ?? '',
                    email: s.email ?? '',
                    role: 'student',
                    school_id: s.school_id ?? null,
                    school_name: s.school_name ?? null,
                    section_class: s.grade_level ?? s.current_class ?? '',
                    class_id: null,
                    avatar_url: null,
                    is_deleted: false,
                    _source: 'students_table',
                    _original_id: s.id,
                }));

            const processed = [...portalStudents, ...prePortalStudents];
            setStudents(processed as any);
            setCourses(coursesJson.data ?? []);
            setPrograms(progJson.data ?? []);
            setSchools(schoolsList);
            setTeacherClasses((classesJson.data ?? []) as { id: string; name: string; school_id: string | null }[]);
            // Note: school auto-fill is handled below in the instructor_name setSessionConfig call
            if (brandingData) {
                setBranding({
                    org_name: brandingData.org_name ?? '',
                    org_tagline: brandingData.org_tagline ?? '',
                    org_address: brandingData.org_address ?? '',
                    org_phone: brandingData.org_phone ?? '',
                    org_email: brandingData.org_email ?? '',
                    org_website: brandingData.org_website ?? '',
                    logo_url: brandingData.logo_url ?? '',
                });
            }
            setSessionConfig(s => ({
                ...s,
                instructor_name: s.instructor_name || profile?.full_name || '',
                // Auto-fill school from profile if not already set
                school_name: s.school_name || profile?.school_name || (schoolsList.length === 1 ? schoolsList[0].name : ''),
                school_id: s.school_id || profile?.school_id || (schoolsList.length === 1 ? schoolsList[0].id : ''),
            }));

                // Restore pending student (from localStorage navigation state)
                const restoreId = pendingRestoreStudentId.current;
                if (restoreId) {
                    pendingRestoreStudentId.current = null;
                    const s = processed.find((x: any) => x.id === restoreId || x._original_id === restoreId);
                    if (s) { await selectStudent(s as PortalUser, pendingRestoreStudentIdx.current); return; }
                }
                if (prefStudentId) {
                    const s = processed.find((x: any) => x.id === prefStudentId || x._original_id === prefStudentId);
                    if (s) selectStudent(s as PortalUser, 0);
                }
            } catch (err: any) {
                console.error('Failed to load builder data:', err);
                setError('Failed to initialize report builder: ' + err.message);
            } finally {
                setLoading(false);
            }
        }

        loadData();
    }, [profile?.id, authLoading]); // eslint-disable-line

    const filteredStudents = students.filter(s => {
        const matchesSearch = !search || s.full_name?.toLowerCase().includes(search.toLowerCase()) || s.email?.toLowerCase().includes(search.toLowerCase());

        // Override mode or active search: show all loaded students, just filter by name/email
        if (overrideFilters || search.length >= 2) return matchesSearch;

        // School filter: use school_id match OR school_name match (handles legacy records)
        const matchesSchool = !sessionConfig.school_name
            || s.school_name === sessionConfig.school_name
            || (!!sessionConfig.school_id && s.school_id === sessionConfig.school_id);

        // Class filter: match by section_class string OR by class_id for teacher-created classes
        const activeClass = teacherClasses.find(c => c.name === classFilter);
        const matchesClass = !classFilter
            || (s as any).section_class === classFilter
            || (activeClass && (s as any).class_id === activeClass.id);

        return matchesSearch && matchesSchool && matchesClass;
    });

    const distinctClasses = [...new Set([
        // Classes from student records (section_class field)
        ...students
            .filter(s => !sessionConfig.school_name
                || s.school_name === sessionConfig.school_name
                || (!!sessionConfig.school_id && s.school_id === sessionConfig.school_id))
            .map(s => (s as any).section_class)
            .filter(Boolean),
        // Teacher-created classes (from classes table)
        ...teacherClasses.map(c => c.name),
    ])].sort() as string[];

    // ── Select student: load existing report, fill form ───────────────────────
    async function selectStudent(s: PortalUser, idx: number) {
        setSelectedStudent(s);
        setCurrentStudentIdx(idx);
        setError(''); setSuccess('');
        setSuggestedModule(null);
        setDuplicateWarning(null);
        setDuplicateDetail('');

        // Manual entry: skip DB lookup, go straight to empty form
        const isManual = s.id?.startsWith('manual-');
        if (isManual) {
            setExistingReport(null);
            setForm(f => ({ ...f, student_name: s.full_name ?? '', section_class: sessionConfig.section_class }));
            setStep('edit');
            setSessionExpanded(false);
            return;
        }

        const db = createClient();

        // Pre-portal student (from students table, no portal_users record) — look up by name
        const isPrePortal = s.id?.startsWith('students-');
        const isTeacher = profile?.role === 'teacher';
        const { data: report } = isPrePortal
            ? await db
                .from('student_progress_reports')
                .select('*')
                .eq('student_name', s.full_name ?? '')
                .order('updated_at', { ascending: false })
                .limit(1)
                .maybeSingle()
            : await (() => {
                let q = db
                    .from('student_progress_reports')
                    .select('*')
                    .eq('student_id', s.id)
                    .order('updated_at', { ascending: false })
                    .limit(1);
                if (isTeacher && profile?.id) q = q.eq('teacher_id', profile.id) as typeof q;
                return q.maybeSingle();
              })();

        setExistingReport(report ?? null);

        // ── Duplicate / cross-session detection ──────────────────────────────────
        if (report) {
            const sameCourse = sessionConfig.course_id && report.course_id === sessionConfig.course_id;
            const sameTerm   = sessionConfig.report_term && report.report_term === sessionConfig.report_term;
            if (sameCourse && sameTerm && report.is_published) {
                setDuplicateWarning('published');
                setDuplicateDetail(`${report.course_name ?? 'this course'} — ${report.report_term}`);
            } else if (sessionConfig.course_id && report.course_id && report.course_id !== sessionConfig.course_id) {
                setDuplicateWarning('cross-session');
                setDuplicateDetail(`${report.course_name ?? '?'} (${report.report_term ?? '?'})`);
            }
        }

        // ── Smart module suggestion: look for a PREVIOUS report to advance from ──
        // If the student has a previous report and its next_module != the current session
        // module, show an "advance to next module?" hint for this individual student.
        if (!isPrePortal && s.id) {
            const { data: prevReport } = await db
                .from('student_progress_reports')
                .select('current_module, next_module')
                .eq('student_id', s.id)
                .order('updated_at', { ascending: false })
                .range(1, 1)          // second-most-recent report
                .maybeSingle();
            if (!prevReport && report?.next_module) {
                // Only one report found — suggest advancing from its next_module
                const sugg = getModuleSuggestions(report.course_name ?? '');
                const nextIdx = sugg.modules.indexOf(report.next_module);
                const autoNext = nextIdx >= 0 && nextIdx + 1 < sugg.next.length
                    ? sugg.next[nextIdx + 1]
                    : sugg.next[sugg.modules.indexOf(report.next_module)] ?? '';
                if (report.next_module && report.next_module !== report.current_module) {
                    setSuggestedModule({ current: report.next_module, next: autoNext });
                }
            } else if (prevReport?.next_module) {
                const sugg = getModuleSuggestions(report?.course_name ?? '');
                const nextIdx = sugg.modules.indexOf(prevReport.next_module);
                const autoNext = nextIdx >= 0 ? sugg.next[nextIdx] ?? '' : '';
                setSuggestedModule({ current: prevReport.next_module, next: autoNext });
            }
        }

        // If an existing report has session-level fields, hydrate sessionConfig so
        // editing via direct URL (?student=id) doesn't overwrite them with blanks on save.
        if (report) {
            // Hydrate sessionProgramId from the report's course
            if (report.course_id) {
                const reportCourse = courses.find(c => c.id === report.course_id);
                if (reportCourse?.program_id) setSessionProgramId(reportCourse.program_id);
            }
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

        const existingMetrics = (report as any)?.engagement_metrics ?? {};
        setForm({
            student_name: s.full_name ?? '',
            section_class: report?.section_class ?? (s as any).section_class ?? '',
            theory_score:        String(report?.theory_score        ?? 0),
            classwork_score:     String(existingMetrics.classwork_score  ?? 0),
            practical_score:     String(report?.practical_score     ?? 0),
            attendance_score:    String(report?.attendance_score    ?? 0),
            participation_score: String(report?.participation_score ?? 0),
            assessment_score:    String(existingMetrics.assessment_score ?? 0),
            participation_grade: report?.participation_grade ?? '',
            projects_grade:      report?.projects_grade      ?? '',
            homework_grade:      report?.homework_grade       ?? '',
            proficiency_level: report?.proficiency_level ?? 'intermediate',
            key_strengths: report?.key_strengths ?? '',
            areas_for_growth: report?.areas_for_growth ?? '',
            is_published: report?.is_published ?? false,
            photo_url: report?.photo_url ?? (s as any).photo_url ?? '',
            fee_status: ((report as any)?.fee_status ?? '') as any,
            student_current_module: report?.current_module && report.current_module !== sessionConfig.current_module ? report.current_module ?? '' : '',
            student_next_module: report?.next_module && report.next_module !== sessionConfig.next_module ? report.next_module ?? '' : '',
        });

        // ── Fetch transparent stats for all 4 score categories ───────────────
        setFetchingStats(true);
        try {
            // 1. Resolve class ID for attendance lookup
            const studentSchoolId = s.school_id;
            const studentClassName = (s as any).section_class;
            let targetClassId = (s as any).class_id;
            if (!targetClassId && studentClassName) {
                const { data: clsData } = await db.from('classes')
                    .select('id').eq('name', studentClassName).eq('school_id', studentSchoolId || '').maybeSingle();
                targetClassId = clsData?.id;
            }

            const { data: sessions } = targetClassId
                ? await db.from('class_sessions').select('id').eq('class_id', targetClassId).eq('is_active', true)
                : { data: [] };
            const sessionIds = sessions?.map(x => x.id) || [];

            // 2. Fetch all 4 data sources in parallel
            const [attRes, subRes, allAssignments, cbtAllRes, labRes, portfolioRes] = await Promise.all([
                // Attendance (for reference)
                sessionIds.length > 0
                    ? db.from('attendance').select('id').eq('user_id', s.id).in('session_id', sessionIds).eq('status', 'present')
                    : { data: [] },
                // Assignment submissions — graded (feeds Assignment + Evaluation)
                db.from('assignment_submissions').select('id, grade').eq('portal_user_id', s.id).eq('status', 'graded'),
                // Total active assignments for this course (Assignment denominator)
                sessionConfig.course_id
                    ? db.from('assignments').select('id').eq('course_id', sessionConfig.course_id).eq('is_active', true)
                    : { data: [] },
                // All CBT sessions with exam metadata for type splitting
                db.from('cbt_sessions').select('score, cbt_exams(metadata)').eq('user_id', s.id).order('score', { ascending: false }),
                // Lab projects (feeds Project Engagement)
                db.from('lab_projects').select('id').eq('user_id', s.id),
                // Portfolio projects (feeds Project Engagement)
                db.from('portfolio_projects').select('id').eq('user_id', s.id),
            ]);

            // 3. Split CBT scores by exam_type stored in metadata
            const allCbt: any[] = cbtAllRes.data || [];
            const examSessions = allCbt.filter(r => {
                const t = (r.cbt_exams as any)?.metadata?.exam_type;
                return !t || t === 'examination'; // default = examination
            });
            const evalSessions = allCbt.filter(r =>
                (r.cbt_exams as any)?.metadata?.exam_type === 'evaluation'
            );
            const cbtScore = Math.min(100, examSessions[0]?.score || 0);
            const asgnGrades = subRes.data?.map((x: any) => x.grade).filter((g: any) => g !== null) as number[] || [];
            const assignmentAvg = asgnGrades.length > 0
                ? Math.round(asgnGrades.reduce((a, b) => a + b, 0) / asgnGrades.length)
                : 0;
            const totalAsgn = allAssignments.data?.length || 8;
            const gradedAsgn = subRes.data?.length || 0;
            const assignmentPct = Math.round((gradedAsgn / totalAsgn) * 100);
            // Evaluation score = best CBT score where exam_type = 'evaluation'
            const evalScore = Math.min(100, evalSessions[0]?.score || 0);
            const projectCount = (labRes.data?.length || 0) + (portfolioRes.data?.length || 0);
            // Project Engagement: every 3 projects = 100% (capped at 100)
            const projectPct = Math.min(100, Math.round((projectCount / 3) * 100));

            setStudentStats({
                attendance: attRes.data?.length || 0,
                totalSessions: sessionIds.length || 12,
                assignments: gradedAsgn,
                totalAssignments: totalAsgn,
                cbtScore,
                assignmentAvg: evalScore || assignmentAvg, // prefer eval CBT score, fall back to assignment avg
                assignmentPct,
                projects: projectCount,
            });

            // ── Auto-suggest all 6 WAEC components from real platform data ──────
            // Suggests when score is 0 or unset — never overwrites teacher edits
            const isZero = (v: string) => !v || parseFloat(v) === 0;
            const attPct = sessionIds.length > 0
                ? Math.min(100, Math.round(((attRes.data?.length || 0) / sessionIds.length) * 100))
                : 0;
            setForm(f => ({
                ...f,
                ...(cbtScore > 0 && isZero(f.theory_score)        ? { theory_score:        String(cbtScore) }     : {}),
                ...(assignmentAvg > 0 && isZero(f.classwork_score) ? { classwork_score:     String(assignmentAvg) } : {}),
                ...(projectPct > 0 && isZero(f.practical_score)    ? { practical_score:     String(projectPct) }   : {}),
                ...(assignmentPct > 0 && isZero(f.attendance_score)? { attendance_score:    String(assignmentPct) }: {}),
                ...(attPct > 0 && isZero(f.participation_score)    ? { participation_score: String(attPct) }       : {}),
                ...(evalScore > 0 && isZero(f.assessment_score)    ? { assessment_score:    String(evalScore) }    : {}),
            }));
        } catch { /* silent fail */ } finally {
            setFetchingStats(false);
        }

        setStep('edit');
        setSessionExpanded(false);
    }

    // ── WAEC weighted overall (6 components, mirrors grading.ts SCORE_WEIGHTS) ──
    const overallScore = Math.round(
        (parseFloat(form.theory_score)        || 0) * WAEC_WEIGHTS.theory      +  // 20%
        (parseFloat(form.classwork_score)     || 0) * WAEC_WEIGHTS.classwork   +  // 10%
        (parseFloat(form.practical_score)     || 0) * WAEC_WEIGHTS.practical   +  // 25%
        (parseFloat(form.attendance_score)    || 0) * WAEC_WEIGHTS.assignments +  // 20%
        (parseFloat(form.participation_score) || 0) * WAEC_WEIGHTS.attendance  +  // 10%
        (parseFloat(form.assessment_score)    || 0) * WAEC_WEIGHTS.assessment     // 15%
    );

    // ── WAEC grade code (A1–F9) for display and save ─────────────────────────
    const overallGradeObj = reportGrade(overallScore); // kept for Standard report card
    const overallGradeLetter = overallGradeObj.g;      // e.g. "A", "B" etc.
    // WAEC code for ModernReportCard:
    function localWaecCode(s: number): string {
        if (s >= 75) return 'A1'; if (s >= 70) return 'B2'; if (s >= 65) return 'B3';
        if (s >= 60) return 'C4'; if (s >= 55) return 'C5'; if (s >= 50) return 'C6';
        if (s >= 45) return 'D7'; if (s >= 40) return 'E8'; return 'F9';
    }
    const waecCode = localWaecCode(overallScore);

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

                const [attRes, subRes, allAsgn, cbtRes, labRes, portfolioRes] = await Promise.all([
                    sessionIds.length > 0 ? db.from('attendance').select('id').eq('user_id', s.id).in('session_id', sessionIds).eq('status', 'present') : { data: [] },
                    db.from('assignment_submissions').select('id, grade').eq('portal_user_id', s.id).eq('status', 'graded'),
                    sessionConfig.course_id ? db.from('assignments').select('id').eq('course_id', sessionConfig.course_id).eq('is_active', true) : { data: [] },
                    programId ? db.from('cbt_sessions').select('score').eq('user_id', s.id).eq('exam_id', programId).order('score', { ascending: false }).limit(1)
                              : db.from('cbt_sessions').select('score').eq('user_id', s.id).order('score', { ascending: false }).limit(1),
                    db.from('lab_projects').select('id').eq('user_id', s.id),
                    db.from('portfolio_projects').select('id').eq('user_id', s.id),
                ]);

                // 2. Compute transparent scores (mirrors fetchStats 6-component mapping)
                const cbtScore = Math.min(100, cbtRes.data?.[0]?.score || 0);
                const asgnGrades = subRes.data?.map((x: any) => x.grade).filter((g: any) => g !== null) as number[] || [];
                const asgnAvg = asgnGrades.length > 0 ? Math.round(asgnGrades.reduce((a, b) => a + b, 0) / asgnGrades.length) : 0;
                const totalAsgn = allAsgn.data?.length || 8;
                const assigPct = Math.round((subRes.data?.length || 0) / totalAsgn * 100);
                const projectCount = (labRes.data?.length || 0) + (portfolioRes.data?.length || 0);
                const projectPct = Math.min(100, Math.round((projectCount / 3) * 100));
                const attPct = sessionIds.length > 0 ? Math.min(100, Math.round((attRes.data?.length || 0) / sessionIds.length * 100)) : 80;
                // Assessment: blend of lab quality and submission consistency
                const evalScore = Math.min(100, Math.round(projectPct * 0.6 + assigPct * 0.4));

                // 3. Map to 6 weighted components
                const theory      = cbtScore;    // Theory (20%)  — CBT exam score
                const classwork   = asgnAvg;      // Classwork (10%) — assignment grade avg
                const practical   = projectPct;   // Practical (25%) — project completion %
                const assignments = assigPct;     // Assignments (20%) — submission rate
                const attendance  = attPct;       // Attendance (10%) — session attendance %
                const assessment  = evalScore;    // Assessment (15%) — blended eval score

                // 4. Check for existing report
                const isPrePortal = s.id?.startsWith('manual-') || s.id?.startsWith('students-');
                const { data: existing } = isPrePortal ? { data: null } : await (() => {
                    let q = db.from('student_progress_reports').select('id').eq('student_id', s.id).eq('report_term', sessionConfig.report_term).order('updated_at', { ascending: false });
                    if (profile?.role === 'teacher' && profile?.id) q = q.eq('teacher_id', profile.id) as typeof q;
                    return q.maybeSingle();
                })();

                const overall = Math.round(
                    theory      * WAEC_WEIGHTS.theory      +
                    classwork   * WAEC_WEIGHTS.classwork   +
                    practical   * WAEC_WEIGHTS.practical   +
                    assignments * WAEC_WEIGHTS.assignments +
                    attendance  * WAEC_WEIGHTS.attendance  +
                    assessment  * WAEC_WEIGHTS.assessment
                );
                // Grade code for display (A1–F9); letter grade kept for Standard report card
                const bulkWaecCode = (() => {
                    if (overall >= 75) return 'A1'; if (overall >= 70) return 'B2';
                    if (overall >= 65) return 'B3'; if (overall >= 60) return 'C4';
                    if (overall >= 55) return 'C5'; if (overall >= 50) return 'C6';
                    if (overall >= 45) return 'D7'; if (overall >= 40) return 'E8'; return 'F9';
                })();

                const payload: any = {
                    student_id: isPrePortal ? null : s.id,
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
                    // DB column mapping: attendance_score → assignments, participation_score → attendance
                    theory_score:        theory,
                    practical_score:     practical,
                    attendance_score:    assignments,
                    participation_score: attendance,
                    engagement_metrics:  { classwork_score: classwork, assessment_score: assessment },
                    overall_score: overall,
                    overall_grade: bulkWaecCode,
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
            setSuccessMsg(`Successfully generated ${filteredStudents.length} report drafts!`);
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

        // For manual entries ('manual-') or pre-portal students ('students-'), id is not a real portal_users UUID.
        // Save the report without a student_id foreign key in those cases.
        const isManual = selectedStudent.id?.startsWith('manual-') || selectedStudent.id?.startsWith('students-');

        try {
            const payload = {
                student_id: isManual ? null : selectedStudent.id,
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
                current_module: form.student_current_module || sessionConfig.current_module || null,
                next_module: form.student_next_module || sessionConfig.next_module || null,
                learning_milestones: sessionConfig.learning_milestones,
                course_duration: sessionConfig.course_duration || null,
                theory_score: parseFloat(form.theory_score) || 0,
                practical_score: parseFloat(form.practical_score) || 0,
                attendance_score: parseFloat(form.attendance_score) || 0,
                participation_grade: form.participation_grade,
                projects_grade: form.projects_grade,
                homework_grade: form.homework_grade,
                overall_grade: waecCode,
                overall_score: overallScore,
                key_strengths: form.key_strengths || null,
                areas_for_growth: form.areas_for_growth || null,
                has_certificate: forceCertificate || overallScore >= 45,
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
                    // WAEC components stored in metrics (not in dedicated DB columns)
                    classwork_score:    parseFloat(form.classwork_score)  || 0,
                    assessment_score:   parseFloat(form.assessment_score) || 0,
                    // Source data for transparency
                    examScore:           studentStats.cbtScore,
                    testAvg:             studentStats.assignmentAvg,
                    assignmentCompletion:studentStats.assignmentPct,
                    projectsCompleted:   studentStats.projects,
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

            setSuccessMsg(publish ? 'Report published — visible to student!' : 'Draft saved!');
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
                setSuccessMsg(`Realistic ${(field as string).replace('_grade', '')} generated!`);
                return;
            }

            // Qualitative evaluation uses actual AI with a concise fallback system
            const topic = sessionConfig.current_module || sessionConfig.course_name || 'the course';
            const perfWord = overallScore >= 80 ? 'excellent' : overallScore >= 65 ? 'very good' : overallScore >= 50 ? 'satisfactory' : 'fair';
            const fallbackThemes = {
                key_strengths: [
                    `${form.student_name} has demonstrated ${perfWord} performance this term and shows consistent enthusiasm in ${topic} activities. Their positive attitude towards learning is commendable.`,
                    `${form.student_name} shows a sound understanding of ${topic} and completes tasks with care and commitment. We are pleased with the steady progress made this term.`,
                    `This term, ${form.student_name} has worked diligently in ${topic} and shown notable improvement. Their practical engagement and classroom conduct stand out positively.`,
                ],
                areas_for_growth: [
                    `${form.student_name} is encouraged to spend more time practising ${topic} concepts at home to build greater confidence. Regular review of class notes will make a meaningful difference.`,
                    `We encourage ${form.student_name} to ask questions whenever topics are unclear and to engage more actively during lessons. Consistent effort in assignments will support stronger overall results.`,
                    `${form.student_name} will benefit from focusing on accuracy and attention to detail in ${topic} work. With continued dedication, we look forward to even better outcomes next term.`,
                ]
            };

            const getRandomFallback = (type: 'key_strengths' | 'areas_for_growth') => {
                const list = fallbackThemes[type];
                return list[Math.floor(Math.random() * list.length)];
            };

            try {
                // Resolve program name from loaded courses
                const currentCourse = courses.find((c: any) => c.id === sessionConfig.course_id);
                const programName = (currentCourse as any)?.programs?.name ?? '';

                const res = await fetch('/api/ai/generate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        type: 'report-feedback',
                        topic: sessionConfig.current_module || sessionConfig.course_name || 'STEM & Coding',
                        courseName: sessionConfig.course_name || '',
                        programName: programName,
                        studentName: form.student_name || 'The Student',
                        gradeLevel: form.section_class || 'General Academic',
                        // All 6 WAEC components
                        theoryScore:        parseFloat(form.theory_score)        || 0,
                        classworkScore:     parseFloat(form.classwork_score)     || 0,
                        practicalScore:     parseFloat(form.practical_score)     || 0,
                        attendanceScore:    parseFloat(form.attendance_score)    || 0,
                        participationScore: parseFloat(form.participation_score) || 0,
                        assessmentScore:    parseFloat(form.assessment_score)    || 0,
                        overallScore,
                        overallGrade: overallGradeLetter,
                        proficiencyLevel: form.proficiency_level,
                        // Teacher-selected qualifiers — ground AI output in real observations
                        participationGrade: form.participation_grade || '',
                        projectsGrade:      form.projects_grade      || '',
                        homeworkGrade:      form.homework_grade       || '',
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
                setSuccessMsg('AI-assisted evaluation ready!');
            } catch (err) {
                console.warn('AI failed, using high-quality fallback:', err);
                setForm(f => ({
                    ...f,
                    key_strengths: f.key_strengths || getRandomFallback('key_strengths'),
                    areas_for_growth: f.areas_for_growth || getRandomFallback('areas_for_growth')
                }));
                setSuccessMsg('Generated detailed report insights (Fallback System Activated).');
            }
        } catch (err: any) {
            setError(err.message ?? 'Generation failed');
        } finally {
            setGenerating(null);
        }
    };

    // ── Generate All — one-click auto-fill all qualifier + AI fields ─────────
    const handleGenerateAll = async () => {
        setGeneratingAll(true);
        try {
            const { attendance, totalSessions, assignments, totalAssignments } = studentStats;
            const attPct = totalSessions > 0 ? (attendance / totalSessions) * 100 : 0;
            const assigPct = totalAssignments > 0 ? (assignments / totalAssignments) * 100 : 0;
            const currentText = sessionConfig.current_module ? `${sessionConfig.current_module} — ` : '';
            setForm(f => ({
                ...f,
                participation_grade: f.participation_grade || `${attendance}/${totalSessions} Meetings Attended (${attPct >= 80 ? 'Excellent' : attPct >= 60 ? 'Active' : 'Moderate'})`,
                projects_grade: f.projects_grade || `${currentText}${assignments}/${totalAssignments} Lab Tasks Completed (${assigPct >= 90 ? 'Outstanding' : assigPct >= 70 ? 'Proficient' : 'Developing'})`,
                homework_grade: f.homework_grade || `${Math.round(assigPct)}% Assignment Completion Rate — ${assigPct >= 80 ? 'Reliable' : 'Inconsistent'}`,
            }));
            await handleAIGenerate('key_strengths');
            await handleAIGenerate('areas_for_growth');
            setSuccessMsg('All fields generated!');
        } catch { /* silent */ } finally {
            setGeneratingAll(false);
        }
    };

    // ── Photo upload ──────────────────────────────────────────────────────────
    const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !selectedStudent) return;
        setUploading(true); setError('');
        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('studentName', selectedStudent.full_name || 'student');

            const res = await fetch('/api/upload/report-photo', {
                method: 'POST',
                body: formData
            });

            if (!res.ok) {
                const errJson = await res.json();
                throw new Error(errJson.error || 'Upload failed');
            }

            const json = await res.json();
            setForm(f => ({ ...f, photo_url: json.url }));
            setSuccessMsg('Photo uploaded!');
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
        template_id: modernTemplateId,
        theory_score:        parseFloat(form.theory_score)        || 0,
        practical_score:     parseFloat(form.practical_score)     || 0,
        attendance_score:    parseFloat(form.attendance_score)    || 0,
        participation_score: parseFloat(form.participation_score) || 0,
        overall_score: overallScore,
        overall_grade: waecCode,
        engagement_metrics: {
            classwork_score:  parseFloat(form.classwork_score)  || 0,
            assessment_score: parseFloat(form.assessment_score) || 0,
        },
        has_certificate: forceCertificate || overallScore >= 45,
        certificate_text: (forceCertificate || overallScore >= 45)
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
    if (authLoading || profileLoading || loading) return (
        <div className="min-h-screen bg-background flex items-center justify-center">
            <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
    );

    // Ensure isStaff is definitely defined and checked
    if (profile && !isStaff) return (
        <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
            <ExclamationTriangleIcon className="w-12 h-12 text-amber-500 mb-4" />
            <h1 className="text-xl font-bold text-foreground mb-2">Access Restricted</h1>
            <p className="text-muted-foreground text-sm text-center max-w-md">
                You do not have permission to create or edit progress reports.
                Please visit the <Link href="/dashboard/results" className="text-primary font-bold hover:underline">Results Record Centre</Link> to view and print reports for your school.
            </p>
            <Link href="/dashboard/results" className="mt-4 inline-flex items-center gap-2 px-6 py-3 bg-primary hover:bg-primary text-foreground font-bold rounded-xl transition-all shadow-lg shadow-primary/20">
                <EyeIcon className="w-4 h-4" /> Go to Results Centre
            </Link>
        </div>
    );

    // ── Session summary bar (shown in pick/edit steps) ────────────────────────
    const SessionSummaryBar = () => (
        <div className="bg-[#0d1526] border border-border rounded-xl overflow-hidden">
            <button
                onClick={() => setSessionExpanded(e => !e)}
                className="w-full flex items-center gap-3 px-5 py-3 hover:bg-card shadow-sm transition-colors"
            >
                <Cog6ToothIcon className="w-4 h-4 text-primary flex-shrink-0" />
                <div className="flex-1 text-left min-w-0">
                    <p className="text-xs font-bold text-primary uppercase tracking-widest">Session Settings</p>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {sessionConfig.report_term}
                        {sessionConfig.school_name && ` · ${sessionConfig.school_name}`}
                        {sessionConfig.section_class && ` · ${sessionConfig.section_class}`}
                        {sessionConfig.course_name && ` · ${sessionConfig.course_name}`}
                        {sessionConfig.current_module && ` · Module: ${sessionConfig.current_module}`}
                        {` · ${sessionConfig.instructor_name}`}
                    </p>
                </div>
                {sessionExpanded
                    ? <ChevronUpIcon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    : <ChevronDownIcon className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
            </button>

            {sessionExpanded && (
                <div className="border-t border-border p-5 space-y-4">
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
                        <Field label="Programme">
                            <select
                                value={sessionProgramId}
                                onChange={e => {
                                    const pid = e.target.value;
                                    setSessionProgramId(pid);
                                    const currentCourse = courses.find(c => c.id === sessionConfig.course_id);
                                    if (currentCourse?.program_id !== pid) {
                                        setSessionConfig(s => ({ ...s, course_id: '', course_name: '' }));
                                    }
                                }}
                                className={INPUT}>
                                <option value="">Select a programme…</option>
                                {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                        </Field>
                        <Field label="Course">
                            <select
                                value={sessionConfig.course_id}
                                disabled={!sessionProgramId}
                                onChange={e => {
                                    const cId = e.target.value;
                                    const c = courses.find(x => x.id === cId);
                                    setSessionConfig(s => ({ ...s, course_id: cId, course_name: c?.title ?? '' }));
                                }}
                                className={INPUT + (sessionProgramId ? '' : ' opacity-40')}>
                                <option value="">{sessionProgramId ? 'Select a course…' : '— pick a programme first —'}</option>
                                {courses.filter(c => c.program_id === sessionProgramId)
                                    .map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                            </select>
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
                            <input list="mod-cur-bar" value={sessionConfig.current_module}
                                onChange={e => {
                                    const val = e.target.value;
                                    const sugg = getModuleSuggestions(sessionConfig.course_name);
                                    const idx = sugg.modules.indexOf(val);
                                    const autoNext = idx >= 0 ? sugg.next[idx] : '';
                                    setSessionConfig(s => ({
                                        ...s,
                                        current_module: val,
                                        ...(autoNext && !s.next_module ? { next_module: autoNext } : {}),
                                    }));
                                }}
                                className={INPUT} placeholder="e.g. Control Statements" />
                            <datalist id="mod-cur-bar">
                                {getModuleSuggestions(sessionConfig.course_name).modules.map(m => <option key={m} value={m} />)}
                            </datalist>
                        </Field>
                        <Field label="Next Module">
                            <input list="mod-nxt-bar" value={sessionConfig.next_module}
                                onChange={e => setSessionConfig(s => ({ ...s, next_module: e.target.value }))}
                                className={INPUT} placeholder="e.g. Loops & Automation" />
                            <datalist id="mod-nxt-bar">
                                {getModuleSuggestions(sessionConfig.course_name).next.map(m => <option key={m} value={m} />)}
                            </datalist>
                        </Field>
                        <Field label="Duration">
                            <select value={sessionConfig.course_duration}
                                onChange={e => setSessionConfig(s => ({ ...s, course_duration: e.target.value }))}
                                className={INPUT}>
                                {DURATION_OPTIONS.map(d => <option key={d} value={d}>{d}</option>)}
                            </select>
                        </Field>
                    </div>

                    {/* Learning Milestones editor */}
                    <div className="relative">
                        <div className="flex items-center justify-between mb-2">
                            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                Learning Milestones
                                <span className="ml-1.5 text-[9px] text-primary/60 font-normal normal-case">({sessionConfig.learning_milestones.length} added)</span>
                            </label>
                            <button type="button" onClick={() => setShowMilestoneSuggestions(v => !v)}
                                className="flex items-center gap-1.5 px-3 py-1 bg-primary/10 border border-primary/20 text-primary text-[10px] font-black uppercase tracking-widest hover:bg-primary/20 transition-all">
                                <SparklesIcon className="w-3 h-3" /> Suggest from Course
                            </button>
                        </div>

                        {/* AI-based milestone suggestions dropdown */}
                        {showMilestoneSuggestions && (
                            <div className="mb-3 bg-[#0d0d18] border border-primary/20 p-3">
                                <p className="text-[9px] font-black text-primary/60 uppercase tracking-widest mb-2">
                                    Suggested milestones for <strong className="text-primary">{sessionConfig.course_name || 'your course'}</strong>
                                    <span className="text-white/20 ml-1">· click to add</span>
                                </p>
                                <div className="space-y-1">
                                    {getMilestoneSuggestions(sessionConfig.course_name).map((sug, i) => {
                                        const alreadyAdded = sessionConfig.learning_milestones.includes(sug);
                                        return (
                                            <button key={i} type="button" disabled={alreadyAdded}
                                                onClick={() => {
                                                    if (!alreadyAdded) setSessionConfig(s => ({ ...s, learning_milestones: [...s.learning_milestones, sug] }));
                                                }}
                                                className={`w-full flex items-center gap-2 px-3 py-2 text-left text-[11px] border transition-all ${alreadyAdded ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-400/50 cursor-default' : 'bg-white/[0.02] border-white/[0.06] text-white/50 hover:border-primary/30 hover:bg-primary/5 hover:text-white/80'}`}>
                                                {alreadyAdded
                                                    ? <CheckCircleIcon className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                                                    : <PlusIcon className="w-3.5 h-3.5 flex-shrink-0 text-primary/50" />
                                                }
                                                {sug}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        <div className="flex gap-2 mb-2">
                            <input
                                value={milestoneInput}
                                onChange={e => setMilestoneInput(e.target.value)}
                                onKeyDown={e => {
                                    if (e.key === 'Enter' && milestoneInput.trim()) {
                                        e.preventDefault();
                                        setSessionConfig(s => ({ ...s, learning_milestones: [...s.learning_milestones, milestoneInput.trim()] }));
                                        setMilestoneInput('');
                                    }
                                }}
                                placeholder="Type a custom milestone and press Enter…"
                                className={INPUT}
                            />
                            <button type="button" disabled={!milestoneInput.trim()}
                                onClick={() => {
                                    if (!milestoneInput.trim()) return;
                                    setSessionConfig(s => ({ ...s, learning_milestones: [...s.learning_milestones, milestoneInput.trim()] }));
                                    setMilestoneInput('');
                                }}
                                className="px-4 py-2 bg-primary hover:bg-primary disabled:opacity-30 text-foreground text-xs font-bold rounded-xl transition-colors flex-shrink-0">
                                Add
                            </button>
                        </div>
                        {sessionConfig.learning_milestones.length > 0 ? (
                            <div className="space-y-1">
                                {sessionConfig.learning_milestones.map((m, i) => (
                                    <div key={i} className="flex items-start gap-2 bg-primary/10 border border-primary/20 px-3 py-2 text-[11px] text-primary font-semibold">
                                        <span className="flex-1 leading-snug">{m}</span>
                                        <button type="button"
                                            onClick={() => setSessionConfig(s => ({ ...s, learning_milestones: s.learning_milestones.filter((_, idx) => idx !== i) }))}
                                            className="text-primary/40 hover:text-rose-400 transition-colors flex-shrink-0 mt-0.5" aria-label="Remove milestone">
                                            <XMarkIcon className="w-3 h-3" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-[10px] text-muted-foreground italic">No milestones added yet — use "Suggest from Course" or type above.</p>
                        )}
                    </div>

                    {/* Award Certificate override toggle */}
                    <div className="flex items-center gap-4 px-1 pt-1">
                        <button type="button" onClick={() => setForceCertificate(v => !v)}
                            className={`relative w-10 h-6 rounded-full transition-colors flex-shrink-0 ${forceCertificate ? 'bg-amber-500' : 'bg-muted'}`}>
                            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-card rounded-full shadow transition-transform ${forceCertificate ? 'translate-x-4' : 'translate-x-0'}`} />
                        </button>
                        <div>
                            <p className="text-sm text-muted-foreground font-semibold">Award Certificate of Achievement</p>
                            <p className="text-[10px] text-muted-foreground">Force-show the Academic Excellence Award on this report (auto-shown when score ≥ 45%)</p>
                        </div>
                    </div>

                    {/* Next-term payment notice toggle (also accessible from summary bar) */}
                    <div className="flex items-center gap-4 px-1 pt-1">
                        <button
                            type="button"
                            onClick={() => setSessionConfig(s => ({ ...s, show_payment_notice: !s.show_payment_notice }))}
                            className={`relative w-10 h-6 rounded-full transition-colors flex-shrink-0 ${sessionConfig.show_payment_notice ? 'bg-primary' : 'bg-muted'}`}
                        >
                            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-card rounded-full shadow transition-transform ${sessionConfig.show_payment_notice ? 'translate-x-4' : 'translate-x-0'}`} />
                        </button>
                        <div>
                            <p className="text-sm text-muted-foreground font-semibold">Show Next Term Payment Notice</p>
                            <p className="text-[10px] text-muted-foreground">Prints ₦20,000 Rillcod payment details on each report</p>
                        </div>
                    </div>

                    <div className="flex justify-end">
                        <button onClick={() => setSessionExpanded(false)}
                            className="px-4 py-2 bg-primary hover:bg-primary text-foreground text-xs font-bold rounded-xl transition-colors">
                            <CheckIcon className="w-3.5 h-3.5 inline mr-1" /> Done — Collapse
                        </button>
                    </div>
                </div>
            )}
        </div>
    );

    return (
        <div className="min-h-screen bg-background text-foreground">
            <div className="max-w-5xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-8 space-y-4 sm:space-y-5">

                {/* ── Step progress bar ── */}
                {['session','pick','edit'].includes(step) && (
                    <div className="flex items-center gap-0 overflow-hidden rounded-xl">
                        {[
                            { key: 'session', num: 1, label: 'Session Setup' },
                            { key: 'pick',    num: 2, label: 'Pick Student' },
                            { key: 'edit',    num: 3, label: 'Grade & Publish' },
                        ].map((s, i) => {
                            const idx = ['session','pick','edit'].indexOf(step);
                            const done = i < idx;
                            const active = s.key === step;
                            return (
                                <button
                                    key={s.key}
                                    onClick={() => {
                                        if (done) setStep(s.key as any);
                                    }}
                                    disabled={!done}
                                    className={`flex-1 flex items-center gap-2 px-3 py-2.5 text-left transition-colors border-b-2 ${
                                        active
                                            ? 'border-primary bg-primary/10'
                                            : done
                                            ? 'border-emerald-500/50 bg-emerald-500/5 cursor-pointer hover:bg-emerald-500/10'
                                            : 'border-border bg-card cursor-default opacity-50'
                                    }`}
                                >
                                    <span className={`w-5 h-5 rounded-full text-[10px] font-black flex items-center justify-center flex-shrink-0 ${
                                        active ? 'bg-primary text-white'
                                        : done ? 'bg-emerald-500 text-white'
                                        : 'bg-muted text-muted-foreground'
                                    }`}>
                                        {done ? '✓' : s.num}
                                    </span>
                                    <span className={`text-[10px] sm:text-xs font-bold uppercase tracking-wider truncate ${
                                        active ? 'text-primary' : done ? 'text-emerald-400' : 'text-muted-foreground'
                                    }`}>
                                        <span className="hidden sm:inline">{s.label}</span>
                                        <span className="sm:hidden">Step {s.num}</span>
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                )}

                {/* ── Page header ── */}
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <DocumentTextIcon className="w-4 h-4 text-primary" />
                            <span className="text-xs font-bold text-primary uppercase tracking-widest">Report Builder</span>
                        </div>
                        <h1 className="text-xl sm:text-3xl font-extrabold">Progress Reports</h1>
                        <p className="text-muted-foreground text-xs sm:text-sm mt-0.5">Create and publish branded progress reports for each student</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <button onClick={() => setShowSettings(true)}
                            className="inline-flex items-center gap-1.5 px-3 py-2 bg-card shadow-sm border border-border hover:bg-muted text-muted-foreground text-xs font-bold rounded-xl transition-colors">
                            <Cog6ToothIcon className="w-3.5 h-3.5" /> Branding
                        </button>
                        {step === 'edit' && selectedStudent && (
                            <>
                                <button onClick={() => setShowPreview(true)}
                                    className="inline-flex items-center gap-1.5 px-3 py-2 bg-amber-500/10 border border-amber-500/20 hover:bg-amber-500/20 text-amber-400 text-xs font-bold rounded-xl transition-colors">
                                    <SparklesIcon className="w-3.5 h-3.5" /> Preview
                                </button>
                                <Link href={`/dashboard/results?student=${selectedStudent.id}`}
                                    className="inline-flex items-center gap-1.5 px-3 py-2 bg-primary/20 hover:bg-primary/30 text-primary text-xs font-bold rounded-xl transition-colors">
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
                        <div className="bg-primary/10 border border-primary/20 rounded-xl px-5 py-4">
                            <p className="text-primary font-bold text-sm">Step 1 of 3 — Session Setup</p>
                            <p className="text-primary/60 text-xs mt-0.5">
                                Enter details that are shared for ALL students in this grading session.
                                These will be locked when you move to individual student grading.
                            </p>
                        </div>

                        {/* Session fields */}
                        <div className="bg-card shadow-sm border border-border rounded-xl p-5 space-y-4">
                            <div className="flex items-center gap-2 border-b border-border pb-3 mb-2">
                                <span>📋</span>
                                <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Session Info</h3>
                            </div>
                            {/* Context type */}
                            <div>
                                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Report Context *</label>
                                <div className="flex gap-2">
                                    {(['school', 'bootcamp', 'online'] as const).map(type => (
                                        <button key={type} type="button"
                                            onClick={() => setSessionConfig(s => ({ ...s, school_section: type }))}
                                            className={`flex-1 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors border ${sessionConfig.school_section === type ? 'bg-primary border-primary text-foreground' : 'bg-card shadow-sm border-border text-muted-foreground hover:bg-muted'}`}>
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

                        <div className="bg-card shadow-sm border border-border rounded-xl p-5 space-y-4">
                            <div className="flex items-center gap-2 border-b border-border pb-3 mb-2">
                                <span>🏫</span>
                                <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">School & Class</h3>
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
                        <div className="bg-white/[0.03] border border-border rounded-xl overflow-hidden">
                            <div className="flex items-center gap-2 px-5 py-3 bg-white/[0.02] border-b border-border">
                                <span>💳</span>
                                <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Payment / Fee Info</h3>
                                <span className="ml-auto text-[10px] text-white/25 font-semibold">Optional — only appears on report if filled in</span>
                            </div>
                            <div className="p-5 space-y-4">
                                <p className="text-[11px] text-muted-foreground leading-relaxed">
                                    Use this for schools where coding is offered as an <strong className="text-muted-foreground">extra-curricular activity</strong> (paid separately) or when different school sections (Primary vs Secondary) have separate fee structures or management. Leave blank if fees are handled by the school directly or not applicable.
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
                                <p className="text-[10px] text-muted-foreground">Per-student payment status (Paid / Outstanding / Sponsored) is set individually on each student's form in Step 3.</p>

                                {/* Next-term Rillcod payment notice toggle */}
                                <div className="flex items-center gap-4 pt-2 border-t border-border">
                                    <button
                                        type="button"
                                        onClick={() => setSessionConfig(s => ({ ...s, show_payment_notice: !s.show_payment_notice }))}
                                        className={`relative w-10 h-6 rounded-full transition-colors flex-shrink-0 ${sessionConfig.show_payment_notice ? 'bg-primary' : 'bg-muted'}`}
                                    >
                                        <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-card rounded-full shadow transition-transform ${sessionConfig.show_payment_notice ? 'translate-x-4' : 'translate-x-0'}`} />
                                    </button>
                                    <div>
                                        <p className="text-sm text-muted-foreground font-semibold">Show Next Term Payment Notice</p>
                                        <p className="text-[10px] text-muted-foreground">Prints ₦20,000 Rillcod payment details on each report (Providus Bank · 7901178957)</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="bg-card shadow-sm border border-border rounded-xl p-5 space-y-4">
                            <div className="flex items-center gap-2 border-b border-border pb-3 mb-2">
                                <span>📖</span>
                                <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Course Details</h3>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <Field label="Programme *">
                                    <select
                                        value={sessionProgramId}
                                        onChange={e => {
                                            const pid = e.target.value;
                                            setSessionProgramId(pid);
                                            // Reset course if it no longer belongs to the new programme
                                            const currentCourse = courses.find(c => c.id === sessionConfig.course_id);
                                            if (currentCourse?.program_id !== pid) {
                                                setSessionConfig(s => ({ ...s, course_id: '', course_name: '' }));
                                            }
                                        }}
                                        className={INPUT}>
                                        <option value="">Select a programme…</option>
                                        {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                    </select>
                                </Field>
                                <Field label="Course *">
                                    <select
                                        value={sessionConfig.course_id}
                                        disabled={!sessionProgramId}
                                        onChange={e => {
                                            const cId = e.target.value;
                                            const c = courses.find(x => x.id === cId);
                                            setSessionConfig(s => ({ ...s, course_id: cId, course_name: c?.title ?? '' }));
                                        }}
                                        className={INPUT + (sessionProgramId ? '' : ' opacity-40')}>
                                        <option value="">{sessionProgramId ? 'Select a course…' : '— pick a programme first —'}</option>
                                        {courses.filter(c => c.program_id === sessionProgramId)
                                            .map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                                    </select>
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
                                    <input
                                        list="module-current-list"
                                        value={sessionConfig.current_module}
                                        onChange={e => {
                                            const val = e.target.value;
                                            const sugg = getModuleSuggestions(sessionConfig.course_name);
                                            const idx = sugg.modules.indexOf(val);
                                            const autoNext = idx >= 0 ? sugg.next[idx] : '';
                                            setSessionConfig(s => ({
                                                ...s,
                                                current_module: val,
                                                ...(autoNext && !s.next_module ? { next_module: autoNext } : {}),
                                            }));
                                        }}
                                        className={INPUT} placeholder="e.g. Control Statements" />
                                    <datalist id="module-current-list">
                                        {getModuleSuggestions(sessionConfig.course_name).modules.map(m => <option key={m} value={m} />)}
                                    </datalist>
                                </Field>
                                <Field label="Next Module">
                                    <input
                                        list="module-next-list"
                                        value={sessionConfig.next_module}
                                        onChange={e => setSessionConfig(s => ({ ...s, next_module: e.target.value }))}
                                        className={INPUT} placeholder="e.g. Loops & Automation" />
                                    <datalist id="module-next-list">
                                        {getModuleSuggestions(sessionConfig.course_name).next.map(m => <option key={m} value={m} />)}
                                    </datalist>
                                </Field>
                            </div>
                        </div>

                        {/* Learning Milestones */}
                        <div className="bg-card shadow-sm border border-border rounded-xl p-5 space-y-3">
                            <div className="flex items-center gap-2 border-b border-border pb-3 mb-2">
                                <span>🎯</span>
                                <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Learning Milestones</h3>
                                <span className="ml-auto text-[10px] text-muted-foreground">Appear on every report card in this session</span>
                            </div>
                            <div className="flex gap-2">
                                <input
                                    value={milestoneInput}
                                    onChange={e => setMilestoneInput(e.target.value)}
                                    onKeyDown={e => {
                                        if (e.key === 'Enter' && milestoneInput.trim()) {
                                            e.preventDefault();
                                            setSessionConfig(s => ({ ...s, learning_milestones: [...s.learning_milestones, milestoneInput.trim()] }));
                                            setMilestoneInput('');
                                        }
                                    }}
                                    placeholder="e.g. Completed Python Basics module"
                                    className={INPUT}
                                />
                                <button
                                    type="button"
                                    disabled={!milestoneInput.trim()}
                                    onClick={() => {
                                        if (!milestoneInput.trim()) return;
                                        setSessionConfig(s => ({ ...s, learning_milestones: [...s.learning_milestones, milestoneInput.trim()] }));
                                        setMilestoneInput('');
                                    }}
                                    className="px-5 py-2.5 bg-primary hover:bg-primary disabled:opacity-30 text-foreground text-xs font-bold rounded-xl transition-colors flex-shrink-0"
                                >
                                    + Add
                                </button>
                            </div>
                            {sessionConfig.learning_milestones.length > 0 ? (
                                <div className="flex flex-wrap gap-2 pt-1">
                                    {sessionConfig.learning_milestones.map((m, i) => (
                                        <div key={i} className="flex items-center gap-1.5 bg-primary/10 border border-primary/20 px-3 py-1.5 text-[11px] text-primary font-semibold">
                                            <span>{m}</span>
                                            <button
                                                type="button"
                                                onClick={() => setSessionConfig(s => ({ ...s, learning_milestones: s.learning_milestones.filter((_, idx) => idx !== i) }))}
                                                className="text-primary/40 hover:text-rose-400 transition-colors"
                                                aria-label="Remove"
                                            >
                                                <XMarkIcon className="w-3 h-3" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-[10px] text-muted-foreground italic">No milestones yet. Add key topics or skills covered this term.</p>
                            )}
                        </div>

                        <button
                            onClick={() => {
                                setSessionDone(true);
                                setSessionExpanded(false);
                                setClassFilter(sessionConfig.section_class); // pre-filter by selected class
                                setStep('pick');
                            }}
                            className="w-full py-4 bg-primary hover:bg-primary text-foreground font-black text-base rounded-xl transition-all shadow-lg shadow-primary/30 flex items-center justify-center gap-2">
                            <UserGroupIcon className="w-5 h-5" /> Step 2: Select Students →
                        </button>
                    </div>
                )}

                {/* ══════════════════════════════════════════════════════════════
                    STEP 1: Pick a student
                ══════════════════════════════════════════════════════════════ */}
                {step === 'pick' && (
                    <div className="space-y-4">
                        <div className="bg-primary/10 border border-primary/20 rounded-xl px-5 py-3">
                            <p className="text-primary font-bold text-sm">Step 2 of 3 — Select a Student to Grade</p>
                            <p className="text-primary/60 text-xs mt-0.5">Session settings are locked. Click a student to enter their individual scores.</p>
                        </div>

                        {/* Collapsible session summary */}
                        <SessionSummaryBar />

                        {/* Student grid */}
                        <div className="bg-card shadow-sm border border-border rounded-xl p-5">
                            <div className="flex items-center gap-3 mb-4 flex-wrap">
                                <h2 className="font-bold text-foreground flex items-center gap-2">
                                    <UserGroupIcon className="w-5 h-5 text-primary" /> Students
                                </h2>
                                <span className="text-xs text-muted-foreground bg-card shadow-sm px-2 py-0.5 rounded-full">{filteredStudents.length} shown / {students.length} loaded</span>
                                {filteredStudents.length > 0 && (
                                    <button
                                        onClick={handleBulkBuild}
                                        disabled={isBulkBuilding}
                                        className="inline-flex items-center gap-2 px-4 py-1.5 bg-primary hover:bg-primary disabled:opacity-50 text-foreground text-[10px] font-black uppercase tracking-[0.2em] rounded-xl transition-all shadow-lg shadow-primary/20 group"
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
                            </div>

                            {/* Search + Override controls */}
                            <div className="space-y-3 mb-4">
                                <input
                                    type="search" placeholder="Search student by name or email… (2+ chars shows all matching)"
                                    value={search} onChange={e => setSearch(e.target.value)}
                                    className="w-full bg-card shadow-sm border border-border text-foreground text-sm px-4 py-2.5 rounded-xl placeholder:text-muted-foreground focus:outline-none focus:border-primary" />

                                {/* Override toggle + Manual entry */}
                                <div className="flex items-center gap-3 flex-wrap">
                                    <button
                                        onClick={() => { setOverrideFilters(v => !v); setClassFilter(''); setSearch(''); }}
                                        className={`flex items-center gap-2 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider border rounded-xl transition-all ${overrideFilters ? 'bg-amber-500/20 border-amber-500/40 text-amber-400' : 'bg-card border-border text-muted-foreground hover:bg-muted'}`}>
                                        {overrideFilters ? '✓ Showing All Students' : '⚡ Override — Show All Students'}
                                    </button>
                                    {overrideFilters && (
                                        <span className="text-[10px] text-amber-400/60">School & class filters are OFF. Search by name to find anyone.</span>
                                    )}
                                </div>

                                {/* Dropdown filter per class — hidden in override mode */}
                                {!overrideFilters && (
                                    <div className="flex flex-wrap items-center gap-3">
                                        <select
                                            title="Filter by Class"
                                            value={classFilter}
                                            onChange={e => setClassFilter(e.target.value)}
                                            className="bg-card border border-border text-foreground px-3 py-2 text-sm focus:outline-none focus:border-primary rounded-lg min-w-[200px]"
                                        >
                                            <option value="">All Classes ({filteredStudents.length} students)</option>
                                            {distinctClasses.map(c => {
                                                const isTeacherClass = teacherClasses.some(tc => tc.name === c);
                                                return (
                                                    <option key={c} value={c}>
                                                        {isTeacherClass ? '🏫 ' : ''}{c}
                                                    </option>
                                                );
                                            })}
                                        </select>
                                        {classFilter && (
                                            <button
                                                onClick={() => setClassFilter('')}
                                                className="text-xs text-primary hover:text-primary font-bold transition-colors px-2"
                                            >
                                                Clear filter
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                            {/* Grouped student grid */}
                            {(() => {
                                const schoolScopedFiltered = filteredStudents;
                                if (schoolScopedFiltered.length === 0) {
                                    return (
                                        <div className="py-8 text-center space-y-4">
                                            <p className="text-muted-foreground text-sm">No students found with current filters.</p>
                                            <p className="text-muted-foreground text-xs">Try the <strong className="text-amber-400">Override — Show All Students</strong> toggle above, or enter a student manually below.</p>
                                            {/* Manual entry */}
                                            <div className="max-w-sm mx-auto space-y-2">
                                                <input
                                                    value={manualName}
                                                    onChange={e => setManualName(e.target.value)}
                                                    placeholder="Enter student full name manually…"
                                                    className="w-full px-4 py-2.5 bg-card border border-border text-foreground text-sm rounded-xl placeholder:text-muted-foreground focus:outline-none focus:border-primary" />
                                                <button
                                                    disabled={!manualName.trim()}
                                                    onClick={() => {
                                                        const fake = { id: `manual-${Date.now()}`, full_name: manualName.trim(), email: '', school_name: sessionConfig.school_name, school_id: sessionConfig.school_id, role: 'student' } as any;
                                                        selectStudent(fake as PortalUser, -1);
                                                    }}
                                                    className="w-full py-2.5 bg-primary hover:bg-primary disabled:opacity-40 text-foreground text-xs font-bold rounded-xl transition-all">
                                                    Continue with Manual Entry →
                                                </button>
                                            </div>
                                        </div>
                                    );
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
                                                    <span className="text-[10px] font-black text-primary/80 uppercase tracking-widest">{groupName}</span>
                                                    <span className="text-[9px] text-muted-foreground bg-card shadow-sm px-2 py-0.5 rounded-full">{(items as any[]).length}</span>
                                                    <div className="flex-1 h-px bg-card shadow-sm" />
                                                </div>
                                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                                    {(items as any[]).map(({ s, idx }) => (
                                                        <button key={s.id} onClick={() => selectStudent(s as PortalUser, idx)}
                                                            className="text-left p-4 bg-card shadow-sm border border-border hover:border-primary/50 hover:bg-primary/10 rounded-xl transition-all">
                                                            <div className="flex items-center gap-3">
                                                                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary from-primary to-primary flex items-center justify-center text-sm font-black text-foreground flex-shrink-0">
                                                                    {s.full_name ? s.full_name[0] : '?'}
                                                                </div>
                                                                <div className="min-w-0 flex-1">
                                                                    <p className="font-semibold text-foreground text-sm truncate">{s.full_name ?? 'Unnamed'}</p>
                                                                    <p className="text-xs text-muted-foreground truncate">{s.school_name ?? s.email}</p>
                                                                    {(s as any)._source === 'students_table' && (
                                                                        <span className="text-[9px] text-amber-400 font-semibold">Pre-portal</span>
                                                                    )}
                                                                </div>
                                                                <span className="ml-auto text-[10px] text-muted-foreground font-mono flex-shrink-0">#{idx + 1}</span>
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
                        <div className="bg-emerald-600/10 border border-emerald-500/20 rounded-xl px-5 py-3 flex items-center gap-3">
                            <div className="flex-1">
                                <p className="text-emerald-300 font-bold text-sm">Step 3 of 3 — Enter Student Scores</p>
                                <p className="text-emerald-300/60 text-xs mt-0.5">Session details are pre-filled. Just enter scores and evaluation for this student.</p>
                            </div>
                            <span className="text-muted-foreground text-xs font-mono flex-shrink-0">
                                {currentStudentIdx + 1} / {filteredStudents.length}
                            </span>
                        </div>

                        {/* Collapsible session summary */}
                        <SessionSummaryBar />

                        {/* Student navigator */}
                        <div className="bg-[#0d1526] border border-border rounded-xl px-4 py-3 flex items-center gap-3">
                            <button onClick={() => setStep('pick')}
                                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors flex-shrink-0">
                                <ArrowLeftIcon className="w-3.5 h-3.5" />
                                <span className="hidden sm:inline">All Students</span>
                            </button>
                            <div className="w-px h-4 bg-muted" />
                            <button
                                disabled={currentStudentIdx <= 0}
                                onClick={async () => {
                                    if (saving || publishing) return;
                                    await handleSave(false);
                                    const idx = currentStudentIdx - 1;
                                    if (idx >= 0) await selectStudent(filteredStudents[idx] as PortalUser, idx);
                                }}
                                className="p-1.5 rounded-xl bg-card shadow-sm text-muted-foreground hover:text-foreground disabled:opacity-20 transition-colors flex-shrink-0">
                                <ArrowLeftIcon className="w-3.5 h-3.5" />
                            </button>
                            <div className="flex-1 flex items-center gap-2 min-w-0">
                                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary from-primary to-primary flex items-center justify-center text-xs font-black text-foreground flex-shrink-0">
                                    {selectedStudent.full_name ? selectedStudent.full_name[0] : '?'}
                                </div>
                                <div className="min-w-0">
                                    <p className="font-bold text-foreground text-sm truncate">{selectedStudent.full_name}</p>
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
                                    if (saving || publishing) return;
                                    await handleSave(false);
                                    const idx = currentStudentIdx + 1;
                                    if (idx < filteredStudents.length) await selectStudent(filteredStudents[idx] as PortalUser, idx);
                                }}
                                className="p-1.5 rounded-xl bg-card shadow-sm text-muted-foreground hover:text-foreground disabled:opacity-20 transition-colors flex-shrink-0">
                                <ArrowLeftIcon className="w-3.5 h-3.5 rotate-180" />
                            </button>
                        </div>

                        {/* Smart module suggestion banner */}
                        {suggestedModule && (
                            <div className="flex items-center gap-3 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-2.5">
                                <SparklesIcon className="w-4 h-4 text-amber-400 flex-shrink-0" />
                                <div className="flex-1 min-w-0">
                                    <p className="text-[10px] font-black text-amber-400 uppercase tracking-widest">Smart Module Suggestion</p>
                                    <p className="text-[11px] text-amber-300/70 mt-0.5">
                                        Previous report ended at <strong className="text-amber-300">{suggestedModule.current}</strong>
                                        {suggestedModule.next && <> → Next: <strong className="text-amber-300">{suggestedModule.next}</strong></>}
                                    </p>
                                </div>
                                <button
                                    onClick={() => {
                                        setSessionConfig(s => ({ ...s, current_module: suggestedModule.current, next_module: suggestedModule.next }));
                                        setSuggestedModule(null);
                                    }}
                                    className="px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 text-[10px] font-black rounded-xl transition-colors flex-shrink-0">
                                    Apply →
                                </button>
                                <button onClick={() => setSuggestedModule(null)} className="text-amber-400/40 hover:text-amber-400 transition-colors flex-shrink-0">
                                    <XMarkIcon className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        )}

                        {/* Duplicate / cross-session warning banner */}
                        {duplicateWarning === 'published' && (
                            <div className="flex items-start gap-3 bg-rose-500/10 border border-rose-500/30 rounded-xl px-4 py-3">
                                <ExclamationTriangleIcon className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
                                <div className="flex-1 min-w-0">
                                    <p className="text-[10px] font-black text-rose-400 uppercase tracking-widest">Already Published This Term</p>
                                    <p className="text-[11px] text-rose-300/70 mt-0.5">
                                        A published report already exists for <strong className="text-rose-300">{selectedStudent?.full_name}</strong> in <strong className="text-rose-300">{duplicateDetail}</strong>. Saving will update the existing report — the student will see the new values.
                                    </p>
                                </div>
                                <button onClick={() => setDuplicateWarning(null)} className="text-rose-400/40 hover:text-rose-400 transition-colors flex-shrink-0">
                                    <XMarkIcon className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        )}
                        {duplicateWarning === 'cross-session' && (
                            <div className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3">
                                <ExclamationTriangleIcon className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                                <div className="flex-1 min-w-0">
                                    <p className="text-[10px] font-black text-amber-400 uppercase tracking-widest">Scores From a Different Course</p>
                                    <p className="text-[11px] text-amber-300/70 mt-0.5">
                                        The pre-filled scores below are from a previous report for <strong className="text-amber-300">{duplicateDetail}</strong>, not the current session course. Review scores before saving.
                                    </p>
                                </div>
                                <button onClick={() => setDuplicateWarning(null)} className="text-amber-400/40 hover:text-amber-400 transition-colors flex-shrink-0">
                                    <XMarkIcon className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        )}

                        {/* Transparent score sources bar — 6 weighted components */}
                        {!fetchingStats && (
                            <div className="bg-[#0d1526] border border-border px-5 py-3 space-y-2">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-black text-primary/70 uppercase tracking-widest">Score Sources — Auto-filled from Platform</span>
                                    <span className="text-[9px] text-muted-foreground">auto-suggested when score is 0</span>
                                </div>
                                <div className="grid grid-cols-3 lg:grid-cols-6 gap-2">
                                    <div className="bg-indigo-500/5 border border-indigo-500/20 px-2.5 py-2">
                                        <p className="text-[8px] font-black text-indigo-400 uppercase tracking-widest mb-1">Theory (20%)</p>
                                        <p className="text-[11px] font-black text-foreground">{studentStats.cbtScore > 0 ? `${studentStats.cbtScore}%` : '—'}</p>
                                        <p className="text-[8px] text-muted-foreground">CBT exam</p>
                                    </div>
                                    <div className="bg-cyan-500/5 border border-cyan-500/20 px-2.5 py-2">
                                        <p className="text-[8px] font-black text-cyan-400 uppercase tracking-widest mb-1">Classwork (10%)</p>
                                        <p className="text-[11px] font-black text-foreground">{studentStats.assignmentAvg > 0 ? `${studentStats.assignmentAvg}%` : '—'}</p>
                                        <p className="text-[8px] text-muted-foreground">Assignment avg</p>
                                    </div>
                                    <div className="bg-primary/5 border border-primary/20 px-2.5 py-2">
                                        <p className="text-[8px] font-black text-primary uppercase tracking-widest mb-1">Practical (25%)</p>
                                        <p className="text-[11px] font-black text-foreground">{studentStats.projects} project{studentStats.projects !== 1 ? 's' : ''}</p>
                                        <p className="text-[8px] text-muted-foreground">Lab + portfolio</p>
                                    </div>
                                    <div className="bg-emerald-500/5 border border-emerald-500/20 px-2.5 py-2">
                                        <p className="text-[8px] font-black text-emerald-400 uppercase tracking-widest mb-1">Assignments (20%)</p>
                                        <p className="text-[11px] font-black text-foreground">{studentStats.assignments}/{studentStats.totalAssignments}</p>
                                        <p className="text-[8px] text-muted-foreground">{studentStats.assignmentPct}% submitted</p>
                                    </div>
                                    <div className="bg-amber-500/5 border border-amber-500/20 px-2.5 py-2">
                                        <p className="text-[8px] font-black text-amber-400 uppercase tracking-widest mb-1">Attendance (10%)</p>
                                        <p className="text-[11px] font-black text-foreground">{studentStats.attendance}/{studentStats.totalSessions}</p>
                                        <p className="text-[8px] text-muted-foreground">Sessions present</p>
                                    </div>
                                    <div className="bg-rose-500/5 border border-rose-500/20 px-2.5 py-2">
                                        <p className="text-[8px] font-black text-rose-400 uppercase tracking-widest mb-1">Assessment (15%)</p>
                                        <p className="text-[11px] font-black text-foreground">{studentStats.assignmentAvg > 0 ? `${studentStats.assignmentAvg}%` : '—'}</p>
                                        <p className="text-[8px] text-muted-foreground">CBT evaluation</p>
                                    </div>
                                </div>
                            </div>
                        )}
                        {fetchingStats && (
                            <div className="flex items-center gap-2 px-5 py-2.5 bg-[#0d1526] border border-border text-[10px] text-muted-foreground">
                                <ArrowPathIcon className="w-3 h-3 animate-spin" /> Fetching student stats...
                            </div>
                        )}

                        {/* Alerts */}
                        {error && (
                            <div className="flex items-center gap-3 bg-rose-500/10 border border-rose-500/20 rounded-xl p-4">
                                <ExclamationTriangleIcon className="w-5 h-5 text-rose-400 flex-shrink-0" />
                                <p className="text-rose-400 text-sm">{error}</p>
                                <button onClick={() => setError('')} className="ml-auto text-rose-400/50 hover:text-rose-400 transition-colors flex-shrink-0">
                                    <XMarkIcon className="w-4 h-4" />
                                </button>
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

                                <Section title="Report Design" icon="🎨">
                                    <div className="flex flex-col gap-4">
                                        <div className="flex bg-white/5 border border-white/10 p-1 rounded-xl overflow-hidden">
                                            <button onClick={() => setReportStyle('standard')}
                                                className={`flex-1 py-2 text-[10px] font-black uppercase transition-all ${reportStyle === 'standard' ? 'bg-primary text-white shadow-lg' : 'text-muted-foreground hover:text-white'}`}>
                                                Standard
                                            </button>
                                            <button onClick={() => setReportStyle('modern')}
                                                className={`flex-1 py-2 text-[10px] font-black uppercase transition-all ${reportStyle === 'modern' ? 'bg-primary text-white shadow-lg' : 'text-muted-foreground hover:text-white'}`}>
                                                Modern
                                            </button>
                                            <button onClick={() => setReportStyle('printable')}
                                                className={`flex-1 py-2 text-[10px] font-black uppercase transition-all ${reportStyle === 'printable' ? 'bg-primary text-white shadow-lg' : 'text-muted-foreground hover:text-white'}`}>
                                                Printable
                                            </button>
                                        </div>

                                        {reportStyle === 'modern' && (
                                            <div className="grid grid-cols-3 gap-2">
                                                {[
                                                    { id: 'industrial', name: 'Industrial', color: 'bg-slate-900', border: 'border-primary' },
                                                    { id: 'executive', name: 'Executive', color: 'bg-[#FDFBF2]', border: 'border-slate-800' },
                                                    { id: 'futuristic', name: 'Futuristic', color: 'bg-[#050510]', border: 'border-cyan-500' }
                                                ].map((t) => (
                                                    <button 
                                                        key={t.id}
                                                        type="button"
                                                        onClick={() => setModernTemplateId(t.id as any)}
                                                        className={cn(
                                                            "group relative flex flex-col items-center justify-center py-3 border transition-all overflow-hidden",
                                                            modernTemplateId === t.id ? "border-primary bg-primary/10 shadow-[0_0_15px_rgba(255,102,0,0.1)]" : "border-white/5 bg-white/5 hover:bg-white/10"
                                                        )}
                                                    >
                                                        <div className={cn("w-8 h-8 mb-1 relative overflow-hidden", t.color)}>
                                                            <div className={cn("absolute inset-0.5 border-[0.5px]", t.border, "opacity-40")} />
                                                        </div>
                                                        <span className="text-[8px] font-black uppercase tracking-tighter text-foreground">{t.name}</span>
                                                        {modernTemplateId === t.id && (
                                                            <div className="absolute top-1 right-1">
                                                                <CheckCircleIcon className="w-3 h-3 text-primary" />
                                                            </div>
                                                        )}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </Section>

                                {/* Identity & Photo */}
                                <Section title="Student Identity" icon="👤">
                                    <div className="flex flex-col sm:flex-row items-start gap-6">
                                        <div className="relative group">
                                            <div className="w-28 h-28 rounded-xl bg-card shadow-sm border-2 border-dashed border-border flex items-center justify-center overflow-hidden transition-colors group-hover:border-primary/50">
                                                {form.photo_url ? (
                                                    <img src={form.photo_url} className="w-full h-full object-cover" alt="Student" />
                                                ) : (
                                                    <UserGroupIcon className="w-8 h-8 text-muted-foreground" />
                                                )}
                                                {uploading && (
                                                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center backdrop-blur-sm">
                                                        <ArrowPathIcon className="w-6 h-6 animate-spin text-foreground" />
                                                    </div>
                                                )}
                                            </div>
                                            <label className="absolute -bottom-2 -right-2 bg-primary hover:bg-primary p-2 rounded-xl border border-border cursor-pointer transition-all shadow-lg hover:scale-110 active:scale-95">
                                                <ArrowUpTrayIcon className="w-4 h-4 text-foreground" />
                                                <input type="file" className="hidden" accept="image/*" onChange={handlePhotoUpload} />
                                            </label>
                                        </div>
                                        <div className="flex-1 space-y-4">
                                            <Field label="Full Name">
                                                <input value={form.student_name} onChange={e => setForm(f => ({ ...f, student_name: e.target.value }))} className={INPUT} />
                                            </Field>
                                            <div className="grid grid-cols-2 gap-3">
                                                <div className="p-3 bg-white/[0.03] border border-border rounded-xl">
                                                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-0.5">School</p>
                                                    <p className="text-sm text-muted-foreground font-semibold truncate">{sessionConfig.school_name || '—'}</p>
                                                </div>
                                                <div className="p-3 bg-white/[0.03] border border-border rounded-xl">
                                                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest block mb-1">Class</label>
                                                    <select
                                                        value={form.section_class}
                                                        onChange={e => setForm(f => ({ ...f, section_class: e.target.value }))}
                                                        className="w-full bg-transparent text-sm text-foreground focus:outline-none transition-colors cursor-pointer">
                                                        <option value="" className="bg-background">Select —</option>
                                                        {CLASS_PRESETS.map(c => <option key={c} value={c} className="bg-background">{c}</option>)}
                                                        {distinctClasses.filter(c => !CLASS_PRESETS.includes(c)).map(c => <option key={c} value={c} className="bg-background">{c}</option>)}
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

                                {/* Per-student module override */}
                                <div className="bg-card shadow-sm border border-border rounded-xl overflow-hidden">
                                    <div className="flex items-center gap-2 px-4 py-2.5 bg-white/[0.02] border-b border-border">
                                        <span className="text-[10px]">📖</span>
                                        <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex-1">Module (this student)</h3>
                                        <span className="text-[9px] text-muted-foreground/50">Overrides session default</span>
                                    </div>
                                    <div className="p-4 grid grid-cols-2 gap-3">
                                        <Field label="Current Module">
                                            <input
                                                list="stu-cur-mod-list"
                                                value={form.student_current_module || sessionConfig.current_module}
                                                onChange={e => setForm(f => {
                                                    const val = e.target.value;
                                                    const sugg = getModuleSuggestions(sessionConfig.course_name);
                                                    const idx = sugg.modules.indexOf(val);
                                                    const autoNext = idx >= 0 ? sugg.next[idx] : '';
                                                    return { ...f, student_current_module: val, ...(autoNext && !f.student_next_module ? { student_next_module: autoNext } : {}) };
                                                })}
                                                className={INPUT} placeholder={sessionConfig.current_module || 'e.g. Functions & Scope'} />
                                            <datalist id="stu-cur-mod-list">
                                                {getModuleSuggestions(sessionConfig.course_name).modules.map(m => <option key={m} value={m} />)}
                                            </datalist>
                                        </Field>
                                        <Field label="Next Module">
                                            <input
                                                list="stu-nxt-mod-list"
                                                value={form.student_next_module || sessionConfig.next_module}
                                                onChange={e => setForm(f => ({ ...f, student_next_module: e.target.value }))}
                                                className={INPUT} placeholder={sessionConfig.next_module || 'e.g. OOP Basics'} />
                                            <datalist id="stu-nxt-mod-list">
                                                {getModuleSuggestions(sessionConfig.course_name).next.map(m => <option key={m} value={m} />)}
                                            </datalist>
                                        </Field>
                                    </div>
                                </div>

                                {/* Scores — 6 weighted components */}
                                <Section title="Performance Scores" icon="📊">
                                    <div className="space-y-4">
                                        {/* Quick-apply score profiles */}
                                        <div className="flex flex-wrap gap-2 pb-3 border-b border-border">
                                            <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest self-center flex-shrink-0">Quick:</span>
                                            {([
                                                { label: 'Excellent',   scores: [90, 85, 88, 85, 90, 88], color: 'emerald' },
                                                { label: 'Good',        scores: [75, 72, 75, 70, 78, 72], color: 'primary' },
                                                { label: 'Fair',        scores: [58, 55, 58, 55, 60, 55], color: 'amber'   },
                                                { label: 'Struggling',  scores: [42, 40, 42, 40, 48, 40], color: 'rose'    },
                                            ] as const).map(({ label, scores, color }) => (
                                                <button
                                                    key={label} type="button"
                                                    onClick={() => setForm(f => ({
                                                        ...f,
                                                        theory_score:        String(scores[0]),
                                                        classwork_score:     String(scores[1]),
                                                        practical_score:     String(scores[2]),
                                                        attendance_score:    String(scores[3]),
                                                        participation_score: String(scores[4]),
                                                        assessment_score:    String(scores[5]),
                                                        proficiency_level:   scores[0] >= 80 ? 'advanced' : scores[0] >= 50 ? 'intermediate' : 'beginner',
                                                    }))}
                                                    className={`px-3 py-1 text-[9px] font-black uppercase tracking-wider border rounded-xl transition-all ${
                                                        color === 'emerald' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
                                                        : color === 'primary' ? 'bg-primary/10 border-primary/30 text-primary hover:bg-primary/20'
                                                        : color === 'amber' ? 'bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/20'
                                                        : 'bg-rose-500/10 border-rose-500/30 text-rose-400 hover:bg-rose-500/20'
                                                    }`}
                                                >
                                                    {label}
                                                </button>
                                            ))}
                                        </div>
                                        {([
                                            { key: 'theory_score',       label: 'Theory / Written Tests',      weight: '20%', color: '#6366f1', hint: `CBT exam: ${studentStats.cbtScore > 0 ? studentStats.cbtScore + '%' : '—'}` },
                                            { key: 'classwork_score',    label: 'Classwork & Participation',   weight: '10%', color: '#06b6d4', hint: `Assignment grade avg: ${studentStats.assignmentAvg > 0 ? studentStats.assignmentAvg + '%' : '—'}` },
                                            { key: 'practical_score',    label: 'Practical / Projects',        weight: '25%', color: '#8b5cf6', hint: `${studentStats.projects} project${studentStats.projects !== 1 ? 's' : ''} (lab + portfolio)` },
                                            { key: 'attendance_score',   label: 'Assignments Submitted',       weight: '20%', color: '#10b981', hint: `${studentStats.assignments}/${studentStats.totalAssignments} graded (${studentStats.assignmentPct}%)` },
                                            { key: 'participation_score',label: 'Attendance',                  weight: '10%', color: '#f59e0b', hint: `${studentStats.attendance}/${studentStats.totalSessions} sessions present` },
                                            { key: 'assessment_score',   label: 'Mid-term Assessment',         weight: '15%', color: '#f43f5e', hint: `CBT evaluation: ${studentStats.assignmentAvg > 0 ? studentStats.assignmentAvg + '%' : '—'}` },
                                        ] as { key: keyof typeof form; label: string; weight: string; color: string; hint: string }[]).map(({ key, label, weight, color, hint }) => {
                                            const val = Math.min(100, Math.max(0, parseInt(String(form[key])) || 0));
                                            const nudge = (delta: number) =>
                                                setForm(f => ({ ...f, [key]: String(Math.min(100, Math.max(0, (parseInt(String(f[key])) || 0) + delta))) }));
                                            return (
                                                <div key={key} className="space-y-1">
                                                    <div className="flex justify-between items-baseline">
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: color }} />
                                                            <label className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">{label}</label>
                                                            <span className="text-[8px] text-muted-foreground/40 font-bold">{weight}</span>
                                                        </div>
                                                        <span className="text-[11px] font-black tabular-nums" style={{ color }}>{val}%</span>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <input
                                                            type="range" min="0" max="100" value={String(form[key])}
                                                            onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                                                            className="flex-1 h-[3px] appearance-none cursor-pointer outline-none bg-muted/40 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white/20 [&::-webkit-slider-thumb]:cursor-pointer"
                                                            style={{ background: `linear-gradient(to right, ${color} ${val}%, rgba(255,255,255,0.06) ${val}%)` }}
                                                        />
                                                        <div className="flex items-center gap-px flex-shrink-0">
                                                            <button type="button" onClick={() => nudge(-5)} className="px-1 py-0.5 text-[8px] font-black text-muted-foreground/50 hover:text-rose-400 hover:bg-rose-500/10 transition-all">−5</button>
                                                            <button type="button" onClick={() => nudge(-1)} className="px-1 py-0.5 text-[8px] font-black text-muted-foreground/50 hover:text-rose-400 hover:bg-rose-500/10 transition-all">−1</button>
                                                            <input
                                                                type="text" inputMode="numeric" pattern="[0-9]*"
                                                                value={parseInt(String(form[key])) === 0 ? '' : String(parseInt(String(form[key])) || '')}
                                                                placeholder="0"
                                                                onChange={e => {
                                                                    const raw = e.target.value.replace(/[^0-9]/g, '');
                                                                    setForm(f => ({ ...f, [key]: raw === '' ? '0' : String(Math.min(100, parseInt(raw))) }));
                                                                }}
                                                                onFocus={e => { if (!e.target.value) e.target.select(); }}
                                                                className="w-9 text-center py-0.5 bg-card border border-border rounded-xl text-[10px] font-black text-foreground focus:outline-none focus:border-primary" />
                                                            <button type="button" onClick={() => nudge(1)} className="px-1 py-0.5 text-[8px] font-black text-muted-foreground/50 hover:text-emerald-400 hover:bg-emerald-500/10 transition-all">+1</button>
                                                            <button type="button" onClick={() => nudge(5)} className="px-1 py-0.5 text-[8px] font-black text-muted-foreground/50 hover:text-emerald-400 hover:bg-emerald-500/10 transition-all">+5</button>
                                                        </div>
                                                    </div>
                                                    <p className="text-[8px] text-muted-foreground/40 italic">{hint}</p>
                                                </div>
                                            );
                                        })}

                                        {/* Overall — weighted score display */}
                                        <div className="mt-1 pt-3 border-t border-border flex items-center justify-between">
                                            <div>
                                                <p className="text-[8px] font-black text-muted-foreground/40 uppercase tracking-widest mb-0.5">Weighted Overall</p>
                                                <p className="text-2xl font-black text-foreground tabular-nums">{overallScore}<span className="text-sm text-muted-foreground/50 ml-0.5">%</span></p>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <div className="text-right">
                                                    <p className="text-[8px] font-black text-muted-foreground/40 uppercase tracking-widest mb-0.5">Grade</p>
                                                    <span className="text-[10px] font-black text-muted-foreground/60 uppercase tracking-widest">{overallScore >= 45 ? 'Pass' : 'Below Pass'}</span>
                                                </div>
                                                <div className="w-12 h-12 flex flex-col items-center justify-center font-black border-2 border-primary/40 bg-primary/10 text-primary">
                                                    <span className="text-base leading-none">{waecCode}</span>
                                                    <span className="text-[7px] text-primary/60 font-bold">{overallGradeLetter}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </Section>

                                {/* Activity Qualifiers — aligned to grading components */}
                                <Section title="Activity Qualifiers" icon="🏅">
                                    <div className="space-y-5">
                                        {([
                                            { key: 'participation_grade', label: 'Classwork & Participation', picks: CLASSWORK_PICKS, placeholder: 'e.g. Fully Engaged, Shows Initiative…' },
                                            { key: 'projects_grade',      label: 'Practical / Projects',      picks: PROJECTS_PICKS,  placeholder: 'e.g. All Delivered, Outstanding Work…' },
                                            { key: 'homework_grade',      label: 'Assignments & Homework',    picks: HOMEWORK_PICKS,  placeholder: 'e.g. Always Submitted, Improving Pattern…' },
                                        ] as { key: keyof typeof form; label: string; picks: string[]; placeholder: string }[]).map(({ key, label, picks, placeholder }) => {
                                            const val = String(form[key] ?? '');
                                            return (
                                                <div key={key}>
                                                    <div className="flex items-center justify-between mb-2">
                                                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{label}</label>
                                                        <button onClick={() => handleAIGenerate(key as any)} disabled={!!generating}
                                                            className="flex items-center gap-1.5 text-[10px] font-bold text-primary hover:text-primary disabled:opacity-50 transition-all">
                                                            {generating === key ? <ArrowPathIcon className="w-3 h-3 animate-spin" /> : <SparklesIcon className="w-3 h-3" />}
                                                            AI Draft
                                                        </button>
                                                    </div>
                                                    {/* Quick-pick chips */}
                                                    <div className="flex flex-wrap gap-1.5 mb-2">
                                                        {picks.map(p => (
                                                            <button key={p} type="button"
                                                                onClick={() => setForm(f => ({ ...f, [key]: p }))}
                                                                className={`px-2 py-0.5 text-[9px] font-bold border transition-all ${
                                                                    val === p
                                                                        ? 'bg-primary/20 border-primary/50 text-primary'
                                                                        : 'bg-muted/30 border-border text-muted-foreground hover:border-primary/30 hover:text-foreground/80'
                                                                }`}>
                                                                {p}
                                                            </button>
                                                        ))}
                                                    </div>
                                                    {/* Free-text input with datalist for typed suggestions */}
                                                    <div className="relative">
                                                        <input
                                                            list={`${key}-list`}
                                                            value={val}
                                                            onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                                                            className={INPUT}
                                                            placeholder={placeholder}
                                                        />
                                                        <datalist id={`${key}-list`}>
                                                            {picks.map(p => <option key={p} value={p} />)}
                                                        </datalist>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </Section>
                            </div>

                            {/* Right column */}
                            <div className="space-y-6">
                                {/* Proficiency level quick-set */}
                                <Section title="Proficiency Level" icon="🎯">
                                    <div className="grid grid-cols-3 gap-2">
                                        {PROFICIENCY_OPTIONS.map(p => (
                                            <button
                                                key={p}
                                                type="button"
                                                onClick={() => setForm(f => ({ ...f, proficiency_level: p }))}
                                                className={`py-2.5 text-[10px] font-black uppercase tracking-wider transition-all border rounded-xl ${
                                                    form.proficiency_level === p
                                                        ? p === 'advanced' ? 'bg-emerald-600 border-emerald-500 text-white'
                                                            : p === 'intermediate' ? 'bg-primary border-primary text-white'
                                                            : 'bg-slate-600 border-slate-500 text-white'
                                                        : 'bg-card border-border text-muted-foreground hover:bg-muted'
                                                }`}
                                            >
                                                {p === 'beginner' ? '🌱 Beginner' : p === 'intermediate' ? '⚡ Mid-level' : '🚀 Advanced'}
                                            </button>
                                        ))}
                                    </div>
                                    <p className="text-[10px] text-muted-foreground mt-1">Overall score is {overallScore}% — auto-suggestion: <span className="text-primary font-bold">{overallScore >= 80 ? 'Advanced' : overallScore >= 50 ? 'Intermediate' : 'Beginner'}</span></p>
                                </Section>

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
                                                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{labels[field]}</label>
                                                        <button onClick={() => handleAIGenerate(field)} disabled={!!generating}
                                                            className="flex items-center gap-1.5 text-[10px] font-bold text-primary hover:text-primary disabled:opacity-50 transition-all hover:translate-x-1">
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
                        <div className="sticky bottom-0 z-40 bg-background/95 backdrop-blur-xl border-t border-border transition-all mt-6 -mx-3 sm:-mx-6 lg:-mx-8">
                            {/* Success / Error flash banner in the action bar */}
                            {(success || error) && (
                                <div className={`px-4 py-2 flex items-center gap-2 text-xs font-bold border-b ${
                                    success
                                        ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                                        : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                                }`}>
                                    {success
                                        ? <CheckIcon className="w-3.5 h-3.5 flex-shrink-0" />
                                        : <ExclamationTriangleIcon className="w-3.5 h-3.5 flex-shrink-0" />
                                    }
                                    <span>{success || error}</span>
                                </div>
                            )}
                            <div className="max-w-5xl mx-auto p-3 sm:p-4 space-y-2">
                                {/* Student identity row — always visible */}
                                <div className="flex items-center justify-between gap-2 px-1">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-primary to-indigo-600 flex items-center justify-center text-[10px] font-black text-white flex-shrink-0">
                                            {selectedStudent?.full_name?.[0] ?? '?'}
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-xs font-black text-foreground truncate leading-none">{selectedStudent?.full_name ?? 'Student'}</p>
                                            <p className="text-[9px] text-muted-foreground leading-none mt-0.5 truncate">
                                                {form.section_class || sessionConfig.section_class || selectedStudent?.section_class || ''}
                                            </p>
                                        </div>
                                        {existingReport && (
                                            <span className={`flex-shrink-0 text-[8px] px-1.5 py-0.5 rounded-full font-black ${form.is_published ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
                                                {form.is_published ? '✓ Published' : 'Draft'}
                                            </span>
                                        )}
                                    </div>
                                    <span className="text-[10px] font-black text-muted-foreground flex-shrink-0 tabular-nums">
                                        {currentStudentIdx + 1} / {filteredStudents.length}
                                    </span>
                                </div>

                                {/* Actions row */}
                                <div className="flex items-center gap-1.5 sm:gap-2">
                                    <button onClick={() => handleSave(false)} disabled={saving || publishing}
                                        className="flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-4 py-2 sm:py-2.5 bg-card shadow-sm hover:bg-muted text-foreground text-[10px] sm:text-xs font-bold rounded-xl transition-all disabled:opacity-50 flex-shrink-0">
                                        {saving ? <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" /> : <CloudArrowUpIcon className="w-3.5 h-3.5" />}
                                        <span>{saving ? 'Saving…' : 'Draft'}</span>
                                    </button>
                                    <button onClick={() => handleSave(true)} disabled={saving || publishing}
                                        className="flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-4 py-2 sm:py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] sm:text-xs font-bold rounded-xl transition-all disabled:opacity-50 shadow-lg shadow-emerald-900/20 flex-shrink-0">
                                        {publishing ? <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" /> : <RocketLaunchIcon className="w-3.5 h-3.5" />}
                                        <span>{publishing ? 'Publishing…' : 'Publish'}</span>
                                    </button>
                                    <button onClick={() => setShowPreview(true)}
                                        className="flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-4 py-2 sm:py-2.5 bg-primary hover:bg-primary text-white text-[10px] sm:text-xs font-bold rounded-xl transition-all shadow-lg shadow-primary/40 flex-shrink-0">
                                        <EyeIcon className="w-3.5 h-3.5" />
                                        <span className="hidden sm:inline">Preview</span>
                                    </button>
                                    <button onClick={handleGenerateAll} disabled={generatingAll || !!generating}
                                        className="flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-4 py-2 sm:py-2.5 bg-violet-600/20 hover:bg-violet-600/30 border border-violet-500/30 text-violet-300 text-[10px] sm:text-xs font-bold rounded-xl transition-all disabled:opacity-50 flex-shrink-0">
                                        {generatingAll ? <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" /> : <SparklesIcon className="w-3.5 h-3.5" />}
                                        <span className="hidden sm:inline">{generatingAll ? 'Generating…' : 'Gen All'}</span>
                                        <span className="sm:hidden">AI</span>
                                    </button>

                                    <div className="ml-auto flex items-center gap-1.5 flex-shrink-0">
                                        {/* Previous student */}
                                        <button
                                            disabled={currentStudentIdx <= 0 || saving || publishing}
                                            onClick={async () => {
                                                if (saving || publishing || currentStudentIdx <= 0) return;
                                                await handleSave(false);
                                                const idx = currentStudentIdx - 1;
                                                if (idx >= 0) await selectStudent(filteredStudents[idx] as PortalUser, idx);
                                            }}
                                            title="Previous student"
                                            className="flex items-center gap-1 px-2.5 sm:px-3 py-2 sm:py-2.5 bg-card shadow-sm hover:bg-muted text-muted-foreground text-[10px] sm:text-xs font-bold rounded-xl transition-all disabled:opacity-25 border border-border">
                                            <ArrowLeftIcon className="w-3.5 h-3.5" />
                                            <span className="hidden sm:inline">Prev</span>
                                        </button>
                                        {/* Next student / finish */}
                                        {currentStudentIdx < filteredStudents.length - 1 ? (
                                            <button onClick={() => saveAndNext(false)} disabled={saving || publishing}
                                                className="flex items-center gap-1 sm:gap-1.5 px-3 sm:px-5 py-2 sm:py-2.5 bg-gradient-to-r from-primary to-indigo-600 hover:from-primary hover:to-indigo-500 text-white text-[10px] sm:text-xs font-black rounded-xl transition-all disabled:opacity-50 shadow-xl shadow-primary/30">
                                                <span>Next</span>
                                                <ChevronRightIcon className="w-3.5 h-3.5" />
                                            </button>
                                        ) : (
                                            <button onClick={() => { handleSave(false); setStep('pick'); }} disabled={saving || publishing}
                                                className="flex items-center gap-1 sm:gap-1.5 px-3 sm:px-5 py-2 sm:py-2.5 bg-gradient-to-r from-primary to-indigo-600 hover:from-primary hover:to-indigo-500 text-white text-[10px] sm:text-xs font-black rounded-xl transition-all disabled:opacity-50 shadow-xl shadow-primary/30">
                                                <CheckCircleIcon className="w-3.5 h-3.5" />
                                                <span>Done</span>
                                            </button>
                                        )}
                                    </div>
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
                        <div className="bg-background border border-border rounded-t-[32px] sm:rounded-[32px] w-full sm:max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
                            <div className="px-6 py-5 border-b border-border flex items-center justify-between bg-white/[0.03]">
                                <div>
                                    <h3 className="text-xl font-extrabold text-foreground">Branding Settings</h3>
                                    <p className="text-muted-foreground text-xs mt-0.5">Configure report header & organization details</p>
                                </div>
                                <button onClick={() => setShowSettings(false)} className="p-2 hover:bg-muted rounded-xl transition-colors">
                                    <XMarkIcon className="w-5 h-5 text-muted-foreground" />
                                </button>
                            </div>

                            <div className="p-6 overflow-y-auto space-y-5">
                                <div className="flex items-center gap-4 p-5 bg-card shadow-sm border border-border rounded-xl">
                                    <div className="relative group">
                                        <div className="w-20 h-20 rounded-xl bg-card shadow-sm border-2 border-dashed border-border flex items-center justify-center overflow-hidden">
                                            {branding.logo_url ? (
                                                <img src={branding.logo_url} className="w-full h-full object-contain p-2" alt="Logo" />
                                            ) : (
                                                <PhotoIcon className="w-8 h-8 text-muted-foreground" />
                                            )}
                                            {uploading && (
                                                <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                                                    <ArrowPathIcon className="w-6 h-6 animate-spin text-foreground" />
                                                </div>
                                            )}
                                        </div>
                                        <label className="absolute -bottom-2 -right-2 bg-primary hover:bg-primary p-2 rounded-xl border border-border cursor-pointer transition-colors shadow-lg">
                                            <ArrowUpTrayIcon className="w-4 h-4 text-foreground" />
                                            <input type="file" className="hidden" accept="image/*" onChange={async (e) => {
                                                const file = e.target.files?.[0];
                                                if (!file) return;
                                                setUploading(true);
                                                try {
                                                    const formData = new FormData();
                                                    formData.append('file', file);
                                                    formData.append('folder', 'branding');
                                                    formData.append('studentName', branding.org_name || 'org_logo');

                                                    const res = await fetch('/api/upload/report-photo', {
                                                        method: 'POST',
                                                        body: formData
                                                    });

                                                    if (!res.ok) {
                                                        const errJson = await res.json();
                                                        throw new Error(errJson.error || 'Upload failed');
                                                    }

                                                    const json = await res.json();
                                                    setBranding(b => ({ ...b, logo_url: json.url }));
                                                } catch (err: any) {
                                                    setError(err.message);
                                                } finally {
                                                    setUploading(false);
                                                }
                                            }} />
                                        </label>
                                    </div>
                                    <div className="flex-1 space-y-1">
                                        <h4 className="text-sm font-bold text-foreground">Organization Logo</h4>
                                        <p className="text-xs text-muted-foreground">PNG with transparent background works best.</p>
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

                            <div className="p-6 bg-white/[0.03] border-t border-border flex justify-end gap-3">
                                <button onClick={() => setShowSettings(false)}
                                    className="px-5 py-2.5 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors">
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
                                        setSuccessMsg('Branding settings saved!');
                                        setShowSettings(false);
                                    } catch (err: any) {
                                        setError(err.message);
                                    } finally {
                                        setSaving(false);
                                    }
                                }} className="flex items-center gap-2 px-6 py-2.5 bg-primary hover:bg-primary text-foreground text-sm font-bold rounded-xl transition-all shadow-lg shadow-primary/40">
                                    <CheckIcon className="w-4 h-4" /> Save Branding
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* ── Live Preview Modal ── */}
            {showPreview && (
                <div className="fixed inset-0 z-50 flex flex-col bg-background">
                    <div className="flex items-center gap-4 px-8 py-4 border-b border-border bg-[#0a0a14]">
                        <button onClick={() => setShowPreview(false)} className="p-2 hover:bg-card shadow-sm rounded-xl transition-colors">
                            <ArrowLeftIcon className="w-6 h-6 text-muted-foreground" />
                        </button>
                        <div className="flex-1">
                            <h3 className="text-foreground font-black">{form.student_name}</h3>
                            <p className="text-[10px] text-muted-foreground uppercase tracking-[0.2em] font-bold">Report Card Preview</p>
                        </div>
                        <div className="flex bg-white/5 border border-white/10 mr-4 p-1">
                            <button onClick={() => setReportStyle('standard')}
                                className={`px-4 py-2 text-[10px] font-black uppercase transition-all ${reportStyle === 'standard' ? 'bg-primary text-white' : 'text-muted-foreground hover:text-white'}`}>
                                Standard
                            </button>
                            <button onClick={() => setReportStyle('modern')}
                                className={`px-4 py-2 text-[10px] font-black uppercase transition-all ${reportStyle === 'modern' ? 'bg-primary text-white' : 'text-muted-foreground hover:text-white'}`}>
                                Modern
                            </button>
                            <button onClick={() => setReportStyle('printable')}
                                className={`px-4 py-2 text-[10px] font-black uppercase transition-all ${reportStyle === 'printable' ? 'bg-primary text-white' : 'text-muted-foreground hover:text-white'}`}>
                                Printable
                            </button>
                        </div>

                        {reportStyle === 'modern' && (
                            <div className="flex bg-white/5 border border-white/10 p-1 mr-4 gap-1">
                                {[
                                    { id: 'industrial', name: 'Industrial', color: 'bg-slate-900', border: 'border-primary' },
                                    { id: 'executive', name: 'Executive', color: 'bg-[#FDFBF2]', border: 'border-slate-800' },
                                    { id: 'futuristic', name: 'Futuristic', color: 'bg-[#050510]', border: 'border-cyan-500' }
                                ].map((t) => (
                                    <button 
                                        key={t.id}
                                        onClick={() => setModernTemplateId(t.id as any)}
                                        className={cn(
                                            "group relative w-20 h-10 flex flex-col items-center justify-center transition-all overflow-hidden",
                                            modernTemplateId === t.id ? "ring-2 ring-primary ring-offset-2 ring-offset-[#0a0a14]" : "opacity-40 hover:opacity-100"
                                        )}
                                    >
                                        <div className={cn("absolute inset-0", t.color)} />
                                        <div className={cn("absolute inset-1 border-[0.5px]", t.border, "opacity-40")} />
                                        <span className={cn(
                                            "relative z-10 text-[8px] font-black uppercase tracking-tighter",
                                            t.id === 'executive' ? "text-foreground" : "text-white"
                                        )}>{t.name}</span>
                                        {modernTemplateId === t.id && (
                                            <div className="absolute top-0 right-0 bg-primary text-white p-0.5">
                                                <CheckIcon className="w-2 h-2" />
                                            </div>
                                        )}
                                    </button>
                                ))}
                            </div>
                        )}
                        <button onClick={downloadPDF} disabled={isGeneratingPdf}
                            className="flex items-center gap-2 px-6 py-3 bg-primary hover:bg-primary text-foreground text-sm font-black rounded-xl shadow-xl shadow-primary/30 transition-all disabled:opacity-50">
                            {isGeneratingPdf ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : <PrinterIcon className="w-4 h-4" />}
                            {isGeneratingPdf ? 'Processing...' : 'Export PDF'}
                        </button>
                        {/* Share report card PDF via Web Share / WhatsApp */}
                        <button
                            disabled={isSharingPdf || !form.student_name}
                            onClick={async () => {
                                if (!pdfRef.current) { setError('Open Live Preview first, then share.'); return; }
                                setIsSharingPdf(true); setError('');
                                try {
                                    const name = form.student_name.replace(/\s+/g, '_') || 'Student';
                                    const term = sessionConfig.report_term.replace(/\s+/g, '_') || 'Report';
                                    const result = await shareReportCard(
                                        pdfRef.current,
                                        `${name}_${term}.pdf`,
                                        `Progress report for ${form.student_name} — ${sessionConfig.report_term} — Rillcod Academy`,
                                    );
                                    if (result === 'downloaded') {
                                        setError('Web Share not supported on this browser — PDF downloaded instead.');
                                    }
                                } catch (err: unknown) {
                                    const msg = err instanceof Error ? err.message : '';
                                    if (!msg.toLowerCase().includes('cancel') && !msg.toLowerCase().includes('abort')) {
                                        setError('Could not share: ' + msg);
                                    }
                                } finally { setIsSharingPdf(false); }
                            }}
                            className="flex items-center gap-2 px-6 py-3 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white text-sm font-black rounded-xl shadow-xl shadow-green-900/30 transition-all whitespace-nowrap"
                        >
                            {isSharingPdf
                                ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                : <WhatsAppIcon className="w-4 h-4" />}
                            {isSharingPdf ? 'Preparing…' : 'Share Report'}
                        </button>
                    </div>
                    <div ref={previewContainerRef} className="flex-1 overflow-auto p-2 sm:p-6 bg-black/40">
                        {/* Outer wrapper sized to scaled A4 dimensions so scroll area is correct */}
                        <div style={{ width: Math.round(794 * previewScale), minHeight: Math.round(1122 * previewScale), margin: '0 auto' }}>
                            <div className="bg-card overflow-hidden shadow-2xl"
                                style={{ width: '210mm', minHeight: '297mm', transform: `scale(${previewScale})`, transformOrigin: 'top left' }}>
                                {reportStyle === 'modern' ? (
                                    <ModernReportCard report={previewData} orgSettings={branding as any} />
                                ) : reportStyle === 'printable' ? (
                                    <PrintableReport report={previewData} orgSettings={branding as any} />
                                ) : (
                                    <ReportCard report={previewData} orgSettings={branding as any} />
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <div style={{ position: 'fixed', left: -9999, top: 0, width: '210mm', pointerEvents: 'none', zIndex: -1 }}>
                <div ref={pdfRef}>
                    {reportStyle === 'modern' ? (
                        <ModernReportCard report={previewData} orgSettings={branding as any} />
                    ) : reportStyle === 'printable' ? (
                        <PrintableReport report={previewData} orgSettings={branding as any} />
                    ) : (
                        <ReportCard report={previewData} orgSettings={branding as any} />
                    )}
                </div>
            </div>
        </div >
    );
}
