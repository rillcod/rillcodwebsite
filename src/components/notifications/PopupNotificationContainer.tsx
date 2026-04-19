'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import PopupNotification from './PopupNotification';
import { AnimatePresence } from 'framer-motion';

interface PopupNotificationData {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  timestamp: string;
  autoClose?: number;
}

export default function PopupNotificationContainer() {
  const { profile } = useAuth();
  const [notifications, setNotifications] = useState<PopupNotificationData[]>([]);

  useEffect(() => {
    if (!profile) return;

    const supabase = createClient();
    
    // Listen for real-time popup notifications
    const channel = supabase.channel(`popup-notifications-${profile.id}`)
      .on('broadcast', { event: 'notification:popup' }, (payload) => {
        const notification = payload.payload as PopupNotificationData;
        setNotifications(prev => [...prev, notification]);
        
        // Auto-remove after specified time
        if (notification.autoClose) {
          setTimeout(() => {
            removeNotification(notification.id);
          }, notification.autoClose);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.id]);

  const removeNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2 max-w-sm">
      <AnimatePresence>
        {notifications.map(notification => (
          <PopupNotification
            key={notification.id}
            notification={notification}
            onClose={removeNotification}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}