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
import {
  formatAuditDetail,
  formatAuditItem,
  formatAuditWho,
  humanizeAuditAction,
} from '@/lib/audit/humanize';

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
  resource_type: string | null;
  resource_id: string | null;
  table_name: string | null;
  record_id: string | null;
  old_value: string | null;
  new_value: string | null;
  old_values: Record<string, any> | null;
  new_values: Record<string, any> | null;
  ip_address: string | null;
  created_at: string;
  portal_users?: { full_name: string; email: string; role: string } | null;
}

const EVENT_COLORS: Record<string, string> = {
  login:   'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  logout:  'bg-zinc-500/20 text-muted-foreground/70 border-zinc-500/30',
  signup:  'bg-primary/20 text-primary border-primary/30',
  create:  'bg-primary/20 text-primary border-primary/30',
  update:  'bg-amber-500/20 text-amber-400 border-amber-500/30',
  delete:  'bg-rose-500/20 text-rose-400 border-rose-500/30',
  view:    'bg-sky-500/20 text-sky-400 border-sky-500/30',
  report:  'bg-sky-500/20 text-sky-400 border-sky-500/30',
  opened:  'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  blocked: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
  printed: 'bg-primary/20 text-primary border-primary/30',
  downloaded: 'bg-primary/20 text-primary border-primary/30',
  approved: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  rejected: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
  paid: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  graded: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
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
  // Admins land on the Audit Trail (the populated, cross-cutting record of sensitive
  // actions); teachers/school users default to their scoped Activity feed.
  const [type, setType] = useState<LogType>('activity');
  const [typePinned, setTypePinned] = useState(false);
  const [search, setSearch] = useState('');
  const [eventFilter, setEventFilter] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const LIMIT = 50;

  const isStaff = profile?.role === 'admin' || profile?.role === 'teacher';

  // Default admins to the Audit Trail tab once their role is known (unless they've picked one).
  useEffect(() => {
    if (!typePinned && profile?.role === 'admin') setType('audit');
  }, [profile?.role, typePinned]);

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
    return <div className="flex items-center justify-center min-h-[60vh]"><div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>;
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
        const audit = 'event_type' in l ? null : (l as AuditLog);
        const detail = audit ? formatAuditDetail(audit) : null;
        const item = audit ? formatAuditItem(audit) : '';
        const nv = audit?.new_values;
        const hay = [
          event,
          humanizeAuditAction(event || ''),
          u?.full_name,
          u?.email,
          detail,
          item,
          typeof nv?.student_name === 'string' ? nv.student_name : '',
          typeof nv?.school_name === 'string' ? nv.school_name : '',
          typeof nv?.report_id_short === 'string' ? nv.report_id_short : '',
          typeof nv?.invoice_number === 'string' ? nv.invoice_number : '',
          typeof nv?.receipt_number === 'string' ? nv.receipt_number : '',
          audit?.table_name,
        ].join(' ').toLowerCase();
        return hay.includes(search.toLowerCase());
      })
    : logs;

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-card-foreground flex items-center gap-2">
            <ClipboardDocumentListIcon className="w-7 h-7 text-primary" />
            Activity & Audit Logs
          </h1>
          <p className="text-card-foreground/50 text-sm mt-0.5">
            {total.toLocaleString()} records · page {page} of {totalPages || 1}
            {type === 'audit' ? ' · Plain-language trail of who did what' : ''}
          </p>
        </div>
        <button onClick={load} className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm font-bold text-card-foreground/70 transition-all">
          <ArrowPathIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {/* Tab Switch */}
      <div className="flex gap-2 bg-white/[0.03] border border-white/[0.08] rounded-xl p-1 w-fit">
        {([['audit', 'Audit Trail', ShieldCheckIcon], ['activity', 'System Errors', ClipboardDocumentListIcon]] as const).map(([t, label, Icon]) => (
          <button key={t} onClick={() => { setType(t); setTypePinned(true); setPage(1); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${type === t ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'text-card-foreground/60 hover:text-card-foreground hover:bg-white/5'}`}>
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="relative">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-card-foreground/30" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder={type === 'audit' ? 'Search student, school, invoice, report…' : 'Search logs…'}
            className="w-full pl-9 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-card-foreground placeholder-card-foreground/30 focus:outline-none focus:border-primary/50" />
        </div>
        <input value={eventFilter} onChange={e => { setEventFilter(e.target.value); setPage(1); }}
          placeholder={type === 'activity' ? 'Filter by event type…' : 'Filter by action…'}
          className="px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-card-foreground placeholder-card-foreground/30 focus:outline-none focus:border-primary/50" />
        <input type="date" value={from} onChange={e => { setFrom(e.target.value); setPage(1); }}
          className="px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-card-foreground focus:outline-none focus:border-primary/50" />
        <input type="date" value={to} onChange={e => { setTo(e.target.value); setPage(1); }}
          className="px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-card-foreground focus:outline-none focus:border-primary/50" />
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-20"><div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>
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
                    {type === 'activity' ? 'Event' : 'What happened'}
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-black uppercase tracking-wider text-card-foreground/40">
                    {type === 'audit' ? 'Who' : 'User'}
                  </th>
                  {type === 'audit' && (
                    <th className="text-left px-4 py-3 text-xs font-black uppercase tracking-wider text-card-foreground/40">About</th>
                  )}
                  <th className="text-left px-4 py-3 text-xs font-black uppercase tracking-wider text-card-foreground/40">
                    {type === 'activity' ? 'Metadata' : 'Details'}
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-black uppercase tracking-wider text-card-foreground/40">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {filteredLogs.map(log => {
                  const isAudit = !('event_type' in log);
                  const rawEvent = 'event_type' in log ? log.event_type : (log as AuditLog).action;
                  const label = isAudit ? humanizeAuditAction((log as AuditLog).action) : rawEvent;
                  const who = isAudit
                    ? formatAuditWho(log as AuditLog)
                    : log.portal_users
                      ? { title: log.portal_users.full_name, subtitle: log.portal_users.email }
                      : { title: 'System', subtitle: null };
                  const change = isAudit
                    ? formatAuditDetail(log as AuditLog)
                    : (() => {
                        const m = (log as ActivityLog).metadata;
                        return m && Object.keys(m).length > 0 ? JSON.stringify(m) : null;
                      })();
                  return (
                    <tr key={log.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-3"><EventBadge event={label} /></td>
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-semibold text-card-foreground text-xs">{who.title}</p>
                          {who.subtitle && <p className="text-card-foreground/40 text-[10px]">{who.subtitle}</p>}
                        </div>
                      </td>
                      {type === 'audit' && (
                        <td className="px-4 py-3 text-xs text-card-foreground/70 capitalize">
                          {formatAuditItem(log as AuditLog)}
                        </td>
                      )}
                      <td className="px-4 py-3">
                        {change ? (
                          <span className="block text-xs text-card-foreground/80 max-w-[360px] whitespace-normal" title={change}>{change}</span>
                        ) : <span className="text-card-foreground/30 text-xs">—</span>}
                      </td>
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
