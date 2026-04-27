'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import SmartDocument from '@/components/finance/SmartDocument';
import {
  XMarkIcon,
  CheckBadgeIcon,
  EnvelopeIcon,
  TrashIcon,
  ArrowPathIcon,
  DocumentArrowDownIcon,
  BellAlertIcon,
} from '@/lib/icons';

export interface DocPreviewData {
  id?: string;
  number: string;
  date: string;
  dueDate?: string;
  status: string;
  items: { description: string; quantity: number; unit_price: number; total: number }[];
  amount: number;
  currency: string;
  notes?: string;
  studentName: string;
  studentEmail?: string;
  schoolName: string;
  paymentMethod?: string;
  depositAccount?: { bank_name: string; account_number: string; account_name: string };
  receivedBy?: string;
  transactionRef?: string;
  instructorName?: string;
}

interface DocPreviewModalProps {
  type: 'invoice' | 'receipt';
  data: DocPreviewData;
  canManage: boolean;
  onClose: () => void;
  onChanged?: () => void;
}

/**
 * DocPreviewModal
 *
 * Shared overlay that renders a rich client-side preview (SmartDocument) of
 * an invoice or receipt and exposes the staff actions that used to live on
 * the old PaymentsHub viewDoc overlay:
 *
 *   - Invoice: Mark as Paid, Send via Email, Send Reminder, Download PDF,
 *              Delete (admin)
 *   - Receipt: Download PDF
 *
 * Actions fire against the existing API routes — no logic was dropped from
 * the legacy hub, only rewired.
 */
export function DocPreviewModal({
  type,
  data,
  canManage,
  onClose,
  onChanged,
}: DocPreviewModalProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const invoiceId = data.id || '';
  const isUnpaid = data.status !== 'paid';

  const markPaid = async () => {
    if (!invoiceId) return;
    if (!confirm(`Mark invoice #${data.number} as paid?`)) return;
    setBusy('mark_paid');
    try {
      const res = await fetch(`/api/invoices/${invoiceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'paid' }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || 'Failed to mark paid');
      }
      toast.success('Invoice marked as paid.');
      onChanged?.();
      onClose();
    } catch (e: unknown) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const sendEmail = async () => {
    if (!invoiceId) return;
    setBusy('send_email');
    try {
      const res = await fetch('/api/payments/invoices/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceId }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.success === false) {
        throw new Error(j.message || j.error || 'Failed to email invoice');
      }
      toast.success('Invoice email queued.');
    } catch (e: unknown) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const sendReminder = async () => {
    if (!invoiceId) return;
    setBusy('remind');
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/remind`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'Failed to send reminder');
      toast.success('Reminder sent to payer.');
    } catch (e: unknown) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const deleteInvoice = async () => {
    if (!invoiceId) return;
    if (!confirm(`Delete invoice #${data.number}? This cannot be undone.`)) return;
    setBusy('delete');
    try {
      const res = await fetch(`/api/invoices/${invoiceId}`, { method: 'DELETE' });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || 'Failed to delete');
      }
      toast.success('Invoice deleted.');
      onChanged?.();
      onClose();
    } catch (e: unknown) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const anyBusy = busy !== null;

  return (
    <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md overflow-y-auto pt-20 pb-20 px-0 sm:px-4">
      <div className="relative max-w-[850px] mx-auto">
        {/* Floating actions */}
        <div className="fixed top-4 right-4 flex flex-wrap items-center gap-2 z-[110]">
          {type === 'invoice' && canManage && isUnpaid && (
            <>
              <button
                onClick={markPaid}
                disabled={anyBusy}
                className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-black uppercase tracking-widest rounded-md shadow-lg"
              >
                {busy === 'mark_paid' ? (
                  <ArrowPathIcon className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckBadgeIcon className="w-4 h-4" />
                )}
                Mark paid
              </button>
              <button
                onClick={sendEmail}
                disabled={anyBusy}
                className="inline-flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary disabled:opacity-50 text-white text-xs font-black uppercase tracking-widest rounded-md shadow-lg"
              >
                {busy === 'send_email' ? (
                  <ArrowPathIcon className="w-4 h-4 animate-spin" />
                ) : (
                  <EnvelopeIcon className="w-4 h-4" />
                )}
                Email
              </button>
              <button
                onClick={sendReminder}
                disabled={anyBusy}
                className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-xs font-black uppercase tracking-widest rounded-md shadow-lg"
              >
                {busy === 'remind' ? (
                  <ArrowPathIcon className="w-4 h-4 animate-spin" />
                ) : (
                  <BellAlertIcon className="w-4 h-4" />
                )}
                Remind
              </button>
            </>
          )}

          {type === 'invoice' && invoiceId && (
            <a
              href={`/api/invoices/${invoiceId}/pdf`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-card border border-border hover:bg-muted text-foreground text-xs font-black uppercase tracking-widest rounded-md shadow-lg"
            >
              <DocumentArrowDownIcon className="w-4 h-4" /> PDF
            </a>
          )}

          {type === 'invoice' && canManage && invoiceId && (
            <button
              onClick={deleteInvoice}
              disabled={anyBusy}
              className="inline-flex items-center gap-2 px-4 py-2 bg-rose-600/20 border border-rose-600/40 hover:bg-rose-600/30 text-rose-300 text-xs font-black uppercase tracking-widest rounded-md shadow-lg"
            >
              {busy === 'delete' ? (
                <ArrowPathIcon className="w-4 h-4 animate-spin" />
              ) : (
                <TrashIcon className="w-4 h-4" />
              )}
              Delete
            </button>
          )}

          <button
            onClick={onClose}
            className="p-2.5 bg-card border border-border hover:bg-muted rounded-full transition-all hover:scale-110 active:scale-90 shadow-lg"
            aria-label="Close"
          >
            <XMarkIcon className="w-5 h-5 text-foreground" />
          </button>
        </div>

        {/* Document */}
        <div className="mt-4">
          <SmartDocument type={type} data={data} />
        </div>
      </div>
    </div>
  );
}

export default DocPreviewModal;
