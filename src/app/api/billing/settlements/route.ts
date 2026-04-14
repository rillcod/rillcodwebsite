import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

async function requireAdmin(): Promise<
  | { error: NextResponse }
  | { db: ReturnType<typeof createAdminClient> }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const { data: profile } = await supabase.from('portal_users').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { db: createAdminClient() };
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
  if (!school_id || amount == null) {
    return NextResponse.json({ error: 'school_id and amount required' }, { status: 400 });
  }
  const { data, error } = await db
    .from('school_settlements')
    .insert({
      school_id,
      amount: Number(amount),
      currency: String(currency || 'NGN').toUpperCase(),
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
    status?: 'pending' | 'paid' | 'void';
    paid_at?: string | null;
    amount?: number;
    currency?: string;
    reference?: string | null;
    notes?: string | null;
  };

  const updates: SettlementPatch = { updated_at: new Date().toISOString() };

  if (status) {
    if (!['pending', 'paid', 'void'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }
    updates.status = status as 'pending' | 'paid' | 'void';
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

  const { error } = await db.from('school_settlements').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
