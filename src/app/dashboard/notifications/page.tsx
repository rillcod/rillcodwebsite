'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BellIcon, CheckCircleIcon, ExclamationTriangleIcon,
  InformationCircleIcon, XCircleIcon, TrophyIcon,
  FireIcon, SparklesIcon, TrashIcon, ArchiveBoxIcon,
  FunnelIcon, MagnifyingGlassIcon, EyeIcon, EyeSlashIcon
} from '@/lib/icons';

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
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500/30',
    emoji: '💡'
  },
  success: {
    icon: CheckCircleIcon,
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-500/10',
    borderColor: 'border-emerald-500/30',
    emoji: '✅'
  },
  warning: {
    icon: ExclamationTriangleIcon,
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/10',
    borderColor: 'border-amber-500/30',
    emoji: '⚠️'
  },
  error: {
    icon: XCircleIcon,
    color: 'text-rose-400',
    bgColor: 'bg-rose-500/10',
    borderColor: 'border-rose-500/30',
    emoji: '❌'
  },
  achievement: {
    icon: TrophyIcon,
    color: 'text-yellow-400',
    bgColor: 'bg-yellow-500/10',
    borderColor: 'border-yellow-500/30',
    emoji: '🏆'
  },
  streak: {
    icon: FireIcon,
    color: 'text-orange-400',
    bgColor: 'bg-orange-500/10',
    borderColor: 'border-orange-500/30',
    emoji: '🔥'
  },
  celebration: {
    icon: SparklesIcon,
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/10',
    borderColor: 'border-purple-500/30',
    emoji: '🎉'
  }
};

