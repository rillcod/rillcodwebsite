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

interface School {
  id: string;
  name: string;
}

interface Program {
  id: string;
  name: string;
}

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
  { label: string; textClass: string; bgClass: string; borderClass: string }
> = {
  zoom:         { label: 'Zoom',         textClass: 'text-blue-400',    bgClass: 'bg-blue-500/10',    borderClass: 'border-blue-500/20' },
  google_meet:  { label: 'Google Meet',  textClass: 'text-emerald-400', bgClass: 'bg-emerald-500/10', borderClass: 'border-emerald-500/20' },
  teams:        { label: 'Teams',        textClass: 'text-purple-400',  bgClass: 'bg-purple-500/10',  borderClass: 'border-purple-500/20' },
  discord:      { label: 'Discord',      textClass: 'text-indigo-400',  bgClass: 'bg-indigo-500/10',  borderClass: 'border-indigo-500/20' },
  other:        { label: 'Other',        textClass: 'text-white/40',    bgClass: 'bg-white/5',        borderClass: 'border-white/10' },
};

const STATUS_CONFIG: Record<
  LiveSession['status'],
  { label: string; textClass: string; bgClass: string; borderClass: string; pulse?: boolean }
> = {
  scheduled:  { label: 'Scheduled',  textClass: 'text-amber-400',   bgClass: 'bg-amber-500/10',   borderClass: 'border-amber-500/20' },
  live:       { label: 'Live',       textClass: 'text-emerald-400', bgClass: 'bg-emerald-500/10', borderClass: 'border-emerald-500/20', pulse: true },
  completed:  { label: 'Completed',  textClass: 'text-blue-400',    bgClass: 'bg-blue-500/10',    borderClass: 'border-blue-500/20' },
  cancelled:  { label: 'Cancelled',  textClass: 'text-rose-400',    bgClass: 'bg-rose-500/10',    borderClass: 'border-rose-500/20' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-US', {
    weekday: 'short',
    month:   'short',
    day:     'numeric',
    year:    'numeric',
    hour:    'numeric',
    minute:  '2-digit',
    hour12:  true,
  }).replace(',', ' ·').replace(/, (\d{4})/, ', $1');
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
    title: '',
    description: '',
    platform: 'zoom',
    session_url: '',
    scheduled_date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    scheduled_time: `${pad(now.getHours() + 1)}:00`,
    duration_minutes: 60,
    school_id: '',
    program_id: '',
    status: 'scheduled',
    recording_url: '',
    notes: '',
  };
}

// ─── Status Badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: LiveSession['status'] }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${cfg.textClass} ${cfg.bgClass} ${cfg.borderClass}`}>
      {cfg.pulse && (
        <span className="relative flex h-2 w-2">
          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75`} />
          <span className={`relative inline-flex rounded-full h-2 w-2 bg-emerald-400`} />
        </span>
      )}
      {cfg.label}
    </span>
  );
}

// ─── Platform Badge ────────────────────────────────────────────────────────────

function PlatformBadge({ platform }: { platform: LiveSession['platform'] }) {
  const cfg = PLATFORM_CONFIG[platform];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border ${cfg.textClass} ${cfg.bgClass} ${cfg.borderClass}`}>
      {cfg.label}
    </span>
  );
}

// ─── Role Badge ────────────────────────────────────────────────────────────────

