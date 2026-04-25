// @refresh reset
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/auth-context';
import {
  TrophyIcon, StarIcon, BoltIcon, PlusIcon, PencilIcon, TrashIcon,
  UserGroupIcon, ArrowPathIcon, CheckCircleIcon, XMarkIcon,
  CheckBadgeIcon, SparklesIcon, FireIcon, AcademicCapIcon,
  MagnifyingGlassIcon, ChevronDownIcon,
} from '@/lib/icons';
import { toast } from 'sonner';

interface Badge {
  id: string;
  name: string;
  description: string | null;
  icon_url: string | null;
  criteria: Record<string, any>;
  points_value: number;
  is_active: boolean;
  school_id: string | null;
  created_at: string;
}

interface UserPoints {
  portal_user_id: string;
  total_points: number;
  current_streak: number;
  longest_streak: number;
  achievement_level: 'Bronze' | 'Silver' | 'Gold' | 'Platinum';
  last_activity_date: string | null;
  portal_users?: { id: string; full_name: string; email: string; school_id: string | null; section_class: string | null };
}

const LEVEL_CONFIG = {
  Bronze:   { color: 'text-amber-700 bg-amber-700/20 border-amber-700/30',   min: 0,    emoji: '🥉' },
  Silver:   { color: 'text-zinc-400 bg-zinc-400/20 border-zinc-400/30',      min: 500,  emoji: '🥈' },
  Gold:     { color: 'text-yellow-400 bg-yellow-400/20 border-yellow-400/30', min: 2000, emoji: '🥇' },
  Platinum: { color: 'text-cyan-400 bg-cyan-400/20 border-cyan-400/30',       min: 5000, emoji: '💎' },
};

