'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import { fetchSubmissionsForGrading, fetchStudentGrades, gradeSubmission } from '@/services/dashboard.service';
import {
    ClipboardDocumentCheckIcon, CheckCircleIcon, ClockIcon, ChartBarIcon,
    ExclamationTriangleIcon, MagnifyingGlassIcon, PencilSquareIcon,
    ArrowPathIcon, CheckIcon, XMarkIcon, CalendarIcon, UserGroupIcon,
    DocumentTextIcon, StarIcon,
} from '@heroicons/react/24/outline';

// ─── Letter grade helper ──────────────────────────────────────
function pctInfo(grade: number, max: number) {
    const pct = Math.round((grade / max) * 100);
    const letter = pct >= 90 ? 'A' : pct >= 80 ? 'B' : pct >= 70 ? 'C' : pct >= 60 ? 'D' : 'F';
    const color = pct >= 70 ? 'emerald' : pct >= 50 ? 'amber' : 'rose';
    return { pct, letter, color };
}

// ─── Status badge ─────────────────────────────────────────────
function Badge({ status }: { status: string }) {
    const map: Record<string, string> = {
        graded: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
        submitted: 'bg-blue-500/20    text-blue-400    border-blue-500/30',
        late: 'bg-amber-500/20   text-amber-400   border-amber-500/30',
        missing: 'bg-rose-500/20    text-rose-400    border-rose-500/30',
    };
    return (
        <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border capitalize ${map[status] ?? 'bg-white/10 text-white/40'}`}>
            {status}
        </span>
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

    const info = grade ? pctInfo(Number(grade), max) : null;

    const save = async () => {
        const g = Number(grade);
        if (isNaN(g) || g < 0 || g > max) { setErr(`Enter a score between 0 and ${max}`); return; }
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
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-[#161628] border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl"
                onClick={(e) => e.stopPropagation()}>

                {/* Modal header */}
                <div className="p-6 border-b border-white/10 flex items-start justify-between">
                    <div>
                        <h3 className="font-bold text-white text-lg">Grade Submission</h3>
                        <p className="text-sm text-white/40 mt-0.5">{sub.assignments?.title}</p>
                        <div className="flex items-center gap-2 mt-2">
                            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-600 to-blue-600 flex items-center justify-center text-xs font-black text-white">
                                {(sub.portal_users?.full_name ?? '?')[0]}
                            </div>
                            <span className="text-sm text-white/70">{sub.portal_users?.full_name ?? 'Student'}</span>
                            <span className="text-xs text-white/30">{sub.portal_users?.email}</span>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-xl transition-colors">
                        <XMarkIcon className="w-5 h-5 text-white/40" />
                    </button>
                </div>

                <div className="p-6 space-y-5">
                    {/* Submission content */}
                    {sub.submission_text && (
                        <div className="bg-white/5 border border-white/10 rounded-xl p-4 max-h-40 overflow-y-auto">
                            <p className="text-xs text-white/30 uppercase tracking-wider mb-2">Student Submission</p>
                            <p className="text-sm text-white/70 whitespace-pre-wrap">{sub.submission_text}</p>
                        </div>
                    )}
                    {sub.file_url && (
                        <a href={sub.file_url} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 underline">
                            📎 View attached file
                        </a>
                    )}
                    {!sub.submission_text && !sub.file_url && sub.status !== 'missing' && (
                        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-sm text-amber-400">
                            No text or file submitted — grade based on verbal/in-person work if applicable.
                        </div>
                    )}

                    {/* Score input */}
                    <div>
                        <label className="block text-sm font-semibold text-white/70 mb-2">
                            Score <span className="text-white/30 font-normal">(0–{max} points)</span>
                        </label>
                        <div className="flex items-center gap-4">
                            <input type="number" min={0} max={max} value={grade}
                                onChange={(e) => { setGrade(e.target.value); setErr(''); }}
                                className="w-28 px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white text-xl font-bold text-center focus:outline-none focus:border-violet-500 transition-colors"
                                placeholder="0"
                            />
                            <div className="flex-1">
                                <div className="w-full h-3 bg-white/5 rounded-full mb-1 overflow-hidden">
                                    <div style={{ width: `${Math.min(info?.pct ?? 0, 100)}%` }}
                                        className={`h-3 rounded-full transition-all duration-300 ${info?.color === 'emerald' ? 'bg-emerald-500' :
                                                info?.color === 'amber' ? 'bg-amber-500' : 'bg-rose-500'
                                            }`} />
                                </div>
                                {info && (
                                    <div className={`flex items-center gap-2 text-${info.color}-400`}>
                                        <span className="text-2xl font-black">{info.letter}</span>
                                        <span className="text-sm font-semibold">{info.pct}%</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Feedback */}
                    <div>
                        <label className="block text-sm font-semibold text-white/70 mb-2">
                            Feedback <span className="text-white/30 font-normal">(shown to student)</span>
                        </label>
                        <textarea value={feedback} rows={3}
                            onChange={(e) => setFb(e.target.value)}
                            placeholder="Write specific, constructive feedback for the student…"
                            className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/25 focus:outline-none focus:border-violet-500 transition-colors resize-none"
                        />
                    </div>

                    {err && <p className="text-sm text-rose-400 flex items-center gap-1"><ExclamationTriangleIcon className="w-4 h-4" />{err}</p>}
                </div>

                <div className="p-6 border-t border-white/10 flex gap-3">
                    <button onClick={onClose}
                        className="flex-1 py-2.5 text-sm font-semibold text-white/50 bg-white/5 hover:bg-white/10 rounded-xl transition-colors">
                        Cancel
                    </button>
                    <button onClick={save} disabled={saving}
                        className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl transition-all disabled:opacity-60">
                        {saving ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : <CheckIcon className="w-4 h-4" />}
                        {saving ? 'Saving…' : 'Submit Grade'}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Main Page ────────────────────────────────────────────────
export default function GradesPage() {
    const { profile, loading: authLoading } = useAuth();

    const [items, setItems] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState('all');
    const [grading, setGrading] = useState<any | null>(null);

    const role = profile?.role ?? '';
    const isStaff = role === 'admin' || role === 'teacher';

    // ── Fetch ─────────────────────────────────────────────────
    useEffect(() => {
        if (authLoading || !profile) return;
        let cancelled = false;

        async function load() {
            setLoading(true);
            setError(null);
            try {
                const data = isStaff
                    ? await fetchSubmissionsForGrading(role === 'teacher' ? profile!.id : undefined)
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

    // ── Optimistic grade update ────────────────────────────────
    const handleGraded = (id: string, grade: number, feedback: string) => {
        setItems(prev => prev.map(s => s.id === id
            ? { ...s, grade, feedback, status: 'graded', graded_at: new Date().toISOString() }
            : s
        ));
    };

    // ── Filter ─────────────────────────────────────────────────
    const filtered = items.filter((s: any) => {
        const title = s.assignments?.title ?? '';
        const student = s.portal_users?.full_name ?? '';
        const ms = (title + student).toLowerCase().includes(search.toLowerCase());
        return ms && (filter === 'all' || s.status === filter);
    });

    // ── Stats ──────────────────────────────────────────────────
    const graded = items.filter((s: any) => s.status === 'graded').length;
    const pending = items.filter((s: any) => s.status === 'submitted').length;
    const avgPct = (() => {
        const gs = items.filter((s: any) => s.grade != null && s.assignments?.max_points);
        if (!gs.length) return null;
        return Math.round(gs.reduce((a: number, s: any) => a + (s.grade / s.assignments.max_points) * 100, 0) / gs.length);
    })();

    // ── Loading ────────────────────────────────────────────────
    if (authLoading || loading) return (
        <div className="min-h-screen bg-[#0f0f1a] text-white">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
                <div className="animate-pulse space-y-2">
                    <div className="h-4 bg-white/10 rounded w-32" />
                    <div className="h-8 bg-white/10 rounded w-64" />
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {[1, 2, 3, 4].map(i => <div key={i} className="bg-white/5 border border-white/10 rounded-2xl h-24 animate-pulse" />)}
                </div>
                {[1, 2, 3].map(i => <div key={i} className="bg-white/5 border border-white/10 rounded-2xl h-20 animate-pulse" />)}
            </div>
        </div>
    );

    if (!profile) return (
        <div className="min-h-screen bg-[#0f0f1a] flex items-center justify-center">
            <div className="text-center">
                <ClipboardDocumentCheckIcon className="w-12 h-12 mx-auto text-white/10 mb-3" />
                <p className="text-white/30">Sign in to view grades</p>
                <Link href="/login" className="mt-3 inline-block px-5 py-2 bg-violet-600 text-white rounded-xl text-sm font-bold">Sign In</Link>
            </div>
        </div>
    );

    return (
        <div className="min-h-screen bg-[#0f0f1a] text-white">
            {grading && (
                <GradeModal sub={grading} onClose={() => setGrading(null)} onSaved={handleGraded} />
            )}

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">

                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <ClipboardDocumentCheckIcon className="w-5 h-5 text-emerald-400" />
                            <span className="text-xs font-bold text-emerald-400 uppercase tracking-widest">
                                {isStaff ? 'Grading Centre' : 'My Results'} · {role}
                            </span>
                        </div>
                        <h1 className="text-3xl font-extrabold">
                            {isStaff ? 'Grades & Submissions' : 'My Academic Results'}
                        </h1>
                        <p className="text-white/40 text-sm mt-1">
                            {isStaff ? 'Grade student submissions and track performance' : 'View your scores and teacher feedback'}
                        </p>
                    </div>
                </div>

                {/* Error */}
                {error && (
                    <div className="flex items-center gap-3 bg-rose-500/10 border border-rose-500/20 rounded-xl p-4">
                        <ExclamationTriangleIcon className="w-5 h-5 text-rose-400 flex-shrink-0" />
                        <p className="text-rose-400 text-sm">{error}</p>
                    </div>
                )}

                {/* Stats */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {[
                        { label: 'Total', value: items.length, icon: DocumentTextIcon, color: 'text-violet-400', bg: 'bg-violet-500/10' },
                        { label: isStaff ? 'Needs Grading' : 'Submitted', value: pending, icon: ClockIcon, color: 'text-amber-400', bg: 'bg-amber-500/10' },
                        { label: 'Graded', value: graded, icon: CheckCircleIcon, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
                        {
                            label: 'Average',
                            value: avgPct != null ? `${avgPct}%` : '—',
                            icon: ChartBarIcon,
                            color: avgPct == null ? 'text-white/20' : avgPct >= 70 ? 'text-emerald-400' : avgPct >= 50 ? 'text-amber-400' : 'text-rose-400',
                            bg: 'bg-blue-500/10'
                        },
                    ].map(s => (
                        <div key={s.label} className="bg-white/5 border border-white/10 rounded-2xl p-5">
                            <div className={`w-10 h-10 ${s.bg} rounded-xl flex items-center justify-center mb-3`}>
                                <s.icon className={`w-5 h-5 ${s.color}`} />
                            </div>
                            <p className={`text-2xl font-extrabold ${s.color}`}>{s.value}</p>
                            <p className="text-xs text-white/40 mt-1">{s.label}</p>
                        </div>
                    ))}
                </div>

                {/* Pending banner for teachers */}
                {isStaff && pending > 0 && (
                    <div className="flex items-center gap-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4">
                        <ClockIcon className="w-6 h-6 text-amber-400 flex-shrink-0" />
                        <div className="flex-1">
                            <p className="font-bold text-amber-400">{pending} submission{pending !== 1 ? 's' : ''} waiting to be graded</p>
                            <p className="text-xs text-white/30 mt-0.5">Click the pencil icon on any row to open the grade panel</p>
                        </div>
                        <button onClick={() => setFilter('submitted')}
                            className="px-4 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 text-xs font-bold rounded-xl transition-colors">
                            Show Pending
                        </button>
                    </div>
                )}

                {/* Filters */}
                <div className="flex flex-col sm:flex-row gap-3">
                    <div className="relative flex-1">
                        <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                        <input type="text"
                            placeholder={isStaff ? 'Search by assignment or student…' : 'Search by assignment…'}
                            value={search} onChange={(e) => setSearch(e.target.value)}
                            className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/30 focus:outline-none focus:border-emerald-500 transition-colors"
                        />
                    </div>
                    <select value={filter} onChange={(e) => setFilter(e.target.value)}
                        className="px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-emerald-500 cursor-pointer">
                        <option value="all">All Status</option>
                        <option value="submitted">Submitted</option>
                        <option value="graded">Graded</option>
                        <option value="late">Late</option>
                        <option value="missing">Missing</option>
                    </select>
                </div>

                {/* Empty */}
                {!error && filtered.length === 0 && (
                    <div className="text-center py-20 bg-white/5 border border-white/10 rounded-2xl">
                        <ClipboardDocumentCheckIcon className="w-14 h-14 mx-auto text-white/10 mb-4" />
                        <p className="text-lg font-semibold text-white/30">No submissions found</p>
                        <p className="text-sm text-white/20 mt-1">
                            {isStaff ? 'No students have submitted yet, or change the filter.' : 'No graded assignments yet.'}
                        </p>
                    </div>
                )}

                {/* ── TEACHER/ADMIN TABLE ──────────────────────────── */}
                {isStaff && filtered.length > 0 && (
                    <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
                        <div className="p-5 border-b border-white/10 flex items-center justify-between">
                            <h3 className="font-bold text-white flex items-center gap-2">
                                <UserGroupIcon className="w-5 h-5 text-emerald-400" /> Submissions
                            </h3>
                            <span className="text-xs text-white/30">{filtered.length} shown</span>
                        </div>

                        <div className="divide-y divide-white/5">
                            {filtered.map((s: any) => {
                                const max = s.assignments?.max_points ?? 100;
                                const info = s.grade != null ? pctInfo(s.grade, max) : null;
                                return (
                                    <div key={s.id}
                                        className="flex items-center gap-4 px-5 py-4 hover:bg-white/5 transition-colors group">

                                        {/* Student avatar */}
                                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-600 to-blue-600 flex items-center justify-center text-sm font-black text-white flex-shrink-0">
                                            {(s.portal_users?.full_name ?? '?')[0]}
                                        </div>

                                        {/* Assignment + student */}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap mb-0.5">
                                                <span className="font-semibold text-white text-sm">{s.assignments?.title ?? '—'}</span>
                                                <Badge status={s.status} />
                                            </div>
                                            <p className="text-xs text-white/40 truncate">
                                                {s.portal_users?.full_name ?? 'Unknown student'}
                                                {s.assignments?.courses?.title ? ` · ${s.assignments.courses.title}` : ''}
                                            </p>
                                            {s.submitted_at && (
                                                <p className="text-xs text-white/20 flex items-center gap-1 mt-0.5">
                                                    <CalendarIcon className="w-3 h-3" />
                                                    Submitted {new Date(s.submitted_at).toLocaleDateString()}
                                                </p>
                                            )}
                                        </div>

                                        {/* Grade */}
                                        <div className="flex-shrink-0 text-right mr-2">
                                            {info ? (
                                                <>
                                                    <span className={`text-lg font-black text-${info.color}-400`}>{info.letter}</span>
                                                    <p className={`text-xs text-${info.color}-400 opacity-70`}>{s.grade}/{max}</p>
                                                </>
                                            ) : (
                                                <span className="text-white/20 text-sm">Not graded</span>
                                            )}
                                        </div>

                                        {/* Grade button */}
                                        <button
                                            onClick={() => setGrading(s)}
                                            className={`p-2.5 rounded-xl transition-all flex-shrink-0 ${s.status === 'submitted'
                                                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white opacity-100'
                                                    : 'bg-white/5 hover:bg-white/10 text-white/30 opacity-0 group-hover:opacity-100'
                                                }`}
                                            title={s.status === 'graded' ? 'Edit grade' : 'Grade now'}>
                                            <PencilSquareIcon className="w-4 h-4" />
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* ── STUDENT RESULTS ──────────────────────────────── */}
                {!isStaff && filtered.length > 0 && (
                    <div className="space-y-4">
                        {filtered.map((s: any) => {
                            const max = s.assignments?.max_points ?? 100;
                            const info = s.grade != null ? pctInfo(s.grade, max) : null;
                            return (
                                <div key={s.id}
                                    className={`bg-white/5 border rounded-2xl overflow-hidden transition-all ${s.status === 'graded' ? 'border-emerald-500/20' : 'border-white/10'
                                        }`}>
                                    {/* Progress strip */}
                                    {info && (
                                        <div className="h-1.5 bg-white/5">
                                            <div style={{ width: `${info.pct}%` }}
                                                className={`h-1.5 bg-${info.color}-500 transition-all duration-500`} />
                                        </div>
                                    )}

                                    <div className="p-6 flex flex-col sm:flex-row items-start sm:items-center gap-4">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap mb-1">
                                                <h4 className="font-bold text-white">{s.assignments?.title ?? 'Assignment'}</h4>
                                                <Badge status={s.status} />
                                            </div>
                                            <p className="text-sm text-white/40">
                                                {s.assignments?.courses?.title}
                                                {s.assignments?.courses?.programs?.name ? ` · ${s.assignments.courses.programs.name}` : ''}
                                            </p>
                                            <div className="flex items-center gap-4 text-xs text-white/25 mt-2 flex-wrap">
                                                {s.assignments?.due_date && (
                                                    <span className="flex items-center gap-1">
                                                        <CalendarIcon className="w-3.5 h-3.5" />
                                                        Due {new Date(s.assignments.due_date).toLocaleDateString()}
                                                    </span>
                                                )}
                                                {s.submitted_at && <span>Submitted {new Date(s.submitted_at).toLocaleDateString()}</span>}
                                                {s.graded_at && <span>Graded {new Date(s.graded_at).toLocaleDateString()}</span>}
                                            </div>
                                            {s.feedback && (
                                                <div className="mt-4 p-3 bg-white/5 rounded-xl border border-white/10">
                                                    <p className="text-xs text-white/30 uppercase tracking-wider mb-1">Teacher Feedback</p>
                                                    <p className="text-sm text-white/70">{s.feedback}</p>
                                                </div>
                                            )}
                                        </div>

                                        {/* Score block */}
                                        <div className="flex-shrink-0 text-right">
                                            {info ? (
                                                <>
                                                    <div className={`text-5xl font-black text-${info.color}-400 leading-none`}>{info.letter}</div>
                                                    <div className={`text-sm font-bold text-${info.color}-400 mt-1`}>{info.pct}%</div>
                                                    <div className="text-xs text-white/30 mt-0.5">{s.grade}/{max} pts</div>
                                                </>
                                            ) : (
                                                <>
                                                    <div className="text-white/20 text-lg font-bold">—</div>
                                                    <div className="text-xs text-white/20">Awaiting grade</div>
                                                </>
                                            )}
                                        </div>
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
