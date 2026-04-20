'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import { motion, AnimatePresence } from 'framer-motion';
import { XMarkIcon, SignalIcon, VideoCameraIcon } from '@/lib/icons';

interface LiveAlert {
  id: string;
  title: string;
  session_url: string | null;
  platform: string;
}

function isJitsiUrl(url?: string | null) {
  return !!url && url.includes('meet.jit.si');
}

export default function LiveSessionWatcher() {
  const { profile } = useAuth();
  const router = useRouter();
  const [alerts, setAlerts] = useState<LiveAlert[]>([]);
  // Track sessions we've already alerted for so we don't re-fire on re-render
  const [alerted, setAlerted] = useState<Set<string>>(new Set());

  const dismiss = useCallback((id: string) => {
    setAlerts(prev => prev.filter(a => a.id !== id));
  }, []);

  const join = useCallback((alert: LiveAlert) => {
    dismiss(alert.id);
    // Record attendance silently
    fetch(`/api/live-sessions/${alert.id}/join`, { method: 'POST' }).catch(() => {});

    if (isJitsiUrl(alert.session_url)) {
      // Navigate to live-sessions page — JitsiModal will auto-open via realtime there
      router.push('/dashboard/live-sessions');
    } else if (alert.session_url) {
      window.open(alert.session_url, '_blank', 'noopener,noreferrer');
    } else {
      router.push('/dashboard/live-sessions');
    }
  }, [dismiss, router]);

  useEffect(() => {
    if (!profile) return;

    const db = createClient();
    const sub = db
      .channel('live_session_watcher_global')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'live_sessions' },
        (payload) => {
          const updated = payload.new as any;
          const previous = payload.old as any;

          // Only fire when status flips to 'live' for the first time
          if (previous?.status !== 'live' && updated?.status === 'live') {
            // Skip if already alerted for this session
            if (alerted.has(updated.id)) return;

            // School-scoped: only alert if session is for this user's school or global
            const sessionSchool = updated.school_id;
            if (sessionSchool && profile.school_id && sessionSchool !== profile.school_id) return;

            setAlerted(prev => new Set(prev).add(updated.id));
            setAlerts(prev => [
              ...prev.filter(a => a.id !== updated.id), // dedupe
              {
                id: updated.id,
                title: updated.title,
                session_url: updated.session_url,
                platform: updated.platform,
              },
            ]);

            // Browser Notification API (if permission granted)
            if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
              const n = new Notification('🔴 Session is Live Now!', {
                body: `"${updated.title}" has started. Click to join.`,
                icon: '/icons/icon-192x192.png',
              });
              n.onclick = () => {
                window.focus();
                router.push('/dashboard/live-sessions');
                n.close();
              };
            }
          }
        }
      )
      .subscribe();

    return () => { db.removeChannel(sub); };
  }, [profile?.id, profile?.school_id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="fixed bottom-6 right-6 z-[80] flex flex-col gap-3 pointer-events-none">
      <AnimatePresence>
        {alerts.map(alert => (
          <LiveAlertToast
            key={alert.id}
            alert={alert}
            onJoin={() => join(alert)}
            onDismiss={() => dismiss(alert.id)}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}

function LiveAlertToast({
  alert, onJoin, onDismiss,
}: {
  alert: LiveAlert;
  onJoin: () => void;
  onDismiss: () => void;
}) {
  const [secs, setSecs] = useState(10);

  // Auto-join countdown
  useEffect(() => {
    if (secs <= 0) { onJoin(); return; }
    const t = setTimeout(() => setSecs(s => s - 1), 1000);
    return () => clearTimeout(t);
  }, [secs, onJoin]);

  const isInApp = isJitsiUrl(alert.session_url);

  return (
    <motion.div
      initial={{ x: 120, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 120, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 28 }}
      className="pointer-events-auto w-80 bg-[#0a0a0a] border border-emerald-500/40 shadow-2xl shadow-emerald-900/30 overflow-hidden"
    >
      {/* Progress bar */}
      <div className="h-[2px] bg-white/5">
        <motion.div
          className="h-full bg-emerald-500"
          initial={{ width: '100%' }}
          animate={{ width: '0%' }}
          transition={{ duration: 10, ease: 'linear' }}
        />
      </div>

      <div className="p-4 flex items-start gap-3">
        {/* Live pulse */}
        <div className="flex-shrink-0 mt-0.5 w-9 h-9 bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-400" />
          </span>
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-[9px] font-black text-emerald-400 uppercase tracking-widest">Live Now</p>
          <p className="text-xs font-black text-white truncate mt-0.5">{alert.title}</p>
          <p className="text-[9px] text-white/30 mt-1">
            {isInApp ? 'In-App Meeting' : alert.platform.replace('_', ' ')}
            {' · '}
            <span className="text-emerald-400 font-black">Joining in {secs}s</span>
          </p>

          <div className="flex items-center gap-2 mt-3">
            <button
              onClick={onJoin}
              className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-black uppercase tracking-widest transition-all"
            >
              {isInApp
                ? <VideoCameraIcon className="w-3 h-3" />
                : <SignalIcon className="w-3 h-3" />}
              Join Now
            </button>
            <button
              onClick={onDismiss}
              className="px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white/30 hover:text-white text-[10px] font-black uppercase tracking-widest transition-all"
            >
              Dismiss
            </button>
          </div>
        </div>

        <button
          onClick={onDismiss}
          className="flex-shrink-0 p-1 text-white/20 hover:text-white transition-colors"
        >
          <XMarkIcon className="w-3.5 h-3.5" />
        </button>
      </div>
    </motion.div>
  );
}
