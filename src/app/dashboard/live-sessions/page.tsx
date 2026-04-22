// @refresh reset
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Room,
  RoomEvent,
  Track,
} from 'livekit-client';

// Dynamic import — loads LiveKit CSS only on client, avoids SSR flash
const LiveKitMeeting = dynamic(
  () => import('@/components/live-session/LiveKitMeeting'),
  { ssr: false, loading: () => (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#0a0a0a]">
      <div className="w-10 h-10 border-4 border-emerald-600 border-t-transparent animate-spin" />
    </div>
  )},
);
import {
  VideoCameraIcon, CalendarDaysIcon, ClockIcon, PencilIcon, TrashIcon,
  PlusIcon, XMarkIcon, LinkIcon, SignalIcon, FilmIcon, UserCircleIcon,
  ArrowRightIcon, UsersIcon, CheckCircleIcon, ChartBarIcon, PlayIcon, EyeIcon,
  XCircleIcon as StopCircleIcon, ChatBubbleLeftEllipsisIcon,
} from '@/lib/icons';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isJitsiUrl(url?: string | null) { return !!url && url.includes('meet.jit.si'); }
function isLiveKitUrl(url?: string | null) { return !!url && url.startsWith('livekit:'); }

function getYouTubeId(url: string) {
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}
function getVimeoId(url: string) {
  const m = url.match(/vimeo\.com\/(\d+)/); return m ? m[1] : null;
}
function getRecordingType(url: string): 'youtube' | 'vimeo' | 'video' | 'link' {
  if (getYouTubeId(url)) return 'youtube';
  if (getVimeoId(url)) return 'vimeo';
  if (/\.(mp4|webm|ogg|mov)(\?|$)/i.test(url)) return 'video';
  return 'link';
}
function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
    year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
  });
}
function formatDuration(mins: number) {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60), m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}
function getCountdown(iso: string) {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0 || diff > 24 * 60 * 60 * 1000) return null;
  const totalMins = Math.floor(diff / 60000);
  const hrs = Math.floor(totalMins / 60), mins = totalMins % 60;
  return hrs > 0 ? `In ${hrs}h ${mins}m` : `In ${mins}m`;
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

// ─── Types ────────────────────────────────────────────────────────────────────

interface LiveSession {
  id: string; title: string; description: string | null;
  host_id: string; school_id: string | null; program_id: string | null;
  session_url: string | null;
  platform: 'zoom' | 'google_meet' | 'teams' | 'discord' | 'other';
  scheduled_at: string; duration_minutes: number;
  status: 'scheduled' | 'live' | 'completed' | 'cancelled';
  recording_url: string | null; notes: string | null; created_at: string;
  host?: { full_name: string; role: string };
  program?: { name: string };
}
interface School { id: string; name: string; }
interface Program { id: string; name: string; }
interface SessionForm {
  title: string; description: string;
  platform: 'zoom' | 'google_meet' | 'teams' | 'discord' | 'other';
  session_url: string; scheduled_date: string; scheduled_time: string;
  duration_minutes: number; school_id: string; program_id: string;
  status: 'scheduled' | 'live' | 'completed' | 'cancelled';
  recording_url: string; notes: string;
}
type FilterTab = 'upcoming' | 'past' | 'all';

// ─── Config ───────────────────────────────────────────────────────────────────

const PLATFORM_CONFIG: Record<LiveSession['platform'] | 'jitsi', {
  label: string; textClass: string; bgClass: string; borderClass: string; dot: string;
}> = {
  zoom:        { label: 'Zoom',        textClass: 'text-blue-400',    bgClass: 'bg-blue-500/10',    borderClass: 'border-blue-500/30',    dot: 'bg-blue-400' },
  google_meet: { label: 'Google Meet', textClass: 'text-emerald-400', bgClass: 'bg-emerald-500/10', borderClass: 'border-emerald-500/30', dot: 'bg-emerald-400' },
  teams:       { label: 'Teams',       textClass: 'text-purple-400',  bgClass: 'bg-purple-500/10',  borderClass: 'border-purple-500/30',  dot: 'bg-purple-400' },
  discord:     { label: 'Discord',     textClass: 'text-indigo-400',  bgClass: 'bg-indigo-500/10',  borderClass: 'border-indigo-500/30',  dot: 'bg-indigo-400' },
  jitsi:       { label: 'In-App',      textClass: 'text-orange-400',  bgClass: 'bg-orange-500/10',  borderClass: 'border-orange-500/30',  dot: 'bg-orange-400' },
  other:       { label: 'Other',       textClass: 'text-white/40',    bgClass: 'bg-white/5',        borderClass: 'border-white/10',       dot: 'bg-white/30' },
};
const STATUS_CONFIG: Record<LiveSession['status'], {
  label: string; textClass: string; bgClass: string; borderClass: string; pulse?: boolean;
}> = {
  scheduled: { label: 'Scheduled', textClass: 'text-amber-400',   bgClass: 'bg-amber-500/10',   borderClass: 'border-amber-500/30' },
  live:      { label: 'LIVE',      textClass: 'text-emerald-300', bgClass: 'bg-emerald-500/15', borderClass: 'border-emerald-400/40', pulse: true },
  completed: { label: 'Completed', textClass: 'text-blue-400',    bgClass: 'bg-blue-500/10',    borderClass: 'border-blue-500/30' },
  cancelled: { label: 'Cancelled', textClass: 'text-rose-400',    bgClass: 'bg-rose-500/10',    borderClass: 'border-rose-500/30' },
};

// ─── Polls Modal ──────────────────────────────────────────────────────────────

