'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/auth-context';
import {
  ReceiptPercentIcon,
  MagnifyingGlassIcon,
  ArrowPathIcon,
  DocumentArrowDownIcon,
  BuildingOfficeIcon,
  UserIcon,
} from '@/lib/icons';
import { formatMoney, formatShortDate } from '@/lib/finance/formatters';
import {
  classifyReceiptStream,
  streamPillClasses,
  streamLabel,
  type FinanceStream,
} from '@/lib/finance/streams';
import { DocPreviewModal, type DocPreviewData } from './DocPreviewModal';

interface ReceiptRow {
  id: string;
  receipt_number: string;
  amount: number;
  currency: string | null;
  issued_at: string;
  pdf_url: string | null;
  stream?: string | null;
  school_id?: string | null;
  portal_user_id?: string | null;
  billing_cycle_id?: string | null;
  portal_users?: { full_name?: string; email?: string } | null;
  schools?: { name?: string } | null;
  metadata?: {
    items?: Array<{ description?: string; quantity?: number; unit_price?: number; total?: number }>;
    payer_name?: string;
    payment_method?: string;
    notes?: string;
    reference?: string;
    received_by?: string;
    deposit_account?: { bank_name: string; account_number: string; account_name: string };
  } | null;
}

/**
 * ReceiptsPanel — browse issued receipts (manual + automated).
 *
 * Replaces the "Issued Receipts" grid from the legacy PaymentsHub monitoring
 * view. Clicking a card opens the rich SmartDocument preview inside
 * DocPreviewModal. Each receipt can be downloaded (signed PDF URL) or
 * re-opened for printing.
 */
