// @refresh reset
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/auth-context';
import {
  ClipboardDocumentListIcon, MagnifyingGlassIcon,
  ArrowPathIcon, DocumentTextIcon,
  ShieldCheckIcon, ChevronLeftIcon, ChevronRightIcon,
} from '@/lib/icons';
import { toast } from 'sonner';

type LogType = 'activity' | 'audit';

interface ActivityLog {
  id: string;
  user_id: string | null;
  school_id: string | null;
  event_type: string;
  metadata: Record<string, any>;
  ip_address: string | null;
  created_at: string;
  portal_users?: { full_name: string; email: string; role: string } | null;
}

interface AuditLog {
  id: string;
  user_id: string | null;
  action: string;
  table_name: string | null;
  record_id: string | null;
  old_values: Record<string, any> | null;
  new_values: Record<string, any> | null;
  ip_address: string | null;
  created_at: string;
  portal_users?: { full_name: string; email: string; role: string } | null;
}

const EVENT_COLORS: Record<string, string> = {
  login:   'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  logout:  'bg-zinc-500/20 text-muted-foreground/70 border-zinc-500/30',
  signup:  'bg-blue-500/20 text-blue-400 border-blue-500/30',
  create:  'bg-violet-500/20 text-violet-400 border-violet-500/30',
  update:  'bg-amber-500/20 text-amber-400 border-amber-500/30',
  delete:  'bg-rose-500/20 text-rose-400 border-rose-500/30',
  view:    'bg-sky-500/20 text-sky-400 border-sky-500/30',
};

function getEventColor(event: string) {
  const lc = event.toLowerCase();
  for (const key of Object.keys(EVENT_COLORS)) {
    if (lc.includes(key)) return EVENT_COLORS[key];
  }
  return 'bg-white/10 text-card-foreground/60 border-white/10';
}

