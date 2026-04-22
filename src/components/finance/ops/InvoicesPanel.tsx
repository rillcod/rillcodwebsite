'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import {
  DocumentTextIcon,
  PlusIcon,
  BuildingOfficeIcon,
  UserIcon,
  ArrowTrendingUpIcon,
  MagnifyingGlassIcon,
  TrashIcon,
  XMarkIcon,
  EnvelopeIcon,
  CheckCircleIcon,
  CheckBadgeIcon,
  BellAlertIcon,
  EyeIcon,
  PencilSquareIcon,
} from '@/lib/icons';
import {
  classifyInvoiceStream,
  streamPillClasses,
  streamLabel,
  type FinanceStream,
} from '@/lib/finance/streams';
import { formatMoney, formatShortDate } from '@/lib/finance/formatters';
import { DocPreviewModal, type DocPreviewData } from './DocPreviewModal';

interface InvoiceRow {
  id: string;
  invoice_number: string;
  status: string;
  amount: number;
  currency: string;
  created_at: string;
  due_date?: string | null;
  stream?: string | null;
  school_id?: string | null;
  portal_user_id?: string | null;
  billing_cycle_id?: string | null;
  items?: unknown;
  schools?: { name?: string } | null;
  portal_users?: { full_name?: string; email?: string } | null;
}

interface StudentOption {
  id: string;
  full_name: string;
  email: string;
  school_id: string | null;
}

const INVOICE_STATUS_STYLES: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground border-border',
  sent: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  paid: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  overdue: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
  cancelled: 'bg-muted text-muted-foreground border-border',
};

/**
 * InvoicesPanel — quick invoice creation + invoice list.
 * Advanced school billing (term fees, cohort invoicing) happens in Billing Cycles.
 */
