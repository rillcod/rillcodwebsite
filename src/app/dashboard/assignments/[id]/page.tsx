'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import { submitAssignment, gradeSubmission } from '@/services/dashboard.service';
import {
    ArrowLeftIcon, CalendarIcon, ClockIcon, DocumentTextIcon,
    CheckCircleIcon, ExclamationTriangleIcon, ArrowUpTrayIcon,
    PaperClipIcon, AcademicCapIcon, StarIcon, XMarkIcon, ArrowPathIcon, CheckIcon, PencilIcon
} from '@heroicons/react/24/outline';

function pctInfo(grade: number, max: number) {
    const pct = Math.round((grade / max) * 100);
    const letter = pct >= 90 ? 'A' : pct >= 80 ? 'B' : pct >= 70 ? 'C' : pct >= 60 ? 'D' : 'F';
    const color = pct >= 70 ? 'emerald' : pct >= 50 ? 'amber' : 'rose';
    return { pct, letter, color };
}

function GradeModal({ sub, maxPoints, assignmentTitle, questions, onClose, onSaved }: {
    sub: any;
    maxPoints: number;
    assignmentTitle: string;
    questions?: any[];
    onClose: () => void;
    onSaved: (id: string, grade: number, feedback: string) => void;
}) {
    const { profile } = useAuth();
    const max = maxPoints ?? 100;
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
                        <p className="text-sm text-white/40 mt-0.5">{assignmentTitle}</p>
                        <div className="flex items-center gap-2 mt-2">
                            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-600 to-blue-600 flex items-center justify-center text-xs font-black text-white">
                                {(sub.portal_users?.full_name ?? '?')[0]}
                            </div>
                            <span className="text-sm text-white/70">{sub.portal_users?.full_name ?? 'Student'}</span>
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
                    {questions && questions.length > 0 && sub.answers && (
                        <div className="bg-white/5 border border-white/10 rounded-xl p-4 max-h-60 overflow-y-auto space-y-4">
                            <p className="text-xs text-white/30 uppercase tracking-wider mb-2">Student Answers</p>
                            {questions.map((q: any, idx: number) => (
                                <div key={idx} className="bg-white/3 rounded-lg p-3 border border-white/5">
                                    <div className="flex justify-between items-start mb-2">
                                        <p className="text-sm font-semibold text-white/90">{q.question_text}</p>
                                        <span className="text-[10px] text-white/40">{q.points} pt{q.points !== 1 && 's'}</span>
                                    </div>
                                    <div className="text-sm text-white/70 bg-black/20 p-2 rounded">
                                        <span className="text-white font-medium">{sub.answers?.[idx] || <span className="text-white/30 italic">No answer provided</span>}</span>
                                    </div>
                                    {q.question_type === 'multiple_choice' && q.correct_answer && (
                                        <p className="text-xs text-emerald-400 mt-2 font-semibold">Correct Answer: {q.correct_answer}</p>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                    {sub.file_url && (
                        <a href={sub.file_url} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 underline">
                            📎 View attached file
                        </a>
                    )}
                    {!sub.submission_text && !sub.file_url && (!sub.answers || Object.keys(sub.answers as object).length === 0) && sub.status !== 'missing' && (
                        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-sm text-amber-400">
                            No text, file, or answers submitted — grade based on verbal/in-person work if applicable.
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
                                    <div className={`flex items-center gap-2 ${info.color === 'emerald' ? 'text-emerald-400' : info.color === 'amber' ? 'text-amber-400' : 'text-rose-400'}`}>
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

function Badge({ status }: { status: string }) {
    const map: Record<string, string> = {
        submitted: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
        graded: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
        late: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
        missing: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
    };
    return (
        <span className={`px-3 py-1 rounded-full text-xs font-bold border capitalize ${map[status] ?? 'bg-white/10 text-white/40'}`}>
            {status}
        </span>
    );
}

export default function AssignmentDetailPage() {
    const params = useParams();
    const id = params?.id as string;
    const router = useRouter();
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
    const [attachedFile, setAttachedFile] = useState<File | null>(null);
    const [uploadingFile, setUploadingFile] = useState(false);
    const [fileUrl, setFileUrl] = useState<string | null>(null);
    const [fileError, setFileError] = useState<string | null>(null);

    const isStaff = profile?.role === 'admin' || profile?.role === 'teacher';

    const handleGraded = (id: string, grade: number, feedback: string) => {
        setAssignment((prev: any) => {
            if (!prev) return prev;
            return {
                ...prev,
                assignment_submissions: prev.assignment_submissions.map((s: any) =>
                    s.id === id ? { ...s, grade, feedback, status: 'graded', graded_at: new Date().toISOString() } : s
                )
            };
        });
    };

    useEffect(() => {
        if (authLoading || !profile || !id) return;
        let cancelled = false;
        const supabase = createClient();

        async function load() {
            setLoading(true);
            setError(null);
            try {
                // Fetch assignment
                const { data: aData, error: aErr } = await supabase
                    .from('assignments')
                    .select(`
            id, title, description, instructions, due_date, max_points,
            assignment_type, is_active, created_at, questions,
            courses ( id, title, programs ( name ) ),
            assignment_submissions ( id, status, grade, feedback, submitted_at, graded_at, portal_user_id, submission_text, file_url, answers, portal_users!assignment_submissions_portal_user_id_fkey ( full_name, email ) )
          `)
                    .eq('id', id)
                    .single();
                if (aErr) throw aErr;
                if (!cancelled) setAssignment(aData);

                // For student, find their submission (guard against select error type)
                if (!isStaff) {
                    const submissions = Array.isArray(aData?.assignment_submissions)
                        ? aData.assignment_submissions
                        : [];
                    const mySub = submissions.find(
                        (s: any) => s.portal_user_id === profile!.id
                    );
                    if (!cancelled) setSubmission(mySub ?? null);
                }
            } catch (e: any) {
                if (!cancelled) setError(e.message ?? 'Failed to load assignment');
            } finally {
                if (!cancelled) setLoading(false);
            }
        }
        load();
        return () => { cancelled = true; };
    }, [authLoading, profile, id, isStaff]);

    const handleFileChange = async (file: File | null) => {
        setAttachedFile(file);
        setFileUrl(null);
        setFileError(null);
        if (!file || !profile) return;
        // Validate size (10 MB) and type
        if (file.size > 10 * 1024 * 1024) { setFileError('File too large (max 10 MB)'); return; }
        setUploadingFile(true);
        try {
            const db = createClient();
            const ext = file.name.split('.').pop();
            const path = `submissions/${profile.id}/${assignment?.id ?? 'misc'}/${Date.now()}.${ext}`;
            const { error: uploadErr } = await db.storage.from('assignments').upload(path, file, { upsert: true });
            if (uploadErr) throw uploadErr;
            const { data: urlData } = db.storage.from('assignments').getPublicUrl(path);
            setFileUrl(urlData.publicUrl);
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
        if (uploadingFile) return; // wait for upload to finish
        setSubmitting(true);
        try {
            const result = await submitAssignment({
                assignment_id: assignment.id,
                portal_user_id: profile.id,
                submission_text: text,
                answers: Object.keys(answers).length > 0 ? answers : null,
                file_url: fileUrl ?? undefined,
            } as any);
            setSubmission(result);
            setSubmitDone(true);
            setText('');
        } catch (e: any) {
            setError(e.message ?? 'Failed to submit');
        } finally {
            setSubmitting(false);
        }
    };

    const isOverdue = assignment?.due_date && new Date(assignment.due_date) < new Date();
    const allSubs = Array.isArray(assignment?.assignment_submissions)
        ? assignment.assignment_submissions
        : [];
    const submitted = allSubs.filter((s: any) => s.status === 'submitted').length;
    const graded = allSubs.filter((s: any) => s.status === 'graded').length;
    const pct = submission?.grade != null
        ? Math.round((submission.grade / (assignment?.max_points ?? 100)) * 100) : null;
    const letter = pct == null ? null
        : pct >= 90 ? 'A' : pct >= 80 ? 'B' : pct >= 70 ? 'C' : pct >= 60 ? 'D' : 'F';

    if (authLoading || loading) return (
        <div className="min-h-screen bg-[#0f0f1a] flex items-center justify-center">
            <div className="flex flex-col items-center gap-3">
                <div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
                <p className="text-white/40 text-sm">Loading assignment…</p>
            </div>
        </div>
    );

    if (error) return (
        <div className="min-h-screen bg-[#0f0f1a] flex items-center justify-center">
            <div className="text-center">
                <ExclamationTriangleIcon className="w-12 h-12 mx-auto text-rose-400 mb-3" />
                <p className="text-rose-400 font-semibold">{error}</p>
                <Link href="/dashboard/assignments" className="mt-4 inline-block text-violet-400 hover:text-violet-300 text-sm underline">
                    ← Back to Assignments
                </Link>
            </div>
        </div>
    );

    if (!assignment) return null;

    return (
        <div className="min-h-screen bg-[#0f0f1a] text-white">
            {grading && (
                <GradeModal
                    sub={grading}
                    maxPoints={assignment.max_points}
                    assignmentTitle={assignment.title}
                    questions={assignment.questions}
                    onClose={() => setGrading(null)}
                    onSaved={handleGraded}
                />
            )}
            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">

                {/* Back */}
                <Link href="/dashboard/assignments"
                    className="inline-flex items-center gap-2 text-sm text-white/40 hover:text-white transition-colors">
                    <ArrowLeftIcon className="w-4 h-4" /> Back to Assignments
                </Link>

                {/* Header Card */}
                <div className="bg-white/5 border border-white/10 rounded-2xl p-7">
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
                            <h1 className="text-2xl sm:text-3xl font-extrabold text-white">{assignment.title}</h1>
                            <p className="text-white/40 text-sm mt-1.5">
                                {assignment.courses?.title}
                                {assignment.courses?.programs?.name ? ` · ${assignment.courses.programs.name}` : ''}
                            </p>
                        </div>

                        {/* Staff edit button */}
                        {isStaff && (
                            <Link href={`/dashboard/assignments/${id}/edit`}
                                className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 text-xs font-bold rounded-xl transition-colors">
                                <PencilIcon className="w-3.5 h-3.5" /> Edit
                            </Link>
                        )}
                        {!isStaff && submission?.status && (
                            <div className="flex-shrink-0 text-right">
                                <Badge status={submission.status} />
                                {pct != null && (
                                    <div className="mt-2 text-center">
                                        <span className={`text-4xl font-black ${pct >= 70 ? 'text-emerald-400' : pct >= 50 ? 'text-amber-400' : 'text-rose-400'}`}>
                                            {letter}
                                        </span>
                                        <p className="text-white/40 text-xs">{pct}% · {submission.grade}/{assignment.max_points} pts</p>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Staff submission counts */}
                        {isStaff && (
                            <div className="flex gap-4 text-center flex-shrink-0">
                                <div>
                                    <p className="text-2xl font-black text-blue-400">{submitted}</p>
                                    <p className="text-xs text-white/30">Submitted</p>
                                </div>
                                <div>
                                    <p className="text-2xl font-black text-emerald-400">{graded}</p>
                                    <p className="text-xs text-white/30">Graded</p>
                                </div>
                                <div>
                                    <p className="text-2xl font-black text-amber-400">{allSubs.length}</p>
                                    <p className="text-xs text-white/30">Total</p>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Meta row */}
                    <div className="flex flex-wrap gap-4 mt-5 text-sm text-white/40">
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
                    <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
                        <h2 className="font-bold text-white mb-2 flex items-center gap-2">
                            <DocumentTextIcon className="w-4 h-4 text-violet-400" /> Description
                        </h2>
                        <p className="text-white/60 text-sm leading-relaxed whitespace-pre-wrap">{assignment.description}</p>
                    </div>
                )}

                {/* Instructions */}
                {assignment.instructions && (
                    <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-6">
                        <h2 className="font-bold text-amber-400 mb-2 flex items-center gap-2">
                            <AcademicCapIcon className="w-4 h-4" /> Instructions
                        </h2>
                        <p className="text-white/60 text-sm leading-relaxed whitespace-pre-wrap">{assignment.instructions}</p>
                    </div>
                )}

                {/* Teacher Feedback (student view) */}
                {!isStaff && submission?.feedback && (
                    <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-6">
                        <h2 className="font-bold text-emerald-400 mb-2 flex items-center gap-2">
                            <CheckCircleIcon className="w-4 h-4" /> Teacher Feedback
                        </h2>
                        <p className="text-white/70 text-sm leading-relaxed">{submission.feedback}</p>
                    </div>
                )}

                {/* ── STUDENT SUBMISSION FORM ── */}
                {!isStaff && (
                    <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
                        <h2 className="font-bold text-white mb-4 flex items-center gap-2">
                            <ArrowUpTrayIcon className="w-5 h-5 text-amber-400" />
                            {submission ? 'Your Submission' : 'Submit Assignment'}
                        </h2>

                        {submitDone && (
                            <div className="flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 mb-4">
                                <CheckCircleIcon className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                                <p className="text-emerald-400 text-sm font-semibold">Submitted successfully!</p>
                            </div>
                        )}

                        {submission?.status === 'graded' || submission?.status === 'submitted' ? (
                            <div className="text-center py-6 text-white/30 text-sm">
                                {submission.status === 'graded'
                                    ? 'This assignment has been graded. No further submissions accepted.'
                                    : 'Your assignment has been submitted and is pending review. You cannot resubmit.'}
                            </div>
                        ) : (
                            <form onSubmit={handleSubmit} className="space-y-6">
                                {assignment.questions && Array.isArray(assignment.questions) && assignment.questions.length > 0 && (
                                    <div className="space-y-6">
                                        {assignment.questions.map((q: any, i: number) => (
                                            <div key={i} className="bg-white/5 border border-white/10 rounded-xl p-5 space-y-3">
                                                <div className="flex justify-between items-start">
                                                    <h3 className="text-sm font-bold text-white/80">Question {i + 1}</h3>
                                                    <span className="text-[10px] text-white/30 uppercase font-black">{q.points} pts</span>
                                                </div>
                                                <p className="text-sm text-white/70 whitespace-pre-wrap">{q.question_text}</p>

                                                {q.question_type === 'multiple_choice' && (
                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                                                        {q.options?.map((opt: string, oi: number) => (
                                                            <label key={oi} className={`flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer ${answers[i] === opt ? 'bg-amber-500/20 border-amber-500 text-amber-400' : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'}`}>
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
                                                            <label key={opt} className={`flex-1 flex justify-center p-3 rounded-xl border transition-all cursor-pointer ${answers[i] === opt ? 'bg-amber-500/20 border-amber-500 text-amber-400' : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'}`}>
                                                                <input type="radio" value={opt} checked={answers[i] === opt} onChange={e => setAnswers({ ...answers, [i]: e.target.value })} className="hidden" />
                                                                <span className="text-xs font-bold tracking-widest uppercase">{opt}</span>
                                                            </label>
                                                        ))}
                                                    </div>
                                                )}

                                                {(q.question_type === 'essay' || q.question_type === 'fill_blank') && (
                                                    <input type="text" value={answers[i] || ''} onChange={e => setAnswers({ ...answers, [i]: e.target.value })} placeholder="Type your answer here…" className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/20 focus:outline-none focus:border-amber-500 transition-colors" />
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}

                                <div>
                                    <label className="block text-xs font-semibold text-white/40 uppercase tracking-widest mb-1.5">
                                        {assignment.questions?.length > 0 ? 'Additional Comments / Notes' : 'Your Answer / Work'}
                                    </label>
                                    <textarea
                                        rows={assignment.questions?.length > 0 ? 3 : 6}
                                        value={text}
                                        onChange={e => setText(e.target.value)}
                                        placeholder={assignment.questions?.length > 0 ? "Any additional notes about your submission…" : "Write your answer, explanation, or paste your link here…"}
                                        className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/25 focus:outline-none focus:border-amber-500 transition-colors resize-none"
                                    />
                                </div>

                                {/* File attachment */}
                                <div>
                                    <label className="block text-xs font-semibold text-white/40 uppercase tracking-widest mb-1.5">
                                        Attach a File <span className="normal-case font-normal text-white/20">(optional — PDF, image, doc · max 10 MB)</span>
                                    </label>
                                    {fileUrl ? (
                                        <div className="flex items-center gap-3 px-4 py-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                                            <PaperClipIcon className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                                            <a href={fileUrl} target="_blank" rel="noopener noreferrer"
                                                className="text-sm text-emerald-400 hover:text-emerald-300 truncate flex-1">{attachedFile?.name}</a>
                                            <button type="button" onClick={() => { setAttachedFile(null); setFileUrl(null); }}
                                                className="text-white/30 hover:text-white text-xs font-bold ml-auto flex-shrink-0">Remove</button>
                                        </div>
                                    ) : (
                                        <label className={`flex items-center gap-3 px-4 py-3 border-2 border-dashed rounded-xl cursor-pointer transition-all ${uploadingFile ? 'border-amber-500/30 bg-amber-500/5' : 'border-white/10 hover:border-amber-500/40 hover:bg-amber-500/5'}`}>
                                            {uploadingFile
                                                ? <><div className="w-4 h-4 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" /><span className="text-sm text-amber-400">Uploading…</span></>
                                                : <><PaperClipIcon className="w-4 h-4 text-white/30" /><span className="text-sm text-white/30">Click to attach a file…</span></>
                                            }
                                            <input type="file" className="hidden"
                                                accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg,.gif,.zip"
                                                onChange={e => handleFileChange(e.target.files?.[0] ?? null)} />
                                        </label>
                                    )}
                                    {fileError && <p className="text-xs text-rose-400 mt-1.5">{fileError}</p>}
                                </div>

                                {error && (
                                    <div className="flex items-center gap-2 text-rose-400 text-sm">
                                        <ExclamationTriangleIcon className="w-4 h-4" /> {error}
                                    </div>
                                )}
                                <button type="submit" disabled={submitting || uploadingFile || (assignment.questions?.length > 0 ? Object.keys(answers).length === 0 : !text.trim() && !fileUrl)}
                                    className="flex items-center gap-2 px-6 py-3 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-bold rounded-xl transition-all">
                                    {submitting
                                        ? <><ClockIcon className="w-4 h-4 animate-spin" /> Submitting…</>
                                        : <><ArrowUpTrayIcon className="w-4 h-4" /> {submission ? 'Resubmit' : 'Submit Assignment'}</>
                                    }
                                </button>
                            </form>
                        )}
                    </div>
                )}

                {/* ── STAFF VIEW: All Submissions ── */}
                {isStaff && allSubs.length > 0 && (
                    <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
                        <div className="p-5 border-b border-white/10">
                            <h2 className="font-bold text-white">All Submissions</h2>
                        </div>
                        <div className="divide-y divide-white/5">
                            {allSubs.map((s: any) => (
                                <div key={s.id} className="flex items-center gap-4 p-4 hover:bg-white/5 transition-colors">
                                    {/* Avatar + name */}
                                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-600 to-blue-600 flex items-center justify-center text-xs font-black text-white flex-shrink-0">
                                        {(s.portal_users?.full_name ?? '?')[0]}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-semibold text-white truncate">{s.portal_users?.full_name ?? 'Student'}</p>
                                        <div className="flex items-center gap-2 mt-0.5">
                                            <Badge status={s.status} />
                                            {s.submitted_at && (
                                                <p className="text-xs text-white/30">
                                                    Submitted {new Date(s.submitted_at).toLocaleString()}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                    {s.grade != null && (
                                        <span className="text-emerald-400 font-bold text-sm flex-shrink-0">{s.grade}/{assignment.max_points} pts</span>
                                    )}
                                    <button onClick={() => setGrading(s)}
                                        className="px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 text-xs font-bold rounded-xl transition-colors flex-shrink-0">
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
