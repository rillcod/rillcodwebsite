'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

export interface SystemStatus {
  maintenanceMode: boolean;
  minimumWebVersion: string;
  loading: boolean;
}

const POLL_INTERVAL_MS = 60_000; // 60 seconds

/**
 * Polls GET /api/system/status on mount and every 60 s while the tab is
 * visible (Req 11.2, 11.6). Pauses polling when the tab is hidden using the
 * Page Visibility API and resumes when it becomes visible again.
 */
export function useSystemStatus(): SystemStatus {
  const [state, setState] = useState<SystemStatus>({
    maintenanceMode: false,
    minimumWebVersion: '0.0.0',
    loading: true,
  });

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const poll = useCallback(async () => {
    try {
      const res = await fetch('/api/system/status');
      if (!res.ok) return;
      const data = await res.json();
      setState({
        maintenanceMode: Boolean(data.maintenance_mode),
        minimumWebVersion: String(data.minimum_web_version ?? '0.0.0'),
        loading: false,
      });
    } catch {
      // Network error — keep previous state, clear loading
      setState(prev => ({ ...prev, loading: false }));
    }
  }, []);

  const startPolling = useCallback(() => {
    if (timerRef.current) return;
    timerRef.current = setInterval(() => {
      if (document.visibilityState === 'visible') poll();
    }, POLL_INTERVAL_MS);
  }, [poll]);

  const stopPolling = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    // Initial fetch
    poll();
    startPolling();

    function onVisibilityChange() {
      if (document.visibilityState === 'visible') {
        poll();       // immediate fetch on tab focus
        startPolling();
      } else {
        stopPolling();
      }
    }

    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      stopPolling();
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [poll, startPolling, stopPolling]);

  return state;
}
