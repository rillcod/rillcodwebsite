'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BellIcon, CheckCircleIcon, ExclamationTriangleIcon,
  InformationCircleIcon, XCircleIcon, TrophyIcon,
  FireIcon, SparklesIcon, TrashIcon,
  FunnelIcon, MagnifyingGlassIcon, EyeIcon, EyeSlashIcon,
  AcademicCapIcon, BookOpenIcon, ClipboardDocumentListIcon,
  CalendarDaysIcon, SpeakerWaveIcon, ArrowRightIcon
} from '@/lib/icons';

type StudentCategory = 'all' | 'unread' | 'exams' | 'materials' | 'assignments' | 'grades';

function classifyStudentNotification(n: Notification): Exclude<StudentCategory, 'all' | 'unread'> | 'general' {
  const hay = `${n.category || ''} ${n.action_url || ''} ${n.title || ''} ${n.message || ''}`.toLowerCase();
  if (hay.includes('/cbt') || hay.includes('exam') || hay.includes('test') || hay.includes('quiz') || hay.includes('proctor')) {
    return 'exams';
  }
  if (hay.includes('/lessons') || hay.includes('/learning') || hay.includes('material') || hay.includes('lesson') || hay.includes('slide') || hay.includes('study')) {
    return 'materials';
  }
  if (hay.includes('/assignments') || hay.includes('assignment') || hay.includes('homework') || hay.includes('submission') || hay.includes('due')) {
    return 'assignments';
  }
  if (
    n.type === 'achievement' ||
    n.type === 'streak' ||
    n.type === 'celebration' ||
    hay.includes('/grades') ||
    hay.includes('/results') ||
    hay.includes('grade') ||
    hay.includes('score') ||
    hay.includes('result') ||
    hay.includes('badge') ||
    hay.includes('certificate')
  ) {
    return 'grades';
  }
  return 'general';
}

function getActionLabel(n: Notification): string {
  const url = (n.action_url || '').toLowerCase();
  if (url.includes('/cbt')) return 'Open Exam';
  if (url.includes('/lessons') || url.includes('/learning')) return 'Open Study Material';
  if (url.includes('/assignments')) return 'Open Assignment';
  if (url.includes('/grades') || url.includes('/results')) return 'View Result';
  if (url.includes('/timetable')) return 'View Timetable';
  return 'View Details';
}

function formatRelativeTime(iso: string): string {
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return '';
  const diffMin = Math.floor((Date.now() - ts) / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(iso).toLocaleDateString();
}

interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error' | 'achievement' | 'streak' | 'celebration';
  is_read: boolean;
  created_at: string;
  category?: string;
  action_url?: string;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
}

const typeConfig = {
  info: {
    icon: InformationCircleIcon,
    color: 'text-primary',
    bgColor: 'bg-primary/10',
    borderColor: 'border-primary/30',
    emoji: '💡'
  },
  success: {
    icon: CheckCircleIcon,
    color: 'text-emerald-600 dark:text-emerald-400',
    bgColor: 'bg-emerald-500/10',
    borderColor: 'border-emerald-500/30',
    emoji: '✅'
  },
  warning: {
    icon: ExclamationTriangleIcon,
    color: 'text-amber-600 dark:text-amber-400',
    bgColor: 'bg-amber-500/10',
    borderColor: 'border-amber-500/30',
    emoji: '⚠️'
  },
  error: {
    icon: XCircleIcon,
    color: 'text-rose-600 dark:text-rose-400',
    bgColor: 'bg-rose-500/10',
    borderColor: 'border-rose-500/30',
    emoji: '❌'
  },
  achievement: {
    icon: TrophyIcon,
    color: 'text-yellow-600 dark:text-yellow-400',
    bgColor: 'bg-yellow-500/10',
    borderColor: 'border-yellow-500/30',
    emoji: '🏆'
  },
  streak: {
    icon: FireIcon,
    color: 'text-primary',
    bgColor: 'bg-primary/10',
    borderColor: 'border-primary/30',
    emoji: '🔥'
  },
  celebration: {
    icon: SparklesIcon,
    color: 'text-purple-600 dark:text-purple-400',
    bgColor: 'bg-purple-500/10',
    borderColor: 'border-purple-500/30',
    emoji: '🎉'
  }
};

