'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { ArrowPathIcon, ShieldCheckIcon } from '@/lib/icons';
import AccountabilityDashboard from '@/components/accountability/AccountabilityDashboard';
import type { Backlog, Coverage, Person } from '@/lib/accountability/types';

/**
 * Accountability & Census — admin entry point.
 * Data loading / auth live here; presentation is in AccountabilityDashboard.
 */
export default function AccountabilityPage() {
  const { profile, loading: authLoading } = useAuth();
  const [data, setData] = useState<{
    coverage: Coverage | null;
    people: Person[];
    backlog?: Backlog | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncingClasses, setSyncingClasses] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);
  const [pollInterval, setPollInterval] = useState(0);
  const isFirstLoad = useRef(true);

  const load = useCallback(async (forceRefresh = false) => {
    if (isFirstLoad.current) setLoading(true);
    else setRefreshing(true);
    try {
      if (forceRefresh) {
        const refreshRes = await fetch('/api/admin/accountability', { method: 'POST' });
        if (!refreshRes.ok) {
          const j = await refreshRes.json();
          throw new Error(j.error || 'Refresh failed');
        }
      }
      const res = await fetch('/api/admin/accountability');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not load');
      setData(json);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load');
    } finally {
      setLoading(false);
      setRefreshing(false);
      isFirstLoad.current = false;
    }
  }, []);

  useEffect(() => {
    if (profile?.role === 'admin') void load();
  }, [profile?.role, load]);

  useEffect(() => {
    if (pollInterval <= 0) return;
    const interval = setInterval(() => {
      void load(true);
    }, pollInterval);
    return () => clearInterval(interval);
  }, [pollInterval, load]);

  const handleSyncClasses = async () => {
    setSyncingClasses(true);
    setSyncFeedback(null);
    try {
      const res = await fetch('/api/admin/accountability/sync-classes', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Sync failed');
      setSyncFeedback(`Successfully auto-synced ${json.synced_count} profile classes to active term rosters!`);
      await load(false);
    } catch (e) {
      setSyncFeedback(`Error: ${e instanceof Error ? e.message : 'Sync failed'}`);
    } finally {
      setSyncingClasses(false);
    }
  };

  if (authLoading || !profile) {
    return (
      <div className="p-8">
        <ArrowPathIcon className="w-8 h-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  if (profile.role !== 'admin') {
    return (
      <div className="p-8">
        <div className="bg-card shadow-sm border border-border rounded-xl p-8 flex items-start gap-4">
          <ShieldCheckIcon className="w-6 h-6 text-rose-500 shrink-0" />
          <div>
            <h2 className="font-black text-foreground">Administrators only</h2>
            <p className="text-sm text-muted-foreground">
              This is a cross-school census, so it is limited to admin accounts.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <AccountabilityDashboard
      coverage={data?.coverage ?? null}
      people={data?.people ?? []}
      backlog={data?.backlog ?? null}
      loading={loading}
      refreshing={refreshing}
      error={error}
      syncFeedback={syncFeedback}
      syncingClasses={syncingClasses}
      pollInterval={pollInterval}
      setPollInterval={setPollInterval}
      onRefresh={(force) => void load(!!force)}
      onSyncClasses={() => void handleSyncClasses()}
      generatedBy={profile.full_name || profile.email || 'Admin'}
    />
  );
}
