'use client';

import { useAuth } from '@/contexts/auth-context';
import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  BanknotesIcon, AcademicCapIcon, CheckCircleIcon,
  ClockIcon, ExclamationTriangleIcon, ArrowTopRightOnSquareIcon,
  PrinterIcon, ArrowUpTrayIcon, DocumentCheckIcon,
} from '@/lib/icons';
import { toast } from 'sonner';
import BillingStickyNotices from '@/components/billing/BillingStickyNotices';
import { NativeBillingNotice } from '@/components/billing/NativeBillingNotice';
import { useIsNativeApp } from '@/hooks/useIsNativeApp';
import { txPrimaryLabel } from '@/lib/finance/contact-link';

interface Child { id: string; full_name: string; user_id: string | null }
interface Invoice {
  id: string;
  invoice_number: string;
  amount: number;
  currency: string;
  status: string;
  due_date: string | null;
  notes: string | null;
  payment_link: string | null;
  items: { description: string; amount?: number; total?: number; unit_price?: number; qty?: number; quantity?: number }[];
  created_at: string;
}
interface Payment {
  id: string;
  amount: number;
  currency?: string | null;
  payment_method: string;
  payment_status: string;
  transaction_reference: string | null;
  description?: string;
  source?: string;
  payerName?: string | null;
  studentName?: string | null;
  paid_at?: string | null;
  created_at?: string | null;
  receipt_url?: string | null;
  invoice_id?: string | null;
}
interface BankAccount {
  id: string;
  label: string;
  bank_name: string;
  account_number: string;
  account_name: string;
  account_type: string;
  payment_note: string | null;
}

const STATUS_CONFIG: Record<string, { label: string; style: string; icon: any }> = {
  paid:    { label: 'Paid',    style: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400', icon: CheckCircleIcon },
  sent:    { label: 'Due',     style: 'bg-primary/10 border-primary/30 text-primary',              icon: ClockIcon },
  pending: { label: 'Pending', style: 'bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400',      icon: ClockIcon },
  partially_paid: { label: 'Part Paid', style: 'bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400', icon: ClockIcon },
  overdue: { label: 'Overdue', style: 'bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400',          icon: ExclamationTriangleIcon },
  draft:   { label: 'Draft',   style: 'bg-muted border-border text-muted-foreground',             icon: ClockIcon },
};

function invoiceItemAmount(item: Invoice['items'][number]) {
  const qty = Number(item.quantity ?? item.qty ?? 1) || 1;
  return Number(item.total ?? item.amount ?? (Number(item.unit_price ?? 0) * qty)) || 0;
}

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat('en-NG', { style: 'currency', currency: currency || 'NGN', minimumFractionDigits: 0 }).format(amount);
}

const GRADE_LEVELS = [
  'BASIC 1','BASIC 2','BASIC 3','BASIC 4','BASIC 5','BASIC 6',
  'JSS 1','JSS 2','JSS 3',
  'SS 1','SS 2','SS 3',
];

