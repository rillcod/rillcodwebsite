// @refresh reset
'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import {
    CodeBracketIcon, RocketLaunchIcon, MagnifyingGlassIcon, UserGroupIcon,
    ArrowPathIcon, ChevronDownIcon, ChevronUpIcon, EyeIcon,
    CheckCircleIcon, ArrowRightIcon, StarIcon, PlusIcon,
    ClipboardDocumentListIcon, ClockIcon, BoltIcon, PencilSquareIcon,
    ExclamationTriangleIcon, CheckIcon, SparklesIcon, BeakerIcon,
    GlobeAltIcon, CpuChipIcon, PaintBrushIcon, PresentationChartBarIcon,
    CalendarDaysIcon, ChartBarIcon, TrophyIcon, FireIcon,
    UsersIcon, XMarkIcon, TrashIcon, AcademicCapIcon, ShareIcon,
} from '@/lib/icons';

function WhatsAppIcon({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
            <path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.558 4.122 1.533 5.849L.057 23.852a.5.5 0 0 0 .611.611l6.003-1.476A11.952 11.952 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.89 0-3.663-.523-5.176-1.432l-.372-.22-3.849.946.964-3.849-.24-.381A9.953 9.953 0 0 1 2 12C2 6.478 6.478 2 12 2s10 4.478 10 10-4.478 10-10 10z"/>
        </svg>
    );
}

// ── helpers ───────────────────────────────────────────────────────────────────

function projectScore(labCount: number, portfolioCount: number) {
    return Math.min(100, Math.round(((labCount + portfolioCount) / 3) * 100));
}

function ScoreBadge({ pct }: { pct: number }) {
    const color = pct >= 80 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#ef4444';
    const label = pct >= 80 ? 'Excellent' : pct >= 50 ? 'Developing' : 'Needs Work';
    return (
        <div className="flex items-center gap-2">
            <div className="w-20 h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
            </div>
            <span className="text-[11px] font-black" style={{ color }}>{pct}%</span>
            <span className="text-[10px] text-white/30 font-semibold">{label}</span>
        </div>
    );
}

// Deadline countdown string
function deadlineLabel(dateStr: string | null): { text: string; urgent: boolean; overdue: boolean } {
    if (!dateStr) return { text: 'No deadline', urgent: false, overdue: false };
    const diff = new Date(dateStr).getTime() - Date.now();
    const days = Math.floor(diff / 86400000);
    const hrs  = Math.floor(diff / 3600000);
    if (diff < 0)      return { text: `Overdue by ${Math.abs(days)} day${Math.abs(days) !== 1 ? 's' : ''}`, urgent: true, overdue: true };
    if (days === 0)    return { text: `Due today · ${Math.max(0, hrs)}h left`, urgent: true, overdue: false };
    if (days === 1)    return { text: 'Due tomorrow', urgent: true, overdue: false };
    if (days <= 3)     return { text: `Due in ${days} days`, urgent: true, overdue: false };
    return { text: `Due ${new Date(dateStr).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}`, urgent: false, overdue: false };
}

const CAT_META: Record<string, { label: string; Icon: any; color: string }> = {
    coding:       { label: 'Coding',         Icon: CodeBracketIcon,          color: '#f97316' },
    web:          { label: 'Web Dev',         Icon: GlobeAltIcon,             color: '#06b6d4' },
    ai:           { label: 'AI / ML',         Icon: SparklesIcon,             color: '#a855f7' },
    design:       { label: 'Design',          Icon: PaintBrushIcon,           color: '#f59e0b' },
    research:     { label: 'Research',        Icon: BeakerIcon,               color: '#10b981' },
    hardware:     { label: 'Hardware / IoT',  Icon: CpuChipIcon,              color: '#ef4444' },
    presentation: { label: 'Presentation',    Icon: PresentationChartBarIcon, color: '#ec4899' },
};

const DIFF_META: Record<string, { color: string; dot: string }> = {
    beginner:     { color: 'text-emerald-400', dot: 'bg-emerald-400' },
    intermediate: { color: 'text-amber-400',   dot: 'bg-amber-400'   },
    advanced:     { color: 'text-rose-400',     dot: 'bg-rose-400'    },
};

const LANG_COLOR: Record<string, string> = {
    javascript: '#f7df1e', python: '#3572A5', html: '#e34c26',
    css: '#563d7c', typescript: '#2b7489', java: '#b07219', default: '#f97316',
};
const CAT_COLOR: Record<string, string> = {
    web: '#06b6d4', mobile: '#3b82f6', ai: '#a855f7',
    game: '#f59e0b', iot: '#10b981', other: '#64748b',
};

type Tab       = 'work' | 'activities' | 'groups';
type ActFilter = 'all' | 'active' | 'pending_review' | 'overdue' | 'draft';

