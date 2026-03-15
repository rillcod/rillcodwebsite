// @refresh reset
'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import {
  ArrowLeftIcon, BookOpenIcon, UserGroupIcon, ClockIcon,
  AcademicCapIcon, PencilIcon, CheckCircleIcon, PlayIcon,
  DocumentTextIcon, CalendarIcon,
} from '@/lib/icons';

export default function CourseDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  const router = useRouter();
  const { profile, loading: authLoading } = useAuth();

  const [course, setCourse] = useState<any>(null);
  const [lessons, setLessons] = useState<any[]>([]);
  const [enrollments, setEnrollments] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [sessionSaving, setSessionSaving] = useState(false);
  const [sessionForm, setSessionForm] = useState({
    title: '',
    description: '',
    scheduledStart: '',
    scheduledEnd: '',
    provider: 'zoom',
    recordingEnabled: false,
    allowBreakoutRooms: false,
    allowScreenSharing: true,
    allowPolls: false,
  });
  const [managedSessionId, setManagedSessionId] = useState<string | null>(null);
  const [rooms, setRooms] = useState<any[]>([]);
  const [polls, setPolls] = useState<any[]>([]);
  const [managementLoading, setManagementLoading] = useState(false);
  const [roomForm, setRoomForm] = useState({ name: '', maxParticipants: '' });
  const [pollForm, setPollForm] = useState({
    question: '',
    pollType: 'poll',
    allowMultiple: false,
    options: ['', ''],
  });

  const role = profile?.role ?? '';
  const isStaff = role === 'admin' || role === 'teacher' || role === 'school';
  const canEdit = role === 'admin' || role === 'teacher';

  useEffect(() => {
    if (authLoading || !profile || !id) return;
    let cancelled = false;
    const supabase = createClient();

    async function load() {
      setLoading(true);
      setError(null);
      try {
        // Load course + lessons + sessions in parallel first (need course.program_id for enrollments)
        const [courseRes, lessonsRes, sessionsRes] = await Promise.allSettled([
          supabase.from('courses')
            .select('*, programs(name, difficulty_level, description, duration_weeks), portal_users(full_name)')
            .eq('id', id)
            .maybeSingle(),
          supabase.from('lessons')
            .select('id, title, lesson_type, status, order_index, duration_minutes')
            .eq('course_id', id)
            .order('order_index', { ascending: true }),
          supabase.from('live_sessions')
            .select('*')
            .eq('course_id', id)
            .order('scheduled_start', { ascending: true }),
        ]);

        if (!cancelled) {
          if (courseRes.status === 'fulfilled') setCourse(courseRes.value.data);
          else throw new Error('Course not found');
          if (lessonsRes.status === 'fulfilled') setLessons(lessonsRes.value.data ?? []);
          if (sessionsRes.status === 'fulfilled') setSessions(sessionsRes.value.data ?? []);
        }

        // Enrollments are program-level (not course-level) — use program_id from course
        const programId = courseRes.status === 'fulfilled' ? courseRes.value.data?.program_id : null;
        if (programId && !cancelled) {
          let enrollRes;
          if (isStaff) {
            let q = supabase.from('enrollments')
              .select('id, status, enrollment_date, portal_users!enrollments_user_id_fkey(full_name, email, school_id)')
              .eq('program_id', programId)
              .order('enrollment_date', { ascending: false });

            if (role === 'school' && profile?.school_id) {
              q = q.eq('portal_users.school_id', profile.school_id);
            }
            enrollRes = await q;
          } else {
            enrollRes = await supabase.from('enrollments')
              .select('id, status, enrollment_date')
              .eq('program_id', programId)
              .eq('user_id', profile!.id)
              .maybeSingle();
          }

          if (!cancelled) {
            const val = enrollRes?.data;
            setEnrollments(isStaff ? (Array.isArray(val) ? val : []) : val ? [val] : []);
          }
        }
      } catch (e: any) {
        if (!cancelled) setError(e.message ?? 'Failed to load course');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [profile?.id, id, authLoading]); // eslint-disable-line

  const LEVEL_COLOR: Record<string, string> = {
    beginner: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    intermediate: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    advanced: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
  };

  const TYPE_ICON: Record<string, any> = {
    video: PlayIcon, text: DocumentTextIcon, quiz: AcademicCapIcon,
  };

  const formatDateTime = (value?: string) => {
    if (!value) return '—';
    const date = new Date(value);
    return date.toLocaleString();
  };

  const handleJoinSession = async (sessionId: string) => {
    setSessionError(null);
    try {
      const res = await fetch(`/api/live-sessions/${sessionId}/join`, { method: 'POST' });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error ?? 'Failed to join session');
      const url = payload?.data?.meetingUrl;
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
    } catch (e: any) {
      setSessionError(e.message ?? 'Failed to join session');
    }
  };

  const handleScheduleSession = async (e: React.FormEvent) => {
    e.preventDefault();
    setSessionSaving(true);
    setSessionError(null);
    try {
      const payload = {
        courseId: id,
        title: sessionForm.title.trim(),
        description: sessionForm.description.trim() || undefined,
        scheduledStart: sessionForm.scheduledStart ? new Date(sessionForm.scheduledStart).toISOString() : '',
        scheduledEnd: sessionForm.scheduledEnd ? new Date(sessionForm.scheduledEnd).toISOString() : '',
        provider: sessionForm.provider,
        recordingEnabled: sessionForm.recordingEnabled,
        allowBreakoutRooms: sessionForm.allowBreakoutRooms,
        allowScreenSharing: sessionForm.allowScreenSharing,
        allowPolls: sessionForm.allowPolls,
      };

      const res = await fetch('/api/live-sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'Failed to schedule session');

      setSessions((prev) => [...prev, data.data].sort((a, b) => new Date(a.scheduled_start).getTime() - new Date(b.scheduled_start).getTime()));
      setSessionForm({
        title: '',
        description: '',
        scheduledStart: '',
        scheduledEnd: '',
        provider: 'zoom',
        recordingEnabled: false,
        allowBreakoutRooms: false,
        allowScreenSharing: true,
        allowPolls: false,
      });
    } catch (e: any) {
      setSessionError(e.message ?? 'Failed to schedule session');
    } finally {
      setSessionSaving(false);
    }
  };

  const loadSessionManagement = async (sessionId: string) => {
    setManagementLoading(true);
    setSessionError(null);
    try {
      const [roomsRes, pollsRes] = await Promise.all([
        fetch(`/api/live-sessions/${sessionId}/breakout-rooms`),
        fetch(`/api/live-sessions/${sessionId}/polls`)
      ]);
      const roomsPayload = await roomsRes.json();
      const pollsPayload = await pollsRes.json();

      if (!roomsRes.ok) throw new Error(roomsPayload?.error ?? 'Failed to load rooms');
      if (!pollsRes.ok) throw new Error(pollsPayload?.error ?? 'Failed to load polls');

      setRooms(roomsPayload.data ?? []);
      setPolls(pollsPayload.data ?? []);
      setManagedSessionId(sessionId);
    } catch (e: any) {
      setSessionError(e.message ?? 'Failed to load session tools');
    } finally {
      setManagementLoading(false);
    }
  };

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!managedSessionId) return;
    setSessionError(null);
    try {
      const payload = {
        name: roomForm.name.trim(),
        maxParticipants: roomForm.maxParticipants ? parseInt(roomForm.maxParticipants, 10) : undefined,
      };
      const res = await fetch(`/api/live-sessions/${managedSessionId}/breakout-rooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'Failed to create room');
      setRooms((prev) => [...prev, data.data]);
      setRoomForm({ name: '', maxParticipants: '' });
    } catch (e: any) {
      setSessionError(e.message ?? 'Failed to create room');
    }
  };

  const handleCreatePoll = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!managedSessionId) return;
    setSessionError(null);
    try {
      const options = pollForm.options.map((text) => text.trim()).filter(Boolean).map((text) => ({ text }));
      const payload = {
        question: pollForm.question.trim(),
        pollType: pollForm.pollType,
        allowMultiple: pollForm.allowMultiple,
        options,
      };
      const res = await fetch(`/api/live-sessions/${managedSessionId}/polls`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'Failed to create poll');
      setPolls((prev) => [...prev, { ...data.data, live_session_poll_options: options }]);
      setPollForm({ question: '', pollType: 'poll', allowMultiple: false, options: ['', ''] });
    } catch (e: any) {
      setSessionError(e.message ?? 'Failed to create poll');
    }
  };

  if (authLoading || loading) return (
    <div className="min-h-screen bg-[#0f0f1a] flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (error || !course) return (
    <div className="min-h-screen bg-[#0f0f1a] flex flex-col items-center justify-center gap-4">
      <p className="text-rose-400 font-semibold">{error ?? 'Course not found'}</p>
      <Link href="/dashboard/courses" className="text-sm text-violet-400 hover:underline">← Back to Courses</Link>
    </div>
  );

  const prog = course.programs;
  const myEnrollment = !isStaff ? enrollments[0] : null;

  return (
    <div className="min-h-screen bg-[#0f0f1a] text-white">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">

        {/* Back + Header */}
        <div className="flex items-center gap-4">
          <button onClick={() => router.back()}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-colors">
            <ArrowLeftIcon className="w-5 h-5 text-white/60" />
          </button>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <BookOpenIcon className="w-4 h-4 text-violet-400" />
              <span className="text-xs font-bold text-violet-400 uppercase tracking-widest">Course</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold">{course.title}</h1>
          </div>
          {canEdit && (
            <Link href={`/dashboard/courses/${id}/edit`}
              className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/15 border border-white/10 rounded-xl text-sm font-bold transition-colors">
              <PencilIcon className="w-4 h-4" /> Edit
            </Link>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Left: details */}
          <div className="lg:col-span-2 space-y-6">

            {/* Programme card */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
              <h2 className="font-bold text-white mb-4">Programme</h2>
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-2xl bg-violet-500/20 flex items-center justify-center flex-shrink-0">
                  <AcademicCapIcon className="w-6 h-6 text-violet-400" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <p className="font-bold text-white">{prog?.name ?? '—'}</p>
                    {prog?.difficulty_level && (
                      <span className={`px-2 py-0.5 rounded-full text-xs font-bold border ${LEVEL_COLOR[prog.difficulty_level] ?? 'bg-white/10 text-white/40 border-white/10'}`}>
                        {prog.difficulty_level}
                      </span>
                    )}
                  </div>
                  {prog?.description && <p className="text-sm text-white/50">{prog.description}</p>}
                  <div className="flex items-center gap-4 mt-2 text-xs text-white/30">
                    {prog?.duration_weeks && <span>{prog.duration_weeks} weeks</span>}
                    {course.duration_hours && (
                      <span className="flex items-center gap-1"><ClockIcon className="w-3.5 h-3.5" />{course.duration_hours}h</span>
                    )}
                  </div>
                </div>
              </div>
              {course.description && (
                <p className="mt-4 text-sm text-white/50 border-t border-white/10 pt-4">{course.description}</p>
              )}
            </div>

            {/* Lessons */}
            <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
              <div className="p-5 border-b border-white/10 flex items-center justify-between">
                <h2 className="font-bold text-white">Lessons</h2>
                <span className="text-xs text-white/30">{lessons.length} lesson{lessons.length !== 1 ? 's' : ''}</span>
              </div>
              {lessons.length === 0 ? (
                <div className="py-12 text-center">
                  <DocumentTextIcon className="w-10 h-10 mx-auto text-white/10 mb-3" />
                  <p className="text-white/30 text-sm">No lessons added yet</p>
                </div>
              ) : (
                <div className="divide-y divide-white/5">
                  {lessons.map((lesson, i) => {
                    const Icon = TYPE_ICON[lesson.lesson_type] ?? DocumentTextIcon;
                    return (
                      <div key={lesson.id} className="flex items-center gap-4 px-5 py-4 hover:bg-white/5 transition-colors">
                        <span className="w-6 h-6 rounded-full bg-white/10 text-white/30 text-xs font-bold flex items-center justify-center flex-shrink-0">
                          {i + 1}
                        </span>
                        <div className="w-8 h-8 rounded-xl bg-cyan-500/10 flex items-center justify-center flex-shrink-0">
                          <Icon className="w-4 h-4 text-cyan-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-white truncate">{lesson.title}</p>
                          <p className="text-xs text-white/30 capitalize">{lesson.lesson_type}{lesson.duration_minutes ? ` · ${lesson.duration_minutes}m` : ''}</p>
                        </div>
                        {lesson.status === 'published' && (
                          <CheckCircleIcon className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                        )}
                        <Link href={`/dashboard/lessons/${lesson.id}`}
                          className="flex-shrink-0 flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 rounded-xl transition-colors">
                          <PlayIcon className="w-3 h-3" /> Open
                        </Link>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Live sessions */}
            <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
              <div className="p-5 border-b border-white/10 flex items-center justify-between">
                <h2 className="font-bold text-white">Live Sessions</h2>
                <span className="text-xs text-white/30">{sessions.length} session{sessions.length !== 1 ? 's' : ''}</span>
              </div>
              {sessionError && (
                <div className="px-5 py-3 text-sm text-rose-400 border-b border-white/10">{sessionError}</div>
              )}
              {sessions.length === 0 ? (
                <div className="py-12 text-center">
                  <CalendarIcon className="w-10 h-10 mx-auto text-white/10 mb-3" />
                  <p className="text-white/30 text-sm">No live sessions scheduled</p>
                </div>
              ) : (
                <div className="divide-y divide-white/5">
                  {sessions.map((session) => {
                    const isJoinable = session.status === 'live' || session.status === 'scheduled';
                    return (
                      <div key={session.id} className="flex items-center gap-4 px-5 py-4 hover:bg-white/5 transition-colors">
                        <div className="w-8 h-8 rounded-xl bg-violet-500/10 flex items-center justify-center flex-shrink-0">
                          <CalendarIcon className="w-4 h-4 text-violet-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-white truncate">{session.title}</p>
                          <p className="text-xs text-white/30">
                            {formatDateTime(session.scheduled_start)} · {session.status}
                          </p>
                        </div>
                        <button
                          onClick={() => handleJoinSession(session.id)}
                          disabled={!isJoinable}
                          className={`flex-shrink-0 flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-xl transition-colors ${isJoinable ? 'text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20' : 'text-white/30 bg-white/5 cursor-not-allowed'}`}
                        >
                          <PlayIcon className="w-3 h-3" /> Join
                        </button>
                        {canEdit && (
                          <button
                            onClick={() => loadSessionManagement(session.id)}
                            className={`flex-shrink-0 flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-xl transition-colors ${managedSessionId === session.id ? 'text-violet-200 bg-violet-500/20' : 'text-violet-400 bg-violet-500/10 hover:bg-violet-500/20'}`}
                          >
                            Manage
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              {canEdit && managedSessionId && (
                <div className="border-t border-white/10 p-5 space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-bold text-white">Session Tools</p>
                      <p className="text-xs text-white/30">Breakout rooms and live polls</p>
                    </div>
                    <button
                      onClick={() => setManagedSessionId(null)}
                      className="text-xs text-white/40 hover:text-white/60"
                    >
                      Close
                    </button>
                  </div>

                  {managementLoading ? (
                    <div className="text-xs text-white/30">Loading session tools...</div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-4">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-semibold text-white">Breakout Rooms</p>
                          <span className="text-xs text-white/30">{rooms.length}</span>
                        </div>
                        {rooms.length === 0 ? (
                          <p className="text-xs text-white/30">No rooms created.</p>
                        ) : (
                          <div className="space-y-2">
                            {rooms.map((room) => (
                              <div key={room.id} className="flex items-center justify-between text-xs text-white/70 bg-white/5 rounded-lg px-3 py-2">
                                <span>{room.name}</span>
                                <span className="text-white/30">{room.status}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        <form onSubmit={handleCreateRoom} className="space-y-2">
                          <input
                            value={roomForm.name}
                            onChange={(e) => setRoomForm((s) => ({ ...s, name: e.target.value }))}
                            placeholder="Room name"
                            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder:text-white/30"
                            required
                          />
                          <input
                            value={roomForm.maxParticipants}
                            onChange={(e) => setRoomForm((s) => ({ ...s, maxParticipants: e.target.value }))}
                            placeholder="Max participants (optional)"
                            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder:text-white/30"
                          />
                          <button
                            type="submit"
                            className="w-full text-xs font-semibold px-3 py-2 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30"
                          >
                            Create Room
                          </button>
                        </form>
                      </div>

                      <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-4">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-semibold text-white">Live Polls</p>
                          <span className="text-xs text-white/30">{polls.length}</span>
                        </div>
                        {polls.length === 0 ? (
                          <p className="text-xs text-white/30">No polls created.</p>
                        ) : (
                          <div className="space-y-2">
                            {polls.map((poll) => (
                              <div key={poll.id} className="text-xs text-white/70 bg-white/5 rounded-lg px-3 py-2">
                                <p className="font-semibold">{poll.question}</p>
                                <p className="text-white/30">{poll.poll_type} · {poll.status}</p>
                              </div>
                            ))}
                          </div>
                        )}
                        <form onSubmit={handleCreatePoll} className="space-y-2">
                          <input
                            value={pollForm.question}
                            onChange={(e) => setPollForm((s) => ({ ...s, question: e.target.value }))}
                            placeholder="Poll question"
                            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder:text-white/30"
                            required
                          />
                          <div className="flex items-center gap-2">
                            <select
                              value={pollForm.pollType}
                              onChange={(e) => setPollForm((s) => ({ ...s, pollType: e.target.value }))}
                              className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white"
                            >
                              <option value="poll">Poll</option>
                              <option value="quiz">Quiz</option>
                            </select>
                            <label className="flex items-center gap-2 text-[11px] text-white/40">
                              <input
                                type="checkbox"
                                checked={pollForm.allowMultiple}
                                onChange={(e) => setPollForm((s) => ({ ...s, allowMultiple: e.target.checked }))}
                                className="h-4 w-4 rounded border-white/20 bg-white/10"
                              />
                              Multi-select
                            </label>
                          </div>
                          <div className="space-y-2">
                            {pollForm.options.map((option, index) => (
                              <input
                                key={`poll-option-${index}`}
                                value={option}
                                onChange={(e) => {
                                  const next = [...pollForm.options];
                                  next[index] = e.target.value;
                                  setPollForm((s) => ({ ...s, options: next }));
                                }}
                                placeholder={`Option ${index + 1}`}
                                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder:text-white/30"
                                required={index < 2}
                              />
                            ))}
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setPollForm((s) => ({ ...s, options: [...s.options, ''] }))}
                              className="flex-1 text-xs font-semibold px-3 py-2 rounded-lg bg-white/5 text-white/60 border border-white/10 hover:bg-white/10"
                            >
                              Add option
                            </button>
                            {pollForm.options.length > 2 && (
                              <button
                                type="button"
                                onClick={() => setPollForm((s) => ({ ...s, options: s.options.slice(0, -1) }))}
                                className="flex-1 text-xs font-semibold px-3 py-2 rounded-lg bg-white/5 text-white/60 border border-white/10 hover:bg-white/10"
                              >
                                Remove option
                              </button>
                            )}
                          </div>
                          <button
                            type="submit"
                            className="w-full text-xs font-semibold px-3 py-2 rounded-lg bg-violet-500/20 text-violet-200 border border-violet-500/30 hover:bg-violet-500/30"
                          >
                            Create Poll
                          </button>
                        </form>
                      </div>
                    </div>
                  )}
                </div>
              )}
              {canEdit && (
                <form onSubmit={handleScheduleSession} className="p-5 border-t border-white/10 space-y-4">
                  <div className="flex items-center gap-2">
                    <CalendarIcon className="w-4 h-4 text-violet-400" />
                    <p className="text-sm font-bold text-white">Schedule a session</p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <input
                      value={sessionForm.title}
                      onChange={(e) => setSessionForm((s) => ({ ...s, title: e.target.value }))}
                      placeholder="Session title"
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder:text-white/30"
                      required
                    />
                    <select
                      value={sessionForm.provider}
                      onChange={(e) => setSessionForm((s) => ({ ...s, provider: e.target.value }))}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white"
                    >
                      <option value="zoom">Zoom</option>
                      <option value="google_meet">Google Meet</option>
                      <option value="microsoft_teams">Microsoft Teams</option>
                    </select>
                    <input
                      type="datetime-local"
                      value={sessionForm.scheduledStart}
                      onChange={(e) => setSessionForm((s) => ({ ...s, scheduledStart: e.target.value }))}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white"
                      required
                    />
                    <input
                      type="datetime-local"
                      value={sessionForm.scheduledEnd}
                      onChange={(e) => setSessionForm((s) => ({ ...s, scheduledEnd: e.target.value }))}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white"
                      required
                    />
                  </div>
                  <textarea
                    value={sessionForm.description}
                    onChange={(e) => setSessionForm((s) => ({ ...s, description: e.target.value }))}
                    placeholder="Description (optional)"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder:text-white/30"
                    rows={2}
                  />
                  <div className="flex flex-wrap gap-4 text-xs text-white/40">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={sessionForm.recordingEnabled}
                        onChange={(e) => setSessionForm((s) => ({ ...s, recordingEnabled: e.target.checked }))}
                        className="h-4 w-4 rounded border-white/20 bg-white/10"
                      />
                      Recording
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={sessionForm.allowBreakoutRooms}
                        onChange={(e) => setSessionForm((s) => ({ ...s, allowBreakoutRooms: e.target.checked }))}
                        className="h-4 w-4 rounded border-white/20 bg-white/10"
                      />
                      Breakout rooms
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={sessionForm.allowScreenSharing}
                        onChange={(e) => setSessionForm((s) => ({ ...s, allowScreenSharing: e.target.checked }))}
                        className="h-4 w-4 rounded border-white/20 bg-white/10"
                      />
                      Screen sharing
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={sessionForm.allowPolls}
                        onChange={(e) => setSessionForm((s) => ({ ...s, allowPolls: e.target.checked }))}
                        className="h-4 w-4 rounded border-white/20 bg-white/10"
                      />
                      Polls & quizzes
                    </label>
                  </div>
                  <div>
                    <button
                      type="submit"
                      disabled={sessionSaving}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-violet-500/20 text-violet-300 border border-violet-500/30 hover:bg-violet-500/30 disabled:opacity-50"
                    >
                      {sessionSaving ? 'Scheduling...' : 'Schedule Session'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>

          {/* Right: sidebar */}
          <div className="space-y-5">

            {/* Status + instructor */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-4">
              <div>
                <p className="text-xs text-white/30 uppercase tracking-widest mb-1">Status</p>
                <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold border ${course.is_active ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-white/10 text-white/30 border-white/10'}`}>
                  {course.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
              {course.portal_users?.full_name && (
                <div>
                  <p className="text-xs text-white/30 uppercase tracking-widest mb-1">Instructor</p>
                  <p className="text-sm font-semibold text-white">{course.portal_users.full_name}</p>
                </div>
              )}
              {myEnrollment && (
                <div>
                  <p className="text-xs text-white/30 uppercase tracking-widest mb-1">Your Status</p>
                  <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold border capitalize ${myEnrollment.status === 'completed' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-blue-500/20 text-blue-400 border-blue-500/30'}`}>
                    {myEnrollment.status}
                  </span>
                </div>
              )}
            </div>

            {/* Enrolment stats (staff) */}
            {isStaff && (
              <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
                <div className="p-4 border-b border-white/10 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-white">Enrolled Students</h3>
                  <span className="text-xs text-white/30">{enrollments.length}</span>
                </div>
                {enrollments.length === 0 ? (
                  <div className="p-6 text-center">
                    <UserGroupIcon className="w-8 h-8 mx-auto text-white/10 mb-2" />
                    <p className="text-xs text-white/30">No enrolments yet</p>
                  </div>
                ) : (
                  <div className="divide-y divide-white/5 max-h-64 overflow-y-auto">
                    {enrollments.map((enr: any) => (
                      <div key={enr.id} className="flex items-center gap-3 px-4 py-3">
                        <div className="w-7 h-7 rounded-full bg-violet-500/20 flex items-center justify-center text-xs font-bold text-violet-400 flex-shrink-0">
                          {(enr.portal_users?.full_name ?? '?')[0]}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-white truncate">{enr.portal_users?.full_name}</p>
                          <p className="text-[10px] text-white/30">
                            {enr.enrollment_date ? new Date(enr.enrollment_date).toLocaleDateString() : '—'}
                          </p>
                        </div>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border capitalize ${enr.status === 'completed' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-blue-500/20 text-blue-400 border-blue-500/30'}`}>
                          {enr.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <Link href="/dashboard/courses"
              className="flex items-center gap-2 w-full py-3 px-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm font-bold text-white/60 transition-colors">
              <ArrowLeftIcon className="w-4 h-4" /> All Courses
            </Link>
          </div>

        </div>
      </div>
    </div>
  );
}
