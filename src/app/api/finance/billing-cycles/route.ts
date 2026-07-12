import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyInvoicePayment } from '@/lib/payments/verified-payment';
import { syncRosterBillingForCycle } from '@/lib/rosters/billing-sync';

async function getCaller() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from('portal_users').select('id, role, school_id').eq('id', user.id).single();
  return data as { id: string; role: string; school_id: string | null } | null;
}

async function teacherScopedSchoolIds(
  db: ReturnType<typeof createAdminClient>,
  teacherId: string,
  primarySchoolId: string | null,
) {
  const ids = new Set<string>();
  if (primarySchoolId) ids.add(primarySchoolId);
  const { data: ts } = await db.from('teacher_schools').select('school_id').eq('teacher_id', teacherId);
  (ts ?? []).forEach((r: { school_id: string | null }) => {
    if (r.school_id) ids.add(r.school_id);
  });
  const { data: cls } = await db.from('classes').select('school_id').eq('teacher_id', teacherId);
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
  if (!caller || !['admin', 'school', 'teacher'].includes(caller.role)) {
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
    const ids = await teacherScopedSchoolIds(db, caller.id, caller.school_id);
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
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const allowedStatus = ['paid', 'cancelled', 'due', 'past_due', 'rolled_over'] as const;
  const allowedOwnerType = ['school', 'individual'] as const;
  const allowedCurrencies = ['NGN', 'USD'] as const;

  const updates: any = { updated_at: new Date().toISOString() };

  if (typeof body.term_label === 'string' && body.term_label.trim()) updates.term_label = body.term_label.trim();
  if (typeof body.term_start_date === 'string' && body.term_start_date) updates.term_start_date = body.term_start_date;
  if (typeof body.due_date === 'string' && body.due_date) updates.due_date = body.due_date;
  if (typeof body.amount_due === 'number' && Number.isFinite(body.amount_due)) updates.amount_due = body.amount_due;

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

  if (typeof body.owner_type === 'string') {
    if (!allowedOwnerType.includes(body.owner_type as (typeof allowedOwnerType)[number])) {
      return NextResponse.json({ error: 'Invalid owner_type' }, { status: 400 });
    }
    updates.owner_type = body.owner_type;
    if (body.owner_type === 'school') {
      const ownerSchoolId = String(body.owner_school_id || '').trim();
      if (!ownerSchoolId) {
        return NextResponse.json({ error: 'owner_school_id required for school owner' }, { status: 400 });
      }
      const { data: owner } = await db.from('schools').select('id').eq('id', ownerSchoolId).maybeSingle();
      if (!owner) return NextResponse.json({ error: 'Owner school not found' }, { status: 404 });
      updates.owner_school_id = ownerSchoolId;
      updates.school_id = ownerSchoolId;
      updates.owner_user_id = null;
    } else {
      const ownerUserId = String(body.owner_user_id || '').trim();
      if (!ownerUserId) {
        return NextResponse.json({ error: 'owner_user_id required for individual owner' }, { status: 400 });
      }
      const { data: owner } = await db
        .from('portal_users')
        .select('id, role')
        .eq('id', ownerUserId)
        .maybeSingle();
      if (!owner) return NextResponse.json({ error: 'Owner user not found' }, { status: 404 });
      const role = String(owner.role || '').toLowerCase();
      if (!['student', 'parent'].includes(role)) {
        return NextResponse.json(
          { error: 'Individual billing owners must be a student or parent account' },
          { status: 400 },
        );
      }
      updates.owner_user_id = ownerUserId;
      updates.owner_school_id = null;
      updates.school_id = null;
    }
  }

  if (Object.keys(updates).length === 1) {
    return NextResponse.json({ error: 'No editable fields provided' }, { status: 400 });
  }

  if (body.status === 'paid') {
    const { data: cycle } = await db
      .from('billing_cycles')
      .select('id, invoice_id')
      .eq('id', id)
      .maybeSingle();
    if (!cycle) return NextResponse.json({ error: 'Billing cycle not found' }, { status: 404 });
    if (!cycle.invoice_id) {
      return NextResponse.json(
        { error: 'This billing cycle has no linked invoice. Create/link the invoice before marking it paid.' },
        { status: 409 },
      );
    }

    // Persist any non-status edits first (owner/term/amount) before payment verification.
    const sideUpdates = { ...updates };
    delete sideUpdates.status;
    if (Object.keys(sideUpdates).length > 1) {
      const { error: sideErr } = await db.from('billing_cycles').update(sideUpdates).eq('id', id);
      if (sideErr) return NextResponse.json({ error: sideErr.message }, { status: 500 });
    }

    try {
      const payment = await verifyInvoicePayment({
        invoiceId: cycle.invoice_id,
        method: 'manual',
        actorId: caller.id,
        source: 'billing_cycle_mark_paid',
      });
      const { error: paidStateError } = await db
        .from('billing_cycles')
        .update({ status: 'paid', updated_at: new Date().toISOString() })
        .eq('id', id);
      if (paidStateError) return NextResponse.json({ error: 'Payment settled but billing-cycle status could not be saved', detail: paidStateError.message, payment }, { status: 500 });
      const rosterSync = await syncRosterBillingForCycle(db as any, id, 'paid');
      return NextResponse.json({ data: { id, status: 'paid', invoice_id: cycle.invoice_id }, payment, ...(rosterSync?.ok === false ? { warnings: [rosterSync.error] } : {}) });
    } catch (err: any) {
      return NextResponse.json({ error: err.message || 'Failed to verify billing-cycle payment' }, { status: err.statusCode || 500 });
    }
  }

  const { data, error } = await db.from('billing_cycles')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
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
    const { data: owner } = await db.from('schools').select('id').eq('id', rawSchoolId).maybeSingle();
    if (!owner) return NextResponse.json({ error: 'Owner school not found' }, { status: 404 });
    owner_school_id = rawSchoolId;
  } else {
    if (!rawUserId) {
      return NextResponse.json({ error: 'owner_user_id required for individual owner' }, { status: 400 });
    }
    const { data: owner } = await db
      .from('portal_users')
      .select('id, role')
      .eq('id', rawUserId)
      .maybeSingle();
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
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const db = createAdminClient();
  const { data: existing } = await db.from('billing_cycles').select('status').eq('id', id).single();
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Safety: only allow deleting cancelled or rolled_over cycles
  if (!['cancelled', 'rolled_over'].includes(existing.status)) {
    return NextResponse.json(
      { error: 'Only cancelled or rolled-over cycles can be deleted. Cancel it first.' },
      { status: 400 },
    );
  }

  const { error } = await db.from('billing_cycles').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
