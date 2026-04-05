// @refresh reset
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import {
    ArrowLeftIcon, CheckIcon, ArrowPathIcon, ExclamationTriangleIcon,
    CheckCircleIcon, PencilSquareIcon, ChevronDownIcon, ChevronUpIcon,
    BoltIcon, RocketLaunchIcon, ClipboardDocumentListIcon,
    DocumentTextIcon, UserGroupIcon, ClockIcon, StarIcon,
    CodeBracketIcon, EyeIcon, PaperAirplaneIcon, SparklesIcon,
} from '@/lib/icons';

const IntegratedCodeRunner = dynamic(
    () => import('@/components/studio/IntegratedCodeRunner'),
    { ssr: false, loading: () => <div className="flex-1 bg-black/40 flex items-center justify-center"><ArrowPathIcon className="w-6 h-6 text-orange-400 animate-spin" /></div> }
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
const INPUT  = 'w-full px-4 py-2.5 bg-white/5 border border-white/10 text-sm text-white placeholder-white/20 focus:outline-none focus:border-orange-500 transition-colors';
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
interface TextPart  { type: 'text'; content: string }
interface CodePart  { type: 'code'; language: string; content: string }
type MsgPart = TextPart | CodePart;

function parseParts(raw: string): MsgPart[] {
    const parts: MsgPart[] = [];
    const re = /```(\w*)\n?([\s\S]*?)```/g;
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(raw)) !== null) {
        if (m.index > last) parts.push({ type: 'text', content: raw.slice(last, m.index) });
        parts.push({ type: 'code', language: m[1] || 'text', content: m[2].trim() });
        last = m.index + m[0].length;
    }
    if (last < raw.length) parts.push({ type: 'text', content: raw.slice(last) });
    return parts;
}

// Quick AI action prompts
const QUICK_ACTIONS = [
    { label: '🚀 Generate Starter', prompt: 'Generate complete starter code for this project. Make it fully runnable.' },
    { label: '📋 Step-by-Step Plan', prompt: 'Give me a step-by-step plan to build this project, then generate the code for step 1.' },
    { label: '✨ Add Features', prompt: 'Look at my current code and suggest 3 cool features to add, then add the most impressive one.' },
    { label: '🐛 Debug My Code', prompt: 'Review my current code for bugs and errors. Show me the fixed version.' },
    { label: '🎨 Improve Design', prompt: 'Make my project look more professional and visually impressive. Update the code with better styling.' },
    { label: '📖 Explain Code', prompt: 'Explain what my current code does, line by line in simple terms.' },
];

