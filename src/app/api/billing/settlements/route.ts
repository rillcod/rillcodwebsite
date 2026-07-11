import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { canTransitionSettlement, validateSettlementAmount } from '@/lib/finance/settlement-state';

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
  const { data: school } = await db.from('schools').select('id').eq('id', school_id).maybeSingle();
  if (!school) return NextResponse.json({ error: 'School not found' }, { status: 404 });
  if (billing_cycle_id) {
    const { data: cycle } = await db
      .from('billing_cycles')
      .select('id, school_id, owner_school_id')
      .eq('id', billing_cycle_id)
      .maybeSingle();
    if (!cycle) return NextResponse.json({ error: 'Billing cycle not found' }, { status: 404 });
    const cycleSchoolId = cycle.school_id || cycle.owner_school_id;
    if (cycleSchoolId !== school_id) {
      return NextResponse.json({ error: 'Billing cycle belongs to another school' }, { status: 409 });
    }
    const { data: existingCycleSettlement } = await db
      .from('school_settlements')
      .select('id')
      .eq('billing_cycle_id', billing_cycle_id)
      .neq('status', 'void')
      .maybeSingle();
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
  return NextResponse.json({ data }, { status: 201 });
}

/** PATCH /api/billing/settlements — mark paid/void or edit fields (admin). Body: { id, status?, amount?, currency?, reference?, notes? } */
export async function PATCH(request: Request) {
  const gate = await requireAdmin();
  if ('error' in gate) return gate.error;
  const { db } = gate;
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
  };

  const { data: existing } = await db.from('school_settlements').select('id, status').eq('id', id).maybeSingle();
  if (!existing) return NextResponse.json({ error: 'Settlement not found' }, { status: 404 });

  const updates: SettlementPatch = { updated_at: new Date().toISOString() };

  if (status) {
    if (!canTransitionSettlement(existing.status, status)) {
      return NextResponse.json({ error: 'Invalid settlement transition: ' + existing.status + ' to ' + status }, { status: 409 });
    }
    updates.status = status as 'pending' | 'processing' | 'paid' | 'void';
    updates.paid_at = status === 'paid' ? new Date().toISOString() : null;
  }
  if (typeof body.amount === 'number' && Number.isFinite(body.amount) && body.amount > 0) {
    updates.amount = body.amount;
  }
  if (typeof body.currency === 'string' && body.currency) {
    updates.currency = body.currency.toUpperCase();
  }
  if (typeof body.reference === 'string') updates.reference = body.reference || null;
  if (typeof body.notes === 'string') updates.notes = body.notes || null;

  const { data, error } = await db
    .from('school_settlements')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
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
  return NextResponse.json({ success: true, action: 'voided', settlement_id: id });
}
