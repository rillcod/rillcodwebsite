// @refresh reset
'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import {
  ClipboardDocumentListIcon, MagnifyingGlassIcon,
  ArrowPathIcon, DocumentTextIcon,
  ShieldCheckIcon, ChevronLeftIcon, ChevronRightIcon,
  ArrowDownTrayIcon, PrinterIcon, BellIcon, XMarkIcon,
  EyeIcon,
} from '@/lib/icons';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import {
  formatAuditDetail,
  formatAuditItem,
  formatAuditWho,
  humanizeAuditAction,
} from '@/lib/audit/humanize';
import { brandContact } from '@/config/brand';

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
  login:   'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
  logout:  'bg-muted text-muted-foreground border-border',
  signup:  'bg-primary/10 text-primary border-primary/20',
  create:  'bg-primary/10 text-primary border-primary/20',
  update:  'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
  delete:  'bg-destructive/10 text-destructive border-destructive/20',
  view:    'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20',
  report:  'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20',
  opened:  'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
  blocked: 'bg-destructive/10 text-destructive border-destructive/20',
  printed: 'bg-primary/10 text-primary border-primary/20',
  downloaded: 'bg-primary/10 text-primary border-primary/20',
  approved: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
  rejected: 'bg-destructive/10 text-destructive border-destructive/20',
  paid: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
  graded: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
};

function getEventColor(event: string) {
  const lc = event.toLowerCase();
  for (const key of Object.keys(EVENT_COLORS)) {
    if (lc.includes(key)) return EVENT_COLORS[key];
  }
  return 'bg-muted text-foreground/70 border-border';
}

