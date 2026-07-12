'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ExclamationTriangleIcon, ArrowPathIcon } from '@/lib/icons';
import { toast } from 'sonner';

type Finding = {
  kind: string;
  severity: 'info' | 'warning' | 'error';
  message: string;
  entity_type?: string;
  entity_id?: string;
  meta?: Record<string, unknown>;
};

const KIND_LABEL: Record<string, string> = {
  missing_receipt: 'Missing receipt PDF',
  under_allocated: 'Allocation gap',
  over_allocated: 'Over-allocated',
  balance_mismatch: 'Invoice balance mismatch',
  unmatched_payment: 'Unmatched payment',
  refund_needs_attention: 'Refund needs attention',
};

/**
 * Compact reconciliation findings for the Finance Reconciliation workspace.
 */
export function ReconciliationFindingsPanel() {
  const [findings, setFindings] = useState<Finding[]>([]);
  const [summary, setSummary] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [repairing, setRepairing] = useState<string | null>(null);
  const [repairAllBusy, setRepairAllBusy] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(() => {
    try {
      const raw = sessionStorage.getItem('finance_recon_dismissed');
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch {
      return new Set();
    }
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/finance/reconciliation?limit=100', { cache: 'no-store' });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Failed to load reconciliation');
      setFindings(Array.isArray(j.findings) ? j.findings : []);
      setSummary(j.summary?.findings || {});
    } catch (e: any) {
      setError(e.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const actionFor = (finding: Finding) => finding.kind === 'missing_receipt'
    ? 'recover_missing_receipt'
    : finding.kind === 'under_allocated'
      ? 'repair_allocation'
      : finding.kind === 'balance_mismatch'
        ? 'recompute_invoice_balance'
        : null;

  const findingKey = (f: Finding) => `${f.kind}:${f.entity_id || ''}`;

  const visible = useMemo(
    () => findings.filter((f) => !dismissed.has(findingKey(f))),
    [findings, dismissed],
  );

  const dismiss = (f: Finding) => {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(findingKey(f));
      try { sessionStorage.setItem('finance_recon_dismissed', JSON.stringify([...next])); } catch { /* ignore */ }
      return next;
    });
  };

  async function repair(finding: Finding): Promise<boolean> {
    if (!finding.entity_id) return false;
    if (finding.kind === 'refund_needs_attention') {
      const accountNumber = window.prompt('Enter the customer 10-digit refund account number:')?.trim();
      if (!accountNumber) return false;
      const bankId = window.prompt('Enter the Paystack bank ID:')?.trim();
      if (!bankId) return false;
      setRepairing(finding.entity_id);
      try {
        const response = await fetch('/api/payments/refund/retry', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transaction_id: finding.entity_id, account_number: accountNumber, bank_id: Number(bankId) }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || 'Refund recovery failed');
        toast.success('Refund recovery sent to Paystack');
        return true;
      } catch (e: any) {
        toast.error(e.message || 'Repair failed');
        return false;
      } finally {
        setRepairing(null);
      }
    }
    const action = actionFor(finding);
    if (!action) {
      toast.error('No automatic repair for this finding — dismiss if it is intentional, or fix manually.');
      return false;
    }
    setRepairing(finding.entity_id);
    try {
      const response = await fetch('/api/finance/reconciliation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, entity_id: finding.entity_id }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const detail = [payload.error, payload.hint].filter(Boolean).join(' — ');
        throw new Error(detail || 'Repair failed');
      }
      const note = payload.data?.note || payload.data?.status;
      toast.success(note ? `Fixed: ${note}` : 'Finance record repaired');
      return true;
    } catch (e: any) {
      toast.error(e.message || 'Repair failed', { duration: 8000 });
      return false;
    } finally {
      setRepairing(null);
    }
  }

  async function repairAllSafe() {
    const queue = visible.filter((f) => actionFor(f) === 'repair_allocation' || actionFor(f) === 'recover_missing_receipt' || actionFor(f) === 'recompute_invoice_balance');
    if (!queue.length) {
      toast.message('Nothing auto-repairable in the current list');
      return;
    }
    if (!confirm(`Try repair on ${queue.length} finding(s)? Clear errors will be shown for any that fail.`)) return;
    setRepairAllBusy(true);
    let ok = 0;
    let fail = 0;
    for (const f of queue) {
      const success = await repair(f);
      if (success) ok += 1;
      else fail += 1;
    }
    setRepairAllBusy(false);
    toast.success(`Repair finished · ${ok} fixed · ${fail} failed`);
    await load();
  }

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h3 className="font-black text-foreground">Reconciliation findings</h3>
          <p className="text-sm text-muted-foreground">
            Concrete ledger gaps. Repair fixes what it can; Dismiss hides noise for this session only.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void repairAllSafe()}
            disabled={repairAllBusy || visible.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-black text-primary-foreground disabled:opacity-50"
          >
            {repairAllBusy ? 'Repairing…' : 'Repair all fixable'}
          </button>
          <button
            type="button"
            onClick={load}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-muted-foreground hover:text-foreground"
          >
            <ArrowPathIcon className="h-3.5 w-3.5" /> Refresh
          </button>
        </div>
      </div>

      {error && (
        <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-400">
          {error}
        </p>
      )}

      {!error && visible.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {findings.length === 0
            ? 'No open findings — ledger looks consistent.'
            : `All ${findings.length} finding(s) dismissed for this session. Refresh or clear session dismissals to see them again.`}
        </p>
      )}

      {visible.length > 0 && (
        <ul className="space-y-2">
          {visible.slice(0, 50).map((f, i) => (
            <li
              key={`${f.kind}-${f.entity_id ?? i}`}
              className="flex flex-col items-stretch gap-2 rounded-xl border border-border/60 bg-muted/20 px-3 py-3 text-sm sm:flex-row sm:items-start"
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
              <div className="min-w-0 flex-1 space-y-1">
                <p className="font-bold text-foreground">{KIND_LABEL[f.kind] || f.kind.replace(/_/g, ' ')}</p>
                <p className="text-muted-foreground">{f.message}</p>
                {typeof f.meta?.fix === 'string' && (
                  <p className="text-[11px] text-primary/80 font-medium">Fix: {f.meta.fix}</p>
                )}
                {f.entity_id && (
                  <p className="text-[10px] font-mono text-muted-foreground/70 truncate">
                    {f.entity_type} · {f.entity_id}
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-1.5 shrink-0">
                {(actionFor(f) || f.kind === 'refund_needs_attention') && (
                  <button
                    type="button"
                    disabled={repairing === f.entity_id || repairAllBusy}
                    onClick={() => void repair(f).then((ok) => { if (ok) load(); })}
                    className="min-h-10 rounded-lg bg-primary px-3 py-2 text-xs font-black text-primary-foreground disabled:opacity-50"
                  >
                    {repairing === f.entity_id ? 'Repairing…' : f.kind === 'refund_needs_attention' ? 'Fix refund' : 'Repair'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => dismiss(f)}
                  className="min-h-9 rounded-lg border border-border px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-foreground"
                >
                  Dismiss
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {Object.keys(summary).length > 0 && (
        <p className="text-[11px] text-muted-foreground">
          Summary: {Object.entries(summary).map(([k, v]) => `${KIND_LABEL[k] || k}=${v}`).join(' · ')}
        </p>
      )}
    </div>
  );
}
