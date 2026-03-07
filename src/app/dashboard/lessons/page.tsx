'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import {
  BookOpenIcon, PlusIcon, MagnifyingGlassIcon, EyeIcon, PencilIcon,
  TrashIcon, ClockIcon, UserGroupIcon, CheckCircleIcon,
  VideoCameraIcon, PlayIcon, DocumentTextIcon, BoltIcon,
  SparklesIcon, ChevronDownIcon, ChevronUpIcon,
} from '@heroicons/react/24/outline';

const STATUS_BADGE: Record<string, string> = {
  completed: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  active: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  scheduled: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  draft: 'bg-white/10 text-white/40',
};
const TYPE_COLORS: Record<string, string> = {
  video: 'text-rose-400',
  'hands-on': 'text-cyan-400',
  hands_on: 'text-cyan-400',
  interactive: 'text-amber-400',
  workshop: 'text-violet-400',
  coding: 'text-emerald-400',
};

export default function LessonsPage() {
  const { profile, loading: authLoading } = useAuth();
  const [lessons, setLessons] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [deleting, setDeleting] = useState<string | null>(null);

  // AI lesson plan generator
  const [planOpen, setPlanOpen] = useState(false);
  const [planTopic, setPlanTopic] = useState('');
  const [planGrade, setPlanGrade] = useState('JSS1–SS3');
  const [planWeeks, setPlanWeeks] = useState('12');
  const [planGenerating, setPlanGenerating] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [planResult, setPlanResult] = useState<any | null>(null);

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`Delete lesson "${title}"? This cannot be undone.`)) return;
    setDeleting(id);
    const { error } = await createClient().from('lessons').delete().eq('id', id);
    if (error) { alert(error.message); }
    else { setLessons(prev => prev.filter(l => l.id !== id)); }
    setDeleting(null);
  };

  const handleGeneratePlan = async () => {
    if (!planTopic.trim()) { setPlanError('Enter a subject/course name.'); return; }
    setPlanGenerating(true);
    setPlanError(null);
    setPlanResult(null);
    try {
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'lesson-plan',
          topic: planTopic,
          gradeLevel: planGrade,
          termWeeks: parseInt(planWeeks) || 12,
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? 'Generation failed');
      setPlanResult(payload.data);
    } catch (e: any) {
      setPlanError(e.message ?? 'Failed to generate lesson plan');
    } finally {
      setPlanGenerating(false);
    }
  };

  useEffect(() => {
    if (authLoading || !profile) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const supabase = createClient();
        let q = supabase
          .from('lessons')
          .select(`id, title, description, lesson_type, status, duration_minutes,
            session_date, video_url, created_by, created_at,
            courses ( id, title, programs ( name ) )`)
          .order('created_at', { ascending: false });

        if (profile!.role === 'teacher') {
          q = (q as any).eq('created_by', profile!.id);
        } else if (profile!.role === 'student') {
          const { data: enr } = await supabase
            .from('enrollments').select('program_id').eq('user_id', profile!.id);
          const programIds = (enr ?? []).map((e: any) => e.program_id);
          if (programIds.length) {
            const { data: courseData } = await supabase
              .from('courses').select('id').in('program_id', programIds);
            const ids = (courseData ?? []).map((c: any) => c.id);
            if (ids.length) q = (q as any).in('course_id', ids);
          }
        }

        const { data, error: err } = await q;
        if (err) throw err;
        if (!cancelled) setLessons(data ?? []);
      } catch (e: any) {
        if (!cancelled) setError(e.message ?? 'Failed to load lessons');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [profile?.id, authLoading]); // eslint-disable-line

  const filtered = lessons.filter(l => {
    const ms = (l.title ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (l.courses?.title ?? '').toLowerCase().includes(search.toLowerCase());
    const mst = filterStatus === 'all' || l.status === filterStatus;
    return ms && mst;
  });

  const completed = lessons.filter(l => l.status === 'completed').length;
  const active = lessons.filter(l => l.status === 'active').length;

  if (authLoading || loading) return (
    <div className="min-h-screen bg-[#0f0f1a] flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-white/40 text-sm">Loading lessons…</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0f0f1a] text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <BookOpenIcon className="w-5 h-5 text-cyan-400" />
              <span className="text-xs font-bold text-cyan-400 uppercase tracking-widest">Learning Content</span>
            </div>
            <h1 className="text-3xl font-extrabold">Lessons</h1>
            <p className="text-white/40 text-sm mt-1">Manage and track lesson progress</p>
          </div>
          {(profile?.role === 'admin' || profile?.role === 'teacher') && (
            <Link href="/dashboard/lessons/add"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-sm rounded-xl transition-all hover:scale-105 shadow-lg shadow-cyan-900/30">
              <PlusIcon className="w-4 h-4" /> Create Lesson
            </Link>
          )}
        </div>

        {error && (
          <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-4 text-rose-400 text-sm">{error}</div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Total Lessons', value: lessons.length, icon: BookOpenIcon, color: 'text-cyan-400', bg: 'bg-cyan-500/10' },
            { label: 'Completed', value: completed, icon: CheckCircleIcon, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
            { label: 'Active', value: active, icon: BoltIcon, color: 'text-blue-400', bg: 'bg-blue-500/10' },
            { label: 'Completion Rate', value: lessons.length ? `${Math.round((completed / lessons.length) * 100)}%` : '0%', icon: ClockIcon, color: 'text-amber-400', bg: 'bg-amber-500/10' },
          ].map((s) => (
            <div key={s.label} className="bg-white/5 border border-white/10 rounded-2xl p-5">
              <div className={`w-10 h-10 ${s.bg} rounded-xl flex items-center justify-center mb-3`}>
                <s.icon className={`w-5 h-5 ${s.color}`} />
              </div>
              <p className={`text-2xl font-extrabold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-white/40 mt-1">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
            <input type="text" placeholder="Search lessons or courses…" value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/30 focus:outline-none focus:border-cyan-500 transition-colors" />
          </div>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
            className="px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-cyan-500 cursor-pointer">
            <option value="all">All Status</option>
            <option value="completed">Completed</option>
            <option value="active">Active</option>
            <option value="scheduled">Scheduled</option>
            <option value="draft">Draft</option>
          </select>
        </div>

        {/* Empty */}
        {filtered.length === 0 ? (
          <div className="text-center py-24 bg-white/5 border border-white/10 rounded-2xl">
            <BookOpenIcon className="w-16 h-16 mx-auto text-white/10 mb-4" />
            <p className="text-lg font-semibold text-white/30">No lessons found</p>
            <p className="text-sm text-white/20 mt-1">Create your first lesson or adjust filters</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filtered.map((lesson: any) => {
              const attendanceCount = lesson.attendance?.length ?? 0;
              const completedAttendance = lesson.attendance?.filter((a: any) => a.status === 'present').length ?? 0;
              return (
                <div key={lesson.id} className="bg-white/5 border border-white/10 rounded-2xl p-6 hover:bg-white/8 hover:border-white/20 transition-all">
                  <div className="flex flex-col lg:flex-row items-start lg:items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start gap-3 mb-3">
                        <div className={`mt-0.5 flex-shrink-0 ${TYPE_COLORS[lesson.lesson_type] ?? 'text-white/40'}`}>
                          {lesson.lesson_type === 'video' ? <VideoCameraIcon className="w-5 h-5" /> :
                            lesson.lesson_type === 'interactive' ? <PlayIcon className="w-5 h-5" /> :
                              <BookOpenIcon className="w-5 h-5" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <h3 className="font-bold text-white">{lesson.title}</h3>
                            <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${STATUS_BADGE[lesson.status] ?? 'bg-white/10 text-white/40'}`}>
                              {lesson.status}
                            </span>
                            <span className="px-2 py-0.5 text-xs text-white/40 uppercase tracking-widest font-black">
                              {lesson.lesson_type?.replace(/[-_]/g, ' ')}
                            </span>
                          </div>
                          <p className="text-sm text-white/40">{lesson.courses?.title} — {lesson.courses?.programs?.name}</p>
                        </div>
                      </div>

                      {lesson.description && (
                        <p className="text-white/40 text-sm line-clamp-2 mb-3">{lesson.description}</p>
                      )}

                      <div className="flex flex-wrap gap-4 text-xs text-white/30">
                        {lesson.duration_minutes && (
                          <span className="flex items-center gap-1"><ClockIcon className="w-3.5 h-3.5" /> {lesson.duration_minutes} min</span>
                        )}
                        {lesson.session_date && (
                          <span>{new Date(lesson.session_date).toLocaleDateString()}</span>
                        )}
                        {attendanceCount > 0 && (
                          <span className="flex items-center gap-1"><UserGroupIcon className="w-3.5 h-3.5" /> {completedAttendance}/{attendanceCount} present</span>
                        )}
                        {attendanceCount > 0 && (
                          <div className="flex items-center gap-2">
                            <div className="w-20 h-1.5 bg-white/10 rounded-full">
                              <div className="h-1.5 rounded-full bg-emerald-500"
                                style={{ width: `${Math.round((completedAttendance / attendanceCount) * 100)}%` }} />
                            </div>
                            <span className="text-emerald-400">{Math.round((completedAttendance / attendanceCount) * 100)}%</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Link href={`/dashboard/lessons/${lesson.id}`}
                        className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 rounded-xl transition-colors">
                        <EyeIcon className="w-4 h-4" /> View
                      </Link>
                      {(profile?.role === 'admin' || profile?.role === 'teacher') && (
                        <>
                          <Link href={`/dashboard/lessons/${lesson.id}/edit`}
                            className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-white/50 bg-white/5 hover:bg-white/10 rounded-xl transition-colors">
                            <PencilIcon className="w-4 h-4" /> Edit
                          </Link>
                          <button
                            onClick={() => handleDelete(lesson.id, lesson.title)}
                            disabled={deleting === lesson.id}
                            className="p-2 text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 rounded-xl transition-colors disabled:opacity-40">
                            <TrashIcon className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Quick Actions */}
        {(profile?.role === 'admin' || profile?.role === 'teacher') && (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
              <BoltIcon className="w-5 h-5 text-amber-400" /> Content Tools
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Add New Lesson', icon: VideoCameraIcon, color: 'bg-blue-600 hover:bg-blue-700', href: '/dashboard/lessons/add' },
                { label: 'Create Quiz', icon: DocumentTextIcon, color: 'bg-violet-600 hover:bg-violet-700', href: '/dashboard/assignments/new' },
                { label: 'CBT Exams', icon: PlayIcon, color: 'bg-emerald-600 hover:bg-emerald-700', href: '/dashboard/cbt' },
                { label: 'Class Sessions', icon: UserGroupIcon, color: 'bg-amber-600 hover:bg-amber-700', href: '/dashboard/classes' },
              ].map((a) => (
                <Link key={a.label} href={a.href}
                  className={`flex items-center gap-2 px-4 py-3 ${a.color} text-white font-semibold text-sm rounded-xl transition-all hover:scale-[1.02]`}>
                  <a.icon className="w-4 h-4 flex-shrink-0" />{a.label}
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* AI Lesson Plan Generator */}
        {(profile?.role === 'admin' || profile?.role === 'teacher') && (
          <div className="bg-gradient-to-br from-violet-500/10 to-cyan-500/5 border border-violet-500/20 rounded-2xl overflow-hidden">
            <button
              type="button"
              onClick={() => { setPlanOpen(o => !o); setPlanResult(null); setPlanError(null); }}
              className="w-full flex items-center justify-between px-6 py-5 text-left"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-violet-500/20 flex items-center justify-center">
                  <SparklesIcon className="w-5 h-5 text-violet-400" />
                </div>
                <div>
                  <p className="font-bold text-white">AI Lesson Plan Generator</p>
                  <p className="text-xs text-white/40 mt-0.5">Generate a full term-long curriculum plan instantly</p>
                </div>
              </div>
              {planOpen ? <ChevronUpIcon className="w-5 h-5 text-white/40" /> : <ChevronDownIcon className="w-5 h-5 text-white/40" />}
            </button>

            {planOpen && (
              <div className="px-6 pb-6 space-y-6 border-t border-violet-500/20">
                {planError && (
                  <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3 mt-4">{planError}</p>
                )}

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-4">
                  <div className="space-y-1 md:col-span-2">
                    <p className="text-[10px] font-black uppercase tracking-widest text-white/40">Subject / Course Name *</p>
                    <input
                      value={planTopic}
                      onChange={e => setPlanTopic(e.target.value)}
                      placeholder="e.g. Python Programming for Beginners"
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/30 outline-none focus:border-violet-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-black uppercase tracking-widest text-white/40">Grade Level</p>
                    <select
                      value={planGrade}
                      onChange={e => setPlanGrade(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-violet-500"
                    >
                      {['Basic 1–Basic 3','Basic 4–Basic 6','JSS1–JSS3','SS1–SS3','JSS1–SS3','Basic 1–SS3'].map(g => (
                        <option key={g} value={g}>{g}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-black uppercase tracking-widest text-white/40">Term Length (weeks)</p>
                    <select
                      value={planWeeks}
                      onChange={e => setPlanWeeks(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-violet-500"
                    >
                      {['8','10','12','14','16'].map(w => (
                        <option key={w} value={w}>{w} weeks</option>
                      ))}
                    </select>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleGeneratePlan}
                  disabled={planGenerating}
                  className="flex items-center gap-2 px-6 py-3 bg-violet-600 hover:bg-violet-500 disabled:opacity-60 text-white font-black text-sm uppercase tracking-widest rounded-xl transition-all"
                >
                  {planGenerating ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <SparklesIcon className="w-4 h-4" />
                  )}
                  {planGenerating ? 'Generating plan...' : 'Generate Lesson Plan'}
                </button>

                {/* Plan Result */}
                {planResult && (
                  <div className="space-y-4">
                    <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
                      <h4 className="font-extrabold text-lg text-white mb-1">{planResult.course_title}</h4>
                      <p className="text-sm text-white/50 mb-3">{planResult.description}</p>
                      <div className="flex flex-wrap gap-3 text-xs text-white/40 mb-4">
                        <span className="px-2.5 py-1 bg-violet-500/10 border border-violet-500/20 text-violet-300 rounded-lg font-semibold">{planResult.grade_level}</span>
                        <span className="px-2.5 py-1 bg-white/5 border border-white/10 rounded-lg">{planResult.duration}</span>
                      </div>
                      {planResult.objectives?.length > 0 && (
                        <div className="mb-4">
                          <p className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-2">Term Objectives</p>
                          <ul className="space-y-1">
                            {planResult.objectives.map((o: string, i: number) => (
                              <li key={i} className="text-sm text-white/60 flex items-start gap-2">
                                <span className="text-violet-400 mt-0.5 flex-shrink-0">✓</span>{o}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>

                    {/* Week-by-week table */}
                    <div className="space-y-3">
                      <p className="text-[10px] font-black uppercase tracking-widest text-white/30">Week-by-Week Plan</p>
                      {(planResult.weeks ?? []).map((week: any) => (
                        <div key={week.week} className="bg-white/[0.03] border border-white/10 rounded-xl p-4 grid grid-cols-1 md:grid-cols-4 gap-3">
                          <div className="flex items-center gap-2">
                            <span className="w-8 h-8 rounded-xl bg-violet-500/20 text-violet-400 font-black text-sm flex items-center justify-center flex-shrink-0">{week.week}</span>
                            <p className="font-bold text-white text-sm">{week.theme}</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-1">Topics</p>
                            <ul className="space-y-0.5">
                              {(week.topics ?? []).map((t: string, i: number) => (
                                <li key={i} className="text-xs text-white/50">• {t}</li>
                              ))}
                            </ul>
                          </div>
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-1">Activities</p>
                            <ul className="space-y-0.5">
                              {(week.activities ?? []).map((a: string, i: number) => (
                                <li key={i} className="text-xs text-white/50">• {a}</li>
                              ))}
                            </ul>
                          </div>
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-1">Assessment</p>
                            <p className="text-xs text-white/50">{week.assessment}</p>
                          </div>
                        </div>
                      ))}
                    </div>

                    {(planResult.materials?.length > 0 || planResult.assessment_strategy) && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {planResult.assessment_strategy && (
                          <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                            <p className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-2">Assessment Strategy</p>
                            <p className="text-sm text-white/60">{planResult.assessment_strategy}</p>
                          </div>
                        )}
                        {planResult.materials?.length > 0 && (
                          <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                            <p className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-2">Materials & Tools</p>
                            <ul className="space-y-1">
                              {planResult.materials.map((m: string, i: number) => (
                                <li key={i} className="text-xs text-white/50">• {m}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => { setPlanResult(null); setPlanTopic(''); }}
                      className="text-xs font-bold text-white/40 hover:text-white transition-colors"
                    >
                      Clear plan
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}