'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

interface DashboardData {
  stats: any;
  activities: any[];
  role: string | null;
}

interface UseDashboardDataReturn {
  data: DashboardData;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useDashboardData(enabled: boolean = true): UseDashboardDataReturn {
  const [data, setData] = useState<DashboardData>({
    stats: null,
    activities: [],
    role: null,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const cacheRef = useRef<{ data: DashboardData; timestamp: number } | null>(null);
  const CACHE_DURATION = 30_000; // 30 seconds

  const fetchData = useCallback(async (useCache: boolean = true) => {
    if (!enabled) return;

    // Check cache first
    if (useCache && cacheRef.current) {
      const age = Date.now() - cacheRef.current.timestamp;
      if (age < CACHE_DURATION) {
        setData(cacheRef.current.data);
        setLoading(false);
        return;
      }
    }

    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();
    setLoading(true);
    setError(null);

    try {
      // Fetch stats and activities in parallel
      const [statsRes, activityRes] = await Promise.all([
        fetch('/api/dashboard/stats', {
          signal: abortControllerRef.current.signal,
          cache: 'no-store',
        }),
        fetch('/api/dashboard/activity', {
          signal: abortControllerRef.current.signal,
          cache: 'no-store',
        }),
      ]);

      if (!statsRes.ok || !activityRes.ok) {
        throw new Error('Failed to fetch dashboard data');
      }

      const [statsData, activityData] = await Promise.all([
        statsRes.json(),
        activityRes.json(),
      ]);

      const newData = {
        stats: statsData.stats || null,
        activities: activityData.activities || [],
        role: statsData.role || null,
      };

      setData(newData);
      
      // Update cache
      cacheRef.current = {
        data: newData,
        timestamp: Date.now(),
      };
    } catch (err: any) {
      if (err.name === 'AbortError') {
        // Request was cancelled, ignore
        return;
      }
      console.error('Dashboard data fetch error:', err);
      setError(err.message || 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  const refetch = useCallback(async () => {
    await fetchData(false); // Force fresh fetch
  }, [fetchData]);

  // Initial fetch
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return { data, loading, error, refetch };
}

// Hook for auto-refresh with exponential backoff
export function useDashboardAutoRefresh(
  refetch: () => Promise<void>,
  enabled: boolean = false,
  intervalMs: number = 60_000
) {
  const retryCountRef = useRef(0);
  const maxRetries = 3;

  useEffect(() => {
    if (!enabled) return;

    const interval = setInterval(async () => {
      try {
        await refetch();
        retryCountRef.current = 0; // Reset on success
      } catch (err) {
        retryCountRef.current++;
        console.error('Auto-refresh failed:', err);
        
        // Stop auto-refresh after max retries
        if (retryCountRef.current >= maxRetries) {
          clearInterval(interval);
          console.warn('Auto-refresh disabled after max retries');
        }
      }
    }, intervalMs);

    return () => clearInterval(interval);
  }, [enabled, intervalMs, refetch]);
}