export function ReceiptsPanel() {
  const { profile } = useAuth();
  const canManage = ['admin', 'school', 'teacher'].includes(profile?.role || '');

  const [rows, setRows] = useState<ReceiptRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [streamFilter, setStreamFilter] = useState<'all' | FinanceStream>('all');
  const [preview, setPreview] = useState<DocPreviewData | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/receipts?limit=100');
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'Failed to load receipts');
      setRows((j.data ?? []) as ReceiptRow[]);
    } catch (e: unknown) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (profile) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  const enriched = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .map((r) => ({
        ...r,
        stream: classifyReceiptStream({
          stream: r.stream,
          school_id: r.school_id ?? null,
          student_id: r.portal_user_id ?? null,
          metadata: r.metadata ?? null,
        }),
      }))
      .filter((r) => (streamFilter === 'all' ? true : r.stream === streamFilter))
      .filter((r) => {
        if (!q) return true;
        return (
          (r.receipt_number || '').toLowerCase().includes(q) ||
          (r.schools?.name || '').toLowerCase().includes(q) ||
          (r.portal_users?.full_name || '').toLowerCase().includes(q) ||
          (r.metadata?.payer_name || '').toLowerCase().includes(q)
        );
      });
  }, [rows, search, streamFilter]);

  const openPreview = (r: ReceiptRow) => {
    const meta = r.metadata || {};
    const items =
      meta.items && meta.items.length > 0
        ? meta.items.map((it) => ({
            description: String(it.description ?? 'Payment'),
            quantity: Number(it.quantity ?? 1),
            unit_price: Number(it.unit_price ?? 0),
            total: Number(
              it.total ?? Number(it.quantity ?? 1) * Number(it.unit_price ?? 0),
            ),
          }))
        : [
            {
              description: 'Payment',
              quantity: 1,
              unit_price: r.amount,
              total: r.amount,
            },
          ];

    setPreview({
      id: r.id,
      number: r.receipt_number,
      date: new Date(r.issued_at).toLocaleDateString(),
      status: 'paid',
      items,
      amount: r.amount,
      currency: r.currency || 'NGN',
      notes: meta.notes,
      studentName:
        meta.payer_name ||
        r.portal_users?.full_name ||
        r.schools?.name ||
        'Client',
      studentEmail: r.portal_users?.email,
      schoolName: 'RILLCOD TECHNOLOGIES',
      paymentMethod: meta.payment_method,
      depositAccount: meta.deposit_account,
      receivedBy: meta.received_by,
      transactionRef: meta.reference || r.receipt_number,
      instructorName: meta.received_by || 'Accounts Department',
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center gap-3">
        <div className="flex items-center gap-2">
          <ReceiptPercentIcon className="w-4 h-4 text-emerald-400" />
          <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">
            {enriched.length} receipt{enriched.length === 1 ? '' : 's'}
          </p>
        </div>

        <div className="flex-1" />

        {canManage && (
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
            placeholder="Search receipt #, payer, school…"
            className="w-full md:w-64 pl-9 pr-3 py-2 text-xs border border-border bg-background rounded-md focus:outline-none focus:border-primary"
          />
        </div>

        <button
          onClick={load}
          className="inline-flex items-center gap-1 px-3 py-2 text-xs font-black uppercase tracking-widest text-muted-foreground hover:text-foreground"
        >
          <ArrowPathIcon className="w-4 h-4" /> Refresh
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : enriched.length === 0 ? (
        <div className="border border-dashed border-border rounded-xl p-10 text-center">
          <ReceiptPercentIcon className="w-10 h-10 mx-auto text-muted-foreground/40" />
          <p className="text-sm font-bold text-foreground mt-2">No receipts yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Receipts appear here when a payment is marked complete or when one is built
            from the Receipt Builder.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {enriched.map((r) => {
            const payer =
              r.metadata?.payer_name ||
              r.portal_users?.full_name ||
              r.schools?.name ||
              'Client';
            return (
              <button
                key={r.id}
                onClick={() => openPreview(r)}
                className="text-left bg-card border border-border rounded-xl p-4 hover:border-primary/40 transition-all"
              >
                <div className="flex justify-between items-start gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black border ${streamPillClasses(
                          r.stream,
                        )}`}
                      >
                        {streamLabel(r.stream)}
                      </span>
                      <span className="text-[10px] font-mono text-muted-foreground truncate">
                        {r.receipt_number}
                      </span>
                    </div>
                    <p className="text-sm font-black text-foreground mt-1 truncate">{payer}</p>
                  </div>
                  <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 text-[9px] font-black rounded-full uppercase shrink-0">
                    Paid
                  </span>
                </div>

                <div className="flex justify-between items-end mt-3">
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Amount</p>
                    <p className="text-xl font-black text-foreground">
                      {formatMoney(r.amount, r.currency || 'NGN')}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Issued</p>
                    <p className="text-xs font-bold text-muted-foreground">
                      {formatShortDate(r.issued_at)}
                    </p>
                  </div>
                </div>

                <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
                  <span className="capitalize">
                    {r.metadata?.payment_method
                      ? `via ${r.metadata.payment_method.replace('_', ' ')}`
                      : ''}
                  </span>
                  {r.pdf_url && (
                    <a
                      href={r.pdf_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1 text-primary hover:text-primary/80 font-black uppercase tracking-widest"
                    >
                      <DocumentArrowDownIcon className="w-3 h-3" /> PDF
                    </a>
                  )}
                </div>

                <div className="mt-2 flex items-center gap-2 flex-wrap text-[11px] text-muted-foreground">
                  {r.schools?.name && (
                    <span className="inline-flex items-center gap-1">
                      <BuildingOfficeIcon className="w-3 h-3" /> {r.schools.name}
                    </span>
                  )}
                  {r.portal_users?.email && (
                    <span className="inline-flex items-center gap-1 truncate">
                      <UserIcon className="w-3 h-3" /> {r.portal_users.email}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {preview && (
        <DocPreviewModal
          type="receipt"
          data={preview}
          canManage={canManage}
          onClose={() => setPreview(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}

export default ReceiptsPanel;
