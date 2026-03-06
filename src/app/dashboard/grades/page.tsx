'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import { fetchSubmissionsForGrading, fetchStudentGrades, gradeSubmission } from '@/services/dashboard.service';
import {
    ClipboardDocumentCheckIcon, CheckCircleIcon, ClockIcon, ChartBarIcon,
    ExclamationTriangleIcon, MagnifyingGlassIcon, PencilSquareIcon,
    ArrowPathIcon, CheckIcon, XMarkIcon, CalendarIcon,
    DocumentTextIcon, StarIcon, ArrowDownTrayIcon, AcademicCapIcon,
    TrophyIcon, BoltIcon, FireIcon, ChevronDownIcon, ChevronUpIcon,
    ArrowsUpDownIcon, SparklesIcon,
} from '@heroicons/react/24/outline';

// ─── Grade helpers ────────────────────────────────────────────
function pctInfo(grade: number, max: number) {
    const pct = Math.round((grade / max) * 100);
    const letter = pct >= 90 ? 'A+' : pct >= 80 ? 'A' : pct >= 70 ? 'B' : pct >= 60 ? 'C' : pct >= 50 ? 'D' : 'F';
    const color = pct >= 70 ? 'emerald' : pct >= 50 ? 'amber' : 'rose';
    const label = pct >= 90 ? 'Distinction' : pct >= 80 ? 'Excellent' : pct >= 70 ? 'Very Good' : pct >= 60 ? 'Good' : pct >= 50 ? 'Pass' : 'Fail';
    return { pct, letter, color, label };
}

const QUICK_GRADES = [
    { label: 'A+', pct: 95, color: 'emerald' },
    { label: 'A',  pct: 82, color: 'emerald' },
    { label: 'B',  pct: 75, color: 'blue' },
    { label: 'C',  pct: 65, color: 'amber' },
    { label: 'D',  pct: 52, color: 'orange' },
    { label: 'F',  pct: 30, color: 'rose' },
];

function colorClass(color: string, variant: 'text' | 'bg' | 'border' | 'ring') {
    const map: Record<string, Record<string, string>> = {
        emerald: { text: 'text-emerald-400', bg: 'bg-emerald-500', border: 'border-emerald-500', ring: 'ring-emerald-500' },
        blue:    { text: 'text-blue-400',    bg: 'bg-blue-500',    border: 'border-blue-500',    ring: 'ring-blue-500' },
        amber:   { text: 'text-amber-400',   bg: 'bg-amber-500',   border: 'border-amber-500',   ring: 'ring-amber-500' },
        orange:  { text: 'text-orange-400',  bg: 'bg-orange-500',  border: 'border-orange-500',  ring: 'ring-orange-500' },
        rose:    { text: 'text-rose-400',    bg: 'bg-rose-500',    border: 'border-rose-500',     ring: 'ring-rose-500' },
        violet:  { text: 'text-violet-400',  bg: 'bg-violet-500',  border: 'border-violet-500',  ring: 'ring-violet-500' },
    };
    return map[color]?.[variant] ?? '';
}

