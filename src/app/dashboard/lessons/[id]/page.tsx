'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import {
  ArrowLeftIcon, PlayIcon, DocumentTextIcon, AcademicCapIcon,
  ClockIcon, BookOpenIcon, CheckCircleIcon,
  PaperClipIcon, ArrowDownTrayIcon, VideoCameraIcon, DocumentIcon,
  PhotoIcon, BoltIcon, CheckBadgeIcon, LockClosedIcon,
  InformationCircleIcon, ExclamationTriangleIcon, RocketLaunchIcon,
  QuestionMarkCircleIcon, ChevronRightIcon,
} from '@heroicons/react/24/outline';
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
  <button onClick={onClick}
    className={`relative flex items-center gap-3 px-6 py-3.5 rounded-[18px] text-[11px] font-black uppercase tracking-widest transition-all duration-300 ${active ? 'bg-cyan-600 text-white shadow-xl shadow-cyan-900/40' : 'text-white/40 hover:text-white hover:bg-white/5'}`}>
    <Icon className="w-4 h-4" />
    {label}
    {count !== undefined && count > 0 && (
      <span className={`px-1.5 py-0.5 rounded-md text-[9px] ${active ? 'bg-white/20' : 'bg-white/10'}`}>{count}</span>
    )}
  </button>
);

// --- Main Page Component ---

