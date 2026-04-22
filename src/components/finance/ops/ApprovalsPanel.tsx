'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/auth-context';
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
} from '@/lib/icons';
import {
  classifyInvoiceStream,
  streamPillClasses,
  streamLabel,
  type FinanceStream,
} from '@/lib/finance/streams';
import { formatMoney, formatShortDate } from '@/lib/finance/formatters';
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
}

type TabKey = 'pending_tx' | 'proof_queue' | 'all_tx';

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

  const [tab, setTab] = useState<TabKey>('pending_tx');
  const [txs, setTxs] = useState<TxRow[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [streamFilter, setStreamFilter] = useState<'all' | FinanceStream>('all');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [proofModal, setProofModal] = useState<{ invoiceId: string; invoiceNumber: string } | null>(
    null,
  );

  const loadAll = async () => {
    setLoading(true);
    try {
      const [txRes, invRes] = await Promise.all([
        fetch('/api/payments/transactions?limit=200').then((r) => (r.ok ? r.json() : { data: [] })),
        fetch('/api/invoices?limit=200').then((r) => (r.ok ? r.json() : { data: [] })),
      ]);
      setTxs((txRes.data as TxRow[]) ?? []);
      setInvoices((invRes.data as InvoiceRow[]) ?? []);
    } catch (e: unknown) {
      toast.error((e as Error).message || 'Failed to load');
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
    if (!isAdmin) return;
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
    if (!isAdmin) return;
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
      const res = await fetch(`/api/payments/receipt/${id}`);
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
      proofQueue: invList.filter((i) => ['sent', 'overdue', 'draft'].includes(i.status)),
    };
  }, [txs, invoices, search, streamFilter]);

  const list =
    tab === 'pending_tx' ? filtered.pending : tab === 'all_tx' ? filtered.all : filtered.proofQueue;

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center gap-3">
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

        <div className="flex-1" />

        {(isAdmin || isSchool) && (
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

        <button
          onClick={loadAll}
          className="inline-flex items-center gap-1 px-3 py-2 text-xs font-black uppercase tracking-widest text-muted-foreground hover:text-foreground"
        >
          <ArrowPathIcon className="w-4 h-4" /> Refresh
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : list.length === 0 ? (
        <div className="border border-dashed border-border rounded-xl p-10 text-center">
          <CheckCircleIcon className="w-10 h-10 mx-auto text-emerald-400/60" />
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
          isAdmin={isAdmin}
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
  isAdmin,
  busyId,
  onApprove,
  onReject,
  onIssueReceipt,
}: {
  rows: Array<TxRow & { stream: FinanceStream }>;
  isAdmin: boolean;
  busyId: string | null;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onIssueReceipt: (id: string) => void;
}) {
  return (
    <div className="space-y-2">
      {rows.map((tx) => (
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
                {tx.schools?.name && (
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <BuildingOfficeIcon className="w-3 h-3" /> {tx.schools.name}
                  </span>
                )}
                {tx.portal_users?.full_name && (
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <UserIcon className="w-3 h-3" /> {tx.portal_users.full_name}
                  </span>
                )}
              </div>
              <div className="text-[11px] text-muted-foreground mt-1">
                {formatShortDate(tx.created_at)} · {tx.payment_method}
                {tx.invoices?.invoice_number && ` · Invoice #${tx.invoices.invoice_number}`}
                {tx.courses?.title && ` · ${tx.courses.title}`}
              </div>
            </div>

            <div className="flex flex-wrap gap-2 shrink-0">
              {['pending', 'processing'].includes(tx.payment_status) && isAdmin && (
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
                    className="inline-flex items-center gap-1 px-3 py-1.5 bg-rose-600/20 border border-rose-600/40 hover:bg-rose-600/30 text-rose-300 text-[10px] font-black uppercase tracking-widest rounded-md disabled:opacity-50"
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
      ))}
    </div>
  );
}

function ProofQueueList({
  rows,
  onOpen,
}: {
  rows: Array<InvoiceRow & { stream: FinanceStream }>;
  onOpen: (inv: InvoiceRow) => void;
}) {
  return (
    <div className="space-y-2">
      {rows.map((inv) => (
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
                <span className="text-[10px] font-black uppercase tracking-widest text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/30">
                  {inv.status}
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
                Issued {formatShortDate(inv.created_at)}
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
      ))}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { label: string; cls: string; Icon: typeof CheckCircleIcon }> = {
    completed: { label: 'Completed', cls: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400', Icon: CheckCircleIcon },
    success: { label: 'Completed', cls: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400', Icon: CheckCircleIcon },
    pending: { label: 'Pending', cls: 'bg-amber-500/10 border-amber-500/30 text-amber-400', Icon: ClockIcon },
    processing: { label: 'Processing', cls: 'bg-blue-500/10 border-blue-500/30 text-blue-400', Icon: ClockIcon },
    failed: { label: 'Failed', cls: 'bg-rose-500/10 border-rose-500/30 text-rose-400', Icon: XCircleIcon },
    refunded: { label: 'Refunded', cls: 'bg-purple-500/10 border-purple-500/30 text-purple-400', Icon: ArrowPathIcon },
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
