'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/auth-context';
import { roleHasCapability } from '@/lib/auth/capabilities';
import { createClient } from '@/lib/supabase/client';
import {
  DocumentTextIcon,
  PlusIcon,
  BuildingOfficeIcon,
  UserIcon,
  MagnifyingGlassIcon,
  TrashIcon,
  XMarkIcon,
  EnvelopeIcon,
  CheckCircleIcon,
  CheckBadgeIcon,
  BellAlertIcon,
  EyeIcon,
  PencilSquareIcon,
  CreditCardIcon,
} from '@/lib/icons';
import {
  classifyInvoiceStream,
  streamPillClasses,
  streamLabel,
  type FinanceStream,
} from '@/lib/finance/streams';
import { formatMoney, formatShortDate } from '@/lib/finance/formatters';
import { DocPreviewModal, type DocPreviewData } from './DocPreviewModal';
import { SchoolInvoiceBuilderPanel } from './SchoolInvoiceBuilderPanel';
import { TermInvoicePayPanel } from './TermInvoicePayPanel';
import {
  FINANCE_ACADEMIC_TERM_ID_PARAM,
  FINANCE_ACADEMIC_YEAR_PARAM,
  FINANCE_BILLING_SCHOOL_PARAM,
  FINANCE_EDIT_INVOICE_PARAM,
  FINANCE_OPEN_SCHOOL_INVOICE_PARAM,
  FINANCE_TERM_NUMBER_PARAM,
} from '@/lib/school-reports/finance-links';
import { normalizeFinanceAcademicYearParam } from '@/lib/school-reports/invoice-match';
import { schoolSessionDisplay } from '@/lib/finance/school-term';
import { invoiceOutstandingAmount, invoiceOverpaidAmount } from '@/lib/finance/invoice-state';
import { getSessionBoundary, isStudentInCurrentSession } from '@/lib/academic/session-scope';

interface InvoiceRow {
  id: string;
  invoice_number: string;
  status: string;
  amount: number;
  amount_paid?: number | null;
  amount_remaining?: number | null;
  original_amount?: number | null;
  currency: string;
  created_at: string;
  due_date?: string | null;
  stream?: string | null;
  school_id?: string | null;
  portal_user_id?: string | null;
  billing_cycle_id?: string | null;
  items?: unknown;
  notes?: string | null;
  metadata?: {
    academic_year?: number | string;
    term_number?: number | string;
    term_label?: string;
  } | null;
  schools?: { name?: string } | null;
  portal_users?: { full_name?: string; email?: string } | null;
  finance_academic_links?: Array<{
    academic_offering_id: string;
    offering_period_id: string;
    link_source?: string;
    academic_offerings?: { title?: string; pathway?: string; enrollment_type?: string } | null;
    academic_offering_periods?: { label?: string } | null;
  }>;
  billing_contacts?: { representative_email?: string | null; representative_name?: string | null } | null;
}

function academicCoverageLabel(invoice: InvoiceRow): string | null {
  const links = invoice.finance_academic_links ?? [];
  if (links.length === 0) return null;
  if (links.length > 1) return `${links.length} academic periods linked`;
  const link = links[0];
  const offering = link.academic_offerings?.title?.trim();
  const period = link.academic_offering_periods?.label?.trim();
  if (offering && period) return `${offering} / ${period}`;
  return offering || period || 'Academic period linked';
}

interface StudentOption {
  id: string;
  full_name: string;
  email: string;
  school_id: string | null;
  created_at?: string | null;
  metadata?: Record<string, any> | null;
  session_status?: string | null;
}

const INVOICE_STATUS_STYLES: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground border-border',
  pending: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30',
  sent: 'bg-primary/10 text-primary border-primary/30',
  partially_paid: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30',
  paid: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
  overdue: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30',
  cancelled: 'bg-muted text-muted-foreground border-border',
  void: 'bg-muted text-muted-foreground border-border',
};

/**
 * InvoicesPanel — the single invoice creation and management workspace.
 * School term invoices keep reminders and collections on one record — edit in Finance like any invoice.
 */
