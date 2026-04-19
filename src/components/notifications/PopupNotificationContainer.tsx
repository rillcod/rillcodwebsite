'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import PopupNotification from './PopupNotification';
import { AnimatePresence, motion } from 'framer-motion';
import { BellIcon, XMarkIcon } from '@/lib/icons';

interface PopupNotificationData {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error' | 'achievement' | 'streak' | 'celebration';
  timestamp: string;
  autoClose?: number;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  actionLabel?: string;
  actionUrl?: string;
  category?: string;
  sound?: boolean;
}

interface NotificationStats {
  total: number;
  unread: number;
  byType: Record<string, number>;
}

export default function PopupNotificationContainer() {
  const { profile } = useAuth();
  const [notifications, setNotifications] = useState<PopupNotificationData[]>([]);
  const [isMinimized, setIsMinimized] = useState(false);
  const [stats, setStats] = useState<NotificationStats>({ total: 0, unread: 0, byType: {} });
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'connecting' | 'disconnected'>('connecting');

  // Smart positioning based on screen size
  const containerPosition = useMemo(() => {
    if (typeof window === 'undefined') return 'top-4 right-4';
    
    const isMobile = window.innerWidth < 768;
    const isTablet = window.innerWidth < 1024;
    
    if (isMobile) {
      return 'top-4 left-4 right-4'; // Full width on mobile
    } else if (isTablet) {
      return 'top-4 right-4 max-w-sm';
    } else {
      return 'top-4 right-4 max-w-md';
    }
  }, []);

  // Priority-based sorting
  const sortedNotifications = useMemo(() => {
    const priorityOrder = { urgent: 4, high: 3, normal: 2, low: 1 };
    return [...notifications].sort((a, b) => {
      const aPriority = priorityOrder[a.priority || 'normal'];
      const bPriority = priorityOrder[b.priority || 'normal'];
      if (aPriority !== bPriority) return bPriority - aPriority;
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });
  }, [notifications]);

  // Update stats when notifications change
  useEffect(() => {
    const byType = notifications.reduce((acc, notif) => {
      acc[notif.type] = (acc[notif.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    setStats({
      total: notifications.length,
      unread: notifications.length,
      byType
    });
  }, [notifications]);

  useEffect(() => {
    if (!profile) return;

    const supabase = createClient();
    
    // Listen for real-time popup notifications with enhanced error handling
    const channel = supabase.channel(`popup-notifications-${profile.id}`)
      .on('broadcast', { event: 'notification:popup' }, (payload) => {
        try {
          const notification = payload.payload as PopupNotificationData;
          
          // Validate notification structure
          if (!notification.id || !notification.title || !notification.message) {
            console.warn('Invalid notification payload received:', payload);
            return;
          }
          
          setNotifications(prev => {
            // Prevent duplicate notifications
            if (prev.some(n => n.id === notification.id)) {
              return prev;
            }
            
            // Smart limit based on priority
            const maxNotifications = notification.priority === 'urgent' ? 8 : 6;
            const updated = [notification, ...prev];
            
            // Remove oldest low-priority notifications if limit exceeded
            if (updated.length > maxNotifications) {
              const sorted = updated.sort((a, b) => {
                const priorityOrder = { urgent: 4, high: 3, normal: 2, low: 1 };
                const aPriority = priorityOrder[a.priority || 'normal'];
                const bPriority = priorityOrder[b.priority || 'normal'];
                return bPriority - aPriority;
              });
              return sorted.slice(0, maxNotifications);
            }
            
            return updated;
          });
          
          setConnectionStatus('connected');
        } catch (error) {
          console.error('Error processing notification:', error);
        }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('Notification channel subscribed successfully');
          setConnectionStatus('connected');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('Notification channel error');
          setConnectionStatus('disconnected');
        } else if (status === 'CLOSED') {
          setConnectionStatus('disconnected');
        }
      });

    // Connection monitoring
    const connectionMonitor = setInterval(() => {
      if (channel.state === 'closed') {
        setConnectionStatus('disconnected');
      }
    }, 5000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(connectionMonitor);
    };
  }, [profile?.id]);

  const removeNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  const clearAllNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  const handleNotificationAction = useCallback((notification: PopupNotificationData) => {
    if (notification.actionUrl) {
      window.open(notification.actionUrl, '_blank');
    }
    // Keep notification visible for actions unless it's a one-time action
    if (!notification.actionUrl?.includes('one-time')) {
      removeNotification(notification.id);
    }
  }, [removeNotification]);

  // Don't render if no notifications and not minimized
  if (notifications.length === 0 && !isMinimized) {
    return null;
  }

  return (
    <div className={`fixed ${containerPosition} z-50 pointer-events-none`}>
      {/* Connection Status Indicator */}
      {connectionStatus !== 'connected' && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-2 pointer-events-auto"
        >
          <div className="bg-amber-500/10 border border-amber-500/30 text-amber-400 px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-2">
            <div className="w-2 h-2 bg-amber-400 rounded-full animate-pulse" />
            {connectionStatus === 'connecting' ? 'Connecting...' : 'Connection lost'}
          </div>
        </motion.div>
      )}

      {/* Notification Summary (when minimized) */}
      {isMinimized && notifications.length > 0 && (
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="mb-2 pointer-events-auto"
        >
          <button
            onClick={() => setIsMinimized(false)}
            className="bg-background/90 backdrop-blur-md border border-border rounded-full p-3 shadow-lg hover:shadow-xl transition-all group"
          >
            <div className="flex items-center gap-2">
              <div className="relative">
                <BellIcon className="w-5 h-5 text-foreground" />
                {stats.unread > 0 && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold"
                  >
                    {stats.unread > 9 ? '9+' : stats.unread}
                  </motion.div>
                )}
              </div>
              <span className="text-xs font-medium text-foreground group-hover:text-orange-500 transition-colors">
                {stats.unread} new
              </span>
            </div>
          </button>
        </motion.div>
      )}

      {/* Notifications Container */}
      {!isMinimized && (
        <div className="space-y-3 pointer-events-auto">
          {/* Header with controls */}
          {notifications.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center justify-between mb-3"
            >
              <div className="flex items-center gap-2">
                <BellIcon className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground">
                  {notifications.length} notification{notifications.length !== 1 ? 's' : ''}
                </span>
              </div>
              
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setIsMinimized(true)}
                  className="p-1.5 text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-muted/50"
                  title="Minimize"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                  </svg>
                </button>
                
                {notifications.length > 1 && (
                  <button
                    onClick={clearAllNotifications}
                    className="p-1.5 text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-muted/50"
                    title="Clear all"
                  >
                    <XMarkIcon className="w-3 h-3" />
                  </button>
                )}
              </div>
            </motion.div>
          )}

          {/* Notifications List */}
          <AnimatePresence mode="popLayout">
            {sortedNotifications.map((notification, index) => (
              <motion.div
                key={notification.id}
                layout
                initial={{ opacity: 0, y: -20, scale: 0.9 }}
                animate={{ 
                  opacity: 1, 
                  y: 0, 
                  scale: 1,
                  transition: { delay: index * 0.1 }
                }}
                exit={{ 
                  opacity: 0, 
                  x: 300, 
                  scale: 0.8,
                  transition: { duration: 0.2 }
                }}
                className="relative"
              >
                <PopupNotification
                  notification={notification}
                  onClose={removeNotification}
                  onAction={handleNotificationAction}
                />
              </motion.div>
            ))}
          </AnimatePresence>

          {/* Notification Statistics (for debugging/admin) */}
          {process.env.NODE_ENV === 'development' && stats.total > 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mt-4 p-2 bg-muted/20 rounded-lg text-xs text-muted-foreground"
            >
              <div className="flex justify-between">
                <span>Total: {stats.total}</span>
                <span>Types: {Object.keys(stats.byType).length}</span>
              </div>
            </motion.div>
          )}
        </div>
      )}
    </div>
  );
}