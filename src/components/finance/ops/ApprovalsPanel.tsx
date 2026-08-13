'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/auth-context';
import { roleHasCapability } from '@/lib/auth/capabilities';
import {
  CheckCircleIcon,
  ClockIcon,
  XCircleIcon,
  ArrowPathIcon,
  MagnifyingGlassIcon,
  PaperClipIcon,
  DocumentArrowDownIcon,
  BuildingOfficeIcon,
  UserIcon,
  ArrowDownTrayIcon,
  ExclamationTriangleIcon,
  CheckBadgeIcon,
} from '@/lib/icons';
import {
  classifyInvoiceStream,
  streamPillClasses,
  streamLabel,
  type FinanceStream,
} from '@/lib/finance/streams';
import { formatMoney, formatShortDate } from '@/lib/finance/formatters';
import { contactDirectorySearchUrl } from '@/lib/finance/contact-link';
import Link from 'next/link';
import { SPECIAL_BALANCE_PAYMENT_TYPE, TERM_REGISTRATION_BALANCE_PAYMENT_TYPE } from '@/lib/registration/enrollment-types';
import { extractProspectPaymentProof, isPdfProofUrl } from '@/lib/summer-school/payment-proof';
import { ProofReviewModal } from './ProofReviewModal';

interface TxRow {
  id: string;
  amount: number;
  currency: string;
  payment_method: string;
  payment_status: string;
  transaction_reference: string | null;
  created_at: string;
  paid_at: string | null;
  school_id: string | null;
  portal_user_id: string | null;
  invoice_id: string | null;
  course_id: string | null;
  receipt_url: string | null;
  payment_gateway_response?: Record<string, unknown> | null;
  description?: string;
  source?: string;
  payerName?: string | null;
  studentName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  portal_users?: { full_name?: string; email?: string } | null;
  schools?: { name?: string } | null;
  courses?: { title?: string } | null;
  invoices?: {
    invoice_number?: string;
    items?: unknown;
    stream?: string | null;
    billing_cycle_id?: string | null;
    school_id?: string | null;
  } | null;
}

interface InvoiceRow {
  id: string;
  invoice_number: string;
  status: string;
  amount: number;
  currency: string;
  created_at: string;
  due_date?: string | null;
  stream?: string | null;
  school_id?: string | null;
  portal_user_id?: string | null;
  billing_cycle_id?: string | null;
  schools?: { name?: string } | null;
  portal_users?: { full_name?: string; email?: string } | null;
  proof_count?: number;
  latest_proof_at?: string | null;
  latest_proof_status?: string | null;
}

type TabKey = 'pending_tx' | 'proof_queue' | 'all_tx';

const MAX_FINANCE_PAGES = 100;

async function fetchAllTransactions(): Promise<TxRow[]> {
  const rows: TxRow[] = [];
  const seenCursors = new Set<string>();
  let cursor: { created_at: string; id: string } | null = null;

  for (let page = 0; page < MAX_FINANCE_PAGES; page++) {
    const params = new URLSearchParams({ limit: '200' });
    if (cursor) {
      params.set('cursor_created_at', cursor.created_at);
      params.set('cursor_id', cursor.id);
    }
    const response = await fetch(`/api/payments/transactions?${params.toString()}`, {
      cache: 'no-store',
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body.error || 'Payment transactions could not be loaded.');
    }
    rows.push(...(((body.data as TxRow[] | undefined) ?? [])));

    const next = body.nextCursor as { created_at?: unknown; id?: unknown } | null | undefined;
    if (!next) return rows;
    if (typeof next.created_at !== 'string' || typeof next.id !== 'string') {
      throw new Error('Payment history returned an invalid continuation marker.');
    }
    const cursorKey = `${next.created_at}:${next.id}`;
    if (seenCursors.has(cursorKey)) {
      throw new Error('Payment history pagination repeated a page. Refresh before reviewing approvals.');
    }
    seenCursors.add(cursorKey);
    cursor = { created_at: next.created_at, id: next.id };
  }

  throw new Error('Payment history is too large to review safely in one queue. Narrow the review scope.');
}