function EventBadge({ event }: { event: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wider ${getEventColor(event)}`}>
      {event}
    </span>
  );
}

// ── Audit Record Inspector Drawer / Modal ──────────────────────────────────────
function AuditInspectorModal({
  log,
  onClose,
}: {
  log: ActivityLog | AuditLog;
  onClose: () => void;
}) {
  const isAudit = !('event_type' in log);
  const audit = isAudit ? (log as AuditLog) : null;
  const activity = !isAudit ? (log as ActivityLog) : null;
  const user = log.portal_users;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[110] bg-black/80 backdrop-blur-xl flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 20 }}
        className="bg-card border border-border rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl p-6 space-y-6 flex flex-col max-h-[85vh]"
      >
        <div className="flex items-center justify-between border-b border-border pb-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
              <ShieldCheckIcon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-black text-foreground">
                {isAudit ? humanizeAuditAction(audit!.action) : activity!.event_type}
              </h3>
              <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">
                ID: {log.id} • {new Date(log.created_at).toLocaleString()}
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-full hover:bg-muted flex items-center justify-center text-muted-foreground">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-6 overflow-y-auto custom-scrollbar flex-1 pr-2">
          {/* User metadata */}
          <div className="bg-muted/40 border border-border rounded-2xl p-4 grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div>
              <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block">Actor Name</span>
              <span className="font-bold text-foreground">{user?.full_name || 'System / Automated'}</span>
            </div>
            <div>
              <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block">Actor Email</span>
              <span className="font-medium text-muted-foreground">{user?.email || '—'}</span>
            </div>
            <div>
              <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block">Role & IP</span>
              <span className="font-bold text-primary uppercase">{user?.role || 'System'}</span>
              {log.ip_address && <span className="text-muted-foreground ml-2 font-mono">({log.ip_address})</span>}
            </div>
          </div>

          {/* Audit Diff Table or Metadata JSON */}
          {audit ? (
            <div className="space-y-4">
              <h4 className="text-xs font-black uppercase tracking-widest text-foreground">State Delta & Affected Record</h4>
              <div className="bg-background border border-border rounded-2xl p-4 text-xs font-mono space-y-2">
                <div className="flex justify-between border-b border-border/60 pb-2 text-[10px] text-muted-foreground font-sans font-black uppercase tracking-widest">
                  <span>Resource: {audit.table_name || audit.resource_type || 'Record'}</span>
                  <span>Record ID: {audit.record_id || audit.resource_id || '—'}</span>
                </div>

                {audit.old_values || audit.new_values ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                    <div className="bg-destructive/10 border border-destructive/20 p-3 rounded-xl">
                      <span className="text-[10px] font-sans font-black text-destructive uppercase tracking-widest block mb-1">Previous Values (Old)</span>
                      <pre className="text-[11px] text-destructive/90 overflow-x-auto whitespace-pre-wrap font-mono">
                        {audit.old_values ? JSON.stringify(audit.old_values, null, 2) : (audit.old_value || 'None')}
                      </pre>
                    </div>
                    <div className="bg-emerald-500/10 border border-emerald-500/20 p-3 rounded-xl">
                      <span className="text-[10px] font-sans font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest block mb-1">Updated Values (New)</span>
                      <pre className="text-[11px] text-emerald-700 dark:text-emerald-300 overflow-x-auto whitespace-pre-wrap font-mono">
                        {audit.new_values ? JSON.stringify(audit.new_values, null, 2) : (audit.new_value || 'None')}
                      </pre>
                    </div>
                  </div>
                ) : (
                  <p className="text-muted-foreground italic font-sans text-xs pt-2">
                    {formatAuditDetail(audit) || 'No prior state snapshot recorded for this audit entry.'}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <h4 className="text-xs font-black uppercase tracking-widest text-foreground">Activity Event Metadata</h4>
              <div className="bg-background border border-border rounded-2xl p-4 text-xs font-mono">
                <pre className="text-[11px] text-foreground/80 overflow-x-auto whitespace-pre-wrap">
                  {activity?.metadata ? JSON.stringify(activity.metadata, null, 2) : 'No extra metadata payload.'}
                </pre>
              </div>
            </div>
          )}
        </div>

        <div className="pt-2 shrink-0 border-t border-border flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2.5 bg-primary text-primary-foreground rounded-xl text-xs font-black uppercase tracking-widest hover:opacity-90 transition-opacity"
          >
            Close Inspector
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

export default function ActivityLogsPage() {
  const { profile, loading: authLoading } = useAuth();
  const [logs, setLogs] = useState<(ActivityLog | AuditLog)[]>([]);
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState<LogType>('activity');
  const [typePinned, setTypePinned] = useState(false);
  const [search, setSearch] = useState('');
  const [eventFilter, setEventFilter] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [selectedLog, setSelectedLog] = useState<ActivityLog | AuditLog | null>(null);
  const LIMIT = 50;

  const isStaff = profile?.role === 'admin' || profile?.role === 'teacher';

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
        user_id: l.user_id || null,
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

  // Live Auto-Refresh polling (30 seconds)
  useEffect(() => {
    if (!autoRefresh || !isStaff) return;
    const interval = setInterval(() => {
      load();
    }, 30000);
    return () => clearInterval(interval);
  }, [autoRefresh, isStaff, load]);

  const handleExportCSV = () => {
    const params = new URLSearchParams({ type });
    if (eventFilter) params.set('event_type', eventFilter);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    window.open(`/api/activity-logs/export?${params.toString()}`, '_blank');
    toast.success("Downloading Audit Trail CSV export...");
  };

  const handlePrintReport = () => {
    window.print();
  };

  if (authLoading || !profile) {
    return <div className="flex items-center justify-center min-h-[60vh]"><div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  }

  if (!isStaff) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <ShieldCheckIcon className="w-16 h-16 text-destructive/40" />
        <p className="text-muted-foreground text-lg font-semibold">Staff or Admin access required</p>
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
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto text-foreground">

      {/* ── Print Letterhead (Only visible during printing) ────────────────── */}
      <div className="hidden print:block mb-6">
        <div style={{ borderBottom: '2px solid #1e3a8a', paddingBottom: 12, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 16 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Rillcod" style={{ width: 48, height: 48, objectFit: 'contain' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 900, color: '#1e3a8a' }}>RILLCOD TECHNOLOGIES</div>
            <div style={{ fontSize: 10, color: '#4b5563' }}>Coding Today, Innovating Tomorrow · Official System Audit Trail</div>
            <div style={{ fontSize: 9, color: '#6b7280' }}>26 Ogiesoba Avenue, Off Airport Road, GRA, Benin City · {brandContact.email}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 13, fontWeight: 900, color: '#1e3a8a', textTransform: 'uppercase' }}>{type === 'audit' ? 'Audit Trail' : 'System Log'}</div>
            <div style={{ fontSize: 9, color: '#6b7280' }}>Generated: {new Date().toLocaleString()}</div>
          </div>
        </div>
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-black text-foreground flex items-center gap-2 tracking-tight">
            <ClipboardDocumentListIcon className="w-7 h-7 text-primary" />
            Activity & Audit Logs
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {total.toLocaleString()} records · page {page} of {totalPages || 1}
            {type === 'audit' ? ' · Plain-language compliance trail' : ''}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href="/dashboard/notifications"
            className="flex items-center gap-1.5 px-3.5 py-2 bg-card hover:bg-muted border border-border rounded-xl text-xs font-bold text-foreground transition-all shadow-sm"
            title="System Notification Center"
          >
            <BellIcon className="w-4 h-4 text-primary" />
            <span>Notifications</span>
          </Link>

          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-card hover:bg-muted border border-border rounded-xl text-xs font-bold text-foreground transition-all shadow-sm"
            title="Export CSV"
          >
            <ArrowDownTrayIcon className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>Export CSV</span>
          </button>

          <button
            onClick={handlePrintReport}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-card hover:bg-muted border border-border rounded-xl text-xs font-bold text-foreground transition-all shadow-sm"
            title="Print Audit Report"
          >
            <PrinterIcon className="w-4 h-4 text-primary" />
            <span>Print Report</span>
          </button>

          <button
            onClick={load}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-primary text-primary-foreground rounded-xl text-xs font-bold transition-all shadow-sm hover:opacity-90"
          >
            <ArrowPathIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Toolbar & Filter Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:hidden">
        {/* Tab Switch */}
        <div className="flex gap-1.5 bg-muted/60 border border-border rounded-xl p-1 w-fit">
          {([['audit', 'Audit Trail', ShieldCheckIcon], ['activity', 'System Activity', ClipboardDocumentListIcon]] as const).map(([t, label, Icon]) => (
            <button
              key={t}
              onClick={() => { setType(t); setTypePinned(true); setPage(1); }}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                type === t
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-card'
              }`}
            >
              <Icon className="w-4 h-4" /> {label}
            </button>
          ))}
        </div>

        {/* Live Auto Refresh Toggle */}
        <label className="flex items-center gap-2 text-xs font-bold text-muted-foreground cursor-pointer select-none">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
            className="rounded border-input text-primary focus:ring-primary w-4 h-4 cursor-pointer"
          />
          <span>Auto-refresh (30s)</span>
          {autoRefresh && <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />}
        </label>
      </div>

      {/* Filter Inputs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 print:hidden">
        <div className="relative">
          <MagnifyingGlassIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder={type === 'audit' ? 'Search student, school, invoice, report…' : 'Search logs…'}
            className="w-full pl-10 pr-4 py-2.5 bg-background text-foreground border border-input rounded-xl text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <input
          value={eventFilter} onChange={e => { setEventFilter(e.target.value); setPage(1); }}
          placeholder={type === 'activity' ? 'Filter by event type…' : 'Filter by action…'}
          className="px-4 py-2.5 bg-background text-foreground border border-input rounded-xl text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
        <input
          type="date" value={from} onChange={e => { setFrom(e.target.value); setPage(1); }}
          className="px-4 py-2.5 bg-background text-foreground border border-input rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
        <input
          type="date" value={to} onChange={e => { setTo(e.target.value); setPage(1); }}
          className="px-4 py-2.5 bg-background text-foreground border border-input rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-20"><div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>
      ) : filteredLogs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 border-2 border-dashed border-border rounded-2xl bg-card/40">
          <DocumentTextIcon className="w-14 h-14 text-muted-foreground/30" />
          <p className="text-muted-foreground text-sm font-semibold">No activity logs recorded for this view.</p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="text-left px-4 py-3 text-xs font-black uppercase tracking-wider text-muted-foreground">
                    {type === 'activity' ? 'Event' : 'What happened'}
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-black uppercase tracking-wider text-muted-foreground">
                    {type === 'audit' ? 'Who' : 'User'}
                  </th>
                  {type === 'audit' && (
                    <th className="text-left px-4 py-3 text-xs font-black uppercase tracking-wider text-muted-foreground">Target</th>
                  )}
                  <th className="text-left px-4 py-3 text-xs font-black uppercase tracking-wider text-muted-foreground">
                    {type === 'activity' ? 'Metadata' : 'Details'}
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-black uppercase tracking-wider text-muted-foreground">Time</th>
                  <th className="text-right px-4 py-3 text-xs font-black uppercase tracking-wider text-muted-foreground print:hidden">Inspect</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
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
                    <tr
                      key={log.id}
                      onClick={() => setSelectedLog(log)}
                      className="hover:bg-muted/40 transition-colors cursor-pointer"
                    >
                      <td className="px-4 py-3"><EventBadge event={label} /></td>
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-semibold text-foreground text-xs">{who.title}</p>
                          {who.subtitle && <p className="text-muted-foreground text-[10px]">{who.subtitle}</p>}
                        </div>
                      </td>
                      {type === 'audit' && (
                        <td className="px-4 py-3 text-xs text-muted-foreground capitalize font-medium">
                          {formatAuditItem(log as AuditLog)}
                        </td>
                      )}
                      <td className="px-4 py-3">
                        {change ? (
                          <span className="block text-xs text-foreground/80 max-w-[360px] truncate" title={change}>{change}</span>
                        ) : <span className="text-muted-foreground/40 text-xs">—</span>}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(log.created_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="px-4 py-3 text-right print:hidden">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setSelectedLog(log); }}
                          className="p-1.5 text-muted-foreground hover:text-primary hover:bg-muted rounded-lg transition-colors"
                          title="Inspect record details"
                        >
                          <EyeIcon className="w-4 h-4" />
                        </button>
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
        <div className="flex items-center justify-center gap-3 print:hidden">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
            className="p-2 bg-card hover:bg-muted border border-border rounded-xl disabled:opacity-40 transition-all text-foreground"
          >
            <ChevronLeftIcon className="w-4 h-4" />
          </button>
          <span className="text-xs text-muted-foreground font-bold uppercase tracking-widest">Page {page} of {totalPages}</span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
            className="p-2 bg-card hover:bg-muted border border-border rounded-xl disabled:opacity-40 transition-all text-foreground"
          >
            <ChevronRightIcon className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Audit Detail Inspector Modal */}
      <AnimatePresence>
        {selectedLog && (
          <AuditInspectorModal log={selectedLog} onClose={() => setSelectedLog(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}