function RoleBadge({ role }: { role: string }) {
  const map: Record<string, string> = {
    admin:   'bg-rose-500/10 text-rose-400 border-rose-500/20',
    teacher: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
    student: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    school:  'bg-amber-500/10 text-amber-400 border-amber-500/20',
  };
  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border capitalize ${map[role] ?? 'bg-white/10 text-white/40 border-white/10'}`}>
      {role}
    </span>
  );
}

// ─── Session Card ─────────────────────────────────────────────────────────────

function SessionCard({
  session,
  canManage,
  currentUserId,
  onEdit,
  onDelete,
}: {
  session: LiveSession;
  canManage: boolean;
  currentUserId: string;
  onEdit: (s: LiveSession) => void;
  onDelete: (id: string) => void;
}) {
  const cfg = PLATFORM_CONFIG[session.platform];
  const countdown = getCountdown(session.scheduled_at);
  const isOwner = session.host_id === currentUserId;
  const canAct = canManage && (isOwner || true); // admin sees all; teacher only own (filtered above)
  const showJoin = (session.status === 'scheduled' || session.status === 'live') && !!session.session_url;
  const showRecording = session.status === 'completed' && !!session.recording_url;

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-5 flex flex-col gap-4 hover:border-white/20 transition-colors">
      {/* Top row */}
      <div className="flex items-start justify-between gap-3">
        <div className={`w-10 h-10 flex-shrink-0 rounded-xl flex items-center justify-center ${cfg.bgClass} border ${cfg.borderClass}`}>
          <VideoCameraIcon className={`w-5 h-5 ${cfg.textClass}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <PlatformBadge platform={session.platform} />
            <StatusBadge status={session.status} />
            {countdown && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/25 animate-pulse">
                <ClockIcon className="w-3 h-3" />
                {countdown}
              </span>
            )}
          </div>
          <h3 className="text-white font-semibold text-base leading-snug line-clamp-2">{session.title}</h3>
        </div>
        {canAct && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={() => onEdit(session)}
              className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors"
              title="Edit session"
            >
              <PencilIcon className="w-4 h-4" />
            </button>
            <button
              onClick={() => onDelete(session.id)}
              className="p-1.5 rounded-lg text-white/40 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
              title="Delete session"
            >
              <TrashIcon className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Description */}
      {session.description && (
        <p className="text-sm text-white/50 line-clamp-2 -mt-1">{session.description}</p>
      )}

      {/* Meta */}
      <div className="flex flex-col gap-2">
        {/* Date/time */}
        <div className="flex items-center gap-2 text-sm text-white/60">
          <CalendarDaysIcon className="w-4 h-4 text-white/30 flex-shrink-0" />
          <span>{formatDateTime(session.scheduled_at)}</span>
        </div>
        {/* Duration */}
        <div className="flex items-center gap-2 text-sm text-white/60">
          <ClockIcon className="w-4 h-4 text-white/30 flex-shrink-0" />
          <span>{session.duration_minutes} min</span>
        </div>
        {/* Host */}
        {session.host && (
          <div className="flex items-center gap-2 text-sm text-white/60">
            <UserCircleIcon className="w-4 h-4 text-white/30 flex-shrink-0" />
            <span className="truncate">{session.host.full_name}</span>
            <RoleBadge role={session.host.role} />
          </div>
        )}
        {/* Program */}
        {session.program && (
          <div className="flex items-center gap-2 text-sm text-white/60">
            <AcademicCapIcon className="w-4 h-4 text-white/30 flex-shrink-0" />
            <span className="truncate">{session.program.name}</span>
          </div>
        )}
      </div>

      {/* Actions */}
      {(showJoin || showRecording) && (
        <div className="flex gap-2 pt-1 border-t border-white/5">
          {showJoin && (
            <a
              href={session.session_url!}
              target="_blank"
              rel="noopener noreferrer"
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-sm font-semibold transition-colors ${
                session.status === 'live'
                  ? 'bg-emerald-500 hover:bg-emerald-400 text-white'
                  : 'bg-violet-600 hover:bg-violet-500 text-white'
              }`}
            >
              {session.status === 'live' ? (
                <>
                  <SignalIcon className="w-4 h-4" />
                  Join Live
                </>
              ) : (
                <>
                  <LinkIcon className="w-4 h-4" />
                  Join Now
                </>
              )}
            </a>
          )}
          {showRecording && (
            <a
              href={session.recording_url!}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-sm font-semibold bg-blue-600/80 hover:bg-blue-600 text-white transition-colors"
            >
              <FilmIcon className="w-4 h-4" />
              Watch Recording
            </a>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────

function SessionModal({
  initial,
  isEdit,
  schools,
  programs,
  isAdmin,
  saving,
  error,
  onClose,
  onSave,
}: {
  initial: SessionForm;
  isEdit: boolean;
  schools: School[];
  programs: Program[];
  isAdmin: boolean;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (form: SessionForm) => void;
}) {
  const [form, setForm] = useState<SessionForm>(initial);

  const set = (k: keyof SessionForm, v: string | number) =>
    setForm(prev => ({ ...prev, [k]: v }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-[#0f0f1a] border border-white/10 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-violet-500/15 border border-violet-500/25 flex items-center justify-center">
              <VideoCameraIcon className="w-5 h-5 text-violet-400" />
            </div>
            <div>
              <h2 className="text-white font-bold text-base">
                {isEdit ? 'Edit Session' : 'Schedule Session'}
              </h2>
              <p className="text-white/40 text-xs">Fill in the session details below</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-white/40 hover:text-white hover:bg-white/10 transition-colors"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {error && (
            <div className="px-4 py-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm">
              {error}
            </div>
          )}

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-white/70 mb-1.5">
              Title <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              value={form.title}
              onChange={e => set('title', e.target.value)}
              placeholder="e.g. Introduction to Python — Week 3"
              className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/30 focus:outline-none focus:border-violet-500"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-white/70 mb-1.5">Description</label>
            <textarea
              value={form.description}
              onChange={e => set('description', e.target.value)}
              placeholder="Brief overview of what will be covered…"
              rows={3}
              className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/30 focus:outline-none focus:border-violet-500 resize-none"
            />
          </div>

          {/* Platform + Join URL */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-white/70 mb-1.5">Platform</label>
              <select
                value={form.platform}
                onChange={e => set('platform', e.target.value as LiveSession['platform'])}
                className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-violet-500 appearance-none"
              >
                <option value="zoom">Zoom</option>
                <option value="google_meet">Google Meet</option>
                <option value="teams">Microsoft Teams</option>
                <option value="discord">Discord</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-white/70 mb-1.5">Join URL</label>
              <input
                type="url"
                value={form.session_url}
                onChange={e => set('session_url', e.target.value)}
                placeholder="https://zoom.us/j/..."
                className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/30 focus:outline-none focus:border-violet-500"
              />
            </div>
          </div>

          {/* Date + Time + Duration */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-white/70 mb-1.5">
                Date <span className="text-rose-400">*</span>
              </label>
              <input
                type="date"
                value={form.scheduled_date}
                onChange={e => set('scheduled_date', e.target.value)}
                className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-violet-500 [color-scheme:dark]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-white/70 mb-1.5">
                Time <span className="text-rose-400">*</span>
              </label>
              <input
                type="time"
                value={form.scheduled_time}
                onChange={e => set('scheduled_time', e.target.value)}
                className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-violet-500 [color-scheme:dark]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-white/70 mb-1.5">Duration (min)</label>
              <input
                type="number"
                min={5}
                max={480}
                value={form.duration_minutes}
                onChange={e => set('duration_minutes', Number(e.target.value))}
                className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-violet-500"
              />
            </div>
          </div>

          {/* Program */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {isAdmin && (
              <div>
                <label className="block text-sm font-medium text-white/70 mb-1.5">School (optional)</label>
                <select
                  value={form.school_id}
                  onChange={e => set('school_id', e.target.value)}
                  className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-violet-500 appearance-none"
                >
                  <option value="">All schools (global)</option>
                  {schools.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-white/70 mb-1.5">Program (optional)</label>
              <select
                value={form.program_id}
                onChange={e => set('program_id', e.target.value)}
                className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-violet-500 appearance-none"
              >
                <option value="">No specific program</option>
                {programs.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Status — edit only */}
          {isEdit && (
            <div>
              <label className="block text-sm font-medium text-white/70 mb-1.5">Status</label>
              <select
                value={form.status}
                onChange={e => set('status', e.target.value as LiveSession['status'])}
                className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-violet-500 appearance-none"
              >
                <option value="scheduled">Scheduled</option>
                <option value="live">Live</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          )}

          {/* Recording URL */}
          <div>
            <label className="block text-sm font-medium text-white/70 mb-1.5">Recording URL (optional)</label>
            <input
              type="url"
              value={form.recording_url}
              onChange={e => set('recording_url', e.target.value)}
              placeholder="https://drive.google.com/..."
              className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/30 focus:outline-none focus:border-violet-500"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-white/70 mb-1.5">Notes (optional)</label>
            <textarea
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              placeholder="Pre-session preparation, materials, links…"
              rows={3}
              className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/30 focus:outline-none focus:border-violet-500 resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/10 flex-shrink-0">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 rounded-xl text-sm font-medium text-white/60 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(form)}
            disabled={saving || !form.title.trim() || !form.scheduled_date || !form.scheduled_time}
            className="px-5 py-2 rounded-xl text-sm font-semibold bg-violet-600 hover:bg-violet-500 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {saving ? (
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <PlusIcon className="w-4 h-4" />
            )}
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
    upcoming: {
      title: 'No upcoming sessions scheduled',
      sub:   'Live and scheduled sessions will appear here.',
    },
    past: {
      title: 'No past sessions yet',
      sub:   'Completed and cancelled sessions will appear here.',
    },
    all: {
      title: 'No sessions found',
      sub:   'Be the first to schedule a live session for your students.',
    },
  };
  const { title, sub } = messages[tab];
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4">
      <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
        <CalendarIcon className="w-8 h-8 text-white/20" />
      </div>
      <div className="text-center">
        <p className="text-white/60 font-semibold">{title}</p>
        <p className="text-white/30 text-sm mt-1">{sub}</p>
      </div>
      {canManage && (
        <button
          onClick={onAdd}
          className="mt-2 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold transition-colors"
        >
          <PlusIcon className="w-4 h-4" />
          Schedule Session
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

  // Modal state
  const [showModal, setShowModal]         = useState(false);
  const [editingSession, setEditingSession] = useState<LiveSession | null>(null);
  const [modalForm, setModalForm]         = useState<SessionForm>(blankForm());
  const [modalError, setModalError]       = useState<string | null>(null);
  const [saving, setSaving]               = useState(false);

  const canManage = profile?.role === 'admin' || profile?.role === 'teacher';
  const isAdmin   = profile?.role === 'admin';

  // ── Load sessions ──────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();

      // Load sessions
      let query = supabase
        .from('live_sessions')
        .select('*, program:programs(name)')
        .order('scheduled_at', { ascending: true });

      // School role: filter to their school
      if (profile.role === 'school' && profile.school_id) {
        query = query.or(`school_id.eq.${profile.school_id},school_id.is.null`);
      }
      // Student: filter to their school or global
      if (profile.role === 'student' && profile.school_id) {
        query = query.or(`school_id.eq.${profile.school_id},school_id.is.null`);
      }

      const { data: rawSessions, error: sessErr } = await query;
      if (sessErr) throw sessErr;

      const rows = (rawSessions ?? []) as unknown as LiveSession[];

      // Load hosts (portal_users) in one go
      const hostIds = [...new Set(rows.map(r => r.host_id).filter(Boolean))];
      let hostsMap: Record<string, { full_name: string; role: string }> = {};
      if (hostIds.length > 0) {
        const { data: hosts } = await supabase
          .from('portal_users')
          .select('id, full_name, role')
          .in('id', hostIds);
        if (hosts) {
          hosts.forEach(h => { hostsMap[h.id] = { full_name: h.full_name, role: h.role }; });
        }
      }

      const merged = rows.map(r => ({
        ...r,
        host: hostsMap[r.host_id] ?? undefined,
      }));

      setSessions(merged);

      // Load schools (admin only)
      if (isAdmin) {
        const { data: sc } = await supabase
          .from('schools')
          .select('id, name')
          .order('name');
        setSchools(sc ?? []);
      }

      // Load programs
      const { data: progs } = await supabase
        .from('programs')
        .select('id, name')
        .order('name');
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
  }, [authLoading, profile?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Filtered sessions ──────────────────────────────────────────────────────

  const filtered = sessions.filter(s => {
    if (filter === 'upcoming') return s.status === 'scheduled' || s.status === 'live';
    if (filter === 'past')     return s.status === 'completed' || s.status === 'cancelled';
    return true;
  });

  // ── Modal helpers ──────────────────────────────────────────────────────────

  function openCreate() {
    setEditingSession(null);
    setModalForm(blankForm());
    setModalError(null);
    setShowModal(true);
  }

  function openEdit(s: LiveSession) {
    const d = new Date(s.scheduled_at);
    const pad = (n: number) => String(n).padStart(2, '0');
    setEditingSession(s);
    setModalForm({
      title:           s.title,
      description:     s.description ?? '',
      platform:        s.platform,
      session_url:     s.session_url ?? '',
      scheduled_date:  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
      scheduled_time:  `${pad(d.getHours())}:${pad(d.getMinutes())}`,
      duration_minutes: s.duration_minutes,
      school_id:       s.school_id ?? '',
      program_id:      s.program_id ?? '',
      status:          s.status,
      recording_url:   s.recording_url ?? '',
      notes:           s.notes ?? '',
    });
    setModalError(null);
    setShowModal(true);
  }

  async function handleSave(form: SessionForm) {
    if (!profile) return;
    setSaving(true);
    setModalError(null);
    try {
      const scheduled_at = new Date(`${form.scheduled_date}T${form.scheduled_time}`).toISOString();

      const payload = {
        title:           form.title.trim(),
        description:     form.description.trim() || null,
        platform:        form.platform,
        session_url:     form.session_url.trim() || null,
        scheduled_at,
        duration_minutes: Number(form.duration_minutes),
        school_id:       form.school_id || null,
        program_id:      form.program_id || null,
        status:          form.status,
        recording_url:   form.recording_url.trim() || null,
        notes:           form.notes.trim() || null,
      };

      if (editingSession) {
        const res = await fetch(`/api/live-sessions/${editingSession.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) { const j = await res.json(); throw new Error(j.error || 'Failed to save'); }
      } else {
        const res = await fetch('/api/live-sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) { const j = await res.json(); throw new Error(j.error || 'Failed to save'); }
      }

      setShowModal(false);
      await loadData();
    } catch (err: any) {
      setModalError(err?.message ?? 'Failed to save session');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this live session? This action cannot be undone.')) return;
    try {
      const res = await fetch(`/api/live-sessions/${id}`, { method: 'DELETE' });
      if (!res.ok) { const j = await res.json(); throw new Error(j.error || 'Failed to delete'); }
      setSessions(prev => prev.filter(s => s.id !== id));
    } catch (err: any) {
      alert(err?.message ?? 'Failed to delete session');
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (authLoading || loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const TABS: { key: FilterTab; label: string; count?: number }[] = [
    {
      key:   'upcoming',
      label: 'Upcoming',
      count: sessions.filter(s => s.status === 'scheduled' || s.status === 'live').length,
    },
    {
      key:   'past',
      label: 'Past',
      count: sessions.filter(s => s.status === 'completed' || s.status === 'cancelled').length,
    },
    { key: 'all', label: 'All', count: sessions.length },
  ];

  return (
    <div className="min-h-screen bg-[#0f0f1a] text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">

        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-10 h-10 rounded-xl bg-violet-500/15 border border-violet-500/25 flex items-center justify-center">
                <VideoCameraIcon className="w-5 h-5 text-violet-400" />
              </div>
              <h1 className="text-2xl font-bold text-white">Live Sessions</h1>
            </div>
            <p className="text-white/40 text-sm ml-[52px]">
              {canManage
                ? 'Schedule and manage live video sessions for your students.'
                : 'Join live sessions and watch recordings from your instructors.'}
            </p>
          </div>
          {canManage && (
            <button
              onClick={openCreate}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold transition-colors flex-shrink-0"
            >
              <PlusIcon className="w-4 h-4" />
              Schedule Session
            </button>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="px-4 py-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm">
            {error}
          </div>
        )}

        {/* Filter Tabs */}
        <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-xl p-1 w-fit">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setFilter(t.key)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                filter === t.key
                  ? 'bg-violet-600 text-white shadow-sm'
                  : 'text-white/50 hover:text-white/80'
              }`}
            >
              {t.label}
              {t.count !== undefined && t.count > 0 && (
                <span
                  className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full ${
                    filter === t.key
                      ? 'bg-white/20 text-white'
                      : 'bg-white/10 text-white/50'
                  }`}
                >
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Live banner */}
        {filter !== 'past' && sessions.some(s => s.status === 'live') && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-400" />
            </span>
            <span className="text-emerald-300 text-sm font-semibold">
              {sessions.filter(s => s.status === 'live').length} session{sessions.filter(s => s.status === 'live').length > 1 ? 's' : ''} live right now
            </span>
          </div>
        )}

        {/* Grid / Empty */}
        {filtered.length === 0 ? (
          <EmptyState tab={filter} canManage={canManage} onAdd={openCreate} />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {filtered.map(s => (
              <SessionCard
                key={s.id}
                session={s}
                canManage={canManage && (isAdmin || s.host_id === profile?.id)}
                currentUserId={profile?.id ?? ''}
                onEdit={openEdit}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>

      {/* Modal */}
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
    </div>
  );
}
