// @refresh reset
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import { motion, AnimatePresence } from 'framer-motion';
import {
  VideoCameraIcon, CalendarDaysIcon, ClockIcon, PencilIcon, TrashIcon,
  PlusIcon, XMarkIcon, LinkIcon, SignalIcon, FilmIcon, UserCircleIcon,
  ArrowRightIcon, UsersIcon, CheckCircleIcon, ChartBarIcon, PlayIcon, EyeIcon,
} from '@/lib/icons';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isJitsiUrl(url?: string | null) { return !!url && url.includes('meet.jit.si'); }

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

function SessionCard({ session, canManage, onEdit, onDelete, onJoin, onPolls, onRooms, onRecording, onAttendance }: {
  session: LiveSession; canManage: boolean;
  onEdit: (s: LiveSession) => void; onDelete: (id: string) => void;
  onJoin: (id: string, url: string) => void; onPolls: (s: LiveSession) => void;
  onRooms: (s: LiveSession) => void; onRecording: (s: LiveSession) => void;
  onAttendance: (s: LiveSession) => void;
}) {
  const isInApp = isJitsiUrl(session.session_url);
  const platKey = isInApp ? 'jitsi' : session.platform;
  const platCfg = PLATFORM_CONFIG[platKey] ?? PLATFORM_CONFIG.other;
  const statusCfg = STATUS_CONFIG[session.status];
  const countdown = getCountdown(session.scheduled_at);
  const isLive = session.status === 'live';
  const showJoin = (session.status === 'scheduled' || isLive) && !!session.session_url;
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
            <div className="flex items-center gap-1.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-x-2 group-hover:translate-x-0">
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
        {(showJoin || showRecording) && (
          <div className="flex p-3 gap-2">
            {showJoin && (
              <button
                onClick={() => onJoin(session.id, session.session_url!)}
                className={`flex-1 flex items-center justify-center gap-3 py-3.5 text-[10px] font-black uppercase tracking-[0.2em] transition-all rounded-sm ${
                  isLive
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-xl shadow-emerald-600/30 animate-pulse'
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
