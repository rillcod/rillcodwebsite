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
  EyeIcon, QrCodeIcon, KeyIcon, LinkIcon, UserIcon, UserGroupIcon,
} from '@/lib/icons';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import {
  formatAuditDetail,
  formatAuditFacts,
  formatAuditItem,
  formatAuditWho,
  getAuditAccessMethod,
  getAuditViewerRole,
  humanizeAuditAction,
  humanizeAuditActionBase,
  isResultCheckAction,
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

function AccessMethodChip({ method, label }: { method: string | null; label: string | null }) {
  if (!method || method === 'unknown' || !label) return null;
  const styles =
    method === 'qr'
      ? 'bg-sky-500/10 text-sky-800 dark:text-sky-300 border-sky-500/25'
      : method === 'typed'
        ? 'bg-amber-500/10 text-amber-800 dark:text-amber-300 border-amber-500/25'
        : 'bg-violet-500/10 text-violet-800 dark:text-violet-300 border-violet-500/25';
  const Icon = method === 'qr' ? QrCodeIcon : method === 'typed' ? KeyIcon : LinkIcon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border ${styles}`}>
      <Icon className="w-3 h-3 shrink-0" />
      {label}
    </span>
  );
}

function ViewerRoleChip({ role }: { role: ReturnType<typeof getAuditViewerRole> }) {
  const map: Record<string, { label: string; className: string; Icon: typeof UserIcon }> = {
    admin: {
      label: 'Admin',
      className: 'bg-rose-500/10 text-rose-800 dark:text-rose-300 border-rose-500/25',
      Icon: ShieldCheckIcon,
    },
    teacher: {
      label: 'Teacher',
      className: 'bg-indigo-500/10 text-indigo-800 dark:text-indigo-300 border-indigo-500/25',
      Icon: UserIcon,
    },
    school: {
      label: 'School',
      className: 'bg-indigo-500/10 text-indigo-800 dark:text-indigo-300 border-indigo-500/25',
      Icon: UserGroupIcon,
    },
    parent: {
      label: 'Parent',
      className: 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border-emerald-500/25',
      Icon: UserIcon,
    },
    visitor: {
      label: 'Visitor',
      className: 'bg-muted text-muted-foreground border-border',
      Icon: UserIcon,
    },
    staff: {
      label: 'Staff',
      className: 'bg-primary/10 text-primary border-primary/20',
      Icon: UserIcon,
    },
    system: {
      label: 'System',
      className: 'bg-muted text-muted-foreground border-border',
      Icon: ShieldCheckIcon,
    },
  };
  const cfg = map[role] || map.system;
  const Icon = cfg.Icon;
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold border ${cfg.className}`}>
      <Icon className="w-3 h-3" />
      {cfg.label}
    </span>
  );
}

