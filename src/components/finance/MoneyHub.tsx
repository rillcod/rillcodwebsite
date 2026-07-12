'use client';

/**
 * Finance Center — Today workspace.
 * Glance only: KPIs, attention queue, recent ledger.
 * Create / mark-paid / approve / bulk live in Invoices & Collections.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  Wallet, FileText, CheckCircle2, AlertCircle, Download,
  Clock, Loader2, Search, Receipt, ChevronRight, Banknote,
} from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { toast } from 'sonner';
import {
  classifyInvoiceStream,
  classifyReceiptStream,
  streamPillClasses,
  streamLabel,
  splitSchoolAmount,
  DEFAULT_COMMISSION_RATE,
  type FinanceStream,
} from '@/lib/finance/streams';

type Role = 'admin' | 'school' | 'teacher' | 'student' | 'parent' | string;

interface Transaction {
  id: string;
  amount: number;
  currency: string;
  payment_method: string | null;
  payment_status: string;
  transaction_reference: string | null;
  description?: string;
  paid_at: string | null;
  created_at: string;
  receipt_url: string | null;
  school_id: string | null;
  portal_user_id: string | null;
  portal_users?: { full_name?: string; email?: string } | null;
  invoices?: { invoice_number?: string; stream?: string; billing_cycle_id?: string | null } | null;
  courses?: { title?: string } | null;
  refunded_at?: string | null;
}

interface InvoiceRow {
  id: string;
  invoice_number: string;
  amount: number;
  currency: string;
  status: string;
  due_date: string | null;
  school_id: string | null;
  portal_user_id: string | null;
  billing_cycle_id?: string | null;
  stream?: FinanceStream | null;
  metadata?: Record<string, any> | null;
  portal_users?: { full_name?: string } | null;
}

function txStream(t: Transaction): FinanceStream {
  if (t.invoices?.stream === 'school' || t.invoices?.stream === 'individual') return t.invoices.stream;
  if (t.invoices?.billing_cycle_id) return 'school';
  return classifyReceiptStream({ school_id: t.school_id, student_id: t.portal_user_id });
}

function invStream(i: InvoiceRow): FinanceStream {
  return classifyInvoiceStream({
    stream: i.stream ?? null,
    school_id: i.school_id,
    portal_user_id: i.portal_user_id,
    billing_cycle_id: i.billing_cycle_id ?? null,
    metadata: i.metadata,
  });
}

const formatMoney = (amount: number, currency = 'NGN') => {
  try {
    return new Intl.NumberFormat('en-NG', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;
  }
};

const formatDate = (iso?: string | null) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' });
};

const STATUS_STYLES: Record<string, { label: string; cls: string }> = {
  completed: { label: 'Paid', cls: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300' },
  success: { label: 'Paid', cls: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300' },
  pending: { label: 'Pending', cls: 'bg-amber-500/15 border-amber-500/30 text-amber-300' },
  processing: { label: 'Processing', cls: 'bg-sky-500/15 border-sky-500/30 text-sky-300' },
  failed: { label: 'Failed', cls: 'bg-rose-500/15 border-rose-500/30 text-rose-300' },
  refunded: { label: 'Refunded', cls: 'bg-fuchsia-500/15 border-fuchsia-500/30 text-fuchsia-300' },
  paid: { label: 'Paid', cls: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300' },
  overdue: { label: 'Overdue', cls: 'bg-rose-500/15 border-rose-500/30 text-rose-300' },
  sent: { label: 'Sent', cls: 'bg-sky-500/15 border-sky-500/30 text-sky-300' },
};

function StatusPill({ status }: { status: string }) {
  const s = STATUS_STYLES[status?.toLowerCase()] || { label: status || 'Unknown', cls: 'bg-muted border-border text-muted-foreground' };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${s.cls}`}>
      {s.label}
    </span>
  );
}

export default function MoneyHubPage() {
  const { profile, loading: authLoading } = useAuth();
  const searchParams = useSearchParams();
  const role = profile?.role as Role | undefined;
  const paymentParam = searchParams.get('payment');

  const [txs, setTxs] = useState<Transaction[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busyRow, setBusyRow] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const isAdmin = role === 'admin';
  const isSchool = role === 'school';
  const isTeacher = role === 'teacher';
  const isStaff = isAdmin || isSchool || isTeacher;
  const isPayer = role === 'student' || role === 'parent';

  const fetchEverything = useCallback(async () => {
    setErr(null);
    try {
      const loadTransactions = async () => {
        const all: Transaction[] = [];
        let cursor: { created_at: string; id: string } | null = null;
        for (let page = 0; page < 10; page++) {
          const q = new URLSearchParams({ limit: '50' });
          if (cursor) {
            q.set('cursor_created_at', cursor.created_at);
            q.set('cursor_id', cursor.id);
          }
          const res = await fetch(`/api/payments/transactions?${q}`, { cache: 'no-store' });
          const json = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(json.error || 'Failed to load transactions');
          all.push(...(Array.isArray(json.data) ? json.data : []));
          if (!json.nextCursor) break;
          cursor = json.nextCursor;
        }
        return all;
      };

      const [txRows, invRes] = await Promise.all([
        loadTransactions(),
        fetch('/api/invoices?limit=200', { cache: 'no-store' }),
      ]);
      const invJson = await invRes.json().catch(() => ({}));
      if (!invRes.ok) throw new Error(invJson.error || 'Failed to load invoices');
      setTxs(txRows);
      setInvoices(Array.isArray(invJson?.data) ? invJson.data : []);
    } catch (e: any) {
      setErr(e?.message ?? 'Failed to load finance data');
      setTxs([]);
      setInvoices([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && profile?.id) fetchEverything();
  }, [authLoading, profile?.id, fetchEverything]);

  const outstanding = useMemo(
    () => invoices.filter((i) => !['paid', 'cancelled', 'void', 'draft'].includes((i.status || '').toLowerCase())),
    [invoices],
  );
  const overdue = useMemo(
    () => outstanding.filter((i) => i.due_date && new Date(i.due_date) < new Date()),
    [outstanding],
  );
  const pendingTxs = useMemo(
    () => txs.filter((t) => ['pending', 'processing'].includes((t.payment_status || '').toLowerCase())),
    [txs],
  );
  const paidTxs = useMemo(
    () => txs.filter((t) => ['completed', 'success', 'paid'].includes((t.payment_status || '').toLowerCase())),
    [txs],
  );

  const totals = useMemo(() => {
    const schoolPaid = paidTxs.filter((t) => txStream(t) === 'school');
    return {
      paidSum: paidTxs.reduce((s, t) => s + Number(t.amount || 0), 0),
      paidCount: paidTxs.length,
      pendingSum: pendingTxs.reduce((s, t) => s + Number(t.amount || 0), 0),
      pendingCount: pendingTxs.length,
      outstandingSum: outstanding.reduce((s, i) => s + Number(i.amount || 0), 0),
      outstandingCount: outstanding.length,
      overdueCount: overdue.length,
      commissionSum: schoolPaid.reduce(
        (s, t) => s + splitSchoolAmount(Number(t.amount || 0), DEFAULT_COMMISSION_RATE).rillcodRetain,
        0,
      ),
    };
  }, [paidTxs, pendingTxs, outstanding, overdue]);

  const recentTxs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return txs
      .filter((t) => {
        if (!q) return true;
        return (
          t.transaction_reference?.toLowerCase().includes(q) ||
          t.portal_users?.full_name?.toLowerCase().includes(q) ||
          t.invoices?.invoice_number?.toLowerCase().includes(q)
        );
      })
      .slice(0, 25);
  }, [txs, search]);

  const handleDownloadReceipt = async (txId: string) => {
    setBusyRow(txId);
    try {
      const res = await fetch(`/api/payments/receipt/${txId}`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not generate receipt');
      if (json.url) {
        window.open(json.url, '_blank', 'noopener,noreferrer');
        setTxs((prev) => prev.map((t) => (t.id === txId ? { ...t, receipt_url: json.url } : t)));
      }
    } catch (e: any) {
      toast.error(e.message || 'Failed to download receipt');
    } finally {
      setBusyRow(null);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground gap-3">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-xs font-black uppercase tracking-widest">Loading today…</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {paymentParam === 'success' && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300 font-bold">
          Payment confirmed. Receipts and invoices update in their workspaces.
        </div>
      )}
      {err && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          {err}
        </div>
      )}

      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Today</p>
          <h2 className="text-xl font-black text-foreground mt-0.5">
            {isAdmin ? 'What needs you now' : isSchool ? 'What needs your school now' : isTeacher ? 'What needs you now' : 'Your money'}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {isStaff
              ? 'Action queue and live ledger. Full KPIs, CSV, and billing documents live under Reports.'
              : 'Balances due and recent payments.'}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isStaff && (
            <Link
              href="/dashboard/finance?workspace=reports"
              className="hidden sm:inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-border text-xs font-bold text-muted-foreground hover:text-foreground"
            >
              Reports <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          )}
          <button
            type="button"
            onClick={() => { setLoading(true); fetchEverything(); }}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-xs font-bold text-muted-foreground hover:text-foreground"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Compact attention strip — not the same KPI grid as Reports */}
      {isStaff ? (
        <div className="flex flex-wrap gap-2 text-xs">
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-bold ${
            overdue.length > 0 ? 'border-rose-500/40 bg-rose-500/10 text-rose-300' : 'border-border text-muted-foreground'
          }`}>
            <AlertCircle className="w-3.5 h-3.5" />
            {overdue.length} overdue
          </span>
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-bold ${
            pendingTxs.length > 0 ? 'border-amber-500/40 bg-amber-500/10 text-amber-300' : 'border-border text-muted-foreground'
          }`}>
            <Clock className="w-3.5 h-3.5" />
            {pendingTxs.length} awaiting approval
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 font-bold text-muted-foreground">
            <FileText className="w-3.5 h-3.5" />
            {outstanding.length} open invoices
          </span>
          {isAdmin && totals.commissionSum > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-1.5 font-bold text-sky-300">
              Est. commission {formatMoney(totals.commissionSum)}
            </span>
          )}
        </div>
      ) : (
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-3">
          <Kpi label="Paid" value={formatMoney(totals.paidSum)} sub={`${totals.paidCount} payments`} tone="emerald" />
          <Kpi label="Pending" value={formatMoney(totals.pendingSum)} sub={`${totals.pendingCount} awaiting`} tone="amber" />
          <Kpi label="Outstanding" value={formatMoney(totals.outstandingSum)} sub={`${totals.outstandingCount} open`} tone="rose" />
        </div>
      )}

      {/* Attention → workspaces (staff only) */}
      {isStaff && (
        <div className="grid sm:grid-cols-3 gap-3">
          <AttentionCard
            href="/dashboard/finance?workspace=collections&ops=approvals"
            icon={Clock}
            title="Go to Collections"
            body={
              pendingTxs.length > 0
                ? `${pendingTxs.length} payment${pendingTxs.length === 1 ? '' : 's'} need approval`
                : 'Review proofs and pending transfers'
            }
            accent={pendingTxs.length > 0 ? 'amber' : 'muted'}
          />
          <AttentionCard
            href="/dashboard/finance?workspace=invoices&ops=invoices"
            icon={FileText}
            title="Go to Invoices"
            body={
              overdue.length > 0
                ? `${overdue.length} overdue · mark paid & remind here`
                : `${outstanding.length} open invoice${outstanding.length === 1 ? '' : 's'}`
            }
            accent={overdue.length > 0 ? 'rose' : 'muted'}
          />
          <AttentionCard
            href={isAdmin || isSchool ? '/dashboard/finance?workspace=billing' : '/dashboard/finance?workspace=invoices&ops=invoices'}
            icon={Banknote}
            title={isAdmin || isSchool ? 'Go to Billing' : 'Fee tracker'}
            body={isAdmin || isSchool ? 'Term cycles, Pay Now, remits' : 'Mark in-person collections paid'}
            accent="muted"
          />
        </div>
      )}

      {/* Payer outstanding strip */}
      {isPayer && outstanding.length > 0 && (
        <div className="rounded-2xl border border-amber-500/25 bg-amber-500/5 overflow-hidden">
          <div className="px-4 py-3 border-b border-amber-500/20 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-400" />
            <h3 className="text-[11px] font-black uppercase tracking-widest">Due now</h3>
            <span className="ml-auto text-[10px] text-muted-foreground">{outstanding.length} open</span>
          </div>
          <ul className="divide-y divide-border">
            {outstanding.slice(0, 8).map((inv) => (
              <li key={inv.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold truncate">#{inv.invoice_number}</p>
                  <p className="text-[11px] text-muted-foreground">Due {formatDate(inv.due_date)}</p>
                </div>
                <p className="text-sm font-black">{formatMoney(inv.amount, inv.currency)}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Recent ledger */}
      <section className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Receipt className="w-4 h-4 text-muted-foreground" />
            <h3 className="text-[11px] font-black uppercase tracking-widest">Live payments</h3>
            <span className="text-[10px] text-muted-foreground">{txs.length} loaded</span>
          </div>
          <div className="relative sm:ml-auto w-full sm:w-64">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search ref, payer, invoice…"
              className="w-full pl-8 pr-3 py-2 text-xs border border-border bg-background rounded-lg focus:outline-none focus:border-primary"
            />
          </div>
        </div>

        {recentTxs.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">No payments yet.</div>
        ) : (
          <ul className="divide-y divide-border">
            {recentTxs.map((t) => {
              const stream = txStream(t);
              return (
                <li key={t.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30">
                  <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
                    <Wallet className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <StatusPill status={t.payment_status} />
                      {isStaff && (
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border ${streamPillClasses(stream)}`}>
                          {streamLabel(stream, 'short')}
                        </span>
                      )}
                      <span className="text-[11px] font-mono text-muted-foreground truncate">
                        {t.transaction_reference || t.id.slice(0, 8)}
                      </span>
                    </div>
                    <p className="text-sm font-bold truncate mt-0.5">
                      {t.portal_users?.full_name || t.courses?.title || t.description || 'Payment'}
                      {t.invoices?.invoice_number ? ` · #${t.invoices.invoice_number}` : ''}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {formatDate(t.paid_at || t.created_at)} · {t.payment_method || '—'}
                    </p>
                  </div>
                  <div className="text-right shrink-0 space-y-1">
                    <p className="text-sm font-black">{formatMoney(Number(t.amount), t.currency)}</p>
                    {['completed', 'success', 'paid'].includes((t.payment_status || '').toLowerCase()) && (
                      <button
                        type="button"
                        disabled={busyRow === t.id}
                        onClick={() => handleDownloadReceipt(t.id)}
                        className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-primary disabled:opacity-50"
                      >
                        <Download className="w-3 h-3" /> Receipt
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {isStaff && (
          <div className="px-4 py-3 border-t border-border bg-muted/20 flex flex-wrap gap-3 text-xs">
            <Link href="/dashboard/finance?workspace=invoices&ops=invoices" className="font-bold text-primary inline-flex items-center gap-1">
              Open invoices <ChevronRight className="w-3.5 h-3.5" />
            </Link>
            <Link href="/dashboard/finance?workspace=collections&ops=approvals" className="font-bold text-primary inline-flex items-center gap-1">
              Open collections <ChevronRight className="w-3.5 h-3.5" />
            </Link>
            <Link href="/dashboard/finance?workspace=reports" className="font-bold text-muted-foreground hover:text-primary inline-flex items-center gap-1">
              Full reports <ChevronRight className="w-3.5 h-3.5" />
            </Link>
            {isAdmin && (
              <Link href="/dashboard/finance?workspace=reconciliation" className="font-bold text-muted-foreground hover:text-primary inline-flex items-center gap-1">
                Reconciliation <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function Kpi({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone: 'emerald' | 'amber' | 'rose' | 'sky';
}) {
  const tones = {
    emerald: 'border-emerald-500/25 bg-emerald-500/5',
    amber: 'border-amber-500/25 bg-amber-500/5',
    rose: 'border-rose-500/25 bg-rose-500/5',
    sky: 'border-sky-500/25 bg-sky-500/5',
  };
  return (
    <div className={`rounded-xl border p-4 ${tones[tone]}`}>
      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="text-xl font-black mt-1 text-foreground">{value}</p>
      <p className="text-[11px] text-muted-foreground mt-1">{sub}</p>
    </div>
  );
}

function AttentionCard({
  href,
  icon: Icon,
  title,
  body,
  accent,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
  accent: 'amber' | 'rose' | 'muted';
}) {
  const ring =
    accent === 'amber'
      ? 'border-amber-500/30 bg-amber-500/5'
      : accent === 'rose'
        ? 'border-rose-500/30 bg-rose-500/5'
        : 'border-border bg-card';
  return (
    <Link href={href} className={`rounded-xl border p-4 hover:border-primary/40 transition-colors ${ring}`}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-4 h-4 text-primary" />
        <span className="text-[11px] font-black uppercase tracking-widest">{title}</span>
        <ChevronRight className="w-3.5 h-3.5 ml-auto text-muted-foreground" />
      </div>
      <p className="text-sm text-muted-foreground leading-snug">{body}</p>
    </Link>
  );
}
