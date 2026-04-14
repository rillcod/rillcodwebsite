'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import {
  ArrowPathIcon,
  CalendarDaysIcon,
  ChevronDownIcon,
  ChevronUpIcon,
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

export function BillingCyclesTab({ profile }: { profile: any }) {
  const isAdmin = profile?.role === 'admin';
  const [rows, setRows] = useState<BillingCycleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [adminSchoolId, setAdminSchoolId] = useState('');
  const [schools, setSchools] = useState<{ id: string; name: string }[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [patching, setPatching] = useState<string | null>(null);
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

  const rolledHint = useMemo(
    () => 'Rolled-over cycles are closed by automation when a new term cycle is created.',
    [],
  );

  return (
    <div className="space-y-4">
      <div className="rounded-none border border-border bg-card/50 p-4 text-sm text-muted-foreground">
        <p className="font-bold text-foreground">Term billing cycles</p>
        <p className="mt-1 text-xs">
          Each row is a subscription term window with a due date, rollup amount, and optional linked invoice. Reminder weeks 6–8 are driven by the billing-reminders cron.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        {isAdmin && (
          <select
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
                      {(row.schools?.name || row.owner_schools?.name) && (
                        <span className="text-foreground/80">· {row.schools?.name ?? row.owner_schools?.name}</span>
                      )}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="font-black text-foreground text-sm tabular-nums">
                      {fmt(row.currency, Number(row.amount_due ?? 0))}
                    </span>
                    <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground border border-border px-2 py-0.5 rounded-none">
                      {row.status.replace(/_/g, ' ')}
                    </span>
                    {open ? <ChevronUpIcon className="w-4 h-4 text-muted-foreground" /> : <ChevronDownIcon className="w-4 h-4 text-muted-foreground" />}
                  </div>
                </button>
                {open && (
                  <div className="border-t border-border px-4 py-3 bg-muted/20 space-y-3 text-xs">
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
                    {items.length > 0 && (
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">Rolled-up line items ({items.length})</p>
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
