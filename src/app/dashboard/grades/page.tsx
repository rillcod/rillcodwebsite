// @refresh reset
'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import { fetchSubmissionsForGrading, fetchStudentGrades } from '@/services/dashboard.service';
import {
    ClipboardDocumentCheckIcon, CheckCircleIcon, ClockIcon, ChartBarIcon,
    ExclamationTriangleIcon, MagnifyingGlassIcon, PencilSquareIcon,
    ArrowPathIcon, CheckIcon, XMarkIcon, CalendarIcon,
    DocumentTextIcon, StarIcon, ArrowDownTrayIcon, AcademicCapIcon,
    TrophyIcon, BoltIcon, FireIcon, ChevronDownIcon, ChevronUpIcon,
    ArrowsUpDownIcon, SparklesIcon,
    PaperClipIcon, TrashIcon
} from '@/lib/icons';
import { toast } from 'sonner';

// ─── WAEC Grade helpers ───────────────────────────────────────
import { getWAECGrade } from '@/lib/grading';

function pctInfo(grade: number, max: number) {
    const pct = Math.round((grade / max) * 100);
    const waec = getWAECGrade(pct);
    const letter = waec.code;
    const label = waec.label;
    const color = pct >= 65 ? 'emerald' : pct >= 50 ? 'amber' : pct >= 40 ? 'orange' : 'rose';
    return { pct, letter, color, label, waec };
}

// WAEC-aligned quick grades (A1 → F9)
const QUICK_GRADES = [
    { label: 'A1', pct: 85, color: 'emerald' },
    { label: 'B2', pct: 72, color: 'emerald' },
    { label: 'C4', pct: 62, color: 'blue' },
    { label: 'C6', pct: 52, color: 'amber' },
    { label: 'D7', pct: 47, color: 'orange' },
    { label: 'F9', pct: 25, color: 'rose' },
];