async function fetchAllInvoices(): Promise<InvoiceRow[]> {
  const rows: InvoiceRow[] = [];
  const pageSize = 500;

  for (let page = 0; page < MAX_FINANCE_PAGES; page++) {
    const offset = page * pageSize;
    const response = await fetch(`/api/invoices?limit=${pageSize}&offset=${offset}`, {
      cache: 'no-store',
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'Invoices could not be loaded.');

    const pageRows = (body.data as InvoiceRow[] | undefined) ?? [];
    rows.push(...pageRows);
    if (!body.pagination?.has_more) return rows;
    if (pageRows.length === 0) {
      throw new Error('Invoice pagination stopped before the complete approvals queue was loaded.');
    }
  }

  throw new Error('Invoice history is too large to review safely in one queue. Narrow the review scope.');
}

/**
 * ApprovalsPanel — manual approval of payments.
 *
 * Shows pending/processing transactions that need human review, plus invoices
 * with submitted payment proof awaiting moderation. Replaces the monitoring
 * actions of the legacy PaymentsHub.
 */
export function ApprovalsPanel() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const isSchool = profile?.role === 'school';
  const isTeacher = profile?.role === 'teacher';
  const canApprove = roleHasCapability(profile?.role, 'manage_finance');

  const [tab, setTab] = useState<TabKey>('pending_tx');
  const [txs, setTxs] = useState<TxRow[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [proofLoadFailures, setProofLoadFailures] = useState(0);
  const [search, setSearch] = useState('');
  const [streamFilter, setStreamFilter] = useState<'all' | FinanceStream>('all');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkIssuing, setBulkIssuing] = useState(false);
  const [proofModal, setProofModal] = useState<{ invoiceId: string; invoiceNumber: string } | null>(
    null,
  );
  const [showManualVerify, setShowManualVerify] = useState(false);
  const [manualTarget, setManualTarget] = useState<'invoice' | 'special_balance' | 'term_balance'>('invoice');
  const [manualTargetId, setManualTargetId] = useState('');
  const [manualAmount, setManualAmount] = useState('');
  const [manualMethod, setManualMethod] = useState('bank_transfer');
  const [manualReference, setManualReference] = useState('');
  const [manualNote, setManualNote] = useState('');
  const [manualBusy, setManualBusy] = useState(false);

  const loadAll = async () => {
    setLoading(true);
    setLoadError('');
    setProofLoadFailures(0);
    try {
      const [transactionRows, invoiceRows] = await Promise.all([
        fetchAllTransactions(),
        fetchAllInvoices(),
      ]);
      const openInvoices = invoiceRows.filter((inv) => ['sent', 'overdue', 'pending', 'partially_paid'].includes(inv.status));
      let proofFailures = 0;
      const proofMeta = await Promise.all(openInvoices.map(async (inv) => {
        try {
          const res = await fetch(`/api/invoices/${inv.id}/proofs`);
          if (!res.ok) {
            proofFailures++;
            return { id: inv.id, proof_count: 0 };
          }
          const json = await res.json().catch(() => ({}));
          const proofs = Array.isArray(json.data) ? json.data : [];
          return {
            id: inv.id,
            proof_count: proofs.length,
            latest_proof_at: proofs[0]?.created_at ?? null,
            latest_proof_status: proofs[0]?.status ?? null,
          };
        } catch {
          proofFailures++;
          return { id: inv.id, proof_count: 0 };
        }
      }));
      const proofMetaById = new Map(proofMeta.map((meta) => [meta.id, meta]));

      setTxs(transactionRows);
      setInvoices(invoiceRows.map((inv) => ({ ...inv, ...(proofMetaById.get(inv.id) ?? {}) })));
      setProofLoadFailures(proofFailures);
    } catch (e: unknown) {
      const message = (e as Error).message || 'Failed to load finance approvals.';
      setTxs([]);
      setInvoices([]);
      setLoadError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!profile) return;
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  const approveTx = async (id: string) => {
    if (!canApprove) return;
    if (!confirm('Mark this transaction as successful? This will trigger receipt issuance.')) return;
    setBusyId(id);
    try {
      const res = await fetch('/api/payments/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactionId: id, status: 'success' }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.success === false) throw new Error(j.error || 'Approval failed');
      toast.success('Approved — receipt will be issued');
      await loadAll();
    } catch (e: unknown) {
      toast.error((e as Error).message || 'Approval failed');
    } finally {
      setBusyId(null);
    }
  };

  const rejectTx = async (id: string) => {
    if (!canApprove) return;
    if (!confirm('Mark this transaction as failed? Use for duplicate/abandoned gateway attempts.')) return;
    setBusyId(id);
    try {
      const res = await fetch('/api/payments/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactionId: id, status: 'failed' }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || 'Reject failed');
      }
      toast.success('Transaction marked failed');
      await loadAll();
    } catch (e: unknown) {
      toast.error((e as Error).message || 'Reject failed');
    } finally {
      setBusyId(null);
    }
  };

  const issueReceipt = async (id: string) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/payments/receipt/${id}`, { method: 'POST' });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'Failed to issue receipt');
      toast.success(`Receipt ${j.receipt_number || ''} ready`);
      if (j.url) window.open(j.url, '_blank');
      await loadAll();
    } catch (e: unknown) {
      toast.error((e as Error).message || 'Failed to issue receipt');
    } finally {
      setBusyId(null);
    }
  };

  const bulkIssueReceipts = async () => {
    const missing = txs.filter(
      (tx) => ['completed', 'success'].includes(tx.payment_status) && !tx.receipt_url,
    );
    if (missing.length === 0) { toast.info('No completed transactions missing receipts.'); return; }
    if (!confirm(`Issue receipts for ${missing.length} transaction${missing.length === 1 ? '' : 's'}?`)) return;
    setBulkIssuing(true);
    let ok = 0;
    let fail = 0;
    for (const tx of missing) {
      try {
        const res = await fetch(`/api/payments/receipt/${tx.id}`, { method: 'POST' });
        if (res.ok) ok++; else fail++;
      } catch {
        fail++;
      }
    }
    setBulkIssuing(false);
    if (ok > 0) toast.success(`${ok} receipt${ok === 1 ? '' : 's'} issued${fail > 0 ? ` · ${fail} failed` : ''}`);
    if (fail > 0 && ok === 0) toast.error(`All ${fail} failed — check API logs`);
    await loadAll();
  };

  const verifyManualPayment = async () => {
    const targetId = manualTargetId.trim();
    const amount = Number(manualAmount);
    if (!targetId) {
      toast.error(
        manualTarget === 'invoice'
          ? 'Enter an invoice ID'
          : manualTarget === 'term_balance'
            ? 'Enter a student ID'
            : 'Enter a special-programme prospect ID',
      );
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Enter a valid amount');
      return;
    }

    setManualBusy(true);
    try {
      const res = await fetch('/api/payments/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount,
          payment_method: manualMethod,
          reference: manualReference.trim() || undefined,
          notes: manualNote.trim() || undefined,
          ...(manualTarget === 'invoice'
            ? { invoice_id: targetId }
            : manualTarget === 'term_balance'
              ? { student_id: targetId, payment_type: TERM_REGISTRATION_BALANCE_PAYMENT_TYPE }
              : { prospect_id: targetId, payment_type: SPECIAL_BALANCE_PAYMENT_TYPE }),
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'Verification failed');
      toast.success(
        manualTarget === 'invoice'
          ? 'Invoice payment verified and receipted'
          : manualTarget === 'term_balance'
            ? 'Term registration balance verified'
            : 'Special programme balance verified and reminders stopped',
      );
      setManualTargetId('');
      setManualAmount('');
      setManualReference('');
      setManualNote('');
      setShowManualVerify(false);
      await loadAll();
    } catch (e: unknown) {
      toast.error((e as Error).message || 'Verification failed');
    } finally {
      setManualBusy(false);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    const matchStream = (stream: FinanceStream) =>
      streamFilter === 'all' ? true : stream === streamFilter;

    const txList = txs
      .map((tx) => ({
        ...tx,
        stream: classifyInvoiceStream({
          stream: tx.invoices?.stream,
          school_id: tx.school_id ?? tx.invoices?.school_id ?? null,
          billing_cycle_id: tx.invoices?.billing_cycle_id ?? null,
          portal_user_id: tx.portal_user_id,
          schools: tx.schools ?? null,
        }),
      }))
      .filter((tx) => matchStream(tx.stream))
      .filter((tx) => {
        if (!q) return true;
        return (
          (tx.transaction_reference || '').toLowerCase().includes(q) ||
          (tx.portal_users?.full_name || '').toLowerCase().includes(q) ||
          (tx.portal_users?.email || '').toLowerCase().includes(q) ||
          (tx.schools?.name || '').toLowerCase().includes(q) ||
          (tx.invoices?.invoice_number || '').toLowerCase().includes(q)
        );
      });

    const invList = invoices
      .map((inv) => ({
        ...inv,
        stream: classifyInvoiceStream({
          stream: inv.stream,
          school_id: inv.school_id,
          billing_cycle_id: inv.billing_cycle_id ?? null,
          portal_user_id: inv.portal_user_id ?? null,
          schools: inv.schools ?? null,
        }),
      }))
      .filter((inv) => matchStream(inv.stream))
      .filter((inv) => {
        if (!q) return true;
        return (
          (inv.invoice_number || '').toLowerCase().includes(q) ||
          (inv.schools?.name || '').toLowerCase().includes(q) ||
          (inv.portal_users?.full_name || '').toLowerCase().includes(q)
        );
      });

    return {
      pending: txList.filter((t) => ['pending', 'processing'].includes(t.payment_status)),
      all: txList,
      proofQueue: invList.filter((i) => Number(i.proof_count || 0) > 0),
    };
  }, [txs, invoices, search, streamFilter]);

  const list =
    tab === 'pending_tx' ? filtered.pending : tab === 'all_tx' ? filtered.all : filtered.proofQueue;

  return (
    <div className="space-y-4">
      {loadError ? (
        <div role="alert" className="flex flex-col gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
          <span>{loadError} Nothing is shown as all clear until this succeeds.</span>
          <button type="button" onClick={() => void loadAll()} className="min-h-11 rounded-lg border border-rose-500/30 px-3 py-2 text-xs font-black">Try again</button>
        </div>
      ) : null}
      {proofLoadFailures > 0 ? (
        <p role="alert" className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-800 dark:text-amber-200">
          Proof status could not be checked for {proofLoadFailures} invoice{proofLoadFailures === 1 ? '' : 's'}. Refresh before treating the proof queue as complete.
        </p>
      ) : null}
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Queue filter</span>
          <div className="inline-flex border border-border rounded-xl overflow-hidden">
          {[
            { k: 'pending_tx', label: 'Pending', count: filtered.pending.length },
            { k: 'proof_queue', label: 'Proof queue', count: filtered.proofQueue.length },
            { k: 'all_tx', label: 'All', count: filtered.all.length },
          ].map((t) => (
            <button
              key={t.k}
              onClick={() => setTab(t.k as TabKey)}
              className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-colors ${
                tab === t.k
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t.label}
              <span
                className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${
                  tab === t.k ? 'bg-primary-foreground/20' : 'bg-muted'
                }`}
              >
                {t.count}
              </span>
            </button>
          ))}
          </div>
        </div>

        <div className="flex-1" />

        {isAdmin && (
          <button
            onClick={() => setShowManualVerify((v) => !v)}
            className="inline-flex items-center gap-1 px-3 py-2 text-xs font-black uppercase tracking-widest bg-emerald-600/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-600/25 rounded-md"
          >
            <CheckBadgeIcon className="w-4 h-4" /> Verify payment
          </button>
        )}

        {(isAdmin || isSchool || isTeacher) && (
          <div className="inline-flex border border-border rounded-xl overflow-hidden text-xs">
            {(['all', 'school', 'individual'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStreamFilter(s)}
                className={`px-3 py-1.5 font-black uppercase tracking-widest ${
                  streamFilter === s
                    ? 'bg-foreground text-background'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {s === 'all' ? 'All' : streamLabel(s)}
              </button>
            ))}
          </div>
        )}

        <div className="relative">
          <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search ref, payer, invoice…"
            className="w-full md:w-64 pl-9 pr-3 py-2 text-xs border border-border bg-background rounded-md focus:outline-none focus:border-primary"
          />
        </div>

        {tab === 'all_tx' && isAdmin && txs.filter(tx => ['completed','success'].includes(tx.payment_status) && !tx.receipt_url).length > 0 && (
          <button
            onClick={bulkIssueReceipts}
            disabled={bulkIssuing}
            className="inline-flex items-center gap-1 px-3 py-2 text-xs font-black uppercase tracking-widest bg-primary/10 border border-primary/30 text-primary hover:bg-primary/20 rounded-md disabled:opacity-50"
            title="Issue receipts for all completed transactions missing one"
          >
            {bulkIssuing ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : <ArrowDownTrayIcon className="w-4 h-4" />}
            Issue missing ({txs.filter(tx => ['completed','success'].includes(tx.payment_status) && !tx.receipt_url).length})
          </button>
        )}

        <button
          onClick={loadAll}
          className="inline-flex items-center gap-1 px-3 py-2 text-xs font-black uppercase tracking-widest text-muted-foreground hover:text-foreground"
        >
          <ArrowPathIcon className="w-4 h-4" /> Refresh
        </button>
      </div>

      {showManualVerify && isAdmin && (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-3">
          <div>
            <p className="text-sm font-black text-foreground">Manual balance verification</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Use this when a bank transfer, POS, cash, or uploaded proof has been confirmed outside the online gateway.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-6 gap-2">
            <select
              value={manualTarget}
              onChange={(e) => setManualTarget(e.target.value as 'invoice' | 'special_balance' | 'term_balance')}
              className="md:col-span-1 px-3 py-2 text-xs border border-border bg-background rounded-md focus:outline-none focus:border-primary"
            >
              <option value="invoice">Invoice</option>
              <option value="special_balance">Special balance</option>
              <option value="term_balance">Term balance</option>
            </select>
            <input
              value={manualTargetId}
              onChange={(e) => setManualTargetId(e.target.value)}
              placeholder={
                manualTarget === 'invoice'
                  ? 'Invoice ID'
                  : manualTarget === 'term_balance'
                    ? 'Student ID'
                    : 'Prospect ID'
              }
              className="md:col-span-2 px-3 py-2 text-xs border border-border bg-background rounded-md focus:outline-none focus:border-primary"
            />
            <input
              value={manualAmount}
              onChange={(e) => setManualAmount(e.target.value)}
              type="number"
              min="1"
              placeholder="Amount"
              className="px-3 py-2 text-xs border border-border bg-background rounded-md focus:outline-none focus:border-primary"
            />
            <select
              value={manualMethod}
              onChange={(e) => setManualMethod(e.target.value)}
              className="px-3 py-2 text-xs border border-border bg-background rounded-md focus:outline-none focus:border-primary"
            >
              <option value="bank_transfer">Bank transfer</option>
              <option value="pos">POS</option>
              <option value="cash">Cash</option>
              <option value="mobile_money">Mobile money</option>
              <option value="cheque">Cheque</option>
              <option value="other">Other</option>
            </select>
            <input
              value={manualReference}
              onChange={(e) => setManualReference(e.target.value)}
              placeholder="Reference"
              className="px-3 py-2 text-xs border border-border bg-background rounded-md focus:outline-none focus:border-primary"
            />
          </div>
          <div className="flex flex-col md:flex-row gap-2">
            <textarea
              value={manualNote}
              onChange={(e) => setManualNote(e.target.value)}
              placeholder="Optional note, e.g. proof checked against bank statement"
              rows={2}
              className="flex-1 px-3 py-2 text-xs border border-border bg-background rounded-md focus:outline-none focus:border-primary"
            />
            <button
              onClick={verifyManualPayment}
              disabled={manualBusy}
              className="md:w-44 inline-flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-black uppercase tracking-widest rounded-md"
            >
              {manualBusy ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : <CheckCircleIcon className="w-4 h-4" />}
              Verify
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : loadError ? null : list.length === 0 ? (
        <div className="border border-dashed border-border rounded-xl p-10 text-center">
          <CheckCircleIcon className="w-10 h-10 mx-auto text-emerald-600/60 dark:text-emerald-400/60" />
          <p className="text-sm font-bold text-foreground mt-2">All clear</p>
          <p className="text-xs text-muted-foreground mt-1">Nothing waiting for your review.</p>
        </div>
      ) : tab === 'proof_queue' ? (
        <ProofQueueList
          rows={list as Array<InvoiceRow & { stream: FinanceStream }>}
          onOpen={(i) =>
            setProofModal({ invoiceId: i.id, invoiceNumber: i.invoice_number })
          }
        />
      ) : (
        <TxList
          rows={list as Array<TxRow & { stream: FinanceStream }>}
          canApprove={canApprove}
          busyId={busyId}
          onApprove={approveTx}
          onReject={rejectTx}
          onIssueReceipt={issueReceipt}
        />
      )}

      {proofModal && (
        <ProofReviewModal
          invoiceId={proofModal.invoiceId}
          invoiceNumber={proofModal.invoiceNumber}
          onClose={() => setProofModal(null)}
          onApprove={loadAll}
        />
      )}
    </div>
  );
}

// ── Sub-lists ─────────────────────────────────────────────────────────────

function TxList({
  rows,
  canApprove,
  busyId,
  onApprove,
  onReject,
  onIssueReceipt,
}: {
  rows: Array<TxRow & { stream: FinanceStream }>;
  canApprove: boolean;
  busyId: string | null;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onIssueReceipt: (id: string) => void;
}) {
  return (
    <div className="space-y-2">
      {rows.map((tx) => {
        const proof = extractProspectPaymentProof(
          tx.payment_gateway_response as Record<string, unknown> | null | undefined,
          tx.transaction_reference,
        );
        const proofUrl = proof.receiptUrl;
        return (
        <div
          key={tx.id}
          className="border border-border rounded-xl p-4 bg-card/50 hover:bg-card transition-colors"
        >
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <StatusBadge status={tx.payment_status} />
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black border ${streamPillClasses(tx.stream)}`}>
                  {streamLabel(tx.stream)}
                </span>
                <span className="text-[11px] font-mono text-muted-foreground">
                  {tx.transaction_reference || tx.id.slice(0, 8)}
                </span>
              </div>
              <div className="mt-1 flex items-center gap-2 flex-wrap text-sm">
                <span className="font-black text-foreground">
                  {formatMoney(tx.amount, tx.currency)}
                </span>
                {tx.description && (
                  <span className="text-xs font-semibold text-foreground truncate max-w-[280px]">{tx.description}</span>
                )}
                {tx.schools?.name && (
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <BuildingOfficeIcon className="w-3 h-3" /> {tx.schools.name}
                  </span>
                )}
                {(tx.payerName || tx.portal_users?.full_name) && (
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <UserIcon className="w-3 h-3" /> {tx.payerName || tx.portal_users?.full_name}
                  </span>
                )}
                {tx.studentName && tx.studentName !== (tx.payerName || tx.portal_users?.full_name) && (
                  <span className="text-xs text-muted-foreground">Learner: {tx.studentName}</span>
                )}
              </div>
              <div className="text-[11px] text-muted-foreground mt-1">
                {formatShortDate(tx.created_at)} · {tx.payment_method?.replace(/_/g, ' ')}
                {tx.source ? ` · ${tx.source}` : ''}
                {tx.invoices?.invoice_number && ` · Invoice #${tx.invoices.invoice_number}`}
                {tx.courses?.title && !tx.description?.includes(tx.courses.title) && ` · ${tx.courses.title}`}
                {tx.contactEmail && ` · ${tx.contactEmail}`}
              </div>
              {contactDirectorySearchUrl(tx) && (
                <Link
                  href={contactDirectorySearchUrl(tx)!}
                  className="text-[10px] font-bold text-primary hover:underline inline-block mt-1"
                >
                  Open in Contact Directory
                </Link>
              )}
              {(proofUrl || proof.transferReference || proof.amountCharged) && (
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px]">
                  {proof.amountCharged != null && proof.amountCharged > 0 && (
                    <span className="font-bold text-foreground">Submitted: ₦{proof.amountCharged.toLocaleString()}</span>
                  )}
                  {proof.balanceDue != null && proof.balanceDue > 0 && (
                    <span className="font-bold text-amber-600 dark:text-amber-400">Balance: ₦{proof.balanceDue.toLocaleString()}</span>
                  )}
                  {proof.transferReference && (
                    <span className="font-mono text-muted-foreground">Ref: {proof.transferReference}</span>
                  )}
                  {proofUrl && (
                    <a
                      href={proofUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 rounded-md font-black uppercase tracking-wider"
                    >
                      <PaperClipIcon className="w-3 h-3" />
                      {isPdfProofUrl(proofUrl) ? 'Parent proof (PDF)' : 'Parent proof (image)'}
                    </a>
                  )}
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-2 shrink-0">
              {['pending', 'processing'].includes(tx.payment_status) && canApprove && (
                <>
                  <button
                    disabled={busyId === tx.id}
                    onClick={() => onApprove(tx.id)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-black uppercase tracking-widest rounded-md disabled:opacity-50"
                  >
                    <CheckCircleIcon className="w-3 h-3" /> Approve
                  </button>
                  <button
                    disabled={busyId === tx.id}
                    onClick={() => onReject(tx.id)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 bg-rose-600/20 border border-rose-600/40 hover:bg-rose-600/30 text-rose-700 dark:text-rose-300 text-[10px] font-black uppercase tracking-widest rounded-md disabled:opacity-50"
                  >
                    <XCircleIcon className="w-3 h-3" /> Reject
                  </button>
                </>
              )}
              {['completed', 'success'].includes(tx.payment_status) && !tx.receipt_url && (
                <button
                  disabled={busyId === tx.id}
                  onClick={() => onIssueReceipt(tx.id)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 bg-primary text-primary-foreground text-[10px] font-black uppercase tracking-widest rounded-md disabled:opacity-50"
                >
                  <ArrowDownTrayIcon className="w-3 h-3" /> Issue receipt
                </button>
              )}
              {tx.receipt_url && (
                <a
                  href={tx.receipt_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-3 py-1.5 border border-border text-[10px] font-black uppercase tracking-widest rounded-md hover:border-primary"
                >
                  <DocumentArrowDownIcon className="w-3 h-3" /> Receipt
                </a>
              )}
            </div>
          </div>
        </div>
        );
      })}
    </div>
  );
}

function proofAgeBadge(createdAt: string): { label: string; cls: string } {
  const days = Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000);
  if (days < 7) return { label: `${days}d in queue`, cls: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400' };
  if (days < 14) return { label: `${days}d in queue`, cls: 'bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400' };
  return { label: `${days}d overdue`, cls: 'bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400' };
}

function ProofQueueList({
  rows,
  onOpen,
  onAutoReject,
}: {
  rows: Array<InvoiceRow & { stream: FinanceStream }>;
  onOpen: (inv: InvoiceRow) => void;
  onAutoReject?: (inv: InvoiceRow) => void;
}) {
  const stale = rows.filter(inv => Math.floor((Date.now() - new Date(inv.latest_proof_at || inv.created_at).getTime()) / 86400000) > 30);

  return (
    <div className="space-y-2">
      {stale.length > 0 && onAutoReject && (
        <div className="flex items-center gap-3 rounded-xl border border-rose-500/30 bg-rose-500/5 px-4 py-2">
          <ExclamationTriangleIcon className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
          <p className="text-xs text-rose-700 dark:text-rose-300 flex-1">
            {stale.length} proof{stale.length === 1 ? '' : 's'} in queue for 30+ days.
          </p>
          <button
            onClick={() => stale.forEach(inv => onAutoReject(inv))}
            className="text-[10px] font-black uppercase tracking-widest text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 border border-rose-500/40 rounded px-2 py-1"
          >
            Reject all stale
          </button>
        </div>
      )}
      {rows.map((inv) => {
        const age = proofAgeBadge(inv.latest_proof_at || inv.created_at);
        return (
          <div
            key={inv.id}
            className="border border-border rounded-xl p-4 bg-card/50 hover:bg-card transition-colors"
          >
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black border ${streamPillClasses(inv.stream)}`}>
                    {streamLabel(inv.stream)}
                  </span>
                  <span className="text-[11px] font-mono text-muted-foreground">
                    #{inv.invoice_number}
                  </span>
                  <span className="text-[10px] font-black uppercase tracking-widest text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/30">
                    {inv.latest_proof_status || 'proof submitted'}
                  </span>
                  <span className="text-[10px] font-black uppercase tracking-widest text-sky-600 dark:text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded-full border border-sky-500/30">
                    {inv.proof_count || 0} proof{Number(inv.proof_count || 0) === 1 ? '' : 's'}
                  </span>
                  <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${age.cls}`}>
                    {age.label}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-2 flex-wrap text-sm">
                  <span className="font-black text-foreground">
                    {formatMoney(inv.amount, inv.currency)}
                  </span>
                  {inv.schools?.name && (
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <BuildingOfficeIcon className="w-3 h-3" /> {inv.schools.name}
                    </span>
                  )}
                  {inv.portal_users?.full_name && (
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <UserIcon className="w-3 h-3" /> {inv.portal_users.full_name}
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-muted-foreground mt-1">
                  Latest proof {formatShortDate(inv.latest_proof_at || inv.created_at)}
                  {' · '}
                  Invoice issued {formatShortDate(inv.created_at)}
                  {inv.due_date && ` · Due ${formatShortDate(inv.due_date)}`}
                </div>
              </div>

              <button
                onClick={() => onOpen(inv)}
                className="inline-flex items-center gap-1 px-3 py-1.5 bg-primary text-primary-foreground text-[10px] font-black uppercase tracking-widest rounded-md"
              >
                <PaperClipIcon className="w-3 h-3" /> Review proofs
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { label: string; cls: string; Icon: typeof CheckCircleIcon }> = {
    completed: { label: 'Completed', cls: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400', Icon: CheckCircleIcon },
    success: { label: 'Completed', cls: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400', Icon: CheckCircleIcon },
    pending: { label: 'Pending', cls: 'bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400', Icon: ClockIcon },
    processing: { label: 'Processing', cls: 'bg-primary/10 border-primary/30 text-primary', Icon: ClockIcon },
    failed: { label: 'Failed', cls: 'bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400', Icon: XCircleIcon },
    refunded: { label: 'Refunded', cls: 'bg-purple-500/10 border-purple-500/30 text-purple-600 dark:text-purple-400', Icon: ArrowPathIcon },
  };
  const c = cfg[status] ?? cfg.pending;
  const Icon = c.Icon;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-black uppercase tracking-widest ${c.cls}`}
    >
      <Icon className="w-3 h-3" /> {c.label}
    </span>
  );
}

export default ApprovalsPanel;
