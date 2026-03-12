'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import {
  ArrowLeftIcon, PlayIcon, DocumentTextIcon, AcademicCapIcon,
  ClockIcon, BookOpenIcon, CheckCircleIcon, ClipboardDocumentListIcon,
  PaperClipIcon, ArrowDownTrayIcon, VideoCameraIcon, DocumentIcon,
  PhotoIcon, BoltIcon, CheckBadgeIcon, LockClosedIcon,
  InformationCircleIcon, ExclamationTriangleIcon, RocketLaunchIcon,
  QuestionMarkCircleIcon, ChevronRightIcon, XMarkIcon,
} from '@heroicons/react/24/outline';
import { StarIcon } from '@heroicons/react/24/solid';
import Script from 'next/script';

const TYPE_COLOR: Record<string, string> = {
  video: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
  'hands-on': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  hands_on: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  interactive: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  workshop: 'bg-violet-500/20 text-violet-400 border-violet-500/30',
  coding: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
};

// --- Sub-components ---

function MermaidRenderer({ code }: { code: string }) {
  useEffect(() => {
    if (typeof window !== 'undefined' && (window as any).mermaid) {
      try {
        (window as any).mermaid.contentLoaded();
      } catch (e) {
        console.error("Mermaid error:", e);
      }
    }
  }, [code]);

  return (
    <div className="my-12 space-y-4">
      <div className="flex items-center gap-3 px-6">
        <div className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse" />
        <p className="text-[10px] font-black text-cyan-500/60 uppercase tracking-[0.3em]">System Architecture Diagram</p>
      </div>
      <div className="mermaid bg-white p-8 sm:p-12 rounded-[40px] sm:rounded-[60px] flex justify-center overflow-x-auto shadow-2xl border-4 border-white/5 relative group">
        <div className="absolute inset-0 bg-cyan-500/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
        {code}
      </div>
    </div>
  );
}

function MathRenderer({ formula }: { formula: string }) {
  const [html, setHtml] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined' && (window as any).katex) {
      try {
        const rendered = (window as any).katex.renderToString(formula, {
          throwOnError: false,
          displayMode: true
        });
        setHtml(rendered);
      } catch (e) {
        setHtml(`<span class="text-rose-400">Error: ${formula}</span>`);
      }
    } else {
      setHtml(`<span class="font-serif italic text-white/80">${formula}</span>`);
    }
  }, [formula]);

  return (
    <div className="my-12 p-10 sm:p-20 bg-indigo-500/5 border-2 border-indigo-500/10 rounded-[40px] sm:rounded-[60px] relative overflow-hidden group shadow-3xl text-center">
      <div className="absolute -left-10 -top-10 w-48 h-48 bg-indigo-500/10 blur-3xl rounded-full group-hover:scale-125 transition-transform" />
      <p className="text-[10px] font-black text-indigo-400/60 uppercase tracking-[0.4em] mb-10 relative z-10">Mathematical Synthesis</p>
      <div className="math-container text-2xl sm:text-5xl text-white relative z-10 overflow-x-auto py-4" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}

