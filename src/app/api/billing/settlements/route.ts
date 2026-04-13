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

/** PATCH /api/billing/settlements — mark paid (admin). Body: { id, status?: 'paid'|'void' } */
export async function PATCH(request: Request) {
  const gate = await requireAdmin();
  if ('error' in gate) return gate.error;
  const { db } = gate;
  const body = await request.json().catch(() => ({}));
  const { id, status } = body;
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const nextStatus = status === 'void' ? 'void' : 'paid';
  const { data, error } = await db
    .from('school_settlements')
    .update({
      status: nextStatus,
      paid_at: nextStatus === 'paid' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
