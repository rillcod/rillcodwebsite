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

async function canEditAccount(
  caller: { role: string; school_id: string | null },
  accountId: string,
) {
  if (caller.role === 'admin') return { allowed: true as const };
  if (!roleHasCapability(caller.role, 'manage_school_payment_settings')) return { allowed: false as const, reason: 'Forbidden' };
  if (caller.role !== 'school') return { allowed: false as const, reason: 'Forbidden' };
  const admin = adminClient();
  const { data, error } = await admin
    .from('payment_accounts')
    .select('id, owner_type, school_id')
    .eq('id', accountId)
    .single();
  if (error || !data) return { allowed: false as const, reason: 'Account not found' };
  if (data.owner_type !== 'school' || data.school_id !== caller.school_id) {
    return { allowed: false as const, reason: 'This account is not yours' };
  }
  return { allowed: true as const };
}

// PATCH /api/payment-accounts/[id] — update
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const caller = await getCaller();
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await context.params;
  const guard = await canEditAccount(caller as { role: string; school_id: string | null }, id);
  if (!guard.allowed) return NextResponse.json({ error: guard.reason }, { status: 403 });

  const body = await request.json();
  const update: Record<string, unknown> = {};
  for (const field of ['label', 'bank_name', 'account_number', 'account_name', 'account_type', 'payment_note', 'is_active']) {
    if (body[field] !== undefined) update[field] = body[field];
  }
  if (caller.role === 'admin' && (body.owner_type === 'school' || body.owner_type === 'rillcod')) {
    update.owner_type = body.owner_type;
    update.school_id = body.owner_type === 'school' ? body.school_id || null : null;
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
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logAudit(admin as any, {
    action: 'update_payment_account',
    actorId: caller.id,
    resourceType: 'payment_account',
    resourceId: id,
    newValue: data.is_active ? 'active' : 'inactive',
    newValues: { owner_type: data.owner_type, school_id: data.school_id, label: data.label },
  });

  return NextResponse.json({ data });
}

// DELETE /api/payment-accounts/[id] — delete
export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const caller = await getCaller();
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await context.params;
  const guard = await canEditAccount(caller as { role: string; school_id: string | null }, id);
  if (!guard.allowed) return NextResponse.json({ error: guard.reason }, { status: 403 });

  const admin = adminClient();
  const { data, error } = await admin
    .from('payment_accounts')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id, label')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logAudit(admin as any, {
    action: 'deactivate_payment_account',
    actorId: caller.id,
    resourceType: 'payment_account',
    resourceId: id,
    oldValue: 'active',
    newValue: 'inactive',
    newValues: { label: data.label, record_preserved: true },
  });
  return NextResponse.json({ success: true, action: 'deactivated' });
}
