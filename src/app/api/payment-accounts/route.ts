import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { roleHasCapability } from '@/lib/auth/capabilities';
import { logAudit } from '@/lib/audit/log';

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
    query = query.or(
      `owner_type.eq.rillcod,and(owner_type.eq.school,school_id.eq.${caller.school_id})`,
    );
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
  const ownerType = caller.role === 'school'
    ? 'school'
    : body.owner_type === 'school' ? 'school' : 'rillcod';
  const schoolId = ownerType === 'school'
    ? (caller.role === 'school' ? caller.school_id : body.school_id)
    : null;
  const required = ['label', 'bank_name', 'account_number', 'account_name'] as const;
  if (required.some((field) => !String(body[field] || '').trim())) {
    return NextResponse.json({ error: 'Label, bank, account number, and account name are required' }, { status: 400 });
  }
  if (ownerType === 'school' && !schoolId) {
    return NextResponse.json({ error: 'school_id is required for a school account' }, { status: 400 });
  }

  const payload = {
    owner_type: ownerType,
    school_id: schoolId,
    label: String(body.label).trim(),
    bank_name: String(body.bank_name).trim(),
    account_number: String(body.account_number).trim(),
    account_name: String(body.account_name).trim(),
    account_type: body.account_type === 'current' ? 'current' : 'savings',
    payment_note: body.payment_note ? String(body.payment_note).trim() : null,
    is_active: body.is_active !== false,
    created_by: caller.id,
  };


  const admin = adminClient();
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

  return NextResponse.json({ data });
}
