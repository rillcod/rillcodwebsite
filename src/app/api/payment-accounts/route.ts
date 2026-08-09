import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { roleHasCapability } from '@/lib/auth/capabilities';
import { logAudit } from '@/lib/audit/log';
import { parsePaymentAccountInput } from '@/lib/finance/payment-account-input';

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
// admin: all accounts
// school: their school's accounts + rillcod accounts
// student/parent: active rillcod accounts (for bank-transfer instructions)
export async function GET() {
  const caller = await getCaller();
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['admin', 'school', 'student', 'parent', 'teacher'].includes(caller.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const admin = adminClient();
  let query = admin
    .from('payment_accounts')
    .select('*, schools(id, name)')
    .order('created_at', { ascending: false });

  if (caller.role === 'school') {
    query = caller.school_id
      ? query.or(`owner_type.eq.rillcod,and(owner_type.eq.school,school_id.eq.${caller.school_id})`)
      : query.eq('owner_type', 'rillcod');
  } else if (caller.role === 'student' || caller.role === 'parent' || caller.role === 'teacher') {
    query = query.eq('owner_type', 'rillcod').eq('is_active', true);
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
  if (!roleHasCapability(caller.role, 'manage_school_payment_settings')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = parsePaymentAccountInput(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const raw = body as Record<string, unknown>;

  // School hardening
  if (caller.role === 'school') {
    if (raw.owner_type !== 'school') {
      return NextResponse.json({ error: 'Schools can only create school-owned accounts' }, { status: 403 });
    }
    if (!caller.school_id || raw.school_id !== caller.school_id) {
      return NextResponse.json({ error: 'school_id must match your school' }, { status: 403 });
    }
  }
  const ownerType = caller.role === 'school'
    ? 'school'
    : raw.owner_type === 'school' ? 'school' : raw.owner_type === 'rillcod' ? 'rillcod' : null;
  if (!ownerType) {
    return NextResponse.json({ error: 'owner_type must be rillcod or school' }, { status: 400 });
  }
  const schoolId = ownerType === 'school'
    ? (caller.role === 'school' ? caller.school_id : String(raw.school_id || '').trim())
    : null;
  if (ownerType === 'school' && !schoolId) {
    return NextResponse.json({ error: 'school_id is required for a school account' }, { status: 400 });
  }
  const admin = adminClient();
  if (schoolId) {
    const { data: school, error: schoolError } = await admin
      .from('schools')
      .select('id')
      .eq('id', schoolId)
      .maybeSingle();
    if (schoolError) return NextResponse.json({ error: schoolError.message }, { status: 500 });
    if (!school) return NextResponse.json({ error: 'School not found' }, { status: 404 });
  }

  const payload = {
    ...parsed.value,
    owner_type: ownerType,
    school_id: schoolId,
    created_by: caller.id,
  };

  const { data, error } = await admin
    .from('payment_accounts')
    .insert(payload)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logAudit(admin as any, {
    action: 'create_payment_account',
    actorId: caller.id,
    resourceType: 'payment_account',
    resourceId: data.id,
    newValue: 'active',
    newValues: { owner_type: data.owner_type, school_id: data.school_id, label: data.label },
  });

  return NextResponse.json({ data }, { status: 201 });
}
