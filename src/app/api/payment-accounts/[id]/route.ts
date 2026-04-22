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

async function canEditAccount(
  caller: { role: string; school_id: string | null },
  accountId: string,
) {
  if (caller.role === 'admin') return { allowed: true as const };
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
  // Schools cannot change ownership
  if (caller.role === 'school') {
    delete body.owner_type;
    delete body.school_id;
  }

  const admin = adminClient();
  const { data, error } = await admin
    .from('payment_accounts')
    .update(body)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
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
  const { error } = await admin.from('payment_accounts').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
