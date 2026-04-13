// @refresh reset
'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import {
  BanknotesIcon, CheckCircleIcon, ClockIcon, ExclamationTriangleIcon,
  ArrowDownTrayIcon, ArrowUpTrayIcon, ArrowTopRightOnSquareIcon,
  DocumentTextIcon, PaperClipIcon, InformationCircleIcon,
  CreditCardIcon, ReceiptPercentIcon,
} from '@/lib/icons';
import { toast } from 'sonner';

interface Invoice {
  id: string;
  invoice_number: string;
  amount: number;
  currency: string;
  status: string;
  due_date: string | null;
  notes: string | null;
  payment_link: string | null;
  items: { description: string; unit_price: number; quantity?: number }[];
  created_at: string;
  reminder_1_sent_at?: string | null;
}

interface PaymentTx {
  id: string;
  amount: number;
  currency: string;
  payment_method: string;
  payment_status: string;
  transaction_reference: string | null;
  paid_at: string | null;
  created_at: string;
}

interface BankAccount {
  id: string;
  label: string;
  bank_name: string;
  account_number: string;
  account_name: string;
  payment_note: string | null;
}

const STATUS: Record<string, { label: string; cls: string; icon: any }> = {
  paid:      { label: 'Paid',      cls: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400', icon: CheckCircleIcon },
  sent:      { label: 'Due',       cls: 'bg-blue-500/10 border-blue-500/30 text-blue-400',          icon: ClockIcon },
  overdue:   { label: 'Overdue',   cls: 'bg-rose-500/10 border-rose-500/30 text-rose-400',          icon: ExclamationTriangleIcon },
  draft:     { label: 'Pending',   cls: 'bg-amber-500/10 border-amber-500/30 text-amber-400',       icon: ClockIcon },
  cancelled: { label: 'Cancelled', cls: 'bg-muted border-border text-muted-foreground',             icon: ClockIcon },
};

function ProofUpload({ invoiceId, onUploaded }: { invoiceId: string; onUploaded: () => void }) {
  const [uploading, setUploading] = useState(false);
  const [note, setNote] = useState('');
  const [open, setOpen] = useState(false);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append('file', file);
    fd.append('note', note);
    const res = await fetch(`/api/invoices/${invoiceId}/proofs`, { method: 'POST', body: fd });
    setUploading(false);
    if (res.ok) {
      toast.success('Payment proof uploaded! We will verify within 24 hours.');
      setOpen(false);
      setNote('');
      onUploaded();
    } else {
      const j = await res.json();
      toast.error(j.error ?? 'Upload failed');
    }
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/20 text-orange-400 rounded-lg transition-all">
        <ArrowUpTrayIcon className="w-3.5 h-3.5" /> Upload Proof
      </button>
    );
  }

  return (
    <div className="mt-3 bg-card border border-white/[0.08] rounded-xl p-4 space-y-3">
      <p className="text-xs font-bold text-card-foreground/60 uppercase tracking-wider">Upload Payment Evidence</p>
      <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
        placeholder="Optional: add your bank reference, transfer note, or any message for the admin…"
        className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-card-foreground placeholder-card-foreground/30 focus:outline-none focus:border-orange-500/50 resize-none" />
      <div className="flex items-center gap-2">
        <label className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold cursor-pointer transition-all ${uploading ? 'bg-white/5 text-card-foreground/40' : 'bg-orange-500 hover:bg-orange-400 text-white'}`}>
          <PaperClipIcon className="w-4 h-4" />
          {uploading ? 'Uploading…' : 'Choose File'}
          <input type="file" accept="image/*,.pdf" onChange={handleFile} disabled={uploading} className="hidden" />
        </label>
        <button onClick={() => setOpen(false)} className="px-3 py-2 text-sm text-card-foreground/50 hover:text-card-foreground transition-colors">Cancel</button>
      </div>
      <p className="text-[10px] text-card-foreground/30">Accepted: JPG, PNG, PDF — max 10 MB</p>
    </div>
  );
}

export default function MyPaymentsPage() {
  const { profile, loading: authLoading } = useAuth();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [transactions, setTransactions] = useState<PaymentTx[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'invoices' | 'history' | 'pay'>('invoices');

  const loadData = async () => {
    if (!profile) return;
    setLoading(true);
    try {
      const db = createClient();
      const [invRes, txRes, bankRes] = await Promise.all([
        (db as any).from('invoices')
          .select('id, invoice_number, amount, currency, status, due_date, notes, payment_link, items, created_at, reminder_1_sent_at')
          .eq('portal_user_id', profile.id)
          .order('created_at', { ascending: false }),
        (db as any).from('payment_transactions')
          .select('id, amount, currency, payment_method, payment_status, transaction_reference, paid_at, created_at')
          .eq('portal_user_id', profile.id)
          .order('created_at', { ascending: false })
          .limit(30),
        (db as any).from('payment_accounts')
          .select('id, label, bank_name, account_number, account_name, payment_note')
          .eq('is_active', true),
      ]);
      setInvoices(invRes.data ?? []);
      setTransactions(txRes.data ?? []);
      setBankAccounts(bankRes.data ?? []);
    } catch {
      toast.error('Failed to load payment data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading && profile) loadData();
  }, [authLoading, profile]); // eslint-disable-line

  if (authLoading || !profile) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Strictly restricted to individual bootcamp / online students only.
  // School-partnered students, school accounts, staff, and any other roles are blocked.
  const allowedEnrollmentTypes = ['bootcamp', 'online'];
  const isAllowed =
    profile.role === 'student' &&
    allowedEnrollmentTypes.includes((profile as any).enrollment_type ?? '');

  if (!isAllowed) {
    const isSchool = profile.role === 'school';
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center p-6">
        <div className="w-16 h-16 bg-rose-500/10 border border-rose-500/25 rounded-2xl flex items-center justify-center">
          <BanknotesIcon className="w-8 h-8 text-rose-400" />
        </div>
        <h2 className="text-xl font-black text-card-foreground">Not Available</h2>
        <p className="text-card-foreground/50 text-sm max-w-sm">
          {isSchool
            ? 'School accounts should use the Payments section in the Finance menu.'
            : 'This payments page is for individual bootcamp and online students only.'}
        </p>
      </div>
    );
  }

  const outstanding = invoices.filter(i => i.status !== 'paid' && i.status !== 'cancelled');
  const totalDue = outstanding.reduce((s, i) => s + (i.amount ?? 0), 0);
  const paidCount = invoices.filter(i => i.status === 'paid').length;

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-orange-500/10 border border-orange-500/25 flex items-center justify-center flex-shrink-0">
          <BanknotesIcon className="w-5 h-5 text-orange-400" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-card-foreground">My Payments</h1>
          <p className="text-card-foreground/50 text-sm mt-0.5">View invoices, make payments, and upload transfer proofs</p>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="bg-card border border-white/[0.08] rounded-xl p-4">
          <p className="text-[10px] font-bold text-card-foreground/40 uppercase tracking-wider mb-1">Outstanding</p>
          <p className="text-xl font-black text-rose-400">₦{totalDue.toLocaleString()}</p>
          <p className="text-xs text-card-foreground/30 mt-0.5">{outstanding.length} invoice{outstanding.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="bg-card border border-white/[0.08] rounded-xl p-4">
          <p className="text-[10px] font-bold text-card-foreground/40 uppercase tracking-wider mb-1">Paid</p>
          <p className="text-xl font-black text-emerald-400">{paidCount}</p>
          <p className="text-xs text-card-foreground/30 mt-0.5">invoices settled</p>
        </div>
        <div className="bg-card border border-white/[0.08] rounded-xl p-4 col-span-2 sm:col-span-1">
          <p className="text-[10px] font-bold text-card-foreground/40 uppercase tracking-wider mb-1">Transactions</p>
          <p className="text-xl font-black text-blue-400">{transactions.length}</p>
          <p className="text-xs text-card-foreground/30 mt-0.5">payment records</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex bg-white/[0.03] border border-white/[0.08] rounded-xl p-1 w-fit gap-1">
        {([
          ['invoices', 'Invoices', BanknotesIcon],
          ['history',  'History',  ReceiptPercentIcon],
          ['pay',      'How to Pay', CreditCardIcon],
        ] as const).map(([key, label, Icon]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${tab === key ? 'bg-orange-500 text-white shadow-lg' : 'text-card-foreground/60 hover:text-card-foreground hover:bg-white/5'}`}>
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* ── Invoices ── */}
          {tab === 'invoices' && (
            <div className="space-y-4">
              {invoices.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <DocumentTextIcon className="w-14 h-14 text-card-foreground/10" />
                  <p className="text-card-foreground/40 font-semibold">No invoices yet</p>
                </div>
              ) : invoices.map(inv => {
                const s = STATUS[inv.status] ?? STATUS.draft;
                const Icon = s.icon;
                const isOverdue = inv.status === 'overdue' || (inv.due_date && new Date(inv.due_date) < new Date() && inv.status !== 'paid');
                return (
                  <div key={inv.id} className={`bg-card border rounded-2xl p-5 space-y-4 ${isOverdue ? 'border-rose-500/30' : 'border-white/[0.08]'}`}>
                    {/* Invoice header */}
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold border ${s.cls}`}>
                            <Icon className="w-3 h-3" /> {s.label}
                          </span>
                          <span className="text-xs text-card-foreground/40 font-mono">{inv.invoice_number}</span>
                        </div>
                        <p className="text-xl font-black text-card-foreground">
                          {inv.currency === 'NGN' ? '₦' : inv.currency}{(inv.amount ?? 0).toLocaleString()}
                        </p>
                        {inv.due_date && (
                          <p className={`text-xs mt-0.5 ${isOverdue ? 'text-rose-400 font-bold' : 'text-card-foreground/40'}`}>
                            Due: {new Date(inv.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        {/* PDF Download */}
                        <button onClick={() => window.open(`/api/invoices/${inv.id}/pdf`, '_blank')}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-white/5 hover:bg-white/10 border border-white/10 text-card-foreground/60 rounded-lg transition-all">
                          <ArrowDownTrayIcon className="w-3.5 h-3.5" /> PDF
                        </button>
                      </div>
                    </div>

                    {/* Items */}
                    {inv.items?.length > 0 && (
                      <div className="space-y-1">
                        {inv.items.map((item, i) => (
                          <div key={i} className="flex justify-between text-sm text-card-foreground/70">
                            <span>{item.description}</span>
                            <span className="font-mono font-bold text-card-foreground">₦{Number(item.unit_price ?? 0).toLocaleString()}</span>
                          </div>
                        ))}
                        <div className="border-t border-white/[0.06] pt-1 flex justify-between font-black text-card-foreground">
                          <span>Total</span>
                          <span className="font-mono">₦{(inv.amount ?? 0).toLocaleString()}</span>
                        </div>
                      </div>
                    )}

                    {inv.notes && (
                      <p className="text-xs text-card-foreground/50 bg-white/[0.02] border border-white/[0.06] rounded-lg px-3 py-2">
                        {inv.notes}
                      </p>
                    )}

                    {/* Actions for unpaid */}
                    {inv.status !== 'paid' && inv.status !== 'cancelled' && (
                      <div className="space-y-2 pt-2 border-t border-white/[0.06]">
                        {/* Paystack link if available */}
                        {inv.payment_link && (
                          <a href={inv.payment_link} target="_blank" rel="noopener noreferrer"
                            className="flex items-center justify-center gap-2 w-full py-3 bg-orange-500 hover:bg-orange-400 text-white font-bold text-sm rounded-xl transition-all">
                            <ArrowTopRightOnSquareIcon className="w-4 h-4" /> Pay Online Now
                          </a>
                        )}
                        <ProofUpload invoiceId={inv.id} onUploaded={loadData} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ── History ── */}
          {tab === 'history' && (
            <div className="space-y-3">
              {transactions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <ReceiptPercentIcon className="w-14 h-14 text-card-foreground/10" />
                  <p className="text-card-foreground/40 font-semibold">No payment records yet</p>
                </div>
              ) : transactions.map(tx => (
                <div key={tx.id} className="bg-card border border-white/[0.08] rounded-xl p-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="font-bold text-card-foreground text-sm">
                      {tx.currency === 'NGN' ? '₦' : tx.currency}{(tx.amount ?? 0).toLocaleString()}
                    </p>
                    <p className="text-xs text-card-foreground/40 mt-0.5">
                      {tx.payment_method?.replace('_', ' ')} ·{' '}
                      {tx.paid_at ? new Date(tx.paid_at).toLocaleDateString('en-GB') : new Date(tx.created_at).toLocaleDateString('en-GB')}
                    </p>
                    {tx.transaction_reference && (
                      <p className="text-[10px] font-mono text-card-foreground/30 mt-0.5">{tx.transaction_reference}</p>
                    )}
                  </div>
                  <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${tx.payment_status === 'completed' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-amber-500/10 border-amber-500/30 text-amber-400'}`}>
                    {tx.payment_status}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* ── How to Pay ── */}
          {tab === 'pay' && (
            <div className="space-y-6">
              {/* Paystack option */}
              <div className="bg-card border border-white/[0.08] rounded-2xl p-5 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-orange-500/10 rounded-lg flex items-center justify-center">
                    <CreditCardIcon className="w-4 h-4 text-orange-400" />
                  </div>
                  <h3 className="font-black text-card-foreground">Online Payment (Paystack)</h3>
                </div>
                <p className="text-sm text-card-foreground/60">
                  If your invoice has a payment link, click "Pay Online Now" on your invoice. Supports card, bank transfer, USSD, and mobile money.
                </p>
              </div>

              {/* Bank transfer */}
              <div className="bg-card border border-white/[0.08] rounded-2xl p-5 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-blue-500/10 rounded-lg flex items-center justify-center">
                    <BanknotesIcon className="w-4 h-4 text-blue-400" />
                  </div>
                  <h3 className="font-black text-card-foreground">Bank Transfer</h3>
                </div>
                <p className="text-sm text-card-foreground/60 mb-3">
                  Transfer to any of the accounts below. After paying, upload your proof of payment on the invoice.
                </p>
                {bankAccounts.length === 0 ? (
                  <p className="text-xs text-card-foreground/30">Bank account details not available yet. Contact support@rillcod.com</p>
                ) : bankAccounts.map(acct => (
                  <div key={acct.id} className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-4 space-y-2">
                    <p className="text-xs font-black text-card-foreground/40 uppercase tracking-wider">{acct.label}</p>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <p className="text-[10px] text-card-foreground/30 uppercase tracking-wider">Bank</p>
                        <p className="font-bold text-card-foreground">{acct.bank_name}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-card-foreground/30 uppercase tracking-wider">Account Name</p>
                        <p className="font-bold text-card-foreground">{acct.account_name}</p>
                      </div>
                      <div className="col-span-2">
                        <p className="text-[10px] text-card-foreground/30 uppercase tracking-wider">Account Number</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <p className="font-black text-card-foreground text-lg font-mono tracking-widest">{acct.account_number}</p>
                          <button onClick={() => { navigator.clipboard?.writeText(acct.account_number); toast.success('Copied!'); }}
                            className="text-[10px] font-bold text-orange-400 hover:text-orange-300 px-2 py-0.5 bg-orange-500/10 rounded">
                            Copy
                          </button>
                        </div>
                      </div>
                    </div>
                    {acct.payment_note && (
                      <p className="text-xs text-card-foreground/50 bg-white/[0.02] px-3 py-2 rounded-lg border border-white/[0.06]">
                        {acct.payment_note}
                      </p>
                    )}
                  </div>
                ))}
              </div>

              {/* Support */}
              <div className="flex items-start gap-3 bg-blue-500/[0.07] border border-blue-500/20 rounded-xl p-4">
                <InformationCircleIcon className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-bold text-blue-300">Need help?</p>
                  <p className="text-blue-300/70 mt-0.5">
                    Email <a href="mailto:support@rillcod.com" className="underline">support@rillcod.com</a> with your invoice number. After paying, upload your receipt using the "Upload Proof" button on your invoice — we verify within 24 hours.
                  </p>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