function PollsModal({ session, canManage, userId, onClose }: {
  session: LiveSession; canManage: boolean; userId: string; onClose: () => void;
}) {
  const [polls, setPolls] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [voted, setVoted] = useState<Record<string, string[]>>({});
  const [form, setForm] = useState({ question: '', type: 'poll' as 'poll' | 'quiz', options: ['', '', '', ''] });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/live-sessions/${session.id}/polls`);
      const j = await res.json();
      const data = j.data ?? [];
      setPolls(data);
      // normalise: each poll may return options at top-level or nested
      const alreadyVoted: Record<string, string[]> = {};
      data.forEach((p: any) => {
        const opts: any[] = p.options ?? p.live_session_poll_options ?? [];
        // pre-populate voted state from any option the current user responded to
        // (server returns response_count but not per-user; we track locally)
        if (voted[p.id]) alreadyVoted[p.id] = voted[p.id];
      });
      setVoted(prev => ({ ...alreadyVoted, ...prev }));
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [session.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

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

  const togglePollStatus = async (pollId: string, current: string) => {
    const next = current === 'draft' ? 'live' : current === 'live' ? 'closed' : 'draft';
    setSubmitting(pollId + '_status');
    try {
      await fetch(`/api/live-sessions/${session.id}/polls/${pollId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });
      await load();
    } catch { /* silent */ }
    finally { setSubmitting(null); }
  };

  const deletePoll = async (pollId: string) => {
    if (!confirm('Delete this poll?')) return;
    setSubmitting(pollId + '_del');
    try {
      await fetch(`/api/live-sessions/${session.id}/polls/${pollId}`, { method: 'DELETE' });
      await load();
    } catch { /* silent */ }
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
    } catch { /* silent */ }
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
            <div className="flex justify-center py-10">
              <div className="w-7 h-7 border-4 border-orange-600 border-t-transparent animate-spin" />
            </div>
          ) : polls.length === 0 && !creating ? (
            <div className="text-center py-12 space-y-2">
              <ChartBarIcon className="w-10 h-10 text-white/10 mx-auto" />
              <p className="text-white/20 text-xs font-bold uppercase tracking-widest">No polls yet</p>
            </div>
          ) : polls.map((poll: any) => {
            const options: any[] = poll.options ?? poll.live_session_poll_options ?? [];
            const total = options.reduce((s: number, o: any) => s + (o.response_count ?? 0), 0);
            const hasVoted = !!voted[poll.id];
            const statusColors: Record<string, string> = {
              draft: 'text-white/30 border-white/10',
              live: 'text-emerald-400 border-emerald-500/30',
              closed: 'text-white/20 border-white/5',
            };
            return (
              <div key={poll.id} className="bg-white/[0.02] border border-white/[0.06] p-5 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-black text-white">{poll.question}</p>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-1 border ${statusColors[poll.status] ?? statusColors.draft}`}>
                      {poll.status}
                    </span>
                    {canManage && (
                      <>
                        {poll.status !== 'closed' && (
                          <button
                            onClick={() => togglePollStatus(poll.id, poll.status)}
                            disabled={!!submitting}
                            className="p-1.5 bg-white/5 hover:bg-emerald-600/20 border border-white/10 hover:border-emerald-500/30 text-white/30 hover:text-emerald-400 transition-all"
                            title={poll.status === 'draft' ? 'Go Live' : 'Close Poll'}
                          >
                            <PlayIcon className="w-3 h-3" />
                          </button>
                        )}
                        <button
                          onClick={() => deletePoll(poll.id)}
                          disabled={!!submitting}
                          className="p-1.5 bg-white/5 hover:bg-rose-600/20 border border-white/10 hover:border-rose-500/30 text-white/30 hover:text-rose-400 transition-all"
                        >
                          <TrashIcon className="w-3 h-3" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  {options.map((opt: any) => {
                    const pct = total > 0 ? Math.round((opt.response_count ?? 0) / total * 100) : 0;
                    const isMyVote = voted[poll.id]?.includes(opt.id);
                    const canVote = poll.status === 'live' && !hasVoted;
                    return (
                      <button
                        key={opt.id}
                        disabled={!canVote || !!submitting}
                        onClick={() => canVote && vote(poll.id, opt.id)}
                        className={`w-full text-left relative overflow-hidden border transition-all py-3 px-4
                          ${isMyVote ? 'border-orange-500/50 bg-orange-500/10' : 'border-white/[0.06] hover:border-white/20 hover:bg-white/[0.03]'}
                          ${!canVote ? 'cursor-default' : 'cursor-pointer'}`}
                      >
                        {(hasVoted || canManage) && (
                          <div className="absolute left-0 top-0 bottom-0 bg-white/[0.04] transition-all" style={{ width: `${pct}%` }} />
                        )}
                        <div className="relative flex items-center justify-between gap-3">
                          <span className="text-xs font-bold text-white">{opt.option_text ?? opt.text}</span>
                          {(hasVoted || canManage) && (
                            <span className="text-[10px] font-black text-white/40">{pct}%</span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
                {(hasVoted || canManage) && (
                  <p className="text-[10px] text-white/30 font-bold">{total} response{total !== 1 ? 's' : ''}</p>
                )}
                {poll.status === 'live' && !hasVoted && !canManage && (
                  <p className="text-[10px] text-emerald-400/60 font-bold uppercase tracking-widest">Click an option to vote</p>
                )}
              </div>
            );
          })}

          {creating && (
            <div className="bg-white/[0.02] border border-white/10 p-5 space-y-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-white/40">New Poll</p>
              <input
                value={form.question}
                onChange={e => setForm(f => ({ ...f, question: e.target.value }))}
                placeholder="Ask a question…"
                className="w-full px-4 py-2.5 bg-white/[0.03] border border-white/10 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-orange-500 transition-all"
              />
              <select
                value={form.type}
                onChange={e => setForm(f => ({ ...f, type: e.target.value as any }))}
                className="px-3 py-2 bg-white/[0.03] border border-white/10 text-xs text-white/60 focus:outline-none focus:border-orange-500"
              >
                <option value="poll" className="bg-[#0d0d0d]">Poll</option>
                <option value="quiz" className="bg-[#0d0d0d]">Quiz</option>
              </select>
              <div className="space-y-2">
                {form.options.map((opt, i) => (
                  <input
                    key={i}
                    value={opt}
                    onChange={e => setForm(f => { const o = [...f.options]; o[i] = e.target.value; return { ...f, options: o }; })}
                    placeholder={`Option ${i + 1}${i < 2 ? ' *' : ''}`}
                    className="w-full px-3 py-2 bg-white/[0.03] border border-white/10 text-xs text-white placeholder:text-white/20 focus:outline-none focus:border-orange-500 transition-all"
                  />
                ))}
              </div>
              <div className="flex gap-3 pt-1">
                <button onClick={() => setCreating(false)} className="flex-1 py-2.5 text-xs font-bold text-white/30 hover:text-white border border-white/10 transition-all">Cancel</button>
                <button
                  onClick={createPoll}
                  disabled={!!submitting}
                  className="flex-1 py-2.5 text-xs font-black bg-orange-600 hover:bg-orange-500 text-white transition-all disabled:opacity-50"
                >
                  {submitting === 'create' ? 'Creating…' : 'Create Poll'}
                </button>
              </div>
            </div>
          )}
        </div>

        {canManage && !creating && (
          <div className="p-4 border-t border-white/[0.06] flex-shrink-0">
            <button
              onClick={() => setCreating(true)}
              className="w-full flex items-center justify-center gap-2 py-3 bg-orange-600 hover:bg-orange-500 text-white text-xs font-black uppercase tracking-widest transition-all"
            >
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
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', maxParticipants: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/live-sessions/${session.id}/breakout-rooms`);
      const j = await res.json();
      setRooms(j.data ?? []);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [session.id]);

  useEffect(() => { load(); }, [load]);

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
    } catch { /* silent */ }
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
            <div className="flex justify-center py-10">
              <div className="w-7 h-7 border-4 border-purple-600 border-t-transparent animate-spin" />
            </div>
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
                <span className={`inline-block text-[9px] font-black uppercase tracking-widest px-2 py-0.5 border ${room.status === 'active' ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' : 'text-white/20 border-white/5'}`}>
                  {room.status}
                </span>
              </div>
              {room.status === 'active' && (
                <button
                  onClick={() => joinRoom(room.id)}
                  disabled={!!joining}
                  className="flex items-center gap-2 px-4 py-2.5 bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/30 text-purple-400 text-xs font-black uppercase tracking-widest transition-all disabled:opacity-50"
                >
                  {joining === room.id
                    ? <div className="w-3.5 h-3.5 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
                    : <CheckCircleIcon className="w-3.5 h-3.5" />}
                  Join
                </button>
              )}
            </div>
          ))}

          {creating && (
            <div className="bg-white/[0.02] border border-white/10 p-5 space-y-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-white/40">New Room</p>
              <input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Room name (e.g. Group A)"
                className="w-full px-4 py-2.5 bg-white/[0.03] border border-white/10 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-purple-500 transition-all"
              />
              <input
                type="number"
                value={form.maxParticipants}
                onChange={e => setForm(f => ({ ...f, maxParticipants: e.target.value }))}
                placeholder="Max participants (optional)"
                className="w-full px-4 py-2.5 bg-white/[0.03] border border-white/10 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-purple-500 transition-all"
              />
              <div className="flex gap-3">
                <button onClick={() => setCreating(false)} className="flex-1 py-2.5 text-xs font-bold text-white/30 hover:text-white border border-white/10 transition-all">Cancel</button>
                <button
                  onClick={createRoom}
                  disabled={saving}
                  className="flex-1 py-2.5 text-xs font-black bg-purple-600 hover:bg-purple-500 text-white transition-all disabled:opacity-50"
                >
                  {saving ? 'Creating…' : 'Create Room'}
                </button>
              </div>
            </div>
          )}
        </div>

        {canManage && !creating && (
          <div className="p-4 border-t border-white/[0.06] flex-shrink-0">
            <button
              onClick={() => setCreating(true)}
              className="w-full flex items-center justify-center gap-2 py-3 bg-purple-600 hover:bg-purple-500 text-white text-xs font-black uppercase tracking-widest transition-all"
            >
              <PlusIcon className="w-4 h-4" /> Add Room
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Attendance Modal ─────────────────────────────────────────────────────────

function AttendanceModal({ session, onClose }: { session: LiveSession; onClose: () => void }) {
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/live-sessions/${session.id}/attendance`);
        const j = await res.json();
        setRecords(j.data ?? []);
      } catch { /* silent */ }
      finally { setLoading(false); }
    })();
  }, [session.id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-[#0d0d0d] border border-white/10 w-full max-w-lg max-h-[85vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/[0.06] flex-shrink-0">
          <div className="flex items-center gap-3">
            <EyeIcon className="w-5 h-5 text-blue-400" />
            <div>
              <p className="text-sm font-black text-white uppercase tracking-widest">Attendance</p>
              <p className="text-[10px] text-white/30 mt-0.5 truncate max-w-[260px]">{session.title}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 bg-white/5 hover:bg-white/10 text-white/40 hover:text-white transition-all">
            <XMarkIcon className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {loading ? (
            <div className="flex justify-center py-10">
              <div className="w-7 h-7 border-4 border-blue-600 border-t-transparent animate-spin" />
            </div>
          ) : records.length === 0 ? (
            <div className="text-center py-12 space-y-2">
              <UsersIcon className="w-10 h-10 text-white/10 mx-auto" />
              <p className="text-white/20 text-xs font-bold uppercase tracking-widest">No attendance recorded</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between px-1 pb-2 border-b border-white/5">
                <p className="text-[9px] font-black text-white/30 uppercase tracking-widest">
                  {records.length} attendee{records.length !== 1 ? 's' : ''}
                </p>
              </div>
              {records.map((r: any) => {
                const user = Array.isArray(r.portal_users) ? r.portal_users[0] : r.portal_users;
                const name = user?.full_name ?? 'Unknown';
                const role = user?.role ?? '';
                const joined = r.joined_at ? new Date(r.joined_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : '—';
                const left = r.left_at ? new Date(r.left_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : '—';
                const dur = r.duration_minutes != null ? formatDuration(r.duration_minutes) : '—';
                return (
                  <div key={r.id} className="flex items-center justify-between gap-4 px-4 py-3 bg-white/[0.02] border border-white/[0.05]">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-blue-600/10 border border-blue-500/20 flex items-center justify-center flex-shrink-0">
                        <UserCircleIcon className="w-4 h-4 text-blue-400" />
                      </div>
                      <div>
                        <p className="text-xs font-black text-white">{name}</p>
                        <p className="text-[9px] font-bold text-white/30 uppercase tracking-widest">{role}</p>
                      </div>
                    </div>
                    <div className="text-right space-y-0.5">
                      <p className="text-[10px] text-white/50 font-bold">
                        {joined} → {left}
                      </p>
                      <p className="text-[9px] text-blue-400/70 font-black uppercase tracking-widest">{dur}</p>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Live Q&A Modal ───────────────────────────────────────────────────────────

function QAModal({ session, canManage, userId, onClose }: {
  session: LiveSession; canManage: boolean; userId: string; onClose: () => void;
}) {
  const [questions, setQuestions] = useState<any[]>([]);
  const [loading, setLoading]     = useState(true);
  const [input, setInput]         = useState('');
  const [sending, setSending]     = useState(false);
  const [answering, setAnswering] = useState<string | null>(null);
  const [answerText, setAnswerText] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const supabase  = createClient();

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/live-sessions/${session.id}/questions`);
      const j   = await res.json();
      setQuestions(j.data ?? []);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [session.id]);

  useEffect(() => { load(); }, [load]);

  // Realtime — new questions appear instantly
  useEffect(() => {
    const ch = supabase
      .channel(`qa_${session.id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'live_session_questions',
        filter: `session_id=eq.${session.id}`,
      }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [session.id, load]); // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [questions.length]);

  const submit = async () => {
    if (!input.trim() || sending) return;
    setSending(true);
    try {
      await fetch(`/api/live-sessions/${session.id}/questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: input.trim() }),
      });
      setInput('');
    } catch { /* silent */ }
    finally { setSending(false); }
  };

  const answer = async (qid: string) => {
    if (!answerText.trim()) return;
    try {
      await fetch(`/api/live-sessions/${session.id}/questions/${qid}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'answer', answer: answerText.trim() }),
      });
      setAnswering(null); setAnswerText('');
    } catch { /* silent */ }
  };

  const upvote = async (qid: string) => {
    await fetch(`/api/live-sessions/${session.id}/questions/${qid}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'upvote' }),
    });
    load();
  };

  const remove = async (qid: string) => {
    await fetch(`/api/live-sessions/${session.id}/questions/${qid}`, { method: 'DELETE' });
    load();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-[#0d0d0d] border border-white/10 w-full max-w-lg max-h-[85vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/[0.06] flex-shrink-0">
          <div className="flex items-center gap-3">
            <ChatBubbleLeftEllipsisIcon className="w-5 h-5 text-orange-400" />
            <div>
              <p className="text-sm font-black text-white uppercase tracking-widest">Live Q&A</p>
              <p className="text-[10px] text-white/30 mt-0.5 truncate max-w-[260px]">{session.title}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 bg-white/5 hover:bg-white/10 text-white/40 hover:text-white transition-all">
            <XMarkIcon className="w-4 h-4" />
          </button>
        </div>

        {/* Questions list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading ? (
            <div className="flex justify-center py-10">
              <div className="w-7 h-7 border-4 border-orange-600 border-t-transparent animate-spin" />
            </div>
          ) : questions.length === 0 ? (
            <div className="text-center py-12 space-y-2">
              <ChatBubbleLeftEllipsisIcon className="w-10 h-10 text-white/10 mx-auto" />
              <p className="text-white/20 text-xs font-bold uppercase tracking-widest">No questions yet</p>
              <p className="text-white/10 text-[10px]">Be the first to ask something</p>
            </div>
          ) : questions.map((q: any) => {
            const user = Array.isArray(q.portal_users) ? q.portal_users[0] : q.portal_users;
            const isOwn = q.user_id === userId;
            return (
              <div key={q.id} className={`p-4 border space-y-2 ${q.answered ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-white/[0.06] bg-white/[0.02]'}`}>
                {/* Question */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[9px] font-black text-white/40 uppercase tracking-widest">{user?.full_name ?? 'Student'}</span>
                      {q.answered && (
                        <span className="text-[8px] font-black text-emerald-400 uppercase tracking-widest px-1.5 py-0.5 bg-emerald-500/10 border border-emerald-500/20">Answered</span>
                      )}
                    </div>
                    <p className="text-sm text-white font-medium leading-relaxed">{q.body}</p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {/* Upvote */}
                    <button
                      onClick={() => upvote(q.id)}
                      className="flex items-center gap-1 px-2 py-1 bg-white/5 hover:bg-orange-600/20 border border-white/10 hover:border-orange-500/30 text-white/30 hover:text-orange-400 transition-all"
                    >
                      <span className="text-[10px] font-black">▲</span>
                      <span className="text-[10px] font-black">{q.upvotes ?? 0}</span>
                    </button>
                    {/* Delete (own or staff) */}
                    {(isOwn || canManage) && (
                      <button onClick={() => remove(q.id)} className="p-1.5 bg-white/5 hover:bg-rose-600/20 border border-white/10 hover:border-rose-500/30 text-white/20 hover:text-rose-400 transition-all">
                        <TrashIcon className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Answer */}
                {q.answered && q.answer && (
                  <div className="pl-3 border-l-2 border-emerald-500/40 mt-2">
                    <p className="text-[9px] font-black text-emerald-400/60 uppercase tracking-widest mb-1">Answer</p>
                    <p className="text-xs text-white/70 leading-relaxed">{q.answer}</p>
                  </div>
                )}

                {/* Answer input (staff only) */}
                {canManage && !q.answered && (
                  answering === q.id ? (
                    <div className="flex gap-2 mt-2">
                      <input
                        value={answerText}
                        onChange={e => setAnswerText(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && answer(q.id)}
                        placeholder="Type your answer…"
                        autoFocus
                        className="flex-1 px-3 py-2 bg-white/[0.03] border border-emerald-500/30 text-xs text-white placeholder:text-white/20 focus:outline-none focus:border-emerald-500 transition-all"
                      />
                      <button onClick={() => answer(q.id)} className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-black uppercase tracking-widest transition-all">
                        Answer
                      </button>
                      <button onClick={() => { setAnswering(null); setAnswerText(''); }} className="px-3 py-2 bg-white/5 border border-white/10 text-white/30 hover:text-white text-[10px] font-black transition-all">
                        ✕
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setAnswering(q.id); setAnswerText(''); }}
                      className="text-[9px] font-black text-emerald-400/50 hover:text-emerald-400 uppercase tracking-widest transition-colors"
                    >
                      + Answer this
                    </button>
                  )
                )}
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="p-4 border-t border-white/[0.06] flex-shrink-0">
          <div className="flex gap-2">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && submit()}
              placeholder={canManage ? 'Post an announcement or comment…' : 'Ask a question…'}
              className="flex-1 px-4 py-3 bg-white/[0.03] border border-white/10 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-orange-500 transition-all"
            />
            <button
              onClick={submit}
              disabled={sending || !input.trim()}
              className="px-5 py-3 bg-orange-600 hover:bg-orange-500 text-white text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-40"
            >
              {sending ? '…' : 'Send'}
            </button>
          </div>
          <p className="text-[9px] text-white/20 mt-2">Press Enter to send</p>
        </div>
      </div>
    </div>
  );
}

