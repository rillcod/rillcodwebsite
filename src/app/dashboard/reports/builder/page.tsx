// @refresh reset
'use client';

import { useState, useEffect, useRef, Suspense, useDeferredValue } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import { Database } from '@/types/supabase';
import ReportCard from '@/components/reports/ReportCard';
import ModernReportCard from '@/components/reports/ModernReportCard';
import PrintableReport from '@/components/reports/PrintableReport';
import { generateReportPDF, ScaledReportCard, shareReportCard, printElement } from '@/lib/pdf-utils';
import {
  coverageSessionOrFilter,
  isStaleAcademicSession,
  liveAcademicSession,
  ACADEMIC_TERM_OPTIONS,
  getCurrentTermLabel,
  getCurrentAcademicYear,
  academicYearOptions,
} from '@/lib/reports/academic-period';
import { fetchAcademicTerms } from '@/lib/reports/academic-terms';
import { SINGLE_GRADES } from '@/lib/classes/naming';
import {
    ArrowLeftIcon, CheckIcon, ArrowPathIcon, ExclamationTriangleIcon,
    UserGroupIcon, DocumentTextIcon, EyeIcon, XMarkIcon,
    Cog6ToothIcon, ArrowUpTrayIcon, ChevronDownIcon, ChevronUpIcon,
    PhotoIcon, RocketLaunchIcon, CloudArrowUpIcon, ChevronRightIcon,
    CheckCircleIcon, PrinterIcon, SparklesIcon, PlusIcon, MagnifyingGlassIcon,
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
import { computeWeightedScore, getActivityCap, getWAECGrade } from '@/lib/grading';
import { fetchJsonWithTimeout, withTimeout } from '@/lib/async-timeout';
import { BuilderField as Field, BuilderSection as Section, EvidenceEditorPanel, NarrativeEditorPanel, EvidenceStatusBanner, PublishControls } from '@/components/reports/builder/workflow-panels';

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
    class_id?: string;
    term_id?: string;
    // School structure & optional payment info
    school_section: string;   // '' | 'basic' | 'secondary' | 'bootcamp' | 'online'
    fee_label: string;        // e.g. 'Coding Club Fee', 'Extra-Curricular Fee'
    fee_amount: string;       // optional numeric string, leave blank to omit
    show_payment_notice: boolean; // prints next-term Rillcod payment details on report
}

// ── Constants ─────────────────────────────────────────────────────────────────

const GRADE_OPTIONS = ['Excellent', 'Very Good', 'Good', 'Fair', 'Poor', 'Not Specified'];

// ── WAEC 6-component weights ──────────────────────────────────────────────────

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
// Term dropdown — calendar-ordered (First → Second → Third …), shared with the
// results switcher so ordering is consistent everywhere. (See @/lib/reports/academic-period.)
const TERM_OPTIONS = ACADEMIC_TERM_OPTIONS;

// Report contexts that follow the Nigerian school calendar (Term + Academic Year).
// Online / bootcamp are cohort-based and use Duration instead.
const SCHOOL_SECTIONS = ['basic', 'secondary', 'unified', 'school'];
const isSchoolSection = (s: string | null | undefined) => SCHOOL_SECTIONS.includes(s ?? '');

const PROFICIENCY_OPTIONS = ['beginner', 'intermediate', 'advanced'];
// Duration is for cohort-based reports (online / bootcamp); school terms live in the
// Term selector instead, so they're no longer mixed in here. An existing out-of-list
// value is preserved by the selects below.
const DURATION_OPTIONS = ['4 weeks', '6 weeks', '8 weeks', '10 weeks', '12 weeks', '3 months', '6 months', 'Full Year'];
// Academic-year choices for the Reporting Period selector — generated from today so
// they never go stale (replaces a hardcoded preset list).
const ACADEMIC_YEAR_OPTIONS = academicYearOptions();

const FINAL_CBT_STATUSES = new Set(['completed', 'passed', 'failed', 'pending_grading']);
const examMeta = (row: any) => row?.cbt_exams?.metadata && typeof row.cbt_exams.metadata === 'object' ? row.cbt_exams.metadata : {};
const examTypeOf = (row: any) => String(examMeta(row).exam_type ?? 'examination').toLowerCase();
const isScoreReadyCbt = (row: any) => row?.score != null && FINAL_CBT_STATUSES.has(String(row?.status ?? '').toLowerCase());
const cbtScopeRank = (row: any, courseId?: string | null, programId?: string | null) => {
    const exam = row?.cbt_exams;
    if (!exam) return !courseId && !programId ? 1 : 0;
    if (courseId && exam.course_id === courseId) return 3;
    if (programId && exam.program_id === programId) return 2;
    if (!exam.course_id && !exam.program_id) return 1;
    if (!courseId && !programId) return 1;
    return 0;
};
const matchesReportExamScope = (row: any, courseId?: string | null, programId?: string | null) => cbtScopeRank(row, courseId, programId) > 0;
const topCbtScore = (rows: any[], kind: 'examination' | 'evaluation', courseId?: string | null, programId?: string | null) => Math.min(100, rows
    .filter(isScoreReadyCbt)
    .filter((row) => kind === 'evaluation' ? examTypeOf(row) === 'evaluation' : examTypeOf(row) !== 'evaluation')
    .filter((row) => matchesReportExamScope(row, courseId, programId))
    .sort((a, b) =>
        cbtScopeRank(b, courseId, programId) - cbtScopeRank(a, courseId, programId)
        || Number(b.score ?? 0) - Number(a.score ?? 0)
        || new Date(b.end_time ?? 0).getTime() - new Date(a.end_time ?? 0).getTime()
    )[0]?.score ?? 0);
const assignmentPctOf = (row: any) => {
    const grade = Number(row?.grade ?? 0);
    const max = Number(row?.assignments?.max_points ?? 100) || 100;
    return Math.max(0, Math.min(100, Math.round((grade / max) * 100)));
};

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

// ── Shared reporting-period selectors ──────────────────────────────────────────
// Term + Academic Year for school sections; Duration for cohort (online/bootcamp).
// Extracted so the (previously 2×) term/year and (4×) duration selects live in ONE
// place — every selector stays calendar-ordered and preserves an out-of-list value.
const PROMINENT_INPUT = INPUT + ' !text-base !font-bold !py-3';

