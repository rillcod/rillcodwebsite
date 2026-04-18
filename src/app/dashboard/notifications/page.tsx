'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import {
  BellIcon,
  BellAlertIcon,
  TrashIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  XMarkIcon,
  ArrowPathIcon,
} from '@/lib/icons';

// ─── Types ───────────────────────────────────────────────────────────────────

type NotificationType = 'info' | 'warning' | 'success' | 'error';

interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: NotificationType;
  is_read: boolean;
  created_at: string;
}

type Filter = 'all' | 'unread' | 'info' | 'warning' | 'success' | 'error';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function relativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
  if (diffDays === 1) return 'Yesterday';

  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}

// ─── Type config ─────────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<
  NotificationType,
  {
    border: string;
    bg: string;
    dot: string;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    iconClass: string;
  }
> = {
  info: {
    border: 'border-blue-500/30',
    bg: 'bg-blue-500/5',
    dot: 'bg-blue-500',
    label: 'text-blue-400',
    icon: InformationCircleIcon,
    iconClass: 'text-blue-400',
  },
  warning: {
    border: 'border-amber-500/30',
    bg: 'bg-amber-500/5',
    dot: 'bg-amber-400',
    label: 'text-amber-400',
    icon: ExclamationTriangleIcon,
    iconClass: 'text-amber-400',
  },
  success: {
    border: 'border-emerald-500/30',
    bg: 'bg-emerald-500/5',
    dot: 'bg-emerald-400',
    label: 'text-emerald-400',
    icon: CheckCircleIcon,
    iconClass: 'text-emerald-400',
  },
  error: {
    border: 'border-rose-500/30',
    bg: 'bg-rose-500/5',
    dot: 'bg-rose-400',
    label: 'text-rose-400',
    icon: XMarkIcon,
    iconClass: 'text-rose-400',
  },
};

// ─── Filter tabs config ───────────────────────────────────────────────────────

const FILTER_TABS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'unread', label: 'Unread' },
  { key: 'info', label: 'Info' },
  { key: 'warning', label: 'Alerts' },
  { key: 'success', label: 'Success' },
  { key: 'error', label: 'Error' },
];

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function NotificationSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-16 bg-muted/50 border border-border rounded-none animate-pulse"
        />
      ))}
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ filter }: { filter: Filter }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4 text-center px-4">
      <div className="w-16 h-16 rounded-none bg-muted/50 border border-border flex items-center justify-center">
        <BellIcon className="w-8 h-8 text-muted-foreground/50" />
      </div>
      <div>
        <p className="text-sm font-black text-foreground uppercase tracking-widest">
          {filter === 'all' ? 'All caught up!' : 'Nothing here'}
        </p>
        <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto">
          {filter === 'all'
            ? 'You have no notifications right now.'
            : `No ${filter === 'unread' ? 'unread' : filter} notifications to display.`}
        </p>
      </div>
    </div>
  );
}

// ─── Broadcast Panel (admin/teacher only) ────────────────────────────────────

const BROADCAST_TARGETS = [
  { value: 'students', label: 'All Students' },
  { value: 'parents',  label: 'All Parents'  },
  { value: 'teachers', label: 'All Teachers' },
  { value: 'all',      label: 'Everyone'     },
] as const;

type BroadcastTarget = (typeof BROADCAST_TARGETS)[number]['value'];

