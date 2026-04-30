'use client';

/**
 * /dashboard/finance/reconciliation — admin-only audit surface.
 *
 * Pulls the finance_ledger view to show the whole money story in
 * one accountant-friendly table: what was transacted, the invoice
 * it belongs to, its stream (SCHOOL or INDIVIDUAL), whether a
 * receipt was issued, and for school-stream rows — the commission
 * Rillcod retained.
 *
 * Ships "safely degraded" — if the view is empty the page still
 * renders the summary tiles (all zeros).
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, ShieldCheck, Banknote, AlertTriangle, Receipt, Clock,
  RefreshCw, Download, Loader2, Filter, Trash2,
} from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { streamPillClasses, streamLabel, DEFAULT_COMMISSION_RATE, type FinanceStream } from '@/lib/finance/streams';
import { formatMoney, formatShortDate } from '@/lib/finance/formatters';

interface LedgerRow {
  transaction_id: string;
  transacted_at: string;
  paid_at: string | null;
  status: string;
  method: string | null;
  amount: number;
  currency: string;
  reference: string | null;
  receipt_url: string | null;
  school_id: string | null;
  portal_user_id: string | null;
  invoice_id: string | null;
  invoice_number: string | null;
  stream: FinanceStream | null;
  receipt_id: string | null;
  receipt_number: string | null;
}

interface Summary {
  count: number;
  totalPaid: number;
  totalSchool: number;
  totalIndividual: number;
  commissionRetained: number;
  missingReceipts: number;
  pending: number;
  refunded: number;
}

export default function FinanceReconciliationPage() {
  const { profile, loading: authLoading } = useAuth();
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [streamFilter, setStreamFilter] = useState<'all' | FinanceStream>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [busy, setBusy] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    setLoading(true);
    const params = new URLSearchParams();
    if (streamFilter !== 'all') params.set('stream', streamFilter);
    if (statusFilter !== 'all') params.set('status', statusFilter);
    try {
      const res = await fetch(`/api/finance/reconciliation?${params.toString()}`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load ledger');
      setRows(Array.isArray(json.data) ? json.data : []);
      setSummary(json.summary as Summary);
    } catch (e: any) {
      setErr(e.message || 'Failed to load ledger');
    } finally {
      setLoading(false);
    }
  }, [streamFilter, statusFilter]);

  useEffect(() => {
    if (!authLoading && profile?.id) load();
  }, [authLoading, profile?.id, load]);

  const reissueReceipt = async (txId: string) => {
    setBusy(txId);
    try {
      const res = await fetch(`/api/payments/receipt/${txId}?force=1`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to issue receipt');
      await load();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setBusy(null);
    }
  };

  const deleteTransaction = async (txId: string, ref: string) => {
    if (!window.confirm(`Delete transaction "${ref}"?\n\nThis permanently removes it from the ledger. Use only to fix contradicting or duplicate entries.`)) return;
    setDeleting(txId);
    try {
      const res = await fetch(`/api/finance/reconciliation?id=${encodeURIComponent(txId)}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to delete');
      setRows(prev => prev.filter(r => r.transaction_id !== txId));
    } catch (e: any) {
      alert(e.message);
    } finally {
      setDeleting(null);
    }
  };

  const missingList = useMemo(
    () => rows.filter(r => (r.status === 'completed' || r.status === 'paid') && !r.receipt_id),
    [rows],
  );

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />Loading…
      </div>
    );
  }

  if (profile?.role !== 'admin') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="rounded-2xl border border-border bg-card p-8 max-w-md text-center">
          <ShieldCheck className="w-10 h-10 text-muted-foreground/50 mx-auto mb-4" />
          <h1 className="text-lg font-black mb-2 text-foreground">Admin only</h1>
          <p className="text-sm text-muted-foreground">The reconciliation dashboard is restricted to Rillcod administrators.</p>
          <Link href="/dashboard/money" className="inline-block mt-4 text-xs font-black uppercase tracking-widest text-primary hover:text-primary">
            Back to Money Hub →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10 space-y-6">

        {/* Header */}
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Link href="/dashboard/money" className="w-10 h-10 inline-flex items-center justify-center rounded-xl bg-card border border-border hover:bg-muted" aria-label="Back to Money Hub">
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-600 to-primary text-white flex items-center justify-center shadow-lg">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.22em]">Admin · Audit</p>
              <h1 className="text-xl sm:text-2xl font-black tracking-tight truncate">Reconciliation</h1>
            </div>
          </div>
          <button onClick={() => load()} disabled={loading} className="inline-flex items-center gap-2 px-4 py-2 text-xs font-black uppercase tracking-widest rounded-lg bg-card border border-border hover:bg-muted min-h-[40px] disabled:opacity-50">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </header>

        {err && (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-300 p-4 text-sm">{err}</div>
        )}

        {/* Summary tiles */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <Tile label="Total Paid" amount={summary?.totalPaid ?? 0} accent="emerald" icon={Banknote} />
          <Tile label="School Stream" amount={summary?.totalSchool ?? 0} accent="indigo" icon={Receipt} />
          <Tile label="Individual Stream" amount={summary?.totalIndividual ?? 0} accent="emerald" icon={Receipt} />
          <Tile label={`Commission (${DEFAULT_COMMISSION_RATE}%)`} amount={summary?.commissionRetained ?? 0} accent="violet" icon={Banknote} />
        </section>

        {/* Health row */}
        <section className="grid grid-cols-3 gap-3">
          <HealthCard label="Missing Receipts" value={summary?.missingReceipts ?? 0} tone={summary?.missingReceipts ? 'warn' : 'ok'} icon={AlertTriangle} />
          <HealthCard label="Pending" value={summary?.pending ?? 0} tone="neutral" icon={Clock} />
          <HealthCard label="Refunded" value={summary?.refunded ?? 0} tone="neutral" icon={Receipt} />
        </section>

        {/* Missing receipts drill-down */}
        {missingList.length > 0 && (
          <section className="rounded-2xl border border-amber-500/30 bg-amber-500/5 overflow-hidden">
            <div className="px-5 py-3 border-b border-amber-500/30 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <h2 className="text-[11px] font-black uppercase tracking-widest text-foreground">
                Completed payments without receipts · {missingList.length}
              </h2>
            </div>
            <ul className="divide-y divide-amber-500/20">
              {missingList.slice(0, 8).map(r => (
                <li key={r.transaction_id} className="flex items-center gap-3 p-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-black">{formatMoney(Number(r.amount), r.currency)}</p>
                      {r.stream && <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-[0.15em] border ${streamPillClasses(r.stream)}`}>{streamLabel(r.stream)}</span>}
                    </div>
                    <p className="text-[11px] text-muted-foreground font-mono truncate">{r.reference || r.transaction_id.slice(0, 8)}</p>
                  </div>
                  <button
                    onClick={() => reissueReceipt(r.transaction_id)}
                    disabled={busy === r.transaction_id}
                    className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-[11px] font-black uppercase tracking-widest disabled:opacity-50"
                  >
                    {busy === r.transaction_id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Receipt className="w-3 h-3" />}
                    Issue now
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-muted-foreground" />
          <select value={streamFilter} onChange={(e) => setStreamFilter(e.target.value as any)} className="px-3 py-2 text-sm bg-card border border-border rounded-lg min-h-[40px]">
            <option value="all">Both streams</option>
            <option value="school">School only</option>
            <option value="individual">Individual only</option>
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-3 py-2 text-sm bg-card border border-border rounded-lg min-h-[40px]">
            <option value="all">All status</option>
            <option value="completed">Completed</option>
            <option value="pending">Pending</option>
            <option value="processing">Processing</option>
            <option value="failed">Failed</option>
            <option value="refunded">Refunded</option>
          </select>
        </div>

        {/* Ledger table */}
        <section className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="px-4 sm:px-5 py-3 border-b border-border flex items-center justify-between">
            <h2 className="text-[11px] font-black uppercase tracking-widest">Ledger</h2>
            <span className="text-[10px] text-muted-foreground">{rows.length} rows</span>
          </div>
          {loading ? (
            <div className="p-10 text-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />Loading…</div>
          ) : rows.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">No transactions match the filters.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 border-b border-border">
                  <tr>
                    <Th>Date</Th>
                    <Th>Reference</Th>
                    <Th>Stream</Th>
                    <Th>Invoice</Th>
                    <Th>Status</Th>
                    <Th align="right">Amount</Th>
                    <Th>Receipt</Th>
                    <Th>{''}</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.transaction_id} className="border-b border-border last:border-0 hover:bg-muted/30">
                      <td className="px-3 py-3 text-muted-foreground whitespace-nowrap">{formatShortDate(r.transacted_at)}</td>
                      <td className="px-3 py-3 font-mono text-[12px] truncate max-w-[180px]">{r.reference || r.transaction_id.slice(0, 8)}</td>
                      <td className="px-3 py-3">
                        {r.stream && <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-[0.15em] border ${streamPillClasses(r.stream)}`}>{streamLabel(r.stream)}</span>}
                      </td>
                      <td className="px-3 py-3 text-[12px]">{r.invoice_number || '—'}</td>
                      <td className="px-3 py-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{r.status}</td>
                      <td className="px-3 py-3 text-right font-black">{formatMoney(Number(r.amount), r.currency)}</td>
                      <td className="px-3 py-3">
                        {r.receipt_number ? (
                          <a href={r.receipt_url || '#'} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11px] font-mono text-emerald-500 hover:underline">
                            <Download className="w-3 h-3" /> {r.receipt_number}
                          </a>
                        ) : (r.status === 'completed' || r.status === 'paid') ? (
                          <button
                            onClick={() => reissueReceipt(r.transaction_id)}
                            disabled={busy === r.transaction_id}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-amber-500/15 text-amber-400 text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
                          >
                            {busy === r.transaction_id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Receipt className="w-3 h-3" />} Issue
                          </button>
                        ) : (
                          <span className="text-[10px] text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <button
                          onClick={() => deleteTransaction(r.transaction_id, r.reference || r.transaction_id.slice(0, 8))}
                          disabled={deleting === r.transaction_id}
                          title="Delete this transaction"
                          className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-rose-500/10 hover:bg-rose-500/25 text-rose-400 hover:text-rose-300 transition-colors disabled:opacity-40"
                        >
                          {deleting === r.transaction_id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

      </div>
    </div>
  );
}

function Tile({ label, amount, accent, icon: Icon }: { label: string; amount: number; accent: 'emerald' | 'indigo' | 'violet'; icon: React.ComponentType<{ className?: string }> }) {
  const palette = accent === 'indigo'
    ? 'from-indigo-500/20 to-violet-900/30 border-indigo-500/30 text-indigo-300'
    : accent === 'violet'
      ? 'from-primary/20 to-fuchsia-900/30 border-primary/30 text-violet-300'
      : 'from-emerald-500/20 to-green-900/30 border-emerald-500/30 text-emerald-300';
  return (
    <div className={`rounded-2xl border p-4 sm:p-5 bg-gradient-to-br ${palette}`}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{label}</p>
        <Icon className="w-4 h-4" />
      </div>
      <p className="text-lg sm:text-2xl font-black text-foreground leading-tight truncate">{formatMoney(amount)}</p>
    </div>
  );
}

function HealthCard({ label, value, tone, icon: Icon }: { label: string; value: number; tone: 'ok' | 'warn' | 'neutral'; icon: React.ComponentType<{ className?: string }> }) {
  const cls = tone === 'warn'
    ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
    : tone === 'ok'
      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
      : 'bg-card border-border text-foreground';
  return (
    <div className={`rounded-xl border p-4 ${cls}`}>
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-black uppercase tracking-widest opacity-80">{label}</p>
        <Icon className="w-4 h-4" />
      </div>
      <p className="text-2xl font-black mt-2">{value}</p>
    </div>
  );
}

function Th({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return <th className={`px-3 py-2.5 text-${align} text-[10px] font-black uppercase tracking-widest text-muted-foreground`}>{children}</th>;
}
