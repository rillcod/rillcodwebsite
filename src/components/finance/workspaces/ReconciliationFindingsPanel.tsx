'use client';

import { useCallback, useEffect, useState } from 'react';
import { ExclamationTriangleIcon, ArrowPathIcon } from '@/lib/icons';

type Finding = {
  kind: string;
  severity: 'info' | 'warning' | 'error';
  message: string;
  entity_type?: string;
  entity_id?: string;
  meta?: Record<string, unknown>;
};

/**
 * Compact reconciliation findings for the Finance Reconciliation workspace.
 */
export function ReconciliationFindingsPanel() {
  const [findings, setFindings] = useState<Finding[]>([]);
  const [summary, setSummary] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/finance/reconciliation?limit=100', { cache: 'no-store' });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Failed to load reconciliation');
      setFindings(Array.isArray(j.findings) ? j.findings : []);
      setSummary(j.summary || {});
    } catch (e: any) {
      setError(e.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-black text-foreground">Reconciliation findings</h3>
          <p className="text-sm text-muted-foreground">
            Unmatched payments, allocation gaps, and missing receipts
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-muted-foreground hover:text-foreground"
        >
          <ArrowPathIcon className="h-3.5 w-3.5" /> Refresh
        </button>
      </div>

      {error && (
        <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-400">
          {error}
        </p>
      )}

      {!error && findings.length === 0 && (
        <p className="text-sm text-muted-foreground">No open findings — ledger looks consistent.</p>
      )}

      {findings.length > 0 && (
        <ul className="space-y-2">
          {findings.slice(0, 40).map((f, i) => (
            <li
              key={`${f.kind}-${f.entity_id ?? i}`}
              className="flex items-start gap-2 rounded-xl border border-border/60 bg-muted/20 px-3 py-2 text-sm"
            >
              <ExclamationTriangleIcon
                className={`mt-0.5 h-4 w-4 flex-shrink-0 ${
                  f.severity === 'error'
                    ? 'text-rose-400'
                    : f.severity === 'warning'
                      ? 'text-amber-400'
                      : 'text-primary'
                }`}
              />
              <div>
                <p className="font-bold text-foreground">{f.kind.replace(/_/g, ' ')}</p>
                <p className="text-muted-foreground">{f.message}</p>
              </div>
            </li>
          ))}
        </ul>
      )}

      {Object.keys(summary).length > 0 && (
        <p className="text-[11px] text-muted-foreground">
          Summary: {Object.entries(summary).map(([k, v]) => `${k}=${v}`).join(' · ')}
        </p>
      )}
    </div>
  );
}
