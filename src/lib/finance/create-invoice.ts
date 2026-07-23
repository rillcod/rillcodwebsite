import { createAdminClient } from '@/lib/supabase/admin';
import { classifyInvoiceStream } from '@/lib/finance/streams';
import { calculateInvoiceItemsTotal, normalizeInvoiceItems, validateInvoiceInput } from '@/lib/finance/invoice-input';
import { assertDbOk, financeFail, financeOk, type FinanceWriteResult } from '@/lib/finance/write-result';
import { extractSchoolTermFromMetadata, schoolTermLabel } from '@/lib/finance/school-term';
import { toJson } from '@/lib/supabase/json';
import type { Json } from '@/types/supabase';

export type CreateInvoiceInput = {
  school_id?: string | null;
  portal_user_id?: string | null;
  billing_cycle_id?: string | null;
  subscription_id?: string | null;
  actor_id?: string | null;
  amount: number;
  currency?: string;
  due_date?: string | null;
  items?: unknown[];
  notes?: string | null;
  description?: string | null;
  status?: string;
  stream?: 'school' | 'individual';
  invoice_number?: string;
  metadata?: Record<string, Json | undefined> | Json;
};

function buildInvoiceNumber(prefix = 'INV'): string {
  return `${prefix}-${new Date().getFullYear()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

/**
 * Single entry point for invoice creation across APIs and billing-cycle flows.
 */
export async function createInvoice(
  input: CreateInvoiceInput,
  opts?: { linkBillingCycle?: boolean },
): Promise<FinanceWriteResult<Record<string, unknown>>> {
  const validated = validateInvoiceInput({
    amount: input.amount,
    currency: input.currency ?? 'NGN',
    status: input.status ?? 'draft',
    due_date: input.due_date,
    items: input.items,
  });
  if (!validated.ok) return financeFail('validation', validated.error);

  if (!input.school_id && !input.portal_user_id) {
    return financeFail('validation', 'school_id or portal_user_id required');
  }

  const db = createAdminClient();
  const linkBillingCycle = opts?.linkBillingCycle !== false;

  if (input.billing_cycle_id) {
    const { data: cycle, error: cycleErr } = await db
      .from('billing_cycles')
      .select('id, school_id, owner_school_id, owner_user_id, invoice_id')
      .eq('id', input.billing_cycle_id)
      .maybeSingle();
    if (cycleErr) return financeFail('db_error', 'Failed to look up billing cycle: ' + cycleErr.message);
    if (!cycle) return financeFail('not_found', 'Billing cycle not found');
    const cycleSchoolId = cycle.owner_school_id ?? cycle.school_id ?? null;
    if (input.school_id && cycleSchoolId && input.school_id !== cycleSchoolId) return financeFail('validation', 'Invoice school does not match billing cycle owner');
    if (input.portal_user_id && cycle.owner_user_id && input.portal_user_id !== cycle.owner_user_id) return financeFail('validation', 'Invoice payer does not match billing cycle owner');
    if (cycle.invoice_id) {
      return financeFail('conflict', 'Billing cycle already has an invoice', { invoice_id: cycle.invoice_id });
    }
  }

  const amount = Number(validated.amount);
  const currency = String(validated.currency || input.currency || 'NGN').toUpperCase();
  const status = String(input.status ?? 'draft');
  const invoiceItems =
    Array.isArray(input.items) && input.items.length > 0
      ? input.items
      : [
          {
            description: input.description ?? (input.subscription_id ? 'Subscription Fee' : 'Invoice'),
            quantity: 1,
            unit_price: amount,
            total: amount,
          },
        ];

  const normalizedItems = normalizeInvoiceItems(invoiceItems);
  if (!normalizedItems.ok) return financeFail('validation', normalizedItems.error);

  const itemCheck = calculateInvoiceItemsTotal(normalizedItems.items);
  if (!itemCheck.ok) return financeFail('validation', itemCheck.error);
  if (Math.abs(itemCheck.total - amount) > 0.01) {
    return financeFail('validation', `Invoice amount (${amount}) must equal line-item total (${itemCheck.total})`);
  }

  let metadataObject =
    input.metadata && typeof input.metadata === 'object' && !Array.isArray(input.metadata)
      ? (input.metadata as Record<string, any>)
      : {};

  const stream =
    input.stream ??
    classifyInvoiceStream({
      school_id: input.school_id ?? null,
      portal_user_id: input.portal_user_id ?? null,
      billing_cycle_id: input.billing_cycle_id ?? null,
      metadata: metadataObject,
    });

  // Partner-school invoices are term-aware: one active invoice per school + year + term.
  if (stream === 'school' && input.school_id) {
    const term = extractSchoolTermFromMetadata(metadataObject);
    if (!term) {
      return financeFail(
        'validation',
        'School invoices require metadata.academic_year and metadata.term_number (1–3)',
      );
    }
    let termQuery = db
      .from('academic_terms')
      .select('id,academic_year,term_label,term_number,start_date,end_date');
    if (metadataObject.academic_term_id) {
      termQuery = termQuery.eq('id', String(metadataObject.academic_term_id));
    } else {
      termQuery = termQuery
        .eq('academic_year', term.periodLabel)
        .eq('term_number', Number(term.termNumber));
    }
    const { data: academicTerm, error: academicTermError } = await termQuery
      .order('start_date', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (academicTermError) {
      return financeFail('db_error', 'Failed to resolve the academic term: ' + academicTermError.message);
    }
    if (
      !academicTerm ||
      String(academicTerm.academic_year) !== term.periodLabel ||
      Number(academicTerm.term_number) !== Number(term.termNumber)
    ) {
      return financeFail('validation', 'Select a valid regulated academic year and term.');
    }
    metadataObject = {
      ...metadataObject,
      academic_term_id: academicTerm.id,
      academic_year: Number(term.academicYear),
      period_label: term.periodLabel,
      term_number: Number(term.termNumber),
      term_label: schoolTermLabel(term.periodLabel, term.termNumber),
      term_label_short: term.termLabel,
    };

    const { invoiceMatchesAcademicPeriod, isSchoolStreamInvoice } = await import('@/lib/school-reports/invoice-match');
    const { data: candidates, error: dupErr } = await db
      .from('invoices')
      .select('id, invoice_number, status, amount, currency, metadata, stream, school_id, portal_user_id, billing_cycle_id, billing_cycles!invoices_billing_cycle_id_fkey(term_label,term_start_date)')
      .eq('school_id', input.school_id)
      .not('status', 'in', '(cancelled,void)')
      .order('created_at', { ascending: false })
      .limit(100);
    if (dupErr) return financeFail('db_error', dupErr.message);
    const existing = (candidates ?? [])
      .filter(isSchoolStreamInvoice)
      .find((row) =>
        invoiceMatchesAcademicPeriod(row, {
          academicYear: term.periodLabel,
          termLabel: term.termLabel,
          academicTermNumber: Number(term.termNumber),
          academicTermId: academicTerm.id,
        }),
      );
    if (existing) {
      return financeFail(
        'conflict',
        `An active school invoice already exists for ${schoolTermLabel(term.academicYear, term.termNumber)} (${existing.invoice_number}). Edit that invoice instead of creating a duplicate.`,
        {
          invoice_id: existing.id,
          invoice_number: existing.invoice_number,
          edit_href: `/dashboard/school-billing?invoiceId=${existing.id}`,
        },
      );
    }
  }

  const invoice_number = input.invoice_number || buildInvoiceNumber();

  const isAutomaticSchoolTermCycle =
    stream === 'school' && !!input.school_id && !!metadataObject.academic_term_id && !input.billing_cycle_id;
  const rpcName = isAutomaticSchoolTermCycle
    ? 'create_school_term_invoice_atomic'
    : 'create_invoice_atomic';
  const rpcArgs = isAutomaticSchoolTermCycle
    ? {
        p_invoice_number: invoice_number,
        p_school_id: input.school_id,
        p_academic_term_id: String(metadataObject.academic_term_id),
        p_amount: amount,
        p_currency: currency,
        p_status: status,
        p_due_date: validated.dueDate ?? input.due_date ?? null,
        p_items: toJson(normalizedItems.items),
        p_notes: input.notes ?? null,
        p_metadata: toJson(metadataObject),
        p_actor_id: input.actor_id ?? null,
      }
    : {
        p_invoice_number: invoice_number, p_school_id: input.school_id ?? null, p_portal_user_id: input.portal_user_id ?? null,
        p_amount: amount, p_currency: currency, p_status: status, p_due_date: validated.dueDate ?? input.due_date ?? null,
        p_items: toJson(normalizedItems.items), p_notes: input.notes ?? null, p_stream: stream,
        p_billing_cycle_id: linkBillingCycle ? input.billing_cycle_id ?? null : null, p_metadata: toJson(metadataObject),
      };
  const { data: created, error: invErr } = await (db as any).rpc(rpcName, rpcArgs);
  if (invErr) return financeFail('db_error', invErr.message);
  const invoiceId = created?.invoice_id;
  if (!invoiceId) return financeFail('db_error', 'Invoice RPC returned no invoice_id');
  const { data: invoice, error: reloadError } = await db.from('invoices').select('*').eq('id', invoiceId).single();
  if (reloadError || !invoice) return financeFail('db_error', reloadError?.message || 'Invoice could not be reloaded');
  const effects: string[] = [
    'invoice_created',
    ...(isAutomaticSchoolTermCycle ? ['billing_cycle_created_or_reused', 'billing_cycle_linked', 'billing_automation_started'] : []),
    ...(!isAutomaticSchoolTermCycle && linkBillingCycle && input.billing_cycle_id ? ['billing_cycle_linked'] : []),
  ];

  return financeOk(invoice as Record<string, unknown>, effects);
}

/**
 * Create billing cycle + linked invoice in one DB transaction via RPC.
 */
export async function createBillingCycleWithInvoice(input: {
  owner_type: 'school' | 'individual';
  owner_school_id?: string | null;
  owner_user_id?: string | null;
  term_label: string;
  term_start_date: string;
  due_date: string;
  amount_due: number;
  currency?: string;
  status?: 'due' | 'past_due';
  items?: unknown;
  subscription_id?: string | null;
  actor_id?: string | null;
}): Promise<FinanceWriteResult<{ cycle: Record<string, unknown>; invoice: Record<string, unknown> }>> {
  const db = createAdminClient();
  const { data, error } = await (db as any).rpc('create_billing_cycle_with_invoice', {
    p_owner_type: input.owner_type,
    p_owner_school_id: input.owner_school_id ?? null,
    p_owner_user_id: input.owner_user_id ?? null,
    p_term_label: input.term_label,
    p_term_start_date: input.term_start_date,
    p_due_date: input.due_date,
    p_amount_due: input.amount_due,
    p_currency: (input.currency || 'NGN').toUpperCase(),
    p_status: input.status || 'due',
    p_items: input.items ?? [],
    p_subscription_id: input.subscription_id ?? null,
    p_actor_id: input.actor_id ?? null,
  });

  if (error) return financeFail('db_error', error.message);

  const cycleId = data?.cycle_id as string | undefined;
  const invoiceId = data?.invoice_id as string | undefined;
  if (!cycleId || !invoiceId) {
    return financeFail('db_error', 'RPC did not return cycle_id/invoice_id', data);
  }

  const [{ data: cycle, error: cErr }, { data: invoice, error: iErr }] = await Promise.all([
    db.from('billing_cycles').select('*').eq('id', cycleId).single(),
    db.from('invoices').select('*').eq('id', invoiceId).single(),
  ]);
  assertDbOk(cErr, 'reload billing cycle');
  assertDbOk(iErr, 'reload invoice');

  return financeOk(
    { cycle: cycle as Record<string, unknown>, invoice: invoice as Record<string, unknown> },
    ['billing_cycle_created', 'invoice_created', 'billing_cycle_linked'],
  );
}
