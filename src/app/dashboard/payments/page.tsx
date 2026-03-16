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

  // School Invoice Builder state
  const [showSchoolInvoice, setShowSchoolInvoice] = useState(false);
  const [schoolInvForm, setSchoolInvForm] = useState({
    school_id: '',
    rate_per_child: '',
    rillcod_quota_percent: '',
    notes: '',
    due_date: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
    deposit_amount: '',
    pay_to_account_id: '',
    manual_student_count: '',
    show_revenue_share: true,
    show_whatsapp_option: true,
  });
  const [schoolInvStudentCount, setSchoolInvStudentCount] = useState<number | null>(null);
  const [loadingSchoolCount, setLoadingSchoolCount] = useState(false);

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

  // Auto-fetch student count when school is selected for school invoice
  async function fetchSchoolStudentCount(schoolId: string) {
    if (!schoolId) { setSchoolInvStudentCount(null); return; }
    setLoadingSchoolCount(true);
    const { count } = await db.from('portal_users')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'student')
      .eq('school_id', schoolId)
      .eq('is_active', true);
    setSchoolInvStudentCount(count ?? 0);
    setSchoolInvForm(prev => ({ ...prev, manual_student_count: String(count ?? 0) }));
    // Pre-fill quota percent from school record
    const sch = schools.find(s => s.id === schoolId);
    if (sch?.rillcod_quota_percent != null) {
      setSchoolInvForm(prev => ({ ...prev, rillcod_quota_percent: String(sch.rillcod_quota_percent) }));
    }
    setLoadingSchoolCount(false);
  }

  function handlePrintSchoolInvoice() {
    const sch = schools.find(s => s.id === schoolInvForm.school_id);
    if (!sch) { alert('Select a school first.'); return; }
    const count = parseInt(schoolInvForm.manual_student_count) || schoolInvStudentCount || 0;
    const ratePerChild = parseFloat(schoolInvForm.rate_per_child) || 0;
    const quotaPct = parseFloat(schoolInvForm.rillcod_quota_percent) || 0;
    const subtotal = ratePerChild * count;
    
    const deposit = parseFloat(schoolInvForm.deposit_amount) || 0;
    const balance = subtotal - deposit;
    
    const rillcodShare = Math.round(subtotal * (quotaPct / 100));
    const schoolShare = subtotal - rillcodShare;
    
    const payToAcc = accounts.find(a => a.id === schoolInvForm.pay_to_account_id);

    if (ratePerChild === 0) { alert('Enter a rate per child first.'); return; }

    const docRef = `SINV-${Date.now().toString(36).toUpperCase()}`;
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-NG', { year: 'numeric', month: 'long', day: 'numeric' });
    const dueStr = schoolInvForm.due_date
      ? new Date(schoolInvForm.due_date).toLocaleDateString('en-NG', { year: 'numeric', month: 'long', day: 'numeric' })
      : '—';
    const fmtNGN = (n: number) => `₦${n.toLocaleString('en-NG')}`;

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
<title>School Invoice — ${sch.name}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',Arial,sans-serif;background:#fff;color:#111;padding:22px 24px}
@page{size:A4;margin:14mm 15mm}
@media print{body{padding:0}}
.header{display:flex;align-items:flex-start;justify-content:space-between;border-bottom:4px solid #7c3aed;padding-bottom:14px;margin-bottom:18px}
.logo-block{display:flex;align-items:center;gap:12px}
.logo-circle{width:52px;height:52px;border-radius:50%;background:linear-gradient(135deg,#7c3aed,#4f46e5);display:flex;align-items:center;justify-content:center;color:white;font-weight:900;font-size:20px}
.org-name{font-size:22px;font-weight:900;color:#7c3aed;letter-spacing:-0.5px}
.org-sub{font-size:10px;color:#6b7280;margin-top:2px}
.inv-badge{text-align:right}
.inv-label{font-size:10px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:1px}
.inv-number{font-size:24px;font-weight:900;color:#4c1d95;letter-spacing:-0.5px}
.parties{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:18px}
.party-box{background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:12px 16px}
.party-label{font-size:9px;font-weight:800;color:#9ca3af;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px}
.party-name{font-size:15px;font-weight:900;color:#111827}
.party-sub{font-size:11px;color:#6b7280;margin-top:2px;line-height:1.4}
.meta-row{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:20px}
.meta-cell{background:#f3f0ff;border:1px solid #7c3aed22;border-radius:8px;padding:10px 12px;text-align:center}
.meta-label{font-size:8px;font-weight:700;color:#7c3aed;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px}
.meta-val{font-size:15px;font-weight:900;color:#4c1d95}
table{width:100%;border-collapse:collapse;margin-bottom:20px;border-radius:8px;overflow:hidden}
thead tr{background:#4c1d95;color:white}
thead th{padding:9px 12px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px}
tbody tr{border-bottom:1px solid #e5e7eb}
tbody tr:nth-child(even){background:#f9fafb}
tbody td{padding:8px 12px;font-size:12px;color:#374151}
.totals-box{background:#f3f0ff;border:1px solid #7c3aed22;border-radius:8px;padding:16px;margin-bottom:12px;display:flex;flex-direction:column;gap:6px}
.totals-row{display:flex;justify-content:space-between;align-items:center}
.totals-label{font-size:11px;color:#6b7280}
.totals-val{font-size:12px;font-weight:700;color:#374151}
.totals-grand-label{font-size:14px;font-weight:900;color:#4c1d95}
.totals-grand-val{font-size:20px;font-weight:900;color:#4c1d95}
.balance-box{background:#fff7ed;border:2px solid #ea580c;padding:12px 16px;border-radius:8px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:center}
.balance-label{font-size:12px;font-weight:900;color:#9a3412;text-transform:uppercase;letter-spacing:1px}
.balance-val{font-size:22px;font-weight:950;color:#ea580c}
.revenue-split{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px}
.split-box{border-radius:8px;padding:12px 16px;text-align:center}
.split-rillcod{background:linear-gradient(135deg,#7c3aed11,#4f46e511);border:1px solid #7c3aed44}
.split-school{background:linear-gradient(135deg,#05966911,#059669aa11);border:1px solid #05966944}
.split-label{font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px}
.split-pct{font-size:14px;font-weight:900}
.split-amount{font-size:18px;font-weight:900;margin-top:2px}
.split-sub{font-size:9px;color:#9ca3af;margin-top:2px}
.bank-box{background:#f8fafc;border:1px solid #33415522;border-radius:8px;padding:14px;margin-bottom:18px}
.bank-title{font-size:10px;font-weight:800;color:#64748b;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px}
.bank-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.bank-cell{font-size:11px}
.bank-label{color:#94a3b8;font-weight:700;display:block;margin-bottom:1px;font-size:9px}
.bank-val{color:#334155;font-weight:800}
.notes-box{background:#fef3c7;border:1px solid #fbbf24;border-radius:8px;padding:10px 14px;margin-bottom:18px;font-size:11px;color:#92400e}
.footer{border-top:1px solid #e5e7eb;padding-top:14px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-top:8px}
.sig-box{text-align:center}
.sig-line{border-bottom:1px solid #374151;height:34px;margin-bottom:5px}
.sig-label{font-size:8px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px}
.watermark{text-align:center;margin-top:12px;font-size:8px;color:#9ca3af}
.status-paid{color:#059669;background:#d1fae5;padding:2px 10px;border-radius:20px;font-weight:800;font-size:11px}
.status-due{color:#d97706;background:#fef3c7;padding:2px 10px;border-radius:20px;font-weight:800;font-size:11px}
hr{border:none;border-top:1px solid #7c3aed22;margin:8px 0}
</style></head><body>
<div class="header">
  <div class="logo-block">
    <div class="logo-circle">R</div>
    <div>
      <div class="org-name">Rillcod Academy</div>
      <div class="org-sub">Technology &amp; Innovation in Education</div>
      <div style="font-size:9px;color:#7c3aed;margin-top:2px">www.rillcod.com · hello@rillcod.com</div>
    </div>
  </div>
  <div class="inv-badge">
    <div class="inv-label">School Invoice</div>
    <div class="inv-number">${docRef}</div>
    <div style="font-size:10px;color:#6b7280;margin-top:4px"><b>Date:</b> ${dateStr}</div>
    <div style="font-size:10px;color:#6b7280"><b>Due:</b> ${dueStr}</div>
    <div style="margin-top:6px"><span class="${balance <= 0 ? 'status-paid' : 'status-due'}">${balance <= 0 ? 'Fully Paid' : 'Awaiting Payment'}</span></div>
  </div>
</div>
<div class="parties">
  <div class="party-box">
    <div class="party-label">From (Billed By)</div>
    <div class="party-name">Rillcod Academy</div>
    <div class="party-sub">Technology &amp; Innovation in Education<br/>STEM / AI / Coding Education Partner</div>
  </div>
  <div class="party-box">
    <div class="party-label">To (Bill To)</div>
    <div class="party-name">${sch.name}</div>
    <div class="party-sub">School Partner — Academic Session Invoice<br/>Payment due by ${dueStr}</div>
  </div>
</div>
<div class="meta-row">
  <div class="meta-cell"><div class="meta-label">Students</div><div class="meta-val">${count}</div></div>
  <div class="meta-cell"><div class="meta-label">Rate / Child</div><div class="meta-val">${fmtNGN(ratePerChild)}</div></div>
  <div class="meta-cell"><div class="meta-label">Rillcod %</div><div class="meta-val">${quotaPct}%</div></div>
  <div class="meta-cell"><div class="meta-label">School %</div><div class="meta-val">${100 - quotaPct}%</div></div>
</div>
<table>
<thead><tr><th>Description</th><th style="text-align:center">Students</th><th style="text-align:right">Rate / Child</th><th style="text-align:right">Amount</th></tr></thead>
<tbody>
  <tr>
    <td><b>STEM / AI / Coding Programme Fee</b><br><span style="font-size:10px;color:#9ca3af">${sch.name} · Academic Term</span></td>
    <td style="text-align:center;font-weight:700">${count}</td>
    <td style="text-align:right">${fmtNGN(ratePerChild)}</td>
    <td style="text-align:right;font-weight:700">${fmtNGN(subtotal)}</td>
  </tr>
</tbody>
</table>
<div class="totals-box">
  <div class="totals-row"><span class="totals-label">Total Fee (${count} students × ${fmtNGN(ratePerChild)})</span><span class="totals-val">${fmtNGN(subtotal)}</span></div>
  <div class="totals-row"><span class="totals-label">Less Deposit / Previous Payment</span><span class="totals-val" style="color:#059669">(${fmtNGN(deposit)})</span></div>
  <hr/>
  <div class="totals-row"><span class="totals-grand-label">Total Payable Amount</span><span class="totals-grand-val">${fmtNGN(balance)}</span></div>
</div>

${balance > 0 ? `
<div class="balance-box">
  <div class="balance-label">Outstanding Balance</div>
  <div class="balance-val">${fmtNGN(balance)}</div>
</div>
` : ''}

${schoolInvForm.show_revenue_share ? `
<div style="font-size:11px;font-weight:800;color:#4c1d95;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Revenue Allocation &amp; Split</div>
<div class="revenue-split">
  <div class="split-box split-rillcod">
    <div class="split-label" style="color:#7c3aed">Rillcod Academy</div>
    <div class="split-pct" style="color:#7c3aed">${quotaPct}%</div>
    <div class="split-amount" style="color:#4c1d95">${fmtNGN(rillcodShare)}</div>
    <div class="split-sub">To be remitted to Rillcod Academy upon collection</div>
  </div>
  <div class="split-box split-school">
    <div class="split-label" style="color:#059669">${sch.name}</div>
    <div class="split-pct" style="color:#059669">${100 - quotaPct}%</div>
    <div class="split-amount" style="color:#065f46">${fmtNGN(schoolShare)}</div>
    <div class="split-sub">School's share of the programme fee</div>
  </div>
</div>
` : ''}

${payToAcc ? `
<div class="bank-box">
  <div class="bank-title">Payment Instructions (Pay To)</div>
  <div class="bank-grid">
    <div class="bank-cell"><span class="bank-label">Bank Name</span><span class="bank-val">${payToAcc.bank_name}</span></div>
    <div class="bank-cell"><span class="bank-label">Account Number</span><span class="bank-val" style="font-size:14px;letter-spacing:1px">${payToAcc.account_number}</span></div>
    <div class="bank-cell" style="grid-column: span 2"><span class="bank-label">Account Name</span><span class="bank-val">${payToAcc.account_name}</span></div>
  </div>
</div>
` : ''}

${schoolInvForm.show_whatsapp_option ? `
<div style="background:#dcfce7; border:1px solid #16a34a33; border-radius:8px; padding:10px 14px; margin-bottom:18px; font-size:11px; color:#166534; display:flex; align-items:center; gap:8px">
  <svg style="width:16px;height:16px;fill:currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.414 0 .018 5.393 0 12.03c0 2.12.554 4.189 1.604 6.046L0 24l6.109-1.603a11.803 11.803 0 005.937 1.597h.005c6.632 0 12.029-5.392 12.032-12.029a11.77 11.77 0 00-3.517-8.482z"/></svg>
  <span><b>WhatsApp Receipt:</b> Digital receipt will be sent to the school principal's registered WhatsApp number upon payment confirmation.</span>
</div>
` : ''}

${schoolInvForm.notes ? `<div class="notes-box"><b>Notes:</b> ${schoolInvForm.notes}</div>` : ''}
<div class="footer">
  <div class="sig-box"><div class="sig-line"></div><div class="sig-label">School Principal / Authority</div></div>
  <div class="sig-box"><div class="sig-line"></div><div class="sig-label">Rillcod Academy Representative</div></div>
  <div class="sig-box"><div class="sig-line"></div><div class="sig-label">Finance Officer / Stamp</div></div>
</div>
<div class="watermark">This is a computer-generated invoice from Rillcod Academy · Reference: ${docRef} · ${dateStr}</div>
</body></html>`;

    const w = window.open('', '_blank', 'width=900,height=800');
    if (!w) { alert('Pop-up blocked. Please allow pop-ups.'); return; }
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 700);
  }

  function calculateTotalWithFees(target: number) {
    const targetWithBuffer = target + 50; 
    const rate = 0.016; // 1.6% total
    const divisor = 1 - rate; // 0.984
    
    if (targetWithBuffer < 2500 * divisor) return Math.ceil(targetWithBuffer / divisor);
    if (targetWithBuffer < 125000) return Math.ceil((targetWithBuffer + 100) / divisor);
    return Math.ceil(targetWithBuffer + 2000);
  }

  // Redirect school users away from billing tab if they somehow land on it
  useEffect(() => {
    if (isSchool && view === 'billing') setView('accounts');
  }, [isSchool, view]);

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
              {(['accounts', 'monitoring', ...(!isSchool ? ['billing'] : [])] as const).map(v => (
                <button
                  key={v}
                  onClick={() => setView(v as any)}
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
              <div className="flex items-center gap-2">
                {isAdmin && schools.length > 0 && (
                  <button
                    onClick={() => setShowSchoolInvoice(v => !v)}
                    className={`px-5 py-2.5 font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-lg hover:scale-105 active:scale-95 ${showSchoolInvoice ? 'bg-violet-600 text-white shadow-violet-900/40' : 'bg-violet-600/20 border border-violet-500/30 text-violet-400'}`}>
                    {showSchoolInvoice ? '✕ Close' : '🏫 School Invoice'}
                  </button>
                )}
                {canManage && (
                  <button
                    onClick={() => setShowInvoiceForm(true)}
                    className="px-5 py-2.5 bg-amber-600 hover:bg-amber-500 text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-lg shadow-amber-900/40 hover:scale-105 active:scale-95">
                    + New Invoice
                  </button>
                )}
              </div>
            </div>
            
            {/* ── School Invoice Builder ── */}
            {showSchoolInvoice && isAdmin && (
              <div className="bg-violet-600/10 border border-violet-500/30 rounded-2xl p-6 space-y-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-black text-violet-400 uppercase tracking-widest mb-0.5">Intelligent School Invoice</p>
                    <p className="text-white font-bold text-sm">Compute and print a school invoice based on student count × rate per child</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="lg:col-span-2">
                    <label className="block text-[10px] font-black text-white/40 uppercase tracking-widest mb-1.5">Select School</label>
                    <select
                      value={schoolInvForm.school_id}
                      onChange={e => {
                        const sid = e.target.value;
                        setSchoolInvForm(prev => ({ ...prev, school_id: sid }));
                        fetchSchoolStudentCount(sid);
                      }}
                      className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-violet-500"
                    >
                      <option value="">— Choose school —</option>
                      {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-white/40 uppercase tracking-widest mb-1.5">Student Count Override</label>
                    <input
                      type="number"
                      min="0"
                      placeholder="Manual count"
                      value={schoolInvForm.manual_student_count}
                      onChange={e => setSchoolInvForm(prev => ({ ...prev, manual_student_count: e.target.value }))}
                      className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-violet-500 font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-white/40 uppercase tracking-widest mb-1.5">Rate per Child (₦)</label>
                    <input
                      type="number"
                      min="0"
                      placeholder="e.g. 5000"
                      value={schoolInvForm.rate_per_child}
                      onChange={e => setSchoolInvForm(prev => ({ ...prev, rate_per_child: e.target.value }))}
                      className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-violet-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-white/40 uppercase tracking-widest mb-1.5">
                      Rillcod % Share
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      placeholder="e.g. 60"
                      value={schoolInvForm.rillcod_quota_percent}
                      onChange={e => setSchoolInvForm(prev => ({ ...prev, rillcod_quota_percent: e.target.value }))}
                      className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-violet-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-white/40 uppercase tracking-widest mb-1.5">Due Date</label>
                    <input
                      type="date"
                      value={schoolInvForm.due_date}
                      onChange={e => setSchoolInvForm(prev => ({ ...prev, due_date: e.target.value }))}
                      className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-violet-500"
                    />
                  </div>
                  <div className="sm:col-span-2 lg:col-span-3">
                    <label className="block text-[10px] font-black text-white/40 uppercase tracking-widest mb-1.5">Notes (optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. First term 2025/2026 session"
                      value={schoolInvForm.notes}
                      onChange={e => setSchoolInvForm(prev => ({ ...prev, notes: e.target.value }))}
                      className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-violet-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-white/40 uppercase tracking-widest mb-1.5">Deposit Made (₦)</label>
                    <input
                      type="number"
                      min="0"
                      placeholder="Amount already paid"
                      value={schoolInvForm.deposit_amount}
                      onChange={e => setSchoolInvForm(prev => ({ ...prev, deposit_amount: e.target.value }))}
                      className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-violet-500 font-bold text-emerald-400"
                    />
                  </div>
                  <div className="lg:col-span-2">
                    <label className="block text-[10px] font-black text-white/40 uppercase tracking-widest mb-1.5">Pay To (Rillcod Account)</label>
                    <select
                      value={schoolInvForm.pay_to_account_id}
                      onChange={e => setSchoolInvForm(prev => ({ ...prev, pay_to_account_id: e.target.value }))}
                      className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-violet-500"
                    >
                      <option value="">— Select Payment Account —</option>
                      {rillcodAccounts.map(a => (
                        <option key={a.id} value={a.id}>{a.label} ({a.bank_name})</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center gap-4 py-2">
                    <label className="flex items-center gap-2 cursor-pointer group">
                      <div 
                        onClick={() => setSchoolInvForm(prev => ({ ...prev, show_revenue_share: !prev.show_revenue_share }))}
                        className={`w-10 h-6 rounded-full transition-all flex items-center px-1 ${schoolInvForm.show_revenue_share ? 'bg-violet-600' : 'bg-white/10'}`}
                      >
                        <div className={`w-4 h-4 rounded-full bg-white transition-all ${schoolInvForm.show_revenue_share ? 'translate-x-4' : 'translate-x-0'}`} />
                      </div>
                      <span className="text-[10px] font-black text-white/40 uppercase tracking-widest group-hover:text-white transition-colors">Revenue Share</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer group">
                      <div 
                        onClick={() => setSchoolInvForm(prev => ({ ...prev, show_whatsapp_option: !prev.show_whatsapp_option }))}
                        className={`w-10 h-6 rounded-full transition-all flex items-center px-1 ${schoolInvForm.show_whatsapp_option ? 'bg-emerald-600' : 'bg-white/10'}`}
                      >
                        <div className={`w-4 h-4 rounded-full bg-white transition-all ${schoolInvForm.show_whatsapp_option ? 'translate-x-4' : 'translate-x-0'}`} />
                      </div>
                      <span className="text-[10px] font-black text-white/40 uppercase tracking-widest group-hover:text-white transition-colors">WhatsApp Receipt</span>
                    </label>
                  </div>
                </div>

                {/* Live computation preview */}
                {schoolInvForm.school_id && (
                  <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                    {loadingSchoolCount ? (
                      <div className="flex items-center gap-2 text-white/40 text-sm">
                        <div className="w-4 h-4 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                        Counting students…
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-6 items-center">
                        <div>
                          <p className="text-[9px] font-black text-white/30 uppercase tracking-widest">Active Students</p>
                          <p className="text-2xl font-black text-violet-400">{schoolInvForm.manual_student_count || schoolInvStudentCount || 0}</p>
                        </div>
                        <div>
                          <p className="text-[9px] font-black text-white/30 uppercase tracking-widest">Rate / Child</p>
                          <p className="text-2xl font-black text-white">₦{(parseFloat(schoolInvForm.rate_per_child) || 0).toLocaleString()}</p>
                        </div>
                        <div className="flex-1">
                          <p className="text-[9px] font-black text-white/30 uppercase tracking-widest">Total Invoice</p>
                          <p className="text-2xl font-black text-emerald-400">
                            ₦{((parseInt(schoolInvForm.manual_student_count) || schoolInvStudentCount || 0) * (parseFloat(schoolInvForm.rate_per_child) || 0)).toLocaleString()}
                          </p>
                        </div>
                        {schoolInvForm.deposit_amount && parseFloat(schoolInvForm.deposit_amount) > 0 && (
                          <div className="bg-emerald-500/10 px-4 py-2 rounded-xl border border-emerald-500/20">
                            <p className="text-[9px] font-black text-emerald-400 uppercase tracking-widest">Balance Payable</p>
                            <p className="text-2xl font-black text-emerald-300">
                              ₦{(((parseInt(schoolInvForm.manual_student_count) || schoolInvStudentCount || 0) * (parseFloat(schoolInvForm.rate_per_child) || 0)) - parseFloat(schoolInvForm.deposit_amount)).toLocaleString()}
                            </p>
                          </div>
                        )}
                        {schoolInvForm.rillcod_quota_percent && schoolInvForm.show_revenue_share && (
                          <>
                            <div>
                              <p className="text-[9px] font-black text-violet-400/60 uppercase tracking-widest">Rillcod {schoolInvForm.rillcod_quota_percent}%</p>
                              <p className="text-lg font-black text-violet-400">
                                ₦{Math.round((parseInt(schoolInvForm.manual_student_count) || schoolInvStudentCount || 0) * (parseFloat(schoolInvForm.rate_per_child) || 0) * (parseFloat(schoolInvForm.rillcod_quota_percent) / 100)).toLocaleString()}
                              </p>
                            </div>
                            <div>
                              <p className="text-[9px] font-black text-emerald-400/60 uppercase tracking-widest">School {100 - parseFloat(schoolInvForm.rillcod_quota_percent)}%</p>
                              <p className="text-lg font-black text-emerald-400">
                                ₦{Math.round((parseInt(schoolInvForm.manual_student_count) || schoolInvStudentCount || 0) * (parseFloat(schoolInvForm.rate_per_child) || 0) * ((100 - parseFloat(schoolInvForm.rillcod_quota_percent)) / 100)).toLocaleString()}
                              </p>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}

                <div className="flex justify-end">
                  <button
                    onClick={handlePrintSchoolInvoice}
                    disabled={!schoolInvForm.school_id || !(parseFloat(schoolInvForm.rate_per_child) > 0)}
                    className="flex items-center gap-2 px-6 py-3 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-lg shadow-violet-900/40"
                  >
                    <DocumentTextIcon className="w-4 h-4" /> Generate &amp; Print Invoice
                  </button>
                </div>
              </div>
            )}

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
