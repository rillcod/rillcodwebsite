// @refresh reset
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import {
  VideoCameraIcon,
  CalendarDaysIcon,
  ClockIcon,
  PlayIcon,
  PencilIcon,
  TrashIcon,
  PlusIcon,
  XMarkIcon,
  LinkIcon,
  SignalIcon,
  FilmIcon,
  UserCircleIcon,
  AcademicCapIcon,
  CalendarIcon,
  BoltIcon,
  SparklesIcon,
  ArrowRightIcon,
  ChatBubbleLeftEllipsisIcon,
  UsersIcon,
  CheckCircleIcon,
  ChartBarIcon,
} from '@/lib/icons';

// ─── Types ────────────────────────────────────────────────────────────────────

interface LiveSession {
  id: string;
  title: string;
  description: string | null;
  host_id: string;
  school_id: string | null;
  program_id: string | null;
  session_url: string | null;
  platform: 'zoom' | 'google_meet' | 'teams' | 'discord' | 'other';
  scheduled_at: string;
  duration_minutes: number;
  status: 'scheduled' | 'live' | 'completed' | 'cancelled';
  recording_url: string | null;
  notes: string | null;
  created_at: string;
  host?: { full_name: string; role: string };
  program?: { name: string };
}

interface School { id: string; name: string; }
interface Program { id: string; name: string; }

interface SessionForm {
  title: string;
  description: string;
  platform: 'zoom' | 'google_meet' | 'teams' | 'discord' | 'other';
  session_url: string;
  scheduled_date: string;
  scheduled_time: string;
  duration_minutes: number;
  school_id: string;
  program_id: string;
  status: 'scheduled' | 'live' | 'completed' | 'cancelled';
  recording_url: string;
  notes: string;
}

type FilterTab = 'upcoming' | 'past' | 'all';

// ─── Platform config ──────────────────────────────────────────────────────────

const PLATFORM_CONFIG: Record<
  LiveSession['platform'],
  { label: string; textClass: string; bgClass: string; borderClass: string; dot: string }
> = {
  zoom:        { label: 'Zoom',        textClass: 'text-blue-400',    bgClass: 'bg-blue-500/10',    borderClass: 'border-blue-500/30',    dot: 'bg-blue-400' },
  google_meet: { label: 'Google Meet', textClass: 'text-emerald-400', bgClass: 'bg-emerald-500/10', borderClass: 'border-emerald-500/30', dot: 'bg-emerald-400' },
  teams:       { label: 'Teams',       textClass: 'text-purple-400',  bgClass: 'bg-purple-500/10',  borderClass: 'border-purple-500/30',  dot: 'bg-purple-400' },
  discord:     { label: 'Discord',     textClass: 'text-indigo-400',  bgClass: 'bg-indigo-500/10',  borderClass: 'border-indigo-500/30',  dot: 'bg-indigo-400' },
  other:       { label: 'Other',       textClass: 'text-white/40',    bgClass: 'bg-white/5',        borderClass: 'border-white/10',       dot: 'bg-white/30' },
};

const STATUS_CONFIG: Record<
  LiveSession['status'],
  { label: string; textClass: string; bgClass: string; borderClass: string; pulse?: boolean }
> = {
  scheduled: { label: 'Scheduled', textClass: 'text-amber-400',   bgClass: 'bg-amber-500/10',   borderClass: 'border-amber-500/30' },
  live:      { label: 'LIVE',      textClass: 'text-emerald-300', bgClass: 'bg-emerald-500/15', borderClass: 'border-emerald-400/40', pulse: true },
  completed: { label: 'Completed', textClass: 'text-blue-400',    bgClass: 'bg-blue-500/10',    borderClass: 'border-blue-500/30' },
  cancelled: { label: 'Cancelled', textClass: 'text-rose-400',    bgClass: 'bg-rose-500/10',    borderClass: 'border-rose-500/30' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
    year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

function getCountdown(iso: string): string | null {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0 || diff > 24 * 60 * 60 * 1000) return null;
  const totalMins = Math.floor(diff / 60000);
  const hrs  = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  if (hrs > 0) return `In ${hrs}h ${mins}m`;
  return `In ${mins}m`;
}

function blankForm(): SessionForm {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    title: '', description: '', platform: 'zoom', session_url: '',
    scheduled_date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    scheduled_time: `${pad(now.getHours() + 1)}:00`,
    duration_minutes: 60, school_id: '', program_id: '',
    status: 'scheduled', recording_url: '', notes: '',
  };
}

// ─── Session Card ─────────────────────────────────────────────────────────────

// ─── Polls Modal ─────────────────────────────────────────────────────────────