// ── Payment Evidence Form ─────────────────────────────────────
function PaymentEvidenceForm({ invoiceId, studentName }: { invoiceId: string; studentName?: string }) {
  const [submitted, setSubmitted]     = useState(false);
  const [submitting, setSubmitting]   = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [receiptNo, setReceiptNo]     = useState('');
  const [gradeLevel, setGradeLevel]   = useState('');
  const [method, setMethod]           = useState('bank_transfer');
  const [childName, setChildName]     = useState(studentName ?? '');
  const [paymentDate, setPaymentDate] = useState('');
  const [note, setNote]               = useState('');
  const [file, setFile]               = useState<File | null>(null);

  const handleSubmit = async () => {
    if (!receiptNo.trim()) { setError('Receipt / transaction number is required'); return; }
    if (!gradeLevel) { setError('Grade level is required'); return; }
    if (!paymentDate) { setError('Date of payment is required'); return; }
    setSubmitting(true); setError(null);
    try {
      // 1 — Submit text evidence (required)
      const res = await fetch(`/api/invoices/${invoiceId}/proofs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receipt_no: receiptNo.trim(),
          grade_level: gradeLevel,
          payment_method: method,
          child_name: childName.trim() || undefined,
          payment_date: paymentDate,
          note: note.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Submission failed');

      // 2 — Optional file upload (separate request)
      if (file) {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('note', `Receipt: ${receiptNo.trim()}`);
        const fileRes = await fetch(`/api/invoices/${invoiceId}/proofs`, { method: 'POST', body: fd });
        if (!fileRes.ok) {
          const fileJson = await fileRes.json().catch(() => ({}));
          throw new Error(fileJson.error || 'Text evidence was saved, but receipt file upload failed. Please retry the file upload.');
        }
      }

      setSubmitted(true);
      toast.success('Evidence submitted — admin/teacher will review and confirm your payment.');
    } catch (err: any) {
      setError(err.message ?? 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="flex items-center gap-2 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl mt-2">
        <DocumentCheckIcon className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
        <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-bold">Evidence submitted — admin/teacher will review and confirm your payment.</p>
      </div>
    );
  }

  const inp = 'w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary transition-colors';
  const lbl = 'block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1';

  return (
    <div className="space-y-3 mt-2 p-4 bg-white/[0.03] border border-white/10 rounded-xl">
      <p className="text-[10px] font-black uppercase tracking-widest text-primary">Submit Payment Evidence</p>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={lbl}>Child&apos;s Name</label>
          <input type="text" value={childName} onChange={e => setChildName(e.target.value)}
            placeholder="Full name" className={inp} />
        </div>
        <div>
          <label className={lbl}>Grade Level <span className="text-rose-600 dark:text-rose-400">*</span></label>
          <select value={gradeLevel} onChange={e => setGradeLevel(e.target.value)} className={inp}>
            <option value="">— Select grade —</option>
            {GRADE_LEVELS.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={lbl}>Receipt / Transaction No. <span className="text-rose-600 dark:text-rose-400">*</span></label>
          <input type="text" value={receiptNo} onChange={e => setReceiptNo(e.target.value)}
            placeholder="e.g. TRF-20240901" className={inp} />
        </div>
        <div>
          <label className={lbl}>Date of Payment <span className="text-rose-600 dark:text-rose-400">*</span></label>
          <input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} className={inp} />
        </div>
      </div>

      <div>
        <label className={lbl}>Payment Method</label>
        <select value={method} onChange={e => setMethod(e.target.value)} className={inp}>
          <option value="bank_transfer">Bank Transfer</option>
          <option value="cash">Cash</option>
          <option value="pos">POS / Card</option>
          <option value="mobile_money">Mobile Money</option>
          <option value="other">Other</option>
        </select>
      </div>

      <div>
        <label className={lbl}>Additional Note <span className="font-normal normal-case">(optional)</span></label>
        <input type="text" value={note} onChange={e => setNote(e.target.value)}
          placeholder="e.g. paid via GTBank on behalf of child" className={inp} />
      </div>

      <div>
        <label className={lbl}>Attach Receipt Screenshot / PDF <span className="font-normal normal-case">(optional)</span></label>
        <label className="flex items-center justify-center gap-2 w-full py-2.5 border border-dashed border-white/20 rounded-xl text-[10px] font-black uppercase tracking-widest cursor-pointer hover:border-primary/50 hover:bg-white/5 transition-all text-muted-foreground">
          <ArrowUpTrayIcon className="w-4 h-4" />
          {file ? file.name : 'Upload file (optional)'}
          <input type="file" accept="image/*,application/pdf" className="hidden"
            onChange={e => setFile(e.target.files?.[0] ?? null)} />
        </label>
      </div>

      {error && <p className="text-[10px] text-rose-600 dark:text-rose-400 font-bold">{error}</p>}

      <button onClick={handleSubmit} disabled={submitting}
        className="w-full py-2.5 bg-primary text-primary-foreground rounded-xl text-xs font-black uppercase tracking-widest hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2">
        {submitting && <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
        {submitting ? 'Submitting…' : 'Submit Payment Evidence'}
      </button>
    </div>
  );
}

function PayModal({
  invoice,
  onClose,
}: {
  invoice: Invoice;
  onClose: () => void;
}) {
  const isNativeApp = useIsNativeApp();
  const [loading, setLoading] = useState(false);
  const [paystackUrl, setPaystackUrl] = useState<string | null>(null);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [initiated, setInitiated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const initiate = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/payments/parent-pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoice_id: invoice.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to initiate payment');
      setPaystackUrl(data.paystackUrl ?? null);
      setBankAccounts(data.bankAccounts ?? []);
      setInitiated(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(id);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/35 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div>
            <p className="font-black text-foreground text-sm">{isNativeApp ? 'Invoice' : 'Pay Invoice'} #{invoice.invoice_number}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{formatCurrency(invoice.amount, invoice.currency)}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xl font-black">✕</button>
        </div>

        <div className="p-5 space-y-5">
          {/* Info banner */}
          <div className="p-3 bg-primary/5 border border-primary/20 rounded-xl">
            <p className="text-[11px] text-primary leading-relaxed">
              <span className="font-black">{isNativeApp ? 'Receipt updates:' : 'Auto-receipt:'}</span> {isNativeApp ? 'Confirmed receipts and billing updates appear here and are sent to your account email.' : 'A receipt will be automatically generated and sent to you once your payment is confirmed — whether via Paystack or bank transfer (after admin approval).'}
            </p>
          </div>

          {isNativeApp ? (
            <NativeBillingNotice />
          ) : !initiated ? (
            <>
              {error && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl">
                  <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>
                </div>
              )}
              <button onClick={initiate} disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-primary to-primary text-primary-foreground text-xs font-black uppercase tracking-widest hover:from-primary hover:to-primary transition-all disabled:opacity-50">
                {loading ? (
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <BanknotesIcon className="w-4 h-4" />
                )}
                {loading ? 'Preparing payment...' : 'View Payment Options'}
              </button>
            </>
          ) : (
            <div className="space-y-4">
              {/* Paystack Option */}
              {paystackUrl && (
                <div className="border border-primary/30 rounded-xl overflow-hidden">
                  <div className="bg-primary/10 px-4 py-2.5 flex items-center gap-2">
                    <BanknotesIcon className="w-4 h-4 text-primary" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-brand-red-600">Pay Online with Paystack</span>
                  </div>
                  <div className="p-4">
                    <p className="text-xs text-muted-foreground mb-3">
                      Pay securely with card, bank transfer, or USSD via Paystack. You will be redirected to a secure payment page.
                    </p>
                    <a href={paystackUrl} target="_blank" rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 w-full py-3 bg-gradient-to-r from-primary to-primary text-primary-foreground text-xs font-black uppercase tracking-widest hover:from-primary hover:to-primary transition-all">
                      Pay {formatCurrency(invoice.amount, invoice.currency)} via Paystack
                      <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>
              )}

              {/* Divider */}
              {paystackUrl && bankAccounts.length > 0 && (
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">OR</span>
                  <div className="flex-1 h-px bg-border" />
                </div>
              )}

              {/* Bank Transfer Option */}
              {bankAccounts.length > 0 && (
                <div className="border border-border rounded-xl overflow-hidden">
                  <div className="bg-muted px-4 py-2.5 flex items-center gap-2">
                    <PrinterIcon className="w-4 h-4 text-muted-foreground" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Pay via Bank Transfer</span>
                  </div>
                  <div className="p-4 space-y-3">
                    <p className="text-xs text-muted-foreground">
                      Transfer the exact amount to one of the accounts below. Use your child's name as the reference. Admin will confirm and your receipt will be issued automatically.
                    </p>
                    {bankAccounts.map(acc => (
                      <div key={acc.id} className="bg-muted border border-border rounded-xl p-4 space-y-2">
                        <p className="text-[10px] font-black uppercase tracking-widest text-brand-red-600">{acc.label}</p>
                        <div className="space-y-1.5">
                          {[
                            { label: 'Bank', value: acc.bank_name },
                            { label: 'Account Name', value: acc.account_name },
                            { label: 'Account Number', value: acc.account_number },
                            { label: 'Account Type', value: acc.account_type },
                          ].map(({ label, value }) => (
                            <div key={label} className="flex items-center justify-between gap-3">
                              <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold shrink-0">{label}</span>
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-black text-foreground">{value}</span>
                                {(label === 'Account Number' || label === 'Account Name') && (
                                  <button onClick={() => copyToClipboard(value, `${acc.id}-${label}`)}
                                    className="text-[9px] font-black uppercase tracking-wider text-primary hover:text-primary px-1.5 py-0.5 border border-primary/30 rounded-xl">
                                    {copied === `${acc.id}-${label}` ? '✓' : 'Copy'}
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                        {acc.payment_note && (
                          <p className="text-[10px] text-amber-600 dark:text-amber-400 italic mt-1">{acc.payment_note}</p>
                        )}
                      </div>
                    ))}

                    <div className="p-3 bg-amber-500/5 border border-amber-500/20 rounded-xl">
                      <p className="text-[10px] text-amber-600 dark:text-amber-400 leading-relaxed">
                        <span className="font-black">Important:</span> After paying, submit your payment evidence below. Include your receipt number, grade level, and date of payment. Admin/teacher will confirm and your receipt will be issued automatically.
                      </p>
                    </div>

                    {/* Payment Evidence Form */}
                    <PaymentEvidenceForm invoiceId={invoice.id} />
                  </div>
                </div>
              )}

              {/* No options */}
              {!paystackUrl && bankAccounts.length === 0 && (
                <div className="p-4 bg-muted border border-border rounded-xl text-center">
                  <p className="text-xs text-muted-foreground">No payment options configured. Contact the school admin for payment details.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ParentInvoicesContent() {
  const { profile } = useAuth();
  const isNativeApp = useIsNativeApp();
  const searchParams = useSearchParams();
  const studentParam = searchParams.get('student');
  const paymentParam = searchParams.get('payment');
  const invoiceParam = searchParams.get('invoice');

  const [children, setChildren] = useState<Child[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(studentParam);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loadingChildren, setLoadingChildren] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [activeTab, setActiveTab] = useState<'invoices' | 'payments'>('invoices');
  const [payingInvoice, setPayingInvoice] = useState<Invoice | null>(null);
  const [showPaymentBanner, setShowPaymentBanner] = useState(paymentParam === 'success' || paymentParam === 'cancelled');
  const [busyReceipt, setBusyReceipt] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    setLoadingChildren(true);
    fetch('/api/parents/portal?section=children')
      .then(res => res.json())
      .then(data => {
        if (!data.success) throw new Error(data.error || 'Failed to load children');
        const list = (data.children ?? []) as Child[];
        setChildren(list);
        if (!selectedId && list.length > 0) setSelectedId(list[0].id);
        setLoadingChildren(false);
      })
      .catch(err => {
        toast.error('Could not load student list. Please try again.');
        console.error('Failed to load children:', err);
        setLoadingChildren(false);
      });
  }, [profile]);

  useEffect(() => {
    if (!selectedId) return;
    setLoadingData(true);
    fetch(`/api/parents/portal?section=invoices&child_id=${selectedId}`)
      .then(res => res.json())
      .then(data => {
        if (!data.success) throw new Error(data.error || 'Failed to load invoices');
        setInvoices((data.invoices ?? []) as Invoice[]);
        setPayments((data.payments ?? []) as Payment[]);
        if (invoiceParam && (data.invoices ?? []).some((inv: Invoice) => inv.id === invoiceParam)) {
          setActiveTab('invoices');
        }
        setLoadingData(false);
      })
      .catch(err => {
        toast.error('Could not load billing data for this student.');
        console.error('Failed to load invoice data:', err);
        setLoadingData(false);
      });
  }, [selectedId]);

  if (profile?.role !== 'parent') {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground text-sm">Access restricted to parent accounts.</p>
      </div>
    );
  }

  const selectedChild = children.find(c => c.id === selectedId);
  const totalOwed = invoices
    .filter(i => !['paid', 'cancelled', 'draft'].includes((i.status || '').toLowerCase()))
    .reduce((s, i) => s + i.amount, 0);
  const totalPaid = payments.filter(p => p.payment_status === 'completed').reduce((s, p) => s + p.amount, 0);

  const openReceipt = async (transactionId: string) => {
    setBusyReceipt(transactionId);
    try {
      const res = await fetch(`/api/payments/receipt/${transactionId}`, { method: 'POST' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Could not open receipt');
      if (json.url) window.open(json.url, '_blank', 'noopener,noreferrer');
    } catch (e: unknown) {
      toast.error((e as Error).message || 'Could not open receipt');
    } finally {
      setBusyReceipt(null);
    }
  };

  return (
    <div className="space-y-6">
      <BillingStickyNotices />

      {/* Payment callback banner */}
      {showPaymentBanner && (
        <div className={`flex items-start justify-between gap-4 p-4 rounded-xl ${
          paymentParam === 'cancelled'
            ? 'bg-amber-500/10 border border-amber-500/30'
            : 'bg-emerald-500/10 border border-emerald-500/30'
        }`}>
          <div className="flex items-center gap-3">
            {paymentParam === 'cancelled' ? (
              <ExclamationTriangleIcon className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
            ) : (
              <CheckCircleIcon className="w-5 h-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
            )}
            <p className={`text-sm font-bold ${paymentParam === 'cancelled' ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
              {paymentParam === 'cancelled'
                ? 'Payment was cancelled. No receipt will be issued until payment is completed.'
                : 'Payment initiated! Your receipt will be automatically generated and sent once confirmed.'}
            </p>
          </div>
          <button onClick={() => setShowPaymentBanner(false)} className={`font-black text-sm shrink-0 ${paymentParam === 'cancelled' ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>✕</button>
        </div>
      )}

      <div>
        <h1 className="text-2xl font-black text-foreground tracking-tight">Invoices &amp; Payments</h1>
        <p className="text-sm text-muted-foreground mt-1">{isNativeApp ? 'Fee invoices, receipts and payment history.' : 'Fee invoices and payment history. Pay online or via bank transfer.'}</p>
      </div>

      {/* Child Selector */}
      {!loadingChildren && children.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {children.map(child => (
            <button key={child.id}
              onClick={() => setSelectedId(child.id)}
              className={`px-4 py-2 text-xs font-black uppercase tracking-widest border rounded-xl transition-all ${
                selectedId === child.id
                  ? 'bg-primary border-primary text-white'
                  : 'bg-card border-border text-muted-foreground hover:border-primary/50'
              }`}>
              {child.full_name}
            </button>
          ))}
        </div>
      )}

      {!loadingChildren && children.length === 0 && (
        <div className="bg-card border border-border rounded-xl p-10 text-center">
          <AcademicCapIcon className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm font-black text-foreground uppercase tracking-wider">No children linked</p>
        </div>
      )}

      {selectedChild && (
        <div className="space-y-4">
          {/* Summary Cards */}
          {!loadingData && (
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-card border border-border rounded-xl p-4 relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-rose-600 to-rose-400 opacity-[0.04]" />
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1 relative z-10">Outstanding</p>
                <p className="text-2xl font-black text-rose-600 dark:text-rose-400 relative z-10">{formatCurrency(totalOwed, invoices[0]?.currency ?? 'NGN')}</p>
              </div>
              <div className="bg-card border border-border rounded-xl p-4 relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-emerald-600 to-emerald-400 opacity-[0.04]" />
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1 relative z-10">Total Paid</p>
                <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400 relative z-10">{formatCurrency(totalPaid, 'NGN')}</p>
              </div>
            </div>
          )}

          {/* Tabs */}
          <div className="flex border-b border-border">
            {(['invoices', 'payments'] as const).map(tab => (
              <button key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-5 py-2.5 text-[10px] font-black uppercase tracking-widest border-b-2 transition-all ${
                  activeTab === tab
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}>
                {tab === 'invoices' ? `Invoices (${invoices.length})` : `Payments (${payments.length})`}
              </button>
            ))}
          </div>

          {/* Loading */}
          {loadingData && (
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="bg-card border border-border p-6 relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full animate-[shimmer_2s_infinite]" />
                  <div className="flex justify-between items-start">
                    <div className="space-y-2 flex-1">
                      <div className="h-4 bg-muted rounded w-1/4 animate-pulse" />
                      <div className="h-3 bg-muted rounded w-1/2 animate-pulse opacity-50" />
                    </div>
                    <div className="h-8 w-20 bg-muted rounded animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Invoices Tab */}
          {!loadingData && activeTab === 'invoices' && (
            <>
              {invoices.length === 0 ? (
                <div className="bg-card border border-border rounded-xl p-8 text-center">
                  <BanknotesIcon className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm font-black text-foreground uppercase tracking-wider">No invoices yet</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {invoices.map(inv => {
                    const cfg = STATUS_CONFIG[inv.status] ?? STATUS_CONFIG.pending;
                    const StatusIcon = cfg.icon;
                    const isPayable = ['pending', 'sent', 'overdue', 'partially_paid'].includes(inv.status);
                    return (
                      <div key={inv.id} className={`bg-card border rounded-xl p-5 hover:bg-white/5 transition-all ${
                        invoiceParam === inv.id ? 'border-primary ring-2 ring-primary/20' : 'border-border'
                      }`}>
                        {/* Header */}
                        <div className="flex items-start justify-between gap-4 mb-3">
                          <div>
                            <p className="font-black text-foreground text-sm">Invoice #{inv.invoice_number}</p>
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              {new Date(inv.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                              {inv.due_date && ` · Due ${new Date(inv.due_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`}
                            </p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-xl font-black text-foreground">{formatCurrency(inv.amount, inv.currency)}</p>
                            <span className={`inline-flex items-center gap-1 mt-1 text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border ${cfg.style}`}>
                              <StatusIcon className="w-3 h-3" />
                              {cfg.label}
                            </span>
                          </div>
                        </div>

                        {/* Line items */}
                        {Array.isArray(inv.items) && inv.items.length > 0 && (
                          <div className="mt-3 bg-muted border border-border rounded-xl overflow-hidden">
                            <div className="divide-y divide-border">
                              {inv.items.map((item, i) => (
                                <div key={i} className="flex items-center justify-between px-4 py-2.5">
                                  <span className="text-xs text-foreground">{item.description}{Number(item.quantity ?? item.qty ?? 1) > 1 ? ` × ${item.quantity ?? item.qty}` : ''}</span>
                                  <span className="text-xs font-black text-foreground">{formatCurrency(invoiceItemAmount(item), inv.currency)}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {inv.notes && <p className="mt-2 text-[11px] text-muted-foreground italic">{inv.notes}</p>}

                        {/* Pay + WhatsApp Reminder */}
                        {isPayable && (
                          <div className="mt-4 flex flex-col sm:flex-row gap-2">
                            <button onClick={() => setPayingInvoice(inv)}
                              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-primary to-primary text-white text-xs font-black uppercase tracking-widest hover:from-primary hover:to-primary transition-all">
                              <BanknotesIcon className="w-4 h-4" />
                              Pay {formatCurrency(inv.amount, inv.currency)}
                            </button>
                            <a
                              href={`https://wa.me/?text=${encodeURIComponent(
                                `Hello, I'd like to make payment for Invoice #${inv.invoice_number} — Amount: ${formatCurrency(inv.amount, inv.currency)}${inv.due_date ? `, Due: ${new Date(inv.due_date).toLocaleDateString('en-GB')}` : ''}. Please advise on payment arrangements. Thank you.`
                              )}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center justify-center gap-2 px-4 py-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs font-black uppercase tracking-widest hover:bg-emerald-500/20 transition-all"
                            >
                              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.139.565 4.143 1.548 5.877L.057 23.43a.75.75 0 0 0 .928.928l5.554-1.49A11.95 11.95 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22.5a10.45 10.45 0 0 1-5.348-1.467l-.383-.228-3.975 1.066 1.067-3.894-.25-.4A10.451 10.451 0 0 1 1.5 12C1.5 6.201 6.201 1.5 12 1.5S22.5 6.201 22.5 12 17.799 22.5 12 22.5z"/></svg>
                              WhatsApp Admin
                            </a>
                          </div>
                        )}

                        {inv.status === 'paid' && (
                          <div className="mt-3 flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                            <CheckCircleIcon className="w-4 h-4" />
                            <span className="text-[11px] font-black uppercase tracking-widest">Paid — Receipt auto-issued</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* Payments Tab */}
          {!loadingData && activeTab === 'payments' && (
            <>
              {payments.length === 0 ? (
                <div className="bg-card border border-border rounded-xl p-8 text-center">
                  <CheckCircleIcon className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm font-black text-foreground uppercase tracking-wider">No payment records</p>
                </div>
              ) : (
                <div className="overflow-hidden rounded-xl border border-border bg-card">
                  {/* Desktop table header */}
                  <div className="hidden grid-cols-5 gap-4 border-b border-border bg-muted px-5 py-2.5 sm:grid">
                    <span className="col-span-2 text-[11px] font-black uppercase tracking-widest text-muted-foreground">Payment</span>
                    <span className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">Amount</span>
                    <span className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">Status</span>
                    <span className="text-right text-[11px] font-black uppercase tracking-widest text-muted-foreground">Receipt</span>
                  </div>
                  <div className="divide-y divide-border">
                    {payments.map(pay => {
                      const dateLabel = (pay.paid_at || pay.created_at)
                        ? (() => {
                            try {
                              const d = new Date(pay.paid_at || pay.created_at || Date.now());
                              return Number.isNaN(d.getTime())
                                ? '—'
                                : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });
                            } catch {
                              return '—';
                            }
                          })()
                        : '—';
                      const statusClass =
                        pay.payment_status === 'completed'
                          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                          : pay.payment_status === 'pending'
                            ? 'bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400'
                            : 'bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400';
                      return (
                        <div key={pay.id}>
                          {/* Mobile stacked card */}
                          <div className="space-y-2.5 p-4 sm:hidden">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-bold text-foreground">{txPrimaryLabel(pay)}</p>
                                <p className="mt-0.5 text-xs text-muted-foreground">
                                  {dateLabel} · {pay.payment_method.replace(/_/g, ' ')}
                                </p>
                              </div>
                              <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-black uppercase tracking-wider ${statusClass}`}>
                                {pay.payment_status}
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-sm font-black text-foreground">{formatCurrency(pay.amount, pay.currency || 'NGN')}</span>
                              {pay.payment_status === 'completed' ? (
                                <button
                                  type="button"
                                  onClick={() => openReceipt(pay.id)}
                                  disabled={busyReceipt === pay.id}
                                  className="inline-flex min-h-10 items-center justify-center gap-1 rounded-md border border-primary/25 bg-primary/10 px-3 py-2 text-[11px] font-black uppercase tracking-wider text-primary hover:bg-primary/20 disabled:opacity-50"
                                >
                                  {busyReceipt === pay.id ? 'Opening' : 'Receipt'}
                                </button>
                              ) : (
                                <span className="text-xs text-muted-foreground">No receipt yet</span>
                              )}
                            </div>
                          </div>
                          {/* Desktop row */}
                          <div className="hidden grid-cols-5 items-center gap-4 px-5 py-3 transition-all hover:bg-white/5 sm:grid">
                            <div className="col-span-2 min-w-0">
                              <p className="truncate text-xs font-bold text-foreground">{txPrimaryLabel(pay)}</p>
                              <p className="mt-0.5 text-[11px] text-muted-foreground">
                                {dateLabel} · {pay.payment_method.replace(/_/g, ' ')}
                              </p>
                            </div>
                            <span className="text-xs font-black text-foreground">{formatCurrency(pay.amount, pay.currency || 'NGN')}</span>
                            <span>
                              <span className={`rounded-full border px-2 py-0.5 text-[11px] font-black uppercase tracking-wider ${statusClass}`}>
                                {pay.payment_status}
                              </span>
                            </span>
                            <span className="text-right">
                              {pay.payment_status === 'completed' ? (
                                <button
                                  type="button"
                                  onClick={() => openReceipt(pay.id)}
                                  disabled={busyReceipt === pay.id}
                                  className="inline-flex items-center justify-center gap-1 rounded-md border border-primary/25 bg-primary/10 px-2.5 py-1.5 text-[11px] font-black uppercase tracking-wider text-primary hover:bg-primary/20 disabled:opacity-50"
                                >
                                  {busyReceipt === pay.id ? 'Opening' : 'Receipt'}
                                </button>
                              ) : (
                                <span className="text-[11px] text-muted-foreground">—</span>
                              )}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Pay Modal */}
      {payingInvoice && (
        <PayModal invoice={payingInvoice} onClose={() => setPayingInvoice(null)} />
      )}
    </div>
  );
}

export default function ParentInvoicesPage() {
  return (
    <Suspense fallback={<div className="animate-pulse h-64 bg-card border border-border rounded-xl" />}>
      <ParentInvoicesContent />
    </Suspense>
  );
}
