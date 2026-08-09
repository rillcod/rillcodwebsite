import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyInvoicePayment } from '@/lib/payments/verified-payment';
import { settleBillingCyclePayment } from '@/lib/finance/billing-cycle-payment';
import { syncRosterBillingForCycle } from '@/lib/rosters/billing-sync';
import { logAudit } from '@/lib/audit/log';
import { roleHasCapability } from '@/lib/auth/capabilities';

async function getCaller() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return null;
  const { data, error } = await supabase.from('portal_users').select('id, role, school_id').eq('id', user.id).single();
  if (error) return null;
  return data as { id: string; role: string; school_id: string | null } | null;
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

async function teacherScopedSchoolIds(
  db: ReturnType<typeof createAdminClient>,
  teacherId: string,
  primarySchoolId: string | null,
) {
  const ids = new Set<string>();
  if (primarySchoolId) ids.add(primarySchoolId);
  const { data: ts, error: teacherSchoolsError } = await db.from('teacher_schools').select('school_id').eq('teacher_id', teacherId);
  if (teacherSchoolsError) throw new Error(`Teacher school scope failed: ${teacherSchoolsError.message}`);
  (ts ?? []).forEach((r: { school_id: string | null }) => {
    if (r.school_id) ids.add(r.school_id);
  });
  const { data: cls, error: classesError } = await db.from('classes').select('school_id').eq('teacher_id', teacherId);
  if (classesError) throw new Error(`Teacher class scope failed: ${classesError.message}`);
  (cls ?? []).forEach((r: { school_id: string | null }) => {
    if (r.school_id) ids.add(r.school_id);
  });
  return [...ids];
}

/**
 * GET /api/finance/billing-cycles?school_id=&subscription_id=&status=
 * Returns billing cycles with invoice + school info.
 */