function PollsModal({ session, canManage, userId, onClose }: {
  session: LiveSession; canManage: boolean; userId: string; onClose: () => void;
}) {
  const [polls, setPolls] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [voted, setVoted] = useState<Record<string, string[]>>({});
  const [form, setForm] = useState({ question: '', type: 'poll' as 'poll' | 'quiz', options: ['', '', '', ''] });

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/live-sessions/${session.id}/polls`);
      const j = await res.json();
      setPolls(j.data ?? []);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [session.id]);

  const createPoll = async () => {
    const opts = form.options.filter(o => o.trim());
    if (!form.question.trim() || opts.length < 2) return;
    setSubmitting('create');
    try {
      const res = await fetch(`/api/live-sessions/${session.id}/polls`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: form.question, pollType: form.type, options: opts.map(t => ({ text: t })) }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setForm({ question: '', type: 'poll', options: ['', '', '', ''] });
      setCreating(false);
      await load();
    } catch (e: any) { alert(e.message); }
    finally { setSubmitting(null); }
  };

  const vote = async (pollId: string, optionId: string) => {
    if (submitting || voted[pollId]) return;
    setSubmitting(pollId);
    try {
      await fetch(`/api/live-sessions/${session.id}/polls/${pollId}/responses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ optionIds: [optionId] }),
      });
      setVoted(v => ({ ...v, [pollId]: [optionId] }));
      await load();
    } catch { }
    finally { setSubmitting(null); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-[#0d0d0d] border border-white/10 w-full max-w-lg max-h-[85vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/[0.06] flex-shrink-0">
          <div className="flex items-center gap-3">
            <ChartBarIcon className="w-5 h-5 text-orange-400" />
            <div>
              <p className="text-sm font-black text-white uppercase tracking-widest">Session Polls</p>
              <p className="text-[10px] text-white/30 mt-0.5 truncate max-w-[260px]">{session.title}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 bg-white/5 hover:bg-white/10 text-white/40 hover:text-white transition-all">
            <XMarkIcon className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {loading ? (
            <div className="flex justify-center py-10"><div className="w-7 h-7 border-4 border-orange-600 border-t-transparent animate-spin" /></div>
          ) : polls.length === 0 && !creating ? (
            <div className="text-center py-12 space-y-2">
              <ChartBarIcon className="w-10 h-10 text-white/10 mx-auto" />
              <p className="text-white/20 text-xs font-bold uppercase tracking-widest">No polls yet</p>
            </div>
          ) : polls.map((poll: any) => {
            const total = (poll.options ?? []).reduce((s: number, o: any) => s + (o.response_count ?? 0), 0);
            const hasVoted = !!voted[poll.id];
            return (
              <div key={poll.id} className="bg-white/[0.02] border border-white/[0.06] p-5 space-y-4">
                <p className="text-sm font-black text-white">{poll.question}</p>
                <div className="space-y-2">
                  {(poll.options ?? []).map((opt: any) => {
                    const pct = total > 0 ? Math.round((opt.response_count ?? 0) / total * 100) : 0;
                    const isMyVote = voted[poll.id]?.includes(opt.id);
                    return (
                      <button key={opt.id} disabled={!!hasVoted || !!submitting} onClick={() => vote(poll.id, opt.id)}
                        className={`w-full text-left relative overflow-hidden border transition-all py-3 px-4 ${isMyVote ? 'border-orange-500/50 bg-orange-500/10' : 'border-white/[0.06] hover:border-white/20 hover:bg-white/[0.03]'} disabled:cursor-default`}>
                        {hasVoted && <div className="absolute left-0 top-0 bottom-0 bg-white/[0.04] transition-all" style={{ width: `${pct}%` }} />}
                        <div className="relative flex items-center justify-between gap-3">
                          <span className="text-xs font-bold text-white">{opt.text}</span>
                          {hasVoted && <span className="text-[10px] font-black text-white/40">{pct}%</span>}
                        </div>
                      </button>
                    );
                  })}
                </div>
                {hasVoted && <p className="text-[10px] text-white/30 font-bold">{total} response{total !== 1 ? 's' : ''}</p>}
              </div>
            );
          })}

          {creating && (
            <div className="bg-white/[0.02] border border-white/10 p-5 space-y-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-white/40">New Poll</p>
              <input value={form.question} onChange={e => setForm(f => ({ ...f, question: e.target.value }))}
                placeholder="Ask a question…"
                className="w-full px-4 py-2.5 bg-white/[0.03] border border-white/10 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-orange-500 transition-all" />
              <div className="flex items-center gap-3">
                <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as any }))}
                  className="px-3 py-2 bg-white/[0.03] border border-white/10 text-xs text-white/60 focus:outline-none focus:border-orange-500">
                  <option value="poll" className="bg-[#0d0d0d]">Poll</option>
                  <option value="quiz" className="bg-[#0d0d0d]">Quiz (with correct answer)</option>
                </select>
              </div>
              <div className="space-y-2">
                {form.options.map((opt, i) => (
                  <input key={i} value={opt} onChange={e => setForm(f => { const o = [...f.options]; o[i] = e.target.value; return { ...f, options: o }; })}
                    placeholder={`Option ${i + 1}${i < 2 ? ' *' : ''}`}
                    className="w-full px-3 py-2 bg-white/[0.03] border border-white/10 text-xs text-white placeholder:text-white/20 focus:outline-none focus:border-orange-500 transition-all" />
                ))}
              </div>
              <div className="flex gap-3 pt-1">
                <button onClick={() => setCreating(false)} className="flex-1 py-2.5 text-xs font-bold text-white/30 hover:text-white border border-white/10 transition-all">Cancel</button>
                <button onClick={createPoll} disabled={!!submitting}
                  className="flex-1 py-2.5 text-xs font-black bg-orange-600 hover:bg-orange-500 text-white transition-all disabled:opacity-50">
                  {submitting === 'create' ? 'Creating…' : 'Create Poll'}
                </button>
              </div>
            </div>
          )}
        </div>

        {canManage && !creating && (
          <div className="p-4 border-t border-white/[0.06] flex-shrink-0">
            <button onClick={() => setCreating(true)}
              className="w-full flex items-center justify-center gap-2 py-3 bg-orange-600 hover:bg-orange-500 text-white text-xs font-black uppercase tracking-widest transition-all">
              <PlusIcon className="w-4 h-4" /> Create Poll
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Breakout Rooms Modal ─────────────────────────────────────────────────────

function RoomsModal({ session, canManage, onClose }: {
  session: LiveSession; canManage: boolean; onClose: () => void;
}) {
  const [rooms, setRooms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', maxParticipants: '' });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/live-sessions/${session.id}/breakout-rooms`);
      const j = await res.json();
      setRooms(j.data ?? []);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [session.id]);

  const createRoom = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/live-sessions/${session.id}/breakout-rooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.name, maxParticipants: form.maxParticipants ? Number(form.maxParticipants) : undefined }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setForm({ name: '', maxParticipants: '' });
      setCreating(false);
      await load();
    } catch (e: any) { alert(e.message); }
    finally { setSaving(false); }
  };

  const joinRoom = async (roomId: string) => {
    if (joining) return;
    setJoining(roomId);
    try {
      await fetch(`/api/live-sessions/${session.id}/breakout-rooms/${roomId}/participants`, { method: 'POST' });
      await load();
    } catch { }
    finally { setJoining(null); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-[#0d0d0d] border border-white/10 w-full max-w-lg max-h-[85vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/[0.06] flex-shrink-0">
          <div className="flex items-center gap-3">
            <UsersIcon className="w-5 h-5 text-purple-400" />
            <div>
              <p className="text-sm font-black text-white uppercase tracking-widest">Breakout Rooms</p>
              <p className="text-[10px] text-white/30 mt-0.5 truncate max-w-[260px]">{session.title}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 bg-white/5 hover:bg-white/10 text-white/40 hover:text-white transition-all">
            <XMarkIcon className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {loading ? (
            <div className="flex justify-center py-10"><div className="w-7 h-7 border-4 border-purple-600 border-t-transparent animate-spin" /></div>
          ) : rooms.length === 0 && !creating ? (
            <div className="text-center py-12 space-y-2">
              <UsersIcon className="w-10 h-10 text-white/10 mx-auto" />
              <p className="text-white/20 text-xs font-bold uppercase tracking-widest">No breakout rooms</p>
            </div>
          ) : rooms.map((room: any) => (
            <div key={room.id} className="bg-white/[0.02] border border-white/[0.06] p-5 flex items-center justify-between gap-4">
              <div className="space-y-1">
                <p className="text-sm font-black text-white">{room.name}</p>
                <p className="text-[10px] text-white/30 font-bold">
                  {room.participant_count ?? 0} participant{(room.participant_count ?? 0) !== 1 ? 's' : ''}
                  {room.max_participants ? ` / ${room.max_participants} max` : ''}
                </p>
              </div>
              <button onClick={() => joinRoom(room.id)} disabled={!!joining}
                className="flex items-center gap-2 px-4 py-2.5 bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/30 text-purple-400 text-xs font-black uppercase tracking-widest transition-all disabled:opacity-50">
                {joining === room.id ? <div className="w-3.5 h-3.5 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" /> : <CheckCircleIcon className="w-3.5 h-3.5" />}
                Join
              </button>
            </div>
          ))}

          {creating && (
            <div className="bg-white/[0.02] border border-white/10 p-5 space-y-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-white/40">New Room</p>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Room name (e.g. Group A)"
                className="w-full px-4 py-2.5 bg-white/[0.03] border border-white/10 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-purple-500 transition-all" />
              <input type="number" value={form.maxParticipants} onChange={e => setForm(f => ({ ...f, maxParticipants: e.target.value }))}
                placeholder="Max participants (optional)"
                className="w-full px-4 py-2.5 bg-white/[0.03] border border-white/10 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-purple-500 transition-all" />
              <div className="flex gap-3">
                <button onClick={() => setCreating(false)} className="flex-1 py-2.5 text-xs font-bold text-white/30 hover:text-white border border-white/10 transition-all">Cancel</button>
                <button onClick={createRoom} disabled={saving}
                  className="flex-1 py-2.5 text-xs font-black bg-purple-600 hover:bg-purple-500 text-white transition-all disabled:opacity-50">
                  {saving ? 'Creating…' : 'Create Room'}
                </button>
              </div>
            </div>
          )}
        </div>

        {canManage && !creating && (
          <div className="p-4 border-t border-white/[0.06] flex-shrink-0">
            <button onClick={() => setCreating(true)}
              className="w-full flex items-center justify-center gap-2 py-3 bg-purple-600 hover:bg-purple-500 text-white text-xs font-black uppercase tracking-widest transition-all">
              <PlusIcon className="w-4 h-4" /> Add Room
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Session Card ─────────────────────────────────────────────────────────────

function SessionCard({
  session, canManage, onEdit, onDelete, onJoin, onPolls, onRooms
}: {
  session: LiveSession;
  canManage: boolean;
  onEdit: (s: LiveSession) => void;
  onDelete: (id: string) => void;
  onJoin: (id: string, url: string) => void;
  onPolls: (s: LiveSession) => void;
  onRooms: (s: LiveSession) => void;
}) {
  const platCfg = PLATFORM_CONFIG[session.platform];
  const statusCfg = STATUS_CONFIG[session.status];
  const countdown = getCountdown(session.scheduled_at);
  const isLive = session.status === 'live';
  const showJoin = (session.status === 'scheduled' || isLive) && !!session.session_url;
  const showRecording = session.status === 'completed' && !!session.recording_url;

  return (
    <div className={`relative bg-[#0d0d0d] border flex flex-col gap-0 transition-all duration-300 overflow-hidden group
      ${isLive ? 'border-emerald-500/40 shadow-[0_0_40px_rgba(16,185,129,0.1)] scale-[1.02] z-10' : 'border-white/[0.06] hover:border-white/[0.12]'}`}>
      
      {/* Live glow strip */}
      {isLive && <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-emerald-500 via-emerald-400 to-emerald-500 animate-pulse" />}

      <div className="p-6 flex flex-col gap-5 flex-1">
        {/* Top badges row */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {/* Platform */}
            <div className={`flex items-center gap-1.5 px-3 py-1 border text-[9px] font-black uppercase tracking-widest ${platCfg.textClass} ${platCfg.bgClass} ${platCfg.borderClass}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${platCfg.dot}`} />
              {platCfg.label}
            </div>
            {/* Status */}
            <div className={`flex items-center gap-1.5 px-3 py-1 border text-[9px] font-black uppercase tracking-widest ${statusCfg.textClass} ${statusCfg.bgClass} ${statusCfg.borderClass}`}>
              {statusCfg.pulse && (
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
                </span>
              )}
              {statusCfg.label}
            </div>
            {/* Countdown */}
            {countdown && (
              <div className="flex items-center gap-1.5 px-3 py-1 border border-amber-500/30 bg-amber-500/10 text-amber-400 text-[9px] font-black uppercase tracking-widest animate-pulse">
                <ClockIcon className="w-3 h-3" />
                {countdown}
              </div>
            )}
          </div>

          {canManage && (
            <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
              <button onClick={() => onEdit(session)} className="p-2 bg-white/5 hover:bg-white/10 border border-white/5 text-white/40 hover:text-white transition-all">
                <PencilIcon className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => onDelete(session.id)} className="p-2 bg-white/5 hover:bg-rose-600 border border-white/5 text-white/40 hover:text-white transition-all">
                <TrashIcon className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Title */}
        <div>
          <h3 className="text-base font-black text-white uppercase tracking-tight leading-snug group-hover:text-orange-500 transition-colors">{session.title}</h3>
          {session.description && (
            <p className="text-xs text-white/30 font-medium mt-2 leading-relaxed line-clamp-2">{session.description}</p>
          )}
        </div>

        {/* Meta */}
        <div className="space-y-2.5 border-t border-white/5 pt-4">
          <div className="flex items-center gap-3 text-white/30">
            <CalendarDaysIcon className="w-3.5 h-3.5 text-orange-600 flex-shrink-0" />
            <span className="text-[10px] font-black uppercase tracking-wide">{formatDateTime(session.scheduled_at)}</span>
          </div>
          <div className="flex items-center gap-3 text-white/30">
            <ClockIcon className="w-3.5 h-3.5 text-orange-600 flex-shrink-0" />
            <span className="text-[10px] font-black uppercase tracking-wide">{session.duration_minutes} Minutes</span>
          </div>
          {session.host && (
            <div className="flex items-center gap-3 text-white/30">
              <UserCircleIcon className="w-3.5 h-3.5 text-orange-600 flex-shrink-0" />
              <span className="text-[10px] font-black uppercase tracking-wide truncate">{session.host.full_name}</span>
              <span className={`text-[8px] font-black uppercase tracking-widest px-2 py-0.5 border ${session.host.role === 'admin' ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' : 'bg-orange-500/10 text-orange-400 border-orange-500/20'}`}>
                {session.host.role}
              </span>
            </div>
          )}
          {session.program && (
            <div className="flex items-center gap-3 text-white/30">
              <AcademicCapIcon className="w-3.5 h-3.5 text-orange-600 flex-shrink-0" />
              <span className="text-[10px] font-black uppercase tracking-wide truncate">{session.program.name}</span>
            </div>
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div className="border-t border-white/5">
        {(showJoin || showRecording) && (
          <div className="flex">
            {showJoin && (
              <button
                onClick={() => onJoin(session.id, session.session_url!)}
                className={`flex-1 flex items-center justify-center gap-3 py-4 text-[10px] font-black uppercase tracking-widest transition-all ${
                  isLive
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/20'
                    : 'bg-orange-600 hover:bg-orange-500 text-white'
                }`}
              >
                {isLive ? <SignalIcon className="w-4 h-4 animate-pulse" /> : <LinkIcon className="w-4 h-4" />}
                {isLive ? 'Join Live Now' : 'Join Session'}
              </button>
            )}
            {showRecording && (
              <a
                href={session.recording_url!}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-3 py-4 bg-blue-600/80 hover:bg-blue-600 text-white text-[10px] font-black uppercase tracking-widest transition-all"
              >
                <FilmIcon className="w-4 h-4" />
                Watch Recording
              </a>
            )}
          </div>
        )}
        {/* Polls + Rooms quick-access */}
        <div className="flex border-t border-white/[0.04]">
          <button onClick={() => onPolls(session)}
            className="flex-1 flex items-center justify-center gap-2 py-3 text-[10px] font-black uppercase tracking-widest text-white/30 hover:text-orange-400 hover:bg-white/[0.02] transition-all">
            <ChartBarIcon className="w-3.5 h-3.5" /> Polls
          </button>
          <span className="w-px bg-white/[0.04]" />
          <button onClick={() => onRooms(session)}
            className="flex-1 flex items-center justify-center gap-2 py-3 text-[10px] font-black uppercase tracking-widest text-white/30 hover:text-purple-400 hover:bg-white/[0.02] transition-all">
            <UsersIcon className="w-3.5 h-3.5" /> Rooms
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────

function SessionModal({
  initial, isEdit, schools, programs, isAdmin, saving, error, onClose, onSave,
}: {
  initial: SessionForm; isEdit: boolean; schools: School[]; programs: Program[];
  isAdmin: boolean; saving: boolean; error: string | null;
  onClose: () => void; onSave: (form: SessionForm) => void;
}) {
  const [form, setForm] = useState<SessionForm>(initial);
  const set = (k: keyof SessionForm, v: string | number) => setForm(prev => ({ ...prev, [k]: v }));

  const fieldCls = "w-full px-4 py-3 bg-white/[0.03] border border-white/10 text-sm text-white font-medium focus:outline-none focus:border-orange-500/60 placeholder:text-white/20 transition-all";
  const labelCls = "block text-[9px] font-black text-white/30 uppercase tracking-[0.35em] mb-2";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-xl">
      <div className="bg-[#0a0a0a] border border-white/10 border-t-4 border-t-orange-600 w-full max-w-2xl max-h-[90vh] flex flex-col shadow-[0_0_100px_rgba(0,0,0,0.5)]">
        {/* Header */}
        <div className="flex items-center justify-between px-8 py-6 border-b border-white/5 bg-white/[0.015] flex-shrink-0">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-orange-600/10 border border-orange-500/20 flex items-center justify-center">
              <VideoCameraIcon className="w-5 h-5 text-orange-400" />
            </div>
            <div>
              <h2 className="text-sm font-black text-white uppercase tracking-widest">{isEdit ? 'Edit Session' : 'Schedule Live Session'}</h2>
              <p className="text-[9px] font-black text-white/20 uppercase tracking-[0.3em] mt-0.5">Sector: Broadcast Uplink</p>
            </div>
          </div>
          <button onClick={onClose} className="w-10 h-10 flex items-center justify-center bg-white/5 border border-white/10 hover:text-orange-500 transition-all text-white/40">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6">
          {error && (
            <div className="px-4 py-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-black uppercase tracking-widest">
              {error}
            </div>
          )}

          <div>
            <label className={labelCls}>Session Title <span className="text-orange-500">*</span></label>
            <input type="text" value={form.title} onChange={e => set('title', e.target.value)}
              placeholder="e.g. Introduction to Algorithms — Week 3"
              className={fieldCls} />
          </div>

          <div>
            <label className={labelCls}>Description</label>
            <textarea value={form.description} onChange={e => set('description', e.target.value)}
              placeholder="Brief overview of what will be covered…"
              rows={3} className={`${fieldCls} resize-none`} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Platform</label>
              <select value={form.platform} onChange={e => set('platform', e.target.value as LiveSession['platform'])}
                className={`${fieldCls} appearance-none`}>
                <option value="zoom" className="bg-[#0a0a0a]">Zoom</option>
                <option value="google_meet" className="bg-[#0a0a0a]">Google Meet</option>
                <option value="teams" className="bg-[#0a0a0a]">Microsoft Teams</option>
                <option value="discord" className="bg-[#0a0a0a]">Discord</option>
                <option value="other" className="bg-[#0a0a0a]">Other</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Join URL</label>
              <input type="url" value={form.session_url} onChange={e => set('session_url', e.target.value)}
                placeholder="https://zoom.us/j/..." className={fieldCls} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className={labelCls}>Date <span className="text-orange-500">*</span></label>
              <input type="date" value={form.scheduled_date} onChange={e => set('scheduled_date', e.target.value)}
                className={`${fieldCls} [color-scheme:dark]`} />
            </div>
            <div>
              <label className={labelCls}>Time <span className="text-orange-500">*</span></label>
              <input type="time" value={form.scheduled_time} onChange={e => set('scheduled_time', e.target.value)}
                className={`${fieldCls} [color-scheme:dark]`} />
            </div>
            <div>
              <label className={labelCls}>Duration (min)</label>
              <input type="number" min={5} max={480} value={form.duration_minutes}
                onChange={e => set('duration_minutes', Number(e.target.value))} className={fieldCls} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {isAdmin && (
              <div>
                <label className={labelCls}>School (optional)</label>
                <select value={form.school_id} onChange={e => set('school_id', e.target.value)}
                  className={`${fieldCls} appearance-none`}>
                  <option value="" className="bg-[#0a0a0a]">All schools (global)</option>
                  {schools.map(s => <option key={s.id} value={s.id} className="bg-[#0a0a0a]">{s.name}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className={labelCls}>Program (optional)</label>
              <select value={form.program_id} onChange={e => set('program_id', e.target.value)}
                className={`${fieldCls} appearance-none`}>
                <option value="" className="bg-[#0a0a0a]">No specific program</option>
                {programs.map(p => <option key={p.id} value={p.id} className="bg-[#0a0a0a]">{p.name}</option>)}
              </select>
            </div>
          </div>

          {isEdit && (
            <div>
              <label className={labelCls}>Status</label>
              <select value={form.status} onChange={e => set('status', e.target.value as LiveSession['status'])}
                className={`${fieldCls} appearance-none`}>
                <option value="scheduled" className="bg-[#0a0a0a]">Scheduled</option>
                <option value="live" className="bg-[#0a0a0a]">Live</option>
                <option value="completed" className="bg-[#0a0a0a]">Completed</option>
                <option value="cancelled" className="bg-[#0a0a0a]">Cancelled</option>
              </select>
            </div>
          )}

          <div>
            <label className={labelCls}>Recording URL (optional)</label>
            <input type="url" value={form.recording_url} onChange={e => set('recording_url', e.target.value)}
              placeholder="https://drive.google.com/..." className={fieldCls} />
          </div>

          <div>
            <label className={labelCls}>Notes (optional)</label>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)}
              placeholder="Pre-session preparation, materials, links…"
              rows={3} className={`${fieldCls} resize-none`} />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-4 px-8 py-6 border-t border-white/5 bg-white/[0.01] flex-shrink-0">
          <button onClick={onClose} disabled={saving}
            className="px-6 py-3 text-[10px] font-black uppercase tracking-widest text-white/30 hover:text-white transition-colors disabled:opacity-50">
            Cancel
          </button>
          <button onClick={() => onSave(form)}
            disabled={saving || !form.title.trim() || !form.scheduled_date || !form.scheduled_time}
            className="px-8 py-3 bg-orange-600 hover:bg-orange-500 text-white text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-40 flex items-center gap-3">
            {saving ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <PlusIcon className="w-4 h-4" />}
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Schedule Session'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState({ tab, canManage, onAdd }: { tab: FilterTab; canManage: boolean; onAdd: () => void }) {
  const messages: Record<FilterTab, { title: string; sub: string }> = {
    upcoming: { title: 'No Uplinks Scheduled', sub: 'Live and scheduled broadcast sessions will appear here.' },
    past:     { title: 'No Past Sessions',    sub: 'Completed and cancelled sessions will appear here.' },
    all:      { title: 'Broadcast Grid Empty', sub: 'Be the first to schedule a live session for your students.' },
  };
  const { title, sub } = messages[tab];
  return (
    <div className="flex flex-col items-center justify-center py-32 gap-6 bg-[#0a0a0a] border border-white/5">
      <div className="w-20 h-20 bg-white/[0.02] border border-white/5 flex items-center justify-center">
        <VideoCameraIcon className="w-10 h-10 text-white/10" />
      </div>
      <div className="text-center space-y-2">
        <p className="text-sm font-black text-white/20 uppercase tracking-[0.4em]">{title}</p>
        <p className="text-xs text-white/10 font-medium max-w-xs">{sub}</p>
      </div>
      {canManage && (
        <button onClick={onAdd}
          className="flex items-center gap-3 px-8 py-4 bg-orange-600 hover:bg-orange-500 text-white text-[10px] font-black uppercase tracking-widest transition-all">
          <PlusIcon className="w-4 h-4" /> Schedule Session
        </button>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function LiveSessionsPage() {
  const { profile, loading: authLoading } = useAuth();
  const [sessions, setSessions]   = useState<LiveSession[]>([]);
  const [schools, setSchools]     = useState<School[]>([]);
  const [programs, setPrograms]   = useState<Program[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [filter, setFilter]       = useState<FilterTab>('upcoming');
  const [showModal, setShowModal] = useState(false);
  const [editingSession, setEditingSession] = useState<LiveSession | null>(null);
  const [modalForm, setModalForm] = useState<SessionForm>(blankForm());
  const [modalError, setModalError] = useState<string | null>(null);
  const [saving, setSaving]       = useState(false);

  const canManage = profile?.role === 'admin' || profile?.role === 'teacher';
  const isAdmin   = profile?.role === 'admin';

  const [pollsSession, setPollsSession] = useState<LiveSession | null>(null);
  const [roomsSession, setRoomsSession] = useState<LiveSession | null>(null);

  const loadData = useCallback(async () => {
    if (!profile) return;
    setLoading(true); setError(null);
    try {
      const supabase = createClient();
      let query = supabase.from('live_sessions').select('*, program:programs(name)').order('scheduled_at', { ascending: true });
      if (profile.role === 'school' && profile.school_id) query = query.or(`school_id.eq.${profile.school_id},school_id.is.null`);
      if (profile.role === 'student' && profile.school_id) query = query.or(`school_id.eq.${profile.school_id},school_id.is.null`);
      const { data: rawSessions, error: sessErr } = await query;
      if (sessErr) throw sessErr;
      const rows = (rawSessions ?? []) as unknown as LiveSession[];
      const hostIds = [...new Set(rows.map(r => r.host_id).filter(Boolean))];
      let hostsMap: Record<string, { full_name: string; role: string }> = {};
      if (hostIds.length > 0) {
        const { data: hosts } = await supabase.from('portal_users').select('id, full_name, role').in('id', hostIds);
        if (hosts) hosts.forEach(h => { hostsMap[h.id] = { full_name: h.full_name, role: h.role }; });
      }
      setSessions(rows.map(r => ({ ...r, host: hostsMap[r.host_id] ?? undefined })));
      if (isAdmin) {
        const { data: sc } = await supabase.from('schools').select('id, name').order('name');
        setSchools(sc ?? []);
      }
      const { data: progs } = await supabase.from('programs').select('id, name').order('name');
      setPrograms(progs ?? []);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load sessions');
    } finally {
      setLoading(false);
    }
  }, [profile?.id, isAdmin]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (authLoading || !profile) return;
    loadData();

    // ── Supabase Realtime Logic ──
    const db = createClient();
    const sub = db
      .channel('live_sessions_changes')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'live_sessions' 
      }, (payload) => {
        // Incrementally update session data without full reload if possible
        if (payload.eventType === 'UPDATE') {
          setSessions(prev => prev.map(s => 
            s.id === payload.new.id ? { ...s, ...payload.new } : s
          ));
        } else if (payload.eventType === 'INSERT') {
          // INSERT might need a reload for host/program relations
          loadData();
        } else if (payload.eventType === 'DELETE') {
          setSessions(prev => prev.filter(s => s.id !== payload.old.id));
        }
      })
      .subscribe();

    return () => { db.removeChannel(sub); };
  }, [authLoading, profile?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = sessions.filter(s => {
    if (filter === 'upcoming') return s.status === 'scheduled' || s.status === 'live';
    if (filter === 'past')     return s.status === 'completed' || s.status === 'cancelled';
    return true;
  });

  function openCreate() {
    setEditingSession(null); setModalForm(blankForm()); setModalError(null); setShowModal(true);
  }

  function openEdit(s: LiveSession) {
    const d = new Date(s.scheduled_at);
    const pad = (n: number) => String(n).padStart(2, '0');
    setEditingSession(s);
    setModalForm({
      title: s.title, description: s.description ?? '', platform: s.platform,
      session_url: s.session_url ?? '',
      scheduled_date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
      scheduled_time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
      duration_minutes: s.duration_minutes, school_id: s.school_id ?? '', program_id: s.program_id ?? '',
      status: s.status, recording_url: s.recording_url ?? '', notes: s.notes ?? '',
    });
    setModalError(null); setShowModal(true);
  }

  async function handleSave(form: SessionForm) {
    if (!profile) return;
    setSaving(true); setModalError(null);
    try {
      const scheduled_at = new Date(`${form.scheduled_date}T${form.scheduled_time}`).toISOString();
      const payload = {
        title: form.title.trim(), description: form.description.trim() || null,
        platform: form.platform, session_url: form.session_url.trim() || null,
        scheduled_at, duration_minutes: Number(form.duration_minutes),
        school_id: form.school_id || null, program_id: form.program_id || null,
        status: form.status, recording_url: form.recording_url.trim() || null,
        notes: form.notes.trim() || null,
      };
      if (editingSession) {
        const res = await fetch(`/api/live-sessions/${editingSession.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (!res.ok) { const j = await res.json(); throw new Error(j.error || 'Failed to save'); }
      } else {
        const res = await fetch('/api/live-sessions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (!res.ok) { const j = await res.json(); throw new Error(j.error || 'Failed to save'); }
      }
      setShowModal(false); await loadData();
    } catch (err: any) {
      setModalError(err?.message ?? 'Failed to save session');
    } finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this live session? This action cannot be undone.')) return;
    try {
      const res = await fetch(`/api/live-sessions/${id}`, { method: 'DELETE' });
      if (!res.ok) { const j = await res.json(); throw new Error(j.error || 'Failed to delete'); }
      // Removal is handled by realtime subscription
    } catch (err: any) { alert(err?.message ?? 'Failed to delete session'); }
  }

  async function handleJoin(id: string, url: string) {
    // 1. Log join attempt (Logic Improvement)
    try {
      await fetch(`/api/live-sessions/${id}/join`, { method: 'POST' });
    } catch (e) {
      console.error('Silent error recording join:', e);
    }
    // 2. Proceed to platform
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-orange-600 border-t-transparent animate-spin" />
      </div>
    );
  }

  const liveSessions = sessions.filter(s => s.status === 'live');
  const upcomingCount = sessions.filter(s => s.status === 'scheduled' || s.status === 'live').length;
  const pastCount     = sessions.filter(s => s.status === 'completed' || s.status === 'cancelled').length;

  const TABS: { key: FilterTab; label: string; count: number }[] = [
    { key: 'upcoming', label: 'Upcoming', count: upcomingCount },
    { key: 'past',     label: 'Archive',  count: pastCount },
    { key: 'all',      label: 'All',      count: sessions.length },
  ];

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white selection:bg-orange-600/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">

        {/* ── Header ── */}
        <div className="relative bg-[#0a0a0a] border border-white/5 p-8 sm:p-14 overflow-hidden flex flex-col sm:flex-row sm:items-center justify-between gap-8 group">
          <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-orange-600/5 blur-[120px] -mr-48 -mt-48 pointer-events-none group-hover:bg-orange-600/8 transition-all duration-1000" />
          
          <div className="relative z-10 space-y-5">
            <div className="flex items-center gap-4">
              <div className="px-4 py-1.5 bg-orange-600/10 border border-orange-600/20 text-orange-500 text-[9px] font-black uppercase tracking-[0.4em]">
                Sector: Broadcast
              </div>
              {liveSessions.length > 0 && (
                <div className="flex items-center gap-2 px-4 py-1.5 bg-emerald-500/10 border border-emerald-500/30">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
                  </span>
                  <span className="text-emerald-400 text-[9px] font-black uppercase tracking-widest">
                    {liveSessions.length} Session{liveSessions.length !== 1 ? 's' : ''} Live
                  </span>
                </div>
              )}
            </div>
            <div>
              <h1 className="text-3xl sm:text-4xl font-black tracking-tighter leading-[0.9] italic">
                Live<br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-600 via-orange-500 to-amber-500">Sessions.</span>
              </h1>
              <p className="text-sm text-white/30 font-medium mt-4 max-w-sm leading-relaxed">
                {canManage
                  ? 'Schedule and broadcast live video sessions across all academic sectors.'
                  : 'Join live sessions and access recordings from your instructors.'}
              </p>
            </div>
          </div>

          <div className="relative z-10 flex flex-col gap-4 sm:items-end">
            {/* Stat cards */}
            <div className="grid grid-cols-3 sm:grid-cols-1 gap-3 sm:w-40">
              {[
                { label: 'Total', value: sessions.length, color: 'text-white' },
                { label: 'Upcoming', value: upcomingCount, color: 'text-orange-400' },
                { label: 'Live Now', value: liveSessions.length, color: 'text-emerald-400' },
              ].map(stat => (
                <div key={stat.label} className="bg-white/[0.02] border border-white/5 p-4 sm:p-5 sm:flex sm:items-center sm:justify-between">
                  <p className={`text-lg sm:text-2xl font-black ${stat.color}`}>{stat.value}</p>
                  <p className="text-[8px] font-black text-white/20 uppercase tracking-widest mt-0.5">{stat.label}</p>
                </div>
              ))}
            </div>

            {canManage && (
              <button onClick={openCreate}
                className="flex items-center gap-3 px-8 py-4 bg-orange-600 hover:bg-orange-500 text-white text-[10px] font-black uppercase tracking-widest transition-all shadow-xl shadow-orange-600/20 active:scale-95">
                <PlusIcon className="w-4 h-4" /> Schedule Session
              </button>
            )}
          </div>
        </div>

        {/* ── Error ── */}
        {error && (
          <div className="px-6 py-4 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-black uppercase tracking-widest">
            {error}
          </div>
        )}

        {/* ── Live Banner ── */}
        {filter !== 'past' && liveSessions.length > 0 && (
          <div className="flex items-center gap-6 px-8 py-5 bg-emerald-500/5 border border-emerald-500/20">
            <div className="w-10 h-10 bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
              <SignalIcon className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <p className="text-[11px] font-black text-emerald-400 uppercase tracking-widest">Broadcast Active</p>
              <p className="text-[9px] font-bold text-emerald-500/50 uppercase tracking-[0.2em] mt-0.5">
                {liveSessions.length} live session{liveSessions.length !== 1 ? 's' : ''} in progress — join now
              </p>
            </div>
            <ArrowRightIcon className="w-4 h-4 text-emerald-400 ml-auto" />
          </div>
        )}

        {/* ── Filter Tabs ── */}
        <div className="flex items-center gap-1 bg-white/[0.02] border border-white/5 p-1.5 w-fit">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setFilter(t.key)}
              className={`flex items-center gap-3 px-6 py-3 text-[10px] font-black uppercase tracking-widest transition-all ${
                filter === t.key
                  ? 'bg-orange-600 text-white shadow-lg shadow-orange-600/20'
                  : 'text-white/30 hover:text-white hover:bg-white/5'
              }`}
            >
              {t.label}
              {t.count > 0 && (
                <span className={`text-[8px] font-black px-2 py-0.5 ${filter === t.key ? 'bg-white/20 text-white' : 'bg-white/5 text-white/30'}`}>
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── Session Grid ── */}
        {filtered.length === 0 ? (
          <EmptyState tab={filter} canManage={canManage} onAdd={openCreate} />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(s => (
              <SessionCard
                key={s.id}
                session={s}
                canManage={canManage && (isAdmin || s.host_id === profile?.id)}
                onEdit={openEdit}
                onDelete={handleDelete}
                onJoin={handleJoin}
                onPolls={setPollsSession}
                onRooms={setRoomsSession}
              />
            ))}
          </div>
        )}

      </div>

      {/* ── Modal ── */}
      {showModal && (
        <SessionModal
          initial={modalForm} isEdit={!!editingSession}
          schools={schools} programs={programs}
          isAdmin={isAdmin} saving={saving} error={modalError}
          onClose={() => setShowModal(false)} onSave={handleSave}
        />
      )}

      {/* ── Polls Modal ── */}
      {pollsSession && (
        <PollsModal
          session={pollsSession}
          canManage={canManage}
          userId={profile?.id ?? ''}
          onClose={() => setPollsSession(null)}
        />
      )}

      {/* ── Breakout Rooms Modal ── */}
      {roomsSession && (
        <RoomsModal
          session={roomsSession}
          canManage={canManage}
          onClose={() => setRoomsSession(null)}
        />
      )}
    </div>
  );
}
