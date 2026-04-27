// @refresh reset
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import { SyntaxHighlight } from '@/components/ui/SyntaxHighlight';
import ActivityInstructions from '@/components/activities/ActivityInstructions';
import {
    ArrowLeftIcon, CheckIcon, ArrowPathIcon, ExclamationTriangleIcon,
    CheckCircleIcon, PencilSquareIcon, ChevronDownIcon, ChevronUpIcon,
    BoltIcon, RocketLaunchIcon, ClipboardDocumentListIcon,
    DocumentTextIcon, UserGroupIcon, ClockIcon, StarIcon,
    CodeBracketIcon, EyeIcon, XMarkIcon, PaperClipIcon, TrashIcon, SparklesIcon,
} from '@/lib/icons';

const IntegratedCodeRunner = dynamic(
    () => import('@/components/studio/IntegratedCodeRunner'),
    { ssr: false, loading: () => <div className="flex-1 bg-black/40 flex items-center justify-center"><ArrowPathIcon className="w-6 h-6 text-primary animate-spin" /></div> }
);

// ── helpers ───────────────────────────────────────────────────────────────────

function autoGradeSubmission(answers: any, submissionText: string, fileUrl: string): number {
    let score = 0;
    if ((answers?.links || []).some((l: string) => l?.startsWith('http'))) score += 25;
    if ((answers?.code || answers?.playground_code || '').trim().length > 50) score += 25;
    if (fileUrl || answers?.screenshot_url) score += 25;
    if ((submissionText || answers?.text_explanation || '').trim().length > 30) score += 25;
    return Math.min(100, score);
}

const LABEL = 'block text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mb-1.5';
const INPUT  = 'w-full px-4 py-2.5 bg-white/5 border border-white/10 text-sm text-white placeholder-white/20 focus:outline-none focus:border-primary transition-colors';
const TEXTAREA = `${INPUT} resize-none`;

function StatusBadge({ status, grade }: { status: string; grade?: number | null }) {
    if (status === 'graded') return (
        <span className="px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-black uppercase">
            Graded {grade != null ? `· ${grade}%` : ''}
        </span>
    );
    if (status === 'submitted') return (
        <span className="px-2 py-0.5 bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[10px] font-black uppercase">Submitted</span>
    );
    return <span className="px-2 py-0.5 bg-white/5 border border-white/10 text-white/30 text-[10px] font-black uppercase">Not Submitted</span>;
}

// Parse AI response into parts: text | code-block

// Language detected from category
function detectLang(category: string): 'html' | 'javascript' | 'python' | 'robotics' {
    if (category === 'web' || category === 'design') return 'html';
    if (category === 'ai' || category === 'hardware') return 'python';
    return 'javascript';
}

function pctInfo(grade: number, max: number) {
    const pct = Math.round((grade / max) * 100);
    const letter = pct >= 90 ? 'A' : pct >= 80 ? 'B' : pct >= 70 ? 'C' : pct >= 60 ? 'D' : 'F';
    const color = pct >= 70 ? 'emerald' : pct >= 50 ? 'amber' : 'rose';
    return { pct, letter, color };
}

