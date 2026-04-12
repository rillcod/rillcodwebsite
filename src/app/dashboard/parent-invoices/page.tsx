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
  items: { description: string; amount: number; qty?: number }[];
  created_at: string;
}
interface Payment {
  id: string;
  amount: number;
  payment_method: string;
  payment_status: string;
  transaction_reference: string | null;
  payment_date: string | null;
  notes: string | null;
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
  paid:    { label: 'Paid',    style: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400', icon: CheckCircleIcon },
  pending: { label: 'Pending', style: 'bg-amber-500/10 border-amber-500/30 text-amber-400',      icon: ClockIcon },
  overdue: { label: 'Overdue', style: 'bg-rose-500/10 border-rose-500/30 text-rose-400',          icon: ExclamationTriangleIcon },
  draft:   { label: 'Draft',   style: 'bg-muted border-border text-muted-foreground',             icon: ClockIcon },
};

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat('en-NG', { style: 'currency', currency: currency || 'NGN', minimumFractionDigits: 0 }).format(amount);
}

// ── Proof Upload Component ────────────────────────────────────
function ProofUpload({ invoiceId }: { invoiceId: string }) {
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      if (note) fd.append('note', note);
      const res = await fetch(`/api/invoices/${invoiceId}/proofs`, { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Upload failed');
      setUploaded(true);
      toast.success('Proof uploaded! Admin will review and confirm your payment.');
    } catch (err: any) {
      setError(err.message ?? 'Upload failed');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  if (uploaded) {
    return (
      <div className="flex items-center gap-2 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-none">
        <DocumentCheckIcon className="w-4 h-4 text-emerald-400 flex-shrink-0" />
        <p className="text-[11px] text-emerald-400 font-bold">Proof submitted — admin will review and confirm.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2 mt-2">
      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Upload Payment Proof</p>
      <input
        type="text"
        placeholder="Optional note (e.g. paid on 12 Apr, used child's name as ref)"
        value={note}
        onChange={e => setNote(e.target.value)}
        className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-none text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:border-orange-500 transition-colors"
      />
      <label className={`flex items-center justify-center gap-2 w-full py-3 border rounded-none text-xs font-black uppercase tracking-widest cursor-pointer transition-all ${uploading ? 'opacity-50 cursor-not-allowed bg-muted border-border text-muted-foreground' : 'bg-white/5 border-white/20 text-foreground hover:bg-white/10 hover:border-orange-500/50'}`}>
        {uploading
          ? <><span className="w-4 h-4 border-2 border-muted-foreground border-t-transparent rounded-full animate-spin" /> Uploading…</>
          : <><ArrowUpTrayIcon className="w-4 h-4" /> Upload Screenshot / PDF</>
        }
        <input type="file" accept="image/*,application/pdf" className="hidden" disabled={uploading} onChange={handleUpload} />
      </label>
      {error && <p className="text-[10px] text-rose-400">{error}</p>}
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-none w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div>
            <p className="font-black text-foreground text-sm">Pay Invoice #{invoice.invoice_number}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{formatCurrency(invoice.amount, invoice.currency)}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xl font-black">✕</button>
        </div>

        <div className="p-5 space-y-5">
          {/* Info banner */}
          <div className="p-3 bg-blue-500/5 border border-blue-500/20 rounded-none">
            <p className="text-[11px] text-blue-400 leading-relaxed">
              <span className="font-black">Auto-receipt:</span> A receipt will be automatically generated and sent to you once your payment is confirmed — whether via Paystack or bank transfer (after admin approval).
            </p>
          </div>

          {!initiated ? (
            <>
              {error && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-none">
                  <p className="text-xs text-rose-400">{error}</p>
                </div>
              )}
              <button onClick={initiate} disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-orange-600 to-orange-500 text-white text-xs font-black uppercase tracking-widest hover:from-orange-500 hover:to-orange-400 transition-all disabled:opacity-50">
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
                <div className="border border-orange-500/30 rounded-none overflow-hidden">
                  <div className="bg-orange-500/10 px-4 py-2.5 flex items-center gap-2">
                    <BanknotesIcon className="w-4 h-4 text-orange-500" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-orange-500">Pay Online with Paystack</span>
                  </div>
                  <div className="p-4">
                    <p className="text-xs text-muted-foreground mb-3">
                      Pay securely with card, bank transfer, or USSD via Paystack. You will be redirected to a secure payment page.
                    </p>
                    <a href={paystackUrl} target="_blank" rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 w-full py-3 bg-gradient-to-r from-orange-600 to-orange-500 text-white text-xs font-black uppercase tracking-widest hover:from-orange-500 hover:to-orange-400 transition-all">
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
                <div className="border border-border rounded-none overflow-hidden">
                  <div className="bg-muted px-4 py-2.5 flex items-center gap-2">
                    <PrinterIcon className="w-4 h-4 text-muted-foreground" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Pay via Bank Transfer</span>
                  </div>
                  <div className="p-4 space-y-3">
                    <p className="text-xs text-muted-foreground">
                      Transfer the exact amount to one of the accounts below. Use your child's name as the reference. Admin will confirm and your receipt will be issued automatically.
                    </p>
                    {bankAccounts.map(acc => (
                      <div key={acc.id} className="bg-muted border border-border rounded-none p-4 space-y-2">
                        <p className="text-[10px] font-black uppercase tracking-widest text-orange-500">{acc.label}</p>
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
                                    className="text-[9px] font-black uppercase tracking-wider text-orange-500 hover:text-orange-400 px-1.5 py-0.5 border border-orange-500/30 rounded-none">
                                    {copied === `${acc.id}-${label}` ? '✓' : 'Copy'}
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                        {acc.payment_note && (
                          <p className="text-[10px] text-amber-400 italic mt-1">{acc.payment_note}</p>
                        )}
                      </div>
                    ))}

                    <div className="p-3 bg-amber-500/5 border border-amber-500/20 rounded-none">
                      <p className="text-[10px] text-amber-400 leading-relaxed">
                        <span className="font-black">Important:</span> After making a bank transfer, upload your proof of payment below. Admin will confirm and your receipt will be issued automatically.
                      </p>
                    </div>

                    {/* Proof Upload */}
                    <ProofUpload invoiceId={invoice.id} />
                  </div>
                </div>
              )}

              {/* No options */}
              {!paystackUrl && bankAccounts.length === 0 && (
                <div className="p-4 bg-muted border border-border rounded-none text-center">
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
  const searchParams = useSearchParams();
  const studentParam = searchParams.get('student');
  const paidParam = searchParams.get('paid');

  const [children, setChildren] = useState<Child[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(studentParam);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loadingChildren, setLoadingChildren] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [activeTab, setActiveTab] = useState<'invoices' | 'payments'>('invoices');
  const [payingInvoice, setPayingInvoice] = useState<Invoice | null>(null);
  const [showPaidBanner, setShowPaidBanner] = useState(!!paidParam);

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
  const totalOwed = invoices.filter(i => i.status === 'pending' || i.status === 'overdue').reduce((s, i) => s + i.amount, 0);
  const totalPaid = payments.filter(p => p.payment_status === 'completed').reduce((s, p) => s + p.amount, 0);

  return (
    <div className="space-y-6">
      {/* Payment success banner */}
      {showPaidBanner && (
        <div className="flex items-start justify-between gap-4 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-none">
          <div className="flex items-center gap-3">
            <CheckCircleIcon className="w-5 h-5 text-emerald-400 flex-shrink-0" />
            <p className="text-sm text-emerald-400 font-bold">
              Payment initiated! Your receipt will be automatically generated and sent once confirmed.
            </p>
          </div>
          <button onClick={() => setShowPaidBanner(false)} className="text-emerald-400 font-black text-sm shrink-0">✕</button>
        </div>
      )}

      <div>
        <h1 className="text-2xl font-black text-foreground tracking-tight">Invoices &amp; Payments</h1>
        <p className="text-sm text-muted-foreground mt-1">Fee invoices and payment history. Pay online or via bank transfer.</p>
      </div>

      {/* Child Selector */}
      {!loadingChildren && children.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {children.map(child => (
            <button key={child.id}
              onClick={() => setSelectedId(child.id)}
              className={`px-4 py-2 text-xs font-black uppercase tracking-widest border rounded-none transition-all ${
                selectedId === child.id
                  ? 'bg-orange-600 border-orange-600 text-white'
                  : 'bg-card border-border text-muted-foreground hover:border-orange-500/50'
              }`}>
              {child.full_name}
            </button>
          ))}
        </div>
      )}

      {!loadingChildren && children.length === 0 && (
        <div className="bg-card border border-border rounded-none p-10 text-center">
          <AcademicCapIcon className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm font-black text-foreground uppercase tracking-wider">No children linked</p>
        </div>
      )}

      {selectedChild && (
        <div className="space-y-4">
          {/* Summary Cards */}
          {!loadingData && (
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-card border border-border rounded-none p-4 relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-rose-600 to-rose-400 opacity-[0.04]" />
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1 relative z-10">Outstanding</p>
                <p className="text-2xl font-black text-rose-400 relative z-10">{formatCurrency(totalOwed, invoices[0]?.currency ?? 'NGN')}</p>
              </div>
              <div className="bg-card border border-border rounded-none p-4 relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-emerald-600 to-emerald-400 opacity-[0.04]" />
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1 relative z-10">Total Paid</p>
                <p className="text-2xl font-black text-emerald-400 relative z-10">{formatCurrency(totalPaid, 'NGN')}</p>
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
                    ? 'border-orange-500 text-orange-500'
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
                <div className="bg-card border border-border rounded-none p-8 text-center">
                  <BanknotesIcon className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm font-black text-foreground uppercase tracking-wider">No invoices yet</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {invoices.map(inv => {
                    const cfg = STATUS_CONFIG[inv.status] ?? STATUS_CONFIG.pending;
                    const StatusIcon = cfg.icon;
                    const isPayable = inv.status === 'pending' || inv.status === 'overdue';
                    return (
                      <div key={inv.id} className="bg-card border border-border rounded-none p-5 hover:bg-white/5 transition-all">
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
                          <div className="mt-3 bg-muted border border-border rounded-none overflow-hidden">
                            <div className="divide-y divide-border">
                              {inv.items.map((item, i) => (
                                <div key={i} className="flex items-center justify-between px-4 py-2.5">
                                  <span className="text-xs text-foreground">{item.description}{item.qty && item.qty > 1 ? ` × ${item.qty}` : ''}</span>
                                  <span className="text-xs font-black text-foreground">{formatCurrency(item.amount, inv.currency)}</span>
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
                              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-orange-600 to-orange-500 text-white text-xs font-black uppercase tracking-widest hover:from-orange-500 hover:to-orange-400 transition-all">
                              <BanknotesIcon className="w-4 h-4" />
                              Pay {formatCurrency(inv.amount, inv.currency)}
                            </button>
                            <a
                              href={`https://wa.me/?text=${encodeURIComponent(
                                `Hello, I'd like to make payment for Invoice #${inv.invoice_number} — Amount: ${formatCurrency(inv.amount, inv.currency)}${inv.due_date ? `, Due: ${new Date(inv.due_date).toLocaleDateString('en-GB')}` : ''}. Please advise on payment arrangements. Thank you.`
                              )}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center justify-center gap-2 px-4 py-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-black uppercase tracking-widest hover:bg-emerald-500/20 transition-all"
                            >
                              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.139.565 4.143 1.548 5.877L.057 23.43a.75.75 0 0 0 .928.928l5.554-1.49A11.95 11.95 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22.5a10.45 10.45 0 0 1-5.348-1.467l-.383-.228-3.975 1.066 1.067-3.894-.25-.4A10.451 10.451 0 0 1 1.5 12C1.5 6.201 6.201 1.5 12 1.5S22.5 6.201 22.5 12 17.799 22.5 12 22.5z"/></svg>
                              WhatsApp Admin
                            </a>
                          </div>
                        )}

                        {inv.status === 'paid' && (
                          <div className="mt-3 flex items-center gap-2 text-emerald-400">
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
                <div className="bg-card border border-border rounded-none p-8 text-center">
                  <CheckCircleIcon className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm font-black text-foreground uppercase tracking-wider">No payment records</p>
                </div>
              ) : (
                <div className="bg-card border border-border rounded-none overflow-hidden">
                  <div className="grid grid-cols-4 gap-4 px-5 py-2.5 border-b border-border bg-muted">
                    <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Date</span>
                    <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Amount</span>
                    <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Method</span>
                    <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Status</span>
                  </div>
                  <div className="divide-y divide-border">
                    {payments.map(pay => (
                      <div key={pay.id} className="grid grid-cols-4 gap-4 px-5 py-3 hover:bg-white/5 transition-all">
                        <span className="text-xs text-foreground">
                          {pay.payment_date ? new Date(pay.payment_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }) : '—'}
                        </span>
                        <span className="text-xs font-black text-foreground">{formatCurrency(pay.amount, 'NGN')}</span>
                        <span className="text-xs text-muted-foreground capitalize">{pay.payment_method.replace('_', ' ')}</span>
                        <span>
                          <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border ${
                            pay.payment_status === 'completed'
                              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                              : pay.payment_status === 'pending'
                                ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                                : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                          }`}>
                            {pay.payment_status}
                          </span>
                        </span>
                      </div>
                    ))}
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
    <Suspense fallback={<div className="animate-pulse h-64 bg-card border border-border rounded-none" />}>
      <ParentInvoicesContent />
    </Suspense>
  );
}
