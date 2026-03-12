'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import {
  BookOpenIcon, PlusIcon, MagnifyingGlassIcon, EyeIcon, PencilIcon,
  TrashIcon, ClockIcon, UserGroupIcon, CheckCircleIcon,
  VideoCameraIcon, PlayIcon, DocumentTextIcon, BoltIcon,
  SparklesIcon, ChevronDownIcon, ChevronUpIcon, BuildingOfficeIcon, CalendarIcon, ChevronRightIcon,
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
  // Save plan state
  const [savingPlan, setSavingPlan] = useState(false);
  const [planSaved, setPlanSaved] = useState(false);
  const [planSaveError, setPlanSaveError] = useState<string | null>(null);
  const [planCourseId, setPlanCourseId] = useState('');
  const [courses, setCourses] = useState<any[]>([]);

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`Delete lesson "${title}"? This cannot be undone.`)) return;
    setDeleting(id);
    const { error } = await createClient().from('lessons').delete().eq('id', id);
    if (error) { alert(error.message); }
    else { setLessons(prev => prev.filter(l => l.id !== id)); }
    setDeleting(null);
  };

  // Load courses when AI panel opens (needed for save)
  useEffect(() => {
    if (!planOpen || !profile || courses.length > 0) return;
    
    const fetchData = async () => {
      let query = createClient()
        .from('courses')
        .select('id, title, school_id')
        .eq('is_active', true);

      if (profile?.school_id) {
        query = query.or(`school_id.eq.${profile.school_id},school_id.is.null`);
      }
      
      const { data } = await query.order('title');
      setCourses(data ?? []);
    };

    fetchData();
  }, [planOpen, profile?.id, profile?.school_id]); // eslint-disable-line

  const handleSavePlan = async () => {
    if (!planResult || !profile) return;
    if (!planCourseId) { setPlanSaveError('Select a course to attach this plan to.'); return; }
    setSavingPlan(true);
    setPlanSaveError(null);
    try {
      const db = createClient();
      // Create a new lesson record for this plan
      const { data: newLesson, error: lessonErr } = await db.from('lessons').insert({
        title: planResult.course_title || planTopic,
        description: planResult.description,
        lesson_type: 'interactive',
        status: 'draft',
        course_id: planCourseId,
        created_by: profile.id,
      }).select('id').single();
      if (lessonErr) throw lessonErr;

      // Save the lesson plan record attached to the lesson
      const objectives = (planResult.objectives ?? []).join('\n');
      const activities = (planResult.weeks ?? []).map((w: any) =>
        `Week ${w.week} — ${w.theme}:\n${(w.activities ?? []).map((a: string) => `• ${a}`).join('\n')}`
      ).join('\n\n');

      const { error: planErr } = await db.from('lesson_plans').insert({
        lesson_id: newLesson.id,
        objectives,
        activities,
        assessment_methods: planResult.assessment_strategy ?? '',
        staff_notes: `Grade: ${planResult.grade_level} | Duration: ${planResult.duration}\nMaterials: ${(planResult.materials ?? []).join(', ')}`,
      });
      if (planErr) throw planErr;

      setPlanSaved(true);
      // Refresh lessons list
      setLessons(prev => [{
        id: newLesson.id, title: planResult.course_title || planTopic,
        description: planResult.description, lesson_type: 'interactive',
        status: 'draft', created_at: new Date().toISOString(),
        courses: courses.find(c => c.id === planCourseId),
      }, ...prev]);
    } catch (e: any) {
      setPlanSaveError(e.message ?? 'Failed to save plan');
    } finally {
      setSavingPlan(false);
    }
  };

  const handleGeneratePlan = async () => {
    if (!planTopic.trim()) { setPlanError('Enter a subject/course name.'); return; }
    setPlanGenerating(true);
    setPlanError(null);
    setPlanResult(null);
    setPlanSaved(false);
    setPlanSaveError(null);
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
          // 1. Get enrollments to find valid courses
          const { data: enr } = await supabase
            .from('enrollments').select('program_id').eq('user_id', profile!.id);
          const programIds = (enr ?? []).map((e: any) => e.program_id);

          if (programIds.length) {
            const { data: courseData } = await supabase
              .from('courses').select('id').in('program_id', programIds);
            const ids = (courseData ?? []).map((c: any) => c.id);
            if (ids.length) q = (q as any).in('course_id', ids);
          }

          // 2. Filter by creators: only admins OR teachers from my school
          const { data: teachersAtSchool } = await supabase
            .from('portal_users')
            .select('id')
            .eq('school_id', profile!.school_id as string)
            .eq('role', 'teacher');

          const { data: admins } = await supabase
            .from('portal_users')
            .select('id')
            .eq('role', 'admin');

          const validCreatorIds = [
            ...(teachersAtSchool ?? []).map(t => t.id),
            ...(admins ?? []).map(a => a.id)
          ];

          if (validCreatorIds.length > 0) {
            q = (q as any).in('created_by', validCreatorIds);
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
        <div className="bg-gradient-to-r from-[#0B132B] to-[#1a2b54] rounded-2xl sm:rounded-[2.5rem] p-6 sm:p-10 relative overflow-hidden shadow-2xl">
          {/* Decorative blobs */}
          <div className="absolute top-0 right-0 -translate-y-12 translate-x-12 w-64 h-64 bg-white opacity-[0.03] rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 translate-y-12 -translate-x-12 w-48 h-48 bg-cyan-600 opacity-20 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <span className="px-3 py-1 bg-cyan-600/80 text-white text-[10px] font-black uppercase tracking-widest rounded-full">
                  Learning Content
                </span>
                <div className="h-px w-8 bg-white/20" />
                <span className="text-[10px] font-bold text-cyan-300/60 uppercase tracking-widest">Modules & Materials</span>
              </div>
              <h1 className="text-3xl sm:text-5xl font-black text-white tracking-tight leading-tight">
                Course Lessons
              </h1>
              <p className="text-blue-200/60 text-sm sm:text-base mt-3 font-medium flex items-center gap-2">
                <BookOpenIcon className="w-4 h-4" />
                Manage, track, and generate educational content
              </p>
            </div>
            {(profile?.role === 'admin' || profile?.role === 'teacher') && (
              <Link href="/dashboard/lessons/add"
                className="group inline-flex items-center justify-center gap-3 px-8 py-4 bg-cyan-600 hover:bg-cyan-500 text-white font-black text-sm uppercase tracking-widest rounded-2xl transition-all hover:scale-105 shadow-2xl shadow-cyan-900/60 active:scale-95">
                <PlusIcon className="w-5 h-5 flex-shrink-0 group-hover:rotate-90 transition-transform" /> 
                Create Lesson
              </Link>
            )}
          </div>
        </div>

        {error && (
          <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-4 text-rose-400 text-sm">{error}</div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6 px-1 sm:px-0">
          {[
            { label: 'Total Content', value: lessons.length, icon: BookOpenIcon, gradient: 'from-cyan-600 to-cyan-400' },
            { label: 'Completed', value: completed, icon: CheckCircleIcon, gradient: 'from-emerald-600 to-emerald-400' },
            { label: 'Active Now', value: active, icon: BoltIcon, gradient: 'from-blue-600 to-blue-400' },
            { label: 'Completion', value: lessons.length ? `${Math.round((completed / lessons.length) * 100)}%` : '0%', icon: ClockIcon, gradient: 'from-amber-600 to-amber-400' },
          ].map((s) => (
            <div key={s.label} className="bg-white/5 border border-white/10 rounded-2xl sm:rounded-3xl p-5 sm:p-7 hover:bg-white/8 transition-all group relative overflow-hidden">
               <div className={`absolute top-0 right-0 w-24 h-24 bg-gradient-to-br ${s.gradient} opacity-[0.03] blur-2xl -mr-12 -mt-12 group-hover:scale-150 transition-transform`} />
              <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-gradient-to-br ${s.gradient} flex items-center justify-center mb-4 sm:mb-6 shadow-xl group-hover:scale-110 transition-transform`}>
                <s.icon className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
              </div>
              <p className="text-2xl sm:text-4xl font-black text-white tracking-tight tabular-nums relative z-10">{s.value}</p>
              <p className="text-[10px] sm:text-xs text-white/30 font-black uppercase tracking-widest mt-1.5 relative z-10">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <MagnifyingGlassIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
            <input type="text" placeholder="Search lessons…" value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/30 focus:outline-none focus:border-cyan-500 transition-colors" />
          </div>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
            className="px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-cyan-500 cursor-pointer appearance-none">
            <option value="all">All Content</option>
            <option value="completed">Completed</option>
            <option value="active">Active</option>
            <option value="scheduled">Scheduled</option>
            <option value="draft">Draft</option>
          </select>
        </div>

        {/* Lesson List */}
        {filtered.length === 0 ? (
          <div className="text-center py-24 sm:py-32 bg-[#0a0a1a] border border-dashed border-white/10 rounded-[2.5rem] shadow-2xl">
            <div className="w-20 h-20 sm:w-24 sm:h-24 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-8 border border-white/5">
              <BookOpenIcon className="w-10 h-10 sm:w-12 sm:h-12 text-white/10" />
            </div>
            <p className="text-2xl font-black text-white/40 tracking-tight">No modules found</p>
            <p className="text-sm text-white/20 mt-3 font-medium uppercase tracking-widest">Refine your search or filters</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5">
            {filtered.map((lesson: any) => {
              const attendanceCount = lesson.attendance?.length ?? 0;
              const completedAttendance = lesson.attendance?.filter((a: any) => a.status === 'present').length ?? 0;
              const typeColor = TYPE_COLORS[lesson.lesson_type] || 'text-white/40';
              const typeBg = typeColor.replace('text-', 'bg-').replace('400', '500/10');
              
              return (
                <div key={lesson.id} className="group bg-[#0a0a1a] border border-white/10 rounded-2xl sm:rounded-[2rem] p-6 sm:p-8 hover:bg-white/[0.03] hover:border-cyan-500/30 transition-all relative overflow-hidden shadow-2xl">
                  {/* Subtle Background Accent */}
                  <div className={`absolute top-0 left-0 w-1.5 h-full ${typeColor.replace('text-', 'bg-') || 'bg-white/10'} opacity-50`} />
                  
                  <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-6 sm:gap-10">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-col sm:flex-row sm:items-start gap-4 sm:gap-6 mb-6">
                        <div className={`w-14 h-14 sm:w-16 sm:h-16 rounded-2xl sm:rounded-3xl ${typeBg} flex items-center justify-center flex-shrink-0 shadow-xl group-hover:scale-110 transition-transform`}>
                          {lesson.lesson_type === 'video' ? <VideoCameraIcon className="w-7 h-7 sm:w-8 sm:h-8" /> :
                            lesson.lesson_type === 'interactive' ? <PlayIcon className="w-7 h-7 sm:w-8 sm:h-8" /> :
                              <BookOpenIcon className="w-7 h-7 sm:w-8 sm:h-8" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-3 mb-2.5">
                            <h3 className="text-xl sm:text-2xl font-black text-white group-hover:text-cyan-300 transition-colors truncate tracking-tight">{lesson.title}</h3>
                            <div className={`px-3 py-1 rounded-full text-[10px] sm:text-[11px] font-black uppercase tracking-[0.1em] border shadow-xl ${STATUS_BADGE[lesson.status] ?? 'bg-white/10 text-white/40 border-white/10'}`}>
                              {lesson.status}
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[10px] sm:text-xs font-black text-white/30 uppercase tracking-[0.15em]">
                            <span className="flex items-center gap-2 truncate max-w-[200px] sm:max-w-none">
                               <BuildingOfficeIcon className="w-3.5 h-3.5 text-white/10" />
                               {lesson.courses?.title}
                            </span>
                            <span className="w-1 h-1 bg-white/10 rounded-full hidden sm:block" />
                            <span className={`px-2 py-0.5 rounded-md ${typeBg} ${typeColor}`}>
                               {lesson.lesson_type?.replace(/[-_]/g, ' ')}
                            </span>
                          </div>
                        </div>
                      </div>

                      {lesson.description && (
                        <p className="text-sm sm:text-base text-white/40 font-medium line-clamp-2 mb-8 sm:pl-20 border-l-2 border-white/5 sm:border-0">
                          {lesson.description}
                        </p>
                      )}

                      <div className="flex flex-wrap items-center gap-4 sm:gap-8 text-[10px] sm:text-xs text-white/30 font-black uppercase tracking-[0.2em] sm:pl-20">
                        {lesson.duration_minutes && (
                          <span className="flex items-center gap-2 bg-white/5 px-3 py-1.5 rounded-full border border-white/5">
                            <ClockIcon className="w-4 h-4 text-cyan-500/50" /> {lesson.duration_minutes}m
                          </span>
                        )}
                        {lesson.session_date && (
                          <span className="flex items-center gap-2 bg-white/5 px-3 py-1.5 rounded-full border border-white/5">
                            <CalendarIcon className="w-4 h-4 text-violet-500/50" /> {new Date(lesson.session_date).toLocaleDateString('en-GB')}
                          </span>
                        )}
                        {attendanceCount > 0 && (
                          <div className="flex items-center gap-4 bg-white/5 px-4 py-2 rounded-2xl border border-white/5">
                            <UserGroupIcon className="w-4 h-4 text-emerald-500/50" />
                            <div className="flex items-center gap-3">
                              <span className="text-emerald-400 font-black">{Math.round((completedAttendance / attendanceCount) * 100)}%</span>
                              <div className="w-16 sm:w-24 h-1.5 bg-white/10 rounded-full overflow-hidden">
                                <div className="h-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)] transition-all duration-1000"
                                  style={{ width: `${Math.round((completedAttendance / attendanceCount) * 100)}%` }} />
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-row lg:flex-col items-center gap-3 flex-shrink-0 pt-6 lg:pt-0 border-t lg:border-t-0 lg:border-l border-white/10 lg:pl-10">
                      <Link href={`/dashboard/lessons/${lesson.id}`}
                        className="flex-1 lg:flex-none w-full flex items-center justify-center gap-3 px-6 py-4 text-[10px] font-black uppercase tracking-widest text-white hover:text-cyan-400 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl transition-all group/btn shadow-xl active:scale-95">
                        <EyeIcon className="w-4 h-4 group-hover/btn:scale-110 transition-transform" /> 
                        <span className="hidden sm:inline">Modules</span>
                        <span className="sm:hidden text-[9px]">View</span>
                      </Link>
                      {(profile?.role === 'admin' || profile?.role === 'teacher') && (
                        <div className="flex flex-1 lg:flex-none gap-2 w-full lg:w-auto">
                          <Link href={`/dashboard/lessons/${lesson.id}/edit`}
                             className="flex-1 flex items-center justify-center gap-2 px-4 py-4 text-white/40 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl transition-all active:scale-95 shadow-xl">
                             <PencilIcon className="w-4 h-4" />
                          </Link>
                          <button
                            onClick={() => handleDelete(lesson.id, lesson.title)}
                            disabled={deleting === lesson.id}
                            className="flex-1 flex items-center justify-center p-4 text-rose-500/60 hover:text-rose-400 bg-rose-500/5 hover:bg-rose-500/10 border border-rose-500/10 rounded-2xl transition-all disabled:opacity-40 active:scale-95 shadow-xl">
                            <TrashIcon className="w-4 h-4" />
                          </button>
                        </div>
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
          <div className="bg-[#0a0a1a] border border-white/5 rounded-[2.5rem] p-8 sm:p-12 relative overflow-hidden shadow-2xl">
            <div className="absolute top-0 left-0 w-64 h-64 bg-cyan-600/5 blur-[100px] -ml-32 -mt-32 pointer-events-none" />
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-10">
                <div>
                  <h3 className="text-2xl font-black text-white tracking-tight flex items-center gap-3">
                    <BoltIcon className="w-8 h-8 text-amber-400" /> Architect Console
                  </h3>
                  <p className="text-[10px] font-black text-white/20 uppercase tracking-[0.3em] mt-1">Management Utilities</p>
                </div>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
                {[
                  { label: 'Content Engine', desc: 'Synthesize new modules', icon: VideoCameraIcon, color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20', href: '/dashboard/lessons/add' },
                  { label: 'Assessment Lab', desc: 'Deploy new challenges', icon: DocumentTextIcon, color: 'text-violet-400', bg: 'bg-violet-500/10', border: 'border-violet-500/20', href: '/dashboard/assignments/new' },
                  { label: 'CBT Hub', desc: 'Coordinate examinations', icon: PlayIcon, color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', href: '/dashboard/cbt' },
                  { label: 'Registry', desc: 'Calibrate learning groups', icon: UserGroupIcon, color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20', href: '/dashboard/classes' },
                ].map((a) => (
                  <Link key={a.label} href={a.href}
                    className="group flex flex-col items-start gap-6 p-8 bg-white/5 border border-white/5 rounded-3xl transition-all hover:bg-white/10 hover:border-white/20 hover:scale-[1.02] shadow-2xl relative overflow-hidden">
                    <div className={`absolute top-0 right-0 w-24 h-24 ${a.bg} opacity-[0.05] blur-3xl -mr-12 -mt-12 group-hover:scale-150 transition-transform`} />
                    <div className={`w-14 h-14 rounded-2xl ${a.bg} ${a.border} border flex items-center justify-center shadow-xl group-hover:scale-110 transition-transform`}>
                      <a.icon className={`w-7 h-7 ${a.color}`} />
                    </div>
                    <div>
                      <h4 className="text-sm font-black text-white uppercase tracking-widest mb-1">{a.label}</h4>
                      <p className="text-[10px] font-medium text-white/30 uppercase tracking-[0.1em]">{a.desc}</p>
                    </div>
                    <div className="mt-4 w-full flex justify-end">
                       <ChevronRightIcon className="w-5 h-5 text-white/10 group-hover:text-white transition-all group-hover:translate-x-1" />
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* AI Lesson Plan Generator */}
        {(profile?.role === 'admin' || profile?.role === 'teacher') && (
          <div className="bg-[#0a0a1a] border border-violet-500/30 rounded-[2.5rem] overflow-hidden shadow-2xl relative">
            <div className="absolute top-0 right-0 w-64 h-64 bg-violet-600/10 blur-[100px] -mr-32 -mt-32 pointer-events-none" />
            
            <button
              type="button"
              onClick={() => { setPlanOpen(o => !o); setPlanResult(null); setPlanError(null); }}
              className="w-full flex flex-col sm:flex-row items-start sm:items-center justify-between p-8 sm:p-10 text-left relative z-10 group"
            >
              <div className="flex items-center gap-6">
                <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center shadow-2xl group-hover:scale-110 transition-transform">
                  <SparklesIcon className="w-8 h-8 text-white animate-pulse" />
                </div>
                <div>
                  <h3 className="text-2xl font-black text-white tracking-tight">AI Orchestrator</h3>
                  <p className="text-sm text-white/40 mt-1 font-medium uppercase tracking-widest">Intelligent Curriculum Synthesis</p>
                </div>
              </div>
              <div className="mt-6 sm:mt-0 flex items-center gap-3 px-6 py-3 bg-white/5 border border-white/10 rounded-2xl group-hover:bg-violet-600 group-hover:border-violet-500 transition-all font-black text-[10px] uppercase tracking-widest text-white/60 group-hover:text-white">
                {planOpen ? 'Dismiss' : 'Synthesize Plan'} 
                {planOpen ? <ChevronUpIcon className="w-4 h-4" /> : <ChevronDownIcon className="w-4 h-4" />}
              </div>
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
                      {['Basic 1–Basic 3', 'Basic 4–Basic 6', 'JSS1–JSS3', 'SS1–SS3', 'JSS1–SS3', 'Basic 1–SS3'].map(g => (
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
                      {['8', '10', '12', '14', '16'].map(w => (
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
                  <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
                    <div className="bg-white/5 border border-white/10 rounded-3xl p-8 sm:p-12 relative overflow-hidden group">
                      <div className="absolute top-0 right-0 w-32 h-32 bg-violet-600/10 blur-3xl rounded-full" />
                      <div className="relative z-10">
                        <h4 className="font-black text-3xl sm:text-4xl text-white mb-2 tracking-tight">{planResult.course_title}</h4>
                        <p className="text-lg text-white/50 mb-8 font-medium italic border-l-2 border-white/10 pl-6 py-2">{planResult.description}</p>
                        <div className="flex flex-wrap gap-4 text-[10px] font-black uppercase tracking-widest mb-10">
                          <span className="px-5 py-2 bg-violet-500/10 border border-violet-500/20 text-violet-400 rounded-xl shadow-xl">{planResult.grade_level}</span>
                          <span className="px-5 py-2 bg-white/5 border border-white/10 text-white/40 rounded-xl shadow-xl">{planResult.duration}</span>
                        </div>
                        {planResult.objectives?.length > 0 && (
                          <div className="mb-4">
                            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-violet-400/60 mb-6">Foundational Objectives</p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              {planResult.objectives.map((o: string, i: number) => (
                                <div key={i} className="text-sm text-white/60 flex items-start gap-4 p-4 bg-white/5 border border-white/5 rounded-2xl group/obj hover:bg-violet-600/5 transition-all">
                                  <div className="w-6 h-6 rounded-lg bg-violet-500/20 text-violet-400 flex items-center justify-center flex-shrink-0 group-hover/obj:scale-110 transition-transform">✓</div>
                                  <span className="font-medium leading-relaxed">{o}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Week-by-week table */}
                    <div className="space-y-6">
                      <div className="flex items-center gap-4 mb-2">
                        <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                        <p className="text-[11px] font-black uppercase tracking-[0.3em] text-white/20">Learning Map</p>
                        <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                      </div>
                      
                      <div className="grid grid-cols-1 gap-4">
                        {(planResult.weeks ?? []).map((week: any) => (
                          <div key={week.week} className="bg-white/5 border border-white/10 rounded-[2rem] p-6 sm:p-8 hover:bg-white/[0.08] transition-all group overflow-hidden relative">
                            <div className="absolute top-0 left-0 w-1 h-full bg-violet-600/40 opacity-0 group-hover:opacity-100 transition-opacity" />
                            
                            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                              <div className="lg:col-span-3 flex items-start gap-5">
                                <span className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 text-white font-black text-xl flex items-center justify-center flex-shrink-0 shadow-2xl group-hover:scale-110 transition-transform">
                                  {week.week}
                                </span>
                                <div>
                                  <p className="text-[10px] font-black text-violet-400 uppercase tracking-widest mb-1">Theme</p>
                                  <p className="font-black text-white text-lg leading-tight tracking-tight">{week.theme}</p>
                                </div>
                              </div>
                              
                              <div className="lg:col-span-3">
                                <p className="text-[10px] font-black uppercase tracking-widest text-white/20 mb-3">Modular Topics</p>
                                <div className="space-y-1.5">
                                  {(week.topics ?? []).map((t: string, i: number) => (
                                    <div key={i} className="flex items-center gap-2 text-sm text-white/50 font-medium">
                                      <span className="w-1 h-1 rounded-full bg-violet-500/40" /> {t}
                                    </div>
                                  ))}
                                </div>
                              </div>
                              
                              <div className="lg:col-span-3">
                                <p className="text-[10px] font-black uppercase tracking-widest text-white/20 mb-3">Active Engagement</p>
                                <div className="space-y-1.5">
                                  {(week.activities ?? []).map((a: string, i: number) => (
                                    <div key={i} className="flex items-center gap-2 text-sm text-white/50 font-medium italic">
                                      <span className="w-1 h-1 rounded-full bg-emerald-500/40" /> {a}
                                    </div>
                                  ))}
                                </div>
                              </div>
                              
                              <div className="lg:col-span-3 bg-white/5 rounded-2xl p-5 border border-white/5">
                                <p className="text-[10px] font-black uppercase tracking-widest text-white/20 mb-2">Milestone</p>
                                <p className="text-sm text-white/60 font-medium leading-relaxed">{week.assessment}</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {(planResult.materials?.length > 0 || planResult.assessment_strategy) && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {planResult.assessment_strategy && (
                          <div className="bg-white/5 border border-white/10 rounded-[2rem] p-8 sm:p-10">
                            <h5 className="text-[11px] font-black uppercase tracking-[0.2em] text-violet-400 mb-4">Quality Assurance</h5>
                            <p className="text-lg text-white/60 font-medium leading-relaxed">{planResult.assessment_strategy}</p>
                          </div>
                        )}
                        {planResult.materials?.length > 0 && (
                          <div className="bg-white/5 border border-white/10 rounded-[2rem] p-8 sm:p-10">
                            <h5 className="text-[11px] font-black uppercase tracking-[0.2em] text-violet-400 mb-6">Toolkit & Artifacts</h5>
                            <div className="flex flex-wrap gap-2">
                              {planResult.materials.map((m: string, i: number) => (
                                <span key={i} className="px-4 py-2 bg-white/5 border border-white/5 rounded-xl text-xs text-white/50 font-black uppercase tracking-widest inline-block">
                                  {m}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Save Plan to DB */}
                    {planSaved ? (
                      <div className="flex items-center gap-5 bg-emerald-500/10 border border-emerald-500/20 rounded-3xl px-8 py-6 shadow-2xl">
                        <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 flex items-center justify-center text-emerald-400">
                           <CheckCircleIcon className="w-6 h-6" />
                        </div>
                        <div>
                          <p className="text-emerald-400 font-black text-lg uppercase tracking-tight">Synthesis Complete</p>
                          <p className="text-white/40 text-xs mt-0.5 font-medium uppercase tracking-widest">Plan archived to course curriculum</p>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-[#0B0B1B] border border-violet-500/20 rounded-[2.5rem] p-8 sm:p-10 space-y-6 shadow-3xl">
                        <div>
                          <p className="text-[11px] font-black uppercase tracking-[0.3em] text-violet-400 mb-2">Commit to Repository</p>
                          <p className="text-white/40 text-sm font-medium">Select a master curriculum to attach this synthesized plan.</p>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-4">
                          <select
                            value={planCourseId}
                            onChange={e => { setPlanCourseId(e.target.value); setPlanSaveError(null); }}
                            className="flex-1 bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-sm text-white outline-none focus:border-violet-500 transition-all cursor-pointer"
                          >
                            <option value="" className="bg-[#0f0f1a]">Select curriculum...</option>
                            {courses.map(c => <option key={c.id} value={c.id} className="bg-[#0f0f1a]">{c.title}</option>)}
                          </select>
                          <button
                            type="button"
                            onClick={handleSavePlan}
                            disabled={savingPlan || !planCourseId}
                            className="flex items-center justify-center gap-3 px-10 py-4 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-black text-xs uppercase tracking-[0.2em] rounded-2xl transition-all shadow-2xl active:scale-95"
                          >
                            {savingPlan
                              ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Committing…</>
                              : <><SparklesIcon className="w-4 h-4" /> Save Plan</>
                            }
                          </button>
                        </div>
                        {planSaveError && <p className="text-xs text-rose-400 bg-rose-500/10 px-4 py-2 rounded-lg border border-rose-500/20">{planSaveError}</p>}
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => { setPlanResult(null); setPlanTopic(''); setPlanSaved(false); setPlanCourseId(''); }}
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