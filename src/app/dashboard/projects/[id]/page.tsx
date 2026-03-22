// @refresh reset
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import {
    ArrowLeftIcon, CheckIcon, ArrowPathIcon, ExclamationTriangleIcon,
    CodeBracketIcon, UserGroupIcon, CheckCircleIcon, PencilSquareIcon,
    ChevronDownIcon, ChevronUpIcon, StarIcon,
} from '@/lib/icons';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Auto-grade a submission 0–100 based on content richness */
function autoGradeSubmission(answers: any, submissionText: string, fileUrl: string): number {
    let score = 0;
    // Valid link
    const links: string[] = answers?.links || [];
    if (links.some((l: string) => l && l.startsWith('http'))) score += 25;
    // Code content
    const code: string = answers?.code || answers?.playground_code || '';
    if (code.trim().length > 50) score += 25;
    // File / screenshot
    if (fileUrl || answers?.screenshot_url) score += 25;
    // Written explanation
    if ((submissionText || answers?.text_explanation || '').trim().length > 30) score += 25;
    return Math.min(100, score);
}

const LABEL = 'block text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mb-1.5';
const INPUT = 'w-full px-4 py-2.5 bg-white/5 border border-white/10 text-sm text-white placeholder-white/20 focus:outline-none focus:border-violet-500 transition-colors rounded-none';
const TEXTAREA = `${INPUT} resize-none`;

