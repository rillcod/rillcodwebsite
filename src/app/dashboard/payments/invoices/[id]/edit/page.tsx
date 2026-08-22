'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import SmartDocument from '@/components/finance/SmartDocument';
import { roleHasCapability } from '@/lib/auth/capabilities';
import {
  ArrowLeftIcon, PlusIcon, TrashIcon, EyeIcon,
  CheckCircleIcon, ClockIcon, XMarkIcon,
} from '@/lib/icons';

type LineItem = { description: string; quantity: number; unit_price: number; total: number };
type PaymentAccount = {
  id: string;
  owner_type?: string;
  is_active?: boolean;
  label?: string | null;
  bank_name: string;
  account_number: string;
  account_name: string;
};

const STATUSES: { value: string; label: string; color: string }[] = [
  { value: 'draft',     label: 'Draft',     color: 'border-border text-muted-foreground' },
  { value: 'sent',      label: 'Sent',      color: 'border-amber-500/40 text-amber-600 dark:text-amber-400' },
  { value: 'overdue',   label: 'Overdue',   color: 'border-rose-500/40 text-rose-600 dark:text-rose-400' },
  { value: 'cancelled', label: 'Cancelled', color: 'border-border text-muted-foreground' },
];

export default function EditInvoicePage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const { profile, loading: authLoading } = useAuth();
  const db = createClient();

  const [invoice, setInvoice] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [showPreview, setShowPreview] = useState(true);
  const [paymentAccounts, setPaymentAccounts] = useState<PaymentAccount[]>([]);
  const [paymentAccountsError, setPaymentAccountsError] = useState<string | null>(null);

  // Form state
  const [form, setForm] = useState({
    status: 'sent' as string,
    due_date: '',
    notes: '',
    portal_user_id: '',
    payment_method: 'bank_transfer',
    pay_to_account_id: '',
    items: [{ description: '', quantity: 1, unit_price: 0, total: 0 }] as LineItem[],
  });

  // Students list for payer selector
  const [students, setStudents] = useState<{ id: string; full_name: string; email: string }[]>([]);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/invoices/${id}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load invoice');
      const inv = json.data;
      setInvoice(inv);
      const rawItems = Array.isArray(inv.items) ? inv.items : [];
      setForm({
        status: inv.status,
        due_date: inv.due_date?.split('T')[0] ?? '',
        notes: inv.notes ?? '',
        portal_user_id: inv.portal_user_id ?? '',
        payment_method: typeof inv.metadata?.payment_method === 'string'
          ? inv.metadata.payment_method
          : 'bank_transfer',
        pay_to_account_id: typeof inv.metadata?.pay_to_account_id === 'string'
          ? inv.metadata.pay_to_account_id
          : '',
        items: rawItems.length > 0
          ? rawItems.map((it: any) => ({
              description: String(it.description ?? ''),
              quantity: Number(it.quantity ?? 1),
              unit_price: Number(it.unit_price ?? 0),
              total: Number(it.total ?? it.unit_price ?? 0),
            }))
          : [{ description: '', quantity: 1, unit_price: 0, total: 0 }],
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { if (!authLoading && profile) load(); }, [authLoading, profile, load]);

  useEffect(() => {
    if (!roleHasCapability(profile?.role, 'manage_finance')) return;
    setPaymentAccountsError(null);
    fetch('/api/payment-accounts', { cache: 'no-store' })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || 'Payment accounts could not be loaded.');
        const accounts = (body.data ?? []).filter(
          (account: PaymentAccount) => account.owner_type === 'rillcod' && account.is_active !== false,
        ) as PaymentAccount[];
        setPaymentAccounts(accounts);
        setForm((current) => current.payment_method === 'bank_transfer' && !current.pay_to_account_id && accounts[0]?.id
          ? { ...current, pay_to_account_id: accounts[0].id }
          : current);
      })
      .catch((reason) => {
        setPaymentAccounts([]);
        setPaymentAccountsError(reason instanceof Error ? reason.message : 'Payment accounts could not be loaded.');
      });
  }, [profile?.role]);

  useEffect(() => {
    if (form.payment_method !== 'bank_transfer' || paymentAccounts.length === 0) return;
    if (paymentAccounts.some((account) => account.id === form.pay_to_account_id)) return;
    setForm((current) => ({ ...current, pay_to_account_id: paymentAccounts[0].id }));
  }, [form.payment_method, form.pay_to_account_id, paymentAccounts]);

  useEffect(() => {
    if (!profile) return;
    const fetchStudents = async () => {
      let q = db.from('portal_users').select('id, full_name, email').eq('role', 'student').eq('is_active', true);
      if (profile.role === 'school' && profile.school_id) q = q.eq('school_id', profile.school_id);
      const { data } = await q.order('full_name');
      if (data) setStudents(data as any);
    };
    fetchStudents();
  }, [profile]);

  const totalAmount = useMemo(
    () => form.items.reduce((s, it) => s + it.quantity * it.unit_price, 0),
    [form.items],
  );

  const updateItem = (idx: number, field: keyof LineItem, val: string | number) => {
    setForm(f => {
      const items = [...f.items];
      const item = { ...items[idx], [field]: field === 'description' ? val : Number(val) };
      item.total = item.quantity * item.unit_price;
      items[idx] = item;
      return { ...f, items };
    });
  };

  const addItem = () => setForm(f => ({ ...f, items: [...f.items, { description: '', quantity: 1, unit_price: 0, total: 0 }] }));
  const removeItem = (idx: number) => setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const validItems = form.items.filter(it => it.description.trim() && it.unit_price > 0);
    if (validItems.length === 0) { setError('Add at least one line item with a description and price.'); return; }
    if (form.payment_method === 'bank_transfer' && !form.pay_to_account_id) {
      setError('Choose an active Rillcod payment account before saving this bank-transfer invoice.');
      return;
    }
    setSaving(true); setError(null);
    try {
      const items = validItems.map(it => ({ ...it, total: +(it.quantity * it.unit_price).toFixed(2) }));
      const res = await fetch(`/api/invoices/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: form.status,
          due_date: form.due_date || null,
          notes: form.notes || null,
          portal_user_id: form.portal_user_id || null,
          metadata: {
            payment_method: form.payment_method,
            ...(form.payment_method === 'bank_transfer'
              ? { pay_to_account_id: form.pay_to_account_id }
              : {}),
          },
          items,
          amount: items.reduce((s, it) => s + it.total, 0),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Save failed');
      setInvoice(json.data);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Build SmartDocument data from current form + invoice meta
  const previewData = useMemo(() => {
    // school invoice = school_id set + no portal_user_id (Rillcod → partner school)
    // school-billing = school_id set + portal_user_id set (school → its student)
    const isSchoolInvoice = !!invoice?.school_id && !invoice?.portal_user_id;
    const schoolBillingStudent = !!invoice?.school_id && !!invoice?.portal_user_id;
    const student = students.find(s => s.id === form.portal_user_id) ?? invoice?.portal_users;
    const paymentAccount = form.payment_method === 'bank_transfer'
      ? paymentAccounts.find((account) => account.id === form.pay_to_account_id) ?? null
      : null;
    return {
      id: invoice?.id,
      number: invoice?.invoice_number ?? '—',
      date: invoice?.created_at ? new Date(invoice.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—',
      dueDate: form.due_date ? new Date(form.due_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : undefined,
      status: form.status,
      items: form.items.filter(it => it.description).map(it => ({ ...it, total: it.quantity * it.unit_price })),
      amount: totalAmount,
      currency: invoice?.currency ?? 'NGN',
      notes: form.notes || undefined,
      stream: isSchoolInvoice ? ('school' as const) : ('individual' as const),
      studentName: isSchoolInvoice
        ? (invoice?.schools?.name ?? 'School')
        : (student?.full_name ?? 'Student Name'),
      studentEmail: isSchoolInvoice ? undefined : student?.email,
      // schoolName = the ISSUING entity shown top-right of the document
      schoolName: schoolBillingStudent
        ? (invoice?.schools?.name ?? 'Rillcod Technologies')
        : 'Rillcod Technologies',
      paymentMethod: form.payment_method,
      depositAccount: paymentAccount
        ? {
            bank_name: paymentAccount.bank_name,
            account_number: paymentAccount.account_number,
            account_name: paymentAccount.account_name,
          }
        : undefined,
    };
  }, [form, invoice, paymentAccounts, students, totalAmount]);

  if (authLoading || loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 mobile-page-root">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent animate-spin" />
        <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">Loading invoice…</p>
      </div>
    );
  }

  const canManageFinance = roleHasCapability(profile?.role, 'manage_finance');
  if (!canManageFinance) {
    return (
      <div className="max-w-2xl mx-auto py-16 text-center space-y-4 mobile-page-root">
        <p className="text-lg font-black text-foreground">Finance administrator access required</p>
        <p className="text-sm text-muted-foreground">You can view permitted invoices in Finance, but only an administrator can change an issued amount or payment destination.</p>
        <button onClick={() => router.back()} className="text-xs font-black uppercase tracking-widest text-primary underline">Go back</button>
      </div>
    );
  }

  if (invoice?.status === 'paid') {
    return (
      <div className="max-w-2xl mx-auto py-16 text-center space-y-4 mobile-page-root">
        <CheckCircleIcon className="w-12 h-12 text-emerald-600 dark:text-emerald-400 mx-auto" />
        <p className="text-lg font-black text-foreground">Invoice is already paid</p>
        <p className="text-sm text-muted-foreground">Paid invoices cannot be edited.</p>
        <button onClick={() => router.back()} className="text-xs font-black uppercase tracking-widest text-primary underline">Go back</button>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-16">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button title="Go back" onClick={() => router.back()} className="p-2 border border-border hover:border-foreground/30 text-muted-foreground hover:text-foreground transition-all">
          <ArrowLeftIcon className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-black text-foreground tracking-tight">Edit Invoice</h1>
            <span className="text-sm font-black text-primary">{invoice?.invoice_number}</span>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            {invoice?.portal_users?.full_name ?? invoice?.schools?.name ?? 'Unknown recipient'}
          </p>
        </div>
        <button
          onClick={() => setShowPreview(v => !v)}
          className={`flex items-center gap-2 px-4 py-2 border text-[10px] font-black uppercase tracking-widest transition-all ${showPreview ? 'border-primary/50 text-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}>
          <EyeIcon className="w-4 h-4" /> {showPreview ? 'Hide' : 'Show'} Preview
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 px-4 py-3 bg-rose-500/10 border border-rose-500/20 text-xs text-rose-600 dark:text-rose-400">
          <XMarkIcon className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 px-4 py-3 bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-600 dark:text-emerald-400">
          <CheckCircleIcon className="w-4 h-4" /> Invoice saved successfully.
        </div>
      )}

      {/* Split layout */}
      <div className={`gap-6 ${showPreview ? 'flex flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]' : ''}`}>

        {/* ── Left: Form ── */}
        <form onSubmit={handleSave} className="space-y-6">

          {/* Section: Status */}
          <div className="bg-card border border-border">
            <div className="px-6 py-3 border-b border-border flex items-center gap-2">
              <span className="w-1 h-4 bg-primary flex-shrink-0" />
              <p className="text-[10px] font-black uppercase tracking-widest text-foreground">Invoice Status</p>
            </div>
            <div className="p-6 flex flex-wrap gap-2">
              {STATUSES.map(s => (
                <button key={s.value} type="button"
                  onClick={() => setForm(f => ({ ...f, status: s.value }))}
                  className={`px-4 py-2 border text-[10px] font-black uppercase tracking-widest transition-all ${
                    form.status === s.value ? s.color + ' bg-white/5' : 'border-border text-muted-foreground hover:border-foreground/30'
                  }`}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Section: Recipient */}
          <div className="bg-card border border-border">
            <div className="px-6 py-3 border-b border-border flex items-center gap-2">
              <span className="w-1 h-4 bg-primary flex-shrink-0" />
              <p className="text-[10px] font-black uppercase tracking-widest text-foreground">Recipient</p>
            </div>
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-5">
              {invoice?.schools?.name && !invoice?.portal_user_id ? (
                <div className="col-span-2">
                  <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block mb-1.5">School</label>
                  <input title="School name" value={invoice.schools.name} disabled className="w-full px-4 py-2.5 bg-background border border-border text-sm text-muted-foreground opacity-60" readOnly />
                </div>
              ) : (
                <div className="col-span-2">
                  <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block mb-1.5">Student / Payer</label>
                  <select
                    title="Select student or payer"
                    value={form.portal_user_id}
                    onChange={e => setForm(f => ({ ...f, portal_user_id: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-background border border-border text-sm text-foreground focus:outline-none focus:border-primary transition-colors">
                    <option value="">— Select student —</option>
                    {students.map(s => <option key={s.id} value={s.id}>{s.full_name} ({s.email})</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block mb-1.5">Due Date</label>
                <input type="date" title="Due date" value={form.due_date}
                  onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-background border border-border text-sm text-foreground focus:outline-none focus:border-primary transition-colors" />
              </div>
            </div>
          </div>

          {/* Section: Line Items */}
          <div className="bg-card border border-border">
            <div className="px-6 py-3 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-1 h-4 bg-primary flex-shrink-0" />
                <p className="text-[10px] font-black uppercase tracking-widest text-foreground">Line Items</p>
              </div>
              <span className="text-xs font-black text-primary">₦{totalAmount.toLocaleString()}</span>
            </div>
            <div className="p-6 space-y-3">
              {/* Header row */}
              <div className="hidden sm:grid grid-cols-[1fr_80px_110px_40px] gap-2 text-[9px] font-black uppercase tracking-widest text-muted-foreground px-1">
                <span>Description</span><span className="text-center">Qty</span><span className="text-center">Unit Price (₦)</span><span />
              </div>
              {form.items.map((item, idx) => (
                <div key={idx} className="grid grid-cols-1 sm:grid-cols-[1fr_80px_110px_40px] gap-2 items-center">
                  <input
                    value={item.description}
                    onChange={e => updateItem(idx, 'description', e.target.value)}
                    placeholder="Description"
                    className="w-full px-3 py-2 bg-background border border-border text-sm text-foreground focus:outline-none focus:border-primary transition-colors"
                  />
                  <input
                    type="number" min={1} title="Quantity" value={item.quantity}
                    onChange={e => updateItem(idx, 'quantity', e.target.value)}
                    className="w-full px-3 py-2 bg-background border border-border text-sm text-foreground text-center focus:outline-none focus:border-primary transition-colors"
                  />
                  <input
                    type="number" min={0} step={100} title="Unit price" value={item.unit_price || ''}
                    onChange={e => updateItem(idx, 'unit_price', e.target.value)}
                    placeholder="0"
                    className="w-full px-3 py-2 bg-background border border-border text-sm text-foreground text-right font-mono focus:outline-none focus:border-primary transition-colors"
                  />
                  <button type="button" title="Remove item" onClick={() => removeItem(idx)} disabled={form.items.length === 1}
                    className="flex items-center justify-center w-9 h-9 border border-border text-rose-600/50 dark:text-rose-400/50 hover:text-rose-600 dark:hover:text-rose-400 hover:border-rose-500/30 transition-all disabled:opacity-20 disabled:cursor-not-allowed">
                    <TrashIcon className="w-3.5 h-3.5" />
                  </button>
                  {item.unit_price > 0 && (
                    <p className="col-span-full sm:hidden text-[10px] text-muted-foreground text-right">
                      Subtotal: ₦{(item.quantity * item.unit_price).toLocaleString()}
                    </p>
                  )}
                </div>
              ))}
              <button type="button" onClick={addItem}
                className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-brand-red-600 hover:text-primary transition-colors pt-1">
                <PlusIcon className="w-3.5 h-3.5" /> Add Line Item
              </button>
              <div className="pt-3 border-t border-border flex justify-end">
                <div className="text-right">
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Total Amount</p>
                  <p className="text-2xl font-black text-foreground mt-1">₦{totalAmount.toLocaleString()}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Section: Payment instructions */}
          <div className="bg-card border border-border">
            <div className="px-6 py-3 border-b border-border flex items-center gap-2">
              <span className="w-1 h-4 bg-primary flex-shrink-0" />
              <p className="text-[10px] font-black uppercase tracking-widest text-foreground">Payment Instructions</p>
            </div>
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block mb-1.5">Payment Method</label>
                <select
                  title="Payment method"
                  value={form.payment_method}
                  onChange={(event) => setForm((current) => ({
                    ...current,
                    payment_method: event.target.value,
                    pay_to_account_id: event.target.value === 'bank_transfer'
                      ? current.pay_to_account_id || paymentAccounts[0]?.id || ''
                      : '',
                  }))}
                  className="w-full px-4 py-2.5 bg-background border border-border text-sm text-foreground focus:outline-none focus:border-primary transition-colors"
                >
                  <option value="bank_transfer">Bank transfer</option>
                  <option value="online">Online payment</option>
                  <option value="cash">Cash</option>
                  <option value="pos">POS terminal</option>
                  <option value="cheque">Cheque</option>
                </select>
              </div>
              {form.payment_method === 'bank_transfer' ? (
                <div>
                  <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block mb-1.5">Pay To</label>
                  <select
                    title="Rillcod payment account"
                    value={form.pay_to_account_id}
                    onChange={(event) => setForm((current) => ({ ...current, pay_to_account_id: event.target.value }))}
                    disabled={paymentAccounts.length === 0}
                    className="w-full px-4 py-2.5 bg-background border border-border text-sm text-foreground focus:outline-none focus:border-primary transition-colors disabled:opacity-60"
                  >
                    <option value="">Select an active account</option>
                    {paymentAccounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.label || account.bank_name} · {account.account_number}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
              {paymentAccountsError ? (
                <div role="alert" className="md:col-span-2 border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-xs text-rose-700 dark:text-rose-300">
                  {paymentAccountsError} Saving a bank-transfer invoice is paused so an incomplete PDF cannot be issued.
                </div>
              ) : form.payment_method === 'bank_transfer' && form.pay_to_account_id ? (
                <p className="md:col-span-2 text-xs text-muted-foreground">
                  The selected account is verified by the server and captured with this revision. The same details appear in preview, PDF, email, and resend.
                </p>
              ) : null}
            </div>
          </div>

          {/* Section: Notes */}
          <div className="bg-card border border-border">
            <div className="px-6 py-3 border-b border-border flex items-center gap-2">
              <span className="w-1 h-4 bg-primary flex-shrink-0" />
              <p className="text-[10px] font-black uppercase tracking-widest text-foreground">Notes</p>
            </div>
            <div className="p-6">
              <textarea
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                rows={3}
                placeholder="Optional notes for this invoice…"
                className="w-full px-4 py-2.5 bg-background border border-border text-sm text-foreground focus:outline-none focus:border-primary transition-colors resize-none"
              />
            </div>
          </div>

          {/* Action bar */}
          <div className="flex flex-col sm:flex-row gap-3">
            <button type="button" onClick={() => router.back()}
              className="sm:w-40 px-6 py-3 border border-border text-xs font-black uppercase tracking-widest text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-all">
              Cancel
            </button>
            <button type="submit" disabled={saving || (form.payment_method === 'bank_transfer' && (!form.pay_to_account_id || !!paymentAccountsError))}
              className="flex-1 px-6 py-3 bg-primary hover:bg-primary disabled:opacity-50 text-white text-xs font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2">
              {saving && <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>

        {/* ── Right: Live Canvas Preview ── */}
        {showPreview && (
          <div>
            <div className="lg:sticky lg:top-6">
              <div className="flex items-center gap-2 mb-4">
                <span className="w-1 h-4 bg-primary flex-shrink-0" />
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Live Preview</p>
                <span className="text-[9px] text-primary/60 font-bold ml-1">— updates as you type</span>
              </div>
              <div className="bg-card border border-border p-4 overflow-auto max-h-[80vh]">
                <SmartDocument type="invoice" data={previewData} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
