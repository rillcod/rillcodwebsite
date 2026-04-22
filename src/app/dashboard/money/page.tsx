'use client';

/**
 * Unified Money hub — /dashboard/money
 *
 * One page for every role (admin, school, teacher, student, parent).
 * The finance system is otherwise scattered across 5+ routes; this hub
 * pulls their money-story into a single surface:
 *
 *   - At-a-glance totals (paid, pending, refunded, outstanding)
 *   - Full transaction ledger with per-row "Download receipt"
 *   - Outstanding invoices with pay / remind actions
 *   - Deep-links to power surfaces (Finance Ops, Bulk invoicing, Subscriptions)
 *
 * All data is read through existing APIs — no DB changes.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, Wallet, CreditCard, FileText, CheckCircle2, AlertCircle,
  Download, ExternalLink, RefreshCw, ChevronRight, Clock,
  TrendingUp, Banknote, Receipt, Loader2, Search, Filter,
} from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { motion } from 'framer-motion';
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
type StreamTab = 'all' | FinanceStream;

interface Transaction {
  id: string;
  amount: number;
  currency: string;
  payment_method: string | null;
  payment_status: string;
  transaction_reference: string | null;
  external_transaction_id: string | null;
  paid_at: string | null;
  created_at: string;
  receipt_url: string | null;
  invoice_id: string | null;
  school_id: string | null;
  portal_user_id: string | null;
  course_id: string | null;
  portal_users?: { full_name?: string; email?: string } | null;
  invoices?: { invoice_number?: string; stream?: string; billing_cycle_id?: string | null } | null;
  courses?: { title?: string } | null;
  refunded_at?: string | null;
  refund_reason?: string | null;
}

interface InvoiceRow {
  id: string;
  invoice_number: string;
  amount: number;
  currency: string;
  status: string;
  due_date: string | null;
  payment_link: string | null;
  portal_user_id: string | null;
  school_id: string | null;
  billing_cycle_id?: string | null;
  stream?: FinanceStream | null;
  metadata?: Record<string, any> | null;
  created_at: string;
}

function txStream(t: Transaction): FinanceStream {
  // Prefer the linked invoice's stream; fall back to heuristic.
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

function StreamChip({ stream }: { stream: FinanceStream }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-[0.15em] border ${streamPillClasses(stream)}`}>
      {streamLabel(stream, 'short')}
    </span>
  );
}

const NGN = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 });
const formatMoney = (amount: number, currency = 'NGN') => {
  try { return new Intl.NumberFormat('en-NG', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount); }
  catch { return `${currency} ${NGN.format(amount)}`; }
};

const formatDate = (iso?: string | null) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' });
};

const STATUS_STYLES: Record<string, { label: string; cls: string }> = {
  completed: { label: 'Paid',     cls: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300' },
  pending:   { label: 'Pending',  cls: 'bg-amber-500/15 border-amber-500/30 text-amber-300' },
  processing:{ label: 'Processing', cls: 'bg-sky-500/15 border-sky-500/30 text-sky-300' },
  failed:    { label: 'Failed',   cls: 'bg-rose-500/15 border-rose-500/30 text-rose-300' },
  refunded:  { label: 'Refunded', cls: 'bg-fuchsia-500/15 border-fuchsia-500/30 text-fuchsia-300' },
  cancelled: { label: 'Cancelled',cls: 'bg-muted border-border text-muted-foreground' },
  paid:      { label: 'Paid',     cls: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300' },
  overdue:   { label: 'Overdue',  cls: 'bg-rose-500/15 border-rose-500/30 text-rose-300' },
  draft:     { label: 'Draft',    cls: 'bg-muted border-border text-muted-foreground' },
  sent:      { label: 'Sent',     cls: 'bg-sky-500/15 border-sky-500/30 text-sky-300' },
};

function StatusPill({ status }: { status: string }) {
  const s = STATUS_STYLES[status?.toLowerCase()] || { label: status || 'Unknown', cls: 'bg-muted border-border text-muted-foreground' };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${s.cls}`}>
      {s.label}
    </span>
  );
}

export default function MoneyHubPage() {
  const { profile, loading: authLoading } = useAuth();
  const role = profile?.role as Role | undefined;

  const [txs, setTxs] = useState<Transaction[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busyRow, setBusyRow] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [streamTab, setStreamTab] = useState<StreamTab>('all');

  const fetchEverything = useCallback(async () => {
    setErr(null);
    try {
      const [txRes, invRes] = await Promise.all([
        fetch('/api/payments/transactions', { cache: 'no-store' }).then(r => r.json()).catch(() => ({ data: [] })),
        fetch('/api/invoices', { cache: 'no-store' }).then(r => r.json()).catch(() => ({ data: [] })),
      ]);
      setTxs(Array.isArray(txRes?.data) ? txRes.data : []);
      setInvoices(Array.isArray(invRes?.data) ? invRes.data : []);
    } catch (e: any) {
      setErr(e?.message ?? 'Failed to load finance data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && profile?.id) {
      fetchEverything();
    }
  }, [authLoading, profile?.id, fetchEverything]);

  // Per-stream scoped views (used when the stream tabs are active).
  const scopedTxs = useMemo(() => {
    if (streamTab === 'all') return txs;
    return txs.filter(t => txStream(t) === streamTab);
  }, [txs, streamTab]);

  const scopedInvoices = useMemo(() => {
    if (streamTab === 'all') return invoices;
    return invoices.filter(i => invStream(i) === streamTab);
  }, [invoices, streamTab]);

  const totals = useMemo(() => {
    const paid = scopedTxs.filter(t => ['completed', 'paid'].includes((t.payment_status || '').toLowerCase()));
    const pending = scopedTxs.filter(t => ['pending', 'processing'].includes((t.payment_status || '').toLowerCase()));
    const refunded = scopedTxs.filter(t => (t.payment_status || '').toLowerCase() === 'refunded' || t.refunded_at);
    const outstanding = scopedInvoices.filter(i => !['paid', 'cancelled', 'draft'].includes((i.status || '').toLowerCase()));

    // Admin-only: net commission on the SCHOOL stream (what Rillcod keeps).
    const schoolPaid = paid.filter(t => txStream(t) === 'school');
    const commissionSum = schoolPaid.reduce((s, t) => {
      return s + splitSchoolAmount(Number(t.amount || 0), DEFAULT_COMMISSION_RATE).rillcodRetain;
    }, 0);

    return {
      paidCount: paid.length,
      paidSum: paid.reduce((s, t) => s + Number(t.amount || 0), 0),
      pendingCount: pending.length,
      pendingSum: pending.reduce((s, t) => s + Number(t.amount || 0), 0),
      refundedCount: refunded.length,
      refundedSum: refunded.reduce((s, t) => s + Number(t.amount || 0), 0),
      outstandingCount: outstanding.length,
      outstandingSum: outstanding.reduce((s, i) => s + Number(i.amount || 0), 0),
      commissionSum,
      schoolPaidCount: schoolPaid.length,
    };
  }, [scopedTxs, scopedInvoices]);

  // Stream-level headline counts (always computed on the unscoped arrays so
  // the tabs themselves show accurate badges even when a tab is active).
  const streamCounts = useMemo(() => {
    const count = (stream: FinanceStream) =>
      txs.filter(t => txStream(t) === stream).length + invoices.filter(i => invStream(i) === stream).length;
    return { school: count('school'), individual: count('individual'), all: txs.length + invoices.length };
  }, [txs, invoices]);

  const filteredTxs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return scopedTxs.filter(t => {
      if (statusFilter !== 'all' && (t.payment_status || '').toLowerCase() !== statusFilter) return false;
      if (!q) return true;
      return (
        t.transaction_reference?.toLowerCase().includes(q) ||
        t.external_transaction_id?.toLowerCase().includes(q) ||
        t.payment_method?.toLowerCase().includes(q) ||
        t.portal_users?.full_name?.toLowerCase().includes(q) ||
        t.portal_users?.email?.toLowerCase().includes(q) ||
        t.invoices?.invoice_number?.toLowerCase().includes(q) ||
        t.courses?.title?.toLowerCase().includes(q)
      );
    });
  }, [scopedTxs, search, statusFilter]);

  const handleDownloadReceipt = async (txId: string) => {
    setBusyRow(txId);
    try {
      const res = await fetch(`/api/payments/receipt/${txId}`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not generate receipt');
      if (json.url) {
        window.open(json.url, '_blank', 'noopener,noreferrer');
        // Update the local row with the cached receipt URL
        setTxs(prev => prev.map(t => t.id === txId ? { ...t, receipt_url: json.url } : t));
      }
    } catch (e: any) {
      alert(e.message || 'Failed to download receipt');
    } finally {
      setBusyRow(null);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-xs font-black uppercase tracking-widest">Loading your finances…</span>
        </div>
      </div>
    );
  }

  const isAdmin = role === 'admin';
  const isSchool = role === 'school';
  const isStaff = isAdmin || isSchool || role === 'teacher';

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10 space-y-6">

        {/* ── Header ─────────────────────────────────────────────────── */}
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="w-10 h-10 inline-flex items-center justify-center rounded-xl bg-card border border-border hover:bg-muted transition-colors" aria-label="Back to dashboard">
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-600 to-cyan-600 text-white flex items-center justify-center shadow-lg shadow-emerald-900/30">
              <Wallet className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.22em]">Finance</p>
              <h1 className="text-xl sm:text-2xl font-black tracking-tight truncate">
                {isAdmin ? 'Platform Money' : isSchool ? 'School Money' : 'My Money'}
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setRefreshing(true); fetchEverything(); }}
              disabled={refreshing}
              className="inline-flex items-center gap-2 px-3 sm:px-4 py-2 text-xs font-black uppercase tracking-widest rounded-lg bg-card border border-border hover:bg-muted transition-colors min-h-[40px] disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
            {isStaff && (
              <Link
                href="/dashboard/finance"
                className="inline-flex items-center gap-2 px-3 sm:px-4 py-2 text-xs font-black uppercase tracking-widest rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white shadow-lg shadow-violet-900/20 min-h-[40px]"
              >
                Advanced <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            )}
          </div>
        </header>

        {err && (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-300 p-4 text-sm">
            <div className="flex items-center gap-2"><AlertCircle className="w-4 h-4" /> {err}</div>
          </div>
        )}

        {/* ── Stream tabs (admin + school roles only) ─────────────────── */}
        {(isAdmin || isSchool) && (
          <div
            role="tablist"
            aria-label="Finance stream"
            className="inline-flex items-center gap-1 p-1 rounded-xl bg-card border border-border overflow-x-auto max-w-full"
          >
            {[
              { id: 'all' as StreamTab, label: 'Both streams', badge: streamCounts.all },
              { id: 'school' as StreamTab, label: 'Schools', badge: streamCounts.school },
              { id: 'individual' as StreamTab, label: 'Individuals', badge: streamCounts.individual },
            ].map(t => (
              <button
                key={t.id}
                role="tab"
                aria-selected={streamTab === t.id}
                onClick={() => setStreamTab(t.id)}
                className={`inline-flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg text-[11px] font-black uppercase tracking-widest transition-colors min-h-[40px] whitespace-nowrap ${
                  streamTab === t.id
                    ? t.id === 'school'
                      ? 'bg-indigo-600 text-white shadow'
                      : t.id === 'individual'
                        ? 'bg-emerald-600 text-white shadow'
                        : 'bg-foreground text-background shadow'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <span>{t.label}</span>
                <span className={`inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-full text-[10px] ${
                  streamTab === t.id ? 'bg-white/15 text-white' : 'bg-muted text-muted-foreground'
                }`}>
                  {t.badge}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* ── Summary tiles ──────────────────────────────────────────── */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <SummaryTile
            label={isAdmin ? 'Revenue Collected' : 'Total Paid'}
            amount={totals.paidSum}
            count={totals.paidCount}
            icon={TrendingUp}
            gradient="from-emerald-500/20 to-green-900/30 border-emerald-500/30"
            accent="text-emerald-300"
          />
          <SummaryTile
            label="Pending"
            amount={totals.pendingSum}
            count={totals.pendingCount}
            icon={Clock}
            gradient="from-amber-500/20 to-orange-900/30 border-amber-500/30"
            accent="text-amber-300"
          />
          <SummaryTile
            label="Outstanding Invoices"
            amount={totals.outstandingSum}
            count={totals.outstandingCount}
            icon={FileText}
            gradient="from-sky-500/20 to-blue-900/30 border-sky-500/30"
            accent="text-sky-300"
          />
          {isAdmin && (streamTab === 'school' || streamTab === 'all') ? (
            <SummaryTile
              label={`Commission Retained${streamTab === 'all' ? ' (School)' : ''}`}
              amount={totals.commissionSum}
              count={totals.schoolPaidCount}
              icon={Banknote}
              gradient="from-indigo-500/20 to-violet-900/30 border-indigo-500/30"
              accent="text-indigo-300"
            />
          ) : (
            <SummaryTile
              label="Refunds"
              amount={totals.refundedSum}
              count={totals.refundedCount}
              icon={Receipt}
              gradient="from-fuchsia-500/20 to-pink-900/30 border-fuchsia-500/30"
              accent="text-fuchsia-300"
            />
          )}
        </section>

        {/* ── Quick actions (role-aware) ─────────────────────────────── */}
        <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3">
          {isAdmin && (
            <>
              <ActionLink href="/dashboard/finance/reconciliation" icon={CheckCircle2} label="Reconciliation" />
              <ActionLink href="/dashboard/finance?tab=operations" icon={CreditCard} label="Operations" />
              <ActionLink href="/dashboard/payments/bulk" icon={Banknote} label="Bulk invoicing" />
              <ActionLink href="/dashboard/subscriptions" icon={RefreshCw} label="Subscriptions" />
            </>
          )}
          {isSchool && (
            <>
              <ActionLink href="/dashboard/finance?tab=billing_cycles" icon={FileText} label="My Billing" />
              <ActionLink href="/dashboard/finance?tab=operations" icon={CreditCard} label="Transactions" />
              <ActionLink href="/dashboard/payments/bulk" icon={Banknote} label="Bulk invoices" />
              <ActionLink href="/dashboard/finance?tab=setup" icon={CheckCircle2} label="Settings" />
            </>
          )}
          {role === 'teacher' && (
            <>
              <ActionLink href="/dashboard/finance?tab=operations" icon={CreditCard} label="Operations" />
              <ActionLink href="/dashboard/finance?tab=billing_cycles" icon={FileText} label="Billing cycles" />
            </>
          )}
          {role === 'student' && (
            <>
              <ActionLink href="/dashboard/my-payments" icon={CreditCard} label="Pay an invoice" />
              <ActionLink href="/dashboard/my-payments" icon={FileText} label="My invoices" />
            </>
          )}
          {role === 'parent' && (
            <>
              <ActionLink href="/dashboard/parent-invoices" icon={CreditCard} label="Pay children's fees" />
              <ActionLink href="/dashboard/my-children" icon={FileText} label="My children" />
            </>
          )}
        </section>

        {/* ── Outstanding invoices (payers) ──────────────────────────── */}
        {!isAdmin && scopedInvoices.filter(i => !['paid', 'cancelled', 'draft'].includes((i.status || '').toLowerCase())).length > 0 && (
          <section className="rounded-2xl border border-border bg-card overflow-hidden">
            <div className="px-4 sm:px-5 py-3 border-b border-border flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="w-4 h-4 text-sky-400" />
                <h2 className="text-[11px] font-black uppercase tracking-widest text-foreground truncate">
                  Outstanding Invoices
                </h2>
              </div>
              <span className="text-[10px] font-black text-muted-foreground uppercase tracking-wider shrink-0">
                {totals.outstandingCount} open
              </span>
            </div>
            <ul className="divide-y divide-border">
              {scopedInvoices
                .filter(i => !['paid', 'cancelled', 'draft'].includes((i.status || '').toLowerCase()))
                .slice(0, 8)
                .map(inv => {
                  const payHref = role === 'parent'
                    ? `/dashboard/parent-invoices?invoice=${inv.id}`
                    : `/dashboard/my-payments?invoice=${inv.id}`;
                  return (
                    <li key={inv.id} className="flex items-center gap-3 p-3 sm:p-4 hover:bg-muted/30 transition-colors">
                      <div className="w-10 h-10 rounded-lg bg-sky-500/10 text-sky-300 inline-flex items-center justify-center shrink-0">
                        <FileText className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-black text-foreground truncate">{inv.invoice_number || 'Invoice'}</p>
                          <StatusPill status={inv.status} />
                          {(isAdmin || isSchool) && <StreamChip stream={invStream(inv)} />}
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          Due {formatDate(inv.due_date)} · {formatMoney(inv.amount, inv.currency)}
                        </p>
                      </div>
                      <Link
                        href={payHref}
                        className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-black uppercase tracking-widest min-h-[40px] shrink-0"
                      >
                        Pay <ChevronRight className="w-3 h-3" />
                      </Link>
                    </li>
                  );
                })}
            </ul>
          </section>
        )}

        {/* ── Transaction ledger ──────────────────────────────────────── */}
        <section className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="px-4 sm:px-5 py-3 border-b border-border flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
            <div className="flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-emerald-400" />
              <h2 className="text-[11px] font-black uppercase tracking-widest text-foreground">
                Transactions
              </h2>
              <span className="text-[10px] font-black text-muted-foreground uppercase tracking-wider">
                {filteredTxs.length} of {scopedTxs.length}
              </span>
            </div>
            <div className="flex items-center gap-2 flex-1 sm:max-w-md">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Ref, method, invoice…"
                  className="w-full pl-8 pr-3 py-2 text-sm bg-background border border-border rounded-lg outline-none focus:border-violet-500 min-h-[40px]"
                />
              </div>
              <div className="relative">
                <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                <select
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value)}
                  className="pl-8 pr-3 py-2 text-sm bg-background border border-border rounded-lg outline-none focus:border-violet-500 cursor-pointer appearance-none min-h-[40px]"
                >
                  <option value="all">All</option>
                  <option value="completed">Paid</option>
                  <option value="pending">Pending</option>
                  <option value="processing">Processing</option>
                  <option value="failed">Failed</option>
                  <option value="refunded">Refunded</option>
                </select>
              </div>
            </div>
          </div>

          {filteredTxs.length === 0 ? (
            <div className="p-10 text-center">
              <Receipt className="w-10 h-10 text-muted-foreground/50 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                {txs.length === 0 ? 'No transactions yet.' : 'No transactions match your filters.'}
              </p>
            </div>
          ) : (
            <>
              {/* Mobile: card list */}
              <ul className="divide-y divide-border sm:hidden">
                {filteredTxs.map((t, i) => (
                  <motion.li
                    key={t.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25, delay: Math.min(i * 0.02, 0.2) }}
                    className="p-4 flex items-start gap-3"
                  >
                    <div className="w-10 h-10 rounded-lg bg-muted text-foreground inline-flex items-center justify-center shrink-0">
                      {iconForMethod(t.payment_method)}
                    </div>
                      <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <p className="text-sm font-black text-foreground">{formatMoney(Number(t.amount), t.currency)}</p>
                        <StatusPill status={t.payment_status} />
                        {(isAdmin || isSchool) && <StreamChip stream={txStream(t)} />}
                      </div>
                      <p className="text-[11px] text-muted-foreground font-mono truncate">
                        {t.transaction_reference || t.external_transaction_id || '—'}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {t.invoices?.invoice_number ? `Invoice ${t.invoices.invoice_number} · ` : ''}
                        {(t.payment_method || 'gateway').toUpperCase()} · {formatDate(t.paid_at || t.created_at)}
                      </p>
                      {isStaff && t.portal_users?.full_name && (
                        <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                          Payer: {t.portal_users.full_name}
                        </p>
                      )}
                      {['completed', 'paid'].includes((t.payment_status || '').toLowerCase()) && (
                        <button
                          onClick={() => t.receipt_url ? window.open(t.receipt_url, '_blank', 'noopener,noreferrer') : handleDownloadReceipt(t.id)}
                          disabled={busyRow === t.id}
                          className="mt-2 inline-flex items-center gap-1 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-md bg-muted hover:bg-muted/70 text-foreground min-h-[36px] disabled:opacity-50"
                        >
                          {busyRow === t.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                          Receipt
                        </button>
                      )}
                    </div>
                  </motion.li>
                ))}
              </ul>

              {/* Desktop: table */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30 border-b border-border">
                    <tr>
                      <Th>When</Th>
                      <Th>Reference</Th>
                      {isStaff && <Th>Payer</Th>}
                      <Th>Description</Th>
                      {(isAdmin || isSchool) && <Th>Stream</Th>}
                      <Th>Method</Th>
                      <Th>Status</Th>
                      <Th align="right">Amount</Th>
                      <Th align="right">Receipt</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTxs.map((t, i) => (
                      <motion.tr
                        key={t.id}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.2, delay: Math.min(i * 0.015, 0.3) }}
                        className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                      >
                        <td className="px-3 py-3 text-muted-foreground">{formatDate(t.paid_at || t.created_at)}</td>
                        <td className="px-3 py-3 font-mono text-[12px] text-foreground truncate max-w-[180px]">
                          {t.transaction_reference || t.external_transaction_id || '—'}
                        </td>
                        {isStaff && (
                          <td className="px-3 py-3 text-foreground">
                            <div className="min-w-0">
                              <p className="font-bold truncate">{t.portal_users?.full_name || '—'}</p>
                              {t.portal_users?.email && <p className="text-[10px] text-muted-foreground truncate">{t.portal_users.email}</p>}
                            </div>
                          </td>
                        )}
                        <td className="px-3 py-3 text-foreground truncate max-w-[180px]">
                          {t.invoices?.invoice_number
                            ? `Invoice ${t.invoices.invoice_number}`
                            : t.courses?.title || '—'}
                        </td>
                        {(isAdmin || isSchool) && (
                          <td className="px-3 py-3"><StreamChip stream={txStream(t)} /></td>
                        )}
                        <td className="px-3 py-3 text-muted-foreground uppercase text-[11px] font-bold">
                          <span className="inline-flex items-center gap-1.5">
                            {iconForMethod(t.payment_method)}
                            {t.payment_method || 'gateway'}
                          </span>
                        </td>
                        <td className="px-3 py-3"><StatusPill status={t.payment_status} /></td>
                        <td className="px-3 py-3 text-right text-foreground font-black">
                          {formatMoney(Number(t.amount), t.currency)}
                        </td>
                        <td className="px-3 py-3 text-right">
                          {['completed', 'paid'].includes((t.payment_status || '').toLowerCase()) ? (
                            t.receipt_url ? (
                              <a
                                href={t.receipt_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-md bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 hover:bg-emerald-500/20"
                              >
                                <ExternalLink className="w-3 h-3" /> Open
                              </a>
                            ) : (
                              <button
                                onClick={() => handleDownloadReceipt(t.id)}
                                disabled={busyRow === t.id}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-md bg-muted hover:bg-muted/70 text-foreground disabled:opacity-50"
                              >
                                {busyRow === t.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                                {busyRow === t.id ? 'Generating' : 'Receipt'}
                              </button>
                            )
                          ) : (
                            <span className="text-[10px] text-muted-foreground">—</span>
                          )}
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>

        {/* ── Footer helper line ─────────────────────────────────────── */}
        <p className="text-[11px] text-muted-foreground text-center py-2">
          Payments are reconciled nightly. Receipts are issued automatically for every successful payment —
          if a receipt isn&apos;t showing, tap <Download className="w-3 h-3 inline" /> to re-issue it.
        </p>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
 * Small presentation helpers
 * ════════════════════════════════════════════════════════════════════════ */

function SummaryTile({
  label, amount, count, icon: Icon, gradient, accent,
}: {
  label: string;
  amount: number;
  count: number;
  icon: React.ComponentType<{ className?: string }>;
  gradient: string;
  accent: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={`rounded-2xl border p-4 sm:p-5 bg-gradient-to-br ${gradient} relative overflow-hidden`}
    >
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{label}</p>
        <Icon className={`w-4 h-4 ${accent}`} />
      </div>
      <p className="text-lg sm:text-2xl font-black text-foreground leading-tight truncate">
        {formatMoney(amount)}
      </p>
      <p className="text-[11px] text-muted-foreground mt-1">{count} {count === 1 ? 'record' : 'records'}</p>
    </motion.div>
  );
}

function ActionLink({ href, icon: Icon, label }: { href: string; icon: React.ComponentType<{ className?: string }>; label: string }) {
  return (
    <Link
      href={href}
      className="group inline-flex items-center gap-2 px-3 sm:px-4 py-3 rounded-xl border border-border bg-card hover:border-violet-500/40 hover:bg-muted/50 transition-all min-h-[52px]"
    >
      <span className="w-8 h-8 rounded-lg bg-muted group-hover:bg-violet-500/15 inline-flex items-center justify-center transition-colors">
        <Icon className="w-3.5 h-3.5 text-foreground" />
      </span>
      <span className="flex-1 text-[11px] sm:text-xs font-black uppercase tracking-widest text-foreground truncate">{label}</span>
      <ChevronRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
    </Link>
  );
}

function Th({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <th className={`px-3 py-2.5 text-${align} text-[10px] font-black uppercase tracking-widest text-muted-foreground`}>
      {children}
    </th>
  );
}

function iconForMethod(method?: string | null) {
  const m = (method || '').toLowerCase();
  if (m.includes('transfer') || m.includes('bank')) return <Banknote className="w-3.5 h-3.5 text-emerald-400" />;
  if (m.includes('paystack') || m.includes('card') || m.includes('stripe')) return <CreditCard className="w-3.5 h-3.5 text-violet-400" />;
  if (m.includes('cash')) return <Wallet className="w-3.5 h-3.5 text-amber-400" />;
  return <Receipt className="w-3.5 h-3.5 text-muted-foreground" />;
}
