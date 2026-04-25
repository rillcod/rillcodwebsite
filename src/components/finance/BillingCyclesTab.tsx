'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import {
  ArrowPathIcon,
  ArrowUpTrayIcon,
  CalendarDaysIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CreditCardIcon,
  PaperClipIcon,
  TrashIcon,
} from '@/lib/icons';

export type BillingCycleRow = {
  id: string;
  term_label: string;
  term_start_date: string;
  due_date: string;
  amount_due: number;
  currency: string;
  status: string;
  owner_type: string;
  school_id: string | null;
  owner_school_id: string | null;
  owner_user_id: string | null;
  subscription_id: string | null;
  invoice_id: string | null;
  items?: unknown;
  reminder_week6_sent_at?: string | null;
  reminder_week7_sent_at?: string | null;
  reminder_week8_sent_at?: string | null;
  invoices?: { id: string; invoice_number: string; status: string; amount: number } | null;
  schools?: { name: string } | null;
  owner_schools?: { name: string } | null;
};

function fmt(currency: string, amount: number) {
  try {
    return new Intl.NumberFormat('en-NG', { style: 'currency', currency: currency || 'NGN', maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${currency} ${amount}`;
  }
}

function relDate(d: string) {
  try {
    return new Date(d).toLocaleDateString('en-NG', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return d;
  }
}

const STATUS_OPTIONS = ['due', 'past_due', 'paid', 'cancelled', 'rolled_over'] as const;

// ─── Proof Upload Component ───────────────────────────────────────────────────
function BillingCycleProofUpload({ cycleId, onUploaded }: { cycleId: string; onUploaded: () => void }) {
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
      onUploaded();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Upload failed');
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
        <ArrowUpTrayIcon className="w-3.5 h-3.5" /> Upload Proof
      </button>
    );
  }

  return (
    <div className="mt-2 border border-primary/20 rounded-xl p-3 bg-primary/5 space-y-3">
      <p className="text-[10px] font-black uppercase tracking-widest text-primary">Upload Payment Evidence</p>
      <textarea
        value={note}
        onChange={e => setNote(e.target.value)}
        rows={2}
        placeholder="Optional: add bank reference, transfer narration, or a note for admin…"
        className="w-full px-3 py-2 bg-background border border-border rounded-lg text-xs text-foreground placeholder-muted-foreground/40 focus:outline-none focus:border-primary/50 resize-none"
      />
      <div className="flex items-center gap-2">
        <label className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all ${uploading ? 'bg-muted text-muted-foreground' : 'bg-primary hover:bg-primary text-white'}`}>
          <PaperClipIcon className="w-3.5 h-3.5" />
          {uploading ? 'Uploading…' : 'Choose File'}
          <input ref={fileRef} type="file" accept="image/*,.pdf" onChange={handleFile} disabled={uploading} className="hidden" />
        </label>
        <button type="button" onClick={() => setOpen(false)} className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
      </div>
      <p className="text-[10px] text-muted-foreground">Accepted: JPG, PNG, PDF — max 10 MB</p>
    </div>
  );
}

export function BillingCyclesTab({ profile }: { profile: any }) {
  const isAdmin = profile?.role === 'admin';
  const isSchool = profile?.role === 'school';
  const isPayingRole = isSchool;
  const [rows, setRows] = useState<BillingCycleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [adminSchoolId, setAdminSchoolId] = useState('');
  const [schools, setSchools] = useState<{ id: string; name: string }[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [patching, setPatching] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [payingRow, setPayingRow] = useState<string | null>(null); // id of row showing payment options
  const [paystackLoading, setPaystackLoading] = useState<string | null>(null);
  const [contactUsers, setContactUsers] = useState<{ id: string; full_name: string | null; email: string | null; role: string | null }[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [savingForm, setSavingForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    owner_type: 'school',
    owner_school_id: '',
    owner_user_id: '',
    term_label: '',
    term_start_date: '',
    due_date: '',
    amount_due: '',
    currency: 'NGN',
    status: 'due',
  });

  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      const db = createClient();
      const { data } = await db.from('schools').select('id, name').eq('status', 'approved').order('name');
      setSchools((data ?? []) as { id: string; name: string }[]);
      const { data: users } = await db
        .from('portal_users')
        .select('id, full_name, email, role')
        .in('role', ['student', 'parent'])
        .order('full_name');
      setContactUsers((users ?? []) as { id: string; full_name: string | null; email: string | null; role: string | null }[]);
    })();
  }, [isAdmin]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams();
      if (statusFilter !== 'all') q.set('status', statusFilter);
      if (isAdmin && adminSchoolId) q.set('school_id', adminSchoolId);
      const res = await fetch(`/api/finance/billing-cycles?${q.toString()}`, { cache: 'no-store' });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Failed to load');
      setRows((j.data ?? []) as BillingCycleRow[]);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to load cycles');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, adminSchoolId, isAdmin]);

  useEffect(() => {
    void load();
  }, [load]);

  async function deleteCycle(id: string) {
    if (!isAdmin) return;
    if (!confirm('Delete this billing cycle? Only cancelled or rolled-over cycles can be deleted. This cannot be undone.')) return;
    setDeleting(id);
    try {
      const res = await fetch('/api/finance/billing-cycles', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Delete failed');
      toast.success('Billing cycle deleted');
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setDeleting(null);
    }
  }

  async function patchStatus(id: string, status: string) {
    setPatching(id);
    try {
      const res = await fetch('/api/finance/billing-cycles', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Update failed');
      toast.success('Cycle updated');
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setPatching(null);
    }
  }

  function resetForm() {
    setEditingId(null);
    setForm({
      owner_type: 'school',
      owner_school_id: adminSchoolId || '',
      owner_user_id: '',
      term_label: '',
      term_start_date: '',
      due_date: '',
      amount_due: '',
      currency: 'NGN',
      status: 'due',
    });
  }

  function startCreate() {
    resetForm();
    setShowForm(true);
  }

  function startEdit(row: BillingCycleRow) {
    setEditingId(row.id);
    setForm({
      owner_type: row.owner_type === 'individual' ? 'individual' : 'school',
      owner_school_id: row.owner_school_id ?? row.school_id ?? '',
      owner_user_id: row.owner_user_id ?? '',
      term_label: row.term_label ?? '',
      term_start_date: row.term_start_date ? row.term_start_date.slice(0, 10) : '',
      due_date: row.due_date ? row.due_date.slice(0, 10) : '',
      amount_due: String(Number(row.amount_due ?? 0)),
      currency: row.currency || 'NGN',
      status: row.status || 'due',
    });
    setShowForm(true);
  }

  async function submitForm() {
    if (!isAdmin) return;
    if (!form.term_label || !form.term_start_date || !form.due_date || !form.amount_due) {
      toast.error('Please fill all required fields');
      return;
    }
    if (form.owner_type === 'school' && !form.owner_school_id) {
      toast.error('Select a school owner');
      return;
    }
    if (form.owner_type === 'individual' && !form.owner_user_id) {
      toast.error('Select an individual owner');
      return;
    }

    setSavingForm(true);
    try {
      const payload = {
        owner_type: form.owner_type,
        owner_school_id: form.owner_type === 'school' ? form.owner_school_id : null,
        owner_user_id: form.owner_type === 'individual' ? form.owner_user_id : null,
        term_label: form.term_label.trim(),
        term_start_date: form.term_start_date,
        due_date: form.due_date,
        amount_due: Number(form.amount_due),
        currency: form.currency,
        status: form.status,
      };
      const res = await fetch('/api/finance/billing-cycles', {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingId ? { id: editingId, ...payload } : payload),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Failed to save cycle');
      toast.success(editingId ? 'Cycle updated' : 'Cycle created');
      setShowForm(false);
      resetForm();
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to save cycle');
    } finally {
      setSavingForm(false);
    }
  }

  async function initiatePaystack(rowId: string) {
    setPaystackLoading(rowId);
    try {
      const res = await fetch(`/api/billing/cycles/${rowId}/checkout`, { method: 'POST' });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Paystack initialisation failed');
      window.location.href = j.url;
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Payment failed to initialise');
    } finally {
      setPaystackLoading(null);
    }
  }

  const rolledHint = useMemo(
    () => 'Rolled-over cycles are closed by automation when a new term cycle is created.',
    [],
  );

  return (
    <div className="space-y-4">
      {/* Show admin-only note; school sees a cleaner header */}
      {isAdmin && (
        <div className="rounded-none border border-border bg-card/50 p-4 text-sm text-muted-foreground">
          <p className="font-bold text-foreground">Term billing cycles</p>
          <p className="mt-1 text-xs">
            Each row is a subscription term window with a due date, rollup amount, and optional linked invoice. Reminder weeks 6–8 are driven by the billing-reminders cron.
          </p>
        </div>
      )}
      {isPayingRole && (
        <div className="rounded-none border border-border bg-card/50 p-4 text-sm text-muted-foreground">
          <p className="font-bold text-foreground">Your Billing Schedule</p>
          <p className="mt-1 text-xs">
            View current and upcoming billing cycles. Click <strong>Pay Now</strong> on any due cycle to pay online via Paystack or upload a bank transfer evidence.
          </p>
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        {isAdmin && (
          <select
            title="Filter by school"
            value={adminSchoolId}
            onChange={e => setAdminSchoolId(e.target.value)}
            className="w-full sm:w-56 px-3 py-2.5 bg-background border border-border rounded-none text-sm text-foreground focus:outline-none focus:border-primary"
          >
            <option value="">All schools</option>
            {schools.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        )}
        <select
          title="Filter by status"
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="w-full sm:w-44 px-3 py-2.5 bg-background border border-border rounded-none text-sm text-foreground focus:outline-none focus:border-primary"
        >
          <option value="all">All statuses</option>
          {STATUS_OPTIONS.map(s => (
            <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center justify-center gap-2 px-3 py-2.5 bg-muted hover:bg-muted/80 border border-border rounded-none text-sm font-bold"
        >
          <ArrowPathIcon className="w-4 h-4" /> Refresh
        </button>
        {isAdmin && (
          <button
            type="button"
            onClick={startCreate}
            className="inline-flex items-center justify-center gap-2 px-3 py-2.5 bg-primary text-primary-foreground hover:opacity-90 border border-primary rounded-none text-sm font-bold"
          >
            Add cycle
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : rows.length === 0 ? (
        <p className="text-center py-16 text-sm text-muted-foreground">No billing cycles found for this scope.</p>
      ) : (
        <div className="space-y-2">
          {rows.map(row => {
            const open = expanded === row.id;
            const items = Array.isArray(row.items) ? row.items as Record<string, unknown>[] : [];
            const isDue = ['due', 'past_due'].includes(row.status);
            const showingPayment = payingRow === row.id;
            return (
              <div key={row.id} className="border border-border bg-card rounded-none overflow-hidden">
                <button
                  type="button"
                  onClick={() => setExpanded(open ? null : row.id)}
                  className="w-full flex items-start justify-between gap-3 p-4 text-left hover:bg-muted/30 transition-colors"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="font-black text-foreground text-sm truncate">{row.term_label}</p>
                    <p className="text-[11px] text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="inline-flex items-center gap-1">
                        <CalendarDaysIcon className="w-3.5 h-3.5 shrink-0" />
                        Due {relDate(row.due_date)} · starts {relDate(row.term_start_date)}
                      </span>
                      {(row.schools?.name || row.owner_schools?.name) && !isSchool && (
                        <span className="text-foreground/80">· {row.schools?.name ?? row.owner_schools?.name}</span>
                      )}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="font-black text-foreground text-sm tabular-nums">
                      {fmt(row.currency, Number(row.amount_due ?? 0))}
                    </span>
                    <span className={`text-[10px] font-black uppercase tracking-widest border px-2 py-0.5 rounded-none ${
                      row.status === 'paid' ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' :
                      row.status === 'past_due' ? 'text-rose-400 border-rose-500/30 bg-rose-500/10' :
                      row.status === 'due' ? 'text-amber-400 border-amber-500/30 bg-amber-500/10' :
                      'text-muted-foreground border-border'
                    }`}>
                      {row.status === 'past_due' ? 'Overdue' : row.status.replace(/_/g, ' ')}
                    </span>
                    {open ? <ChevronUpIcon className="w-4 h-4 text-muted-foreground" /> : <ChevronDownIcon className="w-4 h-4 text-muted-foreground" />}
                  </div>
                </button>

                {/* Pay Now button strip for due/past_due cycles (school + teacher) */}
                {isPayingRole && isDue && (
                  <div className="border-t border-border px-4 py-3 bg-amber-500/5 flex items-center justify-between gap-3">
                    <p className="text-xs text-amber-400 font-bold">
                      {row.status === 'past_due' ? 'This cycle is overdue — please pay immediately.' : 'Payment due for this billing cycle.'}
                    </p>
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); setPayingRow(showingPayment ? null : row.id); }}
                      className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 hover:bg-violet-700 text-white text-xs font-black uppercase tracking-wide rounded-lg transition-colors"
                    >
                      {showingPayment ? 'Hide' : 'Pay Now'}
                    </button>
                  </div>
                )}

                {/* Payment options panel (school + teacher) */}
                {isPayingRole && showingPayment && (
                  <div className="border-t border-border px-4 py-4 bg-muted/20 space-y-4">
                    <p className="text-xs font-black text-foreground uppercase tracking-widest">Payment Options</p>
                    <div className="grid sm:grid-cols-2 gap-3">
                      {/* Bank Transfer */}
                      <div className="border border-border rounded-xl p-3 space-y-1.5">
                        <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Bank Transfer</p>
                        <p className="text-xs text-foreground font-bold">Transfer to Rillcod Technologies</p>
                        <p className="text-[11px] text-muted-foreground">Use your invoice reference as the transfer narration. Upload your proof below after transfer.</p>
                        <Link
                          href="/dashboard/finance?tab=setup"
                          className="inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:underline"
                        >
                          View account details →
                        </Link>
                      </div>
                      {/* Paystack */}
                      <div className="border border-border rounded-xl p-3 space-y-2">
                        <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Paystack (Card / Bank)</p>
                        <p className="text-xs text-foreground font-bold">Pay online instantly</p>
                        <p className="text-[11px] text-muted-foreground">
                          Amount: <span className="font-black text-foreground">{fmt(row.currency, Number(row.amount_due ?? 0))}</span>
                        </p>
                        <button
                          type="button"
                          disabled={paystackLoading === row.id}
                          onClick={() => void initiatePaystack(row.id)}
                          className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-black uppercase tracking-wide rounded-lg transition-colors"
                        >
                          <CreditCardIcon className="w-3.5 h-3.5" />
                          {paystackLoading === row.id ? 'Loading…' : 'Pay via Paystack'}
                        </button>
                      </div>
                    </div>

                    {/* Proof upload (available to school and teacher) */}
                    <div className="border-t border-border pt-3">
                      <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-2">Already Paid? Upload Evidence</p>
                      <BillingCycleProofUpload cycleId={row.id} onUploaded={load} />
                    </div>
                  </div>
                )}

                {open && (
                  <div className="border-t border-border px-4 py-3 bg-muted/20 space-y-3 text-xs">
                    {isAdmin && (
                      <div className="grid gap-2 sm:grid-cols-2">
                        <p><span className="text-muted-foreground">Owner type:</span> <span className="font-bold text-foreground">{row.owner_type}</span></p>
                        <p><span className="text-muted-foreground">Reminders:</span>{' '}
                          <span className="text-foreground">
                            W6 {row.reminder_week6_sent_at ? '✓' : '—'} · W7 {row.reminder_week7_sent_at ? '✓' : '—'} · W8 {row.reminder_week8_sent_at ? '✓' : '—'}
                          </span>
                        </p>
                        {row.invoices?.id && (
                          <p className="sm:col-span-2">
                            <span className="text-muted-foreground">Linked invoice:</span>{' '}
                            <Link href="/dashboard/payments" className="font-bold text-primary underline">
                              {row.invoices.invoice_number}
                            </Link>
                            <span className="text-muted-foreground ml-2">({row.invoices.status})</span>
                          </p>
                        )}
                      </div>
                    )}
                    {!isAdmin && row.invoices?.id && (
                      <div className="space-y-2">
                        <p><span className="text-muted-foreground">Invoice:</span>{' '}
                          <span className="font-bold text-foreground">{row.invoices.invoice_number}</span>
                          <span className="text-muted-foreground ml-2">({row.invoices.status})</span>
                        </p>
                        {/* Pay / Proof directly on the invoice if not yet paid */}
                        {row.invoices.status !== 'paid' && row.invoices.status !== 'cancelled' && (
                          <div className="border border-primary/20 rounded-xl p-3 bg-primary/5 space-y-2">
                            <p className="text-[10px] font-black uppercase tracking-widest text-primary">Pay this invoice</p>
                            <p className="text-[11px] text-muted-foreground">
                              Amount: <span className="font-black text-foreground">{fmt(row.currency, Number(row.invoices.amount ?? row.amount_due ?? 0))}</span>
                            </p>
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                disabled={paystackLoading === row.id}
                                onClick={() => void initiatePaystack(row.id)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-black rounded-lg transition-colors"
                              >
                                <CreditCardIcon className="w-3.5 h-3.5" />
                                {paystackLoading === row.id ? 'Loading…' : 'Pay via Paystack'}
                              </button>
                            </div>
                            <BillingCycleProofUpload cycleId={row.id} onUploaded={load} />
                          </div>
                        )}
                      </div>
                    )}
                    {items.length > 0 && (
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">Line items ({items.length})</p>
                        <ul className="space-y-1 max-h-40 overflow-y-auto border border-border bg-background p-2 rounded-none">
                          {items.map((it, i) => (
                            <li key={i} className="text-[11px] text-foreground flex justify-between gap-2">
                              <span className="truncate">{String(it.student_name ?? it.invoice_number ?? 'Item')}</span>
                              <span className="shrink-0 tabular-nums">{fmt(String(it.currency ?? row.currency), Number(it.amount ?? 0))}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {isAdmin && (
                      <div className="flex flex-wrap gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => startEdit(row)}
                          className="px-3 py-1.5 border border-border text-[10px] font-black uppercase tracking-widest hover:bg-muted rounded-none"
                        >
                          Edit
                        </button>
                        {['cancelled', 'rolled_over'].includes(row.status) && (
                          <button
                            type="button"
                            disabled={deleting === row.id}
                            onClick={() => void deleteCycle(row.id)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-rose-500/40 text-[10px] font-black uppercase tracking-widest text-rose-400 hover:bg-rose-500/10 disabled:opacity-40 rounded-none"
                          >
                            <TrashIcon className="w-3.5 h-3.5" />
                            {deleting === row.id ? 'Deleting…' : 'Delete'}
                          </button>
                        )}
                      </div>
                    )}
                    {isAdmin && row.status !== 'rolled_over' && (
                      <div className="flex flex-wrap gap-2 pt-1">
                        {(['paid', 'cancelled', 'due', 'past_due'] as const).map(st => (
                          <button
                            key={st}
                            type="button"
                            disabled={patching === row.id || row.status === st}
                            onClick={() => {
                              if (!confirm(`Set this cycle to "${st.replace(/_/g, ' ')}"?`)) return;
                              void patchStatus(row.id, st);
                            }}
                            className="px-3 py-1.5 border border-border text-[10px] font-black uppercase tracking-widest hover:bg-muted disabled:opacity-40 rounded-none"
                          >
                            {st.replace(/_/g, ' ')}
                          </button>
                        ))}
                      </div>
                    )}
                    {row.status === 'rolled_over' && (
                      <p className="text-[11px] text-muted-foreground">{rolledHint}</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {isAdmin && showForm && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="w-full max-w-2xl border border-border bg-background rounded-none p-4 sm:p-5 space-y-4">
            <div className="flex items-center justify-between">
              <p className="font-black text-foreground">{editingId ? 'Edit billing cycle' : 'Add billing cycle'}</p>
              <button type="button" onClick={() => setShowForm(false)} className="text-xs border border-border px-2 py-1 rounded-none">Close</button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs text-muted-foreground">Owner type
                <select value={form.owner_type} onChange={e => setForm(prev => ({ ...prev, owner_type: e.target.value, owner_school_id: '', owner_user_id: '' }))} className="mt-1 w-full px-3 py-2 bg-background border border-border rounded-none text-sm text-foreground">
                  <option value="school">School</option>
                  <option value="individual">Individual</option>
                </select>
              </label>
              {form.owner_type === 'school' ? (
                <label className="text-xs text-muted-foreground">School
                  <select value={form.owner_school_id} onChange={e => setForm(prev => ({ ...prev, owner_school_id: e.target.value }))} className="mt-1 w-full px-3 py-2 bg-background border border-border rounded-none text-sm text-foreground">
                    <option value="">Select school</option>
                    {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </label>
              ) : (
                <label className="text-xs text-muted-foreground">Individual
                  <select value={form.owner_user_id} onChange={e => setForm(prev => ({ ...prev, owner_user_id: e.target.value }))} className="mt-1 w-full px-3 py-2 bg-background border border-border rounded-none text-sm text-foreground">
                    <option value="">Select student/parent</option>
                    {contactUsers.map(u => <option key={u.id} value={u.id}>{u.full_name || u.email || u.id} {u.role ? `(${u.role})` : ''}</option>)}
                  </select>
                </label>
              )}
              <label className="text-xs text-muted-foreground">Term label
                <input value={form.term_label} onChange={e => setForm(prev => ({ ...prev, term_label: e.target.value }))} className="mt-1 w-full px-3 py-2 bg-background border border-border rounded-none text-sm text-foreground" />
              </label>
              <label className="text-xs text-muted-foreground">Term start date
                <input type="date" value={form.term_start_date} onChange={e => setForm(prev => ({ ...prev, term_start_date: e.target.value }))} className="mt-1 w-full px-3 py-2 bg-background border border-border rounded-none text-sm text-foreground" />
              </label>
              <label className="text-xs text-muted-foreground">Due date
                <input type="date" value={form.due_date} onChange={e => setForm(prev => ({ ...prev, due_date: e.target.value }))} className="mt-1 w-full px-3 py-2 bg-background border border-border rounded-none text-sm text-foreground" />
              </label>
              <label className="text-xs text-muted-foreground">Amount due
                <input type="number" min="0" value={form.amount_due} onChange={e => setForm(prev => ({ ...prev, amount_due: e.target.value }))} className="mt-1 w-full px-3 py-2 bg-background border border-border rounded-none text-sm text-foreground" />
              </label>
              <label className="text-xs text-muted-foreground">Currency
                <select value={form.currency} onChange={e => setForm(prev => ({ ...prev, currency: e.target.value }))} className="mt-1 w-full px-3 py-2 bg-background border border-border rounded-none text-sm text-foreground">
                  <option value="NGN">NGN</option>
                  <option value="USD">USD</option>
                </select>
              </label>
              <label className="text-xs text-muted-foreground">Status
                <select value={form.status} onChange={e => setForm(prev => ({ ...prev, status: e.target.value }))} className="mt-1 w-full px-3 py-2 bg-background border border-border rounded-none text-sm text-foreground">
                  {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
                </select>
              </label>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowForm(false)} className="px-3 py-2 border border-border rounded-none text-sm font-bold">Cancel</button>
              <button type="button" disabled={savingForm} onClick={() => void submitForm()} className="px-3 py-2 border border-primary bg-primary text-primary-foreground rounded-none text-sm font-bold disabled:opacity-60">
                {savingForm ? 'Saving...' : editingId ? 'Save changes' : 'Create cycle'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
