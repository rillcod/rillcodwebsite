import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

async function getCaller() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  // Use adminClient to bypass RLS on portal_users
  const db = createAdminClient();
  const { data } = await db
    .from('portal_users')
    .select('id, role, school_id')
    .eq('id', user.id)
    .single();
  return data ?? null;
}

// GET /api/billing/notices
export async function GET() {
  const caller = await getCaller();
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = createAdminClient();
  let query = db
    .from('billing_notices')
    .select('*')
    .eq('is_resolved', false)
    .order('created_at', { ascending: false });

  if (caller.role !== 'admin') {
    // Always filter by the caller's own user ID; add school filter only if school_id is set
    const orParts = [`owner_user_id.eq.${caller.id}`];
    if (caller.school_id) orParts.push(`owner_school_id.eq.${caller.school_id}`);
    query = query.or(orParts.join(',')) as any;
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

// PATCH /api/billing/notices
export async function PATCH(request: Request) {
  const caller = await getCaller();
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  if (!body?.id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  if (caller.role !== 'admin') {
    return NextResponse.json(
      { error: 'Sticky billing notices can only be resolved by admin after payment confirmation.' },
      { status: 403 },
    );
  }

  const db = createAdminClient();
  const { error } = await db
    .from('billing_notices')
    .update({
      is_resolved: true,
      resolved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', body.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, id: body.id });
}