export default function LessonDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  const router = useRouter();
  const { profile, loading: authLoading } = useAuth();

  const [lesson, setLesson] = useState<any>(null);
  const [courseLessons, setCourseLessons] = useState<any[]>([]);
  const [plans, setPlans] = useState<any>(null);
  const [materials, setMaterials] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'content' | 'materials' | 'plan'>('content');
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const [completed, setCompleted] = useState(false);
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [marking, setMarking] = useState(false);
  const [markError, setMarkError] = useState<string | null>(null);
  const startTimeRef = useState<number>(() => Date.now())[0];
  const [notesRead, setNotesRead] = useState(false);

  const isStaff = profile?.role === 'admin' || profile?.role === 'teacher';

  const fetchData = useCallback(async () => {
    if (!profile || !id) return;
    const db = createClient();
    try {
      const { data: lessonData, error: lErr } = await db
        .from('lessons')
        .select('*, lesson_notes, courses(id, title, programs(name)), portal_users!lessons_created_by_fkey(full_name)')
        .eq('id', id)
        .maybeSingle();

      if (lErr) throw lErr;
      if (!lessonData) { setError('Lesson not found'); return; }
      setLesson(lessonData);

      const [plansRes, materialsRes] = await Promise.all([
        db.from('lesson_plans').select('*').eq('lesson_id', id).maybeSingle(),
        db.from('lesson_materials').select('*').eq('lesson_id', id).order('created_at', { ascending: true }),
      ]);
      setPlans(plansRes.data);
      setMaterials(materialsRes.data ?? []);

      if (lessonData.course_id) {
        const { data: cLessons } = await db.from('lessons').select('id, title, order_index, lesson_type').eq('course_id', lessonData.course_id).order('order_index', { ascending: true });
        setCourseLessons(cLessons ?? []);
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
    <div className="min-h-screen bg-[#070710] text-white flex overflow-hidden">
      {/* Sidebar */}
      <aside className={`transition-all duration-500 border-r border-white/5 bg-[#0a0a1a] flex flex-col ${sidebarOpen ? 'w-[360px]' : 'w-0 overflow-hidden'}`}>
        <div className="p-8 border-b border-white/5">
          <h2 className="text-sm font-black text-cyan-400 uppercase tracking-widest mb-1">Module Library</h2>
          <p className="text-lg font-bold truncate text-white/90">{lesson.courses?.title || 'Current Course'}</p>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {courseLessons.map((l, idx) => (
            <Link key={l.id} href={`/dashboard/lessons/${l.id}`}
              className={`flex items-center gap-3 p-4 rounded-2xl transition-all ${l.id === id ? 'bg-cyan-600/10 border border-cyan-500/20 text-white' : 'hover:bg-white/5 text-white/40'}`}>
              <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-[10px] font-black ${completedIds.has(l.id) ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-current'}`}>
                {idx + 1}
              </div>
              <span className="text-xs font-bold truncate">{l.title}</span>
            </Link>
          ))}
        </div>
      </aside>

      <main className={`flex-1 overflow-y-auto transition-all duration-500 ${isCoding ? 'bg-[#050508]' : ''}`}>
        {/* Dynamic Video Hero */}
        {lesson.lesson_type === 'video' && heroVideo && (
          <div className="w-full bg-black aspect-video lg:h-[65vh] relative shadow-2xl">
            <iframe src={`https://www.youtube.com/embed/${heroVideo.url.includes('v=') ? heroVideo.url.split('v=')[1].split('&')[0] : heroVideo.url.split('/').pop()}?rel=0&autoplay=0`}
              className="w-full h-full border-0" allowFullScreen />
            <div className="absolute top-0 left-0 right-0 p-8 flex justify-between items-start pointer-events-none">
              <div className="bg-black/60 backdrop-blur-md px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest text-cyan-400 border border-white/10">Cinematic Mode</div>
            </div>
          </div>
        )}

        <div className={`max-w-5xl mx-auto px-8 py-12 space-y-16 ${isReading ? 'max-w-3xl' : ''}`}>
          {/* Header */}
          <header className="space-y-6">
            <div className="flex items-center gap-4">
              <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-3 bg-white/5 border border-white/10 rounded-2xl text-white/40 hover:text-white transition-all"><BoltIcon className="w-5 h-5" /></button>
              <div className={`px-4 py-1 rounded-full text-[10px] font-black border uppercase tracking-widest ${TYPE_COLOR[lesson.lesson_type] || 'bg-white/10 text-white border-white/10'}`}>{lesson.lesson_type}</div>
              {lesson.duration_minutes && <div className="text-[10px] font-black text-white/30 uppercase flex items-center gap-2"><ClockIcon className="w-4 h-4" />{lesson.duration_minutes} Mins</div>}
            </div>
            <h1 className="text-4xl sm:text-6xl font-black tracking-tight leading-none text-white">{lesson.title}</h1>
            <p className="text-xl text-white/50 max-w-2xl font-medium leading-relaxed">{lesson.description}</p>
          </header>

          {/* Nav Tabs */}
          <div className="flex items-center gap-2 bg-[#151525] p-1.5 rounded-2xl border border-white/5 w-fit shadow-2xl">
            <TabBtn active={activeTab === 'content'} onClick={() => setActiveTab('content')} icon={LayoutIcon} label="Learning" />
            <TabBtn active={activeTab === 'materials'} onClick={() => setActiveTab('materials')} icon={PaperClipIcon} label="Resources" count={materials.length} />
            <TabBtn active={activeTab === 'plan'} onClick={() => setActiveTab('plan')} icon={AcademicCapIcon} label="Curriculum" />
          </div>

          {/* Display Area */}
          {activeTab === 'content' && (
            <div className="animate-in fade-in slide-in-from-bottom-8 duration-700">
              <CanvaRenderer blocks={lesson.content_layout || []} lessonType={lesson.lesson_type} />

              {!completed && profile?.role === 'student' && (
                <div className="mt-24 p-12 rounded-[40px] bg-gradient-to-br from-cyan-600 to-indigo-700 text-center space-y-8 shadow-2xl">
                  <h3 className="text-3xl font-black text-white italic">Ready to finish?</h3>
                  <button onClick={handleMarkComplete} disabled={marking} className="px-12 py-5 bg-white text-indigo-700 font-black rounded-2xl hover:scale-105 transition-all shadow-xl">
                    {marking ? 'Saving...' : 'Complete Module'}
                  </button>
                </div>
              )}
            </div>
          )}

          {activeTab === 'materials' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in duration-500">
              {materials.map((m: any) => (
                <a key={m.id} href={m.file_url} target="_blank" className="p-6 bg-white/5 border border-white/10 rounded-3xl flex items-center justify-between hover:bg-white/10 transition-all">
                  <div className="flex items-center gap-4">
                    <div className="p-4 bg-cyan-500/10 rounded-2xl text-cyan-400 font-black text-[10px] uppercase">{m.file_type || 'Asset'}</div>
                    <span className="font-bold text-lg">{m.title}</span>
                  </div>
                  <ArrowDownTrayIcon className="w-5 h-5 text-white/20" />
                </a>
              ))}
              {materials.length === 0 && <div className="col-span-full py-20 text-center text-white/20 uppercase font-black text-xs tracking-widest">No resources uploaded.</div>}
            </div>
          )}

          {activeTab === 'plan' && (
            <div className="bg-white/5 border border-white/10 rounded-[40px] p-12 space-y-12 animate-in fade-in duration-500">
              <PlanBlock title="Target Outcomes" content={plans?.objectives} />
              <PlanBlock title="Applied Activities" content={plans?.activities} />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

const LayoutIcon = ({ className }: any) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
);

const PlanBlock = ({ title, content }: any) => (
  <div className="space-y-4">
    <h4 className="text-[10px] font-black uppercase text-cyan-400 tracking-widest">{title}</h4>
    <p className="text-xl text-white/70 leading-relaxed font-serif italic">{content || 'Details pending...'}</p>
  </div>
);
