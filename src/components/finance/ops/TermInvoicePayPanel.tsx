'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  ArrowUpTrayIcon,
  CreditCardIcon,
  PaperClipIcon,
} from '@/lib/icons';
import { formatMoney } from '@/lib/finance/formatters';

interface TermInvoicePayPanelProps {
  billingCycleId: string;
  amount: number;
  currency: string;
  invoiceNumber?: string;
  onComplete?: () => void;
}

function ProofUpload({
  cycleId,
  onUploaded,
}: {
  cycleId: string;
  onUploaded?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append('file', file);
    fd.append('note', note);
    try {
      const res = await fetch(`/api/billing/cycles/${cycleId}/proofs`, { method: 'POST', body: fd });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? 'Upload failed');
      toast.success('Payment evidence uploaded. Admin will review within 24 hours.');
      setOpen(false);
      setNote('');
      if (fileRef.current) fileRef.current.value = '';
      onUploaded?.();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-primary/10 hover:bg-primary/20 border border-primary/30 text-primary rounded-lg transition-all"
      >
        <ArrowUpTrayIcon className="w-3.5 h-3.5" /> Upload proof
      </button>
    );
  }

  return (
    <div className="border border-primary/20 rounded-xl p-3 bg-primary/5 space-y-3">
      <p className="text-[10px] font-black uppercase tracking-widest text-primary">Upload payment evidence</p>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        placeholder="Optional: bank reference, transfer narration, or note for admin…"
        className="w-full px-3 py-2 bg-background border border-border rounded-lg text-xs text-foreground placeholder-muted-foreground/40 focus:outline-none focus:border-primary/50 resize-none"
      />
      <div className="flex items-center gap-2">
        <label
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all ${
            uploading ? 'bg-muted text-muted-foreground' : 'bg-primary hover:bg-primary text-white'
          }`}
        >
          <PaperClipIcon className="w-3.5 h-3.5" />
          {uploading ? 'Uploading…' : 'Choose file'}
          <input
            ref={fileRef}
            type="file"
            accept="image/*,.pdf"
            onChange={handleFile}
            disabled={uploading}
            className="hidden"
          />
        </label>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Cancel
        </button>
      </div>
      <p className="text-[10px] text-muted-foreground">Accepted: JPG, PNG, PDF — max 10 MB</p>
    </div>
  );
}

/** School-facing payment options for a term invoice (Paystack + bank transfer proof). */
export function TermInvoicePayPanel({
  billingCycleId,
  amount,
  currency,
  invoiceNumber,
  onComplete,
}: TermInvoicePayPanelProps) {
  const [paystackLoading, setPaystackLoading] = useState(false);

  const initiatePaystack = async () => {
    setPaystackLoading(true);
    try {
      const res = await fetch(`/api/billing/cycles/${billingCycleId}/checkout`, { method: 'POST' });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Paystack initialisation failed');
      window.location.href = j.url;
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Payment failed to initialise');
    } finally {
      setPaystackLoading(false);
    }
  };

  return (
    <div className="mt-3 border-t border-border pt-3 space-y-3">
      <p className="text-[10px] font-black uppercase tracking-widest text-foreground">Pay this invoice</p>
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="border border-border rounded-xl p-3 space-y-1.5">
          <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Bank transfer</p>
          <p className="text-xs text-foreground font-bold">Transfer to Rillcod Technologies</p>
          <p className="text-[11px] text-muted-foreground">
            Use {invoiceNumber ? `#${invoiceNumber}` : 'your invoice number'} as the transfer narration, then upload proof below.
          </p>
          <Link
            href="/dashboard/finance?workspace=settings"
            className="inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:underline"
          >
            View account details →
          </Link>
        </div>
        <div className="border border-border rounded-xl p-3 space-y-2">
          <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Paystack (card / bank)</p>
          <p className="text-xs text-foreground font-bold">Pay online instantly</p>
          <p className="text-[11px] text-muted-foreground">
            Amount: <span className="font-black text-foreground">{formatMoney(amount, currency)}</span>
          </p>
          <button
            type="button"
            disabled={paystackLoading}
            onClick={() => void initiatePaystack()}
            className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 bg-emerald-700 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-black uppercase tracking-wide rounded-lg transition-colors"
          >
            <CreditCardIcon className="w-3.5 h-3.5" />
            {paystackLoading ? 'Loading…' : 'Pay via Paystack'}
          </button>
        </div>
      </div>
      <ProofUpload cycleId={billingCycleId} onUploaded={onComplete} />
    </div>
  );
}