function ProjectGradeCanvas({ sub, activity, assignmentId, onClose, onSaved }: {
    sub: any;
    activity: any;
    assignmentId: string;
    onClose: () => void;
    onSaved: () => void;
}) {
    const max = activity?.max_points ?? 100;
    const answers = sub.answers || {};
    const deliverables: string[] = Array.isArray(activity?.metadata?.deliverables) ? activity.metadata.deliverables : [];
    const rubric: any[] = Array.isArray(activity?.metadata?.rubric) ? activity.metadata.rubric : [];

    const [grade, setGrade] = useState<string>(sub.grade?.toString() ?? '');
    const [feedback, setFb] = useState<string>(sub.feedback ?? '');
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState('');
    const [lightbox, setLightbox] = useState<string | null>(null);
    const [briefOpen, setBriefOpen] = useState(false);
    const [rubricScores, setRubricScores] = useState<Record<number, number>>({});
    const [filePreviewOpen, setFilePreviewOpen] = useState(false);

    const rubricTotal = Object.values(rubricScores).reduce((a, b) => a + b, 0);
    const handleRubricScore = (idx: number, val: number) => {
        const updated = { ...rubricScores, [idx]: val };
        setRubricScores(updated);
        const total = Object.values(updated).reduce((a, b) => a + b, 0);
        setGrade(String(Math.min(total, max)));
    };

    const info = grade ? pctInfo(Number(grade), max) : null;
    const autoEst = autoGradeSubmission(answers, sub.submission_text || '', sub.file_url || '');
    const isImage = sub.file_url && /\.(png|jpe?g|gif|webp|bmp|heic)(\?|$)/i.test(sub.file_url.split('?')[0]);
    const screenshotUrl = answers.screenshot_url;

    const save = async () => {
        const g = Number(grade);
        if (grade !== '' && (isNaN(g) || g < 0 || g > max)) { setErr(`Enter 0–${max}`); return; }
        setSaving(true); setErr('');
        try {
            const res = await fetch(`/api/assignments/${assignmentId}/grade`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ submission_id: sub.id, grade: grade === '' ? null : g, feedback, status: 'graded' }),
            });
            if (!res.ok) throw new Error('Grading failed');
            onSaved();
        } catch (e: any) {
            setErr(e.message ?? 'Failed to save');
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 bg-[#0f0f1a] flex flex-col">
            {/* Image lightbox */}
            {lightbox && (
                <div className="fixed inset-0 z-[60] bg-black/95 flex items-center justify-center" onClick={() => setLightbox(null)}>
                    <button onClick={() => setLightbox(null)}
                        className="absolute top-4 right-4 flex items-center gap-2 px-4 py-2.5 bg-white/10 hover:bg-white/20 border border-white/20 rounded-full text-white text-sm font-bold transition-colors backdrop-blur-sm">
                        <XMarkIcon className="w-5 h-5" /> Close
                    </button>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={lightbox} alt="Submission" className="max-w-[90vw] max-h-[85vh] object-contain rounded-lg shadow-2xl"
                        onClick={e => e.stopPropagation()} />
                </div>
            )}

            {/* File preview canvas panel */}
            {filePreviewOpen && sub.file_url && (
                <div className="fixed inset-0 z-[60] flex">
                    <div className="flex-1 bg-black/60 backdrop-blur-sm" onClick={() => setFilePreviewOpen(false)} />
                    <div className="w-full max-w-2xl bg-[#0d0d1a] border-l border-white/10 flex flex-col shadow-2xl">
                        <div className="flex items-center gap-3 px-5 py-3.5 border-b border-white/10 bg-[#0B132B] flex-shrink-0">
                            <PaperClipIcon className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                            <p className="text-sm font-bold text-white flex-1 truncate">Attached File</p>
                            <a href={sub.file_url} target="_blank" rel="noopener noreferrer"
                                className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-black text-cyan-400 uppercase tracking-widest bg-cyan-500/10 border border-cyan-500/20 hover:bg-cyan-500/20 transition-all rounded-lg">
                                Open in Tab
                            </a>
                            <button onClick={() => setFilePreviewOpen(false)}
                                className="w-8 h-8 flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 rounded-lg transition-colors">
                                <XMarkIcon className="w-4 h-4" />
                            </button>
                        </div>
                        <div className="flex-1 min-h-0 bg-card">
                            <iframe src={sub.file_url} title="Submitted file" className="w-full h-full border-0" allow="fullscreen" />
                        </div>
                    </div>
                </div>
            )}

            {/* Top bar */}
            <div className="flex-shrink-0 flex items-center gap-3 px-4 py-3 border-b border-white/10 bg-[#0B132B] shadow-lg">
                <button onClick={onClose}
                    className="flex items-center gap-2 px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-sm text-white font-semibold transition-colors flex-shrink-0">
                    <ArrowLeftIcon className="w-4 h-4" />
                    <span className="hidden sm:inline">All Submissions</span>
                </button>
                <div className="h-5 w-px bg-white/10 flex-shrink-0" />
                <div className="flex items-center gap-2 flex-1 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-primary flex items-center justify-center text-sm font-black text-white flex-shrink-0">
                        {(sub.portal_users?.full_name ?? '?')[0]}
                    </div>
                    <div className="min-w-0">
                        <p className="text-sm font-bold text-white leading-tight truncate">{sub.portal_users?.full_name ?? 'Student'}</p>
                        <p className="text-[10px] text-white/40 hidden sm:block truncate">{activity?.title}</p>
                    </div>
                </div>
                {err && <p className="text-xs text-rose-400 hidden md:block max-w-[120px] truncate">{err}</p>}
                <button onClick={save} disabled={saving}
                    className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white font-bold rounded-lg text-sm transition-all flex-shrink-0">
                    {saving ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : <CheckIcon className="w-4 h-4" />}
                    <span className="hidden sm:inline">{saving ? 'Saving…' : 'Save Grade'}</span>
                </button>
            </div>

            {/* Split body */}
            <div className="flex flex-1 min-h-0 overflow-hidden">

                {/* LEFT: Activity brief (desktop only) */}
                <div className="hidden md:flex flex-col w-2/5 border-r border-white/8 overflow-y-auto bg-[#161628]">
                    <div className="p-5 border-b border-white/8">
                        <span className="text-[10px] font-black text-primary uppercase tracking-widest">Project</span>
                        <h2 className="text-base font-extrabold text-white mt-1 leading-snug">{activity?.title}</h2>
                        <div className="flex items-center gap-3 mt-2 text-xs text-white/30">
                            <span>{max} pts max</span>
                            <span>Auto-score: <span className="text-amber-400 font-bold">{autoEst}%</span></span>
                        </div>
                    </div>
                    {activity?.instructions && (
                        <div className="p-5 border-b border-white/8">
                            <p className="text-[10px] font-black text-white/30 uppercase tracking-widest mb-2">Instructions</p>
                            <p className="text-sm text-white/60 leading-relaxed whitespace-pre-wrap">{activity.instructions}</p>
                        </div>
                    )}
                    {deliverables.length > 0 && (
                        <div className="p-5 border-b border-white/8 space-y-2">
                            <p className="text-[10px] font-black text-white/30 uppercase tracking-widest">Deliverables</p>
                            {deliverables.map((d, i) => (
                                <div key={i} className="flex items-start gap-2 text-xs text-white/60">
                                    <span className="text-primary font-bold flex-shrink-0 mt-0.5">{i + 1}.</span>
                                    <span>{d}</span>
                                </div>
                            ))}
                        </div>
                    )}
                    {rubric.length > 0 && (
                        <div className="p-5 space-y-2">
                            <p className="text-[10px] font-black text-amber-400 uppercase tracking-widest mb-3">Grading Rubric</p>
                            {rubric.map((r: any, i: number) => (
                                <div key={i} className="flex items-start justify-between gap-3 py-2.5 border-b border-white/5 last:border-0">
                                    <div className="min-w-0">
                                        <p className="text-xs font-bold text-white leading-snug">{r.criterion}</p>
                                        {r.description && <p className="text-[10px] text-white/35 mt-0.5">{r.description}</p>}
                                    </div>
                                    <span className="text-xs font-black text-amber-400 flex-shrink-0">{r.maxPoints}pt</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* RIGHT: Submission + grading */}
                <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-5">

                    {/* Mobile-only brief */}
                    <div className="md:hidden border border-white/10 rounded-xl overflow-hidden">
                        <button onClick={() => setBriefOpen(o => !o)}
                            className="w-full flex items-center justify-between px-4 py-3 bg-white/3 hover:bg-white/5 transition-colors text-left">
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] font-black text-primary uppercase tracking-widest">Project Brief</span>
                                <span className="text-[10px] text-white/30">— {briefOpen ? 'hide' : 'view'}</span>
                            </div>
                            <ChevronDownIcon className={`w-4 h-4 text-white/30 flex-shrink-0 transition-transform ${briefOpen ? 'rotate-180' : ''}`} />
                        </button>
                        {briefOpen && (
                            <div className="px-4 pb-4 pt-3 space-y-4 bg-white/2">
                                <p className="text-sm font-bold text-white">{activity?.title}</p>
                                {activity?.instructions && (
                                    <p className="text-xs text-white/60 leading-relaxed whitespace-pre-wrap">{activity.instructions}</p>
                                )}
                                {deliverables.length > 0 && (
                                    <div className="space-y-1">
                                        <p className="text-[10px] font-black text-white/30 uppercase tracking-widest">Deliverables</p>
                                        {deliverables.map((d, i) => (
                                            <p key={i} className="text-xs text-white/55"><span className="text-primary font-bold">{i+1}.</span> {d}</p>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Auto-grade estimate */}
                    <div className="flex items-center gap-3 px-4 py-3 bg-amber-500/5 border border-amber-500/20 rounded-xl">
                        <BoltIcon className="w-4 h-4 text-amber-400 flex-shrink-0" />
                        <div className="flex-1">
                            <p className="text-[10px] font-black text-amber-400 uppercase tracking-widest">Auto-grade Estimate</p>
                            <p className="text-xs text-white/50 mt-0.5">Based on completeness of submission components</p>
                        </div>
                        <span className="text-2xl font-black text-amber-400">{autoEst}%</span>
                    </div>

                    {/* Submitted links */}
                    {answers.links && answers.links.some((l: string) => l?.startsWith('http')) && (
                        <div className="bg-white/3 border border-white/8 rounded-xl p-4 space-y-2">
                            <p className="text-[10px] font-black text-white/30 uppercase tracking-widest">Project Links</p>
                            {(answers.links as string[]).filter(l => l?.startsWith('http')).map((l, i) => (
                                <a key={i} href={l} target="_blank" rel="noreferrer"
                                    className="flex items-center gap-2 text-sm text-cyan-400 hover:text-cyan-300 transition-colors truncate">
                                    <PaperClipIcon className="w-3.5 h-3.5 flex-shrink-0" /> {l}
                                </a>
                            ))}
                        </div>
                    )}

                    {/* Code */}
                    {(answers.code || answers.playground_code) && (
                        <div className="bg-black/40 border border-white/8 rounded-xl overflow-hidden">
                            <div className="px-4 py-2.5 border-b border-white/8">
                                <p className="text-[10px] font-black text-white/30 uppercase tracking-widest">Submitted Code</p>
                            </div>
                            <div className="p-4 max-h-64 overflow-y-auto">
                                <SyntaxHighlight code={answers.code || answers.playground_code} language="javascript" />
                            </div>
                        </div>
                    )}

                    {/* Screenshot — thumbnail, click to open lightbox */}
                    {screenshotUrl && (
                        <div className="space-y-2">
                            <p className="text-[10px] font-black text-white/30 uppercase tracking-widest">Screenshot</p>
                            <div className="relative inline-block cursor-zoom-in group" onClick={() => setLightbox(screenshotUrl)}>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={screenshotUrl} alt="Screenshot"
                                    className="h-36 w-auto max-w-full object-cover rounded-xl border border-white/10 group-hover:border-primary/40 transition-colors" />
                                <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 rounded-xl transition-all">
                                    <span className="opacity-0 group-hover:opacity-100 text-[10px] font-black text-white uppercase tracking-widest transition-opacity">Click to enlarge</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Photo upload — thumbnail, click to open lightbox */}
                    {isImage && (
                        <div className="space-y-2">
                            <p className="text-[10px] font-black text-white/30 uppercase tracking-widest">Submitted Photo</p>
                            <div className="relative inline-block cursor-zoom-in group" onClick={() => setLightbox(sub.file_url)}>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={sub.file_url} alt="Submission"
                                    className="h-36 w-auto max-w-full object-cover rounded-xl border border-white/10 group-hover:border-primary/40 transition-colors" />
                                <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 rounded-xl transition-all">
                                    <span className="opacity-0 group-hover:opacity-100 text-[10px] font-black text-white uppercase tracking-widest transition-opacity">Click to enlarge</span>
                                </div>
                            </div>
                        </div>
                    )}
                    {sub.file_url && !isImage && (
                        <div className="border border-primary/20 bg-primary/5 rounded-xl overflow-hidden">
                            <div className="flex items-center gap-3 px-4 py-3">
                                <PaperClipIcon className="w-4 h-4 text-primary flex-shrink-0" />
                                <p className="text-sm text-blue-300 font-semibold flex-1 truncate">
                                    {sub.file_url.split('/').pop()?.split('?')[0] || 'Attached File'}
                                </p>
                                <button type="button" onClick={() => setFilePreviewOpen(true)}
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-black text-primary uppercase tracking-widest bg-primary/10 border border-primary/20 hover:bg-primary/20 transition-all rounded-lg flex-shrink-0">
                                    View File
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Written explanation */}
                    {(sub.submission_text || answers.text_explanation) && (
                        <div className="bg-white/3 border border-white/8 rounded-xl p-4 space-y-2">
                            <p className="text-[10px] font-black text-white/30 uppercase tracking-widest">Written Explanation</p>
                            <p className="text-sm text-white/70 leading-relaxed whitespace-pre-line">{sub.submission_text || answers.text_explanation}</p>
                        </div>
                    )}

                    {/* Rubric scoring */}
                    {rubric.length > 0 && (
                        <div className="border border-amber-500/20 bg-amber-500/5 rounded-xl p-4 space-y-3">
                            <div className="flex items-center justify-between">
                                <p className="text-[10px] font-black text-amber-400 uppercase tracking-widest">Rubric Scoring</p>
                                <span className="text-xs text-amber-400 font-bold">Total: {rubricTotal} / {max}</span>
                            </div>
                            {rubric.map((r: any, ri: number) => (
                                <div key={ri} className="flex items-center gap-3">
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs font-bold text-white leading-snug">{r.criterion}</p>
                                        {r.description && <p className="text-[10px] text-white/35 mt-0.5 truncate">{r.description}</p>}
                                    </div>
                                    <div className="flex items-center gap-1.5 flex-shrink-0">
                                        <input type="number" min={0} max={r.maxPoints}
                                            value={rubricScores[ri] ?? ''}
                                            onChange={e => handleRubricScore(ri, Math.min(parseInt(e.target.value) || 0, r.maxPoints))}
                                            className="w-14 px-2 py-1.5 bg-black/30 border border-amber-500/30 rounded-lg text-xs text-center text-white font-bold focus:outline-none focus:border-amber-500" />
                                        <span className="text-[10px] text-white/30">/{r.maxPoints}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Score + grade bar */}
                    <div className="bg-white/3 border border-white/8 rounded-xl p-4 space-y-3">
                        <p className="text-[10px] font-black text-white/30 uppercase tracking-widest">Grade (0–{max} points)</p>
                        <div className="flex items-center gap-4">
                            <input type="number" min={0} max={max} value={grade}
                                onChange={e => { setGrade(e.target.value); setErr(''); }}
                                className="w-28 px-4 py-3 bg-black/30 border border-white/10 rounded-xl text-white text-2xl font-black text-center focus:outline-none focus:border-emerald-500 transition-colors"
                                placeholder="0" />
                            <div className="flex-1">
                                <div className="h-2.5 bg-black/30 rounded-full overflow-hidden mb-2">
                                    <div style={{ width: `${Math.min(info?.pct ?? 0, 100)}%` }}
                                        className={`h-2.5 rounded-full transition-all duration-500 ${info?.color === 'emerald' ? 'bg-emerald-500' : info?.color === 'amber' ? 'bg-amber-500' : 'bg-rose-500'}`} />
                                </div>
                                {info ? (
                                    <div className={`flex items-baseline gap-2 ${info.color === 'emerald' ? 'text-emerald-400' : info.color === 'amber' ? 'text-amber-400' : 'text-rose-400'}`}>
                                        <span className="text-3xl font-black">{info.letter}</span>
                                        <span className="text-base font-bold">{info.pct}%</span>
                                    </div>
                                ) : <p className="text-xs text-white/20">Enter score above</p>}
                            </div>
                        </div>
                    </div>

                    {/* Feedback */}
                    <div className="bg-white/3 border border-white/8 rounded-xl p-4 space-y-2">
                        <p className="text-[10px] font-black text-white/30 uppercase tracking-widest">Feedback for Student</p>
                        <textarea value={feedback} rows={4} onChange={e => setFb(e.target.value)}
                            placeholder="Write constructive feedback that helps this student improve…"
                            className="w-full bg-transparent text-sm text-white/80 placeholder:text-white/20 focus:outline-none resize-none leading-relaxed" />
                    </div>

                    {err && (
                        <div className="flex items-center gap-2 p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl">
                            <ExclamationTriangleIcon className="w-4 h-4 text-rose-400 flex-shrink-0" />
                            <p className="text-sm text-rose-400 font-semibold">{err}</p>
                        </div>
                    )}

                    {/* Mobile save */}
                    <div className="md:hidden pb-8">
                        <button onClick={save} disabled={saving}
                            className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white font-bold rounded-xl text-sm transition-all">
                            {saving ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : <CheckIcon className="w-4 h-4" />}
                            {saving ? 'Saving…' : 'Save Grade'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function ProjectBuilderPage() {
    const { id } = useParams<{ id: string }>();
    const { profile, loading: authLoading } = useAuth();
    const role      = profile?.role;
    const isStaff   = role === 'admin' || role === 'teacher';
    const isStudent = role === 'student';

    // data
    const [activity, setActivity]         = useState<any>(null);
    const [mySubmission, setMySubmission]  = useState<any>(null);
    const [myGroupTask, setMyGroupTask]    = useState<string | null>(null);
    const [myGroup, setMyGroup]            = useState<any | null>(null);
    const [activityGroups, setActivityGroups] = useState<any[]>([]);
    const [loading, setLoading]            = useState(true);
    const [error, setError]                = useState('');
    const [successMsg, setSuccessMsg]      = useState('');

    // builder state
    const [editorCode, setEditorCode]      = useState('');
    const [editorLang, setEditorLang]      = useState<'html'|'javascript'|'python'|'robotics'>('javascript');
    const [activeTab, setActiveTab]        = useState<'code'|'preview'|'submit'>('code');
    const [briefOpen, setBriefOpen]        = useState(true);

    // submission extra fields
    const [links, setLinks]                = useState<string[]>(['']);
    const [fileUrl, setFileUrl]            = useState('');
    const [screenshotUrl, setScreenshotUrl]= useState('');
    const [textExplanation, setTextExplanation] = useState('');
    const [submitting, setSubmitting]      = useState(false);
    const [capturing, setCapturing]        = useState(false);

    // (AI builder removed — students learn independently)

    // teacher grading — uses ProjectGradeCanvas
    const [gradingSubmission, setGradingSubmission] = useState<any | null>(null);
    const [expandedSub, setExpandedSub]    = useState<string | null>(null);

    // edit activity
    const [editMode, setEditMode]          = useState(false);
    const [editTitle, setEditTitle]        = useState('');
    const [editDesc, setEditDesc]          = useState('');
    const [editInstructions, setEditInstructions] = useState('');
    const [editDueDate, setEditDueDate]    = useState('');
    const [editPoints, setEditPoints]      = useState('');
    const [savingEdit, setSavingEdit]      = useState(false);

    // ── Load ─────────────────────────────────────────────────────────────────

    const loadActivity = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/assignments/${id}`, { cache: 'no-store' });
            const j   = await res.json();
            if (!res.ok) throw new Error(j.error || 'Failed to load');
            setActivity(j.data);

            const cat = j.data?.metadata?.category || 'coding';
            setEditorLang(detectLang(cat));

            if (isStudent && profile?.id) {
                const myRes = await fetch(`/api/assignments/${id}/student`, { cache: 'no-store' });
                const myJ   = await myRes.json();
                if (myJ.data) {
                    const sub = myJ.data;
                    setMySubmission(sub);
                    const ans = sub.answers || {};
                    setLinks(ans.links?.length ? ans.links : ['']);
                    setEditorCode(ans.code || ans.playground_code || '');
                    setFileUrl(sub.file_url || '');
                    setScreenshotUrl(ans.screenshot_url || '');
                    setTextExplanation(sub.submission_text || ans.text_explanation || '');
                }

                // Load group data (student: finds own group; staff: loads all groups)
                try {
                    const grRes = await fetch(`/api/project-groups?assignment_id=${id}`, { cache: 'no-store' });
                    const grJ   = await grRes.json();
                    if (grJ.groups && profile?.id) {
                        for (const grp of grJ.groups) {
                            const member = (grp.project_group_members || []).find(
                                (m: any) => m.student_id === profile.id
                            );
                            if (member) {
                                setMyGroup(grp);
                                setMyGroupTask(member.task_description || null);
                                break;
                            }
                        }
                    }
                } catch { /* optional */ }
            } else {
                // Staff: load all groups for this activity
                try {
                    const grRes = await fetch(`/api/project-groups?assignment_id=${id}`, { cache: 'no-store' });
                    const grJ   = await grRes.json();
                    setActivityGroups(grJ.groups || []);
                } catch { /* optional */ }
            }
        } catch (err: any) { setError(err.message); }
        finally { setLoading(false); }
    }, [id, isStudent, profile?.id]);  

    useEffect(() => {
        if (!authLoading && profile) loadActivity();
    }, [authLoading, profile?.id]); // eslint-disable-line

    // ── Playground capture ───────────────────────────────────────────────────

    async function capturePlayground() {
        if (!profile?.id) return;
        setCapturing(true);
        try {
            const db = createClient();
            const { data } = await db.from('lab_projects').select('title, code, language')
                .eq('user_id', profile.id).order('updated_at', { ascending: false }).limit(1).maybeSingle();
            if (data?.code) {
                setEditorCode(`// From: ${data.title || 'My Lab Project'} (${data.language})\n${data.code}`);
                setSuccessMsg('Playground code captured!');
                setTimeout(() => setSuccessMsg(''), 3000);
                setActiveTab('code');
            } else { setError('No saved lab project found'); }
        } catch { setError('Failed to capture playground code'); }
        finally { setCapturing(false); }
    }

    // ── Student submit ────────────────────────────────────────────────────────

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        const meta  = activity?.metadata || {};
        const types: string[] = meta.submission_types || ['link', 'code', 'text'];

        const answers: any = {};
        if (types.includes('link'))       answers.links = links.filter(l => l.trim());
        if (types.includes('code') || editorCode.trim()) {
            answers.code = editorCode;
            answers.playground_code = editorCode;
        }
        if (types.includes('screenshot')) answers.screenshot_url = screenshotUrl;
        if (types.includes('text'))       answers.text_explanation = textExplanation;

        const submissionText = types.includes('text') ? textExplanation : '';
        const fUrl           = types.includes('file') ? fileUrl : '';
        const autoGrade      = meta.auto_grade === true;
        const autoScore      = autoGrade ? autoGradeSubmission(answers, submissionText, fUrl) : null;

        setSubmitting(true);
        setError('');
        try {
            const res = await fetch(`/api/assignments/${id}/submit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ portal_user_id: profile?.id, submission_text: submissionText, file_url: fUrl, answers }),
            });
            const j = await res.json();
            if (!res.ok) throw new Error(j.error || 'Submission failed');

            if (autoGrade && autoScore !== null) {
                await fetch(`/api/assignments/${id}/grade`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ submission_id: j.data.id, grade: autoScore, feedback: `Auto-graded: ${autoScore}/100`, status: 'graded' }),
                });
            }

            setSuccessMsg(autoGrade ? `Submitted & auto-graded: ${autoScore}/100! 🎉` : 'Work submitted! Awaiting teacher review.');
            loadActivity();
        } catch (err: any) { setError(err.message); }
        finally { setSubmitting(false); }
    }

    // ── Teacher grade — handled by ProjectGradeCanvas ────────────────────────

    // ── Edit activity ─────────────────────────────────────────────────────────

    function openEdit() {
        setEditTitle(activity.title || '');
        setEditDesc(activity.description || '');
        setEditInstructions(activity.instructions || '');
        setEditDueDate(activity.due_date ? activity.due_date.slice(0, 16) : '');
        setEditPoints(String(activity.max_points ?? ''));
        setEditMode(true);
    }

    async function saveEdit() {
        setSavingEdit(true); setError('');
        try {
            const res = await fetch(`/api/assignments/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: editTitle.trim(),
                    description: editDesc.trim(),
                    instructions: editInstructions.trim(),
                    due_date: editDueDate || null,
                    max_points: editPoints ? Number(editPoints) : null,
                }),
            });
            const j = await res.json();
            if (!res.ok) throw new Error(j.error || 'Save failed');
            setEditMode(false);
            setSuccessMsg('Activity updated!');
            loadActivity();
        } catch (err: any) { setError(err.message); }
        finally { setSavingEdit(false); }
    }

    // ── Render guards ─────────────────────────────────────────────────────────

    if (authLoading || loading) return (
        <div className="min-h-screen bg-background flex items-center justify-center">
            <ArrowPathIcon className="w-8 h-8 text-primary animate-spin" />
        </div>
    );
    if (!activity) return (
        <div className="min-h-screen bg-background flex items-center justify-center flex-col gap-3">
            <p className="text-white/30">Activity not found.</p>
            <Link href="/dashboard/projects" className="text-primary text-sm font-bold hover:underline">← Back to Projects</Link>
        </div>
    );

    const meta              = activity.metadata || {};
    const submissionTypes: string[] = meta.submission_types || ['link', 'code', 'text'];
    const autoGradeEnabled: boolean = meta.auto_grade === true;
    const submissions: any[]        = activity.assignment_submissions || [];
    const dueDate   = activity.due_date ? new Date(activity.due_date) : null;
    const isOverdue = dueDate ? dueDate < new Date() : false;
    const category: string = meta.category || 'coding';
    const gradedCount  = submissions.filter(s => s.status === 'graded').length;
    const pendingCount = submissions.filter(s => s.status === 'submitted').length;

    // ── JSX ───────────────────────────────────────────────────────────────────

    return (
        <div className="min-h-screen bg-background flex flex-col">

            {/* ── Grade Canvas overlay (staff) ─────────────────────────────── */}
            {gradingSubmission && (
                <ProjectGradeCanvas
                    sub={gradingSubmission}
                    activity={activity}
                    assignmentId={id}
                    onClose={() => setGradingSubmission(null)}
                    onSaved={() => { setGradingSubmission(null); setSuccessMsg('Grade saved!'); loadActivity(); }}
                />
            )}

            {/* ── Compact Hero ─────────────────────────────────────────────── */}
            <div className="relative bg-[#0a0a12] border-b border-white/[0.06] flex-shrink-0">
                <div className="absolute inset-0 pointer-events-none overflow-hidden">
                    <div className="absolute -top-16 -left-16 w-72 h-72 bg-primary/6 rounded-full blur-3xl" />
                    <div className="absolute top-0 right-0 w-56 h-56 bg-amber-500/4 rounded-full blur-3xl" />
                </div>
                <div className="relative px-4 md:px-8 py-4">
                    <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3 min-w-0">
                            <Link href="/dashboard/projects"
                                className="flex items-center gap-2 px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs text-white font-semibold transition-colors flex-shrink-0">
                                <ArrowLeftIcon className="w-3.5 h-3.5" /> Projects
                            </Link>
                            <div className="w-px h-4 bg-white/10" />
                            <div className="w-8 h-8 bg-primary/15 border border-primary/25 flex items-center justify-center flex-shrink-0">
                                <RocketLaunchIcon className="w-4 h-4 text-primary" />
                            </div>
                            <div className="min-w-0">
                                <h1 className="text-sm font-black text-white uppercase tracking-tight truncate">{activity.title}</h1>
                                <div className="flex items-center gap-3 mt-0.5">
                                    <span className="text-[9px] text-primary/60 font-bold uppercase tracking-widest">{category}</span>
                                    {dueDate && (
                                        <span className={`text-[9px] flex items-center gap-1 ${isOverdue ? 'text-rose-400' : 'text-white/25'}`}>
                                            <ClockIcon className="w-2.5 h-2.5" />
                                            {isOverdue ? 'OVERDUE · ' : ''}
                                            Due {dueDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0">
                            {isStudent && mySubmission && <StatusBadge status={mySubmission.status} grade={mySubmission.grade} />}
                            {isStaff && (
                                <div className="flex items-center gap-3 text-[10px]">
                                    <span className="text-emerald-400 font-bold">{gradedCount} graded</span>
                                    {pendingCount > 0 && <span className="text-amber-400 font-bold">{pendingCount} pending</span>}
                                    <button onClick={openEdit}
                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-white/[0.05] border border-white/[0.1] hover:border-primary/40 hover:bg-primary/10 text-white/60 hover:text-primary transition-all font-black uppercase tracking-widest">
                                        <PencilSquareIcon className="w-3 h-3" /> Edit
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
                <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
            </div>

            {/* ── Alerts ──────────────────────────────────────────────────── */}
            <AnimatePresence>
                {(error || successMsg) && (
                    <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                        className="px-4 md:px-8 pt-3 space-y-2 flex-shrink-0">
                        {error && (
                            <div className="flex items-center gap-3 bg-rose-500/10 border border-rose-500/20 px-4 py-2.5">
                                <ExclamationTriangleIcon className="w-4 h-4 text-rose-400 flex-shrink-0" />
                                <p className="text-rose-400 text-sm flex-1">{error}</p>
                                <button onClick={() => setError('')} className="text-rose-400/50 hover:text-rose-400">✕</button>
                            </div>
                        )}
                        {successMsg && (
                            <div className="flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/20 px-4 py-2.5">
                                <CheckCircleIcon className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                                <p className="text-emerald-400 text-sm font-semibold">{successMsg}</p>
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── Edit Activity Panel (staff) ─────────────────────────────── */}
            <AnimatePresence>
                {editMode && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center p-4"
                        style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(6px)' }}>
                        <motion.div initial={{ scale: 0.96, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.96, y: 16 }}
                            className="w-full max-w-xl bg-[#0d0d18] border border-primary/20 overflow-hidden"
                            style={{ boxShadow: '0 0 60px rgba(249,115,22,0.12)' }}>
                            {/* Header */}
                            <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]"
                                style={{ background: 'rgba(249,115,22,0.06)' }}>
                                <div className="flex items-center gap-3">
                                    <PencilSquareIcon className="w-4 h-4 text-primary" />
                                    <p className="text-xs font-black text-white uppercase tracking-widest">Edit Activity</p>
                                </div>
                                <button onClick={() => setEditMode(false)} className="text-white/30 hover:text-white text-lg leading-none">✕</button>
                            </div>
                            {/* Form */}
                            <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
                                <div>
                                    <label className={LABEL}>Title</label>
                                    <input value={editTitle} onChange={e => setEditTitle(e.target.value)}
                                        className={INPUT} placeholder="Activity title" />
                                </div>
                                <div>
                                    <label className={LABEL}>Description</label>
                                    <textarea value={editDesc} onChange={e => setEditDesc(e.target.value)}
                                        rows={3} className={TEXTAREA} placeholder="Short description shown to students" />
                                </div>
                                <div>
                                    <label className={LABEL}>Instructions</label>
                                    <textarea value={editInstructions} onChange={e => setEditInstructions(e.target.value)}
                                        rows={5} className={TEXTAREA} placeholder="Step-by-step instructions for students" />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className={LABEL}>Due Date</label>
                                        <input type="datetime-local" value={editDueDate} onChange={e => setEditDueDate(e.target.value)}
                                            className={INPUT} />
                                    </div>
                                    <div>
                                        <label className={LABEL}>Max Points</label>
                                        <input type="number" value={editPoints} onChange={e => setEditPoints(e.target.value)}
                                            className={INPUT} placeholder="100" min={0} max={1000} />
                                    </div>
                                </div>
                            </div>
                            {/* Footer */}
                            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/[0.06]">
                                <button onClick={() => setEditMode(false)}
                                    className="px-5 py-2 text-xs font-black text-white/40 hover:text-white uppercase tracking-widest transition-colors">
                                    Cancel
                                </button>
                                <button onClick={saveEdit} disabled={savingEdit || !editTitle.trim()}
                                    className="flex items-center gap-2 px-6 py-2 bg-primary hover:bg-primary text-white text-xs font-black uppercase tracking-widest transition-all disabled:opacity-50">
                                    {savingEdit ? <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" /> : <CheckIcon className="w-3.5 h-3.5" />}
                                    {savingEdit ? 'Saving…' : 'Save Changes'}
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── Mobile Tabs (student) ────────────────────────────────────── */}
            {isStudent && (
                <div className="flex border-b border-white/[0.06] bg-[#0a0a12] flex-shrink-0 lg:hidden">
                    {(['code', 'preview', 'submit'] as const).map(tab => (
                        <button key={tab} onClick={() => setActiveTab(tab)}
                            className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest transition-colors ${
                                activeTab === tab
                                    ? 'text-primary border-b-2 border-primary'
                                    : 'text-white/30 hover:text-white/60'
                            }`}>
                            {tab === 'code' ? '💻 Code' : tab === 'preview' ? '👁 Preview' : '📤 Submit'}
                        </button>
                    ))}
                </div>
            )}

            {/* ── Main Student Layout ──────────────────────────────────────── */}
            {isStudent ? (
                <div className="flex-1 flex flex-col overflow-hidden min-h-0">

                    {/* Collapsible brief: instructions + group */}
                    {(activity.instructions || myGroup) && (
                        <div className="border-b border-white/[0.06] bg-[#080810] flex-shrink-0">
                            <button
                                onClick={() => setBriefOpen(o => !o)}
                                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.02] transition-colors">
                                <ClipboardDocumentListIcon className="w-3.5 h-3.5 text-primary/70 flex-shrink-0" />
                                <span className="text-[9px] font-black text-primary/70 uppercase tracking-widest flex-1 text-left">
                                    📋 Project Brief{myGroup ? ` · ${myGroup.name}` : ''}
                                </span>
                                {briefOpen
                                    ? <ChevronUpIcon className="w-3.5 h-3.5 text-white/20" />
                                    : <ChevronDownIcon className="w-3.5 h-3.5 text-white/20" />}
                            </button>
                            {briefOpen && (
                                <div className="px-4 pb-4 space-y-3 max-h-80 overflow-y-auto">
                                    {activity.instructions && (
                                        <ActivityInstructions
                                            instructions={activity.instructions}
                                            meta={meta}
                                            studentMode
                                        />
                                    )}
                                    {myGroup && (
                                        <div className="border border-white/[0.08] bg-white/[0.02]">
                                            <div className="px-3 py-2 border-b border-white/[0.06] flex items-center gap-2">
                                                <UserGroupIcon className="w-3 h-3 text-primary" />
                                                <p className="text-[9px] font-black text-primary/80 uppercase tracking-widest flex-1 truncate">{myGroup.name}</p>
                                                {myGroup.is_graded && myGroup.group_score != null && myGroup.evaluation_type === 'group' && (
                                                    <span className="text-[9px] font-black text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5">{myGroup.group_score}/100</span>
                                                )}
                                            </div>
                                            <div className="divide-y divide-white/[0.04]">
                                                {(myGroup.project_group_members || []).map((m: any) => {
                                                    const isMe = m.student_id === profile?.id;
                                                    const name = m.portal_users?.full_name || 'Unknown';
                                                    return (
                                                        <div key={m.id} className={`px-3 py-2.5 ${isMe ? 'bg-primary/[0.06]' : ''}`}>
                                                            <div className="flex items-center gap-2 mb-0.5">
                                                                <div className={`w-4 h-4 flex items-center justify-center text-[8px] font-black flex-shrink-0 ${isMe ? 'bg-primary text-white' : 'bg-white/10 text-white/40'}`}>
                                                                    {name[0].toUpperCase()}
                                                                </div>
                                                                <p className={`text-[10px] font-bold flex-1 ${isMe ? 'text-white' : 'text-white/50'}`}>
                                                                    {name}{isMe ? ' (You)' : ''}
                                                                </p>
                                                                {m.individual_score != null && (
                                                                    <span className="text-[9px] text-emerald-400 font-black">{m.individual_score}/100</span>
                                                                )}
                                                            </div>
                                                            {m.task_description && (
                                                                <p className={`text-[9px] leading-relaxed pl-6 ${isMe ? 'text-primary/70' : 'text-white/25'}`}>{m.task_description}</p>
                                                            )}
                                                            {isMe && m.individual_feedback && (
                                                                <p className="text-[9px] pl-6 mt-1 text-emerald-400/70 italic">"{m.individual_feedback}"</p>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                            {myGroup.group_feedback && (
                                                <div className="px-3 py-2 border-t border-white/[0.06] bg-emerald-500/[0.04]">
                                                    <p className="text-[9px] font-black text-emerald-400/70 uppercase tracking-widest mb-0.5">Group Feedback</p>
                                                    <p className="text-[9px] text-emerald-300/60 italic">"{myGroup.group_feedback}"</p>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Full-width Code + Preview + Submit */}
                    <div className="flex-1 flex flex-col overflow-hidden min-h-0">

                        {/* Desktop tab bar */}
                        <div className="hidden lg:flex border-b border-white/[0.06] bg-[#0a0a12] flex-shrink-0">
                            {(['code', 'preview', 'submit'] as const).map(tab => (
                                <button key={tab} onClick={() => setActiveTab(tab)}
                                    className={`px-5 py-3 text-[10px] font-black uppercase tracking-widest transition-colors ${
                                        activeTab === tab
                                            ? 'text-primary border-b-2 border-primary bg-primary/5'
                                            : 'text-white/30 hover:text-white/60'
                                    }`}>
                                    {tab === 'code' ? '💻 Code Editor' : tab === 'preview' ? '👁 Live Preview' : '📤 Submit Work'}
                                </button>
                            ))}
                            <div className="ml-auto flex items-center gap-3 px-4">
                                <button onClick={capturePlayground} disabled={capturing}
                                    className="flex items-center gap-1.5 text-[9px] font-black text-cyan-400 hover:text-cyan-300 px-2.5 py-1.5 bg-cyan-500/10 border border-cyan-500/20 hover:border-cyan-500/40 transition-all disabled:opacity-50 uppercase tracking-widest">
                                    <CodeBracketIcon className="w-3 h-3" />
                                    {capturing ? 'Capturing...' : 'From Playground'}
                                </button>
                            </div>
                        </div>

                        {/* Code Editor tab */}
                        <div className={`flex-1 overflow-hidden ${activeTab === 'code' ? 'flex' : 'hidden'} flex-col`}
                            style={{ display: activeTab === 'code' ? 'flex' : 'none' }}>
                            <IntegratedCodeRunner
                                value={editorCode}
                                onChange={setEditorCode}
                                language={editorLang}
                                title={activity.title}
                                height="100%"
                                showHeader={false}
                            />
                        </div>

                        {/* Preview tab */}
                        {activeTab === 'preview' && (
                            <div className="flex-1 flex flex-col overflow-hidden">
                                {editorCode.trim() ? (
                                    editorLang === 'html' ? (
                                        <iframe
                                            key={editorCode}
                                            srcDoc={editorCode}
                                            sandbox="allow-scripts allow-same-origin"
                                            title="Live Preview"
                                            className="flex-1 w-full border-0 bg-card"
                                        />
                                    ) : (
                                        <div className="flex-1 flex flex-col">
                                            <div className="px-4 py-3 bg-amber-500/5 border-b border-amber-500/20 flex-shrink-0">
                                                <p className="text-[10px] font-black text-amber-400 uppercase tracking-widest">
                                                    💡 Live preview is available for HTML projects. Switch to the Code tab and click Run to execute {editorLang} code.
                                                </p>
                                            </div>
                                            <div className="flex-1 bg-black/20 flex items-center justify-center">
                                                <div className="text-center space-y-2">
                                                    <EyeIcon className="w-10 h-10 text-white/10 mx-auto" />
                                                    <p className="text-white/30 text-sm">Switch to Code Editor to run {editorLang} code</p>
                                                    <button onClick={() => setActiveTab('code')}
                                                        className="text-[10px] font-black text-primary uppercase tracking-widest px-4 py-2 border border-primary/30 hover:bg-primary/10 transition-all">
                                                        Open Code Editor
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    )
                                ) : (
                                    <div className="flex-1 flex items-center justify-center flex-col gap-4 bg-black/20">
                                        <EyeIcon className="w-12 h-12 text-white/10" />
                                        <p className="text-white/30 text-sm">No code yet — write some in the Code Editor tab to see a preview</p>
                                        <button onClick={() => setActiveTab('code')}
                                            className="flex items-center gap-2 text-[10px] font-black text-primary uppercase tracking-widest px-5 py-2.5 bg-primary/10 border border-primary/30 hover:bg-primary/20 transition-all">
                                            Open Code Editor
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Submit tab */}
                        {activeTab === 'submit' && (
                            <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-5">

                                {/* Submission status */}
                                {mySubmission?.feedback && (
                                    <div className="flex items-start gap-3 bg-emerald-500/5 border border-emerald-500/20 px-4 py-4">
                                        <CheckCircleIcon className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                                        <div>
                                            <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-1">Teacher Feedback</p>
                                            <p className="text-sm text-emerald-300/80 italic">"{mySubmission.feedback}"</p>
                                        </div>
                                    </div>
                                )}

                                {/* Code preview from builder */}
                                {editorCode.trim() && (
                                    <div style={{ borderRadius: 0, overflow: 'hidden', boxShadow: '0 0 40px rgba(249,115,22,0.1), 0 0 80px rgba(249,115,22,0.04)' }}>
                                        <div className="flex items-center justify-between px-4 py-2.5"
                                            style={{ background: 'linear-gradient(90deg, rgba(249,115,22,0.12), rgba(249,115,22,0.04))', borderBottom: '1px solid rgba(249,115,22,0.2)' }}>
                                            <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest flex items-center gap-1.5">
                                                <CheckCircleIcon className="w-3.5 h-3.5" /> Code Ready to Submit
                                            </p>
                                            <div className="flex items-center gap-2">
                                                <span className="text-[9px] text-white/30">{editorCode.split('\n').length} lines</span>
                                                <button onClick={() => setActiveTab('code')}
                                                    className="text-[9px] font-black text-primary uppercase tracking-widest px-2 py-0.5 bg-primary/15 border border-primary/25 hover:bg-primary/25 transition-all">
                                                    Edit Code
                                                </button>
                                            </div>
                                        </div>
                                        <SyntaxHighlight
                                            code={editorCode}
                                            language={editorLang}
                                            showLineNumbers
                                            maxLines={12}
                                            animate
                                        />
                                    </div>
                                )}

                                <form onSubmit={handleSubmit} className="space-y-5">
                                    {/* Links */}
                                    {submissionTypes.includes('link') && (
                                        <div>
                                            <label className={LABEL}>🔗 Project Links (GitHub / Live Demo)</label>
                                            {links.map((link, i) => (
                                                <div key={i} className="flex gap-2 mb-2">
                                                    <input value={link}
                                                        onChange={e => setLinks(ls => ls.map((l, j) => j === i ? e.target.value : l))}
                                                        placeholder="https://github.com/yourname/project"
                                                        className={INPUT} />
                                                    {links.length > 1 && (
                                                        <button type="button" onClick={() => setLinks(ls => ls.filter((_, j) => j !== i))}
                                                            className="px-2 text-rose-400/60 hover:text-rose-400">✕</button>
                                                    )}
                                                </div>
                                            ))}
                                            <button type="button" onClick={() => setLinks(ls => [...ls, ''])}
                                                className="text-[10px] text-primary hover:text-primary font-bold uppercase tracking-widest">
                                                + Add link
                                            </button>
                                        </div>
                                    )}

                                    {/* File */}
                                    {submissionTypes.includes('file') && (
                                        <div>
                                            <label className={LABEL}>📎 File URL</label>
                                            <input value={fileUrl} onChange={e => setFileUrl(e.target.value)}
                                                placeholder="https://drive.google.com/..." className={INPUT} />
                                        </div>
                                    )}

                                    {/* Screenshot */}
                                    {submissionTypes.includes('screenshot') && (
                                        <div>
                                            <label className={LABEL}>🖼️ Screenshot URL</label>
                                            <input value={screenshotUrl} onChange={e => setScreenshotUrl(e.target.value)}
                                                placeholder="https://i.imgur.com/..." className={INPUT} />
                                            {screenshotUrl?.startsWith('http') && (
                                                <img src={screenshotUrl} alt="Preview"
                                                    className="mt-2 max-h-40 border border-white/10 object-contain"
                                                    onError={e => (e.target as any).style.display = 'none'} />
                                            )}
                                        </div>
                                    )}

                                    {/* Text explanation */}
                                    <div>
                                        <label className={LABEL}>📝 Written Explanation (what you built, how it works)</label>
                                        <textarea value={textExplanation} onChange={e => setTextExplanation(e.target.value)} rows={5}
                                            placeholder="Describe what you built, how it works, challenges you faced, what you learned..."
                                            className={TEXTAREA} />
                                    </div>

                                    {/* Auto-grade preview */}
                                    {autoGradeEnabled && (
                                        <div className="bg-emerald-500/5 border border-emerald-500/20 px-4 py-3">
                                            <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-2">⚡ Auto-Grade Preview</p>
                                            <p className="text-3xl font-black text-white">
                                                {autoGradeSubmission(
                                                    { links: links.filter(Boolean), code: editorCode, screenshot_url: screenshotUrl },
                                                    textExplanation, fileUrl
                                                )}
                                                <span className="text-base text-white/30">/100</span>
                                            </p>
                                        </div>
                                    )}

                                    <button type="submit" disabled={submitting}
                                        className="flex items-center gap-2 px-8 py-3 bg-primary hover:bg-primary text-white text-sm font-black uppercase tracking-widest transition-all disabled:opacity-50 w-full justify-center">
                                        {submitting ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : <CheckIcon className="w-4 h-4" />}
                                        {submitting ? 'Submitting...' : mySubmission ? 'Update Submission' : 'Submit Project Work'}
                                    </button>
                                </form>
                            </div>
                        )}
                    </div>
                </div>
            ) : (
                /* ── STAFF VIEW ─────────────────────────────────────────────── */
                <div className="px-6 md:px-10 py-8 max-w-5xl space-y-6">

                    {/* Instructions — structured step-by-step view */}
                    {activity.instructions && (
                        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                            className="bg-primary/5 border border-primary/20 p-5">
                            <div className="flex items-center gap-2 mb-4">
                                <ClipboardDocumentListIcon className="w-4 h-4 text-primary" />
                                <p className="text-[10px] font-black text-primary uppercase tracking-widest">Project Instructions</p>
                            </div>
                            <ActivityInstructions
                                instructions={activity.instructions}
                                meta={meta}
                                teacherMode
                                onUpdate={async (newInstructions) => {
                                    const res = await fetch(`/api/assignments/${id}`, {
                                        method: 'PATCH',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ instructions: newInstructions }),
                                    });
                                    const j = await res.json();
                                    if (!res.ok) throw new Error(j.error || 'Save failed');
                                    setSuccessMsg('Instructions updated!');
                                    loadActivity();
                                }}
                            />
                        </motion.div>
                    )}

                    {/* Groups overview — shown when groups exist for this activity */}
                    {activityGroups.length > 0 && (
                        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
                            className="border border-primary/20 bg-primary/[0.03] p-5">
                            <div className="flex items-center gap-2 mb-4">
                                <UserGroupIcon className="w-4 h-4 text-primary" />
                                <p className="text-[10px] font-black text-primary uppercase tracking-widest">
                                    Groups ({activityGroups.length})
                                </p>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {activityGroups.map((grp: any) => {
                                    const memberIds: string[] = (grp.project_group_members || []).map((m: any) => m.student_id);
                                    const groupSubs = submissions.filter((s: any) => memberIds.includes(s.portal_user_id));
                                    const submittedCount = groupSubs.length;
                                    const allSubmitted = submittedCount >= memberIds.length;
                                    return (
                                        <div key={grp.id} className="border border-white/[0.06] bg-[#0d0d18] p-4">
                                            <div className="flex items-center justify-between mb-3">
                                                <p className="text-sm font-black text-white truncate mr-2">{grp.name}</p>
                                                <span className={`text-[9px] font-black px-2 py-0.5 flex-shrink-0 ${
                                                    grp.is_graded
                                                        ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
                                                        : allSubmitted
                                                            ? 'bg-amber-500/15 text-amber-400 border border-amber-500/20'
                                                            : 'bg-white/5 text-white/30 border border-white/[0.06]'
                                                }`}>
                                                    {grp.is_graded ? `Graded${grp.group_score != null ? ` · ${grp.group_score}/100` : ''}` : `${submittedCount}/${memberIds.length} submitted`}
                                                </span>
                                            </div>
                                            <div className="space-y-1.5">
                                                {(grp.project_group_members || []).map((m: any) => {
                                                    const sub = submissions.find((s: any) => s.portal_user_id === m.student_id);
                                                    const hasSubmitted = !!sub;
                                                    return (
                                                        <div key={m.id} className="flex items-start gap-2 text-[10px]">
                                                            <div className={`w-1.5 h-1.5 rounded-full mt-1 flex-shrink-0 ${hasSubmitted ? 'bg-emerald-400' : 'bg-white/20'}`} />
                                                            <div className="flex-1 min-w-0">
                                                                <span className={`font-bold ${hasSubmitted ? 'text-white/70' : 'text-white/35'}`}>
                                                                    {m.portal_users?.full_name || 'Unknown'}
                                                                </span>
                                                                {m.task_description && (
                                                                    <span className="text-white/25 ml-1">— {m.task_description}</span>
                                                                )}
                                                            </div>
                                                            {sub?.grade != null ? (
                                                                <span className="text-emerald-400 font-black flex-shrink-0">{sub.grade}%</span>
                                                            ) : sub ? (
                                                                <span className="text-amber-400/60 flex-shrink-0">submitted</span>
                                                            ) : null}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                            {grp.group_feedback && (
                                                <p className="text-[9px] text-emerald-300/50 italic mt-2 border-t border-white/[0.04] pt-2">
                                                    "{grp.group_feedback}"
                                                </p>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </motion.div>
                    )}

                    {/* Submissions list */}
                    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="space-y-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <UserGroupIcon className="w-4 h-4 text-white/30" />
                                <p className="text-[10px] font-black text-white/40 uppercase tracking-widest">All Submissions ({submissions.length})</p>
                            </div>
                            {pendingCount > 0 && (
                                <span className="text-[10px] text-amber-400 font-bold px-3 py-1 bg-amber-500/10 border border-amber-500/20">
                                    {pendingCount} awaiting review
                                </span>
                            )}
                        </div>

                        {submissions.length === 0 && (
                            <div className="bg-white/[0.02] border border-white/[0.06] p-12 text-center">
                                <RocketLaunchIcon className="w-8 h-8 text-white/10 mx-auto mb-3" />
                                <p className="text-white/20 text-sm">No submissions yet</p>
                            </div>
                        )}

                        {submissions.map((sub, idx) => {
                            const studentName = sub.portal_users?.full_name || 'Unknown Student';
                            const answers     = sub.answers || {};
                            const subCode: string = answers.code || answers.playground_code || '';
                            const subLinks: string[] = answers.links || [];
                            // Find which group this student belongs to (for group activities)
                            const subGroup = activityGroups.find((g: any) =>
                                (g.project_group_members || []).some((m: any) => m.student_id === sub.portal_user_id)
                            );
                            const subMember = subGroup?.project_group_members?.find((m: any) => m.student_id === sub.portal_user_id);
                            const isExpanded  = expandedSub === sub.id;

                            return (
                                <motion.div key={sub.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: idx * 0.04 }}
                                    className="bg-[#0d0d18] border border-white/[0.06] hover:border-primary/20 transition-all">
                                    <button onClick={() => setExpandedSub(isExpanded ? null : sub.id)}
                                        className="w-full flex items-center gap-4 px-5 py-4 text-left">
                                        <div className="w-9 h-9 bg-primary/15 border border-primary/20 flex items-center justify-center flex-shrink-0">
                                            <span className="text-sm font-black text-primary">{studentName[0].toUpperCase()}</span>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <p className="text-sm font-black text-white">{studentName}</p>
                                                {subGroup && (
                                                    <span className="text-[9px] font-black px-1.5 py-0.5 bg-primary/10 border border-primary/20 text-primary uppercase tracking-wide">
                                                        {subGroup.name}
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-[10px] text-white/30">
                                                {subMember?.task_description
                                                    ? <span className="text-white/20 mr-2">Task: {subMember.task_description.slice(0, 40)}{subMember.task_description.length > 40 ? '…' : ''}</span>
                                                    : null}
                                                {sub.submitted_at
                                                    ? new Date(sub.submitted_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
                                                    : 'Not submitted'}
                                            </p>
                                        </div>
                                        <StatusBadge status={sub.status || 'not_submitted'} grade={sub.grade} />
                                        {isExpanded ? <ChevronUpIcon className="w-4 h-4 text-primary" /> : <ChevronDownIcon className="w-4 h-4 text-white/20" />}
                                    </button>

                                    <AnimatePresence>
                                        {isExpanded && (
                                            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                                                exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                                                <div className="border-t border-white/[0.06] px-5 py-5 space-y-4 bg-black/20">
                                                    {subLinks.length > 0 && (
                                                        <div>
                                                            <p className={LABEL}>🔗 Links</p>
                                                            {subLinks.map((l, i) => <a key={i} href={l} target="_blank" rel="noreferrer" className="block text-sm text-cyan-400 hover:text-cyan-300 underline truncate">{l}</a>)}
                                                        </div>
                                                    )}
                                                    {subCode && (
                                                        <div>
                                                            <p className={LABEL}>💻 Code Submitted</p>
                                                            <SyntaxHighlight
                                                                code={subCode.slice(0, 3000) + (subCode.length > 3000 ? '\n# … truncated' : '')}
                                                                language={detectLang(activity?.category ?? '')}
                                                                showLineNumbers
                                                                maxLines={25}
                                                                animate
                                                            />
                                                        </div>
                                                    )}
                                                    {(answers.screenshot_url) && (
                                                        <div>
                                                            <p className={LABEL}>🖼️ Screenshot</p>
                                                            <img src={answers.screenshot_url} alt="screenshot" className="max-h-48 border border-white/10 object-contain" onError={e => (e.target as any).style.display = 'none'} />
                                                        </div>
                                                    )}
                                                    {sub.file_url && (
                                                        <div>
                                                            <p className={LABEL}>📎 File</p>
                                                            <a href={sub.file_url} target="_blank" rel="noreferrer" className="text-sm text-cyan-400 hover:underline">{sub.file_url}</a>
                                                        </div>
                                                    )}
                                                    {(sub.submission_text || answers.text_explanation) && (
                                                        <div>
                                                            <p className={LABEL}>📝 Written Explanation</p>
                                                            <p className="text-sm text-white/60 leading-relaxed whitespace-pre-line">{sub.submission_text || answers.text_explanation}</p>
                                                        </div>
                                                    )}
                                                    {sub.feedback && (
                                                        <div className="bg-emerald-500/5 border border-emerald-500/20 px-3 py-2">
                                                            <p className="text-[10px] font-black text-emerald-400 mb-1">Feedback Given</p>
                                                            <p className="text-xs text-emerald-300/70 italic">{sub.feedback}</p>
                                                        </div>
                                                    )}

                                                    <button
                                                        onClick={() => setGradingSubmission(sub)}
                                                        className="flex items-center gap-2 px-4 py-2 bg-primary/20 border border-primary/30 text-primary text-xs font-black uppercase tracking-widest hover:bg-primary/30 transition-all">
                                                        <PencilSquareIcon className="w-3.5 h-3.5" />
                                                        {sub.status === 'graded' ? 'Edit Grade' : 'Grade Submission'}
                                                    </button>
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </motion.div>
                            );
                        })}
                    </motion.div>
                </div>
            )}
        </div>
    );
}
