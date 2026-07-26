import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { canTransitionSettlement, validateSettlementAmount } from '@/lib/finance/settlement-state';
import { logAudit } from '@/lib/audit/log';

async function requireAdmin(): Promise<
  | { error: NextResponse }
  | { db: ReturnType<typeof createAdminClient>; actorId: string }
> {
  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const db = createAdminClient();
  // Use adminClient to bypass RLS — supabase user client may not have read access
  const { data: profile } = await db.from('portal_users').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { db, actorId: user.id };
}

/** GET /api/billing/settlements — list recent school settlements (admin). */
export async function GET() {
  const gate = await requireAdmin();
  if ('error' in gate) return gate.error;
  const { db } = gate;
  const { data, error } = await db
    .from('school_settlements')
    .select('*, schools(name)')
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

/** POST /api/billing/settlements — create a settlement row (admin). */
export async function POST(request: Request) {
  const gate = await requireAdmin();
  if ('error' in gate) return gate.error;
  const { db } = gate;
  const body = await request.json().catch(() => ({}));
  const { school_id, amount, currency, billing_cycle_id, notes, reference } = body;
  const validAmount = validateSettlementAmount(amount);
  if (!school_id || validAmount == null) return NextResponse.json({ error: 'A valid school_id and positive amount are required' }, { status: 400 });
  const normalizedCurrency = String(currency || 'NGN').toUpperCase();
  if (!['NGN', 'USD'].includes(normalizedCurrency)) return NextResponse.json({ error: 'currency must be NGN or USD' }, { status: 400 });
  const { data: school, error: schoolError } = await db.from('schools').select('id').eq('id', school_id).maybeSingle();
  if (schoolError) return NextResponse.json({ error: schoolError.message }, { status: 500 });
  if (!school) return NextResponse.json({ error: 'School not found' }, { status: 404 });
  if (billing_cycle_id) {
    const { data: cycle, error: cycleError } = await db
      .from('billing_cycles')
      .select('id, school_id, owner_school_id, school_settlement_amount, amount_due, currency')
      .eq('id', billing_cycle_id)
      .maybeSingle();
    if (cycleError) return NextResponse.json({ error: cycleError.message }, { status: 500 });
    if (!cycle) return NextResponse.json({ error: 'Billing cycle not found' }, { status: 404 });
    const cycleSchoolId = cycle.school_id || cycle.owner_school_id;
    if (cycleSchoolId !== school_id) {
      return NextResponse.json({ error: 'Billing cycle belongs to another school' }, { status: 409 });
    }
    const maximumSettlement = Number(cycle.school_settlement_amount ?? cycle.amount_due ?? 0);
    if (maximumSettlement > 0 && validAmount - maximumSettlement > 0.01) {
      return NextResponse.json({ error: 'Settlement amount exceeds the billing cycle school share', maximum_amount: maximumSettlement }, { status: 422 });
    }
    if (cycle.currency && String(cycle.currency).toUpperCase() !== normalizedCurrency) {
      return NextResponse.json({ error: 'Settlement currency must match the billing cycle currency' }, { status: 409 });
    }
    const { data: existingCycleSettlement, error: duplicateError } = await db
      .from('school_settlements')
      .select('id')
      .eq('billing_cycle_id', billing_cycle_id)
      .neq('status', 'void')
      .maybeSingle();
    if (duplicateError) return NextResponse.json({ error: duplicateError.message }, { status: 500 });
    if (existingCycleSettlement) {
      return NextResponse.json(
        { error: 'An active settlement already exists for this billing cycle', settlement_id: existingCycleSettlement.id },
        { status: 409 },
      );
    }
  }
  const { data, error } = await db
    .from('school_settlements')
    .insert({
      school_id,
      amount: validAmount,
      currency: normalizedCurrency,
      billing_cycle_id: billing_cycle_id || null,
      notes: notes || null,
      reference: reference || null,
      status: 'pending',
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logAudit(db as any, {
    action: 'settlement_created',
    actorId: gate.actorId,
    resourceType: 'school_settlement',
    resourceId: data.id,
    tableName: 'school_settlements',
    newValue: `${normalizedCurrency} ${validAmount.toLocaleString()}`,
    newValues: {
      school_id,
      amount: validAmount,
      currency: normalizedCurrency,
      billing_cycle_id: billing_cycle_id || null,
      reference: reference || null,
    },
  });
  return NextResponse.json({ data }, { status: 201 });
}

/** PATCH /api/billing/settlements — mark paid/void or edit fields (admin). Body: { id, status?, amount?, currency?, reference?, notes? } */
export async function PATCH(request: Request) {
  const gate = await requireAdmin();
  if ('error' in gate) return gate.error;
  const { db, actorId } = gate;
  const body = await request.json().catch(() => ({}));
  const { id, status } = body;
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  // Build a typed patch object accepted by Supabase's strict update types
  type SettlementPatch = {
    updated_at: string;
    status?: 'pending' | 'processing' | 'paid' | 'void';
    paid_at?: string | null;
    amount?: number;
    currency?: string;
    reference?: string | null;
    notes?: string | null;
    paid_by?: string | null;
  };

  const { data: existing, error: existingError } = await db.from('school_settlements').select('id, status, reference, amount, currency, billing_cycle_id').eq('id', id).maybeSingle();
  if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: 'Settlement not found' }, { status: 404 });
  if (['paid', 'void'].includes(existing.status) && (status || body.amount !== undefined || body.currency !== undefined || body.reference !== undefined)) {
    return NextResponse.json({ error: 'Paid and void settlements are financially locked; only notes may be edited' }, { status: 409 });
  }

  const updates: SettlementPatch = { updated_at: new Date().toISOString() };

  if (status) {
    if (!canTransitionSettlement(existing.status, status)) {
      return NextResponse.json({ error: 'Invalid settlement transition: ' + existing.status + ' to ' + status }, { status: 409 });
    }
    if (status === 'paid' && !String(body.reference || existing.reference || '').trim()) {
      return NextResponse.json({ error: 'A bank/payment reference is required before marking a settlement paid' }, { status: 400 });
    }
    updates.status = status as 'pending' | 'processing' | 'paid' | 'void';
    if (status === 'paid') { updates.paid_at = new Date().toISOString(); updates.paid_by = actorId; }
  }
  if (typeof body.amount === 'number' && Number.isFinite(body.amount) && body.amount > 0) {
    updates.amount = body.amount;
  }
  if (body.currency !== undefined) {
    const normalizedCurrency = String(body.currency || '').toUpperCase();
    if (!['NGN', 'USD'].includes(normalizedCurrency)) return NextResponse.json({ error: 'currency must be NGN or USD' }, { status: 400 });
    updates.currency = normalizedCurrency;
  }
  if (typeof body.reference === 'string') updates.reference = body.reference || null;
  if (typeof body.notes === 'string') updates.notes = body.notes || null;
  if ((status === 'paid' || body.amount !== undefined || body.currency !== undefined) && existing.billing_cycle_id) {
    const { data: cycle, error: cycleError } = await db.from('billing_cycles').select('amount_due, school_settlement_amount, currency').eq('id', existing.billing_cycle_id).maybeSingle();
    if (cycleError) return NextResponse.json({ error: cycleError.message }, { status: 500 });
    if (!cycle) return NextResponse.json({ error: 'Linked billing cycle not found' }, { status: 409 });
    const nextAmount = updates.amount ?? Number(existing.amount);
    const maximum = Number(cycle.school_settlement_amount ?? cycle.amount_due ?? 0);
    if (maximum > 0 && nextAmount - maximum > 0.01) return NextResponse.json({ error: 'Settlement amount exceeds the billing cycle school share', maximum_amount: maximum }, { status: 422 });
    const nextCurrency = updates.currency ?? String(existing.currency || 'NGN').toUpperCase();
    if (nextCurrency !== String(cycle.currency || 'NGN').toUpperCase()) return NextResponse.json({ error: 'Settlement currency must match the billing cycle currency' }, { status: 409 });
  }

  const { data, error } = await db
    .from('school_settlements')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (status === 'paid' || status === 'void') {
    await logAudit(db as any, {
      action: status === 'paid' ? 'settlement_marked_paid' : 'settlement_voided',
      actorId,
      resourceType: 'school_settlement',
      resourceId: id,
      tableName: 'school_settlements',
      oldValue: existing.status,
      newValue: status,
      newValues: {
        amount: data.amount ?? existing.amount,
        currency: data.currency ?? existing.currency,
        reference: data.reference ?? existing.reference ?? null,
        billing_cycle_id: existing.billing_cycle_id ?? null,
      },
    });
  }
  return NextResponse.json({ success: true, data, effects: status === 'paid' ? ['settlement_paid', 'approver_recorded'] : ['settlement_updated'] });
}

/** DELETE /api/billing/settlements — delete a void/pending settlement (admin). Body: { id } */
export async function DELETE(request: Request) {
  const gate = await requireAdmin();
  if ('error' in gate) return gate.error;
  const { db } = gate;
  const body = await request.json().catch(() => ({}));
  const { id } = body as { id?: string };
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  // Safety: only allow deleting non-paid settlements
  const { data: existing } = await db.from('school_settlements').select('status').eq('id', id).single();
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (existing.status === 'paid') {
    return NextResponse.json({ error: 'Cannot delete a paid settlement. Void it first.' }, { status: 400 });
  }

  const { error } = await db.from('school_settlements').update({ status: 'void', updated_at: new Date().toISOString() }).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logAudit(db as any, {
    action: 'settlement_voided',
    actorId: gate.actorId,
    resourceType: 'school_settlement',
    resourceId: id,
    tableName: 'school_settlements',
    oldValue: existing.status,
    newValue: 'void',
  });
  return NextResponse.json({ success: true, action: 'voided', settlement_id: id });
}