export function InvoicesPanel() {
  const { profile } = useAuth();
  const db = createClient();
  const isAdmin = profile?.role === 'admin';
  const isSchool = profile?.role === 'school';

  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'paid' | 'overdue'>('all');
  const [streamFilter, setStreamFilter] = useState<'all' | FinanceStream>('all');
  const [showForm, setShowForm] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [preview, setPreview] = useState<DocPreviewData | null>(null);

  const canManage = isAdmin || isSchool;

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/invoices?limit=100');
      if (res.ok) {
        const j = await res.json();
        setInvoices(j.data ?? []);
      }
    } finally {
      setLoading(false);
    }
  };

  // ── Inline staff actions (no navigation away) ──────────────────────────

  const markPaid = async (inv: InvoiceRow) => {
    if (!confirm(`Mark invoice #${inv.invoice_number} as paid?`)) return;
    setBusyId(inv.id);
    try {
      const res = await fetch(`/api/invoices/${inv.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'paid' }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || 'Failed');
      }
      toast.success('Marked as paid');
      setInvoices((prev) =>
        prev.map((i) => (i.id === inv.id ? { ...i, status: 'paid' } : i)),
      );
    } catch (e: unknown) {
      toast.error((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const sendEmail = async (inv: InvoiceRow) => {
    setBusyId(inv.id);
    try {
      const res = await fetch('/api/payments/invoices/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceId: inv.id }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.success === false) {
        throw new Error(j.message || j.error || 'Failed to send email');
      }
      toast.success('Invoice emailed to payer');
    } catch (e: unknown) {
      toast.error((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const sendReminder = async (inv: InvoiceRow) => {
    setBusyId(inv.id);
    try {
      const res = await fetch(`/api/invoices/${inv.id}/remind`, { method: 'POST' });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'Failed to send reminder');
      toast.success('Reminder sent');
    } catch (e: unknown) {
      toast.error((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const deleteInvoice = async (inv: InvoiceRow) => {
    if (!confirm(`Delete invoice #${inv.invoice_number}? This cannot be undone.`)) return;
    setBusyId(inv.id);
    try {
      const res = await fetch(`/api/invoices/${inv.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || 'Failed to delete');
      }
      toast.success('Invoice deleted');
      setInvoices((prev) => prev.filter((i) => i.id !== inv.id));
    } catch (e: unknown) {
      toast.error((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const openPreview = (inv: InvoiceRow) => {
    type Item = { description?: string; quantity?: number; unit_price?: number; total?: number };
    const rawItems: Item[] = Array.isArray(inv.items) ? (inv.items as Item[]) : [];
    const items = rawItems.length
      ? rawItems.map((it) => ({
          description: String(it.description ?? ''),
          quantity: Number(it.quantity ?? 1),
          unit_price: Number(it.unit_price ?? 0),
          total: Number(
            it.total ?? Number(it.quantity ?? 1) * Number(it.unit_price ?? 0),
          ),
        }))
      : [{ description: 'Payment', quantity: 1, unit_price: inv.amount, total: inv.amount }];

    setPreview({
      id: inv.id,
      number: inv.invoice_number,
      date: new Date(inv.created_at).toLocaleDateString(),
      dueDate: inv.due_date ? new Date(inv.due_date).toLocaleDateString() : undefined,
      status: inv.status,
      items,
      amount: inv.amount,
      currency: inv.currency,
      studentName:
        inv.portal_users?.full_name || inv.schools?.name || 'Client',
      studentEmail: inv.portal_users?.email,
      schoolName: 'RILLCOD TECHNOLOGIES',
    });
  };

  useEffect(() => {
    if (!profile) return;
    load();
    // Use staff-scoped API to avoid RLS inconsistencies across admin/school contexts.
    fetch('/api/portal-users?role=student&scoped=true', { cache: 'no-store' })
      .then(async (res) => {
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j.error || 'Could not load student list');
        setStudents((j.data ?? []) as StudentOption[]);
      })
      .catch((e: unknown) => {
        toast.error((e as Error).message || 'Could not load student list');
        setStudents([]);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return invoices
      .map((inv) => ({
        ...inv,
        stream: classifyInvoiceStream({
          stream: inv.stream,
          school_id: inv.school_id,
          billing_cycle_id: inv.billing_cycle_id ?? null,
          portal_user_id: inv.portal_user_id ?? null,
        }),
      }))
      .filter((inv) => (streamFilter === 'all' ? true : inv.stream === streamFilter))
      .filter((inv) => {
        if (statusFilter === 'all') return true;
        if (statusFilter === 'paid') return inv.status === 'paid';
        if (statusFilter === 'overdue') return inv.status === 'overdue';
        return ['sent', 'draft'].includes(inv.status);
      })
      .filter((inv) => {
        if (!q) return true;
        return (
          (inv.invoice_number || '').toLowerCase().includes(q) ||
          (inv.schools?.name || '').toLowerCase().includes(q) ||
          (inv.portal_users?.full_name || '').toLowerCase().includes(q)
        );
      });
  }, [invoices, search, statusFilter, streamFilter]);

  return (
    <div className="space-y-4">
      {/* Billing cycles promo — the preferred path for school term billing */}
      {(isAdmin || isSchool) && (
        <Link
          href="/dashboard/finance?tab=billing_cycles"
          className="block rounded-2xl border border-violet-500/30 bg-gradient-to-r from-violet-500/10 to-fuchsia-500/10 p-4 sm:p-5 hover:border-violet-500/60 transition-colors"
        >
          <div className="flex items-start sm:items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-violet-600 text-white inline-flex items-center justify-center shrink-0">
              <ArrowTrendingUpIcon className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-violet-500/80">
                Recommended for schools
              </p>
              <p className="text-sm sm:text-base font-black text-foreground">
                Issue cohort invoices through Billing Cycles for term-based fees.
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Auto-splits Rillcod commission vs. school settlement, keeps invoices linked to a term.
              </p>
            </div>
            <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-black uppercase tracking-widest text-violet-500">
              Open →
            </span>
          </div>
        </Link>
      )}

      <div className="flex flex-col md:flex-row md:items-center gap-3">
        <button
          onClick={() => setShowForm(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground font-black text-xs uppercase tracking-widest rounded-md hover:bg-primary/90"
        >
          <PlusIcon className="w-4 h-4" /> Quick invoice
        </button>

        <div className="inline-flex border border-border rounded-xl overflow-hidden text-xs">
          {(['all', 'open', 'paid', 'overdue'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 font-black uppercase tracking-widest ${
                statusFilter === s
                  ? 'bg-foreground text-background'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        {canManage && (
          <div className="inline-flex border border-border rounded-xl overflow-hidden text-xs">
            {(['all', 'school', 'individual'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStreamFilter(s)}
                className={`px-3 py-1.5 font-black uppercase tracking-widest ${
                  streamFilter === s
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {s === 'all' ? 'All' : streamLabel(s)}
              </button>
            ))}
          </div>
        )}

        <div className="flex-1" />

        <div className="relative">
          <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search invoice #, payer…"
            className="w-full md:w-64 pl-9 pr-3 py-2 text-xs border border-border bg-background rounded-md focus:outline-none focus:border-primary"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="border border-dashed border-border rounded-xl p-10 text-center">
          <DocumentTextIcon className="w-10 h-10 mx-auto text-muted-foreground/40" />
          <p className="text-sm font-bold text-foreground mt-2">No invoices found</p>
          <p className="text-xs text-muted-foreground mt-1">
            Create a quick invoice above or open Billing Cycles to issue term fees.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((inv) => (
            <div
              key={inv.id}
              className="border border-border rounded-xl p-4 bg-card/50 hover:bg-card transition-colors"
            >
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black border ${streamPillClasses(
                        inv.stream,
                      )}`}
                    >
                      {streamLabel(inv.stream)}
                    </span>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${
                        INVOICE_STATUS_STYLES[inv.status] ?? INVOICE_STATUS_STYLES.draft
                      }`}
                    >
                      {inv.status}
                    </span>
                    <span className="text-[11px] font-mono text-muted-foreground">
                      #{inv.invoice_number}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-2 flex-wrap text-sm">
                    <span className="font-black text-foreground">
                      {formatMoney(inv.amount, inv.currency)}
                    </span>
                    {inv.schools?.name && (
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <BuildingOfficeIcon className="w-3 h-3" /> {inv.schools.name}
                      </span>
                    )}
                    {inv.portal_users?.full_name && (
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <UserIcon className="w-3 h-3" /> {inv.portal_users.full_name}
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-1">
                    Issued {formatShortDate(inv.created_at)}
                    {inv.due_date && ` · Due ${formatShortDate(inv.due_date)}`}
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  <button
                    onClick={() => openPreview(inv)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 border border-border text-[10px] font-black uppercase tracking-widest rounded-md hover:border-primary"
                    title="Quick preview"
                  >
                    <EyeIcon className="w-3 h-3" /> View
                  </button>

                  {canManage && inv.status !== 'paid' && (
                    <Link
                      href={`/dashboard/payments/invoices/${inv.id}/edit`}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-primary text-primary-foreground text-[10px] font-black uppercase tracking-widest rounded-md"
                      title="Edit line items"
                    >
                      <PencilSquareIcon className="w-3 h-3" /> Edit
                    </Link>
                  )}

                  {canManage && inv.status !== 'paid' && (
                    <button
                      onClick={() => markPaid(inv)}
                      disabled={busyId === inv.id}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-[10px] font-black uppercase tracking-widest rounded-md"
                      title="Mark as paid (manual)"
                    >
                      <CheckBadgeIcon className="w-3 h-3" /> Paid
                    </button>
                  )}

                  {canManage && inv.status !== 'paid' && (
                    <button
                      onClick={() => sendReminder(inv)}
                      disabled={busyId === inv.id}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 border border-border hover:border-amber-500/50 text-amber-400 text-[10px] font-black uppercase tracking-widest rounded-md"
                      title="Send payment reminder"
                    >
                      <BellAlertIcon className="w-3 h-3" /> Remind
                    </button>
                  )}

                  {canManage && (
                    <button
                      onClick={() => sendEmail(inv)}
                      disabled={busyId === inv.id}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 border border-border hover:border-blue-500/50 text-blue-400 text-[10px] font-black uppercase tracking-widest rounded-md"
                      title="Email this invoice to the payer"
                    >
                      <EnvelopeIcon className="w-3 h-3" /> Email
                    </button>
                  )}

                  <a
                    href={`/api/invoices/${inv.id}/pdf`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 border border-border text-[10px] font-black uppercase tracking-widest rounded-md hover:border-primary"
                    title="Download signed PDF"
                  >
                    PDF
                  </a>

                  {isAdmin && inv.status !== 'paid' && (
                    <button
                      onClick={() => deleteInvoice(inv)}
                      disabled={busyId === inv.id}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 border border-rose-500/40 text-rose-400 hover:bg-rose-500/10 text-[10px] font-black uppercase tracking-widest rounded-md"
                      title="Delete invoice (cannot be undone)"
                    >
                      <TrashIcon className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <QuickInvoiceForm
          students={students}
          onClose={() => setShowForm(false)}
          onCreated={() => {
            setShowForm(false);
            load();
          }}
        />
      )}

      {preview && (
        <DocPreviewModal
          type="invoice"
          data={preview}
          canManage={canManage}
          onClose={() => setPreview(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}

// ── Quick invoice form ───────────────────────────────────────────────────

interface LineItem {
  description: string;
  quantity: number;
  unit_price: number;
}

function QuickInvoiceForm({
  students,
  onClose,
  onCreated,
}: {
  students: StudentOption[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [portalUserId, setPortalUserId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [currency, setCurrency] = useState('NGN');
  const [items, setItems] = useState<LineItem[]>([
    { description: '', quantity: 1, unit_price: 0 },
  ]);
  const [notes, setNotes] = useState('');
  const [sendEmail, setSendEmail] = useState(true);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState('');
  const [preview, setPreview] = useState<DocPreviewData | null>(null);

  const total = items.reduce((s, i) => s + i.quantity * i.unit_price, 0);

  const buildPreviewData = (): DocPreviewData | null => {
    const valid = items.filter((i) => i.description.trim() && i.unit_price > 0);
    const selected = students.find((s) => s.id === portalUserId);
    if (valid.length === 0) return null;
    const rows = valid.map((i) => ({
      description: i.description,
      quantity: i.quantity,
      unit_price: i.unit_price,
      total: i.quantity * i.unit_price,
    }));
    return {
      number: `DRAFT-${Date.now().toString(36).toUpperCase()}`,
      date: new Date().toLocaleDateString(),
      dueDate: dueDate ? new Date(dueDate).toLocaleDateString() : undefined,
      status: 'draft',
      items: rows,
      amount: total,
      currency,
      notes,
      studentName: selected?.full_name || 'Learner / Payer',
      studentEmail: selected?.email,
      schoolName: 'RILLCOD TECHNOLOGIES',
    };
  };

  const openPreview = () => {
    const data = buildPreviewData();
    if (!data) {
      toast.error('Add at least one line item with a price to preview.');
      return;
    }
    setPreview(data);
  };

  const filteredStudents = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return students.slice(0, 20);
    return students
      .filter(
        (s) =>
          s.full_name.toLowerCase().includes(q) ||
          s.email.toLowerCase().includes(q),
      )
      .slice(0, 20);
  }, [query, students]);

  const selectedStudent = students.find((s) => s.id === portalUserId);

  const addItem = () =>
    setItems((prev) => [...prev, { description: '', quantity: 1, unit_price: 0 }]);
  const removeItem = (i: number) => setItems((prev) => prev.filter((_, idx) => idx !== i));
  const updateItem = (i: number, patch: Partial<LineItem>) =>
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));

  const save = async () => {
    if (!portalUserId) return toast.error('Select a learner / payer');
    const valid = items.filter((i) => i.description.trim() && i.unit_price > 0);
    if (valid.length === 0) return toast.error('Add at least one line item');

    setSaving(true);
    try {
      const res = await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          portal_user_id: portalUserId,
          school_id: selectedStudent?.school_id ?? null,
          due_date: dueDate || null,
          currency,
          amount: total,
          items: valid,
          notes,
          status: 'sent',
          send_email: sendEmail,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'Failed to create invoice');
      toast.success(`Invoice ${j.data?.invoice_number || ''} created`);
      onCreated();
    } catch (e: unknown) {
      toast.error((e as Error).message || 'Failed to create invoice');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-background border border-border rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div>
            <p className="font-black text-foreground text-sm">Quick invoice</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Single-payer invoice. For cohort billing use Billing Cycles.
            </p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1.5">
              Payer (learner / parent account)
            </label>
            {selectedStudent ? (
              <div className="flex items-center justify-between px-3 py-2 border border-border bg-card rounded-md">
                <div>
                  <p className="text-sm font-bold text-foreground">{selectedStudent.full_name}</p>
                  <p className="text-[11px] text-muted-foreground">{selectedStudent.email}</p>
                </div>
                <button
                  onClick={() => setPortalUserId('')}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <XMarkIcon className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <>
                <div className="relative">
                  <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search learner…"
                    className="w-full pl-9 pr-3 py-2 text-sm border border-border bg-background rounded-md focus:outline-none focus:border-primary"
                  />
                </div>
                {query && (
                  <div className="border border-border rounded-md mt-1 max-h-40 overflow-y-auto divide-y divide-border">
                    {filteredStudents.length === 0 ? (
                      <p className="text-xs text-muted-foreground p-3">No matches</p>
                    ) : (
                      filteredStudents.map((s) => (
                        <button
                          key={s.id}
                          onClick={() => {
                            setPortalUserId(s.id);
                            setQuery('');
                          }}
                          className="w-full text-left px-3 py-2 hover:bg-muted text-xs"
                        >
                          <p className="font-bold text-foreground">{s.full_name}</p>
                          <p className="text-[11px] text-muted-foreground">{s.email}</p>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1.5">
                Currency
              </label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full text-sm border border-border bg-background px-3 py-2 rounded-md focus:outline-none focus:border-primary"
              >
                <option value="NGN">NGN (₦)</option>
                <option value="USD">USD ($)</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1.5">
                Due date
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full text-sm border border-border bg-background px-3 py-2 rounded-md focus:outline-none focus:border-primary"
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1.5">
              Line items
            </label>
            <div className="space-y-2">
              {items.map((it, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    type="text"
                    value={it.description}
                    onChange={(e) => updateItem(i, { description: e.target.value })}
                    placeholder="Description"
                    className="flex-1 text-sm border border-border bg-background px-3 py-2 rounded-md focus:outline-none focus:border-primary"
                  />
                  <input
                    type="number"
                    value={it.quantity}
                    min={1}
                    onChange={(e) => updateItem(i, { quantity: Number(e.target.value) || 1 })}
                    className="w-16 text-sm border border-border bg-background px-2 py-2 rounded-md focus:outline-none focus:border-primary"
                  />
                  <input
                    type="number"
                    value={it.unit_price}
                    min={0}
                    step={100}
                    onChange={(e) => updateItem(i, { unit_price: Number(e.target.value) || 0 })}
                    placeholder="Unit price"
                    className="w-32 text-sm border border-border bg-background px-3 py-2 rounded-md focus:outline-none focus:border-primary"
                  />
                  <button
                    onClick={() => removeItem(i)}
                    disabled={items.length === 1}
                    className="px-2 text-rose-400 hover:text-rose-300 disabled:opacity-30"
                  >
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
            <button
              onClick={addItem}
              className="mt-2 inline-flex items-center gap-1 text-xs font-black uppercase tracking-widest text-primary hover:text-primary/80"
            >
              <PlusIcon className="w-3 h-3" /> Add line
            </button>
          </div>

          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1.5">
              Notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Payment instructions, reference, etc."
              rows={2}
              className="w-full text-sm border border-border bg-background px-3 py-2 rounded-md focus:outline-none focus:border-primary"
            />
          </div>

          <label className="flex items-center gap-2 text-xs font-bold text-foreground">
            <input
              type="checkbox"
              checked={sendEmail}
              onChange={(e) => setSendEmail(e.target.checked)}
            />{' '}
            <EnvelopeIcon className="w-4 h-4" /> Email this invoice to the payer now
          </label>
        </div>

        <div className="p-5 border-t border-border flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              Total
            </p>
            <p className="text-xl font-black text-foreground">{formatMoney(total, currency)}</p>
          </div>
          <div className="flex gap-2 flex-wrap justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-black uppercase tracking-widest text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
            <button
              onClick={openPreview}
              disabled={saving || total === 0}
              className="inline-flex items-center gap-1 px-4 py-2 border border-border hover:border-primary text-xs font-black uppercase tracking-widest rounded-md disabled:opacity-40"
              title="Live preview before issuing"
            >
              <EyeIcon className="w-4 h-4" /> Preview
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="inline-flex items-center gap-1 px-4 py-2 bg-primary text-primary-foreground text-xs font-black uppercase tracking-widest rounded-md disabled:opacity-50"
            >
              {saving ? (
                'Creating…'
              ) : (
                <>
                  <CheckCircleIcon className="w-4 h-4" /> Create invoice
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {preview && (
        <DocPreviewModal
          type="invoice"
          data={preview}
          canManage={false}
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  );
}

export default InvoicesPanel;