export default function NotificationsPage() {
  const { profile } = useAuth();
  const router = useRouter();
  const isStudent = profile?.role === 'student';
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unread' | 'read'>('all');
  const [studentCategory, setStudentCategory] = useState<StudentCategory>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNotifications, setSelectedNotifications] = useState<Set<string>>(new Set());
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [soundLevel, setSoundLevel] = useState(70);
  const [showSoundControls, setShowSoundControls] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('rillcod_notification_sound');
      if (!saved) return;
      const parsed = JSON.parse(saved);
      setSoundEnabled(parsed.enabled !== false);
      setSoundLevel(typeof parsed.level === 'number' ? parsed.level : 70);
    } catch {
      // Ignore invalid local settings.
    }
  }, []);

  function saveSoundPreferences() {
    try {
      localStorage.setItem('rillcod_notification_sound', JSON.stringify({
        enabled: soundEnabled,
        level: soundLevel,
      }));
    } catch {
      // Ignore local storage failures.
    }
  }

  function playPreviewTone(level: number) {
    if (typeof window === 'undefined') return;
    const AudioCtx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = 880;
    gain.gain.value = Math.max(0.01, Math.min(1, level / 100)) * 0.05;
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.18);
    oscillator.onended = () => { void ctx.close(); };
  }

  // Load notifications
  useEffect(() => {
    if (!profile?.id) return;
    loadNotifications();
  }, [profile?.id]);

  // Real-time: push new notifications into the list as they arrive
  useEffect(() => {
    if (!profile?.id) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`notif-page-${profile.id}-${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${profile.id}` },
        (payload) => {
          const n = payload.new as any;
          setNotifications(prev => [{
            ...n,
            type: n.type || 'info',
            is_read: false,
            created_at: n.created_at || new Date().toISOString(),
          }, ...prev]);
        },
      )
      .subscribe();
    return () => { channel.unsubscribe(); supabase.removeChannel(channel); };
  }, [profile?.id]);

  async function loadNotifications() {
    if (!profile?.id) return;
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', profile.id)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      const mapped: Notification[] = (data || []).map((n: any) => ({
        ...n,
        type: n.type || 'info',
        is_read: !!n.is_read,
        created_at: n.created_at || new Date().toISOString()
      }));
      setNotifications(mapped);
    } catch (error) {
      console.error('Failed to load notifications:', error);
    } finally {
      setLoading(false);
    }
  }

  // Student category counts
  const studentCounts = useMemo(() => {
    const counts: Record<StudentCategory, number> = {
      all: notifications.length,
      unread: 0,
      exams: 0,
      materials: 0,
      assignments: 0,
      grades: 0,
    };
    for (const n of notifications) {
      if (!n.is_read) counts.unread += 1;
      const bucket = classifyStudentNotification(n);
      if (bucket !== 'general') counts[bucket] += 1;
    }
    return counts;
  }, [notifications]);

  // Filter and search notifications
  const filteredNotifications = useMemo(() => {
    let filtered = notifications;

    if (isStudent) {
      if (studentCategory === 'unread') {
        filtered = filtered.filter(n => !n.is_read);
      } else if (studentCategory !== 'all') {
        filtered = filtered.filter(n => classifyStudentNotification(n) === studentCategory);
      }
    } else {
      // Filter by read status
      if (filter === 'unread') {
        filtered = filtered.filter(n => !n.is_read);
      } else if (filter === 'read') {
        filtered = filtered.filter(n => n.is_read);
      }

      // Filter by type
      if (typeFilter !== 'all') {
        filtered = filtered.filter(n => n.type === typeFilter);
      }
    }

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(n =>
        n.title.toLowerCase().includes(query) ||
        n.message.toLowerCase().includes(query) ||
        n.category?.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [notifications, isStudent, studentCategory, filter, typeFilter, searchQuery]);

  async function openNotificationAction(notification: Notification) {
    if (!notification.is_read) {
      await toggleReadStatus(notification.id, false);
    }
    if (notification.action_url) {
      router.push(notification.action_url);
    }
  }

  // Statistics
  const stats = useMemo(() => {
    const total = notifications.length;
    const unread = notifications.filter(n => !n.is_read).length;
    const byType = notifications.reduce((acc, n) => {
      acc[n.type] = (acc[n.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return { total, unread, read: total - unread, byType };
  }, [notifications]);

  // Mark as read/unread
  async function toggleReadStatus(notificationId: string, isRead: boolean) {
    try {
      const supabase = createClient();
      await supabase.from('notifications').update(
        !isRead
          ? { is_read: true, read_at: new Date().toISOString() }
          : { is_read: false }
      ).eq('id', notificationId);
      setNotifications(prev =>
        prev.map(n => n.id === notificationId ? { ...n, is_read: !isRead } : n)
      );
    } catch (error) {
      console.error('Failed to update notification:', error);
    }
  }

  // Bulk actions
  async function markAllAsRead() {
    if (!profile?.id) return;
    try {
      const supabase = createClient();
      await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', profile.id)
        .eq('is_read', false);

      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    } catch (error) {
      console.error('Failed to mark all as read:', error);
    }
  }

  async function deleteSelected() {
    if (selectedNotifications.size === 0) return;

    try {
      const supabase = createClient();
      await supabase
        .from('notifications')
        .delete()
        .in('id', Array.from(selectedNotifications));

      setNotifications(prev => 
        prev.filter(n => !selectedNotifications.has(n.id))
      );
      setSelectedNotifications(new Set());
    } catch (error) {
      console.error('Failed to delete notifications:', error);
    }
  }

  // Toggle selection
  function toggleSelection(notificationId: string) {
    setSelectedNotifications(prev => {
      const newSet = new Set(prev);
      if (newSet.has(notificationId)) {
        newSet.delete(notificationId);
      } else {
        newSet.add(notificationId);
      }
      return newSet;
    });
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center mobile-page-root">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground relative overflow-hidden mobile-page-root">
      {/* Subtle grid texture — uses currentColor so it works in both themes */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,hsl(var(--border)/0.4)_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border)/0.4)_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,black_70%,transparent_100%)]" />
      
      {/* Header */}
      <div className="relative z-10 border-b border-border/40 bg-card/30 backdrop-blur-md">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <BellIcon className="w-4 h-4 text-primary" />
                <span className="text-[11px] font-black text-primary uppercase tracking-widest">
                  {isStudent ? 'Student Updates' : 'Notification Center'}
                </span>
                {stats.unread > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-primary text-primary-foreground text-[10px] font-black">
                    {stats.unread} new
                  </span>
                )}
              </div>
              <h1 className="text-2xl sm:text-3xl font-black text-foreground tracking-tight">
                Your Notifications
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                {isStudent
                  ? 'Exams, study materials, assignments, and results — all in one place.'
                  : 'Stay updated with all your activities, achievements, and important messages.'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {stats.unread > 0 && (
                <button
                  type="button"
                  onClick={markAllAsRead}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold transition-colors"
                >
                  <CheckCircleIcon className="w-4 h-4" />
                  Mark All Read
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowSoundControls((prev) => !prev)}
                aria-expanded={showSoundControls}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-border bg-card hover:bg-muted text-foreground text-xs font-bold transition-colors"
              >
                <SpeakerWaveIcon className="w-4 h-4 text-primary" />
                Sound: {soundEnabled ? `${soundLevel}%` : 'Off'}
              </button>
            </div>
          </div>

          {/* Collapsible Alert Sound Settings */}
          {showSoundControls && (
            <div className="mt-4 rounded-2xl bg-card border border-border p-4 sm:p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-[10px] font-black text-primary uppercase tracking-widest">Alert Sound</p>
                  <h2 className="text-sm font-black text-foreground mt-0.5">Notification sound controls</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Choose how loud notification previews should sound on this device.
                  </p>
                </div>
                <div className="flex flex-col gap-3 sm:min-w-[280px]">
                  <label className="flex items-center justify-between gap-4 text-xs font-bold text-foreground">
                    <span>Enable sound</span>
                    <button
                      type="button"
                      onClick={() => setSoundEnabled((prev) => !prev)}
                      aria-label="Toggle notification sound"
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${soundEnabled ? 'bg-primary' : 'bg-muted'}`}
                    >
                      <span className={`inline-block h-4 w-4 rounded-full bg-card transition-transform ${soundEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </label>
                  <label className="space-y-1.5 text-xs font-bold text-foreground">
                    <span className="flex items-center justify-between">
                      <span>Sound level</span>
                      <span className="text-muted-foreground">{soundLevel}%</span>
                    </span>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="5"
                      value={soundLevel}
                      onChange={(e) => setSoundLevel(Number(e.target.value))}
                      disabled={!soundEnabled}
                      className="w-full accent-primary"
                    />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        saveSoundPreferences();
                        if (soundEnabled) playPreviewTone(soundLevel);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary/10 border border-primary/25 text-primary text-xs font-bold hover:bg-primary/20"
                    >
                      Preview
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        saveSoundPreferences();
                        setShowSoundControls(false);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-background border border-border text-foreground text-xs font-bold hover:bg-muted"
                    >
                      Save &amp; Close
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 relative z-10 space-y-5">
        {/* Student Smart Category Pills OR Staff Filter Bar */}
        {isStudent ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
              {(
                [
                  { id: 'all', label: 'All', count: studentCounts.all, icon: BellIcon },
                  { id: 'unread', label: 'Unread', count: studentCounts.unread, icon: SparklesIcon },
                  { id: 'exams', label: 'Exams & CBT', count: studentCounts.exams, icon: AcademicCapIcon },
                  { id: 'materials', label: 'Study Materials', count: studentCounts.materials, icon: BookOpenIcon },
                  { id: 'assignments', label: 'Assignments', count: studentCounts.assignments, icon: ClipboardDocumentListIcon },
                  { id: 'grades', label: 'Grades & Badges', count: studentCounts.grades, icon: TrophyIcon },
                ] as const
              ).map((tab) => {
                const TabIcon = tab.icon;
                const active = studentCategory === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setStudentCategory(tab.id)}
                    className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-bold whitespace-nowrap border transition-colors shrink-0 ${
                      active
                        ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                        : 'bg-card border-border text-foreground hover:border-primary/50 hover:bg-muted/50'
                    }`}
                  >
                    <TabIcon className="w-3.5 h-3.5" />
                    <span>{tab.label}</span>
                    {tab.count > 0 && (
                      <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${
                        active ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-muted text-muted-foreground'
                      }`}>
                        {tab.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[220px]">
                <div className="absolute inset-y-0 left-3.5 flex items-center pointer-events-none">
                  <MagnifyingGlassIcon className="w-4 h-4 text-muted-foreground" />
                </div>
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search exams, study materials, assignments..."
                  className="w-full rounded-xl bg-card border border-border pl-10 pr-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                />
              </div>

              {selectedNotifications.size > 0 && (
                <button
                  type="button"
                  onClick={deleteSelected}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition-colors"
                >
                  <TrashIcon className="w-4 h-4" />
                  Delete ({selectedNotifications.size})
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="bg-card/60 backdrop-blur-xl border border-border rounded-2xl p-4 sm:p-5 space-y-4">
            <div className="relative group">
              <div className="absolute inset-y-0 left-3.5 flex items-center pointer-events-none">
                <MagnifyingGlassIcon className="w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
              </div>
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search notifications..."
                className="w-full rounded-xl bg-background border border-border pl-10 pr-4 py-2.5 text-sm font-medium text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <FunnelIcon className="w-4 h-4 text-muted-foreground" />
                <select
                  value={filter}
                  onChange={(e) => setFilter(e.target.value as any)}
                  className="rounded-xl bg-background border border-border px-3 py-2 text-xs font-semibold text-foreground focus:outline-none focus:border-primary"
                >
                  <option value="all">All Notifications</option>
                  <option value="unread">Unread Only</option>
                  <option value="read">Read Only</option>
                </select>
              </div>

              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="rounded-xl bg-background border border-border px-3 py-2 text-xs font-semibold text-foreground focus:outline-none focus:border-primary"
              >
                <option value="all">All Types</option>
                {Object.entries(typeConfig).map(([type, config]) => (
                  <option key={type} value={type}>
                    {config.emoji} {type.charAt(0).toUpperCase() + type.slice(1)}
                  </option>
                ))}
              </select>

              {selectedNotifications.size > 0 && (
                <button
                  type="button"
                  onClick={deleteSelected}
                  className="ml-auto inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition-colors"
                >
                  <TrashIcon className="w-4 h-4" />
                  Delete ({selectedNotifications.size})
                </button>
              )}
            </div>
          </div>
        )}

        {/* Notifications List */}
        {filteredNotifications.length === 0 ? (
          <div className="text-center py-14 px-6 bg-card border border-border rounded-2xl">
            <BellIcon className="w-12 h-12 mx-auto text-muted-foreground/40 mb-3" />
            <h3 className="text-base font-bold text-foreground mb-1">
              {searchQuery || (isStudent && studentCategory !== 'all')
                ? 'No matching notifications'
                : 'You are all caught up!'}
            </h3>
            <p className="text-muted-foreground text-xs max-w-sm mx-auto">
              {searchQuery || (isStudent && studentCategory !== 'all')
                ? 'Try switching categories or clearing your search filter.'
                : 'When your teachers post exams, study materials, or grades, they will appear here right away.'}
            </p>
            {isStudent && (
              <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => router.push('/dashboard/learning')}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-border bg-background hover:bg-muted text-xs font-bold text-foreground"
                >
                  <BookOpenIcon className="w-4 h-4 text-primary" />
                  My Learning
                </button>
                <button
                  type="button"
                  onClick={() => router.push('/dashboard/cbt')}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-border bg-background hover:bg-muted text-xs font-bold text-foreground"
                >
                  <AcademicCapIcon className="w-4 h-4 text-primary" />
                  Exams &amp; CBT
                </button>
                <button
                  type="button"
                  onClick={() => router.push('/dashboard/assignments')}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-border bg-background hover:bg-muted text-xs font-bold text-foreground"
                >
                  <ClipboardDocumentListIcon className="w-4 h-4 text-primary" />
                  Assignments
                </button>
                <button
                  type="button"
                  onClick={() => router.push('/dashboard/timetable')}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-border bg-background hover:bg-muted text-xs font-bold text-foreground"
                >
                  <CalendarDaysIcon className="w-4 h-4 text-primary" />
                  Timetable
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <AnimatePresence>
              {filteredNotifications.map((notification, index) => {
                const config = typeConfig[notification.type] || typeConfig.info;
                const Icon = config.icon;
                const isSelected = selectedNotifications.has(notification.id);
                const actionLabel = getActionLabel(notification);

                return (
                  <motion.div
                    key={notification.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: 40 }}
                    transition={{ delay: Math.min(index * 0.02, 0.2) }}
                    className={`
                      relative rounded-2xl bg-card border transition-all duration-200 overflow-hidden
                      ${notification.is_read ? 'border-border/70 opacity-80' : 'border-primary/40 shadow-sm'}
                      ${isSelected ? 'border-primary ring-2 ring-primary/20' : ''}
                      hover:border-primary/60
                    `}
                  >
                    {/* Unread indicator */}
                    {!notification.is_read && (
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary" />
                    )}

                    <div className="p-4 sm:p-5">
                      <div className="flex items-start gap-3 sm:gap-4">
                        {/* Selection Checkbox */}
                        <div className="flex items-center pt-1">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelection(notification.id)}
                            aria-label={`Select notification: ${notification.title}`}
                            className="w-4 h-4 text-primary bg-background border-border rounded focus:ring-primary"
                          />
                        </div>

                        {/* Icon */}
                        <div className={`
                          flex-shrink-0 w-9 h-9 sm:w-10 sm:h-10 rounded-xl ${config.bgColor} ${config.borderColor}
                          border flex items-center justify-center
                        `}>
                          <Icon className={`w-5 h-5 ${config.color}`} />
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <h3 className={`
                              text-sm font-bold leading-snug
                              ${notification.is_read ? 'text-muted-foreground' : 'text-foreground'}
                            `}>
                              {notification.title}
                            </h3>

                            <div className="flex items-center gap-1.5 shrink-0">
                              {notification.priority === 'urgent' && (
                                <span className="px-2 py-0.5 bg-red-500/15 text-red-700 dark:text-red-400 text-[10px] font-black rounded-full uppercase">
                                  Urgent
                                </span>
                              )}

                              <button
                                type="button"
                                onClick={() => toggleReadStatus(notification.id, notification.is_read)}
                                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                                title={notification.is_read ? 'Mark as unread' : 'Mark as read'}
                                aria-label={notification.is_read ? 'Mark as unread' : 'Mark as read'}
                              >
                                {notification.is_read ? (
                                  <EyeSlashIcon className="w-4 h-4" />
                                ) : (
                                  <EyeIcon className="w-4 h-4" />
                                )}
                              </button>
                            </div>
                          </div>

                          <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed mb-3">
                            {notification.message}
                          </p>

                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                              <span>{formatRelativeTime(notification.created_at)}</span>
                              {notification.category && (
                                <span className="px-2 py-0.5 bg-muted text-muted-foreground rounded-full font-semibold capitalize">
                                  {notification.category}
                                </span>
                              )}
                            </div>

                            {notification.action_url && (
                              <button
                                type="button"
                                onClick={() => openNotificationAction(notification)}
                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-xs font-bold transition-colors"
                              >
                                {actionLabel}
                                <ArrowRightIcon className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}
