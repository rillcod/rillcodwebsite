// @refresh reset
'use client';

import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import {
    ArrowLeftIcon, CalendarIcon, ClockIcon, DocumentTextIcon,
    CheckCircleIcon, ExclamationTriangleIcon, ArrowUpTrayIcon,
    PaperClipIcon, AcademicCapIcon, StarIcon, XMarkIcon, ArrowPathIcon, CheckIcon, PencilIcon,
    CodeBracketIcon, CommandLineIcon, TrashIcon, RocketLaunchIcon, PrinterIcon,
    ClipboardDocumentListIcon, ChevronDownIcon
} from '@/lib/icons';
import IntegratedCodeRunner from '@/components/studio/IntegratedCodeRunner';
import BlockSequencer from '@/components/assignments/BlockSequencer';
import ShareToParentModal from '@/components/share/ShareToParentModal';

function pctInfo(grade: number, max: number) {
    const pct = Math.round((grade / max) * 100);
    const letter = pct >= 90 ? 'A' : pct >= 80 ? 'B' : pct >= 70 ? 'C' : pct >= 60 ? 'D' : 'F';
    const color = pct >= 70 ? 'emerald' : pct >= 50 ? 'amber' : 'rose';
    return { pct, letter, color };
}

function CodingBlocksChallenge({ 
    question, 
    value, 
    onChange 
}: { 
    question: any, 
    value: string, 
    onChange: (val: string) => void 
}) {
    const sentence = question.metadata?.logic_sentence || "Logic: [BLANK]";
    const parts = sentence.split('[BLANK]');
    const blocks = question.metadata?.logic_blocks || [];
    
    const currentAnswers = value ? value.split(',').map(s => s.trim()) : [];
    
    const updateAt = (idx: number, newVal: string) => {
        const newAns = [...currentAnswers];
        // Ensure array is long enough
        for (let i=0; i < parts.length - 1; i++) {
            if (newAns[i] === undefined) newAns[i] = '';
        }
        newAns[idx] = newVal;
        onChange(newAns.slice(0, parts.length - 1).join(', '));
    };

    return (
        <div className="space-y-4">
            <div className="p-4 bg-card shadow-sm border border-border rounded-none flex flex-wrap items-center gap-x-2 gap-y-3 leading-loose">
                {parts.map((p: string, pi: number) => (
                    <div key={pi} className="contents">
                        <span className="text-sm font-medium text-muted-foreground">{p}</span>
                        {pi < parts.length - 1 && (
                            <div className="inline-block min-w-[80px] h-8 bg-black/40 border border-amber-500/30 rounded-none px-3 text-xs font-black text-amber-400 flex items-center justify-center italic shadow-inner">
                                {currentAnswers[pi] || "?"}
                            </div>
                        )}
                    </div>
                ))}
            </div>
            
            <div className="flex flex-wrap gap-2">
                {blocks.map((block: string, bi: number) => (
                    <button
                        key={bi}
                        type="button"
                        onClick={() => {
                            const firstEmpty = currentAnswers.findIndex((a, i) => i < parts.length - 1 && !a);
                            const targetIdx = firstEmpty === -1 ? 0 : firstEmpty;
                            if (targetIdx < parts.length - 1) updateAt(targetIdx, block);
                        }}
                        className="px-3 py-2 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 rounded-none text-xs font-bold text-amber-400 transition-colors active:scale-95"
                    >
                        {block}
                    </button>
                ))}
                <button 
                    type="button" 
                    onClick={() => onChange('')}
                    className="px-3 py-2 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 rounded-none text-[10px] uppercase font-black text-rose-400 ml-auto"
                >
                    Reset
                </button>
            </div>
        </div>
    );
}

