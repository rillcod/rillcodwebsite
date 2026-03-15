// @refresh reset
'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import {
  BanknotesIcon, PlusIcon, PencilIcon, TrashIcon,
  XMarkIcon, CheckIcon, BuildingOfficeIcon, ShieldCheckIcon,
  InformationCircleIcon, ClockIcon, CreditCardIcon, ArrowTrendingUpIcon,
  MagnifyingGlassIcon, DocumentTextIcon, ReceiptPercentIcon,
  ArrowPathIcon, EnvelopeIcon, ArrowDownTrayIcon, CheckBadgeIcon,
} from '@/lib/icons';
import SmartDocument from '@/components/finance/SmartDocument';

type PaymentAccount = {
  id: string;
  owner_type: 'rillcod' | 'school';
  school_id: string | null;
  label: string;
  bank_name: string;
  account_number: string;
  account_name: string;
  account_type: 'savings' | 'current';
  payment_note: string | null;
  is_active: boolean;
  schools?: { name: string; rillcod_quota_percent: number | null } | null;
};

type PaymentTransaction = {
  id: string;
  amount: number;
  currency: string;
  payment_method: string;
  payment_status: string;
  transaction_reference: string;
  created_at: string;
  paid_at: string | null;
  school_id: string | null;
  portal_user_id: string | null;
  course_id: string | null;
  invoice_id: string | null;
  portal_users?: { full_name: string; email: string } | null;
  schools?: { name: string; rillcod_quota_percent: number | null } | null;
  courses?: { title: string } | null;
  paystack_fees?: number;
  receipt_url?: string | null;
  receipts?: { receipt_number: string; pdf_url: string }[] | null;
};

type Invoice = {
  id: string;
  invoice_number: string;
  school_id: string | null;
  portal_user_id: string | null;
  amount: number;
  currency: string;
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled';
  due_date: string;
  items: any[];
  notes: string | null;
  created_at: string;
  portal_users?: { full_name: string; email: string } | null;
  schools?: { name: string } | null;
};

const NIGERIAN_BANKS = [
  'Access Bank', 'Citibank Nigeria', 'Ecobank Nigeria', 'Fidelity Bank',
  'First Bank of Nigeria', 'First City Monument Bank (FCMB)', 'Guaranty Trust Bank (GTB)',
  'Heritage Bank', 'Jaiz Bank', 'Keystone Bank', 'Kuda Bank',
  'Moniepoint MFB', 'OPay', 'PalmPay', 'Polaris Bank',
  'Providus Bank', 'Stanbic IBTC Bank', 'Standard Chartered Bank',
  'Sterling Bank', 'SunTrust Bank', 'Union Bank', 'United Bank for Africa (UBA)',
  'Unity Bank', 'VFD MFB', 'Wema Bank', 'Zenith Bank',
].sort();

const BLANK: Omit<PaymentAccount, 'id' | 'schools'> = {
  owner_type: 'school', school_id: null, label: '', bank_name: '',
  account_number: '', account_name: '', account_type: 'savings',
  payment_note: '', is_active: true,
};