function colorClass(color: string, variant: 'text' | 'bg' | 'border' | 'ring') {
    const map: Record<string, Record<string, string>> = {
        emerald: { text: 'text-emerald-400', bg: 'bg-emerald-500', border: 'border-emerald-500', ring: 'ring-emerald-500' },
        blue: { text: 'text-blue-400', bg: 'bg-blue-500', border: 'border-blue-500', ring: 'ring-blue-500' },
        amber: { text: 'text-amber-400', bg: 'bg-amber-500', border: 'border-amber-500', ring: 'ring-amber-500' },
        orange: { text: 'text-primary', bg: 'bg-primary', border: 'border-primary', ring: 'ring-primary' },
        rose: { text: 'text-rose-400', bg: 'bg-rose-500', border: 'border-rose-500', ring: 'ring-rose-500' },
    };
    return map[color]?.[variant] ?? '';
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
        <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border capitalize whitespace-nowrap ${map[status] ?? 'bg-muted text-muted-foreground border-border'}`}>
            {status}
        </span>
    );
}

// ─── Batch Sync Modal ─────────────────────────────────────────
function BatchSyncModal({ programs, allCourses, onClose, onSynced }: { 
    programs: any[]; 
    allCourses: any[];
    onClose: () => void;
    onSynced: () => void;
}) {
    const { profile } = useAuth();
    const [programId, setProgramId] = useState('');
    const [courseId, setCourseId] = useState('');
    const [className, setClassName] = useState('');
    const [term, setTerm] = useState('First Term');
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [instructor, setInstructor] = useState(profile?.full_name || '');
    const [syncing, setSyncing] = useState(false);
    const [error, setError] = useState('');

    const courses = programId ? allCourses.filter(c => c.program_id === programId) : [];

    const handleSync = async () => {
        if (!courseId || !className || !term || !date) {
            setError('Please fill in all required fields');
            return;
        }
        setSyncing(true);
        setError('');
        try {
            const course = allCourses.find(c => c.id === courseId);
            const res = await fetch('/api/reports/batch-sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    course_id: courseId,
                    course_name: course?.title,
                    class_name: className,
                    report_term: term,
                    report_date: date,
                    instructor_name: instructor,
                    school_id: profile?.school_id,
                    school_name: profile?.school_name
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to sync');
            toast.success(`Succesfully synced ${data.results.length} student reports`);
            onSynced();
            onClose();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setSyncing(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[60] bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
            <div className="bg-[#161628] border border-white/10 w-full max-w-md shadow-2xl p-8 space-y-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h3 className="text-xl font-black text-foreground uppercase tracking-tight">Batch-Sync Reports</h3>
                        <p className="text-xs text-muted-foreground mt-1">Push current grades for a whole class into report card drafts.</p>
                    </div>
                </div>

                <div className="space-y-4">
                    <div>
                        <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1.5">Programme *</label>
                        <select value={programId} onChange={e => {setProgramId(e.target.value); setCourseId('');}} className="w-full bg-white/5 border border-white/10 text-sm p-3.5 focus:outline-none focus:border-primary">
                            <option value="">Select Programme</option>
                            {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1.5">Course *</label>
                        <select value={courseId} onChange={e => setCourseId(e.target.value)} disabled={!programId} className="w-full bg-white/5 border border-white/10 text-sm p-3.5 focus:outline-none focus:border-primary disabled:opacity-30">
                            <option value="">Select Course</option>
                            {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1.5">Class / Section *</label>
                        <input value={className} onChange={e => setClassName(e.target.value)} placeholder="e.g. Basic 4" className="w-full bg-white/5 border border-white/10 text-sm p-3.5 focus:outline-none focus:border-primary" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1.5">Term *</label>
                            <select value={term} onChange={e => setTerm(e.target.value)} className="w-full bg-white/5 border border-white/10 text-sm p-3.5 focus:outline-none focus:border-primary">
                                <option value="First Term">First Term</option>
                                <option value="Second Term">Second Term</option>
                                <option value="Third Term">Third Term</option>
                                <option value="Annual">Annual</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1.5">Report Date *</label>
                            <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full bg-white/5 border border-white/10 text-sm p-3.5 focus:outline-none focus:border-primary" />
                        </div>
                    </div>
                </div>

                {error && <p className="text-xs text-rose-500 bg-rose-500/10 p-3 border border-rose-500/20">{error}</p>}

                <div className="flex gap-3">
                    <button onClick={onClose} className="flex-1 py-3.5 text-xs font-bold text-muted-foreground border border-white/10 hover:bg-white/5 transition-all">Cancel</button>
                    <button onClick={handleSync} disabled={syncing || !courseId || !className} className="flex-1 py-3.5 bg-primary hover:bg-primary disabled:opacity-50 text-foreground text-xs font-black uppercase tracking-widest shadow-lg shadow-orange-900/40">
                        {syncing ? (
                            <div className="flex items-center justify-center gap-2">
                                <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" />
                                Syncing...
                            </div>
                        ) : 'Start Magic Sync'}
                    </button>
                </div>
            </div>
        </div>
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
    onSaved: () => void;
}) {
    const { profile } = useAuth();
    const max = sub.assignments?.max_points ?? 100;
    const [grade, setGrade] = useState<string>(sub.grade?.toString() ?? '');
    const [feedback, setFb] = useState<string>(sub.feedback ?? '');
    const [status, setStatus] = useState(sub.status);
    const [subText, setSubText] = useState(sub.submission_text ?? '');
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [err, setErr] = useState('');
    const [showContent, setShowContent] = useState(false);
    const [isAIThinking, setIsAIThinking] = useState(false);

    const generateAIFeedback = async () => {
        if (isAIThinking) return;
        setIsAIThinking(true);
        setErr('');
        try {
            const res = await fetch('/api/ai/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'report-feedback',
                    studentName: sub.portal_users?.full_name,
                    topic: sub.assignments?.title,
                    gradeLevel: sub.assignments?.grade_level || 'the unit',
                    subject: sub.assignments?.courses?.title || 'Coding',
                    attendance: '100%', // Placeholder or from sub
                    assignments: `${grade}/${max} score achieved`,
                    currentContent: subText || 'Standard submission'
                })
            });
            const d = await res.json();
            if (res.ok && d.data) {
                const combined = `${d.data.key_strengths}\n\n${d.data.areas_for_growth}`;
                setFb(combined);
                toast.success('AI Feedback Generated');
            } else {
                throw new Error(d.error || 'Failed to generate AI feedback');
            }
        } catch (e: any) {
            setErr(e.message);
            toast.error('AI Feedback Failed');
        } finally {
            setIsAIThinking(false);
        }
    };

    const info = grade !== '' && !isNaN(Number(grade)) ? pctInfo(Number(grade), max) : null;

    const applyQuick = (pct: number) => {
        setGrade(Math.round((pct / 100) * max).toString());
        setErr('');
    };

    const save = async () => {
        const g = Number(grade);
        if (grade !== '' && (isNaN(g) || g < 0 || g > max)) { setErr(`Enter a score between 0 and ${max}`); return; }
        setSaving(true); setErr('');
        try {
            const payload: any = {
                grade: grade === '' ? null : g,
                feedback,
                status,
                submission_text: subText || null,
            };
            if (status === 'graded') payload.graded_at = new Date().toISOString();

            const res = await fetch(`/api/submissions/${sub.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error ?? 'Failed to save grade');
            onSaved();
            onClose();
        } catch (e: any) {
            setErr(e.message ?? 'Failed to save grade');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        setDeleting(true); setErr('');
        try {
            const res = await fetch(`/api/submissions/${sub.id}`, { method: 'DELETE' });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error ?? 'Failed to delete submission');
            onSaved();
            onClose();
        } catch (e: any) {
            setErr(e.message ?? 'Failed to delete submission');
            setConfirmDelete(false);
        } finally {
            setDeleting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
            <div className="bg-[#161628] border border-border rounded-t-[32px] rounded-none w-full sm:max-w-lg shadow-2xl max-h-[92vh] flex flex-col"
                onClick={e => e.stopPropagation()}>

                {/* Drag handle (mobile) */}
                <div className="flex justify-center pt-3 pb-1 sm:hidden">
                    <div className="w-10 h-1.5 bg-muted rounded-full" />
                </div>

                {/* Header */}
                <div className="p-5 border-b border-border flex items-start justify-between flex-shrink-0">
                    <div className="flex-1 min-w-0 pr-4">
                        <h3 className="font-bold text-foreground text-base leading-tight">{sub.assignments?.title ?? 'Grade Submission'}</h3>
                        <div className="flex items-center gap-2 mt-2">
                            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary from-primary to-primary flex items-center justify-center text-xs font-black text-foreground flex-shrink-0">
                                {(sub.portal_users?.full_name ?? '?')[0]}
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-semibold text-foreground truncate">{sub.portal_users?.full_name ?? 'Student'}</p>
                                <div className="flex items-center gap-2 mt-1">
                                    <select value={status} onChange={e => setStatus(e.target.value)}
                                        className={`px-2 py-0.5 rounded text-[10px] font-black uppercase border appearance-none cursor-pointer ${
                                            status === 'graded' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' :
                                            status === 'submitted' ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' :
                                            status === 'late' ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' :
                                            'bg-rose-500/20 text-rose-400 border-rose-500/30'
                                        }`}>
                                        <option value="submitted">Submitted</option>
                                        <option value="graded">Graded</option>
                                        <option value="late">Late</option>
                                        <option value="missing">Missing</option>
                                    </select>
                                    <p className="text-[10px] text-muted-foreground truncate">{sub.portal_users?.email}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-muted rounded-none transition-colors flex-shrink-0">
                        <XMarkIcon className="w-5 h-5 text-muted-foreground" />
                    </button>
                </div>

                <div className="overflow-y-auto flex-1">
                    <div className="p-5 space-y-5">
                        {/* Quick grade buttons */}
                        <div>
                            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Quick Grade</p>
                            <div className="grid grid-cols-6 gap-1.5">
                                {QUICK_GRADES.map(q => (
                                    <button key={q.label}
                                        onClick={() => applyQuick(q.pct)}
                                        className={`py-2.5 rounded-none text-xs font-black transition-all border ${info?.letter === q.label
                                                ? `${colorClass(q.color, 'bg')} text-foreground border-transparent`
                                                : 'bg-card shadow-sm border-border text-muted-foreground hover:bg-muted hover:text-foreground'
                                            }`}>
                                        {q.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Score input + ring */}
                        <div className="flex items-center gap-5 bg-card shadow-sm border border-border rounded-none p-4">
                            {info ? (
                                <GradeRing pct={info.pct} letter={info.letter} color={info.color} size="md" />
                            ) : (
                                <div className="w-20 h-20 rounded-full border-4 border-border flex items-center justify-center flex-shrink-0">
                                    <span className="text-muted-foreground text-xs font-bold">—</span>
                                </div>
                            )}
                            <div className="flex-1">
                                <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">
                                    Score (max {max} pts)
                                </label>
                                <div className="flex items-center gap-3">
                                    <input type="number" min={0} max={max} value={grade}
                                        onChange={e => { setGrade(e.target.value); setErr(''); }}
                                        className="w-24 px-3 py-2.5 bg-muted border border-border rounded-none text-foreground text-xl font-black text-center focus:outline-none focus:border-primary transition-colors"
                                        placeholder="0"
                                    />
                                    <span className="text-muted-foreground text-sm font-bold">/ {max}</span>
                                </div>
                                {info && (
                                    <div className="mt-2 flex items-center gap-2">
                                        <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
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
                                    className="w-full flex items-center justify-between px-4 py-3 bg-card shadow-sm border border-border rounded-none text-sm text-muted-foreground hover:text-foreground transition-colors">
                                    <span className="font-semibold">View Student Work</span>
                                    {showContent ? <ChevronUpIcon className="w-4 h-4" /> : <ChevronDownIcon className="w-4 h-4" />}
                                </button>
                                {showContent && (
                                    <div className="mt-2 space-y-3">
                                        <div className="bg-card shadow-sm border border-border rounded-none p-3">
                                            <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-2">Edit Student Text</label>
                                            <textarea value={subText} rows={4}
                                                onChange={e => setSubText(e.target.value)}
                                                className="w-full bg-transparent text-sm text-muted-foreground focus:outline-none resize-none leading-relaxed"
                                                placeholder="Student text submission..."
                                            />
                                        </div>
                                        {sub.file_url && (
                                            <a href={sub.file_url} target="_blank" rel="noopener noreferrer"
                                                className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-blue-400 hover:text-primary p-3 bg-blue-400/5 rounded-none border border-blue-400/10">
                                                <PaperClipIcon className="w-3 h-3" /> View attached file
                                            </a>
                                        )}
                                        {confirmDelete ? (
                                            <div className="flex items-center justify-between gap-3 px-3 py-2.5 bg-rose-500/10 border border-rose-500/30">
                                                <span className="text-[11px] font-bold text-rose-400">Delete submission?</span>
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        onClick={handleDelete}
                                                        disabled={deleting}
                                                        className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-foreground text-[10px] font-black uppercase tracking-widest transition-all">
                                                        {deleting ? 'Deleting…' : 'Yes, delete'}
                                                    </button>
                                                    <button
                                                        onClick={() => setConfirmDelete(false)}
                                                        disabled={deleting}
                                                        className="text-[10px] font-bold text-muted-foreground hover:text-foreground transition-colors px-2">
                                                        Cancel
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <button onClick={() => setConfirmDelete(true)}
                                                className="w-full py-2 text-[10px] font-black uppercase tracking-widest text-rose-400/40 hover:text-rose-400 hover:bg-rose-400/10 rounded-none transition-all flex items-center justify-center gap-2 border border-transparent hover:border-rose-400/20">
                                                <TrashIcon className="w-3 h-3" />
                                                Delete Submission
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        {!sub.submission_text && !sub.file_url && sub.status !== 'missing' && (
                            <div className="bg-amber-500/10 border border-amber-500/20 rounded-none p-3 text-sm text-amber-400 flex items-center gap-2">
                                <ExclamationTriangleIcon className="w-4 h-4 flex-shrink-0" />
                                No text or file — grade based on verbal/in-person work if applicable.
                            </div>
                        )}

                        {/* Feedback */}
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider">
                                    Feedback <span className="text-muted-foreground font-normal normal-case">(shown to student)</span>
                                </label>
                                <button
                                    onClick={generateAIFeedback}
                                    disabled={isAIThinking}
                                    className="flex items-center gap-1.5 px-3 py-1 bg-primary/10 hover:bg-primary/20 border border-primary/20 rounded-none text-[10px] font-black uppercase tracking-widest text-brand-red-600 transition-all disabled:opacity-50"
                                >
                                    {isAIThinking ? <ArrowPathIcon className="w-3 h-3 animate-spin" /> : <SparklesIcon className="w-3 h-3" />}
                                    {isAIThinking ? 'Analyzing...' : 'AI Assistant'}
                                </button>
                            </div>
                            <textarea value={feedback} rows={3}
                                onChange={e => setFb(e.target.value)}
                                placeholder="Write specific, constructive feedback for the student…"
                                className="w-full px-4 py-3 bg-card shadow-sm border border-border rounded-none text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary transition-colors resize-none min-h-[100px]"
                            />
                        </div>

                        {err && <p className="text-sm text-rose-400 flex items-center gap-1.5"><ExclamationTriangleIcon className="w-4 h-4 flex-shrink-0" />{err}</p>}
                    </div>
                </div>

                {/* Footer */}
                <div className="p-5 border-t border-border flex gap-3 flex-shrink-0 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
                    <button onClick={onClose}
                        className="flex-1 py-3 text-sm font-semibold text-muted-foreground bg-card shadow-sm hover:bg-muted rounded-none transition-colors">
                        Cancel
                    </button>
                    <button onClick={save} disabled={saving}
                        className="flex-1 flex items-center justify-center gap-2 py-3 text-sm font-bold bg-emerald-600 hover:bg-emerald-500 text-foreground rounded-none transition-all disabled:opacity-60">
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
        { label: 'A', count: counts.A, color: 'bg-emerald-400' },
        { label: 'B', count: counts.B, color: 'bg-blue-500' },
        { label: 'C', count: counts.C, color: 'bg-amber-500' },
        { label: 'D', count: counts.D, color: 'bg-primary' },
        { label: 'F', count: counts.F, color: 'bg-rose-500' },
    ].filter(b => b.count > 0);

    return (
        <div className="bg-card shadow-sm border border-border rounded-none p-5">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-4">Grade Distribution · {total} graded</p>
            <div className="flex h-8 rounded-none overflow-hidden gap-0.5">
                {bars.map(b => (
                    <div key={b.label} title={`${b.label}: ${b.count}`}
                        className={`${b.color} flex items-center justify-center transition-all duration-500`}
                        style={{ width: `${(b.count / total) * 100}%` }}>
                        {b.count / total > 0.1 && <span className="text-foreground text-[10px] font-black">{b.label}</span>}
                    </div>
                ))}
            </div>
            <div className="flex flex-wrap gap-3 mt-3">
                {bars.map(b => (
                    <span key={b.label} className="text-xs text-muted-foreground">
                        <span className="font-bold text-muted-foreground">{b.label}</span> {b.count} ({Math.round((b.count / total) * 100)}%)
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
                <div key={b.label} className={`rounded-none p-4 border transition-all ${b.earned ? (
                        b.color === 'amber' ? 'bg-amber-500/10 border-amber-500/20' :
                            b.color === 'orange' ? 'bg-primary/10 border-primary/20' :
                                b.color === 'emerald' ? 'bg-emerald-500/10 border-emerald-500/20' :
                                    'bg-blue-500/10 border-blue-500/20'
                    ) : 'bg-card shadow-sm border-border opacity-40 grayscale'
                    }`}>
                    <b.icon className={`w-5 h-5 mb-2 ${b.earned ? colorClass(b.color, 'text') : 'text-muted-foreground'}`} />
                    <p className={`text-xs font-black ${b.earned ? 'text-foreground' : 'text-muted-foreground'}`}>{b.label}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{b.desc}</p>
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
        <div className="bg-card shadow-sm border border-border rounded-none p-5 space-y-4">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Course Breakdown</p>
            {list.map(c => (
                <div key={c.name}>
                    <div className="flex items-center justify-between mb-1.5">
                        <span className="text-sm text-muted-foreground font-medium truncate pr-4">{c.name}</span>
                        <span className={`text-sm font-black flex-shrink-0 ${colorClass(c.info.color, 'text')}`}>
                            {c.info.letter} · {c.avg}%
                        </span>
                    </div>
                    <div className="h-2 bg-card shadow-sm rounded-full overflow-hidden">
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

function exportPDF(items: any[], isStaff: boolean, profile: any) {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
    
    const rowsHtml = items.map(s => {
        const max = s.assignments?.max_points ?? 100;
        const info = s.grade != null ? pctInfo(s.grade, max) : null;
        const statusColor = s.status === 'graded' ? '#10b981' : s.status === 'submitted' ? '#3b82f6' : '#f43f5e';
        
        return `
            <tr>
                ${isStaff ? `<td><div style="font-weight: 800; color: #111;">${s.portal_users?.full_name || '—'}</div><div style="font-size: 10px; color: #666;">${s.portal_users?.email || ''}</div></td>` : ''}
                <td><div style="font-weight: 700;">${s.assignments?.title || '—'}</div><div style="font-size: 10px; color: #666;">${s.assignments?.courses?.title || ''}</div></td>
                <td><span style="display: inline-block; padding: 2px 8px; border-radius: 99px; font-size: 10px; font-weight: 800; text-transform: uppercase; background: ${statusColor}15; color: ${statusColor}; border: 1px solid ${statusColor}30;">${s.status}</span></td>
                <td style="text-align: center;"><div style="font-size: 14px; font-weight: 900;">${s.grade ?? '—'} <span style="font-size: 10px; color: #999; font-weight: 400;">/ ${max}</span></div></td>
                <td style="text-align: center;"><div style="font-weight: 900; color: ${info?.color === 'emerald' ? '#10b981' : info?.color === 'amber' ? '#f59e0b' : '#f43f5e'}">${info?.pct ? info.pct + '%' : '—'}</div></td>
                <td style="text-align: center;"><div style="font-weight: 900; font-size: 16px;">${info?.letter || '—'}</div></td>
            </tr>
        `;
    }).join('');

    const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Grade Report - ${profile?.full_name || 'Rillcod'}</title>
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap');
                body { font-family: 'Inter', sans-serif; padding: 40px; color: #111; max-width: 1000px; margin: 0 auto; background: #fff; }
                .header-container { display: flex; justify-content: space-between; align-items: center; border-bottom: 4px solid #1a1a2e; padding-bottom: 20px; margin-bottom: 30px; }
                .logo-section { display: flex; align-items: center; gap: 15px; }
                .logo { width: 60px; height: 60px; object-contain: contain; }
                .brand-title { font-size: 24px; font-weight: 900; color: #000; text-transform: uppercase; letter-spacing: -0.02em; }
                .brand-subtitle { font-size: 11px; color: #6366f1; font-weight: 800; text-transform: uppercase; letter-spacing: 0.2em; }
                .doc-title { text-align: right; }
                .doc-title h1 { margin: 0; font-size: 28px; font-weight: 900; text-transform: uppercase; color: #111; letter-spacing: -0.03em; }
                .doc-title p { margin: 5px 0 0; font-size: 12px; font-weight: 700; color: #666; text-transform: uppercase; letter-spacing: 0.1em; }
                
                .meta-summary { display: grid; grid-template-cols: repeat(4, 1fr); gap: 20px; margin-bottom: 40px; background: #f8fafc; padding: 20px; border-radius: 16px; border: 1px solid #e2e8f0; }
                .meta-item { border-left: 2px solid #e2e8f0; padding-left: 15px; }
                .meta-label { font-size: 9px; font-weight: 900; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 4px; }
                .meta-value { font-size: 14px; font-weight: 800; color: #1e293b; }
                
                table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 13px; }
                th { background: #f1f5f9; padding: 12px 15px; text-align: left; font-weight: 900; color: #475569; text-transform: uppercase; font-size: 10px; letter-spacing: 0.1em; border-bottom: 2px solid #e2e8f0; }
                td { padding: 15px; border-bottom: 1px solid #f1f5f9; color: #334155; vertical-align: middle; }
                
                .footer { margin-top: 60px; border-top: 1px solid #eee; padding-top: 20px; text-align: center; }
                .footer-text { font-size: 10px; color: #94a3b8; display: flex; justify-content: center; align-items: center; gap: 20px; }
                
                .print-btn { position: fixed; bottom: 30px; right: 30px; padding: 12px 24px; background: #1a1a2e; color: white; border: none; border-radius: 12px; cursor: pointer; font-weight: 900; text-transform: uppercase; font-size: 12px; letter-spacing: 0.1em; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1); transition: all 0.2s; }
                .print-btn:hover { transform: translateY(-2px); box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1); background: #000; }
                
                @media print {
                    body { padding: 0; }
                    .print-btn { display: none; }
                }
            </style>
        </head>
        <body>
            <div class="header-container">
                <div class="logo-section">
                    <img src="/logo.png" alt="Rillcod Logo" class="logo" />
                    <div>
                        <div class="brand-title">Rillcod Technologies</div>
                        <div class="brand-subtitle">Technical Excellence</div>
                    </div>
                </div>
                <div class="doc-title">
                    <h1>Academic Report</h1>
                    <p>Official Performance Record</p>
                </div>
            </div>

            <div class="meta-summary">
                <div class="meta-item">
                    <div class="meta-label">Issued To</div>
                    <div class="meta-value">${profile?.full_name || 'Standard Report'}</div>
                </div>
                <div class="meta-item">
                    <div class="meta-label">System Role</div>
                    <div class="meta-value" style="text-transform: capitalize;">${isStaff ? 'Administrator View' : 'Student Record'}</div>
                </div>
                <div class="meta-item">
                    <div class="meta-label">Record Date</div>
                    <div class="meta-value">${today}</div>
                </div>
                <div class="meta-item">
                    <div class="meta-label">Verification</div>
                    <div class="meta-value">rillcod.com/verify</div>
                </div>
            </div>

            <table>
                <thead>
                    <tr>
                        ${isStaff ? '<th>Student Participant</th>' : ''}
                        <th>Assignment / Programme</th>
                        <th style="width: 100px;">Status</th>
                        <th style="text-align: center; width: 100px;">Score</th>
                        <th style="text-align: center; width: 80px;">%</th>
                        <th style="text-align: center; width: 80px;">Grade</th>
                    </tr>
                </thead>
                <tbody>
                    ${rowsHtml}
                    ${items.length === 0 ? '<tr><td colspan="6" style="text-align: center; padding: 60px; color: #94a3b8; font-weight: 700;">No academic records found for this period.</td></tr>' : ''}
                </tbody>
            </table>

            <div class="footer">
                <div class="footer-text">
                    <span>© Rillcod Technologies Limited</span>
                    <span>•</span>
                    <span>26 Ogiesoba Avenue, GRA, Benin City</span>
                    <span>•</span>
                    <span>08116600091</span>
                </div>
            </div>

            <button class="print-btn" onclick="window.print()">Print PDF Report</button>
        </body>
        </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
}

// ─── Main Page ────────────────────────────────────────────────
export default function GradesPage() {
    const { profile, loading: authLoading } = useAuth();

    const [items, setItems] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState('all');
    const [filterProgram, setFilterProgram] = useState('');
    const [filterCourse, setFilterCourse] = useState('');
    const [programs, setPrograms] = useState<any[]>([]);
    const [allCourses, setAllCourses] = useState<any[]>([]);
    const [sortBy, setSortBy] = useState<'date' | 'name' | 'grade'>('date');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
    const [grading, setGrading] = useState<any | null>(null);
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
    const [refreshKey, setRefreshKey] = useState(0);
    const [showSyncModal, setShowSyncModal] = useState(false);

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
                const db = createClient();
                const [subData, progData, courseData] = await Promise.all([
                    isStaff
                        ? fetchSubmissionsForGrading({
                            teacherId: role === 'teacher' ? profile?.id : undefined,
                            schoolId: role === 'school' ? profile?.school_id ?? undefined : undefined,
                            schoolName: role === 'school' ? profile?.school_name ?? undefined : undefined,
                        })
                        : fetchStudentGrades(profile?.id || ''),
                    db.from('programs').select('id, name').eq('is_active', true).order('name'),
                    db.from('courses').select('id, title, program_id').eq('is_active', true).order('title'),
                ]);
                if (!cancelled) {
                    setItems(subData);
                    setPrograms(progData.data ?? []);
                    setAllCourses(courseData.data ?? []);
                }
            } catch (e: any) {
                if (!cancelled) setError(e.message ?? 'Failed to load');
            } finally {
                if (!cancelled) setLoading(false);
            }
        }
        load();
        return () => { cancelled = true; };
    }, [profile?.id, isStaff, authLoading, refreshKey]); // eslint-disable-line

    // ── Optimistic update ──────────────────────────────────────
    const handleGraded = () => {
        setRefreshKey(prev => prev + 1);
    };

    // ── Toggle expand ──────────────────────────────────────────
    const toggleExpand = (id: string) => {
        setExpandedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    // Courses for the selected program filter
    const filteredCourseOptions = filterProgram
        ? allCourses.filter(c => c.program_id === filterProgram)
        : allCourses;

    // ── Sort + Filter ──────────────────────────────────────────
    const filtered = useMemo(() => {
        let list = items.filter((s: any) => {
            const title = s.assignments?.title ?? '';
            const student = s.portal_users?.full_name ?? '';
            const matches = (title + student).toLowerCase().includes(search.toLowerCase());
            if (!matches) return false;
            if (filter !== 'all' && s.status !== filter) return false;
            // Programme filter: match via course's program_id
            if (filterProgram) {
                const courseId = s.assignments?.course_id;
                const course = allCourses.find(c => c.id === courseId);
                if (course?.program_id !== filterProgram) return false;
            }
            // Course filter
            if (filterCourse && s.assignments?.course_id !== filterCourse) return false;
            return true;
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
    }, [items, search, filter, filterProgram, filterCourse, sortBy, sortDir, isStaff, allCourses]);

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
        <div className="min-h-screen bg-background text-foreground">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
                <div className="animate-pulse space-y-2">
                    <div className="h-4 bg-muted rounded w-32" />
                    <div className="h-8 bg-muted rounded w-64" />
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {[1, 2, 3, 4].map(i => <div key={i} className="bg-card shadow-sm border border-border rounded-none h-28 animate-pulse" />)}
                </div>
                <div className="space-y-3">
                    {[1, 2, 3, 4, 5].map(i => <div key={i} className="bg-card shadow-sm border border-border rounded-none h-20 animate-pulse" />)}
                </div>
            </div>
        </div>
    );

    if (!profile) return (
        <div className="min-h-screen bg-background flex items-center justify-center">
            <div className="text-center">
                <ClipboardDocumentCheckIcon className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground mb-4">Sign in to view grades</p>
                <Link href="/login" className="px-5 py-2 bg-primary text-foreground rounded-none text-sm font-bold">Sign In</Link>
            </div>
        </div>
    );

    return (
        <div className="min-h-screen bg-background text-foreground">
            {grading && <GradeModal sub={grading} onClose={() => setGrading(null)} onSaved={handleGraded} />}
            {showSyncModal && (
                <BatchSyncModal
                    programs={programs}
                    allCourses={allCourses}
                    onClose={() => setShowSyncModal(false)}
                    onSynced={handleGraded}
                />
            )}

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">

                {/* ── Assessment Tab Bar ── */}
                {isStaff && (
                    <div className="flex items-center gap-1 bg-card border border-border rounded-xl p-1 w-fit flex-wrap">
                        <span className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-black">
                            <ChartBarIcon className="w-4 h-4" /> Grades
                        </span>
                        <Link href="/dashboard/grading"
                            className="flex items-center gap-2 px-4 py-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 text-sm font-bold transition-all">
                            <ClipboardDocumentCheckIcon className="w-4 h-4" /> Grading Queue
                        </Link>
                        <Link href="/dashboard/grading-guide"
                            className="flex items-center gap-2 px-4 py-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 text-sm font-bold transition-all">
                            <DocumentTextIcon className="w-4 h-4" /> Grading Guide
                        </Link>
                    </div>
                )}

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
                        <p className="text-muted-foreground text-sm mt-1">
                            {isStaff ? 'Grade student work and track class performance' : 'Your scores, feedback and progress'}
                        </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                        {items.length > 0 && (
                            <>
                                <button onClick={() => exportPDF(items, isStaff, profile)}
                                    className="flex items-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary rounded-none text-sm font-bold text-foreground transition-all shadow-lg shadow-orange-900/20">
                                    <DocumentTextIcon className="w-4 h-4" />
                                    <span className="hidden sm:inline">Export PDF</span>
                                </button>
                                {isStaff && (
                                    <button onClick={() => setShowSyncModal(true)}
                                        className="hidden sm:flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 rounded-none text-sm font-bold text-foreground transition-all shadow-lg shadow-indigo-900/20 group">
                                        <SparklesIcon className="w-4 h-4 group-hover:scale-125 transition-transform" />
                                        Batch-Sync Reports
                                    </button>
                                )}
                                <button onClick={() => exportCSV(items, isStaff)}
                                    className="flex items-center gap-2 px-4 py-2.5 bg-card shadow-sm hover:bg-muted border border-border rounded-none text-sm font-bold text-muted-foreground hover:text-foreground transition-all">
                                    <ArrowDownTrayIcon className="w-4 h-4" />
                                    <span className="hidden sm:inline">Export CSV</span>
                                </button>
                            </>
                        )}
                    </div>
                </div>

                {/* ── Error ─────────────────────────────────────── */}
                {error && (
                    <div className="flex items-center gap-3 bg-rose-500/10 border border-rose-500/20 rounded-none p-4">
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
                            color: 'orange',
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
                            color: avgPct == null ? 'orange' : avgPct >= 70 ? 'emerald' : avgPct >= 50 ? 'amber' : 'rose',
                        },
                    ].map(s => (
                        <div key={s.label} className="bg-card shadow-sm border border-border rounded-none p-4 sm:p-5">
                            <div className="flex items-start justify-between mb-3">
                                <div className={`w-9 h-9 rounded-none flex items-center justify-center ${s.color === 'orange' ? 'bg-primary/10' :
                                        s.color === 'amber' ? 'bg-amber-500/10' :
                                            s.color === 'emerald' ? 'bg-emerald-500/10' :
                                                'bg-rose-500/10'
                                    }`}>
                                    <s.icon className={`w-4 h-4 ${colorClass(s.color, 'text')}`} />
                                </div>
                                {s.label === 'Graded' && totalItems > 0 && (
                                    <div className="text-xs text-muted-foreground">{Math.round((graded / totalItems) * 100)}%</div>
                                )}
                            </div>
                            <p className={`text-2xl font-extrabold ${colorClass(s.color, 'text')}`}>{s.value}</p>
                            <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
                            <p className="text-[10px] text-white/25 mt-0.5 truncate">{s.sub}</p>
                        </div>
                    ))}
                </div>

                {/* ── Pending alert (staff) ──────────────────────── */}
                {isStaff && pending > 0 && (
                    <div className="flex items-center gap-4 bg-amber-500/10 border border-amber-500/20 rounded-none p-4">
                        <ClockIcon className="w-5 h-5 text-amber-400 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                            <p className="font-bold text-amber-400 text-sm">{pending} submission{pending !== 1 ? 's' : ''} waiting to be graded</p>
                            <p className="text-xs text-muted-foreground mt-0.5 hidden sm:block">Click the pencil icon on any row to open the grade panel</p>
                        </div>
                        <button onClick={() => setFilter('submitted')}
                            className="px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 text-xs font-bold rounded-none transition-colors flex-shrink-0">
                            Show only
                        </button>
                    </div>
                )}

                {/* ── Top / Bottom performers (staff) ──────────────── */}
                {isStaff && (() => {
                    const graded = items.filter((s: any) => s.grade != null && s.assignments?.max_points);
                    if (graded.length < 2) return null;
                    const withPct = graded.map((s: any) => ({ ...s, _pct: Math.round((s.grade / s.assignments.max_points) * 100) }));
                    const top = withPct.reduce((a: any, b: any) => b._pct > a._pct ? b : a);
                    const bot = withPct.reduce((a: any, b: any) => b._pct < a._pct ? b : a);
                    const passRate = Math.round((withPct.filter((s: any) => s._pct >= 70).length / withPct.length) * 100);
                    return (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div className="bg-emerald-500/5 border border-emerald-500/20 p-4 flex items-center gap-3">
                                <TrophyIcon className="w-7 h-7 text-emerald-400 flex-shrink-0" />
                                <div className="min-w-0">
                                    <p className="text-[9px] font-black uppercase tracking-widest text-emerald-400 mb-0.5">Top Performer</p>
                                    <p className="text-sm font-black text-foreground truncate">{top.portal_users?.full_name ?? '—'}</p>
                                    <p className="text-xs text-emerald-400 font-bold">{top._pct}% · {pctInfo(top.grade, top.assignments.max_points).letter}</p>
                                </div>
                            </div>
                            <div className="bg-rose-500/5 border border-rose-500/20 p-4 flex items-center gap-3">
                                <FireIcon className="w-7 h-7 text-rose-400 flex-shrink-0" />
                                <div className="min-w-0">
                                    <p className="text-[9px] font-black uppercase tracking-widest text-rose-400 mb-0.5">Needs Attention</p>
                                    <p className="text-sm font-black text-foreground truncate">{bot.portal_users?.full_name ?? '—'}</p>
                                    <p className="text-xs text-rose-400 font-bold">{bot._pct}% · {pctInfo(bot.grade, bot.assignments.max_points).letter}</p>
                                </div>
                            </div>
                            <div className="bg-blue-500/5 border border-blue-500/20 p-4 flex items-center gap-3">
                                <BoltIcon className="w-7 h-7 text-blue-400 flex-shrink-0" />
                                <div className="min-w-0">
                                    <p className="text-[9px] font-black uppercase tracking-widest text-blue-400 mb-0.5">Pass Rate</p>
                                    <p className={`text-2xl font-black ${passRate >= 70 ? 'text-emerald-400' : passRate >= 50 ? 'text-amber-400' : 'text-rose-400'}`}>{passRate}%</p>
                                    <p className="text-xs text-muted-foreground">{withPct.filter((s: any) => s._pct >= 70).length}/{withPct.length} passed</p>
                                </div>
                            </div>
                        </div>
                    );
                })()}

                {/* ── Distribution (staff) ───────────────────────── */}
                {isStaff && items.some(s => s.grade != null) && <DistBar items={items} />}

                {/* ── Student summary cards ──────────────────────── */}
                {!isStaff && items.length > 0 && (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                        {/* GPA Card */}
                        <div className="lg:col-span-1 bg-gradient-to-br from-[#1a1a2e] to-[#252545] border border-border rounded-none p-6 flex flex-col items-center justify-center text-center">
                            {avgPct != null ? (
                                <>
                                    <GradeRing pct={avgPct} letter={pctInfo(avgPct, 100).letter} color={pctInfo(avgPct, 100).color} size="lg" />
                                    <p className="text-xs text-muted-foreground uppercase tracking-widest mt-4">Overall Average</p>
                                    <p className="text-muted-foreground text-sm mt-1">{pctInfo(avgPct, 100).label}</p>
                                    <p className="text-2xl font-black text-foreground mt-2">{avgPct}%</p>
                                </>
                            ) : (
                                <>
                                    <SparklesIcon className="w-10 h-10 text-muted-foreground mb-3" />
                                    <p className="text-muted-foreground text-sm">No grades yet</p>
                                </>
                            )}
                        </div>

                        {/* Course breakdown + weighted total */}
                        <div className="lg:col-span-2 space-y-4">
                            <CourseBreakdown items={items} />
                            {/* Weighted total summary */}
                            {(() => {
                                const weightedItems = items.filter(s => s.weighted_score != null && (s.assignments?.weight ?? 0) > 0);
                                if (weightedItems.length === 0) return null;
                                const totalEarned = weightedItems.reduce((a: number, s: any) => a + (s.weighted_score ?? 0), 0);
                                const totalPossible = weightedItems.reduce((a: number, s: any) => a + (s.assignments?.weight ?? 0), 0);
                                const pct = totalPossible > 0 ? Math.round((totalEarned / totalPossible) * 100) : 0;
                                return (
                                    <div className="bg-card shadow-sm border border-violet-500/20 rounded-none p-5 space-y-3">
                                        <p className="text-xs font-bold text-violet-400 uppercase tracking-widest">Weighted Grade Total</p>
                                        <div className="flex items-end gap-3">
                                            <span className="text-3xl font-black text-foreground">{totalEarned}</span>
                                            <span className="text-muted-foreground text-sm mb-0.5">/ {totalPossible} pts</span>
                                            <span className={`text-lg font-black ml-auto ${pct >= 70 ? 'text-emerald-400' : pct >= 50 ? 'text-amber-400' : 'text-rose-400'}`}>{pct}%</span>
                                        </div>
                                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                                            <div className={`h-full rounded-full transition-all duration-700 ${pct >= 70 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-rose-500'}`} style={{ width: `${pct}%` }} />
                                        </div>
                                        <p className="text-[10px] text-muted-foreground">{weightedItems.length} weighted assignment{weightedItems.length !== 1 ? 's' : ''} · contributes to report card score</p>
                                    </div>
                                );
                            })()}
                        </div>
                    </div>
                )}

                {/* ── Achievement badges (student) ───────────────── */}
                {!isStaff && items.length > 0 && <AchievementBadges items={items} />}

                {/* ── Filters + Sort ────────────────────────────── */}
                <div className="flex flex-col gap-2">
                    <div className="flex flex-col sm:flex-row gap-2">
                        <div className="relative flex-1">
                            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <input type="text"
                                placeholder={isStaff ? 'Search by assignment or student…' : 'Search assignments…'}
                                value={search} onChange={e => setSearch(e.target.value)}
                                className="w-full pl-10 pr-4 py-3 bg-card shadow-sm border border-border rounded-none text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-emerald-500 transition-colors"
                            />
                        </div>
                        {programs.length > 0 && (
                            <select value={filterProgram}
                                onChange={e => { setFilterProgram(e.target.value); setFilterCourse(''); }}
                                className="sm:w-48 px-3 py-3 bg-card shadow-sm border border-border rounded-none text-sm text-foreground focus:outline-none focus:border-emerald-500 cursor-pointer">
                                <option value="">All Programmes</option>
                                {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                        )}
                        {filterProgram && filteredCourseOptions.length > 0 && (
                            <select value={filterCourse} onChange={e => setFilterCourse(e.target.value)}
                                className="sm:w-48 px-3 py-3 bg-card shadow-sm border border-border rounded-none text-sm text-foreground focus:outline-none focus:border-emerald-500 cursor-pointer">
                                <option value="">All Courses</option>
                                {filteredCourseOptions.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                            </select>
                        )}
                    </div>
                    <div className="flex gap-2">
                        <select value={filter} onChange={e => setFilter(e.target.value)}
                            className="flex-1 sm:flex-none px-3 py-3 bg-card shadow-sm border border-border rounded-none text-sm text-foreground focus:outline-none focus:border-emerald-500 cursor-pointer">
                            <option value="all">All Status</option>
                            <option value="submitted">Submitted</option>
                            <option value="graded">Graded</option>
                            <option value="late">Late</option>
                            <option value="missing">Missing</option>
                        </select>
                        <button onClick={() => toggleSort('date')}
                            className={`px-3 py-3 rounded-none text-xs font-bold border transition-all flex items-center gap-1 ${sortBy === 'date' ? 'bg-emerald-600 border-emerald-600 text-foreground' : 'bg-card shadow-sm border-border text-muted-foreground hover:text-foreground'}`}>
                            <ArrowsUpDownIcon className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Date</span>
                        </button>
                        <button onClick={() => toggleSort('grade')}
                            className={`px-3 py-3 rounded-none text-xs font-bold border transition-all flex items-center gap-1 ${sortBy === 'grade' ? 'bg-emerald-600 border-emerald-600 text-foreground' : 'bg-card shadow-sm border-border text-muted-foreground hover:text-foreground'}`}>
                            <ChartBarIcon className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Grade</span>
                        </button>
                    </div>
                </div>

                {/* Count row */}
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{filtered.length} of {totalItems} shown</span>
                    {missing > 0 && !isStaff && (
                        <span className="text-rose-400 font-bold">{missing} missing assignment{missing !== 1 ? 's' : ''}</span>
                    )}
                </div>

                {/* ── Empty state ────────────────────────────────── */}
                {filtered.length === 0 && !error && (
                    <div className="text-center py-20 bg-card shadow-sm border border-border rounded-none">
                        <ClipboardDocumentCheckIcon className="w-14 h-14 mx-auto text-muted-foreground mb-4" />
                        <p className="text-lg font-semibold text-muted-foreground">No submissions found</p>
                        <p className="text-sm text-muted-foreground mt-1">
                            {search || filter !== 'all' || filterProgram || filterCourse ? 'Try clearing your filters.' : isStaff ? 'No students have submitted yet.' : 'No assignments yet.'}
                        </p>
                        {(search || filter !== 'all' || filterProgram || filterCourse) && (
                            <button onClick={() => { setSearch(''); setFilter('all'); setFilterProgram(''); setFilterCourse(''); }}
                                className="mt-4 px-4 py-2 bg-muted hover:bg-muted rounded-none text-sm font-bold text-muted-foreground transition-colors">
                                Clear Filters
                            </button>
                        )}
                    </div>
                )}

                {/* ══ STAFF LIST ═══════════════════════════════════ */}
                {isStaff && filtered.length > 0 && (
                    <div className="bg-card shadow-sm border border-border rounded-none overflow-hidden">
                        {/* Table header (desktop) */}
                        <div className="hidden lg:grid grid-cols-[2fr_2fr_1fr_1fr_80px] gap-4 px-5 py-3 border-b border-border text-xs font-bold text-muted-foreground uppercase tracking-wider">
                            <button onClick={() => toggleSort('name')} className="flex items-center gap-1 hover:text-foreground transition-colors text-left">
                                Student / Assignment <ArrowsUpDownIcon className="w-3 h-3" />
                            </button>
                            <span>Course</span>
                            <span>Status</span>
                            <button onClick={() => toggleSort('grade')} className="flex items-center gap-1 hover:text-foreground transition-colors">
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
                                            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary from-primary to-primary flex items-center justify-center text-sm font-black text-foreground flex-shrink-0">
                                                {(s.portal_users?.full_name ?? '?')[0]}
                                            </div>

                                            {/* Info */}
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap mb-0.5">
                                                    <span className="font-semibold text-foreground text-sm">{s.assignments?.title ?? '—'}</span>
                                                    <Badge status={s.status} />
                                                </div>
                                                <p className="text-xs text-muted-foreground truncate">
                                                    {s.portal_users?.full_name ?? 'Unknown'}
                                                    {s.assignments?.courses?.title ? ` · ${s.assignments.courses.title}` : ''}
                                                </p>
                                                {s.submitted_at && (
                                                    <p className="text-xs text-muted-foreground mt-0.5 hidden sm:flex items-center gap-1">
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
                                                    <span className="text-muted-foreground text-xs">—</span>
                                                )}
                                            </div>

                                            {/* Expand (mobile only) */}
                                            {s.submission_text && (
                                                <button onClick={() => toggleExpand(s.id)}
                                                    className="p-2 text-muted-foreground hover:text-foreground transition-colors flex-shrink-0 sm:hidden">
                                                    {expanded ? <ChevronUpIcon className="w-4 h-4" /> : <ChevronDownIcon className="w-4 h-4" />}
                                                </button>
                                            )}

                                            {/* Grade button */}
                                            {canGrade ? (
                                                <button onClick={() => setGrading(s)}
                                                    className={`p-2.5 rounded-none transition-all flex-shrink-0 ${s.status === 'submitted' || s.status === 'late'
                                                            ? 'bg-emerald-600 hover:bg-emerald-500 text-foreground'
                                                            : 'bg-card shadow-sm hover:bg-muted text-muted-foreground opacity-0 group-hover:opacity-100'
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
                                                <div className="bg-card shadow-sm border border-border rounded-none p-3 max-h-32 overflow-y-auto">
                                                    <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5">Student work</p>
                                                    <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">{s.submission_text}</p>
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
                                    className={`bg-card shadow-sm border rounded-none overflow-hidden transition-all ${s.status === 'graded' ? 'border-emerald-500/20' :
                                            s.status === 'missing' ? 'border-rose-500/20' : 'border-border'
                                        }`}>
                                    {/* Top progress strip */}
                                    {info && (
                                        <div className="h-1 bg-card shadow-sm">
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
                                                    <div className="w-14 h-14 rounded-full border-2 border-border flex items-center justify-center">
                                                        <span className="text-muted-foreground text-xs font-bold">—</span>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Content */}
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap mb-1">
                                                    <h4 className="font-bold text-foreground text-sm sm:text-base leading-tight">
                                                        {s.assignments?.title ?? 'Assignment'}
                                                    </h4>
                                                    <Badge status={s.status} />
                                                </div>
                                                <p className="text-xs text-muted-foreground truncate">
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
                                                    <div className="flex items-center gap-3 mt-2 flex-wrap">
                                                        <span className={`text-xs font-bold ${colorClass(info.color, 'text')}`}>{info.pct}% · {info.label}</span>
                                                        <span className="text-xs text-muted-foreground">{s.grade}/{max} pts</span>
                                                        {s.weighted_score != null && (s.assignments?.weight ?? 0) > 0 && (
                                                            <span className="text-[10px] font-black text-violet-400 bg-violet-500/10 border border-violet-500/20 px-2 py-0.5 rounded-full">
                                                                {s.weighted_score}/{s.assignments.weight} weighted
                                                            </span>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Feedback */}
                                        {s.feedback && (
                                            <div className="mt-3">
                                                <button onClick={() => toggleExpand(s.id)}
                                                    className="w-full text-left flex items-center justify-between px-3 py-2 bg-card shadow-sm border border-border rounded-none text-xs text-muted-foreground hover:text-muted-foreground transition-colors">
                                                    <span className="flex items-center gap-1.5">
                                                        <AcademicCapIcon className="w-3.5 h-3.5" />
                                                        Teacher Feedback
                                                    </span>
                                                    {expanded ? <ChevronUpIcon className="w-3.5 h-3.5" /> : <ChevronDownIcon className="w-3.5 h-3.5" />}
                                                </button>
                                                {expanded && (
                                                    <div className="mt-2 px-3 py-3 bg-emerald-500/5 border border-emerald-500/20 rounded-none">
                                                        <p className="text-sm text-muted-foreground leading-relaxed">{s.feedback}</p>
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

