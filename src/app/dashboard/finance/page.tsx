// @refresh reset
'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import {
  BanknotesIcon, CreditCardIcon, ArrowPathIcon, PlusIcon, PencilIcon,
  TrashIcon, XMarkIcon, CheckCircleIcon, ClockIcon, BuildingOfficeIcon,
  ShieldCheckIcon, MagnifyingGlassIcon, ArrowDownTrayIcon, ArrowUpTrayIcon,
  BoltIcon, BellIcon, EnvelopeIcon, InformationCircleIcon, CheckBadgeIcon,
  ExclamationTriangleIcon, CalendarDaysIcon, ChevronDownIcon, ChevronUpIcon,
  EyeIcon, ArrowTrendingUpIcon, ArrowRightIcon, ReceiptPercentIcon,
  DocumentArrowDownIcon, PaperClipIcon,
} from '@/lib/icons';
import { OperationsHub } from '@/components/finance/ops/OperationsHub';
import { BillingCyclesTab } from '@/components/finance/BillingCyclesTab';

// ─── Nigerian Term Helpers ────────────────────────────────────────────────────
const TERMS = ['First Term', 'Second Term', 'Third Term'] as const;
type Term = (typeof TERMS)[number];

function getCurrentTerm(): Term {
  const m = new Date().getMonth() + 1; // 1-12
  if (m >= 9) return 'First Term';
  if (m >= 5) return 'Third Term';
  return 'Second Term';
}

function getCurrentAcademicYear(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  return m >= 9 ? `${y}/${y + 1}` : `${y - 1}/${y}`;
}

function buildAcademicYears(): string[] {
  const base = new Date().getFullYear();
  return Array.from({ length: 5 }, (_, i) => {
    const y = base - 2 + i;
    return `${y}/${y + 1}`;
  });
}

// ─── Shared Formatters ────────────────────────────────────────────────────────
function fmt(currency: string | null | undefined, amount: number): string {
  const c = (currency || 'NGN').toUpperCase();
  const n = Number(amount) || 0;
  if (c === 'USD') return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (c === 'NGN') return `₦${n.toLocaleString('en-NG')}`;
  return `${c} ${n.toLocaleString('en-US')}`;
}

function relDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ─── Types ────────────────────────────────────────────────────────────────────
type SubStatus = 'active' | 'cancelled' | 'expired' | 'suspended';
type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled';
type TxStatus = 'completed' | 'success' | 'pending' | 'processing' | 'failed' | 'refunded';
type SettlementStatus = 'pending' | 'paid' | 'void';

interface Subscription {
  id: string;
  school_id: string;
  plan_name: string;
  plan_type: string | null;
  billing_cycle: 'monthly' | 'quarterly' | 'yearly';
  amount: number;
  currency: string;
  status: SubStatus;
  start_date: string;
  end_date: string | null;
  max_students: number | null;
  max_teachers: number | null;
  features: Record<string, any>;
  created_at: string;
  schools?: { id: string; name: string; email: string } | null;
}

interface Invoice {
  id: string;
  invoice_number: string;
  school_id: string | null;
  portal_user_id: string | null;
  amount: number;
  currency: string;
  status: InvoiceStatus;
  due_date: string;
  items: any[];
  notes: string | null;
  created_at: string;
  portal_users?: { full_name: string; email: string } | null;
  schools?: { name: string } | null;
}

interface Transaction {
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
  invoice_id: string | null;
  course_id: string | null;
  receipt_url: string | null;
  paystack_fees?: number;
  portal_users?: { full_name: string; email: string } | null;
  schools?: { name: string } | null;
  courses?: { title: string } | null;
  receipts?: { receipt_number: string; pdf_url: string }[] | null;
  payment_gateway_response?: Record<string, unknown> | null;
}

interface Settlement {
  id: string;
  school_id: string;
  amount: number;
  currency: string;
  status: SettlementStatus;
  reference: string | null;
  notes: string | null;
  billing_cycle_id: string | null;
  paid_at: string | null;
  created_at: string;
  schools?: { name: string } | null;
}

interface BillingContact {
  school_id: string;
  representative_name: string | null;
  representative_email: string | null;
  representative_whatsapp: string | null;
  notes: string | null;
}

interface PaymentAccount {
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
}

interface AutoConfig {
  invoice_reminders_enabled: boolean;
  reminder_1_days_after_issue: number;
  reminder_2_days_before_due: number;
  reminder_3_days_after_due: number;
  auto_overdue_enabled: boolean;
  notify_email: boolean;
  notify_in_app: boolean;
}

interface AutoLog {
  id: string;
  triggered_by: string;
  invoices_scanned: number;
  reminders_sent: number;
  overdue_marked: number;
  errors: number;
  created_at: string;
}