function BroadcastPanel() {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [target, setTarget] = useState<BroadcastTarget>('students');
  const [type, setType] = useState<'info' | 'warning' | 'success' | 'announcement'>('info');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ success: boolean; msg: string } | null>(null);

  async function send() {
    if (!title.trim() || !message.trim()) return;
    setSending(true);
    setResult(null);
    try {
      const res = await fetch('/api/notifications/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, message, target, type }),
      });
      const json = await res.json();
      if (json.success) {
        setResult({ success: true, msg: `Sent to ${json.recipients} recipient${json.recipients !== 1 ? 's' : ''} (${json.in_app_sent} in-app, ${json.push_sent} push)` });
        setTitle(''); setMessage('');
      } else {
        setResult({ success: false, msg: json.error || 'Failed to send' });
      }
    } catch {
      setResult({ success: false, msg: 'Network error' });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mb-6 border border-orange-500/20 bg-orange-500/5 rounded-none">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2.5">
          <BellAlertIcon className="w-4 h-4 text-orange-400" />
          <span className="text-xs font-black uppercase tracking-widest text-orange-400">Send Notification</span>
        </div>
        <span className="text-muted-foreground text-xs">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block mb-1">Target Audience</label>
              <select
                value={target}
                onChange={e => setTarget(e.target.value as BroadcastTarget)}
                className="w-full px-3 py-2 bg-background border border-border text-sm text-foreground rounded-none focus:outline-none focus:border-orange-500"
              >
                {BROADCAST_TARGETS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block mb-1">Type</label>
              <select
                value={type}
                onChange={e => setType(e.target.value as any)}
                className="w-full px-3 py-2 bg-background border border-border text-sm text-foreground rounded-none focus:outline-none focus:border-orange-500"
              >
                <option value="info">Info</option>
                <option value="warning">Warning</option>
                <option value="success">Success</option>
                <option value="announcement">Announcement</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block mb-1">Title</label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Notification title..."
              className="w-full px-3 py-2 bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground rounded-none focus:outline-none focus:border-orange-500"
            />
          </div>
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block mb-1">Message</label>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              rows={3}
              placeholder="Write your notification message..."
              className="w-full px-3 py-2 bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground rounded-none focus:outline-none focus:border-orange-500 resize-none"
            />
          </div>
          {result && (
            <p className={`text-xs font-bold px-3 py-2 rounded-none border ${result.success ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-rose-500/10 border-rose-500/20 text-rose-400'}`}>
              {result.msg}
            </p>
          )}
          <button
            onClick={send}
            disabled={sending || !title.trim() || !message.trim()}
            className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-400 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-black uppercase tracking-widest rounded-none transition-colors"
          >
            {sending ? <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" /> : <BellAlertIcon className="w-3.5 h-3.5" />}
            {sending ? 'Sending...' : 'Send Now'}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Automation Triggers (admin only) ────────────────────────────────────────

const CRON_JOBS = [
  { key: 'billing-reminders',    label: 'Billing Reminders',    desc: 'Send billing cycle reminders (Week 6/7/8)' },
  { key: 'invoice-reminders',    label: 'Invoice Reminders',    desc: 'Send invoice reminder emails & mark overdue' },
  { key: 'process-certificates', label: 'Process Certificates', desc: 'Issue pending completion certificates' },
  { key: 'streak-reminder',      label: 'Streak Reminders',     desc: 'Remind students who missed learning today' },
  { key: 'term-scheduler',       label: 'Term Scheduler',       desc: 'Release lessons & assignments for current week' },
  { key: 'weekly-summary',       label: 'Weekly Summary',       desc: 'Email parents a weekly student summary' },
  { key: 'live-session-reminders', label: 'Session Reminders',  desc: 'Remind students about upcoming live sessions' },
  { key: 'process-notifications', label: 'Process Queue',       desc: 'Flush the notification delivery queue' },
] as const;

function AutomationTriggers() {
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState<Record<string, boolean>>({});
  const [results, setResults] = useState<Record<string, string>>({});

  async function trigger(key: string) {
    setRunning(r => ({ ...r, [key]: true }));
    setResults(r => ({ ...r, [key]: '' }));
    try {
      const res = await fetch(`/api/cron/${key}`, { method: 'POST' });
      const json = await res.json();
      if (json.error) setResults(r => ({ ...r, [key]: `Error: ${json.error}` }));
      else {
        const { success: _s, ...rest } = json;
        const summary = Object.entries(rest).map(([k, v]) => `${k}: ${v}`).join(', ');
        setResults(r => ({ ...r, [key]: summary || 'Done' }));
      }
    } catch (e: any) {
      setResults(r => ({ ...r, [key]: `Failed: ${e.message}` }));
    } finally {
      setRunning(r => ({ ...r, [key]: false }));
    }
  }

  return (
    <div className="mb-6 border border-border bg-muted/20 rounded-none">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2.5">
          <ArrowPathIcon className="w-4 h-4 text-muted-foreground" />
          <span className="text-xs font-black uppercase tracking-widest text-muted-foreground">Automation Jobs</span>
          <span className="text-[9px] px-1.5 py-0.5 bg-muted border border-border text-muted-foreground rounded-full font-bold uppercase">Admin</span>
        </div>
        <span className="text-muted-foreground text-xs">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="divide-y divide-border border-t border-border">
          {CRON_JOBS.map(job => (
            <div key={job.key} className="flex items-center gap-3 px-4 py-3">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-black text-foreground">{job.label}</p>
                <p className="text-[10px] text-muted-foreground truncate">{job.desc}</p>
                {results[job.key] && (
                  <p className={`text-[10px] mt-0.5 font-bold ${results[job.key].startsWith('Error') || results[job.key].startsWith('Failed') ? 'text-rose-400' : 'text-emerald-400'}`}>
                    {results[job.key]}
                  </p>
                )}
              </div>
              <button
                onClick={() => trigger(job.key)}
                disabled={running[job.key]}
                className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-muted hover:bg-muted/80 border border-border text-[10px] font-black uppercase tracking-widest text-foreground rounded-none transition-colors disabled:opacity-50"
              >
                {running[job.key] ? <ArrowPathIcon className="w-3 h-3 animate-spin" /> : <ArrowPathIcon className="w-3 h-3" />}
                {running[job.key] ? 'Running' : 'Run'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function NotificationsPage() {
  const router = useRouter();
  const { profile, loading: authLoading } = useAuth();

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [markingAll, setMarkingAll] = useState(false);

  // Auth guard
  useEffect(() => {
    if (!authLoading && !profile) {
      router.push('/login');
    }
  }, [authLoading, profile, router]);

  // Load notifications on mount
  useEffect(() => {
    if (!profile) return;

    async function fetchNotifications() {
      setLoading(true);
      try {
        const res = await fetch('/api/notifications');
        if (!res.ok) throw new Error('Failed to fetch notifications');
        const json = await res.json();
        setNotifications(json.data ?? []);
      } catch (err) {
        console.error('Failed to load notifications:', err);
        setNotifications([]);
      } finally {
        setLoading(false);
      }
    }

    fetchNotifications();
  }, [profile]);

  // Filtered list
  const filteredNotifications = useMemo(() => {
    if (filter === 'all') return notifications;
    if (filter === 'unread') return notifications.filter((n) => !n.is_read);
    return notifications.filter((n) => n.type === filter);
  }, [notifications, filter]);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.is_read).length,
    [notifications]
  );

  // Mark single notification as read
  async function markAsRead(id: string) {
    const notification = notifications.find((n) => n.id === id);
    if (!notification || notification.is_read) return;

    try {
      await fetch(`/api/notifications/${id}/mark-read`, { method: 'POST' });
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      );
    } catch (err) {
      console.error('Failed to mark notification as read:', err);
    }
  }

  // Toggle expand + mark as read
  function toggleExpand(id: string) {
    markAsRead(id);
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  // Mark all unread as read
  async function markAllAsRead() {
    const unread = notifications.filter((n) => !n.is_read);
    if (unread.length === 0) return;

    setMarkingAll(true);
    try {
      await Promise.all(
        unread.map((n) =>
          fetch(`/api/notifications/${n.id}/mark-read`, { method: 'POST' })
        )
      );
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    } catch (err) {
      console.error('Failed to mark all as read:', err);
    } finally {
      setMarkingAll(false);
    }
  }

  // Delete notification
  async function deleteNotification(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await fetch(`/api/notifications/${id}`, { method: 'DELETE' });
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      setExpanded((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    } catch (err) {
      console.error('Failed to delete notification:', err);
    }
  }

  if (authLoading) return null;
  if (!profile) return null;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-3xl mx-auto px-4 py-6 sm:py-8">

        {/* ── Header ── */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-none bg-orange-500/10 border border-orange-500/30 flex items-center justify-center shrink-0">
              <BellAlertIcon className="w-5 h-5 text-orange-500" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-black text-foreground uppercase tracking-widest leading-tight">
                Notifications
              </h1>
              {unreadCount > 0 && (
                <p className="text-[10px] font-black uppercase tracking-widest text-orange-600 dark:text-orange-400">
                  {unreadCount} unread
                </p>
              )}
            </div>
            {unreadCount > 0 && (
              <span className="ml-1 inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-none bg-orange-600 text-[10px] font-black text-primary-foreground shrink-0">
                {unreadCount}
              </span>
            )}
          </div>

          {unreadCount > 0 && (
            <button
              onClick={markAllAsRead}
              disabled={markingAll}
              className="flex items-center gap-2 px-4 py-2 rounded-none border border-orange-500/40 bg-orange-500/10 text-orange-400 text-xs font-black uppercase tracking-widest hover:bg-orange-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {markingAll ? (
                <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <CheckCircleIcon className="w-3.5 h-3.5" />
              )}
              {markingAll ? 'Marking...' : 'Mark All Read'}
            </button>
          )}
        </div>

        {/* ── Broadcast Panel — admin/teacher only ── */}
        {['admin', 'teacher'].includes(profile.role) && <BroadcastPanel />}

        {/* ── Automation Triggers — admin only ── */}
        {profile.role === 'admin' && <AutomationTriggers />}

        {/* ── Filter Tabs ── */}
        <div className="flex items-center gap-0 mb-6 border border-border bg-card rounded-none overflow-x-auto">
          {FILTER_TABS.map((tab) => {
            const isActive = filter === tab.key;
            const tabUnread =
              tab.key === 'unread' ? unreadCount : undefined;

            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setFilter(tab.key)}
                className={[
                  'flex items-center gap-1.5 px-3 sm:px-4 py-2.5 text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-colors border-r border-border last:border-r-0',
                  isActive
                    ? 'bg-primary/15 text-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/60',
                ].join(' ')}
              >
                {tab.label}
                {tabUnread !== undefined && tabUnread > 0 && (
                  <span className="inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded-none bg-orange-600 text-[9px] font-black text-primary-foreground">
                    {tabUnread}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* ── Content ── */}
        {loading ? (
          <NotificationSkeleton />
        ) : filteredNotifications.length === 0 ? (
          <EmptyState filter={filter} />
        ) : (
          <div className="flex flex-col gap-2">
            {filteredNotifications.map((notification) => {
              const cfg = TYPE_CONFIG[notification.type];
              const TypeIcon = cfg.icon;
              const isExpanded = expanded.has(notification.id);
              const isUnread = !notification.is_read;

              return (
                <div
                  key={notification.id}
                  onClick={() => toggleExpand(notification.id)}
                  className={[
                    'group relative border-l-2 border cursor-pointer transition-all',
                    cfg.border,
                    cfg.bg,
                    isUnread
                      ? 'border-l-current'
                      : 'border-l-border opacity-90',
                    'rounded-none',
                  ].join(' ')}
                  style={
                    isUnread
                      ? {
                          borderLeftColor:
                            notification.type === 'info'
                              ? 'rgb(59 130 246)'
                              : notification.type === 'warning'
                              ? 'rgb(251 191 36)'
                              : notification.type === 'success'
                              ? 'rgb(52 211 153)'
                              : 'rgb(251 113 133)',
                        }
                      : undefined
                  }
                >
                  <div className="flex items-start gap-3 px-4 py-3">
                    {/* Type icon */}
                    <div className="mt-0.5 shrink-0">
                      <TypeIcon className={`w-4 h-4 ${cfg.iconClass}`} />
                    </div>

                    {/* Body */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {/* Unread dot */}
                        <span
                          className={[
                            'inline-block w-2 h-2 rounded-none shrink-0',
                            isUnread ? cfg.dot : 'border border-border bg-transparent',
                          ].join(' ')}
                        />

                        {/* Title */}
                        <span
                          className={
                            isUnread
                              ? 'text-sm font-black text-foreground'
                              : 'text-sm font-semibold text-muted-foreground'
                          }
                        >
                          {notification.title}
                        </span>

                        {/* Type label */}
                        <span
                          className={`text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 border border-current rounded-none ${cfg.label}`}
                        >
                          {notification.type}
                        </span>
                      </div>

                      {/* Message preview / expanded */}
                      <p
                        className={[
                          'text-xs text-muted-foreground mt-1 leading-relaxed',
                          isExpanded ? '' : 'line-clamp-1',
                        ].join(' ')}
                      >
                        {notification.message}
                      </p>

                      {/* Time */}
                      <p className="text-[10px] text-muted-foreground/80 mt-1.5 font-medium tracking-wide">
                        {relativeTime(notification.created_at)}
                      </p>
                    </div>

                    {/* Delete button */}
                    <button
                      type="button"
                      onClick={(e) => deleteNotification(notification.id, e)}
                      className="shrink-0 p-1.5 rounded-none text-muted-foreground/40 hover:text-rose-500 dark:hover:text-rose-400 hover:bg-rose-500/10 transition-colors opacity-0 group-hover:opacity-100"
                      title="Delete notification"
                    >
                      <TrashIcon className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Footer count ── */}
        {!loading && notifications.length > 0 && (
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground text-center mt-8">
            {filteredNotifications.length}{' '}
            {filteredNotifications.length === 1 ? 'notification' : 'notifications'}
            {filter !== 'all' && ` · ${filter}`}
          </p>
        )}
      </div>
    </div>
  );
}
