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
  QuestionMarkCircleIcon, ChevronRightIcon,
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
    <div className="mermaid bg-white p-6 rounded-3xl flex justify-center overflow-hidden my-8">
      {code}
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

  return <div className="math-container py-4 text-2xl overflow-x-auto text-center" dangerouslySetInnerHTML={{ __html: html }} />;
}

function CanvaRenderer({ blocks, lessonType }: { blocks: any[]; lessonType?: string }) {
  if (!blocks || blocks.length === 0) return null;

  return (
    <div className={`space-y-12 ${lessonType === 'reading' ? 'max-w-3xl mx-auto' : ''}`}>
      {blocks.map((block: any, i: number) => {
        switch (block.type) {
          case 'heading':
            return <h2 key={i} className="text-4xl font-black tracking-tight text-white border-l-[6px] border-cyan-500 pl-8 py-2">{block.content}</h2>;
          case 'text':
            return <p key={i} className="text-xl text-white/60 leading-[1.8] whitespace-pre-wrap">{block.content}</p>;
          case 'code':
            return (
              <div key={i} className="bg-[#050510] rounded-3xl p-8 border border-white/5 font-mono text-sm overflow-x-auto shadow-inner group">
                <div className="flex items-center justify-between mb-6 border-b border-white/5 pb-4">
                  <span className="text-[10px] text-white/30 uppercase font-black tracking-widest">{block.language || 'Snippet'}</span>
                  <div className="flex gap-2">
                    <div className="w-3 h-3 rounded-full bg-rose-500/30" />
                    <div className="w-3 h-3 rounded-full bg-amber-500/30" />
                    <div className="w-3 h-3 rounded-full bg-emerald-500/30" />
                  </div>
                </div>
                <pre><code className="text-cyan-400/90 leading-relaxed">{block.content}</code></pre>
              </div>
            );
          case 'image':
            return (
              <div key={i} className="space-y-4">
                <div className="rounded-[32px] overflow-hidden border border-white/10 shadow-2xl transition-transform hover:scale-[1.01] duration-500">
                  <img src={block.url} alt={block.caption} className="w-full object-cover" />
                </div>
                {block.caption && <p className="text-center text-xs text-white/30 font-bold uppercase tracking-widest italic">{block.caption}</p>}
              </div>
            );
          case 'callout':
            return (
              <div key={i} className={`p-8 rounded-[32px] border-2 shadow-lg ${block.style === 'warning' ? 'bg-amber-500/5 border-amber-500/20' : 'bg-cyan-500/5 border-cyan-500/20'}`}>
                <div className="flex gap-6">
                  <div className="shrink-0 pt-0.5">
                    {block.style === 'warning' ? <ExclamationTriangleIcon className="w-8 h-8 text-amber-500" /> : <InformationCircleIcon className="w-8 h-8 text-cyan-500" />}
                  </div>
                  <div className="space-y-1">
                    <p className={`text-[10px] font-black uppercase tracking-[0.2em] mb-2 ${block.style === 'warning' ? 'text-amber-500' : 'text-cyan-500'}`}>
                      {block.style === 'warning' ? 'Important Note' : 'Pro Tip'}
                    </p>
                    <p className="text-lg font-medium text-white/80 leading-relaxed">{block.content}</p>
                  </div>
                </div>
              </div>
            );
          case 'activity':
            return (
              <div key={i} className="p-8 sm:p-12 rounded-[40px] border-2 border-emerald-500/20 bg-emerald-500/5 space-y-6 relative overflow-hidden group">
                <div className="absolute -right-8 -top-8 w-48 h-48 text-emerald-500/10 transition-transform group-hover:scale-110 rotate-12">
                  <RocketLaunchIcon />
                </div>
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-2xl bg-emerald-500/20 text-emerald-400">
                    <RocketLaunchIcon className="w-7 h-7" />
                  </div>
                  <h3 className="text-2xl font-black uppercase tracking-tight">{block.title || 'Learning Activity'}</h3>
                </div>
                <div className="prose prose-invert prose-lg max-w-none text-white/80 leading-relaxed whitespace-pre-wrap">
                  {block.instructions || 'Follow the instructions provided.'}
                </div>
              </div>
            );
          case 'quiz':
            return (
              <div key={i} className="p-8 sm:p-12 rounded-[40px] border-2 border-violet-500/20 bg-violet-500/5 space-y-8 relative overflow-hidden group">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-2xl bg-violet-500/20 text-violet-400">
                    <QuestionMarkCircleIcon className="w-7 h-7" />
                  </div>
                  <h3 className="text-2xl font-black uppercase tracking-tight">Quick Check</h3>
                </div>
                <div className="space-y-6">
                  <p className="text-xl font-bold text-white leading-relaxed">{block.question}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {block.options?.map((opt: string, optIdx: number) => (
                      <button key={optIdx} className="p-5 rounded-2xl border-2 border-white/5 bg-white/5 hover:border-violet-500/40 hover:bg-violet-500/10 text-left transition-all group/opt">
                        <div className="flex items-center gap-4">
                          <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-xs font-black text-white/40 group-hover/opt:border-violet-500/40 group-hover/opt:text-violet-400">
                            {String.fromCharCode(65 + optIdx)}
                          </div>
                          <span className="font-bold text-white/70 group-hover/opt:text-white">{opt}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            );
          case 'video':
            return (
              <div key={i} className="space-y-4">
                <div className="aspect-video rounded-[40px] overflow-hidden border-2 border-white/5 bg-slate-900 shadow-2xl relative group">
                  <iframe
                    src={`https://www.youtube.com/embed/${block.url?.includes('v=') ? block.url.split('v=')[1].split('&')[0] : block.url?.split('/').pop()}`}
                    className="w-full h-full"
                    allowFullScreen
                  />
                </div>
                {block.caption && <p className="text-center text-sm font-medium text-white/40 italic">{block.caption}</p>}
              </div>
            );
          case 'file':
            return (
              <div key={i} className="p-6 rounded-[32px] border-2 border-white/5 bg-white/5 flex items-center justify-between group hover:border-cyan-500/30 transition-all">
                <div className="flex items-center gap-6">
                  <div className="p-4 rounded-2xl bg-cyan-500/10 text-cyan-400 group-hover:scale-110 transition-transform">
                    <ArrowDownTrayIcon className="w-8 h-8" />
                  </div>
                  <div>
                    <h4 className="text-lg font-bold text-white group-hover:text-cyan-400 transition-colors">{block.fileName || 'Download Resource'}</h4>
                  </div>
                </div>
                <a href={block.url} target="_blank" className="px-6 py-3 rounded-2xl bg-white/5 hover:bg-cyan-500 text-white font-black text-xs uppercase transition-all">Download</a>
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
  <button onClick={onClick} className={`flex items-center gap-2.5 px-6 py-4 rounded-2xl transition-all relative group whitespace-nowrap ${active ? 'bg-gradient-to-r from-cyan-500 to-indigo-500 text-white shadow-[0_10px_30px_-10px_rgba(6,182,212,0.5)]' : 'text-white/30 hover:text-white hover:bg-white/5'}`}>
    <Icon className={`w-4 h-4 transition-transform group-hover:scale-110 ${active ? 'text-white' : 'text-current'}`} />
    <span className="text-[10px] font-black uppercase tracking-[0.15em] shrink-0">{label}</span>
    {count !== undefined && count > 0 && (
      <span className={`px-2 py-0.5 rounded-full text-[8px] font-black min-w-[18px] text-center ${active ? 'bg-white/20 text-white' : 'bg-white/5 text-white/20 group-hover:text-white/40'}`}>
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
  const [sidebarOpen, setSidebarOpen] = useState(true);

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
      {/* Mobile Toggle */}
      <div className="md:hidden p-4 border-b border-white/5 bg-[#0a0a1a] flex items-center justify-between z-50">
        <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 bg-white/5 rounded-xl text-cyan-400">
          <BookOpenIcon className="w-6 h-6" />
        </button>
        <div className="text-[10px] font-black uppercase tracking-widest text-white/40 truncate max-w-[200px]">
          {lesson.title}
        </div>
        <div className="w-10"></div>
      </div>

      {/* Sidebar - Course Syllabus */}
      <aside className={`fixed inset-0 z-40 md:relative md:inset-auto transition-all duration-500 bg-[#0a0a1a]/95 backdrop-blur-xl md:bg-[#0a0a1a] border-r border-white/5 flex flex-col ${sidebarOpen ? 'translate-x-0 w-full md:w-[320px]' : '-translate-x-full md:w-0 overflow-hidden'}`}>
        <div className="p-8 border-b border-white/5 flex items-center justify-between">
          <div>
            <h2 className="text-[10px] font-black text-cyan-500 uppercase tracking-widest mb-1">Programme</h2>
            <p className="font-bold text-white/90 truncate max-w-[200px]">{lesson.courses?.programs?.name || 'Curriculum'}</p>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="md:hidden p-2 text-white/40"><ArrowLeftIcon className="w-5 h-5" /></button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-1.5 custom-scrollbar">
          <div className="px-4 py-2 border-l border-cyan-500/30 mb-4 bg-cyan-500/5 rounded-r-xl">
            <h3 className="text-xs font-black text-white/80 uppercase tracking-tight">{lesson.courses?.title || 'Current Course'}</h3>
            <p className="text-[9px] text-white/40 uppercase font-bold tracking-widest">{courseLessons.length} Modules</p>
          </div>
          {courseLessons.map((l, idx) => (
            <Link key={l.id} href={`/dashboard/lessons/${l.id}${classId ? `?class_id=${classId}` : ''}`}
              className={`flex items-start gap-4 p-4 rounded-2xl transition-all group ${l.id === id ? 'bg-cyan-600/10 border border-cyan-500/20 text-white' : 'hover:bg-white/5 text-white/30 hover:text-white/70'}`}>
              <div className={`shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center text-[10px] font-black transition-colors ${completedIds.has(l.id) ? 'bg-emerald-500 border-emerald-500 text-white' : l.id === id ? 'border-cyan-500 text-cyan-400' : 'border-current'}`}>
                {completedIds.has(l.id) ? <CheckBadgeIcon className="w-3 h-3" /> : idx + 1}
              </div>
              <div className="min-w-0">
                <span className="text-xs font-bold block truncate">{l.title}</span>
                <span className="text-[9px] uppercase tracking-widest font-black opacity-30 mt-0.5 block">{l.lesson_type}</span>
              </div>
            </Link>
          ))}
        </div>

        <div className="p-6 border-t border-white/5">
          <Link href={classId ? `/dashboard/classes/${classId}` : `/dashboard/lessons`} className="flex items-center gap-3 text-[10px] font-black text-white/30 uppercase tracking-[0.2em] hover:text-white transition-colors">
            <ArrowLeftIcon className="w-4 h-4" /> {classId ? 'Exit to Class' : 'Exit Lesson'}
          </Link>
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
          <div className={`max-w-6xl mx-auto px-6 sm:px-12 py-12 md:py-20 space-y-16 ${isReading ? 'max-w-4xl' : ''}`}>
            {/* Header */}
            <header className="space-y-8 animate-in fade-in slide-in-from-top-4 duration-700">
              <div className="flex flex-wrap items-center gap-4">
                <button onClick={() => setSidebarOpen(!sidebarOpen)} className="hidden md:flex p-3 bg-white/5 border border-white/10 rounded-2xl text-white/40 hover:text-cyan-400 hover:border-cyan-500/30 transition-all"><BoltIcon className="w-5 h-5" /></button>
                <div className={`px-5 py-1.5 rounded-full text-[10px] font-black border uppercase tracking-[0.2em] shadow-lg ${TYPE_COLOR[lesson.lesson_type] || 'bg-white/10 text-white border-white/10'}`}>{lesson.lesson_type}</div>
                {lesson.duration_minutes && <div className="text-[10px] font-black text-white/20 uppercase tracking-widest flex items-center gap-2"><ClockIcon className="w-4 h-4 text-cyan-500" />{lesson.duration_minutes} Minutes</div>}
                <div className="flex-1"></div>
                {completed && (
                  <div className="flex items-center gap-2 text-emerald-400 font-black text-[10px] uppercase tracking-widest bg-emerald-500/10 px-4 py-2 rounded-xl">
                    <CheckBadgeIcon className="w-5 h-5" /> Completed
                  </div>
                )}
              </div>
              <h1 className="text-4xl sm:text-7xl font-black tracking-tight leading-[1.1] text-white selection:bg-cyan-500 selection:text-black">{lesson.title}</h1>
              <div className="w-24 h-1 bg-gradient-to-r from-cyan-500 to-transparent rounded-full opacity-50"></div>
              <div className="flex items-start gap-8">
                <p className="text-xl sm:text-2xl text-white/40 max-w-3xl font-medium leading-relaxed italic border-l-4 border-white/5 pl-8">{lesson.description}</p>
              </div>
            </header>
            {/* Nav Tabs - Modern Glass Style */}
            <div className="sticky top-0 z-30 pt-4 pb-8 -mx-6 px-6 sm:-mx-12 sm:px-12 md:relative md:p-0 md:m-0">
               <div className="flex items-center gap-1.5 bg-[#151525]/80 backdrop-blur-2xl p-1.5 rounded-3xl border border-white/5 w-fit shadow-2xl overflow-x-auto no-scrollbar">
                <TabBtn active={activeTab === 'content'} onClick={() => setActiveTab('content')} icon={LayoutIcon} label="Learning" />
                <TabBtn active={activeTab === 'materials'} onClick={() => setActiveTab('materials')} icon={PaperClipIcon} label="Resources" count={materials.length} />
                <TabBtn active={activeTab === 'tasks'} onClick={() => setActiveTab('tasks')} icon={ClipboardDocumentListIcon} label="Tasks & Quizzes" count={courseAssignments.length + programQuizzes.length} />
                <TabBtn active={activeTab === 'plan'} onClick={() => setActiveTab('plan')} icon={AcademicCapIcon} label="Objectives" />
              </div>
            </div>

            {/* Display Area */}
            <div className="min-h-[50vh]">
              {activeTab === 'content' && (
                <div className="animate-in fade-in slide-in-from-bottom-8 duration-1000">
                  <CanvaRenderer blocks={lesson.content_layout || []} lessonType={lesson.lesson_type} />
                  
                  {/* Lesson Complete & Navigation */}
                  <div className="mt-24 pt-24 border-t border-white/5 flex flex-col items-center gap-12 text-center pb-32">
                    {!completed && profile?.role === 'student' ? (
                      <div className="p-1 sm:p-2 bg-gradient-to-br from-cyan-400 via-indigo-500 to-violet-600 rounded-[48px] shadow-2xl shadow-cyan-500/20 group">
                        <button onClick={handleMarkComplete} disabled={marking} 
                          className="px-12 py-7 bg-[#0a0a1a] rounded-[44px] text-white flex flex-col items-center gap-2 group-hover:bg-transparent transition-all">
                          <CheckBadgeIcon className="w-10 h-10 text-cyan-400 group-hover:text-white" />
                          <span className="text-xl font-black uppercase tracking-widest">{marking ? 'Securing Data...' : 'Finish Module'}</span>
                          <span className="text-[10px] opacity-40 font-bold uppercase tracking-widest">Mark as successfully completed</span>
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-6">
                        <div className="w-20 h-20 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 ring-4 ring-emerald-500/10">
                          <CheckBadgeIcon className="w-10 h-10" />
                        </div>
                        <h4 className="text-3xl font-black text-white italic">Module Complete</h4>
                      </div>
                    )}

                    {nextLesson && (
                      <div className="w-full max-w-2xl bg-white/5 border border-white/10 rounded-[40px] p-8 sm:p-12 space-y-8 group hover:border-cyan-500/30 transition-all">
                         <h5 className="text-[10px] font-black uppercase tracking-[0.3em] text-cyan-400 border-b border-cyan-500/20 pb-4 w-fit mx-auto">Up Next</h5>
                         <div className="space-y-4">
                           <h3 className="text-3xl sm:text-4xl font-black text-white/90 group-hover:text-white transition-colors">{nextLesson.title}</h3>
                           <p className="text-sm text-white/30 uppercase tracking-widest font-black leading-relaxed flex items-center justify-center gap-3">
                             {nextLesson.lesson_type} <span className="w-1 h-1 rounded-full bg-white/20"></span> {courseLessons.findIndex(l => l.id === nextLesson.id) + 1} of {courseLessons.length}
                           </p>
                         </div>
                         <Link href={`/dashboard/lessons/${nextLesson.id}`}
                           className="inline-flex items-center gap-3 px-10 py-5 bg-white text-black font-black uppercase text-xs tracking-widest rounded-2xl hover:scale-105 transition-all shadow-2xl shadow-white/10">
                           Go to Next Module <ChevronRightIcon className="w-4 h-4" />
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
                      className="group p-8 bg-white/5 border border-white/10 rounded-[32px] flex flex-col gap-6 hover:bg-white/10 hover:border-cyan-500/30 transition-all">
                      <div className="flex items-center justify-between">
                        <div className="p-4 bg-cyan-500/10 rounded-2xl text-cyan-400">
                          <PaperClipIcon className="w-6 h-6" />
                        </div>
                        <ArrowDownTrayIcon className="w-5 h-5 text-white/20 group-hover:text-cyan-400 group-hover:scale-110 transition-all" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-[9px] font-black uppercase tracking-widest text-cyan-400/50">{m.file_type || 'Shared File'}</p>
                        <h4 className="font-bold text-xl group-hover:text-white transition-colors">{m.title}</h4>
                      </div>
                    </a>
                  ))}
                  {materials.length === 0 && (
                    <div className="col-span-full py-32 text-center text-white/10 uppercase font-black text-[10px] tracking-widest">
                      No additional resources shared for this module.
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
                            className="p-8 bg-white/5 border border-white/10 rounded-[32px] hover:bg-amber-500/5 hover:border-amber-500/30 transition-all group flex items-center justify-between gap-6">
                            <div className="flex items-center gap-8">
                              <div className="p-5 bg-amber-500/10 rounded-2.5xl text-amber-500 group-hover:scale-110 transition-transform hidden sm:block">
                                <DocumentTextIcon className="w-7 h-7" />
                              </div>
                              <div className="space-y-1">
                                <h4 className="font-black text-xl text-white transition-colors">{a.title}</h4>
                                <div className="flex items-center gap-4 text-[10px] font-bold uppercase tracking-widest text-white/30">
                                  <span>{a.assignment_type}</span>
                                  <span className="w-1 h-1 rounded-full bg-white/20"></span>
                                  <span className={a.due_date && new Date(a.due_date) < new Date() ? 'text-rose-400' : 'text-amber-500/50'}>
                                    {a.due_date ? `Deadline: ${new Date(a.due_date).toLocaleDateString()}` : 'No deadline'}
                                  </span>
                                </div>
                              </div>
                            </div>
                            <ChevronRightIcon className="w-6 h-6 text-white/10 group-hover:text-amber-500 group-hover:translate-x-1 transition-all" />
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
                            className="p-8 bg-white/5 border border-white/10 rounded-[32px] hover:bg-violet-500/5 hover:border-violet-500/30 transition-all group flex items-center justify-between gap-6">
                            <div className="flex items-center gap-8">
                              <div className="p-5 bg-violet-500/10 rounded-2.5xl text-violet-400 group-hover:scale-110 transition-transform hidden sm:block">
                                <StarIcon className="w-7 h-7" />
                              </div>
                              <div className="space-y-1">
                                <h4 className="font-black text-xl text-white transition-colors">{q.title}</h4>
                                <div className="flex items-center gap-4 text-[10px] font-bold uppercase tracking-widest text-white/30">
                                  <span>{q.duration_minutes} Minutes</span>
                                  <span className="w-1 h-1 rounded-full bg-white/20"></span>
                                  <span>{q.total_questions} Questions</span>
                                </div>
                              </div>
                            </div>
                            <ChevronRightIcon className="w-6 h-6 text-white/10 group-hover:text-violet-400 group-hover:translate-x-1 transition-all" />
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'plan' && (
                <div className="max-w-4xl mx-auto bg-white/5 border border-white/10 rounded-[48px] p-8 sm:p-16 space-y-16 animate-in fade-in slide-in-from-bottom-4 duration-500">
                  <div className="relative">
                    <div className="absolute -left-8 top-0 bottom-0 w-1 bg-gradient-to-b from-cyan-500 to-transparent rounded-full opacity-20"></div>
                    <PlanBlock title="Target Outcomes & Goals" content={plans?.objectives} />
                  </div>
                  <div className="relative">
                    <div className="absolute -left-8 top-0 bottom-0 w-1 bg-gradient-to-b from-violet-500 to-transparent rounded-full opacity-20"></div>
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
  <div className="space-y-6">
    <h4 className="text-[11px] font-black uppercase text-cyan-400 tracking-[0.4em] mb-4">{title}</h4>
    <p className="text-xl sm:text-2xl text-white/70 leading-[1.8] font-serif italic whitespace-pre-wrap">{content || 'Curriculum details for this module are still being finalized. Check back soon.'}</p>
  </div>
);
