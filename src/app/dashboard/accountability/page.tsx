'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { ArrowPathIcon, ShieldCheckIcon } from '@/lib/icons';
import AccountabilityDashboard from '@/components/accountability/AccountabilityDashboard';
import MobilePageHero from '@/components/mobile/MobilePageHero';
import type { Backlog, Coverage, Person } from '@/lib/accountability/types';
import { roleHasCapability } from '@/lib/auth/capabilities';
import type { StudentExceptionKind } from '@/lib/accountability/student-exceptions';

/**
 * Accountability — admin entry point.
 * Data loading / auth live here; presentation is in AccountabilityDashboard.
 */
export default function AccountabilityPage() {
  const { profile, loading: authLoading } = useAuth();
  const [data, setData] = useState<{
    coverage: Coverage | null;
    people: Person[];
    backlog?: Backlog | null;
    census?: {
      total: number;
      by_role: Record<string, number>;
      live_total: number | null;
      live_by_role: Record<string, number> | null;
      source: string;
    } | null;
  } | null>(null);
  const canViewAccountability = roleHasCapability(profile?.role, 'view_accountability');
  const [exceptionTotals, setExceptionTotals] = useState<Partial<Record<StudentExceptionKind, number>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncingClasses, setSyncingClasses] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);
  const [pollInterval, setPollInterval] = useState(0);
  const isFirstLoad = useRef(true);
  const autoSynced = useRef(false);

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
      const [res, excRes] = await Promise.all([
        fetch('/api/admin/accountability'),
        fetch('/api/admin/accountability/exceptions?hollow_min_age_days=90', { cache: 'no-store' }),
      ]);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not load');
      setData(json);
      if (excRes.ok) {
        const excJson = await excRes.json();
        setExceptionTotals(excJson.exceptions?.totals ?? null);
      } else {
        setExceptionTotals(null);
      }
      setError(null);
      return json as {
        people?: Person[];
      };
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load');
      return null;
    } finally {
      setLoading(false);
      setRefreshing(false);
      isFirstLoad.current = false;
    }
  }, []);

  const handleSyncClasses = useCallback(async (opts?: { quiet?: boolean }) => {
    setSyncingClasses(true);
    if (!opts?.quiet) setSyncFeedback(null);
    try {
      const res = await fetch('/api/admin/accountability/sync-classes', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not fix classes');
      const n = Number(json.synced_count) || 0;
      if (json.partial) {
        setSyncFeedback(`Fixed ${n} profile${n === 1 ? '' : 's'}, but ${json.failed_count ?? 0} item${json.failed_count === 1 ? '' : 's'} still need attention.`);
        await load(false);
        return;
      }
      setSyncFeedback(
        n === 0
          ? 'No wrong classes left to fix — everyone already matches this term’s class list.'
          : `Fixed ${n} student${n === 1 ? '' : 's'}: their account class now matches this term’s class list.`,
      );
      await load(false);
    } catch (e) {
      setSyncFeedback(`Error: ${e instanceof Error ? e.message : 'Could not fix classes'}`);
    } finally {
      setSyncingClasses(false);
    }
  }, [load]);

  useEffect(() => {
    if (canViewAccountability) void load();
  }, [canViewAccountability, load]);

  // Once per visit: if anyone has the wrong class on their account, fix it automatically.
  useEffect(() => {
    if (autoSynced.current || loading || syncingClasses || !data?.people?.length) return;
    const mismatches = data.people.filter((p) => (p.flags ?? []).includes('class_mismatch')).length;
    if (mismatches <= 0) return;
    autoSynced.current = true;
    setSyncFeedback(`Found ${mismatches} student${mismatches === 1 ? '' : 's'} with the wrong class — fixing now…`);
    void handleSyncClasses({ quiet: true });
  }, [data, loading, syncingClasses, handleSyncClasses]);

  useEffect(() => {
    if (pollInterval <= 0) return;
    const interval = setInterval(() => {
      void load(true);
    }, pollInterval);
    return () => clearInterval(interval);
  }, [pollInterval, load]);

  if (authLoading || !profile) {
    return (
      <div className="p-8 mobile-page-root">
        <ArrowPathIcon className="w-8 h-8 animate-spin text-indigo-600 dark:text-indigo-400" />
      </div>
    );
  }

  if (!canViewAccountability) {
    return (
      <div className="p-8 mobile-page-root">
        <div className="bg-card shadow-sm border border-border rounded-xl p-8 flex items-start gap-4">
          <ShieldCheckIcon className="w-6 h-6 text-rose-600 dark:text-rose-400 shrink-0" />
          <div>
            <h2 className="font-black text-foreground">Admins only</h2>
            <p className="text-sm text-muted-foreground">
              This page shows every school, so only admin accounts can open it.
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
      census={data?.census ?? null}
      exceptionTotals={exceptionTotals ?? undefined}
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