export default function NotificationsPage() {
  const { profile } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unread' | 'read'>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNotifications, setSelectedNotifications] = useState<Set<string>>(new Set());

  // Load notifications
  useEffect(() => {
    if (!profile) return;
    loadNotifications();
  }, [profile]);

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
      setNotifications(data || []);
    } catch (error) {
      console.error('Failed to load notifications:', error);
    } finally {
      setLoading(false);
    }
  }

  // Filter and search notifications
  const filteredNotifications = useMemo(() => {
    let filtered = notifications;

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
  }, [notifications, filter, typeFilter, searchQuery]);

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
      await supabase
        .from('notifications')
        .update({ is_read: !isRead })
        .eq('id', notificationId);

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
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#020817] text-foreground relative overflow-hidden">
      {/* Neural Background Texture */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]" />
      
      {/* Header */}
      <div className="relative z-10 border-b border-border/40 bg-card/20 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <BellIcon className="w-5 h-5 text-orange-400" />
                <span className="text-xs font-bold text-orange-400 uppercase tracking-widest">
                  Notification Center
                </span>
              </div>
              <h1 className="text-3xl lg:text-4xl font-black text-foreground">
                Your Notifications
              </h1>
              <p className="text-muted-foreground mt-2">
                Stay updated with all your activities, achievements, and important messages
              </p>
            </div>
            
            {/* Quick Stats */}
            <div className="grid grid-cols-3 gap-6">
              {[
                { label: 'Total Logs', value: stats.total, color: 'text-foreground' },
                { label: 'Pending', value: stats.unread, color: 'text-orange-400' },
                { label: 'Cleared', value: stats.read, color: 'text-emerald-400' },
              ].map(stat => (
                <div key={stat.label} className="text-center group">
                  <p className={`text-4xl font-black italic tracking-tighter transition-transform group-hover:scale-110 ${stat.color}`}>
                    {stat.value}
                  </p>
                  <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] mt-1">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 relative z-10">
        {/* Filters and Search */}
        <div className="bg-card/40 backdrop-blur-xl border border-border/40 p-6 mb-10 space-y-6">
          {/* Search */}
          <div className="relative group">
            <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
              <MagnifyingGlassIcon className="w-5 h-5 text-muted-foreground group-focus-within:text-orange-400 transition-colors" />
            </div>
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="SCAN ARCHIVE..."
              className="w-full bg-background/50 border border-border/40 pl-12 pr-4 py-4 text-sm font-bold text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-orange-500/60 transition-all italic tracking-tight"
            />
          </div>

          {/* Filter Controls */}
          <div className="flex flex-wrap items-center gap-4">
            {/* Read Status Filter */}
            <div className="flex items-center gap-2">
              <FunnelIcon className="w-4 h-4 text-muted-foreground" />
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value as any)}
                className="bg-background border border-border px-3 py-2 text-sm text-foreground focus:outline-none focus:border-orange-500"
              >
                <option value="all">All Notifications</option>
                <option value="unread">Unread Only</option>
                <option value="read">Read Only</option>
              </select>
            </div>

            {/* Type Filter */}
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="bg-background border border-border px-3 py-2 text-sm text-foreground focus:outline-none focus:border-orange-500"
            >
              <option value="all">All Types</option>
              {Object.entries(typeConfig).map(([type, config]) => (
                <option key={type} value={type}>
                  {config.emoji} {type.charAt(0).toUpperCase() + type.slice(1)}
                </option>
              ))}
            </select>

            {/* Bulk Actions */}
            <div className="flex items-center gap-2 ml-auto">
              {selectedNotifications.size > 0 && (
                <button
                  onClick={deleteSelected}
                  className="flex items-center gap-2 px-3 py-2 bg-red-600 hover:bg-red-500 text-white text-sm font-medium transition-colors"
                >
                  <TrashIcon className="w-4 h-4" />
                  Delete ({selectedNotifications.size})
                </button>
              )}
              
              {stats.unread > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="flex items-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium transition-colors"
                >
                  <CheckCircleIcon className="w-4 h-4" />
                  Mark All Read
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Notifications List */}
        {filteredNotifications.length === 0 ? (
          <div className="text-center py-20 bg-card border border-border">
            <BellIcon className="w-16 h-16 mx-auto text-muted-foreground/40 mb-4" />
            <h3 className="text-lg font-bold text-foreground mb-2">
              {searchQuery ? 'No matching notifications' : 'No notifications yet'}
            </h3>
            <p className="text-muted-foreground text-sm">
              {searchQuery 
                ? 'Try adjusting your search terms or filters'
                : 'When you receive notifications, they\'ll appear here'
              }
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <AnimatePresence>
              {filteredNotifications.map((notification, index) => {
                const config = typeConfig[notification.type];
                const Icon = config.icon;
                const isSelected = selectedNotifications.has(notification.id);
                
                return (
                  <motion.div
                    key={notification.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 100 }}
                    transition={{ delay: index * 0.03 }}
                    className={`
                      relative bg-card/30 backdrop-blur-sm border transition-all duration-300 group
                      ${notification.is_read ? 'border-border/30 opacity-60' : 'border-orange-500/40 shadow-[0_0_20px_rgba(249,115,22,0.05)]'}
                      ${isSelected ? 'border-orange-500 ring-1 ring-orange-500/20' : ''}
                      hover:bg-card/50 hover:border-orange-500/50
                    `}
                    onClick={() => toggleSelection(notification.id)}
                  >
                    <div className="p-6">
                      <div className="flex items-start gap-4">
                        {/* Selection Checkbox */}
                        <div className="flex items-center pt-1">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelection(notification.id)}
                            className="w-4 h-4 text-orange-600 bg-background border-border rounded focus:ring-orange-500"
                          />
                        </div>

                        {/* Icon */}
                        <div className={`
                          flex-shrink-0 w-10 h-10 rounded-full ${config.bgColor} ${config.borderColor} 
                          border flex items-center justify-center
                        `}>
                          <Icon className={`w-5 h-5 ${config.color}`} />
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between mb-2">
                            <h3 className={`
                              text-sm font-bold leading-tight
                              ${notification.is_read ? 'text-muted-foreground' : 'text-foreground'}
                            `}>
                              {config.emoji} {notification.title}
                            </h3>
                            
                            <div className="flex items-center gap-2 ml-4">
                              {notification.priority === 'urgent' && (
                                <span className="px-2 py-0.5 bg-red-500/20 text-red-400 text-xs font-bold rounded-full">
                                  URGENT
                                </span>
                              )}
                              
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleReadStatus(notification.id, notification.is_read);
                                }}
                                className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                                title={notification.is_read ? 'Mark as unread' : 'Mark as read'}
                              >
                                {notification.is_read ? (
                                  <EyeSlashIcon className="w-4 h-4" />
                                ) : (
                                  <EyeIcon className="w-4 h-4" />
                                )}
                              </button>
                            </div>
                          </div>

                          <p className="text-xs text-muted-foreground leading-relaxed mb-3">
                            {notification.message}
                          </p>

                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3 text-xs text-muted-foreground">
                              <span>
                                {new Date(notification.created_at).toLocaleDateString()} at{' '}
                                {new Date(notification.created_at).toLocaleTimeString()}
                              </span>
                              
                              {notification.category && (
                                <span className="px-2 py-0.5 bg-muted text-muted-foreground rounded-full">
                                  {notification.category}
                                </span>
                              )}
                            </div>

                            {notification.action_url && (
                              <a
                                href={notification.action_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="text-xs font-medium text-orange-500 hover:text-orange-400 transition-colors"
                              >
                                View Details →
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Unread indicator */}
                    {!notification.is_read && (
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-orange-500" />
                    )}
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