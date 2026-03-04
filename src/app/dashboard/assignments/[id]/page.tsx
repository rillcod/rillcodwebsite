'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import { submitAssignment } from '@/services/dashboard.service';
import {
    ArrowLeftIcon, CalendarIcon, ClockIcon, DocumentTextIcon,
    CheckCircleIcon, ExclamationTriangleIcon, ArrowUpTrayIcon,
    PaperClipIcon, AcademicCapIcon, StarIcon,
} from '@heroicons/react/24/outline';

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
    const [submitting, setSubmitting] = useState(false);
    const [submitDone, setSubmitDone] = useState(false);

    const isStaff = profile?.role === 'admin' || profile?.role === 'teacher';

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
            assignment_type, is_active, created_at,
            courses ( id, title, programs ( name ) ),
            assignment_submissions ( id, status, grade, feedback, submitted_at, graded_at, portal_user_id )
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

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!profile || !assignment) return;
        setSubmitting(true);
        try {
            const result = await submitAssignment({
                assignment_id: assignment.id,
                portal_user_id: profile.id,
                submission_text: text,
            });
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

                        {/* Student result badge */}
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

                        {submission?.status === 'graded' ? (
                            <div className="text-center py-6 text-white/30 text-sm">
                                This assignment has been graded. No further submissions accepted.
                            </div>
                        ) : (
                            <form onSubmit={handleSubmit} className="space-y-4">
                                {submission?.submission_text && (
                                    <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                                        <p className="text-xs text-white/30 uppercase tracking-wider mb-2">Previous Submission</p>
                                        <p className="text-sm text-white/60 whitespace-pre-wrap">{submission.submission_text}</p>
                                    </div>
                                )}
                                <div>
                                    <label className="block text-xs font-semibold text-white/40 uppercase tracking-widest mb-1.5">
                                        Your Answer / Work
                                    </label>
                                    <textarea
                                        rows={6}
                                        value={text}
                                        onChange={e => setText(e.target.value)}
                                        placeholder="Write your answer, explanation, or paste your link here…"
                                        className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/25 focus:outline-none focus:border-amber-500 transition-colors resize-none"
                                    />
                                </div>
                                {error && (
                                    <div className="flex items-center gap-2 text-rose-400 text-sm">
                                        <ExclamationTriangleIcon className="w-4 h-4" /> {error}
                                    </div>
                                )}
                                <button type="submit" disabled={submitting || !text.trim()}
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
                                    <div className="flex-1 min-w-0">
                                        <Badge status={s.status} />
                                        {s.submitted_at && (
                                            <p className="text-xs text-white/30 mt-1">
                                                Submitted {new Date(s.submitted_at).toLocaleString()}
                                            </p>
                                        )}
                                    </div>
                                    {s.grade != null && (
                                        <span className="text-emerald-400 font-bold text-sm">{s.grade}/{assignment.max_points} pts</span>
                                    )}
                                    <Link href="/dashboard/grades"
                                        className="px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 text-xs font-bold rounded-xl transition-colors">
                                        Grade
                                    </Link>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

            </div>
        </div>
    );
}