// Language detected from category
function detectLang(category: string): 'html' | 'javascript' | 'python' | 'robotics' {
    if (category === 'web' || category === 'design') return 'html';
    if (category === 'ai' || category === 'hardware') return 'python';
    return 'javascript';
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
    const [loading, setLoading]            = useState(true);
    const [error, setError]                = useState('');
    const [successMsg, setSuccessMsg]      = useState('');

    // builder state
    const [editorCode, setEditorCode]      = useState('');
    const [editorLang, setEditorLang]      = useState<'html'|'javascript'|'python'|'robotics'>('javascript');
    const [activeTab, setActiveTab]        = useState<'build'|'code'|'preview'|'submit'>('build');

    // submission extra fields
    const [links, setLinks]                = useState<string[]>(['']);
    const [fileUrl, setFileUrl]            = useState('');
    const [screenshotUrl, setScreenshotUrl]= useState('');
    const [textExplanation, setTextExplanation] = useState('');
    const [submitting, setSubmitting]      = useState(false);
    const [capturing, setCapturing]        = useState(false);

    // AI builder chat
    const [messages, setMessages]          = useState<{ role: 'user'|'assistant'; content: string }[]>([]);
    const [chatInput, setChatInput]        = useState('');
    const [chatLoading, setChatLoading]    = useState(false);
    const [hasInitiated, setHasInitiated]  = useState(false);
    const chatEndRef = useRef<HTMLDivElement>(null);

    // teacher grading
    const [gradingId, setGradingId]        = useState<string | null>(null);
    const [gradeInput, setGradeInput]      = useState('');
    const [feedbackInput, setFeedbackInput]= useState('');
    const [savingGrade, setSavingGrade]    = useState(false);
    const [expandedSub, setExpandedSub]    = useState<string | null>(null);

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

                // Load group task
                try {
                    const grRes = await fetch(`/api/project-groups?assignment_id=${id}`, { cache: 'no-store' });
                    const grJ   = await grRes.json();
                    if (grJ.groups && profile?.id) {
                        for (const grp of grJ.groups) {
                            const member = (grp.project_group_members || []).find(
                                (m: any) => m.student_id === profile.id
                            );
                            if (member?.task_description) {
                                setMyGroupTask(member.task_description);
                                break;
                            }
                        }
                    }
                } catch { /* optional */ }
            }
        } catch (err: any) { setError(err.message); }
        finally { setLoading(false); }
    }, [id, isStudent, profile?.id]); // eslint-disable-line

    useEffect(() => {
        if (!authLoading && profile) loadActivity();
    }, [authLoading, profile?.id]); // eslint-disable-line

    // Scroll chat to bottom on new message
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, chatLoading]);

    // ── AI Builder chat ───────────────────────────────────────────────────────

    async function sendMessage(text: string) {
        if (!text.trim() || chatLoading) return;
        const userMsg = { role: 'user' as const, content: text.trim() };
        setMessages(prev => [...prev, userMsg]);
        setChatInput('');
        setChatLoading(true);

        try {
            const res = await fetch('/api/ai/project-builder', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: text.trim(),
                    projectTitle: activity?.title,
                    category: activity?.metadata?.category || 'coding',
                    instructions: activity?.instructions,
                    studentTask: myGroupTask,
                    currentCode: editorCode,
                    language: editorLang,
                    conversationHistory: messages.slice(-10),
                }),
            });
            const j = await res.json();
            const reply = j.reply || j.error || 'No response';
            setMessages(prev => [...prev, { role: 'assistant', content: reply }]);

            // Auto-inject code if AI generated one and editor is empty
            if (j.code && !editorCode.trim()) {
                setEditorCode(j.code);
                setActiveTab('code');
            }
        } catch {
            setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, something went wrong. Please try again.' }]);
        } finally {
            setChatLoading(false); }
    }

    function handleQuickAction(prompt: string) {
        if (!hasInitiated) {
            setHasInitiated(true);
            setMessages([{
                role: 'assistant',
                content: `Hi! I'm your AI Project Builder for **${activity?.title}** 🚀\n\nI'll help you build this project from scratch — generating code, explaining concepts, and making it look great. What would you like to do first?`,
            }]);
        }
        sendMessage(prompt);
    }

    function initChat() {
        if (hasInitiated) return;
        setHasInitiated(true);
        const taskHint = myGroupTask ? `\n\nYour specific task: **${myGroupTask}**` : '';
        setMessages([{
            role: 'assistant',
            content: `Hi! I'm your AI Project Builder for **${activity?.title}** 🚀${taskHint}\n\nI can generate complete runnable code, guide you step-by-step, debug your work, or add features. Click a quick action or ask me anything!`,
        }]);
    }

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
            setGradingId(null); setGradeInput(''); setFeedbackInput('');
            setSuccessMsg('Grade saved!');
            loadActivity();
        } catch (err: any) { setError(err.message); }
        finally { setSavingGrade(false); }
    }

    // ── Render guards ─────────────────────────────────────────────────────────

    if (authLoading || loading) return (
        <div className="min-h-screen bg-background flex items-center justify-center">
            <ArrowPathIcon className="w-8 h-8 text-orange-400 animate-spin" />
        </div>
    );
    if (!activity) return (
        <div className="min-h-screen bg-background flex items-center justify-center flex-col gap-3">
            <p className="text-white/30">Activity not found.</p>
            <Link href="/dashboard/projects" className="text-orange-400 text-sm font-bold hover:underline">← Back to Projects</Link>
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

            {/* ── Compact Hero ─────────────────────────────────────────────── */}
            <div className="relative bg-[#0a0a12] border-b border-white/[0.06] flex-shrink-0">
                <div className="absolute inset-0 pointer-events-none overflow-hidden">
                    <div className="absolute -top-16 -left-16 w-72 h-72 bg-orange-500/6 rounded-full blur-3xl" />
                    <div className="absolute top-0 right-0 w-56 h-56 bg-amber-500/4 rounded-full blur-3xl" />
                </div>
                <div className="relative px-4 md:px-8 py-4">
                    <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3 min-w-0">
                            <Link href="/dashboard/projects"
                                className="flex items-center gap-1.5 text-white/40 hover:text-white text-[10px] font-black uppercase tracking-widest transition-colors flex-shrink-0">
                                <ArrowLeftIcon className="w-3 h-3" /> Back
                            </Link>
                            <div className="w-px h-4 bg-white/10" />
                            <div className="w-8 h-8 bg-orange-500/15 border border-orange-500/25 flex items-center justify-center flex-shrink-0">
                                <RocketLaunchIcon className="w-4 h-4 text-orange-400" />
                            </div>
                            <div className="min-w-0">
                                <h1 className="text-sm font-black text-white uppercase tracking-tight truncate">{activity.title}</h1>
                                <div className="flex items-center gap-3 mt-0.5">
                                    <span className="text-[9px] text-orange-400/60 font-bold uppercase tracking-widest">{category}</span>
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
                                <div className="flex items-center gap-2 text-[10px]">
                                    <span className="text-emerald-400 font-bold">{gradedCount} graded</span>
                                    {pendingCount > 0 && <span className="text-amber-400 font-bold">{pendingCount} pending</span>}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
                <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-orange-500/30 to-transparent" />
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

            {/* ── Mobile Tabs (student) ────────────────────────────────────── */}
            {isStudent && (
                <div className="flex border-b border-white/[0.06] bg-[#0a0a12] flex-shrink-0 lg:hidden">
                    {(['build', 'code', 'preview', 'submit'] as const).map(tab => (
                        <button key={tab} onClick={() => { setActiveTab(tab); if (tab === 'build' && !hasInitiated) initChat(); }}
                            className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest transition-colors ${
                                activeTab === tab
                                    ? 'text-orange-400 border-b-2 border-orange-500'
                                    : 'text-white/30 hover:text-white/60'
                            }`}>
                            {tab === 'build' ? '🤖 AI Build' : tab === 'code' ? '💻 Code' : tab === 'preview' ? '👁 Preview' : '📤 Submit'}
                        </button>
                    ))}
                </div>
            )}

            {/* ── Main Builder Layout ──────────────────────────────────────── */}
            {isStudent ? (
                <div className="flex-1 flex flex-col lg:flex-row overflow-hidden min-h-0">

                    {/* ── LEFT: AI Builder Panel ── */}
                    <div className={`${activeTab === 'build' ? 'flex' : 'hidden'} lg:flex flex-col lg:w-[380px] xl:w-[420px] border-r border-white/[0.06] bg-[#080810] flex-shrink-0 overflow-hidden`}>

                        {/* Panel header */}
                        <div className="px-4 py-3 border-b border-white/[0.06] flex items-center gap-3 flex-shrink-0">
                            <div className="w-7 h-7 bg-orange-500 flex items-center justify-center">
                                <SparklesIcon className="w-3.5 h-3.5 text-white" />
                            </div>
                            <div>
                                <p className="text-xs font-black text-white">AI Project Builder</p>
                                <p className="text-[9px] text-orange-400/60 uppercase tracking-widest">Generates code · guides you · debugs</p>
                            </div>
                        </div>

                        {/* Assigned task highlight */}
                        {myGroupTask && (
                            <div className="mx-3 mt-3 bg-orange-500/10 border border-orange-500/20 px-3 py-2.5 flex-shrink-0">
                                <p className="text-[9px] font-black text-orange-400/60 uppercase tracking-widest mb-1">Your Task</p>
                                <p className="text-xs text-white/80 leading-relaxed">{myGroupTask}</p>
                            </div>
                        )}

                        {/* Quick actions */}
                        {!hasInitiated && (
                            <div className="px-3 pt-3 flex-shrink-0">
                                <p className="text-[9px] font-black text-white/25 uppercase tracking-widest mb-2">Quick Start</p>
                                <div className="grid grid-cols-2 gap-1.5">
                                    {QUICK_ACTIONS.map(a => (
                                        <button key={a.label} onClick={() => handleQuickAction(a.prompt)}
                                            className="text-left px-2.5 py-2 bg-white/[0.03] border border-white/[0.06] hover:border-orange-500/30 hover:bg-orange-500/5 transition-all text-[10px] text-white/60 hover:text-white font-medium leading-tight">
                                            {a.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Init button if not started */}
                        {!hasInitiated && (
                            <div className="px-3 pt-3 flex-shrink-0">
                                <button onClick={initChat}
                                    className="w-full py-2.5 bg-orange-600 hover:bg-orange-500 text-white text-xs font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2">
                                    <SparklesIcon className="w-3.5 h-3.5" />
                                    Start AI Builder Session
                                </button>
                            </div>
                        )}

                        {/* Chat messages */}
                        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 min-h-0">
                            {messages.map((msg, i) => (
                                <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                    {msg.role === 'assistant' && (
                                        <div className="w-6 h-6 bg-orange-500 flex items-center justify-center text-white text-[9px] font-black flex-shrink-0 mt-0.5">AI</div>
                                    )}
                                    <div className={`max-w-[90%] text-xs leading-relaxed ${msg.role === 'user' ? 'bg-orange-600 text-white px-3 py-2' : 'flex-1'}`}>
                                        {msg.role === 'user' ? (
                                            msg.content
                                        ) : (
                                            <div className="space-y-2">
                                                {parseParts(msg.content).map((part, pi) => {
                                                    if (part.type === 'text') {
                                                        return (
                                                            <div key={pi} className="text-white/75 whitespace-pre-wrap">
                                                                {part.content.replace(/\*\*(.*?)\*\*/g, '$1')}
                                                            </div>
                                                        );
                                                    }
                                                    // code block
                                                    return (
                                                        <div key={pi} className="bg-black/60 border border-white/10 overflow-hidden">
                                                            <div className="flex items-center justify-between px-3 py-1.5 bg-white/[0.04] border-b border-white/[0.06]">
                                                                <span className="text-[9px] font-black text-orange-400/70 uppercase tracking-widest">{part.language}</span>
                                                                <div className="flex items-center gap-2">
                                                                    <button
                                                                        onClick={() => { setEditorCode(part.content); setActiveTab('code'); }}
                                                                        className="text-[9px] font-black text-orange-400 hover:text-orange-300 uppercase tracking-widest px-2 py-0.5 bg-orange-500/15 border border-orange-500/25 hover:bg-orange-500/25 transition-all">
                                                                        ↑ Insert to Editor
                                                                    </button>
                                                                    <button
                                                                        onClick={() => navigator.clipboard.writeText(part.content)}
                                                                        className="text-[9px] text-white/30 hover:text-white transition-colors uppercase tracking-widest">
                                                                        Copy
                                                                    </button>
                                                                </div>
                                                            </div>
                                                            <pre className="text-[10px] text-white/70 font-mono overflow-x-auto p-3 max-h-52 leading-relaxed">
                                                                {part.content.slice(0, 3000)}{part.content.length > 3000 ? '\n... (truncated)' : ''}
                                                            </pre>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                            {chatLoading && (
                                <div className="flex gap-2">
                                    <div className="w-6 h-6 bg-orange-500 flex items-center justify-center text-[9px] font-black text-white flex-shrink-0">AI</div>
                                    <div className="bg-white/[0.04] border border-white/[0.06] px-3 py-2.5 flex items-center gap-1">
                                        <span className="w-1.5 h-1.5 bg-orange-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                                        <span className="w-1.5 h-1.5 bg-orange-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                                        <span className="w-1.5 h-1.5 bg-orange-400 rounded-full animate-bounce" />
                                    </div>
                                </div>
                            )}
                            <div ref={chatEndRef} />
                        </div>

                        {/* Quick actions strip (after initiated) */}
                        {hasInitiated && (
                            <div className="px-3 pb-2 flex-shrink-0 overflow-x-auto">
                                <div className="flex gap-1.5 min-w-max">
                                    {QUICK_ACTIONS.map(a => (
                                        <button key={a.label} onClick={() => sendMessage(a.prompt)}
                                            disabled={chatLoading}
                                            className="text-[9px] font-bold text-white/40 hover:text-white/80 px-2.5 py-1.5 bg-white/[0.03] border border-white/[0.05] hover:border-orange-500/20 transition-all whitespace-nowrap disabled:opacity-40">
                                            {a.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Chat input */}
                        <div className="border-t border-white/[0.06] p-3 flex-shrink-0">
                            <div className="flex gap-2">
                                <textarea
                                    value={chatInput}
                                    onChange={e => setChatInput(e.target.value)}
                                    onKeyDown={e => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault();
                                            if (!hasInitiated) initChat();
                                            sendMessage(chatInput);
                                        }
                                    }}
                                    placeholder={hasInitiated ? 'Ask AI to build, debug, or improve…' : 'Type a question to start…'}
                                    rows={2}
                                    className="flex-1 resize-none bg-white/[0.04] border border-white/10 text-xs text-white placeholder-white/20 focus:outline-none focus:border-orange-500 transition-colors px-3 py-2"
                                    disabled={chatLoading}
                                />
                                <button
                                    onClick={() => { if (!hasInitiated) initChat(); sendMessage(chatInput); }}
                                    disabled={!chatInput.trim() || chatLoading}
                                    className="w-10 flex items-center justify-center bg-orange-500 hover:bg-orange-600 text-white disabled:opacity-40 transition-colors">
                                    <PaperAirplaneIcon className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* ── RIGHT: Code + Preview + Submit ── */}
                    <div className="flex-1 flex flex-col overflow-hidden min-h-0">

                        {/* Desktop sub-tabs */}
                        <div className="hidden lg:flex border-b border-white/[0.06] bg-[#0a0a12] flex-shrink-0">
                            {(['code', 'preview', 'submit'] as const).map(tab => (
                                <button key={tab} onClick={() => setActiveTab(tab)}
                                    className={`px-5 py-3 text-[10px] font-black uppercase tracking-widest transition-colors ${
                                        activeTab === tab
                                            ? 'text-orange-400 border-b-2 border-orange-500 bg-orange-500/5'
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
                        <div className={`flex-1 overflow-hidden ${(activeTab === 'code' || (activeTab === 'build' && false)) ? 'flex' : 'hidden'} flex-col`}
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
                                            className="flex-1 w-full border-0 bg-white"
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
                                                        className="text-[10px] font-black text-orange-400 uppercase tracking-widest px-4 py-2 border border-orange-500/30 hover:bg-orange-500/10 transition-all">
                                                        Open Code Editor
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    )
                                ) : (
                                    <div className="flex-1 flex items-center justify-center flex-col gap-4 bg-black/20">
                                        <EyeIcon className="w-12 h-12 text-white/10" />
                                        <p className="text-white/30 text-sm">No code yet — use AI Builder to generate your project</p>
                                        <button onClick={() => setActiveTab('build')}
                                            className="flex items-center gap-2 text-[10px] font-black text-orange-400 uppercase tracking-widest px-5 py-2.5 bg-orange-500/10 border border-orange-500/30 hover:bg-orange-500/20 transition-all">
                                            <SparklesIcon className="w-3.5 h-3.5" /> Open AI Builder
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
                                    <div className="bg-emerald-500/5 border border-emerald-500/20 px-4 py-3">
                                        <div className="flex items-center justify-between mb-1">
                                            <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">✅ Code from Builder Ready</p>
                                            <span className="text-[9px] text-white/30">{editorCode.length} chars</span>
                                        </div>
                                        <p className="text-[10px] text-white/40">Your code from the editor will be submitted automatically.</p>
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
                                                className="text-[10px] text-orange-400 hover:text-orange-300 font-bold uppercase tracking-widest">
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
                                        className="flex items-center gap-2 px-8 py-3 bg-orange-600 hover:bg-orange-500 text-white text-sm font-black uppercase tracking-widest transition-all disabled:opacity-50 w-full justify-center">
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

                    {/* Instructions */}
                    {activity.instructions && (
                        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                            className="bg-orange-500/5 border border-orange-500/20 p-5">
                            <div className="flex items-center gap-2 mb-3">
                                <ClipboardDocumentListIcon className="w-4 h-4 text-orange-400" />
                                <p className="text-[10px] font-black text-orange-400 uppercase tracking-widest">Instructions</p>
                            </div>
                            <p className="text-sm text-white/70 leading-relaxed whitespace-pre-line">{activity.instructions}</p>
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
                            const isExpanded  = expandedSub === sub.id;
                            const isGrading   = gradingId === sub.id;

                            return (
                                <motion.div key={sub.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: idx * 0.04 }}
                                    className="bg-[#0d0d18] border border-white/[0.06] hover:border-orange-500/20 transition-all">
                                    <button onClick={() => setExpandedSub(isExpanded ? null : sub.id)}
                                        className="w-full flex items-center gap-4 px-5 py-4 text-left">
                                        <div className="w-9 h-9 bg-orange-500/15 border border-orange-500/20 flex items-center justify-center flex-shrink-0">
                                            <span className="text-sm font-black text-orange-300">{studentName[0].toUpperCase()}</span>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-black text-white">{studentName}</p>
                                            <p className="text-[10px] text-white/30">
                                                {sub.submitted_at
                                                    ? new Date(sub.submitted_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
                                                    : 'Not submitted'}
                                            </p>
                                        </div>
                                        <StatusBadge status={sub.status || 'not_submitted'} grade={sub.grade} />
                                        {isExpanded ? <ChevronUpIcon className="w-4 h-4 text-orange-400" /> : <ChevronDownIcon className="w-4 h-4 text-white/20" />}
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
                                                            <p className={LABEL}>💻 Code ({subCode.length} chars)</p>
                                                            <pre className="text-xs text-white/60 bg-black/40 border border-white/10 p-3 overflow-auto max-h-56 font-mono leading-relaxed">
                                                                {subCode.slice(0, 2500)}{subCode.length > 2500 ? '\n...' : ''}
                                                            </pre>
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
                                                                    <input type="number" min="0" max="100" value={gradeInput} onChange={e => setGradeInput(e.target.value)} className={INPUT} autoFocus />
                                                                </div>
                                                                <div className="flex items-end">
                                                                    <div className="w-full">
                                                                        <p className="text-[9px] text-white/30 mb-1">Auto-grade estimate:</p>
                                                                        <p className="text-xl font-black text-emerald-400">{autoGradeSubmission(answers, sub.submission_text || '', sub.file_url || '')}%</p>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            <div>
                                                                <label className={LABEL}>Feedback</label>
                                                                <textarea value={feedbackInput} onChange={e => setFeedbackInput(e.target.value)} rows={2} className={TEXTAREA} placeholder="Great work! Here's what you can improve..." />
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