export async function GET(request: Request) {
  const caller = await getCaller();
  if (!caller || !roleHasCapability(caller.role, 'view_school_finance')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const subscription_id = searchParams.get('subscription_id');
  const status = searchParams.get('status');

  const db = createAdminClient();

  let q = db.from('billing_cycles')
    .select('*, invoices!billing_cycles_invoice_id_fkey(id, invoice_number, status, amount), schools:schools!billing_cycles_school_id_fkey(name, rillcod_quota_percent), owner_schools:schools!billing_cycles_owner_school_id_fkey(name, rillcod_quota_percent)')
    .order('due_date', { ascending: false })
    .limit(200);
  q = q.is('archived_at', null) as typeof q;

  if (caller.role === 'admin') {
    const param = searchParams.get('school_id');
    if (param) {
      q = q.or(`school_id.eq.${param},owner_school_id.eq.${param}`) as typeof q;
    }
  } else if (caller.role === 'school') {
    if (!caller.school_id) return NextResponse.json({ data: [] });
    const sid = caller.school_id;
    q = q.or(`school_id.eq.${sid},owner_school_id.eq.${sid}`) as typeof q;
  } else if (caller.role === 'teacher') {
    let ids: string[];
    try {
      ids = await teacherScopedSchoolIds(db, caller.id, caller.school_id);
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Teacher finance scope failed' },
        { status: 500 },
      );
    }
    if (ids.length === 0) return NextResponse.json({ data: [] });
    const inList = ids.join(',');
    q = q.or(
      `school_id.in.(${inList}),owner_school_id.in.(${inList}),owner_user_id.eq.${caller.id}`,
    ) as typeof q;
  }
  if (subscription_id) q = q.eq('subscription_id', subscription_id) as typeof q;
  if (status) q = q.eq('status', status) as typeof q;

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

/**
 * PATCH /api/finance/billing-cycles — mark a billing cycle as paid/cancelled
 * Body: { id, status: 'paid' | 'cancelled' }
 */
export async function PATCH(request: Request) {
  const caller = await getCaller();
  if (!caller || caller.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const { id } = body as { id?: string };
  if (!isUuid(id)) return NextResponse.json({ error: 'A valid billing cycle id is required' }, { status: 400 });
  if (body.owner_type !== undefined || body.owner_school_id !== undefined || body.owner_user_id !== undefined) {
    return NextResponse.json(
      { error: 'Billing ownership cannot be changed after cycle creation; cancel and create a replacement cycle' },
      { status: 409 },
    );
  }

  const allowedStatus = ['paid', 'cancelled', 'due', 'past_due', 'rolled_over'] as const;
  const allowedCurrencies = ['NGN', 'USD'] as const;

  const updates: any = { updated_at: new Date().toISOString() };

  if (typeof body.term_label === 'string' && body.term_label.trim()) updates.term_label = body.term_label.trim();
  if (body.term_start_date !== undefined) {
    if (!isIsoDate(body.term_start_date)) return NextResponse.json({ error: 'Invalid term_start_date' }, { status: 400 });
    updates.term_start_date = body.term_start_date;
  }
  if (body.due_date !== undefined) {
    if (!isIsoDate(body.due_date)) return NextResponse.json({ error: 'Invalid due_date' }, { status: 400 });
    updates.due_date = body.due_date;
  }
  if (body.amount_due !== undefined) {
    if (typeof body.amount_due !== 'number' || !Number.isFinite(body.amount_due) || body.amount_due <= 0) {
      return NextResponse.json({ error: 'amount_due must be greater than zero' }, { status: 400 });
    }
    updates.amount_due = body.amount_due;
  }

  if (typeof body.currency === 'string') {
    const currency = body.currency.toUpperCase();
    if (!allowedCurrencies.includes(currency as (typeof allowedCurrencies)[number])) {
      return NextResponse.json({ error: 'Invalid currency' }, { status: 400 });
    }
    updates.currency = currency;
  }

  if (typeof body.status === 'string') {
    if (!allowedStatus.includes(body.status as (typeof allowedStatus)[number])) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }
    updates.status = body.status;
  }

  const db = createAdminClient();

  if (Object.keys(updates).length === 1) {
    return NextResponse.json({ error: 'No editable fields provided' }, { status: 400 });
  }

  if (body.status === 'paid') {
    if (Object.keys(updates).some((key) => !['status', 'updated_at'].includes(key))) {
      return NextResponse.json(
        { error: 'Save cycle edits before marking it paid; payment settlement must be a separate action' },
        { status: 400 },
      );
    }
    const { data: cycle, error: cycleError } = await db
      .from('billing_cycles')
      .select('id, invoice_id')
      .eq('id', id)
      .maybeSingle();
    if (cycleError) return NextResponse.json({ error: cycleError.message }, { status: 500 });
    if (!cycle) return NextResponse.json({ error: 'Billing cycle not found' }, { status: 404 });
    if (!cycle.invoice_id) {
      return NextResponse.json(
        { error: 'This billing cycle has no linked invoice. Create/link the invoice before marking it paid.' },
        { status: 409 },
      );
    }

    try {
      const payment = await verifyInvoicePayment({
        invoiceId: cycle.invoice_id,
        method: 'manual',
        actorId: caller.id,
        source: 'billing_cycle_mark_paid',
      });
      // verifyInvoicePayment → processSuccessfulPayment usually settles the cycle;
      // repair via the same atomic RPC the gateway uses if status lagged.
      const { data: refreshed, error: refreshError } = await db
        .from('billing_cycles')
        .select('id, status, invoice_id')
        .eq('id', id)
        .maybeSingle();
      if (refreshError) throw new Error(`Payment verified but cycle reload failed: ${refreshError.message}`);
      if (refreshed?.status !== 'paid') {
        const settlement = await settleBillingCyclePayment(db as any, {
          billingCycleId: id,
          transactionId: payment.transactionId,
          actorId: caller.id,
        });
        if (!settlement.ok) {
          return NextResponse.json(
            { error: settlement.error.message || 'Billing cycle settlement failed', payment },
            { status: 500 },
          );
        }
      }
      await logAudit(db as any, {
        action: 'billing_cycle_marked_paid',
        actorId: caller.id,
        resourceType: 'billing_cycle',
        resourceId: id,
        tableName: 'billing_cycles',
        newValue: 'paid',
        newValues: {
          invoice_id: cycle.invoice_id,
          transaction_id: payment.transactionId,
        },
      });
      return NextResponse.json({
        data: { id, status: 'paid', invoice_id: cycle.invoice_id },
        payment,
      });
    } catch (err: any) {
      return NextResponse.json({ error: err.message || 'Failed to verify billing-cycle payment' }, { status: err.statusCode || 500 });
    }
  }

  const { data: existingCycle, error: existingCycleError } = await db.from('billing_cycles')
    .select('id, invoice_id, status, term_label, term_start_date, due_date, amount_due, currency')
    .eq('id', id).maybeSingle();
  if (existingCycleError) return NextResponse.json({ error: existingCycleError.message }, { status: 500 });
  if (!existingCycle) return NextResponse.json({ error: 'Billing cycle not found' }, { status: 404 });
  if (existingCycle.status === 'paid') return NextResponse.json({ error: 'Paid billing cycles are financially locked' }, { status: 409 });
  const resolvedTermStart = updates.term_start_date ?? existingCycle.term_start_date;
  const resolvedDueDate = updates.due_date ?? existingCycle.due_date;
  if (resolvedDueDate < resolvedTermStart) {
    return NextResponse.json({ error: 'due_date cannot be before term_start_date' }, { status: 400 });
  }
  const { error } = await (db as any).rpc('update_billing_cycle_with_invoice', {
    p_cycle_id: id,
    p_term_label: updates.term_label ?? existingCycle.term_label,
    p_term_start_date: updates.term_start_date ?? existingCycle.term_start_date,
    p_due_date: updates.due_date ?? existingCycle.due_date,
    p_amount_due: updates.amount_due ?? existingCycle.amount_due,
    p_currency: updates.currency ?? existingCycle.currency,
    p_status: updates.status ?? existingCycle.status,
    p_items: Array.isArray(body.items) ? body.items : null,
    p_metadata: body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata) ? body.metadata : null,
    p_notes: typeof body.notes === 'string' ? body.notes : null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const { data, error: reloadError } = await db.from('billing_cycles').select('*').eq('id', id).single();
  if (reloadError || !data) {
    return NextResponse.json({ error: reloadError?.message || 'Billing cycle could not be reloaded' }, { status: 500 });
  }
  await logAudit(db as any, {
    action: 'billing_cycle_updated',
    actorId: caller.id,
    resourceType: 'billing_cycle',
    resourceId: id,
    tableName: 'billing_cycles',
    oldValues: existingCycle as unknown as Record<string, unknown>,
    newValues: data as unknown as Record<string, unknown>,
  });
  if (typeof body.status === 'string') {
    const rosterSync = await syncRosterBillingForCycle(db as any, id, body.status);
    if (rosterSync?.ok === false) return NextResponse.json({ data, warnings: [rosterSync.error] });
  }
  return NextResponse.json({ data });
}

/**
 * POST /api/finance/billing-cycles — create billing cycle
 */
export async function POST(request: Request) {
  const caller = await getCaller();
  if (!caller || caller.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const owner_type = String(body.owner_type || '').trim();
  const term_label = String(body.term_label || '').trim();
  const term_start_date = String(body.term_start_date || '').trim();
  const due_date = String(body.due_date || '').trim();
  const currency = String(body.currency || 'NGN').toUpperCase();
  const status = String(body.status || 'due').trim();
  const amount_due = Number(body.amount_due);

  if (!['school', 'individual'].includes(owner_type)) {
    return NextResponse.json({ error: 'owner_type must be school or individual' }, { status: 400 });
  }
  if (!term_label || !term_start_date || !due_date || !Number.isFinite(amount_due) || amount_due <= 0) {
    return NextResponse.json({ error: 'term_label, term_start_date, due_date, amount_due are required' }, { status: 400 });
  }
  if (!isIsoDate(term_start_date) || !isIsoDate(due_date)) {
    return NextResponse.json({ error: 'term_start_date and due_date must be valid dates' }, { status: 400 });
  }
  if (due_date < term_start_date) {
    return NextResponse.json({ error: 'due_date cannot be before term_start_date' }, { status: 400 });
  }
  if (!['NGN', 'USD'].includes(currency)) {
    return NextResponse.json({ error: 'currency must be NGN or USD' }, { status: 400 });
  }
  if (!['due', 'past_due'].includes(status)) {
    return NextResponse.json({ error: 'New billing cycles must start as due or past_due' }, { status: 400 });
  }

  const rawSchoolId = owner_type === 'school' ? String(body.owner_school_id || '').trim() : '';
  const rawUserId = owner_type === 'individual' ? String(body.owner_user_id || '').trim() : '';

  const db = createAdminClient();
  let owner_school_id: string | null = null;
  let owner_user_id: string | null = null;

  if (owner_type === 'school') {
    if (!rawSchoolId) {
      return NextResponse.json({ error: 'owner_school_id required for school owner' }, { status: 400 });
    }
    if (!isUuid(rawSchoolId)) return NextResponse.json({ error: 'Invalid owner_school_id' }, { status: 400 });
    const { data: owner, error: ownerError } = await db.from('schools').select('id').eq('id', rawSchoolId).maybeSingle();
    if (ownerError) return NextResponse.json({ error: ownerError.message }, { status: 500 });
    if (!owner) return NextResponse.json({ error: 'Owner school not found' }, { status: 404 });
    owner_school_id = rawSchoolId;
  } else {
    if (!rawUserId) {
      return NextResponse.json({ error: 'owner_user_id required for individual owner' }, { status: 400 });
    }
    if (!isUuid(rawUserId)) return NextResponse.json({ error: 'Invalid owner_user_id' }, { status: 400 });
    const { data: owner, error: ownerError } = await db
      .from('portal_users')
      .select('id, role')
      .eq('id', rawUserId)
      .maybeSingle();
    if (ownerError) return NextResponse.json({ error: ownerError.message }, { status: 500 });
    if (!owner) return NextResponse.json({ error: 'Owner user not found' }, { status: 404 });
    const role = String(owner.role || '').toLowerCase();
    if (!['student', 'parent'].includes(role)) {
      return NextResponse.json(
        { error: 'Individual billing owners must be a student or parent account' },
        { status: 400 },
      );
    }
    owner_user_id = rawUserId;
  }

  const { createBillingCycleWithInvoice } = await import('@/lib/finance/create-invoice');
  const { financeResultToResponse } = await import('@/lib/finance/write-result');
  const result = await createBillingCycleWithInvoice({
    owner_type: owner_type as 'school' | 'individual',
    owner_school_id,
    owner_user_id,
    term_label,
    term_start_date,
    due_date,
    amount_due,
    currency,
    status: status as 'due' | 'past_due',
    items: Array.isArray(body.items) ? body.items : [],
    actor_id: caller.id,
  });

  if (!result.ok) {
    const mapped = financeResultToResponse(result);
    return NextResponse.json(mapped.body, { status: mapped.status });
  }

  return NextResponse.json(
    {
      success: true,
      data: { ...result.data.cycle, invoice_id: result.data.invoice.id },
      invoice: result.data.invoice,
      effects: result.effects,
    },
    { status: 201 },
  );
}

/**
 * DELETE /api/finance/billing-cycles — delete a cancelled/rolled_over cycle (admin only).
 * Body: { id }
 */
export async function DELETE(request: Request) {
  const caller = await getCaller();
  if (!caller || caller.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const { id } = body as { id?: string };
  if (!isUuid(id)) return NextResponse.json({ error: 'A valid billing cycle id is required' }, { status: 400 });

  const db = createAdminClient();
  const { data: existing, error: existingError } = await db.from('billing_cycles').select('status').eq('id', id).maybeSingle();
  if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Safety: only allow deleting cancelled or rolled_over cycles
  if (!['cancelled', 'rolled_over'].includes(existing.status)) {
    return NextResponse.json(
      { error: 'Only cancelled or rolled-over cycles can be deleted. Cancel it first.' },
      { status: 400 },
    );
  }

  const { data: archived, error } = await (db as any)
    .from('billing_cycles')
    .update({ archived_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', id)
    .in('status', ['cancelled', 'rolled_over'])
    .is('archived_at', null)
    .select('id')
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!archived) return NextResponse.json({ error: 'Billing cycle was already archived or changed' }, { status: 409 });
  await logAudit(db as any, {
    action: 'billing_cycle_archived',
    actorId: caller.id,
    resourceType: 'billing_cycle',
    resourceId: id,
    tableName: 'billing_cycles',
    oldValues: { status: existing.status, archived_at: null },
    newValues: { status: existing.status, archived: true, record_preserved: true },
  });
  return NextResponse.json({ success: true, action: 'archived', effects: ['billing_cycle_history_preserved'] });
}