// Status badge helper
function StatusBadge({ status, grade }: { status: string; grade?: number | null }) {
    if (status === 'graded') return (
        <span className="px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-black uppercase">
            Graded {grade != null ? `· ${grade}%` : ''}
        </span>
    );
    if (status === 'submitted') return (
        <span className="px-2 py-0.5 bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[10px] font-black uppercase">Submitted</span>
    );
    return <span className="px-2 py-0.5 bg-white/5 border border-white/10 text-white/30 text-[10px] font-black uppercase">Not submitted</span>;
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function ProjectActivityPage() {
    const { id } = useParams<{ id: string }>();
    const { profile, loading: authLoading } = useAuth();
    const role = profile?.role;
    const isStaff = role === 'admin' || role === 'teacher';
    const isStudent = role === 'student';

    const [activity, setActivity] = useState<any>(null);
    const [mySubmission, setMySubmission] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [successMsg, setSuccessMsg] = useState('');

    // Student submission form
    const [links, setLinks] = useState<string[]>(['']);
    const [code, setCode] = useState('');
    const [fileUrl, setFileUrl] = useState('');
    const [screenshotUrl, setScreenshotUrl] = useState('');
    const [textExplanation, setTextExplanation] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [capturing, setCapturing] = useState(false);

    // Teacher grading
    const [gradingId, setGradingId] = useState<string | null>(null);
    const [gradeInput, setGradeInput] = useState('');
    const [feedbackInput, setFeedbackInput] = useState('');
    const [savingGrade, setSavingGrade] = useState(false);
    const [expandedSub, setExpandedSub] = useState<string | null>(null);

    // ── Load activity ─────────────────────────────────────────────────────────

    const loadActivity = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/assignments/${id}`, { cache: 'no-store' });
            const j = await res.json();
            if (!res.ok) throw new Error(j.error || 'Failed to load');
            setActivity(j.data);

            if (isStudent && profile?.id) {
                const myRes = await fetch(`/api/assignments/${id}/student`, { cache: 'no-store' });
                const myJ = await myRes.json();
                if (myJ.data) {
                    const sub = myJ.data;
                    setMySubmission(sub);
                    const ans = sub.answers || {};
                    setLinks(ans.links?.length ? ans.links : ['']);
                    setCode(ans.code || ans.playground_code || '');
                    setFileUrl(sub.file_url || '');
                    setScreenshotUrl(ans.screenshot_url || '');
                    setTextExplanation(sub.submission_text || ans.text_explanation || '');
                }
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [id, isStudent, profile?.id]); // eslint-disable-line

    useEffect(() => {
        if (!authLoading && profile) loadActivity();
    }, [authLoading, profile?.id]); // eslint-disable-line

    // ── Auto-capture from playground ──────────────────────────────────────────

    async function capturePlayground() {
        if (!profile?.id) return;
        setCapturing(true);
        try {
            const db = createClient();
            const { data } = await db.from('lab_projects').select('title, code, language').eq('user_id', profile.id)
                .order('updated_at', { ascending: false }).limit(1).maybeSingle();
            if (data?.code) {
                setCode(`// From: ${data.title || 'My Lab Project'} (${data.language})\n${data.code}`);
                setSuccessMsg('Latest playground code captured!');
                setTimeout(() => setSuccessMsg(''), 3000);
            } else {
                setError('No saved lab project found in the Playground');
            }
        } catch { setError('Failed to capture playground code'); }
        finally { setCapturing(false); }
    }

    // ── Student submit ────────────────────────────────────────────────────────

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        const meta = activity?.metadata || {};
        const types: string[] = meta.submission_types || [];

        const answers: any = {};
        if (types.includes('link')) answers.links = links.filter(l => l.trim());
        if (types.includes('code')) { answers.code = code; answers.playground_code = code; }
        if (types.includes('screenshot')) answers.screenshot_url = screenshotUrl;
        if (types.includes('text')) answers.text_explanation = textExplanation;

        const submissionText = types.includes('text') ? textExplanation : '';
        const fUrl = types.includes('file') ? fileUrl : '';

        // Auto-grade if enabled
        const autoGrade = meta.auto_grade === true;
        const autoScore = autoGrade ? autoGradeSubmission(answers, submissionText, fUrl) : null;

        setSubmitting(true);
        setError('');
        try {
            // 1. Submit
            const res = await fetch(`/api/assignments/${id}/submit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ portal_user_id: profile?.id, submission_text: submissionText, file_url: fUrl, answers }),
            });
            const j = await res.json();
            if (!res.ok) throw new Error(j.error || 'Submission failed');

            // 2. Auto-grade if applicable
            if (autoGrade && autoScore !== null) {
                await fetch(`/api/assignments/${id}/grade`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ submission_id: j.data.id, grade: autoScore, feedback: `Auto-graded: ${autoScore}/100 (teacher may review)`, status: 'graded' }),
                });
            }

            setSuccessMsg(autoGrade ? `Submitted and auto-graded: ${autoScore}/100! 🎉` : 'Work submitted successfully! Awaiting teacher review.');
            loadActivity();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setSubmitting(false);
        }
    }

    // ── Teacher grade ─────────────────────────────────────────────────────────

    async function handleGrade(submissionId: string) {
        const g = parseInt(gradeInput);
        if (isNaN(g) || g < 0 || g > 100) { setError('Grade must be 0–100'); return; }
        setSavingGrade(true);
        try {
            const res = await fetch(`/api/assignments/${id}/grade`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ submission_id: submissionId, grade: g, feedback: feedbackInput, status: 'graded' }),
            });
            if (!res.ok) throw new Error('Grading failed');
            setGradingId(null);
            setGradeInput('');
            setFeedbackInput('');
            setSuccessMsg('Grade saved!');
            loadActivity();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setSavingGrade(false);
        }
    }

    // ── Render ────────────────────────────────────────────────────────────────

    if (authLoading || loading) return (
        <div className="min-h-screen bg-background flex items-center justify-center">
            <ArrowPathIcon className="w-8 h-8 text-violet-400 animate-spin" />
        </div>
    );

    if (!activity) return (
        <div className="min-h-screen bg-background flex items-center justify-center flex-col gap-3">
            <p className="text-white/30">Activity not found.</p>
            <Link href="/dashboard/projects" className="text-violet-400 text-sm font-bold hover:underline">← Back to Projects</Link>
        </div>
    );

    const meta = activity.metadata || {};
    const submissionTypes: string[] = meta.submission_types || ['link', 'code', 'text'];
    const isGroupActivity: boolean = meta.group_activity === true;
    const groups: any[] = meta.groups || [];
    const autoGradeEnabled: boolean = meta.auto_grade === true;
    const submissions: any[] = activity.assignment_submissions || [];
    const dueDate = activity.due_date ? new Date(activity.due_date) : null;
    const isOverdue = dueDate ? dueDate < new Date() : false;

    // Find student's group
    const myGroup = isGroupActivity && profile?.id
        ? groups.find(g => g.studentIds?.includes(profile.id))
        : null;

    return (
        <div className="min-h-screen bg-background">
            {/* Header */}
            <div className="bg-[#0a0a12] border-b border-white/[0.06] px-6 md:px-10 py-6">
                <Link href="/dashboard/projects" className="flex items-center gap-2 text-white/40 hover:text-white text-xs font-bold uppercase tracking-widest mb-4 transition-colors w-fit">
                    <ArrowLeftIcon className="w-3.5 h-3.5" /> Back to Projects
                </Link>
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                    <div className="flex items-start gap-4">
                        <div className="w-12 h-12 bg-violet-500/10 border border-violet-500/30 flex items-center justify-center flex-shrink-0">
                            <span className="text-2xl">🚀</span>
                        </div>
                        <div>
                            <div className="flex items-center gap-3 mb-1 flex-wrap">
                                <span className="text-[9px] font-black text-violet-400/70 uppercase tracking-[0.3em]">Project Activity</span>
                                {autoGradeEnabled && <span className="text-[9px] font-black text-emerald-400 px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20">⚡ Auto-Grade</span>}
                                {isGroupActivity && <span className="text-[9px] font-black text-indigo-400 px-2 py-0.5 bg-indigo-500/10 border border-indigo-500/20">👥 Group Work</span>}
                            </div>
                            <h1 className="text-2xl font-black text-white uppercase tracking-tight italic leading-tight">{activity.title}</h1>
                            {activity.description && <p className="text-sm text-white/40 mt-1">{activity.description}</p>}
                            <div className="flex items-center gap-4 mt-2 text-[10px] text-white/30 flex-wrap">
                                {dueDate && (
                                    <span className={isOverdue ? 'text-rose-400' : 'text-white/30'}>
                                        Due: {dueDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                        {isOverdue && ' · OVERDUE'}
                                    </span>
                                )}
                                <span>Max: {activity.max_points ?? 100} pts</span>
                                <span>{submissions.length} submission{submissions.length !== 1 ? 's' : ''}</span>
                            </div>
                        </div>
                    </div>

                    {/* Staff: submission summary */}
                    {isStaff && (
                        <div className="flex items-center gap-3 flex-shrink-0">
                            <div className="text-center bg-white/[0.03] border border-white/[0.06] px-4 py-2">
                                <p className="text-xl font-black text-emerald-400">{submissions.filter(s => s.status === 'graded').length}</p>
                                <p className="text-[9px] text-white/30 uppercase tracking-widest">Graded</p>
                            </div>
                            <div className="text-center bg-white/[0.03] border border-white/[0.06] px-4 py-2">
                                <p className="text-xl font-black text-amber-400">{submissions.filter(s => s.status === 'submitted').length}</p>
                                <p className="text-[9px] text-white/30 uppercase tracking-widest">Pending</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Alerts */}
            <div className="px-6 md:px-10 pt-4 space-y-2">
                {error && (
                    <div className="flex items-center gap-3 bg-rose-500/10 border border-rose-500/20 px-4 py-3 max-w-4xl">
                        <ExclamationTriangleIcon className="w-4 h-4 text-rose-400 flex-shrink-0" />
                        <p className="text-rose-400 text-sm">{error}</p>
                        <button onClick={() => setError('')} className="ml-auto text-rose-400/50 hover:text-rose-400">✕</button>
                    </div>
                )}
                {successMsg && (
                    <div className="flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/20 px-4 py-3 max-w-4xl">
                        <CheckCircleIcon className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                        <p className="text-emerald-400 text-sm font-semibold">{successMsg}</p>
                    </div>
                )}
            </div>

            <div className="px-6 md:px-10 py-6 max-w-5xl space-y-6">

                {/* Instructions */}
                {activity.instructions && (
                    <div className="bg-indigo-500/5 border border-indigo-500/20 p-5">
                        <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-2">📋 Instructions</p>
                        <p className="text-sm text-white/70 leading-relaxed whitespace-pre-line">{activity.instructions}</p>
                    </div>
                )}

                {/* Groups display */}
                {isGroupActivity && groups.length > 0 && (
                    <div className="bg-white/[0.02] border border-white/[0.06] p-5">
                        <p className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-3">👥 Groups</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {groups.map(g => (
                                <div key={g.id} className={`border px-4 py-3 ${myGroup?.id === g.id ? 'border-indigo-500/40 bg-indigo-500/10' : 'border-white/[0.06] bg-white/[0.02]'}`}>
                                    <p className={`text-xs font-black uppercase tracking-widest mb-2 ${myGroup?.id === g.id ? 'text-indigo-300' : 'text-white/60'}`}>
                                        {g.name} {myGroup?.id === g.id && '· Your Group'}
                                    </p>
                                    <p className="text-[10px] text-white/30">{g.studentIds?.length ?? 0} member{g.studentIds?.length !== 1 ? 's' : ''}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* ── STUDENT VIEW ── */}
                {isStudent && (
                    <div className="space-y-4">
                        {/* Current submission status */}
                        {mySubmission && (
                            <div className="flex items-center gap-3 bg-emerald-500/5 border border-emerald-500/20 px-4 py-3">
                                <CheckCircleIcon className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                                <div>
                                    <StatusBadge status={mySubmission.status} grade={mySubmission.grade} />
                                    {mySubmission.feedback && (
                                        <p className="text-[11px] text-white/50 mt-1">Teacher feedback: <span className="text-white/70 italic">"{mySubmission.feedback}"</span></p>
                                    )}
                                </div>
                                <span className="text-[9px] text-white/30 ml-auto">
                                    {mySubmission.submitted_at ? new Date(mySubmission.submitted_at).toLocaleDateString('en-GB') : ''}
                                </span>
                            </div>
                        )}

                        {/* Submission form */}
                        <form onSubmit={handleSubmit} className="bg-white/[0.02] border border-white/[0.06] p-6 space-y-5">
                            <p className="text-[10px] font-black text-violet-400 uppercase tracking-widest">
                                {mySubmission ? '✏️ Update Your Submission' : '📤 Submit Your Work'}
                            </p>

                            {/* Links */}
                            {submissionTypes.includes('link') && (
                                <div>
                                    <label className={LABEL}>🔗 Website / GitHub Links</label>
                                    {links.map((link, i) => (
                                        <div key={i} className="flex gap-2 mb-2">
                                            <input
                                                value={link}
                                                onChange={e => setLinks(ls => ls.map((l, j) => j === i ? e.target.value : l))}
                                                placeholder="https://github.com/yourname/project"
                                                className={INPUT}
                                            />
                                            {links.length > 1 && (
                                                <button type="button" onClick={() => setLinks(ls => ls.filter((_, j) => j !== i))}
                                                    className="px-2 text-rose-400/60 hover:text-rose-400">✕</button>
                                            )}
                                        </div>
                                    ))}
                                    <button type="button" onClick={() => setLinks(ls => [...ls, ''])}
                                        className="text-[10px] text-violet-400 hover:text-violet-300 font-bold uppercase tracking-widest">+ Add another link</button>
                                </div>
                            )}

                            {/* Code */}
                            {submissionTypes.includes('code') && (
                                <div>
                                    <div className="flex items-center justify-between mb-1.5">
                                        <label className={LABEL + ' mb-0'}>💻 Code Submission</label>
                                        <button type="button" onClick={capturePlayground} disabled={capturing}
                                            className="flex items-center gap-1.5 text-[9px] font-black text-indigo-400 hover:text-indigo-300 uppercase tracking-widest px-2 py-1 bg-indigo-500/10 border border-indigo-500/20 hover:border-indigo-500/40 transition-all disabled:opacity-50">
                                            <CodeBracketIcon className="w-3 h-3" />
                                            {capturing ? 'Capturing...' : 'Auto-capture from Playground'}
                                        </button>
                                    </div>
                                    <textarea value={code} onChange={e => setCode(e.target.value)} rows={10}
                                        placeholder="Paste your code here, or click 'Auto-capture from Playground' to pull your latest saved code..."
                                        className={`${TEXTAREA} font-mono text-xs`} />
                                    {code.trim().length > 0 && (
                                        <p className="text-[9px] text-emerald-400 mt-1">{code.trim().length} characters</p>
                                    )}
                                </div>
                            )}

                            {/* File */}
                            {submissionTypes.includes('file') && (
                                <div>
                                    <label className={LABEL}>📎 File URL (Hosted File / Document)</label>
                                    <input value={fileUrl} onChange={e => setFileUrl(e.target.value)}
                                        placeholder="https://drive.google.com/... or similar" className={INPUT} />
                                    <p className="text-[9px] text-white/20 mt-1">Upload your file to Google Drive, Dropbox, or any hosting service and paste the link</p>
                                </div>
                            )}

                            {/* Screenshot */}
                            {submissionTypes.includes('screenshot') && (
                                <div>
                                    <label className={LABEL}>🖼️ Screenshot URL</label>
                                    <input value={screenshotUrl} onChange={e => setScreenshotUrl(e.target.value)}
                                        placeholder="https://i.imgur.com/... or https://res.cloudinary.com/..." className={INPUT} />
                                    {screenshotUrl && screenshotUrl.startsWith('http') && (
                                        <img src={screenshotUrl} alt="Preview" className="mt-2 max-h-40 border border-white/10 object-contain" onError={e => (e.target as any).style.display = 'none'} />
                                    )}
                                    <p className="text-[9px] text-white/20 mt-1">Upload to Imgur, Cloudinary, or any image host and paste the direct image URL</p>
                                </div>
                            )}

                            {/* Text */}
                            {submissionTypes.includes('text') && (
                                <div>
                                    <label className={LABEL}>📝 Written Explanation</label>
                                    <textarea value={textExplanation} onChange={e => setTextExplanation(e.target.value)} rows={5}
                                        placeholder="Describe what you built, how it works, challenges you faced, what you learned..."
                                        className={TEXTAREA} />
                                </div>
                            )}

                            {/* Auto-grade preview */}
                            {autoGradeEnabled && (
                                <div className="bg-emerald-500/5 border border-emerald-500/20 px-4 py-3">
                                    <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-1">⚡ Auto-Grade Preview</p>
                                    <p className="text-2xl font-black text-white">
                                        {autoGradeSubmission(
                                            { links: links.filter(l => l.trim()), code, screenshot_url: screenshotUrl },
                                            textExplanation, fileUrl
                                        )}
                                        <span className="text-base text-white/30">/100</span>
                                    </p>
                                    <p className="text-[9px] text-emerald-400/60 mt-1">This score will be applied automatically. Teacher can override.</p>
                                </div>
                            )}

                            <button type="submit" disabled={submitting}
                                className="flex items-center gap-2 px-8 py-3 bg-violet-600 hover:bg-violet-500 text-white text-sm font-black uppercase tracking-widest transition-all disabled:opacity-50">
                                {submitting ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : <CheckIcon className="w-4 h-4" />}
                                {submitting ? 'Submitting...' : mySubmission ? 'Update Submission' : 'Submit Work'}
                            </button>
                        </form>
                    </div>
                )}

                {/* ── TEACHER VIEW — Submissions ── */}
                {isStaff && (
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <p className="text-[10px] font-black text-white/40 uppercase tracking-widest">All Submissions ({submissions.length})</p>
                            {submissions.filter(s => s.status === 'submitted').length > 0 && (
                                <span className="text-[10px] text-amber-400 font-bold">{submissions.filter(s => s.status === 'submitted').length} awaiting review</span>
                            )}
                        </div>

                        {submissions.length === 0 && (
                            <div className="bg-white/[0.02] border border-white/[0.06] p-10 text-center">
                                <p className="text-white/20 text-sm">No submissions yet</p>
                            </div>
                        )}

                        {submissions.map(sub => {
                            const studentName = sub.portal_users?.full_name || 'Unknown Student';
                            const answers = sub.answers || {};
                            const links: string[] = answers.links || [];
                            const code: string = answers.code || answers.playground_code || '';
                            const screenshot: string = answers.screenshot_url || '';
                            const isExpanded = expandedSub === sub.id;
                            const isGrading = gradingId === sub.id;

                            return (
                                <div key={sub.id} className="bg-[#0d0d18] border border-white/[0.06] hover:border-violet-500/20 transition-all">
                                    {/* Row header */}
                                    <button onClick={() => setExpandedSub(isExpanded ? null : sub.id)}
                                        className="w-full flex items-center gap-4 px-5 py-4 text-left">
                                        <div className="w-8 h-8 rounded-full bg-violet-500/20 flex items-center justify-center flex-shrink-0">
                                            <span className="text-xs font-black text-violet-300">{studentName[0].toUpperCase()}</span>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-black text-white">{studentName}</p>
                                            <p className="text-[10px] text-white/30">{sub.submitted_at ? new Date(sub.submitted_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Not submitted'}</p>
                                        </div>
                                        <StatusBadge status={sub.status || 'not_submitted'} grade={sub.grade} />
                                        {isExpanded ? <ChevronUpIcon className="w-4 h-4 text-violet-400" /> : <ChevronDownIcon className="w-4 h-4 text-white/30" />}
                                    </button>

                                    {/* Expanded content */}
                                    {isExpanded && (
                                        <div className="border-t border-white/[0.06] px-5 py-5 space-y-4 bg-black/20">
                                            {/* Submitted content */}
                                            {links.length > 0 && (
                                                <div>
                                                    <p className={LABEL}>🔗 Links</p>
                                                    {links.map((l, i) => <a key={i} href={l} target="_blank" rel="noreferrer" className="block text-sm text-indigo-400 hover:text-indigo-300 underline truncate">{l}</a>)}
                                                </div>
                                            )}
                                            {code && (
                                                <div>
                                                    <p className={LABEL}>💻 Code ({code.length} chars)</p>
                                                    <pre className="text-xs text-white/60 bg-black/40 border border-white/10 p-3 overflow-auto max-h-48 font-mono">{code.slice(0, 2000)}{code.length > 2000 ? '...' : ''}</pre>
                                                </div>
                                            )}
                                            {screenshot && (
                                                <div>
                                                    <p className={LABEL}>🖼️ Screenshot</p>
                                                    <img src={screenshot} alt="Submission screenshot" className="max-h-48 border border-white/10 object-contain" onError={e => (e.target as any).style.display = 'none'} />
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
                                                    <p className="text-[10px] font-black text-emerald-400 mb-1">Teacher Feedback</p>
                                                    <p className="text-xs text-emerald-300/70 italic">{sub.feedback}</p>
                                                </div>
                                            )}

                                            {/* Grade panel */}
                                            {!isGrading ? (
                                                <button onClick={() => { setGradingId(sub.id); setGradeInput(String(sub.grade ?? '')); setFeedbackInput(sub.feedback || ''); }}
                                                    className="flex items-center gap-2 px-4 py-2 bg-orange-600/20 border border-orange-500/30 text-orange-400 text-xs font-black uppercase tracking-widest hover:bg-orange-600/30 transition-all">
                                                    <PencilSquareIcon className="w-3.5 h-3.5" />
                                                    {sub.status === 'graded' ? 'Edit Grade' : 'Grade Submission'}
                                                </button>
                                            ) : (
                                                <div className="bg-orange-500/5 border border-orange-500/20 p-4 space-y-3">
                                                    <p className="text-[10px] font-black text-orange-400 uppercase tracking-widest">Grade Submission</p>
                                                    <div className="grid grid-cols-2 gap-3">
                                                        <div>
                                                            <label className={LABEL}>Score (0–100)</label>
                                                            <input type="number" min="0" max="100" value={gradeInput}
                                                                onChange={e => setGradeInput(e.target.value)}
                                                                className={INPUT} autoFocus />
                                                        </div>
                                                        <div className="flex items-end">
                                                            <div className="w-full">
                                                                <p className="text-[9px] text-white/30 mb-1">Auto-grade would be:</p>
                                                                <p className="text-lg font-black text-emerald-400">
                                                                    {autoGradeSubmission(answers, sub.submission_text || '', sub.file_url || '')}%
                                                                </p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <label className={LABEL}>Feedback (optional)</label>
                                                        <textarea value={feedbackInput} onChange={e => setFeedbackInput(e.target.value)} rows={2}
                                                            placeholder="Great work! Here's what you can improve..." className={TEXTAREA} />
                                                    </div>
                                                    <div className="flex items-center gap-3">
                                                        <button onClick={() => handleGrade(sub.id)} disabled={savingGrade}
                                                            className="flex items-center gap-2 px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black uppercase tracking-widest transition-all disabled:opacity-50">
                                                            {savingGrade ? <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" /> : <CheckIcon className="w-3.5 h-3.5" />}
                                                            Save Grade
                                                        </button>
                                                        <button onClick={() => setGradingId(null)} className="text-white/30 hover:text-white text-xs font-bold transition-colors">Cancel</button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
