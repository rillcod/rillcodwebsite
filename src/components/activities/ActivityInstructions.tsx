'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import dynamic from 'next/dynamic';

// Lottie loaded client-only (large lib)
const Lottie = dynamic(() => import('lottie-react'), { ssr: false });

// ── Instruction parser ────────────────────────────────────────────────────────

interface ParsedStep {
    number: number;
    title: string;
    body: string;
}

interface ParsedSection {
    heading: string;
    items: string[];
}

interface ParsedInstructions {
    intro: string;
    steps: ParsedStep[];
    sections: ParsedSection[];   // Requirements, Deliverables, etc.
    notes: string[];
}

function parseInstructions(raw: string): ParsedInstructions {
    const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);

    const steps: ParsedStep[] = [];
    const sections: ParsedSection[] = [];
    const notes: string[] = [];
    const introLines: string[] = [];

    // Patterns
    const stepPattern = /^(?:step\s*)?(\d+)[.:)]\s+(.+)/i;
    const headingPattern = /^#{1,3}\s+(.+)|^([A-Z][A-Za-z\s]+):$/;
    const bulletPattern = /^[-•*]\s+(.+)/;
    const notePattern = /^(?:note|tip|hint|important)[.:]\s+(.+)/i;

    let currentSection: ParsedSection | null = null;
    let currentStep: ParsedStep | null = null;
    let stepNum = 0;
    let introPhase = true;

    for (const line of lines) {
        const stepMatch = line.match(stepPattern);
        const headingMatch = line.match(headingPattern);
        const bulletMatch = line.match(bulletPattern);
        const noteMatch = line.match(notePattern);

        if (stepMatch) {
            introPhase = false;
            if (currentStep) steps.push(currentStep);
            stepNum++;
            currentStep = { number: stepNum, title: stepMatch[2], body: '' };
            currentSection = null;
            continue;
        }

        if (noteMatch) {
            notes.push(noteMatch[1]);
            continue;
        }

        if (headingMatch) {
            introPhase = false;
            if (currentStep) { steps.push(currentStep); currentStep = null; }
            currentSection = { heading: headingMatch[1] || headingMatch[2].replace(/:$/, ''), items: [] };
            sections.push(currentSection);
            continue;
        }

        if (bulletMatch) {
            introPhase = false;
            if (currentSection) {
                currentSection.items.push(bulletMatch[1]);
            } else if (currentStep) {
                currentStep.body += (currentStep.body ? '\n' : '') + '• ' + bulletMatch[1];
            } else {
                // Bullet with no section — treat as a step
                stepNum++;
                steps.push({ number: stepNum, title: bulletMatch[1], body: '' });
            }
            continue;
        }

        // Plain continuation line
        if (currentStep) {
            currentStep.body += (currentStep.body ? ' ' : '') + line;
        } else if (currentSection) {
            currentSection.items.push(line);
        } else if (introPhase) {
            introLines.push(line);
        }
    }

    if (currentStep) steps.push(currentStep);

    return { intro: introLines.join(' '), steps, sections, notes };
}

// ── Sub-components ────────────────────────────────────────────────────────────

const CATEGORY_COLOR: Record<string, string> = {
    coding:       'bg-violet-500/15 border-violet-500/30 text-violet-300',
    web:          'bg-blue-500/15 border-blue-500/30 text-blue-300',
    ai:           'bg-cyan-500/15 border-cyan-500/30 text-cyan-300',
    design:       'bg-pink-500/15 border-pink-500/30 text-pink-300',
    research:     'bg-amber-500/15 border-amber-500/30 text-amber-300',
    hardware:     'bg-emerald-500/15 border-emerald-500/30 text-emerald-300',
    presentation: 'bg-primary/15 border-primary/30 text-primary',
    robotics:     'bg-emerald-500/15 border-emerald-500/30 text-emerald-300',
};

const DIFFICULTY_COLOR: Record<string, string> = {
    beginner:     'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
    intermediate: 'bg-amber-500/10 border-amber-500/20 text-amber-400',
    advanced:     'bg-rose-500/10 border-rose-500/20 text-rose-400',
};