// ─── Recording Modal ──────────────────────────────────────────────────────────

function RecordingModal({ session, onClose }: { session: LiveSession; onClose: () => void }) {
  const url = session.recording_url!;
  const type = getRecordingType(url);
  const ytId = type === 'youtube' ? getYouTubeId(url) : null;
  const vmId = type === 'vimeo' ? getVimeoId(url) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm">
      <div className="bg-[#0d0d0d] border border-white/10 w-full max-w-3xl flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/[0.06] flex-shrink-0">
          <div className="flex items-center gap-3">
            <FilmIcon className="w-5 h-5 text-blue-400" />
            <div>
              <p className="text-sm font-black text-white uppercase tracking-widest">Recording</p>
              <p className="text-[10px] text-white/30 mt-0.5 truncate max-w-[400px]">{session.title}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 bg-white/5 hover:bg-white/10 text-white/40 hover:text-white transition-all">
            <XMarkIcon className="w-4 h-4" />
          </button>
        </div>
        <div className="p-6">
          {ytId ? (
            <div className="aspect-video w-full">
              <iframe
                src={`https://www.youtube.com/embed/${ytId}`}
                className="w-full h-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          ) : vmId ? (
            <div className="aspect-video w-full">
              <iframe
                src={`https://player.vimeo.com/video/${vmId}`}
                className="w-full h-full"
                allow="autoplay; fullscreen; picture-in-picture"
                allowFullScreen
              />
            </div>
          ) : type === 'video' ? (
            <video src={url} controls className="w-full max-h-[60vh] bg-black" />
          ) : (
            <div className="flex flex-col items-center gap-4 py-10">
              <FilmIcon className="w-12 h-12 text-white/20" />
              <p className="text-white/40 text-sm">Recording available at external link</p>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white text-xs font-black uppercase tracking-widest transition-all"
              >
                <LinkIcon className="w-4 h-4" /> Open Recording
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Session Card ─────────────────────────────────────────────────────────────

function SessionCard({ session, canManage, userId, onEdit, onDelete, onJoin, onStart, onEnd, onPolls, onRooms, onRecording, onAttendance, onQA }: {
  session: LiveSession; canManage: boolean; userId: string;
  onEdit: (s: LiveSession) => void; onDelete: (id: string) => void;
  onJoin: (id: string, url: string | null) => void;
  onStart: (s: LiveSession) => void;
  onEnd: (s: LiveSession) => void;
  onPolls: (s: LiveSession) => void;
  onRooms: (s: LiveSession) => void; onRecording: (s: LiveSession) => void;
  onAttendance: (s: LiveSession) => void;
  onQA: (s: LiveSession) => void;
}) {
  const isInApp = isJitsiUrl(session.session_url) || isLiveKitUrl(session.session_url) || (!session.session_url && session.platform === 'other');
  const platKey = (isJitsiUrl(session.session_url) || isLiveKitUrl(session.session_url)) ? 'jitsi' : session.platform;
  const platCfg = PLATFORM_CONFIG[platKey] ?? PLATFORM_CONFIG.other;
  const statusCfg = STATUS_CONFIG[session.status];
  const countdown = getCountdown(session.scheduled_at);
  const isLive = session.status === 'live';
  const isActive = session.status === 'scheduled' || isLive;
  // Show join if active — for Jitsi we don't need a URL (auto-generated on click)
  const showJoin = isActive && (!!session.session_url || isInApp);
  const showRecording = session.status === 'completed' && !!session.recording_url;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -5, scale: 1.01 }}
      className={`relative bg-card/40 backdrop-blur-md border flex flex-col gap-0 transition-all duration-500 overflow-hidden group
      ${isLive ? 'border-emerald-500/50 shadow-[0_0_50px_rgba(16,185,129,0.15)] ring-1 ring-emerald-500/20 z-10' : 'border-white/[0.08] hover:border-white/20 hover:shadow-2xl hover:shadow-black/50'}`}
    >
      {isLive && (
        <>
          <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-emerald-400 to-transparent animate-pulse" />
          <div className="absolute inset-0 bg-emerald-500/5 pointer-events-none" />
        </>
      )}

      <div className="p-6 flex flex-col gap-5 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className={`flex items-center gap-1.5 px-3 py-1 border text-[9px] font-black uppercase tracking-widest ${platCfg.textClass} ${platCfg.bgClass} ${platCfg.borderClass}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${platCfg.dot}`} />
              {platCfg.label}
            </div>
            <div className={`flex items-center gap-1.5 px-3 py-1 border text-[9px] font-black uppercase tracking-widest ${statusCfg.textClass} ${statusCfg.bgClass} ${statusCfg.borderClass}`}>
              {statusCfg.pulse && (
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
                </span>
              )}
              {statusCfg.label}
            </div>
            {countdown && (
              <div className="flex items-center gap-1.5 px-3 py-1 border border-amber-500/30 bg-amber-500/10 text-amber-400 text-[9px] font-black uppercase tracking-widest animate-pulse">
                <ClockIcon className="w-3 h-3" />
                {countdown}
              </div>
            )}
          </div>

          {canManage && (
            <div className="flex items-center gap-1.5 flex-shrink-0 transition-all duration-300">
              <button onClick={() => onEdit(session)} className="p-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-white/40 hover:text-white transition-all rounded-sm">
                <PencilIcon className="w-4 h-4" />
              </button>
              <button onClick={() => onDelete(session.id)} className="p-2.5 bg-white/5 hover:bg-rose-600/20 hover:border-rose-500/30 text-white/40 hover:text-rose-400 transition-all rounded-sm">
                <TrashIcon className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        <div className="space-y-3">
          <h3 className="text-lg font-black text-white uppercase tracking-tight leading-tight group-hover:text-orange-500 transition-colors duration-300">{session.title}</h3>
          {session.description && (
            <p className="text-xs text-white/40 font-medium leading-relaxed line-clamp-2 italic border-l border-white/10 pl-3">{session.description}</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-y-4 gap-x-2 border-t border-white/5 pt-5">
          <div className="flex items-center gap-3 text-white/30 group/meta">
            <div className="p-1.5 bg-orange-600/5 border border-orange-600/20 group-hover/meta:border-orange-600/40 transition-colors">
              <CalendarDaysIcon className="w-4 h-4 text-orange-600 flex-shrink-0" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-white/50">{formatDateTime(session.scheduled_at).split(',')[0]}</span>
          </div>
          <div className="flex items-center gap-3 text-white/30 group/meta">
            <div className="p-1.5 bg-orange-600/5 border border-orange-600/20 group-hover/meta:border-orange-600/40 transition-colors">
              <ClockIcon className="w-4 h-4 text-orange-600 flex-shrink-0" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-white/50">{session.duration_minutes}m</span>
          </div>
          {session.host && (
            <div className="col-span-2 flex items-center gap-3 text-white/30 group/meta">
              <div className="p-1.5 bg-blue-600/5 border border-blue-600/20 group-hover/meta:border-blue-600/40 transition-colors">
                <UserCircleIcon className="w-4 h-4 text-blue-500 flex-shrink-0" />
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] font-black uppercase tracking-wide truncate text-white/70">{session.host.full_name}</span>
                <span className="text-[8px] font-black text-blue-400/60 uppercase tracking-widest">{session.host.role}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="mt-auto border-t border-white/5">

        {/* ── Host controls: Start Now / End Session ── */}
        {canManage && session.host_id === userId && (
          <div className="p-3">
            {session.status === 'scheduled' && (
              <button
                onClick={() => onStart(session)}
                className="w-full flex items-center justify-center gap-3 py-4 bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-black uppercase tracking-[0.2em] transition-all shadow-lg shadow-emerald-900/40 relative overflow-hidden group/start"
              >
                <div className="absolute inset-0 bg-white/10 -translate-x-full group-hover/start:translate-x-full transition-transform duration-500" />
                <SignalIcon className="w-4 h-4 relative z-10" />
                <span className="relative z-10">Start Session Now</span>
              </button>
            )}
            {session.status === 'live' && (
              <button
                onClick={() => onEnd(session)}
                className="w-full flex items-center justify-center gap-3 py-3 bg-rose-600/20 hover:bg-rose-600/30 border border-rose-500/30 text-rose-400 text-[10px] font-black uppercase tracking-widest transition-all"
              >
                <StopCircleIcon className="w-4 h-4" />
                End Session
              </button>
            )}
          </div>
        )}

        {(showJoin || showRecording) && (
          <div className="flex p-3 gap-2">
            {showJoin && (
              <button
                onClick={() => onJoin(session.id, session.session_url)}
                className={`flex-1 flex items-center justify-center gap-3 py-3.5 text-[10px] font-black uppercase tracking-[0.2em] transition-all rounded-sm ${
                  isLive
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-xl shadow-emerald-600/30'
                    : 'bg-orange-600 hover:bg-orange-500 text-white'
                }`}
              >
                {isInApp ? <VideoCameraIcon className="w-4 h-4" /> : isLive ? <SignalIcon className="w-4 h-4" /> : <LinkIcon className="w-4 h-4" />}
                {isInApp ? (isLive ? 'Open Live Room' : 'Open Room') : isLive ? 'Enter Live Hall' : 'Join Uplink'}
              </button>
            )}
            {showRecording && (
              <button
                onClick={() => onRecording(session)}
                className="flex-1 flex items-center justify-center gap-3 py-3.5 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 text-blue-400 text-[10px] font-black uppercase tracking-[0.2em] transition-all rounded-sm"
              >
                <FilmIcon className="w-4 h-4" />
                Watch Recording
              </button>
            )}
          </div>
        )}
        <div className="flex border-t border-white/[0.04] bg-white/[0.01]">
          <button onClick={() => onPolls(session)}
            className="flex-1 flex items-center justify-center gap-2 py-3.5 text-[9px] font-black uppercase tracking-widest text-white/20 hover:text-orange-400 hover:bg-white/[0.03] transition-all">
            <ChartBarIcon className="w-4 h-4" /> Polls
          </button>
          <div className="w-[1px] bg-white/[0.04]" />
          <button onClick={() => onQA(session)}
            className="flex-1 flex items-center justify-center gap-2 py-3.5 text-[9px] font-black uppercase tracking-widest text-white/20 hover:text-orange-400 hover:bg-white/[0.03] transition-all">
            <ChatBubbleLeftEllipsisIcon className="w-4 h-4" /> Q&A
          </button>
          <div className="w-[1px] bg-white/[0.04]" />
          <button onClick={() => onRooms(session)}
            className="flex-1 flex items-center justify-center gap-2 py-3.5 text-[9px] font-black uppercase tracking-widest text-white/20 hover:text-purple-400 hover:bg-white/[0.03] transition-all">
            <UsersIcon className="w-4 h-4" /> Rooms
          </button>
          {canManage && (
            <>
              <div className="w-[1px] bg-white/[0.04]" />
              <button onClick={() => onAttendance(session)}
                className="flex-1 flex items-center justify-center gap-2 py-3.5 text-[9px] font-black uppercase tracking-widest text-white/20 hover:text-blue-400 hover:bg-white/[0.03] transition-all">
                <EyeIcon className="w-4 h-4" /> Attendance
              </button>
            </>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ─── Session Form Modal ───────────────────────────────────────────────────────

function SessionModal({ initial, isEdit, schools, programs, isAdmin, saving, error, onClose, onSave }: {
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
        <div className="flex items-center justify-between px-8 py-6 border-b border-white/5 bg-white/[0.015] flex-shrink-0">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-orange-600/10 border border-orange-500/20 flex items-center justify-center">
              <VideoCameraIcon className="w-5 h-5 text-orange-400" />
            </div>
            <div>
              <h2 className="text-sm font-black text-white uppercase tracking-widest">{isEdit ? 'Edit Session' : 'Schedule Live Session'}</h2>
              <p className="text-[9px] font-black text-white/20 uppercase tracking-[0.3em] mt-0.5">Broadcast Uplink</p>
            </div>
          </div>
          <button onClick={onClose} className="w-10 h-10 flex items-center justify-center bg-white/5 border border-white/10 hover:text-orange-500 transition-all text-white/40">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6">
          {error && (
            <div className="px-4 py-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-black uppercase tracking-widest">
              {error}
            </div>
          )}

          <div>
            <label className={labelCls}>Session Title <span className="text-orange-500">*</span></label>
            <input type="text" value={form.title} onChange={e => set('title', e.target.value)}
              placeholder="e.g. Introduction to Algorithms — Week 3" className={fieldCls} />
          </div>

          <div>
            <label className={labelCls}>Description</label>
            <textarea value={form.description} onChange={e => set('description', e.target.value)}
              placeholder="Brief overview of what will be covered…" rows={3} className={`${fieldCls} resize-none`} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Platform</label>
              <select
                value={isJitsiUrl(form.session_url) ? 'jitsi' : form.platform}
                onChange={e => {
                  const val = e.target.value;
                  if (val === 'jitsi') {
                    set('platform', 'other');
                    // Auto-generate Jitsi room URL instantly
                    set('session_url', `https://meet.jit.si/Rillcod-${Date.now().toString(36)}`);
                  } else {
                    set('platform', val as LiveSession['platform']);
                    // Clear Jitsi URL when switching away
                    if (isJitsiUrl(form.session_url)) set('session_url', '');
                  }
                }}
                className={`${fieldCls} appearance-none`}
              >
                <option value="jitsi"        className="bg-[#0a0a0a]">🎥 In-App Meeting (Free, instant)</option>
                <option value="google_meet"  className="bg-[#0a0a0a]">📹 Google Meet</option>
              </select>
            </div>

            {/* Google Meet URL field with auto-open helper */}
            {!isJitsiUrl(form.session_url) && (
              <div>
                <label className={labelCls}>
                  Google Meet Link
                  {!form.session_url && (
                    <span className="ml-2 text-orange-500/70 normal-case font-bold tracking-normal">
                      — paste after generating below
                    </span>
                  )}
                </label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={form.session_url}
                    onChange={e => set('session_url', e.target.value)}
                    placeholder="https://meet.google.com/abc-defg-hij"
                    className={`${fieldCls} flex-1`}
                  />
                </div>
                {/* One-click: open Google Meet, auto-detect the generated link */}
                <button
                  type="button"
                  onClick={() => {
                    const meetWin = window.open('https://meet.google.com/new', '_blank');
                    if (!meetWin) return;
                    // Poll the new window's URL until Google redirects to the actual room
                    const poll = setInterval(() => {
                      try {
                        const url = meetWin.location.href;
                        // Google Meet room URLs look like: meet.google.com/xxx-xxxx-xxx
                        if (url && url.includes('meet.google.com/') && !url.includes('/new') && !url.includes('accounts.google')) {
                          clearInterval(poll);
                          set('session_url', url.split('?')[0]); // strip any query params
                          meetWin.close();
                        }
                      } catch {
                        // Cross-origin error while Google is loading — keep polling
                      }
                    }, 500);
                    // Stop polling after 2 minutes
                    setTimeout(() => clearInterval(poll), 120000);
                  }}
                  className="mt-2 w-full flex items-center justify-center gap-2 py-2.5 bg-emerald-600/10 hover:bg-emerald-600/20 border border-emerald-500/20 hover:border-emerald-500/40 text-emerald-400/60 hover:text-emerald-400 text-[10px] font-black uppercase tracking-widest transition-all"
                >
                  <LinkIcon className="w-3.5 h-3.5" />
                  Generate Google Meet Link — auto-fills when ready
                </button>
              </div>
            )}

            {/* Jitsi: show the auto-generated room URL (read-only) */}
            {isJitsiUrl(form.session_url) && (
              <div>
                <label className={labelCls}>Room URL <span className="text-emerald-500">auto-generated ✓</span></label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={form.session_url}
                    readOnly
                    className={`${fieldCls} flex-1 opacity-40 cursor-default select-all`}
                  />
                  <button
                    type="button"
                    onClick={() => { navigator.clipboard.writeText(form.session_url); }}
                    className="px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white/30 hover:text-white transition-all text-[10px] font-black uppercase tracking-widest flex-shrink-0"
                    title="Copy room URL"
                  >
                    Copy
                  </button>
                </div>
              </div>
            )}
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
              placeholder="Pre-session preparation, materials, links…" rows={3} className={`${fieldCls} resize-none`} />
          </div>
        </div>

        <div className="flex items-center justify-between px-8 py-6 border-t border-white/5 bg-white/[0.01] flex-shrink-0">
          <div>
            {isEdit && (
              <button
                onClick={() => {
                  if (confirm('Delete this live session? This cannot be undone.')) {
                    fetch(`/api/live-sessions/${(initial as any).id}`, { method: 'DELETE' }).then(res => {
                      if (res.ok) onClose();
                      else alert('Failed to delete');
                    });
                  }
                }}
                className="px-4 py-2 text-[10px] font-black uppercase tracking-widest text-rose-500 hover:text-rose-400 hover:bg-rose-500/10 transition-all border border-rose-500/20"
              >
                Delete Session
              </button>
            )}
          </div>
          <div className="flex items-center gap-4">
            <button onClick={onClose} disabled={saving}
              className="px-6 py-3 text-[10px] font-black uppercase tracking-widest text-white/30 hover:text-white transition-colors disabled:opacity-50">
              Cancel
            </button>
          </div>
          <button
            onClick={() => onSave(form)}
            disabled={saving || !form.title.trim() || !form.scheduled_date || !form.scheduled_time}
            className="px-8 py-3 bg-orange-600 hover:bg-orange-500 text-white text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-40 flex items-center gap-3"
          >
            {saving
              ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              : <PlusIcon className="w-4 h-4" />}
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Schedule Session'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Auto-Join Toast (external sessions) ─────────────────────────────────────

function AutoJoinToast({ session, onJoin, onDismiss }: {
  session: LiveSession; onJoin: () => void; onDismiss: () => void;
}) {
  const [secs, setSecs] = useState(8);

  useEffect(() => {
    if (secs <= 0) { onJoin(); return; }
    const t = setTimeout(() => setSecs(s => s - 1), 1000);
    return () => clearTimeout(t);
  }, [secs, onJoin]);

  return (
    <motion.div
      initial={{ y: 80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 80, opacity: 0 }}
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[70] w-full max-w-md"
    >
      <div className="bg-[#0a0a0a] border border-emerald-500/40 shadow-2xl shadow-emerald-900/40 p-5 flex items-center gap-4">
        {/* Pulse dot */}
        <div className="flex-shrink-0 w-10 h-10 bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-400" />
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">Session is Live!</p>
          <p className="text-xs font-bold text-white truncate mt-0.5">{session.title}</p>
          <p className="text-[9px] text-white/30 mt-0.5">
            Joining automatically in <span className="text-emerald-400 font-black">{secs}s</span>
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={onJoin}
            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-black uppercase tracking-widest transition-all"
          >
            Join Now
          </button>
          <button
            onClick={onDismiss}
            className="p-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-white/30 hover:text-white transition-all"
          >
            <XMarkIcon className="w-4 h-4" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState({ tab, canManage, onAdd }: { tab: FilterTab; canManage: boolean; onAdd: () => void }) {
  const messages: Record<FilterTab, { title: string; sub: string }> = {
    upcoming: { title: 'No Uplinks Scheduled',  sub: 'Live and scheduled sessions will appear here.' },
    past:     { title: 'No Past Sessions',       sub: 'Completed and cancelled sessions will appear here.' },
    all:      { title: 'Broadcast Grid Empty',   sub: 'Schedule your first live session to get started.' },
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
        <button
          onClick={onAdd}
          className="flex items-center gap-3 px-8 py-4 bg-orange-600 hover:bg-orange-500 text-white text-[10px] font-black uppercase tracking-widest transition-all"
        >
          <PlusIcon className="w-4 h-4" /> Schedule Session
        </button>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function LiveSessionsPage() {
  const { profile, loading: authLoading } = useAuth();
  const [sessions, setSessions]     = useState<LiveSession[]>([]);
  const [schools, setSchools]       = useState<School[]>([]);
  const [programs, setPrograms]     = useState<Program[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [filter, setFilter]         = useState<FilterTab>('upcoming');

  // Modals
  const [showModal, setShowModal]           = useState(false);
  const [editingSession, setEditingSession] = useState<LiveSession | null>(null);
  const [modalForm, setModalForm]           = useState<SessionForm>(blankForm());
  const [modalError, setModalError]         = useState<string | null>(null);
  const [saving, setSaving]                 = useState(false);
  const [pollsSession, setPollsSession]     = useState<LiveSession | null>(null);
  const [roomsSession, setRoomsSession]     = useState<LiveSession | null>(null);
  const [jitsiSession, setJitsiSession]     = useState<LiveSession | null>(null);
  const [recordingSession, setRecordingSession] = useState<LiveSession | null>(null);
  const [attendanceSession, setAttendanceSession] = useState<LiveSession | null>(null);
  const [qaSession, setQaSession] = useState<LiveSession | null>(null);

  const canManage = profile?.role === 'admin' || profile?.role === 'teacher';
  const isAdmin   = profile?.role === 'admin';

  // ── Data loading ────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!profile) return;
    setLoading(true); setError(null);
    try {
      const supabase = createClient();
      let query = supabase
        .from('live_sessions')
        .select('*, program:programs(name)')
        .order('scheduled_at', { ascending: true });

      if ((profile.role === 'school' || profile.role === 'student') && profile.school_id)
        query = query.or(`school_id.eq.${profile.school_id},school_id.is.null`);

      const { data: rawSessions, error: sessErr } = await query;
      if (sessErr) throw sessErr;

      const rows = (rawSessions ?? []) as unknown as LiveSession[];

      // Batch-fetch hosts
      const hostIds = [...new Set(rows.map(r => r.host_id).filter(Boolean))];
      const hostsMap: Record<string, { full_name: string; role: string }> = {};
      if (hostIds.length > 0) {
        const { data: hosts } = await supabase
          .from('portal_users').select('id, full_name, role').in('id', hostIds);
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

  // ── Auto-join toast for external sessions ──────────────────────────────────
  const [autoJoinToast, setAutoJoinToast] = useState<LiveSession | null>(null);

  // ── Realtime subscription ───────────────────────────────────────────────────
  useEffect(() => {
    if (authLoading || !profile) return;
    loadData();

    const db = createClient();
    const sub = db
      .channel('live_sessions_rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'live_sessions' }, payload => {
        if (payload.eventType === 'UPDATE') {
          const updated = payload.new as LiveSession;
          setSessions(prev => prev.map(s => s.id === updated.id ? { ...s, ...updated } : s));

          // ── Auto-join when a session flips to "live" ──────────────────────
          const wasLive = payload.old?.status === 'live';
          const nowLive = updated.status === 'live';
          if (!wasLive && nowLive && updated.session_url) {
            // Record attendance silently
            fetch(`/api/live-sessions/${updated.id}/join`, { method: 'POST' }).catch(() => {});

            if (isJitsiUrl(updated.session_url) || isLiveKitUrl(updated.session_url)) {
              // Students only — delay 6s so teacher joins first and becomes moderator
              if (profile.role === 'student') {
                setTimeout(() => {
                  setSessions(prev => {
                    const full = prev.find(s => s.id === updated.id);
                    if (full) setJitsiSession({ ...full, ...updated });
                    return prev;
                  });
                }, 6000);
              }
            } else {
              // External URL: show dismissible toast with countdown
              setSessions(prev => {
                const full = prev.find(s => s.id === updated.id);
                if (full) setAutoJoinToast({ ...full, ...updated });
                return prev;
              });
            }
          }
        } else if (payload.eventType === 'INSERT') {
          loadData(); // need host/program joins
        } else if (payload.eventType === 'DELETE') {
          setSessions(prev => prev.filter(s => s.id !== (payload.old as any).id));
        }
      })
      .subscribe();

    return () => { db.removeChannel(sub); };
  }, [authLoading, profile?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Filtered list ───────────────────────────────────────────────────────────
  const filtered = sessions.filter(s => {
    if (filter === 'upcoming') return s.status === 'scheduled' || s.status === 'live';
    if (filter === 'past')     return s.status === 'completed' || s.status === 'cancelled';
    return true;
  });

  // ── CRUD handlers ───────────────────────────────────────────────────────────
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
      duration_minutes: s.duration_minutes, school_id: s.school_id ?? '',
      program_id: s.program_id ?? '', status: s.status,
      recording_url: s.recording_url ?? '', notes: s.notes ?? '',
    });
    setModalError(null); setShowModal(true);
  }

  async function handleSave(form: SessionForm) {
    if (!profile) return;
    setSaving(true); setModalError(null);
    try {
      const scheduled_at = new Date(`${form.scheduled_date}T${form.scheduled_time}`).toISOString();
      const payload = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        platform: form.platform,
        // Auto-generate Jitsi URL if platform is jitsi and no URL set
        session_url: form.session_url.trim() || null,
        scheduled_at,
        duration_minutes: Number(form.duration_minutes),
        school_id: form.school_id || null,
        program_id: form.program_id || null,
        status: form.status,
        recording_url: form.recording_url.trim() || null,
        notes: form.notes.trim() || null,
      };

      const url = editingSession
        ? `/api/live-sessions/${editingSession.id}`
        : '/api/live-sessions';
      const method = editingSession ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) { const j = await res.json(); throw new Error(j.error || 'Failed to save'); }
      setShowModal(false);
      await loadData();
    } catch (err: any) {
      setModalError(err?.message ?? 'Failed to save session');
    } finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this live session? This cannot be undone.')) return;
    try {
      const res = await fetch(`/api/live-sessions/${id}`, { method: 'DELETE' });
      if (!res.ok) { const j = await res.json(); throw new Error(j.error || 'Failed to delete'); }
      // Realtime will handle removal from state
    } catch (err: any) { alert(err?.message ?? 'Failed to delete session'); }
  }

  // ── Start / End session (host only) ────────────────────────────────────────
  async function handleStart(session: LiveSession) {
    try {
      // Mark as live — LiveKit room is created on-demand via token
      await fetch(`/api/live-sessions/${session.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'live', session_url: `livekit:${session.id}` }),
      });
      // Open the meeting immediately for the host
      const s = { ...session, session_url: `livekit:${session.id}` };
      setJitsiSession(s);
    } catch (err: any) { alert(err?.message ?? 'Failed to start session'); }
  }

  async function handleEnd(session: LiveSession) {
    if (!confirm('End this session and mark it as completed?')) return;
    try {
      await fetch(`/api/live-sessions/${session.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'completed' }),
      });
      // Close Jitsi if open
      if (jitsiSession?.id === session.id) setJitsiSession(null);
    } catch (err: any) { alert(err?.message ?? 'Failed to end session'); }
  }

  async function handleJoin(id: string, url: string | null) {
    // Record attendance silently
    try { await fetch(`/api/live-sessions/${id}/join`, { method: 'POST' }); } catch { /* silent */ }

    // If no URL, use LiveKit
    const resolvedUrl = url || `livekit:${id}`;

    if (isLiveKitUrl(resolvedUrl) || isJitsiUrl(resolvedUrl)) {
      const session = sessions.find(s => s.id === id) ?? null;
      if (!url && session) {
        fetch(`/api/live-sessions/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_url: resolvedUrl }),
        }).catch(() => {});
      }
      setJitsiSession(session ? { ...session, session_url: resolvedUrl } : null);
    } else {
      window.open(resolvedUrl, '_blank', 'noopener,noreferrer');
    }
  }

  // ── Loading state ───────────────────────────────────────────────────────────
  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-orange-600 border-t-transparent animate-spin" />
      </div>
    );
  }

  const liveSessions    = sessions.filter(s => s.status === 'live');
  const upcomingCount   = sessions.filter(s => s.status === 'scheduled' || s.status === 'live').length;
  const pastCount       = sessions.filter(s => s.status === 'completed' || s.status === 'cancelled').length;

  const TABS: { key: FilterTab; label: string; count: number }[] = [
    { key: 'upcoming', label: 'Upcoming', count: upcomingCount },
    { key: 'past',     label: 'Archive',  count: pastCount },
    { key: 'all',      label: 'All',      count: sessions.length },
  ];

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white selection:bg-orange-600/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">

        {/* ── Header ── */}
        <div className="relative bg-card/10 border border-white/10 p-8 sm:p-14 overflow-hidden flex flex-col sm:flex-row sm:items-center justify-between gap-8 group backdrop-blur-3xl rounded-3xl">
          <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-orange-600/10 blur-[140px] -mr-64 -mt-64 pointer-events-none group-hover:bg-orange-600/15 transition-all duration-1000" />
          <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-blue-600/10 blur-[100px] -ml-32 -mb-32 pointer-events-none" />

          <div className="relative z-10 space-y-6">
            <div className="flex flex-wrap items-center gap-4">
              <div className="px-4 py-1.5 bg-orange-600/10 border border-orange-600/20 text-orange-500 text-[9px] font-black uppercase tracking-[0.4em] flex items-center gap-3">
                <SignalIcon className="w-3 h-3" /> Sector: Broadcast Uplink
              </div>
              {liveSessions.length > 0 && (
                <div className="flex items-center gap-2 px-4 py-1.5 bg-emerald-500/10 border border-emerald-500/30 rounded-full">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
                  </span>
                  <span className="text-emerald-400 text-[9px] font-black uppercase tracking-widest">
                    {liveSessions.length} Channel{liveSessions.length !== 1 ? 's' : ''} Open
                  </span>
                </div>
              )}
            </div>
            <div>
              <h1 className="text-4xl sm:text-6xl font-black tracking-tighter leading-[0.85] italic uppercase">
                Virtual<br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-600 via-orange-500 to-amber-500">Hall.</span>
                <span className="text-white/10 ml-4 not-italic font-black opacity-20 hidden md:inline">01</span>
              </h1>
              <p className="text-sm text-white/40 font-medium mt-6 max-w-sm leading-relaxed border-l-2 border-orange-600/30 pl-6">
                {canManage
                  ? 'Manage broadcasts, track attendance, and engage students with live polls and breakout rooms.'
                  : 'Welcome to the broadcast lobby. Join your scheduled classes and engage in interactive sessions.'}
              </p>
            </div>
          </div>

          <div className="relative z-10 flex flex-col gap-6 sm:items-end">
            <div className="flex items-center gap-3">
              {[
                { label: 'Active', value: liveSessions.length, color: 'emerald' },
                { label: 'Total',  value: sessions.length,     color: 'white' },
              ].map(stat => (
                <div key={stat.label} className="bg-white/[0.03] border border-white/10 p-5 min-w-[100px] text-center backdrop-blur-md">
                  <p className={`text-2xl font-black ${stat.color === 'emerald' ? 'text-emerald-400' : 'text-white'}`}>{stat.value}</p>
                  <p className="text-[8px] font-black text-white/20 uppercase tracking-widest mt-1">{stat.label}</p>
                </div>
              ))}
            </div>
            {canManage && (
              <button
                onClick={openCreate}
                className="group/btn flex items-center gap-4 px-10 py-5 bg-orange-600 hover:bg-orange-500 text-white text-[11px] font-black uppercase tracking-[0.25em] transition-all shadow-2xl shadow-orange-600/30 relative overflow-hidden"
              >
                <div className="absolute inset-0 bg-white/10 -translate-x-full group-hover/btn:translate-x-full transition-transform duration-700" />
                <PlusIcon className="w-4 h-4 relative z-10" />
                <span className="relative z-10">Broadcast New Session</span>
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
            <AnimatePresence>
              {filtered.map(s => (
                <SessionCard
                  key={s.id}
                  session={s}
                  userId={profile?.id ?? ''}
                  canManage={canManage && (isAdmin || s.host_id === profile?.id)}
                  onEdit={openEdit}
                  onDelete={handleDelete}
                  onJoin={handleJoin}
                  onStart={handleStart}
                  onEnd={handleEnd}
                  onPolls={setPollsSession}
                  onRooms={setRoomsSession}
                  onRecording={setRecordingSession}
                  onAttendance={setAttendanceSession}
                  onQA={setQaSession}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* ── Modals ── */}
      {showModal && (
        <SessionModal
          initial={modalForm}
          isEdit={!!editingSession}
          schools={schools}
          programs={programs}
          isAdmin={isAdmin}
          saving={saving}
          error={modalError}
          onClose={() => setShowModal(false)}
          onSave={handleSave}
        />
      )}
      {pollsSession && (
        <PollsModal
          session={pollsSession}
          canManage={canManage && (isAdmin || pollsSession.host_id === profile?.id)}
          userId={profile?.id ?? ''}
          onClose={() => setPollsSession(null)}
        />
      )}
      {roomsSession && (
        <RoomsModal
          session={roomsSession}
          canManage={canManage && (isAdmin || roomsSession.host_id === profile?.id)}
          onClose={() => setRoomsSession(null)}
        />
      )}
      {attendanceSession && (
        <AttendanceModal
          session={attendanceSession}
          onClose={() => setAttendanceSession(null)}
        />
      )}
      {qaSession && (
        <QAModal
          session={qaSession}
          canManage={canManage && (isAdmin || qaSession.host_id === profile?.id)}
          userId={profile?.id ?? ''}
          onClose={() => setQaSession(null)}
        />
      )}
      {recordingSession && recordingSession.recording_url && (
        <RecordingModal
          session={recordingSession}
          onClose={() => setRecordingSession(null)}
        />
      )}
      {jitsiSession && (
        <LiveKitMeeting
          sessionId={jitsiSession.id}
          sessionTitle={jitsiSession.title}
          onClose={() => setJitsiSession(null)}
        />
      )}

      {/* ── Auto-join toast for external sessions ── */}
      <AnimatePresence>
        {autoJoinToast && (
          <AutoJoinToast
            session={autoJoinToast}
            onJoin={() => {
              window.open(autoJoinToast.session_url!, '_blank', 'noopener,noreferrer');
              setAutoJoinToast(null);
            }}
            onDismiss={() => setAutoJoinToast(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