function LevelBadge({ level }: { level: keyof typeof LEVEL_CONFIG }) {
  const cfg = LEVEL_CONFIG[level] ?? LEVEL_CONFIG.Bronze;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border ${cfg.color}`}>
      {cfg.emoji} {level}
    </span>
  );
}

const BADGE_ICONS = ['🏆', '⭐', '🎯', '🚀', '💡', '🔥', '🎓', '💻', '🤖', '🌟', '🥇', '💎', '🏅', '🎖', '🦁', '🐉'];

export default function GamificationPage() {
  const { profile, loading: authLoading } = useAuth();
  const [tab, setTab] = useState<'badges' | 'points'>('badges');
  const [badges, setBadges] = useState<Badge[]>([]);
  const [leaderboard, setLeaderboard] = useState<UserPoints[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editBadge, setEditBadge] = useState<Badge | null>(null);
  const [showAward, setShowAward] = useState<Badge | null>(null);
  const [students, setStudents] = useState<any[]>([]);
  const [awardUserId, setAwardUserId] = useState('');
  const [awardNotes, setAwardNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({ name: '', description: '', icon_url: '🏆', points_value: 10, criteria: '' });

  const isAdmin = profile?.role === 'admin';
  const isStaff = isAdmin || profile?.role === 'teacher';

  const loadBadges = useCallback(async () => {
    const res = await fetch('/api/badges');
    if (res.ok) { const j = await res.json(); setBadges(j.data ?? []); }
  }, []);

  const loadLeaderboard = useCallback(async () => {
    const res = await fetch('/api/user-points?leaderboard=true&limit=50');
    if (res.ok) { const j = await res.json(); setLeaderboard(j.data ?? []); }
  }, []);

  const loadStudents = useCallback(async () => {
    const res = await fetch('/api/portal-users?role=student&scoped=true');
    if (res.ok) { const j = await res.json(); setStudents(j.data ?? []); }
  }, []);

  useEffect(() => {
    if (authLoading || !profile) return;
    setLoading(true);
    Promise.all([loadBadges(), loadLeaderboard()]).finally(() => setLoading(false));
  }, [authLoading, profile, loadBadges, loadLeaderboard]);

  async function saveBadge() {
    setSubmitting(true);
    try {
      const payload = { ...form, points_value: Number(form.points_value), criteria: form.criteria ? JSON.parse(form.criteria) : {} };
      if (editBadge) {
        await fetch(`/api/badges/${editBadge.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        toast.success('Badge updated');
      } else {
        await fetch('/api/badges', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        toast.success('Badge created');
      }
      setShowForm(false); setEditBadge(null);
      setForm({ name: '', description: '', icon_url: '🏆', points_value: 10, criteria: '' });
      loadBadges();
    } catch { toast.error('Failed to save badge'); }
    finally { setSubmitting(false); }
  }

  async function deleteBadge(id: string) {
    if (!confirm('Deactivate this badge?')) return;
    await fetch(`/api/badges/${id}`, { method: 'DELETE' });
    toast.success('Badge deactivated');
    loadBadges();
  }

  async function awardBadge() {
    if (!awardUserId || !showAward) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/badges/award', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ badge_id: showAward.id, portal_user_id: awardUserId, notes: awardNotes }),
      });
      if (!res.ok) { const j = await res.json(); throw new Error(j.error); }
      toast.success('Badge awarded!');
      setShowAward(null); setAwardUserId(''); setAwardNotes('');
    } catch (e: any) { toast.error(e.message || 'Failed to award badge'); }
    finally { setSubmitting(false); }
  }

  if (authLoading || !profile) {
    return <div className="flex items-center justify-center min-h-[60vh]"><div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" /></div>;
  }

  const filteredBadges = badges.filter(b => !search || b.name.toLowerCase().includes(search.toLowerCase()));
  const filteredLeader = leaderboard.filter(u => !search || u.portal_users?.full_name?.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-card-foreground flex items-center gap-2">
            <TrophyIcon className="w-7 h-7 text-yellow-400" />
            Gamification Hub
          </h1>
          <p className="text-card-foreground/50 text-sm mt-0.5">Manage badges, points, and student achievements</p>
        </div>
        {isAdmin && tab === 'badges' && (
          <button onClick={() => { setShowForm(true); setEditBadge(null); setForm({ name: '', description: '', icon_url: '🏆', points_value: 10, criteria: '' }); }}
            className="flex items-center gap-2 px-4 py-2 bg-yellow-500 hover:bg-yellow-400 text-black font-bold rounded-xl transition-all shadow-lg shadow-yellow-500/20">
            <PlusIcon className="w-4 h-4" /> New Badge
          </button>
        )}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Badges', value: badges.length, icon: CheckBadgeIcon, color: 'text-yellow-400' },
          { label: 'Students Ranked', value: leaderboard.length, icon: UserGroupIcon, color: 'text-violet-400' },
          { label: 'Top Points', value: leaderboard[0]?.total_points?.toLocaleString() ?? '—', icon: BoltIcon, color: 'text-emerald-400' },
          { label: 'Platinum Users', value: leaderboard.filter(u => u.achievement_level === 'Platinum').length, icon: SparklesIcon, color: 'text-cyan-400' },
        ].map(s => (
          <div key={s.label} className="bg-card border border-white/[0.08] rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <s.icon className={`w-5 h-5 ${s.color}`} />
              <span className="text-2xl font-black text-card-foreground">{s.value}</span>
            </div>
            <p className="text-xs font-bold text-card-foreground/40 uppercase tracking-wider">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 bg-white/[0.03] border border-white/[0.08] rounded-xl p-1 w-fit">
        {([['badges', 'Badges', CheckBadgeIcon], ['points', 'Points Leaderboard', BoltIcon]] as const).map(([t, label, Icon]) => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${tab === t ? 'bg-yellow-500 text-black shadow-lg shadow-yellow-500/20' : 'text-card-foreground/60 hover:text-card-foreground hover:bg-white/5'}`}>
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative w-full sm:w-80">
        <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-card-foreground/30" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder={tab === 'badges' ? 'Search badges…' : 'Search students…'}
          className="w-full pl-9 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-card-foreground placeholder-card-foreground/30 focus:outline-none focus:border-yellow-500/50" />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><div className="w-10 h-10 border-4 border-yellow-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : tab === 'badges' ? (
        /* ── Badges Grid ── */
        filteredBadges.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <CheckBadgeIcon className="w-16 h-16 text-card-foreground/10" />
            <p className="text-card-foreground/40 font-semibold">No badges yet</p>
            {isAdmin && <button onClick={() => setShowForm(true)} className="text-yellow-400 text-sm font-bold hover:underline">Create the first badge</button>}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredBadges.map(badge => (
              <div key={badge.id} className="bg-card border border-white/[0.08] rounded-2xl p-5 hover:border-yellow-500/30 transition-all group">
                <div className="flex items-start justify-between mb-3">
                  <div className="w-12 h-12 bg-yellow-500/10 border border-yellow-500/20 rounded-xl flex items-center justify-center text-2xl">
                    {badge.icon_url && badge.icon_url.length <= 4 ? badge.icon_url : <TrophyIcon className="w-6 h-6 text-yellow-400" />}
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {isAdmin && (
                      <>
                        <button onClick={() => { setEditBadge(badge); setForm({ name: badge.name, description: badge.description ?? '', icon_url: badge.icon_url ?? '🏆', points_value: badge.points_value, criteria: badge.criteria ? JSON.stringify(badge.criteria) : '' }); setShowForm(true); }}
                          className="p-1.5 hover:bg-white/10 rounded-lg transition-all">
                          <PencilIcon className="w-4 h-4 text-card-foreground/50" />
                        </button>
                        <button onClick={() => deleteBadge(badge.id)} className="p-1.5 hover:bg-rose-500/20 rounded-lg transition-all">
                          <TrashIcon className="w-4 h-4 text-rose-400" />
                        </button>
                      </>
                    )}
                    {isStaff && (
                      <button onClick={() => { setShowAward(badge); setAwardUserId(''); loadStudents(); }}
                        className="px-2.5 py-1 bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400 text-xs font-bold rounded-lg transition-all">
                        Award
                      </button>
                    )}
                  </div>
                </div>
                <h3 className="font-black text-card-foreground text-base">{badge.name}</h3>
                {badge.description && <p className="text-card-foreground/50 text-sm mt-1">{badge.description}</p>}
                <div className="flex items-center gap-2 mt-3">
                  <span className="text-xs text-yellow-400 font-bold bg-yellow-500/10 px-2 py-0.5 rounded-full">+{badge.points_value} pts</span>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${badge.is_active ? 'bg-emerald-500/10 text-emerald-400' : 'bg-zinc-500/10 text-zinc-400'}`}>
                    {badge.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        /* ── Leaderboard ── */
        <div className="bg-card border border-white/[0.08] rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.08] bg-white/[0.02]">
                  <th className="text-left px-4 py-3 text-xs font-black uppercase tracking-wider text-card-foreground/40">Rank</th>
                  <th className="text-left px-4 py-3 text-xs font-black uppercase tracking-wider text-card-foreground/40">Student</th>
                  <th className="text-left px-4 py-3 text-xs font-black uppercase tracking-wider text-card-foreground/40">Level</th>
                  <th className="text-left px-4 py-3 text-xs font-black uppercase tracking-wider text-card-foreground/40">Points</th>
                  <th className="text-left px-4 py-3 text-xs font-black uppercase tracking-wider text-card-foreground/40">Streak</th>
                  <th className="text-left px-4 py-3 text-xs font-black uppercase tracking-wider text-card-foreground/40">Last Active</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {filteredLeader.map((entry, idx) => (
                  <tr key={entry.portal_user_id} className={`hover:bg-white/[0.02] transition-colors ${idx < 3 ? 'bg-brand-red-500/5' : ''}`}>
                    <td className="px-4 py-3">
                      <span className={`text-xl ${idx === 0 ? '' : idx === 1 ? '' : idx === 2 ? '' : 'text-card-foreground/40 text-sm font-bold'}`}>
                        {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-semibold text-card-foreground">{entry.portal_users?.full_name ?? 'Unknown'}</p>
                        <p className="text-xs text-card-foreground/40">{entry.portal_users?.section_class ?? '—'}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3"><LevelBadge level={entry.achievement_level} /></td>
                    <td className="px-4 py-3">
                      <span className="font-black text-yellow-400 text-base">{entry.total_points.toLocaleString()}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <FireIcon className="w-3.5 h-3.5 text-orange-400" />
                        <span className="font-bold text-card-foreground">{entry.current_streak ?? 0}</span>
                        <span className="text-xs text-card-foreground/40">days</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-card-foreground/50">
                      {entry.last_activity_date ? new Date(entry.last_activity_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Badge Form Modal */}
      {showForm && isAdmin && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-white/[0.12] rounded-2xl w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-white/[0.08]">
              <h3 className="font-black text-card-foreground text-lg">{editBadge ? 'Edit Badge' : 'Create Badge'}</h3>
              <button onClick={() => setShowForm(false)} className="p-1.5 hover:bg-white/5 rounded-lg"><XMarkIcon className="w-5 h-5 text-card-foreground/50" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-card-foreground/50 uppercase mb-1.5">Icon</label>
                <div className="flex flex-wrap gap-2">
                  {BADGE_ICONS.map(icon => (
                    <button key={icon} onClick={() => setForm(f => ({ ...f, icon_url: icon }))}
                      className={`w-9 h-9 text-xl rounded-lg transition-all ${form.icon_url === icon ? 'bg-yellow-500/30 ring-2 ring-yellow-500' : 'bg-white/5 hover:bg-white/10'}`}>
                      {icon}
                    </button>
                  ))}
                </div>
              </div>
              {[
                { key: 'name', label: 'Badge Name', placeholder: 'e.g. Perfect Attendance', type: 'text' },
                { key: 'description', label: 'Description', placeholder: 'What earns this badge?', type: 'text' },
                { key: 'points_value', label: 'Points Value', placeholder: '10', type: 'number' },
              ].map(f => (
                <div key={f.key}>
                  <label className="block text-xs font-bold text-card-foreground/50 uppercase mb-1.5">{f.label}</label>
                  <input type={f.type} value={(form as any)[f.key]} onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-card-foreground placeholder-card-foreground/30 focus:outline-none focus:border-yellow-500/50" />
                </div>
              ))}
            </div>
            <div className="flex gap-3 p-5 border-t border-white/[0.08]">
              <button onClick={() => setShowForm(false)} className="flex-1 py-2.5 bg-white/5 hover:bg-white/10 text-card-foreground/70 font-bold rounded-xl transition-all">Cancel</button>
              <button onClick={saveBadge} disabled={submitting || !form.name}
                className="flex-1 py-2.5 bg-yellow-500 hover:bg-yellow-400 disabled:opacity-50 text-black font-bold rounded-xl transition-all">
                {submitting ? 'Saving…' : editBadge ? 'Update Badge' : 'Create Badge'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Award Modal */}
      {showAward && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-white/[0.12] rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-white/[0.08]">
              <h3 className="font-black text-card-foreground">Award Badge</h3>
              <button onClick={() => setShowAward(null)} className="p-1.5 hover:bg-white/5 rounded-lg"><XMarkIcon className="w-5 h-5 text-card-foreground/50" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="flex items-center gap-3 bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-3">
                <span className="text-3xl">{showAward.icon_url && showAward.icon_url.length <= 4 ? showAward.icon_url : '🏆'}</span>
                <div>
                  <p className="font-bold text-card-foreground">{showAward.name}</p>
                  <p className="text-xs text-yellow-400">+{showAward.points_value} points</p>
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-card-foreground/50 uppercase mb-1.5">Select Student</label>
                <select value={awardUserId} onChange={e => setAwardUserId(e.target.value)}
                  className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-card-foreground focus:outline-none focus:border-yellow-500/50">
                  <option value="">Choose a student…</option>
                  {students.map((s: any) => (
                    <option key={s.id} value={s.id}>{s.full_name} — {s.email}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-card-foreground/50 uppercase mb-1.5">Notes (optional)</label>
                <input value={awardNotes} onChange={e => setAwardNotes(e.target.value)} placeholder="Why are you awarding this badge?"
                  className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-card-foreground placeholder-card-foreground/30 focus:outline-none focus:border-yellow-500/50" />
              </div>
            </div>
            <div className="flex gap-3 p-5 border-t border-white/[0.08]">
              <button onClick={() => setShowAward(null)} className="flex-1 py-2.5 bg-white/5 hover:bg-white/10 text-card-foreground/70 font-bold rounded-xl transition-all">Cancel</button>
              <button onClick={awardBadge} disabled={submitting || !awardUserId}
                className="flex-1 py-2.5 bg-yellow-500 hover:bg-yellow-400 disabled:opacity-50 text-black font-bold rounded-xl transition-all">
                {submitting ? 'Awarding…' : 'Award Badge'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
