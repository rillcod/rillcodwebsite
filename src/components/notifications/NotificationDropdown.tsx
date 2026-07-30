'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import {
  BellIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  XCircleIcon,
  ArrowPathIcon,
} from '@/lib/icons';
import { motion, AnimatePresence } from 'framer-motion';

interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  created_at: string;
  action_url?: string | null;
}

const typeIcons: Record<string, typeof InformationCircleIcon> = {
  info: InformationCircleIcon,
  success: CheckCircleIcon,
  warning: ExclamationTriangleIcon,
  error: XCircleIcon,
};

const typeColors: Record<string, string> = {
  info: 'bg-primary/10 text-primary',
  success: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  warning: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  error: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
  achievement: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400',
  streak: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
  celebration: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
};

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export default function NotificationDropdown() {
  const { profile } = useAuth();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    try {
      const supabase = createClient();
      const { data } = await supabase
        .from('notifications')
        .select('id, title, message, type, is_read, created_at, action_url')
        .eq('user_id', profile.id)
        .order('created_at', { ascending: false })
        .limit(20);

      const mapped: Notification[] = (data ?? []).map((n: any) => ({
        id: n.id,
        title: n.title || '',
        message: n.message || '',
        type: n.type || 'info',
        is_read: !!n.is_read,
        created_at: n.created_at || new Date().toISOString(),
        action_url: n.action_url ?? null,
      }));
      setNotifications(mapped);
      setUnreadCount(mapped.filter(n => !n.is_read).length);
    } finally {
      setLoading(false);
    }
  }, [profile]);

  // Fetch on mount and when profile changes
  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Fetch when dropdown opens (to get latest)
  useEffect(() => {
    if (isOpen) fetchNotifications();
  }, [isOpen, fetchNotifications]);

  // Real-time subscription for new notifications.
  // Channel name includes a random suffix so StrictMode's double-invocation
  // never collides with Supabase's internal channel cache (same name = same
  // already-subscribed instance → "cannot add callbacks after subscribe()").
  useEffect(() => {
    if (!profile?.id) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`notif-bell-${profile.id}-${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${profile.id}`,
        },
        (payload) => {
          const n = payload.new as any;
          const newNotif: Notification = {
            id: n.id,
            title: n.title || '',
            message: n.message || '',
            type: n.type || 'info',
            is_read: false,
            created_at: n.created_at || new Date().toISOString(),
            action_url: n.action_url ?? null,
          };
          setNotifications(prev => [newNotif, ...prev].slice(0, 20));
          setUnreadCount(prev => prev + 1);
        },
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, [profile?.id]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const markAsRead = async (id: string) => {
    setMarkingId(id);
    try {
      const supabase = createClient();
      await supabase
        .from('notifications')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('id', id);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } finally {
      setMarkingId(null);
    }
  };

  const markAllAsRead = async () => {
    if (!profile || unreadCount === 0) return;
    const supabase = createClient();
    await supabase
      .from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('user_id', profile.id)
      .eq('is_read', false);
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    setUnreadCount(0);
  };

  const handleNotificationClick = async (n: Notification) => {
    if (!n.is_read) await markAsRead(n.id);
    if (n.action_url) {
      setIsOpen(false);
      router.push(n.action_url);
    }
  };

  const dismissNotification = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setMarkingId(id);
    try {
      const supabase = createClient();
      // Mark read as the dismiss action (no hard delete to preserve history)
      await supabase
        .from('notifications')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('id', id);
      setNotifications(prev => prev.filter(n => n.id !== id));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } finally {
      setMarkingId(null);
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(v => !v)}
        className="relative p-2 text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-foreground/[0.06] transition-all rounded-lg outline-none"
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
      >
        <BellIcon className="w-5 h-5 md:w-6 md:h-6" />
        <AnimatePresence>
          {unreadCount > 0 && (
            <motion.span
              key="badge"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              className="absolute top-1 right-1 w-3.5 h-3.5 bg-rose-500 text-white text-[8px] font-black rounded-full flex items-center justify-center ring-2 ring-sidebar"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </motion.span>
          )}
        </AnimatePresence>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 mt-2 w-80 sm:w-96 bg-card border border-border/50 shadow-2xl rounded-2xl z-50 overflow-hidden"
          >
            {/* Header */}
            <div className="px-4 py-3 border-b border-border/50 flex items-center justify-between bg-muted/20">
              <div className="flex items-center gap-2">
                <h3 className="font-black text-sm text-foreground uppercase tracking-widest">Notifications</h3>
                {loading && <ArrowPathIcon className="w-3.5 h-3.5 text-muted-foreground animate-spin" />}
              </div>
              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <button
                    onClick={markAllAsRead}
                    className="text-[10px] font-black text-primary hover:text-primary/80 uppercase tracking-wider"
                  >
                    Mark all read
                  </button>
                )}
              </div>
            </div>

            {/* List */}
            <div className="max-h-[400px] overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="p-10 text-center text-muted-foreground flex flex-col items-center justify-center">
                  <BellIcon className="w-8 h-8 opacity-20 mb-2" />
                  <p className="text-xs font-bold">All caught up</p>
                  <p className="text-[10px] text-muted-foreground/60 mt-0.5">No notifications yet</p>
                </div>
              ) : (
                <div className="flex flex-col divide-y divide-border/30">
                  {notifications.map((notif) => {
                    const Icon = typeIcons[notif.type] ?? InformationCircleIcon;
                    const colorCls = typeColors[notif.type] ?? typeColors.info;
                    const busy = markingId === notif.id;
                    return (
                      <div
                        key={notif.id}
                        onClick={() => handleNotificationClick(notif)}
                        className={`group relative px-4 py-3.5 transition-colors cursor-pointer ${
                          !notif.is_read
                            ? 'bg-primary/5 hover:bg-primary/10'
                            : 'hover:bg-muted/30'
                        } ${notif.action_url ? 'cursor-pointer' : 'cursor-default'}`}
                      >
                        <div className="flex items-start gap-3">
                          {/* Icon */}
                          <div className={`mt-0.5 shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${colorCls}`}>
                            {busy
                              ? <ArrowPathIcon className="w-4 h-4 animate-spin" />
                              : <Icon className="w-4 h-4" />
                            }
                          </div>

                          {/* Content */}
                          <div className="flex-1 min-w-0 pr-5">
                            <p className={`text-xs font-bold truncate ${!notif.is_read ? 'text-foreground' : 'text-foreground/70'}`}>
                              {notif.title}
                            </p>
                            <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">
                              {notif.message}
                            </p>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-[9px] text-muted-foreground/60 uppercase tracking-wider font-bold">
                                {relativeTime(notif.created_at)}
                              </span>
                              {notif.action_url && !notif.is_read && (
                                <span className="text-[9px] text-primary font-black uppercase tracking-wider">
                                  tap to open →
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Unread dot + dismiss */}
                          <div className="shrink-0 flex flex-col items-center gap-1.5 pt-0.5">
                            {!notif.is_read && (
                              <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                            )}
                            <button
                              onClick={(e) => dismissNotification(e, notif.id)}
                              className="opacity-0 group-hover:opacity-100 transition-opacity w-5 h-5 rounded-full bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/80 text-[10px] font-black"
                              title="Dismiss"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-4 py-2.5 border-t border-border/50 bg-muted/10 flex items-center justify-between">
              <button
                onClick={fetchNotifications}
                className="text-[10px] font-black text-muted-foreground hover:text-foreground uppercase tracking-widest inline-flex items-center gap-1"
              >
                <ArrowPathIcon className="w-3 h-3" /> Refresh
              </button>
              <Link
                href="/dashboard/notifications"
                onClick={() => setIsOpen(false)}
                className="text-[10px] font-black text-foreground hover:text-primary transition-colors uppercase tracking-widest inline-flex items-center gap-1"
              >
                Full inbox →
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
