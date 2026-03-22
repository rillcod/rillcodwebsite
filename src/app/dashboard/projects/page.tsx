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
} from '@/lib/icons';

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
    coding:       { label: 'Coding',         Icon: CodeBracketIcon,          color: '#6366f1' },
    web:          { label: 'Web Dev',         Icon: GlobeAltIcon,             color: '#06b6d4' },
    ai:           { label: 'AI / ML',         Icon: SparklesIcon,             color: '#8b5cf6' },
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
    css: '#563d7c', typescript: '#2b7489', java: '#b07219', default: '#8b5cf6',
};
const CAT_COLOR: Record<string, string> = {
    web: '#6366f1', mobile: '#06b6d4', ai: '#8b5cf6',
    game: '#f59e0b', iot: '#10b981', other: '#64748b',
};

type Tab       = 'work' | 'activities';
type ActFilter = 'all' | 'active' | 'pending_review' | 'overdue' | 'draft';

// ── page ─────────────────────────────────────────────────────────────────────
export default function ProjectsPage() {
    const { profile, loading: authLoading } = useAuth();
    const role      = profile?.role;
    const isStaff   = role === 'admin' || role === 'teacher';
    const isStudent = role === 'student';

    const [tab, setTab]           = useState<Tab>('work');
    const [loading, setLoading]   = useState(true);
    const [actLoading, setActLoading] = useState(false);
    const [search, setSearch]     = useState('');
    const [expandedStudent, setExpandedStudent] = useState<string | null>(null);
    const [actFilter, setActFilter] = useState<ActFilter>('all');
    const [actSearch, setActSearch] = useState('');

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

    // ── Load work data ────────────────────────────────────────────────────────
    useEffect(() => {
        if (authLoading || !profile) return;
        const db = createClient();
        async function load() {
            setLoading(true);
            try {
                if (isStudent) {
                    const [labRes, portRes] = await Promise.all([
                        db.from('lab_projects').select('*').eq('user_id', profile.id).order('updated_at', { ascending: false }),
                        db.from('portfolio_projects').select('*').eq('user_id', profile.id).order('updated_at', { ascending: false }),
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

    if (authLoading || (!isStudent && !isStaff)) {
        return <div className="min-h-screen bg-background flex items-center justify-center"><div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" /></div>;
    }

    // ── Shared tab bar ────────────────────────────────────────────────────────
    const TABS = isStudent
        ? [{ id: 'work' as Tab, label: 'My Work', icon: CodeBracketIcon }, { id: 'activities' as Tab, label: 'Activities', icon: ClipboardDocumentListIcon }]
        : [{ id: 'work' as Tab, label: 'Student Overview', icon: UserGroupIcon }, { id: 'activities' as Tab, label: 'Activities', icon: ClipboardDocumentListIcon }];

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
                                className={`flex items-center gap-2 px-5 py-3.5 text-[11px] font-black uppercase tracking-widest border-b-2 transition-all ${active ? 'border-violet-500 text-violet-400' : 'border-transparent text-white/30 hover:text-white/60'}`}>
                                <Icon className="w-3.5 h-3.5" />
                                {t.label}
                                {badge && <span className="ml-1 text-[8px] bg-violet-500/20 text-violet-400 px-1.5 py-0.5 rounded-full font-black">{badge}</span>}
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
            pending:   myActivities.filter(a => { const s = a.assignment_submissions?.find((s: any) => s.portal_user_id === profile.id); return !s; }).length,
            submitted: myActivities.filter(a => { const s = a.assignment_submissions?.find((s: any) => s.portal_user_id === profile.id); return s?.status === 'submitted'; }).length,
            graded:    myActivities.filter(a => { const s = a.assignment_submissions?.find((s: any) => s.portal_user_id === profile.id); return s?.status === 'graded'; }).length,
        };

        const filteredMyActs = myActivities.filter(a => {
            const sub = a.assignment_submissions?.find((s: any) => s.portal_user_id === profile.id);
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
                    <div className="absolute inset-0 bg-gradient-to-br from-violet-900/20 via-transparent to-indigo-900/10 pointer-events-none" />
                    <div className="absolute top-0 right-0 w-96 h-96 bg-violet-600/5 rounded-full blur-[100px] pointer-events-none" />
                    <div className="relative px-4 sm:px-6 md:px-10 py-6 sm:py-10">
                        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 sm:gap-6">
                            <div className="flex items-center gap-3 sm:gap-5">
                                <div className="w-12 h-12 sm:w-16 sm:h-16 bg-violet-500/10 border border-violet-500/30 flex items-center justify-center flex-shrink-0">
                                    <RocketLaunchIcon className="w-6 h-6 sm:w-8 sm:h-8 text-violet-400" />
                                </div>
                                <div>
                                    <p className="text-[9px] sm:text-[10px] font-black text-violet-400/70 uppercase tracking-[0.3em] mb-1">Academic Score · 20% of Final Grade</p>
                                    <h1 className="text-2xl sm:text-3xl font-black text-white uppercase tracking-tight italic leading-none">Project Engagement</h1>
                                    <p className="text-xs sm:text-sm text-white/40 font-semibold mt-1">Lab work & portfolio · teacher activities</p>
                                </div>
                            </div>

                            {/* Score card */}
                            <div className="flex flex-wrap items-center gap-4 sm:gap-6 bg-white/[0.03] border border-white/[0.07] px-4 sm:px-6 py-4 w-full md:w-auto">
                                <div className="text-center">
                                    <p className="text-[9px] font-black text-violet-400/70 uppercase tracking-[0.3em] mb-1">Your Score</p>
                                    <p className="text-4xl sm:text-5xl font-black text-white">{pct}<span className="text-xl sm:text-2xl text-white/40">%</span></p>
                                    <ScoreBadge pct={pct} />
                                </div>
                                <div className="hidden sm:block w-px h-14 bg-white/10" />
                                <div className="space-y-2">
                                    <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-indigo-500" /><span className="text-[11px] text-white/50">{myLab.length} Lab Project{myLab.length !== 1 ? 's' : ''}</span></div>
                                    <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-violet-500" /><span className="text-[11px] text-white/50">{myPortfolio.length} Portfolio Project{myPortfolio.length !== 1 ? 's' : ''}</span></div>
                                    <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-emerald-500" /><span className="text-[11px] text-white/50">{total} / 3 target</span></div>
                                </div>
                            </div>
                        </div>
                        <div className="mt-4 flex items-center gap-2 flex-wrap">
                            <span className="text-[9px] font-black text-white/20 uppercase tracking-[0.2em]">How it's calculated:</span>
                            <span className="text-[10px] font-bold text-white/40">Every 3 projects (lab + portfolio) = 100% engagement score</span>
                            <span className="text-[10px] text-violet-400 font-black">· counts 20pts toward your final report</span>
                        </div>
                    </div>
                </div>

                <TabBar />

                {/* MY WORK TAB */}
                {tab === 'work' && (
                    loading ? (
                        <div className="flex items-center justify-center py-20"><ArrowPathIcon className="w-8 h-8 text-violet-400 animate-spin" /></div>
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
                                        <div className="w-8 h-8 bg-violet-500/10 border border-violet-500/20 flex items-center justify-center"><StarIcon className="w-4 h-4 text-violet-400" /></div>
                                        <div><h2 className="text-sm font-black text-white uppercase tracking-widest">Portfolio Projects</h2><p className="text-[10px] text-white/30">Showcased in My Portfolio</p></div>
                                    </div>
                                    <Link href="/dashboard/portfolio" className="text-[10px] font-black text-violet-400 uppercase tracking-widest hover:text-violet-300 transition-colors flex items-center gap-1">My Portfolio <ArrowRightIcon className="w-3 h-3" /></Link>
                                </div>
                                {myPortfolio.length === 0 ? (
                                    <div className="border border-dashed border-white/10 p-10 text-center">
                                        <StarIcon className="w-10 h-10 text-white/10 mx-auto mb-3" />
                                        <p className="text-white/30 text-sm font-semibold">No portfolio projects yet</p>
                                        <Link href="/dashboard/portfolio" className="inline-block mt-4 px-4 py-2 bg-violet-600/20 border border-violet-500/30 text-violet-400 text-xs font-black uppercase tracking-widest hover:bg-violet-600/30 transition-all">Go to Portfolio</Link>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                        {myPortfolio.map(p => {
                                            const cat   = (p.category || 'other').toLowerCase();
                                            const color = CAT_COLOR[cat] || CAT_COLOR.other;
                                            return (
                                                <div key={p.id} className="bg-[#0d0d18] border border-white/[0.06] hover:border-violet-500/30 transition-all group">
                                                    <div className="h-1.5" style={{ backgroundColor: color }} />
                                                    <div className="p-5">
                                                        <div className="flex items-start justify-between gap-2 mb-2">
                                                            <h3 className="text-sm font-black text-white group-hover:text-violet-300 transition-colors line-clamp-2 leading-tight">{p.title}</h3>
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

                {/* STUDENT ACTIVITIES TAB */}
                {tab === 'activities' && (
                    <div>
                        {actLoading ? (
                            <div className="flex items-center justify-center py-20"><ArrowPathIcon className="w-8 h-8 text-violet-400 animate-spin" /></div>
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
                                                className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-widest border transition-all flex-shrink-0 ${studentActFilter === f.key ? 'bg-violet-500/20 border-violet-500/40 text-violet-400' : 'bg-white/[0.02] border-white/[0.06] text-white/30 hover:text-white/60'}`}>
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
                                                const mySub = subs.find((s: any) => s.portal_user_id === profile.id);
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
                                                        className="bg-[#0d0d18] border border-white/[0.06] hover:border-violet-500/30 transition-all group block relative overflow-hidden">

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
                                                                    <h3 className="text-sm font-black text-white group-hover:text-violet-300 transition-colors line-clamp-2 leading-tight">{act.title}</h3>
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
                                                            <div className="flex items-center gap-1.5 text-violet-400 group-hover:text-violet-300 transition-colors">
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

    return (
        <div className="min-h-screen bg-background">
            {/* Hero */}
            <div className="relative overflow-hidden bg-[#0a0a12] border-b border-white/[0.06]">
                <div className="absolute inset-0 bg-gradient-to-br from-violet-900/20 via-transparent to-indigo-900/10 pointer-events-none" />
                <div className="absolute top-0 right-0 w-96 h-96 bg-violet-600/5 rounded-full blur-[100px] pointer-events-none" />
                <div className="relative px-4 sm:px-6 md:px-10 py-6 sm:py-10">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 sm:gap-6">
                        <div className="flex items-center gap-3 sm:gap-5">
                            <div className="w-12 h-12 sm:w-16 sm:h-16 bg-violet-500/10 border border-violet-500/30 flex items-center justify-center flex-shrink-0">
                                <RocketLaunchIcon className="w-6 h-6 sm:w-8 sm:h-8 text-violet-400" />
                            </div>
                            <div>
                                <p className="text-[9px] sm:text-[10px] font-black text-violet-400/70 uppercase tracking-[0.3em] mb-1">Score Category · 20% of Final Grade</p>
                                <h1 className="text-2xl sm:text-3xl font-black text-white uppercase tracking-tight italic leading-none">Project Engagement</h1>
                                <p className="text-xs sm:text-sm text-white/40 font-semibold mt-1">Lab + portfolio projects and teacher-assigned activities</p>
                            </div>
                        </div>
                        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
                            <div className="grid grid-cols-3 gap-2 sm:gap-3 w-full sm:w-auto">
                                {[
                                    { label: 'Students', value: students.length, color: 'text-white' },
                                    { label: 'Active',   value: totalWithProjects, color: 'text-violet-400' },
                                    { label: 'Avg Score',value: `${avgScore}%`, color: 'text-emerald-400' },
                                ].map(s => (
                                    <div key={s.label} className="bg-white/[0.03] border border-white/[0.07] px-3 sm:px-4 py-2 sm:py-3 text-center">
                                        <p className={`text-xl sm:text-2xl font-black ${s.color}`}>{s.value}</p>
                                        <p className="text-[8px] sm:text-[9px] font-black text-white/30 uppercase tracking-widest mt-0.5">{s.label}</p>
                                    </div>
                                ))}
                            </div>
                            <Link href="/dashboard/projects/new"
                                className="flex items-center gap-2 px-4 sm:px-5 py-2.5 sm:py-3 bg-violet-600 hover:bg-violet-500 transition-colors text-white text-xs font-black uppercase tracking-widest flex-shrink-0 w-full sm:w-auto justify-center">
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
                                className="w-full pl-9 pr-4 py-2.5 bg-white/5 border border-white/10 text-sm text-white placeholder-white/20 focus:outline-none focus:border-violet-500/50 transition-colors" />
                        </div>
                    </div>
                    {loading ? (
                        <div className="flex items-center justify-center py-20"><ArrowPathIcon className="w-8 h-8 text-violet-400 animate-spin" /></div>
                    ) : (
                        <div className="px-6 md:px-10 py-6 space-y-2">
                            {filteredStudents.length === 0 && <div className="text-center py-20 text-white/30 text-sm">No students found.</div>}
                            {filteredStudents.map(student => {
                                const labs  = labMap[student.id] || [];
                                const port  = portfolioMap[student.id] || [];
                                const pct   = projectScore(labs.length, port.length);
                                const isExp = expandedStudent === student.id;
                                return (
                                    <div key={student.id} className="bg-[#0d0d18] border border-white/[0.06] hover:border-violet-500/20 transition-all">
                                        <button onClick={() => setExpandedStudent(isExp ? null : student.id)} className="w-full flex items-center gap-4 px-5 py-4 text-left">
                                            <div className="w-9 h-9 rounded-full bg-violet-500/20 border border-violet-500/30 flex items-center justify-center flex-shrink-0">
                                                <span className="text-xs font-black text-violet-300">{(student.full_name || '?')[0].toUpperCase()}</span>
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-black text-white truncate">{student.full_name || '—'}</p>
                                                <p className="text-[10px] text-white/30 truncate">{student.school_name || 'No school'}</p>
                                            </div>
                                            <div className="hidden sm:flex items-center gap-4 flex-shrink-0">
                                                <div className="text-center"><p className="text-base font-black text-indigo-400">{labs.length}</p><p className="text-[9px] text-white/30 uppercase tracking-widest">Lab</p></div>
                                                <div className="text-center"><p className="text-base font-black text-violet-400">{port.length}</p><p className="text-[9px] text-white/30 uppercase tracking-widest">Portfolio</p></div>
                                                <div className="w-px h-8 bg-white/10" />
                                                <ScoreBadge pct={pct} />
                                            </div>
                                            <Link href={`/dashboard/reports/builder?student=${student.id}`} onClick={e => e.stopPropagation()}
                                                className="hidden md:flex items-center gap-1 text-[9px] font-black text-orange-400/60 uppercase tracking-widest hover:text-orange-400 transition-colors px-2 py-1 border border-orange-500/20 hover:border-orange-500/40 flex-shrink-0">
                                                <EyeIcon className="w-3 h-3" /> Report
                                            </Link>
                                            {isExp ? <ChevronUpIcon className="w-4 h-4 text-violet-400 flex-shrink-0" /> : <ChevronDownIcon className="w-4 h-4 text-white/30 flex-shrink-0" />}
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
                                                    <div className="flex items-center gap-2 mb-3"><StarIcon className="w-4 h-4 text-violet-400" /><span className="text-xs font-black text-violet-400 uppercase tracking-widest">Portfolio Projects ({port.length})</span></div>
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
                                                <div className="flex items-center gap-3 bg-violet-500/5 border border-violet-500/20 px-4 py-3">
                                                    <div className="w-8 h-8 bg-violet-500/20 flex items-center justify-center flex-shrink-0"><RocketLaunchIcon className="w-4 h-4 text-violet-400" /></div>
                                                    <div className="flex-1">
                                                        <p className="text-[10px] font-black text-violet-400 uppercase tracking-widest">Project Engagement Score</p>
                                                        <p className="text-xs text-white/40 mt-0.5">{labs.length} lab + {port.length} portfolio = {labs.length + port.length} total → <span className="text-violet-300 font-black">{pct}%</span></p>
                                                    </div>
                                                    <Link href={`/dashboard/reports/builder?student=${student.id}`}
                                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-600/20 border border-orange-500/30 text-orange-400 text-[10px] font-black uppercase tracking-widest hover:bg-orange-600/30 transition-all flex-shrink-0">
                                                        <EyeIcon className="w-3.5 h-3.5" /> Build Report
                                                    </Link>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </>
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
                                { label: 'Total Subs',       value: actStats.totalSubs,     Icon: RocketLaunchIcon,          color: 'text-violet-400'  },
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
                                    className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-widest border transition-all flex-shrink-0 ${actFilter === f.key ? 'bg-violet-500/20 border-violet-500/40 text-violet-400' : 'bg-white/[0.02] border-white/[0.06] text-white/30 hover:text-white/60'}`}>
                                    {f.label}
                                </button>
                            ))}
                        </div>
                        <div className="relative flex-1 max-w-sm ml-auto">
                            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
                            <input value={actSearch} onChange={e => setActSearch(e.target.value)} placeholder="Search activities..."
                                className="w-full pl-8 pr-3 py-2 bg-white/5 border border-white/10 text-sm text-white placeholder-white/20 focus:outline-none focus:border-violet-500/50 transition-colors" />
                        </div>
                        <Link href="/dashboard/projects/new"
                            className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 transition-colors text-white text-xs font-black uppercase tracking-widest flex-shrink-0">
                            <PlusIcon className="w-3.5 h-3.5" /> Create
                        </Link>
                    </div>

                    {/* Activity grid */}
                    <div className="px-6 md:px-10 py-6">
                        {actLoading ? (
                            <div className="flex items-center justify-center py-20"><ArrowPathIcon className="w-8 h-8 text-violet-400 animate-spin" /></div>
                        ) : activities.length === 0 ? (
                            <div className="border border-dashed border-white/10 p-16 text-center">
                                <ClipboardDocumentListIcon className="w-12 h-12 text-white/10 mx-auto mb-4" />
                                <p className="text-white/30 text-base font-semibold">No project activities yet</p>
                                <p className="text-white/20 text-xs mt-1 mb-5">Create activities to assign project work — individual or group</p>
                                <Link href="/dashboard/projects/new"
                                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-violet-600/20 border border-violet-500/30 text-violet-400 text-xs font-black uppercase tracking-widest hover:bg-violet-600/30 transition-all">
                                    <PlusIcon className="w-3.5 h-3.5" /> Create First Activity
                                </Link>
                            </div>
                        ) : filteredActs.length === 0 ? (
                            <div className="border border-dashed border-white/10 p-10 text-center">
                                <p className="text-white/30 text-sm">No activities match this filter</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                                {filteredActs.map((act: any) => {
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
                                            className="bg-[#0d0d18] border border-white/[0.06] hover:border-violet-500/30 transition-all group block relative overflow-hidden">

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
                                                        <h3 className="text-sm font-black text-white group-hover:text-violet-300 transition-colors line-clamp-2 leading-tight">{act.title}</h3>
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
                                                    {meta.grading_mode === 'rubric' && <span className="text-[8px] font-black text-violet-400 bg-violet-500/10 px-1.5 py-0.5">📋 Rubric</span>}
                                                    {tags.slice(0, 2).map((t: string) => <span key={t} className="text-[8px] text-white/30 border border-white/10 px-1 py-0.5">{t}</span>)}
                                                </div>

                                                {/* Submissions ring */}
                                                <div className="bg-white/[0.02] border border-white/[0.06] px-4 py-3 mb-3">
                                                    <div className="flex items-center justify-between mb-2">
                                                        <span className="text-[9px] font-black text-white/30 uppercase tracking-widest">Submissions</span>
                                                        <span className="text-[10px] font-black text-white">{gradedCount} / {subs.length} graded</span>
                                                    </div>
                                                    <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                                                        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: pct === 100 ? '#10b981' : pct > 50 ? '#f59e0b' : '#6366f1' }} />
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
                                                <div className="flex items-center gap-1.5 text-violet-400 group-hover:text-violet-300 transition-colors">
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
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
