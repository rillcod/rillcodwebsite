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
  ArrowPathIcon,
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
import { FinanceModalPortal } from '@/components/finance/FinanceModalPortal';
import {
  analyzeInvoiceIntelligence,
  buildSmartFinanceWhatsAppText,
  buildWhatsAppShareHref,
  isDeliverableExternalEmail,
} from '@/lib/finance/smart-communication';
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
  reminder_1_sent_at?: string | null;
  reminder_2_sent_at?: string | null;
  reminder_3_sent_at?: string | null;
  proof_count?: number;
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
  billing_contacts?: {
    representative_email?: string | null;
    representative_name?: string | null;
    representative_whatsapp?: string | null;
  } | null;
  resolved_recipient?: {
    name?: string | null;
    email?: string | null;
    phone?: string | null;
    source?: string;
  } | null;
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
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'partial' | 'paid' | 'overdue' | 'overpaid'>('all');
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
  const [recordNotifyPayer, setRecordNotifyPayer] = useState(true);
  const [commModalInv, setCommModalInv] = useState<InvoiceRow | null>(null);
  const [commMode, setCommMode] = useState<'issue' | 'remind'>('remind');
  const [commStage, setCommStage] = useState<1 | 2 | 3>(2);
  const [commEmail, setCommEmail] = useState('');
  const [commPhone, setCommPhone] = useState('');
  const [commNote, setCommNote] = useState('');
  const [commSendWhatsAppApi, setCommSendWhatsAppApi] = useState(false);
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
    setRecordNotifyPayer(true);
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
          notifyPayer: recordNotifyPayer,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(j.error || 'Failed to record payment');
      }
      const overpaid = Number(j.overpaidAmount ?? 0);
      const nextStatus = j.status ?? 'paid';
      const waUrl = typeof j.whatsappReceiptUrl === 'string' ? j.whatsappReceiptUrl : null;
      const toastOpts = waUrl
        ? {
            duration: 8000,
            action: {
              label: 'WhatsApp Receipt',
              onClick: () => window.open(waUrl, '_blank', 'noopener,noreferrer'),
            },
          }
        : undefined;

      if (overpaid > 0) {
        toast.success(
          `Paid · +${formatMoney(overpaid, inv.currency)} overpayment credit recorded${j.acknowledgedTo ? ` · Emailed ${j.acknowledgedTo}` : ''}`,
          toastOpts,
        );
      } else if (nextStatus === 'partially_paid') {
        toast.success(
          `Partial payment (${formatMoney(parsedAmount, inv.currency)}) recorded · ${formatMoney(Number(j.remainingAmount ?? 0), inv.currency)} remaining`,
          toastOpts,
        );
      } else {
        toast.success(
          j.acknowledgedTo
            ? `Paid, receipted & emailed to ${j.acknowledgedTo}`
            : j.receiptUrl
            ? 'Paid, receipted, and acknowledged'
            : 'Paid and acknowledgement queued',
          toastOpts,
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

  function resolvedEmail(inv: InvoiceRow): string | null {
    if (isDeliverableExternalEmail(inv.resolved_recipient?.email)) {
      return inv.resolved_recipient!.email!.trim();
    }
    if (isDeliverableExternalEmail(inv.billing_contacts?.representative_email)) {
      return inv.billing_contacts!.representative_email!.trim();
    }
    if (isDeliverableExternalEmail(inv.portal_users?.email)) {
      return inv.portal_users!.email!.trim();
    }
    return null;
  }

  function resolvedPhone(inv: InvoiceRow): string | null {
    return inv.resolved_recipient?.phone || inv.billing_contacts?.representative_whatsapp || null;
  }

  const openCommModal = (inv: InvoiceRow, mode?: 'issue' | 'remind') => {
    const diag = analyzeInvoiceIntelligence(inv);
    const defaultMode: 'issue' | 'remind' =
      mode ?? (inv.status === 'draft' && diag.remindersSentCount === 0 ? 'issue' : 'remind');
    const phone = resolvedPhone(inv) || '';
    setCommModalInv(inv);
    setCommMode(defaultMode);
    setCommStage(diag.recommendedReminderStage);
    setCommEmail(resolvedEmail(inv) || '');
    setCommPhone(phone);
    setCommNote('');
    setCommSendWhatsAppApi(Boolean(phone));
  };

  const buildClientWhatsAppHref = (
    inv: InvoiceRow,
    opts?: { mode?: 'issue' | 'remind'; stage?: 1 | 2 | 3; phone?: string; note?: string },
  ) => {
    const diag = analyzeInvoiceIntelligence(inv);
    const useMode = opts?.mode ?? 'remind';
    const stage = opts?.stage ?? diag.recommendedReminderStage;
    const recipientName =
      inv.resolved_recipient?.name ||
      inv.schools?.name ||
      inv.portal_users?.full_name ||
      'Valued Client';
    const termLabel =
      (inv.metadata?.term_label as string | undefined) ||
      (inv.metadata?.term_number != null && inv.metadata?.academic_year != null
        ? schoolSessionDisplay(String(inv.metadata.academic_year), String(inv.metadata.term_number))
        : null);
    const text = buildSmartFinanceWhatsAppText({
      mode:
        inv.status === 'paid'
          ? 'receipt'
          : useMode === 'issue'
          ? 'invoice'
          : stage === 3
          ? 'reminder_3'
          : stage === 2
          ? 'reminder_2'
          : 'reminder_1',
      recipientName,
      invoiceNumber: inv.invoice_number,
      currency: inv.currency || 'NGN',
      totalAmount: diag.billed > 0 ? diag.billed : inv.amount,
      amountPaid: diag.paid,
      remainingAmount: diag.remaining,
      overpaidAmount: diag.overpaid,
      dueDate: inv.due_date,
      termLabel,
      customNote: opts?.note || null,
    });
    return buildWhatsAppShareHref(opts?.phone ?? resolvedPhone(inv), text);
  };

  const submitCommunication = async () => {
    if (!commModalInv) return;
    const inv = commModalInv;
    const targetEmail = commEmail.trim();
    if (!targetEmail) {
      toast.error('Enter a recipient email address (or click Open WhatsApp to message directly).');
      return;
    }
    setBusyId(inv.id);
    try {
      const endpoint =
        commMode === 'issue'
          ? '/api/payments/invoices/send-email'
          : `/api/invoices/${inv.id}/remind`;
      const payload =
        commMode === 'issue'
          ? {
              invoiceId: inv.id,
              recipientEmail: targetEmail,
              recipientPhone: commPhone.trim() || undefined,
              customNote: commNote.trim() || undefined,
              sendWhatsApp: commSendWhatsAppApi && Boolean(commPhone.trim()),
            }
          : {
              reminder_number: commStage,
              recipientEmail: targetEmail,
              recipientPhone: commPhone.trim() || undefined,
              customNote: commNote.trim() || undefined,
              sendWhatsApp: commSendWhatsAppApi && Boolean(commPhone.trim()),
            };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.success === false) {
        throw new Error(j.message || j.error || 'Communication failed');
      }
      setSentIds((prev) => new Set(prev).add(inv.id));
      const waShareUrl = typeof j.whatsappShareUrl === 'string' ? j.whatsappShareUrl : null;
      toast.success(
        commMode === 'issue'
          ? `Invoice emailed to ${targetEmail}${j.whatsappDelivered ? ' + WhatsApp sent' : ''}`
          : `Reminder #${j.reminder_number ?? commStage} sent to ${targetEmail}${j.whatsappDelivered ? ' + WhatsApp sent' : ''}`,
        waShareUrl && !j.whatsappDelivered
          ? {
              duration: 8000,
              action: {
                label: 'Open WhatsApp',
                onClick: () => window.open(waShareUrl, '_blank', 'noopener,noreferrer'),
              },
            }
          : undefined,
      );
      setCommModalInv(null);
      await load();
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
    && inv.status !== 'cancelled'
    && inv.status !== 'void'
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

    const emailForPreview = resolvedEmail(inv) || undefined;
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
      studentEmail: emailForPreview,
      schoolName: 'RILLCOD TECHNOLOGIES',
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
        if (statusFilter === 'partial') {
          return (
            inv.status === 'partially_paid' ||
            (Number(inv.amount_paid ?? 0) > 0 && invoiceOutstandingAmount(inv as any) > 0.01)
          );
        }
        if (statusFilter === 'overdue') {
          const diag = analyzeInvoiceIntelligence(inv);
          return diag.urgency === 'overdue';
        }
        if (statusFilter === 'overpaid') return invoiceOverpaidAmount(inv as any) > 0;
        // "open" = anything still collectible, overdue included.
        return ['sent', 'draft', 'overdue', 'partially_paid'].includes(inv.status);
      })
      .filter((inv) => {
        if (!q) return true;
        return (
          (inv.invoice_number || '').toLowerCase().includes(q) ||
          (inv.schools?.name || '').toLowerCase().includes(q) ||
          (inv.portal_users?.full_name || '').toLowerCase().includes(q) ||
          (inv.resolved_recipient?.name || '').toLowerCase().includes(q) ||
          (inv.resolved_recipient?.email || '').toLowerCase().includes(q)
        );
      });
  }, [invoices, search, statusFilter, streamFilter]);

  const ledgerMetrics = useMemo(() => {
    let totalBilled = 0;
    let totalPaid = 0;
    let totalOutstanding = 0;
    let totalOverpaid = 0;
    let overpaidCount = 0;
    let partialCount = 0;
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
      const rem = invoiceOutstandingAmount(inv as any);
      totalOutstanding += rem;
      if (inv.status === 'partially_paid' || (Number(inv.amount_paid || 0) > 0 && rem > 0.01)) {
        partialCount += 1;
      }
      const over = invoiceOverpaidAmount(inv as any);
      if (over > 0) {
        totalOverpaid += over;
        overpaidCount += 1;
      }
    }
    return { totalBilled, totalPaid, totalOutstanding, totalOverpaid, overpaidCount, partialCount };
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
                const headers = ['Invoice #', 'Stream', 'Status', 'Payer / School', 'Contact Email', 'Amount', 'Paid', 'Remaining', 'Currency', 'Issued', 'Due'];
                const rows = filtered.map((inv) => [
                  esc(inv.invoice_number),
                  esc(streamLabel(inv.stream)),
                  esc(inv.status),
                  esc(inv.schools?.name || inv.portal_users?.full_name || '—'),
                  esc(resolvedEmail(inv) || '—'),
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
              placeholder="Search invoice #, school, payer, email…"
              aria-label="Search invoices"
              className="w-full min-h-10 pl-9 pr-3 py-2 text-xs border border-border bg-background rounded-xl focus:outline-none focus:border-primary"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center overflow-x-auto border border-border rounded-xl p-0.5 bg-muted/30 text-xs max-w-full scrollbar-hide">
            {(['all', 'open', 'partial', 'overdue', 'paid', 'overpaid'] as const).map((s) => (
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
                  : s === 'partial' && ledgerMetrics.partialCount > 0
                  ? `Partial (${ledgerMetrics.partialCount})`
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
        <div className="space-y-2.5">
          {filtered.map((inv) => {
            const diag = analyzeInvoiceIntelligence(inv);
            const contactEmail = resolvedEmail(inv);
            const contactPhone = resolvedPhone(inv);
            const urgencyPillCls =
              diag.urgency === 'overdue'
                ? 'bg-rose-500/15 border-rose-500/40 text-rose-700 dark:text-rose-300'
                : diag.urgency === 'due_soon'
                ? 'bg-amber-500/15 border-amber-500/40 text-amber-700 dark:text-amber-300'
                : diag.urgency === 'partial'
                ? 'bg-sky-500/15 border-sky-500/40 text-sky-700 dark:text-sky-300'
                : '';

            return (
              <div
                key={inv.id}
                className="border border-border rounded-xl p-4 bg-card/50 hover:bg-card transition-colors"
              >
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-1.5">
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
                        {inv.status.replace(/_/g, ' ')}
                      </span>
                      {urgencyPillCls && (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${urgencyPillCls}`}>
                          {diag.urgencyLabel}
                        </span>
                      )}
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
                        <span className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-black text-emerald-700 dark:text-emerald-400">
                          {academicCoverageLabel(inv)}
                        </span>
                      )}
                      {Number(inv.proof_count || 0) > 0 && (
                        <span className="inline-flex items-center rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-black text-amber-700 dark:text-amber-300">
                          {inv.proof_count} proof{inv.proof_count === 1 ? '' : 's'} uploaded
                        </span>
                      )}
                      <span className="text-[11px] font-mono text-muted-foreground">
                        #{inv.invoice_number}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap text-sm">
                      <span className="font-black text-foreground">
                        {formatMoney(inv.amount, inv.currency)}
                      </span>
                      {diag.paid > 0 && (
                        <span className="text-xs font-bold text-emerald-700 dark:text-emerald-300">
                          Paid {formatMoney(diag.paid, inv.currency)}
                        </span>
                      )}
                      {diag.remaining > 0.01 && diag.paid > 0 && (
                        <span className="text-xs font-bold text-amber-700 dark:text-amber-400">
                          Remaining {formatMoney(diag.remaining, inv.currency)}
                        </span>
                      )}
                      {diag.overpaid > 0 && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest bg-emerald-500/15 border border-emerald-500/40 text-emerald-700 dark:text-emerald-300">
                          Overpaid · +{formatMoney(diag.overpaid, inv.currency)} Credit
                        </span>
                      )}
                      {inv.schools?.name && (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-foreground/85">
                          <BuildingOfficeIcon className="w-3.5 h-3.5 text-muted-foreground" /> {inv.schools.name}
                        </span>
                      )}
                      {inv.portal_users?.full_name && (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-foreground/85">
                          <UserIcon className="w-3.5 h-3.5 text-muted-foreground" /> {inv.portal_users.full_name}
                        </span>
                      )}
                    </div>

                    {/* Smart installment collection bar when partially paid */}
                    {diag.paid > 0 && diag.remaining > 0.01 && (
                      <div className="max-w-sm pt-0.5">
                        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full bg-emerald-600 transition-all"
                            style={{ width: `${Math.max(4, diag.percentPaid)}%` }}
                          />
                        </div>
                      </div>
                    )}

                    <div className="flex items-center gap-2 flex-wrap text-[11px] text-muted-foreground">
                      <span>
                        Issued {formatShortDate(inv.created_at)}
                        {inv.due_date && ` · Due ${formatShortDate(inv.due_date)}`}
                      </span>
                      {canCollect && (
                        <>
                          <span>·</span>
                          {contactEmail || contactPhone ? (
                            <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
                              {[contactEmail, contactPhone ? 'WhatsApp ready' : null].filter(Boolean).join(' · ')}
                            </span>
                          ) : (
                            <span className="text-amber-700 dark:text-amber-400 font-semibold">
                              No saved contact — click Communicate to add
                            </span>
                          )}
                        </>
                      )}
                      {diag.remindersSentCount > 0 && (
                        <>
                          <span>·</span>
                          <span className="font-semibold text-foreground/80">
                            Reminded ×{diag.remindersSentCount}
                            {diag.lastRemindedAt ? ` (${formatShortDate(diag.lastRemindedAt)})` : ''}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => openPreview(inv)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 border border-border text-[10px] font-black uppercase tracking-widest rounded-md hover:border-primary"
                      title="Quick preview"
                    >
                      <EyeIcon className="w-3 h-3" /> View
                    </button>

                    {canPayTermInvoice(inv) && (
                      <button
                        type="button"
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
                          type="button"
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
                        type="button"
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
                        type="button"
                        onClick={() => openCommModal(inv, 'remind')}
                        disabled={busyId === inv.id}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-800 dark:text-amber-300 text-[10px] font-black uppercase tracking-widest rounded-md"
                        title={`Send smart Stage #${diag.recommendedReminderStage} reminder via Email, In-App & WhatsApp`}
                      >
                        <BellAlertIcon className="w-3 h-3" />
                        Remind #{diag.recommendedReminderStage}
                      </button>
                    )}

                    {canCollect && inv.status !== 'cancelled' && inv.status !== 'void' && (
                      <button
                        type="button"
                        onClick={() =>
                          inv.status === 'paid'
                            ? window.open(buildClientWhatsAppHref(inv), '_blank', 'noopener,noreferrer')
                            : openCommModal(inv, 'issue')
                        }
                        disabled={busyId === inv.id}
                        className={`inline-flex items-center gap-1 px-2.5 py-1.5 border text-[10px] font-black uppercase tracking-widest rounded-md transition-colors ${
                          sentIds.has(inv.id)
                            ? 'border-emerald-500/30 text-emerald-700 dark:text-emerald-400 bg-emerald-500/5 hover:bg-emerald-500/10'
                            : 'border-border hover:border-primary/50 text-primary'
                        }`}
                        title={
                          inv.status === 'paid'
                            ? 'Share payment receipt on WhatsApp'
                            : 'Send invoice via Email + WhatsApp with online checkout & bank details'
                        }
                      >
                        <EnvelopeIcon className="w-3 h-3" />
                        {inv.status === 'paid' ? 'Share Receipt' : sentIds.has(inv.id) ? '✓ Sent' : 'Communicate'}
                      </button>
                    )}

                    <button
                      type="button"
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
                        type="button"
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
            );
          })}
        </div>
      )}

      {/* 1. Generator Choice Modal (Portaled above all navigation menus) */}
      {showGeneratorChoice && (
        <FinanceModalPortal onEscape={() => setShowGeneratorChoice(false)}>
          <div
            className="fixed inset-0 z-[300] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
            onClick={() => setShowGeneratorChoice(false)}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Choose invoice type"
              className="w-full sm:max-w-2xl rounded-t-3xl sm:rounded-3xl border border-border bg-card p-5 sm:p-7 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-4 mb-5">
                <div>
                  <p className="text-lg font-black text-foreground">Create premium invoice</p>
                  <p className="text-sm text-muted-foreground">Choose the payer. Both options use the same invoice, payment and receipt lifecycle.</p>
                </div>
                <button type="button" onClick={() => setShowGeneratorChoice(false)} className="p-2 rounded-xl hover:bg-muted" aria-label="Close">
                  <XMarkIcon className="w-5 h-5" />
                </button>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => { setShowGeneratorChoice(false); setShowForm(true); }}
                  className="text-left rounded-2xl border border-border p-5 hover:border-primary hover:bg-primary/5 transition-colors"
                >
                  <UserIcon className="w-7 h-7 text-primary mb-3" />
                  <p className="font-black text-foreground">Individual invoice</p>
                  <p className="text-xs text-muted-foreground mt-1">One student, parent or individual payer with flexible line items.</p>
                </button>
                <button
                  type="button"
                  onClick={() => { setShowGeneratorChoice(false); setEditingSchoolInvoiceId(null); setShowSchoolGenerator(true); }}
                  className="text-left rounded-2xl border border-border p-5 hover:border-primary hover:bg-primary/5 transition-colors"
                >
                  <BuildingOfficeIcon className="w-7 h-7 text-primary mb-3" />
                  <p className="font-black text-foreground">School / partner invoice</p>
                  <p className="text-xs text-muted-foreground mt-1">Premium term, cohort, package, commission and deposit calculations.</p>
                </button>
              </div>
            </div>
          </div>
        </FinanceModalPortal>
      )}

      {/* 2. Full-screen School Invoice Generator (Portaled above all navigation menus) */}
      {showSchoolGenerator && (
        <FinanceModalPortal
          onEscape={() => {
            setShowSchoolGenerator(false);
            setEditingSchoolInvoiceId(null);
            setSchoolInvoicePrefill(null);
          }}
        >
          <div className="fixed inset-0 z-[300] bg-background overflow-y-auto">
            <div className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur px-4 sm:px-6 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] flex items-center justify-between">
              <div>
                <p className="font-black text-foreground">Premium school invoice</p>
                <p className="text-xs text-muted-foreground">Unified invoice generator</p>
              </div>
              <button
                type="button"
                onClick={() => { setShowSchoolGenerator(false); setEditingSchoolInvoiceId(null); setSchoolInvoicePrefill(null); }}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border hover:bg-muted text-xs font-black uppercase tracking-widest"
                aria-label="Close school invoice builder"
              >
                <XMarkIcon className="w-4 h-4" /> Close
              </button>
            </div>
            <div className="max-w-6xl mx-auto p-4 sm:p-6 pb-20">
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
        </FinanceModalPortal>
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

      {/* 3. Record Payment / Overpayment Modal (Portaled + Scrollable Body + Pinned Reachable CTA Footer) */}
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
        const isSavingThis = busyId === inv.id;

        return (
          <FinanceModalPortal onEscape={() => !isSavingThis && setRecordingPaymentInv(null)}>
            <div
              className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm"
              onClick={() => !isSavingThis && setRecordingPaymentInv(null)}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-label={`Record payment for invoice ${inv.invoice_number}`}
                className="bg-background border border-border rounded-t-3xl sm:rounded-2xl w-full sm:max-w-lg max-h-[92dvh] sm:max-h-[88dvh] flex flex-col shadow-2xl overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-border bg-card">
                  <div className="min-w-0">
                    <p className="font-black text-foreground text-sm">Record Payment / Overpayment</p>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      Invoice #{inv.invoice_number} · {payerLabel}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setRecordingPaymentInv(null)}
                    disabled={isSavingThis}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    aria-label="Close"
                  >
                    <XMarkIcon className="w-5 h-5" />
                  </button>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-5 space-y-4">
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
                    <div className="flex items-center justify-between gap-2 flex-wrap mb-1.5">
                      <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                        Amount Received ({inv.currency || 'NGN'})
                      </label>
                      {remaining > 0 && (
                        <div className="flex items-center gap-1 flex-wrap">
                          {[
                            { label: 'Full', val: remaining },
                            { label: '75%', val: Math.round(remaining * 0.75) },
                            { label: '50%', val: Math.round(remaining * 0.5) },
                            { label: '25%', val: Math.round(remaining * 0.25) },
                          ].map((preset) => (
                            <button
                              key={preset.label}
                              type="button"
                              onClick={() => setRecordAmount(String(preset.val))}
                              className="px-2 py-0.5 rounded border border-border text-[10px] font-bold hover:border-primary text-foreground bg-card"
                            >
                              {preset.label}
                            </button>
                          ))}
                        </div>
                      )}
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

                  <label className="flex items-start gap-2.5 rounded-xl border border-border bg-card/70 px-3 py-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={recordNotifyPayer}
                      onChange={(e) => setRecordNotifyPayer(e.target.checked)}
                      className="mt-0.5"
                    />
                    <span className="text-xs text-foreground leading-snug">
                      <span className="font-bold">Email official receipt / balance update automatically</span>
                      <span className="block text-[11px] text-muted-foreground">
                        {resolvedEmail(inv)
                          ? `Will notify ${resolvedEmail(inv)} + prepare 1-click WhatsApp receipt`
                          : 'Generates PDF receipt + 1-click WhatsApp share link'}
                      </span>
                    </span>
                  </label>
                </div>

                {/* Sticky Pinned Footer — always reachable above mobile/desktop menus */}
                <div className="shrink-0 border-t border-border bg-card px-5 py-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))] flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setRecordingPaymentInv(null)}
                    disabled={isSavingThis}
                    className="px-4 py-2.5 bg-muted hover:bg-muted/80 text-xs font-black uppercase tracking-widest text-foreground rounded-xl transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void submitRecordedPayment()}
                    disabled={isSavingThis || entered <= 0}
                    className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white text-xs font-black uppercase tracking-widest rounded-xl shadow-sm transition-colors"
                  >
                    {isSavingThis ? (
                      <ArrowPathIcon className="w-4 h-4 animate-spin" />
                    ) : (
                      <CheckBadgeIcon className="w-4 h-4" />
                    )}
                    {isSavingThis
                      ? 'Recording…'
                      : nextOverpaid > 0
                      ? `Record +${formatMoney(nextOverpaid, inv.currency)} Credit`
                      : nextRemaining > 0
                      ? 'Record Partial Payment'
                      : 'Confirm & Mark Paid'}
                  </button>
                </div>
              </div>
            </div>
          </FinanceModalPortal>
        );
      })()}

      {/* 4. Smart Multi-Channel Invoice & Reminder Communication Modal */}
      {commModalInv && (() => {
        const inv = commModalInv;
        const diag = analyzeInvoiceIntelligence(inv);
        const payerLabel =
          inv.schools?.name || inv.resolved_recipient?.name || inv.portal_users?.full_name || 'Client';
        const isSending = busyId === inv.id;
        const waHref = buildClientWhatsAppHref(inv, {
          mode: commMode,
          stage: commStage,
          phone: commPhone,
          note: commNote,
        });

        return (
          <FinanceModalPortal onEscape={() => !isSending && setCommModalInv(null)}>
            <div
              className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm"
              onClick={() => !isSending && setCommModalInv(null)}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-label={`Communicate invoice ${inv.invoice_number}`}
                className="bg-background border border-border rounded-t-3xl sm:rounded-2xl w-full sm:max-w-xl max-h-[92dvh] sm:max-h-[88dvh] flex flex-col shadow-2xl overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-border bg-card">
                  <div className="min-w-0">
                    <p className="font-black text-foreground text-sm">Smart Invoice &amp; Reminder Dispatch</p>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      Invoice #{inv.invoice_number} · {payerLabel} · Due: {formatMoney(diag.remaining, inv.currency)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCommModalInv(null)}
                    disabled={isSending}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
                    aria-label="Close"
                  >
                    <XMarkIcon className="w-5 h-5" />
                  </button>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-5 space-y-4">
                  {/* Message Type / Escalation Stage */}
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1.5">
                      Communication Stage
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setCommMode('issue')}
                        className={`text-left rounded-xl border p-2.5 transition-colors ${
                          commMode === 'issue'
                            ? 'border-primary bg-primary/10 text-foreground'
                            : 'border-border bg-card text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        <p className="text-xs font-black">Official Invoice</p>
                        <p className="text-[10px] opacity-80 mt-0.5">Paystack checkout + bank details</p>
                      </button>
                      {([
                        { s: 1 as const, title: 'Stage #1 · Gentle Notice', sub: 'Friendly summary & due date' },
                        { s: 2 as const, title: 'Stage #2 · Due Soon / Balance', sub: 'Remaining balance follow-up' },
                        { s: 3 as const, title: 'Stage #3 · Urgent Overdue', sub: 'Final escalation notice' },
                      ]).map((opt) => {
                        const selected = commMode === 'remind' && commStage === opt.s;
                        const isRecommended = diag.recommendedReminderStage === opt.s;
                        return (
                          <button
                            key={opt.s}
                            type="button"
                            onClick={() => {
                              setCommMode('remind');
                              setCommStage(opt.s);
                            }}
                            className={`text-left rounded-xl border p-2.5 transition-colors ${
                              selected
                                ? opt.s === 3
                                  ? 'border-rose-500 bg-rose-500/10 text-foreground'
                                  : 'border-amber-500 bg-amber-500/10 text-foreground'
                                : 'border-border bg-card text-muted-foreground hover:text-foreground'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-1">
                              <p className="text-xs font-black truncate">{opt.title}</p>
                              {isRecommended && (
                                <span className="shrink-0 px-1.5 py-0.5 rounded bg-primary/15 text-primary text-[9px] font-black uppercase">
                                  Smart pick
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] opacity-80 mt-0.5">{opt.sub}</p>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Recipient Contact Resolution */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                          Recipient Email
                        </label>
                        {inv.resolved_recipient?.source && inv.resolved_recipient.source !== 'none' && (
                          <span className="text-[9px] font-bold text-emerald-700 dark:text-emerald-400 uppercase">
                            Auto: {inv.resolved_recipient.source.replace('_', ' ')}
                          </span>
                        )}
                      </div>
                      <input
                        type="email"
                        value={commEmail}
                        onChange={(e) => setCommEmail(e.target.value)}
                        placeholder="bursar@school.edu.ng or parent@email.com"
                        className="w-full px-3 py-2 text-xs border border-border bg-card rounded-lg focus:outline-none focus:border-primary"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1.5">
                        WhatsApp Number
                      </label>
                      <input
                        type="tel"
                        value={commPhone}
                        onChange={(e) => setCommPhone(e.target.value)}
                        placeholder="+2348012345678"
                        className="w-full px-3 py-2 text-xs border border-border bg-card rounded-lg focus:outline-none focus:border-primary"
                      />
                    </div>
                  </div>

                  {inv.stream === 'school' && (
                    <p className="text-[11px] text-muted-foreground -mt-2">
                      Any email or WhatsApp number entered here is automatically saved to this school&apos;s billing profile for future 1-click reminders.
                    </p>
                  )}

                  {/* Custom Note */}
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1.5">
                      Personal Finance Note (optional)
                    </label>
                    <textarea
                      value={commNote}
                      onChange={(e) => setCommNote(e.target.value)}
                      rows={2}
                      placeholder="e.g. Kindly include invoice number as bank transfer narration. Thank you!"
                      className="w-full px-3 py-2 text-xs border border-border bg-card rounded-lg focus:outline-none focus:border-primary resize-none"
                    />
                  </div>

                  {commPhone.trim() && (
                    <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
                      <input
                        type="checkbox"
                        checked={commSendWhatsAppApi}
                        onChange={(e) => setCommSendWhatsAppApi(e.target.checked)}
                      />
                      <span className="font-semibold">
                        Also dispatch via WhatsApp Cloud API when sending email
                      </span>
                    </label>
                  )}
                </div>

                {/* Sticky Pinned Footer */}
                <div className="shrink-0 border-t border-border bg-card px-5 py-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))] flex flex-wrap items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setCommModalInv(null)}
                    disabled={isSending}
                    className="px-3.5 py-2 bg-muted hover:bg-muted/80 text-xs font-black uppercase tracking-widest text-foreground rounded-xl"
                  >
                    Cancel
                  </button>
                  <a
                    href={waHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-black uppercase tracking-widest rounded-xl shadow-sm"
                  >
                    Open WhatsApp
                  </a>
                  <button
                    type="button"
                    onClick={() => void submitCommunication()}
                    disabled={isSending || !commEmail.trim()}
                    className="inline-flex items-center gap-1.5 px-5 py-2 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground text-xs font-black uppercase tracking-widest rounded-xl shadow-sm"
                  >
                    {isSending ? (
                      <ArrowPathIcon className="w-4 h-4 animate-spin" />
                    ) : (
                      <EnvelopeIcon className="w-4 h-4" />
                    )}
                    {isSending
                      ? 'Sending…'
                      : commMode === 'issue'
                      ? 'Send Invoice Email'
                      : `Send Stage #${commStage} Email`}
                  </button>
                </div>
              </div>
            </div>
          </FinanceModalPortal>
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
    const activePool = currentSessionOnly
      ? students.filter((s) => isStudentInCurrentSession(s, sessionBoundary))
      : students;
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
    <FinanceModalPortal onEscape={() => !saving && onClose()}>
      <div
        className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm"
        onClick={() => !saving && onClose()}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Quick individual invoice"
          className="bg-background border border-border rounded-t-3xl sm:rounded-2xl w-full sm:max-w-2xl max-h-[92dvh] sm:max-h-[88dvh] flex flex-col shadow-2xl overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-border bg-card">
            <div>
              <p className="font-black text-foreground text-sm">Quick invoice</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Single-payer invoice. Use the school invoice builder for term billing.
              </p>
            </div>
            <button type="button" onClick={onClose} disabled={saving} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted" aria-label="Close">
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-5 space-y-4">
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

        <div className="shrink-0 bg-card px-5 pt-3.5 pb-[max(1rem,env(safe-area-inset-bottom))] border-t border-border space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                Total
              </p>
              <p className="text-xl font-black text-foreground">{formatMoney(total, currency)}</p>
            </div>
            <div className="flex gap-2 flex-wrap justify-end">
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="px-4 py-2 bg-muted hover:bg-muted/80 text-xs font-black uppercase tracking-widest text-foreground rounded-xl"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={openPreview}
                disabled={saving || total === 0 || !paymentAccountId}
                className="inline-flex items-center gap-1 px-4 py-2 border border-border hover:border-primary text-xs font-black uppercase tracking-widest rounded-xl disabled:opacity-40"
                title="Live preview before issuing"
              >
                <EyeIcon className="w-4 h-4" /> Preview
              </button>
              <button
                type="button"
                onClick={() => void save()}
                disabled={saving || !paymentAccountId}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground text-xs font-black uppercase tracking-widest rounded-xl disabled:opacity-50 shadow-sm"
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
          <p className="text-[11px] text-muted-foreground">
            Review with Preview, then create from the preview — or create here when you are ready.
          </p>
        </div>
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
    </FinanceModalPortal>
  );
}

export default InvoicesPanel;
