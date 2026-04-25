// @refresh reset
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/auth-context';
import {
  ShieldExclamationIcon, CheckCircleIcon, XCircleIcon, ClockIcon,
  MagnifyingGlassIcon, FunnelIcon, ArrowPathIcon, EyeIcon,
  ExclamationTriangleIcon, ChatBubbleLeftRightIcon, UserIcon,
  TrashIcon, CheckIcon, XMarkIcon, InformationCircleIcon,
} from '@/lib/icons';
import { toast } from 'sonner';

type FlagStatus = 'pending' | 'reviewed' | 'dismissed' | 'removed';

interface FlaggedItem {
  id: string;
  school_id: string | null;
  reporter_id: string;
  content_type: 'topic' | 'reply';
  content_id: string;
  reason: string;
  status: FlagStatus;
  moderator_id: string | null;
  moderator_notes: string | null;
  created_at: string;
  updated_at: string;
  reporter?: { full_name: string; email: string } | null;
}

const STATUS_CONFIG: Record<FlagStatus, { label: string; color: string; icon: any }> = {
  pending:   { label: 'Pending',   color: 'bg-amber-500/20 text-amber-400 border-amber-500/30',   icon: ClockIcon },
  reviewed:  { label: 'Reviewed',  color: 'bg-blue-500/20 text-blue-400 border-blue-500/30',      icon: EyeIcon },
  dismissed: { label: 'Dismissed', color: 'bg-zinc-500/20 text-muted-foreground/70 border-zinc-500/30',      icon: XCircleIcon },
  removed:   { label: 'Removed',   color: 'bg-rose-500/20 text-rose-400 border-rose-500/30',      icon: TrashIcon },
};