function GradeCanvas({ sub, maxPoints, assignment, onClose, onSaved }: {
    sub: any;
    maxPoints: number;
    assignment: any;
    onClose: () => void;
    onSaved: () => void;
}) {
    const { profile } = useAuth();
    const max = maxPoints ?? 100;
    const questions: any[] = Array.isArray(assignment.questions) ? assignment.questions : [];
    const rubric: { criterion: string; description: string; maxPoints: number }[] = Array.isArray(assignment.metadata?.rubric) ? assignment.metadata.rubric : [];

    const [grade, setGrade] = useState<string>(sub.grade?.toString() ?? '');
    const [feedback, setFb] = useState<string>(sub.feedback ?? '');
    const [status, setStatus] = useState(sub.status);
    const [subText, setSubText] = useState(sub.submission_text ?? '');
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [err, setErr] = useState('');
    const [lightbox, setLightbox] = useState<string | null>(null);
    const [rubricScores, setRubricScores] = useState<Record<number, number>>({});
    const [briefOpen, setBriefOpen] = useState(false);
    const [filePreviewOpen, setFilePreviewOpen] = useState(false);

    const rubricTotal = Object.values(rubricScores).reduce((a, b) => a + b, 0);
    const handleRubricScore = (idx: number, val: number) => {
        const updated = { ...rubricScores, [idx]: val };
        setRubricScores(updated);
        const total = Object.values(updated).reduce((a, b) => a + b, 0);
        setGrade(String(Math.min(total, max)));
    };

    const info = grade ? pctInfo(Number(grade), max) : null;
    const isImage = sub.file_url && /\.(png|jpe?g|gif|webp|bmp|heic)(\?|$)/i.test(sub.file_url.split('?')[0]);

    const save = async () => {
        const g = Number(grade);
        if (grade !== '' && (isNaN(g) || g < 0 || g > max)) { setErr(`Enter a score between 0 and ${max}`); return; }
        setSaving(true); setErr('');
        try {
            const payload: any = { grade: grade === '' ? null : g, feedback, status, submission_text: subText || null, graded_by: profile!.id };
            if (status === 'graded') payload.graded_at = new Date().toISOString();
            const res = await fetch(`/api/assignment-submissions/${sub.id}`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
            });
            if (!res.ok) { const j = await res.json(); throw new Error(j.error || 'Failed to save'); }
            onSaved();
        } catch (e: any) {
            setErr(e.message ?? 'Failed to save grade');
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!window.confirm('Delete this submission? Student will need to retry.')) return;
        setDeleting(true); setErr('');
        try {
            const res = await fetch(`/api/assignment-submissions/${sub.id}`, { method: 'DELETE' });
            if (!res.ok) { const j = await res.json(); throw new Error(j.error || 'Failed to delete'); }
            onSaved(); onClose();
        } catch (e: any) {
            setErr(e.message ?? 'Failed to delete submission');
            setDeleting(false);
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
                    <img src={lightbox} alt="Submission photo" className="max-w-[90vw] max-h-[85vh] object-contain rounded-lg shadow-2xl"
                        onClick={e => e.stopPropagation()} />
                </div>
            )}

            {/* File preview canvas panel */}
            {filePreviewOpen && sub.file_url && (
                <div className="fixed inset-0 z-[60] flex">
                    {/* Backdrop — click to close */}
                    <div className="flex-1 bg-black/60 backdrop-blur-sm" onClick={() => setFilePreviewOpen(false)} />
                    {/* Slide-in panel */}
                    <div className="w-full max-w-2xl bg-[#0d0d1a] border-l border-white/10 flex flex-col shadow-2xl">
                        {/* Panel header */}
                        <div className="flex items-center gap-3 px-5 py-3.5 border-b border-white/10 bg-[#0B132B] flex-shrink-0">
                            <PaperClipIcon className="w-4 h-4 text-blue-400 flex-shrink-0" />
                            <p className="text-sm font-bold text-white flex-1 truncate">Attached File</p>
                            <a
                                href={sub.file_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-black text-blue-400 uppercase tracking-widest bg-blue-500/10 border border-blue-500/20 hover:bg-blue-500/20 transition-all rounded-lg"
                            >
                                Open in Tab
                            </a>
                            <button onClick={() => setFilePreviewOpen(false)}
                                className="w-8 h-8 flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 rounded-lg transition-colors">
                                <XMarkIcon className="w-4 h-4" />
                            </button>
                        </div>
                        {/* Panel body — iframe */}
                        <div className="flex-1 min-h-0 bg-white">
                            <iframe
                                src={sub.file_url}
                                title="Submitted file"
                                className="w-full h-full border-0"
                                allow="fullscreen"
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* Top navigation bar */}
            <div className="flex-shrink-0 flex items-center gap-3 px-4 py-3 border-b border-white/10 bg-[#0B132B] shadow-lg">
                <button onClick={onClose}
                    className="flex items-center gap-2 px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-sm text-white font-semibold transition-colors flex-shrink-0">
                    <ArrowLeftIcon className="w-4 h-4" />
                    <span className="hidden sm:inline">All Submissions</span>
                </button>
                <div className="h-5 w-px bg-white/10 flex-shrink-0" />
                <div className="flex items-center gap-2 flex-1 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-600 to-orange-400 flex items-center justify-center text-sm font-black text-white flex-shrink-0">
                        {(sub.portal_users?.full_name ?? '?')[0]}
                    </div>
                    <div className="min-w-0">
                        <p className="text-sm font-bold text-white leading-tight truncate">{sub.portal_users?.full_name ?? 'Student'}</p>
                        <p className="text-[10px] text-white/40 truncate hidden sm:block">{assignment.title}</p>
                    </div>
                </div>
                <select value={status} onChange={e => setStatus(e.target.value)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase border appearance-none cursor-pointer flex-shrink-0 ${
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
                {err && <p className="text-xs text-rose-400 hidden md:block max-w-[140px] truncate">{err}</p>}
                <button onClick={save} disabled={saving}
                    className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white font-bold rounded-lg text-sm transition-all flex-shrink-0">
                    {saving ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : <CheckIcon className="w-4 h-4" />}
                    <span className="hidden sm:inline">{saving ? 'Saving…' : 'Save Grade'}</span>
                </button>
            </div>

            {/* Split-panel body */}
            <div className="flex flex-1 min-h-0 overflow-hidden">

                {/* LEFT: Assignment context (hidden on mobile) */}
                <div className="hidden md:flex flex-col w-2/5 border-r border-white/8 overflow-y-auto bg-[#161628]">
                    <div className="p-5 border-b border-white/8">
                        <span className="text-[10px] font-black text-amber-400 uppercase tracking-widest">{assignment.assignment_type ?? 'Assignment'}</span>
                        <h2 className="text-base font-extrabold text-white mt-1 leading-snug">{assignment.title}</h2>
                        <div className="flex items-center gap-3 mt-2 text-xs text-white/30">
                            <span>{max} pts max</span>
                            {assignment.due_date && <span>Due {new Date(assignment.due_date).toLocaleDateString('en-GB')}</span>}
                        </div>
                    </div>

                    {assignment.instructions && (
                        <div className="p-5 border-b border-white/8">
                            <p className="text-[10px] font-black text-white/30 uppercase tracking-widest mb-2">Instructions</p>
                            <p className="text-sm text-white/60 leading-relaxed whitespace-pre-wrap">{assignment.instructions}</p>
                        </div>
                    )}

                    {questions.length > 0 && (
                        <div className="p-5 border-b border-white/8 space-y-3">
                            <p className="text-[10px] font-black text-white/30 uppercase tracking-widest">Questions &amp; Answer Key</p>
                            {questions.map((q: any, i: number) => (
                                <div key={i} className="p-3 bg-white/3 border border-white/5 rounded-lg space-y-2">
                                    <div className="flex items-start justify-between gap-2">
                                        <p className="text-xs font-semibold text-white/80 leading-snug">{i + 1}. {q.question_text}</p>
                                        <span className="text-[10px] text-white/25 flex-shrink-0">{q.points}pt</span>
                                    </div>
                                    {q.options && Array.isArray(q.options) && (
                                        <div className="flex flex-wrap gap-1">
                                            {q.options.map((opt: string, oi: number) => (
                                                <span key={oi} className={`px-2 py-0.5 text-[10px] rounded border font-medium ${opt === q.correct_answer ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-white/3 text-white/35 border-white/8'}`}>
                                                    {String.fromCharCode(65 + oi)}. {opt}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                    {q.correct_answer && !q.options && (
                                        <div className="flex items-center gap-1.5 text-emerald-400">
                                            <CheckIcon className="w-3 h-3 flex-shrink-0" />
                                            <span className="text-[11px] font-semibold">{q.correct_answer}</span>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    {rubric.length > 0 && (
                        <div className="p-5 space-y-2">
                            <p className="text-[10px] font-black text-amber-400 uppercase tracking-widest mb-3">Grading Rubric</p>
                            {rubric.map((r, i) => (
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

                {/* RIGHT: Submission + grading form */}
                <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-5">

                    {/* Mobile-only: collapsible assignment brief */}
                    <div className="md:hidden border border-white/10 rounded-xl overflow-hidden">
                        <button onClick={() => setBriefOpen(o => !o)}
                            className="w-full flex items-center justify-between px-4 py-3 bg-white/3 hover:bg-white/5 transition-colors text-left">
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] font-black text-amber-400 uppercase tracking-widest">Assignment Brief</span>
                                <span className="text-[10px] text-white/30">— tap to {briefOpen ? 'hide' : 'view'}</span>
                            </div>
                            <ChevronDownIcon className={`w-4 h-4 text-white/30 flex-shrink-0 transition-transform ${briefOpen ? 'rotate-180' : ''}`} />
                        </button>
                        {briefOpen && (
                            <div className="px-4 pb-4 space-y-4 bg-white/2">
                                <div className="pt-3">
                                    <p className="text-sm font-bold text-white">{assignment.title}</p>
                                    <p className="text-[10px] text-white/30 mt-0.5">{max} pts · {assignment.assignment_type}</p>
                                </div>
                                {assignment.instructions && (
                                    <div>
                                        <p className="text-[10px] font-black text-white/30 uppercase tracking-widest mb-1.5">Instructions</p>
                                        <p className="text-xs text-white/60 leading-relaxed whitespace-pre-wrap">{assignment.instructions}</p>
                                    </div>
                                )}
                                {questions.length > 0 && (
                                    <div className="space-y-2">
                                        <p className="text-[10px] font-black text-white/30 uppercase tracking-widest">Answer Key</p>
                                        {questions.map((q: any, i: number) => (
                                            <div key={i} className="p-3 bg-white/3 border border-white/5 rounded-lg space-y-1">
                                                <p className="text-xs text-white/70 leading-snug">{i + 1}. {q.question_text}</p>
                                                {q.correct_answer && (
                                                    <p className="text-[11px] text-emerald-400 font-semibold">✓ {q.correct_answer}</p>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                                {rubric.length > 0 && (
                                    <div>
                                        <p className="text-[10px] font-black text-amber-400 uppercase tracking-widest mb-2">Rubric</p>
                                        {rubric.map((r, i) => (
                                            <div key={i} className="flex justify-between text-xs py-1.5 border-b border-white/5 last:border-0">
                                                <span className="text-white/60">{r.criterion}</span>
                                                <span className="text-amber-400 font-bold flex-shrink-0 ml-2">{r.maxPoints}pt</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Submission text */}
                    <div className="bg-white/3 border border-white/8 rounded-xl p-4 space-y-2">
                        <p className="text-[10px] font-black text-white/30 uppercase tracking-widest">Student's Written Work</p>
                        <textarea value={subText} rows={5} onChange={e => setSubText(e.target.value)}
                            className="w-full bg-transparent text-sm text-white/70 focus:outline-none resize-none leading-relaxed placeholder:text-white/20"
                            placeholder="No text submission…" />
                    </div>

                    {/* Submitted photo */}
                    {isImage && (
                        <div className="space-y-2">
                            <p className="text-[10px] font-black text-white/30 uppercase tracking-widest">Submitted Photo</p>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={sub.file_url} alt="Student submission"
                                className="w-full max-h-72 object-contain bg-black/30 border border-white/8 rounded-xl cursor-zoom-in hover:border-amber-500/30 transition-colors"
                                onClick={() => setLightbox(sub.file_url)} />
                            <p className="text-[10px] text-white/20">Click image to enlarge</p>
                        </div>
                    )}
                    {sub.file_url && !isImage && (
                        <div className="border border-blue-500/20 bg-blue-500/5 rounded-xl overflow-hidden">
                            <div className="flex items-center gap-3 px-4 py-3">
                                <PaperClipIcon className="w-4 h-4 text-blue-400 flex-shrink-0" />
                                <p className="text-sm text-blue-300 font-semibold flex-1 truncate">
                                    {sub.file_url.split('/').pop()?.split('?')[0] || 'Attached File'}
                                </p>
                                <button
                                    type="button"
                                    onClick={() => setFilePreviewOpen(true)}
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-black text-blue-400 uppercase tracking-widest bg-blue-500/10 border border-blue-500/20 hover:bg-blue-500/20 transition-all rounded-lg flex-shrink-0"
                                >
                                    View File
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Student answers vs correct answers */}
                    {questions.length > 0 && sub.answers && (
                        <div className="space-y-3">
                            <p className="text-[10px] font-black text-white/30 uppercase tracking-widest">Student Answers</p>
                            {questions.map((q: any, idx: number) => (
                                <div key={idx} className="p-4 bg-white/3 border border-white/8 rounded-xl space-y-2">
                                    <div className="flex items-start justify-between gap-2">
                                        <p className="text-xs font-semibold text-white/70 leading-snug">{q.question_text}</p>
                                        <span className="text-[10px] text-white/25 flex-shrink-0">{q.points}pt</span>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        <div className="bg-black/20 rounded-lg p-2.5">
                                            <p className="text-[9px] text-white/25 uppercase font-black mb-1">Student</p>
                                            {q.question_type === 'coding_blocks' ? (
                                                <div className="flex flex-wrap items-center gap-1 leading-relaxed">
                                                    {(q.metadata?.logic_sentence || '').split('[BLANK]').map((part: string, pi: number, arr: string[]) => (
                                                        <span key={pi} className="contents">
                                                            <span className="text-white/50 text-[10px]">{part}</span>
                                                            {pi < arr.length - 1 && (
                                                                <span className="px-1.5 py-0.5 bg-amber-500/20 border border-amber-500/30 rounded text-amber-400 text-[10px] font-bold italic">
                                                                    {(sub.answers?.[idx] || '').split(',')[pi]?.trim() || '???'}
                                                                </span>
                                                            )}
                                                        </span>
                                                    ))}
                                                </div>
                                            ) : (
                                                <p className="text-xs text-white/70 font-medium">{sub.answers?.[idx] || <span className="italic text-white/20">No answer</span>}</p>
                                            )}
                                        </div>
                                        {q.correct_answer && (
                                            <div className="bg-emerald-500/8 border border-emerald-500/20 rounded-lg p-2.5">
                                                <p className="text-[9px] text-emerald-400/60 uppercase font-black mb-1">Answer Key</p>
                                                <p className="text-xs text-emerald-400 font-semibold">{q.correct_answer}</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Rubric scoring */}
                    {rubric.length > 0 && (
                        <div className="border border-amber-500/20 bg-amber-500/5 rounded-xl p-4 space-y-3">
                            <div className="flex items-center justify-between">
                                <p className="text-[10px] font-black text-amber-400 uppercase tracking-widest">Rubric Scoring</p>
                                <span className="text-xs text-amber-400 font-bold">Total: {rubricTotal} / {max}</span>
                            </div>
                            {rubric.map((r, ri) => (
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

                    {/* Score input */}
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
                            placeholder="Write specific, constructive feedback that will help this student improve…"
                            className="w-full bg-transparent text-sm text-white/80 placeholder:text-white/20 focus:outline-none resize-none leading-relaxed" />
                    </div>

                    {err && (
                        <div className="flex items-center gap-2 p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl">
                            <ExclamationTriangleIcon className="w-4 h-4 text-rose-400 flex-shrink-0" />
                            <p className="text-sm text-rose-400 font-semibold">{err}</p>
                        </div>
                    )}

                    {/* Mobile save button */}
                    <div className="md:hidden">
                        <button onClick={save} disabled={saving}
                            className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white font-bold rounded-xl text-sm transition-all">
                            {saving ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : <CheckIcon className="w-4 h-4" />}
                            {saving ? 'Saving…' : 'Save Grade'}
                        </button>
                    </div>

                    {/* Delete submission */}
                    <button onClick={handleDelete} disabled={deleting}
                        className="w-full py-2.5 text-[10px] font-black uppercase tracking-widest text-rose-400/30 hover:text-rose-400 hover:bg-rose-400/8 rounded-xl transition-all flex items-center justify-center gap-2 pb-8">
                        <TrashIcon className="w-3.5 h-3.5" />
                        {deleting ? 'Deleting…' : 'Delete Submission'}
                    </button>
                </div>
            </div>
        </div>
    );
}

function Badge({ status }: { status: string }) {
    const map: Record<string, string> = {
        submitted: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
        graded: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
        late: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
        missing: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
    };
    return (
        <span className={`px-3 py-1 rounded-full text-xs font-bold border capitalize ${map[status] ?? 'bg-muted text-muted-foreground'}`}>
            {status}
        </span>
    );
}

export default function AssignmentDetailPage() {
    const params = useParams();
    const id = params?.id as string;
    const searchParams = useSearchParams();
    const classId = searchParams?.get('class_id');
    const { profile, loading: authLoading } = useAuth();

    const [assignment, setAssignment] = useState<any>(null);
    const [submission, setSubmission] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [text, setText] = useState('');
    const [answers, setAnswers] = useState<Record<number, string>>({});
    const [submitting, setSubmitting] = useState(false);
    const [submitDone, setSubmitDone] = useState(false);
    const [grading, setGrading] = useState<any | null>(null);
    const [codeAnswer, setCodeAnswer] = useState('');
    const [codeOutput, setCodeOutput] = useState('');
    const [attachedFile, setAttachedFile] = useState<File | null>(null);
    const [uploadingFile, setUploadingFile] = useState(false);
    const [fileUrl, setFileUrl] = useState<string | null>(null);
    const [fileError, setFileError] = useState<string | null>(null);
    const [refreshKey, setRefreshKey] = useState(0);
    const [shareOpen, setShareOpen] = useState(false);
    const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

    const isStaff = profile?.role === 'admin' || profile?.role === 'teacher' || profile?.role === 'school';

    // Called when a grade is successfully saved — refetch from server to sync counters
    const handleGraded = () => {
        setGrading(null);
        setRefreshKey(k => k + 1); // triggers useEffect refetch
    };

    useEffect(() => {
        if (authLoading || !profile || !id) return;
        let cancelled = false;

        async function load() {
            setLoading(true);
            setError(null);
            try {
                if (isStaff) {
                    // Staff: use admin-client API — returns all submissions with student names
                    const res = await fetch(`/api/assignments/${id}`, { cache: 'no-store' });
                    const json = await res.json();
                    if (!res.ok) throw new Error(json.error || 'Failed to load');
                    if (!cancelled) setAssignment(json.data);
                } else {
                    // Student: use admin-client API with student query param to get own submission
                    const res = await fetch(`/api/assignments/${id}/student`, { cache: 'no-store' });
                    const json = await res.json();
                    if (!res.ok) throw new Error(json.error || 'Failed to load');
                    const asgn = json.data;
                    if (!cancelled) {
                        setAssignment(asgn);
                        const mySub = asgn?.assignment_submissions?.[0] ?? null;
                        setSubmission(mySub);
                    }
                }
            } catch (e: any) {
                if (!cancelled) setError(e.message ?? 'Failed to load assignment');
            } finally {
                if (!cancelled) setLoading(false);
            }
        }
        load();
        return () => { cancelled = true; };
    }, [authLoading, profile, id, isStaff, refreshKey]);

    // Compress image via Canvas API — reduces phone photos from 8-15 MB down to ~300 KB
    const compressImage = (file: File): Promise<File> => new Promise((resolve) => {
        if (!file.type.startsWith('image/')) { resolve(file); return; }
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
            URL.revokeObjectURL(url);
            const MAX = 1280;
            let { width, height } = img;
            if (width > MAX || height > MAX) {
                if (width > height) { height = Math.round(height * MAX / width); width = MAX; }
                else { width = Math.round(width * MAX / height); height = MAX; }
            }
            const canvas = document.createElement('canvas');
            canvas.width = width; canvas.height = height;
            canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
            canvas.toBlob(blob => {
                if (!blob) { resolve(file); return; }
                resolve(new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }));
            }, 'image/jpeg', 0.82);
        };
        img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
        img.src = url;
    });

    const handleFileChange = async (file: File | null) => {
        setAttachedFile(file);
        setFileUrl(null);
        setFileError(null);
        if (!file || !profile) return;
        if (file.size > 10 * 1024 * 1024) { setFileError('File too large (max 10 MB)'); return; }
        setUploadingFile(true);
        try {
            // Compress images before upload — phone photos can be 10+ MB
            const toUpload = await compressImage(file);
            const formData = new FormData();
            formData.append('file', toUpload);
            const res = await fetch('/api/files/upload', { method: 'POST', body: formData });
            const payload = await res.json();
            if (!res.ok) throw new Error(payload.error ?? 'Upload failed');
            // public_url is the stable /api/media/... proxy URL stored in the files record
            setFileUrl(payload.data.public_url);
        } catch (e: any) {
            setFileError(e.message ?? 'Upload failed');
            setAttachedFile(null);
        } finally {
            setUploadingFile(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!profile || !assignment) return;
        if (uploadingFile) return;
        setSubmitting(true);
        // For coding assignments, combine code + notes as submission_text
        const _isCoding = assignment?.assignment_type === 'coding';
        const submissionText = _isCoding
            ? `\`\`\`\n${codeAnswer}\n\`\`\`\n\n${codeOutput ? `Output:\n${codeOutput}\n\n` : ''}${text || ''}`
            : text;
        try {
            const res = await fetch(`/api/assignments/${assignment.id}/submit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    portal_user_id: profile.id,
                    submission_text: submissionText,
                    answers: Object.keys(answers).length > 0 ? answers : null,
                    file_url: fileUrl ?? undefined,
                }),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || 'Failed to submit');
            setSubmission(json.data);
            setSubmitDone(true);
            setText('');
        } catch (e: any) {
            setError(e.message ?? 'Failed to submit');
        } finally {
            setSubmitting(false);
        }
    };

    const buildShareMessage = () => {
        if (!assignment) return '';
        const course = assignment.courses?.title || 'STEM / AI / Coding';
        const due = assignment.due_date
            ? new Date(assignment.due_date).toLocaleDateString('en-NG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
            : null;
        const pts = assignment.max_points ?? 100;
        const type = (assignment.assignment_type || 'Assignment').charAt(0).toUpperCase() + (assignment.assignment_type || 'assignment').slice(1);
        let msg = `📚 *${type}: ${assignment.title}*\n`;
        msg += `📖 Course: ${course}\n`;
        if (due) msg += `📅 Due: *${due}*\n`;
        msg += `🏆 Total marks: ${pts}\n`;
        if (assignment.instructions) {
            const brief = assignment.instructions.length > 200
                ? assignment.instructions.slice(0, 200).trimEnd() + '…'
                : assignment.instructions;
            msg += `\n📝 *Instructions:*\n${brief}\n`;
        }
        msg += `\nDear Parent/Guardian, please ensure your child completes and submits this assignment before the due date.\n`;
        msg += `\n🔗 View on portal: ${typeof window !== 'undefined' ? window.location.origin : 'https://rillcod.com'}/dashboard/assignments/${assignment.id}`;
        msg += `\n\n_Rillcod Technologies — www.rillcod.com_`;
        return msg;
    };

    const handlePrintAssignment = () => {
        if (!assignment) return;
        const today = new Date().toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' });
        const schoolName = profile?.school_name || 'RILLCOD TECHNOLOGIES';
        const logoUrl = window.location.origin + '/logo.png';
        const qs: any[] = Array.isArray(assignment.questions) ? assignment.questions : [];
        const mcqQs  = qs.filter((q: any) => q.options && Array.isArray(q.options) && q.options.length > 0);
        const openQs = qs.filter((q: any) => !q.options || !Array.isArray(q.options) || q.options.length === 0);
        const mcqPts  = mcqQs.reduce((s: number, q: any) => s + (q.points ?? 0), 0);
        const openPts = openQs.reduce((s: number, q: any) => s + (q.points ?? 0), 0);
        const totalPts = mcqPts + openPts || assignment.max_points || 100;
        const lineCount = (q: any) => q.question_type === 'essay' ? 12 : q.question_type === 'fill_blank' ? 4 : 8;

        const renderQ = (q: any, n: number) => {
            const isMCQ = q.options && Array.isArray(q.options) && q.options.length > 0;
            return `<div class="q-block">
              <div class="q-header">
                <span class="q-num">${n}.</span>
                <div class="q-text">${q.question_text ?? ''}</div>
                <span class="q-pts">${q.points ?? 1} mark${(q.points ?? 1) !== 1 ? 's' : ''}</span>
              </div>
              ${isMCQ ? `<div class="options">${(q.options as string[]).map((opt: string, oi: number) =>
                `<div class="opt"><span class="bubble">${String.fromCharCode(65 + oi)}</span><span class="opt-text">${opt}</span></div>`
              ).join('')}</div>`
              : `<div class="ans-block">${Array.from({ length: lineCount(q) }).map(() => '<div class="ans-line"></div>').join('')}</div>`}
            </div>`;
        };

        const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/>
<title>${assignment.title}</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Times New Roman', Georgia, serif; background: #fff; color: #000; font-size: 11.5pt; }
  @page { size: A4 portrait; margin: 15mm 18mm 14mm; }

  .official-hdr { display:flex; align-items:center; gap:14pt; padding-bottom:10pt; border-bottom:3pt double #000; margin-bottom:5pt; }
  .hdr-logo { width:52pt; height:52pt; object-fit:contain; flex-shrink:0; }
  .hdr-org { flex:1; text-align:center; }
  .hdr-school { font-size:13pt; font-weight:900; text-transform:uppercase; letter-spacing:1.5px; }
  .hdr-brand  { font-size:8pt; font-weight:700; text-transform:uppercase; letter-spacing:2px; color:#444; margin-top:2pt; }
  .hdr-web    { font-size:7.5pt; color:#888; margin-top:1pt; }
  .hdr-type   { background:#000; color:#fff; padding:5pt 10pt; font-size:7.5pt; font-weight:900; text-transform:uppercase; letter-spacing:2px; align-self:flex-start; margin-top:4pt; }

  .title-band { text-align:center; margin:8pt 0; }
  .asgn-title { font-size:15pt; font-weight:900; text-transform:uppercase; letter-spacing:1px; }
  .asgn-sub   { font-size:9pt; color:#555; margin-top:3pt; }

  .meta-grid  { display:grid; grid-template-columns:repeat(4,1fr); border:1pt solid #000; margin:8pt 0; }
  .meta-cell  { padding:5pt 6pt; border-right:1pt solid #aaa; text-align:center; }
  .meta-cell:last-child { border-right:none; }
  .meta-label { font-size:6.5pt; font-weight:900; text-transform:uppercase; letter-spacing:1px; color:#666; display:block; margin-bottom:2pt; }
  .meta-val   { font-size:10pt; font-weight:700; display:block; }

  .stu-box { display:grid; grid-template-columns:2.5fr 1fr 1fr; border:1.5pt solid #000; margin:8pt 0; }
  .stu-field { padding:6pt 8pt 4pt; border-right:1pt solid #888; }
  .stu-field:last-child { border-right:none; }
  .stu-label { font-size:7pt; font-weight:900; text-transform:uppercase; letter-spacing:1px; color:#555; display:block; margin-bottom:5pt; }
  .stu-line  { border-bottom:1pt solid #333; height:13pt; }

  .instructions { background:#f5f5f5; border:1pt solid #ccc; border-left:4pt solid #000; padding:7pt 10pt; margin:8pt 0 12pt; font-size:9.5pt; line-height:1.6; }
  .instructions b { font-size:8pt; text-transform:uppercase; letter-spacing:1px; }

  .section-hdr { display:flex; align-items:center; gap:8pt; margin:14pt 0 10pt; }
  .s-rule  { flex:1; border-top:1.5pt solid #000; }
  .s-title { font-size:9.5pt; font-weight:900; text-transform:uppercase; letter-spacing:2px; white-space:nowrap; padding:0 8pt; border:1pt solid #000; }
  .s-pts   { font-size:8.5pt; color:#444; font-weight:700; white-space:nowrap; }

  .q-block  { margin-bottom:18pt; page-break-inside:avoid; }
  .q-header { display:flex; gap:8pt; align-items:flex-start; margin-bottom:6pt; }
  .q-num    { font-size:11pt; font-weight:900; min-width:22pt; flex-shrink:0; padding-top:1pt; }
  .q-text   { flex:1; font-size:11.5pt; line-height:1.6; }
  .q-pts    { font-size:8pt; font-weight:700; color:#555; white-space:nowrap; flex-shrink:0; font-style:italic; padding-top:3pt; }

  .options { display:grid; grid-template-columns:1fr 1fr; gap:5pt 20pt; margin:4pt 0 0 30pt; }
  .opt     { display:flex; align-items:flex-start; gap:6pt; font-size:10.5pt; line-height:1.45; padding:2pt 0; }
  .bubble  { display:inline-flex; align-items:center; justify-content:center; width:15pt; height:15pt; border:1.2pt solid #000; border-radius:50%; font-size:8.5pt; font-weight:900; flex-shrink:0; margin-top:0.5pt; }
  .opt-text { flex:1; }

  .ans-block { margin:4pt 0 0 30pt; }
  .ans-line  { border-bottom:0.8pt solid #bbb; height:24pt; margin-bottom:1pt; }

  .score-box { border:1.5pt solid #000; display:flex; margin-top:20pt; page-break-inside:avoid; }
  .score-cell { flex:1; padding:6pt 10pt; border-right:1pt solid #aaa; text-align:center; }
  .score-cell:last-child { border-right:none; }
  .score-label { font-size:7pt; font-weight:900; text-transform:uppercase; letter-spacing:1px; color:#666; display:block; margin-bottom:8pt; }
  .score-space { height:16pt; border-bottom:1pt solid #333; }

  .page-footer { margin-top:14pt; border-top:0.75pt solid #ccc; padding-top:5pt; display:flex; justify-content:space-between; font-size:7.5pt; color:#777; font-style:italic; }

  @media print { body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } .q-block { page-break-inside:avoid; } }
</style>
</head><body><div class="page">

  <div class="official-hdr">
    <img src="${logoUrl}" class="hdr-logo" onerror="this.style.display='none'" />
    <div class="hdr-org">
      <div class="hdr-school">${schoolName}</div>
      <div class="hdr-brand">Rillcod Technologies · Coding &amp; STEM Academy</div>
      <div class="hdr-web">www.rillcod.com</div>
    </div>
    <div class="hdr-type">${(assignment.assignment_type || 'ASSIGNMENT').toUpperCase()}</div>
  </div>

  <div class="title-band">
    <div class="asgn-title">${assignment.title}</div>
    ${assignment.courses?.title ? `<div class="asgn-sub">${assignment.courses.title}${assignment.courses?.programs?.name ? ' · ' + assignment.courses.programs.name : ''}</div>` : ''}
  </div>

  <div class="meta-grid">
    <div class="meta-cell"><span class="meta-label">Max Points</span><span class="meta-val">${totalPts}</span></div>
    <div class="meta-cell"><span class="meta-label">Questions</span><span class="meta-val">${qs.length || '—'}</span></div>
    <div class="meta-cell"><span class="meta-label">Due Date</span><span class="meta-val" style="font-size:8.5pt">${assignment.due_date ? new Date(assignment.due_date).toLocaleDateString('en-GB') : '—'}</span></div>
    <div class="meta-cell"><span class="meta-label">Date</span><span class="meta-val" style="font-size:8.5pt">${today}</span></div>
  </div>

  <div class="stu-box">
    <div class="stu-field"><span class="stu-label">Student Full Name</span><div class="stu-line"></div></div>
    <div class="stu-field"><span class="stu-label">Class / Grade</span><div class="stu-line"></div></div>
    <div class="stu-field"><span class="stu-label">Score / Marks</span><div class="stu-line"></div></div>
  </div>

  <div class="instructions">
    <b>Instructions:</b>&nbsp;
    ${assignment.instructions || 'Answer all questions carefully.'}
    ${mcqQs.length > 0 ? ' For objective questions, <strong>circle</strong> the letter of the correct answer.' : ''}
    ${openQs.length > 0 ? ' Write your answers legibly in the spaces provided.' : ''}
  </div>

  ${mcqQs.length > 0 ? `
  <div class="section-hdr">
    <div class="s-rule"></div>
    <span class="s-title">Section A — Objective Questions</span>
    <span class="s-pts">[${mcqPts} marks]</span>
    <div class="s-rule"></div>
  </div>
  ${mcqQs.map((q: any, i: number) => renderQ(q, i + 1)).join('')}` : ''}

  ${openQs.length > 0 ? `
  <div class="section-hdr">
    <div class="s-rule"></div>
    <span class="s-title">Section B — Theory / Written</span>
    <span class="s-pts">[${openPts} marks]</span>
    <div class="s-rule"></div>
  </div>
  ${openQs.map((q: any, i: number) => renderQ(q, mcqQs.length + i + 1)).join('')}` : ''}

  ${qs.length === 0 && assignment.description ? `
  <div style="margin-top:16pt">
    <p style="font-size:11.5pt; line-height:1.8;">${assignment.description}</p>
  </div>
  <div class="ans-block" style="margin-top:16pt">
    ${Array.from({ length: 20 }).map(() => '<div class="ans-line"></div>').join('')}
  </div>` : ''}

  <div class="score-box">
    ${mcqQs.length > 0 ? `<div class="score-cell"><span class="score-label">Section A Score</span><div class="score-space"></div></div>` : ''}
    ${openQs.length > 0 ? `<div class="score-cell"><span class="score-label">Section B Score</span><div class="score-space"></div></div>` : ''}
    <div class="score-cell"><span class="score-label">Total Score</span><div class="score-space"></div></div>
    <div class="score-cell"><span class="score-label">Teacher's Signature</span><div class="score-space"></div></div>
  </div>

  <div class="page-footer">
    <span>${schoolName} · ${(assignment.assignment_type || 'Assignment').toUpperCase()} · ${today}</span>
    <span>www.rillcod.com</span>
  </div>
</div>
<script>window.onload = () => { window.print(); }</script>
</body></html>`;

        const win = window.open('', '_blank');
        win?.document.write(html);
        win?.document.close();
    };

    const isOverdue = assignment?.due_date && new Date(assignment.due_date) < new Date();
    const allSubs = Array.isArray(assignment?.assignment_submissions)
        ? assignment.assignment_submissions
        : [];
    const submitted = allSubs.filter((s: any) => s.status === 'submitted').length;
    const graded = allSubs.filter((s: any) => s.status === 'graded').length;
    // Only show grade once teacher has explicitly graded — prevents showing 0 from DB default
    const isGraded = submission?.status === 'graded' && submission?.grade != null;
    const pct = isGraded
        ? Math.round((submission.grade / (assignment?.max_points ?? 100)) * 100) : null;
    const letter = pct == null ? null
        : pct >= 90 ? 'A' : pct >= 80 ? 'B' : pct >= 70 ? 'C' : pct >= 60 ? 'D' : 'F';

    if (authLoading || loading) return (
        <div className="min-h-screen bg-background flex items-center justify-center">
            <div className="flex flex-col items-center gap-3">
                <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
                <p className="text-muted-foreground text-sm">Loading assignment…</p>
            </div>
        </div>
    );

    if (error) return (
        <div className="min-h-screen bg-background flex items-center justify-center">
            <div className="text-center">
                <ExclamationTriangleIcon className="w-12 h-12 mx-auto text-rose-400 mb-3" />
                <p className="text-rose-400 font-semibold">{error}</p>
                <Link href="/dashboard/assignments" className="mt-4 inline-block text-orange-400 hover:text-orange-500 text-sm underline">
                    ← Back to Assignments
                </Link>
            </div>
        </div>
    );

    if (!assignment) return null;

    const isCodingAssignment = assignment.assignment_type === 'coding';

    return (
        <div className="min-h-screen bg-background text-foreground">
            <ShareToParentModal
                open={shareOpen}
                onClose={() => setShareOpen(false)}
                defaultMessage={buildShareMessage()}
                title={assignment?.title}
            />
            {grading && (
                <GradeCanvas
                    sub={grading}
                    maxPoints={assignment.max_points}
                    assignment={assignment}
                    onClose={() => setGrading(null)}
                    onSaved={handleGraded}
                />
            )}

            {/* Global image lightbox (student view photos) */}
            {lightboxUrl && (
                <div className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center" onClick={() => setLightboxUrl(null)}>
                    <button onClick={() => setLightboxUrl(null)}
                        className="absolute top-4 right-4 flex items-center gap-2 px-4 py-2.5 bg-white/10 hover:bg-white/20 border border-white/20 rounded-full text-white text-sm font-bold transition-colors backdrop-blur-sm">
                        <XMarkIcon className="w-5 h-5" /> Close
                    </button>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={lightboxUrl} alt="Submission photo" className="max-w-[90vw] max-h-[85vh] object-contain rounded-lg shadow-2xl"
                        onClick={e => e.stopPropagation()} />
                </div>
            )}

            {/* Sticky top navigation bar */}
            <div className="sticky top-0 z-30 bg-[#0B132B]/95 backdrop-blur-sm border-b border-white/10 shadow-lg">
                <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center gap-3">
                    <Link href={classId ? `/dashboard/classes/${classId}` : `/dashboard/assignments`}
                        className="flex items-center gap-2 px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-sm text-white font-semibold transition-colors flex-shrink-0">
                        <ArrowLeftIcon className="w-4 h-4" />
                        <span className="hidden sm:inline">{classId ? 'Back to Class' : 'Assignments'}</span>
                    </Link>
                    <div className="h-5 w-px bg-white/10" />
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-white truncate">{assignment.title}</p>
                        <p className="text-[10px] text-white/35 hidden sm:block">{assignment.courses?.title}</p>
                    </div>
                    {isStaff && (
                        <div className="hidden sm:flex items-center gap-1.5 flex-shrink-0">
                            <span className="px-2 py-1 bg-blue-500/15 border border-blue-500/25 rounded-lg text-[10px] font-black text-blue-400">{submitted} submitted</span>
                            <span className="px-2 py-1 bg-emerald-500/15 border border-emerald-500/25 rounded-lg text-[10px] font-black text-emerald-400">{graded} graded</span>
                        </div>
                    )}
                </div>
            </div>

            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">

                {/* Header Card */}
                <div className="bg-card shadow-sm border border-border rounded-none p-7">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div className="flex-1">
                            <div className="flex items-center gap-2 flex-wrap mb-2">
                                <span className="text-xs font-bold text-amber-400 uppercase tracking-widest flex items-center gap-1">
                                    <DocumentTextIcon className="w-3.5 h-3.5" />
                                    {assignment.assignment_type ?? 'Assignment'}
                                </span>
                                {isOverdue && (
                                    <span className="px-2 py-0.5 bg-rose-500/20 text-rose-400 text-xs font-bold rounded-full border border-rose-500/30">
                                        Overdue
                                    </span>
                                )}
                            </div>
                            <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground">{assignment.title}</h1>
                            <p className="text-muted-foreground text-sm mt-1.5">
                                {assignment.courses?.title}
                                {assignment.courses?.programs?.name ? ` · ${assignment.courses.programs.name}` : ''}
                            </p>
                        </div>

                        <div className="flex items-center gap-2 flex-shrink-0">
                            {/* Open in Playground */}
                            <Link href={`/dashboard/playground?assignmentId=${id}`}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-xs font-bold rounded-none transition-colors border border-emerald-500/20">
                                <RocketLaunchIcon className="w-3.5 h-3.5" /> Playground
                            </Link>
                            {/* Staff edit + print + share buttons */}
                            {isStaff && (
                                <>
                                    <button
                                        onClick={() => setShareOpen(true)}
                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-[#25D366]/10 hover:bg-[#25D366]/20 text-[#25D366] text-xs font-bold rounded-none transition-colors border border-[#25D366]/30"
                                        title="Share assignment to parents via WhatsApp">
                                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.890-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                                        </svg>
                                        Share
                                    </button>
                                    <button
                                        onClick={handlePrintAssignment}
                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 text-xs font-bold rounded-none transition-colors border border-orange-500/20">
                                        <PrinterIcon className="w-3.5 h-3.5" /> Print
                                    </button>
                                    <Link href={`/dashboard/assignments/${id}/edit`}
                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 text-xs font-bold rounded-none transition-colors">
                                        <PencilIcon className="w-3.5 h-3.5" /> Edit
                                    </Link>
                                </>
                            )}
                        </div>
                        {!isStaff && submission?.status && (
                            <div className="flex-shrink-0 text-right">
                                <Badge status={submission.status} />
                                {pct != null ? (
                                    <div className="mt-2 text-center">
                                        <span className={`text-4xl font-black ${pct >= 70 ? 'text-emerald-400' : pct >= 50 ? 'text-amber-400' : 'text-rose-400'}`}>
                                            {letter}
                                        </span>
                                        <p className="text-muted-foreground text-xs">{pct}% · {submission.grade}/{assignment.max_points} pts</p>
                                    </div>
                                ) : submission?.status === 'submitted' ? (
                                    <p className="text-[10px] text-white/30 mt-2">Awaiting grade</p>
                                ) : null}
                            </div>
                        )}

                        {/* Staff submission counts */}
                        {isStaff && (
                            <div className="flex gap-4 text-center flex-shrink-0">
                                <div>
                                    <p className="text-2xl font-black text-blue-400">{submitted}</p>
                                    <p className="text-xs text-muted-foreground">Submitted</p>
                                </div>
                                <div>
                                    <p className="text-2xl font-black text-emerald-400">{graded}</p>
                                    <p className="text-xs text-muted-foreground">Graded</p>
                                </div>
                                <div>
                                    <p className="text-2xl font-black text-amber-400">{allSubs.length}</p>
                                    <p className="text-xs text-muted-foreground">Total</p>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Meta row */}
                    <div className="flex flex-wrap gap-4 mt-5 text-sm text-muted-foreground">
                        {assignment.due_date && (
                            <span className="flex items-center gap-1.5">
                                <CalendarIcon className="w-4 h-4" />
                                Due {new Date(assignment.due_date).toLocaleDateString('en-US', { dateStyle: 'full' })}
                            </span>
                        )}
                        <span className="flex items-center gap-1.5">
                            <StarIcon className="w-4 h-4" />
                            {assignment.max_points ?? 100} points
                        </span>
                    </div>
                </div>

                {/* Description */}
                {assignment.description && (
                    <div className="bg-card shadow-sm border border-border rounded-none p-6">
                        <h2 className="font-bold text-foreground mb-2 flex items-center gap-2">
                            <DocumentTextIcon className="w-4 h-4 text-orange-400" /> Description
                        </h2>
                        <p className="text-muted-foreground text-sm leading-relaxed whitespace-pre-wrap">{assignment.description}</p>
                    </div>
                )}

                {/* Instructions */}
                {assignment.instructions && (
                    <div className="bg-amber-500/5 border border-amber-500/20 rounded-none p-6">
                        <h2 className="font-bold text-amber-400 mb-2 flex items-center gap-2">
                            <AcademicCapIcon className="w-4 h-4" /> Instructions
                        </h2>
                        <p className="text-muted-foreground text-sm leading-relaxed whitespace-pre-wrap">{assignment.instructions}</p>
                    </div>
                )}

                {/* Project Deliverables & Rubric */}
                {assignment.assignment_type === 'project' && assignment.metadata && (
                    <div className="space-y-4">
                        {Array.isArray(assignment.metadata.deliverables) && assignment.metadata.deliverables.length > 0 && (
                            <div className="bg-blue-500/5 border border-blue-500/20 rounded-none p-6">
                                <h2 className="font-bold text-blue-400 mb-3 flex items-center gap-2 text-sm uppercase tracking-widest">
                                    <ClipboardDocumentListIcon className="w-4 h-4" /> Project Deliverables
                                </h2>
                                <ul className="space-y-2">
                                    {assignment.metadata.deliverables.map((d: string, i: number) => (
                                        <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                                            <span className="text-blue-400 font-bold flex-shrink-0 mt-0.5">{i + 1}.</span>
                                            <span>{d}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                        {Array.isArray(assignment.metadata.rubric) && assignment.metadata.rubric.length > 0 && (
                            <div className="border border-border rounded-none overflow-hidden">
                                <div className="px-5 py-3 border-b border-border bg-muted/20">
                                    <h2 className="font-bold text-foreground text-sm uppercase tracking-widest flex items-center gap-2">
                                        <StarIcon className="w-4 h-4 text-amber-400" /> Grading Rubric
                                    </h2>
                                </div>
                                <div className="divide-y divide-border">
                                    {assignment.metadata.rubric.map((r: any, i: number) => (
                                        <div key={i} className="px-5 py-3 flex items-start justify-between gap-4">
                                            <div className="flex-1">
                                                <p className="text-sm font-bold text-foreground">{r.criterion}</p>
                                                {r.description && <p className="text-xs text-muted-foreground mt-0.5">{r.description}</p>}
                                            </div>
                                            <span className="text-sm font-black text-amber-400 flex-shrink-0">{r.maxPoints} pts</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Teacher Feedback (student view) */}
                {!isStaff && submission?.feedback && (
                    <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-none p-6">
                        <h2 className="font-bold text-emerald-400 mb-2 flex items-center gap-2">
                            <CheckCircleIcon className="w-4 h-4" /> Teacher Feedback
                        </h2>
                        <p className="text-muted-foreground text-sm leading-relaxed">{submission.feedback}</p>
                    </div>
                )}

                {/* ── STUDENT SUBMISSION FORM ── */}
                {!isStaff && (
                    <div className="bg-card shadow-sm border border-border rounded-none p-6">
                        <h2 className="font-bold text-foreground mb-4 flex items-center gap-2">
                            <ArrowUpTrayIcon className="w-5 h-5 text-amber-400" />
                            {submission ? 'Your Submission' : 'Submit Assignment'}
                        </h2>

                        {submitDone && (
                            <div className="flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/20 rounded-none p-4 mb-4">
                                <CheckCircleIcon className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                                <p className="text-emerald-400 text-sm font-semibold">Submitted successfully!</p>
                            </div>
                        )}

                        {submission?.status === 'graded' || submission?.status === 'submitted' ? (
                            <div className="space-y-4">
                                {/* Show submitted photo if still available (deleted after grading) */}
                                {submission.file_url && /\.(png|jpe?g|gif|webp|bmp|heic)(\?|$)/i.test(submission.file_url) && (
                                    <div className="space-y-2">
                                        <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Your Submitted Photo</p>
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                            src={submission.file_url}
                                            alt="Your submission"
                                            className="w-full max-h-72 object-contain bg-black/20 border border-border rounded-none cursor-zoom-in hover:border-amber-500/30 transition-colors"
                                            onClick={() => setLightboxUrl(submission.file_url)}
                                        />
                                        <p className="text-[10px] text-white/25">Click image to enlarge</p>
                                        {submission.status === 'submitted' && (
                                            <p className="text-[10px] text-muted-foreground italic">Photo will be removed after grading.</p>
                                        )}
                                    </div>
                                )}
                                {submission.file_url && !/\.(png|jpe?g|gif|webp|bmp|heic)(\?|$)/i.test(submission.file_url) && (
                                    <a href={submission.file_url} target="_blank" rel="noopener noreferrer"
                                        className="inline-flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 font-semibold">
                                        <PaperClipIcon className="w-4 h-4" /> View submitted file
                                    </a>
                                )}
                                {/* Show which questions were attempted */}
                                {assignment.questions?.length > 0 && submission.answers && (
                                    <div className="border border-white/8 rounded-xl overflow-hidden">
                                        <div className="px-4 py-2.5 bg-white/3 border-b border-white/8">
                                            <p className="text-[10px] font-black text-white/40 uppercase tracking-widest">
                                                Questions Attempted: {Object.keys(submission.answers).filter(k => submission.answers[k] !== '' && submission.answers[k] != null).length} / {assignment.questions.length}
                                            </p>
                                        </div>
                                        <div className="divide-y divide-white/5">
                                            {assignment.questions.map((q: any, i: number) => {
                                                const answered = submission.answers[i] !== undefined && submission.answers[i] !== '';
                                                return (
                                                    <div key={i} className="flex items-start gap-3 px-4 py-3">
                                                        <span className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black mt-0.5 ${answered ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/5 text-white/20'}`}>
                                                            {answered ? '✓' : '—'}
                                                        </span>
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-xs text-white/60 leading-snug">{q.question_text}</p>
                                                            {answered && <p className="text-xs text-white/30 mt-1 truncate">Your answer: {submission.answers[i]}</p>}
                                                            {!answered && <p className="text-xs text-white/20 mt-1 italic">Not attempted</p>}
                                                        </div>
                                                        <span className="text-[10px] text-white/20 flex-shrink-0">{q.points}pt</span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                                <div className="text-center py-4 text-muted-foreground text-sm border border-border rounded-none bg-muted/10">
                                    {submission.status === 'graded'
                                        ? 'This assignment has been graded. No further submissions accepted.'
                                        : 'Your assignment has been submitted and is awaiting teacher review. Grade will appear here once marked.'}
                                </div>
                            </div>
                        ) : (
                            <form onSubmit={handleSubmit} className="space-y-6 pb-28 sm:pb-0">

                                {/* ── Sticky submit bar (top of form) ── */}
                                {(() => {
                                    const totalQs = assignment.questions?.length ?? 0;
                                    const answeredQs = Object.keys(answers).filter(k => answers[Number(k)] !== '' && answers[Number(k)] != null).length;
                                    const isDisabled = submitting || uploadingFile || (isCodingAssignment ? !codeAnswer.trim() : totalQs > 0 ? answeredQs === 0 : !text.trim() && !fileUrl);
                                    return (
                                        <>
                                            {/* Desktop: sticky bar inside form */}
                                            <div className="hidden sm:flex sticky top-[57px] z-20 items-center gap-4 bg-[#0B132B]/95 backdrop-blur-sm border border-white/10 rounded-xl px-4 py-3 shadow-xl">
                                                {totalQs > 0 && (
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center justify-between mb-1">
                                                            <p className="text-[11px] font-bold text-white/60">Progress</p>
                                                            <p className="text-[11px] font-black text-white">{answeredQs}/{totalQs} answered</p>
                                                        </div>
                                                        <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                                                            <div style={{ width: `${totalQs > 0 ? Math.round((answeredQs / totalQs) * 100) : 0}%` }}
                                                                className="h-1.5 bg-[#7a0606] rounded-full transition-all duration-300" />
                                                        </div>
                                                    </div>
                                                )}
                                                <button type="submit" disabled={isDisabled}
                                                    className="flex items-center gap-2 px-6 py-2.5 bg-[#7a0606] hover:bg-red-700 disabled:opacity-40 text-white font-black rounded-lg text-sm transition-all flex-shrink-0 shadow-lg shadow-red-900/30">
                                                    {submitting ? <><ArrowPathIcon className="w-4 h-4 animate-spin" /> Submitting…</> : <><ArrowUpTrayIcon className="w-4 h-4" /> {submission ? 'Resubmit' : 'Submit'}</>}
                                                </button>
                                            </div>

                                            {/* Mobile: fixed bottom bar */}
                                            <div className="sm:hidden fixed bottom-0 left-0 right-0 z-40 px-4 py-3 bg-[#0B132B]/98 backdrop-blur-md border-t border-white/10 shadow-2xl">
                                                {totalQs > 0 && (
                                                    <div className="mb-2.5">
                                                        <div className="flex items-center justify-between mb-1">
                                                            <p className="text-[10px] font-bold text-white/50">{answeredQs} of {totalQs} questions answered</p>
                                                            <p className="text-[10px] font-black text-white/70">{totalQs > 0 ? Math.round((answeredQs / totalQs) * 100) : 0}%</p>
                                                        </div>
                                                        <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                                                            <div style={{ width: `${totalQs > 0 ? Math.round((answeredQs / totalQs) * 100) : 0}%` }}
                                                                className="h-1 bg-[#7a0606] rounded-full transition-all duration-300" />
                                                        </div>
                                                    </div>
                                                )}
                                                <button type="submit" disabled={isDisabled}
                                                    className="w-full flex items-center justify-center gap-2 py-3.5 bg-[#7a0606] hover:bg-red-700 disabled:opacity-40 text-white font-black rounded-xl text-sm transition-all shadow-lg shadow-red-900/40">
                                                    {submitting ? <><ArrowPathIcon className="w-4 h-4 animate-spin" /> Submitting…</> : <><ArrowUpTrayIcon className="w-4 h-4" /> {submission ? 'Resubmit' : 'Submit Exam'}</>}
                                                </button>
                                            </div>
                                        </>
                                    );
                                })()}

                                {assignment.questions && Array.isArray(assignment.questions) && assignment.questions.length > 0 && (
                                    <div className="space-y-6">
                                        {assignment.questions.map((q: any, i: number) => (
                                            <div key={i} className="bg-card shadow-sm border border-border rounded-none p-5 space-y-3">
                                                <div className="flex justify-between items-start">
                                                    <h3 className="text-sm font-bold text-muted-foreground">Question {i + 1}</h3>
                                                    <span className="text-[10px] text-muted-foreground uppercase font-black">{q.points} pts</span>
                                                </div>
                                                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{q.question_text}</p>

                                                {q.question_type === 'multiple_choice' && (
                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                                                        {q.options?.map((opt: string, oi: number) => (
                                                            <label key={oi} className={`flex items-center gap-3 p-3 rounded-none border transition-all cursor-pointer ${answers[i] === opt ? 'bg-amber-500/20 border-amber-500 text-amber-400' : 'bg-card shadow-sm border-border text-muted-foreground hover:bg-muted'}`}>
                                                                <input type="radio" value={opt} checked={answers[i] === opt} onChange={e => setAnswers({ ...answers, [i]: e.target.value })} className="hidden" />
                                                                <span className="text-xs font-bold">{String.fromCharCode(65 + oi)}.</span>
                                                                <span className="text-xs">{opt}</span>
                                                            </label>
                                                        ))}
                                                    </div>
                                                )}

                                                {q.question_type === 'true_false' && (
                                                    <div className="flex gap-4 mt-2">
                                                        {['True', 'False'].map(opt => (
                                                            <label key={opt} className={`flex-1 flex justify-center p-3 rounded-none border transition-all cursor-pointer ${answers[i] === opt ? 'bg-amber-500/20 border-amber-500 text-amber-400' : 'bg-card shadow-sm border-border text-muted-foreground hover:bg-muted'}`}>
                                                                <input type="radio" value={opt} checked={answers[i] === opt} onChange={e => setAnswers({ ...answers, [i]: e.target.value })} className="hidden" />
                                                                <span className="text-xs font-bold tracking-widest uppercase">{opt}</span>
                                                            </label>
                                                        ))}
                                                    </div>
                                                )}

                                                {(q.question_type === 'essay' || q.question_type === 'fill_blank') && (
                                                    <input type="text" value={answers[i] || ''} onChange={e => setAnswers({ ...answers, [i]: e.target.value })} placeholder="Type your answer here…" className="w-full px-4 py-2.5 bg-card shadow-sm border border-border rounded-none text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-amber-500 transition-colors" />
                                                )}

                                                {q.question_type === 'coding_blocks' && (
                                                    <CodingBlocksChallenge
                                                        question={q}
                                                        value={answers[i] || ''}
                                                        onChange={(val) => setAnswers({ ...answers, [i]: val })}
                                                    />
                                                )}

                                                {q.question_type === 'block_sequence' && (
                                                    <BlockSequencer
                                                        blocks={q.metadata?.blocks ?? []}
                                                        value={answers[i] || ''}
                                                        onChange={(val) => setAnswers({ ...answers, [i]: val })}
                                                        readOnly={!!submission}
                                                    />
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* Coding Assignment: inline code editor */}
                                {isCodingAssignment && (
                                    <div className="space-y-3">
                                        <div className="flex items-center justify-between">
                                            <label className="text-xs font-black text-emerald-400 uppercase tracking-widest flex items-center gap-2">
                                                <CodeBracketIcon className="w-4 h-4" /> Code Your Solution
                                            </label>
                                            <Link href={`/dashboard/playground?assignmentId=${id}`}
                                                className="text-[9px] font-black uppercase tracking-widest text-emerald-400/50 hover:text-emerald-400 transition-colors flex items-center gap-1">
                                                <RocketLaunchIcon className="w-3 h-3" /> Open Full Playground →
                                            </Link>
                                        </div>
                                        <div className="border border-emerald-500/20 overflow-hidden">
                                            <IntegratedCodeRunner
                                                language="python"
                                                value={codeAnswer}
                                                onChange={(v) => setCodeAnswer(v || '')}
                                                title={assignment.title}
                                                height={320}
                                                onRun={() => {}}
                                            />
                                        </div>
                                        <p className="text-[9px] text-white/30 font-medium">
                                            Write and test your code above. It will be submitted with your solution.
                                        </p>
                                    </div>
                                )}

                                <div>
                                    <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">
                                        {isCodingAssignment ? 'Notes / Explanation (optional)' : assignment.questions?.length > 0 ? 'Additional Comments / Notes' : 'Your Answer / Work'}
                                    </label>
                                    <textarea
                                        rows={isCodingAssignment ? 2 : assignment.questions?.length > 0 ? 3 : 6}
                                        value={text}
                                        onChange={e => setText(e.target.value)}
                                        placeholder={isCodingAssignment ? "Explain your approach or any notes for the teacher…" : assignment.questions?.length > 0 ? "Any additional notes about your submission…" : "Write your answer, explanation, or paste your link here…"}
                                        className="w-full px-4 py-3 bg-card shadow-sm border border-border rounded-none text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-amber-500 transition-colors resize-none"
                                    />
                                </div>

                                {/* File attachment */}
                                <div>
                                    <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">
                                        Attach a File <span className="normal-case font-normal text-muted-foreground">(optional — PDF, image, doc · max 10 MB)</span>
                                    </label>
                                    {fileUrl ? (
                                        <div className="space-y-2">
                                            {/* Inline image preview */}
                                            {attachedFile && attachedFile.type.startsWith('image/') ? (
                                                <div className="relative">
                                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                                    <img src={fileUrl} alt="Uploaded photo" className="w-full max-h-64 object-contain bg-black/20 border border-border rounded-none" />
                                                    <button type="button" onClick={() => { setAttachedFile(null); setFileUrl(null); }}
                                                        className="absolute top-2 right-2 px-2 py-1 bg-rose-500/80 hover:bg-rose-500 text-white text-[10px] font-black uppercase rounded-none transition-colors">
                                                        Remove
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-3 px-4 py-3 bg-emerald-500/10 border border-emerald-500/20 rounded-none">
                                                    <PaperClipIcon className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                                                    <a href={fileUrl} target="_blank" rel="noopener noreferrer"
                                                        className="text-sm text-emerald-400 hover:text-emerald-300 truncate flex-1">{attachedFile?.name}</a>
                                                    <button type="button" onClick={() => { setAttachedFile(null); setFileUrl(null); }}
                                                        className="text-muted-foreground hover:text-foreground text-xs font-bold ml-auto flex-shrink-0">Remove</button>
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="space-y-2">
                                            {/* Camera capture (mobile) + file picker */}
                                            <div className="grid grid-cols-2 gap-2">
                                                <label className={`flex flex-col items-center justify-center gap-2 px-4 py-4 border-2 border-dashed rounded-none cursor-pointer transition-all text-center ${uploadingFile ? 'border-amber-500/30 bg-amber-500/5' : 'border-border hover:border-amber-500/40 hover:bg-amber-500/5'}`}>
                                                    <span className="text-2xl">📷</span>
                                                    <span className="text-xs font-bold text-muted-foreground">Take Photo</span>
                                                    <span className="text-[10px] text-muted-foreground">Camera</span>
                                                    <input type="file" className="hidden"
                                                        accept="image/*"
                                                        capture="environment"
                                                        onChange={e => handleFileChange(e.target.files?.[0] ?? null)} />
                                                </label>
                                                <label className={`flex flex-col items-center justify-center gap-2 px-4 py-4 border-2 border-dashed rounded-none cursor-pointer transition-all text-center ${uploadingFile ? 'border-amber-500/30 bg-amber-500/5' : 'border-border hover:border-amber-500/40 hover:bg-amber-500/5'}`}>
                                                    <span className="text-2xl">📎</span>
                                                    <span className="text-xs font-bold text-muted-foreground">Upload File</span>
                                                    <span className="text-[10px] text-muted-foreground">PDF, image, doc</span>
                                                    <input type="file" className="hidden"
                                                        accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg,.gif,.zip"
                                                        onChange={e => handleFileChange(e.target.files?.[0] ?? null)} />
                                                </label>
                                            </div>
                                            {uploadingFile && (
                                                <div className="flex items-center gap-2 px-4 py-2 bg-amber-500/10 border border-amber-500/20 rounded-none">
                                                    <div className="w-4 h-4 border-2 border-amber-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                                                    <span className="text-sm text-amber-400">Uploading…</span>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                    {fileError && <p className="text-xs text-rose-400 mt-1.5">{fileError}</p>}
                                </div>

                                {error && (
                                    <div className="flex items-center gap-2 text-rose-400 text-sm">
                                        <ExclamationTriangleIcon className="w-4 h-4" /> {error}
                                    </div>
                                )}
                                {/* Bottom submit — desktop only (mobile uses the fixed bar above) */}
                                <button type="submit" disabled={submitting || uploadingFile || (isCodingAssignment ? !codeAnswer.trim() : assignment.questions?.length > 0 ? Object.keys(answers).length === 0 : !text.trim() && !fileUrl)}
                                    className="hidden sm:flex items-center gap-2 px-6 py-3 bg-[#7a0606] hover:bg-red-700 disabled:opacity-40 text-white font-black rounded-xl transition-all shadow-lg shadow-red-900/30">
                                    {submitting
                                        ? <><ArrowPathIcon className="w-4 h-4 animate-spin" /> Submitting…</>
                                        : <><ArrowUpTrayIcon className="w-4 h-4" /> {submission ? 'Resubmit' : 'Submit Exam'}</>
                                    }
                                </button>
                            </form>
                        )}
                    </div>
                )}

                {/* ── STAFF VIEW: All Submissions ── */}
                {isStaff && allSubs.length > 0 && (
                    <div className="bg-card shadow-sm border border-border rounded-none overflow-hidden">
                        <div className="p-5 border-b border-border">
                            <h2 className="font-bold text-foreground">All Submissions</h2>
                        </div>
                        <div className="divide-y divide-white/5">
                            {allSubs.map((s: any) => (
                                <div key={s.id} className="flex items-center gap-3 p-3 sm:p-4 hover:bg-card transition-colors flex-wrap sm:flex-nowrap">
                                    {/* Avatar + name */}
                                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-600 to-orange-400 flex items-center justify-center text-xs font-black text-foreground flex-shrink-0">
                                        {(s.portal_users?.full_name ?? '?')[0]}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-semibold text-foreground truncate">{s.portal_users?.full_name ?? 'Student'}</p>
                                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                            <Badge status={s.status} />
                                            {s.submitted_at && (
                                                <p className="text-xs text-muted-foreground hidden sm:block">
                                                    {new Date(s.submitted_at).toLocaleString()}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                    {/* Photo thumbnail */}
                                    {s.file_url && /\.(png|jpe?g|gif|webp|bmp|heic)(\?|$)/i.test(s.file_url) && (
                                        <button type="button" onClick={() => setGrading(s)}
                                            className="flex-shrink-0 w-10 h-10 overflow-hidden border border-border rounded-none hover:border-amber-500/40 transition-colors"
                                            title="View photo submission">
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img src={s.file_url} alt="" className="w-full h-full object-cover" />
                                        </button>
                                    )}
                                    {s.grade != null && (
                                        <span className="text-emerald-400 font-bold text-sm flex-shrink-0">{s.grade}/{assignment.max_points}</span>
                                    )}
                                    <button onClick={() => setGrading(s)}
                                        className="px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 text-xs font-bold rounded-none transition-colors flex-shrink-0 ml-auto sm:ml-0">
                                        {s.status === 'graded' ? 'Re-grade' : 'Grade'}
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

            </div>
        </div>
    );
}
