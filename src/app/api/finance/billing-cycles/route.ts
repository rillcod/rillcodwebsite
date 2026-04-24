import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

async function getCaller() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from('portal_users').select('id, role, school_id').eq('id', user.id).single();
  return data as { id: string; role: string; school_id: string | null } | null;
}

async function teacherScopedSchoolIds(
  db: ReturnType<typeof createAdminClient>,
  teacherId: string,
  primarySchoolId: string | null,
) {
  const ids = new Set<string>();
  if (primarySchoolId) ids.add(primarySchoolId);
  const { data: ts } = await db.from('teacher_schools').select('school_id').eq('teacher_id', teacherId);
  (ts ?? []).forEach((r: { school_id: string | null }) => {
    if (r.school_id) ids.add(r.school_id);
  });
  const { data: cls } = await db.from('classes').select('school_id').eq('teacher_id', teacherId);
  (cls ?? []).forEach((r: { school_id: string | null }) => {
    if (r.school_id) ids.add(r.school_id);
  });
  return [...ids];
}

/**
 * GET /api/finance/billing-cycles?school_id=&subscription_id=&status=
 * Returns billing cycles with invoice + school info.
 */
export async function GET(request: Request) {
  const caller = await getCaller();
  if (!caller || !['admin', 'school', 'teacher'].includes(caller.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const subscription_id = searchParams.get('subscription_id');
  const status = searchParams.get('status');

  const db = createAdminClient();

  let q = db.from('billing_cycles')
    .select('*, invoices(id, invoice_number, status, amount), schools:schools!billing_cycles_school_id_fkey(name, rillcod_quota_percent), owner_schools:schools!billing_cycles_owner_school_id_fkey(name, rillcod_quota_percent)')
    .order('due_date', { ascending: false })
    .limit(200);

  if (caller.role === 'admin') {
    const param = searchParams.get('school_id');
    if (param) {
      q = q.or(`school_id.eq.${param},owner_school_id.eq.${param}`) as typeof q;
    }
  } else if (caller.role === 'school') {
    if (!caller.school_id) return NextResponse.json({ data: [] });
    const sid = caller.school_id;
    q = q.or(`school_id.eq.${sid},owner_school_id.eq.${sid}`) as typeof q;
  } else if (caller.role === 'teacher') {
    const ids = await teacherScopedSchoolIds(db, caller.id, caller.school_id);
    if (ids.length === 0) return NextResponse.json({ data: [] });
    const inList = ids.join(',');
    q = q.or(
      `school_id.in.(${inList}),owner_school_id.in.(${inList}),owner_user_id.eq.${caller.id}`,
    ) as typeof q;
  }
  if (subscription_id) q = q.eq('subscription_id', subscription_id) as typeof q;
  if (status) q = q.eq('status', status) as typeof q;

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

/**
 * PATCH /api/finance/billing-cycles — mark a billing cycle as paid/cancelled
 * Body: { id, status: 'paid' | 'cancelled' }
 */
export async function PATCH(request: Request) {
  const caller = await getCaller();
  if (!caller || caller.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const { id } = body as { id?: string };
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const allowedStatus = ['paid', 'cancelled', 'due', 'past_due', 'rolled_over'] as const;
  const allowedOwnerType = ['school', 'individual'] as const;
  const allowedCurrencies = ['NGN', 'USD'] as const;

  const updates: any = { updated_at: new Date().toISOString() };

  if (typeof body.term_label === 'string' && body.term_label.trim()) updates.term_label = body.term_label.trim();
  if (typeof body.term_start_date === 'string' && body.term_start_date) updates.term_start_date = body.term_start_date;
  if (typeof body.due_date === 'string' && body.due_date) updates.due_date = body.due_date;
  if (typeof body.amount_due === 'number' && Number.isFinite(body.amount_due)) updates.amount_due = body.amount_due;

  if (typeof body.currency === 'string') {
    const currency = body.currency.toUpperCase();
    if (!allowedCurrencies.includes(currency as (typeof allowedCurrencies)[number])) {
      return NextResponse.json({ error: 'Invalid currency' }, { status: 400 });
    }
    updates.currency = currency;
  }

  if (typeof body.status === 'string') {
    if (!allowedStatus.includes(body.status as (typeof allowedStatus)[number])) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }
    updates.status = body.status;
  }

  if (typeof body.owner_type === 'string') {
    if (!allowedOwnerType.includes(body.owner_type as (typeof allowedOwnerType)[number])) {
      return NextResponse.json({ error: 'Invalid owner_type' }, { status: 400 });
    }
    updates.owner_type = body.owner_type;
    if (body.owner_type === 'school') {
      if (!body.owner_school_id) {
        return NextResponse.json({ error: 'owner_school_id required for school owner' }, { status: 400 });
      }
      updates.owner_school_id = body.owner_school_id;
      updates.school_id = body.owner_school_id;
      updates.owner_user_id = null;
    } else {
      if (!body.owner_user_id) {
        return NextResponse.json({ error: 'owner_user_id required for individual owner' }, { status: 400 });
      }
      updates.owner_user_id = body.owner_user_id;
      updates.owner_school_id = null;
      updates.school_id = null;
    }
  }

  if (Object.keys(updates).length === 1) {
    return NextResponse.json({ error: 'No editable fields provided' }, { status: 400 });
  }

  const db = createAdminClient();
  const { data, error } = await db.from('billing_cycles')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

/**
 * POST /api/finance/billing-cycles — create billing cycle
 */
export async function POST(request: Request) {
  const caller = await getCaller();
  if (!caller || caller.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const owner_type = String(body.owner_type || '').trim();
  const term_label = String(body.term_label || '').trim();
  const term_start_date = String(body.term_start_date || '').trim();
  const due_date = String(body.due_date || '').trim();
  const currency = String(body.currency || 'NGN').toUpperCase();
  const status = String(body.status || 'due').trim();
  const amount_due = Number(body.amount_due);

  if (!['school', 'individual'].includes(owner_type)) {
    return NextResponse.json({ error: 'owner_type must be school or individual' }, { status: 400 });
  }
  if (!term_label || !term_start_date || !due_date || !Number.isFinite(amount_due)) {
    return NextResponse.json({ error: 'term_label, term_start_date, due_date, amount_due are required' }, { status: 400 });
  }
  if (!['NGN', 'USD'].includes(currency)) {
    return NextResponse.json({ error: 'currency must be NGN or USD' }, { status: 400 });
  }
  if (!['due', 'past_due', 'paid', 'cancelled', 'rolled_over'].includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }

  const owner_school_id = owner_type === 'school' ? String(body.owner_school_id || '').trim() : null;
  const owner_user_id = owner_type === 'individual' ? String(body.owner_user_id || '').trim() : null;
  if (owner_type === 'school' && !owner_school_id) {
    return NextResponse.json({ error: 'owner_school_id required for school owner' }, { status: 400 });
  }
  if (owner_type === 'individual' && !owner_user_id) {
    return NextResponse.json({ error: 'owner_user_id required for individual owner' }, { status: 400 });
  }

  const db = createAdminClient();
  const now = new Date().toISOString();
  const insertPayload = {
    owner_type,
    owner_school_id: owner_type === 'school' ? owner_school_id : null,
    owner_user_id: owner_type === 'individual' ? owner_user_id : null,
    school_id: owner_type === 'school' ? owner_school_id : null,
    term_label,
    term_start_date,
    due_date,
    amount_due,
    currency,
    status,
    items: Array.isArray(body.items) ? body.items : [],
    created_at: now,
    updated_at: now,
  };

  const { data, error } = await db.from('billing_cycles').insert(insertPayload).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Auto-generate linked invoice for this cycle (school or individual).
  const invoiceInsert: Record<string, unknown> = {
    invoice_number: `BCY-${Date.now().toString(36).toUpperCase()}`,
    school_id: owner_type === 'school' ? owner_school_id : null,
    portal_user_id: owner_type === 'individual' ? owner_user_id : null,
    amount: amount_due,
    currency,
    due_date,
    status: status === 'paid' ? 'paid' : 'sent',
    stream: owner_type === 'school' ? 'school' : 'individual',
    billing_cycle_id: data.id,
    notes: `Auto-generated from billing cycle: ${term_label}`,
    items: Array.isArray(body.items) ? body.items : [],
  };
  const { data: invoice, error: invoiceErr } = await db
    .from('invoices')
    .insert(invoiceInsert as any)
    .select('id, invoice_number, status')
    .single();
  if (invoiceErr) {
    return NextResponse.json(
      { error: `Billing cycle created but invoice generation failed: ${invoiceErr.message}`, data },
      { status: 500 },
    );
  }

  await db
    .from('billing_cycles')
    .update({ invoice_id: invoice.id, updated_at: new Date().toISOString() })
    .eq('id', data.id);

  return NextResponse.json({ data: { ...data, invoice_id: invoice.id }, invoice }, { status: 201 });
}

/**
 * DELETE /api/finance/billing-cycles — delete a cancelled/rolled_over cycle (admin only).
 * Body: { id }
 */
export async function DELETE(request: Request) {
  const caller = await getCaller();
  if (!caller || caller.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const { id } = body as { id?: string };
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const db = createAdminClient();
  const { data: existing } = await db.from('billing_cycles').select('status').eq('id', id).single();
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Safety: only allow deleting cancelled or rolled_over cycles
  if (!['cancelled', 'rolled_over'].includes(existing.status)) {
    return NextResponse.json(
      { error: 'Only cancelled or rolled-over cycles can be deleted. Cancel it first.' },
      { status: 400 },
    );
  }

  const { error } = await db.from('billing_cycles').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
