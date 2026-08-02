import { redactInvoiceForRole, isSchoolStreamInvoice } from '@/lib/finance/redact-invoice';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { calculateInvoiceItemsTotal, normalizeInvoiceItems, type NormalizedInvoiceLineItem } from '@/lib/finance/invoice-input';
import { canTransitionInvoice, normalizeInvoiceStatus } from '@/lib/finance/invoice-state';
import {
  resolveBillingCycleIdForInvoice,
  syncInvoiceFieldsThroughBillingCycle,
} from '@/lib/finance/billing-cycle-invoice-sync';
import { logAudit } from '@/lib/audit/log';
import { roleHasCapability } from '@/lib/auth/capabilities';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function requireStaff() {
  const supabase = await createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  const { data: profile } = await supabase
    .from('portal_users')
    .select('id, role, school_id')
    .eq('id', user.id)
    .single();
  if (!profile || !['admin', 'school', 'teacher'].includes(profile.role)) return null;
  return profile;
}

async function getLinkedCycleSchoolId(admin: ReturnType<typeof adminClient>, invoice: any) {
  const cycleSelect = 'id, owner_school_id, school_id';
  if (invoice.billing_cycle_id) {
    const { data } = await admin
      .from('billing_cycles')
      .select(cycleSelect)
      .eq('id', invoice.billing_cycle_id)
      .maybeSingle();
    if (data?.owner_school_id || data?.school_id) return data.owner_school_id || data.school_id;
  }

  const { data } = await admin
    .from('billing_cycles')
    .select(cycleSelect)
    .eq('invoice_id', invoice.id)
    .maybeSingle();
  return data?.owner_school_id || data?.school_id || null;
}