// ─── Status badge ─────────────────────────────────────────────
function Badge({ status }: { status: string }) {
    const map: Record<string, string> = {
        graded:    'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
        submitted: 'bg-blue-500/20    text-blue-400    border-blue-500/30',
        late:      'bg-amber-500/20   text-amber-400   border-amber-500/30',
        missing:   'bg-rose-500/20    text-rose-400    border-rose-500/30',
    };
    return (
        <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border capitalize whitespace-nowrap ${map[status] ?? 'bg-white/10 text-white/40 border-white/10'}`}>
            {status}
        </span>
    );
}

// ─── Grade Ring ───────────────────────────────────────────────
function GradeRing({ pct, letter, color, size = 'md' }: { pct: number; letter: string; color: string; size?: 'sm' | 'md' | 'lg' }) {
    const r = size === 'lg' ? 44 : size === 'md' ? 32 : 22;
    const strokeW = size === 'lg' ? 5 : 4;
    const circ = 2 * Math.PI * r;
    const dash = (pct / 100) * circ;
    const textSize = size === 'lg' ? 'text-2xl' : size === 'md' ? 'text-base' : 'text-xs';
    const boxSize = size === 'lg' ? 'w-28 h-28' : size === 'md' ? 'w-20 h-20' : 'w-14 h-14';

    return (
        <div className={`relative ${boxSize} flex items-center justify-center flex-shrink-0`}>
            <svg className="absolute inset-0 -rotate-90" viewBox={`0 0 ${(r + strokeW) * 2} ${(r + strokeW) * 2}`}>
                <circle cx={r + strokeW} cy={r + strokeW} r={r} fill="none" strokeWidth={strokeW} stroke="rgba(255,255,255,0.06)" />
                <circle cx={r + strokeW} cy={r + strokeW} r={r} fill="none" strokeWidth={strokeW}
                    stroke={color === 'emerald' ? '#10b981' : color === 'amber' ? '#f59e0b' : color === 'blue' ? '#3b82f6' : color === 'orange' ? '#f97316' : '#f43f5e'}
                    strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" />
            </svg>
            <span className={`${textSize} font-black ${colorClass(color, 'text')}`}>{letter}</span>
        </div>
    );
}

// ─── Grade Modal ──────────────────────────────────────────────
function GradeModal({ sub, onClose, onSaved }: {
    sub: any;
    onClose: () => void;
    onSaved: (id: string, grade: number, feedback: string) => void;
}) {
    const { profile } = useAuth();
    const max = sub.assignments?.max_points ?? 100;
    const [grade, setGrade] = useState<string>(sub.grade?.toString() ?? '');
    const [feedback, setFb] = useState<string>(sub.feedback ?? '');
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState('');
    const [showContent, setShowContent] = useState(false);

    const info = grade !== '' && !isNaN(Number(grade)) ? pctInfo(Number(grade), max) : null;

    const applyQuick = (pct: number) => {
        setGrade(Math.round((pct / 100) * max).toString());
        setErr('');
    };

    const save = async () => {
        const g = Number(grade);
        if (grade === '' || isNaN(g) || g < 0 || g > max) { setErr(`Enter a score between 0 and ${max}`); return; }
        setSaving(true); setErr('');
        try {
            await gradeSubmission(sub.id, g, feedback, profile!.id);
            onSaved(sub.id, g, feedback);
            onClose();
        } catch (e: any) {
            setErr(e.message ?? 'Failed to save grade');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
            <div className="bg-[#161628] border border-white/10 rounded-t-[32px] sm:rounded-2xl w-full sm:max-w-lg shadow-2xl max-h-[92vh] flex flex-col"
                onClick={e => e.stopPropagation()}>

                {/* Drag handle (mobile) */}
                <div className="flex justify-center pt-3 pb-1 sm:hidden">
                    <div className="w-10 h-1.5 bg-white/20 rounded-full" />
                </div>

                {/* Header */}
                <div className="p-5 border-b border-white/10 flex items-start justify-between flex-shrink-0">
                    <div className="flex-1 min-w-0 pr-4">
                        <h3 className="font-bold text-white text-base leading-tight">{sub.assignments?.title ?? 'Grade Submission'}</h3>
                        <div className="flex items-center gap-2 mt-2">
                            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-600 to-blue-600 flex items-center justify-center text-xs font-black text-white flex-shrink-0">
                                {(sub.portal_users?.full_name ?? '?')[0]}
                            </div>
                            <div className="min-w-0">
                                <p className="text-sm font-semibold text-white truncate">{sub.portal_users?.full_name ?? 'Student'}</p>
                                <p className="text-xs text-white/30 truncate">{sub.portal_users?.email}</p>
                            </div>
                            <Badge status={sub.status} />
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-xl transition-colors flex-shrink-0">
                        <XMarkIcon className="w-5 h-5 text-white/40" />
                    </button>
                </div>

                <div className="overflow-y-auto flex-1">
                    <div className="p-5 space-y-5">
                        {/* Quick grade buttons */}
                        <div>
                            <p className="text-xs font-bold text-white/40 uppercase tracking-wider mb-2">Quick Grade</p>
                            <div className="grid grid-cols-6 gap-1.5">
                                {QUICK_GRADES.map(q => (
                                    <button key={q.label}
                                        onClick={() => applyQuick(q.pct)}
                                        className={`py-2.5 rounded-xl text-xs font-black transition-all border ${
                                            info?.letter === q.label
                                                ? `${colorClass(q.color, 'bg')} text-white border-transparent`
                                                : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10 hover:text-white'
                                        }`}>
                                        {q.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Score input + ring */}
                        <div className="flex items-center gap-5 bg-white/5 border border-white/10 rounded-2xl p-4">
                            {info ? (
                                <GradeRing pct={info.pct} letter={info.letter} color={info.color} size="md" />
                            ) : (
                                <div className="w-20 h-20 rounded-full border-4 border-white/10 flex items-center justify-center flex-shrink-0">
                                    <span className="text-white/20 text-xs font-bold">—</span>
                                </div>
                            )}
                            <div className="flex-1">
                                <label className="block text-xs font-bold text-white/40 uppercase tracking-wider mb-2">
                                    Score (max {max} pts)
                                </label>
                                <div className="flex items-center gap-3">
                                    <input type="number" min={0} max={max} value={grade}
                                        onChange={e => { setGrade(e.target.value); setErr(''); }}
                                        className="w-24 px-3 py-2.5 bg-white/10 border border-white/20 rounded-xl text-white text-xl font-black text-center focus:outline-none focus:border-violet-500 transition-colors"
                                        placeholder="0"
                                    />
                                    <span className="text-white/30 text-sm font-bold">/ {max}</span>
                                </div>
                                {info && (
                                    <div className="mt-2 flex items-center gap-2">
                                        <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                                            <div className={`h-full rounded-full transition-all duration-500 ${colorClass(info.color, 'bg')}`} style={{ width: `${info.pct}%` }} />
                                        </div>
                                        <span className={`text-xs font-bold ${colorClass(info.color, 'text')}`}>{info.pct}% · {info.label}</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Submission content toggle */}
                        {(sub.submission_text || sub.file_url) && (
                            <div>
                                <button
                                    onClick={() => setShowContent(v => !v)}
                                    className="w-full flex items-center justify-between px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white/50 hover:text-white transition-colors">
                                    <span className="font-semibold">View Student Work</span>
                                    {showContent ? <ChevronUpIcon className="w-4 h-4" /> : <ChevronDownIcon className="w-4 h-4" />}
                                </button>
                                {showContent && (
                                    <div className="mt-2 bg-white/5 border border-white/10 rounded-xl p-4 max-h-36 overflow-y-auto">
                                        {sub.submission_text && (
                                            <p className="text-sm text-white/70 whitespace-pre-wrap">{sub.submission_text}</p>
                                        )}
                                        {sub.file_url && (
                                            <a href={sub.file_url} target="_blank" rel="noopener noreferrer"
                                                className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 underline mt-2">
                                                📎 View attached file
                                            </a>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        {!sub.submission_text && !sub.file_url && sub.status !== 'missing' && (
                            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-sm text-amber-400 flex items-center gap-2">
                                <ExclamationTriangleIcon className="w-4 h-4 flex-shrink-0" />
                                No text or file — grade based on verbal/in-person work if applicable.
                            </div>
                        )}

                        {/* Feedback */}
                        <div>
                            <label className="block text-xs font-bold text-white/40 uppercase tracking-wider mb-2">
                                Feedback <span className="text-white/20 font-normal normal-case">(shown to student)</span>
                            </label>
                            <textarea value={feedback} rows={3}
                                onChange={e => setFb(e.target.value)}
                                placeholder="Write specific, constructive feedback for the student…"
                                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/25 focus:outline-none focus:border-violet-500 transition-colors resize-none"
                            />
                        </div>

                        {err && <p className="text-sm text-rose-400 flex items-center gap-1.5"><ExclamationTriangleIcon className="w-4 h-4 flex-shrink-0" />{err}</p>}
                    </div>
                </div>

                {/* Footer */}
                <div className="p-5 border-t border-white/10 flex gap-3 flex-shrink-0 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
                    <button onClick={onClose}
                        className="flex-1 py-3 text-sm font-semibold text-white/50 bg-white/5 hover:bg-white/10 rounded-xl transition-colors">
                        Cancel
                    </button>
                    <button onClick={save} disabled={saving}
                        className="flex-1 flex items-center justify-center gap-2 py-3 text-sm font-bold bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl transition-all disabled:opacity-60">
                        {saving ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : <CheckIcon className="w-4 h-4" />}
                        {saving ? 'Saving…' : 'Submit Grade'}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Distribution Bar ─────────────────────────────────────────
function DistBar({ items }: { items: any[] }) {
    const graded = items.filter(s => s.grade != null && s.assignments?.max_points);
    if (!graded.length) return null;
    const counts = { 'A+': 0, A: 0, B: 0, C: 0, D: 0, F: 0 };
    graded.forEach(s => {
        const { letter } = pctInfo(s.grade, s.assignments.max_points);
        counts[letter as keyof typeof counts]++;
    });
    const total = graded.length;
    const bars: Array<{ label: string; count: number; color: string }> = [
        { label: 'A+', count: counts['A+'], color: 'bg-emerald-500' },
        { label: 'A',  count: counts.A,    color: 'bg-emerald-400' },
        { label: 'B',  count: counts.B,    color: 'bg-blue-500' },
        { label: 'C',  count: counts.C,    color: 'bg-amber-500' },
        { label: 'D',  count: counts.D,    color: 'bg-orange-500' },
        { label: 'F',  count: counts.F,    color: 'bg-rose-500' },
    ].filter(b => b.count > 0);

    return (
        <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
            <p className="text-xs font-bold text-white/40 uppercase tracking-widest mb-4">Grade Distribution · {total} graded</p>
            <div className="flex h-8 rounded-xl overflow-hidden gap-0.5">
                {bars.map(b => (
                    <div key={b.label} title={`${b.label}: ${b.count}`}
                        className={`${b.color} flex items-center justify-center transition-all duration-500`}
                        style={{ width: `${(b.count / total) * 100}%` }}>
                        {b.count / total > 0.1 && <span className="text-white text-[10px] font-black">{b.label}</span>}
                    </div>
                ))}
            </div>
            <div className="flex flex-wrap gap-3 mt-3">
                {bars.map(b => (
                    <span key={b.label} className="text-xs text-white/40">
                        <span className="font-bold text-white/70">{b.label}</span> {b.count} ({Math.round((b.count / total) * 100)}%)
                    </span>
                ))}
            </div>
        </div>
    );
}

// ─── Student Achievement Badges ───────────────────────────────
function AchievementBadges({ items }: { items: any[] }) {
    const graded = items.filter(s => s.grade != null && s.assignments?.max_points);
    if (!graded.length) return null;

    const badges: Array<{ icon: typeof TrophyIcon; label: string; desc: string; color: string; earned: boolean }> = [
        {
            icon: TrophyIcon, label: 'Top Scorer',
            desc: 'Scored 90%+ on an assignment',
            color: 'amber',
            earned: graded.some(s => pctInfo(s.grade, s.assignments.max_points).pct >= 90),
        },
        {
            icon: FireIcon, label: 'On a Roll',
            desc: '3+ assignments graded',
            color: 'orange',
            earned: graded.length >= 3,
        },
        {
            icon: StarIcon, label: 'Excellent Work',
            desc: 'Average grade above 80%',
            color: 'emerald',
            earned: graded.reduce((a, s) => a + pctInfo(s.grade, s.assignments.max_points).pct, 0) / graded.length >= 80,
        },
        {
            icon: BoltIcon, label: 'All Submitted',
            desc: 'No missing assignments',
            color: 'blue',
            earned: items.every(s => s.status !== 'missing'),
        },
    ];

    return (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {badges.map(b => (
                <div key={b.label} className={`rounded-2xl p-4 border transition-all ${
                    b.earned ? (
                        b.color === 'amber' ? 'bg-amber-500/10 border-amber-500/20' :
                        b.color === 'orange' ? 'bg-orange-500/10 border-orange-500/20' :
                        b.color === 'emerald' ? 'bg-emerald-500/10 border-emerald-500/20' :
                        'bg-blue-500/10 border-blue-500/20'
                    ) : 'bg-white/5 border-white/10 opacity-40 grayscale'
                }`}>
                    <b.icon className={`w-5 h-5 mb-2 ${b.earned ? colorClass(b.color, 'text') : 'text-white/30'}`} />
                    <p className={`text-xs font-black ${b.earned ? 'text-white' : 'text-white/40'}`}>{b.label}</p>
                    <p className="text-[10px] text-white/30 mt-0.5 leading-tight">{b.desc}</p>
                </div>
            ))}
        </div>
    );
}

// ─── Course Breakdown (student) ────────────────────────────────
function CourseBreakdown({ items }: { items: any[] }) {
    const courses: Record<string, { name: string; grades: number[]; total: number[] }> = {};
    items.forEach(s => {
        const key = s.assignments?.courses?.title ?? 'Unknown Course';
        if (!courses[key]) courses[key] = { name: key, grades: [], total: [] };
        if (s.grade != null && s.assignments?.max_points) {
            courses[key].grades.push(s.grade);
            courses[key].total.push(s.assignments.max_points);
        }
    });

    const list = Object.values(courses).filter(c => c.grades.length > 0).map(c => {
        const avg = Math.round(c.grades.reduce((a, g, i) => a + (g / c.total[i]) * 100, 0) / c.grades.length);
        return { ...c, avg, info: pctInfo(avg, 100) };
    }).sort((a, b) => b.avg - a.avg);

    if (!list.length) return null;
    return (
        <div className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-4">
            <p className="text-xs font-bold text-white/40 uppercase tracking-widest">Course Breakdown</p>
            {list.map(c => (
                <div key={c.name}>
                    <div className="flex items-center justify-between mb-1.5">
                        <span className="text-sm text-white/70 font-medium truncate pr-4">{c.name}</span>
                        <span className={`text-sm font-black flex-shrink-0 ${colorClass(c.info.color, 'text')}`}>
                            {c.info.letter} · {c.avg}%
                        </span>
                    </div>
                    <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all duration-700 ${colorClass(c.info.color, 'bg')}`} style={{ width: `${c.avg}%` }} />
                    </div>
                    <p className="text-[10px] text-white/25 mt-1">{c.grades.length} graded assignment{c.grades.length !== 1 ? 's' : ''}</p>
                </div>
            ))}
        </div>
    );
}