const SUBMISSION_ICON: Record<string, string> = {
    link:       '🔗',
    code:       '💻',
    file:       '📄',
    screenshot: '📸',
    text:       '✍️',
};

// ── Main component ────────────────────────────────────────────────────────────

export interface ActivityMeta {
    category?: string;
    difficulty?: string;
    submission_types?: string[];
    tags?: string[];
}

/** Rebuild plain-text instructions from edited steps */
function reconstructInstructions(intro: string, steps: ParsedStep[], sections: ParsedSection[], notes: string[]): string {
    const parts: string[] = [];
    if (intro) parts.push(intro);
    sections.forEach(s => {
        parts.push(`## ${s.heading}`);
        s.items.forEach(i => parts.push(`- ${i}`));
    });
    steps.forEach(s => {
        parts.push(`${s.number}. ${s.title}`);
        if (s.body) parts.push(s.body);
    });
    notes.forEach(n => parts.push(`Note: ${n}`));
    return parts.join('\n');
}

interface Props {
    instructions: string;
    meta?: ActivityMeta;
    /** Student mode — shows checkboxes to track progress */
    studentMode?: boolean;
    /** Teacher mode — editable inline */
    teacherMode?: boolean;
    /** Called with updated instructions text when teacher saves */
    onUpdate?: (newInstructions: string) => Promise<void> | void;
}