function AccountCard({ account, onEdit, onDelete, canManage }: {
  account: PaymentAccount;
  onEdit: (a: PaymentAccount) => void;
  onDelete: (id: string) => void;
  canManage: boolean;
}) {
  const isRillcod = account.owner_type === 'rillcod';
  return (
    <div className={`bg-white/5 border rounded-2xl p-5 space-y-3 ${isRillcod ? 'border-violet-500/30' : 'border-white/10'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${isRillcod ? 'bg-violet-600/20' : 'bg-white/10'}`}>
            {isRillcod
              ? <ShieldCheckIcon className="w-5 h-5 text-violet-400" />
              : <BuildingOfficeIcon className="w-5 h-5 text-white/50" />}
          </div>
          <div className="min-w-0">
            <p className="font-black text-white text-sm truncate">{account.label}</p>
            <p className="text-[10px] text-white/30 uppercase tracking-widest">
              {isRillcod ? 'Rillcod Academy' : (account.schools?.name ?? 'School Account')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {!account.is_active && (
            <span className="px-2 py-0.5 bg-rose-500/20 text-rose-400 text-[10px] font-black rounded-full uppercase">Inactive</span>
          )}
          {canManage && (
            <>
              <button onClick={() => onEdit(account)}
                className="p-2 hover:bg-white/10 rounded-xl transition-colors">
                <PencilIcon className="w-4 h-4 text-white/40 hover:text-white" />
              </button>
              <button onClick={() => onDelete(account.id)}
                className="p-2 hover:bg-rose-500/20 rounded-xl transition-colors">
                <TrashIcon className="w-4 h-4 text-rose-400/60 hover:text-rose-400" />
              </button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="bg-white/[0.03] border border-white/5 rounded-xl px-4 py-3">
          <p className="text-[9px] font-black text-white/30 uppercase tracking-widest mb-1">Bank</p>
          <p className="font-bold text-white text-[13px]">{account.bank_name}</p>
        </div>
        <div className="bg-white/[0.03] border border-white/5 rounded-xl px-4 py-3">
          <p className="text-[9px] font-black text-white/30 uppercase tracking-widest mb-1">Account Type</p>
          <p className="font-bold text-white text-[13px] capitalize">{account.account_type}</p>
        </div>
        <div className="col-span-2 bg-white/[0.03] border border-white/5 rounded-xl px-4 py-3">
          <p className="text-[9px] font-black text-white/30 uppercase tracking-widest mb-1">Account Name</p>
          <p className="font-bold text-white text-[13px]">{account.account_name}</p>
        </div>
        <div className="col-span-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-[9px] font-black text-emerald-400/70 uppercase tracking-widest mb-1">Account Number</p>
            <p className="font-black text-emerald-300 text-lg tracking-[0.15em]">{account.account_number}</p>
          </div>
          <button
            onClick={() => navigator.clipboard?.writeText(account.account_number)}
            className="text-[10px] font-bold text-emerald-400/60 hover:text-emerald-300 transition-colors px-2 py-1 bg-emerald-500/10 rounded-lg"
          >
            Copy
          </button>
        </div>
      </div>

      {account.payment_note && (
        <div className="flex gap-2 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2">
          <InformationCircleIcon className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
          <p className="text-[11px] text-amber-300/80">{account.payment_note}</p>
        </div>
      )}
    </div>
  );
}

export default function PaymentsPage() {
  const { profile, loading: authLoading } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const isSchool = profile?.role === 'school';
  const canManage = isAdmin || isSchool;

  const [accounts, setAccounts] = useState<PaymentAccount[]>([]);
  const [transactions, setTransactions] = useState<PaymentTransaction[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [schools, setSchools] = useState<{ id: string; name: string; rillcod_quota_percent: number | null }[]>([]);
  const [allStudents, setAllStudents] = useState<{ id: string; full_name: string; email: string; school_id: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingTx, setLoadingTx] = useState(false);
  const [view, setView] = useState<'accounts' | 'monitoring' | 'billing'>('accounts');
  const [searchTx, setSearchTx] = useState('');
  const [searchInv, setSearchInv] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showInvoiceForm, setShowInvoiceForm] = useState(false);
  const [viewDoc, setViewDoc] = useState<{ type: 'invoice' | 'receipt', data: any } | null>(null);
  const [editing, setEditing] = useState<PaymentAccount | null>(null);
  const [form, setForm] = useState<Omit<PaymentAccount, 'id' | 'schools'>>({ ...BLANK });
  const [invForm, setInvForm] = useState({
    student_id: '',
    amount: '',
    notes: '',
    items: [{ description: 'Coding Club Fee', quantity: 1, unit_price: 0, total: 0 }],
    due_date: new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0]
  });
  const [saving, setSaving] = useState(false);

  const db = createClient();

  async function load() {
    setLoading(true); setError(null);
    const { data, error: err } = await (db as any).from('payment_accounts')
      .select('*, schools(name)')
      .order('owner_type').order('created_at', { ascending: false });
    if (err) setError(err.message);
    else setAccounts((data ?? []) as PaymentAccount[]);
    setLoading(false);
  }

  async function loadTransactions() {
    setLoadingTx(true);
    let q = (db as any).from('payment_transactions')
      .select('*, portal_users(full_name, email), schools(name, rillcod_quota_percent), courses(title), receipts(receipt_number, pdf_url)')
      .order('created_at', { ascending: false });

    if (isSchool && profile?.school_id) q = q.eq('school_id', profile.school_id as string);
    
    const { data, error: err } = await q.limit(100);
    if (!err) setTransactions((data ?? []) as PaymentTransaction[]);
    
    // Also load invoices
    let qInv = (db as any).from('invoices')
      .select('*, portal_users(full_name, email), schools(name)')
      .order('created_at', { ascending: false });
    
    if (isSchool && profile?.school_id) qInv = qInv.eq('school_id', profile.school_id as string);
    const { data: dInv } = await qInv.limit(50);
    if (dInv) setInvoices(dInv as Invoice[]);

    setLoadingTx(false);
  }

  async function loadStudents() {
    let q = db.from('portal_users').select('id, full_name, email, school_id').eq('role', 'student').eq('is_active', true);
    if (isSchool && profile?.school_id) q = q.eq('school_id', profile.school_id as string);
    const { data } = await q.order('full_name');
    if (data) setAllStudents(data as any[]);
  }

  async function approveTransaction(id: string) {
    if (!isAdmin || !confirm('Mark this transaction as successful?')) return;
    setLoadingTx(true);
    try {
      const res = await fetch('/api/payments/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactionId: id, status: 'success' })
      });
      const result = await res.json();
      if (result.success) {
        await loadTransactions();
      } else {
        throw new Error(result.error || 'Approval failed');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoadingTx(false);
    }
  }

  async function handleCreateInvoice(e: React.FormEvent) {
    e.preventDefault();
    if (!invForm.student_id) return;
    setLoadingTx(true);
    const selectedStudent = allStudents.find(s => s.id === invForm.student_id);
    const res = await fetch('/api/invoices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        school_id: isSchool ? profile?.school_id : (selectedStudent?.school_id || null),
        portal_user_id: invForm.student_id,
        amount: parseFloat(invForm.amount) || 0,
        notes: invForm.notes,
        due_date: invForm.due_date,
        items: invForm.items,
        status: 'sent',
      }),
    });
    const j = await res.json();
    if (!res.ok) setError(j.error || 'Failed to create invoice');
    else {
      setShowInvoiceForm(false);
      loadTransactions();
    }
    setLoadingTx(false);
  }

  async function handlePayWithPaystack(invoice: Invoice) {
    setLoadingTx(true);
    try {
      const res = await fetch('/api/payments/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoice_id: invoice.id,
          amount: invoice.amount,
          payment_method: 'paystack'
        })
      });
      const result = await res.json();
      if (result.success && result.data?.url) {
        window.location.href = result.data.url;
      } else {
        throw new Error(result.message || 'Payment initiation failed');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoadingTx(false);
    }
  }

  async function handleSendInvoiceEmail(invoiceId: string) {
    setLoadingTx(true);
    try {
      const res = await fetch('/api/payments/invoices/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceId })
      });
      const result = await res.json();
      if (result.success) {
        alert('Invoice email sent successfully!');
      } else {
        throw new Error(result.message || 'Failed to send email');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoadingTx(false);
    }
  }

  function calculateTotalWithFees(target: number) {
    const targetWithBuffer = target + 50; 
    const rate = 0.016; // 1.6% total
    const divisor = 1 - rate; // 0.984
    
    if (targetWithBuffer < 2500 * divisor) return Math.ceil(targetWithBuffer / divisor);
    if (targetWithBuffer < 125000) return Math.ceil((targetWithBuffer + 100) / divisor);
    return Math.ceil(targetWithBuffer + 2000);
  }

  useEffect(() => {
    if (authLoading || !profile) return;
    load();
    loadTransactions();
    loadStudents();
    if (isAdmin) {
      db.from('schools').select('id, name, rillcod_quota_percent').order('name')
        .then(({ data }) => setSchools((data ?? []) as any));
    }
  }, [profile?.id, authLoading]); // eslint-disable-line

  const openNew = () => {
    setEditing(null);
    setForm({
      ...BLANK,
      owner_type: isSchool ? 'school' : 'rillcod',
      school_id: isSchool ? (profile as any)?.school_id ?? null : null,
    });
    setShowForm(true);
  };

  const openEdit = (a: PaymentAccount) => {
    setEditing(a);
    setForm({
      owner_type: a.owner_type, school_id: a.school_id, label: a.label,
      bank_name: a.bank_name, account_number: a.account_number,
      account_name: a.account_name, account_type: a.account_type,
      payment_note: a.payment_note ?? '', is_active: a.is_active,
    });
    setShowForm(true);
  };

  const save = async () => {
    if (!form.label.trim() || !form.bank_name || !form.account_number.trim() || !form.account_name.trim()) {
      setError('Label, bank, account number, and account name are required.');
      return;
    }
    setSaving(true); setError(null);
    const payload = {
      ...form,
      payment_note: form.payment_note || null,
      school_id: form.owner_type === 'rillcod' ? null : (form.school_id || null),
    };
    const res = editing
      ? await fetch(`/api/payment-accounts/${editing.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      : await fetch('/api/payment-accounts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
    const j = await res.json();
    if (!res.ok) setError(j.error || 'Failed to save');
    else { await load(); setShowForm(false); }
    setSaving(false);
  };

  const del = async (id: string) => {
    if (!confirm('Remove this payment account?')) return;
    await fetch(`/api/payment-accounts/${id}`, { method: 'DELETE' });
    setAccounts(prev => prev.filter(a => a.id !== id));
  };

  const rillcodAccounts = accounts.filter(a => a.owner_type === 'rillcod');
  const schoolAccounts  = accounts.filter(a => a.owner_type === 'school');

  if (authLoading || loading) return (
    <div className="min-h-screen bg-[#0f0f1a] flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0f0f1a] text-white">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <BanknotesIcon className="w-5 h-5 text-violet-400" />
              <span className="text-xs font-bold text-violet-400 uppercase tracking-widest">Finance</span>
            </div>
            <h1 className="text-3xl font-extrabold">Payments & Finance</h1>
            <p className="text-white/40 text-sm mt-1">
              {isAdmin ? 'Financial monitoring, revenue tracking, and account management' :
                isSchool ? 'Your school\'s payment monitoring and collection accounts' :
                  'Payment details and transaction history'}
            </p>
          </div>
          <div className="flex gap-2">
            <div className="bg-white/5 p-1 rounded-xl flex border border-white/10">
              {(['accounts', 'monitoring', 'billing'] as const).map(v => (
                <button 
                  key={v}
                  onClick={() => setView(v)}
                  className={`px-4 py-2 rounded-lg font-bold text-[10px] uppercase tracking-widest transition-all ${view === v ? 'bg-indigo-600 text-white shadow-lg' : 'text-white/40 hover:text-white'}`}>
                  {v}
                </button>
              ))}
            </div>
            {canManage && view === 'accounts' && (
              <button onClick={openNew}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-500 text-white font-bold text-sm rounded-xl transition-all hover:scale-105 shadow-lg shadow-violet-900/30">
                <PlusIcon className="w-4 h-4" /> Add Account
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-4 text-rose-400 text-sm flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)}><XMarkIcon className="w-4 h-4" /></button>
          </div>
        )}

        {view === 'accounts' ? (
          <>
            {/* Rillcod Academy Accounts */}
            {(isAdmin || rillcodAccounts.length > 0) && (
              <section className="space-y-4">
                <div className="flex items-center gap-3">
                  <ShieldCheckIcon className="w-4 h-4 text-violet-400" />
                  <h2 className="text-sm font-black uppercase tracking-widest text-violet-400">Rillcod Academy Accounts</h2>
                  <div className="h-px flex-1 bg-violet-500/20" />
                  {isAdmin && (
                    <button
                      onClick={() => { setForm({ ...BLANK, owner_type: 'rillcod', school_id: null }); setEditing(null); setShowForm(true); }}
                      className="text-[10px] font-black text-violet-400/60 hover:text-violet-300 flex items-center gap-1">
                      <PlusIcon className="w-3 h-3" /> Add
                    </button>
                  )}
                </div>
                {rillcodAccounts.length === 0 ? (
                  <div className="text-center py-10 bg-white/5 border border-dashed border-violet-500/20 rounded-2xl">
                    <p className="text-white/30 text-sm">No Rillcod payment accounts set up yet.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {rillcodAccounts.map(a => (
                      <AccountCard key={a.id} account={a} onEdit={openEdit} onDelete={del} canManage={isAdmin} />
                    ))}
                  </div>
                )}
              </section>
            )}

            {/* School Accounts */}
            <section className="space-y-4">
              <div className="flex items-center gap-3">
                <BuildingOfficeIcon className="w-4 h-4 text-white/40" />
                <h2 className="text-sm font-black uppercase tracking-widest text-white/40">
                  {isSchool ? 'Your School Account' : 'Partner School Accounts'}
                </h2>
                <div className="h-px flex-1 bg-white/10" />
                {isSchool && (
                  <button
                    onClick={() => { setForm({ ...BLANK, owner_type: 'school', school_id: (profile as any)?.school_id ?? null }); setEditing(null); setShowForm(true); }}
                    className="text-[10px] font-black text-white/40 hover:text-white flex items-center gap-1">
                    <PlusIcon className="w-3 h-3" /> Add
                  </button>
                )}
              </div>
              {schoolAccounts.length === 0 ? (
                <div className="text-center py-10 bg-white/5 border border-dashed border-white/10 rounded-2xl">
                  <BuildingOfficeIcon className="w-10 h-10 mx-auto text-white/10 mb-3" />
                  <p className="text-white/30 text-sm">
                    {isSchool ? 'Add your school\'s bank account for fee collection.' : 'No school payment accounts set up yet.'}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {schoolAccounts.map(a => (
                    <AccountCard key={a.id} account={a} onEdit={openEdit} onDelete={del}
                      canManage={isAdmin || (isSchool && a.school_id === (profile as any)?.school_id)} />
                  ))}
                </div>
              )}
            </section>
          </>
        ) : view === 'monitoring' ? (
          /* ── Financial Monitoring View ── */
          <div className="space-y-6">
            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {(() => {
                const completed = transactions.filter(t => t.payment_status === 'completed' || t.payment_status === 'success');
                const totalRevenue = completed.reduce((sum, t) => sum + t.amount, 0);
                const totalQuota = completed.reduce((sum, t) => {
                  const pct = t.schools?.rillcod_quota_percent || 0;
                  return sum + (t.amount * (Number(pct) / 100));
                }, 0);

                return (
                  <>
                    <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-[10px] font-black text-white/30 uppercase tracking-widest">Gross Revenue</p>
                        <ArrowTrendingUpIcon className="w-4 h-4 text-emerald-400" />
                      </div>
                      <p className="text-2xl font-black text-white">₦{totalRevenue.toLocaleString()}</p>
                      <p className="text-[10px] text-white/20 mt-1">{completed.length} total payments</p>
                    </div>
                    {isAdmin && (
                      <div className="bg-indigo-600/10 border border-indigo-500/20 rounded-2xl p-6">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Rillcod Quota</p>
                          <ShieldCheckIcon className="w-4 h-4 text-indigo-400" />
                        </div>
                        <p className="text-2xl font-black text-indigo-100">₦{totalQuota.toLocaleString()}</p>
                        <p className="text-[10px] text-indigo-400/40 mt-1">Calculated from school split %</p>
                      </div>
                    )}
                    <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-[10px] font-black text-white/30 uppercase tracking-widest">Active Transactions</p>
                        <ClockIcon className="w-4 h-4 text-amber-400" />
                      </div>
                      <p className="text-2xl font-black text-white">{transactions.length}</p>
                      <p className="text-[10px] text-white/20 mt-1">Pending & Completed</p>
                    </div>
                    {!isAdmin && (
                      <div className="bg-emerald-600/10 border border-emerald-500/20 rounded-2xl p-6">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">School Share</p>
                          <BuildingOfficeIcon className="w-4 h-4 text-emerald-400" />
                        </div>
                        <p className="text-2xl font-black text-emerald-100">₦{(totalRevenue - totalQuota).toLocaleString()}</p>
                        <p className="text-[10px] text-emerald-400/40 mt-1">Net after service fee</p>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>

            {/* Transactions List */}
            <div className="bg-white/5 border border-white/10 rounded-3xl overflow-hidden min-h-[400px]">
              <div className="p-6 border-b border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <CreditCardIcon className="w-5 h-5 text-indigo-400" />
                  <h3 className="text-lg font-extrabold text-white">Recent Transactions</h3>
                </div>
                <div className="relative">
                  <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                  <input 
                    type="search" 
                    placeholder="Search transactions..."
                    value={searchTx}
                    onChange={e => setSearchTx(e.target.value)}
                    className="bg-white/5 border border-white/10 rounded-xl pl-9 pr-4 py-2 text-sm text-white placeholder-white/25 focus:outline-none focus:border-indigo-500 w-full sm:w-64"
                  />
                </div>
              </div>

              {loadingTx ? (
                <div className="p-20 flex flex-col items-center justify-center gap-3">
                  <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                  <p className="text-xs text-white/30 uppercase font-black tracking-widest">Fetching records...</p>
                </div>
              ) : transactions.length === 0 ? (
                <div className="p-20 text-center">
                  <p className="text-white/30 text-sm">No transactions found.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-white/5">
                        <th className="px-6 py-4 text-[10px] font-black text-white/30 uppercase tracking-widest">Recipient / Student</th>
                        <th className="px-6 py-4 text-[10px] font-black text-white/30 uppercase tracking-widest">Amount</th>
                        <th className="px-6 py-4 text-[10px] font-black text-white/30 uppercase tracking-widest">Status</th>
                        <th className="px-6 py-4 text-[10px] font-black text-white/30 uppercase tracking-widest">Method</th>
                        <th className="px-6 py-4 text-[10px] font-black text-white/30 uppercase tracking-widest text-right">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.03]">
                      {transactions.filter(t => 
                        !searchTx || 
                        t.portal_users?.full_name?.toLowerCase().includes(searchTx.toLowerCase()) ||
                        t.transaction_reference?.toLowerCase().includes(searchTx.toLowerCase())
                      ).map(t => {
                        const isSuccess = t.payment_status === 'completed' || t.payment_status === 'success';
                        const isPending = t.payment_status === 'pending';
                        return (
                          <tr key={t.id} className="hover:bg-white/[0.02] transition-colors group">
                            <td className="px-6 py-4">
                              <p className="text-[13px] font-bold text-white group-hover:text-indigo-300 transition-colors">
                                {t.portal_users?.full_name || 'Anonymous Student'}
                              </p>
                              <p className="text-[10px] text-white/30 uppercase tracking-wider">{t.schools?.name || 'Individual'}</p>
                            </td>
                            <td className="px-6 py-4">
                              <p className="text-sm font-black text-white tracking-tight">₦{t.amount.toLocaleString()}</p>
                              <p className="text-[9px] text-white/20 font-mono">
                                {t.receipts?.[0]?.receipt_number || t.transaction_reference}
                              </p>
                            </td>
                            <td className="px-6 py-4">
                              <span className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider border ${
                                isSuccess ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' :
                                isPending ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' :
                                'bg-rose-500/10 border-rose-500/30 text-rose-400'
                              }`}>
                                {t.payment_status}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">{t.payment_method}</p>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <div className="flex flex-col items-end gap-1">
                                <p className="text-xs font-bold text-white/60">
                                  {new Date(t.created_at).toLocaleDateString()}
                                </p>
                                <div className="flex items-center gap-2">
                                  {isAdmin && isPending && (
                                    <button 
                                      onClick={(e) => { e.stopPropagation(); approveTransaction(t.id); }}
                                      className="px-2 py-0.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-[9px] font-black uppercase rounded-full border border-emerald-500/20 transition-all">
                                      Approve
                                    </button>
                                  )}
                                  {isSuccess && (
                                    <button 
                                      onClick={(e) => { 
                                        e.stopPropagation(); 
                                        setViewDoc({ 
                                          type: 'receipt', 
                                          data: {
                                            number: t.transaction_reference,
                                            date: new Date(t.paid_at || t.created_at).toLocaleDateString(),
                                            status: 'paid',
                                            amount: t.amount,
                                            currency: t.currency || 'NGN',
                                            items: [{ description: t.courses?.title || (t.invoice_id ? 'Invoice Payment' : 'Enrolment Fee'), quantity: 1, unit_price: t.amount, total: t.amount }],
                                            studentName: t.portal_users?.full_name || 'Student',
                                            studentEmail: t.portal_users?.email,
                                            schoolName: t.schools?.name || 'Rillcod Academy',
                                            transactionRef: t.transaction_reference,
                                            processingFee: t.paystack_fees || 0
                                          }
                                        }); 
                                      }}
                                      className="px-2 py-0.5 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 text-[9px] font-black uppercase rounded-full border border-indigo-500/20 transition-all">
                                      Receipt
                                    </button>
                                  )}
                                  <p className="text-[9px] text-white/30 uppercase">
                                    {new Date(t.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                  </p>
                                  {(t.receipt_url || (t.receipts && t.receipts[0]?.pdf_url)) && (
                                    <a href={t.receipts?.[0]?.pdf_url || t.receipt_url || '#'} target="_blank" rel="noreferrer"
                                      className="p-1 text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-all" title="Download Official Receipt">
                                      <ArrowDownTrayIcon className="w-4 h-4" />
                                    </a>
                                  )}
                                </div>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* ── Billing & Invoices View ── */
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <DocumentTextIcon className="w-4 h-4 text-amber-400" />
                  <span className="text-xs font-bold text-amber-400 uppercase tracking-widest">Financial Records</span>
                </div>
                <h2 className="text-2xl font-black">Billing & Invoices</h2>
              </div>
              {canManage && (
                <button 
                  onClick={() => setShowInvoiceForm(true)}
                  className="px-5 py-2.5 bg-amber-600 hover:bg-amber-500 text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-lg shadow-amber-900/40 hover:scale-105 active:scale-95">
                  + New Invoice
                </button>
              )}
            </div>
            
            {/* Invoice Statistics */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {(() => {
                const pending = invoices.filter(i => i.status === 'sent' || i.status === 'overdue');
                const totalOutstanding = pending.reduce((sum, i) => sum + i.amount, 0);
                const paidCount = invoices.filter(i => i.status === 'paid').length;
                
                return (
                  <>
                    <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-[10px] font-black text-amber-500 uppercase tracking-widest">Outstanding</p>
                        <ClockIcon className="w-4 h-4 text-amber-400" />
                      </div>
                      <p className="text-2xl font-black text-white">₦{totalOutstanding.toLocaleString()}</p>
                      <p className="text-[10px] text-white/20 mt-1">{pending.length} pending invoices</p>
                    </div>
                    <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">Settled</p>
                        <CheckBadgeIcon className="w-4 h-4 text-emerald-400" />
                      </div>
                      <p className="text-2xl font-black text-white">{paidCount}</p>
                      <p className="text-[10px] text-white/20 mt-1">Invoices fully paid</p>
                    </div>
                    <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-[10px] font-black text-rose-400 uppercase tracking-widest">Overdue</p>
                        <InformationCircleIcon className="w-4 h-4 text-rose-400" />
                      </div>
                      <p className="text-2xl font-black text-white">{invoices.filter(i => i.status === 'overdue').length}</p>
                      <p className="text-[10px] text-white/20 mt-1">Requiring immediate attention</p>
                    </div>
                  </>
                );
              })()}
            </div>

            <div className="flex items-center justify-between bg-white/5 border border-white/10 p-4 rounded-2xl">
              <div className="flex items-center gap-3">
                <DocumentTextIcon className="w-5 h-5 text-amber-400" />
                <h3 className="text-sm font-extrabold text-white">Invoice Records</h3>
              </div>
              <div className="relative">
                <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                <input 
                  type="search" 
                  placeholder="Search invoices..."
                  value={searchInv}
                  onChange={e => setSearchInv(e.target.value)}
                  className="bg-white/5 border border-white/10 rounded-xl pl-9 pr-4 py-2 text-sm text-white placeholder-white/25 focus:outline-none focus:border-amber-500 w-full sm:w-64"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {invoices.filter(inv => 
                !searchInv || 
                inv.invoice_number?.toLowerCase().includes(searchInv.toLowerCase()) ||
                inv.portal_users?.full_name?.toLowerCase().includes(searchInv.toLowerCase())
              ).length === 0 ? (
                <div className="col-span-full py-20 text-center bg-white/5 border border-dashed border-white/10 rounded-2xl">
                  <DocumentTextIcon className="w-10 h-10 mx-auto text-white/10 mb-3" />
                  <p className="text-white/30 text-sm">No invoices found matching your criteria.</p>
                </div>
              ) : (
                invoices.filter(inv => 
                  !searchInv || 
                  inv.invoice_number?.toLowerCase().includes(searchInv.toLowerCase()) ||
                  inv.portal_users?.full_name?.toLowerCase().includes(searchInv.toLowerCase())
                ).map(inv => (
                  <div key={inv.id} className="bg-white/5 border border-white/10 rounded-2xl p-5 hover:border-amber-500/30 transition-all cursor-pointer group"
                    onClick={() => {
                      const total = calculateTotalWithFees(inv.amount);
                      setViewDoc({
                        type: 'invoice',
                        data: {
                          number: inv.invoice_number,
                          date: new Date(inv.created_at).toLocaleDateString(),
                          dueDate: new Date(inv.due_date).toLocaleDateString(),
                          status: inv.status,
                          amount: inv.amount,
                          processingFee: total - inv.amount,
                          currency: inv.currency,
                          items: inv.items,
                          studentName: inv.portal_users?.full_name || 'Student',
                          studentEmail: inv.portal_users?.email,
                          notes: inv.notes,
                          schoolName: inv.schools?.name || 'Rillcod Academy'
                        }
                      });
                    }}>
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <p className="text-[10px] font-black text-amber-500 uppercase tracking-widest">{inv.invoice_number}</p>
                        <p className="text-sm font-black text-white group-hover:text-amber-400 transition-colors uppercase tracking-tight">{inv.portal_users?.full_name}</p>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
                        inv.status === 'paid' ? 'bg-emerald-500/10 text-emerald-400' :
                        inv.status === 'overdue' ? 'bg-rose-500/10 text-rose-400' :
                        'bg-white/10 text-white/40'
                      }`}>
                        {inv.status}
                      </span>
                    </div>
                    <div className="flex justify-between items-end">
                      <div>
                        <p className="text-[10px] text-white/20 uppercase tracking-widest">Amount Due</p>
                        <p className="text-xl font-black text-white">₦{inv.amount.toLocaleString()}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] text-white/20 uppercase tracking-widest">Due Date</p>
                        <p className="text-xs font-bold text-white/60">{new Date(inv.due_date).toLocaleDateString()}</p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Document Viewer Overlay ── */}
      {viewDoc && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md overflow-y-auto pt-10 pb-20 px-4">
          <div className="relative max-w-[794px] mx-auto min-h-screen">
            <div className="fixed top-6 right-6 flex items-center gap-3 z-[110]">
              {viewDoc.type === 'invoice' && viewDoc.data.status !== 'paid' && 
                (profile?.role === 'student' || profile?.role === 'school') && (
                <button 
                  onClick={() => {
                    const inv = invoices.find(i => i.invoice_number === viewDoc!.data.number);
                    if (inv) handlePayWithPaystack(inv);
                  }}
                  disabled={loadingTx}
                  className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-black uppercase tracking-widest rounded-xl transition-all shadow-xl shadow-indigo-900/40 hover:scale-105 active:scale-95 flex flex-col items-center"
                >
                  <div className="flex items-center gap-2">
                    {loadingTx ? <ArrowPathIcon className="w-5 h-5 animate-spin" /> : <CreditCardIcon className="w-5 h-5" />}
                    <span>Pay ₦{calculateTotalWithFees(viewDoc.data.amount).toLocaleString()}</span>
                  </div>
                  <span className="text-[8px] opacity-60 mt-0.5 whitespace-nowrap">Includes Paystack Admin Fee</span>
                </button>
              )}
              {viewDoc.type === 'invoice' && canManage && (
                <button 
                  onClick={() => {
                    const inv = invoices.find(i => i.invoice_number === viewDoc!.data.number);
                    if (inv) handleSendInvoiceEmail(inv.id);
                  }}
                  disabled={loadingTx}
                  className="px-6 py-3 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-sm font-black uppercase tracking-widest rounded-xl transition-all shadow-xl shadow-amber-900/40 hover:scale-105 active:scale-95 flex items-center gap-2"
                >
                  {loadingTx ? <ArrowPathIcon className="w-5 h-5 animate-spin" /> : <EnvelopeIcon className="w-5 h-5" />}
                  Send via Email
                </button>
              )}
              <button 
                onClick={() => setViewDoc(null)}
                className="p-3 bg-white/10 hover:bg-white/20 text-white rounded-full transition-all hover:scale-110 active:scale-90"
              >
                <XMarkIcon className="w-6 h-6" />
              </button>
            </div>
            <div className="scale-90 sm:scale-100 origin-top">
              <SmartDocument type={viewDoc.type} data={viewDoc.data} />
            </div>
          </div>
        </div>
      )}

      {/* ── Invoice Creation Modal ── */}
      {showInvoiceForm && (
        <div className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0f0f1a] border border-white/10 rounded-3xl w-full max-w-xl shadow-2xl flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-white/10 flex items-center justify-between">
              <h3 className="text-lg font-extrabold text-white">Create Smart Invoice</h3>
              <button onClick={() => setShowInvoiceForm(false)} className="p-2 hover:bg-white/5 rounded-xl text-white/40 hover:text-white transition-all"><XMarkIcon className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleCreateInvoice} className="p-6 overflow-y-auto space-y-4">
              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] font-black text-white/30 uppercase tracking-widest mb-1.5">Select Student</label>
                  <select 
                    required 
                    value={invForm.student_id} 
                    onChange={e => setInvForm({...invForm, student_id: e.target.value})}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-amber-500 appearance-none">
                    <option value="">— Choose Student —</option>
                    {allStudents.map(s => <option key={s.id} value={s.id} className="bg-[#0f0f1a]">{s.full_name} ({s.email})</option>)}
                  </select>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-black text-white/30 uppercase tracking-widest mb-1.5">Total Amount (₦)</label>
                    <input 
                      type="number" required 
                      value={invForm.amount} 
                      onChange={e => {
                        const val = parseFloat(e.target.value) || 0;
                        setInvForm({...invForm, amount: e.target.value, items: [{...invForm.items[0], unit_price: val, total: val}]});
                      }}
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-amber-500" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-white/30 uppercase tracking-widest mb-1.5">Due Date</label>
                    <input 
                      type="date" required 
                      value={invForm.due_date} 
                      onChange={e => setInvForm({...invForm, due_date: e.target.value})}
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-amber-500" />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-white/30 uppercase tracking-widest mb-1.5">Description / Item</label>
                  <input 
                    required 
                    value={invForm.items[0].description} 
                    onChange={e => setInvForm({...invForm, items: [{...invForm.items[0], description: e.target.value}]})}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-amber-500" />
                </div>

                <div>
                  <label className="block text-[10px] font-black text-white/30 uppercase tracking-widest mb-1.5">Notes (Optional)</label>
                  <textarea 
                    value={invForm.notes} 
                    onChange={e => setInvForm({...invForm, notes: e.target.value})}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-amber-500 h-24 resize-none" />
                </div>
              </div>
              <button 
                type="submit" 
                disabled={loadingTx}
                className="w-full py-4 bg-amber-600 hover:bg-amber-500 text-white font-black text-base rounded-2xl transition-all shadow-lg shadow-amber-900/30">
                {loadingTx ? 'Generating...' : 'Issue Invoice & Notify →'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ── Form Modal ── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-[#0f0f1a] border border-white/10 rounded-3xl p-6 space-y-5 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="font-extrabold text-white">{editing ? 'Edit Account' : 'Add Payment Account'}</h2>
              <button onClick={() => setShowForm(false)} className="p-2 text-white/40 hover:text-white rounded-xl hover:bg-white/10">
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Owner type (admin only) */}
              {isAdmin && (
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-white/40">Account Owner</label>
                  <div className="grid grid-cols-2 gap-2">
                    {(['rillcod', 'school'] as const).map(t => (
                      <button key={t} type="button"
                        onClick={() => setForm(f => ({ ...f, owner_type: t, school_id: t === 'rillcod' ? null : f.school_id }))}
                        className={`py-2.5 rounded-xl text-sm font-bold border transition-all ${form.owner_type === t ? 'bg-violet-600 border-violet-500 text-white' : 'bg-white/5 border-white/10 text-white/40 hover:text-white'}`}>
                        {t === 'rillcod' ? 'Rillcod Academy' : 'Partner School'}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* School selector (admin, school type) */}
              {isAdmin && form.owner_type === 'school' && (
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-white/40">Partner School <span className="text-rose-400">*</span></label>
                  <select value={form.school_id ?? ''} onChange={e => setForm(f => ({ ...f, school_id: e.target.value || null }))}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-violet-500">
                    <option value="">— Select school —</option>
                    {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              )}

              {/* Label */}
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-white/40">Account Label <span className="text-rose-400">*</span></label>
                <input value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                  placeholder="e.g. Main Collection Account, School Fees Account"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-violet-500" />
              </div>

              {/* Bank + Account type */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1 col-span-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-white/40">Bank Name <span className="text-rose-400">*</span></label>
                  <select value={form.bank_name} onChange={e => setForm(f => ({ ...f, bank_name: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-violet-500">
                    <option value="">— Select bank —</option>
                    {NIGERIAN_BANKS.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-white/40">Account Number <span className="text-rose-400">*</span></label>
                  <input value={form.account_number} onChange={e => setForm(f => ({ ...f, account_number: e.target.value.replace(/\D/g, '').slice(0, 10) }))}
                    placeholder="10 digits" maxLength={10}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-violet-500 font-mono tracking-widest" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-white/40">Account Type</label>
                  <select value={form.account_type} onChange={e => setForm(f => ({ ...f, account_type: e.target.value as any }))}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-violet-500">
                    <option value="savings">Savings</option>
                    <option value="current">Current</option>
                  </select>
                </div>
              </div>

              {/* Account name */}
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-white/40">Account Name <span className="text-rose-400">*</span></label>
                <input value={form.account_name} onChange={e => setForm(f => ({ ...f, account_name: e.target.value }))}
                  placeholder="Exact name on the bank account"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-violet-500" />
              </div>

              {/* Payment note */}
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-white/40">Payment Note / Instructions</label>
                <textarea value={form.payment_note ?? ''} onChange={e => setForm(f => ({ ...f, payment_note: e.target.value }))}
                  placeholder="e.g. Use student name and class as payment reference. Send proof to school admin."
                  rows={3}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-violet-500 resize-none" />
              </div>

              {/* Active toggle */}
              <label className="flex items-center gap-3 cursor-pointer">
                <div className={`w-10 h-6 rounded-full transition-colors flex-shrink-0 ${form.is_active ? 'bg-violet-600' : 'bg-white/10'}`}
                  onClick={() => setForm(f => ({ ...f, is_active: !f.is_active }))}>
                  <div className={`w-5 h-5 bg-white rounded-full mt-0.5 transition-transform shadow ${form.is_active ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </div>
                <span className="text-sm text-white/60 font-semibold">Active — visible to students and staff</span>
              </label>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-white/40 hover:text-white transition-colors">Cancel</button>
              <button onClick={save}
                disabled={saving || !form.label.trim() || !form.bank_name || !form.account_number.trim() || !form.account_name.trim()}
                className="flex items-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-bold text-sm rounded-xl transition-all">
                {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <CheckIcon className="w-4 h-4" />}
                {editing ? 'Update' : 'Save Account'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
