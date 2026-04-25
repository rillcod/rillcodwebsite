// @refresh reset
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import {
    ArrowLeftIcon, PlusIcon, TrashIcon, CheckIcon, CheckCircleIcon,
    UserGroupIcon, ArrowPathIcon, ExclamationTriangleIcon, ChevronRightIcon,
    ChevronLeftIcon, CodeBracketIcon, LinkIcon, DocumentIcon, PhotoIcon,
    PencilSquareIcon, BoltIcon, ClipboardDocumentListIcon, SparklesIcon,
    CalendarDaysIcon, StarIcon, RocketLaunchIcon, BeakerIcon, GlobeAltIcon,
    PresentationChartBarIcon, CpuChipIcon, PaintBrushIcon,
} from '@/lib/icons';

// ── Types ─────────────────────────────────────────────────────────────────────
interface Group { id: string; name: string; studentIds: string[] }
interface RubricCriterion { id: string; name: string; desc: string; maxPts: number }

// ── Constants ─────────────────────────────────────────────────────────────────
const CATEGORIES = [
    { key: 'coding',       label: 'Coding',         icon: CodeBracketIcon, color: '#6366f1' },
    { key: 'web',          label: 'Web Dev',         icon: GlobeAltIcon,    color: '#06b6d4' },
    { key: 'ai',           label: 'AI / ML',         icon: SparklesIcon,    color: '#8b5cf6' },
    { key: 'design',       label: 'Design',          icon: PaintBrushIcon,  color: '#f59e0b' },
    { key: 'research',     label: 'Research',        icon: BeakerIcon,      color: '#10b981' },
    { key: 'hardware',     label: 'Hardware / IoT',  icon: CpuChipIcon,     color: '#ef4444' },
    { key: 'presentation', label: 'Presentation',    icon: PresentationChartBarIcon, color: '#ec4899' },
];

const DIFFICULTIES = [
    {
        key: 'beginner',
        label: 'Beginner',
        sub: 'No prior experience needed',
        stars: 1,
        color: 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300',
        dot: 'bg-emerald-500',
        dotColor: '#10b981',
        badge: 'Great for first-timers',
    },
    {
        key: 'intermediate',
        label: 'Intermediate',
        sub: 'Basic coding knowledge required',
        stars: 2,
        color: 'bg-amber-500/10 border-amber-500/40 text-amber-300',
        dot: 'bg-amber-500',
        dotColor: '#f59e0b',
        badge: 'Some experience needed',
    },
    {
        key: 'advanced',
        label: 'Advanced',
        sub: 'Strong programming skills needed',
        stars: 3,
        color: 'bg-rose-500/10 border-rose-500/40 text-rose-300',
        dot: 'bg-rose-500',
        dotColor: '#ef4444',
        badge: 'For experienced students',
    },
];

const COMMON_TAGS = [
    'python', 'javascript', 'html', 'css', 'typescript', 'react', 'scratch',
    'arduino', 'robotics', 'web', 'mobile', 'game', 'ai', 'data-science',
    'research', 'iot', 'hardware', 'animation', 'database', 'api',
];

const SUBMISSION_TYPES = [
    { key: 'link',       label: 'Website / GitHub Link',       Icon: LinkIcon,                 desc: 'Student pastes a URL to their work',                          color: '#6366f1' },
    { key: 'code',       label: 'Code (Direct / Playground)',   Icon: CodeBracketIcon,          desc: 'Code written or auto-captured from Playground',               color: '#06b6d4' },
    { key: 'file',       label: 'File / Document URL',          Icon: DocumentIcon,             desc: 'Hosted file, Google Drive or Dropbox link',                   color: '#8b5cf6' },
    { key: 'screenshot', label: 'Screenshot Image URL',         Icon: PhotoIcon,                desc: 'Direct image link (Imgur, Cloudinary, etc.)',                  color: '#f59e0b' },
    { key: 'text',       label: 'Written Explanation',          Icon: PencilSquareIcon,         desc: 'Student types a description, reflection or writeup',           color: '#10b981' },
];

const GRADING_MODES = [
    {
        key: 'manual',
        label: 'Manual Grading',
        icon: PencilSquareIcon,
        desc: 'You review and grade each submission — full control over score and feedback',
        color: 'border-primary/40 bg-primary/10 text-primary',
    },
    {
        key: 'auto',
        label: 'Auto + Manual',
        icon: BoltIcon,
        desc: 'System auto-grades on submit (completeness check). You can override.',
        color: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
        breakdown: ['+25 pts valid link', '+25 pts code >50 chars', '+25 pts file/screenshot', '+25 pts written text'],
    },
    {
        key: 'rubric',
        label: 'Rubric-Based',
        icon: ClipboardDocumentListIcon,
        desc: 'Define grading criteria with individual point values. Most structured method.',
        color: 'border-violet-500/40 bg-violet-500/10 text-violet-300',
    },
];

const STEPS = [
    { n: 1, label: 'Details',    icon: ClipboardDocumentListIcon },
    { n: 2, label: 'Submission', icon: BoltIcon                  },
    { n: 3, label: 'Students',   icon: UserGroupIcon              },
    { n: 4, label: 'Review',     icon: RocketLaunchIcon           },
];

const INPUT    = 'w-full px-4 py-2.5 bg-white/5 border border-white/10 text-sm text-white placeholder-white/20 focus:outline-none focus:border-violet-500 transition-colors';
const LABEL    = 'block text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mb-1.5';
const CARD     = 'bg-white/[0.02] border border-white/[0.06] p-6';