function EventBadge({ event }: { event: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wider ${getEventColor(event)}`}>
      {event}
    </span>
  );
}

export default function ActivityLogsPage() {
  const { profile, loading: authLoading } = useAuth();
  const [logs, setLogs] = useState<(ActivityLog | AuditLog)[]>([]);
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState<LogType>('activity');
  const [search, setSearch] = useState('');
  const [eventFilter, setEventFilter] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const LIMIT = 50;

  const isStaff = profile?.role === 'admin' || profile?.role === 'teacher';

  const load = useCallback(async () => {
    if (!isStaff) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ type, page: String(page), limit: String(LIMIT) });
      if (eventFilter) params.set('event_type', eventFilter);
      if (from) params.set('from', from);
      if (to) params.set('to', to);

      const res = await fetch(`/api/activity-logs?${params}`);
      if (!res.ok) throw new Error('Failed to load');
      const json = await res.json();
      const mappedLogs = (json.data ?? []).map((l: any) => ({
        ...l,
        user_id: l.user_id || null, // interface allows null, but we ensure it's not undefined
        created_at: l.created_at || new Date().toISOString()
      }));
      setLogs(mappedLogs);
      setTotal(json.total ?? 0);
    } catch {
      toast.error('Failed to load logs');
    } finally {
      setLoading(false);
    }
  }, [isStaff, type, page, eventFilter, from, to]);

  useEffect(() => { if (!authLoading) load(); }, [authLoading, load]);

  if (authLoading || !profile) {
    return <div className="flex items-center justify-center min-h-[60vh]"><div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" /></div>;
  }

  if (!isStaff) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <ShieldCheckIcon className="w-16 h-16 text-rose-500/40" />
        <p className="text-card-foreground/50 text-lg font-semibold">Admin access required</p>
      </div>
    );
  }

  const filteredLogs = search
    ? logs.filter(l => {
        const u = l.portal_users;
        const event = 'event_type' in l ? l.event_type : (l as AuditLog).action;
        return (
          event?.toLowerCase().includes(search.toLowerCase()) ||
          u?.full_name?.toLowerCase().includes(search.toLowerCase()) ||
          u?.email?.toLowerCase().includes(search.toLowerCase()) ||
          ('table_name' in l && (l as AuditLog).table_name?.toLowerCase().includes(search.toLowerCase()))
        );
      })
    : logs;

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-card-foreground flex items-center gap-2">
            <ClipboardDocumentListIcon className="w-7 h-7 text-violet-400" />
            Activity & Audit Logs
          </h1>
          <p className="text-card-foreground/50 text-sm mt-0.5">
            {total.toLocaleString()} records · page {page} of {totalPages || 1}
          </p>
        </div>
        <button onClick={load} className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm font-bold text-card-foreground/70 transition-all">
          <ArrowPathIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {/* Tab Switch */}
      <div className="flex gap-2 bg-white/[0.03] border border-white/[0.08] rounded-xl p-1 w-fit">
        {([['activity', 'Activity Logs', ClipboardDocumentListIcon], ['audit', 'Audit Trail', ShieldCheckIcon]] as const).map(([t, label, Icon]) => (
          <button key={t} onClick={() => { setType(t); setPage(1); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${type === t ? 'bg-violet-500 text-white shadow-lg shadow-violet-500/20' : 'text-card-foreground/60 hover:text-card-foreground hover:bg-white/5'}`}>
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="relative">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-card-foreground/30" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search logs…"
            className="w-full pl-9 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-card-foreground placeholder-card-foreground/30 focus:outline-none focus:border-violet-500/50" />
        </div>
        <input value={eventFilter} onChange={e => { setEventFilter(e.target.value); setPage(1); }}
          placeholder={type === 'activity' ? 'Filter by event type…' : 'Filter by action…'}
          className="px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-card-foreground placeholder-card-foreground/30 focus:outline-none focus:border-violet-500/50" />
        <input type="date" value={from} onChange={e => { setFrom(e.target.value); setPage(1); }}
          className="px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-card-foreground focus:outline-none focus:border-violet-500/50" />
        <input type="date" value={to} onChange={e => { setTo(e.target.value); setPage(1); }}
          className="px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-card-foreground focus:outline-none focus:border-violet-500/50" />
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-20"><div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : filteredLogs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <DocumentTextIcon className="w-16 h-16 text-card-foreground/10" />
          <p className="text-card-foreground/40 font-semibold">No logs found</p>
        </div>
      ) : (
        <div className="bg-card border border-white/[0.08] rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.08] bg-white/[0.02]">
                  <th className="text-left px-4 py-3 text-xs font-black uppercase tracking-wider text-card-foreground/40">
                    {type === 'activity' ? 'Event' : 'Action'}
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-black uppercase tracking-wider text-card-foreground/40">User</th>
                  {type === 'audit' && (
                    <th className="text-left px-4 py-3 text-xs font-black uppercase tracking-wider text-card-foreground/40">Table</th>
                  )}
                  <th className="text-left px-4 py-3 text-xs font-black uppercase tracking-wider text-card-foreground/40">
                    {type === 'activity' ? 'Metadata' : 'Changes'}
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-black uppercase tracking-wider text-card-foreground/40">IP</th>
                  <th className="text-left px-4 py-3 text-xs font-black uppercase tracking-wider text-card-foreground/40">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {filteredLogs.map(log => {
                  const event = 'event_type' in log ? log.event_type : (log as AuditLog).action;
                  const user = log.portal_users;
                  const meta = 'metadata' in log ? (log as ActivityLog).metadata : (log as AuditLog).new_values;
                  const ip = log.ip_address ? String(log.ip_address) : null;
                  return (
                    <tr key={log.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-3"><EventBadge event={event} /></td>
                      <td className="px-4 py-3">
                        {user ? (
                          <div>
                            <p className="font-semibold text-card-foreground text-xs">{user.full_name}</p>
                            <p className="text-card-foreground/40 text-[10px]">{user.email}</p>
                          </div>
                        ) : (
                          <span className="text-card-foreground/30 text-xs">System</span>
                        )}
                      </td>
                      {type === 'audit' && (
                        <td className="px-4 py-3 text-xs font-mono text-card-foreground/60">
                          {'table_name' in log ? (log as AuditLog).table_name ?? '—' : '—'}
                        </td>
                      )}
                      <td className="px-4 py-3">
                        {meta && Object.keys(meta).length > 0 ? (
                          <pre className="text-[10px] text-card-foreground/60 font-mono max-w-[200px] overflow-hidden text-ellipsis whitespace-nowrap">
                            {JSON.stringify(meta)}
                          </pre>
                        ) : <span className="text-card-foreground/30 text-xs">—</span>}
                      </td>
                      <td className="px-4 py-3 text-xs font-mono text-card-foreground/40">{ip ?? '—'}</td>
                      <td className="px-4 py-3 text-xs text-card-foreground/50 whitespace-nowrap">
                        {new Date(log.created_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
            className="p-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg disabled:opacity-40 transition-all">
            <ChevronLeftIcon className="w-4 h-4 text-card-foreground/70" />
          </button>
          <span className="text-sm text-card-foreground/60 font-semibold">Page {page} of {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
            className="p-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg disabled:opacity-40 transition-all">
            <ChevronRightIcon className="w-4 h-4 text-card-foreground/70" />
          </button>
        </div>
      )}
    </div>
  );
}