const AUDIT_QUICK_FILTERS: Array<{
  id: string;
  label: string;
  eventType: string;
  accessMethod: string;
}> = [
  { id: 'all', label: 'All', eventType: '', accessMethod: '' },
  { id: 'results', label: 'Result checks', eventType: 'result_check_*', accessMethod: '' },
  { id: 'opened', label: 'Report opened', eventType: 'result_check_verified', accessMethod: '' },
  { id: 'qr', label: 'QR scans', eventType: 'result_check_*', accessMethod: 'qr' },
  { id: 'typed', label: 'Typed numbers', eventType: 'result_check_*', accessMethod: 'typed' },
  { id: 'blocked', label: 'Blocked', eventType: 'result_check_blocked', accessMethod: '' },
  { id: 'pending', label: 'Not published', eventType: 'result_check_pending', accessMethod: '' },
];

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
  const who = audit ? formatAuditWho(audit) : null;
  const access = audit ? getAuditAccessMethod(audit) : null;
  const role = audit ? getAuditViewerRole(audit) : 'system';
  const facts = audit ? formatAuditFacts(audit) : [];
  const isResult = audit ? isResultCheckAction(audit.action) : false;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
        className="fixed inset-0 z-[110] bg-black/80 backdrop-blur-xl flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ scale: 0.98, opacity: 0, y: 24 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.98, opacity: 0, y: 24 }}
        className="bg-card border border-border rounded-t-3xl sm:rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl p-4 sm:p-6 space-y-4 sm:space-y-5 flex flex-col max-h-[92vh] sm:max-h-[85vh]"
      >
        <div className="flex items-start justify-between border-b border-border pb-4 shrink-0 gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
              <ShieldCheckIcon className="w-5 h-5" />
            </div>
            <div className="min-w-0 space-y-1.5">
              <h3 className="text-base sm:text-lg font-black text-foreground leading-snug">
                {isAudit
                  ? humanizeAuditActionBase(audit!.action, audit)
                  : activity!.event_type}
              </h3>
              <div className="flex flex-wrap items-center gap-1.5">
                {isAudit && <ViewerRoleChip role={role} />}
                {access && <AccessMethodChip method={access.method} label={access.shortLabel || access.label} />}
              </div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                {new Date(log.created_at).toLocaleString()}
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-full hover:bg-muted flex items-center justify-center text-muted-foreground shrink-0">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-5 overflow-y-auto custom-scrollbar flex-1 pr-1">
          {audit ? (
            <>
              <div className="bg-muted/40 border border-border rounded-2xl p-4 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block mb-1">Opened by</span>
                  <p className="font-bold text-foreground">{who?.title || 'System / automatic'}</p>
                  {who?.subtitle && <p className="text-muted-foreground mt-0.5">{who.subtitle}</p>}
                </div>
                <div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block mb-1">Account / IP</span>
                  <p className="font-medium text-foreground">{user?.email || (isResult ? 'Public / no staff login' : '—')}</p>
                  {log.ip_address && <p className="text-muted-foreground font-mono text-[11px] mt-0.5">{log.ip_address}</p>}
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="text-xs font-black uppercase tracking-widest text-foreground">What this record means</h4>
                <dl className="bg-background border border-border rounded-2xl divide-y divide-border/70">
                  {facts.map((fact) => (
                    <div key={fact.label} className="px-3 sm:px-4 py-3 grid grid-cols-1 sm:grid-cols-[140px_1fr] gap-1 sm:gap-3">
                      <dt className="text-[10px] font-black uppercase tracking-wider text-muted-foreground pt-0.5">{fact.label}</dt>
                      <dd className="text-sm text-foreground leading-relaxed break-words whitespace-pre-wrap [overflow-wrap:anywhere]">{fact.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>

              {!isResult && (audit.old_values || audit.new_values) && (
                <details className="group">
                  <summary className="cursor-pointer text-xs font-bold text-muted-foreground hover:text-foreground">
                    Technical payload (for support)
                  </summary>
                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono">
                    <pre className="bg-destructive/10 border border-destructive/20 p-3 rounded-xl overflow-x-auto whitespace-pre-wrap text-[11px]">
                      {audit.old_values ? JSON.stringify(audit.old_values, null, 2) : (audit.old_value || 'None')}
                    </pre>
                    <pre className="bg-emerald-500/10 border border-emerald-500/20 p-3 rounded-xl overflow-x-auto whitespace-pre-wrap text-[11px]">
                      {audit.new_values ? JSON.stringify(audit.new_values, null, 2) : (audit.new_value || 'None')}
                    </pre>
                  </div>
                </details>
              )}
            </>
          ) : (
            <div className="space-y-3">
              <div className="bg-muted/40 border border-border rounded-2xl p-4 grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block">Actor</span>
                  <span className="font-bold text-foreground">{user?.full_name || 'System'}</span>
                </div>
                <div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block">Email</span>
                  <span className="font-medium text-muted-foreground">{user?.email || '—'}</span>
                </div>
                <div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block">Role & IP</span>
                  <span className="font-bold text-primary uppercase">{user?.role || 'System'}</span>
                  {log.ip_address && <span className="text-muted-foreground ml-2 font-mono">({log.ip_address})</span>}
                </div>
              </div>
              <h4 className="text-xs font-black uppercase tracking-widest text-foreground">Activity metadata</h4>
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
            Close
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
  const [type, setType] = useState<LogType>('audit');
  const [typePinned, setTypePinned] = useState(false);
  const [search, setSearch] = useState('');
  const [eventFilter, setEventFilter] = useState('result_check_*');
  const [accessMethodFilter, setAccessMethodFilter] = useState('');
  const [quickFilterId, setQuickFilterId] = useState('results');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [selectedLog, setSelectedLog] = useState<ActivityLog | AuditLog | null>(null);
  const LIMIT = 50;

  const isStaff = ['admin', 'teacher', 'school'].includes(profile?.role ?? '');

  useEffect(() => {
    if (!typePinned && profile?.role === 'admin') setType('audit');
  }, [profile?.role, typePinned]);

  const load = useCallback(async () => {
    if (!isStaff) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ type, page: String(page), limit: String(LIMIT) });
      if (eventFilter) params.set('event_type', eventFilter);
      if (accessMethodFilter) params.set('access_method', accessMethodFilter);
      if (from) params.set('from', from);
      if (to) params.set('to', to);

      const res = await fetch(`/api/activity-logs?${params}`);
      if (!res.ok) throw new Error('Failed to load');
      const json = await res.json();
      const mappedLogs = (json.data ?? []).map((l: any) => ({
        ...l,
        user_id: l.user_id || null,
        created_at: l.created_at || new Date().toISOString(),
      }));
      setLogs(mappedLogs);
      setTotal(json.total ?? 0);
    } catch {
      toast.error('Failed to load logs');
    } finally {
      setLoading(false);
    }
  }, [isStaff, type, page, eventFilter, accessMethodFilter, from, to]);

  useEffect(() => { if (!authLoading) load(); }, [authLoading, load]);

  useEffect(() => {
    if (!autoRefresh || !isStaff) return;
    const interval = setInterval(() => { load(); }, 30000);
    return () => clearInterval(interval);
  }, [autoRefresh, isStaff, load]);

  const applyQuickFilter = (id: string) => {
    const chip = AUDIT_QUICK_FILTERS.find((f) => f.id === id);
    if (!chip) return;
    setQuickFilterId(id);
    setEventFilter(chip.eventType);
    setAccessMethodFilter(chip.accessMethod);
    setPage(1);
  };

  const handleExportCSV = () => {
    const params = new URLSearchParams({ type });
    if (eventFilter) params.set('event_type', eventFilter);
    if (accessMethodFilter) params.set('access_method', accessMethodFilter);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    window.open(`/api/activity-logs/export?${params.toString()}`, '_blank');
    toast.success('Downloading audit trail CSV export…');
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
    ? logs.filter((l) => {
        const u = l.portal_users;
        const event = 'event_type' in l ? l.event_type : (l as AuditLog).action;
        const audit = 'event_type' in l ? null : (l as AuditLog);
        const detail = audit ? formatAuditDetail(audit) : null;
        const item = audit ? formatAuditItem(audit) : '';
        const who = audit ? formatAuditWho(audit) : null;
        const access = audit ? getAuditAccessMethod(audit) : null;
        const nv = audit?.new_values;
        const hay = [
          event,
          humanizeAuditAction(event || '', audit),
          u?.full_name,
          u?.email,
          detail,
          item,
          who?.title,
          who?.subtitle,
          access?.label,
          access?.method,
          typeof nv?.student_name === 'string' ? nv.student_name : '',
          typeof nv?.school_name === 'string' ? nv.school_name : '',
          typeof nv?.viewer === 'string' ? nv.viewer : '',
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

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-black text-foreground flex items-center gap-2 tracking-tight">
            <ClipboardDocumentListIcon className="w-7 h-7 text-primary" />
            Audit trail
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {total.toLocaleString()} records · page {page} of {totalPages || 1}
            {type === 'audit' ? ' · Who opened reports, and whether they scanned or typed' : ''}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap print:hidden">
          <Link
            href="/dashboard/notifications"
            className="flex items-center gap-1.5 px-3 py-2 min-h-10 bg-card hover:bg-muted border border-border rounded-xl text-xs font-bold text-foreground transition-all shadow-sm"
            title="System Notification Center"
          >
            <BellIcon className="w-4 h-4 text-primary" />
            <span className="hidden sm:inline">Notifications</span>
          </Link>
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3 py-2 min-h-10 bg-card hover:bg-muted border border-border rounded-xl text-xs font-bold text-foreground transition-all shadow-sm"
            title="Export CSV"
          >
            <ArrowDownTrayIcon className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span className="hidden sm:inline">Export CSV</span>
            <span className="sm:hidden">CSV</span>
          </button>
          <button
            onClick={() => window.print()}
            className="hidden sm:flex items-center gap-1.5 px-3.5 py-2 bg-card hover:bg-muted border border-border rounded-xl text-xs font-bold text-foreground transition-all shadow-sm"
            title="Print Audit Report"
          >
            <PrinterIcon className="w-4 h-4 text-primary" />
            <span>Print Report</span>
          </button>
          <button
            onClick={load}
            className="flex items-center gap-1.5 px-3 py-2 min-h-10 bg-primary text-primary-foreground rounded-xl text-xs font-bold transition-all shadow-sm hover:opacity-90"
          >
            <ArrowPathIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:hidden">
        <div className="flex gap-1.5 bg-muted/60 border border-border rounded-xl p-1 w-fit">
          {([['audit', 'Audit Trail', ShieldCheckIcon], ['activity', 'System Activity', ClipboardDocumentListIcon]] as const).map(([t, label, Icon]) => (
            <button
              key={t}
              onClick={() => {
                setType(t);
                setTypePinned(true);
                setPage(1);
                if (t === 'audit') {
                  setQuickFilterId('results');
                  setEventFilter('result_check_*');
                  setAccessMethodFilter('');
                } else {
                  setQuickFilterId('all');
                  setEventFilter('');
                  setAccessMethodFilter('');
                }
              }}
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

      {type === 'audit' && (
        <div className="rounded-2xl border border-border bg-card/60 p-3 sm:p-4 space-y-3 print:hidden">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Quick filters</p>
          <div className="flex flex-wrap gap-2">
            {AUDIT_QUICK_FILTERS.map((chip) => (
              <button
                key={chip.id}
                type="button"
                onClick={() => applyQuickFilter(chip.id)}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-all ${
                  quickFilterId === chip.id
                    ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                    : 'bg-background text-muted-foreground border-border hover:text-foreground hover:bg-muted'
                }`}
              >
                {chip.label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="relative sm:col-span-1">
              <MagnifyingGlassIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search student, admin, school…"
                className="w-full pl-10 pr-4 py-2.5 bg-background text-foreground border border-input rounded-xl text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <input
              type="date"
              value={from}
              onChange={(e) => { setFrom(e.target.value); setPage(1); }}
              className="px-4 py-2.5 bg-background text-foreground border border-input rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
              aria-label="From date"
            />
            <input
              type="date"
              value={to}
              onChange={(e) => { setTo(e.target.value); setPage(1); }}
              className="px-4 py-2.5 bg-background text-foreground border border-input rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
              aria-label="To date"
            />
          </div>
        </div>
      )}

      {type === 'activity' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 print:hidden">
          <div className="relative">
            <MagnifyingGlassIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search logs…"
              className="w-full pl-10 pr-4 py-2.5 bg-background text-foreground border border-input rounded-xl text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <input
            value={eventFilter}
            onChange={(e) => {
              setEventFilter(e.target.value);
              setQuickFilterId('all');
              setPage(1);
            }}
            placeholder="Filter by event type…"
            className="px-4 py-2.5 bg-background text-foreground border border-input rounded-xl text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          <input
            type="date"
            value={from}
            onChange={(e) => { setFrom(e.target.value); setPage(1); }}
            className="px-4 py-2.5 bg-background text-foreground border border-input rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          <input
            type="date"
            value={to}
            onChange={(e) => { setTo(e.target.value); setPage(1); }}
            className="px-4 py-2.5 bg-background text-foreground border border-input rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20"><div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>
      ) : filteredLogs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 border border-dashed border-border rounded-xl bg-card/40">
          <DocumentTextIcon className="w-12 h-12 text-muted-foreground/30" />
          <p className="text-muted-foreground text-sm font-semibold">No records match this filter.</p>
          {type === 'audit' && (
            <button
              type="button"
              onClick={() => applyQuickFilter('all')}
              className="text-xs font-bold text-primary hover:underline"
            >
              Show all audit events
            </button>
          )}
        </div>
      ) : (
        <div className="border border-border rounded-xl overflow-hidden bg-card shadow-sm">
          {/* Mobile cards — summary wraps fully */}
          <div className="md:hidden divide-y divide-border">
            {filteredLogs.map((log) => {
              const isAudit = !('event_type' in log);
              const audit = isAudit ? (log as AuditLog) : null;
              const rawEvent = isAudit ? audit!.action : (log as ActivityLog).event_type;
              const label = isAudit
                ? humanizeAuditActionBase(audit!.action, audit)
                : rawEvent;
              const who = isAudit
                ? formatAuditWho(audit!)
                : log.portal_users
                  ? { title: log.portal_users.full_name, subtitle: log.portal_users.email }
                  : { title: 'System', subtitle: null };
              const access = isAudit ? getAuditAccessMethod(audit!) : null;
              const role = isAudit ? getAuditViewerRole(audit!) : 'system';
              const isResult = isAudit && isResultCheckAction(audit!.action);
              const change = isAudit
                ? formatAuditDetail(audit!)
                : (() => {
                    const m = (log as ActivityLog).metadata;
                    return m && Object.keys(m).length > 0 ? JSON.stringify(m) : null;
                  })();
              const summaryText = isResult && change
                ? change
                    .replace(/^(Admin|Teacher|School staff|Linked parent(?: \(signed in\))?|Visitor)(?: · [^·]+)? · /i, '')
                    .replace(/\svia (QR code scan|typed RC number|shared link|result check)/i, '')
                : change;
              const student = isAudit ? formatAuditItem(audit!) : null;
              const timeLabel = new Date(log.created_at).toLocaleString('en-GB', {
                day: '2-digit',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
              });

              return (
                <button
                  key={log.id}
                  type="button"
                  onClick={() => setSelectedLog(log)}
                  className="w-full text-left p-3.5 space-y-2.5 hover:bg-muted/40 active:bg-muted/60 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-mono text-muted-foreground tabular-nums">{timeLabel}</p>
                      <p className="text-sm font-semibold text-foreground leading-snug mt-0.5 break-words [overflow-wrap:anywhere]">
                        {label}
                      </p>
                    </div>
                    <EyeIcon className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />
                  </div>

                  {type === 'audit' && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      {access?.method && access.method !== 'unknown' && (
                        <AccessMethodChip method={access.method} label={access.shortLabel || access.label} />
                      )}
                      {isResult ? <ViewerRoleChip role={role} /> : (
                        log.portal_users?.role && (
                          <span className="text-[10px] text-muted-foreground capitalize border border-border rounded-md px-1.5 py-0.5">
                            {log.portal_users.role}
                          </span>
                        )
                      )}
                    </div>
                  )}

                  <div className="rounded-lg bg-muted/40 px-3 py-2 space-y-1">
                    <p className="text-xs font-semibold text-foreground break-words [overflow-wrap:anywhere]">{who.title}</p>
                    {who.subtitle && (
                      <p className="text-[11px] text-muted-foreground break-words [overflow-wrap:anywhere]">{who.subtitle}</p>
                    )}
                    {student && (
                      <p className="text-[11px] text-foreground/80 break-words [overflow-wrap:anywhere]">
                        <span className="text-muted-foreground">Student: </span>{student}
                      </p>
                    )}
                  </div>

                  {summaryText && (
                    <p className="text-[11px] text-muted-foreground leading-relaxed break-words whitespace-pre-wrap [overflow-wrap:anywhere]">
                      {summaryText}
                    </p>
                  )}
                </button>
              );
            })}
          </div>

          {/* Desktop datasheet */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full min-w-[920px] text-left border-collapse table-fixed">
              <thead>
                <tr className="bg-muted/70 border-b border-border">
                  <th className="px-3 py-2.5 text-[10px] font-black uppercase tracking-wider text-muted-foreground whitespace-nowrap sticky left-0 bg-muted/95 z-10 w-[108px]">Time</th>
                  <th className="px-3 py-2.5 text-[10px] font-black uppercase tracking-wider text-muted-foreground w-[140px]">Event</th>
                  {type === 'audit' && (
                    <>
                      <th className="px-3 py-2.5 text-[10px] font-black uppercase tracking-wider text-muted-foreground w-[88px]">How</th>
                      <th className="px-3 py-2.5 text-[10px] font-black uppercase tracking-wider text-muted-foreground w-[88px]">Role</th>
                    </>
                  )}
                  <th className="px-3 py-2.5 text-[10px] font-black uppercase tracking-wider text-muted-foreground w-[150px]">
                    {type === 'audit' ? 'Who opened' : 'User'}
                  </th>
                  {type === 'audit' && (
                    <th className="px-3 py-2.5 text-[10px] font-black uppercase tracking-wider text-muted-foreground w-[140px]">Student / target</th>
                  )}
                  <th className="px-3 py-2.5 text-[10px] font-black uppercase tracking-wider text-muted-foreground">Summary</th>
                  <th className="px-3 py-2.5 text-[10px] font-black uppercase tracking-wider text-muted-foreground text-right print:hidden w-14">View</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map((log, idx) => {
                  const isAudit = !('event_type' in log);
                  const audit = isAudit ? (log as AuditLog) : null;
                  const rawEvent = isAudit ? audit!.action : (log as ActivityLog).event_type;
                  const label = isAudit
                    ? humanizeAuditActionBase(audit!.action, audit)
                    : rawEvent;
                  const who = isAudit
                    ? formatAuditWho(audit!)
                    : log.portal_users
                      ? { title: log.portal_users.full_name, subtitle: log.portal_users.email }
                      : { title: 'System', subtitle: null };
                  const access = isAudit ? getAuditAccessMethod(audit!) : null;
                  const role = isAudit ? getAuditViewerRole(audit!) : 'system';
                  const isResult = isAudit && isResultCheckAction(audit!.action);
                  const change = isAudit
                    ? formatAuditDetail(audit!)
                    : (() => {
                        const m = (log as ActivityLog).metadata;
                        return m && Object.keys(m).length > 0 ? JSON.stringify(m) : null;
                      })();
                  const summaryText = isResult && change
                    ? change
                        .replace(/^(Admin|Teacher|School staff|Linked parent(?: \(signed in\))?|Visitor)(?: · [^·]+)? · /i, '')
                        .replace(/\svia (QR code scan|typed RC number|shared link|result check)/i, '')
                    : change;
                  const timeLabel = new Date(log.created_at).toLocaleString('en-GB', {
                    day: '2-digit',
                    month: 'short',
                    year: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  });
                  const rowBg = idx % 2 === 0 ? 'bg-card' : 'bg-muted/25';

                  return (
                    <tr
                      key={log.id}
                      onClick={() => setSelectedLog(log)}
                      className={`${rowBg} border-b border-border/60 hover:bg-primary/5 cursor-pointer transition-colors`}
                    >
                      <td className={`px-3 py-2.5 text-[11px] font-mono text-muted-foreground whitespace-nowrap sticky left-0 z-[1] align-top ${rowBg}`}>
                        {timeLabel}
                      </td>
                      <td className="px-3 py-2.5 align-top">
                        <span className="text-xs font-semibold text-foreground leading-snug break-words [overflow-wrap:anywhere]" title={label}>
                          {label}
                        </span>
                      </td>
                      {type === 'audit' && (
                        <>
                          <td className="px-3 py-2.5 align-top">
                            {access?.method && access.method !== 'unknown' ? (
                              <AccessMethodChip method={access.method} label={access.shortLabel || access.label} />
                            ) : (
                              <span className="text-muted-foreground/40 text-xs">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 align-top">
                            {isResult ? <ViewerRoleChip role={role} /> : (
                              <span className="text-[11px] text-muted-foreground capitalize">{log.portal_users?.role || '—'}</span>
                            )}
                          </td>
                        </>
                      )}
                      <td className="px-3 py-2.5 align-top">
                        <p className="text-xs font-semibold text-foreground leading-snug break-words [overflow-wrap:anywhere]">{who.title}</p>
                        {who.subtitle && (
                          <p className="text-[10px] text-muted-foreground break-words [overflow-wrap:anywhere] mt-0.5">{who.subtitle}</p>
                        )}
                      </td>
                      {type === 'audit' && (
                        <td className="px-3 py-2.5 align-top text-xs text-foreground/85 font-medium">
                          <span className="break-words [overflow-wrap:anywhere] leading-snug" title={formatAuditItem(audit!) || undefined}>
                            {formatAuditItem(audit!) || '—'}
                          </span>
                        </td>
                      )}
                      <td className="px-3 py-2.5 align-top">
                        {summaryText ? (
                          <span className="block text-[11px] text-muted-foreground leading-relaxed break-words whitespace-pre-wrap [overflow-wrap:anywhere]" title={change || undefined}>
                            {summaryText}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/40 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 align-top text-right print:hidden">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setSelectedLog(log); }}
                          className="inline-flex items-center justify-center p-1.5 text-muted-foreground hover:text-primary hover:bg-muted rounded-md transition-colors"
                          title="Open row details"
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
          <div className="px-3 py-2 border-t border-border bg-muted/40 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground print:hidden">
            <span>{filteredLogs.length} row{filteredLogs.length === 1 ? '' : 's'} on this page</span>
            <span className="hidden sm:inline">Tap a row for full details · CSV export available above</span>
          </div>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 print:hidden">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="p-2 bg-card hover:bg-muted border border-border rounded-xl disabled:opacity-40 transition-all text-foreground"
          >
            <ChevronLeftIcon className="w-4 h-4" />
          </button>
          <span className="text-xs text-muted-foreground font-bold uppercase tracking-widest">Page {page} of {totalPages}</span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="p-2 bg-card hover:bg-muted border border-border rounded-xl disabled:opacity-40 transition-all text-foreground"
          >
            <ChevronRightIcon className="w-4 h-4" />
          </button>
        </div>
      )}

      <AnimatePresence>
        {selectedLog && (
          <AuditInspectorModal log={selectedLog} onClose={() => setSelectedLog(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}
