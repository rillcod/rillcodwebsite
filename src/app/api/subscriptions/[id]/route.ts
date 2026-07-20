import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { syncRosterSubscriptionStatus } from '@/lib/rosters/billing-sync';
import { buildSubscriptionWritePayload, normalizeSubscriptionRow } from '@/lib/finance/subscription-records';

async function getUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from('portal_users').select('role, school_id').eq('id', user.id).single();
  return data ? { ...user, role: data.role, school_id: data.school_id } : null;
}

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await context.params;
  const db = createAdminClient();

  const { data, error } = await db.from('subscriptions').select('*, schools(id, name, email)').eq('id', id).single();
  if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Non-admins can only see their own school's subscription
  if (user.role !== 'admin' && (data as any).school_id !== user.school_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return NextResponse.json({ data: normalizeSubscriptionRow(data as Record<string, unknown>) });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user || user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await context.params;
  const body = await request.json();
  const db = createAdminClient();

  const { data: existing, error: loadError } = await db
    .from('subscriptions')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (loadError || !existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const normalized = normalizeSubscriptionRow(existing as Record<string, unknown>);
  const payload = buildSubscriptionWritePayload({
    school_id: body.school_id ?? normalized.school_id,
    plan_name: body.plan_name ?? normalized.plan_name,
    plan_type: body.plan_type ?? normalized.plan_type,
    billing_cycle: body.billing_cycle ?? normalized.billing_cycle,
    amount: body.amount ?? normalized.amount,
    currency: body.currency ?? normalized.currency,
    start_date: body.start_date ?? normalized.start_date,
    end_date: body.end_date ?? normalized.end_date,
    features: body.features ?? normalized.features,
    max_students: body.max_students ?? normalized.max_students,
    max_teachers: body.max_teachers ?? normalized.max_teachers,
    status: body.status ?? normalized.status,
  });

  const { data, error } = await db.from('subscriptions')
    .update(payload as never)
    .eq('id', id).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (typeof body.status === 'string') {
    await syncRosterSubscriptionStatus(db as any, id, body.status);
  }
  return NextResponse.json({ data: normalizeSubscriptionRow(data as Record<string, unknown>) });
}

export async function DELETE(_req: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user || user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await context.params;
  const db = createAdminClient();

  // Cancel rather than delete
  const { data, error } = await db.from('subscriptions')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() } as any)
    .eq('id', id).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await syncRosterSubscriptionStatus(db as any, id, 'cancelled');
  return NextResponse.json({ data });
}