// ── page ─────────────────────────────────────────────────────────────────────
export default function ProjectsPage() {
    const { profile, loading: authLoading } = useAuth();
    const role      = profile?.role;
    const isStaff   = role === 'admin' || role === 'teacher' || role === 'school';
    const isStudent = role === 'student';

    const [tab, setTab]           = useState<Tab>('work');
    const [loading, setLoading]   = useState(true);
    const [actLoading, setActLoading] = useState(false);
    const [search, setSearch]     = useState('');
    const [expandedStudent, setExpandedStudent] = useState<string | null>(null);
    const [collapsedSchools, setCollapsedSchools] = useState<Set<string>>(new Set());
    const [actFilter, setActFilter] = useState<ActFilter>('all');
    const [actSearch, setActSearch] = useState('');
    const [selectedCat, setSelectedCat] = useState<string>('all');

    // Student state
    const [myLab, setMyLab]         = useState<any[]>([]);
    const [myPortfolio, setMyPortfolio] = useState<any[]>([]);
    const [myActivities, setMyActivities] = useState<any[]>([]);
    const [studentActFilter, setStudentActFilter] = useState<'all' | 'pending' | 'submitted' | 'graded'>('all');

    // Staff state
    const [students, setStudents]     = useState<any[]>([]);
    const [labMap, setLabMap]         = useState<Record<string, any[]>>({});
    const [portfolioMap, setPortfolioMap] = useState<Record<string, any[]>>({});
    const [activities, setActivities] = useState<any[]>([]);

    // Groups state (shared — student sees own groups; staff manages all)
    const [groups, setGroups]           = useState<any[]>([]);
    const [groupsLoading, setGroupsLoading] = useState(false);
    const [groupsError, setGroupsError] = useState<string | null>(null);
    // Staff group creator
    const [showCreateGroup, setShowCreateGroup] = useState(false);
    const [newGroupName, setNewGroupName]       = useState('');
    const [newGroupClass, setNewGroupClass]     = useState('');
    const [newGroupEval, setNewGroupEval]       = useState<'individual' | 'group'>('group');
    const [newGroupStudents, setNewGroupStudents] = useState<string[]>([]);
    const [savingGroup, setSavingGroup]         = useState(false);
    // Staff grading
    const [gradingGroupId, setGradingGroupId]   = useState<string | null>(null);
    const [gradingGroup, setGradingGroup]       = useState<any | null>(null);
    const [gradeScore, setGradeScore]           = useState('');
    const [gradeFeedback, setGradeFeedback]     = useState('');
    const [individualScores, setIndividualScores] = useState<Record<string, { score: string; feedback: string }>>({});
    const [savingGrade, setSavingGrade]         = useState(false);

    // ── Load work data ────────────────────────────────────────────────────────
    useEffect(() => {
        if (authLoading || !profile) return;
        const db = createClient();
        async function load() {
            setLoading(true);
            try {
                if (isStudent && profile) {
                    const [labRes, portRes] = await Promise.all([
                        db.from('lab_projects').select('*').eq('user_id', profile!.id).order('updated_at', { ascending: false }),
                        db.from('portfolio_projects').select('*').eq('user_id', profile!.id).order('updated_at', { ascending: false }),
                    ]);
                    setMyLab(labRes.data || []);
                    setMyPortfolio(portRes.data || []);
                } else if (isStaff) {
                    const r    = await fetch('/api/portal-users?role=student&scoped=true', { cache: 'no-store' });
                    const j    = r.ok ? await r.json() : { data: [] };
                    const studs: any[] = j.data || [];
                    setStudents(studs);
                    if (studs.length > 0) {
                        const ids = studs.map((s: any) => s.id);
                        const [labRes, portRes] = await Promise.all([
                            db.from('lab_projects').select('*').in('user_id', ids).order('updated_at', { ascending: false }),
                            db.from('portfolio_projects').select('*').in('user_id', ids).order('updated_at', { ascending: false }),
                        ]);
                        const lm: Record<string, any[]> = {};
                        const pm: Record<string, any[]> = {};
                        (labRes.data || []).forEach((p: any) => { lm[p.user_id] = [...(lm[p.user_id] || []), p]; });
                        (portRes.data || []).forEach((p: any) => { pm[p.user_id] = [...(pm[p.user_id] || []), p]; });
                        setLabMap(lm);
                        setPortfolioMap(pm);
                    }
                }
            } finally { setLoading(false); }
        }
        load();
    }, [authLoading, profile?.id]); // eslint-disable-line

    // ── Load activities (lazy on tab switch) ──────────────────────────────────
    useEffect(() => {
        if (tab !== 'activities' || !profile || authLoading) return;
        async function loadActs() {
            setActLoading(true);
            try {
                const res  = await fetch('/api/assignments', { cache: 'no-store' });
                const json = res.ok ? await res.json() : { data: [] };
                const all: any[] = (json.data || []).filter((a: any) => a.assignment_type === 'project');
                if (isStaff)   setActivities(all);
                else            setMyActivities(all.filter((a: any) => a.is_active !== false));
            } finally { setActLoading(false); }
        }
        loadActs();
    }, [tab, profile?.id, authLoading]); // eslint-disable-line

    // ── Load groups (lazy on tab switch) ─────────────────────────────────────
    useEffect(() => {
        if (tab !== 'groups' || !profile || authLoading) return;
        loadGroups();
    }, [tab, profile?.id, authLoading]); // eslint-disable-line

    async function loadGroups() {
        setGroupsLoading(true); setGroupsError(null);
        try {
            const res = await fetch('/api/project-groups', { cache: 'no-store' });
            const json = res.ok ? await res.json() : { error: 'Failed' };
            if (!json.success) throw new Error(json.error);
            setGroups(json.groups ?? []);
        } catch (e: any) {
            setGroupsError(e.message);
        } finally { setGroupsLoading(false); }
    }

    async function handleCreateGroup() {
        setGroupCreateError(null);
        if (!newGroupName.trim()) { setGroupCreateError('Group name is required.'); return; }
        if (newGroupStudents.length < 2) { setGroupCreateError('Select at least 2 students.'); return; }
        setSavingGroup(true);
        try {
            const res = await fetch('/api/project-groups', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: newGroupName.trim(),
                    class_name: newGroupClass || null,
                    evaluation_type: newGroupEval,
                    student_ids: newGroupStudents,
                }),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.error);
            setShowCreateGroup(false);
            setNewGroupName(''); setNewGroupClass(''); setNewGroupStudents([]);
            loadGroups();
        } catch (e: any) {
            setGroupsError(e.message);
        } finally { setSavingGroup(false); }
    }

    async function handleGradeGroup(group: any) {
        setSavingGrade(true);
        try {
            const body: any = { id: group.id, is_graded: true, group_feedback: gradeFeedback || null };
            if (group.evaluation_type === 'group') {
                const score = parseFloat(gradeScore);
                if (isNaN(score)) throw new Error('Enter a valid score');
                body.group_score = score;
            } else {
                body.individual_scores = Object.entries(individualScores).map(([student_id, v]) => ({
                    student_id,
                    score: parseFloat(v.score) || 0,
                    feedback: v.feedback || null,
                }));
            }
            const res = await fetch('/api/project-groups', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.error);
            setGradingGroupId(null); setGradingGroup(null); setGradeScore(''); setGradeFeedback(''); setIndividualScores({});
            loadGroups();
        } catch (e: any) {
            setGroupsError(e.message);
        } finally { setSavingGrade(false); }
    }

    async function confirmDeleteGroup() {
        if (!deleteGroupTarget) return;
        await fetch(`/api/project-groups?id=${deleteGroupTarget.id}`, { method: 'DELETE' });
        setGroups(g => g.filter(x => x.id !== deleteGroupTarget.id));
        setDeleteGroupTarget(null);
    }

    // WhatsApp sharing
    const [sharingGroupId, setSharingGroupId] = useState<string | null>(null);
    const [deleteGroupTarget, setDeleteGroupTarget] = useState<{ id: string; name: string } | null>(null);
    const [groupCreateError, setGroupCreateError] = useState<string | null>(null);

    // Unique classes from loaded students (for staff group creation)
    const classOptions = [...new Set(students.map((s: any) => s.section_class).filter(Boolean))].sort();

    /** Format phone number to international format for wa.me (strips + and leading zeros, adds 234 for Nigerian numbers) */
    function fmtPhone(raw: string | null | undefined): string | null {
        if (!raw) return null;
        const digits = raw.replace(/\D/g, '');
        if (digits.length === 0) return null;
        if (digits.startsWith('234'))  return digits;          // already has country code
        if (digits.startsWith('0'))    return '234' + digits.slice(1); // Nigerian local format
        if (digits.length >= 10)       return digits;          // assume already international
        return null;
    }

    function buildResultMsg(memberName: string, groupName: string, assignmentTitle: string | undefined, score: number | null, feedback: string | null | undefined, evalType: 'group' | 'individual'): string {
        const scoreStr = score != null ? `${score}/100` : 'not yet scored';
        const evalNote = evalType === 'group' ? 'group score' : 'individual score';
        let msg = `Hello ${memberName},\n\nYour ${evalNote} for the *${groupName}* project`;
        if (assignmentTitle) msg += ` (${assignmentTitle})`;
        msg += ` is: *${scoreStr}*.`;
        if (feedback) msg += `\n\nTeacher's feedback: "${feedback}"`;
        msg += '\n\n— Rillcod Academy';
        return msg;
    }

    if (authLoading || (!isStudent && !isStaff)) {
        return <div className="min-h-screen bg-background flex items-center justify-center"><div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" /></div>;
    }

    // ── Shared tab bar ────────────────────────────────────────────────────────
    const TABS = isStudent
        ? [
            { id: 'work' as Tab, label: 'My Work', icon: CodeBracketIcon },
            { id: 'activities' as Tab, label: 'Activities', icon: ClipboardDocumentListIcon },
            { id: 'groups' as Tab, label: 'My Group', icon: UsersIcon },
          ]
        : [
            { id: 'work' as Tab, label: 'Student Overview', icon: UserGroupIcon },
            { id: 'activities' as Tab, label: 'Activities', icon: ClipboardDocumentListIcon },
            { id: 'groups' as Tab, label: 'Groups', icon: UsersIcon },
          ];

    function TabBar() {
        return (
            <div className="bg-[#0a0a12] border-b border-white/[0.06] px-6 md:px-10">
                <div className="flex gap-0">
                    {TABS.map(t => {
                        const Icon   = t.icon;
                        const active = tab === t.id;
                        const badge  = (t.id === 'activities' && isStaff && activities.length > 0 && !actLoading) ? activities.length : null;
                        return (
                            <button key={t.id} onClick={() => setTab(t.id)}
                                className={`flex items-center gap-2 px-5 py-3.5 text-[11px] font-black uppercase tracking-widest border-b-2 transition-all ${active ? 'border-orange-500 text-orange-400' : 'border-transparent text-white/30 hover:text-white/60'}`}>
                                <Icon className="w-3.5 h-3.5" />
                                {t.label}
                                {badge && <span className="ml-1 text-[8px] bg-orange-500/20 text-orange-400 px-1.5 py-0.5 rounded-full font-black">{badge}</span>}
                            </button>
                        );
                    })}
                </div>
            </div>
        );
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // STUDENT VIEW
    // ═══════════════════════════════════════════════════════════════════════════
    if (isStudent) {
        const pct   = projectScore(myLab.length, myPortfolio.length);
        const total = myLab.length + myPortfolio.length;

        // Student activity stats
        const myActStats = {
            total:     myActivities.length,
            pending:   myActivities.filter(a => { const s = a.assignment_submissions?.find((s: any) => s.portal_user_id === profile!.id); return !s; }).length,
            submitted: myActivities.filter(a => { const s = a.assignment_submissions?.find((s: any) => s.portal_user_id === profile!.id); return s?.status === 'submitted'; }).length,
            graded:    myActivities.filter(a => { const s = a.assignment_submissions?.find((s: any) => s.portal_user_id === profile!.id); return s?.status === 'graded'; }).length,
        };

        const filteredMyActs = myActivities.filter(a => {
            const sub = a.assignment_submissions?.find((s: any) => s.portal_user_id === profile!.id);
            const status = sub?.status || 'pending';
            if (studentActFilter === 'pending')   return status === 'pending';
            if (studentActFilter === 'submitted') return status === 'submitted';
            if (studentActFilter === 'graded')    return status === 'graded';
            return true;
        });

        return (
            <div className="min-h-screen bg-background">
                {/* Hero */}
                <div className="relative overflow-hidden bg-[#0a0a12] border-b border-white/[0.06]">
                    <div className="absolute inset-0 bg-gradient-to-br from-orange-900/20 via-transparent to-amber-900/10 pointer-events-none" />
                    <div className="absolute top-0 right-0 w-96 h-96 bg-orange-600/5 rounded-full blur-[100px] pointer-events-none" />
                    <div className="relative px-4 sm:px-6 md:px-10 py-6 sm:py-10">
                        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 sm:gap-6">
                            <div className="flex items-center gap-3 sm:gap-5">
                                <div className="w-12 h-12 sm:w-16 sm:h-16 bg-orange-500/10 border border-orange-500/30 flex items-center justify-center flex-shrink-0">
                                    <RocketLaunchIcon className="w-6 h-6 sm:w-8 sm:h-8 text-orange-400" />
                                </div>
                                <div>
                                    <p className="text-[9px] sm:text-[10px] font-black text-orange-400/70 uppercase tracking-[0.3em] mb-1">Academic Score · 20% of Final Grade</p>
                                    <h1 className="text-2xl sm:text-3xl font-black text-white uppercase tracking-tight italic leading-none">Project Engagement</h1>
                                    <p className="text-xs sm:text-sm text-white/40 font-semibold mt-1">Lab work & portfolio · teacher activities</p>
                                </div>
                            </div>

                            {/* Score card */}
                            <div className="flex flex-wrap items-center gap-4 sm:gap-6 bg-white/[0.03] border border-white/[0.07] px-4 sm:px-6 py-4 w-full md:w-auto">
                                <div className="text-center">
                                    <p className="text-[9px] font-black text-orange-400/70 uppercase tracking-[0.3em] mb-1">Your Score</p>
                                    <p className="text-4xl sm:text-5xl font-black text-white">{pct}<span className="text-xl sm:text-2xl text-white/40">%</span></p>
                                    <ScoreBadge pct={pct} />
                                </div>
                                <div className="hidden sm:block w-px h-14 bg-white/10" />
                                <div className="space-y-2">
                                    <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-orange-500" /><span className="text-[11px] text-white/50">{myLab.length} Lab Project{myLab.length !== 1 ? 's' : ''}</span></div>
                                    <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-amber-500" /><span className="text-[11px] text-white/50">{myPortfolio.length} Portfolio Project{myPortfolio.length !== 1 ? 's' : ''}</span></div>
                                    <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-emerald-500" /><span className="text-[11px] text-white/50">{total} / 3 target</span></div>
                                </div>
                            </div>
                        </div>
                        <div className="mt-4 flex items-center gap-2 flex-wrap">
                            <span className="text-[9px] font-black text-white/20 uppercase tracking-[0.2em]">How it's calculated:</span>
                            <span className="text-[10px] font-bold text-white/40">Every 3 projects (lab + portfolio) = 100% engagement score</span>
                            <span className="text-[10px] text-orange-400 font-black">· counts 20pts toward your final report</span>
                        </div>
                    </div>
                </div>

                <TabBar />

                {/* MY WORK TAB */}
                {tab === 'work' && (
                    loading ? (
                        <div className="flex items-center justify-center py-20"><ArrowPathIcon className="w-8 h-8 text-orange-400 animate-spin" /></div>
                    ) : (
                        <div className="px-6 md:px-10 py-8 space-y-10">
                            {/* Lab */}
                            <section>
                                <div className="flex items-center justify-between mb-5">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center"><CodeBracketIcon className="w-4 h-4 text-indigo-400" /></div>
                                        <div><h2 className="text-sm font-black text-white uppercase tracking-widest">Lab Projects</h2><p className="text-[10px] text-white/30">Code built in the Playground</p></div>
                                    </div>
                                    <Link href="/dashboard/playground" className="text-[10px] font-black text-indigo-400 uppercase tracking-widest hover:text-indigo-300 transition-colors flex items-center gap-1">Open Playground <ArrowRightIcon className="w-3 h-3" /></Link>
                                </div>
                                {myLab.length === 0 ? (
                                    <div className="border border-dashed border-white/10 p-10 text-center">
                                        <CodeBracketIcon className="w-10 h-10 text-white/10 mx-auto mb-3" />
                                        <p className="text-white/30 text-sm font-semibold">No lab projects yet</p>
                                        <p className="text-white/20 text-xs mt-1">Go to the Code Playground and save your work</p>
                                        <Link href="/dashboard/playground" className="inline-block mt-4 px-4 py-2 bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 text-xs font-black uppercase tracking-widest hover:bg-indigo-600/30 transition-all">Start Coding</Link>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                        {myLab.map(p => {
                                            const lang  = (p.language || 'default').toLowerCase();
                                            const color = LANG_COLOR[lang] || LANG_COLOR.default;
                                            return (
                                                <div key={p.id} className="bg-[#0d0d18] border border-white/[0.06] hover:border-indigo-500/30 transition-all group">
                                                    <div className="h-1.5" style={{ backgroundColor: color }} />
                                                    <div className="p-5">
                                                        <div className="flex items-start justify-between gap-2 mb-3">
                                                            <h3 className="text-sm font-black text-white group-hover:text-indigo-300 transition-colors line-clamp-2 leading-tight">{p.title}</h3>
                                                            <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full flex-shrink-0" style={{ backgroundColor: `${color}22`, color }}>{p.language}</span>
                                                        </div>
                                                        <p className="text-[10px] text-white/30 mb-4">Saved {p.updated_at ? new Date(p.updated_at).toLocaleDateString('en-GB') : '—'}</p>
                                                        <div className="flex items-center gap-2"><CheckCircleIcon className="w-3.5 h-3.5 text-emerald-400" /><span className="text-[10px] text-emerald-400 font-bold">Counts toward score</span></div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </section>

                            {/* Portfolio */}
                            <section>
                                <div className="flex items-center justify-between mb-5">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 bg-orange-500/10 border border-orange-500/20 flex items-center justify-center"><StarIcon className="w-4 h-4 text-orange-400" /></div>
                                        <div><h2 className="text-sm font-black text-white uppercase tracking-widest">Portfolio Projects</h2><p className="text-[10px] text-white/30">Showcased in My Portfolio</p></div>
                                    </div>
                                    <Link href="/dashboard/portfolio" className="text-[10px] font-black text-orange-400 uppercase tracking-widest hover:text-orange-300 transition-colors flex items-center gap-1">My Portfolio <ArrowRightIcon className="w-3 h-3" /></Link>
                                </div>
                                {myPortfolio.length === 0 ? (
                                    <div className="border border-dashed border-white/10 p-10 text-center">
                                        <StarIcon className="w-10 h-10 text-white/10 mx-auto mb-3" />
                                        <p className="text-white/30 text-sm font-semibold">No portfolio projects yet</p>
                                        <Link href="/dashboard/portfolio" className="inline-block mt-4 px-4 py-2 bg-orange-600/20 border border-orange-500/30 text-orange-400 text-xs font-black uppercase tracking-widest hover:bg-orange-600/30 transition-all">Go to Portfolio</Link>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                        {myPortfolio.map(p => {
                                            const cat   = (p.category || 'other').toLowerCase();
                                            const color = CAT_COLOR[cat] || CAT_COLOR.other;
                                            return (
                                                <div key={p.id} className="bg-[#0d0d18] border border-white/[0.06] hover:border-orange-500/30 transition-all group">
                                                    <div className="h-1.5" style={{ backgroundColor: color }} />
                                                    <div className="p-5">
                                                        <div className="flex items-start justify-between gap-2 mb-2">
                                                            <h3 className="text-sm font-black text-white group-hover:text-orange-300 transition-colors line-clamp-2 leading-tight">{p.title}</h3>
                                                            <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full flex-shrink-0" style={{ backgroundColor: `${color}22`, color }}>{p.category}</span>
                                                        </div>
                                                        {p.description && <p className="text-[11px] text-white/40 line-clamp-2 mb-3">{p.description}</p>}
                                                        {p.tags?.length > 0 && <div className="flex flex-wrap gap-1 mb-3">{p.tags.slice(0, 3).map((t: string) => <span key={t} className="text-[9px] bg-white/5 border border-white/10 text-white/50 px-1.5 py-0.5 rounded">{t}</span>)}</div>}
                                                        <div className="flex items-center gap-2">
                                                            <CheckCircleIcon className="w-3.5 h-3.5 text-emerald-400" /><span className="text-[10px] text-emerald-400 font-bold">Counts toward score</span>
                                                            {p.is_featured && <span className="text-[9px] font-black text-amber-400 ml-auto">★ Featured</span>}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </section>
                        </div>
                    )
                )}

                {/* STUDENT GROUPS TAB */}
                {tab === 'groups' && (
                    <div className="px-4 sm:px-6 md:px-10 py-8">
                        {groupsLoading ? (
                            <div className="flex items-center justify-center py-20"><ArrowPathIcon className="w-8 h-8 text-orange-400 animate-spin" /></div>
                        ) : groupsError ? (
                            <div className="text-center py-20">
                                <p className="text-rose-400 text-sm mb-4">{groupsError}</p>
                                <button onClick={loadGroups} className="px-4 py-2 bg-orange-600/20 border border-orange-500/30 text-orange-400 text-xs font-black uppercase tracking-widest hover:bg-orange-600/30 transition-all">Try Again</button>
                            </div>
                        ) : groups.length === 0 ? (
                            <div className="border border-dashed border-white/10 p-16 text-center">
                                <UsersIcon className="w-12 h-12 text-white/10 mx-auto mb-4" />
                                <p className="text-white/30 text-sm font-semibold">You haven't been assigned to a group yet</p>
                                <p className="text-white/20 text-xs mt-1">Your teacher will create project groups and add you</p>
                            </div>
                        ) : (
                            <div className="space-y-6 max-w-3xl mx-auto">
                                {groups.map((group: any) => {
                                    const members: any[] = group.project_group_members || [];
                                    const myMember = members.find((m: any) => m.student_id === profile!.id);
                                    const assignment = group.assignments;
                                    const isGroupEval = group.evaluation_type === 'group';
                                    const myScore = isGroupEval ? group.group_score : myMember?.individual_score;
                                    const myFeedback = isGroupEval ? group.group_feedback : myMember?.individual_feedback;

                                    return (
                                        <div key={group.id} className="bg-card border border-border rounded-2xl overflow-hidden">
                                            {/* Group header */}
                                            <div className="bg-orange-500/10 border-b border-orange-500/20 px-6 py-4 flex items-center gap-4">
                                                <div className="w-10 h-10 bg-orange-500/20 border border-orange-500/30 flex items-center justify-center flex-shrink-0 rounded-xl">
                                                    <UsersIcon className="w-5 h-5 text-orange-400" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <h3 className="text-base font-black text-white truncate">{group.name}</h3>
                                                    <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                                                        {group.class_name && <span className="text-[10px] text-white/40 font-semibold">{group.class_name}</span>}
                                                        <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full"
                                                            style={{ backgroundColor: isGroupEval ? '#f9731620' : '#10b98120', color: isGroupEval ? '#f97316' : '#34d399' }}>
                                                            {isGroupEval ? 'Group Score' : 'Individual Score'}
                                                        </span>
                                                        {group.is_graded && <span className="text-[10px] font-black text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">Graded</span>}
                                                    </div>
                                                </div>
                                                {group.is_graded && myScore != null && (
                                                    <div className="text-center flex-shrink-0">
                                                        <p className="text-3xl font-black text-emerald-400">{myScore}</p>
                                                        <p className="text-[9px] text-white/30 uppercase tracking-widest font-black">Your Score</p>
                                                    </div>
                                                )}
                                            </div>

                                            <div className="p-6 space-y-5">
                                                {/* Assignment */}
                                                {assignment && (
                                                    <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-3">
                                                        <p className="text-[9px] font-black text-white/30 uppercase tracking-widest mb-1">Assigned Activity</p>
                                                        <p className="text-sm font-bold text-white">{assignment.title}</p>
                                                        {assignment.description && <p className="text-[11px] text-white/40 mt-1 line-clamp-2">{assignment.description}</p>}
                                                        {assignment.due_date && (
                                                            <div className={`flex items-center gap-1.5 mt-2 ${deadlineLabel(assignment.due_date).overdue ? 'text-rose-400' : deadlineLabel(assignment.due_date).urgent ? 'text-amber-400' : 'text-white/30'}`}>
                                                                <ClockIcon className="w-3 h-3" />
                                                                <span className="text-[10px] font-bold">{deadlineLabel(assignment.due_date).text}</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}

                                                {/* Group members */}
                                                <div>
                                                    <p className="text-[9px] font-black text-white/30 uppercase tracking-widest mb-3">Your Group Members ({members.length})</p>
                                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                                        {members.map((m: any) => {
                                                            const isMe = m.student_id === profile!.id;
                                                            const name = m.portal_users?.full_name || 'Unknown';
                                                            const memberScore = isGroupEval ? group.group_score : m.individual_score;
                                                            return (
                                                                <div key={m.id} className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border transition-all ${isMe ? 'bg-orange-500/10 border-orange-500/30' : 'bg-white/[0.03] border-white/[0.06]'}`}>
                                                                    <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-[11px] font-black ${isMe ? 'bg-orange-500/30 text-orange-300' : 'bg-white/10 text-white/50'}`}>
                                                                        {(name || '?')[0].toUpperCase()}
                                                                    </div>
                                                                    <div className="min-w-0">
                                                                        <p className={`text-[11px] font-bold truncate ${isMe ? 'text-orange-300' : 'text-white/70'}`}>{name}{isMe && ' (You)'}</p>
                                                                        {group.is_graded && memberScore != null && (
                                                                            <p className="text-[10px] text-emerald-400 font-black">{memberScore} pts</p>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>

                                                {/* Feedback */}
                                                {group.is_graded && myFeedback && (
                                                    <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl px-4 py-3">
                                                        <p className="text-[9px] font-black text-emerald-400 uppercase tracking-widest mb-1">Teacher Feedback</p>
                                                        <p className="text-sm text-emerald-300/70 italic">"{myFeedback}"</p>
                                                    </div>
                                                )}

                                                {!group.is_graded && (
                                                    <div className="flex items-center gap-2 text-amber-400/60">
                                                        <ClockIcon className="w-3.5 h-3.5" />
                                                        <span className="text-[10px] font-bold">Awaiting evaluation from your teacher</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

                {/* STUDENT ACTIVITIES TAB */}
                {tab === 'activities' && (
                    <div>
                        {actLoading ? (
                            <div className="flex items-center justify-center py-20"><ArrowPathIcon className="w-8 h-8 text-orange-400 animate-spin" /></div>
                        ) : (
                            <>
                                {/* Stats bar */}
                                {myActivities.length > 0 && (
                                    <div className="bg-[#0a0a12] border-b border-white/[0.06] px-6 md:px-10 py-4">
                                        <div className="flex items-center gap-6 overflow-x-auto">
                                            {[
                                                { label: 'Total',     value: myActStats.total,     color: 'text-white',        dot: 'bg-white/30'      },
                                                { label: 'To Do',     value: myActStats.pending,   color: 'text-amber-400',    dot: 'bg-amber-400'     },
                                                { label: 'Submitted', value: myActStats.submitted, color: 'text-indigo-400',   dot: 'bg-indigo-400'    },
                                                { label: 'Graded',    value: myActStats.graded,    color: 'text-emerald-400',  dot: 'bg-emerald-400'   },
                                            ].map(s => (
                                                <div key={s.label} className="flex items-center gap-2 flex-shrink-0">
                                                    <div className={`w-2 h-2 rounded-full ${s.dot}`} />
                                                    <span className={`text-xl font-black ${s.color}`}>{s.value}</span>
                                                    <span className="text-[9px] font-black text-white/20 uppercase tracking-widest">{s.label}</span>
                                                </div>
                                            ))}
                                            {/* Progress bar */}
                                            <div className="ml-auto flex items-center gap-3 flex-shrink-0">
                                                <div className="w-32 h-1.5 bg-white/5 rounded-full overflow-hidden">
                                                    <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${myActStats.total > 0 ? Math.round((myActStats.graded / myActStats.total) * 100) : 0}%` }} />
                                                </div>
                                                <span className="text-[10px] text-white/30 font-bold">{myActStats.total > 0 ? Math.round((myActStats.graded / myActStats.total) * 100) : 0}% complete</span>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Filter pills */}
                                {myActivities.length > 0 && (
                                    <div className="px-6 md:px-10 py-3 border-b border-white/[0.06] flex items-center gap-2 overflow-x-auto">
                                        {([
                                            { key: 'all',       label: 'All Activities' },
                                            { key: 'pending',   label: 'To Do' },
                                            { key: 'submitted', label: 'Submitted' },
                                            { key: 'graded',    label: 'Graded' },
                                        ] as const).map(f => (
                                            <button key={f.key} onClick={() => setStudentActFilter(f.key)}
                                                className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-widest border transition-all flex-shrink-0 ${studentActFilter === f.key ? 'bg-orange-500/20 border-orange-500/40 text-orange-400' : 'bg-white/[0.02] border-white/[0.06] text-white/30 hover:text-white/60'}`}>
                                                {f.label}
                                            </button>
                                        ))}
                                    </div>
                                )}

                                <div className="px-6 md:px-10 py-6">
                                    {myActivities.length === 0 ? (
                                        <div className="border border-dashed border-white/10 p-16 text-center">
                                            <ClipboardDocumentListIcon className="w-12 h-12 text-white/10 mx-auto mb-4" />
                                            <p className="text-white/30 text-sm font-semibold">No activities assigned yet</p>
                                            <p className="text-white/20 text-xs mt-1">Your teacher will post project activities here</p>
                                        </div>
                                    ) : filteredMyActs.length === 0 ? (
                                        <div className="border border-dashed border-white/10 p-10 text-center">
                                            <p className="text-white/30 text-sm">No activities in this category</p>
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                            {filteredMyActs.map((act: any) => {
                                                const subs  = act.assignment_submissions || [];
                                                const mySub = subs.find((s: any) => s.portal_user_id === profile!.id);
                                                const status = mySub?.status || 'pending';
                                                const meta   = act.metadata || {};
                                                const catInfo = CAT_META[meta.category] || CAT_META.coding;
                                                const CatIcon = catInfo.Icon;
                                                const dl      = deadlineLabel(act.due_date);
                                                const diff    = DIFF_META[meta.difficulty] || DIFF_META.intermediate;

                                                const statusStyle = status === 'graded'
                                                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                                                    : status === 'submitted'
                                                    ? 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                                                    : 'bg-white/5 border-white/10 text-white/30';

                                                return (
                                                    <Link key={act.id} href={`/dashboard/projects/${act.id}`}
                                                        className="bg-[#0d0d18] border border-white/[0.06] hover:border-orange-500/30 transition-all group block relative overflow-hidden">

                                                        {/* Overdue banner */}
                                                        {dl.overdue && status === 'pending' && (
                                                            <div className="absolute top-0 left-0 right-0 bg-rose-600/80 px-3 py-1 flex items-center gap-1.5 z-10">
                                                                <ExclamationTriangleIcon className="w-3 h-3 text-white" />
                                                                <span className="text-[9px] font-black text-white uppercase tracking-widest">Overdue</span>
                                                            </div>
                                                        )}

                                                        <div className={`h-1.5 ${dl.overdue && status === 'pending' ? 'mt-6' : ''}`} style={{ backgroundColor: catInfo.color }} />

                                                        <div className="p-5">
                                                            {/* Header */}
                                                            <div className="flex items-start justify-between gap-2 mb-3">
                                                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                                                    <div className="w-7 h-7 flex items-center justify-center flex-shrink-0" style={{ backgroundColor: catInfo.color + '20' }}>
                                                                        <CatIcon className="w-3.5 h-3.5" style={{ color: catInfo.color }} />
                                                                    </div>
                                                                    <h3 className="text-sm font-black text-white group-hover:text-orange-300 transition-colors line-clamp-2 leading-tight">{act.title}</h3>
                                                                </div>
                                                                <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 border flex-shrink-0 ${statusStyle}`}>
                                                                    {status === 'graded' ? 'Graded' : status === 'submitted' ? 'Submitted' : 'To Do'}
                                                                </span>
                                                            </div>

                                                            {act.description && <p className="text-[11px] text-white/40 line-clamp-2 mb-3">{act.description}</p>}

                                                            {/* Meta row */}
                                                            <div className="flex items-center gap-2 flex-wrap mb-3">
                                                                <span className="text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5" style={{ backgroundColor: catInfo.color + '18', color: catInfo.color }}>{catInfo.label}</span>
                                                                {meta.difficulty && <div className="flex items-center gap-1"><div className={`w-1.5 h-1.5 rounded-full ${diff.dot}`} /><span className={`text-[9px] font-bold ${diff.color}`}>{meta.difficulty}</span></div>}
                                                                {meta.group_activity && <span className="text-[9px] font-black text-cyan-400 bg-cyan-500/10 px-1.5 py-0.5">Group</span>}
                                                                {meta.grading_mode === 'auto' && <span className="text-[9px] font-black text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 flex items-center gap-1"><BoltIcon className="w-2.5 h-2.5" />Auto-Grade</span>}
                                                            </div>

                                                            {/* Deadline */}
                                                            <div className={`flex items-center gap-1.5 mb-3 ${dl.overdue ? 'text-rose-400' : dl.urgent ? 'text-amber-400' : 'text-white/30'}`}>
                                                                <ClockIcon className="w-3 h-3" />
                                                                <span className="text-[10px] font-bold">{dl.text}</span>
                                                            </div>

                                                            {/* Grade display */}
                                                            {mySub?.grade != null && (
                                                                <div className="border-t border-white/[0.06] pt-3 mb-3">
                                                                    <div className="flex items-center justify-between">
                                                                        <span className="text-[10px] text-white/40">Your grade</span>
                                                                        <div className="flex items-center gap-1">
                                                                            <span className="text-xl font-black text-emerald-400">{mySub.grade}</span>
                                                                            <span className="text-white/30 text-xs">/ {act.max_points || 100}</span>
                                                                        </div>
                                                                    </div>
                                                                    {mySub.grade != null && (
                                                                        <div className="mt-1.5 h-1 bg-white/5 rounded-full overflow-hidden">
                                                                            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.round((mySub.grade / (act.max_points || 100)) * 100)}%` }} />
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            )}

                                                            {mySub?.feedback && (
                                                                <div className="bg-emerald-500/5 border border-emerald-500/20 px-3 py-2 mb-3">
                                                                    <p className="text-[9px] font-black text-emerald-400 mb-0.5">Teacher Feedback</p>
                                                                    <p className="text-[10px] text-emerald-300/60 italic line-clamp-2">"{mySub.feedback}"</p>
                                                                </div>
                                                            )}

                                                            {/* CTA */}
                                                            <div className="flex items-center gap-1.5 text-orange-400 group-hover:text-orange-300 transition-colors">
                                                                <span className="text-[10px] font-black uppercase tracking-widest">
                                                                    {status === 'graded' ? 'View Feedback' : status === 'submitted' ? 'View Submission' : 'Start & Submit'}
                                                                </span>
                                                                <ArrowRightIcon className="w-3 h-3" />
                                                            </div>
                                                        </div>
                                                    </Link>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                )}
            </div>
        );
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // STAFF VIEW
    // ═══════════════════════════════════════════════════════════════════════════

    const filteredStudents = students.filter(s =>
        !search || (s.full_name || '').toLowerCase().includes(search.toLowerCase()) ||
        (s.school_name || '').toLowerCase().includes(search.toLowerCase())
    );
    const totalWithProjects = students.filter(s => (labMap[s.id]?.length || 0) + (portfolioMap[s.id]?.length || 0) > 0).length;
    const avgScore = students.length > 0
        ? Math.round(students.reduce((sum, s) => sum + projectScore(labMap[s.id]?.length || 0, portfolioMap[s.id]?.length || 0), 0) / students.length)
        : 0;

    // Group students by school
    const studentsBySchool = filteredStudents.reduce<Record<string, any[]>>((acc, s) => {
        const key = s.school_name || 'No School';
        if (!acc[key]) acc[key] = [];
        acc[key].push(s);
        return acc;
    }, {});
    const schoolNames = Object.keys(studentsBySchool).sort();

    // Activity filters
    const filteredActs = activities.filter(a => {
        const isOverdue  = a.due_date && new Date(a.due_date) < new Date();
        const isDraft    = a.is_active === false;
        const hasPending = (a.assignment_submissions || []).some((s: any) => s.status === 'submitted');
        if (actFilter === 'active')         return !isDraft && !isOverdue;
        if (actFilter === 'overdue')        return !isDraft && isOverdue;
        if (actFilter === 'pending_review') return hasPending;
        if (actFilter === 'draft')          return isDraft;
        return true;
    }).filter(a => !actSearch || (a.title || '').toLowerCase().includes(actSearch.toLowerCase()));

    const actStats = {
        total:        activities.length,
        active:       activities.filter(a => a.is_active !== false && !(a.due_date && new Date(a.due_date) < new Date())).length,
        pendingGrade: activities.reduce((n, a) => n + (a.assignment_submissions || []).filter((s: any) => s.status === 'submitted').length, 0),
        totalSubs:    activities.reduce((n, a) => n + (a.assignment_submissions || []).length, 0),
        graded:       activities.reduce((n, a) => n + (a.assignment_submissions || []).filter((s: any) => s.status === 'graded').length, 0),
    };

    // Group filtered activities by category
    const catFilteredActs = selectedCat === 'all' ? filteredActs : filteredActs.filter(a => (a.metadata?.category || 'coding') === selectedCat);
    const actsByCategory = catFilteredActs.reduce<Record<string, any[]>>((acc, a) => {
        const cat = a.metadata?.category || 'coding';
        if (!acc[cat]) acc[cat] = [];
        acc[cat].push(a);
        return acc;
    }, {});
    const usedCategories = Object.keys(CAT_META).filter(k => actsByCategory[k]?.length > 0);
    const catCounts = Object.keys(CAT_META).reduce<Record<string, number>>((acc, k) => {
        acc[k] = filteredActs.filter(a => (a.metadata?.category || 'coding') === k).length;
        return acc;
    }, {});

    return (
        <div className="min-h-screen bg-background">
            {/* Hero */}
            <div className="relative overflow-hidden bg-[#0a0a12] border-b border-white/[0.06]">
                <div className="absolute inset-0 bg-gradient-to-br from-orange-900/20 via-transparent to-amber-900/10 pointer-events-none" />
                <div className="absolute top-0 right-0 w-96 h-96 bg-orange-600/5 rounded-full blur-[100px] pointer-events-none" />
                <div className="relative px-4 sm:px-6 md:px-10 py-6 sm:py-10">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 sm:gap-6">
                        <div className="flex items-center gap-3 sm:gap-5">
                            <div className="w-12 h-12 sm:w-16 sm:h-16 bg-orange-500/10 border border-orange-500/30 flex items-center justify-center flex-shrink-0">
                                <RocketLaunchIcon className="w-6 h-6 sm:w-8 sm:h-8 text-orange-400" />
                            </div>
                            <div>
                                <p className="text-[9px] sm:text-[10px] font-black text-orange-400/70 uppercase tracking-[0.3em] mb-1">Score Category · 20% of Final Grade</p>

                                <h1 className="text-2xl sm:text-3xl font-black text-white uppercase tracking-tight italic leading-none">Project Engagement</h1>
                                <p className="text-xs sm:text-sm text-white/40 font-semibold mt-1">Lab + portfolio projects and teacher-assigned activities</p>
                            </div>
                        </div>
                        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
                            <div className="grid grid-cols-3 gap-2 sm:gap-3 w-full sm:w-auto">
                                {[
                                    { label: 'Students', value: students.length, color: 'text-white' },
                                    { label: 'Active',   value: totalWithProjects, color: 'text-orange-400' },
                                    { label: 'Avg Score',value: `${avgScore}%`, color: 'text-emerald-400' },
                                ].map(s => (
                                    <div key={s.label} className="bg-white/[0.03] border border-white/[0.07] px-3 sm:px-4 py-2 sm:py-3 text-center">
                                        <p className={`text-xl sm:text-2xl font-black ${s.color}`}>{s.value}</p>
                                        <p className="text-[8px] sm:text-[9px] font-black text-white/30 uppercase tracking-widest mt-0.5">{s.label}</p>
                                    </div>
                                ))}
                            </div>
                            <Link href="/dashboard/projects/new"
                                className="flex items-center gap-2 px-4 sm:px-5 py-2.5 sm:py-3 bg-orange-600 hover:bg-orange-500transition-colors text-white text-xs font-black uppercase tracking-widest flex-shrink-0 w-full sm:w-auto justify-center">
                                <PlusIcon className="w-4 h-4" /> New Activity
                            </Link>
                        </div>
                    </div>
                </div>
            </div>

            <TabBar />

            {/* STAFF — STUDENT OVERVIEW TAB */}
            {tab === 'work' && (
                <>
                    <div className="px-6 md:px-10 py-4 border-b border-white/[0.06] bg-[#0a0a12]">
                        <div className="relative max-w-md">
                            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                            <input type="text" placeholder="Search student or school..." value={search} onChange={e => setSearch(e.target.value)}
                                className="w-full pl-9 pr-4 py-2.5 bg-white/5 border border-white/10 text-sm text-white placeholder-white/20 focus:outline-none focus:border-orange-500/50 transition-colors" />
                        </div>
                    </div>
                    {loading ? (
                        <div className="flex items-center justify-center py-20"><ArrowPathIcon className="w-8 h-8 text-orange-400 animate-spin" /></div>
                    ) : (
                        <div className="px-6 md:px-10 py-6 space-y-6">
                            {filteredStudents.length === 0 && <div className="text-center py-20 text-white/30 text-sm">No students found.</div>}
                            {schoolNames.map(schoolName => {
                                const schoolStudents = studentsBySchool[schoolName];
                                const isCollapsed = collapsedSchools.has(schoolName);
                                const schoolAvg = schoolStudents.length > 0
                                    ? Math.round(schoolStudents.reduce((sum, s) => sum + projectScore(labMap[s.id]?.length || 0, portfolioMap[s.id]?.length || 0), 0) / schoolStudents.length)
                                    : 0;
                                const schoolActive = schoolStudents.filter(s => (labMap[s.id]?.length || 0) + (portfolioMap[s.id]?.length || 0) > 0).length;
                                return (
                                    <div key={schoolName} className="space-y-2">
                                        {/* School section header */}
                                        <button
                                            onClick={() => setCollapsedSchools(prev => {
                                                const next = new Set(prev);
                                                if (next.has(schoolName)) next.delete(schoolName); else next.add(schoolName);
                                                return next;
                                            })}
                                            className="w-full flex items-center gap-3 px-4 py-2.5 bg-white/[0.025] border border-white/[0.06] hover:border-orange-500/20 transition-all text-left"
                                        >
                                            <div className="w-7 h-7 bg-orange-500/10 border border-orange-500/20 flex items-center justify-center flex-shrink-0">
                                                <UserGroupIcon className="w-3.5 h-3.5 text-orange-400" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-xs font-black text-white uppercase tracking-widest truncate">{schoolName}</p>
                                                <p className="text-[9px] text-white/30">{schoolStudents.length} student{schoolStudents.length !== 1 ? 's' : ''} · {schoolActive} active · avg {schoolAvg}%</p>
                                            </div>
                                            <ScoreBadge pct={schoolAvg} />
                                            {isCollapsed ? <ChevronDownIcon className="w-3.5 h-3.5 text-white/30 flex-shrink-0" /> : <ChevronUpIcon className="w-3.5 h-3.5 text-orange-400 flex-shrink-0" />}
                                        </button>

                                        {/* Students in this school */}
                                        {!isCollapsed && (
                                            <div className="space-y-1.5 pl-0">
                                                {schoolStudents.map(student => {
                                                    const labs  = labMap[student.id] || [];
                                                    const port  = portfolioMap[student.id] || [];
                                                    const pct   = projectScore(labs.length, port.length);
                                                    const isExp = expandedStudent === student.id;
                                                    return (
                                                        <div key={student.id} className="bg-[#0d0d18] border border-white/[0.06] hover:border-orange-500/20 transition-all">
                                                            <button onClick={() => setExpandedStudent(isExp ? null : student.id)} className="w-full flex items-center gap-4 px-5 py-3.5 text-left">
                                                                <div className="w-8 h-8 rounded-full bg-orange-500/20 border border-orange-500/30 flex items-center justify-center flex-shrink-0">
                                                                    <span className="text-[11px] font-black text-orange-300">{(student.full_name || '?')[0].toUpperCase()}</span>
                                                                </div>
                                                                <div className="flex-1 min-w-0">
                                                                    <p className="text-sm font-black text-white truncate">{student.full_name || '—'}</p>
                                                                    <div className="flex items-center gap-2 mt-0.5 sm:hidden">
                                                                        <span className="text-[9px] text-indigo-400">{labs.length} Lab</span>
                                                                        <span className="text-white/10">·</span>
                                                                        <span className="text-[9px] text-orange-400">{port.length} Portfolio</span>
                                                                        <span className="text-white/10">·</span>
                                                                        <span className="text-[9px] font-black" style={{ color: pct >= 80 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#ef4444' }}>{pct}%</span>
                                                                    </div>
                                                                </div>
                                                                <div className="hidden sm:flex items-center gap-4 flex-shrink-0">
                                                                    <div className="text-center"><p className="text-base font-black text-indigo-400">{labs.length}</p><p className="text-[9px] text-white/30 uppercase tracking-widest">Lab</p></div>
                                                                    <div className="text-center"><p className="text-base font-black text-orange-400">{port.length}</p><p className="text-[9px] text-white/30 uppercase tracking-widest">Portfolio</p></div>
                                                                    <div className="w-px h-8 bg-white/10" />
                                                                    <ScoreBadge pct={pct} />
                                                                </div>
                                                                {role !== 'school' && (
                                                                    <Link href={`/dashboard/reports/builder?student=${student.id}`} onClick={e => e.stopPropagation()}
                                                                        className="hidden md:flex items-center gap-1 text-[9px] font-black text-orange-400/60 uppercase tracking-widest hover:text-orange-400 transition-colors px-2 py-1 border border-orange-500/20 hover:border-orange-500/40 flex-shrink-0">
                                                                        <EyeIcon className="w-3 h-3" /> Report
                                                                    </Link>
                                                                )}
                                                                {isExp ? <ChevronUpIcon className="w-4 h-4 text-orange-400 flex-shrink-0" /> : <ChevronDownIcon className="w-4 h-4 text-white/30 flex-shrink-0" />}
                                                            </button>
                                                            {isExp && (
                                                                <div className="border-t border-white/[0.06] px-5 py-5 space-y-5 bg-black/20">
                                                                    <div>
                                                                        <div className="flex items-center gap-2 mb-3"><CodeBracketIcon className="w-4 h-4 text-indigo-400" /><span className="text-xs font-black text-indigo-400 uppercase tracking-widest">Lab Projects ({labs.length})</span></div>
                                                                        {labs.length === 0 ? <p className="text-[11px] text-white/20 italic pl-6">No lab projects saved yet</p> : (
                                                                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 pl-6">
                                                                                {labs.map(p => { const color = LANG_COLOR[(p.language || '').toLowerCase()] || LANG_COLOR.default; return (
                                                                                    <div key={p.id} className="bg-white/[0.03] border border-white/[0.06] px-3 py-2.5">
                                                                                        <p className="text-[11px] font-black text-white truncate">{p.title}</p>
                                                                                        <span className="text-[9px] font-bold" style={{ color }}>{p.language}</span>
                                                                                        <p className="text-[9px] text-white/20 mt-1">{p.updated_at ? new Date(p.updated_at).toLocaleDateString('en-GB') : '—'}</p>
                                                                                    </div>
                                                                                ); })}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                    <div>
                                                                        <div className="flex items-center gap-2 mb-3"><StarIcon className="w-4 h-4 text-orange-400" /><span className="text-xs font-black text-orange-400 uppercase tracking-widest">Portfolio Projects ({port.length})</span></div>
                                                                        {port.length === 0 ? <p className="text-[11px] text-white/20 italic pl-6">No portfolio projects added yet</p> : (
                                                                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 pl-6">
                                                                                {port.map(p => { const color = CAT_COLOR[(p.category || '').toLowerCase()] || CAT_COLOR.other; return (
                                                                                    <div key={p.id} className="bg-white/[0.03] border border-white/[0.06] px-3 py-2.5">
                                                                                        <p className="text-[11px] font-black text-white truncate">{p.title}</p>
                                                                                        <span className="text-[9px] font-bold" style={{ color }}>{p.category}</span>
                                                                                        {p.is_featured && <p className="text-[9px] text-amber-400 font-black mt-1">★ Featured</p>}
                                                                                    </div>
                                                                                ); })}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                    <div className="flex items-center gap-3 bg-orange-500/5 border border-orange-500/20 px-4 py-3">
                                                                        <div className="w-8 h-8 bg-orange-500/20 flex items-center justify-center flex-shrink-0"><RocketLaunchIcon className="w-4 h-4 text-orange-400" /></div>
                                                                        <div className="flex-1">
                                                                            <p className="text-[10px] font-black text-orange-400 uppercase tracking-widest">Project Engagement Score</p>
                                                                            <p className="text-xs text-white/40 mt-0.5">{labs.length} lab + {port.length} portfolio = {labs.length + port.length} total → <span className="text-orange-300 font-black">{pct}%</span></p>
                                                                        </div>
                                                                        {role !== 'school' && (
                                                                            <Link href={`/dashboard/reports/builder?student=${student.id}`}
                                                                                className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-600/20 border border-orange-500/30 text-orange-400 text-[10px] font-black uppercase tracking-widest hover:bg-orange-600/30 transition-all flex-shrink-0">
                                                                                <EyeIcon className="w-3.5 h-3.5" /> Build Report
                                                                            </Link>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </>
            )}

            {/* STAFF — GROUPS TAB */}
            {tab === 'groups' && (() => {
                const classFiltered = newGroupClass
                    ? students.filter((s: any) => s.section_class === newGroupClass)
                    : students;

                return (
                    <div>
                        {/* Header */}
                        <div className="px-6 md:px-10 py-4 border-b border-border bg-card flex items-center justify-between gap-4 flex-wrap">
                            <div>
                                <p className="text-sm font-black text-foreground">Project Groups</p>
                                <p className="text-[11px] text-muted-foreground mt-0.5">{groups.length} group{groups.length !== 1 ? 's' : ''} · assign students from the same class</p>
                            </div>
                            <button onClick={() => { setShowCreateGroup(true); setGroupsError(null); }}
                                className="flex items-center gap-2 px-5 py-2.5 bg-orange-600 hover:bg-orange-500transition-colors text-white text-xs font-black uppercase tracking-widest">
                                <PlusIcon className="w-4 h-4" /> Create Group
                            </button>
                        </div>

                        {groupsError && (
                            <div className="mx-6 md:mx-10 mt-4 px-4 py-3 bg-rose-500/10 border border-rose-500/30 text-rose-400 text-sm rounded-xl">{groupsError}</div>
                        )}

                        {/* Create Group panel */}
                        {showCreateGroup && (
                            <div className="mx-6 md:mx-10 mt-6 bg-card border border-border rounded-2xl overflow-hidden">
                                <div className="px-6 py-4 border-b border-border flex items-center justify-between">
                                    <h3 className="text-sm font-black text-foreground uppercase tracking-widest">New Group</h3>
                                    <button onClick={() => setShowCreateGroup(false)} className="text-muted-foreground hover:text-foreground transition-colors"><XMarkIcon className="w-5 h-5" /></button>
                                </div>
                                <div className="p-6 space-y-4">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div>
                                            <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1.5 block">Group Name *</label>
                                            <input value={newGroupName} onChange={e => setNewGroupName(e.target.value)} placeholder="e.g. Team Alpha"
                                                className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder:text-muted-foreground focus:outline-none focus:border-orange-500/50 transition-colors" />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1.5 block">Class</label>
                                            <select value={newGroupClass} onChange={e => { setNewGroupClass(e.target.value); setNewGroupStudents([]); }}
                                                className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-orange-500/50 transition-colors">
                                                <option value="">All Classes</option>
                                                {classOptions.map((c: string) => <option key={c} value={c}>{c}</option>)}
                                            </select>
                                        </div>
                                    </div>

                                    {/* Evaluation type */}
                                    <div>
                                        <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-2 block">Evaluation Type</label>
                                        <div className="flex gap-3">
                                            {(['group', 'individual'] as const).map(et => (
                                                <button key={et} onClick={() => setNewGroupEval(et)}
                                                    className={`flex-1 py-2.5 text-[11px] font-black uppercase tracking-widest border rounded-xl transition-all ${newGroupEval === et ? 'bg-orange-500/20 border-orange-500/40 text-orange-400' : 'bg-white/[0.02] border-white/[0.06] text-muted-foreground hover:text-foreground'}`}>
                                                    {et === 'group' ? 'One Score for All' : 'Score Each Member'}
                                                </button>
                                            ))}
                                        </div>
                                        <p className="text-[10px] text-muted-foreground mt-1.5">
                                            {newGroupEval === 'group' ? 'All members receive the same group score.' : 'You assign an individual score to each member.'}
                                        </p>
                                    </div>

                                    {/* Student picker */}
                                    <div>
                                        <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-2 block">
                                            Select Students * ({newGroupStudents.length} selected — minimum 2)
                                            {newGroupClass && <span className="ml-2 text-orange-400">· Class: {newGroupClass}</span>}
                                        </label>
                                        {classFiltered.length === 0 ? (
                                            <p className="text-muted-foreground text-xs italic">No students in this class</p>
                                        ) : (
                                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-60 overflow-y-auto pr-1">
                                                {classFiltered.map((s: any) => {
                                                    const sel = newGroupStudents.includes(s.id);
                                                    return (
                                                        <button key={s.id} onClick={() => setNewGroupStudents(prev =>
                                                            sel ? prev.filter(id => id !== s.id) : [...prev, s.id]
                                                        )}
                                                            className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-left transition-all ${sel ? 'bg-orange-500/20 border-orange-500/40' : 'bg-white/[0.03] border-white/[0.06] hover:border-orange-500/20'}`}>
                                                            <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-[9px] font-black ${sel ? 'bg-orange-500 text-white' : 'bg-white/10 text-white/50'}`}>
                                                                {sel ? <CheckIcon className="w-3 h-3" /> : (s.full_name || '?')[0].toUpperCase()}
                                                            </div>
                                                            <span className={`text-[11px] font-bold truncate ${sel ? 'text-orange-300' : 'text-muted-foreground'}`}>{s.full_name}</span>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>

                                    {groupCreateError && (
                                        <div className="px-4 py-2.5 bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs rounded-xl flex items-center gap-2">
                                            <ExclamationTriangleIcon className="w-3.5 h-3.5 flex-shrink-0" />
                                            {groupCreateError}
                                        </div>
                                    )}
                                    <div className="flex items-center gap-3 pt-2">
                                        <button onClick={handleCreateGroup} disabled={savingGroup}
                                            className="flex items-center gap-2 px-6 py-2.5 bg-orange-600 hover:bg-orange-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-white text-xs font-black uppercase tracking-widest rounded-xl">
                                            {savingGroup ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : <UsersIcon className="w-4 h-4" />}
                                            {savingGroup ? 'Creating...' : 'Create Group'}
                                        </button>
                                        <button onClick={() => { setShowCreateGroup(false); setGroupCreateError(null); }} className="px-4 py-2.5 text-muted-foreground text-xs font-black uppercase tracking-widest hover:text-foreground transition-colors">Cancel</button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Groups list */}
                        <div className="px-6 md:px-10 py-6 space-y-4">
                            {groupsLoading ? (
                                <div className="flex items-center justify-center py-20"><ArrowPathIcon className="w-8 h-8 text-orange-400 animate-spin" /></div>
                            ) : groups.length === 0 ? (
                                <div className="border border-dashed border-border p-16 text-center rounded-2xl">
                                    <UsersIcon className="w-12 h-12 text-muted-foreground/20 mx-auto mb-4" />
                                    <p className="text-muted-foreground text-sm font-semibold">No groups created yet</p>
                                    <p className="text-muted-foreground/60 text-xs mt-1">Create a group to distribute students and assign project work</p>
                                </div>
                            ) : (
                                groups.map((group: any) => {
                                    const members: any[] = group.project_group_members || [];
                                    const assignment = group.assignments;
                                    const isGroupEval = group.evaluation_type === 'group';
                                    const isGrading = gradingGroupId === group.id;

                                    return (
                                        <div key={group.id} className="bg-card border border-border rounded-2xl overflow-hidden">
                                            {/* Group header */}
                                            <div className="px-6 py-4 flex items-center gap-4 flex-wrap">
                                                <div className="w-10 h-10 bg-orange-500/10 border border-orange-500/30 flex items-center justify-center flex-shrink-0 rounded-xl">
                                                    <UsersIcon className="w-5 h-5 text-orange-400" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <h3 className="text-sm font-black text-foreground">{group.name}</h3>
                                                        {group.class_name && <span className="text-[9px] font-bold text-muted-foreground bg-white/5 border border-white/10 px-2 py-0.5 rounded-full">{group.class_name}</span>}
                                                        <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full"
                                                            style={{ backgroundColor: isGroupEval ? '#f9731618' : '#10b98118', color: isGroupEval ? '#f97316' : '#34d399' }}>
                                                            {isGroupEval ? 'Group Score' : 'Individual'}
                                                        </span>
                                                        {group.is_graded
                                                            ? <span className="text-[9px] font-black text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full flex items-center gap-1"><CheckCircleIcon className="w-3 h-3" /> Graded</span>
                                                            : <span className="text-[9px] font-black text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">Pending</span>
                                                        }
                                                    </div>
                                                    {assignment && <p className="text-[10px] text-muted-foreground mt-0.5">Activity: {assignment.title}</p>}
                                                </div>
                                                <div className="flex items-center gap-2 flex-shrink-0">
                                                    {!isGrading && (
                                                        <button onClick={() => {
                                                            setGradingGroupId(group.id);
                                                            setGradingGroup(group);
                                                            setGradeScore(group.group_score?.toString() || '');
                                                            setGradeFeedback(group.group_feedback || '');
                                                            const initScores: Record<string, { score: string; feedback: string }> = {};
                                                            members.forEach((m: any) => {
                                                                initScores[m.student_id] = { score: m.individual_score?.toString() || '', feedback: m.individual_feedback || '' };
                                                            });
                                                            setIndividualScores(initScores);
                                                        }}
                                                            className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-600/20 border border-orange-500/30 text-orange-400 text-[10px] font-black uppercase tracking-widest hover:bg-orange-600/30 transition-all rounded-lg">
                                                            <AcademicCapIcon className="w-3.5 h-3.5" /> {group.is_graded ? 'Re-grade' : 'Grade'}
                                                        </button>
                                                    )}
                                                    {group.is_graded && (
                                                        <button onClick={() => setSharingGroupId(sharingGroupId === group.id ? null : group.id)}
                                                            className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest border transition-all rounded-lg ${sharingGroupId === group.id ? 'bg-green-600/30 border-green-500/50 text-green-300' : 'bg-green-600/10 border-green-500/20 text-green-400 hover:bg-green-600/20'}`}>
                                                            <WhatsAppIcon className="w-3.5 h-3.5" /> Share
                                                        </button>
                                                    )}
                                                    <button onClick={() => setDeleteGroupTarget({ id: group.id, name: group.name })}
                                                        className="p-1.5 text-rose-400/40 hover:text-rose-400 border border-transparent hover:border-rose-500/30 transition-all rounded-lg">
                                                        <TrashIcon className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Members list */}
                                            <div className="border-t border-border px-6 py-4">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    {members.map((m: any) => (
                                                        <div key={m.id} className="flex items-center gap-2 bg-white/[0.03] border border-border px-3 py-1.5 rounded-full">
                                                            <div className="w-5 h-5 rounded-full bg-orange-500/20 flex items-center justify-center text-[9px] font-black text-orange-300">
                                                                {(m.portal_users?.full_name || '?')[0].toUpperCase()}
                                                            </div>
                                                            <span className="text-[11px] font-semibold text-muted-foreground">{m.portal_users?.full_name || '—'}</span>
                                                            {group.is_graded && (
                                                                <span className="text-[10px] font-black text-emerald-400 ml-1">
                                                                    {isGroupEval ? group.group_score : m.individual_score ?? '—'}
                                                                </span>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>

                                            {/* WhatsApp Share Panel */}
                                            {sharingGroupId === group.id && (
                                                <div className="border-t border-green-500/20 bg-green-500/5 px-6 py-5">
                                                    <div className="flex items-center gap-2 mb-4">
                                                        <WhatsAppIcon className="w-4 h-4 text-green-400" />
                                                        <p className="text-[11px] font-black text-green-400 uppercase tracking-widest">Send Results via WhatsApp</p>
                                                        <span className="text-[9px] text-muted-foreground ml-auto">Opens WhatsApp with pre-filled message</span>
                                                    </div>
                                                    <div className="space-y-2">
                                                        {members.map((m: any) => {
                                                            const name  = m.portal_users?.full_name || 'Student';
                                                            const phone = fmtPhone(m.portal_users?.phone);
                                                            const score = isGroupEval ? group.group_score : m.individual_score;
                                                            const feedback = isGroupEval ? group.group_feedback : m.individual_feedback;
                                                            const msg   = buildResultMsg(name, group.name, group.assignments?.title, score, feedback, group.evaluation_type);
                                                            const waUrl = phone
                                                                ? `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`
                                                                : `https://wa.me/?text=${encodeURIComponent(msg)}`;
                                                            return (
                                                                <div key={m.id} className="flex items-center gap-3 bg-white/[0.02] border border-white/[0.06] rounded-xl px-4 py-3">
                                                                    <div className="w-7 h-7 rounded-full bg-green-500/20 flex items-center justify-center text-[10px] font-black text-green-300 flex-shrink-0">
                                                                        {name[0].toUpperCase()}
                                                                    </div>
                                                                    <div className="flex-1 min-w-0">
                                                                        <p className="text-[12px] font-bold text-foreground">{name}</p>
                                                                        {phone
                                                                            ? <p className="text-[10px] text-muted-foreground">{m.portal_users?.phone}</p>
                                                                            : <p className="text-[10px] text-amber-400/70">No phone on file — will open pick-contact</p>
                                                                        }
                                                                    </div>
                                                                    <div className="flex items-center gap-2 flex-shrink-0">
                                                                        {score != null && (
                                                                            <span className="text-sm font-black text-emerald-400">{score}</span>
                                                                        )}
                                                                        <a href={waUrl} target="_blank" rel="noopener noreferrer"
                                                                            className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-500 transition-colors text-white text-[10px] font-black uppercase tracking-widest rounded-lg">
                                                                            <WhatsAppIcon className="w-3.5 h-3.5" /> Send
                                                                        </a>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                    {/* Send to all (group eval only — same message) */}
                                                    {isGroupEval && members.length > 1 && (
                                                        <div className="mt-3 pt-3 border-t border-white/[0.06]">
                                                            <p className="text-[10px] text-muted-foreground mb-2">Or send to all at once (opens each chat in sequence):</p>
                                                            <button onClick={() => {
                                                                members.forEach((m: any, i: number) => {
                                                                    const name = m.portal_users?.full_name || 'Student';
                                                                    const phone = fmtPhone(m.portal_users?.phone);
                                                                    const msg = buildResultMsg(name, group.name, group.assignments?.title, group.group_score, group.group_feedback, 'group');
                                                                    const waUrl = phone ? `https://wa.me/${phone}?text=${encodeURIComponent(msg)}` : `https://wa.me/?text=${encodeURIComponent(msg)}`;
                                                                    setTimeout(() => window.open(waUrl, '_blank'), i * 600);
                                                                });
                                                            }}
                                                                className="flex items-center gap-2 px-4 py-2 bg-green-600/20 border border-green-500/30 text-green-400 text-[10px] font-black uppercase tracking-widest hover:bg-green-600/30 transition-all rounded-xl">
                                                                <WhatsAppIcon className="w-3.5 h-3.5" /> Send to All ({members.length})
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            {/* Grading panel */}
                                            {isGrading && (
                                                <div className="border-t border-orange-500/20 bg-orange-500/5 px-6 py-5 space-y-4">
                                                    <p className="text-[10px] font-black text-orange-400 uppercase tracking-widest">Grade: {group.name}</p>

                                                    {isGroupEval ? (
                                                        /* Group score */
                                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                            <div>
                                                                <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1.5 block">Group Score (0–100)</label>
                                                                <input type="number" min={0} max={100} value={gradeScore} onChange={e => setGradeScore(e.target.value)} placeholder="e.g. 85"
                                                                    className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder:text-muted-foreground focus:outline-none focus:border-orange-500/50 transition-colors" />
                                                                <p className="text-[10px] text-muted-foreground mt-1">This score applies to all {members.length} members</p>
                                                            </div>
                                                            <div>
                                                                <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1.5 block">Feedback (optional)</label>
                                                                <textarea value={gradeFeedback} onChange={e => setGradeFeedback(e.target.value)} rows={2} placeholder="Comments for the group..."
                                                                    className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder:text-muted-foreground focus:outline-none focus:border-orange-500/50 transition-colors resize-none" />
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        /* Individual scores */
                                                        <div className="space-y-3">
                                                            {members.map((m: any) => {
                                                                const name = m.portal_users?.full_name || '—';
                                                                const key = m.student_id;
                                                                return (
                                                                    <div key={key} className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-start bg-white/[0.02] border border-border rounded-xl px-4 py-3">
                                                                        <div className="flex items-center gap-2">
                                                                            <div className="w-6 h-6 rounded-full bg-orange-500/20 flex items-center justify-center text-[9px] font-black text-orange-300">{(name)[0].toUpperCase()}</div>
                                                                            <span className="text-[11px] font-bold text-foreground">{name}</span>
                                                                        </div>
                                                                        <div>
                                                                            <input type="number" min={0} max={100} value={individualScores[key]?.score || ''}
                                                                                onChange={e => setIndividualScores(prev => ({ ...prev, [key]: { ...prev[key], score: e.target.value } }))}
                                                                                placeholder="Score"
                                                                                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder:text-muted-foreground focus:outline-none focus:border-orange-500/50 transition-colors" />
                                                                        </div>
                                                                        <div>
                                                                            <input value={individualScores[key]?.feedback || ''}
                                                                                onChange={e => setIndividualScores(prev => ({ ...prev, [key]: { ...prev[key], feedback: e.target.value } }))}
                                                                                placeholder="Feedback (optional)"
                                                                                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder:text-muted-foreground focus:outline-none focus:border-orange-500/50 transition-colors" />
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    )}

                                                    <div className="flex items-center gap-3">
                                                        <button onClick={() => handleGradeGroup(gradingGroup)} disabled={savingGrade}
                                                            className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 transition-colors text-white text-xs font-black uppercase tracking-widest rounded-xl">
                                                            {savingGrade ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : <CheckIcon className="w-4 h-4" />}
                                                            {savingGrade ? 'Saving...' : 'Save Grades'}
                                                        </button>
                                                        <button onClick={() => { setGradingGroupId(null); setGradingGroup(null); setGradeScore(''); setGradeFeedback(''); setIndividualScores({}); }}
                                                            className="px-4 py-2.5 text-muted-foreground text-xs font-black uppercase tracking-widest hover:text-foreground transition-colors">Cancel</button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                );
            })()}

            {/* Delete Group Confirmation Modal (rendered at page level so it overlays correctly) */}
            {deleteGroupTarget && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
                    <div className="w-full max-w-sm bg-card border border-border shadow-2xl overflow-hidden">
                        <div className="h-1 bg-rose-600" />
                        <div className="p-6 space-y-4">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-rose-500/10 border border-rose-500/30 flex items-center justify-center flex-shrink-0">
                                    <ExclamationTriangleIcon className="w-5 h-5 text-rose-400" />
                                </div>
                                <div>
                                    <p className="text-sm font-black text-foreground uppercase tracking-widest">Delete Group?</p>
                                    <p className="text-xs text-muted-foreground mt-0.5">This action cannot be undone.</p>
                                </div>
                            </div>
                            <div className="px-4 py-3 bg-rose-500/5 border border-rose-500/20">
                                <p className="text-xs font-bold text-foreground">{deleteGroupTarget.name}</p>
                                <p className="text-[10px] text-muted-foreground mt-0.5">All members and scores will be permanently removed.</p>
                            </div>
                            <div className="flex gap-3">
                                <button onClick={() => setDeleteGroupTarget(null)}
                                    className="flex-1 px-4 py-2.5 border border-border text-xs font-black uppercase tracking-widest text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-all">
                                    Cancel
                                </button>
                                <button onClick={confirmDeleteGroup}
                                    className="flex-1 px-4 py-2.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-black uppercase tracking-widest transition-all">
                                    Delete Group
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* STAFF — ACTIVITIES TAB */}
            {tab === 'activities' && (
                <div>
                    {/* Stats summary */}
                    <div className="bg-[#0a0a12] border-b border-white/[0.06] px-6 md:px-10 py-4">
                        <div className="flex items-center gap-6 overflow-x-auto">
                            {[
                                { label: 'Total Activities', value: actStats.total,        Icon: ClipboardDocumentListIcon, color: 'text-white'      },
                                { label: 'Active',           value: actStats.active,        Icon: CheckCircleIcon,           color: 'text-emerald-400' },
                                { label: 'Need Grading',     value: actStats.pendingGrade,  Icon: PencilSquareIcon,          color: actStats.pendingGrade > 0 ? 'text-amber-400' : 'text-white/30' },
                                { label: 'Total Subs',       value: actStats.totalSubs,     Icon: RocketLaunchIcon,          color: 'text-orange-400'  },
                                { label: 'Graded',           value: actStats.graded,        Icon: TrophyIcon,                color: 'text-cyan-400'    },
                            ].map(s => {
                                const Icon = s.Icon;
                                return (
                                    <div key={s.label} className="flex items-center gap-3 flex-shrink-0 pr-6 border-r border-white/[0.06] last:border-0">
                                        <div className={`w-8 h-8 flex items-center justify-center bg-white/[0.03] border border-white/[0.06] flex-shrink-0 ${s.color}`}>
                                            <Icon className="w-4 h-4" />
                                        </div>
                                        <div>
                                            <p className={`text-xl font-black ${s.color}`}>{s.value}</p>
                                            <p className="text-[9px] font-black text-white/20 uppercase tracking-widest">{s.label}</p>
                                        </div>
                                    </div>
                                );
                            })}
                            {actStats.pendingGrade > 0 && (
                                <div className="ml-auto flex-shrink-0 flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 border border-amber-500/20 animate-pulse">
                                    <FireIcon className="w-3.5 h-3.5 text-amber-400" />
                                    <span className="text-[10px] font-black text-amber-400 uppercase tracking-widest">{actStats.pendingGrade} submission{actStats.pendingGrade !== 1 ? 's' : ''} awaiting review</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Filter + Search bar */}
                    <div className="bg-[#0a0a12] border-b border-white/[0.06] px-6 md:px-10 py-3 flex items-center gap-3 flex-wrap">
                        <div className="flex items-center gap-1.5 overflow-x-auto">
                            {([
                                { key: 'all',            label: 'All' },
                                { key: 'active',         label: 'Active' },
                                { key: 'pending_review', label: `Needs Grading${actStats.pendingGrade > 0 ? ` (${actStats.pendingGrade})` : ''}` },
                                { key: 'overdue',        label: 'Overdue' },
                                { key: 'draft',          label: 'Drafts' },
                            ] as const).map(f => (
                                <button key={f.key} onClick={() => setActFilter(f.key)}
                                    className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-widest border transition-all flex-shrink-0 ${actFilter === f.key ? 'bg-orange-500/20 border-orange-500/40 text-orange-400' : 'bg-white/[0.02] border-white/[0.06] text-white/30 hover:text-white/60'}`}>
                                    {f.label}
                                </button>
                            ))}
                        </div>
                        <div className="relative flex-1 max-w-sm ml-auto">
                            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
                            <input value={actSearch} onChange={e => setActSearch(e.target.value)} placeholder="Search activities..."
                                className="w-full pl-8 pr-3 py-2 bg-white/5 border border-white/10 text-sm text-white placeholder-white/20 focus:outline-none focus:border-orange-500/50 transition-colors" />
                        </div>
                        <Link href="/dashboard/projects/new"
                            className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-500transition-colors text-white text-xs font-black uppercase tracking-widest flex-shrink-0">
                            <PlusIcon className="w-3.5 h-3.5" /> Create
                        </Link>
                    </div>

                    {/* Category filter pills */}
                    {activities.length > 0 && (
                        <div className="px-6 md:px-10 py-3 border-b border-white/[0.06] bg-[#0a0a12] flex items-center gap-2 overflow-x-auto">
                            <button onClick={() => setSelectedCat('all')}
                                className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-widest border transition-all flex-shrink-0 ${selectedCat === 'all' ? 'bg-orange-500/20 border-orange-500/40 text-orange-400' : 'bg-white/[0.02] border-white/[0.06] text-white/30 hover:text-white/60'}`}>
                                All ({filteredActs.length})
                            </button>
                            {Object.entries(CAT_META).map(([key, meta]) => {
                                const count = catCounts[key] || 0;
                                if (count === 0) return null;
                                const CatIcon = meta.Icon;
                                return (
                                    <button key={key} onClick={() => setSelectedCat(key)}
                                        className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest border transition-all flex-shrink-0 ${selectedCat === key ? 'border-[currentColor]' : 'bg-white/[0.02] border-white/[0.06] text-white/30 hover:text-white/60'}`}
                                        style={selectedCat === key ? { backgroundColor: meta.color + '22', borderColor: meta.color + '66', color: meta.color } : {}}>
                                        <CatIcon className="w-3 h-3" />
                                        {meta.label} ({count})
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    {/* Activity sections by category */}
                    <div className="px-6 md:px-10 py-6 space-y-10">
                        {actLoading ? (
                            <div className="flex items-center justify-center py-20"><ArrowPathIcon className="w-8 h-8 text-orange-400 animate-spin" /></div>
                        ) : activities.length === 0 ? (
                            <div className="border border-dashed border-white/10 p-16 text-center">
                                <ClipboardDocumentListIcon className="w-12 h-12 text-white/10 mx-auto mb-4" />
                                <p className="text-white/30 text-base font-semibold">No project activities yet</p>
                                <p className="text-white/20 text-xs mt-1 mb-5">Create activities to assign project work — individual or group</p>
                                <Link href="/dashboard/projects/new"
                                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-orange-600/20 border border-orange-500/30 text-orange-400 text-xs font-black uppercase tracking-widest hover:bg-orange-600/30 transition-all">
                                    <PlusIcon className="w-3.5 h-3.5" /> Create First Activity
                                </Link>
                            </div>
                        ) : catFilteredActs.length === 0 ? (
                            <div className="border border-dashed border-white/10 p-10 text-center">
                                <p className="text-white/30 text-sm">No activities match this filter</p>
                            </div>
                        ) : (
                            usedCategories.map(catKey => {
                                const catMeta = CAT_META[catKey];
                                const CatSectionIcon = catMeta.Icon;
                                const catActs = actsByCategory[catKey];
                                return (
                                <section key={catKey}>
                                    {/* Category section header */}
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="w-8 h-8 flex items-center justify-center border" style={{ backgroundColor: catMeta.color + '18', borderColor: catMeta.color + '40' }}>
                                            <CatSectionIcon className="w-4 h-4" style={{ color: catMeta.color }} />
                                        </div>
                                        <div className="flex-1">
                                            <h3 className="text-xs font-black text-white uppercase tracking-widest">{catMeta.label}</h3>
                                            <p className="text-[9px] text-white/30">{catActs.length} activit{catActs.length !== 1 ? 'ies' : 'y'}</p>
                                        </div>
                                        <div className="h-px flex-1 bg-white/[0.05]" />
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                                        {catActs.map((act: any) => {
                                    const subs          = act.assignment_submissions || [];
                                    const gradedCount   = subs.filter((s: any) => s.status === 'graded').length;
                                    const pendingCount  = subs.filter((s: any) => s.status === 'submitted').length;
                                    const pct           = subs.length > 0 ? Math.round((gradedCount / subs.length) * 100) : 0;
                                    const meta          = act.metadata || {};
                                    const catInfo       = CAT_META[meta.category] || CAT_META.coding;
                                    const CatIcon       = catInfo.Icon;
                                    const dl            = deadlineLabel(act.due_date);
                                    const diff          = DIFF_META[meta.difficulty];
                                    const isDraft       = act.is_active === false;
                                    const tags: string[] = meta.tags || [];

                                    return (
                                        <Link key={act.id} href={`/dashboard/projects/${act.id}`}
                                            className="bg-[#0d0d18] border border-white/[0.06] hover:border-orange-500/30 transition-all group block relative overflow-hidden">

                                            {/* Urgent banner */}
                                            {pendingCount > 0 && (
                                                <div className="absolute top-0 left-0 right-0 bg-amber-500/80 px-3 py-1 flex items-center gap-1.5 z-10">
                                                    <FireIcon className="w-3 h-3 text-white" />
                                                    <span className="text-[9px] font-black text-white uppercase tracking-widest">{pendingCount} submission{pendingCount !== 1 ? 's' : ''} awaiting your review</span>
                                                </div>
                                            )}

                                            {/* Category color bar */}
                                            <div className={`h-1 ${pendingCount > 0 ? 'mt-7' : ''}`} style={{ backgroundColor: catInfo.color }} />

                                            <div className="p-5">
                                                {/* Header */}
                                                <div className="flex items-start gap-3 mb-3">
                                                    <div className="w-9 h-9 flex items-center justify-center flex-shrink-0 border" style={{ backgroundColor: catInfo.color + '18', borderColor: catInfo.color + '40' }}>
                                                        <CatIcon className="w-4.5 h-4.5" style={{ color: catInfo.color }} />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <h3 className="text-sm font-black text-white group-hover:text-orange-300 transition-colors line-clamp-2 leading-tight">{act.title}</h3>
                                                        {act.description && <p className="text-[10px] text-white/40 mt-0.5 line-clamp-1">{act.description}</p>}
                                                    </div>
                                                    {isDraft && <span className="text-[8px] font-black text-white/30 border border-white/10 px-1.5 py-0.5 uppercase tracking-widest flex-shrink-0">Draft</span>}
                                                </div>

                                                {/* Badges */}
                                                <div className="flex items-center gap-1.5 flex-wrap mb-4">
                                                    <span className="text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5" style={{ backgroundColor: catInfo.color + '20', color: catInfo.color }}>{catInfo.label}</span>
                                                    {diff && <div className="flex items-center gap-1"><div className={`w-1.5 h-1.5 rounded-full ${diff.dot}`} /><span className={`text-[8px] font-bold ${diff.color}`}>{meta.difficulty}</span></div>}
                                                    {meta.group_activity && <span className="text-[8px] font-black text-cyan-400 bg-cyan-500/10 px-1.5 py-0.5">👥 Group</span>}
                                                    {meta.grading_mode === 'auto'   && <span className="text-[8px] font-black text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5">⚡ Auto</span>}
                                                    {meta.grading_mode === 'rubric' && <span className="text-[8px] font-black text-orange-400 bg-orange-500/10 px-1.5 py-0.5">📋 Rubric</span>}
                                                    {tags.slice(0, 2).map((t: string) => <span key={t} className="text-[8px] text-white/30 border border-white/10 px-1 py-0.5">{t}</span>)}
                                                </div>

                                                {/* Submissions ring */}
                                                <div className="bg-white/[0.02] border border-white/[0.06] px-4 py-3 mb-3">
                                                    <div className="flex items-center justify-between mb-2">
                                                        <span className="text-[9px] font-black text-white/30 uppercase tracking-widest">Submissions</span>
                                                        <span className="text-[10px] font-black text-white">{gradedCount} / {subs.length} graded</span>
                                                    </div>
                                                    <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                                                        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: pct === 100 ? '#10b981' : pct > 50 ? '#f59e0b' : '#f97316' }} />
                                                    </div>
                                                    <div className="flex items-center justify-between mt-2">
                                                        <div className="flex items-center gap-3">
                                                            <div className="flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500" /><span className="text-[9px] text-white/40">{gradedCount} done</span></div>
                                                            {pendingCount > 0 && <div className="flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-amber-500" /><span className="text-[9px] text-amber-400 font-bold">{pendingCount} pending</span></div>}
                                                        </div>
                                                        <span className="text-[9px] text-white/20">{act.max_points || 100} pts max</span>
                                                    </div>
                                                </div>

                                                {/* Deadline */}
                                                <div className={`flex items-center gap-1.5 mb-4 ${dl.overdue ? 'text-rose-400' : dl.urgent ? 'text-amber-400' : 'text-white/30'}`}>
                                                    <ClockIcon className="w-3 h-3" />
                                                    <span className="text-[10px] font-bold">{dl.text}</span>
                                                </div>

                                                {/* CTA */}
                                                <div className="flex items-center gap-1.5 text-orange-400 group-hover:text-orange-300 transition-colors">
                                                    <span className="text-[10px] font-black uppercase tracking-widest">
                                                        {pendingCount > 0 ? `Grade ${pendingCount} submission${pendingCount !== 1 ? 's' : ''}` : subs.length > 0 ? 'View Activity' : 'View & Share'}
                                                    </span>
                                                    <ArrowRightIcon className="w-3 h-3" />
                                                </div>
                                            </div>
                                        </Link>
                                    );
                                })}
                                    </div>
                                </section>
                                );
                            })
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
