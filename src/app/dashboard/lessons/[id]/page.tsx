'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import {
  ArrowLeftIcon, PlayIcon, DocumentTextIcon, AcademicCapIcon,
  PencilIcon, ClockIcon, BookOpenIcon, CheckCircleIcon, LinkIcon,
} from '@heroicons/react/24/outline';

const TYPE_COLOR: Record<string, string> = {
  video: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
  text: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  quiz: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  assignment: 'bg-violet-500/20 text-violet-400 border-violet-500/30',
  live: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
};

export default function LessonDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  const router = useRouter();
  const { profile, loading: authLoading } = useAuth();

  const [lesson, setLesson] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isStaff = profile?.role === 'admin' || profile?.role === 'teacher';

  useEffect(() => {
    if (authLoading || !profile || !id) return;
    let cancelled = false;
    createClient()
      .from('lessons')
      .select('*, courses(id, title, programs(name)), portal_users(full_name)')
      .eq('id', id)
      .maybeSingle()
      .then(({ data, error: err }) => {
        if (cancelled) return;
        if (err || !data) { setError('Lesson not found'); }
        else { setLesson(data); }
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [profile?.id, id, authLoading]); // eslint-disable-line

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
    <div className="min-h-screen bg-[#0f0f1a] text-white">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">

        {/* Header */}
        <div className="flex items-center gap-4">
          <button onClick={() => router.back()}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-colors">
            <ArrowLeftIcon className="w-5 h-5 text-white/60" />
          </button>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <BookOpenIcon className="w-4 h-4 text-cyan-400" />
              <span className="text-xs font-bold text-cyan-400 uppercase tracking-widest">Lesson</span>
              {lesson.courses && (
                <>
                  <span className="text-white/20">/</span>
                  <Link href={`/dashboard/courses/${lesson.courses.id}`}
                    className="text-xs text-white/40 hover:text-white transition-colors truncate max-w-32">
                    {lesson.courses.title}
                  </Link>
                </>
              )}
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold">{lesson.title}</h1>
          </div>
          {isStaff && (
            <Link href={`/dashboard/lessons/${id}/edit`}
              className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/15 border border-white/10 rounded-xl text-sm font-bold transition-colors">
              <PencilIcon className="w-4 h-4" /> Edit
            </Link>
          )}
        </div>

        {/* Meta badges */}
        <div className="flex flex-wrap items-center gap-3">
          {lesson.lesson_type && (
            <span className={`px-3 py-1 rounded-full text-xs font-bold border capitalize ${TYPE_COLOR[lesson.lesson_type] ?? 'bg-white/10 text-white/40 border-white/10'}`}>
              {lesson.lesson_type}
            </span>
          )}
          {lesson.duration_minutes && (
            <span className="flex items-center gap-1 text-xs text-white/40">
              <ClockIcon className="w-3.5 h-3.5" /> {lesson.duration_minutes} min
            </span>
          )}
          {lesson.status && (
            <span className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold border capitalize ${lesson.status === 'published' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-white/10 text-white/30 border-white/10'}`}>
              {lesson.status === 'published' && <CheckCircleIcon className="w-3 h-3" />}
              {lesson.status}
            </span>
          )}
        </div>

        {/* Main content area */}
        <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
          {/* Video embed */}
          {lesson.lesson_type === 'video' && lesson.video_url && (
            <div className="aspect-video bg-black">
              {lesson.video_url.includes('youtube') || lesson.video_url.includes('youtu.be') ? (
                <iframe
                  src={lesson.video_url.replace('watch?v=', 'embed/').replace('youtu.be/', 'www.youtube.com/embed/')}
                  className="w-full h-full"
                  allowFullScreen
                  title={lesson.title}
                />
              ) : lesson.video_url.match(/\.(mp4|webm|ogg)$/i) ? (
                <video
                  src={lesson.video_url}
                  controls
                  playsInline
                  preload="metadata"
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="flex flex-col items-center justify-center h-full gap-4">
                  <PlayIcon className="w-16 h-16 text-white/20" />
                  <a href={lesson.video_url} target="_blank" rel="noreferrer"
                    className="flex items-center gap-2 px-5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-bold text-sm rounded-xl transition-colors">
                    <LinkIcon className="w-4 h-4" /> Open Video
                  </a>
                </div>
              )}
            </div>
          )}

          {/* Live session link */}
          {lesson.lesson_type === 'live' && lesson.meeting_url && (
            <div className="p-6 flex flex-col items-center gap-4 border-b border-white/10 bg-emerald-500/5">
              <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 flex items-center justify-center">
                <PlayIcon className="w-8 h-8 text-emerald-400" />
              </div>
              <p className="text-white font-semibold">Live Session</p>
              <a href={lesson.meeting_url} target="_blank" rel="noreferrer"
                className="flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm rounded-xl transition-colors">
                <LinkIcon className="w-4 h-4" /> Join Session
              </a>
            </div>
          )}

          {/* Description / content */}
          <div className="p-6">
            {lesson.description ? (
              <>
                <h2 className="font-bold text-white mb-3">Description</h2>
                <div className="prose prose-invert prose-sm max-w-none text-white/60 leading-relaxed whitespace-pre-wrap">
                  {lesson.description}
                </div>
              </>
            ) : (
              <div className="text-center py-8">
                <DocumentTextIcon className="w-12 h-12 mx-auto text-white/10 mb-3" />
                <p className="text-white/30 text-sm">No description available for this lesson.</p>
              </div>
            )}

            {/* Resources / attachments */}
            {lesson.resources && lesson.resources.length > 0 && (
              <div className="mt-6 border-t border-white/10 pt-6">
                <h3 className="font-bold text-white mb-3 text-sm">Resources</h3>
                <div className="space-y-2">
                  {lesson.resources.map((r: any, i: number) => (
                    <a key={i} href={r.url} target="_blank" rel="noreferrer"
                      className="flex items-center gap-3 px-4 py-3 bg-white/5 hover:bg-white/10 rounded-xl transition-colors group">
                      <DocumentTextIcon className="w-4 h-4 text-white/30" />
                      <span className="text-sm font-semibold text-white/60 group-hover:text-white transition-colors">{r.name ?? r.url}</span>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between">
          <Link href="/dashboard/lessons"
            className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm font-bold text-white/60 transition-colors">
            <ArrowLeftIcon className="w-4 h-4" /> All Lessons
          </Link>
          {lesson.courses && (
            <Link href={`/dashboard/courses/${lesson.courses.id}`}
              className="flex items-center gap-2 px-4 py-2 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/20 rounded-xl text-sm font-bold text-cyan-400 transition-colors">
              <BookOpenIcon className="w-4 h-4" /> View Course
            </Link>
          )}
        </div>

      </div>
    </div>
  );
}