function CanvaRenderer({ blocks, lessonType }: { blocks: any[]; lessonType?: string }) {
  if (!blocks || blocks.length === 0) return null;

  return (
    <div className={`space-y-10 sm:space-y-20 ${lessonType === 'reading' ? 'max-w-3xl mx-auto' : ''}`}>
      {blocks.map((block: any, i: number) => {
        switch (block.type) {
          case 'heading':
            return (
              <div key={i} className="relative group pt-6">
                <div className="absolute -left-6 sm:-left-12 top-0 bottom-0 w-1.5 bg-gradient-to-b from-cyan-500 to-indigo-500 rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
                <h2 className="text-3xl sm:text-6xl font-black tracking-tight text-white leading-[1.1]">
                  {block.content}
                </h2>
              </div>
            );
          case 'text':
            return (
              <div key={i} className="relative py-4">
                <p className="text-xl sm:text-2xl text-white/50 leading-[1.7] whitespace-pre-wrap font-medium selection:bg-cyan-500/30">
                  {block.content}
                </p>
              </div>
            );
          case 'code':
            return (
              <div key={i} className="bg-[#050510] rounded-[2rem] sm:rounded-[3rem] p-6 sm:p-12 border border-white/5 font-mono text-xs sm:text-base overflow-x-auto shadow-2xl relative group">
                <div className="flex items-center justify-between mb-6 sm:mb-8 border-b border-white/5 pb-4 sm:pb-6">
                  <div className="flex items-center gap-2 sm:gap-3">
                    <div className="w-3 h-3 rounded-full bg-rose-500/40" />
                    <div className="w-3 h-3 rounded-full bg-amber-500/40" />
                    <div className="w-3 h-3 rounded-full bg-emerald-500/40" />
                  </div>
                  <span className="text-[10px] text-white/20 uppercase font-black tracking-widest">{block.language || 'Snippet'}</span>
                </div>
                <pre><code className="text-cyan-400/80 leading-relaxed">{block.content}</code></pre>
              </div>
            );
          case 'image':
            return (
              <div key={i} className="space-y-4 sm:space-y-8">
                <div className="rounded-[40px] sm:rounded-[60px] overflow-hidden border border-white/10 shadow-3xl transition-all hover:scale-[1.01] duration-700 hover:border-cyan-500/20">
                  <img src={block.url} alt={block.caption} className="w-full object-cover" />
                </div>
                {block.caption && <p className="text-center text-[10px] sm:text-xs text-white/20 font-black uppercase tracking-[0.3em] italic px-10">{block.caption}</p>}
              </div>
            );
          case 'callout':
            const isWarning = block.style === 'warning';
            return (
              <div key={i} className={`p-8 sm:p-16 rounded-[40px] sm:rounded-[60px] border-2 shadow-2xl relative overflow-hidden group ${isWarning ? 'bg-rose-500/5 border-rose-500/10' : 'bg-cyan-500/5 border-cyan-500/10'}`}>
                <div className={`absolute -right-12 -top-12 w-48 sm:w-64 h-48 sm:h-64 opacity-[0.03] transition-transform group-hover:scale-110 ${isWarning ? 'text-rose-500' : 'text-cyan-500'}`}>
                  {isWarning ? <ExclamationTriangleIcon /> : <InformationCircleIcon />}
                </div>
                <div className="flex flex-col sm:flex-row gap-8 sm:gap-12 relative z-10">
                  <div className={`shrink-0 p-5 sm:p-7 rounded-[2rem] sm:rounded-[2.5rem] shadow-xl ${isWarning ? 'bg-rose-500/20 text-rose-400' : 'bg-cyan-500/20 text-cyan-400'}`}>
                    {isWarning ? <ExclamationTriangleIcon className="w-10 h-10 sm:w-16 sm:h-16" /> : <InformationCircleIcon className="w-10 h-10 sm:w-16 sm:h-16" />}
                  </div>
                  <div className="space-y-3">
                    <p className={`text-[11px] sm:text-[12px] font-black uppercase tracking-[0.3em] ${isWarning ? 'text-rose-400' : 'text-cyan-400'}`}>
                      {isWarning ? 'Strict Requirement' : 'Key Insight'}
                    </p>
                    <p className="text-xl sm:text-3xl font-black text-white leading-relaxed tracking-tight">{block.content}</p>
                  </div>
                </div>
              </div>
            );
          case 'activity':
            return (
              <div key={i} className="p-10 sm:p-24 rounded-[60px] sm:rounded-[80px] border-2 border-emerald-500/20 bg-[#0a0a1a] space-y-12 sm:space-y-20 relative overflow-hidden group shadow-[0_40px_100px_rgba(16,185,129,0.1)] transition-all hover:border-emerald-500/40">
                <div className="absolute -right-32 -top-32 w-80 sm:w-[500px] h-80 sm:h-[500px] text-emerald-500/[0.03] transition-transform group-hover:scale-110 rotate-12 pointer-events-none">
                  <RocketLaunchIcon />
                </div>
                <div className="flex flex-col sm:flex-row items-center sm:items-start gap-10 sm:gap-16 relative z-10 text-center sm:text-left">
                  <div className="p-8 sm:p-12 rounded-[3rem] sm:rounded-[4rem] bg-emerald-500/10 text-emerald-400 shadow-3xl ring-8 ring-emerald-500/5 group-hover:scale-110 transition-transform duration-700">
                    <RocketLaunchIcon className="w-12 h-12 sm:w-24 sm:h-24 animate-pulse" />
                  </div>
                  <div className="space-y-4">
                    <div className="flex items-center justify-center sm:justify-start gap-3">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      <p className="text-[11px] sm:text-[14px] font-black text-emerald-500/60 uppercase tracking-[0.5em]">Active Lab</p>
                    </div>
                    <h3 className="text-4xl sm:text-7xl font-black uppercase tracking-tighter text-white leading-none">{block.title || 'Hands-on Synthesis'}</h3>
                  </div>
                </div>
                <div className="relative z-10 sm:pl-16 border-l-8 border-emerald-500/10 py-4">
                  <div className="text-2xl sm:text-4xl font-medium text-white/70 leading-[1.6] whitespace-pre-wrap italic">
                    {block.instructions || 'Initializing protocol. Follow the prompt.'}
                  </div>
                </div>
              </div>
            );
          case 'quiz':
            return (
              <div key={i} className="p-10 sm:p-24 rounded-[60px] sm:rounded-[80px] border-2 border-violet-500/20 bg-[#0a0a1a] space-y-12 sm:space-y-20 relative overflow-hidden group shadow-[0_40px_100px_rgba(139,92,246,0.1)] transition-all hover:border-violet-500/40">
                <div className="flex flex-col sm:flex-row items-center sm:items-start gap-8 sm:gap-12 relative z-10 text-center sm:text-left">
                  <div className="p-6 rounded-[2rem] bg-violet-500/10 text-violet-400 shadow-2xl ring-4 ring-violet-500/5">
                    <QuestionMarkCircleIcon className="w-10 h-10 sm:w-16 sm:h-16" />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-center sm:justify-start gap-3">
                      <span className="w-2 h-2 rounded-full bg-violet-500 shadow-[0_0_10px_violet]" />
                      <p className="text-[11px] font-black text-violet-400/60 uppercase tracking-[0.4em]">Checkpoint Alpha</p>
                    </div>
                    <h3 className="text-3xl sm:text-5xl font-black uppercase tracking-tighter text-white">Validation Sync</h3>
                  </div>
                </div>
                <div className="space-y-12 sm:space-y-20 relative z-10">
                  <p className="text-3xl sm:text-6xl font-black text-white leading-[1.1] tracking-tighter text-center sm:text-left">{block.question}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-10">
                    {block.options?.map((opt: string, optIdx: number) => (
                      <button key={optIdx} className="p-8 sm:p-14 rounded-[3rem] sm:rounded-[4rem] border-2 border-white/5 bg-white/[0.02] hover:border-violet-500/40 hover:bg-violet-500/10 text-left transition-all group/opt shadow-2xl active:scale-[0.98]">
                        <div className="flex items-center gap-8 sm:gap-12">
                          <div className="w-12 h-12 sm:w-20 sm:h-20 rounded-[1.5rem] sm:rounded-[2rem] bg-white/5 border border-white/10 flex items-center justify-center text-[14px] sm:text-[20px] font-black text-white/20 group-hover/opt:border-violet-500/40 group-hover/opt:text-violet-400 transition-colors">
                            {String.fromCharCode(65 + optIdx)}
                          </div>
                          <span className="font-black text-xl sm:text-3xl text-white/50 group-hover/opt:text-white leading-tight transition-colors">{opt}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            );
          case 'video':
            return (
              <div key={i} className="space-y-4 sm:space-y-8">
                <div className="aspect-video rounded-[40px] sm:rounded-[60px] overflow-hidden border-2 border-white/10 bg-slate-900 shadow-3xl relative group">
                  <iframe
                    src={`https://www.youtube.com/embed/${block.url?.includes('v=') ? block.url.split('v=')[1].split('&')[0] : block.url?.split('/').pop()}`}
                    className="w-full h-full"
                    allowFullScreen
                  />
                </div>
                {block.caption && <p className="text-center text-xs sm:text-sm font-black uppercase tracking-[0.3em] text-white/20 italic px-4">{block.caption}</p>}
              </div>
            );
          case 'file':
            return (
              <div key={i} className="p-6 sm:p-12 rounded-[40px] sm:rounded-[60px] border-2 border-white/10 bg-white/5 flex flex-col sm:flex-row items-center justify-between gap-8 group hover:border-cyan-500/30 transition-all text-center sm:text-left shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-600/5 blur-3xl rounded-full" />
                <div className="flex flex-col sm:flex-row items-center gap-6 sm:gap-10 relative z-10">
                  <div className="p-5 sm:p-8 rounded-[2rem] sm:rounded-[2.5rem] bg-cyan-500/10 text-cyan-400 group-hover:scale-110 transition-transform shadow-xl">
                    <ArrowDownTrayIcon className="w-8 h-8 sm:w-12 sm:h-12" />
                  </div>
                  <div>
                    <h4 className="text-xl sm:text-3xl font-black text-white group-hover:text-cyan-400 transition-colors truncate max-w-[200px] sm:max-w-md tracking-tight">{block.fileName || 'Learning Resource'}</h4>
                    <p className="text-[10px] font-black text-white/20 uppercase tracking-[0.2em] mt-1">Ready for Download</p>
                  </div>
                </div>
                <a href={block.url} target="_blank" className="relative z-10 w-full sm:w-auto px-10 py-5 rounded-2xl sm:rounded-3xl bg-cyan-600 hover:bg-cyan-500 text-white font-black text-xs sm:text-sm uppercase tracking-[0.2em] transition-all shadow-2xl active:scale-95">Download Now</a>
              </div>
            );
          case 'mermaid':
            return <MermaidRenderer key={i} code={block.code || ''} />;
          case 'math':
            return <MathRenderer key={i} formula={block.formula || ''} />;
          default:
            return null;
        }
      })}
    </div>
  );
}

const TabBtn = ({ active, onClick, icon: Icon, label, count }: any) => (
  <button onClick={onClick} className={`flex items-center gap-2 sm:gap-2.5 px-4 sm:px-6 py-3 sm:py-4 rounded-xl sm:rounded-2xl transition-all relative group whitespace-nowrap ${active ? 'bg-gradient-to-r from-cyan-500 to-indigo-500 text-white shadow-[0_10px_30px_-10px_rgba(6,182,212,0.5)]' : 'text-white/30 hover:text-white hover:bg-white/5'}`}>
    <Icon className={`w-3.5 h-3.5 sm:w-4 sm:h-4 transition-transform group-hover:scale-110 ${active ? 'text-white' : 'text-current'}`} />
    <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-[0.1em] sm:tracking-[0.15em] shrink-0">{label}</span>
    {count !== undefined && count > 0 && (
      <span className={`px-1.5 py-0.5 rounded-full text-[8px] font-black min-w-[16px] sm:min-w-[18px] text-center ${active ? 'bg-white/20 text-white' : 'bg-white/5 text-white/20 group-hover:text-white/40'}`}>
        {count}
      </span>
    )}
    {active && <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-cyan-400 rounded-full blur-[2px] shadow-[0_0_8px_cyan]" />}
  </button>
);

// --- Main Page Component ---

export default function LessonDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  const router = useRouter();
  const searchParams = useSearchParams();
  const classId = searchParams?.get('class_id');
  const { profile, loading: authLoading } = useAuth();

  const [lesson, setLesson] = useState<any>(null);
  const [courseLessons, setCourseLessons] = useState<any[]>([]);
  const [courseAssignments, setCourseAssignments] = useState<any[]>([]);
  const [programQuizzes, setProgramQuizzes] = useState<any[]>([]);
  const [plans, setPlans] = useState<any>(null);
  const [materials, setMaterials] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'content' | 'materials' | 'tasks' | 'plan'>('content');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [completed, setCompleted] = useState(false);
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [marking, setMarking] = useState(false);
  const [markError, setMarkError] = useState<string | null>(null);
  const startTimeRef = useState<number>(() => Date.now())[0];
  const [notesRead, setNotesRead] = useState(false);
  const [isCinemaMode, setIsCinemaMode] = useState(false);

  const nextLesson = useMemo(() => {
    if (!id || courseLessons.length === 0) return null;
    const idx = courseLessons.findIndex(l => l.id === id);
    return idx !== -1 && idx < courseLessons.length - 1 ? courseLessons[idx + 1] : null;
  }, [id, courseLessons]);

  const isStaff = profile?.role === 'admin' || profile?.role === 'teacher';

  const fetchData = useCallback(async () => {
    if (!profile || !id) return;
    const db = createClient();
    try {
      const { data: lessonData, error: lErr } = await db
        .from('lessons')
        .select(`
          *, 
          lesson_notes, 
          courses (
            id, 
            title, 
            program_id,
            programs ( id, name )
          ), 
          portal_users!lessons_created_by_fkey ( full_name )
        `)
        .eq('id', id)
        .maybeSingle();

      if (lErr) throw lErr;
      if (!lessonData) { setError('Lesson not found'); return; }
      const lessonObj = lessonData as any;
      setLesson(lessonObj);

      const [plansRes, materialsRes] = await Promise.all([
        db.from('lesson_plans').select('*').eq('lesson_id', id).maybeSingle(),
        db.from('lesson_materials').select('*').eq('lesson_id', id).order('created_at', { ascending: true }),
      ]);
      setPlans(plansRes.data);
      setMaterials(materialsRes.data ?? []);

      if (lessonObj.course_id) {
        const [cLessons, cAsgns, cQuizzes] = await Promise.all([
          db.from('lessons').select('id, title, order_index, lesson_type').eq('course_id', lessonObj.course_id).order('order_index', { ascending: true }),
          db.from('assignments').select('id, title, assignment_type, due_date').eq('course_id', lessonObj.course_id),
          db.from('cbt_exams').select('id, title, duration_minutes, total_points').eq('program_id', lessonObj.courses?.program_id || lessonObj.courses?.programs?.id || '')
        ]);
        setCourseLessons(cLessons.data ?? []);
        setCourseAssignments(cAsgns.data ?? []);
        setProgramQuizzes(cQuizzes.data ?? []);
      }

      if (profile.role === 'student') {
        const { data: progress } = await db.from('lesson_progress').select('lesson_id, completed_at').eq('user_id', profile.id);
        const cIds = new Set<string>();
        progress?.forEach((p: any) => { if (p.completed_at) cIds.add(p.lesson_id); });
        setCompletedIds(cIds);
        if (cIds.has(id)) setCompleted(true);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [id, profile]);

  useEffect(() => {
    if (!authLoading && profile) fetchData();
  }, [authLoading, profile, fetchData]);

  const handleMarkComplete = async () => {
    if (!profile || !id || marking || completed) return;
    setMarking(true);
    const timeSpent = Math.round((Date.now() - startTimeRef) / 60000);
    try {
      const res = await fetch(`/api/lessons/${id}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeSpentMinutes: Math.max(timeSpent, 1), progressPercentage: 100 }),
      });
      if (!res.ok) throw new Error('Failed to mark complete');
      setCompleted(true);
      setCompletedIds(prev => new Set([...prev, id]));
    } catch (e: any) {
      setMarkError(e.message);
    } finally {
      setMarking(false);
    }
  };

  if (authLoading || loading) return (
    <div className="min-h-screen bg-[#0f0f1a] flex flex-col items-center justify-center gap-4">
      <div className="w-10 h-10 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin" />
      <p className="text-white/20 text-xs font-black uppercase tracking-widest">Loading Learning Environment...</p>
      <Script src="https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js" strategy="afterInteractive" onLoad={() => {
        (window as any).mermaid?.initialize({ startOnLoad: true, theme: 'neutral' });
      }} />
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css" />
      <Script src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js" strategy="afterInteractive" />
    </div>
  );

  if (error || !lesson) return (
    <div className="min-h-screen bg-[#070710] flex flex-col items-center justify-center p-8 text-center gap-6">
      <ExclamationTriangleIcon className="w-16 h-16 text-rose-500/20" />
      <h2 className="text-3xl font-black text-rose-400">Lesson Error</h2>
      <p className="text-white/40 max-w-md">{error || 'Unable to load lesson content. Please check your connection or contact support.'}</p>
      <Link href="/dashboard" className="px-8 py-3 bg-white/5 border border-white/10 rounded-2xl text-xs font-black uppercase">Back to Dashboard</Link>
    </div>
  );

  const heroVideo = lesson.lesson_type === 'video' ? (lesson.content_layout as any[])?.find(b => b.type === 'video') : null;
  const isCoding = lesson.lesson_type === 'coding';
  const isReading = lesson.lesson_type === 'reading';

  return (
    <div className="min-h-screen bg-[#070710] text-white flex flex-col md:flex-row h-screen overflow-hidden">
      {/* Mobile Header (Techy & Clean) */}
      <div className="md:hidden p-5 border-b border-white/5 bg-[#0a0a1a]/80 backdrop-blur-xl flex items-center justify-between z-50 sticky top-0">
        <div className="flex items-center gap-4">
          <button onClick={() => setSidebarOpen(true)} className="p-3 bg-white/5 rounded-2xl text-cyan-400 hover:bg-cyan-500/10 transition-all border border-white/5 active:scale-95 shadow-xl">
            <LayoutIcon className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <p className="text-[9px] font-black text-cyan-500/60 uppercase tracking-[0.2em] leading-none mb-1">In Session</p>
            <h2 className="text-xs font-black text-white/90 truncate max-w-[150px] uppercase tracking-wider">{lesson.title}</h2>
          </div>
        </div>
        <div className="flex items-center gap-2">
           <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
           <span className="text-[8px] font-black text-white/20 uppercase tracking-widest">Live</span>
        </div>
      </div>

      {/* Sidebar - Course Syllabus (Nucleus Style) */}
      <aside className={`fixed inset-0 z-[60] md:relative md:inset-auto transition-all duration-700 ease-in-out md:translate-x-0 ${sidebarOpen ? 'translate-x-0 w-full md:w-[360px]' : '-translate-x-full w-full md:w-0 overflow-hidden'}`}>
        {/* Mobile Backdrop */}
        <div className={`md:hidden absolute inset-0 bg-black/80 backdrop-blur-md transition-opacity duration-700 ${sidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} onClick={() => setSidebarOpen(false)} />
        
        <div className="relative h-full bg-[#0a0a1a] border-r border-white/5 flex flex-col w-[85%] max-w-[340px] md:w-full shadow-[20px_0_50px_rgba(0,0,0,0.5)]">
          <div className="p-8 border-b border-white/5 flex items-center justify-between bg-gradient-to-br from-white/[0.02] to-transparent">
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-500" />
                <h2 className="text-[10px] font-black text-white/30 uppercase tracking-[0.3em]">Curriculum</h2>
              </div>
              <p className="font-black text-white text-lg leading-tight truncate max-w-[200px]">{lesson.courses?.programs?.name || 'Academic Track'}</p>
            </div>
            <button onClick={() => setSidebarOpen(false)} className="md:hidden p-3 bg-white/5 rounded-2xl text-white/20 hover:text-white transition-all hover:bg-rose-500/10 active:scale-95">
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-2 custom-scrollbar bg-[#080812]">
            <div className="px-6 py-5 bg-white/5 border border-white/5 rounded-3xl mb-6 shadow-2xl relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-24 h-24 bg-cyan-600/10 blur-2xl -mr-12 -mt-12 group-hover:scale-150 transition-transform" />
              <h3 className="text-xs font-black text-cyan-400 uppercase tracking-widest relative z-10">{lesson.courses?.title || 'Operational Syllabus'}</h3>
              <div className="flex items-center gap-2 mt-2 relative z-10">
                <span className="text-[9px] font-black text-white/20 uppercase tracking-[0.2em]">{courseLessons.length} Modules Total</span>
                <div className="h-px flex-1 bg-white/10" />
              </div>
            </div>

            <div className="space-y-1.5">
              {courseLessons.map((l, idx) => {
                const isActive = l.id === id;
                const isCompleted = completedIds.has(l.id);
                return (
                  <Link key={l.id} href={`/dashboard/lessons/${l.id}${classId ? `?class_id=${classId}` : ''}`}
                    onClick={() => setSidebarOpen(false)}
                    className={`flex items-center gap-4 p-4 rounded-2xl transition-all relative group overflow-hidden ${isActive ? 'bg-cyan-500/10 text-white shadow-xl ring-1 ring-cyan-500/20' : 'hover:bg-white/5 text-white/20 hover:text-white/60'}`}>
                    {isActive && <div className="absolute left-0 top-0 w-1 h-full bg-cyan-500 shadow-[0_0_15px_cyan]" />}
                    
                    <div className={`shrink-0 w-8 h-8 rounded-xl border flex items-center justify-center text-[10px] font-black transition-all ${isCompleted ? 'bg-emerald-500 border-emerald-500 text-white shadow-lg shadow-emerald-500/20' : isActive ? 'bg-white text-black border-white' : 'border-white/10 group-hover:border-white/20 group-hover:bg-white/5'}`}>
                      {isCompleted ? <CheckBadgeIcon className="w-4 h-4" /> : idx + 1}
                    </div>
                    
                    <div className="min-w-0 flex-1">
                      <span className={`text-[11px] font-black block truncate leading-tight uppercase tracking-wide ${isActive ? 'text-white' : 'text-current group-hover:text-white/80'}`}>{l.title}</span>
                      <div className="flex items-center gap-2 mt-1">
                         <span className="text-[8px] uppercase tracking-widest font-black opacity-30">{l.lesson_type}</span>
                         {isCompleted && <span className="text-[8px] text-emerald-500 font-bold uppercase tracking-widest">Verified</span>}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>

          <div className="p-8 border-t border-white/5 bg-gradient-to-t from-black to-transparent">
            <Link href={classId ? `/dashboard/classes/${classId}` : `/dashboard/lessons`} className="flex items-center justify-center gap-3 px-6 py-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl text-[10px] font-black text-white/40 hover:text-white uppercase tracking-[0.3em] transition-all shadow-xl active:scale-95 group">
              <ArrowLeftIcon className="w-4 h-4 transition-transform group-hover:-translate-x-1" /> 
              {classId ? 'Leave Session' : 'Exit Hub'}
            </Link>
          </div>
        </div>
      </aside>

      <main className={`flex-1 overflow-y-auto relative ${isCinemaMode ? 'bg-black' : 'bg-[#070710]'} custom-scrollbar scroll-smooth`}>
        {/* Cinema Mode Toggle (for video) */}
        {lesson.lesson_type === 'video' && heroVideo && (
          <div className={`transition-all duration-700 ${isCinemaMode ? 'h-screen w-full' : 'h-0 overflow-hidden'}`}>
             <iframe src={`https://www.youtube.com/embed/${heroVideo.url.includes('v=') ? heroVideo.url.split('v=')[1].split('&')[0] : heroVideo.url.split('/').pop()}?rel=0&autoplay=1`}
              className="w-full h-full border-0" allowFullScreen />
             <button onClick={() => setIsCinemaMode(false)} className="absolute top-8 right-8 p-4 bg-black/60 backdrop-blur-md rounded-full text-white hover:scale-110 transition-transform">
               <ArrowDownTrayIcon className="w-6 h-6 rotate-180" />
             </button>
          </div>
        )}

        {/* Dynamic Video Hero (Standard) */}
        {lesson.lesson_type === 'video' && heroVideo && !isCinemaMode && (
          <div className="w-full bg-black aspect-video lg:h-[70vh] relative shadow-2xl group overflow-hidden border-b border-white/5">
            <iframe src={`https://www.youtube.com/embed/${heroVideo.url.includes('v=') ? heroVideo.url.split('v=')[1].split('&')[0] : heroVideo.url.split('/').pop()}?rel=0&autoplay=0`}
              className="w-full h-full border-0" allowFullScreen />
            <div className="absolute top-0 left-0 right-0 p-8 flex justify-between items-start opacity-0 group-hover:opacity-100 transition-opacity">
              <button onClick={() => setIsCinemaMode(true)} className="bg-cyan-500/80 backdrop-blur-md px-6 py-3 rounded-2xl text-[11px] font-black uppercase tracking-widest text-white shadow-xl hover:bg-cyan-400 transition-all">Enable Cinema Mode</button>
            </div>
          </div>
        )}

        {!isCinemaMode && (
          <div className={`max-w-6xl mx-auto px-4 sm:px-12 py-8 sm:py-20 space-y-10 sm:space-y-16 ${isReading ? 'max-w-4xl' : ''}`}>
            {/* Header */}
            <header className="space-y-10 sm:space-y-16 animate-in fade-in slide-in-from-top-12 duration-1000">
              <div className="flex flex-wrap items-center gap-4 sm:gap-6">
                <button onClick={() => setSidebarOpen(!sidebarOpen)} className="hidden md:flex p-4 bg-white/5 border border-white/10 rounded-2xl text-white/40 hover:text-cyan-400 hover:border-cyan-500/30 transition-all shadow-xl group">
                  <BoltIcon className="w-6 h-6 group-hover:rotate-12 transition-transform" />
                </button>
                <div className={`px-6 py-2 rounded-full text-[10px] sm:text-[11px] font-black border uppercase tracking-[0.3em] shadow-3xl ${TYPE_COLOR[lesson.lesson_type] || 'bg-white/10 text-white border-white/10'}`}>
                  {lesson.lesson_type}
                </div>
                {lesson.duration_minutes && (
                  <div className="text-[10px] sm:text-[11px] font-black text-white/30 uppercase tracking-[0.2em] flex items-center gap-3 bg-white/5 px-6 py-2 rounded-full border border-white/10">
                    <ClockIcon className="w-5 h-5 text-cyan-500" />
                    {lesson.duration_minutes} Min
                  </div>
                )}
                <div className="flex-1"></div>
                {completed && (
                  <div className="flex items-center gap-2 text-emerald-400 font-black text-[10px] sm:text-[11px] uppercase tracking-[0.3em] bg-emerald-500/10 px-6 py-2.5 rounded-2xl border border-emerald-500/20 shadow-3xl shadow-emerald-500/20">
                    <CheckBadgeIcon className="w-5 h-5 sm:w-6 sm:h-6" /> Mastery
                  </div>
                )}
              </div>
              <div className="space-y-8">
                <h1 className="text-4xl sm:text-9xl font-black tracking-[0.02em] leading-[0.9] text-white selection:bg-cyan-500 selection:text-black">
                  {lesson.title}
                </h1>
                <div className="h-2 w-32 bg-gradient-to-r from-cyan-600 to-transparent rounded-full opacity-40"></div>
                <div className="flex items-start gap-8 max-w-4xl">
                  <p className="text-xl sm:text-4xl text-white/40 font-medium leading-[1.5] italic border-l-4 border-white/10 pl-8 sm:pl-12 py-3">
                    {lesson.description}
                  </p>
                </div>
              </div>
            </header>
            {/* Nav Tabs - Modern Glass Style */}
            <div className="sticky top-0 z-30 pt-4 pb-12 -mx-4 px-4 sm:-mx-12 sm:px-12 md:relative md:p-0 md:m-0 flex justify-center sm:justify-start">
               <div className="flex items-center gap-1.5 sm:gap-2 bg-[#0B0B1B]/95 backdrop-blur-3xl p-2 rounded-[2rem] border border-white/10 w-fit shadow-3xl overflow-x-auto no-scrollbar max-w-full">
                <TabBtn active={activeTab === 'content'} onClick={() => setActiveTab('content')} icon={LayoutIcon} label="Learning" />
                <TabBtn active={activeTab === 'materials'} onClick={() => setActiveTab('materials')} icon={PaperClipIcon} label="Resources" count={materials.length} />
                <TabBtn active={activeTab === 'tasks'} onClick={() => setActiveTab('tasks')} icon={ClipboardDocumentListIcon} label="Tasks" count={courseAssignments.length + programQuizzes.length} />
                <TabBtn active={activeTab === 'plan'} onClick={() => setActiveTab('plan')} icon={AcademicCapIcon} label="Plan" />
              </div>
            </div>

            {/* Display Area */}
            <div className="min-h-[50vh]">
              {activeTab === 'content' && (
                <div className="animate-in fade-in slide-in-from-bottom-8 duration-1000">
                  <CanvaRenderer blocks={lesson.content_layout || []} lessonType={lesson.lesson_type} />
                  
                  {/* Lesson Complete & Navigation */}
                  <div className="mt-24 sm:mt-40 pt-24 sm:pt-40 border-t border-white/5 flex flex-col items-center gap-12 sm:gap-20 text-center pb-40 sm:pb-56">
                    {!completed && profile?.role === 'student' ? (
                      <div className="relative group">
                        <div className="absolute -inset-1 bg-gradient-to-r from-cyan-400 via-indigo-500 to-violet-600 rounded-[3rem] sm:rounded-[4rem] blur opacity-30 group-hover:opacity-100 transition duration-1000 group-hover:duration-200 animate-pulse"></div>
                        <button onClick={handleMarkComplete} disabled={marking} 
                          className="relative px-12 sm:px-20 py-8 sm:py-12 bg-[#0a0a1a] rounded-[2.8rem] sm:rounded-[3.8rem] text-white flex flex-col items-center gap-4 transition-all active:scale-95 border border-white/10">
                          <div className="p-5 bg-cyan-500/20 rounded-3xl text-cyan-400 shadow-2xl group-hover:scale-110 transition-transform duration-500">
                             <CheckBadgeIcon className="w-10 h-10 sm:w-14 sm:h-14" />
                          </div>
                          <div>
                            <span className="text-2xl sm:text-4xl font-black uppercase tracking-[0.2em]">{marking ? 'Processing...' : 'Sync Mastery'}</span>
                            <span className="block text-[10px] sm:text-[12px] opacity-40 font-black uppercase tracking-[0.4em] mt-2">Close Operative Module</span>
                          </div>
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-8 group">
                        <div className="w-24 h-24 sm:w-32 sm:h-32 rounded-full bg-emerald-500/10 border-4 border-emerald-500/20 flex items-center justify-center text-emerald-400 shadow-[0_0_50px_rgba(16,185,129,0.2)] group-hover:scale-110 transition-transform duration-700">
                          <CheckBadgeIcon className="w-12 h-12 sm:w-20 sm:h-20" />
                        </div>
                        <div className="space-y-2">
                           <h4 className="text-4xl sm:text-6xl font-black text-white italic tracking-tighter">Module Synchronized</h4>
                           <p className="text-[11px] font-black text-white/20 uppercase tracking-[0.5em]">Advancement Recorded</p>
                        </div>
                      </div>
                    )}

                    {nextLesson && (
                      <div className="w-full max-w-4xl bg-[#0a0a1a] border border-white/5 rounded-[4rem] p-10 sm:p-20 space-y-10 sm:space-y-14 group hover:border-cyan-500/20 transition-all shadow-3xl relative overflow-hidden">
                         <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-600/5 blur-[120px] -mr-32 -mt-32 pointer-events-none" />
                         <div className="space-y-6 relative z-10">
                           <div className="flex items-center justify-center gap-4">
                             <div className="h-px w-12 bg-cyan-500/30" />
                             <h5 className="text-[12px] font-black uppercase tracking-[0.5em] text-cyan-500/60">Sequence Advance</h5>
                             <div className="h-px w-12 bg-cyan-500/30" />
                           </div>
                           <h3 className="text-4xl sm:text-7xl font-black text-white group-hover:text-cyan-400 transition-colors tracking-tighter leading-none">{nextLesson.title}</h3>
                           <div className="flex items-center justify-center gap-6">
                              <span className="px-6 py-2 bg-white/5 rounded-full text-[10px] font-black uppercase tracking-widest text-white/40">{nextLesson.lesson_type}</span>
                              <span className="text-[10px] font-black text-cyan-500/30 uppercase tracking-[0.3em]">Module {courseLessons.findIndex(l => l.id === nextLesson.id) + 1} of {courseLessons.length}</span>
                           </div>
                         </div>
                         <Link href={`/dashboard/lessons/${nextLesson.id}${classId ? `?class_id=${classId}` : ''}`}
                           className="relative z-10 inline-flex items-center gap-4 px-12 sm:px-16 py-6 sm:py-8 bg-white text-black font-black uppercase text-[12px] sm:text-[14px] tracking-[0.3em] rounded-3xl hover:bg-cyan-500 hover:text-white transition-all shadow-[0_20px_60px_rgba(255,255,255,0.1)] active:scale-95 group/btn">
                           Engage Module <ChevronRightIcon className="w-5 h-5 transition-transform group-hover/btn:translate-x-2" />
                         </Link>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'materials' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-4xl mx-auto">
                  {materials.map((m: any) => (
                    <a key={m.id} href={m.file_url} target="_blank" 
                      className="group p-8 sm:p-10 bg-[#0a0a1a] border border-white/5 rounded-[40px] flex flex-col gap-10 hover:bg-white/[0.03] hover:border-cyan-500/30 transition-all shadow-2xl relative overflow-hidden">
                      <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-600/5 blur-3xl rounded-full" />
                      <div className="flex items-center justify-between relative z-10">
                        <div className="p-5 bg-cyan-500/10 rounded-2xl text-cyan-400 group-hover:scale-110 transition-transform shadow-xl">
                          <PaperClipIcon className="w-8 h-8" />
                        </div>
                        <div className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/20 group-hover:text-cyan-400 group-hover:border-cyan-500/40 group-hover:scale-110 transition-all shadow-xl">
                          <ArrowDownTrayIcon className="w-5 h-5" />
                        </div>
                      </div>
                      <div className="space-y-3 relative z-10">
                        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-cyan-400/50">{m.file_type || 'Shared Artifact'}</p>
                        <h4 className="font-black text-2xl text-white group-hover:text-cyan-400 transition-colors leading-tight tracking-tight">{m.title}</h4>
                        <p className="text-[10px] font-black text-white/20 uppercase tracking-widest mt-2">{m.file_size ? `${(m.file_size / 1024 / 1024).toFixed(2)} MB` : 'Cloud Link'}</p>
                      </div>
                    </a>
                  ))}
                  {materials.length === 0 && (
                    <div className="col-span-full py-40 text-center bg-[#0a0a1a] border border-dashed border-white/5 rounded-[3rem] shadow-2xl">
                      <PaperClipIcon className="w-16 h-16 mx-auto text-white/5 mb-6 opacity-20" />
                      <p className="text-xl font-black text-white/20 uppercase tracking-widest">No shared resources</p>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'tasks' && (
                <div className="max-w-4xl mx-auto space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-32">
                  <div className="space-y-6">
                    <h3 className="text-xs font-black text-amber-500 uppercase tracking-[0.3em] flex items-center gap-3 px-6 py-2 bg-amber-500/5 border border-amber-500/10 rounded-full w-fit">
                      <ClipboardDocumentListIcon className="w-4 h-4" /> Module Assessments
                    </h3>
                    {courseAssignments.length === 0 ? (
                      <p className="text-white/20 text-xs italic px-6">No specific tasks assigned for this module.</p>
                    ) : (
                      <div className="grid grid-cols-1 gap-4">
                        {courseAssignments.map((a: any) => (
                          <Link key={a.id} href={`/dashboard/assignments/${a.id}`} 
                            className="p-8 sm:p-10 bg-[#0a0a1a] border border-white/5 rounded-[40px] hover:bg-amber-500/[0.03] hover:border-amber-500/30 transition-all group flex items-center justify-between gap-8 shadow-2xl relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-amber-600/5 blur-3xl rounded-full" />
                            <div className="flex items-center gap-10 relative z-10">
                              <div className="p-6 bg-amber-500/10 border border-amber-500/20 rounded-3xl text-amber-500 group-hover:scale-110 transition-transform shadow-xl hidden sm:flex">
                                <DocumentTextIcon className="w-8 h-8" />
                              </div>
                              <div className="space-y-2">
                                <h4 className="font-black text-2xl text-white group-hover:text-amber-400 transition-colors tracking-tight">{a.title}</h4>
                                <div className="flex flex-wrap items-center gap-4 text-[10px] font-black uppercase tracking-[0.2em] text-white/20">
                                  <span className="px-3 py-1 bg-white/5 rounded-lg text-amber-500/60 font-black">{a.assignment_type}</span>
                                  <span className="w-1.5 h-1.5 rounded-full bg-white/10"></span>
                                  <span className={a.due_date && new Date(a.due_date) < new Date() ? 'text-rose-400 animate-pulse' : 'text-white/30'}>
                                    {a.due_date ? `Deadline: ${new Date(a.due_date).toLocaleDateString()}` : 'No deadline'}
                                  </span>
                                </div>
                              </div>
                            </div>
                            <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-white/10 group-hover:text-amber-400 group-hover:border-amber-500/40 group-hover:translate-x-1 transition-all shadow-xl">
                               <ChevronRightIcon className="w-6 h-6" />
                            </div>
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="space-y-6 pt-12 border-t border-white/5">
                    <h3 className="text-xs font-black text-violet-400 uppercase tracking-[0.3em] flex items-center gap-3 px-6 py-2 bg-violet-500/5 border border-violet-500/10 rounded-full w-fit">
                      <AcademicCapIcon className="w-4 h-4" /> Curriculum Quizzes
                    </h3>
                    {programQuizzes.length === 0 ? (
                      <p className="text-white/20 text-xs italic px-6">No quizzes found in this programme curriculum.</p>
                    ) : (
                      <div className="grid grid-cols-1 gap-4">
                        {programQuizzes.map((q: any) => (
                          <Link key={q.id} href={`/dashboard/cbt/${q.id}`} 
                            className="p-8 sm:p-10 bg-[#0a0a1a] border border-white/5 rounded-[40px] hover:bg-violet-500/[0.03] hover:border-violet-500/30 transition-all group flex items-center justify-between gap-8 shadow-2xl relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-violet-600/5 blur-3xl rounded-full" />
                            <div className="flex items-center gap-10 relative z-10">
                              <div className="p-6 bg-violet-500/10 border border-violet-500/20 rounded-3xl text-violet-400 group-hover:scale-110 transition-transform shadow-xl hidden sm:flex">
                                <StarIcon className="w-8 h-8" />
                              </div>
                              <div className="space-y-2">
                                <h4 className="font-black text-2xl text-white group-hover:text-violet-400 transition-colors tracking-tight">{q.title}</h4>
                                <div className="flex flex-wrap items-center gap-4 text-[10px] font-black uppercase tracking-[0.2em] text-white/20">
                                  <span className="px-3 py-1 bg-white/5 rounded-lg text-violet-500/60 font-black">{q.duration_minutes} Min Sync</span>
                                  <span className="w-1.5 h-1.5 rounded-full bg-white/10"></span>
                                  <span className="text-white/30">{q.total_questions} Logical Units</span>
                                </div>
                              </div>
                            </div>
                            <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-white/10 group-hover:text-violet-400 group-hover:border-violet-500/40 group-hover:translate-x-1 transition-all shadow-xl">
                               <ChevronRightIcon className="w-6 h-6" />
                            </div>
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

               {activeTab === 'plan' && (
                <div className="max-w-4xl mx-auto bg-white/5 border border-white/10 rounded-3xl sm:rounded-[48px] p-8 sm:p-16 space-y-12 sm:space-y-16 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
                  <div className="relative">
                    <div className="absolute -left-4 sm:-left-8 top-0 bottom-0 w-1 bg-gradient-to-b from-cyan-500 to-transparent rounded-full opacity-20"></div>
                    <PlanBlock title="Target Outcomes & Goals" content={plans?.objectives} />
                  </div>
                  <div className="relative">
                    <div className="absolute -left-4 sm:-left-8 top-0 bottom-0 w-1 bg-gradient-to-b from-violet-500 to-transparent rounded-full opacity-20"></div>
                    <PlanBlock title="Applied Learning Activities" content={plans?.activities} />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

const LayoutIcon = ({ className }: any) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
);

const PlanBlock = ({ title, content }: any) => (
  <div className="space-y-8 sm:space-y-10 group">
    <div className="flex items-center gap-4">
      <div className="h-px flex-1 bg-gradient-to-r from-transparent to-white/10" />
      <h4 className="text-[10px] sm:text-[11px] font-black uppercase text-cyan-400/60 tracking-[0.4em] sm:tracking-[0.5em]">{title}</h4>
      <div className="h-px flex-1 bg-gradient-to-l from-transparent to-white/10" />
    </div>
    <div className="relative p-10 sm:p-14 bg-white/5 border border-white/5 rounded-[40px] sm:rounded-[60px] shadow-2xl overflow-hidden group-hover:border-cyan-500/20 transition-all">
       <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-600/5 blur-3xl rounded-full" />
       <p className="text-xl sm:text-3xl text-white/70 leading-relaxed sm:leading-[1.8] font-medium italic whitespace-pre-wrap relative z-10">{content || 'Curriculum details for this module are still being finalized. Check back soon.'}</p>
    </div>
  </div>
);
