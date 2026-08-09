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
  const { data: profile, error: profileError } = await supabase
    .from('portal_users')
    .select('id, role, school_id')
    .eq('id', user.id)
    .single();
  if (profileError) return null;
  return profile ?? null;
}

type EditableAccount = {
  id: string;
  owner_type: string;
  school_id: string | null;
  label: string;
  bank_name: string;
  account_number: string;
  account_name: string;
  account_type: string;
  payment_note: string | null;
  is_active: boolean;
};

async function loadEditableAccount(
  caller: { role: string; school_id: string | null },
  accountId: string,
): Promise<
  | { allowed: true; account: EditableAccount }
  | { allowed: false; reason: string; status: number }
> {
  if (caller.role !== 'admin' && !roleHasCapability(caller.role, 'manage_school_payment_settings')) {
    return { allowed: false, reason: 'Forbidden', status: 403 };
  }
  const admin = adminClient();
  const { data, error } = await admin
    .from('payment_accounts')
    .select('id, owner_type, school_id, label, bank_name, account_number, account_name, account_type, payment_note, is_active')
    .eq('id', accountId)
    .maybeSingle();
  if (error) return { allowed: false, reason: error.message, status: 500 };
  if (!data) return { allowed: false, reason: 'Account not found', status: 404 };
  if (caller.role === 'admin') return { allowed: true, account: data as EditableAccount };
  if (caller.role !== 'school' || data.owner_type !== 'school' || data.school_id !== caller.school_id) {
    return { allowed: false, reason: 'This account is not yours', status: 403 };
  }
  return { allowed: true, account: data as EditableAccount };
}

// PATCH /api/payment-accounts/[id] - update
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const caller = await getCaller();
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await context.params;
  const guard = await loadEditableAccount(caller, id);
  if (!guard.allowed) return NextResponse.json({ error: guard.reason }, { status: guard.status });

  const body = await request.json().catch(() => null);
  const parsed = parsePaymentAccountInput(body, { partial: true });
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const raw = body as Record<string, unknown>;
  const update: Record<string, unknown> = { ...parsed.value };
  const ownershipWasSupplied = raw.owner_type !== undefined || raw.school_id !== undefined;

  if (caller.role === 'admin' && ownershipWasSupplied) {
    const ownerType = raw.owner_type === undefined
      ? guard.account.owner_type
      : String(raw.owner_type);
    if (!['rillcod', 'school'].includes(ownerType)) {
      return NextResponse.json({ error: 'owner_type must be rillcod or school' }, { status: 400 });
    }
    const schoolId = ownerType === 'school'
      ? String(raw.school_id ?? guard.account.school_id ?? '').trim()
      : null;
    if (ownerType === 'school' && !schoolId) {
      return NextResponse.json({ error: 'school_id is required for a school account' }, { status: 400 });
    }
    if (schoolId) {
      const admin = adminClient();
      const { data: school, error: schoolError } = await admin
        .from('schools')
        .select('id')
        .eq('id', schoolId)
        .maybeSingle();
      if (schoolError) return NextResponse.json({ error: schoolError.message }, { status: 500 });
      if (!school) return NextResponse.json({ error: 'School not found' }, { status: 404 });
    }
    update.owner_type = ownerType;
    update.school_id = schoolId;
  } else if (caller.role === 'school' && ownershipWasSupplied) {
    if (raw.owner_type !== 'school' || raw.school_id !== caller.school_id) {
      return NextResponse.json({ error: 'Payment account ownership cannot be reassigned' }, { status: 403 });
    }
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No supported account changes supplied' }, { status: 400 });
  }
  update.updated_at = new Date().toISOString();

  const admin = adminClient();
  const { data, error } = await admin
    .from('payment_accounts')
    .update(update)
    .eq('id', id)
    .select()
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Payment account was not changed' }, { status: 409 });
  await logAudit(admin as any, {
    action: 'update_payment_account',
    actorId: caller.id,
    resourceType: 'payment_account',
    resourceId: id,
    tableName: 'payment_accounts',
    oldValue: guard.account.is_active ? 'active' : 'inactive',
    newValue: data.is_active ? 'active' : 'inactive',
    oldValues: guard.account,
    newValues: {
      owner_type: data.owner_type,
      school_id: data.school_id,
      label: data.label,
      bank_name: data.bank_name,
      account_number: data.account_number,
      account_name: data.account_name,
      account_type: data.account_type,
      payment_note: data.payment_note,
      is_active: data.is_active,
    },
  });

  return NextResponse.json({ data });
}

// DELETE /api/payment-accounts/[id] - deactivate while preserving history
export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const caller = await getCaller();
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await context.params;
  const guard = await loadEditableAccount(caller, id);
  if (!guard.allowed) return NextResponse.json({ error: guard.reason }, { status: guard.status });
  if (!guard.account.is_active) {
    return NextResponse.json({ success: true, action: 'already_deactivated' });
  }

  const admin = adminClient();
  const { data, error } = await admin
    .from('payment_accounts')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('is_active', true)
    .select('id, label')
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Payment account was not deactivated' }, { status: 409 });
  await logAudit(admin as any, {
    action: 'deactivate_payment_account',
    actorId: caller.id,
    resourceType: 'payment_account',
    resourceId: id,
    tableName: 'payment_accounts',
    oldValue: 'active',
    newValue: 'inactive',
    oldValues: guard.account,
    newValues: { label: data.label, is_active: false, record_preserved: true },
  });
  return NextResponse.json({ success: true, action: 'deactivated' });
}
