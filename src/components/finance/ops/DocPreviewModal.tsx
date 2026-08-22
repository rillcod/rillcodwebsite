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
  CheckCircleIcon,
  PencilIcon,
} from '@/lib/icons';

export interface DocPreviewData {
  id?: string;
  number: string;
  date: string;
  dueDate?: string;
  status: string;
  stream?: 'school' | 'individual';
  items: { description: string; quantity: number; unit_price: number; total: number }[];
  amount: number;
  currency: string;
  notes?: string;
  /** The payer / recipient name. For school invoices this is the school name. */
  studentName: string;
  studentEmail?: string;
  schoolName: string;
  paymentMethod?: string;
  depositAccount?: { bank_name: string; account_number: string; account_name: string };
  receivedBy?: string;
  transactionRef?: string;
  instructorName?: string;
  /** Pre-built HTML to render in an iframe instead of SmartDocument (used for school invoices). */
  rawHtml?: string;
  /** Canonical server-rendered document for an already-persisted invoice. */
  documentUrl?: string;
  /** Linked term billing cycle id (school term invoices). */
  billingCycleId?: string | null;
  /** Human term label, e.g. "1st Term 2025/26". */
  termLabel?: string | null;
}

interface DocPreviewModalProps {
  type: 'invoice' | 'receipt';
  data: DocPreviewData;
  canManage: boolean;
  onClose: () => void;
  onChanged?: () => void;
  /** Create / update from a draft preview (no persisted id yet). */
  onSave?: () => void | Promise<void>;
  saveLabel?: string;
  /** Open the editor for an already-saved invoice. */
  onEdit?: () => void;
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
 *   - Draft preview: Create invoice (via onSave)
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
  onSave,
  saveLabel = 'Create invoice',
  onEdit,
}: DocPreviewModalProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const [showEmailInput, setShowEmailInput] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState(data.studentEmail || '');
  const invoiceId = data.id || '';
  const isDraftPreview = type === 'invoice' && !invoiceId;
  const isUnpaid = data.status !== 'paid';
  const isSchoolInvoice = data.stream === 'school';
  const termBillingLabel =
    data.termLabel?.trim() ||
    (data.billingCycleId ? 'Term billing' : null);
  const showTermBilling = isSchoolInvoice && (!!data.billingCycleId || !!data.termLabel);

  const markPaid = async () => {
    if (!invoiceId) return;
    if (!confirm(`Mark invoice #${data.number} as paid?`)) return;
    setBusy('mark_paid');
    try {
      const res = await fetch('/api/invoices/mark-paid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceId, amount: data.amount }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(j.error || 'Failed to mark paid');
      }
      toast.success(j.receiptUrl ? 'Invoice paid, receipted, and acknowledged.' : 'Invoice paid and acknowledgement queued.');
      onChanged?.();
      onClose();
    } catch (e: unknown) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const sendEmail = async (toEmail?: string) => {
    if (!invoiceId) return;
    const email = toEmail || recipientEmail || data.studentEmail;
    if (isSchoolInvoice && !email) {
      setShowEmailInput(true);
      return;
    }
    setBusy('send_email');
    setShowEmailInput(false);
    try {
      const res = await fetch('/api/payments/invoices/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceId, recipientEmail: email }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.success === false) {
        throw new Error(j.message || j.error || 'Failed to email invoice');
      }
      toast.success('Invoice email sent.');
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

  const handleSaveFromPreview = async () => {
    if (!onSave) return;
    setBusy('save');
    try {
      await onSave();
      onClose();
    } catch (e: unknown) {
      toast.error((e as Error).message || 'Could not save invoice');
    } finally {
      setBusy(null);
    }
  };

  const anyBusy = busy !== null;

  return (
    <div className="fixed inset-0 z-[100] bg-foreground/40 backdrop-blur-md overflow-y-auto pt-20 pb-20 px-0 sm:px-4">
      <div className="relative max-w-[850px] mx-auto">
        {/* Floating actions */}
        <div className="fixed top-4 right-4 flex flex-wrap items-center gap-2 z-[110]">
          {isDraftPreview && onSave && (
            <button
              type="button"
              onClick={() => void handleSaveFromPreview()}
              disabled={anyBusy}
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground text-xs font-black uppercase tracking-widest rounded-md shadow-lg"
            >
              {busy === 'save' ? (
                <ArrowPathIcon className="w-4 h-4 animate-spin" />
              ) : (
                <CheckCircleIcon className="w-4 h-4" />
              )}
              {busy === 'save' ? 'Saving…' : saveLabel}
            </button>
          )}

          {type === 'invoice' && invoiceId && onEdit && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onEdit();
              }}
              disabled={anyBusy}
              className="inline-flex items-center gap-2 px-4 py-2 bg-card border border-border hover:bg-muted text-foreground text-xs font-black uppercase tracking-widest rounded-md shadow-lg"
            >
              <PencilIcon className="w-4 h-4" /> Edit
            </button>
          )}

          {type === 'invoice' && canManage && isUnpaid && invoiceId && (
            <>
              <button
                onClick={markPaid}
                disabled={anyBusy}
                className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-primary-foreground text-xs font-black uppercase tracking-widest rounded-md shadow-lg"
              >
                {busy === 'mark_paid' ? (
                  <ArrowPathIcon className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckBadgeIcon className="w-4 h-4" />
                )}
                Mark paid
              </button>

              {/* Email button — for school invoices toggles recipient input */}
              {showEmailInput ? (
                <div className="flex items-center gap-2 bg-card border border-border rounded-md shadow-lg px-3 py-1.5">
                  <EnvelopeIcon className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                  <input
                    type="email"
                    placeholder="Recipient email"
                    value={recipientEmail}
                    onChange={e => setRecipientEmail(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') sendEmail(recipientEmail); }}
                    autoFocus
                    className="bg-transparent border-none outline-none text-xs font-medium text-foreground placeholder:text-muted-foreground w-44"
                  />
                  <button
                    onClick={() => sendEmail(recipientEmail)}
                    disabled={anyBusy || !recipientEmail.trim()}
                    className="px-2 py-1 bg-primary disabled:opacity-40 text-primary-foreground text-[10px] font-black uppercase rounded"
                  >
                    {busy === 'send_email' ? <ArrowPathIcon className="w-3 h-3 animate-spin" /> : 'Send'}
                  </button>
                  <button onClick={() => setShowEmailInput(false)} className="text-muted-foreground hover:text-foreground">
                    <XMarkIcon className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => isSchoolInvoice ? setShowEmailInput(true) : sendEmail()}
                  disabled={anyBusy}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary disabled:opacity-50 text-primary-foreground text-xs font-black uppercase tracking-widest rounded-md shadow-lg"
                >
                  {busy === 'send_email' ? (
                    <ArrowPathIcon className="w-4 h-4 animate-spin" />
                  ) : (
                    <EnvelopeIcon className="w-4 h-4" />
                  )}
                  Email
                </button>
              )}

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
              className="inline-flex items-center gap-2 px-4 py-2 bg-rose-600/20 border border-rose-600/40 hover:bg-rose-600/30 text-rose-700 dark:text-rose-300 text-xs font-black uppercase tracking-widest rounded-md shadow-lg"
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

        {showTermBilling && (
          <div className="mx-4 sm:mx-0 mb-3 rounded-xl border border-primary/30 bg-primary/10 px-4 py-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-primary">Term billing</p>
            <p className="mt-0.5 text-sm font-bold text-foreground">
              {termBillingLabel}
              {data.billingCycleId ? (
                <span className="ml-2 text-xs font-semibold text-muted-foreground">· Linked</span>
              ) : (
                <span className="ml-2 text-xs font-semibold text-muted-foreground">· Will link on create</span>
              )}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Linked to term billing · reminders sync automatically
            </p>
          </div>
        )}

        {isDraftPreview && onSave && (
          <div className="mx-4 sm:mx-0 mb-3 rounded-xl border border-border bg-card/80 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              Looks good? Create the invoice from this preview.
            </p>
            <button
              type="button"
              onClick={() => void handleSaveFromPreview()}
              disabled={anyBusy}
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-xs font-black uppercase tracking-widest rounded-md disabled:opacity-50"
            >
              {busy === 'save' ? (
                <ArrowPathIcon className="w-4 h-4 animate-spin" />
              ) : (
                <CheckCircleIcon className="w-4 h-4" />
              )}
              {busy === 'save' ? 'Saving…' : saveLabel}
            </button>
          </div>
        )}

        {/* Document */}
        <div className="mt-4">
          {data.documentUrl ? (
            <iframe
              src={data.documentUrl}
              title={`Invoice ${data.number}`}
              className="w-full border-0 rounded-xl shadow-2xl"
              style={{ minHeight: '1200px', background: '#fff' }}
            />
          ) : data.rawHtml ? (
            <iframe
              srcDoc={data.rawHtml}
              title={`Invoice ${data.number}`}
              className="w-full border-0 rounded-xl shadow-2xl"
              style={{ minHeight: '1200px', background: '#fff' }}
              sandbox="allow-popups allow-scripts allow-same-origin"
            />
          ) : (
            <SmartDocument type={type} data={data} />
          )}
        </div>
      </div>
    </div>
  );
}

export default DocPreviewModal;
