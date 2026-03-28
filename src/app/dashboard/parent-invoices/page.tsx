'use client';

import { useAuth } from '@/contexts/auth-context';
import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  BanknotesIcon, AcademicCapIcon, CheckCircleIcon,
  ClockIcon, ExclamationTriangleIcon, ArrowTopRightOnSquareIcon,
  PrinterIcon,
} from '@/lib/icons';

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
                        <span className="font-black">Important:</span> After making a bank transfer, send proof of payment to your school admin. Once approved, a receipt will be sent to your email and appear in your portal.
                      </p>
                    </div>
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
    const supabase = createClient();
    supabase
      .from('students')
      .select('id, full_name, user_id')
      .eq('parent_email', profile.email)
      .then(({ data }) => {
        setChildren((data ?? []) as Child[]);
        if (!selectedId && data && data.length > 0) setSelectedId(data[0].id);
        setLoadingChildren(false);
      });
  }, [profile]);

  useEffect(() => {
    if (!selectedId) return;
    const child = children.find(c => c.id === selectedId);
    setLoadingData(true);
    const supabase = createClient();

    const invoiceQuery = child?.user_id
      ? supabase.from('invoices').select('id, invoice_number, amount, currency, status, due_date, notes, payment_link, items, created_at').eq('portal_user_id', child.user_id).order('created_at', { ascending: false })
      : Promise.resolve({ data: [] });

    const paymentQuery = supabase
      .from('payments')
      .select('id, amount, payment_method, payment_status, transaction_reference, payment_date, notes')
      .eq('student_id', selectedId)
      .order('payment_date', { ascending: false })
      .limit(30);

    Promise.all([invoiceQuery, paymentQuery]).then(([invRes, payRes]) => {
      setInvoices((invRes as any).data ?? []);
      setPayments((payRes as any).data ?? []);
      setLoadingData(false);
    });
  }, [selectedId, children]);

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
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="bg-card border border-border rounded-none p-5 animate-pulse">
                  <div className="flex justify-between mb-3">
                    <div className="h-4 bg-muted rounded w-1/3" />
                    <div className="h-6 bg-muted rounded w-20" />
                  </div>
                  <div className="h-3 bg-muted rounded w-1/2" />
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

                        {/* Pay Button */}
                        {isPayable && (
                          <button onClick={() => setPayingInvoice(inv)}
                            className="mt-4 flex items-center justify-center gap-2 w-full px-4 py-3 bg-gradient-to-r from-orange-600 to-orange-500 text-white text-xs font-black uppercase tracking-widest hover:from-orange-500 hover:to-orange-400 transition-all">
                            <BanknotesIcon className="w-4 h-4" />
                            Pay {formatCurrency(inv.amount, inv.currency)}
                          </button>
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