// ── Page ─────────────────────────────────────────────────────────────────────
export default function NewProjectActivityPage() {
    const router = useRouter();
    const { profile, loading: authLoading } = useAuth();
    const isStaff = profile?.role === 'admin' || profile?.role === 'teacher';
    const searchParamsRaw = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    const preLessonPlanId = searchParamsRaw?.get('lesson_plan_id');
    const preWeek = searchParamsRaw?.get('week');

    const [step, setStep] = useState(1);
    const [students, setStudents] = useState<any[]>([]);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    // AI generation
    const [aiOpen, setAiOpen]       = useState(false);
    const [aiPrompt, setAiPrompt]   = useState('');
    const [aiLoading, setAiLoading] = useState(false);
    const [aiError, setAiError]     = useState('');

    // Step 1 — Details
    const [title, setTitle]           = useState('');
    const [category, setCategory]     = useState('coding');
    const [difficulty, setDifficulty] = useState('intermediate');
    const [description, setDescription]   = useState('');
    const [instructions, setInstructions] = useState('');
    const [dueDate, setDueDate]       = useState('');
    const [maxPoints, setMaxPoints]   = useState('100');
    const [tagList, setTagList]       = useState<string[]>([]);
    const [customTagInput, setCustomTagInput] = useState('');

    // Step 2 — Submission & Grading
    const [selectedTypes, setSelectedTypes] = useState<string[]>(['link', 'code', 'text']);
    const [gradingMode, setGradingMode]     = useState<'manual' | 'auto' | 'rubric'>('manual');
    const [rubric, setRubric]               = useState<RubricCriterion[]>([
        { id: 'r1', name: 'Functionality', desc: 'Does the project work as required?', maxPts: 40 },
        { id: 'r2', name: 'Code Quality',  desc: 'Is the code clean and well-organized?', maxPts: 30 },
        { id: 'r3', name: 'Creativity',    desc: 'Does the student show original thinking?', maxPts: 30 },
    ]);

    // Step 3 — Visibility & Assignment
    // Visibility: who can SEE this activity
    const [visibilityType, setVisibilityType] = useState<'school' | 'class'>('school');
    const [targetSchoolId, setTargetSchoolId]   = useState('');
    const [targetSchoolName, setTargetSchoolName] = useState('');
    const [targetClassId, setTargetClassId]   = useState('');
    const [targetClassName, setTargetClassName] = useState('');
    const [assignedSchools, setAssignedSchools] = useState<any[]>([]);
    const [classes, setClasses]               = useState<any[]>([]);
    const [classesLoading, setClassesLoading] = useState(false);
    // Work mode: HOW students work on it
    const [workMode, setWorkMode] = useState<'individual' | 'specific' | 'group'>('individual');
    const [isGroupActivity, setIsGroupActivity] = useState(false);
    const [groups, setGroups]                   = useState<Group[]>([{ id: 'g1', name: 'Group 1', studentIds: [] }]);
    const [targetStudentIds, setTargetStudentIds] = useState<string[]>([]);
    const [studentSearch, setStudentSearch]     = useState('');

    useEffect(() => {
        if (authLoading || !isStaff) return;
        Promise.all([
            fetch('/api/portal-users?role=student&scoped=true', { cache: 'no-store' }).then(r => r.json()),
            fetch('/api/teacher-schools', { cache: 'no-store' }).then(r => r.json()),
            fetch('/api/classes', { cache: 'no-store' }).then(r => r.json()),
        ]).then(([sj, schj, cj]) => {
            setStudents(sj.data || []);
            setAssignedSchools(schj.data || []);
            setClasses(cj.data || []);
        });
    }, [authLoading, isStaff]);  

    // Re-load classes when a target school is selected
    async function handleSchoolSelect(schoolId: string, schoolName: string) {
        setTargetSchoolId(schoolId);
        setTargetSchoolName(schoolName);
        setTargetClassId('');
        setTargetClassName('');
        if (!schoolId) return;
        setClassesLoading(true);
        try {
            const r = await fetch(`/api/classes?school_id=${schoolId}`, { cache: 'no-store' });
            const j = await r.json();
            setClasses(j.data || []);
        } finally { setClassesLoading(false); }
    }

    function toggleTargetStudent(id: string) {
        setTargetStudentIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    }

    // ── Rubric helpers ────────────────────────────────────────────────────────
    function addCriterion() {
        setRubric(r => [...r, { id: `r${Date.now()}`, name: '', desc: '', maxPts: 10 }]);
    }
    function removeCriterion(id: string) { setRubric(r => r.filter(c => c.id !== id)); }
    function updateCriterion(id: string, field: keyof RubricCriterion, val: any) {
        setRubric(r => r.map(c => c.id === id ? { ...c, [field]: val } : c));
    }
    const rubricTotal = rubric.reduce((s, c) => s + (Number(c.maxPts) || 0), 0);

    // ── Group helpers ─────────────────────────────────────────────────────────
    function addGroup() {
        setGroups(g => [...g, { id: `g${Date.now()}`, name: `Group ${g.length + 1}`, studentIds: [] }]);
    }
    function removeGroup(id: string) { setGroups(g => g.filter(x => x.id !== id)); }
    function toggleInGroup(groupId: string, studentId: string) {
        setGroups(gs => gs.map(g => {
            if (g.id !== groupId) return g;
            const has = g.studentIds.includes(studentId);
            return { ...g, studentIds: has ? g.studentIds.filter(x => x !== studentId) : [...g.studentIds, studentId] };
        }));
    }
    function getStudentGroup(sid: string) { return groups.find(g => g.studentIds.includes(sid)); }

    // ── AI generation ─────────────────────────────────────────────────────────
    async function handleAiGenerate() {
        if (!aiPrompt.trim()) return;
        setAiLoading(true); setAiError('');
        try {
            const res = await fetch('/api/ai/project-gen', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt: aiPrompt }),
            });
            const j = await res.json();
            if (!res.ok) throw new Error(j.error || 'Generation failed');
            const d = j.data;
            if (d.title)        setTitle(d.title);
            if (d.description)  setDescription(d.description);
            if (d.instructions) setInstructions(d.instructions);
            if (d.category && CATEGORIES.find(c => c.key === d.category)) setCategory(d.category);
            if (d.difficulty && DIFFICULTIES.find(x => x.key === d.difficulty)) setDifficulty(d.difficulty);
            if (Array.isArray(d.tags)) setTagList(d.tags.slice(0, 8));
            if (Array.isArray(d.submission_types)) setSelectedTypes(d.submission_types);
            setAiOpen(false);
            setAiPrompt('');
        } catch (err: any) {
            setAiError(err.message);
        } finally {
            setAiLoading(false);
        }
    }

    // ── Validation ────────────────────────────────────────────────────────────
    function canProceed(): boolean {
        if (step === 1) return title.trim().length >= 3;
        if (step === 2) return selectedTypes.length > 0;
        return true;
    }

    // ── Submit ────────────────────────────────────────────────────────────────
    async function handlePublish(isDraft = false) {
        if (!title.trim()) { setError('Title is required'); return; }
        setSaving(true); setError('');
        try {
            const tagList_ = tagList;
            const isGroup = workMode === 'group';
            const payload: any = {
                title:            title.trim(),
                description:      description.trim() || null,
                instructions:     instructions.trim() || null,
                due_date:         dueDate || null,
                max_points:       gradingMode === 'rubric' ? rubricTotal : (parseInt(maxPoints) || 100),
                assignment_type:  'project',
                is_active:        !isDraft,
                // use selected school if set, otherwise fall back to teacher's primary school
                school_id:   targetSchoolId   || profile?.school_id   || null,
                school_name: targetSchoolName || profile?.school_name  || null,
                metadata: {
                    category,
                    difficulty,
                    tags: tagList_,
                    submission_types:   selectedTypes,
                    grading_mode:       gradingMode,
                    rubric:             gradingMode === 'rubric' ? rubric : [],
                    auto_grade:         gradingMode === 'auto',
                    group_activity:     isGroup,
                    groups:             isGroup ? groups : [],
                    is_draft:           isDraft,
                    // visibility & targeting
                    visibility:         visibilityType,           // 'school' | 'class'
                    target_class_id:    visibilityType === 'class' ? (targetClassId || null) : null,
                    target_class_name:  visibilityType === 'class' ? (targetClassName || null) : null,
                    work_mode:          workMode,                 // 'individual' | 'specific' | 'group'
                    target_student_ids: workMode === 'specific'   ? targetStudentIds : [],
                    ...(preLessonPlanId ? { lesson_plan_id: preLessonPlanId } : {}),
                    ...(preWeek ? { week_number: parseInt(preWeek) } : {}),
                },
            };

            const res = await fetch('/api/assignments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const j = await res.json();
            if (!res.ok) throw new Error(j.error || 'Failed to create activity');
            if (preLessonPlanId) {
              router.push(`/dashboard/lesson-plans/${preLessonPlanId}`);
            } else {
              router.push(isDraft ? '/dashboard/projects?tab=activities' : `/dashboard/projects/${j.data.id}`);
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    }

    if (authLoading) return <div className="min-h-screen bg-background flex items-center justify-center"><div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" /></div>;
    if (!isStaff) return <div className="min-h-screen bg-background flex items-center justify-center text-white/40">Access denied</div>;

    const filteredStudents = students.filter(s => !studentSearch || (s.full_name || '').toLowerCase().includes(studentSearch.toLowerCase()));
    const catInfo = CATEGORIES.find(c => c.key === category) || CATEGORIES[0];

    return (
        <div className="min-h-screen bg-background">

            {/* ── Header ────────────────────────────────────────────────────── */}
            <div className="bg-[#0a0a12] border-b border-white/[0.06] px-6 md:px-10 py-5 sticky top-0 z-20">
                <div className="flex items-center justify-between max-w-6xl mx-auto">
                    <div className="flex items-center gap-4">
                        <Link href="/dashboard/projects" className="flex items-center gap-2 text-white/40 hover:text-white text-xs font-bold uppercase tracking-widest transition-colors">
                            <ArrowLeftIcon className="w-3.5 h-3.5" /> Projects
                        </Link>
                        <span className="text-white/20">/</span>
                        <span className="text-white/60 text-xs font-bold uppercase tracking-widest">New Activity</span>
                    </div>

                    {/* Step indicators */}
                    <div className="hidden md:flex items-center gap-0">
                        {STEPS.map((s, i) => {
                            const done  = step > s.n;
                            const active = step === s.n;
                            const Icon  = s.icon;
                            return (
                                <div key={s.n} className="flex items-center">
                                    <button
                                        onClick={() => done && setStep(s.n)}
                                        className={`flex items-center gap-2 px-3 py-2 transition-all text-[10px] font-black uppercase tracking-widest border-b-2 ${
                                            active ? 'border-violet-500 text-violet-400' :
                                            done   ? 'border-emerald-500/60 text-emerald-400 cursor-pointer hover:text-emerald-300' :
                                                     'border-transparent text-white/20 cursor-default'
                                        }`}
                                    >
                                        {done
                                            ? <CheckCircleIcon className="w-3.5 h-3.5" />
                                            : <Icon className="w-3.5 h-3.5" />
                                        }
                                        {s.n}. {s.label}
                                    </button>
                                    {i < STEPS.length - 1 && <span className="text-white/10 px-1">›</span>}
                                </div>
                            );
                        })}
                    </div>

                    <div className="flex items-center gap-3">
                        <span className="text-[10px] font-black text-white/20 uppercase tracking-widest md:hidden">Step {step}/4</span>
                        <button onClick={() => { setAiOpen(true); setAiError(''); }}
                            className="flex items-center gap-2 px-3 py-2 bg-violet-600/20 border border-violet-500/40 text-violet-300 text-[10px] font-black uppercase tracking-widest hover:bg-violet-600/30 transition-all">
                            <SparklesIcon className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Generate with AI</span>
                            <span className="sm:hidden">AI</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* ── AI Generation Panel ────────────────────────────────────────── */}
            {aiOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
                    <div className="w-full max-w-lg bg-[#0d0d18] border border-violet-500/30 shadow-2xl">
                        <div className="flex items-center gap-3 px-6 py-4 border-b border-white/[0.06] bg-violet-500/5">
                            <div className="w-8 h-8 bg-violet-500/20 border border-violet-500/30 flex items-center justify-center flex-shrink-0">
                                <SparklesIcon className="w-4 h-4 text-violet-400" />
                            </div>
                            <div className="flex-1">
                                <p className="text-sm font-black text-white uppercase tracking-widest">AI Project Generator</p>
                                <p className="text-[10px] text-white/40">Describe what you want — AI fills in all the details</p>
                            </div>
                            <button onClick={() => setAiOpen(false)} className="text-white/30 hover:text-white text-lg leading-none">✕</button>
                        </div>

                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mb-2">What project do you want to create?</label>
                                <textarea
                                    value={aiPrompt}
                                    onChange={e => setAiPrompt(e.target.value)}
                                    rows={4}
                                    placeholder={"e.g. Build a weather app using Python that fetches data from an API and displays temperature and humidity for Nigerian cities\n\nor: Create a simple HTML/CSS portfolio webpage for JSS3 students\n\nor: Arduino LED traffic light project for beginners"}
                                    className="w-full px-4 py-3 bg-white/5 border border-white/10 text-sm text-white placeholder-white/20 focus:outline-none focus:border-violet-500 transition-colors resize-none"
                                    autoFocus
                                />
                            </div>

                            <div className="flex flex-wrap gap-1.5">
                                <span className="text-[9px] font-black text-white/20 uppercase tracking-widest self-center">Try:</span>
                                {['Python calculator app', 'HTML portfolio page', 'Arduino LED project', 'AI chatbot with Python', 'Scratch animation story'].map(ex => (
                                    <button key={ex} onClick={() => setAiPrompt(ex)}
                                        className="text-[9px] text-violet-400/70 border border-violet-500/20 px-2 py-1 hover:border-violet-500/50 hover:text-violet-300 transition-all">
                                        {ex}
                                    </button>
                                ))}
                            </div>

                            {aiError && (
                                <div className="flex items-center gap-2 text-rose-400 text-xs bg-rose-500/10 border border-rose-500/20 px-3 py-2">
                                    <ExclamationTriangleIcon className="w-3.5 h-3.5 flex-shrink-0" />
                                    {aiError}
                                </div>
                            )}

                            <div className="flex items-center gap-3 pt-2">
                                <button onClick={() => setAiOpen(false)}
                                    className="flex-1 py-2.5 border border-white/10 text-white/40 text-xs font-black uppercase tracking-widest hover:border-white/20 transition-colors">
                                    Cancel
                                </button>
                                <button onClick={handleAiGenerate} disabled={!aiPrompt.trim() || aiLoading}
                                    className="flex-1 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-black uppercase tracking-widest transition-colors flex items-center justify-center gap-2">
                                    {aiLoading
                                        ? <><ArrowPathIcon className="w-3.5 h-3.5 animate-spin" /> Generating...</>
                                        : <><SparklesIcon className="w-3.5 h-3.5" /> Generate Activity</>
                                    }
                                </button>
                            </div>
                            <p className="text-[9px] text-white/20 text-center">AI will fill in title, description, instructions, category, difficulty, and tags. You can edit everything after.</p>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Progress bar ──────────────────────────────────────────────── */}
            <div className="h-0.5 bg-white/5">
                <div className="h-full bg-gradient-to-r from-violet-600 to-indigo-500 transition-all duration-500" style={{ width: `${(step / 4) * 100}%` }} />
            </div>

            {/* ── Error banner ──────────────────────────────────────────────── */}
            {error && (
                <div className="flex items-center gap-3 bg-rose-500/10 border-b border-rose-500/20 px-6 md:px-10 py-3">
                    <ExclamationTriangleIcon className="w-4 h-4 text-rose-400 flex-shrink-0" />
                    <p className="text-rose-400 text-sm">{error}</p>
                    <button onClick={() => setError('')} className="ml-auto text-rose-400/50 hover:text-rose-400">✕</button>
                </div>
            )}

            <div className="max-w-6xl mx-auto px-6 md:px-10 py-8">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                    {/* ── Main content ──────────────────────────────────────── */}
                    <div className="lg:col-span-2 space-y-6">

                        {/* STEP 1 — Details */}
                        {step === 1 && (
                            <div className="space-y-6">
                                <div>
                                    <h2 className="text-lg font-black text-white uppercase tracking-tight italic mb-0.5">Activity Details</h2>
                                    <p className="text-xs text-white/30">Set up the core information about this project activity</p>
                                </div>

                                <div className={CARD}>
                                    <div className="space-y-4">
                                        <div>
                                            <label className={LABEL}>Activity Title <span className="text-rose-400">*</span></label>
                                            <input
                                                value={title}
                                                onChange={e => setTitle(e.target.value)}
                                                placeholder="e.g. Build a Personal Calculator App"
                                                className={INPUT}
                                                autoFocus
                                            />
                                            {title.length > 0 && title.trim().length < 3 && (
                                                <p className="text-[10px] text-rose-400 mt-1">Title must be at least 3 characters</p>
                                            )}
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className={LABEL}>Due Date & Time</label>
                                                <input type="datetime-local" value={dueDate} onChange={e => setDueDate(e.target.value)} className={INPUT} />
                                            </div>
                                        </div>

                                        {/* Tags chip picker */}
                                        <div>
                                            <label className={LABEL}>Tags</label>
                                            <div className="flex flex-wrap gap-1.5 mb-2 min-h-[28px]">
                                                {tagList.map(t => (
                                                    <span key={t} className="flex items-center gap-1 px-2 py-0.5 bg-violet-500/20 border border-violet-500/40 text-violet-300 text-[10px] font-black">
                                                        {t}
                                                        <button type="button" onClick={() => setTagList(prev => prev.filter(x => x !== t))} className="text-violet-400/50 hover:text-rose-400 transition-colors leading-none ml-0.5">×</button>
                                                    </span>
                                                ))}
                                                {tagList.length === 0 && <span className="text-[10px] text-white/20 italic">No tags yet — pick below or type a custom one</span>}
                                            </div>
                                            <div className="flex flex-wrap gap-1 mb-2">
                                                {COMMON_TAGS.map(t => {
                                                    const active = tagList.includes(t);
                                                    return (
                                                        <button key={t} type="button"
                                                            onClick={() => setTagList(prev => active ? prev.filter(x => x !== t) : [...prev, t])}
                                                            className={`px-2 py-0.5 text-[9px] font-bold border transition-all ${active ? 'bg-violet-500/20 border-violet-500/40 text-violet-300' : 'bg-white/[0.02] border-white/[0.06] text-white/30 hover:border-white/20 hover:text-white/60'}`}>
                                                            {active ? '✓ ' : ''}{t}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                            <div className="flex gap-2">
                                                <input value={customTagInput} onChange={e => setCustomTagInput(e.target.value)}
                                                    onKeyDown={e => {
                                                        if ((e.key === 'Enter' || e.key === ',') && customTagInput.trim()) {
                                                            e.preventDefault();
                                                            const t = customTagInput.trim().toLowerCase().replace(/\s+/g, '-');
                                                            if (t && !tagList.includes(t)) setTagList(prev => [...prev, t]);
                                                            setCustomTagInput('');
                                                        }
                                                    }}
                                                    placeholder="Add custom tag (Enter or comma to add)"
                                                    className="flex-1 px-3 py-1.5 bg-white/5 border border-white/10 text-xs text-white placeholder-white/20 focus:outline-none focus:border-violet-500 transition-colors"
                                                />
                                                <button type="button"
                                                    onClick={() => {
                                                        const t = customTagInput.trim().toLowerCase().replace(/\s+/g, '-');
                                                        if (t && !tagList.includes(t)) { setTagList(prev => [...prev, t]); setCustomTagInput(''); }
                                                    }}
                                                    className="px-3 py-1.5 bg-white/5 border border-white/10 text-white/40 text-xs hover:border-white/20 transition-colors">
                                                    + Add
                                                </button>
                                            </div>
                                        </div>

                                        <div>
                                            <label className={LABEL}>Brief Description</label>
                                            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2}
                                                placeholder="Short summary visible in the activity list..." className={`${INPUT} resize-none`} />
                                        </div>

                                        <div>
                                            <label className={LABEL}>Full Instructions (visible to students)</label>
                                            <textarea value={instructions} onChange={e => setInstructions(e.target.value)} rows={7}
                                                placeholder={"Requirements:\n1. Build a working calculator using Python or HTML/CSS/JS\n2. Must include: addition, subtraction, multiplication, division\n3. Include a README explaining how to run it\n\nDeliverables:\n- Working code\n- Screenshot of your app\n- Brief explanation of your approach"}
                                                className={`${INPUT} resize-none font-mono text-xs leading-relaxed`} />
                                        </div>
                                    </div>
                                </div>

                                {/* Category */}
                                <div className={CARD}>
                                    <label className={LABEL}>Category</label>
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-1">
                                        {CATEGORIES.map(cat => {
                                            const Icon  = cat.icon;
                                            const active = category === cat.key;
                                            return (
                                                <button key={cat.key} type="button" onClick={() => setCategory(cat.key)}
                                                    className={`flex items-center gap-2 px-3 py-2.5 border text-left transition-all ${active ? 'border-opacity-60 bg-opacity-10' : 'border-white/[0.06] bg-white/[0.02] hover:border-white/20'}`}
                                                    style={active ? { borderColor: cat.color + '80', backgroundColor: cat.color + '18' } : {}}>
                                                    <span style={{ color: active ? cat.color : undefined }} className="flex-shrink-0"><Icon className="w-3.5 h-3.5" /></span>
                                                    <span className={`text-[10px] font-black uppercase tracking-widest ${active ? 'text-white' : 'text-white/40'}`}>{cat.label}</span>
                                                    {active && <span style={{ color: cat.color }} className="ml-auto flex-shrink-0"><CheckIcon className="w-3 h-3" /></span>}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Difficulty */}
                                <div className={CARD}>
                                    <label className={LABEL}>Difficulty Level</label>
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-1">
                                        {DIFFICULTIES.map(d => {
                                            const active = difficulty === d.key;
                                            return (
                                                <button key={d.key} type="button" onClick={() => setDifficulty(d.key)}
                                                    className={`flex flex-col gap-2 px-4 py-4 border text-left transition-all relative ${active ? d.color : 'border-white/[0.06] bg-white/[0.02] text-white/40 hover:border-white/20 hover:bg-white/[0.03]'}`}>
                                                    {/* Stars */}
                                                    <div className="flex items-center gap-1">
                                                        {[1,2,3].map(n => (
                                                            <div key={n} className={`w-3 h-3 rounded-full ${n <= d.stars ? (active ? d.dot : 'bg-white/20') : 'bg-white/[0.06]'}`}
                                                                style={n <= d.stars && active ? { backgroundColor: d.dotColor } : {}} />
                                                        ))}
                                                    </div>
                                                    <div>
                                                        <p className="text-xs font-black uppercase tracking-widest leading-none">{d.label}</p>
                                                        <p className={`text-[10px] mt-1 leading-tight ${active ? 'opacity-70' : 'text-white/25'}`}>{d.sub}</p>
                                                    </div>
                                                    <span className={`text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 self-start border ${active ? 'border-current opacity-50' : 'border-white/10 text-white/20'}`}>
                                                        {d.badge}
                                                    </span>
                                                    {active && (
                                                        <div className="absolute top-2 right-2">
                                                            <CheckIcon className="w-3.5 h-3.5" />
                                                        </div>
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* STEP 2 — Submission & Grading */}
                        {step === 2 && (
                            <div className="space-y-6">
                                <div>
                                    <h2 className="text-lg font-black text-white uppercase tracking-tight italic mb-0.5">Submission & Grading</h2>
                                    <p className="text-xs text-white/30">Choose how students submit work and how it will be graded</p>
                                </div>

                                {/* Submission types */}
                                <div className={CARD}>
                                    <label className={LABEL}>Allowed Submission Types <span className="text-rose-400">*</span></label>
                                    <p className="text-[10px] text-white/20 mb-3">Select at least one. Students will see only these options.</p>
                                    <div className="space-y-2">
                                        {SUBMISSION_TYPES.map(t => {
                                            const active = selectedTypes.includes(t.key);
                                            const Icon   = t.Icon;
                                            return (
                                                <button key={t.key} type="button"
                                                    onClick={() => setSelectedTypes(prev => active ? prev.filter(x => x !== t.key) : [...prev, t.key])}
                                                    className={`w-full flex items-center gap-4 px-4 py-3 border text-left transition-all ${active ? 'border-opacity-50 bg-opacity-10' : 'border-white/[0.06] bg-white/[0.02] hover:border-white/20'}`}
                                                    style={active ? { borderColor: t.color + '80', backgroundColor: t.color + '15' } : {}}>
                                                    <div className="w-8 h-8 flex items-center justify-center flex-shrink-0" style={active ? { backgroundColor: t.color + '25' } : { backgroundColor: 'rgba(255,255,255,0.03)' }}>
                                                        <span style={{ color: active ? t.color : 'rgba(255,255,255,0.3)' }}><Icon className="w-4 h-4" /></span>
                                                    </div>
                                                    <div className="flex-1">
                                                        <p className={`text-xs font-black uppercase tracking-widest ${active ? 'text-white' : 'text-white/50'}`}>{t.label}</p>
                                                        <p className="text-[10px] text-white/30 mt-0.5">{t.desc}</p>
                                                    </div>
                                                    <div className={`w-4 h-4 border-2 flex items-center justify-center flex-shrink-0 transition-all ${active ? 'border-transparent' : 'border-white/20'}`}
                                                        style={active ? { backgroundColor: t.color } : {}}>
                                                        {active && <CheckIcon className="w-2.5 h-2.5 text-white" />}
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                    {selectedTypes.length === 0 && (
                                        <p className="text-[10px] text-rose-400 mt-2">Select at least one submission type</p>
                                    )}
                                </div>

                                {/* Grading mode */}
                                <div className={CARD}>
                                    <label className={LABEL}>Grading Mode</label>
                                    <div className="space-y-2 mt-1">
                                        {GRADING_MODES.map(gm => {
                                            const Icon   = gm.icon;
                                            const active = gradingMode === gm.key;
                                            return (
                                                <button key={gm.key} type="button" onClick={() => setGradingMode(gm.key as any)}
                                                    className={`w-full flex items-start gap-4 px-4 py-4 border text-left transition-all ${active ? gm.color : 'border-white/[0.06] bg-white/[0.02] hover:border-white/20 text-white/40'}`}>
                                                    <div className={`w-4 h-4 rounded-full border-2 mt-0.5 flex-shrink-0 ${active ? 'border-current bg-current' : 'border-white/20'}`} />
                                                    <div className="flex-1">
                                                        <div className="flex items-center gap-2">
                                                            <Icon className="w-3.5 h-3.5" />
                                                            <p className="text-xs font-black uppercase tracking-widest">{gm.label}</p>
                                                        </div>
                                                        <p className="text-[10px] text-white/40 mt-1">{gm.desc}</p>
                                                        {active && gm.key === 'auto' && gm.breakdown && (
                                                            <div className="mt-2 grid grid-cols-2 gap-1">
                                                                {gm.breakdown.map(b => (
                                                                    <span key={b} className="text-[9px] text-emerald-400/70">• {b}</span>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Max points (manual / auto) OR rubric builder */}
                                {gradingMode !== 'rubric' ? (
                                    <div className={CARD}>
                                        <label className={LABEL}>Maximum Points</label>
                                        <input type="number" min="1" max="1000" value={maxPoints} onChange={e => setMaxPoints(e.target.value)} className={INPUT} />
                                        <p className="text-[10px] text-white/20 mt-1.5">This is the maximum score a student can receive for this activity</p>
                                    </div>
                                ) : (
                                    <div className={CARD}>
                                        <div className="flex items-center justify-between mb-4">
                                            <div>
                                                <label className={`${LABEL} mb-0`}>Rubric Criteria</label>
                                                <p className="text-[10px] text-white/20 mt-0.5">Total: <span className="text-violet-400 font-black">{rubricTotal} pts</span></p>
                                            </div>
                                            <button type="button" onClick={addCriterion}
                                                className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600/20 border border-violet-500/30 text-violet-400 text-[10px] font-black uppercase tracking-widest hover:bg-violet-600/30 transition-all">
                                                <PlusIcon className="w-3 h-3" /> Add Criterion
                                            </button>
                                        </div>
                                        <div className="space-y-3">
                                            {rubric.map((c, i) => (
                                                <div key={c.id} className="bg-violet-500/5 border border-violet-500/20 p-4 space-y-2">
                                                    <div className="flex items-center gap-3">
                                                        <span className="text-[9px] font-black text-violet-400/60 uppercase tracking-widest w-4 flex-shrink-0">#{i + 1}</span>
                                                        <input value={c.name} onChange={e => updateCriterion(c.id, 'name', e.target.value)}
                                                            placeholder="Criterion name (e.g. Code Quality)"
                                                            className="flex-1 bg-transparent border-b border-white/10 text-sm font-black text-white focus:outline-none focus:border-violet-500 pb-0.5 transition-colors" />
                                                        <div className="flex items-center gap-1 flex-shrink-0">
                                                            <input type="number" min="1" max="200" value={c.maxPts} onChange={e => updateCriterion(c.id, 'maxPts', parseInt(e.target.value) || 0)}
                                                                className="w-14 text-center bg-violet-500/10 border border-violet-500/30 text-violet-300 text-sm font-black focus:outline-none py-0.5" />
                                                            <span className="text-[10px] text-white/30 font-bold">pts</span>
                                                        </div>
                                                        {rubric.length > 1 && (
                                                            <button type="button" onClick={() => removeCriterion(c.id)} className="text-rose-400/40 hover:text-rose-400 transition-colors flex-shrink-0">
                                                                <TrashIcon className="w-3.5 h-3.5" />
                                                            </button>
                                                        )}
                                                    </div>
                                                    <input value={c.desc} onChange={e => updateCriterion(c.id, 'desc', e.target.value)}
                                                        placeholder="Description or guiding questions for this criterion..."
                                                        className="w-full bg-transparent text-[11px] text-white/40 focus:outline-none focus:text-white/60 transition-colors pl-7" />
                                                </div>
                                            ))}
                                        </div>
                                        {rubricTotal !== 100 && (
                                            <div className="mt-3 flex items-center gap-2 text-amber-400">
                                                <ExclamationTriangleIcon className="w-3.5 h-3.5" />
                                                <span className="text-[10px] font-bold">Total is {rubricTotal} pts — recommended: 100 pts</span>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* STEP 3 — Visibility & Assignment */}
                        {step === 3 && (
                            <div className="space-y-6">
                                <div>
                                    <h2 className="text-lg font-black text-white uppercase tracking-tight italic mb-0.5">Visibility & Assignment</h2>
                                    <p className="text-xs text-white/30">Control who sees this activity and how they work on it</p>
                                </div>

                                {/* ── SECTION A: Visibility ── */}
                                <div className={CARD}>
                                    <label className={LABEL}>Who can see this activity?</label>

                                    {/* School picker (if teacher has multiple schools) */}
                                    {assignedSchools.length > 1 && (
                                        <div className="mb-4">
                                            <label className={LABEL}>Target School</label>
                                            <select value={targetSchoolId}
                                                onChange={e => {
                                                    const sch = assignedSchools.find((s: any) => s.id === e.target.value);
                                                    handleSchoolSelect(e.target.value, sch?.name || '');
                                                }}
                                                className={INPUT}>
                                                <option value="">— Select a school —</option>
                                                {assignedSchools.map((s: any) => (
                                                    <option key={s.id} value={s.id}>{s.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                    )}

                                    <div className="grid grid-cols-2 gap-3">
                                        {([
                                            { key: 'school', label: 'Whole School', sub: 'All students at the selected school see this', icon: '🏫' },
                                            { key: 'class',  label: 'Specific Class', sub: 'Only students in a chosen class can see this', icon: '📚' },
                                        ] as const).map(opt => (
                                            <button key={opt.key} type="button" onClick={() => setVisibilityType(opt.key)}
                                                className={`flex items-start gap-3 px-4 py-4 border text-left transition-all ${visibilityType === opt.key ? 'bg-violet-500/10 border-violet-500/40' : 'bg-white/[0.02] border-white/[0.06] hover:border-white/20'}`}>
                                                <span className="text-lg leading-none flex-shrink-0">{opt.icon}</span>
                                                <div>
                                                    <p className={`text-xs font-black uppercase tracking-widest ${visibilityType === opt.key ? 'text-violet-300' : 'text-white/50'}`}>{opt.label}</p>
                                                    <p className="text-[10px] text-white/30 mt-1">{opt.sub}</p>
                                                </div>
                                            </button>
                                        ))}
                                    </div>

                                    {/* Class picker */}
                                    {visibilityType === 'class' && (
                                        <div className="mt-4">
                                            <label className={LABEL}>Select Class</label>
                                            {classesLoading ? (
                                                <div className="flex items-center gap-2 text-white/30 text-xs py-2">
                                                    <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" /> Loading classes…
                                                </div>
                                            ) : classes.length === 0 ? (
                                                <p className="text-xs text-white/30 italic py-2">No classes found for this school</p>
                                            ) : (
                                                <select value={targetClassId}
                                                    onChange={e => {
                                                        setTargetClassId(e.target.value);
                                                        const cls = classes.find((c: any) => c.id === e.target.value);
                                                        setTargetClassName(cls?.name || '');
                                                    }}
                                                    className={INPUT}>
                                                    <option value="">— Select a class —</option>
                                                    {classes.map((cls: any) => (
                                                        <option key={cls.id} value={cls.id}>
                                                            {cls.name}{cls.schools?.name ? ` · ${cls.schools.name}` : ''}
                                                        </option>
                                                    ))}
                                                </select>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* ── SECTION B: Work Mode ── */}
                                <div className={CARD}>
                                    <label className={LABEL}>How do students work on it?</label>
                                    <div className="grid grid-cols-3 gap-3 mt-1">
                                        {([
                                            { key: 'individual', label: 'Individual',       sub: 'Every student submits their own work',          icon: '👤' },
                                            { key: 'specific',   label: 'Specific Students', sub: 'Only hand-picked students can submit',           icon: '🎯' },
                                            { key: 'group',      label: 'Group Work',        sub: 'Assign students to teams, one submission each',  icon: '👥' },
                                        ] as const).map(opt => (
                                            <button key={opt.key} type="button"
                                                onClick={() => { setWorkMode(opt.key); setIsGroupActivity(opt.key === 'group'); }}
                                                className={`flex items-start gap-3 px-4 py-4 border text-left transition-all ${workMode === opt.key ? 'bg-indigo-500/10 border-indigo-500/40' : 'bg-white/[0.02] border-white/[0.06] hover:border-white/20'}`}>
                                                <span className="text-base leading-none flex-shrink-0">{opt.icon}</span>
                                                <div>
                                                    <p className={`text-[10px] font-black uppercase tracking-widest ${workMode === opt.key ? 'text-indigo-300' : 'text-white/50'}`}>{opt.label}</p>
                                                    <p className="text-[9px] text-white/30 mt-1 leading-relaxed">{opt.sub}</p>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Specific students picker */}
                                {workMode === 'specific' && (
                                    <div className={CARD}>
                                        <div className="flex items-center justify-between mb-3">
                                            <label className={LABEL + ' mb-0'}>Select Students</label>
                                            <span className="text-[10px] text-indigo-400 font-bold">{targetStudentIds.length} selected</span>
                                        </div>
                                        <input value={studentSearch} onChange={e => setStudentSearch(e.target.value)}
                                            placeholder="Search by name..." className={`${INPUT} mb-3`} />
                                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-64 overflow-y-auto">
                                            {filteredStudents.map(s => {
                                                const sel = targetStudentIds.includes(s.id);
                                                return (
                                                    <button key={s.id} type="button" onClick={() => toggleTargetStudent(s.id)}
                                                        className={`flex items-center gap-1.5 px-2 py-1.5 border text-[10px] font-bold text-left transition-all ${sel ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300' : 'bg-white/[0.02] border-white/[0.06] text-white/50 hover:border-indigo-500/30 hover:text-white'}`}>
                                                        {sel ? <CheckIcon className="w-2.5 h-2.5 flex-shrink-0 text-indigo-400" /> : <div className="w-2.5 h-2.5 rounded-full border border-white/20 flex-shrink-0" />}
                                                        <span className="truncate">{s.full_name || s.email}</span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {/* Group builder */}
                                {workMode === 'group' && (
                                    <div className={CARD}>
                                        <div className="flex items-center justify-between mb-4">
                                            <label className={LABEL + ' mb-0'}>Build Teams</label>
                                            <span className="text-[10px] text-white/30">
                                                {groups.reduce((s, g) => s + g.studentIds.length, 0)} / {students.length} students assigned
                                            </span>
                                        </div>

                                        {/* Student search */}
                                        <input value={studentSearch} onChange={e => setStudentSearch(e.target.value)}
                                            placeholder="Search student by name..." className={`${INPUT} mb-4`} />

                                        <div className="space-y-3">
                                            {groups.map((group, gi) => (
                                                <div key={group.id} className="border border-white/[0.08] bg-black/20">
                                                    {/* Group header */}
                                                    <div className="flex items-center gap-3 px-4 py-2.5 border-b border-white/[0.06] bg-indigo-500/5">
                                                        <div className="w-6 h-6 bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center flex-shrink-0">
                                                            <span className="text-[9px] font-black text-indigo-400">{gi + 1}</span>
                                                        </div>
                                                        <input value={group.name}
                                                            onChange={e => setGroups(gs => gs.map(g => g.id === group.id ? { ...g, name: e.target.value } : g))}
                                                            className="flex-1 bg-transparent text-sm font-black text-white focus:outline-none" placeholder="Team name..." />
                                                        <span className="text-[10px] text-white/30 flex-shrink-0">
                                                            {group.studentIds.length} member{group.studentIds.length !== 1 ? 's' : ''}
                                                        </span>
                                                        {groups.length > 1 && (
                                                            <button type="button" onClick={() => removeGroup(group.id)} className="text-rose-400/40 hover:text-rose-400 transition-colors flex-shrink-0">
                                                                <TrashIcon className="w-3.5 h-3.5" />
                                                            </button>
                                                        )}
                                                    </div>

                                                    {/* Students grid */}
                                                    <div className="p-3 max-h-52 overflow-y-auto">
                                                        {filteredStudents.length === 0 && (
                                                            <p className="text-white/20 text-xs italic">No students found</p>
                                                        )}
                                                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                                                            {filteredStudents.map(s => {
                                                                const inThis  = group.studentIds.includes(s.id);
                                                                const inOther = !inThis && !!getStudentGroup(s.id);
                                                                return (
                                                                    <button key={s.id} type="button" disabled={inOther}
                                                                        onClick={() => toggleInGroup(group.id, s.id)}
                                                                        className={`flex items-center gap-1.5 px-2 py-1.5 border text-[10px] font-bold text-left transition-all ${
                                                                            inThis  ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300' :
                                                                            inOther ? 'opacity-25 border-white/5 text-white/30 cursor-not-allowed' :
                                                                                      'bg-white/[0.02] border-white/[0.06] text-white/50 hover:border-indigo-500/30 hover:text-white'
                                                                        }`}>
                                                                        {inThis
                                                                            ? <CheckIcon className="w-2.5 h-2.5 flex-shrink-0 text-indigo-400" />
                                                                            : <div className="w-2.5 h-2.5 rounded-full border border-white/20 flex-shrink-0" />
                                                                        }
                                                                        <span className="truncate">{s.full_name || s.email}</span>
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>

                                        <button type="button" onClick={addGroup}
                                            className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 border border-dashed border-white/20 text-white/40 hover:text-white hover:border-white/40 text-xs font-bold uppercase tracking-widest transition-all">
                                            <PlusIcon className="w-3.5 h-3.5" /> Add Another Team
                                        </button>
                                    </div>
                                )}

                                {workMode === 'individual' && (
                                    <div className="bg-indigo-500/5 border border-indigo-500/20 px-5 py-4 flex items-start gap-3">
                                        <CheckCircleIcon className="w-4 h-4 text-indigo-400 mt-0.5 flex-shrink-0" />
                                        <div>
                                            <p className="text-xs font-black text-indigo-300 mb-1">
                                                Individual Mode · {visibilityType === 'class' && targetClassName ? `Class: ${targetClassName}` : 'Whole School'}
                                            </p>
                                            <p className="text-[11px] text-white/40">
                                                {visibilityType === 'class' && targetClassName
                                                    ? `Only students in ${targetClassName} will see this activity. Each submits individually.`
                                                    : `All students at your school will see this activity. Each submits and receives their own grade.`
                                                }
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* STEP 4 — Review */}
                        {step === 4 && (
                            <div className="space-y-6">
                                <div>
                                    <h2 className="text-lg font-black text-white uppercase tracking-tight italic mb-0.5">Review & Publish</h2>
                                    <p className="text-xs text-white/30">Review your activity setup before publishing to students</p>
                                </div>

                                {/* Summary card */}
                                <div className="bg-[#0d0d18] border border-violet-500/20 overflow-hidden">
                                    <div className="h-1 bg-gradient-to-r from-violet-600 to-indigo-500" />
                                    <div className="p-6 space-y-5">
                                        <div className="flex items-start justify-between gap-4">
                                            <div>
                                                <h3 className="text-xl font-black text-white italic">{title || 'Untitled Activity'}</h3>
                                                {description && <p className="text-sm text-white/40 mt-1">{description}</p>}
                                            </div>
                                            <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                                                <span className="text-[9px] font-black px-2 py-0.5 uppercase tracking-widest"
                                                    style={{ backgroundColor: (CATEGORIES.find(c => c.key === category)?.color || '#8b5cf6') + '25', color: CATEGORIES.find(c => c.key === category)?.color }}>
                                                    {CATEGORIES.find(c => c.key === category)?.label}
                                                </span>
                                                <span className={`text-[9px] font-black px-2 py-0.5 uppercase tracking-widest ${DIFFICULTIES.find(d => d.key === difficulty)?.color}`}>
                                                    {DIFFICULTIES.find(d => d.key === difficulty)?.label}
                                                </span>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                            {[
                                                { label: 'Due Date',    value: dueDate ? new Date(dueDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'No deadline' },
                                                { label: 'Max Points',  value: gradingMode === 'rubric' ? `${rubricTotal} pts` : `${maxPoints} pts` },
                                                { label: 'Grading',     value: GRADING_MODES.find(m => m.key === gradingMode)?.label || '' },
                                                { label: 'School',      value: targetSchoolName || profile?.school_name || '—' },
                                                { label: 'Visibility',  value: visibilityType === 'class' ? `Class: ${targetClassName || '(not set)'}` : 'Whole School' },
                                                { label: 'Work Mode',   value: workMode === 'group' ? `Group (${groups.length} teams)` : workMode === 'specific' ? `${targetStudentIds.length} specific student(s)` : 'Individual' },
                                            ].map(s => (
                                                <div key={s.label} className="bg-white/[0.03] border border-white/[0.06] px-3 py-2.5">
                                                    <p className="text-[9px] font-black text-white/30 uppercase tracking-widest">{s.label}</p>
                                                    <p className="text-xs font-black text-white mt-0.5">{s.value}</p>
                                                </div>
                                            ))}
                                        </div>

                                        {/* Submission types */}
                                        <div>
                                            <p className={LABEL}>Submission Types</p>
                                            <div className="flex flex-wrap gap-2">
                                                {selectedTypes.map(t => {
                                                    const info = SUBMISSION_TYPES.find(s => s.key === t);
                                                    return info ? (
                                                        <span key={t} className="text-[10px] font-black px-2 py-1 uppercase tracking-widest"
                                                            style={{ backgroundColor: info.color + '20', color: info.color, border: `1px solid ${info.color}50` }}>
                                                            {info.label}
                                                        </span>
                                                    ) : null;
                                                })}
                                            </div>
                                        </div>

                                        {/* Rubric preview */}
                                        {gradingMode === 'rubric' && (
                                            <div>
                                                <p className={LABEL}>Grading Rubric</p>
                                                <div className="space-y-1.5">
                                                    {rubric.map(c => (
                                                        <div key={c.id} className="flex items-center justify-between bg-violet-500/5 border border-violet-500/20 px-3 py-2">
                                                            <div>
                                                                <p className="text-xs font-black text-white">{c.name || 'Unnamed'}</p>
                                                                {c.desc && <p className="text-[10px] text-white/30">{c.desc}</p>}
                                                            </div>
                                                            <span className="text-sm font-black text-violet-400 flex-shrink-0 ml-4">{c.maxPts} pts</span>
                                                        </div>
                                                    ))}
                                                    <div className="flex items-center justify-between px-3 py-1.5">
                                                        <span className="text-[10px] font-black text-white/40 uppercase tracking-widest">Total</span>
                                                        <span className="text-sm font-black text-white">{rubricTotal} pts</span>
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {/* Tags */}
                                        {tagList.length > 0 && (
                                            <div>
                                                <p className={LABEL}>Tags</p>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {tagList.map(t => (
                                                        <span key={t} className="text-[9px] font-bold px-2 py-0.5 bg-violet-500/10 border border-violet-500/20 text-violet-400">{t}</span>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Instructions preview */}
                                        {instructions && (
                                            <div>
                                                <p className={LABEL}>Instructions Preview</p>
                                                <div className="bg-white/[0.02] border border-white/[0.06] p-4 max-h-40 overflow-y-auto">
                                                    <p className="text-[11px] text-white/50 leading-relaxed whitespace-pre-line">{instructions}</p>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Publish options */}
                                <div className="flex flex-col sm:flex-row gap-3">
                                    <button type="button" onClick={() => handlePublish(false)} disabled={saving}
                                        className="flex-1 flex items-center justify-center gap-2 py-4 bg-violet-600 hover:bg-violet-500 text-white font-black uppercase tracking-widest transition-all disabled:opacity-50">
                                        {saving ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : <RocketLaunchIcon className="w-4 h-4" />}
                                        Publish Activity
                                    </button>
                                    <button type="button" onClick={() => handlePublish(true)} disabled={saving}
                                        className="flex items-center justify-center gap-2 px-6 py-4 bg-white/5 border border-white/10 hover:border-white/20 text-white/60 hover:text-white font-black uppercase tracking-widest text-sm transition-all disabled:opacity-50">
                                        Save as Draft
                                    </button>
                                </div>
                                <p className="text-[10px] text-white/20 text-center">Publishing makes the activity visible to students immediately. Drafts are hidden.</p>
                            </div>
                        )}

                        {/* ── Navigation ──────────────────────────────────────── */}
                        {step < 4 && (
                            <div className="flex items-center justify-between pt-2">
                                {step > 1 ? (
                                    <button type="button" onClick={() => setStep(s => s - 1)}
                                        className="flex items-center gap-2 px-5 py-2.5 bg-white/5 border border-white/10 text-white/60 hover:text-white text-xs font-black uppercase tracking-widest transition-all">
                                        <ChevronLeftIcon className="w-3.5 h-3.5" /> Back
                                    </button>
                                ) : (
                                    <Link href="/dashboard/projects" className="text-white/30 hover:text-white text-xs font-bold uppercase tracking-widest transition-colors">Cancel</Link>
                                )}
                                <button type="button" onClick={() => { if (canProceed()) { setError(''); setStep(s => s + 1); } else { setError(step === 1 ? 'Enter a title (min 3 chars) to continue' : 'Select at least one submission type'); } }}
                                    className={`flex items-center gap-2 px-6 py-2.5 font-black uppercase tracking-widest text-sm transition-all ${canProceed() ? 'bg-violet-600 hover:bg-violet-500 text-white' : 'bg-white/5 border border-white/10 text-white/30 cursor-not-allowed'}`}>
                                    Next: {STEPS[step]?.label} <ChevronRightIcon className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        )}
                    </div>

                    {/* ── Sidebar preview ───────────────────────────────────── */}
                    <div className="hidden lg:block">
                        <div className="sticky top-24 space-y-4">
                            <div className="bg-[#0a0a12] border border-white/[0.06] p-5">
                                <p className="text-[9px] font-black text-white/20 uppercase tracking-widest mb-3">Live Preview</p>

                                {/* Mini activity card */}
                                <div className="bg-[#0d0d18] border border-white/[0.06] overflow-hidden">
                                    <div className="h-1" style={{ backgroundColor: catInfo.color }} />
                                    <div className="p-4">
                                        <div className="flex items-start justify-between gap-2 mb-2">
                                            <p className="text-xs font-black text-white line-clamp-2 leading-tight">{title || 'Activity Title'}</p>
                                            {isGroupActivity && <span className="text-[8px] font-black text-cyan-400 px-1.5 py-0.5 bg-cyan-500/10 flex-shrink-0">Group</span>}
                                        </div>
                                        {description && <p className="text-[10px] text-white/40 line-clamp-2 mb-2">{description}</p>}
                                        <div className="flex flex-wrap gap-1.5 mb-3">
                                            <span className="text-[8px] font-black px-1.5 py-0.5" style={{ backgroundColor: catInfo.color + '20', color: catInfo.color }}>{catInfo.label}</span>
                                            <span className={`text-[8px] font-black px-1.5 py-0.5 ${DIFFICULTIES.find(d => d.key === difficulty)?.color}`}>{DIFFICULTIES.find(d => d.key === difficulty)?.label}</span>
                                        </div>
                                        {tagList.length > 0 && (
                                            <div className="flex flex-wrap gap-1 mb-2">
                                                {tagList.slice(0, 4).map(t => (
                                                    <span key={t} className="text-[8px] text-white/30 border border-white/10 px-1 py-0.5">{t}</span>
                                                ))}
                                            </div>
                                        )}
                                        <div className="flex items-center justify-between text-[9px] text-white/30">
                                            <span>{dueDate ? `Due ${new Date(dueDate).toLocaleDateString('en-GB')}` : 'No deadline'}</span>
                                            <span>{gradingMode === 'rubric' ? rubricTotal : maxPoints} pts</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Checklist */}
                                <div className="mt-4 space-y-2">
                                    {[
                                        { label: 'Title set',            done: title.trim().length >= 3 },
                                        { label: 'Submission types',      done: selectedTypes.length > 0 },
                                        { label: 'Instructions written',  done: instructions.trim().length > 10 },
                                        { label: 'Due date set',          done: !!dueDate },
                                        { label: 'Assignment configured', done: workMode !== 'group' || groups.some(g => g.studentIds.length > 0) },
                                    ].map(item => (
                                        <div key={item.label} className="flex items-center gap-2">
                                            <div className={`w-4 h-4 flex items-center justify-center flex-shrink-0 ${item.done ? 'text-emerald-400' : 'text-white/15'}`}>
                                                {item.done ? <CheckCircleIcon className="w-4 h-4" /> : <div className="w-3 h-3 border border-current rounded-full" />}
                                            </div>
                                            <span className={`text-[10px] font-semibold ${item.done ? 'text-white/50' : 'text-white/20'}`}>{item.label}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Tips */}
                            <div className="bg-amber-500/5 border border-amber-500/20 p-4">
                                <p className="text-[9px] font-black text-amber-400 uppercase tracking-widest mb-2">💡 Tips</p>
                                {step === 1 && <p className="text-[10px] text-white/30">Write clear, specific instructions — students perform better when expectations are explicit.</p>}
                                {step === 2 && <p className="text-[10px] text-white/30">Use Rubric-Based grading for complex projects where multiple dimensions matter.</p>}
                                {step === 3 && <p className="text-[10px] text-white/30">Group work builds teamwork skills — assign 3–5 students per team for best results.</p>}
                                {step === 4 && <p className="text-[10px] text-white/30">Save as Draft to review with colleagues before releasing to students.</p>}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
