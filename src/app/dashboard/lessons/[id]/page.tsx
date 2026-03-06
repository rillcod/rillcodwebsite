'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import {
  ArrowLeftIcon, PlayIcon, DocumentTextIcon, AcademicCapIcon,
  PencilIcon, ClockIcon, BookOpenIcon, CheckCircleIcon, LinkIcon,
  PaperClipIcon, ArrowDownTrayIcon, VideoCameraIcon, DocumentIcon,
  PhotoIcon, BoltIcon, CheckBadgeIcon, LockClosedIcon,
  InformationCircleIcon, ExclamationTriangleIcon
} from '@heroicons/react/24/outline';

const TYPE_COLOR: Record<string, string> = {
  video: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
  'hands-on': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  hands_on: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  interactive: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  workshop: 'bg-violet-500/20 text-violet-400 border-violet-500/30',
  coding: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
};

export default function LessonDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  const router = useRouter();
  const { profile, loading: authLoading } = useAuth();

  const [lesson, setLesson] = useState<any>(null);
  const [plans, setPlans] = useState<any>(null);
  const [materials, setMaterials] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'content' | 'materials' | 'plan'>('content');

  const isStaff = profile?.role === 'admin' || profile?.role === 'teacher';

  const fetchData = useCallback(async () => {
    if (!profile || !id) return;
    const db = createClient();
    try {
      const [lessonRes, plansRes, materialsRes] = await Promise.all([
        db.from('lessons').select('*, courses(id, title, programs(name)), portal_users!lessons_created_by_fkey(full_name)').eq('id', id).maybeSingle(),
        db.from('lesson_plans').select('*').eq('lesson_id', id).maybeSingle(),
        db.from('lesson_materials').select('*').eq('lesson_id', id).order('created_at', { ascending: true })
      ]);

      if (lessonRes.error) throw lessonRes.error;
      if (!lessonRes.data) throw new Error('Lesson not found');

      setLesson(lessonRes.data);
      setPlans(plansRes.data);
      setMaterials(materialsRes.data ?? []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [id, profile, isStaff]);

  useEffect(() => {
    if (!authLoading && profile) {
      fetchData();
    }
  }, [authLoading, profile, fetchData]);

  if (authLoading || loading) return (
    <div className="min-h-screen bg-[#0f0f1a] flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (error || !lesson) return (
    <div className="min-h-screen bg-[#0f0f1a] flex flex-col items-center justify-center gap-4">
      <p className="text-rose-400 font-semibold">{error ?? 'Lesson not found'}</p>
      <Link href="/dashboard/lessons" className="text-sm text-cyan-400 hover:underline">← Back to Lessons</Link>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0f0f1a] text-white selection:bg-cyan-500/30">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">

        {/* Header Section */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-6">
          <button onClick={() => router.back()}
            className="w-10 h-10 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-colors shrink-0">
            <ArrowLeftIcon className="w-5 h-5 text-white/60" />
          </button>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <BookOpenIcon className="w-4 h-4 text-cyan-400" />
              <span className="text-[10px] font-black text-cyan-400 uppercase tracking-[0.2em]">Lesson Detail</span>
              {lesson.courses && (
                <>
                  <span className="text-white/20">/</span>
                  <Link href={`/dashboard/courses/${lesson.courses.id}`}
                    className="text-[10px] text-white/40 hover:text-white transition-colors truncate font-bold uppercase tracking-widest">
                    {lesson.courses.title}
                  </Link>
                </>
              )}
            </div>
            <h1 className="text-3xl sm:text-5xl font-black tracking-tight leading-tight">{lesson.title}</h1>
          </div>

          {isStaff && (
            <Link href={`/dashboard/lessons/${id}/edit`}
              className="flex items-center gap-2 px-6 py-3 bg-cyan-600 hover:bg-cyan-500 text-white font-black text-sm rounded-2xl transition-all shadow-xl shadow-cyan-900/40">
              <PencilIcon className="w-4 h-4 stroke-[3px]" /> EDIT LESSON
            </Link>
          )}
        </div>

        {/* Stats & Meta Badges */}
        <div className="flex flex-wrap items-center gap-4 p-4 bg-white/5 border border-white/10 rounded-2xl">
          <div className={`px-4 py-1.5 rounded-full text-[10px] font-black border uppercase tracking-widest ${TYPE_COLOR[lesson.lesson_type] ?? 'bg-white/10 text-white/40 border-white/10'}`}>
            {lesson.lesson_type?.replace(/[-_]/g, ' ')}
          </div>
          {lesson.duration_minutes && (
            <div className="flex items-center gap-2 text-xs font-bold text-white/40">
              <ClockIcon className="w-4 h-4" /> {lesson.duration_minutes} MINS
            </div>
          )}
          <div className="h-4 w-px bg-white/10 mx-1" />
          <div className="flex items-center gap-2 text-xs font-bold text-white/40">
            <span className={`w-2 h-2 rounded-full ${lesson.status === 'active' ? 'bg-emerald-500 animate-pulse' : 'bg-white/20'}`} />
            <span className="uppercase tracking-widest">{lesson.status}</span>
          </div>
        </div>

        {/* Dynamic Navigation Tabs */}
        <div className="flex items-center gap-1 p-1 bg-white/5 border border-white/10 rounded-[20px] w-fit">
          <TabButton active={activeTab === 'content'} onClick={() => setActiveTab('content')} icon={DocumentTextIcon} label="Content" />
          <TabButton active={activeTab === 'materials'} onClick={() => setActiveTab('materials')} icon={PaperClipIcon} label="Materials" count={materials.length} />
          <TabButton
            active={activeTab === 'plan'}
            onClick={() => setActiveTab('plan')}
            icon={AcademicCapIcon}
            label={isStaff ? "Staff Plan" : "Lesson Overview"}
          />
        </div>

        {/* Main Content Renderers */}
        <div className="min-h-[400px]">
          {activeTab === 'content' && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-8">
              {/* Media Section */}
              {lesson.lesson_type === 'video' && lesson.video_url && (
                <div className="group relative bg-black rounded-[40px] overflow-hidden aspect-video shadow-2xl border border-white/10 ring-1 ring-white/5">
                  <VideoPlayer url={lesson.video_url} title={lesson.title} />
                </div>
              )}

              {/* Main Text Content */}
              <div className="bg-white/5 border border-white/10 rounded-[40px] overflow-hidden p-8 sm:p-16 shadow-2xl relative">
                <div className="absolute top-0 right-0 p-12 opacity-[0.03] pointer-events-none">
                  <BookOpenIcon className="w-64 h-64" />
                </div>
                <CanvaRenderer layout={lesson.content_layout} fallback={lesson.content} description={lesson.description} />
              </div>
            </div>
          )}

          {activeTab === 'materials' && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 grid grid-cols-1 sm:grid-cols-2 gap-4">
              {materials.length === 0 ? (
                <div className="col-span-full py-32 flex flex-col items-center justify-center bg-white/5 border border-white/10 rounded-[40px] border-dashed">
                  <div className="w-20 h-20 rounded-3xl bg-white/5 flex items-center justify-center mb-6">
                    <PaperClipIcon className="w-10 h-10 text-white/20" />
                  </div>
                  <h3 className="text-xl font-bold text-white mb-2">No files here yet</h3>
                  <p className="text-white/30 text-sm max-w-xs text-center">Resources and downloadable materials will appear here once uploaded.</p>
                </div>
              ) : (
                materials.map((m: any) => (
                  <a key={m.id} href={m.file_url} target="_blank" rel="noreferrer"
                    className="flex items-center gap-5 p-6 bg-white/5 border border-white/10 rounded-3xl hover:border-cyan-500/50 hover:bg-cyan-500/5 transition-all group">
                    <div className="w-14 h-14 rounded-2xl bg-cyan-500/10 flex items-center justify-center shrink-0 group-hover:scale-110 group-hover:bg-cyan-500/20 transition-all">
                      <FileTypeIcon type={m.file_type} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-lg text-white truncate leading-tight mb-1">{m.title}</p>
                      <div className="flex items-center gap-2">
                        <p className="text-[10px] text-white/40 uppercase font-black tracking-widest">{m.file_type || 'Asset'}</p>
                        <span className="w-1 h-1 rounded-full bg-white/10" />
                        <p className="text-[10px] text-cyan-400 font-black uppercase tracking-widest">Downloadable</p>
                      </div>
                    </div>
                    <ArrowDownTrayIcon className="w-5 h-5 text-white/20 group-hover:text-cyan-400 group-hover:translate-y-0.5 transition-all" />
                  </a>
                ))
              )}
            </div>
          )}

          {activeTab === 'plan' && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 bg-white/5 border border-white/10 rounded-[40px] p-8 sm:p-20 space-y-16 shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 right-0 p-12 opacity-[0.03] pointer-events-none">
                <AcademicCapIcon className="w-80 h-80" />
              </div>

              {!plans ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <div className="w-20 h-20 rounded-3xl bg-amber-500/10 flex items-center justify-center mb-6">
                    <ExclamationTriangleIcon className="w-10 h-10 text-amber-500/40" />
                  </div>
                  <h3 className="text-xl font-bold text-white mb-2">No active lesson plan</h3>
                  <p className="text-white/30 text-sm max-w-sm">Detailed instructor guidelines haven't been published for this session.</p>
                </div>
              ) : (
                <div className="space-y-12 relative z-10">
                  <PlanSection title="Learning Objectives" content={plans.objectives} icon={BoltIcon} color="text-amber-400" />
                  <PlanSection title="Activities / Sequence" content={plans.activities} icon={PlayIcon} color="text-emerald-400" />
                  {isStaff && <PlanSection title="Assessment & Review" content={plans.assessment_methods} icon={CheckBadgeIcon} color="text-cyan-400" />}
                  {isStaff && plans.staff_notes && (
                    <div className="pt-12 border-t border-white/5">
                      <PlanSection title="Staff Confidential" content={plans.staff_notes} icon={LockClosedIcon} color="text-rose-400" />
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Bottom Navigation */}
        <div className="flex items-center justify-between pt-12 border-t border-white/5">
          <Link href="/dashboard/lessons"
            className="flex items-center gap-3 px-6 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl text-sm font-black uppercase tracking-widest text-white/40 hover:text-white transition-all">
            <ArrowLeftIcon className="w-4 h-4" /> Back to List
          </Link>
          {lesson.courses && (
            <Link href={`/dashboard/courses/${lesson.courses.id}`}
              className="flex items-center gap-3 px-6 py-3 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/20 rounded-2xl text-sm font-black uppercase tracking-widest text-cyan-400 transition-all">
              <BookOpenIcon className="w-4 h-4" /> View Course
            </Link>
          )}
        </div>

      </div>
    </div>
  );
}

// ── Components & Helpers ─────────────────────────────────────

function TabButton({ active, onClick, icon: Icon, label, count }: any) {
  return (
    <button onClick={onClick}
      className={`relative flex items-center gap-3 px-6 py-3.5 rounded-[18px] text-[11px] font-black uppercase tracking-[0.1em] transition-all duration-300 ${active ? 'bg-cyan-600 text-white shadow-xl shadow-cyan-900/40' : 'text-white/40 hover:text-white hover:bg-white/5'}`}>
      <Icon className={`w-4 h-4 ${active ? 'stroke-[3px]' : 'stroke-[2px]'}`} />
      {label}
      {count !== undefined && count > 0 && (
        <span className={`px-1.5 py-0.5 rounded-md text-[9px] ${active ? 'bg-white/20' : 'bg-white/10'}`}>{count}</span>
      )}
    </button>
  );
}

function VideoPlayer({ url, title }: any) {
  if (url.includes('youtube') || url.includes('youtu.be')) {
    const videoId = url.includes('v=') ? url.split('v=')[1].split('&')[0] : url.split('youtu.be/')[1].split('?')[0];
    return (
      <iframe src={`https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1`}
        className="w-full h-full" allowFullScreen title={title} />
    );
  }
  return <video src={url} controls playsInline preload="metadata" className="w-full h-full object-contain" />;
}

function FileTypeIcon({ type }: any) {
  const t = type?.toLowerCase();
  if (t === 'pdf') return <DocumentTextIcon className="w-7 h-7 text-rose-400" />;
  if (['mp4', 'mov', 'video'].includes(t)) return <VideoCameraIcon className="w-7 h-7 text-blue-400" />;
  if (['jpg', 'png', 'image'].includes(t)) return <PhotoIcon className="w-7 h-7 text-emerald-400" />;
  return <DocumentIcon className="w-7 h-7 text-cyan-400" />;
}

function PlanSection({ title, content, icon: Icon, color }: any) {
  if (!content) return null;
  return (
    <div className="space-y-6 group">
      <div className="flex items-center gap-4">
        <div className={`p-3 rounded-2xl bg-white/5 group-hover:scale-110 transition-transform ${color}`}>
          <Icon className="w-6 h-6 stroke-[2.5px]" />
        </div>
        <h3 className="text-xl font-black tracking-tight uppercase leading-none">{title}</h3>
      </div>
      <div className="pl-16 prose prose-invert prose-md max-w-none text-white/50 leading-[1.8] whitespace-pre-wrap font-medium">
        {content}
      </div>
    </div>
  );
}

function CanvaRenderer({ layout, fallback, description }: any) {
  const blocks = Array.isArray(layout) ? layout : [];

  if (blocks.length === 0) {
    return (
      <div className="space-y-12 animate-in fade-in duration-700">
        {description && (
          <div className="p-8 bg-cyan-500/5 border border-cyan-500/10 rounded-3xl relative overflow-hidden group">
            <div className="absolute -right-4 -top-4 opacity-10 group-hover:rotate-12 transition-transform duration-500">
              <InformationCircleIcon className="w-24 h-24 text-cyan-400" />
            </div>
            <h4 className="text-[10px] font-black uppercase text-cyan-400 tracking-[0.3em] mb-4">Lesson Overview</h4>
            <p className="text-lg text-white/70 leading-relaxed italic">{description}</p>
          </div>
        )}
        <div className="prose prose-invert prose-xl max-w-none text-white/70 leading-[1.8] whitespace-pre-wrap">
          {fallback || 'No lesson material provided yet.'}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-16">
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
          default:
            return null;
        }
      })}
    </div>
  );
}