// ─── Export CSV helper ────────────────────────────────────────
function exportCSV(items: any[], isStaff: boolean) {
    const headers = isStaff
        ? ['Student', 'Email', 'Assignment', 'Course', 'Status', 'Score', 'Max Points', 'Grade %', 'Letter', 'Submitted', 'Graded']
        : ['Assignment', 'Course', 'Status', 'Score', 'Max Points', 'Grade %', 'Letter', 'Submitted', 'Graded'];

    const rows = items.map(s => {
        const max = s.assignments?.max_points ?? 100;
        const info = s.grade != null ? pctInfo(s.grade, max) : null;
        const base = [
            s.assignments?.title ?? '',
            s.assignments?.courses?.title ?? '',
            s.status,
            s.grade ?? '',
            max,
            info?.pct ?? '',
            info?.letter ?? '',
            s.submitted_at ? new Date(s.submitted_at).toLocaleDateString() : '',
            s.graded_at ? new Date(s.graded_at).toLocaleDateString() : '',
        ];
        return isStaff
            ? [s.portal_users?.full_name ?? '', s.portal_users?.email ?? '', ...base]
            : base;
    });

    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'grades.csv'; a.click();
    URL.revokeObjectURL(url);
}

// ─── Main Page ────────────────────────────────────────────────
export default function GradesPage() {
    const { profile, loading: authLoading } = useAuth();

    const [items, setItems] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState('all');
    const [sortBy, setSortBy] = useState<'date' | 'name' | 'grade'>('date');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
    const [grading, setGrading] = useState<any | null>(null);
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

    const role = profile?.role ?? '';
    const isStaff = role === 'admin' || role === 'teacher' || role === 'school';
    const canGrade = role === 'admin' || role === 'teacher';

    // ── Fetch ──────────────────────────────────────────────────
    useEffect(() => {
        if (authLoading || !profile) return;
        let cancelled = false;
        async function load() {
            setLoading(true); setError(null);
            try {
                const data = isStaff
                    ? await fetchSubmissionsForGrading({
                        teacherId: role === 'teacher' ? profile!.id : undefined,
                        schoolId: role === 'school' ? profile!.school_id ?? undefined : undefined,
                    })
                    : await fetchStudentGrades(profile!.id);
                if (!cancelled) setItems(data);
            } catch (e: any) {
                if (!cancelled) setError(e.message ?? 'Failed to load');
            } finally {
                if (!cancelled) setLoading(false);
            }
        }
        load();
        return () => { cancelled = true; };
    }, [profile?.id, isStaff, authLoading]); // eslint-disable-line

    // ── Optimistic update ──────────────────────────────────────
    const handleGraded = (id: string, grade: number, feedback: string) => {
        setItems(prev => prev.map(s => s.id === id
            ? { ...s, grade, feedback, status: 'graded', graded_at: new Date().toISOString() }
            : s
        ));
    };

    // ── Toggle expand ──────────────────────────────────────────
    const toggleExpand = (id: string) => {
        setExpandedIds(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    // ── Sort + Filter ──────────────────────────────────────────
    const filtered = useMemo(() => {
        let list = items.filter((s: any) => {
            const title = s.assignments?.title ?? '';
            const student = s.portal_users?.full_name ?? '';
            const matches = (title + student).toLowerCase().includes(search.toLowerCase());
            return matches && (filter === 'all' || s.status === filter);
        });

        list = [...list].sort((a, b) => {
            let va = 0; let vb = 0;
            if (sortBy === 'date') {
                va = new Date(a.submitted_at ?? a.graded_at ?? 0).getTime();
                vb = new Date(b.submitted_at ?? b.graded_at ?? 0).getTime();
            } else if (sortBy === 'grade') {
                const maxA = a.assignments?.max_points ?? 100;
                const maxB = b.assignments?.max_points ?? 100;
                va = a.grade != null ? (a.grade / maxA) * 100 : -1;
                vb = b.grade != null ? (b.grade / maxB) * 100 : -1;
            } else if (sortBy === 'name') {
                const na = isStaff ? (a.portal_users?.full_name ?? '') : (a.assignments?.title ?? '');
                const nb = isStaff ? (b.portal_users?.full_name ?? '') : (b.assignments?.title ?? '');
                return sortDir === 'asc' ? na.localeCompare(nb) : nb.localeCompare(na);
            }
            return sortDir === 'asc' ? va - vb : vb - va;
        });

        return list;
    }, [items, search, filter, sortBy, sortDir, isStaff]);

    // ── Stats ──────────────────────────────────────────────────
    const totalItems = items.length;
    const graded = items.filter(s => s.status === 'graded').length;
    const pending = items.filter(s => s.status === 'submitted').length;
    const missing = items.filter(s => s.status === 'missing').length;
    const avgPct = (() => {
        const gs = items.filter(s => s.grade != null && s.assignments?.max_points);
        if (!gs.length) return null;
        return Math.round(gs.reduce((a, s) => a + (s.grade / s.assignments.max_points) * 100, 0) / gs.length);
    })();

    const toggleSort = (col: typeof sortBy) => {
        if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        else { setSortBy(col); setSortDir('desc'); }
    };

    // ── Loading skeleton ───────────────────────────────────────
    if (authLoading || loading) return (
        <div className="min-h-screen bg-[#0f0f1a] text-white">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
                <div className="animate-pulse space-y-2">
                    <div className="h-4 bg-white/10 rounded w-32" />
                    <div className="h-8 bg-white/10 rounded w-64" />
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {[1,2,3,4].map(i => <div key={i} className="bg-white/5 border border-white/10 rounded-2xl h-28 animate-pulse" />)}
                </div>
                <div className="space-y-3">
                    {[1,2,3,4,5].map(i => <div key={i} className="bg-white/5 border border-white/10 rounded-2xl h-20 animate-pulse" />)}
                </div>
            </div>
        </div>
    );

    if (!profile) return (
        <div className="min-h-screen bg-[#0f0f1a] flex items-center justify-center">
            <div className="text-center">
                <ClipboardDocumentCheckIcon className="w-12 h-12 mx-auto text-white/10 mb-3" />
                <p className="text-white/30 mb-4">Sign in to view grades</p>
                <Link href="/login" className="px-5 py-2 bg-violet-600 text-white rounded-xl text-sm font-bold">Sign In</Link>
            </div>
        </div>
    );

    return (
        <div className="min-h-screen bg-[#0f0f1a] text-white">
            {grading && <GradeModal sub={grading} onClose={() => setGrading(null)} onSaved={handleGraded} />}

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">

                {/* ── Header ────────────────────────────────────── */}
                <div className="flex flex-col sm:flex-row sm:items-end gap-4">
                    <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                            <ClipboardDocumentCheckIcon className="w-4 h-4 text-emerald-400" />
                            <span className="text-xs font-bold text-emerald-400 uppercase tracking-widest">
                                {isStaff ? 'Grading Centre' : 'My Results'}
                            </span>
                        </div>
                        <h1 className="text-2xl sm:text-3xl font-extrabold">
                            {isStaff ? 'Grades & Submissions' : 'My Academic Results'}
                        </h1>
                        <p className="text-white/40 text-sm mt-1">
                            {isStaff ? 'Grade student work and track class performance' : 'Your scores, feedback and progress'}
                        </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                        {items.length > 0 && (
                            <button onClick={() => exportCSV(items, isStaff)}
                                className="flex items-center gap-2 px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm font-bold text-white/60 hover:text-white transition-all">
                                <ArrowDownTrayIcon className="w-4 h-4" />
                                <span className="hidden sm:inline">Export CSV</span>
                            </button>
                        )}
                    </div>
                </div>

                {/* ── Error ─────────────────────────────────────── */}
                {error && (
                    <div className="flex items-center gap-3 bg-rose-500/10 border border-rose-500/20 rounded-xl p-4">
                        <ExclamationTriangleIcon className="w-5 h-5 text-rose-400 flex-shrink-0" />
                        <p className="text-rose-400 text-sm">{error}</p>
                    </div>
                )}

                {/* ── KPI Cards ──────────────────────────────────── */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                    {[
                        {
                            label: 'Total',
                            value: totalItems,
                            sub: 'assignments',
                            icon: DocumentTextIcon,
                            color: 'violet',
                        },
                        {
                            label: isStaff ? 'Needs Grading' : 'Submitted',
                            value: pending,
                            sub: pending > 0 ? (isStaff ? 'awaiting review' : 'awaiting grade') : 'all clear',
                            icon: ClockIcon,
                            color: pending > 0 ? 'amber' : 'emerald',
                        },
                        {
                            label: 'Graded',
                            value: graded,
                            sub: totalItems > 0 ? `${Math.round((graded / totalItems) * 100)}% complete` : 'none yet',
                            icon: CheckCircleIcon,
                            color: 'emerald',
                        },
                        {
                            label: 'Average',
                            value: avgPct != null ? `${avgPct}%` : '—',
                            sub: avgPct != null ? (avgPct >= 70 ? 'Good standing' : avgPct >= 50 ? 'Needs effort' : 'At risk') : 'no grades yet',
                            icon: ChartBarIcon,
                            color: avgPct == null ? 'violet' : avgPct >= 70 ? 'emerald' : avgPct >= 50 ? 'amber' : 'rose',
                        },
                    ].map(s => (
                        <div key={s.label} className="bg-white/5 border border-white/10 rounded-2xl p-4 sm:p-5">
                            <div className="flex items-start justify-between mb-3">
                                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                                    s.color === 'violet' ? 'bg-violet-500/10' :
                                    s.color === 'amber' ? 'bg-amber-500/10' :
                                    s.color === 'emerald' ? 'bg-emerald-500/10' :
                                    'bg-rose-500/10'
                                }`}>
                                    <s.icon className={`w-4 h-4 ${colorClass(s.color, 'text')}`} />
                                </div>
                                {s.label === 'Graded' && totalItems > 0 && (
                                    <div className="text-xs text-white/30">{Math.round((graded/totalItems)*100)}%</div>
                                )}
                            </div>
                            <p className={`text-2xl font-extrabold ${colorClass(s.color, 'text')}`}>{s.value}</p>
                            <p className="text-xs text-white/40 mt-1">{s.label}</p>
                            <p className="text-[10px] text-white/25 mt-0.5 truncate">{s.sub}</p>
                        </div>
                    ))}
                </div>

                {/* ── Pending alert (staff) ──────────────────────── */}
                {isStaff && pending > 0 && (
                    <div className="flex items-center gap-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4">
                        <ClockIcon className="w-5 h-5 text-amber-400 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                            <p className="font-bold text-amber-400 text-sm">{pending} submission{pending !== 1 ? 's' : ''} waiting to be graded</p>
                            <p className="text-xs text-white/30 mt-0.5 hidden sm:block">Click the pencil icon on any row to open the grade panel</p>
                        </div>
                        <button onClick={() => setFilter('submitted')}
                            className="px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 text-xs font-bold rounded-xl transition-colors flex-shrink-0">
                            Show only
                        </button>
                    </div>
                )}

                {/* ── Distribution (staff) ───────────────────────── */}
                {isStaff && items.some(s => s.grade != null) && <DistBar items={items} />}

                {/* ── Student summary cards ──────────────────────── */}
                {!isStaff && items.length > 0 && (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                        {/* GPA Card */}
                        <div className="lg:col-span-1 bg-gradient-to-br from-[#1a1a2e] to-[#252545] border border-white/10 rounded-2xl p-6 flex flex-col items-center justify-center text-center">
                            {avgPct != null ? (
                                <>
                                    <GradeRing pct={avgPct} letter={pctInfo(avgPct, 100).letter} color={pctInfo(avgPct, 100).color} size="lg" />
                                    <p className="text-xs text-white/40 uppercase tracking-widest mt-4">Overall Average</p>
                                    <p className="text-white/60 text-sm mt-1">{pctInfo(avgPct, 100).label}</p>
                                    <p className="text-2xl font-black text-white mt-2">{avgPct}%</p>
                                </>
                            ) : (
                                <>
                                    <SparklesIcon className="w-10 h-10 text-white/10 mb-3" />
                                    <p className="text-white/30 text-sm">No grades yet</p>
                                </>
                            )}
                        </div>

                        {/* Course breakdown */}
                        <div className="lg:col-span-2">
                            <CourseBreakdown items={items} />
                        </div>
                    </div>
                )}

                {/* ── Achievement badges (student) ───────────────── */}
                {!isStaff && items.length > 0 && <AchievementBadges items={items} />}

                {/* ── Filters + Sort ────────────────────────────── */}
                <div className="flex flex-col sm:flex-row gap-2">
                    <div className="relative flex-1">
                        <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                        <input type="text"
                            placeholder={isStaff ? 'Search by assignment or student…' : 'Search assignments…'}
                            value={search} onChange={e => setSearch(e.target.value)}
                            className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/30 focus:outline-none focus:border-emerald-500 transition-colors"
                        />
                    </div>
                    <div className="flex gap-2">
                        <select value={filter} onChange={e => setFilter(e.target.value)}
                            className="flex-1 sm:flex-none px-3 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-emerald-500 cursor-pointer">
                            <option value="all">All Status</option>
                            <option value="submitted">Submitted</option>
                            <option value="graded">Graded</option>
                            <option value="late">Late</option>
                            <option value="missing">Missing</option>
                        </select>
                        <button onClick={() => toggleSort('date')}
                            className={`px-3 py-3 rounded-xl text-xs font-bold border transition-all flex items-center gap-1 ${sortBy === 'date' ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-white/5 border-white/10 text-white/40 hover:text-white'}`}>
                            <ArrowsUpDownIcon className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Date</span>
                        </button>
                        <button onClick={() => toggleSort('grade')}
                            className={`px-3 py-3 rounded-xl text-xs font-bold border transition-all flex items-center gap-1 ${sortBy === 'grade' ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-white/5 border-white/10 text-white/40 hover:text-white'}`}>
                            <ChartBarIcon className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Grade</span>
                        </button>
                    </div>
                </div>

                {/* Count row */}
                <div className="flex items-center justify-between text-xs text-white/30">
                    <span>{filtered.length} of {totalItems} shown</span>
                    {missing > 0 && !isStaff && (
                        <span className="text-rose-400 font-bold">{missing} missing assignment{missing !== 1 ? 's' : ''}</span>
                    )}
                </div>

                {/* ── Empty state ────────────────────────────────── */}
                {filtered.length === 0 && !error && (
                    <div className="text-center py-20 bg-white/5 border border-white/10 rounded-2xl">
                        <ClipboardDocumentCheckIcon className="w-14 h-14 mx-auto text-white/10 mb-4" />
                        <p className="text-lg font-semibold text-white/30">No submissions found</p>
                        <p className="text-sm text-white/20 mt-1">
                            {search || filter !== 'all' ? 'Try clearing your filters.' : isStaff ? 'No students have submitted yet.' : 'No assignments yet.'}
                        </p>
                        {(search || filter !== 'all') && (
                            <button onClick={() => { setSearch(''); setFilter('all'); }}
                                className="mt-4 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-sm font-bold text-white/50 transition-colors">
                                Clear Filters
                            </button>
                        )}
                    </div>
                )}

                {/* ══ STAFF LIST ═══════════════════════════════════ */}
                {isStaff && filtered.length > 0 && (
                    <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
                        {/* Table header (desktop) */}
                        <div className="hidden lg:grid grid-cols-[2fr_2fr_1fr_1fr_80px] gap-4 px-5 py-3 border-b border-white/10 text-xs font-bold text-white/30 uppercase tracking-wider">
                            <button onClick={() => toggleSort('name')} className="flex items-center gap-1 hover:text-white transition-colors text-left">
                                Student / Assignment <ArrowsUpDownIcon className="w-3 h-3" />
                            </button>
                            <span>Course</span>
                            <span>Status</span>
                            <button onClick={() => toggleSort('grade')} className="flex items-center gap-1 hover:text-white transition-colors">
                                Grade <ArrowsUpDownIcon className="w-3 h-3" />
                            </button>
                            <span className="text-right">Action</span>
                        </div>

                        <div className="divide-y divide-white/5">
                            {filtered.map((s: any) => {
                                const max = s.assignments?.max_points ?? 100;
                                const info = s.grade != null ? pctInfo(s.grade, max) : null;
                                const expanded = expandedIds.has(s.id);

                                return (
                                    <div key={s.id} className="group transition-colors hover:bg-white/3">
                                        {/* Main row */}
                                        <div className="flex items-center gap-3 px-4 sm:px-5 py-3.5">
                                            {/* Avatar */}
                                            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-600 to-blue-600 flex items-center justify-center text-sm font-black text-white flex-shrink-0">
                                                {(s.portal_users?.full_name ?? '?')[0]}
                                            </div>

                                            {/* Info */}
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap mb-0.5">
                                                    <span className="font-semibold text-white text-sm">{s.assignments?.title ?? '—'}</span>
                                                    <Badge status={s.status} />
                                                </div>
                                                <p className="text-xs text-white/40 truncate">
                                                    {s.portal_users?.full_name ?? 'Unknown'}
                                                    {s.assignments?.courses?.title ? ` · ${s.assignments.courses.title}` : ''}
                                                </p>
                                                {s.submitted_at && (
                                                    <p className="text-xs text-white/20 mt-0.5 hidden sm:flex items-center gap-1">
                                                        <CalendarIcon className="w-3 h-3" />
                                                        {new Date(s.submitted_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                                                    </p>
                                                )}
                                            </div>

                                            {/* Grade display */}
                                            <div className="flex-shrink-0 text-right mr-1 hidden sm:block">
                                                {info ? (
                                                    <div>
                                                        <span className={`text-lg font-black ${colorClass(info.color, 'text')}`}>{info.letter}</span>
                                                        <p className={`text-xs ${colorClass(info.color, 'text')} opacity-70`}>{s.grade}/{max}</p>
                                                    </div>
                                                ) : (
                                                    <span className="text-white/20 text-xs">—</span>
                                                )}
                                            </div>

                                            {/* Expand (mobile only) */}
                                            {s.submission_text && (
                                                <button onClick={() => toggleExpand(s.id)}
                                                    className="p-2 text-white/20 hover:text-white transition-colors flex-shrink-0 sm:hidden">
                                                    {expanded ? <ChevronUpIcon className="w-4 h-4" /> : <ChevronDownIcon className="w-4 h-4" />}
                                                </button>
                                            )}

                                            {/* Grade button */}
                                            {canGrade ? (
                                                <button onClick={() => setGrading(s)}
                                                    className={`p-2.5 rounded-xl transition-all flex-shrink-0 ${
                                                        s.status === 'submitted' || s.status === 'late'
                                                            ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                                                            : 'bg-white/5 hover:bg-white/10 text-white/30 opacity-0 group-hover:opacity-100'
                                                    }`}
                                                    title={info ? 'Edit grade' : 'Grade now'}>
                                                    <PencilSquareIcon className="w-4 h-4" />
                                                </button>
                                            ) : (
                                                <div className="w-9" />
                                            )}
                                        </div>

                                        {/* Expandable submission preview */}
                                        {expanded && s.submission_text && (
                                            <div className="px-5 pb-4">
                                                <div className="bg-white/5 border border-white/10 rounded-xl p-3 max-h-32 overflow-y-auto">
                                                    <p className="text-xs text-white/30 uppercase tracking-wider mb-1.5">Student work</p>
                                                    <p className="text-sm text-white/60 whitespace-pre-wrap leading-relaxed">{s.submission_text}</p>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* ══ STUDENT RESULTS ══════════════════════════════ */}
                {!isStaff && filtered.length > 0 && (
                    <div className="space-y-3">
                        {filtered.map((s: any) => {
                            const max = s.assignments?.max_points ?? 100;
                            const info = s.grade != null ? pctInfo(s.grade, max) : null;
                            const expanded = expandedIds.has(s.id);

                            return (
                                <div key={s.id}
                                    className={`bg-white/5 border rounded-2xl overflow-hidden transition-all ${
                                        s.status === 'graded' ? 'border-emerald-500/20' :
                                        s.status === 'missing' ? 'border-rose-500/20' : 'border-white/10'
                                    }`}>
                                    {/* Top progress strip */}
                                    {info && (
                                        <div className="h-1 bg-white/5">
                                            <div style={{ width: `${info.pct}%` }}
                                                className={`h-1 transition-all duration-700 ${colorClass(info.color, 'bg')}`} />
                                        </div>
                                    )}

                                    <div className="p-4 sm:p-5">
                                        <div className="flex items-start gap-4">
                                            {/* Grade ring */}
                                            <div className="flex-shrink-0">
                                                {info ? (
                                                    <GradeRing pct={info.pct} letter={info.letter} color={info.color} size="sm" />
                                                ) : (
                                                    <div className="w-14 h-14 rounded-full border-2 border-white/10 flex items-center justify-center">
                                                        <span className="text-white/20 text-xs font-bold">—</span>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Content */}
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap mb-1">
                                                    <h4 className="font-bold text-white text-sm sm:text-base leading-tight">
                                                        {s.assignments?.title ?? 'Assignment'}
                                                    </h4>
                                                    <Badge status={s.status} />
                                                </div>
                                                <p className="text-xs text-white/40 truncate">
                                                    {s.assignments?.courses?.title}
                                                    {s.assignments?.courses?.programs?.name ? ` · ${s.assignments.courses.programs.name}` : ''}
                                                </p>
                                                <div className="flex items-center gap-3 sm:gap-4 text-xs text-white/25 mt-1.5 flex-wrap">
                                                    {s.assignments?.due_date && (
                                                        <span className="flex items-center gap-1">
                                                            <CalendarIcon className="w-3 h-3" />
                                                            Due {new Date(s.assignments.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                                                        </span>
                                                    )}
                                                    {s.submitted_at && (
                                                        <span>Submitted {new Date(s.submitted_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
                                                    )}
                                                    {s.graded_at && (
                                                        <span className="text-emerald-400/60">
                                                            Graded {new Date(s.graded_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                                                        </span>
                                                    )}
                                                </div>

                                                {/* Score detail */}
                                                {info && (
                                                    <div className="flex items-center gap-3 mt-2">
                                                        <span className={`text-xs font-bold ${colorClass(info.color, 'text')}`}>{info.pct}% · {info.label}</span>
                                                        <span className="text-xs text-white/30">{s.grade}/{max} pts</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Feedback */}
                                        {s.feedback && (
                                            <div className="mt-3">
                                                <button onClick={() => toggleExpand(s.id)}
                                                    className="w-full text-left flex items-center justify-between px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-xs text-white/40 hover:text-white/70 transition-colors">
                                                    <span className="flex items-center gap-1.5">
                                                        <AcademicCapIcon className="w-3.5 h-3.5" />
                                                        Teacher Feedback
                                                    </span>
                                                    {expanded ? <ChevronUpIcon className="w-3.5 h-3.5" /> : <ChevronDownIcon className="w-3.5 h-3.5" />}
                                                </button>
                                                {expanded && (
                                                    <div className="mt-2 px-3 py-3 bg-emerald-500/5 border border-emerald-500/20 rounded-xl">
                                                        <p className="text-sm text-white/70 leading-relaxed">{s.feedback}</p>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

            </div>
        </div>
    );
}