// ─── Status Badge Configs ─────────────────────────────────────────────────────
const SUB_STATUS: Record<SubStatus, { label: string; cls: string }> = {
  active:    { label: 'Active',    cls: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
  cancelled: { label: 'Cancelled', cls: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30' },
  expired:   { label: 'Expired',   cls: 'bg-rose-500/20 text-rose-400 border-rose-500/30' },
  suspended: { label: 'Suspended', cls: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
};

const INV_STATUS: Record<InvoiceStatus, { label: string; cls: string }> = {
  draft:     { label: 'Draft',     cls: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30' },
  sent:      { label: 'Sent',      cls: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  paid:      { label: 'Paid',      cls: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
  overdue:   { label: 'Overdue',   cls: 'bg-rose-500/20 text-rose-400 border-rose-500/30' },
  cancelled: { label: 'Cancelled', cls: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30' },
};

const TX_STATUS: Record<string, { label: string; cls: string }> = {
  completed:  { label: 'Completed',  cls: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' },
  success:    { label: 'Completed',  cls: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' },
  pending:    { label: 'Pending',    cls: 'bg-amber-500/10 border-amber-500/20 text-amber-400' },
  processing: { label: 'Processing', cls: 'bg-blue-500/10 border-blue-500/20 text-blue-400' },
  failed:     { label: 'Failed',     cls: 'bg-rose-500/10 border-rose-500/20 text-rose-400' },
  refunded:   { label: 'Refunded',   cls: 'bg-purple-500/10 border-purple-500/20 text-purple-400' },
};

function txGatewayMeta(tx: { payment_gateway_response?: unknown }) {
  const raw = tx.payment_gateway_response;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>;
  return null;
}

/** Paid / settled rows — never show admin delete */
function isTerminalPaymentStatus(raw: string | null | undefined) {
  const s = String(raw || '').toLowerCase().trim();
  return s === 'completed' || s === 'success' || s === 'refunded';
}

const SETTLE_STATUS: Record<SettlementStatus, { label: string; cls: string }> = {
  pending: { label: 'Pending', cls: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
  paid:    { label: 'Paid',    cls: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
  void:    { label: 'Void',    cls: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30' },
};

const NIGERIAN_BANKS = [
  'Access Bank', 'Citibank Nigeria', 'Ecobank Nigeria', 'Fidelity Bank',
  'First Bank of Nigeria', 'First City Monument Bank (FCMB)', 'Guaranty Trust Bank (GTB)',
  'Heritage Bank', 'Jaiz Bank', 'Keystone Bank', 'Kuda Bank',
  'Moniepoint MFB', 'OPay', 'PalmPay', 'Polaris Bank', 'Providus Bank',
  'Stanbic IBTC Bank', 'Standard Chartered Bank', 'Sterling Bank', 'SunTrust Bank',
  'Union Bank', 'United Bank for Africa (UBA)', 'Unity Bank', 'VFD MFB',
  'Wema Bank', 'Zenith Bank',
].sort();

// ─── Sub-components ───────────────────────────────────────────────────────────
function Badge({ cls, label }: { cls: string; label: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold border ${cls}`}>
      {label}
    </span>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${checked ? 'bg-primary' : 'bg-muted'}`}
    >
      <span className={`inline-block h-4 w-4 rounded-full bg-primary-foreground shadow-md transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  );
}

function KpiCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <div className={`bg-card border border-border rounded-2xl p-5 space-y-1 relative overflow-hidden`}>
      <div className={`absolute top-0 left-0 w-1 h-full ${color}`} />
      <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest pl-3">{label}</p>
      <p className="text-2xl font-black text-foreground pl-3">{value}</p>
      {sub && <p className="text-xs text-muted-foreground pl-3">{sub}</p>}
    </div>
  );
}

// ─── TABS ─────────────────────────────────────────────────────────────────────
type TabKey =
  | 'overview'
  | 'billing_cycles'
  | 'operations'
  | 'subscriptions'
  | 'settlements'
  | 'automation'
  | 'setup';

type PortalRole = 'admin' | 'school' | 'teacher' | string;

type TabDef = {
  key: TabKey;
  label: string;
  icon: typeof BanknotesIcon;
  adminOnly?: boolean;
  /** Omit = any authenticated user that passes adminOnly check */
  roles?: readonly PortalRole[];
};

const ALL_TABS: TabDef[] = [
  { key: 'overview', label: 'Overview', icon: ArrowTrendingUpIcon, roles: ['admin', 'school'] },
  { key: 'billing_cycles', label: 'Billing cycles', icon: CalendarDaysIcon, roles: ['admin', 'school', 'teacher'] },
  { key: 'operations', label: 'Financial records', icon: ReceiptPercentIcon, roles: ['admin', 'school', 'teacher'] },
  { key: 'subscriptions', label: 'Subscriptions', icon: CreditCardIcon, roles: ['admin'] },
  { key: 'settlements', label: 'Settlements', icon: BuildingOfficeIcon, adminOnly: true },
  { key: 'automation', label: 'Automation', icon: BoltIcon, adminOnly: true },
  { key: 'setup', label: 'Setup', icon: CreditCardIcon, roles: ['admin'] },
];

function tabVisible(t: TabDef, role: PortalRole, isAdmin: boolean) {
  if (t.adminOnly && !isAdmin) return false;
  if (t.roles && !t.roles.includes(role)) return false;
  return true;
}

function pickTab(urlTab: string | null, role: PortalRole, isAdmin: boolean): TabKey {
  const visible = ALL_TABS.filter(x => tabVisible(x, role, isAdmin));
  const keys = visible.map(x => x.key);
  if (keys.length === 0) return 'overview'; // unused; page shows no-access state instead
  const normalized = urlTab === 'invoices' || urlTab === 'transactions' ? 'operations' : urlTab;
  if (normalized && keys.includes(normalized as TabKey)) return normalized as TabKey;
  return keys[0] as TabKey;
}

// ══════════════════════════════════════════════════════════════════════════════
// OverviewTab
// ══════════════════════════════════════════════════════════════════════════════
// ── Invoice Proof Upload (school role) ───────────────────────────────────────
function InvoiceProofUpload({ invoiceId, onUploaded }: { invoiceId: string; onUploaded: () => void }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [uploading, setUploading] = useState(false);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append('file', file);
    if (note.trim()) fd.append('note', note.trim());
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/proofs`, { method: 'POST', body: fd });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? 'Upload failed');
      toast.success('Proof uploaded — admin will verify within 24 hours.');
      setOpen(false);
      setNote('');
      onUploaded();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  if (!open) return (
    <button onClick={() => setOpen(true)}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/30 text-orange-400 rounded-lg transition-all">
      <ArrowUpTrayIcon className="w-3.5 h-3.5" /> Upload Proof
    </button>
  );

  return (
    <div className="mt-2 border border-orange-500/20 rounded-xl p-3 bg-orange-500/5 space-y-2">
      <p className="text-[10px] font-black uppercase tracking-widest text-orange-400">Upload Payment Evidence</p>
      <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
        placeholder="Optional: bank reference, transfer narration, or note for admin…"
        className="w-full px-3 py-2 bg-background border border-border rounded-lg text-xs text-foreground placeholder-muted-foreground/40 focus:outline-none focus:border-orange-500/50 resize-none" />
      <div className="flex items-center gap-2">
        <label className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all ${uploading ? 'bg-muted text-muted-foreground' : 'bg-orange-500 hover:bg-orange-400 text-white'}`}>
          <PaperClipIcon className="w-3.5 h-3.5" />
          {uploading ? 'Uploading…' : 'Choose File'}
          <input type="file" accept="image/*,.pdf" onChange={handleFile} disabled={uploading} className="hidden" />
        </label>
        <button type="button" onClick={() => setOpen(false)} className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
      </div>
      <p className="text-[10px] text-muted-foreground">Accepted: JPG, PNG, PDF — max 10 MB</p>
    </div>
  );
}

function OverviewTab({ profile }: { profile: any }) {
  const [analytics, setAnalytics] = useState<any>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [showManualPayment, setShowManualPayment] = useState(false);
  const [schools, setSchools] = useState<{ id: string; name: string }[]>([]);
  const [manualForm, setManualForm] = useState({
    school_id: '', amount: '', currency: 'NGN',
    payment_method: 'cash', reference: '', notes: '',
  });
  const [savingManual, setSavingManual] = useState(false);

  const isAdmin = profile?.role === 'admin';
  const canRecordManual = isAdmin;

  const load = useCallback(async () => {
    setLoading(true);
    const db = createClient();
    const isSchool = profile?.role === 'school';

    let invQ = db.from('invoices').select('id, amount, currency, status, due_date, created_at, invoice_number, school_id, portal_user_id');
    if (isSchool && profile?.school_id) invQ = invQ.eq('school_id', profile.school_id);
    const { data: invData } = await invQ.order('created_at', { ascending: false }).limit(200);
    setInvoices((invData ?? []) as Invoice[]);

    if (isAdmin) {
      const { data: sc } = await db.from('schools').select('id, name').eq('status', 'approved');
      setSchools(sc ?? []);
    }

    try {
      const res = await fetch('/api/payments/analytics', { cache: 'no-store' });
      if (res.ok) setAnalytics(await res.json());
    } catch { /* ignore */ }
    setLoading(false);
  }, [profile?.id, isAdmin]); // eslint-disable-line

  useEffect(() => { load(); }, [load]);

  async function recordManualPayment() {
    if (!manualForm.amount || Number(manualForm.amount) <= 0) { toast.error('Enter a valid amount'); return; }
    if (isAdmin && !manualForm.school_id) { toast.error('Select a school'); return; }
    setSavingManual(true);
    try {
      const res = await fetch('/api/payments/manual', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          school_id: manualForm.school_id || profile?.school_id,
          amount: Number(manualForm.amount),
          currency: manualForm.currency,
          payment_method: manualForm.payment_method,
          reference: manualForm.reference || undefined,
          notes: manualForm.notes || undefined,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error);
      toast.success('Manual payment recorded');
      setShowManualPayment(false);
      setManualForm({ school_id: '', amount: '', currency: 'NGN', payment_method: 'cash', reference: '', notes: '' });
      load();
    } catch (err: any) {
      toast.error(err.message ?? 'Failed');
    } finally { setSavingManual(false); }
  }

  async function markInvoicePaid(invId: string) {
    if (!confirm('Mark this invoice as paid?')) return;
    const db = createClient();
    const { error } = await db.from('invoices').update({ status: 'paid' }).eq('id', invId);
    if (error) toast.error(error.message);
    else { toast.success('Invoice marked paid'); load(); }
  }

  function exportInvoicesCsv() {
    if (!invoices.length) { toast.error('No invoices to export'); return; }
    const header = 'Invoice #,Amount,Currency,Status,Due Date,Created';
    const rows = invoices.map(i =>
      [(i as any).invoice_number ?? i.id, i.amount, i.currency, i.status, i.due_date, i.created_at].join(',')
    );
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `invoices-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  const totalRevenue = analytics?.totalRevenue ?? 0;
  const outstanding = invoices.filter(i => ['sent', 'overdue'].includes(i.status)).reduce((s, i) => s + i.amount, 0);
  const overdue = invoices.filter(i => i.status === 'overdue').length;
  const activeCount = invoices.filter(i => i.status === 'paid').length;

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Total Revenue" value={fmt('NGN', totalRevenue)} sub="All completed payments" color="bg-emerald-500" />
        <KpiCard label="Outstanding" value={fmt('NGN', outstanding)} sub={`${invoices.filter(i => ['sent','overdue'].includes(i.status)).length} open invoices`} color="bg-amber-500" />
        <KpiCard label="Overdue" value={overdue.toString()} sub="Invoices past due date" color="bg-rose-500" />
        <KpiCard label="Paid Invoices" value={activeCount.toString()} sub="Successfully settled" color="bg-violet-500" />
      </div>

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-3">
        <Link
          href="/dashboard/finance?tab=operations"
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground font-bold text-sm rounded-xl shadow-lg shadow-primary/20 hover:opacity-90 transition-opacity"
        >
          <EyeIcon className="w-4 h-4" /> Payments ops
        </Link>
        {canRecordManual && (
          <button
            onClick={() => setShowManualPayment(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-xl transition-colors"
          >
            <BanknotesIcon className="w-4 h-4" /> Record Manual Payment
          </button>
        )}
        <button
          onClick={exportInvoicesCsv}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-muted-foreground font-bold text-sm rounded-xl transition-colors"
        >
          <DocumentArrowDownIcon className="w-4 h-4" /> Export CSV
        </button>
      </div>

      {/* Recent Invoice Activity */}
      {(() => {
        const isSchoolView = profile?.role === 'school';
        // School: only show outstanding (sent/overdue) — paid/cleared invoices are removed
        const displayInvoices = isSchoolView
          ? invoices.filter(i => ['sent', 'overdue'].includes(i.status))
          : invoices;
        return (
          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h3 className="font-black text-foreground text-sm uppercase tracking-widest">
                {isSchoolView ? 'Outstanding Invoices' : 'Recent Invoice Activity'}
              </h3>
              <Link href="/dashboard/finance?tab=operations" className="text-xs text-primary font-bold hover:underline">
                View all <ArrowRightIcon className="w-3 h-3 inline" />
              </Link>
            </div>
            {displayInvoices.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                {isSchoolView ? 'No outstanding invoices' : 'No invoices found'}
              </p>
            ) : (
              <div className="divide-y divide-border">
                {displayInvoices.slice(0, 10).map(inv => {
                  const baseStatus = INV_STATUS[inv.status] ?? INV_STATUS.draft;
                  // School view: 'sent' → 'Outstanding', 'overdue' → 'Overdue (Action Required)'
                  const displayStatus = isSchoolView && inv.status === 'sent'
                    ? { label: 'Outstanding', cls: 'bg-amber-500/20 text-amber-400 border-amber-500/30' }
                    : isSchoolView && inv.status === 'overdue'
                    ? { label: 'Overdue — Action Required', cls: 'bg-rose-500/20 text-rose-400 border-rose-500/30' }
                    : baseStatus;
                  const canMarkPaid = canRecordManual && !isSchoolView && ['sent', 'overdue'].includes(inv.status);
                  return (
                    <div key={inv.id} className="px-5 py-3 space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold text-foreground">{fmt(inv.currency, inv.amount)}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {(inv as any).invoice_number && <span className="font-mono mr-2">{(inv as any).invoice_number}</span>}
                            Due {relDate(inv.due_date)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <Badge cls={displayStatus.cls} label={displayStatus.label} />
                          {canMarkPaid && (
                            <button
                              onClick={() => markInvoicePaid(inv.id)}
                              className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-[10px] font-black uppercase tracking-wide rounded-lg border border-emerald-500/20 transition-colors"
                            >
                              <CheckCircleIcon className="w-3.5 h-3.5" /> Mark Paid
                            </button>
                          )}
                        </div>
                      </div>
                      {/* School: Pay + Proof Upload on every outstanding invoice */}
                      {isSchoolView && (
                        <div className="space-y-2">
                          <div className="flex flex-wrap gap-2">
                            <a
                              href={`/api/invoices/${inv.id}/pdf`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-white/5 hover:bg-white/10 border border-white/10 text-muted-foreground rounded-lg transition-all"
                            >
                              <ArrowDownTrayIcon className="w-3.5 h-3.5" /> Download PDF
                            </a>
                          </div>
                          <InvoiceProofUpload invoiceId={inv.id} onUploaded={load} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}

      {/* Record Manual Payment Modal */}
      {showManualPayment && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-card border border-border rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div>
                <h3 className="font-black text-foreground">Record Manual Payment</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Cash, POS, bank transfer, cheque</p>
              </div>
              <button onClick={() => setShowManualPayment(false)} className="p-1.5 hover:bg-muted rounded-lg">
                <XMarkIcon className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {isAdmin && (
                <div>
                  <label className="block text-xs font-bold text-muted-foreground mb-1.5">School *</label>
                  <select value={manualForm.school_id} onChange={e => setManualForm(f => ({ ...f, school_id: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-foreground focus:outline-none focus:border-emerald-500">
                    <option value="">Select school…</option>
                    {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-muted-foreground mb-1.5">Amount *</label>
                  <input type="number" min="0" value={manualForm.amount}
                    onChange={e => setManualForm(f => ({ ...f, amount: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-foreground focus:outline-none focus:border-emerald-500" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-muted-foreground mb-1.5">Currency</label>
                  <select value={manualForm.currency} onChange={e => setManualForm(f => ({ ...f, currency: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-foreground focus:outline-none focus:border-emerald-500">
                    <option>NGN</option><option>USD</option><option>GBP</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-muted-foreground mb-1.5">Payment Method *</label>
                <select value={manualForm.payment_method} onChange={e => setManualForm(f => ({ ...f, payment_method: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-foreground focus:outline-none focus:border-emerald-500">
                  <option value="cash">Cash</option>
                  <option value="pos">POS Terminal</option>
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="cheque">Cheque</option>
                  <option value="mobile_money">Mobile Money</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-muted-foreground mb-1.5">Reference / Receipt No.</label>
                <input value={manualForm.reference} onChange={e => setManualForm(f => ({ ...f, reference: e.target.value }))}
                  placeholder="e.g. RCP-001 or teller number"
                  className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-foreground focus:outline-none focus:border-emerald-500" />
              </div>
              <div>
                <label className="block text-xs font-bold text-muted-foreground mb-1.5">Notes</label>
                <textarea value={manualForm.notes} onChange={e => setManualForm(f => ({ ...f, notes: e.target.value }))} rows={2}
                  placeholder="Payer name, what it covers, etc."
                  className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-foreground focus:outline-none focus:border-emerald-500 resize-none" />
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={recordManualPayment} disabled={savingManual}
                  className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold rounded-xl text-sm transition-colors">
                  {savingManual ? 'Recording…' : 'Record Payment'}
                </button>
                <button onClick={() => setShowManualPayment(false)}
                  className="px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-muted-foreground rounded-xl text-sm transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// SubscriptionsTab  (term + school-aware)
// ══════════════════════════════════════════════════════════════════════════════
const DEFAULT_CYCLE_DISPLAY = 'monthly';
const BLANK_SUB = {
  school_id: '', plan_name: '', plan_type: '', billing_cycle: 'monthly' as const,
  billing_cycle_display: 'monthly', term: getCurrentTerm(), academic_year: getCurrentAcademicYear(),
  amount: 0, currency: 'NGN', status: 'active' as SubStatus,
  start_date: new Date().toISOString().slice(0, 10), end_date: '',
  max_students: '', max_teachers: '', features: '{}',
};

function SubscriptionsTab({ profile }: { profile: any }) {
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [schools, setSchools] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  type SubForm = { school_id: string; plan_name: string; plan_type: string; billing_cycle: 'monthly' | 'quarterly' | 'yearly'; billing_cycle_display: string; term: Term; academic_year: string; amount: number; currency: string; status: SubStatus; start_date: string; end_date: string; max_students: string; max_teachers: string; features: string };
  const [form, setForm] = useState<SubForm>({ ...BLANK_SUB });
  const [search, setSearch] = useState('');
  const [termFilter, setTermFilter] = useState<Term | 'all'>('all');
  const [yearFilter, setYearFilter] = useState<string>('all');
  const isAdmin = profile?.role === 'admin';

  const load = useCallback(async () => {
    setLoading(true);
    const db = createClient();
    if (isAdmin) {
      const { data: sc } = await db.from('schools').select('id, name').eq('status', 'approved');
      setSchools(sc ?? []);
    }
    let q = db.from('subscriptions')
      .select('*, schools(id, name, email)')
      .order('created_at', { ascending: false });
    if (!isAdmin && profile?.school_id) q = q.eq('school_id', profile.school_id);
    const { data } = await q;
    setSubs((data ?? []) as unknown as Subscription[]);
    setLoading(false);
  }, [profile?.id]); // eslint-disable-line

  useEffect(() => { load(); }, [load]);

  function cycleLabel(sub: Subscription): string {
    if (sub.features?.billing_cycle_display === 'termly') {
      return `Termly · ${sub.features.term ?? ''} ${sub.features.academic_year ?? ''}`.trim();
    }
    const map: Record<string, string> = { monthly: 'Monthly', quarterly: 'Quarterly', yearly: 'Annual' };
    return map[sub.billing_cycle] ?? sub.billing_cycle;
  }

  const filtered = useMemo(() => {
    let list = subs;
    if (termFilter !== 'all') list = list.filter(s => s.features?.term === termFilter);
    if (yearFilter !== 'all') list = list.filter(s => s.features?.academic_year === yearFilter);
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(sub =>
        sub.plan_name.toLowerCase().includes(s) ||
        sub.schools?.name?.toLowerCase().includes(s)
      );
    }
    return list;
  }, [subs, termFilter, yearFilter, search]);

  function openNew() {
    setForm({ ...BLANK_SUB, school_id: isAdmin ? '' : (profile?.school_id ?? '') });
    setEditId(null);
    setShowForm(true);
  }

  function openEdit(sub: Subscription) {
    setForm({
      school_id: sub.school_id,
      plan_name: sub.plan_name,
      plan_type: sub.plan_type ?? '',
      billing_cycle: sub.billing_cycle as 'monthly' | 'quarterly' | 'yearly',
      billing_cycle_display: sub.features?.billing_cycle_display ?? sub.billing_cycle,
      term: sub.features?.term ?? getCurrentTerm(),
      academic_year: sub.features?.academic_year ?? getCurrentAcademicYear(),
      amount: sub.amount,
      currency: sub.currency,
      status: sub.status,
      start_date: sub.start_date?.slice(0, 10) ?? '',
      end_date: sub.end_date?.slice(0, 10) ?? '',
      max_students: String(sub.max_students ?? ''),
      max_teachers: String(sub.max_teachers ?? ''),
      features: JSON.stringify(sub.features ?? {}),
    });
    setEditId(sub.id);
    setShowForm(true);
  }

  async function save() {
    setSaving(true);
    try {
      const db = createClient();
      // Build features object — merge term data into existing features
      let featuresObj: Record<string, any> = {};
      try { featuresObj = JSON.parse(form.features || '{}'); } catch { /* ignore */ }
      if (form.billing_cycle_display === 'termly') {
        featuresObj.billing_cycle_display = 'termly';
        featuresObj.term = form.term;
        featuresObj.academic_year = form.academic_year;
      } else {
        delete featuresObj.billing_cycle_display;
        delete featuresObj.term;
        delete featuresObj.academic_year;
      }

      const payload: any = {
        school_id: form.school_id,
        plan_name: form.plan_name,
        plan_type: form.plan_type || null,
        billing_cycle: form.billing_cycle_display === 'termly' ? 'yearly' : form.billing_cycle,
        amount: Number(form.amount),
        currency: form.currency || 'NGN',
        status: form.status,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        max_students: form.max_students !== '' ? Number(form.max_students) : null,
        max_teachers: form.max_teachers !== '' ? Number(form.max_teachers) : null,
        features: featuresObj,
      };

      let error;
      if (editId) {
        ({ error } = await db.from('subscriptions').update(payload).eq('id', editId));
      } else {
        ({ error } = await db.from('subscriptions').insert(payload));
      }
      if (error) throw error;
      toast.success(editId ? 'Subscription updated' : 'Subscription created');
      setShowForm(false);
      load();
    } catch (err: any) {
      toast.error(err.message ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function del(id: string) {
    if (!confirm('Delete this subscription?')) return;
    const { error } = await createClient().from('subscriptions').delete().eq('id', id);
    if (error) toast.error(error.message);
    else { toast.success('Deleted'); load(); }
  }

  const academicYears = buildAcademicYears();

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
        <div className="relative flex-1 min-w-0">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search subscriptions…"
            className="w-full pl-9 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-violet-500"
          />
        </div>
        <select value={termFilter} onChange={e => setTermFilter(e.target.value as any)}
          className="px-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-foreground focus:outline-none">
          <option value="all">All Terms</option>
          {TERMS.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={yearFilter} onChange={e => setYearFilter(e.target.value)}
          className="px-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-foreground focus:outline-none">
          <option value="all">All Years</option>
          {academicYears.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <button onClick={load} className="p-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-colors">
          <ArrowPathIcon className="w-4 h-4 text-muted-foreground" />
        </button>
        {isAdmin && (
          <button onClick={openNew}
            className="flex items-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold rounded-xl transition-colors">
            <PlusIcon className="w-4 h-4" /> New
          </button>
        )}
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground text-sm">No subscriptions found</div>
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(sub => {
            const s = SUB_STATUS[sub.status] ?? SUB_STATUS.expired;
            return (
              <div key={sub.id} className="bg-card border border-border rounded-xl p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-black text-foreground text-sm truncate">{sub.plan_name}</p>
                    {sub.schools?.name && (
                      <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                        <BuildingOfficeIcon className="w-3 h-3" /> {sub.schools.name}
                      </p>
                    )}
                  </div>
                  <Badge cls={s.cls} label={s.label} />
                </div>

                {sub.features?.term && (
                  <div className="flex items-center gap-2 bg-violet-500/10 border border-violet-500/20 rounded-lg px-3 py-1.5">
                    <CalendarDaysIcon className="w-3.5 h-3.5 text-violet-400 flex-shrink-0" />
                    <span className="text-[11px] text-violet-300 font-bold">
                      {sub.features.term} · {sub.features.academic_year}
                    </span>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-muted/30 rounded-lg px-3 py-2">
                    <p className="text-muted-foreground text-[9px] uppercase tracking-widest mb-0.5">Amount</p>
                    <p className="font-black text-foreground">{fmt(sub.currency, sub.amount)}</p>
                  </div>
                  <div className="bg-muted/30 rounded-lg px-3 py-2">
                    <p className="text-muted-foreground text-[9px] uppercase tracking-widest mb-0.5">Cycle</p>
                    <p className="font-bold text-foreground">{cycleLabel(sub)}</p>
                  </div>
                  {sub.max_students && (
                    <div className="bg-muted/30 rounded-lg px-3 py-2">
                      <p className="text-muted-foreground text-[9px] uppercase tracking-widest mb-0.5">Students</p>
                      <p className="font-bold text-foreground">{sub.max_students}</p>
                    </div>
                  )}
                  {sub.end_date && (
                    <div className="bg-muted/30 rounded-lg px-3 py-2">
                      <p className="text-muted-foreground text-[9px] uppercase tracking-widest mb-0.5">Expires</p>
                      <p className="font-bold text-foreground">{relDate(sub.end_date)}</p>
                    </div>
                  )}
                </div>

                {isAdmin && (
                  <div className="flex gap-2 pt-1">
                    <button onClick={() => openEdit(sub)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs font-bold text-muted-foreground hover:text-foreground transition-colors">
                      <PencilIcon className="w-3.5 h-3.5" /> Edit
                    </button>
                    <button onClick={() => del(sub.id)}
                      className="p-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 rounded-lg transition-colors">
                      <TrashIcon className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-card border border-border rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-card border-b border-border flex items-center justify-between px-5 py-4 z-10">
              <h3 className="font-black text-foreground">{editId ? 'Edit Subscription' : 'New Subscription'}</h3>
              <button onClick={() => setShowForm(false)} className="p-1.5 hover:bg-muted rounded-lg transition-colors">
                <XMarkIcon className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {isAdmin && (
                <div>
                  <label className="block text-xs font-bold text-muted-foreground mb-1.5">School *</label>
                  <select value={form.school_id} onChange={e => setForm(f => ({ ...f, school_id: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-foreground focus:outline-none focus:border-violet-500">
                    <option value="">Select school…</option>
                    {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-bold text-muted-foreground mb-1.5">Plan Name *</label>
                  <input value={form.plan_name} onChange={e => setForm(f => ({ ...f, plan_name: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-foreground focus:outline-none focus:border-violet-500" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-muted-foreground mb-1.5">Amount</label>
                  <input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: Number(e.target.value) }))}
                    className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-foreground focus:outline-none focus:border-violet-500" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-muted-foreground mb-1.5">Currency</label>
                  <select value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-foreground focus:outline-none focus:border-violet-500">
                    <option>NGN</option><option>USD</option><option>GBP</option>
                  </select>
                </div>
              </div>

              {/* Billing Cycle — with Termly option */}
              <div>
                <label className="block text-xs font-bold text-muted-foreground mb-1.5">Billing Cycle</label>
                <select value={form.billing_cycle_display}
                  onChange={e => setForm(f => ({ ...f, billing_cycle_display: e.target.value, billing_cycle: e.target.value === 'termly' ? 'yearly' : e.target.value as any }))}
                  className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-foreground focus:outline-none focus:border-violet-500">
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="yearly">Annual</option>
                  <option value="termly">Termly (Nigerian School Term)</option>
                </select>
              </div>

              {/* Term fields — only visible when termly */}
              {form.billing_cycle_display === 'termly' && (
                <div className="bg-violet-500/10 border border-violet-500/20 rounded-xl p-4 space-y-3">
                  <p className="text-[11px] font-black text-violet-400 uppercase tracking-widest flex items-center gap-1.5">
                    <CalendarDaysIcon className="w-3.5 h-3.5" /> Nigerian School Term
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-muted-foreground mb-1.5">Term</label>
                      <select value={form.term} onChange={e => setForm(f => ({ ...f, term: e.target.value as Term }))}
                        className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-foreground focus:outline-none focus:border-violet-500">
                        {TERMS.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-muted-foreground mb-1.5">Academic Year</label>
                      <select value={form.academic_year} onChange={e => setForm(f => ({ ...f, academic_year: e.target.value }))}
                        className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-foreground focus:outline-none focus:border-violet-500">
                        {academicYears.map(y => <option key={y} value={y}>{y}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-muted-foreground mb-1.5">Status</label>
                  <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as SubStatus }))}
                    className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-foreground focus:outline-none focus:border-violet-500">
                    {Object.entries(SUB_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-muted-foreground mb-1.5">Plan Type</label>
                  <input value={form.plan_type} onChange={e => setForm(f => ({ ...f, plan_type: e.target.value }))} placeholder="e.g. basic"
                    className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-foreground focus:outline-none focus:border-violet-500" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-muted-foreground mb-1.5">Start Date</label>
                  <input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-foreground focus:outline-none focus:border-violet-500" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-muted-foreground mb-1.5">End Date</label>
                  <input type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-foreground focus:outline-none focus:border-violet-500" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-muted-foreground mb-1.5">Max Students</label>
                  <input type="number" value={form.max_students} onChange={e => setForm(f => ({ ...f, max_students: e.target.value }))} placeholder="Unlimited"
                    className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-foreground focus:outline-none focus:border-violet-500" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-muted-foreground mb-1.5">Max Teachers</label>
                  <input type="number" value={form.max_teachers} onChange={e => setForm(f => ({ ...f, max_teachers: e.target.value }))} placeholder="Unlimited"
                    className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-foreground focus:outline-none focus:border-violet-500" />
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button onClick={save} disabled={saving}
                  className="flex-1 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white font-bold rounded-xl text-sm transition-colors">
                  {saving ? 'Saving…' : editId ? 'Update' : 'Create'}
                </button>
                <button onClick={() => setShowForm(false)}
                  className="px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-muted-foreground rounded-xl text-sm transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// SettlementsTab (admin only)
// ══════════════════════════════════════════════════════════════════════════════
function SettlementsTab({ profile }: { profile: any }) {
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [schools, setSchools] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [form, setForm] = useState({ school_id: '', amount: '', currency: 'NGN', reference: '', notes: '' });

  const load = useCallback(async () => {
    setLoading(true);
    const [settleRes, schoolRes] = await Promise.all([
      fetch('/api/billing/settlements', { cache: 'no-store' }),
      createClient().from('schools').select('id, name').eq('status', 'approved'),
    ]);
    if (settleRes.ok) {
      const j = await settleRes.json();
      setSettlements((j.data ?? []) as Settlement[]);
    }
    setSchools(schoolRes.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function openNew() {
    setEditId(null);
    setForm({ school_id: '', amount: '', currency: 'NGN', reference: '', notes: '' });
    setShowForm(true);
  }

  function openEdit(s: Settlement) {
    setEditId(s.id);
    setForm({ school_id: s.school_id, amount: String(s.amount), currency: s.currency, reference: s.reference ?? '', notes: s.notes ?? '' });
    setShowForm(true);
  }

  async function save() {
    if (!editId && !form.school_id) { toast.error('School required'); return; }
    if (!form.amount) { toast.error('Amount required'); return; }
    setSaving(true);
    try {
      if (editId) {
        const res = await fetch('/api/billing/settlements', {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editId, amount: Number(form.amount), currency: form.currency, reference: form.reference, notes: form.notes }),
        });
        const j = await res.json();
        if (!res.ok) throw new Error(j.error);
        toast.success('Settlement updated');
      } else {
        const res = await fetch('/api/billing/settlements', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ school_id: form.school_id, amount: Number(form.amount), currency: form.currency, reference: form.reference, notes: form.notes }),
        });
        const j = await res.json();
        if (!res.ok) throw new Error(j.error);
        toast.success('Settlement created');
      }
      setShowForm(false);
      setForm({ school_id: '', amount: '', currency: 'NGN', reference: '', notes: '' });
      setEditId(null);
      load();
    } catch (err: any) {
      toast.error(err.message ?? 'Failed');
    } finally { setSaving(false); }
  }

  async function markStatus(id: string, status: 'paid' | 'void') {
    if (!confirm(`Mark as ${status}?`)) return;
    const res = await fetch('/api/billing/settlements', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status }),
    });
    if (res.ok) { toast.success(`Marked ${status}`); load(); }
    else toast.error('Failed');
  }

  async function deleteSettlement(id: string) {
    if (!confirm('Delete this settlement? Only non-paid settlements can be deleted.')) return;
    setDeletingId(id);
    try {
      const res = await fetch('/api/billing/settlements', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error);
      toast.success('Settlement deleted');
      load();
    } catch (err: any) {
      toast.error(err.message ?? 'Failed');
    } finally { setDeletingId(null); }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">School revenue settlements and payouts</p>
        <div className="flex gap-2">
          <button onClick={load} className="p-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-colors">
            <ArrowPathIcon className="w-4 h-4 text-muted-foreground" />
          </button>
          <button onClick={openNew}
            className="flex items-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold rounded-xl transition-colors">
            <PlusIcon className="w-4 h-4" /> New Settlement
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : settlements.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground text-sm">No settlements recorded yet</div>
      ) : (
        <div className="space-y-2">
          {settlements.map(s => {
            const sc = SETTLE_STATUS[s.status] ?? SETTLE_STATUS.pending;
            return (
              <div key={s.id} className="bg-card border border-border rounded-xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <BuildingOfficeIcon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      <p className="font-black text-foreground text-sm truncate">{s.schools?.name ?? 'Unknown School'}</p>
                      <Badge cls={sc.cls} label={sc.label} />
                    </div>
                    <p className="text-2xl font-black text-foreground">{fmt(s.currency, s.amount)}</p>
                    {s.reference && <p className="text-xs text-muted-foreground mt-1">Ref: {s.reference}</p>}
                    {s.notes && <p className="text-xs text-muted-foreground italic mt-1">{s.notes}</p>}
                    <p className="text-[10px] text-muted-foreground mt-2">Created {relDate(s.created_at)}{s.paid_at ? ` · Paid ${relDate(s.paid_at)}` : ''}</p>
                  </div>
                  <div className="flex flex-col gap-1.5 flex-shrink-0">
                    {s.status === 'pending' && (
                      <>
                        <button onClick={() => markStatus(s.id, 'paid')}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-xs font-bold rounded-lg border border-emerald-500/20 transition-colors">
                          <CheckCircleIcon className="w-3.5 h-3.5" /> Mark Paid
                        </button>
                        <button onClick={() => openEdit(s)}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-500/10 hover:bg-violet-500/20 text-violet-400 text-xs font-bold rounded-lg border border-violet-500/20 transition-colors">
                          <PencilIcon className="w-3.5 h-3.5" /> Edit
                        </button>
                        <button onClick={() => markStatus(s.id, 'void')}
                          className="px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 text-xs font-bold rounded-lg border border-amber-500/20 transition-colors">
                          Void
                        </button>
                      </>
                    )}
                    {s.status !== 'paid' && (
                      <button
                        disabled={deletingId === s.id}
                        onClick={() => deleteSettlement(s.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs font-bold rounded-lg border border-rose-500/20 transition-colors disabled:opacity-50">
                        <TrashIcon className="w-3.5 h-3.5" />
                        {deletingId === s.id ? '…' : 'Delete'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit Settlement Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-card border border-border rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h3 className="font-black text-foreground">{editId ? 'Edit Settlement' : 'New Settlement'}</h3>
              <button onClick={() => setShowForm(false)} className="p-1.5 hover:bg-muted rounded-lg">
                <XMarkIcon className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {!editId && (
                <div>
                  <label className="block text-xs font-bold text-muted-foreground mb-1.5">School *</label>
                  <select value={form.school_id} onChange={e => setForm(f => ({ ...f, school_id: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-foreground focus:outline-none focus:border-violet-500">
                    <option value="">Select school…</option>
                    {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-muted-foreground mb-1.5">Amount *</label>
                  <input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-foreground focus:outline-none focus:border-violet-500" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-muted-foreground mb-1.5">Currency</label>
                  <select value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-foreground focus:outline-none focus:border-violet-500">
                    <option>NGN</option><option>USD</option><option>GBP</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-muted-foreground mb-1.5">Reference</label>
                <input value={form.reference} onChange={e => setForm(f => ({ ...f, reference: e.target.value }))} placeholder="e.g. TRF-2025-001"
                  className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-foreground focus:outline-none focus:border-violet-500" />
              </div>
              <div>
                <label className="block text-xs font-bold text-muted-foreground mb-1.5">Notes</label>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2}
                  className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-foreground focus:outline-none focus:border-violet-500 resize-none" />
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={save} disabled={saving}
                  className="flex-1 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white font-bold rounded-xl text-sm transition-colors">
                  {saving ? 'Saving…' : editId ? 'Save Changes' : 'Create Settlement'}
                </button>
                <button onClick={() => setShowForm(false)}
                  className="px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-muted-foreground rounded-xl text-sm transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// AutomationTab (admin only)
// ══════════════════════════════════════════════════════════════════════════════
const DEFAULT_CONFIG: AutoConfig = {
  invoice_reminders_enabled: true,
  reminder_1_days_after_issue: 3,
  reminder_2_days_before_due: 2,
  reminder_3_days_after_due: 5,
  auto_overdue_enabled: true,
  notify_email: true,
  notify_in_app: true,
};

function AutomationTab() {
  const [config, setConfig] = useState<AutoConfig>(DEFAULT_CONFIG);
  const [logs, setLogs] = useState<AutoLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<any>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [cfgRes, logRes] = await Promise.all([
      fetch('/api/billing/automation', { cache: 'no-store' }),
      fetch('/api/billing/automation/logs', { cache: 'no-store' }),
    ]);
    if (cfgRes.ok) { const j = await cfgRes.json(); if (j.data) setConfig(j.data); }
    if (logRes.ok) { const j = await logRes.json(); setLogs(j.logs ?? []); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function save() {
    setSaving(true);
    const res = await fetch('/api/billing/automation', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    setSaving(false);
    if (res.ok) toast.success('Automation settings saved');
    else toast.error('Failed to save');
  }

  async function runNow() {
    setRunning(true); setRunResult(null);
    const res = await fetch('/api/cron/invoice-reminders', {
      method: 'POST', headers: { Authorization: `Bearer ${process.env.NEXT_PUBLIC_CRON_SECRET ?? ''}` },
    });
    setRunning(false);
    if (res.ok) { const j = await res.json(); setRunResult(j); toast.success('Automation run complete'); load(); }
    else toast.error('Run failed');
  }

  function cfg(key: keyof AutoConfig, val: any) { setConfig(c => ({ ...c, [key]: val })); }

  if (loading) return <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-6">
      {/* Master toggle + run */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="font-black text-foreground mb-1">Invoice Automation</h3>
            <p className="text-sm text-muted-foreground">Auto-send reminders and mark overdue invoices daily</p>
          </div>
          <div className="flex items-center gap-4">
            <Toggle checked={config.invoice_reminders_enabled} onChange={v => cfg('invoice_reminders_enabled', v)} />
            <button onClick={runNow} disabled={running}
              className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition-colors">
              {running ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : <BoltIcon className="w-4 h-4" />}
              Run Now
            </button>
          </div>
        </div>

        {runResult && (
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Scanned', val: runResult.invoices_scanned ?? runResult.scanned ?? 0, cls: 'text-blue-400' },
              { label: 'Sent', val: runResult.reminders_sent ?? runResult.sent ?? 0, cls: 'text-emerald-400' },
              { label: 'Overdue', val: runResult.overdue_marked ?? runResult.overdue ?? 0, cls: 'text-amber-400' },
              { label: 'Errors', val: runResult.errors ?? 0, cls: 'text-rose-400' },
            ].map(({ label, val, cls }) => (
              <div key={label} className="bg-muted/30 rounded-xl p-3 text-center">
                <p className={`text-xl font-black ${cls}`}>{val}</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest">{label}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Reminder thresholds */}
      <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
        <h3 className="font-black text-foreground text-sm uppercase tracking-widest">Reminder Schedule</h3>
        {[
          { label: 'Reminder 1 — Days after issue', key: 'reminder_1_days_after_issue' as keyof AutoConfig, color: 'bg-blue-500' },
          { label: 'Reminder 2 — Days before due', key: 'reminder_2_days_before_due' as keyof AutoConfig, color: 'bg-amber-500' },
          { label: 'Reminder 3 — Days after due', key: 'reminder_3_days_after_due' as keyof AutoConfig, color: 'bg-rose-500' },
        ].map(({ label, key, color }) => (
          <div key={key} className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className={`w-2 h-2 rounded-full ${color}`} />
              <p className="text-sm text-foreground">{label}</p>
            </div>
            <input
              type="number" min={0} max={30} value={config[key] as number}
              onChange={e => cfg(key, Math.max(0, Math.min(30, Number(e.target.value))))}
              className="w-20 px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-sm text-foreground text-center font-black focus:outline-none focus:border-violet-500 transition-colors"
            />
          </div>
        ))}
      </div>

      {/* Channel toggles */}
      <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
        <h3 className="font-black text-foreground text-sm uppercase tracking-widest">Channels</h3>
        {[
          { label: 'Auto-mark Overdue', key: 'auto_overdue_enabled' as keyof AutoConfig, icon: ExclamationTriangleIcon, desc: 'Automatically flag unpaid invoices as overdue' },
          { label: 'Email Notifications', key: 'notify_email' as keyof AutoConfig, icon: EnvelopeIcon, desc: 'Send reminder emails to billing contacts' },
          { label: 'In-App Notifications', key: 'notify_in_app' as keyof AutoConfig, icon: BellIcon, desc: 'Create in-app notification for school portal' },
        ].map(({ label, key, icon: Icon, desc }) => (
          <div key={key} className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Icon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <div>
                <p className="text-sm font-bold text-foreground">{label}</p>
                <p className="text-[11px] text-muted-foreground">{desc}</p>
              </div>
            </div>
            <Toggle checked={config[key] as boolean} onChange={v => cfg(key, v)} />
          </div>
        ))}
      </div>

      <button onClick={save} disabled={saving}
        className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white font-bold rounded-xl text-sm transition-colors">
        {saving ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : <CheckBadgeIcon className="w-4 h-4" />}
        Save Settings
      </button>

      {/* Run History */}
      {logs.length > 0 && (
        <div className="bg-card border border-border rounded-2xl p-5">
          <h3 className="font-black text-foreground text-sm uppercase tracking-widest mb-4">Run History</h3>
          <div className="space-y-2">
            {logs.slice(0, 10).map(log => (
              <div key={log.id} className="flex items-center justify-between py-2 border-b border-border last:border-0 text-sm">
                <div>
                  <p className="text-foreground font-bold">{relDate(log.created_at)}</p>
                  <p className="text-[11px] text-muted-foreground capitalize">{log.triggered_by}</p>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-blue-400">{log.invoices_scanned} scanned</span>
                  <span className="text-emerald-400">{log.reminders_sent} sent</span>
                  {log.errors > 0 && <span className="text-rose-400">{log.errors} errors</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// SetupTab — Payment Accounts + Billing Contacts
// ══════════════════════════════════════════════════════════════════════════════
function SetupTab({ profile }: { profile: any }) {
  const [accounts, setAccounts] = useState<PaymentAccount[]>([]);
  const [contact, setContact] = useState<BillingContact | null>(null);
  const [schools, setSchools] = useState<{ id: string; name: string }[]>([]);
  const [selectedSchool, setSelectedSchool] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAcctForm, setShowAcctForm] = useState(false);
  const [editAcct, setEditAcct] = useState<PaymentAccount | null>(null);
  const [editingContact, setEditingContact] = useState(false);
  const [acctForm, setAcctForm] = useState({
    owner_type: 'school' as 'rillcod' | 'school', school_id: '', label: '', bank_name: '',
    account_number: '', account_name: '', account_type: 'savings' as 'savings' | 'current',
    payment_note: '', is_active: true,
  });
  const [contactForm, setContactForm] = useState<Omit<BillingContact, 'school_id'>>({
    representative_name: '', representative_email: '', representative_whatsapp: '', notes: '',
  });
  const isAdmin = profile?.role === 'admin';
  const isSchool = profile?.role === 'school';
  const canManage = ['admin', 'school'].includes(profile?.role ?? '');

  const load = useCallback(async () => {
    setLoading(true);
    const db = createClient();
    if (isAdmin) {
      const { data: sc } = await db.from('schools').select('id, name').eq('status', 'approved');
      setSchools(sc ?? []);
    }
    const [acctRes] = await Promise.all([
      db.from('payment_accounts').select('*, schools(name, rillcod_quota_percent)').order('owner_type'),
    ]);
    setAccounts((acctRes.data ?? []) as PaymentAccount[]);

    const scopeId = isAdmin ? selectedSchool : profile?.school_id;
    if (scopeId) {
      const q = isAdmin ? `?school_id=${encodeURIComponent(scopeId)}` : '';
      try {
        const res = await fetch(`/api/billing/settings${q}`, { cache: 'no-store' });
        if (res.ok) {
          const j = await res.json();
          if (j.data) {
            setContact(j.data);
            setContactForm({
              representative_name: j.data.representative_name ?? '',
              representative_email: j.data.representative_email ?? '',
              representative_whatsapp: j.data.representative_whatsapp ?? '',
              notes: j.data.notes ?? '',
            });
          }
        }
      } catch { /* ignore */ }
    }
    setLoading(false);
  }, [profile?.id, selectedSchool]); // eslint-disable-line

  useEffect(() => { load(); }, [load]);

  async function saveContact() {
    setSaving(true);
    try {
      const scopeId = isAdmin ? selectedSchool : profile?.school_id;
      if (!scopeId) { toast.error('Select a school first'); setSaving(false); return; }
      const res = await fetch('/api/billing/settings', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ school_id: scopeId, ...contactForm }),
      });
      if (!res.ok) { const j = await res.json(); throw new Error(j.error); }
      toast.success('Billing contact saved');
      load();
    } catch (err: any) { toast.error(err.message ?? 'Failed'); }
    finally { setSaving(false); }
  }

  async function saveAccount() {
    setSaving(true);
    try {
      const db = createClient();
      // School role always saves their own school account
      const resolvedSchoolId = isSchool
        ? (profile?.school_id ?? null)
        : (acctForm.owner_type === 'rillcod' ? null : (acctForm.school_id || null));
      const payload = { ...acctForm, owner_type: isSchool ? 'school' : acctForm.owner_type, school_id: resolvedSchoolId };
      let error;
      if (editAcct) {
        ({ error } = await db.from('payment_accounts').update(payload).eq('id', editAcct.id));
      } else {
        ({ error } = await db.from('payment_accounts').insert(payload));
      }
      if (error) throw error;
      toast.success(editAcct ? 'Account updated' : 'Account added');
      setShowAcctForm(false); setEditAcct(null);
      load();
    } catch (err: any) { toast.error(err.message ?? 'Failed'); }
    finally { setSaving(false); }
  }

  async function deleteAccount(id: string) {
    if (!confirm('Delete this account?')) return;
    const { error } = await createClient().from('payment_accounts').delete().eq('id', id);
    if (error) toast.error(error.message);
    else { toast.success('Deleted'); load(); }
  }

  function editAccount(a: PaymentAccount) {
    setAcctForm({
      owner_type: a.owner_type, school_id: a.school_id ?? '',
      label: a.label, bank_name: a.bank_name, account_number: a.account_number,
      account_name: a.account_name, account_type: a.account_type,
      payment_note: a.payment_note ?? '', is_active: a.is_active,
    });
    setEditAcct(a); setShowAcctForm(true);
  }

  if (loading) return <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-6">
      {/* Payment Accounts */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h3 className="font-black text-foreground">Payment Accounts</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isSchool ? 'Company and school bank accounts visible to parents' : 'Bank accounts for receiving payments'}
            </p>
          </div>
          {/* Admin can add any account; school can only add their own school account */}
          {(isAdmin || isSchool) && (
            <button
              onClick={() => {
                setEditAcct(null);
                setAcctForm({
                  owner_type: 'school',
                  school_id: isSchool ? (profile?.school_id ?? '') : '',
                  label: '', bank_name: '', account_number: '', account_name: '',
                  account_type: 'savings', payment_note: '', is_active: true,
                });
                setShowAcctForm(true);
              }}
              className="flex items-center gap-2 px-3 py-2 bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold rounded-xl transition-colors">
              <PlusIcon className="w-3.5 h-3.5" /> {isSchool ? 'Add School Account' : 'Add Account'}
            </button>
          )}
        </div>
        <div className="p-4">
          {accounts.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No payment accounts configured</p>
          ) : (
            <div className="grid sm:grid-cols-2 gap-3">
              {accounts.map(a => {
                // School role: only show their own school accounts + rillcod accounts (view-only for rillcod)
                if (isSchool && a.owner_type === 'school' && a.school_id !== profile?.school_id) return null;
                // School can only edit their own school accounts, never rillcod accounts
                const canEdit = isAdmin || (isSchool && a.owner_type === 'school' && a.school_id === profile?.school_id);
                return (
                  <div key={a.id} className={`border rounded-xl p-4 space-y-3 ${a.owner_type === 'rillcod' ? 'border-violet-500/30 bg-violet-500/5' : 'border-border'}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {a.owner_type === 'rillcod'
                          ? <ShieldCheckIcon className="w-4 h-4 text-violet-400" />
                          : <BuildingOfficeIcon className="w-4 h-4 text-muted-foreground" />}
                        <div>
                          <p className="font-black text-foreground text-sm">{a.label}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {a.owner_type === 'rillcod' ? 'Rillcod Technologies (Company Account)' : (a.schools?.name ?? 'School Account')}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {!a.is_active && <span className="text-[10px] font-bold text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-full">Inactive</span>}
                        {canEdit && (
                          <button onClick={() => editAccount(a)} className="p-1.5 hover:bg-muted rounded-lg transition-colors">
                            <PencilIcon className="w-3.5 h-3.5 text-muted-foreground" />
                          </button>
                        )}
                        {isAdmin && (
                          <button onClick={() => deleteAccount(a.id)} className="p-1.5 hover:bg-rose-500/20 rounded-lg transition-colors">
                            <TrashIcon className="w-3.5 h-3.5 text-rose-400/60 hover:text-rose-400" />
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="bg-muted/30 rounded-lg px-3 py-2 flex items-center justify-between">
                      <div>
                        <p className="text-[9px] text-muted-foreground uppercase tracking-widest mb-0.5">{a.bank_name}</p>
                        <p className="font-black text-foreground tracking-wider">{a.account_number}</p>
                        <p className="text-xs text-muted-foreground">{a.account_name}</p>
                      </div>
                      <button onClick={() => navigator.clipboard?.writeText(a.account_number)}
                        className="text-[10px] font-bold text-violet-400 hover:text-violet-300 px-2 py-1 bg-violet-500/10 rounded-lg transition-colors">
                        Copy
                      </button>
                    </div>
                    {a.payment_note && <p className="text-xs text-muted-foreground italic">{a.payment_note}</p>}
                    {isSchool && a.owner_type === 'school' && (
                      <p className="text-[10px] text-emerald-400 font-bold flex items-center gap-1">
                        <CheckBadgeIcon className="w-3.5 h-3.5" /> Visible to parents
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Admin / Payment Contact */}
      {canManage && (
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <div>
              <h3 className="font-black text-foreground">Admin / Payment Contact</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Primary finance contact for billing and invoice reminders</p>
            </div>
            {/* School: if contact already set, show Change button */}
            {isSchool && contact && !editingContact && (
              <button
                onClick={() => setEditingContact(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-muted-foreground text-xs font-bold rounded-xl transition-colors">
                <PencilIcon className="w-3 h-3" /> Change
              </button>
            )}
          </div>
          <div className="p-5 space-y-4">
            {isAdmin && schools.length > 0 && (
              <div>
                <label className="block text-xs font-bold text-muted-foreground mb-1.5">School</label>
                <select value={selectedSchool} onChange={e => setSelectedSchool(e.target.value)}
                  className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-foreground focus:outline-none focus:border-violet-500">
                  <option value="">Select school…</option>
                  {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            )}

            {/* School view: if contact already set and not editing, show read-only display */}
            {isSchool && contact && !editingContact ? (
              <div className="space-y-3">
                <div className="grid sm:grid-cols-2 gap-3">
                  {contact.representative_name && (
                    <div className="bg-muted/30 rounded-xl px-4 py-3">
                      <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1">Contact Name</p>
                      <p className="text-sm font-bold text-foreground">{contact.representative_name}</p>
                    </div>
                  )}
                  {contact.representative_email && (
                    <div className="bg-muted/30 rounded-xl px-4 py-3">
                      <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1">Email</p>
                      <p className="text-sm font-bold text-foreground">{contact.representative_email}</p>
                    </div>
                  )}
                  {contact.representative_whatsapp && (
                    <div className="bg-muted/30 rounded-xl px-4 py-3">
                      <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1">WhatsApp</p>
                      <p className="text-sm font-bold text-foreground">{contact.representative_whatsapp}</p>
                    </div>
                  )}
                  {contact.notes && (
                    <div className="bg-muted/30 rounded-xl px-4 py-3 sm:col-span-2">
                      <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1">Notes</p>
                      <p className="text-sm text-foreground">{contact.notes}</p>
                    </div>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <CheckBadgeIcon className="w-3.5 h-3.5 text-emerald-400" />
                  Contact saved. Click "Change" above to update.
                </p>
              </div>
            ) : (
              /* Form: shown for admin always, for school if not yet set OR editing */
              <>
                {isSchool && !contact && (
                  <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3 text-xs text-amber-400 font-bold">
                    Enter your billing contact once. This is used for payment reminders and invoices.
                  </div>
                )}
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-muted-foreground mb-1.5">Representative Name</label>
                    <input value={contactForm.representative_name ?? ''} onChange={e => setContactForm(f => ({ ...f, representative_name: e.target.value }))}
                      className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-foreground focus:outline-none focus:border-violet-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-muted-foreground mb-1.5">Email</label>
                    <input type="email" value={contactForm.representative_email ?? ''} onChange={e => setContactForm(f => ({ ...f, representative_email: e.target.value }))}
                      className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-foreground focus:outline-none focus:border-violet-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-muted-foreground mb-1.5">WhatsApp</label>
                    <input value={contactForm.representative_whatsapp ?? ''} onChange={e => setContactForm(f => ({ ...f, representative_whatsapp: e.target.value }))} placeholder="+2348..."
                      className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-foreground focus:outline-none focus:border-violet-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-muted-foreground mb-1.5">Notes</label>
                    <input value={contactForm.notes ?? ''} onChange={e => setContactForm(f => ({ ...f, notes: e.target.value }))}
                      className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-foreground focus:outline-none focus:border-violet-500" />
                  </div>
                </div>
                <div className="flex gap-3">
                  <button onClick={async () => { await saveContact(); setEditingContact(false); }} disabled={saving}
                    className="flex items-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition-colors">
                    {saving ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : <CheckCircleIcon className="w-4 h-4" />}
                    Save Contact
                  </button>
                  {isSchool && editingContact && (
                    <button onClick={() => setEditingContact(false)} className="px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-muted-foreground text-sm rounded-xl transition-colors">
                      Cancel
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Account Form Modal */}
      {showAcctForm && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-card border border-border rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-card border-b border-border flex items-center justify-between px-5 py-4 z-10">
              <h3 className="font-black text-foreground">{editAcct ? 'Edit Account' : 'Add Payment Account'}</h3>
              <button onClick={() => { setShowAcctForm(false); setEditAcct(null); }} className="p-1.5 hover:bg-muted rounded-lg">
                <XMarkIcon className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {/* Admin can pick owner type; school role is locked to their own school */}
              {isAdmin ? (
                <>
                  <div>
                    <label className="block text-xs font-bold text-muted-foreground mb-1.5">Account Owner</label>
                    <select value={acctForm.owner_type} onChange={e => setAcctForm(f => ({ ...f, owner_type: e.target.value as any }))}
                      className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-foreground focus:outline-none focus:border-violet-500">
                      <option value="rillcod">Rillcod Technologies</option>
                      <option value="school">School</option>
                    </select>
                  </div>
                  {acctForm.owner_type === 'school' && (
                    <div>
                      <label className="block text-xs font-bold text-muted-foreground mb-1.5">School</label>
                      <select value={acctForm.school_id} onChange={e => setAcctForm(f => ({ ...f, school_id: e.target.value }))}
                        className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-foreground focus:outline-none focus:border-violet-500">
                        <option value="">Select school…</option>
                        {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </div>
                  )}
                </>
              ) : (
                <div className="bg-muted/30 rounded-xl px-4 py-3 text-xs text-muted-foreground">
                  <span className="font-bold text-foreground">School Account</span> — will be visible to parents alongside the company account.
                </div>
              )}
              <div>
                <label className="block text-xs font-bold text-muted-foreground mb-1.5">Label *</label>
                <input value={acctForm.label} onChange={e => setAcctForm(f => ({ ...f, label: e.target.value }))} placeholder="e.g. School Fees Account"
                  className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-foreground focus:outline-none focus:border-violet-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-muted-foreground mb-1.5">Bank Name *</label>
                  <select value={acctForm.bank_name} onChange={e => setAcctForm(f => ({ ...f, bank_name: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-foreground focus:outline-none focus:border-violet-500">
                    <option value="">Select bank…</option>
                    {NIGERIAN_BANKS.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-muted-foreground mb-1.5">Account Type</label>
                  <select value={acctForm.account_type} onChange={e => setAcctForm(f => ({ ...f, account_type: e.target.value as any }))}
                    className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-foreground focus:outline-none focus:border-violet-500">
                    <option value="savings">Savings</option>
                    <option value="current">Current</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-muted-foreground mb-1.5">Account Number *</label>
                  <input value={acctForm.account_number} onChange={e => setAcctForm(f => ({ ...f, account_number: e.target.value }))} maxLength={10}
                    className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-foreground focus:outline-none focus:border-violet-500" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-muted-foreground mb-1.5">Account Name *</label>
                  <input value={acctForm.account_name} onChange={e => setAcctForm(f => ({ ...f, account_name: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-foreground focus:outline-none focus:border-violet-500" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-muted-foreground mb-1.5">Payment Note</label>
                <input value={acctForm.payment_note} onChange={e => setAcctForm(f => ({ ...f, payment_note: e.target.value }))} placeholder="Optional note shown to payers"
                  className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-foreground focus:outline-none focus:border-violet-500" />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-foreground font-bold">Active</span>
                <Toggle checked={acctForm.is_active} onChange={v => setAcctForm(f => ({ ...f, is_active: v }))} />
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={saveAccount} disabled={saving}
                  className="flex-1 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white font-bold rounded-xl text-sm transition-colors">
                  {saving ? 'Saving…' : editAcct ? 'Update' : 'Add Account'}
                </button>
                <button onClick={() => { setShowAcctForm(false); setEditAcct(null); }}
                  className="px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-muted-foreground rounded-xl text-sm transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Main Finance Page
// ══════════════════════════════════════════════════════════════════════════════
export default function FinancePage() {
  const { profile, loading: authLoading, profileLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [tab, setTab] = useState<TabKey>('overview');
  const tabParam = searchParams.get('tab');

  // Update URL on tab change
  function switchTab(key: TabKey) {
    setTab(key);
    const url = new URL(window.location.href);
    url.searchParams.set('tab', key);
    window.history.replaceState({}, '', url.toString());
  }

  useEffect(() => {
    if (!authLoading && !profileLoading && !profile) router.replace('/login');
  }, [authLoading, profileLoading, profile, router]);

  useEffect(() => {
    if (!profile) return;
    const isAdminUser = profile.role === 'admin';
    setTab(pickTab(tabParam, profile.role, isAdminUser));
  }, [tabParam, profile?.id, profile?.role]);

  if (authLoading || profileLoading || !profile) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const isAdmin = profile.role === 'admin';
  const visibleTabs = ALL_TABS.filter(t => tabVisible(t, profile.role, isAdmin));

  if (visibleTabs.length === 0) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
          <div className="mb-6">
            <h1 className="text-2xl sm:text-3xl font-black text-foreground tracking-tight">
              {profile.role === 'school' ? 'My Billing' : 'Finance Ops'}
            </h1>
          </div>
          <div className="rounded-none border border-border bg-card p-6 text-sm text-muted-foreground">
            <p className="font-bold text-foreground">No finance tools for this account</p>
            <p className="mt-2">Use <Link className="text-primary underline font-semibold" href="/dashboard/money">My Money</Link> for your personal ledger, or{' '}
              <Link className="text-primary underline font-semibold" href="/dashboard/my-payments">My payments</Link> /{' '}
              <Link className="text-primary underline font-semibold" href="/dashboard/parent-invoices">Invoices &amp; payments</Link> to pay.</p>
            <Link href="/dashboard" className="inline-block mt-4 text-primary font-bold underline">Back to dashboard</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-black text-foreground tracking-tight">
            {profile.role === 'school' ? 'My Billing' : 'Finance Ops'}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {profile.role === 'school'
              ? 'Your school\u2019s invoices, receipts and downloadable billing records'
              : 'Control panel \u2014 billing, payments, subscriptions, settlements, reconciliation'}
            {profile.role === 'school' && profile.school_id && (
              <span className="ml-2 inline-flex items-center gap-1 text-violet-400 font-bold">
                <BuildingOfficeIcon className="w-3.5 h-3.5" /> Your school
              </span>
            )}
          </p>
        </div>

        {/* Tab Bar */}
        <div className="mb-6 -mx-4 sm:mx-0">
          <div className="flex overflow-x-auto gap-1 px-4 sm:px-0 pb-1 scrollbar-hide">
            {visibleTabs.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => switchTab(key)}
                className={`flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition-all flex-shrink-0 ${
                  tab === key
                    ? 'bg-violet-600 text-white shadow-lg shadow-violet-500/25'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span className="hidden sm:inline">{label}</span>
                <span className="sm:hidden">{label.split(' ')[0]}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Tab Content */}
        <div className="min-h-[400px]">
          {tab === 'overview' && <OverviewTab profile={profile} />}
          {tab === 'billing_cycles' && <BillingCyclesTab profile={profile} />}
          {tab === 'operations' && <OperationsHub embedded />}
          {tab === 'subscriptions' && <SubscriptionsTab profile={profile} />}
          {tab === 'settlements' && isAdmin && <SettlementsTab profile={profile} />}
          {tab === 'automation' && isAdmin && <AutomationTab />}
          {tab === 'setup' && <SetupTab profile={profile} />}
        </div>
      </div>
    </div>
  );
}