// GET /api/invoices/[id] — fetch single invoice with related data
export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const caller = await requireStaff();
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await context.params;
  const admin = adminClient();

  const { data, error } = await admin
    .from('invoices')
    .select('*, portal_users!invoices_portal_user_id_fkey(id, full_name, email, school_id), schools(id, name)')
    .eq('id', id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // School/teacher users can only see their own school's invoices or linked school cycles.
  if (caller.role === 'school' || caller.role === 'teacher') {
    const cycleSchoolId = await getLinkedCycleSchoolId(admin, data);
    if (!caller.school_id || (data.school_id !== caller.school_id && cycleSchoolId !== caller.school_id)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  // A family invoice can carry a school_id, so school scoping alone let a partner
  // school read what a parent was charged. Figures are stripped for anyone without
  // view_student_finance; the paid/unpaid indicator survives.
  return NextResponse.json({ data: redactInvoiceForRole(data, caller.role) });
}

// PATCH /api/invoices/[id] — update invoice
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const caller = await requireStaff();
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  // Editing invoices is a finance action — teachers can view but not mutate.
  if (!roleHasCapability(caller.role, 'manage_finance')) {
    return NextResponse.json({ error: 'Finance administrator access required' }, { status: 403 });
  }
  // A school may manage its OWN bill from Rillcod, never a family's invoice.
  if (caller.role === 'school') {
    const { data: target } = await adminClient()
      .from('invoices').select('stream, school_id, portal_user_id').eq('id', (await context.params).id).maybeSingle();
    if (target && !isSchoolStreamInvoice(target)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  const { id } = await context.params;
  const body = await req.json();
  const { due_date, notes, status, items, amount, portal_user_id, metadata } = body;

  let normalizedItems: NormalizedInvoiceLineItem[] | undefined;
  if (items !== undefined) {
    if (!Array.isArray(items)) return NextResponse.json({ error: 'items must be an array' }, { status: 400 });
    const normalized = normalizeInvoiceItems(items);
    if (!normalized.ok) return NextResponse.json({ error: normalized.error }, { status: 400 });
    normalizedItems = normalized.items;
  }

  const admin = adminClient();

  // Verify invoice exists and caller has access.
  const { data: existing, error: existingError } = await admin.from('invoices')
    .select('id, school_id, billing_cycle_id, status, items, amount, original_amount, amount_paid, amount_remaining, portal_user_id')
    .eq('id', id)
    .single();
  if (existingError && existingError.code !== 'PGRST116') return NextResponse.json({ error: existingError.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (caller.role === 'school') {
    const cycleSchoolId = await getLinkedCycleSchoolId(admin, existing);
    if (!caller.school_id || (existing.school_id !== caller.school_id && cycleSchoolId !== caller.school_id)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }
  if (existing.status === 'paid') return NextResponse.json({ error: 'Cannot edit a paid invoice' }, { status: 400 });

  const cycleLinkedUpdate = [due_date, status, items, amount, metadata, notes].some((value) => value !== undefined);
  const cycleId = cycleLinkedUpdate
    ? await resolveBillingCycleIdForInvoice(admin, existing)
    : null;

  if (cycleId && cycleLinkedUpdate) {
    const requestedStatus = status === undefined ? undefined : normalizeInvoiceStatus(status);
    if (requestedStatus === 'paid' || requestedStatus === 'partially_paid') {
      return NextResponse.json(
        { error: 'Use /api/invoices/mark-paid so payment, receipt, audit, and acknowledgement stay in sync.' },
        { status: 400 },
      );
    }
    if (requestedStatus !== undefined && !canTransitionInvoice(existing.status, requestedStatus)) {
      return NextResponse.json({ error: `Invoice cannot move from ${existing.status} to ${requestedStatus}` }, { status: 400 });
    }

    const termLabel =
      metadata && typeof metadata === 'object' && typeof metadata.term_label === 'string'
        ? metadata.term_label
        : undefined;

    const sync = await syncInvoiceFieldsThroughBillingCycle(admin, cycleId, {
      term_label: termLabel,
      due_date: due_date !== undefined ? (due_date || null) : undefined,
      amount: amount !== undefined ? Number(amount) : undefined,
      currency: typeof body.currency === 'string' ? body.currency : undefined,
      items: normalizedItems,
      metadata: metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : undefined,
      notes: notes !== undefined ? (notes || null) : undefined,
      invoice_status: requestedStatus ?? existing.status,
    });
    if (!sync.ok) return NextResponse.json({ error: sync.error }, { status: sync.status ?? 500 });

    if (portal_user_id !== undefined) {
      const nextPayerId = portal_user_id || null;
      if (nextPayerId) {
        const { data: payer, error: payerError } = await admin.from('portal_users').select('id, school_id').eq('id', nextPayerId).maybeSingle();
        if (payerError) return NextResponse.json({ error: payerError.message }, { status: 500 });
        if (!payer) return NextResponse.json({ error: 'Payer not found' }, { status: 404 });
        if (caller.role === 'school' && payer.school_id !== caller.school_id) return NextResponse.json({ error: 'Payer belongs to another school' }, { status: 403 });
        if (existing.school_id && payer.school_id && payer.school_id !== existing.school_id) {
          return NextResponse.json({ error: 'Payer and invoice must belong to the same school' }, { status: 400 });
        }
      }
      const { error: payerUpdateError } = await admin
        .from('invoices')
        .update({ portal_user_id: nextPayerId, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (payerUpdateError) return NextResponse.json({ error: payerUpdateError.message }, { status: 500 });
    }

    const { data, error } = await admin
      .from('invoices')
      .select('*, portal_users!invoices_portal_user_id_fkey(id, full_name, email), schools(id, name)')
      .eq('id', id)
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await logAudit(admin as any, {
      action: 'invoice_updated',
      actorId: caller.id,
      resourceType: 'invoice',
      resourceId: id,
      tableName: 'invoices',
      oldValue: existing.status,
      newValue: data?.status ?? requestedStatus ?? existing.status,
      newValues: {
        invoice_number: data?.invoice_number ?? null,
        amount: data?.amount ?? null,
        status: data?.status ?? null,
        via: 'billing_cycle_sync',
        changed: {
          due_date: due_date !== undefined,
          notes: notes !== undefined,
          status: status !== undefined,
          items: items !== undefined,
          amount: amount !== undefined,
          portal_user_id: portal_user_id !== undefined,
          metadata: metadata !== undefined,
        },
      },
    });
    return NextResponse.json({ data });
  }

  const requestedStatus = status === undefined ? undefined : normalizeInvoiceStatus(status);
  if (requestedStatus === 'paid' || requestedStatus === 'partially_paid') {
    return NextResponse.json(
      { error: 'Use /api/invoices/mark-paid so payment, receipt, audit, and acknowledgement stay in sync.' },
      { status: 400 },
    );
  }
  if (requestedStatus !== undefined && !canTransitionInvoice(existing.status, requestedStatus)) {
    return NextResponse.json({ error: `Invoice cannot move from ${existing.status} to ${requestedStatus}` }, { status: 400 });
  }

  const update: Record<string, any> = { updated_at: new Date().toISOString() };
  if (due_date !== undefined) {
    if (due_date && Number.isNaN(new Date(String(due_date)).getTime())) return NextResponse.json({ error: 'due_date must be a valid date' }, { status: 400 });
    update.due_date = due_date || null;
  }
  if (notes !== undefined) update.notes = notes || null;
  if (requestedStatus !== undefined) update.status = requestedStatus;
  if (normalizedItems !== undefined) update.items = normalizedItems;
  if (amount !== undefined) {
    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) return NextResponse.json({ error: 'amount must be a positive number' }, { status: 400 });
    update.amount = parsedAmount;
  }
  if (portal_user_id !== undefined) {
    const nextPayerId = portal_user_id || null;
    if (nextPayerId) {
      const { data: payer, error: payerError } = await admin.from('portal_users').select('id, school_id').eq('id', nextPayerId).maybeSingle();
      if (payerError) return NextResponse.json({ error: payerError.message }, { status: 500 });
      if (!payer) return NextResponse.json({ error: 'Payer not found' }, { status: 404 });
      if (caller.role === 'school' && payer.school_id !== caller.school_id) return NextResponse.json({ error: 'Payer belongs to another school' }, { status: 403 });
      if (existing.school_id && payer.school_id && payer.school_id !== existing.school_id) return NextResponse.json({ error: 'Payer and invoice must belong to the same school' }, { status: 400 });
    }
    update.portal_user_id = nextPayerId;
  }
  if (metadata !== undefined) {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return NextResponse.json({ error: 'metadata must be an object' }, { status: 400 });
    update.metadata = metadata;
  }

  // Keep the printed document, ledger total, and outstanding balance aligned.
  const effectiveItems = update.items ?? existing.items;
  if (Array.isArray(effectiveItems)) {
    const itemCheck = calculateInvoiceItemsTotal(effectiveItems);
    if (!itemCheck.ok) return NextResponse.json({ error: itemCheck.error }, { status: 400 });
    if (update.amount === undefined) update.amount = itemCheck.total;
    else if (Math.abs(Number(update.amount) - itemCheck.total) > 0.01) {
      return NextResponse.json({ error: `Amount (${update.amount}) does not match the sum of line items (${itemCheck.total}).` }, { status: 400 });
    }
  }
  if (update.amount !== undefined) {
    const alreadyPaid = Math.max(0, Number(existing.amount_paid ?? 0) || 0);
    if (update.amount + 0.01 < alreadyPaid) return NextResponse.json({ error: `Amount cannot be lower than the amount already paid (${alreadyPaid})` }, { status: 400 });
    update.original_amount = update.amount;
    update.amount_remaining = Math.max(0, update.amount - alreadyPaid);
  }

  const { data, error } = await admin
    .from('invoices')
    .update(update)
    .eq('id', id)
    .select('*, portal_users!invoices_portal_user_id_fkey(id, full_name, email), schools(id, name)')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logAudit(admin as any, {
    action: 'invoice_updated',
    actorId: caller.id,
    resourceType: 'invoice',
    resourceId: id,
    tableName: 'invoices',
    oldValue: existing.status,
    newValue: data?.status ?? existing.status,
    newValues: {
      invoice_number: data?.invoice_number ?? null,
      amount: data?.amount ?? null,
      status: data?.status ?? null,
      changed_fields: Object.keys(update).filter((k) => k !== 'updated_at'),
    },
  });
  return NextResponse.json({ data });
}

// DELETE /api/invoices/[id] — admin-only (or school for its own unpaid invoices)
export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const caller = await requireStaff();
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await context.params;
  const admin = adminClient();

  const { data: existing } = await admin
    .from('invoices')
    .select('id, school_id, billing_cycle_id, status, invoice_number')
    .eq('id', id)
    .single();
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Only admin may delete across all invoices; schools may only delete their own.
  if (!roleHasCapability(caller.role, 'manage_finance')) {
    return NextResponse.json({ error: 'Finance administrator access required' }, { status: 403 });
  }
  if (caller.role === 'school') {
    const cycleSchoolId = await getLinkedCycleSchoolId(admin, existing);
    if (existing.school_id !== caller.school_id && cycleSchoolId !== caller.school_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }
  // Refuse to delete paid invoices — finance ledger integrity
  if (existing.status === 'paid') {
    return NextResponse.json(
      {
        error:
          'Paid invoices cannot be deleted. Void or adjust via a reconciliation entry instead.',
      },
      { status: 400 },
    );
  }

  const cycleId = await resolveBillingCycleIdForInvoice(admin, existing);
  if (cycleId) {
    const sync = await syncInvoiceFieldsThroughBillingCycle(admin, cycleId, {
      invoice_status: 'cancelled',
    });
    if (!sync.ok) return NextResponse.json({ error: sync.error }, { status: sync.status ?? 500 });
    await logAudit(admin as any, {
      action: 'invoice_cancelled',
      actorId: caller.id,
      resourceType: 'invoice',
      resourceId: id,
      tableName: 'invoices',
      oldValue: existing.status,
      newValue: 'cancelled',
      newValues: {
        invoice_number: existing.invoice_number,
        via: 'billing_cycle',
        previous_status: existing.status,
      },
    });
    return NextResponse.json({
      success: true,
      action: 'cancelled',
      invoice_number: existing.invoice_number,
      effects: ['invoice_history_preserved', 'term_billing_cancelled'],
    });
  }

  const { error } = await admin.from('invoices').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logAudit(admin as any, {
    action: 'invoice_cancelled',
    actorId: caller.id,
    resourceType: 'invoice',
    resourceId: id,
    tableName: 'invoices',
    oldValue: existing.status,
    newValue: 'cancelled',
    newValues: {
      invoice_number: existing.invoice_number,
      via: 'direct',
      previous_status: existing.status,
    },
  });
  return NextResponse.json({ success: true, action: 'cancelled', invoice_number: existing.invoice_number, effects: ['invoice_history_preserved'] });
}