export function InvoicesPanel({ editInvoiceId }: { editInvoiceId?: string | null } = {}) {
  const { profile } = useAuth();
  const db = createClient();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isAdmin = profile?.role === 'admin';
  const isSchool = profile?.role === 'school';
  const canManageInvoices = roleHasCapability(profile?.role, 'manage_finance');
  const canCreateInvoices = canManageInvoices;
  /** Mark paid / remind — staff who collect in person */
  const canCollect = canManageInvoices;

  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'paid' | 'overdue' | 'overpaid'>('all');
  const [streamFilter, setStreamFilter] = useState<'all' | FinanceStream>('all');
  const [showForm, setShowForm] = useState(false);
  const [showGeneratorChoice, setShowGeneratorChoice] = useState(false);
  const [showSchoolGenerator, setShowSchoolGenerator] = useState(false);
  const [editingSchoolInvoiceId, setEditingSchoolInvoiceId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [recordingPaymentInv, setRecordingPaymentInv] = useState<InvoiceRow | null>(null);
  const [recordAmount, setRecordAmount] = useState('');
  const [recordMethod, setRecordMethod] = useState('bank_transfer');
  const [recordReference, setRecordReference] = useState('');
  const [recordNote, setRecordNote] = useState('');
  const [emailingId, setEmailingId] = useState<string | null>(null);
  const [emailOverride, setEmailOverride] = useState('');
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<DocPreviewData | null>(null);
  const [termDupes, setTermDupes] = useState<Array<{
    term_label: string;
    school_name: string;
    suggested_keep_id: string;
    suggested_cancel_ids: string[];
    invoices: Array<{ id: string; invoice_number: string; status: string }>;
  }>>([]);
  const [cleaningDupes, setCleaningDupes] = useState(false);
  const [payingInvoiceId, setPayingInvoiceId] = useState<string | null>(null);
  const [schoolInvoicePrefill, setSchoolInvoicePrefill] = useState<{
    schoolId?: string;
    academicTermId?: string;
    academicYear?: string;
    termNumber?: '1' | '2' | '3';
  } | null>(null);
  const billingSchoolParam = searchParams.get(FINANCE_BILLING_SCHOOL_PARAM);
  const academicTermIdParam = searchParams.get(FINANCE_ACADEMIC_TERM_ID_PARAM);
  const academicYearParam = searchParams.get(FINANCE_ACADEMIC_YEAR_PARAM);
  const termNumberParam = searchParams.get(FINANCE_TERM_NUMBER_PARAM);
  const openSchoolInvoiceParam = searchParams.get(FINANCE_OPEN_SCHOOL_INVOICE_PARAM) === '1';
  const initialTermNumber =
    termNumberParam === '1' || termNumberParam === '2' || termNumberParam === '3' ? termNumberParam : undefined;

  const clearFinanceDeepLinkParams = useCallback(
    (keys: string[]) => {
      const params = new URLSearchParams(searchParams.toString());
      let changed = false;
      for (const key of keys) {
        if (params.has(key)) {
          params.delete(key);
          changed = true;
        }
      }
      if (!changed) return;
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  // Deep-link: ?edit_invoice=<id> opens school builder once, then clears the param
  useEffect(() => {
    if (!editInvoiceId || !isAdmin) return;
    setEditingSchoolInvoiceId(editInvoiceId);
    setShowSchoolGenerator(true);
    setShowGeneratorChoice(false);
    setShowForm(false);
    clearFinanceDeepLinkParams([FINANCE_EDIT_INVOICE_PARAM]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editInvoiceId, isAdmin]);

  // Deep-link from school report: open existing invoice for edit when matched, else prefill create
  useEffect(() => {
    if (editInvoiceId || !isAdmin || !openSchoolInvoiceParam || !billingSchoolParam) return;

    let cancelled = false;
    const normalizedYear = academicYearParam
      ? normalizeFinanceAcademicYearParam(academicYearParam)
      : undefined;

    const openCreate = () => {
      if (cancelled) return;
      setSchoolInvoicePrefill({
        schoolId: billingSchoolParam,
        academicTermId: academicTermIdParam ?? undefined,
        academicYear: normalizedYear ?? academicYearParam ?? undefined,
        termNumber: initialTermNumber,
      });
      setEditingSchoolInvoiceId(null);
      setShowSchoolGenerator(true);
      setShowGeneratorChoice(false);
      setShowForm(false);
      clearFinanceDeepLinkParams([
        FINANCE_OPEN_SCHOOL_INVOICE_PARAM,
        FINANCE_BILLING_SCHOOL_PARAM,
        FINANCE_ACADEMIC_TERM_ID_PARAM,
        FINANCE_ACADEMIC_YEAR_PARAM,
        FINANCE_TERM_NUMBER_PARAM,
      ]);
    };

    if (normalizedYear && initialTermNumber) {
      fetch(
        `/api/billing/docs/data?mode=linked&schoolId=${encodeURIComponent(billingSchoolParam)}` +
          `&academicYear=${encodeURIComponent(normalizedYear)}` +
          `&termNumber=${encodeURIComponent(initialTermNumber)}`,
        { cache: 'no-store' },
      )
        .then((r) => (r.ok ? r.json() : { data: {} }))
        .then((j) => {
          if (cancelled) return;
          const linkedId = j.data?.invoice?.id as string | undefined;
          if (linkedId) {
            setEditingSchoolInvoiceId(linkedId);
            setSchoolInvoicePrefill(null);
            setShowSchoolGenerator(true);
            setShowGeneratorChoice(false);
            setShowForm(false);
            clearFinanceDeepLinkParams([
              FINANCE_OPEN_SCHOOL_INVOICE_PARAM,
              FINANCE_BILLING_SCHOOL_PARAM,
              FINANCE_ACADEMIC_TERM_ID_PARAM,
              FINANCE_ACADEMIC_YEAR_PARAM,
              FINANCE_TERM_NUMBER_PARAM,
            ]);
            return;
          }
          openCreate();
        })
        .catch(() => openCreate());
    } else {
      openCreate();
    }

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [billingSchoolParam, editInvoiceId, isAdmin, openSchoolInvoiceParam]);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/invoices?limit=200');
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'Failed to load invoices');
      setInvoices(j.data ?? []);
      if (isAdmin) {
        const dRes = await fetch('/api/finance/school-term-duplicates', { cache: 'no-store' });
        const dJson = dRes.ok ? await dRes.json() : { data: [] };
        setTermDupes(dJson.data ?? []);
      }
    } catch (e: unknown) {
      toast.error((e as Error).message || 'Failed to load invoices');
      setInvoices([]);
    } finally {
      setLoading(false);
    }
  };

  const cleanTermDuplicates = async (group: (typeof termDupes)[number]) => {
    if (!group.suggested_cancel_ids.length) return;
    if (!confirm(
      `Cancel ${group.suggested_cancel_ids.length} duplicate invoice(s) for ${group.school_name} — ${group.term_label}?\n\nKeep ${group.invoices.find((i) => i.id === group.suggested_keep_id)?.invoice_number ?? 'oldest'}.`,
    )) return;
    setCleaningDupes(true);
    try {
      const res = await fetch('/api/finance/school-term-duplicates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keepInvoiceId: group.suggested_keep_id,
          cancelInvoiceIds: group.suggested_cancel_ids,
          reason: `Duplicate term cleanup — ${group.term_label}`,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'Cleanup failed');
      const skipped = Array.isArray(j.skipped) ? j.skipped.length : 0;
      toast.success(
        `Cancelled ${j.cancelled?.length ?? 0} duplicate(s)${skipped ? ` · ${skipped} skipped (paid or locked)` : ''}`,
      );
      await load();
    } catch (e: unknown) {
      toast.error((e as Error).message);
    } finally {
      setCleaningDupes(false);
    }
  };

  // ── Inline staff actions (no navigation away) ──────────────────────────

  const openRecordPaymentModal = (inv: InvoiceRow) => {
    const remaining = invoiceOutstandingAmount(inv);
    const defaultAmt = remaining > 0 ? remaining : Number(inv.amount) || 0;
    setRecordingPaymentInv(inv);
    setRecordAmount(String(defaultAmt));
    setRecordMethod('bank_transfer');
    setRecordReference('');
    setRecordNote('');
  };

  const submitRecordedPayment = async () => {
    if (!recordingPaymentInv) return;
    const inv = recordingPaymentInv;
    const parsedAmount = Number(recordAmount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      toast.error('Enter a valid payment amount greater than zero.');
      return;
    }
    setBusyId(inv.id);
    try {
      const res = await fetch('/api/invoices/mark-paid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoiceId: inv.id,
          amount: parsedAmount,
          method: recordMethod,
          reference: recordReference.trim() || undefined,
          note: recordNote.trim() || undefined,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(j.error || 'Failed to record payment');
      }
      const overpaid = Number(j.overpaidAmount ?? 0);
      const nextStatus = j.status ?? 'paid';
      if (overpaid > 0) {
        toast.success(
          `Paid · +${formatMoney(overpaid, inv.currency)} overpayment credit recorded on ledger`,
        );
      } else if (nextStatus === 'partially_paid') {
        toast.success(
          `Partial payment (${formatMoney(parsedAmount, inv.currency)}) recorded · ${formatMoney(Number(j.remainingAmount ?? 0), inv.currency)} remaining`,
        );
      } else {
        toast.success(
          j.receiptUrl ? 'Paid, receipted, and acknowledged' : 'Paid and acknowledgement queued',
        );
      }
      setRecordingPaymentInv(null);
      await load();
    } catch (e: unknown) {
      toast.error((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  function resolvedEmail(inv: InvoiceRow) {
    return inv.billing_contacts?.representative_email || inv.portal_users?.email || null;
  }

  const sendEmail = async (inv: InvoiceRow, recipientEmail?: string) => {
    setBusyId(inv.id);
    try {
      const res = await fetch('/api/payments/invoices/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceId: inv.id, recipientEmail: recipientEmail?.trim() || undefined }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.success === false) throw new Error(j.message || j.error || 'Failed to send email');
      setSentIds(prev => new Set(prev).add(inv.id));
      setEmailingId(null);
      setEmailOverride('');
      toast.success(`Emailed to ${recipientEmail?.trim() || resolvedEmail(inv) || 'payer'}`);
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

  const canPayTermInvoice = (inv: InvoiceRow) =>
    isSchool
    && !!inv.billing_cycle_id
    && !['paid', 'cancelled', 'void'].includes(inv.status);

  const showManualRemind = (inv: InvoiceRow) =>
    canCollect
    && inv.status !== 'paid'
    && (!inv.billing_cycle_id || isAdmin);

  const deleteInvoice = async (inv: InvoiceRow) => {
    const action = 'Cancel';
    if (!confirm(`${action} invoice #${inv.invoice_number}? The ledger record will be preserved.`)) return;
    setBusyId(inv.id);
    try {
      const res = await fetch(`/api/invoices/${inv.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `Failed to ${action.toLowerCase()}`);
      }
      toast.success('Invoice cancelled; history preserved');
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

    const stream = classifyInvoiceStream({
      stream: inv.stream,
      school_id: inv.school_id ?? null,
      billing_cycle_id: inv.billing_cycle_id ?? null,
      portal_user_id: inv.portal_user_id ?? null,
      schools: inv.schools ?? null,
    });

    // Resolve recipient email: billing_contacts → portal_users (individual)
    const resolvedEmail = stream === 'school'
      ? (inv.billing_contacts?.representative_email || undefined)
      : (inv.portal_users?.email || undefined);
    const termLabel =
      (inv.metadata?.term_label as string | undefined)
      || (inv.metadata?.term_number != null && inv.metadata?.academic_year != null
        ? schoolSessionDisplay(String(inv.metadata.academic_year), String(inv.metadata.term_number))
        : null);

    setPreview({
      id: inv.id,
      number: inv.invoice_number,
      date: new Date(inv.created_at).toLocaleDateString(),
      dueDate: inv.due_date ? new Date(inv.due_date).toLocaleDateString() : undefined,
      status: inv.status,
      stream,
      items,
      amount: inv.amount,
      currency: inv.currency,
      studentName: stream === 'school'
        ? (inv.schools?.name || 'Partner School')
        : (inv.portal_users?.full_name || 'Client'),
      studentEmail: resolvedEmail,
      schoolName: 'RILLCOD TECHNOLOGIES',
      // Persisted invoices always preview the same server-owned document used
      // by the PDF/print action. This prevents payment details drifting between
      // the quick preview, corrected invoice, and resend.
      documentUrl: `/api/invoices/${inv.id}/pdf`,
      billingCycleId: inv.billing_cycle_id ?? null,
      termLabel,
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
          schools: inv.schools ?? null,
        }),
      }))
      .filter((inv) => (streamFilter === 'all' ? true : inv.stream === streamFilter))
      .filter((inv) => {
        if (statusFilter === 'all') return true;
        if (statusFilter === 'paid') return inv.status === 'paid';
        if (statusFilter === 'overdue') return inv.status === 'overdue';
        if (statusFilter === 'overpaid') return invoiceOverpaidAmount(inv as any) > 0;
        // "open" = anything still collectible, overdue included.
        return ['sent', 'draft', 'overdue', 'partially_paid'].includes(inv.status);
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

  const ledgerMetrics = useMemo(() => {
    let totalBilled = 0;
    let totalPaid = 0;
    let totalOutstanding = 0;
    let totalOverpaid = 0;
    let overpaidCount = 0;
    for (const inv of invoices) {
      if (['cancelled', 'void'].includes(String(inv.status || '').toLowerCase())) continue;
      if (streamFilter !== 'all') {
        const s = classifyInvoiceStream({
          stream: inv.stream,
          school_id: inv.school_id,
          billing_cycle_id: inv.billing_cycle_id ?? null,
          portal_user_id: inv.portal_user_id ?? null,
          schools: inv.schools ?? null,
        });
        if (s !== streamFilter) continue;
      }
      totalBilled += Number(inv.amount || 0);
      totalPaid += Number(inv.amount_paid || 0);
      totalOutstanding += invoiceOutstandingAmount(inv as any);
      const over = invoiceOverpaidAmount(inv as any);
      if (over > 0) {
        totalOverpaid += over;
        overpaidCount += 1;
      }
    }
    return { totalBilled, totalPaid, totalOutstanding, totalOverpaid, overpaidCount };
  }, [invoices, streamFilter]);

  return (
    <div className="space-y-4">
      {isAdmin && termDupes.length > 0 && (
        <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 space-y-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-amber-700 dark:text-amber-300">Term duplicates</p>
            <p className="text-sm font-bold text-foreground mt-0.5">
              {termDupes.length} school term(s) have more than one active invoice. Clean these so payment stays term-aware.
            </p>
          </div>
          {termDupes.map((g) => (
            <div key={`${g.school_name}-${g.term_label}`} className="flex flex-col sm:flex-row sm:items-center gap-2 rounded-xl border border-amber-500/20 bg-background/40 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-black text-foreground truncate">{g.school_name}</p>
                <p className="text-[11px] text-muted-foreground">
                  {g.term_label} · {g.invoices.map((i) => i.invoice_number).join(', ')}
                </p>
              </div>
              <button
                type="button"
                disabled={cleaningDupes}
                onClick={() => void cleanTermDuplicates(g)}
                className="inline-flex items-center justify-center px-3 py-1.5 rounded-lg bg-amber-500 text-black text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
              >
                Keep oldest · cancel rest
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center gap-2">
          {canCreateInvoices && (
            <button
              type="button"
              onClick={() => setShowGeneratorChoice(true)}
              className="inline-flex min-h-10 items-center gap-1.5 px-3.5 py-2 bg-primary text-primary-foreground font-black text-xs uppercase tracking-wider rounded-xl hover:opacity-95"
            >
              <PlusIcon className="w-4 h-4" /> New Invoice
            </button>
          )}
          {isAdmin && (
            <Link
              href="/dashboard/payments/bulk"
              className="inline-flex min-h-10 items-center gap-1.5 px-3.5 py-2 border border-border bg-card font-bold text-xs rounded-xl hover:border-primary/50 text-foreground"
            >
              Bulk Billing
            </Link>
          )}
          {filtered.length > 0 && (
            <button
              type="button"
              onClick={() => {
                const esc = (v: unknown) => {
                  let s = v == null ? '' : String(v);
                  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
                  return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
                };
                const headers = ['Invoice #', 'Stream', 'Status', 'Payer / School', 'Amount', 'Paid', 'Remaining', 'Currency', 'Issued', 'Due'];
                const rows = filtered.map((inv) => [
                  esc(inv.invoice_number),
                  esc(streamLabel(inv.stream)),
                  esc(inv.status),
                  esc(inv.schools?.name || inv.portal_users?.full_name || '—'),
                  esc(inv.amount),
                  esc(inv.amount_paid ?? 0),
                  esc(invoiceOutstandingAmount(inv as any)),
                  esc(inv.currency || 'NGN'),
                  esc(formatShortDate(inv.created_at)),
                  esc(inv.due_date ? formatShortDate(inv.due_date) : '—'),
                ].join(','));
                const blob = new Blob(['\uFEFF' + [headers.join(','), ...rows].join('\n')], { type: 'text/csv;charset=utf-8;' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `rillcod-invoices-${new Date().toISOString().slice(0, 10)}.csv`;
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="inline-flex min-h-10 items-center gap-1.5 px-3 py-2 border border-border bg-card font-bold text-xs rounded-xl hover:border-primary/50 text-foreground"
            >
              Export CSV ({filtered.length})
            </button>
          )}
          <div className="relative flex-1 min-w-[200px]">
            <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search invoice #, school, payer…"
              aria-label="Search invoices"
              className="w-full min-h-10 pl-9 pr-3 py-2 text-xs border border-border bg-background rounded-xl focus:outline-none focus:border-primary"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center overflow-x-auto border border-border rounded-xl p-0.5 bg-muted/30 text-xs max-w-full scrollbar-hide">
            {(['all', 'open', 'paid', 'overdue', 'overpaid'] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(s)}
                className={`shrink-0 px-3 py-1.5 rounded-lg font-bold capitalize transition-colors ${
                  statusFilter === s
                    ? 'bg-card text-foreground shadow-sm border border-border'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {s === 'overpaid' && ledgerMetrics.overpaidCount > 0
                  ? `Overpaid (${ledgerMetrics.overpaidCount})`
                  : s}
              </button>
            ))}
          </div>

          {(isAdmin || isSchool) && (
            <div className="inline-flex border border-border rounded-xl p-0.5 bg-muted/30 text-xs">
              {(['all', 'school', 'individual'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStreamFilter(s)}
                  className={`px-3 py-1.5 rounded-lg font-bold transition-colors ${
                    streamFilter === s
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {s === 'all' ? 'All Streams' : streamLabel(s)}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Financial & Overpayment Summary Strip */}
      {!loading && invoices.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-xl border border-border bg-card/60 p-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Total Billed</p>
            <p className="text-base font-black text-foreground mt-0.5">{formatMoney(ledgerMetrics.totalBilled, 'NGN')}</p>
          </div>
          <div className="rounded-xl border border-border bg-card/60 p-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Total Received</p>
            <p className="text-base font-black text-emerald-700 dark:text-emerald-300 mt-0.5">{formatMoney(ledgerMetrics.totalPaid, 'NGN')}</p>
          </div>
          <div className="rounded-xl border border-border bg-card/60 p-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Outstanding Due</p>
            <p className="text-base font-black text-amber-700 dark:text-amber-300 mt-0.5">{formatMoney(ledgerMetrics.totalOutstanding, 'NGN')}</p>
          </div>
          <button
            type="button"
            onClick={() => setStatusFilter(statusFilter === 'overpaid' ? 'all' : 'overpaid')}
            className={`text-left rounded-xl border p-3 transition-colors ${
              ledgerMetrics.totalOverpaid > 0
                ? 'border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/15'
                : 'border-border bg-card/60'
            }`}
          >
            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700 dark:text-emerald-300">
              Overpaid / School Credit
            </p>
            <p className="text-base font-black text-emerald-700 dark:text-emerald-300 mt-0.5">
              +{formatMoney(ledgerMetrics.totalOverpaid, 'NGN')}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {ledgerMetrics.overpaidCount > 0
                ? `${ledgerMetrics.overpaidCount} invoice(s) with credit · click to filter`
                : 'Overpayments auto-captured here'}
            </p>
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="border border-dashed border-border rounded-xl p-10 text-center">
          <DocumentTextIcon className="w-10 h-10 mx-auto text-muted-foreground/40" />
          <p className="text-sm font-bold text-foreground mt-2">No invoices found</p>
          <p className="text-xs text-muted-foreground mt-1">
            {canCreateInvoices ? 'Create an invoice above. Term invoices include automatic reminders and collections.' : 'No invoices are available in your permitted scope.'}
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
                    {inv.stream === 'school' && inv.billing_cycle_id ? (
                      (() => {
                        const session =
                          inv.metadata?.term_label
                          || (inv.metadata?.term_number != null && inv.metadata?.academic_year != null
                            ? schoolSessionDisplay(String(inv.metadata.academic_year), String(inv.metadata.term_number))
                            : null);
                        return (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest border border-primary/30 bg-primary/10 text-primary">
                            {session ? `Term billing · ${session}` : 'Term billing'}
                          </span>
                        );
                      })()
                    ) : null}
                    {academicCoverageLabel(inv) && (
                      <span className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-black text-emerald-600 dark:text-emerald-400">
                        {academicCoverageLabel(inv)}
                      </span>
                    )}
                    <span className="text-[11px] font-mono text-muted-foreground">
                      #{inv.invoice_number}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-2 flex-wrap text-sm">
                    <span className="font-black text-foreground">
                      {formatMoney(inv.amount, inv.currency)}
                    </span>
                    {Number(inv.amount_paid ?? 0) > 0 && (
                      <span className="text-xs font-bold text-emerald-700 dark:text-emerald-300">
                        Paid {formatMoney(Number(inv.amount_paid), inv.currency)}
                      </span>
                    )}
                    {inv.amount_remaining != null && Number(inv.amount_remaining) > 0.01 && Number(inv.amount_remaining) < Number(inv.amount) && (
                      <span className="text-xs font-bold text-amber-600 dark:text-amber-400">
                        Remaining {formatMoney(inv.amount_remaining, inv.currency)}
                      </span>
                    )}
                    {invoiceOverpaidAmount(inv as any) > 0 && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest bg-emerald-500/15 border border-emerald-500/40 text-emerald-700 dark:text-emerald-300">
                        Overpaid · +{formatMoney(invoiceOverpaidAmount(inv as any), inv.currency)} Credit
                      </span>
                    )}
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

                  {canPayTermInvoice(inv) && (
                    <button
                      onClick={() => setPayingInvoiceId(payingInvoiceId === inv.id ? null : inv.id)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-primary text-primary-foreground text-[10px] font-black uppercase tracking-widest rounded-md"
                      title="Pay this term invoice online or upload bank transfer proof"
                    >
                      <CreditCardIcon className="w-3 h-3" />
                      {payingInvoiceId === inv.id ? 'Hide pay' : 'Pay'}
                    </button>
                  )}

                  {canManageInvoices && (
                    classifyInvoiceStream(inv) === 'school' ? (
                      <button
                        onClick={() => { setEditingSchoolInvoiceId(inv.id); setShowSchoolGenerator(true); }}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-primary text-primary-foreground text-[10px] font-black uppercase tracking-widest rounded-md"
                        title="Edit premium school invoice"
                      >
                        <PencilSquareIcon className="w-3 h-3" /> Edit
                      </button>
                    ) : (
                      <Link
                        href={`/dashboard/payments/invoices/${inv.id}/edit`}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-primary text-primary-foreground text-[10px] font-black uppercase tracking-widest rounded-md"
                        title="Edit invoice"
                      >
                        <PencilSquareIcon className="w-3 h-3" /> Edit
                      </Link>
                    )
                  )}

                  {canCollect && inv.status !== 'cancelled' && inv.status !== 'void' && (
                    <button
                      onClick={() => openRecordPaymentModal(inv)}
                      disabled={busyId === inv.id}
                      className={`inline-flex items-center gap-1 px-2.5 py-1.5 disabled:opacity-50 text-[10px] font-black uppercase tracking-widest rounded-md ${
                        inv.status === 'paid'
                          ? 'border border-emerald-500/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/10'
                          : 'bg-emerald-700 hover:bg-emerald-800 text-white'
                      }`}
                      title={
                        inv.status === 'paid'
                          ? 'Record an overpayment or additional remittance on this invoice'
                          : 'Record full, partial, or overpaid remittance'
                      }
                    >
                      <CheckBadgeIcon className="w-3 h-3" />
                      {inv.status === 'paid' ? '+ Overpayment' : 'Record Payment'}
                    </button>
                  )}

                  {showManualRemind(inv) && (
                    <button
                      onClick={() => sendReminder(inv)}
                      disabled={busyId === inv.id}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 border border-border hover:border-amber-500/50 text-amber-600 dark:text-amber-400 text-[10px] font-black uppercase tracking-widest rounded-md"
                      title={inv.billing_cycle_id ? 'Send a manual reminder (automatic term reminders also run on schedule)' : 'Send payment reminder'}
                    >
                      <BellAlertIcon className="w-3 h-3" /> Remind
                    </button>
                  )}

                  {canCollect && (
                    emailingId === inv.id ? (
                      <div className="flex items-center gap-1 bg-card border border-primary/40 rounded-md px-2 py-1.5">
                        <EnvelopeIcon className="w-3 h-3 text-primary shrink-0" />
                        <input
                          type="email"
                          value={emailOverride}
                          onChange={e => setEmailOverride(e.target.value)}
                          placeholder={resolvedEmail(inv) ?? 'email@school.com'}
                          autoFocus
                          className="text-[11px] outline-none bg-transparent text-foreground w-36 placeholder:text-muted-foreground/50"
                          onKeyDown={e => {
                            if (e.key === 'Enter') sendEmail(inv, emailOverride || resolvedEmail(inv) || '');
                            if (e.key === 'Escape') { setEmailingId(null); setEmailOverride(''); }
                          }}
                        />
                        <button
                          onClick={() => sendEmail(inv, emailOverride || resolvedEmail(inv) || '')}
                          disabled={busyId === inv.id}
                          className="text-[10px] font-black text-primary hover:text-primary/80 disabled:opacity-40 shrink-0"
                        >
                          {busyId === inv.id ? '…' : 'Send'}
                        </button>
                        <button onClick={() => { setEmailingId(null); setEmailOverride(''); }} className="text-muted-foreground hover:text-foreground shrink-0">
                          <XMarkIcon className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setEmailingId(inv.id); setEmailOverride(resolvedEmail(inv) ?? ''); }}
                        className={`inline-flex items-center gap-1 px-2.5 py-1.5 border text-[10px] font-black uppercase tracking-widest rounded-md transition-colors ${
                          sentIds.has(inv.id)
                            ? 'border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/5 hover:bg-emerald-500/10'
                            : 'border-border hover:border-primary/50 text-primary'
                        }`}
                        title={sentIds.has(inv.id) ? 'Sent — click to resend' : resolvedEmail(inv) ? `Email to ${resolvedEmail(inv)}` : 'Email invoice (enter address)'}
                      >
                        <EnvelopeIcon className="w-3 h-3" />
                        {sentIds.has(inv.id) ? '✓ Sent' : 'Email'}
                      </button>
                    )
                  )}

                  <button
                    onClick={() => {
                      const w = window.open(`/api/invoices/${inv.id}/pdf`, '_blank', 'width=960,height=860');
                      if (w) {
                        w.onload = () => setTimeout(() => w.print(), 500);
                      }
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 border border-border text-[10px] font-black uppercase tracking-widest rounded-md hover:border-primary"
                    title="Print / Save PDF"
                  >
                    PDF
                  </button>

                  {isAdmin && inv.status !== 'paid' && (
                    <button
                      onClick={() => deleteInvoice(inv)}
                      disabled={busyId === inv.id}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 border border-rose-500/40 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 text-[10px] font-black uppercase tracking-widest rounded-md"
                      title="Cancel invoice (reminders stop; financial history is preserved)"
                    >
                      <TrashIcon className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
              {payingInvoiceId === inv.id && inv.billing_cycle_id && (
                <TermInvoicePayPanel
                  billingCycleId={inv.billing_cycle_id}
                  amount={Number(inv.amount_remaining ?? inv.amount)}
                  currency={inv.currency}
                  invoiceNumber={inv.invoice_number}
                  onComplete={() => load()}
                />
              )}
            </div>
          ))}
        </div>
      )}


      {showGeneratorChoice && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div role="dialog" aria-modal="true" className="w-full sm:max-w-2xl rounded-t-3xl sm:rounded-3xl border border-border bg-card p-5 sm:p-7">
            <div className="flex items-start justify-between gap-4 mb-5">
              <div><p className="text-lg font-black text-foreground">Create premium invoice</p><p className="text-sm text-muted-foreground">Choose the payer. Both options use the same invoice, payment and receipt lifecycle.</p></div>
              <button onClick={() => setShowGeneratorChoice(false)} className="p-2 rounded-xl hover:bg-muted"><XMarkIcon className="w-5 h-5" /></button>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <button onClick={() => { setShowGeneratorChoice(false); setShowForm(true); }} className="text-left rounded-2xl border border-border p-5 hover:border-primary hover:bg-primary/5 transition-colors">
                <UserIcon className="w-7 h-7 text-primary mb-3" /><p className="font-black text-foreground">Individual invoice</p><p className="text-xs text-muted-foreground mt-1">One student, parent or individual payer with flexible line items.</p>
              </button>
              <button onClick={() => { setShowGeneratorChoice(false); setEditingSchoolInvoiceId(null); setShowSchoolGenerator(true); }} className="text-left rounded-2xl border border-border p-5 hover:border-primary hover:bg-primary/5 transition-colors">
                <BuildingOfficeIcon className="w-7 h-7 text-primary mb-3" /><p className="font-black text-foreground">School / partner invoice</p><p className="text-xs text-muted-foreground mt-1">Premium term, cohort, package, commission and deposit calculations.</p>
              </button>
            </div>
          </div>
        </div>
      )}

      {showSchoolGenerator && (
        <div className="fixed inset-0 z-50 bg-background overflow-y-auto">
          <div className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur px-4 sm:px-6 py-3 flex items-center justify-between">
            <div><p className="font-black text-foreground">Premium school invoice</p><p className="text-xs text-muted-foreground">Unified invoice generator</p></div>
            <button onClick={() => { setShowSchoolGenerator(false); setEditingSchoolInvoiceId(null); setSchoolInvoicePrefill(null); }} className="p-2 rounded-xl border border-border hover:bg-muted"><XMarkIcon className="w-5 h-5" /></button>
          </div>
          <div className="max-w-6xl mx-auto p-4 sm:p-6">
            <SchoolInvoiceBuilderPanel
              editInvoiceId={editingSchoolInvoiceId ?? undefined}
              initialSchoolId={schoolInvoicePrefill?.schoolId}
              initialAcademicTermId={schoolInvoicePrefill?.academicTermId}
              initialAcademicYear={schoolInvoicePrefill?.academicYear}
              initialTermNumber={schoolInvoicePrefill?.termNumber}
              onSaved={() => {
                setShowSchoolGenerator(false);
                setEditingSchoolInvoiceId(null);
                setSchoolInvoicePrefill(null);
                load();
              }}
            />
          </div>
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

      {recordingPaymentInv && (() => {
        const inv = recordingPaymentInv;
        const remaining = invoiceOutstandingAmount(inv as any);
        const alreadyPaid = Math.max(0, Number(inv.amount_paid ?? 0) || 0);
        const existingCredit = invoiceOverpaidAmount(inv as any);
        const targetDue = remaining > 0 ? remaining : 0;
        const entered = Number(recordAmount) || 0;
        const nextOverpaid = Math.max(0, Math.round((entered - targetDue) * 100) / 100);
        const nextRemaining = Math.max(0, Math.round((targetDue - entered) * 100) / 100);
        const payerLabel = inv.schools?.name || inv.portal_users?.full_name || 'Payer';

        return (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-foreground/40 backdrop-blur-sm">
            <div
              role="dialog"
              aria-modal="true"
              aria-label={`Record payment for invoice ${inv.invoice_number}`}
              className="bg-background border border-border rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden"
            >
              <div className="flex items-center justify-between p-5 border-b border-border">
                <div>
                  <p className="font-black text-foreground text-sm">Record Payment / Overpayment</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Invoice #{inv.invoice_number} · {payerLabel}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setRecordingPaymentInv(null)}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label="Close"
                >
                  <XMarkIcon className="w-5 h-5" />
                </button>
              </div>

              <div className="p-5 space-y-4">
                <div className="grid grid-cols-3 gap-2 rounded-xl border border-border bg-card p-3 text-center">
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Invoice Total</p>
                    <p className="text-sm font-black text-foreground mt-0.5">{formatMoney(inv.amount, inv.currency)}</p>
                  </div>
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Already Paid</p>
                    <p className="text-sm font-black text-emerald-700 dark:text-emerald-300 mt-0.5">
                      {formatMoney(alreadyPaid, inv.currency)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">
                      {existingCredit > 0 ? 'Current Credit' : 'Remaining Due'}
                    </p>
                    <p className="text-sm font-black text-primary mt-0.5">
                      {existingCredit > 0
                        ? `+${formatMoney(existingCredit, inv.currency)}`
                        : formatMoney(remaining, inv.currency)}
                    </p>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                      Amount Received ({inv.currency || 'NGN'})
                    </label>
                    <div className="flex items-center gap-1.5">
                      {remaining > 0 && (
                        <>
                          <button
                            type="button"
                            onClick={() => setRecordAmount(String(remaining))}
                            className="px-2 py-0.5 rounded border border-border text-[10px] font-bold hover:border-primary text-foreground"
                          >
                            Full ({formatMoney(remaining, inv.currency)})
                          </button>
                          <button
                            type="button"
                            onClick={() => setRecordAmount(String(Math.round(remaining / 2)))}
                            className="px-2 py-0.5 rounded border border-border text-[10px] font-bold hover:border-primary text-muted-foreground hover:text-foreground"
                          >
                            50%
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  <input
                    type="number"
                    min="1"
                    step="any"
                    value={recordAmount}
                    onChange={(e) => setRecordAmount(e.target.value)}
                    placeholder="Enter exact amount paid by school or client"
                    className="w-full px-3 py-2.5 text-sm font-bold border border-border bg-card rounded-lg focus:outline-none focus:border-primary"
                  />
                </div>

                {entered > 0 && (
                  <div
                    className={`rounded-xl border p-3 text-xs ${
                      nextOverpaid > 0
                        ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200'
                        : nextRemaining > 0
                        ? 'border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200'
                        : 'border-primary/30 bg-primary/10 text-foreground'
                    }`}
                  >
                    {nextOverpaid > 0 ? (
                      <p>
                        <strong>Overpayment detected (+{formatMoney(nextOverpaid, inv.currency)}):</strong>{' '}
                        Invoice will be marked <strong>Paid</strong> in full and{' '}
                        <strong>+{formatMoney(nextOverpaid + existingCredit, inv.currency)}</strong> total credit will be stored on the ledger for {payerLabel}.
                      </p>
                    ) : nextRemaining > 0 ? (
                      <p>
                        <strong>Partial installment:</strong> Records{' '}
                        <strong>{formatMoney(entered, inv.currency)}</strong> paid and leaves{' '}
                        <strong>{formatMoney(nextRemaining, inv.currency)}</strong> remaining (status: <code>partially_paid</code>).
                      </p>
                    ) : (
                      <p>
                        <strong>Exact settlement:</strong> Marks invoice #{inv.invoice_number} <strong>Paid</strong> in full with zero remaining balance.
                      </p>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1.5">
                      Payment Method
                    </label>
                    <select
                      value={recordMethod}
                      onChange={(e) => setRecordMethod(e.target.value)}
                      className="w-full px-3 py-2 text-xs border border-border bg-card rounded-lg focus:outline-none focus:border-primary"
                    >
                      <option value="bank_transfer">Bank Transfer</option>
                      <option value="pos">POS Terminal</option>
                      <option value="cash">Cash</option>
                      <option value="cheque">Cheque</option>
                      <option value="mobile_money">Mobile Money</option>
                      <option value="manual">Manual / Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1.5">
                      Bank / Receipt Reference (optional)
                    </label>
                    <input
                      type="text"
                      value={recordReference}
                      onChange={(e) => setRecordReference(e.target.value)}
                      placeholder="e.g. TRF-9081234"
                      className="w-full px-3 py-2 text-xs border border-border bg-card rounded-lg focus:outline-none focus:border-primary"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1.5">
                    Finance Note (optional)
                  </label>
                  <input
                    type="text"
                    value={recordNote}
                    onChange={(e) => setRecordNote(e.target.value)}
                    placeholder="e.g. School paid ₦50k extra toward next term"
                    className="w-full px-3 py-2 text-xs border border-border bg-card rounded-lg focus:outline-none focus:border-primary"
                  />
                </div>
              </div>

              <div className="p-5 border-t border-border flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setRecordingPaymentInv(null)}
                  className="px-4 py-2 text-xs font-black uppercase tracking-widest text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void submitRecordedPayment()}
                  disabled={busyId === inv.id || entered <= 0}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white text-xs font-black uppercase tracking-widest rounded-lg"
                >
                  <CheckBadgeIcon className="w-4 h-4" />
                  {busyId === inv.id
                    ? 'Recording…'
                    : nextOverpaid > 0
                    ? `Record & Save +${formatMoney(nextOverpaid, inv.currency)} Credit`
                    : nextRemaining > 0
                    ? 'Record Partial Payment'
                    : 'Confirm & Mark Paid'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {preview && (
        <DocPreviewModal
          type="invoice"
          data={preview}
          canManage={canManageInvoices}
          onClose={() => setPreview(null)}
          onChanged={load}
          onEdit={
            preview.id
              ? () => {
                  const id = preview.id!;
                  const stream = preview.stream;
                  setPreview(null);
                  if (stream === 'school') {
                    setEditingSchoolInvoiceId(id);
                    setShowSchoolGenerator(true);
                  } else {
                    window.location.href = `/dashboard/payments/invoices/${id}/edit`;
                  }
                }
              : undefined
          }
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

interface QuickPaymentAccount {
  id: string;
  owner_type?: string;
  is_active?: boolean;
  label?: string | null;
  bank_name: string;
  account_number: string;
  account_name: string;
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
  const [currentSessionOnly, setCurrentSessionOnly] = useState(true);
  const sessionBoundary = useMemo(() => getSessionBoundary(), []);
  const [preview, setPreview] = useState<DocPreviewData | null>(null);
  const [paymentAccounts, setPaymentAccounts] = useState<QuickPaymentAccount[]>([]);
  const [paymentAccountId, setPaymentAccountId] = useState('');
  const [paymentAccountError, setPaymentAccountError] = useState('');

  useEffect(() => {
    setPaymentAccountError('');
    fetch('/api/payment-accounts', { cache: 'no-store' })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || 'Payment accounts could not be loaded.');
        const accounts = (body.data ?? []).filter(
          (account: QuickPaymentAccount) => account.owner_type === 'rillcod' && account.is_active !== false,
        ) as QuickPaymentAccount[];
        if (accounts.length === 0) throw new Error('No active Rillcod payment account is configured.');
        setPaymentAccounts(accounts);
        setPaymentAccountId((current) => current || accounts[0].id);
      })
      .catch((reason) => {
        setPaymentAccounts([]);
        setPaymentAccountId('');
        setPaymentAccountError(reason instanceof Error ? reason.message : 'Payment accounts could not be loaded.');
      });
  }, []);

  const total = items.reduce((s, i) => s + i.quantity * i.unit_price, 0);

  const buildPreviewData = (): DocPreviewData | null => {
    const valid = items.filter((i) => i.description.trim() && i.unit_price > 0);
    const selected = students.find((s) => s.id === portalUserId);
    const paymentAccount = paymentAccounts.find((account) => account.id === paymentAccountId);
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
      paymentMethod: 'bank_transfer',
      depositAccount: paymentAccount
        ? {
            bank_name: paymentAccount.bank_name,
            account_number: paymentAccount.account_number,
            account_name: paymentAccount.account_name,
          }
        : undefined,
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
    const pool = currentSessionOnly
      ? students.filter((s) => isStudentInCurrentSession(s, sessionBoundary))
      : students;
    const activePool = pool.length > 0 ? pool : students;
    if (!q) return activePool.slice(0, 20);
    return activePool
      .filter(
        (s) =>
          s.full_name.toLowerCase().includes(q) ||
          s.email.toLowerCase().includes(q),
      )
      .slice(0, 20);
  }, [query, students, currentSessionOnly, sessionBoundary]);

  const selectedStudent = students.find((s) => s.id === portalUserId);

  const addItem = () =>
    setItems((prev) => [...prev, { description: '', quantity: 1, unit_price: 0 }]);
  const removeItem = (i: number) => setItems((prev) => prev.filter((_, idx) => idx !== i));
  const updateItem = (i: number, patch: Partial<LineItem>) =>
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));

  const save = async (): Promise<boolean> => {
    if (!portalUserId) {
      toast.error('Select a learner / payer');
      return false;
    }
    const valid = items.filter((i) => i.description.trim() && i.unit_price > 0);
    if (valid.length === 0) {
      toast.error('Add at least one line item');
      return false;
    }
    if (!paymentAccountId) {
      toast.error(paymentAccountError || 'Choose an active Rillcod payment account');
      return false;
    }

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
          metadata: {
            payment_method: 'bank_transfer',
            pay_to_account_id: paymentAccountId,
          },
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'Failed to create invoice');

      // The create endpoint doesn't send mail itself — honour the checkbox by
      // firing the invoice email explicitly once the row exists.
      if (sendEmail && j.data?.id) {
        try {
          const mailRes = await fetch('/api/payments/invoices/send-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ invoiceId: j.data.id }),
          });
          const mailJson = await mailRes.json().catch(() => ({}));
          if (!mailRes.ok || mailJson.success === false) {
            toast.warning(`Invoice created, but the email failed: ${mailJson.message || mailJson.error || 'unknown error'}`);
          } else {
            toast.success(`Invoice ${j.data?.invoice_number || ''} created and emailed`);
          }
        } catch {
          toast.warning('Invoice created, but the email could not be sent.');
        }
      } else {
        toast.success(`Invoice ${j.data?.invoice_number || ''} created`);
      }
      onCreated();
      return true;
    } catch (e: unknown) {
      toast.error((e as Error).message || 'Failed to create invoice');
      return false;
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-foreground/35 backdrop-blur-sm">
      <div role="dialog" aria-modal="true" className="bg-background border border-border rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div>
            <p className="font-black text-foreground text-sm">Quick invoice</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Single-payer invoice. Use the school invoice builder for term billing.
            </p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div>
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <label className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                Payer (learner / parent account)
              </label>
              <button
                type="button"
                onClick={() => setCurrentSessionOnly((v) => !v)}
                className={`rounded-full border px-2.5 py-0.5 text-[10px] font-black transition-colors ${
                  currentSessionOnly
                    ? 'border-primary/35 bg-primary/10 text-primary'
                    : 'border-amber-500/40 bg-amber-500/15 text-amber-800 dark:text-amber-300'
                }`}
              >
                {currentSessionOnly ? `${sessionBoundary.periodLabel} Only` : 'All Sessions'}
              </button>
            </div>
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
              Payment account
            </label>
            <select
              value={paymentAccountId}
              onChange={(event) => setPaymentAccountId(event.target.value)}
              disabled={paymentAccounts.length === 0}
              className="w-full text-sm border border-border bg-background px-3 py-2 rounded-md focus:outline-none focus:border-primary disabled:opacity-60"
            >
              <option value="">Select an active account</option>
              {paymentAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.label || account.bank_name} · {account.account_number}
                </option>
              ))}
            </select>
            {paymentAccountError ? (
              <p role="alert" className="mt-1.5 text-xs font-semibold text-rose-700 dark:text-rose-300">
                {paymentAccountError} Invoice creation is paused so no incomplete PDF is issued.
              </p>
            ) : (
              <p className="mt-1.5 text-xs text-muted-foreground">
                These verified details will remain consistent in preview, PDF, email, and resend.
              </p>
            )}
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
                    className="px-2 text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 disabled:opacity-30"
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
              disabled={saving || total === 0 || !paymentAccountId}
              className="inline-flex items-center gap-1 px-4 py-2 border border-border hover:border-primary text-xs font-black uppercase tracking-widest rounded-md disabled:opacity-40"
              title="Live preview before issuing"
            >
              <EyeIcon className="w-4 h-4" /> Preview
            </button>
            <button
              onClick={() => void save()}
              disabled={saving || !paymentAccountId}
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
        <p className="px-5 pb-4 text-[11px] text-muted-foreground">
          Review with Preview, then create from the preview — or create here when you are ready.
        </p>
      </div>

      {preview && (
        <DocPreviewModal
          type="invoice"
          data={preview}
          canManage={false}
          onClose={() => setPreview(null)}
          saveLabel="Create invoice"
          onSave={async () => {
            const ok = await save();
            if (!ok) throw new Error('Could not create invoice');
          }}
        />
      )}
    </div>
  );
}

export default InvoicesPanel;
