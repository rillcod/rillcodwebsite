import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function getCaller() {
  const supabase = await createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  const { data: profile } = await supabase
    .from('portal_users')
    .select('id, role, school_id')
    .eq('id', user.id)
    .single();
  return profile ?? null;
}

// GET /api/payment-accounts — list accounts the caller can see
// admin: all accounts; school: only their school's accounts + rillcod accounts (for reference)
export async function GET() {
  const caller = await getCaller();
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['admin', 'school'].includes(caller.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const admin = adminClient();
  let query = admin.from('payment_accounts').select('*').order('created_at', { ascending: false });

  if (caller.role === 'school') {
    // School sees: their own school accounts + all rillcod accounts (needed for invoice building)
    query = query.or(
      `owner_type.eq.rillcod,and(owner_type.eq.school,school_id.eq.${caller.school_id})`,
    );
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

// POST /api/payment-accounts — create payment account
// admin: anything; school: only owner_type=school bound to their school_id
export async function POST(request: NextRequest) {
  const caller = await getCaller();
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['admin', 'school'].includes(caller.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();

  // School hardening
  if (caller.role === 'school') {
    if (body.owner_type !== 'school') {
      return NextResponse.json({ error: 'Schools can only create school-owned accounts' }, { status: 403 });
    }
    if (!caller.school_id || body.school_id !== caller.school_id) {
      return NextResponse.json({ error: 'school_id must match your school' }, { status: 403 });
    }
  }

  const admin = adminClient();
  const { data, error } = await admin
    .from('payment_accounts')
    .insert({ ...body, created_by: caller.id })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