function TermYearFields({ term, period, set, prominent = false }: {
    term: string;
    period: string;
    set: React.Dispatch<React.SetStateAction<SessionConfig>>;
    prominent?: boolean;
}) {
    const cls = prominent ? PROMINENT_INPUT : INPUT;
    const star = prominent ? ' *' : '';
    return (
        <>
            <Field label={`Term${star}`}>
                <select value={term} onChange={e => set(s => ({ ...s, report_term: e.target.value }))} className={cls}>
                    {TERM_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
            </Field>
            <Field label={`Academic Year${star}`}>
                <select value={period} onChange={e => set(s => ({ ...s, report_period: e.target.value }))} className={cls}>
                    {period && !ACADEMIC_YEAR_OPTIONS.includes(period) && <option value={period}>{period}</option>}
                    {ACADEMIC_YEAR_OPTIONS.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
            </Field>
        </>
    );
}

// Single source of truth for the "locked reporting period" UI — used both in step 1
// (editable via unlock) and read-only in the Session Settings bar. Keeps the lock
// visuals + wording in ONE place (DRY) instead of repeating the chip markup.
function ReportingPeriodLock({ term, period, set, unlocked, setUnlocked, readOnly = false }: {
    term: string;
    period: string;
    set: React.Dispatch<React.SetStateAction<SessionConfig>>;
    unlocked: boolean;
    setUnlocked: (v: boolean) => void;
    readOnly?: boolean;
}) {
    if (readOnly || !unlocked) {
        return (
            <div className="flex flex-wrap items-center gap-2 bg-emerald-500/10 border border-emerald-500/25 rounded-xl px-4 py-3">
                <span className="text-emerald-400">🔒</span>
                <p className="text-[11px] text-emerald-300 font-bold">
                    Creating <span className="underline">{term || '—'}</span> reports for <span className="underline">{period || '— set year —'}</span>.
                </p>
                {!readOnly && (
                    <button type="button" onClick={() => setUnlocked(true)}
                        className="ml-auto text-[10px] font-black uppercase tracking-wider text-emerald-400 hover:text-emerald-300 underline underline-offset-2">
                        Change period
                    </button>
                )}
            </div>
        );
    }
    return (
        <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <TermYearFields term={term} period={period} set={set} prominent />
            </div>
            <button type="button" onClick={() => setUnlocked(false)}
                className="text-[10px] font-black uppercase tracking-wider text-primary hover:opacity-80 underline underline-offset-2">
                🔒 Lock to this period
            </button>
        </>
    );
}

function DurationField({ value, set, prominent = false, placeholder = false, alsoSetTerm = false }: {
    value: string;
    set: React.Dispatch<React.SetStateAction<SessionConfig>>;
    prominent?: boolean;
    placeholder?: boolean;
    alsoSetTerm?: boolean;
}) {
    return (
        <Field label={`Duration${prominent ? ' *' : ''}`}>
            <select
                value={value}
                onChange={e => {
                    const next = e.target.value;
                    // Duration must NEVER silently replace academic session identity
                    // (Second/Third/year). Only sync when the value is itself a term label.
                    const syncTerm = alsoSetTerm && (TERM_OPTIONS as readonly string[]).includes(next);
                    set(s => ({
                        ...s,
                        course_duration: next,
                        ...(syncTerm ? { report_term: next } : {}),
                    }));
                }}
                className={prominent ? PROMINENT_INPUT : INPUT}>
                {placeholder && <option value="">— Select cohort duration —</option>}
                {value && !DURATION_OPTIONS.includes(value) && <option value={value}>{value}</option>}
                {DURATION_OPTIONS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
        </Field>
    );
}

// Current + Next Module datalist inputs (auto-fills Next from the suggestion map).
// Was duplicated verbatim in the session bar and the session step form.
function SessionModuleFields({ config, set, idPrefix, suggestions }: {
    config: SessionConfig;
    set: React.Dispatch<React.SetStateAction<SessionConfig>>;
    idPrefix: string;
    suggestions: { modules: string[]; next: string[] };
}) {
    const sugg = suggestions;
    return (
        <>
            <Field label="Current Module">
                <input list={`${idPrefix}-cur`} value={config.current_module}
                    onChange={e => {
                        const val = e.target.value;
                        const idx = sugg.modules.indexOf(val);
                        const autoNext = idx >= 0 ? sugg.next[idx] : '';
                        set(s => ({ ...s, current_module: val, ...(autoNext && !s.next_module ? { next_module: autoNext } : {}) }));
                    }}
                    className={INPUT} placeholder="e.g. Control Statements" />
                <datalist id={`${idPrefix}-cur`}>
                    {sugg.modules.map(m => <option key={m} value={m} />)}
                </datalist>
            </Field>
            <Field label="Next Module">
                <input list={`${idPrefix}-nxt`} value={config.next_module}
                    onChange={e => set(s => ({ ...s, next_module: e.target.value }))}
                    className={INPUT} placeholder="e.g. Loops & Automation" />
                <datalist id={`${idPrefix}-nxt`}>
                    {sugg.next.map(m => <option key={m} value={m} />)}
                </datalist>
            </Field>
        </>
    );
}

// Programme + Course selects (course resets when its programme changes). Was
// duplicated in the session bar and the session step form.
function ProgramCourseFields({ programs, courses, programId, setProgramId, courseId, set, prominent = false, programLocked = false }: {
    programs: { id: string; name: string }[];
    courses: Course[];
    programId: string;
    setProgramId: (v: string) => void;
    courseId: string;
    set: React.Dispatch<React.SetStateAction<SessionConfig>>;
    prominent?: boolean;
    programLocked?: boolean;
}) {
    const star = prominent ? ' *' : '';
    const programmeCourses = courses.filter(c => c.program_id === programId);
    return (
        <>
            <Field label={`Programme${star}`}>
                <select
                    value={programId}
                    disabled={programLocked}
                    onChange={e => {
                        const pid = e.target.value;
                        setProgramId(pid);
                        // Reset course if it no longer belongs to the new programme
                        const currentCourse = courses.find(c => c.id === courseId);
                        if (currentCourse?.program_id !== pid) set(s => ({ ...s, course_id: '', course_name: '' }));
                    }}
                    className={INPUT + (programLocked ? ' opacity-60 bg-muted cursor-not-allowed' : '')}>
                    <option value="">Select a programme…</option>
                    {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
            </Field>
            <Field label={`Course${star}`}>
                <select
                    value={courseId}
                    disabled={!programId || programmeCourses.length === 0}
                    onChange={e => {
                        const cId = e.target.value;
                        const c = courses.find(x => x.id === cId);
                        set(s => {
                            const suggestedMilestones = getMilestoneSuggestions(c?.title || '').slice(0, 2);
                            return {
                                ...s,
                                course_id: cId,
                                course_name: c?.title ?? '',
                                learning_milestones: suggestedMilestones,
                            };
                        });
                    }}
                    className={INPUT + ((!programId || programmeCourses.length === 0) ? ' opacity-60 bg-muted cursor-not-allowed' : '')}>
                    <option value="">{!programId ? '— pick a programme first —' : programmeCourses.length ? 'Select a course…' : 'No courses in this programme'}</option>
                    {programmeCourses.map(c => (
                        <option key={c.id} value={c.id}>
                            {c.title}{c.is_active === false ? ' (Inactive / historical)' : ''}
                        </option>
                    ))}
                </select>
                {programLocked && <p className="mt-1.5 text-[10px] text-muted-foreground">Programme comes from the selected class. Choose the course being graded here.</p>}
            </Field>
        </>
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
    const prefStudentId = searchParams.get('student') || searchParams.get('student_id');
    const prefClassId = searchParams.get('class') || searchParams.get('class_id');
    const prefTermId = searchParams.get('term') || searchParams.get('term_id');

    const { profile, loading: authLoading, profileLoading } = useAuth();

    // ── Permissions ──────────────────────────────────────────────────────────
    const isStaff = profile?.role === 'admin' || profile?.role === 'teacher';
    const isAdmin = profile?.role === 'admin';

    // ── Data ──────────────────────────────────────────────────────────────────
    const [students, setStudents] = useState<PortalUser[]>([]);
    const [courses, setCourses] = useState<Course[]>([]);
    const [programs, setPrograms] = useState<{ id: string; name: string }[]>([]);
    const [schools, setSchools] = useState<{ id: string; name: string }[]>([]);
    const [sessionProgramId, setSessionProgramId] = useState('');
    const [teacherClasses, setTeacherClasses] = useState<Array<{ id: string; name: string; school_id: string | null; term_id: string | null; program_id: string | null; current_course_id: string | null; qa_grade_key?: string | null; academic_terms?: { id: string; academic_year: string; term_label: string } | null }>>([]);
    const [search, setSearch] = useState('');
    const [editSearch, setEditSearch] = useState('');
    const [classFilter, setClassFilter] = useState('');
    const [gradeFilter, setGradeFilter] = useState('');
    const [overrideFilters, setOverrideFilters] = useState(false);
    // Report-coverage filter for the picker: who already has a report for THIS period vs who doesn't.
    const [pickReportFilter, setPickReportFilter] = useState<'all' | 'has' | 'none'>('all');
    const [reportedIds, setReportedIds] = useState<Set<string>>(new Set());
    const [draftedIds, setDraftedIds] = useState<Set<string>>(new Set());
    const [resumedSession, setResumedSession] = useState(false);

    // ── Step: 'session' | 'pick' | 'edit' ────────────────────────────────────
    const [step, setStep] = useState<'session' | 'pick' | 'edit'>('session');
    const [sessionDone, setSessionDone] = useState(false); // true once user clicks "Start Grading"

    // ── Session config (shared for all students in this grading session) ──────
    const [sessionConfig, setSessionConfig] = useState<SessionConfig>({
        instructor_name: '',
        report_date: '',
        report_term: getCurrentTermLabel(),
        report_period: getCurrentAcademicYear(),
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
    // Term & Academic Year default (locked) to the current period — matching the Results page lock.
    // Teachers only unlock this when deliberately building for a past/other term.
    const [periodUnlocked, setPeriodUnlocked] = useState(false);
    const [courseConfirmationKey, setCourseConfirmationKey] = useState('');
    const currentCourseConfirmationKey = sessionConfig.course_id
        ? [sessionConfig.school_id || '', sessionConfig.class_id || 'cohort', sessionProgramId, sessionConfig.course_id].join(':')
        : '';
    const courseConfirmed = !!currentCourseConfirmationKey && courseConfirmationKey === currentCourseConfirmationKey;
    // ── Per-student state ─────────────────────────────────────────────────────
    const [selectedStudent, setSelectedStudent] = useState<PortalUser | null>(null);
    const [existingReport, setExistingReport] = useState<StudentReport | null>(null);
    const [currentStudentIdx, setCurrentStudentIdx] = useState(-1);
    // Explicit identity edit — grade (separate from class) + a deliberate "save to profile"
    // so a corrected name/grade sticks system-wide (portal, records, login).
    const [profileGrade, setProfileGrade] = useState('');
    const [savingProfile, setSavingProfile] = useState(false);

    const [form, setForm] = useState({
        student_name: '',
        section_class: '',
        gender: '' as '' | 'male' | 'female',
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
    const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
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
        evalScore: 0,
        assignmentPct: 0,
        projects: 0,
        pendingCbt: 0,
    });
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    // null = no issue | 'published' = already published this term | 'cross-session' = loaded from different course
    // | 'new-term' = no report for the current term yet; a prior-term report exists (a fresh report will be created)
    const [duplicateWarning, setDuplicateWarning] = useState<null | 'published' | 'cross-session' | 'new-term'>(null);
    const [duplicateDetail, setDuplicateDetail] = useState<string>('');

    // Auto-clear success after 4 seconds
    const setSuccessMsg = (msg: string) => {
        setSuccess(msg);
        if (successTimerRef.current) clearTimeout(successTimerRef.current);
        successTimerRef.current = setTimeout(() => setSuccess(''), 4000);
    };
    // Keep the grade editor in sync with whichever student is loaded.
    useEffect(() => { setProfileGrade(((selectedStudent as any)?.grade as string) ?? ''); }, [selectedStudent?.id]);

    // Deliberate save of the child's name + grade to their root profile — sticks system-wide
    // (portal_users source of truth, students shadow, and auth). Distinct from the passive
    // fill-only guard on report save, because this is an explicit teacher action.
    const saveStudentProfile = async () => {
        if (!selectedStudent) return;
        const idStr = String(selectedStudent.id ?? '');
        if (idStr.startsWith('manual-') || idStr.startsWith('students-')) {
            setError('Only portal students can be edited here.');
            return;
        }
        const full_name = form.student_name.trim();
        if (!full_name) { setError('Name cannot be empty.'); return; }
        setSavingProfile(true);
        try {
            const res = await fetch(`/api/portal-users/${selectedStudent.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ full_name, grade: profileGrade || null }),
            });
            const j = await res.json();
            if (!res.ok) throw new Error(j.error ?? 'Failed to update student');
            const savedName = j.data?.full_name ?? full_name;
            const savedGrade = j.data?.grade ?? (profileGrade || null);
            (selectedStudent as any).full_name = savedName;
            (selectedStudent as any).grade = savedGrade;
            setForm(f => ({ ...f, student_name: savedName }));
            setProfileGrade(savedGrade ?? '');
            setStudents(prev => prev.map((s: any) => s.id === selectedStudent.id ? { ...s, full_name: savedName, grade: savedGrade } : s));
            setSuccessMsg('Student name & grade updated everywhere.');
        } catch (e: any) {
            setError(e.message ?? 'Failed to update student');
        } finally {
            setSavingProfile(false);
        }
    };

    const [showPreview, setShowPreview] = useState(false);
    const [hasPreviewedCurrentReport, setHasPreviewedCurrentReport] = useState(false);
    const [livePreviewOpen, setLivePreviewOpen] = useState(false);
    const livePreviewRef = useRef<HTMLDivElement>(null);
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
    const [isSharingPdf, setIsSharingPdf] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [milestoneInput, setMilestoneInput] = useState('');
    const [showMilestoneSuggestions, setShowMilestoneSuggestions] = useState(false);
    const [forceCertificate, setForceCertificate] = useState(false);
    const [isBulkBuilding, setIsBulkBuilding] = useState(false);
    const [showValuesPhraseBank, setShowValuesPhraseBank] = useState(false);
    const [reportStyle, setReportStyle] = useState<'standard'|'modern'|'printable'>('modern');
    const [modernTemplateId, setModernTemplateId] = useState<'industrial'|'executive'|'futuristic'>('industrial');
    const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0 });
    const [previewScale, setPreviewScale] = useState(0.85);
    const previewContainerRef = useRef<HTMLDivElement>(null);
    const pdfRef = useRef<HTMLDivElement>(null);

    // ── Dirty tracking ────────────────────────────────────────────────────────
    const snapForm = useRef<typeof form | null>(null);   // snapshot of form at last student load
    const isHydrating = useRef(false);                   // true while selectStudent is loading form
    const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [isDirty, setIsDirty] = useState(false);
    // Ref mirror of filteredStudents — avoids forward-reference TDZ in keyboard useEffect
    const filteredStudentsRef = useRef<PortalUser[]>([]);

    // ── Per-student module suggestion (derived from student's previous report) ──
    const [suggestedModule, setSuggestedModule] = useState<{ current: string; next: string } | null>(null);

    // ── Refs for restoring session after data load ────────────────────────────
    const pendingRestoreStudentId = useRef<string | null>(null);
    const pendingRestoreStudentIdx = useRef<number>(-1);
    // Frozen nav list — captured when teacher first picks a student in a session;
    // prevents filteredStudents recomputation from breaking Prev/Next navigation.
    const sessionStudents = useRef<PortalUser[]>([]);

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
                    _courseConfirmationKey?: string;
                };
                const { _step, _sessionDone, _selectedStudentId, _currentStudentIdx, _courseConfirmationKey, ...config } = parsed;
                setCourseConfirmationKey(_courseConfirmationKey || '');
                setSessionConfig(s => ({ ...s, ...config }));
                
                // If a specific student was requested via URL, do not restore the stale session state
                if (!prefStudentId) {
                    if (_step && _step !== 'session') {
                        setResumedSession(true);
                        setStep(_step as any);
                        if (_sessionDone) setSessionDone(true);
                    }
                    if (_selectedStudentId) {
                        pendingRestoreStudentId.current = _selectedStudentId;
                        pendingRestoreStudentIdx.current = _currentStudentIdx ?? -1;
                    }
                }
            }
        } catch { /* ignore */ }
        // Default the academic session (Sept–Aug Nigerian calendar) and the current
        // term when none is set, so school reports always carry a session/term and a
        // new year never collides with the previous one's same-named term.
        setSessionConfig(s => {
            const live = liveAcademicSession();
            // Locked period = "follow current". Roll only when saved identity is BEHIND live
            // (Second→Third same year, or prior year). Future / next-year First is untouched.
            const stale = isStaleAcademicSession(s.report_term, s.report_period, live.termLabel, live.periodLabel);
            return {
                ...s,
                report_date: new Date().toISOString().split('T')[0],
                report_period: stale ? live.periodLabel : (s.report_period || live.periodLabel),
                report_term: stale ? live.termLabel : (s.report_term || live.termLabel),
            };
        });
    }, [profile?.id, prefStudentId]);



    const [dynamicSuggestions, setDynamicSuggestions] = useState<{ modules: string[]; next: string[] } | null>(null);

    const getSuggestionsForCourse = () => {
        if (dynamicSuggestions) return dynamicSuggestions;
        return getModuleSuggestions(sessionConfig.course_name);
    };

    // Dynamically fetch and sequence course modules from curricula/lessons
    useEffect(() => {
        const courseId = sessionConfig.course_id;
        if (!courseId) {
            setDynamicSuggestions(null);
            return;
        }
        
        let cancelled = false;
        async function fetchDynamicSuggestions() {
            try {
                const res = await fetch(`/api/curricula?course_id=${courseId}`);
                if (!res.ok) throw new Error('Failed to fetch curricula');
                const json = await res.json();
                if (cancelled) return;
                
                const list = json.data || [];
                const topicsSet = new Set<string>();
                list.forEach((curriculum: any) => {
                    const terms = curriculum.content?.terms || [];
                    terms.forEach((term: any) => {
                        const weeks = term.weeks || [];
                        weeks.forEach((week: any) => {
                            if (week.topic && typeof week.topic === 'string') {
                                topicsSet.add(week.topic.trim());
                            }
                        });
                    });
                });
                
                const uniqueTopics = Array.from(topicsSet);
                if (uniqueTopics.length > 0) {
                    const modules = uniqueTopics;
                    const next = modules.slice(1);
                    next.push('Course Complete');
                    setDynamicSuggestions({ modules, next });
                    return;
                }
            } catch (err) {
                console.error('Failed to fetch dynamic module suggestions:', err);
            }
            
            try {
                const res = await fetch(`/api/lessons?course_id=${courseId}`);
                if (!res.ok) throw new Error('Failed to fetch lessons');
                const json = await res.json();
                if (cancelled) return;
                
                const list = json.data || [];
                const topicsSet = new Set<string>();
                const sortedLessons = list.sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
                sortedLessons.forEach((lesson: any) => {
                    if (lesson.title && typeof lesson.title === 'string') {
                        topicsSet.add(lesson.title.trim());
                    }
                });
                
                const uniqueTopics = Array.from(topicsSet);
                if (uniqueTopics.length > 0) {
                    const modules = uniqueTopics;
                    const next = modules.slice(1);
                    next.push('Course Complete');
                    setDynamicSuggestions({ modules, next });
                    return;
                }
            } catch (err) {
                console.error('Failed to fetch dynamic lesson suggestions:', err);
            }
            
            if (!cancelled) {
                setDynamicSuggestions(null);
            }
        }
        
        fetchDynamicSuggestions();
        return () => { cancelled = true; };
    }, [sessionConfig.course_id]);

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

    // ── Dirty: compare current form to snapshot captured at student load ────────
    useEffect(() => {
        if (isHydrating.current || !snapForm.current) return;
        const dirty = JSON.stringify(form) !== JSON.stringify(snapForm.current);
        setIsDirty(dirty);
        if (dirty) setHasPreviewedCurrentReport(false);
    }, [form]);

    // ── Auto-save after 8 s of inactivity when changes are pending ───────────
    useEffect(() => {
        if (step !== 'edit' || !sessionDone || !isDirty || !selectedStudent || saving || publishing) return;
        if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
        autoSaveTimer.current = setTimeout(() => { void handleSave(false); }, 8000);
        return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current); };
    }, [form, isDirty, step, sessionDone, selectedStudent?.id, saving, publishing]); // eslint-disable-line

    // ── Keyboard navigation: ← / → when no input is focused ─────────────────
    useEffect(() => {
        if (step !== 'edit' || !selectedStudent) return;
        const handler = (e: KeyboardEvent) => {
            const tag = (e.target as HTMLElement).tagName;
            if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return;
            if (showPreview || showSettings) return;
            const navList = sessionStudents.current.length > 0 ? sessionStudents.current : filteredStudentsRef.current;
            if (e.key === 'ArrowRight' && currentStudentIdx < navList.length - 1) {
                e.preventDefault();
                (async () => {
                    if (isDirty) await handleSave(false);
                    await selectStudent(navList[currentStudentIdx + 1] as PortalUser, currentStudentIdx + 1);
                })();
            }
            if (e.key === 'ArrowLeft' && currentStudentIdx > 0) {
                e.preventDefault();
                (async () => {
                    if (isDirty) await handleSave(false);
                    await selectStudent(navList[currentStudentIdx - 1] as PortalUser, currentStudentIdx - 1);
                })();
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [step, selectedStudent, currentStudentIdx, isDirty, showPreview, showSettings]); // eslint-disable-line

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
                _courseConfirmationKey: courseConfirmationKey,
            }));
        } catch { /* ignore */ }
    }, [sessionConfig, step, sessionDone, selectedStudent?.id, currentStudentIdx, courseConfirmationKey, profile?.id]);

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
            const isTeacher = profile?.role === 'teacher';
            const [
                schJson,
                portalJson,
                progJson,
                coursesJson,
                classesJson,
                brandingRes,
            ] = await Promise.all([
                fetchJsonWithTimeout('/api/schools', { data: [] }, 'schools'),
                fetchJsonWithTimeout('/api/portal-users?role=student&scoped=true&limit=1000', { data: [] }, 'portal students'),
                fetchJsonWithTimeout('/api/programs?is_active=true', { data: [] }, 'programs'),
                // Staff report entry must also support historical/inactive courses.
                // Restricting this lookup to published courses made a class's saved
                // course disappear and left the selector disabled.
                fetchJsonWithTimeout('/api/courses?limit=1000', { data: [] }, 'courses'),
                fetchJsonWithTimeout(isTeacher ? '/api/classes?mine=true' : '/api/classes', { data: [] }, 'classes'),
                withTimeout(db.from('report_settings').select('*').limit(1).maybeSingle(), { data: null, error: null }, 'report settings'),
            ]);
            const schoolsList = (schJson.data ?? []).map((s: any) => ({ id: s.id, name: s.name }));
            const brandingData = brandingRes.data;

            // Grade source: portal_users.grade is now the canonical specific grade. Fall back to
            // the students shadow (grade_level) only for the rare account with no grade yet.
            const portalIds = (portalJson.data ?? []).map((u: any) => u.id).filter(Boolean) as string[];
            const needShadow = (portalJson.data ?? []).some((u: any) => !u.grade);
            const { data: gradeRowsBR } = needShadow && portalIds.length > 0
                ? await withTimeout(
                    db.from('students').select('user_id, grade_level').in('user_id', portalIds),
                    { data: [], error: null },
                    'student grade lookup',
                )
                : { data: [] };
            const gradeByUserId: Record<string, string | null> = {};
            (gradeRowsBR ?? []).forEach((r: any) => { if (r.user_id) gradeByUserId[r.user_id] = r.grade_level ?? null; });

            // Normalize portal_users results — prefer the canonical grade.
            const portalStudents = (portalJson.data ?? []).map((u: any) => ({
                ...u,
                section_class: u.section_class || '',
                class_id: u.class_id || null,
                grade_level: u.grade ?? gradeByUserId[u.id] ?? null,
                _source: 'portal',
            }));

            // Reports require a real portal user foreign key. Unlinked rows from
            // `students` are intentionally excluded until they have portal accounts.
            const processed = [...portalStudents];
            setStudents(processed as any);
            const loadedCourses = coursesJson.data ?? [];
            setCourses(loadedCourses);
            setPrograms(progJson.data ?? []);
            setSchools(schoolsList);
            setTeacherClasses(classesJson.data ?? []);
            
            // Do not silently choose the first course in the catalogue. A class
            // selection below supplies its programme/course focus; standalone
            // reports require an explicit choice from the teacher.
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

                // URL ?student= takes absolute priority over localStorage navigation state.
                // When the user clicks Edit on a published report, we must load that
                // specific student — not whatever was left over from a previous session.
                if (prefStudentId) {
                    pendingRestoreStudentId.current = null;
                    const s = processed.find((x: any) => x.id === prefStudentId || x._original_id === prefStudentId);
                    if (s) {
                        setTimeout(() => {
                            void selectStudent(s as PortalUser, 0, { forceHydrate: true });
                            setStep('edit');
                            setSessionDone(true);
                            setSessionExpanded(false);
                        }, 0);
                    }
                    return;
                }
                // Restore pending student (from localStorage navigation state)
                const restoreId = pendingRestoreStudentId.current;
                if (restoreId) {
                    pendingRestoreStudentId.current = null;
                    const s = processed.find((x: any) => x.id === restoreId || x._original_id === restoreId);
                    if (s) {
                        setTimeout(() => { void selectStudent(s as PortalUser, pendingRestoreStudentIdx.current); }, 0);
                        return;
                    }
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

    // Published reports for THIS term only — matches roster "✓ Report" (drafts stay "needs").
    useEffect(() => {
        const ids = students.map(s => s.id).filter(Boolean) as string[];
        if (ids.length === 0) { setReportedIds(new Set()); setDraftedIds(new Set()); return; }
        let cancelled = false;
        const db = createClient();
        const termId = sessionConfig.term_id || '';
        const term = sessionConfig.report_term || '';
        const period = sessionConfig.report_period || '';
        (async () => {
            const rows: { student_id: string | null; is_published: boolean | null }[] = [];
            for (let i = 0; i < ids.length; i += 300) {
                const batch = ids.slice(i, i + 300);
                let q = db.from('student_progress_reports')
                    .select('student_id, is_published')
                    .in('student_id', batch);
                if (termId && term && period) {
                    const orFilter = coverageSessionOrFilter({ termId, termLabel: term, periodLabel: period });
                    if (orFilter) q = q.or(orFilter) as typeof q;
                } else if (termId) {
                    q = q.eq('term_id', termId) as typeof q;
                } else {
                    // Always scope by BOTH labels so years never collide.
                    if (term) q = q.eq('report_term', term) as typeof q;
                    if (period) q = q.eq('report_period', period) as typeof q;
                }
                const { data } = await withTimeout(q, { data: [], error: null }, 'report coverage');
                rows.push(...((data ?? []) as any));
            }
            if (cancelled) return;
            const published = new Set(rows.filter(r => r.is_published === true).map(r => r.student_id).filter(Boolean) as string[]);
            const drafts = new Set(rows.filter(r => r.is_published !== true && !published.has(r.student_id || '')).map(r => r.student_id).filter(Boolean) as string[]);
            setReportedIds(published);
            setDraftedIds(drafts);
        })();
        return () => { cancelled = true; };
    }, [students, sessionConfig.term_id, sessionConfig.report_term, sessionConfig.report_period]); // eslint-disable-line

    const filteredStudents = students.filter(s => {
        const matchesReport = pickReportFilter === 'all' ? true
            : pickReportFilter === 'has' ? reportedIds.has(s.id)
            : !reportedIds.has(s.id);
        if (!matchesReport) return false;
        const matchesSearch = !search || s.full_name?.toLowerCase().includes(search.toLowerCase()) || s.email?.toLowerCase().includes(search.toLowerCase());

        // Override mode or active search: show all loaded students, just filter by name/email
        if (overrideFilters || search.length >= 2) return matchesSearch;

        // School filter: use school_id match OR school_name match (handles legacy records)
        const matchesSchool = !sessionConfig.school_name
            || s.school_name === sessionConfig.school_name
            || (!!sessionConfig.school_id && s.school_id === sessionConfig.school_id);

        // Class filter: match by section_class string OR by class_id for teacher-created classes
        const activeClass = teacherClasses.find(c => c.id === sessionConfig.class_id) || teacherClasses.find(c => c.name === classFilter);
        const matchesClass = !classFilter
            || (s as any).section_class === classFilter
            || (activeClass && (s as any).class_id === activeClass.id);

        // Grade filter: match by grade_level from students shadow table
        const matchesGrade = !gradeFilter || ((s as any).grade_level ?? '') === gradeFilter;

        return matchesSearch && matchesSchool && matchesClass && matchesGrade;
    });
    filteredStudentsRef.current = filteredStudents;

    const activeSessionClass = teacherClasses.find(c => c.id === sessionConfig.class_id);
    const classRoster = students.filter((student: any) => {
        if (!activeSessionClass) return false;
        return student.class_id === activeSessionClass.id
            || (student.section_class === activeSessionClass.name
                && (!activeSessionClass.school_id || student.school_id === activeSessionClass.school_id));
    });
    const classPublishedCount = classRoster.filter(student => reportedIds.has(student.id)).length;
    const classDraftCount = classRoster.filter(student => draftedIds.has(student.id)).length;
    const classRemainingCount = Math.max(0, classRoster.length - classPublishedCount - classDraftCount);

    const schoolScoped = (s: any) => !sessionConfig.school_name
        || s.school_name === sessionConfig.school_name
        || (!!sessionConfig.school_id && s.school_id === sessionConfig.school_id);

    const distinctClasses = [...new Set([
        // Classes from student records (section_class field)
        ...students.filter(schoolScoped).map(s => (s as any).section_class).filter(Boolean),
        // Teacher-created classes (from classes table)
        ...teacherClasses.filter((c) => !sessionConfig.school_id || c.school_id === sessionConfig.school_id).map(c => c.name),
    ])].sort() as string[];

    function selectReportSection(classId: string) {
        const matchingClass = teacherClasses.find((candidate) => candidate.id === classId);
        if (!matchingClass) {
            setSessionConfig((current) => ({ ...current, class_id: '', term_id: '', section_class: '' }));
            return;
        }
        const matchingSchool = matchingClass.school_id ? schools.find((school) => school.id === matchingClass.school_id) : null;
        const term = matchingClass.academic_terms;
        let linkedCourse = courses.find((course) => course.id === matchingClass.current_course_id);
        const programId = matchingClass.program_id || linkedCourse?.program_id || '';
        if (!linkedCourse && programId) {
            linkedCourse = courses.find((course) => course.program_id === programId);
        }
        setSessionProgramId(programId);
        const courseName = linkedCourse?.title || '';
        const suggestedMilestones = getMilestoneSuggestions(courseName).slice(0, 2);
        setGradeFilter(matchingClass.qa_grade_key || '');
        setClassFilter(matchingClass.name);
        // Reporting period is independent of the class's stored term_id. Selecting a
        // section must NOT snap the teacher back to an old class term — that blocked
        // new-term grading after unlock / calendar rollover.
        setSessionConfig((current) => {
            const keepPeriod = periodUnlocked
                || (!!current.report_term && !!current.report_period);
            const report_term = keepPeriod
                ? current.report_term
                : (term?.term_label || current.report_term);
            const report_period = keepPeriod
                ? current.report_period
                : (term?.academic_year || current.report_period);
            const sameAsClassTerm = !!matchingClass.term_id
                && report_term === (term?.term_label || '')
                && report_period === (term?.academic_year || '');
            return {
                ...current,
                class_id: matchingClass.id,
                // Never attach a class term_id that belongs to a different session identity.
                // Labels drive identity; the sync effect resolves the matching term_id.
                term_id: sameAsClassTerm
                    ? (matchingClass.term_id || term?.id || current.term_id || '')
                    : (current.term_id || ''),
                section_class: matchingClass.name,
                school_id: matchingClass.school_id || current.school_id,
                school_name: matchingSchool?.name || current.school_name,
                report_term,
                report_period,
                course_id: linkedCourse?.id || '',
                course_name: linkedCourse?.title || '',
                learning_milestones: suggestedMilestones,
            };
        });
    }
    const appliedUrlScope = useRef(false);
    useEffect(() => {
        if (appliedUrlScope.current || !prefClassId || teacherClasses.length === 0) return;
        const linkedClass = teacherClasses.find((candidate) => candidate.id === prefClassId);
        if (!linkedClass) {
            setError('The requested section is not registered or is outside your teaching scope.');
            return;
        }
        appliedUrlScope.current = true;
        let cancelled = false;
        void (async () => {
            // Prefer URL term over the class row's stored term_id (often stale after rollover).
            if (prefTermId) {
                try {
                    const terms = await fetchAcademicTerms();
                    const wanted = terms.find((t) => t.id === prefTermId);
                    if (wanted && !cancelled) {
                        setPeriodUnlocked(true);
                        setSessionConfig((s) => ({
                            ...s,
                            term_id: wanted.id,
                            report_term: wanted.term_label,
                            report_period: wanted.academic_year,
                        }));
                    }
                } catch { /* ignore */ }
            }
            if (!cancelled) selectReportSection(linkedClass.id);
        })();
        return () => { cancelled = true; };
    }, [prefClassId, prefTermId, teacherClasses]); // eslint-disable-line react-hooks/exhaustive-deps

    // Sync course selection when courses load or class is selected
    useEffect(() => {
        if (!sessionConfig.class_id || sessionConfig.course_id || courses.length === 0 || teacherClasses.length === 0) return;
        
        const matchingClass = teacherClasses.find(c => c.id === sessionConfig.class_id);
        if (!matchingClass) return;
        
        let linkedCourse = courses.find(course => course.id === matchingClass.current_course_id);
        const programId = matchingClass.program_id || linkedCourse?.program_id || '';
        
        // Fallback: if no current_course_id matches, auto-select the first course in that program
        if (!linkedCourse && programId) {
            linkedCourse = courses.find(course => course.program_id === programId);
        }
        
        if (linkedCourse) {
            const courseName = linkedCourse.title || '';
            const suggestedMilestones = getMilestoneSuggestions(courseName).slice(0, 2);
            
            setSessionProgramId(programId);
            setSessionConfig(current => ({
                ...current,
                course_id: linkedCourse.id,
                course_name: linkedCourse.title || '',
                learning_milestones: current.learning_milestones.length === 0 ? suggestedMilestones : current.learning_milestones,
            }));
        }
    }, [courses, teacherClasses, sessionConfig.class_id, sessionConfig.course_id]);

    // Keep sessionConfig.term_id in sync with the chosen report_term + academic year so
    // coverage filters and "Start Grading" don't stay pinned to an old class term_id.
    useEffect(() => {
        const termLabel = sessionConfig.report_term?.trim();
        const yearLabel = sessionConfig.report_period?.trim();
        if (!termLabel || !yearLabel) return;
        let cancelled = false;
        void (async () => {
            try {
                const terms = await fetchAcademicTerms();
                if (cancelled) return;
                const match = terms.find((t) => t.term_label === termLabel && t.academic_year === yearLabel);
                if (match?.id && match.id !== sessionConfig.term_id) {
                    setSessionConfig((s) => (s.term_id === match.id ? s : { ...s, term_id: match.id }));
                }
            } catch { /* ignore */ }
        })();
        return () => { cancelled = true; };
    }, [sessionConfig.report_term, sessionConfig.report_period]); // eslint-disable-line react-hooks/exhaustive-deps

    const distinctGrades = [...new Set(
        students.filter(schoolScoped).map(s => (s as any).grade_level).filter(Boolean)
    )].sort() as string[];

    // ── Select student: load existing report, fill form ───────────────────────
    async function selectStudent(s: PortalUser, idx: number, opts?: { forceHydrate?: boolean }) {
        setSelectedStudent(s);
        setCurrentStudentIdx(idx);
        setError(''); setSuccess('');
        setSuggestedModule(null);
        setDuplicateWarning(null);
        setDuplicateDetail('');
        setHasPreviewedCurrentReport(false);

        // Manual entry: skip DB lookup, go straight to empty form
        const isManual = s.id?.startsWith('manual-');
        if (isManual) {
            setExistingReport(null);
            isHydrating.current = true;
            setForm(f => ({ ...f, student_name: s.full_name ?? '', section_class: sessionConfig.section_class }));
            snapForm.current = null; // manual entries have no reference snapshot
            setIsDirty(false);
            setTimeout(() => { isHydrating.current = false; }, 100);
            setStep('edit');
            setSessionExpanded(false);
            return;
        }

        const db = createClient();

        // Pre-portal student (from students table, no portal_users record) — look up by name
        const isPrePortal = s.id?.startsWith('students-');
        // Look up by student — do NOT filter by teacher_id. Server dedup is teacher-
        // independent; hiding another teacher's report made class handoffs look stuck
        // and blocked new-term grading with a silent/empty form + 409 on save.
        const baseSelect = () => {
            const q = isPrePortal
                ? db.from('student_progress_reports').select('*').eq('student_name', s.full_name ?? '')
                : db.from('student_progress_reports').select('*').eq('student_id', s.id);
            return q;
        };

        // Most-recent report of ANY term — drives Edit-link hydration, the
        // module-advance suggestion, and the cross-session hint.
        const { data: latestReport } = await withTimeout(
            baseSelect().order('updated_at', { ascending: false }).limit(1).maybeSingle(),
            { data: null, error: null },
            'latest report lookup',
        );

        // The report THIS grading session edits/creates — scoped to the current
        // term + academic year (school) / duration (online·bootcamp) + course, so a
        // new term/session/cohort NEVER overwrites a prior report. School reports
        // separate by Term + Academic Year; online/bootcamp carry their duration in
        // report_term and leave academic year blank, so we constrain only on the
        // discriminators actually present for this format.
        let scoped = baseSelect();
        if (sessionConfig.report_term)   scoped = scoped.eq('report_term', sessionConfig.report_term) as typeof scoped;
        if (sessionConfig.report_period) scoped = scoped.eq('report_period', sessionConfig.report_period) as typeof scoped;
        if (sessionConfig.course_id)     scoped = scoped.eq('course_id', sessionConfig.course_id) as typeof scoped;
        const { data: scopedReport } = await withTimeout(
            scoped.order('updated_at', { ascending: false }).limit(1).maybeSingle(),
            { data: null, error: null },
            'scoped report lookup',
        );

        // Edit link → edit the latest report (adopt its term/year); normal grading
        // session → the report for the current term/year/course (or none → insert).
        const report = opts?.forceHydrate ? latestReport : scopedReport;
        setExistingReport(report ?? null);

        // ── Duplicate / cross-session detection ──────────────────────────────────
        // Skip when forceHydrate: we're explicitly editing this report.
        if (!opts?.forceHydrate) {
            const curTerm = sessionConfig.report_term;
            const curPeriod = sessionConfig.report_period ?? '';
            if (report?.is_published) {
                // A published report already exists for this exact term/year/course.
                setDuplicateWarning('published');
                setDuplicateDetail(`${report.course_name ?? 'this course'} — ${report.report_term}${report.report_period ? ` (${report.report_period})` : ''}`);
            } else if (!report && latestReport && sessionConfig.course_id && latestReport.course_id && latestReport.course_id !== sessionConfig.course_id) {
                // Their most recent report is for a different course (carry-over hint).
                setDuplicateWarning('cross-session');
                setDuplicateDetail(`${latestReport.course_name ?? '?'} (${latestReport.report_term ?? '?'})`);
            } else if (!report && latestReport && (latestReport.report_term !== curTerm || (latestReport.report_period ?? '') !== curPeriod)) {
                // No report for the CURRENT term yet, but a prior-term report exists — a
                // brand-new report will be created for this term (the old one is kept).
                setDuplicateWarning('new-term');
                setDuplicateDetail(`${latestReport.report_term ?? '?'}${latestReport.report_period ? ` · ${latestReport.report_period}` : ''}`);
            }
        }

        // ── Smart module suggestion: look for a PREVIOUS report to advance from ──
        // If the student has a previous report and its next_module != the current session
        // module, show an "advance to next module?" hint for this individual student.
        if (!isPrePortal && s.id) {
            const { data: prevReport } = await withTimeout(
                db
                    .from('student_progress_reports')
                    .select('current_module, next_module')
                    .eq('student_id', s.id)
                    .order('updated_at', { ascending: false })
                    .range(1, 1)          // second-most-recent report
                    .maybeSingle(),
                { data: null, error: null },
                'previous report lookup',
            );
            if (!prevReport && latestReport?.next_module) {
                // Only one report found — suggest advancing from its next_module
                const sugg = getModuleSuggestions(latestReport.course_name ?? '');
                const nextIdx = sugg.modules.indexOf(latestReport.next_module);
                const autoNext = nextIdx >= 0 && nextIdx + 1 < sugg.next.length
                    ? sugg.next[nextIdx + 1]
                    : sugg.next[sugg.modules.indexOf(latestReport.next_module)] ?? '';
                if (latestReport.next_module && latestReport.next_module !== latestReport.current_module) {
                    setSuggestedModule({ current: latestReport.next_module, next: autoNext });
                }
            } else if (prevReport?.next_module) {
                const sugg = getModuleSuggestions(latestReport?.course_name ?? '');
                const nextIdx = sugg.modules.indexOf(prevReport.next_module);
                const autoNext = nextIdx >= 0 ? sugg.next[nextIdx] ?? '' : '';
                setSuggestedModule({ current: prevReport.next_module, next: autoNext });
            }
        }

        // Hydrate sessionConfig from the existing report — ONLY when no session is active
        // yet (sessionDone=false), OR when forceHydrate is set (e.g. landing via Edit link).
        // During normal session navigation we must NOT overwrite the session-level school/
        // class/course selection as it would break the student list mid-navigation.
        if (report && (!sessionDone || opts?.forceHydrate)) {
            // Hydrate sessionProgramId from the report's course
            if (report.course_id) {
                const reportCourse = courses.find(c => c.id === report.course_id);
                if (reportCourse?.program_id) setSessionProgramId(reportCourse.program_id);
            }
            setSessionConfig(prev => {
                // Editing a prior-term draft must not yank the live session back to e.g.
                // Second Term once the calendar is on Third — that made filled reports
                // invisible to "needs report" coverage (which is always current term).
                const live = liveAcademicSession();
                const adoptedTerm = opts?.forceHydrate ? (report.report_term ?? prev.report_term) : prev.report_term;
                const adoptedPeriod = report.report_period ?? prev.report_period;
                // Never yank the live session to a prior identity (Second while live is Third).
                // Also never yank forward into a different year — sessions stay isolated.
                const staleAdopt = isStaleAcademicSession(adoptedTerm, adoptedPeriod, live.termLabel, live.periodLabel);
                return {
                instructor_name: report.instructor_name ?? prev.instructor_name,
                report_date: report.report_date ?? prev.report_date,
                report_term: staleAdopt ? live.termLabel : adoptedTerm,
                report_period: staleAdopt ? live.periodLabel : adoptedPeriod,
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
            };
            });
        }

        // Freeze the navigation list the first time a student is selected in an active
        // session so that Prev/Next always walks the same ordered set.
        if (sessionDone && sessionStudents.current.length === 0) {
            sessionStudents.current = [...filteredStudents];
        }

        const existingMetrics = (report as any)?.engagement_metrics ?? {};
        // Capture DB values as stable local variables so the async auto-suggest
        // closure below can check them reliably, regardless of React state batching.
        const savedClasswork  = Number(existingMetrics.classwork_score  ?? 0);
        const savedAssessment = Number(existingMetrics.assessment_score ?? 0);
        const savedTheory        = Number(report?.theory_score        ?? 0);
        const savedPractical     = Number(report?.practical_score     ?? 0);
        const savedAttendance    = Number(report?.attendance_score    ?? 0);
        const savedParticipation = Number(report?.participation_score ?? 0);
        const loadedFormValues = {
            student_name: s.full_name ?? '',
            section_class: report?.section_class ?? (s as any).section_class ?? '',
            gender: ((report as any)?.gender ?? (s as any).gender ?? '') as '' | 'male' | 'female',
            theory_score:        String(savedTheory),
            classwork_score:     String(savedClasswork),
            practical_score:     String(savedPractical),
            attendance_score:    String(savedAttendance),
            participation_score: String(savedParticipation),
            assessment_score:    String(savedAssessment),
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
        };
        isHydrating.current = true;
        setForm(loadedFormValues);
        snapForm.current = JSON.parse(JSON.stringify(loadedFormValues));
        setIsDirty(false);
        setTimeout(() => { isHydrating.current = false; }, 100);
        setStep('edit');
        setSessionExpanded(false);

        // ── Fetch transparent stats for all 4 score categories ───────────────
        setFetchingStats(true);
        try {
            // 1. Resolve class ID for attendance lookup
            const studentSchoolId = s.school_id;
            const studentClassName = (s as any).section_class;
            let targetClassId = (s as any).class_id || sessionConfig.class_id || null;
            // Prefer the session reporting term (unlocked new term), not the class row's stale term_id.
            let targetTermId: string | null = sessionConfig.term_id || null;
            if (!targetClassId && studentClassName) {
                const { data: clsData } = await withTimeout(
                    db.from('classes')
                        .select('id, term_id').eq('name', studentClassName).eq('school_id', studentSchoolId || '').maybeSingle(),
                    { data: null, error: null },
                    'class lookup for stats',
                );
                targetClassId = clsData?.id;
                if (!targetTermId) targetTermId = (clsData as any)?.term_id ?? null;
            } else if (targetClassId && !targetTermId) {
                const { data: clsData } = await withTimeout(
                    db.from('classes').select('term_id').eq('id', targetClassId).maybeSingle(),
                    { data: null, error: null },
                    'class term lookup for stats',
                );
                targetTermId = (clsData as any)?.term_id ?? null;
            }

            let sessionQuery = targetClassId
                ? db.from('class_sessions').select('id').eq('class_id', targetClassId).eq('is_active', true)
                : null;
            if (sessionQuery && targetTermId) sessionQuery = sessionQuery.eq('term_id', targetTermId);
            const { data: sessions } = sessionQuery
                ? await withTimeout(sessionQuery, { data: [], error: null }, 'class sessions for stats')
                : { data: [] };
            const sessionIds = sessions?.map((x: any) => x.id) || [];
            const selectedCourse = sessionConfig.course_id ? courses.find((c: any) => c.id === sessionConfig.course_id) : null;
            const statsProgramId = (selectedCourse as any)?.program_id || sessionProgramId || null;
            const submissionsQuery = sessionConfig.course_id
                ? db.from('assignment_submissions')
                    .select('id, grade, status, assignments!inner(course_id, max_points, term_id)')
                    .eq('portal_user_id', s.id)
                    .eq('status', 'graded')
                    .eq('assignments.course_id', sessionConfig.course_id)
                : db.from('assignment_submissions')
                    .select('id, grade, status, assignments(max_points, term_id)')
                    .eq('portal_user_id', s.id)
                    .eq('status', 'graded');

            // 2. Fetch all 4 data sources in parallel
            const [attRes, subResRaw, allAssignmentsRaw, cbtAllRes, labRes, portfolioRes] = await withTimeout(Promise.all([
                // Attendance (for reference)
                sessionIds.length > 0
                    ? (() => {
                        let q = db.from('attendance').select('id').eq('user_id', s.id).in('session_id', sessionIds).eq('status', 'present');
                        if (targetTermId) q = q.eq('term_id', targetTermId);
                        return q;
                    })()
                    : { data: [] },
                // Assignment submissions — graded (feeds Assignment + Evaluation)
                submissionsQuery,
                // Total active assignments for this course (Assignment denominator)
                sessionConfig.course_id
                    ? (() => {
                        let q = db.from('assignments').select('id, term_id').eq('course_id', sessionConfig.course_id).eq('is_active', true);
                        if (targetTermId) q = q.or(`term_id.eq.${targetTermId},term_id.is.null`) as any;
                        return q;
                      })()
                    : { data: [] },
                // All CBT sessions with exam metadata for type splitting
                db.from('cbt_sessions').select('score, status, needs_grading, end_time, cbt_exams(title, course_id, program_id, metadata, term_id)').eq('user_id', s.id).order('score', { ascending: false }),
                // Lab projects (feeds Project Engagement)
                db.from('lab_projects').select('id').eq('user_id', s.id),
                // Portfolio projects (feeds Project Engagement)
                db.from('portfolio_projects').select('id').eq('user_id', s.id),
            ]), [{ data: [] }, { data: [] }, { data: [] }, { data: [] }, { data: [] }, { data: [] }], 'student stats sources');

            const { filterByAssignmentSession } = await import('@/lib/assignments/session');
            const { loadAcademicTermBounds, filterCbtByAcademicTerm } = await import('@/lib/cbt/session');
            const termBounds = await loadAcademicTermBounds(db as any, targetTermId);
            const subRes = {
              data: filterByAssignmentSession((subResRaw.data ?? []) as any[], targetTermId, {
                includeUntagged: true,
              }),
            };
            const allAssignments = {
              data: ((allAssignmentsRaw.data ?? []) as any[]).filter((a) =>
                !targetTermId || a.term_id === targetTermId || !a.term_id,
              ),
            };

            // 3. Split CBT scores by exam_type — live/report session only
            const allCbt: any[] = filterCbtByAcademicTerm(
              (cbtAllRes.data || []) as any[],
              targetTermId,
              termBounds,
              { includeUntagged: true },
            );
            const scopedCbt = allCbt.filter((row: any) =>
                matchesReportExamScope(row, sessionConfig.course_id || null, statsProgramId),
            );
            const cbtScore = topCbtScore(scopedCbt, 'examination', sessionConfig.course_id || null, statsProgramId);
            const pendingCbt = scopedCbt.filter((row: any) => !isScoreReadyCbt(row)).length;
            const asgnGrades = subRes.data?.filter((x: any) => x.grade != null).map(assignmentPctOf) as number[] || [];
            const assignmentAvg = asgnGrades.length > 0
                ? Math.round(asgnGrades.reduce((a, b) => a + b, 0) / asgnGrades.length)
                : 0;
            const totalAsgn = allAssignments.data?.length || 0;
            const gradedAsgn = subRes.data?.length || 0;
            const assignmentPct = totalAsgn > 0 ? Math.round((gradedAsgn / totalAsgn) * 100) : 0;
            // Evaluation score = best CBT score where exam_type = 'evaluation'
            const evalScore = topCbtScore(scopedCbt, 'evaluation', sessionConfig.course_id || null, statsProgramId);
            const projectCount = (labRes.data?.length || 0) + (portfolioRes.data?.length || 0);
            // Project Engagement: every 3 projects = 100% (capped at 100)
            const projectPct = Math.min(100, Math.round((projectCount / 3) * 100));

            setStudentStats({
                attendance: attRes.data?.length || 0,
                totalSessions: sessionIds.length,
                assignments: gradedAsgn,
                totalAssignments: totalAsgn,
                cbtScore,
                assignmentAvg,
                evalScore,
                assignmentPct,
                projects: projectCount,
                pendingCbt,
            });

            // ── Auto-suggest all 6 WAEC components from real platform data ──────
            // Only fills a component when the DB had 0 (never saved) — uses the stable
            // local variables captured before this async block to avoid stale-state bugs.
            const attPct = sessionIds.length > 0
                ? Math.min(100, Math.round(((attRes.data?.length || 0) / sessionIds.length) * 100))
                : 0;
            setForm(f => ({
                ...f,
                ...(cbtScore > 0 && savedTheory === 0           ? { theory_score:        String(cbtScore) }     : {}),
                ...(assignmentAvg > 0 && savedClasswork === 0   ? { classwork_score:     String(assignmentAvg) } : {}),
                ...(projectPct > 0 && savedPractical === 0      ? { practical_score:     String(projectPct) }   : {}),
                ...(assignmentPct > 0 && savedAttendance === 0  ? { attendance_score:    String(assignmentPct) }: {}),
                ...(attPct > 0 && savedParticipation === 0      ? { participation_score: String(attPct) }       : {}),
                ...(evalScore > 0 && savedAssessment === 0      ? { assessment_score:    String(evalScore) }    : {}),
            }));
        } catch { /* silent fail */ } finally {
            setFetchingStats(false);
        }
    }

    // ── WAEC weighted overall (6 components, mirrors grading.ts SCORE_WEIGHTS) ──
    const rawOverallScore = computeWeightedScore({
        theory: parseFloat(form.theory_score) || 0,
        classwork: parseFloat(form.classwork_score) || 0,
        practical: parseFloat(form.practical_score) || 0,
        assignments: parseFloat(form.attendance_score) || 0,
        attendance: parseFloat(form.participation_score) || 0,
        assessment: parseFloat(form.assessment_score) || 0,
    });
    // Activity cap: students with low assignment submission % are grade-capped.
    // When no assignments exist (totalAssignments=0) pct defaults to 100 → no cap.
    // All staff (admin, teacher, school) bypass the cap — manual grade entry is authoritative.
    const assignmentSubmissionPct = studentStats.totalAssignments > 0 ? studentStats.assignmentPct : 100;
    const activityCap = isStaff
        ? { maxScore: 100, label: '', message: 'Staff override — no cap applied', minPct: 0 }
        : getActivityCap(assignmentSubmissionPct);
    const overallScore = Math.min(rawOverallScore, activityCap.maxScore);

    // ── WAEC grade code (A1–F9) for display and save ─────────────────────────
    const overallGradeObj = reportGrade(overallScore); // kept for Standard report card
    const overallGradeLetter = overallGradeObj.g;      // e.g. "A", "B" etc.
    // WAEC code for ModernReportCard:
    const waecCode = getWAECGrade(overallScore).code;

    // Preemptive AI Narrative Generation
    useEffect(() => {
        if (step !== 'edit' || !selectedStudent || loading || saving || generating) return;
        
        // Only run if BOTH fields are completely empty (not already drafted or loaded from DB)
        const needsStrengths = !form.key_strengths.trim();
        const needsGrowth = !form.areas_for_growth.trim();
        
        if (!needsStrengths && !needsGrowth) return;

        // Ensure overall score and relevant scores are ready before generating
        const hasScores = parseFloat(form.theory_score) > 0 || parseFloat(form.practical_score) > 0;
        if (!hasScores) return;

        const triggerPreemptiveAI = async () => {
            const currentStudentId = selectedStudent.id;
            
            // Generate strengths if empty
            if (needsStrengths) {
                try {
                    setGenerating('key_strengths');
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
                            gender: form.gender || null,
                            gradeLevel: form.section_class || 'General Academic',
                            theoryScore:        parseFloat(form.theory_score)        || 0,
                            classworkScore:     parseFloat(form.classwork_score)     || 0,
                            practicalScore:     parseFloat(form.practical_score)     || 0,
                            attendanceScore:    parseFloat(form.attendance_score)    || 0,
                            participationScore: parseFloat(form.participation_score) || 0,
                            assessmentScore:    parseFloat(form.assessment_score)    || 0,
                            overallScore,
                            overallGrade: overallGradeLetter,
                            proficiencyLevel: form.proficiency_level,
                            participationGrade: form.participation_grade || '',
                            projectsGrade:      form.projects_grade      || '',
                            homeworkGrade:      form.homework_grade       || '',
                        }),
                    });
                    
                    if (res.ok) {
                        const result = await res.json();
                        const generatedText = result.data?.key_strengths || '';
                        
                        // Safety check: only update if student hasn't changed and teacher hasn't typed anything
                        setForm(f => {
                            if (selectedStudent.id === currentStudentId && !f.key_strengths.trim()) {
                                return { ...f, key_strengths: generatedText };
                            }
                            return f;
                        });
                    }
                } catch (err) {
                    console.error('Preemptive AI strengths generation failed', err);
                } finally {
                    setGenerating(null);
                }
            }

            // Generate areas for growth if empty
            if (needsGrowth && selectedStudent.id === currentStudentId) {
                try {
                    setGenerating('areas_for_growth');
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
                            gender: form.gender || null,
                            gradeLevel: form.section_class || 'General Academic',
                            theoryScore:        parseFloat(form.theory_score)        || 0,
                            classworkScore:     parseFloat(form.classwork_score)     || 0,
                            practicalScore:     parseFloat(form.practical_score)     || 0,
                            attendanceScore:    parseFloat(form.attendance_score)    || 0,
                            participationScore: parseFloat(form.participation_score) || 0,
                            assessmentScore:    parseFloat(form.assessment_score)    || 0,
                            overallScore,
                            overallGrade: overallGradeLetter,
                            proficiencyLevel: form.proficiency_level,
                            participationGrade: form.participation_grade || '',
                            projectsGrade:      form.projects_grade      || '',
                            homeworkGrade:      form.homework_grade       || '',
                        }),
                    });
                    
                    if (res.ok) {
                        const result = await res.json();
                        const generatedText = result.data?.areas_for_growth || '';
                        
                        setForm(f => {
                            if (selectedStudent.id === currentStudentId && !f.areas_for_growth.trim()) {
                                return { ...f, areas_for_growth: generatedText };
                            }
                            return f;
                        });
                    }
                } catch (err) {
                    console.error('Preemptive AI growth generation failed', err);
                } finally {
                    setGenerating(null);
                }
            }
        };

        const timer = setTimeout(triggerPreemptiveAI, 1500);
        return () => clearTimeout(timer);
    }, [selectedStudent?.id, step, form.theory_score, form.practical_score, form.classwork_score, form.assessment_score, form.attendance_score, form.participation_score, overallScore, overallGradeLetter]);

    const scoreValue = (value: string) => Number.parseFloat(value);
    const scoreReady = (value: string) => Number.isFinite(scoreValue(value)) && scoreValue(value) >= 0 && scoreValue(value) <= 100;
    const publishQualityIssues = (() => {
        const issues: string[] = [];
        const isManual = selectedStudent?.id?.startsWith('manual-') || selectedStudent?.id?.startsWith('students-');
        const hasSchoolPeriod = isSchoolSection(sessionConfig.school_section)
            ? !!(sessionConfig.report_term && sessionConfig.report_period && sessionConfig.class_id && sessionConfig.term_id && sessionConfig.course_id)
            : !!sessionConfig.course_duration;

        if (!selectedStudent) issues.push('Select a portal student.');
        if (isManual) issues.push('Use a portal-linked student, not a manual/pre-portal entry.');
        if (!form.student_name.trim()) issues.push('Student name is required.');
        if (!(form.section_class || sessionConfig.section_class || selectedStudent?.section_class)) issues.push('Class/section is required.');
        if (!sessionConfig.school_section) issues.push('Choose a report context.');
        if (!hasSchoolPeriod && isSchoolSection(sessionConfig.school_section)) {
            if (!sessionConfig.report_term || !sessionConfig.report_period) issues.push('Term and academic year are required.');
            if (!sessionConfig.class_id) issues.push('Section/class is required.');
            if (!sessionConfig.course_id) issues.push('Course is required.');
            if (sessionConfig.report_term && sessionConfig.report_period && !sessionConfig.term_id) issues.push('Academic term is still resolving — please wait a moment.');
        }
        if (!hasSchoolPeriod && !isSchoolSection(sessionConfig.school_section)) issues.push('Cohort duration is required.');
        if (!sessionConfig.course_id || !sessionConfig.course_name.trim()) issues.push('Course is required.');
        if (!sessionConfig.instructor_name.trim()) issues.push('Instructor name is required.');
        if (!sessionConfig.report_date) issues.push('Report date is required.');
        if (!scoreReady(form.theory_score)) issues.push('Theory score must be 0-100.');
        if (!scoreReady(form.classwork_score)) issues.push('Classwork score must be 0-100.');
        if (!scoreReady(form.practical_score)) issues.push('Practical score must be 0-100.');
        if (!scoreReady(form.attendance_score)) issues.push('Assignment score must be 0-100.');
        if (!scoreReady(form.participation_score)) issues.push('Attendance score must be 0-100.');
        if (!scoreReady(form.assessment_score)) issues.push('Assessment score must be 0-100.');
        if (!form.key_strengths.trim()) issues.push('Key strengths comment is required.');
        if (!form.areas_for_growth.trim()) issues.push('Areas for growth comment is required.');
        if (duplicateWarning === 'published') issues.push('A published report already exists for this term/course.');
        if (!hasPreviewedCurrentReport && !livePreviewOpen) issues.push('Preview the latest report before publishing.');
        return issues;
    })();
    const canPublishReport = publishQualityIssues.length === 0;

    // ── Bulk Build: Process all students in current view ─────────────────────
    const handleBulkBuild = async () => {
        if (filteredStudents.length === 0) return;
        if (!confirm(`Are you sure you want to automatically generate reports for ${filteredStudents.length} students? This will overwrite individual drafts.`)) return;

        setIsBulkBuilding(true);
        setBulkProgress({ current: 0, total: filteredStudents.length });
        const db = createClient();

        try {
            // Find current program ID from course
            const { data: courseData } = await withTimeout(
                db.from('courses').select('program_id').eq('id', sessionConfig.course_id).single(),
                { data: null, error: null },
                'bulk course lookup',
            );
            const programId = courseData?.program_id;

            for (let i = 0; i < filteredStudents.length; i++) {
                const s = filteredStudents[i];
                setBulkProgress({ current: i + 1, total: filteredStudents.length });

                // 1. Fetch Stats (Attendance, Assignments, CBT)
                const studentSchoolId = s.school_id;
                const studentClassName = (s as any).section_class;
                let targetClassId = (s as any).class_id || sessionConfig.class_id || null;
                let targetTermId: string | null = sessionConfig.term_id || null;
                if (!targetClassId && studentClassName) {
                    const { data: clsData } = await withTimeout(
                        db.from('classes').select('id, term_id').eq('name', studentClassName).eq('school_id', studentSchoolId || '').maybeSingle(),
                        { data: null, error: null },
                        'bulk class lookup',
                    );
                    targetClassId = clsData?.id;
                    if (!targetTermId) targetTermId = (clsData as any)?.term_id ?? null;
                } else if (targetClassId && !targetTermId) {
                    const { data: clsData } = await withTimeout(
                        db.from('classes').select('term_id').eq('id', targetClassId).maybeSingle(),
                        { data: null, error: null },
                        'bulk class term lookup',
                    );
                    targetTermId = (clsData as any)?.term_id ?? null;
                }
                let sessionQuery = targetClassId ? db.from('class_sessions').select('id').eq('class_id', targetClassId).eq('is_active', true) : null;
                if (sessionQuery && targetTermId) sessionQuery = sessionQuery.eq('term_id', targetTermId);
                const { data: sessions } = sessionQuery
                    ? await withTimeout(sessionQuery, { data: [], error: null }, 'bulk class sessions')
                    : { data: [] };
                const sessionIds = sessions?.map((x: any) => x.id) || [];
                const bulkSubmissionsQuery = sessionConfig.course_id
                    ? db.from('assignment_submissions')
                        .select('id, grade, status, assignments!inner(course_id, max_points, term_id)')
                        .eq('portal_user_id', s.id)
                        .eq('status', 'graded')
                        .eq('assignments.course_id', sessionConfig.course_id)
                    : db.from('assignment_submissions')
                        .select('id, grade, status, assignments(max_points, term_id)')
                        .eq('portal_user_id', s.id)
                        .eq('status', 'graded');

                const [attRes, subResRaw, allAsgnRaw, cbtRes, labRes, portfolioRes] = await withTimeout(Promise.all([
                    sessionIds.length > 0 ? (() => {
                        let q = db.from('attendance').select('id').eq('user_id', s.id).in('session_id', sessionIds).eq('status', 'present');
                        if (targetTermId) q = q.eq('term_id', targetTermId);
                        return q;
                    })() : { data: [] },
                    bulkSubmissionsQuery,
                    sessionConfig.course_id ? (() => {
                      let q = db.from('assignments').select('id, term_id').eq('course_id', sessionConfig.course_id).eq('is_active', true);
                      if (targetTermId) q = q.or(`term_id.eq.${targetTermId},term_id.is.null`) as any;
                      return q;
                    })() : { data: [] },
                    db.from('cbt_sessions').select('score, status, needs_grading, end_time, cbt_exams(title, course_id, program_id, metadata, term_id)').eq('user_id', s.id).order('score', { ascending: false }),
                    db.from('lab_projects').select('id').eq('user_id', s.id),
                    db.from('portfolio_projects').select('id').eq('user_id', s.id),
                ]), [{ data: [] }, { data: [] }, { data: [] }, { data: [] }, { data: [] }, { data: [] }], 'bulk student stats sources');

                const { filterByAssignmentSession } = await import('@/lib/assignments/session');
                const { loadAcademicTermBounds, filterCbtByAcademicTerm } = await import('@/lib/cbt/session');
                const termBounds = await loadAcademicTermBounds(db as any, targetTermId);
                const subRes = {
                  data: filterByAssignmentSession((subResRaw.data ?? []) as any[], targetTermId, { includeUntagged: true }),
                };
                const allAsgn = {
                  data: ((allAsgnRaw.data ?? []) as any[]).filter((a) =>
                    !targetTermId || a.term_id === targetTermId || !a.term_id,
                  ),
                };

                // 2. Compute transparent scores (mirrors fetchStats 6-component mapping)
                const scopedCbt = filterCbtByAcademicTerm(
                  (cbtRes.data ?? []) as any[],
                  targetTermId,
                  termBounds,
                  { includeUntagged: true },
                ).filter((row: any) =>
                    matchesReportExamScope(row, sessionConfig.course_id || null, programId || null),
                );
                const cbtScore = topCbtScore(scopedCbt, 'examination');
                const asgnGrades = subRes.data?.filter((x: any) => x.grade != null).map(assignmentPctOf) as number[] || [];
                const asgnAvg = asgnGrades.length > 0 ? Math.round(asgnGrades.reduce((a, b) => a + b, 0) / asgnGrades.length) : 0;
                const totalAsgn = allAsgn.data?.length || 0;
                const hasAssignmentEvidence = totalAsgn > 0;
                const assigPct = hasAssignmentEvidence ? Math.round((subRes.data?.length || 0) / totalAsgn * 100) : 0;
                const projectCount = (labRes.data?.length || 0) + (portfolioRes.data?.length || 0);
                const projectPct = Math.min(100, Math.round((projectCount / 3) * 100));
                const hasAttendanceEvidence = sessionIds.length > 0;
                const attPct = hasAttendanceEvidence ? Math.min(100, Math.round((attRes.data?.length || 0) / sessionIds.length * 100)) : 0;
                // Assessment: prefer explicit evaluation CBT, then blend project/submission consistency.
                const evalScore = topCbtScore(scopedCbt, 'evaluation') || Math.min(100, Math.round(projectPct * 0.6 + assigPct * 0.4));

                // 3. Map to 6 weighted components
                const theory      = cbtScore;    // Theory (20%)  — CBT exam score
                const classwork   = asgnAvg;      // Classwork (10%) — assignment grade avg
                const practical   = projectPct;   // Practical (25%) — project completion %
                const assignments = assigPct;     // Assignments (20%) — submission rate
                const attendance  = attPct;       // Attendance (10%) — session attendance %
                const assessment  = evalScore;    // Assessment (15%) — blended eval score

                // 4. Check for existing report
                const isPrePortal = s.id?.startsWith('manual-') || s.id?.startsWith('students-');
                // Scope the existing-report check to term + academic year + course so a
                // new term/session/cohort inserts a fresh report instead of overwriting
                // a prior one (school: Term + Academic Year; online/bootcamp: duration).
                const { data: existing } = isPrePortal ? { data: null } : await withTimeout((() => {
                    let q = db.from('student_progress_reports').select('id').eq('student_id', s.id);
                    if (sessionConfig.report_term)   q = q.eq('report_term', sessionConfig.report_term) as typeof q;
                    if (sessionConfig.report_period) q = q.eq('report_period', sessionConfig.report_period) as typeof q;
                    if (sessionConfig.course_id)     q = q.eq('course_id', sessionConfig.course_id) as typeof q;
                    return q.order('updated_at', { ascending: false }).limit(1).maybeSingle();
                })(), { data: null, error: null }, 'bulk existing report lookup');

                const overall = computeWeightedScore({ theory, classwork, practical, assignments, attendance, assessment });
                // Grade code for display (A1–F9); letter grade kept for Standard report card
                const bulkWaecCode = getWAECGrade(overall).code;

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
                    engagement_metrics:  { classwork_score: classwork, assessment_score: assessment, assignment_evidence_missing: !hasAssignmentEvidence, attendance_evidence_missing: !hasAttendanceEvidence },
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
        if (!selectedStudent) return false;
        if (publish) setPublishing(true); else setSaving(true);
        setError(''); setSuccess('');

        const isManual = selectedStudent.id?.startsWith('manual-') || selectedStudent.id?.startsWith('students-');
        if (isManual) {
            setError('This student needs a portal account before a progress report can be saved.');
            setSaving(false);
            setPublishing(false);
            return false;
        }
        if (publish && publishQualityIssues.length > 0) {
            setError(`Cannot publish yet: ${publishQualityIssues[0]}`);
            setSaving(false);
            setPublishing(false);
            return false;
        }

        try {
            const payload = {
                student_id: selectedStudent.id,
                school_id: sessionConfig.school_id || (selectedStudent as any).school_id || profile?.school_id || null,
                course_id: sessionConfig.course_id || null,
                student_name: form.student_name,
                gender: form.gender || null,
                school_name: sessionConfig.school_name || (selectedStudent as any).school_name || null,
                section_class: form.section_class || sessionConfig.section_class || (selectedStudent as any).section_class || null,
                // CLASS (grade) — isolated from SECTION (section_class/cohort).
                student_grade: profileGrade || (selectedStudent as any).grade || null,
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
                is_published: false,
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
            const savedReportId = j.data?.id ?? existingReport?.id;
            const savedVerificationCode = j.data?.verification_code ?? existingReport?.verification_code ?? null;
            setExistingReport(prev => ({
                ...(prev ?? {}),
                ...payload,
                id: savedReportId,
                verification_code: savedVerificationCode,
            } as unknown as StudentReport));
            if (publish) {
                setReportedIds(current => new Set(current).add(selectedStudent.id));
                setDraftedIds(current => {
                    const next = new Set(current);
                    next.delete(selectedStudent.id);
                    return next;
                });
            } else if (!reportedIds.has(selectedStudent.id)) {
                setDraftedIds(current => new Set(current).add(selectedStudent.id));
            }

            if (publish && savedReportId && !isManual) {
                const publishRes = await fetch(`/api/progress-reports/${savedReportId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ is_published: true }),
                });
                const publishJson = await publishRes.json().catch(() => ({}));
                if (!publishRes.ok) {
                    throw new Error(publishJson.error || 'Report was saved, but publish notification failed');
                }
            }

            // Propagate profile updates back to the student's root record. The teacher is the
            // authority here, so a deliberately edited Full Name / Class / Gender OVERWRITES the
            // student everywhere (portal, records, login) — the "teacher can mutate identity from
            // the report builder" behaviour. (Gender still only fills when blank, to avoid a
            // stray toggle silently flipping it.)
            if (!isManual && selectedStudent.id) {
                const origName = selectedStudent.full_name ?? '';
                const origClass = (selectedStudent as any).section_class ?? '';
                const origGender = (selectedStudent as any).gender ?? '';
                const newName = form.student_name.trim();
                const newClass = (form.section_class || sessionConfig.section_class || '').trim();
                const profilePatch: Record<string, string> = {};
                if (newName && newName !== origName.trim()) profilePatch.full_name = newName;   // teacher edit overwrites
                if (newClass && newClass !== origClass) profilePatch.section_class = newClass;   // class can change
                if (form.gender && !String(origGender).trim()) profilePatch.gender = form.gender; // fill-only
                if (Object.keys(profilePatch).length > 0) {
                    fetch(`/api/portal-users/${selectedStudent.id}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(profilePatch),
                    }).then(r => {
                        if (r.ok) {
                            // Update local state so future comparisons are correct
                            (selectedStudent as any).full_name = profilePatch.full_name ?? selectedStudent.full_name;
                            (selectedStudent as any).section_class = profilePatch.section_class ?? (selectedStudent as any).section_class;
                            if (profilePatch.gender) (selectedStudent as any).gender = profilePatch.gender;
                        }
                    }).catch(() => { /* non-critical — report was saved */ });
                }
            }

            setSuccessMsg(publish ? 'Report published — visible to student!' : 'Draft saved!');
            if (publish) setForm(f => ({ ...f, is_published: true }));
            snapForm.current = { ...form, is_published: publish ? true : form.is_published };
            setIsDirty(false);
            setLastSavedAt(new Date());
            if (publish) setHasPreviewedCurrentReport(true);
            return true;
        } catch (err: any) {
            setError(err.message ?? 'Failed to save');
            return false;
        } finally {
            setSaving(false); setPublishing(false);
        }
    };

    function prepareNextClass() {
        const finishedClassName = sessionConfig.section_class;
        sessionStudents.current = [];
        setSelectedStudent(null);
        setExistingReport(null);
        setCurrentStudentIdx(-1);
        setClassFilter('');
        setGradeFilter('');
        setSearch('');
        setEditSearch('');
        setOverrideFilters(false);
        setSessionProgramId('');
        setCourseConfirmationKey('');
        setSessionDone(false);
        setResumedSession(false);
        setLastSavedAt(null);
        setSessionExpanded(true);
        setSessionConfig(current => ({
            ...current,
            class_id: '',
            section_class: '',
            course_id: '',
            course_name: '',
            current_module: '',
            next_module: '',
            learning_milestones: [],
        }));
        setStep('session');
        setSuccessMsg(finishedClassName
            ? `${finishedClassName} finished. Select the next class in this school.`
            : 'Class finished. Select the next class in this school.');
    }
    // ── Save & move to next student ───────────────────────────────────────────
    async function saveAndNext(publish = false) {
        if (isDirty || publish) {
            const saved = await handleSave(publish);
            if (!saved) return;
        }
        const navList = sessionStudents.current.length > 0 ? sessionStudents.current : filteredStudents;
        const nextIdx = currentStudentIdx + 1;
        if (nextIdx < navList.length) {
            await selectStudent(navList[nextIdx] as PortalUser, nextIdx);
        } else {
            prepareNextClass();
        }
    }

    // ── AI generate ───────────────────────────────────────────────────────────
    const handleAIGenerate = async (field: 'key_strengths' | 'areas_for_growth' | 'participation_grade' | 'projects_grade' | 'homework_grade') => {
        setGenerating(field);
        setError('');
        try {
            const { attendance, totalSessions, assignments, totalAssignments } = studentStats;
            const attPct = totalSessions > 0 ? (attendance / totalSessions) * 100 : 0;
            const assigPct = totalAssignments > 0 ? (assignments / totalAssignments) * 100 : 0;

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
            const evaluationField = field as 'key_strengths' | 'areas_for_growth';
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
                        gender: form.gender || null,
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

                const generatedText = evaluationField === 'key_strengths'
                    ? aiData.key_strengths || getRandomFallback('key_strengths')
                    : aiData.areas_for_growth || getRandomFallback('areas_for_growth');
                setForm(f => ({ ...f, [evaluationField]: generatedText }));
                setSuccessMsg(`${evaluationField === 'key_strengths' ? 'Strengths' : 'Growth'} comment drafted. Review before publishing.`);
            } catch (err) {
                console.warn('AI failed, using high-quality fallback:', err);
                setForm(f => ({ ...f, [evaluationField]: f[evaluationField] || getRandomFallback(evaluationField) }));
                setSuccessMsg(`${evaluationField === 'key_strengths' ? 'Strengths' : 'Growth'} comment drafted from fallback bank.`);
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
        verification_code: existingReport?.verification_code || (form as any).verification_code || undefined,
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
        student_grade: profileGrade || (selectedStudent as any)?.grade || undefined,
        school_name: sessionConfig.school_name || undefined,
        fee_status: form.fee_status || undefined,
        fee_label: sessionConfig.fee_label || undefined,
        fee_amount: sessionConfig.fee_amount || undefined,
        school_section: sessionConfig.school_section || undefined,
        // Per-student module overrides take precedence over session-level defaults
        current_module: form.student_current_module || sessionConfig.current_module || undefined,
        next_module: form.student_next_module || sessionConfig.next_module || undefined,
    };
    // Defer heavy card re-renders so typing/sliders don't freeze the UI
    const deferredPreviewData = useDeferredValue(previewData);

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
        <div className="bg-card border border-border rounded-xl overflow-hidden">
            <button
                onClick={() => setSessionExpanded(e => !e)}
                className="w-full flex items-center gap-3 px-5 py-3 hover:bg-muted transition-colors"
            >
                <Cog6ToothIcon className="w-4 h-4 text-primary flex-shrink-0" />
                <div className="flex-1 text-left min-w-0">
                    <p className="text-xs font-bold text-primary uppercase tracking-widest">Session Settings · click to change course</p>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                        <span className="font-bold text-foreground">{sessionConfig.report_term}</span>
                        {isSchoolSection(sessionConfig.school_section) && sessionConfig.report_period && <span className="font-bold text-foreground"> · {sessionConfig.report_period}</span>}
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
                        {isSchoolSection(sessionConfig.school_section) ? (
                            // Term & Academic Year live in the step-1 lock — read-only here to avoid a duplicate editor.
                            <Field label="Term & Academic Year">
                                <ReportingPeriodLock term={sessionConfig.report_term} period={sessionConfig.report_period}
                                    set={setSessionConfig} unlocked={false} setUnlocked={() => {}} readOnly />
                            </Field>
                        ) : (
                            <DurationField value={sessionConfig.course_duration} set={setSessionConfig} alsoSetTerm />
                        )}
                        <ProgramCourseFields programs={programs} courses={courses} programId={sessionProgramId} setProgramId={setSessionProgramId} courseId={sessionConfig.course_id} set={setSessionConfig} programLocked={!!sessionConfig.class_id} />
                        <Field label="School">
                            <select
                                value={sessionConfig.school_name}
                                onChange={e => {
                                    const name = e.target.value;
                                    const match = schools.find((school) => school.name === name);
                                    setSessionConfig((current) => ({ ...current, school_name: name, school_id: match?.id }));
                                }}
                                className={INPUT}>
                                <option value="">— Select a school —</option>
                                {schools.map(sc => <option key={sc.id} value={sc.name}>{sc.name}</option>)}
                            </select>
                        </Field>
                        <Field label="Section">
                            <select
                                value={sessionConfig.class_id || ''}
                                onChange={e => selectReportSection(e.target.value)}
                                className={INPUT}>
                                <option value="">— Select class —</option>
                                {teacherClasses.filter(c => !sessionConfig.school_id || c.school_id === sessionConfig.school_id).map(c => <option key={c.id} value={c.id}>{c.name}{c.academic_terms ? ` · ${c.academic_terms.term_label} · ${c.academic_terms.academic_year}` : ''}</option>)}
                            </select>
                        </Field>
                        <SessionModuleFields config={sessionConfig} set={setSessionConfig} idPrefix="mod-bar" suggestions={getSuggestionsForCourse()} />

                    </div>

                    {/* Learning Milestones editor */}
                    <div className="relative">
                        <div className="flex items-center justify-between mb-2">
                            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                Learning Milestones
                                <span className="ml-1.5 text-[11px] text-primary/60 font-normal normal-case">({sessionConfig.learning_milestones.length} added)</span>
                            </label>
                            <button type="button" onClick={() => setShowMilestoneSuggestions(v => !v)}
                                className="flex items-center gap-1.5 px-3 py-1 bg-primary/10 border border-primary/20 text-primary text-[10px] font-black uppercase tracking-widest hover:bg-primary/20 transition-all">
                                <SparklesIcon className="w-3 h-3" /> Suggest from Course
                            </button>
                        </div>

                        {/* AI-based milestone suggestions dropdown */}
                        {showMilestoneSuggestions && (
                            <div className="mb-3 bg-card border border-primary/20 p-3">
                                <p className="text-[11px] font-black text-primary/60 uppercase tracking-widest mb-2">
                                    Suggested milestones for <strong className="text-primary">{sessionConfig.course_name || 'your course'}</strong>
                                    <span className="text-muted-foreground/40 ml-1">· click to add</span>
                                </p>
                                <div className="space-y-1">
                                    {getMilestoneSuggestions(sessionConfig.course_name).map((sug, i) => {
                                        const alreadyAdded = sessionConfig.learning_milestones.includes(sug);
                                        return (
                                            <button key={i} type="button" disabled={alreadyAdded}
                                                onClick={() => {
                                                    if (!alreadyAdded) setSessionConfig(s => ({ ...s, learning_milestones: [...s.learning_milestones, sug] }));
                                                }}
                                                className={`w-full flex items-center gap-2 px-3 py-2 text-left text-[11px] border transition-all ${alreadyAdded ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-400/50 cursor-default' : 'bg-muted/20 border-border text-muted-foreground hover:border-primary/30 hover:bg-primary/5 hover:text-foreground'}`}>
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
                            <p className="text-[10px] text-muted-foreground">Prints ₦30,000 Rillcod payment details on each report</p>
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
                                <button onClick={() => { setHasPreviewedCurrentReport(true); setShowPreview(true); }}
                                    className="inline-flex items-center gap-1.5 px-3 py-2 bg-amber-500/10 border border-amber-500/20 hover:bg-amber-500/20 text-amber-400 text-xs font-bold rounded-xl transition-colors">
                                    <SparklesIcon className="w-3.5 h-3.5" /> Preview
                                </button>
                                <button
                                    onClick={async () => {
                                        await handleSave(false);
                                        window.location.href = `/dashboard/results?student=${selectedStudent.id}`;
                                    }}
                                    disabled={saving || publishing}
                                    className="inline-flex items-center gap-1.5 px-3 py-2 bg-primary/20 hover:bg-primary/30 text-primary text-xs font-bold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                                    {saving ? <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" /> : <EyeIcon className="w-3.5 h-3.5" />} View Result
                                </button>
                                <button
                                    onClick={async () => {
                                        if (isDirty) await handleSave(false);
                                        setHasPreviewedCurrentReport(true);
                                        setShowPreview(true);
                                    }}
                                    disabled={saving || publishing}
                                    className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 text-xs font-bold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                                    {saving ? <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" /> : <PrinterIcon className="w-3.5 h-3.5" />} Print
                                </button>
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
                        <div className="bg-primary/10 border border-primary/20 rounded-xl px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3">
                            <div className="flex-1">
                                <p className="text-primary font-bold text-sm">Step 1 of 3 — Session Setup</p>
                                <p className="text-primary/60 text-xs mt-0.5">
                                    Enter details that are shared for ALL students in this grading session.
                                    These will be locked when you move to individual student grading.
                                </p>
                            </div>
                        </div>

                        {/* ── Reporting Period — the FIRST, most prominent decision ── */}
                        <div className="bg-gradient-to-br from-primary/10 to-primary/5 border-2 border-primary/30 rounded-2xl p-5 space-y-4">
                            <div className="flex items-center gap-2">
                                <span className="text-lg">📅</span>
                                <h3 className="text-sm font-black text-primary uppercase tracking-widest">Reporting Period</h3>
                                <span className="ml-auto text-[10px] font-bold text-primary/60 uppercase tracking-wider">Set this first</span>
                            </div>
                            <p className="text-[11px] text-muted-foreground -mt-2">
                                Choose exactly which term &amp; session these reports belong to. Reports are saved
                                separately per term and academic year — a new term never overwrites a previous one.
                            </p>

                            {/* Report context */}
                            <div>
                                <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1.5">Report Context *</label>
                                <div className="flex sm:grid sm:grid-cols-5 gap-2 overflow-x-auto sm:overflow-visible pb-1 sm:pb-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                                    {(['basic', 'secondary', 'unified', 'bootcamp', 'online'] as const).map(type => (
                                        <button key={type} type="button"
                                            onClick={() => setSessionConfig(s => ({
                                                ...s,
                                                school_section: type,
                                                // Seed sensible term/year the moment a school context is chosen, so they're never blank.
                                                ...(isSchoolSection(type)
                                                    ? { report_term: s.report_term || getCurrentTermLabel(), report_period: s.report_period || getCurrentAcademicYear() }
                                                    : {}),
                                            }))}
                                            className={`shrink-0 min-w-[8.5rem] sm:min-w-0 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-colors border ${sessionConfig.school_section === type ? 'bg-primary border-primary text-primary-foreground shadow' : 'bg-card shadow-sm border-border text-muted-foreground hover:bg-muted'}`}>
                                            {type === 'basic' ? '📚 Basic' : type === 'secondary' ? '🎓 Secondary' : type === 'unified' ? '🏫 Unified' : type === 'bootcamp' ? '💻 Bootcamp' : '🌐 Online'}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {!sessionConfig.school_section ? (
                                <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3">
                                    <ExclamationTriangleIcon className="w-4 h-4 text-amber-400 flex-shrink-0" />
                                    <p className="text-[11px] text-amber-300/80 font-semibold">Pick a report context above to choose the term &amp; academic year.</p>
                                </div>
                            ) : isSchoolSection(sessionConfig.school_section) ? (
                                <>
                                    {/* Locked to the current term (like the Results page). Unlock only to backfill another period. */}
                                    <ReportingPeriodLock term={sessionConfig.report_term} period={sessionConfig.report_period}
                                        set={setSessionConfig} unlocked={periodUnlocked} setUnlocked={setPeriodUnlocked} />
                                </>
                            ) : (
                                <>
                                    <DurationField value={sessionConfig.course_duration} set={setSessionConfig} prominent placeholder alsoSetTerm />
                                    <div className="flex items-center gap-2 bg-sky-500/10 border border-sky-500/25 rounded-xl px-4 py-2.5">
                                        <CheckCircleIcon className="w-4 h-4 text-sky-400 flex-shrink-0" />
                                        <p className="text-[11px] text-sky-300 font-bold">
                                            Cohort-based report — {sessionConfig.course_duration || '— set duration —'} (no school term / academic year).
                                        </p>
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Session fields */}
                        <div className="bg-card shadow-sm border border-border rounded-xl p-5 space-y-4">
                            <div className="flex items-center gap-2 border-b border-border pb-3 mb-2">
                                <span>📋</span>
                                <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Session Info</h3>
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
                                            setClassFilter('');
                                            setGradeFilter('');
                                            setSessionProgramId('');
                                            setSessionConfig(s => ({ ...s, school_name: name, school_id: match?.id, class_id: '', section_class: '', course_id: '', course_name: '' }));
                                        }}
                                        className={INPUT}>
                                        <option value="">— Select a school —</option>
                                        {schools.map(sc => <option key={sc.id} value={sc.name}>{sc.name}</option>)}
                                    </select>
                                </Field>
                                <Field label="Section *">
                                    <select
                                        value={sessionConfig.class_id || ''}
                                onChange={e => selectReportSection(e.target.value)}
                                        className={INPUT}>
                                        <option value="">— Select class —</option>
                                        {teacherClasses.filter(c => !sessionConfig.school_id || c.school_id === sessionConfig.school_id).map(c => <option key={c.id} value={c.id}>{c.name}{c.academic_terms ? ` · ${c.academic_terms.term_label} · ${c.academic_terms.academic_year}` : ''}</option>)}
                                    </select>
                                </Field>
                            </div>
                            <div className="border-t border-border pt-4">
                                <div className="flex items-center gap-2 mb-3">
                                    <span>📖</span>
                                    <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Programme &amp; Course *</h3>
                                    <span className="ml-auto text-[10px] font-semibold text-primary">Set once for this class</span>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <ProgramCourseFields programs={programs} courses={courses} programId={sessionProgramId} setProgramId={setSessionProgramId} courseId={sessionConfig.course_id} set={setSessionConfig} prominent programLocked={!!sessionConfig.class_id} />
                                </div>
                                <p className="mt-2 text-[10px] text-muted-foreground">This course stays selected while you grade every student in this class.</p>
                                {sessionConfig.course_id && (
                                    <button
                                        type="button"
                                        onClick={() => setCourseConfirmationKey(courseConfirmed ? '' : currentCourseConfirmationKey)}
                                        className={`mt-3 w-full flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${courseConfirmed
                                            ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                                            : 'border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/15'}`}
                                    >
                                        {courseConfirmed
                                            ? <CheckCircleIcon className="h-5 w-5 flex-shrink-0" />
                                            : <ExclamationTriangleIcon className="h-5 w-5 flex-shrink-0" />}
                                        <span>
                                            <span className="block text-xs font-black uppercase tracking-wider">
                                                {courseConfirmed ? 'Course confirmed' : 'Confirm this course before continuing'}
                                            </span>
                                            <span className="mt-0.5 block text-[11px] opacity-80">
                                                {sessionConfig.course_name}{sessionConfig.section_class ? ` for ${sessionConfig.section_class}` : ''}
                                            </span>
                                        </span>
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Payment / Fee Section — optional, won't appear on report if left blank */}
                        <div className="bg-card border border-border rounded-xl overflow-hidden">
                            <div className="flex items-center gap-2 px-5 py-3 bg-muted/20 border-b border-border">
                                <span>💳</span>
                                <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Payment / Fee Info</h3>
                                <span className="ml-auto text-[10px] text-muted-foreground/50 font-semibold">Optional — only appears on report if filled in</span>
                            </div>
                            <div className="p-5 space-y-4">
                                <p className="text-[11px] text-muted-foreground leading-relaxed">
                                    Use this for schools where coding is offered as an <strong className="text-muted-foreground">extra-curricular activity</strong> (paid separately) or when different school sections (Basic vs Secondary) have separate fee structures or management. Leave blank if fees are handled by the school directly or not applicable.
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
                                        <p className="text-[10px] text-muted-foreground">Prints ₦30,000 Rillcod payment details on each report (Providus Bank · 7901178957)</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="bg-card shadow-sm border border-border rounded-xl p-5 space-y-4">
                            <div className="flex items-center gap-2 border-b border-border pb-3 mb-2">
                                <span>🧭</span>
                                <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Module Progress</h3>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <SessionModuleFields config={sessionConfig} set={setSessionConfig} idPrefix="mod-step" suggestions={getSuggestionsForCourse()} />
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

                        {(() => {
                            const ctx = sessionConfig.school_section;
                            const periodReady = !!ctx && (isSchoolSection(ctx)
                                ? !!(sessionConfig.report_term && sessionConfig.report_period && sessionConfig.class_id && sessionConfig.term_id && sessionConfig.course_id && courseConfirmed)
                                : !!(sessionConfig.course_duration && sessionConfig.course_id && courseConfirmed));
                            const missing = !ctx
                                ? 'Choose a report context in the Reporting Period card above'
                                : !isSchoolSection(ctx) && !sessionConfig.course_duration
                                    ? 'Set the cohort Duration above'
                                    : !sessionConfig.course_id
                                        ? 'Select a Course under School & Class above'
                                    : !courseConfirmed
                                        ? 'Confirm the selected Course under School & Class above'
                                    : !sessionConfig.report_term || !sessionConfig.report_period
                                        ? 'Set the Term and Academic Year above'
                                        : !sessionConfig.class_id
                                            ? 'Select a Section in School & Class above'
                                            : !sessionConfig.course_id
                                                ? 'Select a Course under School & Class above'
                                                : !sessionConfig.term_id
                                                    ? 'Resolving academic term… please wait a moment'
                                                    : '';
                            return (
                                <>
                                    {!periodReady && (
                                        <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-2.5 mb-2">
                                            <ExclamationTriangleIcon className="w-4 h-4 text-amber-400 flex-shrink-0" />
                                            <p className="text-[11px] text-amber-300/80 font-semibold">{missing} before continuing.</p>
                                        </div>
                                    )}
                                    <button
                                        disabled={!periodReady}
                                        onClick={() => {
                                            sessionStudents.current = []; // reset frozen nav list for new session
                                            setOverrideFilters(false);
                                            setSearch('');
                                            setSessionDone(true);
                                            setSessionExpanded(false);
                                            setClassFilter(sessionConfig.section_class); // pre-filter by selected class
                                            setStep('pick');
                                        }}
                                        className="w-full py-4 bg-primary hover:bg-primary text-foreground font-black text-base rounded-xl transition-all shadow-lg shadow-primary/30 flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none">
                                        <UserGroupIcon className="w-5 h-5" /> Step 2: Select Students →
                                    </button>
                                </>
                            );
                        })()}
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

                        <div className="bg-card border border-border rounded-xl p-5">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                    <p className="text-[10px] font-black uppercase tracking-widest text-primary">Current class progress</p>
                                    <h2 className="mt-1 text-base font-black text-foreground">{sessionConfig.section_class || 'Selected class'}</h2>
                                    <p className="mt-0.5 text-xs text-muted-foreground">{sessionConfig.course_name} · {sessionConfig.report_term} · {sessionConfig.report_period}</p>
                                </div>
                                <button type="button" onClick={async () => { if (isDirty) { const saved = await handleSave(false); if (!saved) return; } prepareNextClass(); }}
                                    className="rounded-xl border border-border bg-muted/30 px-4 py-2 text-xs font-black text-foreground hover:bg-muted">
                                    Choose another class
                                </button>
                            </div>
                            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                                <div className="rounded-xl border border-border bg-muted/20 p-3"><p className="text-xl font-black text-foreground">{classRoster.length}</p><p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Students</p></div>
                                <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-3"><p className="text-xl font-black text-amber-400">{classDraftCount}</p><p className="text-[10px] font-bold uppercase tracking-wider text-amber-300/70">Drafts</p></div>
                                <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-3"><p className="text-xl font-black text-emerald-400">{classPublishedCount}</p><p className="text-[10px] font-bold uppercase tracking-wider text-emerald-300/70">Published</p></div>
                                <div className="rounded-xl border border-border bg-muted/20 p-3"><p className="text-xl font-black text-foreground">{classRemainingCount}</p><p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Remaining</p></div>
                            </div>
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

                                {/* Dropdown filters — hidden in override mode */}
                                {!overrideFilters && (
                                    <div className="flex flex-wrap items-center gap-2">
                                        {distinctGrades.length > 0 && (
                                            <select
                                                title="Filter by Grade"
                                                value={gradeFilter}
                                                onChange={e => setGradeFilter(e.target.value)}
                                                className="bg-card border border-border text-foreground px-3 py-2 text-sm focus:outline-none focus:border-sky-500 rounded-lg"
                                            >
                                                <option value="">All Grades</option>
                                                {distinctGrades.map(g => <option key={g} value={g}>{g}</option>)}
                                            </select>
                                        )}
                                        <select
                                            title="Filter by Class"
                                            value={classFilter}
                                            onChange={e => setClassFilter(e.target.value)}
                                            className="bg-card border border-border text-foreground px-3 py-2 text-sm focus:outline-none focus:border-primary rounded-lg min-w-[180px]"
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
                                        <div className="flex bg-muted/40 p-0.5 rounded-xl border border-border">
                                            {([
                                                { id: 'all', label: 'All Statuses' },
                                                { id: 'none', label: '✗ Pending' },
                                                { id: 'has', label: '✓ Graded' },
                                            ] as const).map(tab => (
                                                <button
                                                    key={tab.id}
                                                    type="button"
                                                    onClick={() => setPickReportFilter(tab.id)}
                                                    className={`px-3 py-1.5 text-xs font-black uppercase rounded-lg transition-all ${
                                                        pickReportFilter === tab.id
                                                            ? 'bg-primary text-foreground shadow-sm'
                                                            : 'text-muted-foreground hover:text-foreground'
                                                    }`}
                                                >
                                                    {tab.label}
                                                </button>
                                            ))}
                                        </div>
                                        {(classFilter || gradeFilter || pickReportFilter !== 'all') && (
                                            <button
                                                onClick={() => { setClassFilter(''); setGradeFilter(''); setPickReportFilter('all'); }}
                                                className="text-xs text-primary hover:text-primary font-bold transition-colors px-2"
                                            >
                                                Clear filters
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
                                            <p className="text-muted-foreground text-sm">No portal students found with current filters.</p>
                                            <p className="text-muted-foreground text-xs max-w-md mx-auto">
                                                Reports require a student portal account so published results can be shown to the right student and parent.
                                                Try the <strong className="text-amber-400">Override — Show All Students</strong> toggle, or create/import the student first.
                                            </p>
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
                                                    <span className="text-[11px] text-muted-foreground bg-card shadow-sm px-2 py-0.5 rounded-full">{(items as any[]).length}</span>
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
                                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                                        <p className="font-semibold text-foreground text-sm truncate">{s.full_name ?? 'Unnamed'}</p>
                                                                        {(s as any).grade_level && (
                                                                            <span className="text-[11px] px-1.5 py-0.5 bg-sky-500/15 text-sky-400 border border-sky-500/30 rounded font-black uppercase shrink-0">{(s as any).grade_level}</span>
                                                                        )}
                                                                    </div>
                                                                    <p className="text-xs text-muted-foreground truncate">{s.school_name ?? s.email}</p>
                                                                    {(s as any)._source === 'students_table' && (
                                                                        <span className="text-[11px] text-amber-400 font-semibold">Pre-portal</span>
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
                        {resumedSession && (
                            <div className="flex flex-col gap-3 rounded-xl border border-primary/30 bg-primary/10 px-5 py-4 sm:flex-row sm:items-center">
                                <div className="flex-1">
                                    <p className="text-xs font-black uppercase tracking-widest text-primary">Session restored</p>
                                    <p className="mt-1 text-sm font-bold text-foreground">Continuing {sessionConfig.section_class} · {sessionConfig.course_name}</p>
                                    <p className="mt-0.5 text-xs text-muted-foreground">Returned to {selectedStudent.full_name}. Your class and course confirmation are still in place.</p>
                                </div>
                                <button type="button" onClick={() => setResumedSession(false)} className="rounded-xl border border-primary/30 px-3 py-2 text-xs font-bold text-primary hover:bg-primary/10">Dismiss</button>
                            </div>
                        )}
                        {/* Step label */}
                        <div className="bg-emerald-600/10 border border-emerald-500/20 rounded-xl px-5 py-3 flex items-center gap-3">
                            <div className="flex-1">
                                <p className="text-emerald-300 font-bold text-sm">Step 3 of 3 — Enter Student Scores</p>
                                                                <p className="text-emerald-300/60 text-xs mt-0.5">Session details are pre-filled. Just enter scores and evaluation for this student.</p>
                                <p className="mt-1 text-[10px] font-semibold text-emerald-300/70">
                                    {saving ? 'Saving draft…' : isDirty ? 'Unsaved changes · autosaves after 8 seconds' : lastSavedAt ? `Saved ${lastSavedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'All changes saved'}
                                </p>
                            </div>
                            <span className="text-muted-foreground text-xs font-mono flex-shrink-0">
                                {currentStudentIdx + 1} / {(sessionStudents.current.length > 0 ? sessionStudents.current : filteredStudents).length}
                            </span>
                        </div>

                        <div className="bg-card border border-border rounded-xl p-5">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                    <p className="text-[10px] font-black uppercase tracking-widest text-primary">Current class progress</p>
                                    <h2 className="mt-1 text-base font-black text-foreground">{sessionConfig.section_class || 'Selected class'}</h2>
                                    <p className="mt-0.5 text-xs text-muted-foreground">{sessionConfig.course_name} · {sessionConfig.report_term} · {sessionConfig.report_period}</p>
                                </div>
                                <button type="button" onClick={async () => { if (isDirty) { const saved = await handleSave(false); if (!saved) return; } prepareNextClass(); }}
                                    className="rounded-xl border border-border bg-muted/30 px-4 py-2 text-xs font-black text-foreground hover:bg-muted">
                                    Choose another class
                                </button>
                            </div>
                            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                                <div className="rounded-xl border border-border bg-muted/20 p-3"><p className="text-xl font-black text-foreground">{classRoster.length}</p><p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Students</p></div>
                                <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-3"><p className="text-xl font-black text-amber-400">{classDraftCount}</p><p className="text-[10px] font-bold uppercase tracking-wider text-amber-300/70">Drafts</p></div>
                                <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-3"><p className="text-xl font-black text-emerald-400">{classPublishedCount}</p><p className="text-[10px] font-bold uppercase tracking-wider text-emerald-300/70">Published</p></div>
                                <div className="rounded-xl border border-border bg-muted/20 p-3"><p className="text-xl font-black text-foreground">{classRemainingCount}</p><p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Remaining</p></div>
                            </div>
                        </div>

                        {/* Collapsible session summary */}
                        <SessionSummaryBar />

                        {/* Student navigator */}
                        {(() => {
                            // Use the frozen list captured at session-start so Prev/Next always
                            // walks the same class-filtered set regardless of reactive state changes.
                            const navList = sessionStudents.current.length > 0
                                ? sessionStudents.current
                                : filteredStudents;
                            const editMatches = editSearch.trim().length >= 1
                                ? navList.filter((s: any) => s.full_name?.toLowerCase().includes(editSearch.toLowerCase()) || s.email?.toLowerCase().includes(editSearch.toLowerCase()))
                                : [];
                            return (
                            <div className="bg-card border border-border rounded-xl px-4 py-3 space-y-2">
                              <div className="flex items-center gap-3">
                                <button onClick={() => { sessionStudents.current = []; setStep('pick'); setEditSearch(''); }}
                                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors flex-shrink-0">
                                    <ArrowLeftIcon className="w-3.5 h-3.5" />
                                    <span className="hidden sm:inline">All Students</span>
                                </button>
                                <div className="w-px h-4 bg-muted" />
                                <button
                                    disabled={currentStudentIdx <= 0}
                                    onClick={async () => {
                                        if (saving || publishing) return;
                                        if (isDirty) await handleSave(false);
                                        const idx = currentStudentIdx - 1;
                                        if (idx >= 0) await selectStudent(navList[idx] as PortalUser, idx);
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
                                    {isDirty && <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse flex-shrink-0" title="Unsaved changes" />}
                                </div>
                                <button
                                    disabled={currentStudentIdx >= navList.length - 1}
                                    onClick={async () => {
                                        if (saving || publishing) return;
                                        if (isDirty) await handleSave(false);
                                        const idx = currentStudentIdx + 1;
                                        if (idx < navList.length) await selectStudent(navList[idx] as PortalUser, idx);
                                    }}
                                    className="p-1.5 rounded-xl bg-card shadow-sm text-muted-foreground hover:text-foreground disabled:opacity-20 transition-colors flex-shrink-0">
                                    <ArrowLeftIcon className="w-3.5 h-3.5 rotate-180" />
                                </button>
                              </div>
                              {/* Quick student search */}
                              <div className="relative">
                                <input
                                    type="search"
                                    placeholder="Jump to student… type name or email"
                                    value={editSearch}
                                    onChange={e => setEditSearch(e.target.value)}
                                    className="w-full bg-card/60 border border-border text-foreground text-xs px-3 py-2 rounded-xl placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary"
                                />
                                {editMatches.length > 0 && (
                                    <div className="absolute left-0 right-0 top-full mt-1 bg-card border border-border rounded-xl shadow-xl z-50 max-h-48 overflow-y-auto">
                                        {editMatches.map((ms: any, mi: number) => (
                                            <button
                                                key={ms.id}
                                                onClick={async () => {
                                                    const realIdx = navList.findIndex((x: any) => x.id === ms.id);
                                                    if (saving || publishing) return;
                                                    if (isDirty) await handleSave(false);
                                                    await selectStudent(ms as PortalUser, realIdx >= 0 ? realIdx : mi);
                                                    setEditSearch('');
                                                }}
                                                className="w-full text-left px-3 py-2 text-xs hover:bg-muted transition-colors flex items-center gap-2 border-b border-border last:border-0"
                                            >
                                                <span className="w-5 h-5 rounded-full bg-primary/20 text-primary flex items-center justify-center text-[10px] font-black flex-shrink-0">
                                                    {ms.full_name?.[0] ?? '?'}
                                                </span>
                                                <span className="font-bold truncate">{ms.full_name}</span>
                                                <span className="text-muted-foreground truncate ml-auto">{ms.email}</span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                              </div>
                            </div>
                            );
                        })()}

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
                        {duplicateWarning === 'new-term' && (
                            <div className="flex items-start gap-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-4 py-3">
                                <DocumentTextIcon className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                                <div className="flex-1 min-w-0">
                                    <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">Starting a New {sessionConfig.report_term} Report</p>
                                    <p className="text-[11px] text-emerald-300/70 mt-0.5">
                                        This creates a <strong className="text-emerald-300">fresh report</strong> for <strong className="text-emerald-300">{selectedStudent?.full_name}</strong>. Their previous report (<strong className="text-emerald-300">{duplicateDetail}</strong>) is kept untouched and stays viewable in Progress Reports.
                                    </p>
                                </div>
                                <button onClick={() => setDuplicateWarning(null)} className="text-emerald-400/40 hover:text-emerald-400 transition-colors flex-shrink-0">
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
                            <div className="bg-card border border-border px-5 py-3 space-y-2">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-black text-primary/70 uppercase tracking-widest">Score Sources — Auto-filled from Platform</span>
                                    <span className="text-[11px] text-muted-foreground">auto-suggested when score is 0</span>
                                </div>
                                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                                    <div className="bg-indigo-500/5 border border-indigo-500/20 px-2.5 py-2">
                                        <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-1">Theory (20%)</p>
                                        <p className="text-[11px] font-black text-foreground">{studentStats.cbtScore > 0 ? `${studentStats.cbtScore}%` : '—'}</p>
                                        <p className="text-[10px] text-muted-foreground">{studentStats.pendingCbt > 0 ? `${studentStats.pendingCbt} CBT pending` : 'CBT exam'}</p>
                                    </div>
                                    <div className="bg-cyan-500/5 border border-cyan-500/20 px-2.5 py-2">
                                        <p className="text-[10px] font-black text-cyan-400 uppercase tracking-widest mb-1">Classwork (10%)</p>
                                        <p className="text-[11px] font-black text-foreground">{studentStats.assignmentAvg > 0 ? `${studentStats.assignmentAvg}%` : '—'}</p>
                                        <p className="text-[10px] text-muted-foreground">Graded asgn avg</p>
                                    </div>
                                    <div className="bg-primary/5 border border-primary/20 px-2.5 py-2">
                                        <p className="text-[10px] font-black text-primary uppercase tracking-widest mb-1">Practical (25%)</p>
                                        <p className="text-[11px] font-black text-foreground">{studentStats.projects} project{studentStats.projects !== 1 ? 's' : ''}</p>
                                        <p className="text-[10px] text-muted-foreground">Lab + portfolio</p>
                                    </div>
                                    <div className="bg-emerald-500/5 border border-emerald-500/20 px-2.5 py-2">
                                        <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-1">Assignments (20%)</p>
                                        <p className="text-[11px] font-black text-foreground">{studentStats.assignments}/{studentStats.totalAssignments}</p>
                                        <p className="text-[10px] text-muted-foreground">{studentStats.assignmentPct}% submitted</p>
                                    </div>
                                    <div className="bg-amber-500/5 border border-amber-500/20 px-2.5 py-2">
                                        <p className="text-[10px] font-black text-amber-400 uppercase tracking-widest mb-1">Attendance (10%)</p>
                                        <p className="text-[11px] font-black text-foreground">{studentStats.attendance}/{studentStats.totalSessions}</p>
                                        <p className="text-[10px] text-muted-foreground">Sessions present</p>
                                    </div>
                                    <div className="bg-rose-500/5 border border-rose-500/20 px-2.5 py-2">
                                        <p className="text-[10px] font-black text-rose-400 uppercase tracking-widest mb-1">Assessment (15%)</p>
                                        <p className="text-[11px] font-black text-foreground">{studentStats.evalScore > 0 ? `${studentStats.evalScore}%` : '—'}</p>
                                        <p className="text-[10px] text-muted-foreground">{studentStats.pendingCbt > 0 ? 'Ready scores only' : 'CBT evaluation'}</p>
                                    </div>
                                </div>
                            </div>
                        )}
                        {fetchingStats && (
                            <div className="flex items-center gap-2 px-5 py-2.5 bg-card border border-border text-[10px] text-muted-foreground">
                                <ArrowPathIcon className="w-3 h-3 animate-spin" /> Fetching student stats...
                            </div>
                        )}

                        <EvidenceStatusBanner
                            loading={fetchingStats}
                            assignments={studentStats.totalAssignments}
                            sessions={studentStats.totalSessions}
                        />
                        {/* Activity cap notice — shown only when a cap is actively reducing the score */}
                        {!fetchingStats && selectedStudent && activityCap.maxScore < 100 && rawOverallScore > activityCap.maxScore && (
                            <div className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3">
                                <ExclamationTriangleIcon className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                                <div className="flex-1 min-w-0">
                                    <p className="text-[10px] font-black text-amber-400 uppercase tracking-widest">
                                        Grade Cap Applied — {activityCap.label}
                                    </p>
                                    <p className="text-[11px] text-amber-300/70 mt-0.5">
                                        Raw score {rawOverallScore}% → capped to <strong className="text-amber-300">{overallScore}%</strong> ({activityCap.message})
                                    </p>
                                </div>
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
                                        <div className="flex bg-muted/30 border border-border p-1 rounded-xl overflow-hidden">
                                            <button onClick={() => setReportStyle('standard')}
                                                className={`flex-1 py-2 text-[10px] font-black uppercase transition-all ${reportStyle === 'standard' ? 'bg-primary text-white shadow-lg' : 'text-muted-foreground hover:text-foreground'}`}>
                                                Standard
                                            </button>
                                            <button onClick={() => setReportStyle('modern')}
                                                className={`flex-1 py-2 text-[10px] font-black uppercase transition-all ${reportStyle === 'modern' ? 'bg-primary text-white shadow-lg' : 'text-muted-foreground hover:text-foreground'}`}>
                                                Modern
                                            </button>
                                            <button onClick={() => setReportStyle('printable')}
                                                className={`flex-1 py-2 text-[10px] font-black uppercase transition-all ${reportStyle === 'printable' ? 'bg-primary text-white shadow-lg' : 'text-muted-foreground hover:text-foreground'}`}>
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
                                                            modernTemplateId === t.id ? "border-primary bg-primary/10 shadow-[0_0_15px_rgba(255,102,0,0.1)]" : "border-border bg-muted/20 hover:bg-muted/40"
                                                        )}
                                                    >
                                                        <div className={cn("w-8 h-8 mb-1 relative overflow-hidden", t.color)}>
                                                            <div className={cn("absolute inset-0.5 border-[0.5px]", t.border, "opacity-40")} />
                                                        </div>
                                                        <span className="text-[10px] font-black uppercase tracking-tighter text-foreground">{t.name}</span>
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
                                                <div className="flex gap-2">
                                                    <input value={form.student_name} onChange={e => setForm(f => ({ ...f, student_name: e.target.value }))} className={INPUT} />
                                                    <button
                                                        type="button"
                                                        onClick={saveStudentProfile}
                                                        disabled={savingProfile}
                                                        title="Save the corrected name & grade to the student's profile — updates everywhere (portal, records, login)"
                                                        className="flex-shrink-0 rounded-xl border border-primary/30 bg-primary/10 px-3 text-xs font-black text-primary hover:bg-primary/20 disabled:opacity-50 transition-colors"
                                                    >
                                                        {savingProfile ? 'Saving…' : 'Save to profile'}
                                                    </button>
                                                </div>
                                            </Field>
                                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                                <div className="p-3 bg-muted/20 border border-border rounded-xl">
                                                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-0.5">School</p>
                                                    <p className="text-sm text-muted-foreground font-semibold truncate">{sessionConfig.school_name || '—'}</p>
                                                </div>
                                                <div className="p-3 bg-muted/20 border border-border rounded-xl">
                                                    {/* CLASS = the student's grade level (Basic 1 / JSS 2) — isolated from the cohort. */}
                                                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest block mb-1">Class</label>
                                                    <select
                                                        value={profileGrade}
                                                        onChange={e => setProfileGrade(e.target.value)}
                                                        title="Student's grade level (their Class). Separate from the Section/cohort. Click 'Save to profile' to apply everywhere."
                                                        className="w-full bg-transparent text-sm text-foreground focus:outline-none transition-colors cursor-pointer">
                                                        <option value="" className="bg-background">Select —</option>
                                                        {Array.from(new Set([...(profileGrade && !(SINGLE_GRADES as readonly string[]).includes(profileGrade) ? [profileGrade] : []), ...SINGLE_GRADES])).map(g => <option key={g} value={g} className="bg-background">{g}</option>)}
                                                    </select>
                                                </div>
                                                <div className="p-3 bg-muted/20 border border-border rounded-xl">
                                                    {/* SECTION = the Rillcod cohort/programme group (e.g. "Quincy · Teen Dev · JSS 1-3"). */}
                                                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest block mb-1">Section</label>
                                                    <select
                                                        value={form.section_class}
                                                        onChange={e => setForm(f => ({ ...f, section_class: e.target.value }))}
                                                        title="The Rillcod cohort / class group (Section) — separate from the grade (Class)."
                                                        className="w-full bg-transparent text-sm text-foreground focus:outline-none transition-colors cursor-pointer">
                                                        <option value="" className="bg-background">Select —</option>
                                                        {CLASS_PRESETS.map(c => <option key={c} value={c} className="bg-background">{c}</option>)}
                                                        {distinctClasses.filter(c => !CLASS_PRESETS.includes(c)).map(c => <option key={c} value={c} className="bg-background">{c}</option>)}
                                                    </select>
                                                </div>
                                                <div className="p-3 bg-muted/20 border border-border rounded-xl">
                                                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest block mb-1">Gender</label>
                                                    <select
                                                        value={form.gender}
                                                        onChange={e => setForm(f => ({ ...f, gender: e.target.value as '' | 'male' | 'female' }))}
                                                        className="w-full bg-transparent text-sm text-foreground focus:outline-none transition-colors cursor-pointer">
                                                        <option value="" className="bg-background">—</option>
                                                        <option value="male" className="bg-background">Male</option>
                                                        <option value="female" className="bg-background">Female</option>
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
                                    <div className="flex items-center gap-2 px-4 py-2.5 bg-muted/10 border-b border-border">
                                        <span className="text-[10px]">📖</span>
                                        <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex-1">Module (this student)</h3>
                                        <span className="text-[11px] text-muted-foreground/50">Overrides session default</span>
                                    </div>
                                    <div className="p-4 grid grid-cols-2 gap-3">
                                        <Field label="Current Module">
                                            <input
                                                list="stu-cur-mod-list"
                                                value={form.student_current_module || sessionConfig.current_module}
                                                onChange={e => setForm(f => {
                                                    const val = e.target.value;
                                                    const sugg = getSuggestionsForCourse();
                                                    const idx = sugg.modules.indexOf(val);
                                                    const autoNext = idx >= 0 ? sugg.next[idx] : '';
                                                    return { ...f, student_current_module: val, ...(autoNext && !f.student_next_module ? { student_next_module: autoNext } : {}) };
                                                })}
                                                className={INPUT} placeholder={sessionConfig.current_module || 'e.g. Functions & Scope'} />
                                            <datalist id="stu-cur-mod-list">
                                                {getSuggestionsForCourse().modules.map(m => <option key={m} value={m} />)}
                                            </datalist>
                                        </Field>
                                        <Field label="Next Module">
                                            <input
                                                list="stu-nxt-mod-list"
                                                value={form.student_next_module || sessionConfig.next_module}
                                                onChange={e => setForm(f => ({ ...f, student_next_module: e.target.value }))}
                                                className={INPUT} placeholder={sessionConfig.next_module || 'e.g. OOP Basics'} />
                                            <datalist id="stu-nxt-mod-list">
                                                {getSuggestionsForCourse().next.map(m => <option key={m} value={m} />)}
                                            </datalist>
                                        </Field>
                                    </div>
                                </div>

                                {/* Scores — 6 weighted components */}
                                <EvidenceEditorPanel title="Performance Scores" icon="📊">
                                    <div className="space-y-4">
                                        {/* Quick-apply score profiles */}
                                        <div className="flex flex-wrap gap-2 pb-3 border-b border-border">
                                            <span className="text-[11px] font-black text-muted-foreground uppercase tracking-widest self-center flex-shrink-0">Quick:</span>
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
                                                    className={`px-3 py-1 text-[11px] font-black uppercase tracking-wider border rounded-xl transition-all ${
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
                                            { key: 'assessment_score',   label: 'Mid-term Assessment',         weight: '15%', color: '#f43f5e', hint: `CBT evaluation: ${studentStats.evalScore > 0 ? studentStats.evalScore + '%' : '—'}${studentStats.pendingCbt > 0 ? ` (${studentStats.pendingCbt} pending)` : ''}` },
                                        ] as { key: keyof typeof form; label: string; weight: string; color: string; hint: string }[]).map(({ key, label, weight, color, hint }) => {
                                            const val = Math.min(100, Math.max(0, parseInt(String(form[key])) || 0));
                                            const nudge = (delta: number) =>
                                                setForm(f => ({ ...f, [key]: String(Math.min(100, Math.max(0, (parseInt(String(f[key])) || 0) + delta))) }));
                                            return (
                                                <div key={key} className="space-y-1">
                                                    <div className="flex justify-between items-baseline">
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: color }} />
                                                            <label className="text-[11px] font-black text-muted-foreground uppercase tracking-widest">{label}</label>
                                                            <span className="text-[10px] text-muted-foreground/40 font-bold">{weight}</span>
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
                                                            <button type="button" onClick={() => nudge(-5)} className="px-1 py-0.5 text-[10px] font-black text-muted-foreground/50 hover:text-rose-400 hover:bg-rose-500/10 transition-all">−5</button>
                                                            <button type="button" onClick={() => nudge(-1)} className="px-1 py-0.5 text-[10px] font-black text-muted-foreground/50 hover:text-rose-400 hover:bg-rose-500/10 transition-all">−1</button>
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
                                                            <button type="button" onClick={() => nudge(1)} className="px-1 py-0.5 text-[10px] font-black text-muted-foreground/50 hover:text-emerald-400 hover:bg-emerald-500/10 transition-all">+1</button>
                                                            <button type="button" onClick={() => nudge(5)} className="px-1 py-0.5 text-[10px] font-black text-muted-foreground/50 hover:text-emerald-400 hover:bg-emerald-500/10 transition-all">+5</button>
                                                        </div>
                                                    </div>
                                                    <p className="text-[10px] text-muted-foreground/40 italic">{hint}</p>
                                                </div>
                                            );
                                        })}

                                        {/* Overall — weighted score display */}
                                        <div className="mt-1 pt-3 border-t border-border flex items-center justify-between">
                                            <div>
                                                <p className="text-[10px] font-black text-muted-foreground/40 uppercase tracking-widest mb-0.5">Weighted Overall</p>
                                                <p className="text-2xl font-black text-foreground tabular-nums">{overallScore}<span className="text-sm text-muted-foreground/50 ml-0.5">%</span></p>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <div className="text-right">
                                                    <p className="text-[10px] font-black text-muted-foreground/40 uppercase tracking-widest mb-0.5">Grade</p>
                                                    <span className="text-[10px] font-black text-muted-foreground/60 uppercase tracking-widest">{overallScore >= 45 ? 'Pass' : 'Below Pass'}</span>
                                                </div>
                                                <div className="w-12 h-12 flex flex-col items-center justify-center font-black border-2 border-primary/40 bg-primary/10 text-primary rounded-xl">
                                                    <span className="text-base leading-none">{waecCode}</span>
                                                    <span className="text-[7px] text-primary/60 font-bold">{overallGradeLetter}</span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Dynamic Weighted Contribution Progress Bar */}
                                        <div className="mt-2.5 space-y-1.5 bg-white/[0.01] border border-white/[0.04] p-3 rounded-2xl">
                                            <div className="flex items-center justify-between">
                                                <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Weight Contributions</span>
                                                <span className="text-[10px] text-muted-foreground font-bold">Sum: {overallScore}% / 100%</span>
                                            </div>
                                            <div className="w-full h-2 bg-white/[0.04] rounded-full overflow-hidden flex">
                                                <div className="h-full bg-indigo-500 transition-all duration-300" style={{ width: `${(parseInt(String(form.theory_score)) || 0) * 0.20}%` }} title={`Theory: ${Math.round((parseInt(String(form.theory_score)) || 0) * 0.20)}%`} />
                                                <div className="h-full bg-cyan-500 transition-all duration-300" style={{ width: `${(parseInt(String(form.classwork_score)) || 0) * 0.10}%` }} title={`Classwork: ${Math.round((parseInt(String(form.classwork_score)) || 0) * 0.10)}%`} />
                                                <div className="h-full bg-violet-500 transition-all duration-300" style={{ width: `${(parseInt(String(form.practical_score)) || 0) * 0.25}%` }} title={`Practical: ${Math.round((parseInt(String(form.practical_score)) || 0) * 0.25)}%`} />
                                                <div className="h-full bg-emerald-500 transition-all duration-300" style={{ width: `${(parseInt(String(form.attendance_score)) || 0) * 0.20}%` }} title={`Assignments: ${Math.round((parseInt(String(form.attendance_score)) || 0) * 0.20)}%`} />
                                                <div className="h-full bg-amber-500 transition-all duration-300" style={{ width: `${(parseInt(String(form.participation_score)) || 0) * 0.10}%` }} title={`Attendance: ${Math.round((parseInt(String(form.participation_score)) || 0) * 0.10)}%`} />
                                                <div className="h-full bg-rose-500 transition-all duration-300" style={{ width: `${(parseInt(String(form.assessment_score)) || 0) * 0.15}%` }} title={`Assessment: ${Math.round((parseInt(String(form.assessment_score)) || 0) * 0.15)}%`} />
                                            </div>
                                            <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground/60 leading-none">
                                                <span className="flex items-center gap-0.5"><span className="w-1 h-1 rounded-full bg-indigo-500" /> Theory ({Math.round((parseInt(String(form.theory_score)) || 0) * 0.20)}%)</span>
                                                <span className="flex items-center gap-0.5"><span className="w-1 h-1 rounded-full bg-cyan-500" /> Classwork ({Math.round((parseInt(String(form.classwork_score)) || 0) * 0.10)}%)</span>
                                                <span className="flex items-center gap-0.5"><span className="w-1 h-1 rounded-full bg-violet-500" /> Practical ({Math.round((parseInt(String(form.practical_score)) || 0) * 0.25)}%)</span>
                                                <span className="flex items-center gap-0.5"><span className="w-1 h-1 rounded-full bg-emerald-500" /> Asgns ({Math.round((parseInt(String(form.attendance_score)) || 0) * 0.20)}%)</span>
                                                <span className="flex items-center gap-0.5"><span className="w-1 h-1 rounded-full bg-amber-500" /> Att ({Math.round((parseInt(String(form.participation_score)) || 0) * 0.10)}%)</span>
                                                <span className="flex items-center gap-0.5"><span className="w-1 h-1 rounded-full bg-rose-500" /> Mid ({Math.round((parseInt(String(form.assessment_score)) || 0) * 0.15)}%)</span>
                                            </div>
                                        </div>
                                    </div>
                                </EvidenceEditorPanel>

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
                                                            Draft Text
                                                        </button>
                                                    </div>
                                                    {/* Quick-pick chips */}
                                                    <div className="flex flex-wrap gap-1.5 mb-2">
                                                         {picks.map(p => {
                                                             let score = 0;
                                                             if (key === 'participation_grade') score = parseFloat(form.classwork_score) || 0;
                                                             else if (key === 'projects_grade') score = parseFloat(form.practical_score) || 0;
                                                             else if (key === 'homework_grade') score = parseFloat(form.attendance_score) || 0;

                                                             let suggestions: string[] = [];
                                                             if (key === 'participation_grade') {
                                                                 if (score >= 85) suggestions = ['Fully Engaged', 'Active Learner', 'Consistently Attentive', 'Shows Initiative'];
                                                                 else if (score >= 70) suggestions = ['Mostly Engaged', 'Improving Steadily', 'Task Focused', 'Asks Good Questions'];
                                                                 else if (score >= 50) suggestions = ['Needs Encouragement', 'Helps Peers'];
                                                                 else suggestions = ['Rarely Participates', 'Easily Distracted'];
                                                             } else if (key === 'projects_grade') {
                                                                 if (score >= 85) suggestions = ['All Delivered', 'Strong Deliverables', 'Outstanding Work', 'Built & Deployed'];
                                                                 else if (score >= 70) suggestions = ['Projects Complete', 'Mostly Complete', 'Creative Solutions', 'Logic Correct'];
                                                                 else if (score >= 50) suggestions = ['Partially Submitted', 'Requires Rework'];
                                                                 else suggestions = ['Needs Improvement', 'Incomplete Labs'];
                                                             } else if (key === 'homework_grade') {
                                                                 if (score >= 85) suggestions = ['Always Submitted', 'Consistently On-time', 'Reliable Output', 'Improving Pattern'];
                                                                 else if (score >= 70) suggestions = ['Mostly Punctual', 'Above Average', 'Needs Catch-up'];
                                                                 else if (score >= 50) suggestions = ['Partially Complete', 'Improving Pattern', 'Inconsistent Effort'];
                                                                 else suggestions = ['Often Late', 'Rarely Submitted', 'Below Expectation'];
                                                             }

                                                             const isSuggested = suggestions.includes(p);
                                                             return (
                                                                 <button key={p} type="button"
                                                                     onClick={() => setForm(f => ({ ...f, [key]: p }))}
                                                                     className={`px-2 py-0.5 text-[11px] font-bold border transition-all rounded-md relative ${
                                                                         val === p
                                                                             ? 'bg-primary/25 border-primary text-primary shadow-sm shadow-primary/10'
                                                                             : isSuggested
                                                                                 ? 'bg-primary/5 border-primary/30 text-foreground hover:border-primary/50 hover:bg-primary/10'
                                                                                 : 'bg-muted/30 border-border text-muted-foreground hover:border-primary/30 hover:text-foreground/80'
                                                                     }`}>
                                                                     {p}
                                                                     {isSuggested && val !== p && (
                                                                         <span className="absolute -top-1 -right-1 flex h-1.5 w-1.5">
                                                                             <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                                                                             <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-primary"></span>
                                                                         </span>
                                                                     )}
                                                                 </button>
                                                             );
                                                         })}
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
                                <NarrativeEditorPanel title="Report-Visible Evaluation" icon="✍️">
                                    <div className="space-y-5">
                                        <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-[11px] text-muted-foreground leading-relaxed">
                                            These two comments are printed on the report card and shown to parents. Use <span className="font-black text-primary">Draft Text</span> for a starting point, then review and edit it in your own voice before publishing.
                                        </div>
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
                                                            {generating === field ? 'Drafting...' : 'Draft Text'}
                                                        </button>
                                                    </div>
                                                    <textarea rows={5} value={(form as any)[field]}
                                                        onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
                                                        placeholder={field === 'key_strengths' ? 'Visible on report: what the student did well...' : 'Visible on report: what the student should improve next...'}
                                                        className={`${INPUT} resize-none text-sm leading-relaxed`} />
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {/* Smart Comments Phrase Bank Quick-Picks */}
                                    <div className="bg-card/50 border border-border p-4 rounded-xl mt-3 space-y-3">
                                        <div>
                                            <p className="text-[10px] font-black text-cyan-400 uppercase tracking-widest flex items-center gap-1">
                                                <SparklesIcon className="w-3.5 h-3.5" /> Optional Phrase Bank
                                            </p>
                                            <p className="text-[11px] text-muted-foreground mt-0.5">Only phrases inserted into the two comment boxes above will appear on the report.</p>
                                        </div>
                                        <div className="w-full h-px bg-border/40" />
                                        <div>
                                            <p className="text-[10px] font-black text-cyan-400 uppercase tracking-widest flex items-center gap-1">
                                                <RocketLaunchIcon className="w-3.5 h-3.5" /> African Innovation Phrase Bank
                                            </p>
                                            <p className="text-[11px] text-muted-foreground mt-0.5">Quick-insert local agritech, energy, and fintech remarks:</p>
                                        </div>
                                        <div className="flex flex-wrap gap-1.5">
                                            {[
                                                { text: "Built a highly creative agritech sensor script, showing deep community problem-solving mindset.", label: "🌾 Northern Agritech" },
                                                { text: "Successfully simulated fintech ledger logic inspired by USSD payment models.", label: "💳 USSD Fintech" },
                                                { text: "Designed a smart priority routing simulator based on Lagos BRT transit priorities.", label: "🚦 BRT Smart Transit" },
                                                { text: "Highly proficient in applying coordinate matrices to localized graphic canvases.", label: "🎨 Naija Canvas" }
                                            ].map((item, i) => (
                                                <button
                                                    key={i}
                                                    type="button"
                                                    onClick={() => setForm(f => {
                                                        const current = f.key_strengths ? f.key_strengths.trim() : '';
                                                        const divider = current ? (current.endsWith('.') ? ' ' : '. ') : '';
                                                        return { ...f, key_strengths: `${current}${divider}${item.text}` };
                                                    })}
                                                    className="px-2 py-1 text-[11px] font-bold bg-cyan-500/5 hover:bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 rounded-xl transition-all"
                                                >
                                                    + {item.label}
                                                </button>
                                            ))}
                                        </div>
                                        <div className="w-full h-px bg-border/40" />
                                        <button
                                            type="button"
                                            onClick={() => setShowValuesPhraseBank(v => !v)}
                                            className="text-[10px] font-black uppercase tracking-widest text-amber-400 hover:text-amber-300 transition-colors"
                                        >
                                            {showValuesPhraseBank ? 'Hide' : 'Show'} optional faith/value analogies
                                        </button>
                                        {showValuesPhraseBank && (
                                            <>
                                                <div>
                                                    <p className="text-[10px] font-black text-amber-400 uppercase tracking-widest flex items-center gap-1">
                                                        <SparklesIcon className="w-3.5 h-3.5 animate-pulse" /> Faith / Values Analogies
                                                    </p>
                                                    <p className="text-[11px] text-muted-foreground mt-0.5">Use only where the school/client wants values-based wording. These insert into Strengths.</p>
                                                </div>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {[
                                                        { text: "Shows a builder's discipline in constructing clear and reliable code structures.", label: "Builder Discipline" },
                                                        { text: "Demonstrates wisdom and patience when breaking complex problems into simple logical steps.", label: "Wisdom & Patience" },
                                                        { text: "Shows courage and resilience when debugging difficult tasks.", label: "Resilient Debugger" },
                                                        { text: "Approaches logic design with focus, precision, and consistent effort.", label: "Focused Precision" },
                                                        { text: "Collaborates well and helps reduce confusion during group technical tasks.", label: "Team Unity" }
                                                    ].map((item, i) => (
                                                        <button
                                                            key={i}
                                                            type="button"
                                                            onClick={() => setForm(f => {
                                                                const current = f.key_strengths ? f.key_strengths.trim() : '';
                                                                const divider = current ? (current.endsWith('.') ? ' ' : '. ') : '';
                                                                return { ...f, key_strengths: `${current}${divider}${item.text}` };
                                                            })}
                                                            className="px-2 py-1 text-[11px] font-bold bg-amber-500/5 hover:bg-amber-500/10 border border-amber-500/20 text-amber-300 rounded-xl transition-all"
                                                        >
                                                            + {item.label}
                                                        </button>
                                                    ))}
                                                </div>
                                            </>
                                        )}
                                        <div className="w-full h-px bg-border/40" />
                                        <div>
                                            <p className="text-[10px] font-black text-rose-400 uppercase tracking-widest flex items-center gap-1">
                                                <ExclamationTriangleIcon className="w-3.5 h-3.5" /> Actionable Recommendations Bank
                                            </p>
                                            <p className="text-[11px] text-muted-foreground mt-0.5">Quick-insert localized growth recommendations:</p>
                                        </div>
                                        <div className="flex flex-wrap gap-1.5">
                                            {[
                                                { text: "Encouraged to develop greater debugging patience, treating errors as learning stepping stones.", label: "🐛 Debugging Patience" },
                                                { text: "Focusing on completing assignments regularly will consolidate their core logical skills.", label: "📝 Submission Consistency" },
                                                { text: "We recommend regular reviews of class visualizers at home to strengthen practical understanding.", label: "🏠 Home Practice" },
                                                { text: "Encouraged to actively collaborate in review sessions and speak up during brainstorming.", label: "🤝 Active Reviews" }
                                            ].map((item, i) => (
                                                <button
                                                    key={i}
                                                    type="button"
                                                    onClick={() => setForm(f => {
                                                        const current = f.areas_for_growth ? f.areas_for_growth.trim() : '';
                                                        const divider = current ? (current.endsWith('.') ? ' ' : '. ') : '';
                                                        return { ...f, areas_for_growth: `${current}${divider}${item.text}` };
                                                    })}
                                                    className="px-2 py-1 text-[11px] font-bold bg-rose-500/5 hover:bg-rose-500/10 border border-rose-500/20 text-rose-300 rounded-xl transition-all"
                                                >
                                                    + {item.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </NarrativeEditorPanel>
                            </div>

                        </div>

                        {/* ── Inline Live Preview ── */}
                        <div className="bg-card border border-border rounded-xl overflow-hidden">
                            <button
                                type="button"
                                onClick={() => {
                                    const next = !livePreviewOpen;
                                    setLivePreviewOpen(next);
                                    if (next) setHasPreviewedCurrentReport(true);
                                }}
                                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors"
                            >
                                <EyeIcon className="w-4 h-4 text-primary flex-shrink-0" />
                                <div className="flex-1 text-left">
                                    <p className="text-xs font-black text-primary uppercase tracking-widest">Live Preview</p>
                                    <p className="text-[10px] text-muted-foreground mt-0.5">
                                        {livePreviewOpen ? 'Report card updates in real-time as you type' : 'Tap to see the report card live — no modal needed'}
                                    </p>
                                </div>
                                <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-lg ${
                                    livePreviewOpen ? 'bg-emerald-500/20 text-emerald-400' : 'bg-primary/20 text-primary'
                                }`}>
                                    {livePreviewOpen ? '✓ Live' : 'Show'}
                                </span>
                                {livePreviewOpen
                                    ? <ChevronUpIcon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                                    : <ChevronDownIcon className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
                            </button>

                            {livePreviewOpen && (
                                <div className="border-t border-border">
                                    {/* Style + template selector */}
                                    <div className="flex flex-wrap items-center gap-2 px-4 py-2 bg-muted/20 border-b border-border">
                                        <div className="flex bg-muted/30 border border-border p-0.5 rounded-lg">
                                            {(['standard', 'modern', 'printable'] as const).map(s => (
                                                <button key={s} type="button" onClick={() => setReportStyle(s)}
                                                    className={`px-3 py-1 text-[10px] font-black uppercase transition-all rounded-md ${reportStyle === s ? 'bg-primary text-white' : 'text-muted-foreground hover:text-foreground'}`}>
                                                    {s}
                                                </button>
                                            ))}
                                        </div>
                                        {reportStyle === 'modern' && (
                                            <div className="flex gap-1">
                                                {[
                                                    { id: 'industrial', label: 'Ind' },
                                                    { id: 'executive', label: 'Exec' },
                                                    { id: 'futuristic', label: 'Fut' },
                                                ].map(t => (
                                                    <button key={t.id} type="button"
                                                        onClick={() => setModernTemplateId(t.id as any)}
                                                        className={`px-2 py-1 text-[10px] font-black uppercase rounded-md border transition-all ${
                                                            modernTemplateId === t.id
                                                                ? 'bg-primary border-primary text-white'
                                                                : 'bg-card border-border text-muted-foreground hover:text-foreground'
                                                        }`}>
                                                        {t.label}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                        <div className="ml-auto flex items-center gap-1.5">
                                            <button type="button"
                                                onClick={() => pdfRef.current && printElement(pdfRef.current)}
                                                className="flex items-center gap-1 px-2 py-1 bg-card border border-border hover:bg-muted text-muted-foreground text-[10px] font-bold rounded-lg transition-colors">
                                                <PrinterIcon className="w-3 h-3" /> Print
                                            </button>
                                            <button type="button"
                                                onClick={() => { setHasPreviewedCurrentReport(true); setShowPreview(true); }}
                                                className="flex items-center gap-1 px-2 py-1 bg-primary/20 border border-primary/30 hover:bg-primary/30 text-primary text-[10px] font-bold rounded-lg transition-colors">
                                                <SparklesIcon className="w-3 h-3" /> Full Screen
                                            </button>
                                        </div>
                                    </div>

                                    {/* Scaled live report card */}
                                    <div ref={livePreviewRef} className="p-3 sm:p-4 bg-black/20">
                                        <ScaledReportCard report={deferredPreviewData} responsive>
                                            {reportStyle === 'modern' ? (
                                                <ModernReportCard report={deferredPreviewData} orgSettings={branding as any} />
                                            ) : reportStyle === 'printable' ? (
                                                <PrintableReport report={deferredPreviewData} orgSettings={branding as any} />
                                            ) : (
                                                <ReportCard report={deferredPreviewData} orgSettings={branding as any} />
                                            )}
                                        </ScaledReportCard>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Sticky Action Bar */}
                        <PublishControls>
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
                                            <p className="text-[11px] text-muted-foreground leading-none mt-0.5 truncate">
                                                {form.section_class || sessionConfig.section_class || selectedStudent?.section_class || ''}
                                            </p>
                                        </div>
                                        {existingReport && (
                                            <span className={`flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded-full font-black ${form.is_published ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
                                                {form.is_published ? '✓ Published' : 'Draft'}
                                            </span>
                                        )}
                                        {isDirty && (
                                            <span className="flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded-full font-black bg-orange-500/20 text-orange-400 animate-pulse">
                                                ● Unsaved
                                            </span>
                                        )}
                                    </div>
                                    <span className="text-[10px] font-black text-muted-foreground flex-shrink-0 tabular-nums">
                                        {currentStudentIdx + 1} / {filteredStudents.length}
                                    </span>
                                </div>

                                {/* Actions row — scrolls horizontally on very narrow phones instead
                                    of overflowing the page; normal layout once it fits. */}
                                <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto lg:overflow-visible [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                                    <button onClick={() => handleSave(false)} disabled={saving || publishing}
                                        className="flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-4 py-2 sm:py-2.5 bg-card shadow-sm hover:bg-muted text-foreground text-[10px] sm:text-xs font-bold rounded-xl transition-all disabled:opacity-50 flex-shrink-0">
                                        {saving ? <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" /> : <CloudArrowUpIcon className="w-3.5 h-3.5" />}
                                        <span>{saving ? 'Saving…' : 'Draft'}</span>
                                    </button>
                                    <button onClick={() => saveAndNext(true)} disabled={saving || publishing || !canPublishReport}
                                        title={!canPublishReport ? publishQualityIssues[0] : 'Publish this report'}
                                        className="flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-4 py-2 sm:py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] sm:text-xs font-bold rounded-xl transition-all disabled:opacity-50 shadow-lg shadow-emerald-900/20 flex-shrink-0">
                                        {publishing ? <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" /> : <RocketLaunchIcon className="w-3.5 h-3.5" />}
                                        <span>{publishing ? 'Publishing…' : 'Publish'}</span>
                                    </button>
                                    <button onClick={() => { setHasPreviewedCurrentReport(true); setShowPreview(true); }}
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
                                                if (isDirty) await handleSave(false);
                                                const idx = currentStudentIdx - 1;
                                                if (idx >= 0) {
                                                    const navList = sessionStudents.current.length > 0 ? sessionStudents.current : filteredStudents;
                                                    await selectStudent(navList[idx] as PortalUser, idx);
                                                }
                                            }}
                                            title="Previous student"
                                            className="flex items-center gap-1 px-2.5 sm:px-3 py-2 sm:py-2.5 bg-card shadow-sm hover:bg-muted text-muted-foreground text-[10px] sm:text-xs font-bold rounded-xl transition-all disabled:opacity-25 border border-border">
                                            <ArrowLeftIcon className="w-3.5 h-3.5" />
                                            <span className="hidden sm:inline">Prev</span>
                                        </button>
                                        {/* Next student / finish */}
                                        {currentStudentIdx < (sessionStudents.current.length > 0 ? sessionStudents.current.length : filteredStudents.length) - 1 ? (
                                            <button onClick={() => saveAndNext(false)} disabled={saving || publishing}
                                                className="flex items-center gap-1 sm:gap-1.5 px-3 sm:px-5 py-2 sm:py-2.5 bg-gradient-to-r from-primary to-indigo-600 hover:from-primary hover:to-indigo-500 text-white text-[10px] sm:text-xs font-black rounded-xl transition-all disabled:opacity-50 shadow-xl shadow-primary/30">
                                                <span>Next</span>
                                                <ChevronRightIcon className="w-3.5 h-3.5" />
                                            </button>
                                        ) : (
                                            <button onClick={async () => { if (isDirty) { const saved = await handleSave(false); if (!saved) return; } prepareNextClass(); }} disabled={saving || publishing}
                                                className="flex items-center gap-1 sm:gap-1.5 px-3 sm:px-5 py-2 sm:py-2.5 bg-gradient-to-r from-primary to-indigo-600 hover:from-primary hover:to-indigo-500 text-white text-[10px] sm:text-xs font-black rounded-xl transition-all disabled:opacity-50 shadow-xl shadow-primary/30">
                                                <CheckCircleIcon className="w-3.5 h-3.5" />
                                                <span>Save &amp; Next Class</span>
                                            </button>
                                        )}
                                    </div>
                                </div>
                                <div className={`rounded-xl border px-3 py-2 text-[10px] font-bold ${canPublishReport ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-amber-500/30 bg-amber-500/10 text-amber-300'}`}>
                                    {canPublishReport ? (
                                        <div className="flex items-center gap-2">
                                            <CheckCircleIcon className="w-3.5 h-3.5 flex-shrink-0" />
                                            <span>Publish quality check passed. This report is ready to go live.</span>
                                        </div>
                                    ) : (
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-2">
                                                <ExclamationTriangleIcon className="w-3.5 h-3.5 flex-shrink-0" />
                                                <span>{publishQualityIssues.length} item{publishQualityIssues.length === 1 ? '' : 's'} required before publishing.</span>
                                            </div>
                                            <ul className="list-disc pl-5 space-y-0.5">
                                                {publishQualityIssues.slice(0, 4).map((issue) => <li key={issue}>{issue}</li>)}
                                                {publishQualityIssues.length > 4 && <li>{publishQualityIssues.length - 4} more item(s)</li>}
                                            </ul>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </PublishControls>
                    </div>
                )
                }
            </div >

            {/* ── Branding Settings Modal ── */}
            {
                showSettings && (
                    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/80 backdrop-blur-sm">
                        <div className="bg-background border border-border rounded-t-[32px] sm:rounded-[32px] w-full sm:max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
                            <div className="px-6 py-5 border-b border-border flex items-center justify-between bg-muted/20">
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

                            <div className="p-6 bg-muted/20 border-t border-border flex justify-end gap-3">
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
                <>
                <div id="builder-preview-root" className="fixed inset-0 z-50 flex flex-col bg-background">
                    <div className="no-print flex flex-wrap items-center gap-2 px-3 sm:px-6 py-3 border-b border-border bg-card overflow-x-auto">
                        <button onClick={() => setShowPreview(false)} className="p-2 hover:bg-muted rounded-xl transition-colors flex-shrink-0">
                            <ArrowLeftIcon className="w-5 h-5 text-muted-foreground" />
                        </button>
                        <div className="min-w-0 mr-2">
                            <h3 className="text-foreground font-black text-sm truncate">{form.student_name}</h3>
                            <p className="text-[11px] text-muted-foreground uppercase tracking-[0.2em] font-bold hidden sm:block">Report Card Preview</p>
                        </div>
                        <div className="flex bg-muted/30 border border-border p-0.5 rounded-lg flex-shrink-0">
                            <button onClick={() => setReportStyle('standard')}
                                className={`px-2 sm:px-4 py-1.5 text-[11px] font-black uppercase transition-all rounded-md ${reportStyle === 'standard' ? 'bg-primary text-white' : 'text-muted-foreground hover:text-foreground'}`}>
                                Standard
                            </button>
                            <button onClick={() => setReportStyle('modern')}
                                className={`px-2 sm:px-4 py-1.5 text-[11px] font-black uppercase transition-all rounded-md ${reportStyle === 'modern' ? 'bg-primary text-white' : 'text-muted-foreground hover:text-foreground'}`}>
                                Modern
                            </button>
                            <button onClick={() => setReportStyle('printable')}
                                className={`px-2 sm:px-4 py-1.5 text-[11px] font-black uppercase transition-all rounded-md ${reportStyle === 'printable' ? 'bg-primary text-white' : 'text-muted-foreground hover:text-foreground'}`}>
                                Printable
                            </button>
                        </div>

                        {reportStyle === 'modern' && (
                            <div className="flex bg-muted/30 border border-border p-0.5 gap-1 flex-shrink-0">
                                {[
                                    { id: 'industrial', name: 'Industrial', color: 'bg-slate-900', border: 'border-primary' },
                                    { id: 'executive', name: 'Executive', color: 'bg-[#FDFBF2]', border: 'border-slate-800' },
                                    { id: 'futuristic', name: 'Futuristic', color: 'bg-[#050510]', border: 'border-cyan-500' }
                                ].map((t) => (
                                    <button
                                        key={t.id}
                                        onClick={() => setModernTemplateId(t.id as any)}
                                        className={cn(
                                            "group relative w-14 sm:w-20 h-8 sm:h-10 flex flex-col items-center justify-center transition-all overflow-hidden",
                                            modernTemplateId === t.id ? "ring-2 ring-primary ring-offset-1 ring-offset-card" : "opacity-40 hover:opacity-100"
                                        )}
                                    >
                                        <div className={cn("absolute inset-0", t.color)} />
                                        <div className={cn("absolute inset-1 border-[0.5px]", t.border, "opacity-40")} />
                                        <span className={cn(
                                            "relative z-10 text-[10px] font-black uppercase tracking-tighter",
                                            t.id === 'executive' ? "text-slate-800" : "text-white"
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
                        <div className="flex items-center gap-1.5 ml-auto flex-shrink-0">
                            <button
                                onClick={() => pdfRef.current && printElement(pdfRef.current)}
                                className="flex items-center gap-1.5 px-3 sm:px-5 py-2 bg-card border border-border hover:bg-muted text-foreground text-xs font-black rounded-xl transition-all"
                            >
                                <PrinterIcon className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Print</span>
                            </button>
                            <button onClick={downloadPDF} disabled={isGeneratingPdf}
                                className="flex items-center gap-1.5 px-3 sm:px-5 py-2 bg-primary hover:bg-primary text-foreground text-xs font-black rounded-xl shadow-lg shadow-primary/30 transition-all disabled:opacity-50">
                                {isGeneratingPdf ? <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" /> : <PrinterIcon className="w-3.5 h-3.5" />}
                                <span>{isGeneratingPdf ? 'Processing...' : 'PDF'}</span>
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
                                            `Progress report for ${form.student_name} — ${sessionConfig.report_term} — Rillcod Technologies`,
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
                                className="flex items-center gap-1.5 px-3 sm:px-5 py-2 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white text-xs font-black rounded-xl shadow-lg shadow-green-900/30 transition-all"
                            >
                                {isSharingPdf
                                    ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                    : <WhatsAppIcon className="w-3.5 h-3.5" />}
                                <span className="hidden sm:inline">{isSharingPdf ? 'Preparing…' : 'Share'}</span>
                            </button>
                        </div>
                    </div>
                    <div ref={previewContainerRef} className="flex-1 overflow-auto p-2 sm:p-6 bg-black/40">
                        {/* Outer wrapper sized to scaled A4 dimensions so scroll area is correct */}
                        <div style={{ width: Math.round(794 * previewScale), minHeight: Math.round(1122 * previewScale), margin: '0 auto' }}>
                            <div className="overflow-hidden bg-white shadow-2xl"
                                style={{ width: '210mm', minHeight: '297mm', transform: `scale(${previewScale})`, transformOrigin: 'top left' }}>
                                {reportStyle === 'modern' ? (
                                    <ModernReportCard report={deferredPreviewData} orgSettings={branding as any} />
                                ) : reportStyle === 'printable' ? (
                                    <PrintableReport report={deferredPreviewData} orgSettings={branding as any} />
                                ) : (
                                    <ReportCard report={deferredPreviewData} orgSettings={branding as any} />
                                )}
                            </div>
                        </div>
                    </div>
                </div>
                </>
            )}

            <div id="pdf-print-target" style={{ position: 'fixed', left: -9999, top: 0, width: '210mm', pointerEvents: 'none', zIndex: -1 }}>
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