export default function ActivityInstructions({ instructions, meta = {}, studentMode, teacherMode, onUpdate }: Props) {
    const parsed = parseInstructions(instructions);
    const [checked, setChecked] = useState<Record<number, boolean>>({});
    const [expanded, setExpanded] = useState(true);
    const [confettiData, setConfettiData] = useState<any>(null);
    const [showConfetti, setShowConfetti] = useState(false);
    const prevDone = useRef(0);

    // ── Edit state (teacher mode) ──────────────────────────────────────────
    const [editingStep, setEditingStep] = useState<number | null>(null);
    const [editStepTitle, setEditStepTitle] = useState('');
    const [editStepBody, setEditStepBody] = useState('');
    const [editIntro, setEditIntro] = useState(parsed.intro);
    const [editingIntro, setEditingIntro] = useState(false);
    const [localSteps, setLocalSteps] = useState<ParsedStep[]>(parsed.steps);
    const [saving, setSaving] = useState(false);

    // Keep local steps in sync if instructions prop changes externally
    useEffect(() => {
        const p = parseInstructions(instructions);
        setLocalSteps(p.steps);
        setEditIntro(p.intro);
    }, [instructions]);

    function startEditStep(step: ParsedStep) {
        setEditingStep(step.number);
        setEditStepTitle(step.title);
        setEditStepBody(step.body);
    }

    function saveStep() {
        setLocalSteps(prev => prev.map(s =>
            s.number === editingStep
                ? { ...s, title: editStepTitle.trim(), body: editStepBody.trim() }
                : s
        ));
        setEditingStep(null);
    }

    function deleteStep(num: number) {
        setLocalSteps(prev =>
            prev.filter(s => s.number !== num)
                .map((s, i) => ({ ...s, number: i + 1 }))
        );
        setChecked({});
    }

    function addStep() {
        const newNum = localSteps.length + 1;
        const newStep: ParsedStep = { number: newNum, title: 'New step', body: '' };
        setLocalSteps(prev => [...prev, newStep]);
        startEditStep(newStep);
    }

    async function handleSaveAll() {
        if (!onUpdate) return;
        setSaving(true);
        try {
            const rebuilt = reconstructInstructions(editIntro, localSteps, parsed.sections, parsed.notes);
            await onUpdate(rebuilt);
        } finally {
            setSaving(false);
        }
    }

    const totalSteps = localSteps.length;
    const doneSteps = Object.values(checked).filter(Boolean).length;
    const progress = totalSteps > 0 ? Math.round((doneSteps / totalSteps) * 100) : 0;

    // Load confetti animation JSON lazily
    useEffect(() => {
        if (!confettiData) {
            fetch('https://assets10.lottiefiles.com/packages/lf20_touohxv0.json')
                .then(r => r.json())
                .then(setConfettiData)
                .catch(() => {});
        }
    }, [confettiData]);

    // Trigger confetti when all steps completed (student and teacher mode)
    useEffect(() => {
        if (totalSteps > 0 && doneSteps === totalSteps && prevDone.current < totalSteps) {
            setShowConfetti(true);
            setTimeout(() => setShowConfetti(false), 4000);
        }
        prevDone.current = doneSteps;
    }, [doneSteps, totalSteps]);

    const toggleStep = (n: number) => setChecked(p => ({ ...p, [n]: !p[n] }));

    return (
        <div className="space-y-4 relative">

            {/* ── Lottie confetti overlay ── */}
            <AnimatePresence>
                {showConfetti && confettiData && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 pointer-events-none z-50 flex items-center justify-center"
                    >
                        <Lottie
                            animationData={confettiData}
                            loop={false}
                            style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }}
                        />
                        <div className="relative text-center space-y-2 px-8 py-6 bg-black/60 backdrop-blur-md border border-emerald-500/30">
                            <p className="text-2xl font-black text-white">🎉 All Steps Done!</p>
                            <p className="text-sm text-emerald-400 font-bold">You're ready to submit your project.</p>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── Meta badges ── */}
            {(meta.category || meta.difficulty || meta.submission_types?.length || meta.tags?.length) && (
                <div className="flex flex-wrap gap-2">
                    {meta.category && (
                        <span className={`px-2.5 py-1 border text-[10px] font-black uppercase tracking-widest ${CATEGORY_COLOR[meta.category] ?? 'bg-white/5 border-white/10 text-white/50'}`}>
                            {meta.category}
                        </span>
                    )}
                    {meta.difficulty && (
                        <span className={`px-2.5 py-1 border text-[10px] font-black uppercase tracking-widest ${DIFFICULTY_COLOR[meta.difficulty] ?? 'bg-white/5 border-white/10 text-white/50'}`}>
                            {meta.difficulty}
                        </span>
                    )}
                    {meta.submission_types?.map(t => (
                        <span key={t} className="px-2.5 py-1 bg-white/5 border border-white/10 text-[10px] font-bold text-white/40 uppercase tracking-widest flex items-center gap-1">
                            {SUBMISSION_ICON[t] ?? '📋'} {t}
                        </span>
                    ))}
                    {meta.tags?.slice(0, 4).map(tag => (
                        <span key={tag} className="px-2 py-0.5 bg-primary/10 border border-primary/15 text-[9px] font-bold text-primary/70 uppercase tracking-widest">
                            #{tag}
                        </span>
                    ))}
                </div>
            )}

            {/* ── Progress bar (student and teacher mode) ── */}
            {totalSteps > 0 && (
                <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black text-white/30 uppercase tracking-widest">Your Progress</span>
                        <span className="text-[10px] font-black text-primary">{doneSteps}/{totalSteps} steps</span>
                    </div>
                    <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                        <motion.div
                            className="h-full bg-gradient-to-r from-primary to-amber-400 rounded-full"
                            initial={{ width: 0 }}
                            animate={{ width: `${progress}%` }}
                            transition={{ duration: 0.5 }}
                        />
                    </div>
                    {progress === 100 && (
                        <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">
                            ✓ All steps completed — ready to submit!
                        </p>
                    )}
                </div>
            )}

            {/* ── Intro ── */}
            {teacherMode ? (
                editingIntro ? (
                    <div className="space-y-2">
                        <textarea
                            value={editIntro}
                            onChange={e => setEditIntro(e.target.value)}
                            rows={2}
                            autoFocus
                            className="w-full bg-white/5 border border-primary/40 px-3 py-2 text-sm text-white/80 outline-none resize-none"
                        />
                        <div className="flex gap-2">
                            <button onClick={() => setEditingIntro(false)}
                                className="px-3 py-1 bg-primary text-white text-[10px] font-black uppercase tracking-widest">Done</button>
                            <button onClick={() => setEditingIntro(false)}
                                className="px-3 py-1 bg-white/5 text-white/40 text-[10px] font-black uppercase tracking-widest">Cancel</button>
                        </div>
                    </div>
                ) : editIntro ? (
                    <div className="group flex items-start gap-2">
                        <p className="flex-1 text-sm text-white/60 leading-relaxed border-l-2 border-primary/30 pl-4">{editIntro}</p>
                        <button onClick={() => setEditingIntro(true)}
                            className="opacity-0 group-hover:opacity-100 text-[9px] text-primary font-black uppercase tracking-widest px-2 py-1 border border-primary/20 hover:bg-primary/10 transition-all shrink-0">
                            Edit
                        </button>
                    </div>
                ) : (
                    <button onClick={() => setEditingIntro(true)}
                        className="text-[10px] text-white/20 hover:text-primary font-black uppercase tracking-widest transition-colors">
                        + Add intro text
                    </button>
                )
            ) : (
                parsed.intro && (
                    <p className="text-sm text-white/60 leading-relaxed border-l-2 border-primary/30 pl-4">
                        {parsed.intro}
                    </p>
                )
            )}

            {/* ── Sections (Requirements, Deliverables, etc.) ── */}
            {parsed.sections.map((sec, si) => (
                <div key={si} className="bg-white/[0.02] border border-white/[0.06] p-4 space-y-2">
                    <p className="text-[10px] font-black text-white/40 uppercase tracking-widest">{sec.heading}</p>
                    <ul className="space-y-1.5">
                        {sec.items.map((item, ii) => (
                            <li key={ii} className="flex items-start gap-2 text-sm text-white/60">
                                <span className="w-1.5 h-1.5 rounded-full bg-primary/60 mt-1.5 shrink-0" />
                                {item}
                            </li>
                        ))}
                    </ul>
                </div>
            ))}

            {/* ── Steps ── */}
            {(localSteps.length > 0 || teacherMode) && (
                <div className="space-y-2">
                    {/* Collapse toggle + save button for teacher mode */}
                    {teacherMode && (
                        <div className="flex items-center justify-between">
                            <button
                                onClick={() => setExpanded(e => !e)}
                                className="flex items-center gap-2 text-[10px] font-black text-white/30 uppercase tracking-widest hover:text-white/60 transition-colors"
                            >
                                <span>{expanded ? '▾' : '▸'}</span>
                                {totalSteps} Steps
                            </button>
                            {onUpdate && (
                                <button
                                    onClick={handleSaveAll}
                                    disabled={saving}
                                    className="flex items-center gap-1.5 px-3 py-1 bg-primary hover:bg-primary disabled:opacity-50 text-white text-[9px] font-black uppercase tracking-widest transition-all"
                                >
                                    {saving ? '...' : '✓ Save Changes'}
                                </button>
                            )}
                        </div>
                    )}

                    <AnimatePresence initial={false}>
                        {(expanded || !teacherMode) && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                className="space-y-2 overflow-hidden"
                            >
                                {localSteps.map((step, i) => {
                                    const done = !!checked[step.number];
                                    const isEditing = teacherMode && editingStep === step.number;

                                    return (
                                        <motion.div
                                            key={step.number}
                                            initial={{ opacity: 0, x: -8 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ delay: i * 0.04 }}
                                            className={`flex gap-3 p-4 border transition-all ${
                                                isEditing
                                                    ? 'border-primary/40 bg-primary/5'
                                                    : done
                                                    ? 'border-emerald-500/20 bg-emerald-500/5'
                                                    : 'border-white/[0.06] bg-white/[0.02] hover:border-primary/20'
                                            }`}
                                        >
                                            {/* Checkbox / step number */}
                                            <button
                                                onClick={() => !isEditing && toggleStep(step.number)}
                                                className={`w-7 h-7 shrink-0 border-2 flex items-center justify-center transition-all mt-0.5 ${
                                                    done
                                                        ? 'bg-emerald-500 border-emerald-500 text-white'
                                                        : 'border-white/20 hover:border-primary text-transparent'
                                                }`}
                                            >
                                                {done ? (
                                                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
                                                        <polyline points="20 6 9 17 4 12" />
                                                    </svg>
                                                ) : (
                                                    <span className="text-[11px] font-black text-primary/60">{step.number}</span>
                                                )}
                                            </button>

                                            {/* Content — editable for teacher */}
                                            <div className="flex-1 min-w-0">
                                                {isEditing ? (
                                                    <div className="space-y-2">
                                                        <input
                                                            autoFocus
                                                            value={editStepTitle}
                                                            onChange={e => setEditStepTitle(e.target.value)}
                                                            className="w-full bg-white/5 border border-primary/30 px-2 py-1 text-sm text-white outline-none"
                                                            placeholder="Step title"
                                                        />
                                                        <textarea
                                                            value={editStepBody}
                                                            onChange={e => setEditStepBody(e.target.value)}
                                                            rows={2}
                                                            className="w-full bg-white/5 border border-white/10 px-2 py-1 text-xs text-white/60 outline-none resize-none"
                                                            placeholder="Extra detail (optional)"
                                                        />
                                                        <div className="flex gap-2">
                                                            <button onClick={saveStep}
                                                                className="px-3 py-1 bg-primary text-white text-[9px] font-black uppercase tracking-widest">
                                                                Save
                                                            </button>
                                                            <button onClick={() => setEditingStep(null)}
                                                                className="px-3 py-1 bg-white/5 text-white/40 text-[9px] font-black uppercase tracking-widest">
                                                                Cancel
                                                            </button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <>
                                                        <p className={`text-sm font-bold leading-snug ${done ? 'text-white/40 line-through' : 'text-white/90'}`}>
                                                            {step.title}
                                                        </p>
                                                        {step.body && (
                                                            <p className="text-xs text-white/40 mt-1 leading-relaxed">{step.body}</p>
                                                        )}
                                                    </>
                                                )}
                                            </div>

                                            {/* Teacher action buttons */}
                                            {teacherMode && !isEditing && (
                                                <div className="flex items-start gap-1 shrink-0 opacity-0 group-hover:opacity-100 ml-1">
                                                    <button
                                                        onClick={() => startEditStep(step)}
                                                        className="p-1 text-white/20 hover:text-primary transition-colors"
                                                        title="Edit step"
                                                    >
                                                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                                                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                                        </svg>
                                                    </button>
                                                    <button
                                                        onClick={() => deleteStep(step.number)}
                                                        className="p-1 text-white/20 hover:text-rose-400 transition-colors"
                                                        title="Delete step"
                                                    >
                                                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                                                            <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" />
                                                        </svg>
                                                    </button>
                                                </div>
                                            )}
                                        </motion.div>
                                    );
                                })}

                                {/* Add step button — teacher only */}
                                {teacherMode && (
                                    <button
                                        onClick={addStep}
                                        className="w-full py-2.5 border border-dashed border-white/10 hover:border-primary/30 text-white/20 hover:text-primary text-[10px] font-black uppercase tracking-widest transition-all"
                                    >
                                        + Add Step
                                    </button>
                                )}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            )}

            {/* ── Notes / Tips ── */}
            {parsed.notes.map((note, ni) => (
                <div key={ni} className="flex gap-2.5 p-3 bg-cyan-500/5 border border-cyan-500/15">
                    <span className="text-base shrink-0">💡</span>
                    <p className="text-xs text-cyan-300/70 leading-relaxed">{note}</p>
                </div>
            ))}

            {/* ── Fallback: no structure detected — render as readable prose ── */}
            {parsed.steps.length === 0 && parsed.sections.length === 0 && !parsed.intro && (
                <div className="text-sm text-white/60 leading-relaxed whitespace-pre-line">
                    {instructions}
                </div>
            )}
        </div>
    );
}