function StatusBadge({ status }: { status: FlagStatus }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold border ${cfg.color}`}>
      <Icon className="w-3 h-3" /> {cfg.label}
    </span>
  );
}

export default function ModerationPage() {
  const { profile, loading: authLoading } = useAuth();
  const [items, setItems] = useState<FlaggedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<FlagStatus | 'all'>('pending');
  const [selected, setSelected] = useState<FlaggedItem | null>(null);
  const [notes, setNotes] = useState('');
  const [resolving, setResolving] = useState(false);

  const isAdmin = profile?.role === 'admin';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/moderation');
      if (!res.ok) throw new Error('Failed to load');
      const json = await res.json();
      setItems(json.data ?? []);
    } catch {
      toast.error('Failed to load flagged content');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && isAdmin) load();
  }, [authLoading, isAdmin, load]);

  async function resolve(id: string, status: 'resolved' | 'dismissed') {
    setResolving(true);
    try {
      const res = await fetch('/api/moderation', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status, moderator_notes: notes }),
      });
      if (!res.ok) throw new Error('Failed to update');
      toast.success(`Item ${status === 'resolved' ? 'resolved' : 'dismissed'}`);
      setSelected(null);
      setNotes('');
      load();
    } catch {
      toast.error('Action failed');
    } finally {
      setResolving(false);
    }
  }

  if (authLoading || !profile) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <ShieldExclamationIcon className="w-16 h-16 text-rose-500/40" />
        <p className="text-card-foreground/50 text-lg font-semibold">Admin access required</p>
      </div>
    );
  }

  const filtered = items.filter(item => {
    const matchStatus = statusFilter === 'all' || item.status === statusFilter;
    const matchSearch = !search || item.reason.toLowerCase().includes(search.toLowerCase()) ||
      item.reporter?.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      item.reporter?.email?.toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchSearch;
  });

  const counts = {
    all: items.length,
    pending: items.filter(i => i.status === 'pending').length,
    reviewed: items.filter(i => i.status === 'reviewed').length,
    dismissed: items.filter(i => i.status === 'dismissed').length,
    removed: items.filter(i => i.status === 'removed').length,
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-card-foreground flex items-center gap-2">
            <ShieldExclamationIcon className="w-7 h-7 text-rose-400" />
            Content Moderation
          </h1>
          <p className="text-card-foreground/50 text-sm mt-0.5">Review and action flagged community content</p>
        </div>
        <button onClick={load} className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm font-bold text-card-foreground/70 transition-all">
          <ArrowPathIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {(['pending', 'reviewed', 'dismissed', 'removed'] as FlagStatus[]).map(s => {
          const cfg = STATUS_CONFIG[s];
          const Icon = cfg.icon;
          return (
            <button key={s} onClick={() => setStatusFilter(s === statusFilter ? 'all' : s)}
              className={`bg-card border rounded-xl p-4 text-left transition-all hover:border-white/20 ${statusFilter === s ? 'border-violet-500/50 bg-violet-500/5' : 'border-white/[0.08]'}`}>
              <div className="flex items-center justify-between mb-2">
                <Icon className={`w-5 h-5 ${cfg.color.split(' ')[1]}`} />
                <span className="text-2xl font-black text-card-foreground">{counts[s]}</span>
              </div>
              <p className="text-xs font-bold text-card-foreground/50 uppercase tracking-wider">{cfg.label}</p>
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-card-foreground/30" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by reason or reporter…"
            className="w-full pl-9 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-card-foreground placeholder-card-foreground/30 focus:outline-none focus:border-violet-500/50"
          />
        </div>
        <div className="flex items-center gap-2">
          <FunnelIcon className="w-4 h-4 text-card-foreground/40" />
          {(['all', 'pending', 'reviewed', 'dismissed', 'removed'] as const).map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition-all ${statusFilter === s ? 'bg-violet-500 text-white' : 'bg-white/5 text-card-foreground/60 hover:bg-white/10'}`}>
              {s === 'all' ? `All (${counts.all})` : s}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <CheckCircleIcon className="w-16 h-16 text-emerald-500/30" />
          <p className="text-card-foreground/40 font-semibold">No flagged content found</p>
        </div>
      ) : (
        <div className="bg-card border border-white/[0.08] rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.08] bg-white/[0.02]">
                  <th className="text-left px-4 py-3 text-xs font-black uppercase tracking-wider text-card-foreground/40">Type</th>
                  <th className="text-left px-4 py-3 text-xs font-black uppercase tracking-wider text-card-foreground/40">Reason</th>
                  <th className="text-left px-4 py-3 text-xs font-black uppercase tracking-wider text-card-foreground/40">Reporter</th>
                  <th className="text-left px-4 py-3 text-xs font-black uppercase tracking-wider text-card-foreground/40">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-black uppercase tracking-wider text-card-foreground/40">Reported</th>
                  <th className="text-right px-4 py-3 text-xs font-black uppercase tracking-wider text-card-foreground/40">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {filtered.map(item => (
                  <tr key={item.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border ${item.content_type === 'topic' ? 'bg-violet-500/20 text-violet-400 border-violet-500/30' : 'bg-blue-500/20 text-blue-400 border-blue-500/30'}`}>
                        <ChatBubbleLeftRightIcon className="w-3 h-3" />
                        {item.content_type}
                      </span>
                    </td>
                    <td className="px-4 py-3 max-w-xs">
                      <p className="text-card-foreground font-medium truncate">{item.reason}</p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 bg-violet-500/20 rounded-full flex items-center justify-center">
                          <UserIcon className="w-3.5 h-3.5 text-violet-400" />
                        </div>
                        <div>
                          <p className="font-semibold text-card-foreground text-xs">{item.reporter?.full_name ?? 'Unknown'}</p>
                          <p className="text-card-foreground/40 text-[10px]">{item.reporter?.email ?? '—'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={item.status} /></td>
                    <td className="px-4 py-3 text-card-foreground/50 text-xs whitespace-nowrap">
                      {new Date(item.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {item.status === 'pending' && (
                        <button onClick={() => { setSelected(item); setNotes(''); }}
                          className="px-3 py-1.5 bg-violet-500/20 hover:bg-violet-500/30 text-violet-400 text-xs font-bold rounded-lg transition-all">
                          Review
                        </button>
                      )}
                      {item.moderator_notes && (
                        <span title={item.moderator_notes}>
                          <InformationCircleIcon className="w-4 h-4 text-card-foreground/30 inline ml-2" />
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Review Modal */}
      {selected && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-white/[0.12] rounded-2xl w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-white/[0.08]">
              <h3 className="font-black text-card-foreground text-lg">Review Flagged Content</h3>
              <button onClick={() => setSelected(null)} className="p-1.5 hover:bg-white/5 rounded-lg">
                <XMarkIcon className="w-5 h-5 text-card-foreground/50" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-card-foreground/40 uppercase">Content Type</span>
                  <span className="capitalize text-sm font-bold text-card-foreground">{selected.content_type}</span>
                </div>
                <div>
                  <span className="text-xs font-bold text-card-foreground/40 uppercase">Reason</span>
                  <p className="text-sm text-card-foreground mt-1">{selected.reason}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-card-foreground/40 uppercase">Reporter</span>
                  <span className="text-sm text-card-foreground">{selected.reporter?.full_name} ({selected.reporter?.email})</span>
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-card-foreground/50 uppercase tracking-wider mb-1.5">Moderator Notes (optional)</label>
                <textarea
                  value={notes} onChange={e => setNotes(e.target.value)}
                  rows={3}
                  placeholder="Add notes about your decision…"
                  className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-card-foreground placeholder-card-foreground/30 focus:outline-none focus:border-violet-500/50 resize-none"
                />
              </div>
            </div>
            <div className="flex gap-3 p-5 border-t border-white/[0.08]">
              <button onClick={() => resolve(selected.id, 'dismissed')} disabled={resolving}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-zinc-500/20 hover:bg-zinc-500/30 text-zinc-300 font-bold rounded-xl transition-all disabled:opacity-50">
                <XMarkIcon className="w-4 h-4" /> Dismiss
              </button>
              <button onClick={() => resolve(selected.id, 'resolved')} disabled={resolving}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-rose-500 hover:bg-rose-600 text-white font-bold rounded-xl transition-all disabled:opacity-50">
                <CheckIcon className="w-4 h-4" /> Take Action
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
