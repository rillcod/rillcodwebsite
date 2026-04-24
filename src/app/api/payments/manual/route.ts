import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

async function getCaller() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const admin = createAdminClient();
  const { data } = await admin.from('portal_users').select('id, role, school_id').eq('id', user.id).single();
  return data as { id: string; role: string; school_id: string | null } | null;
}

/**
 * POST /api/payments/manual
 * Records an offline/manual payment transaction (cash, POS, bank transfer, cheque).
 * Admin can post for any school. School role can only post for their own school.
 */
export async function POST(request: Request) {
  const caller = await getCaller();
  if (!caller || !['admin', 'school'].includes(caller.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const {
    school_id,
    amount,
    currency = 'NGN',
    payment_method,
    reference,
    notes,
    portal_user_id,
    invoice_id,
  } = body as {
    school_id?: string;
    amount?: number;
    currency?: string;
    payment_method?: string;
    reference?: string;
    notes?: string;
    portal_user_id?: string;
    invoice_id?: string;
  };

  if (!amount || !Number.isFinite(Number(amount)) || Number(amount) <= 0) {
    return NextResponse.json({ error: 'amount must be a positive number' }, { status: 400 });
  }

  const ALLOWED_METHODS = ['cash', 'pos', 'bank_transfer', 'cheque', 'mobile_money', 'other'];
  const method = String(payment_method || 'cash').toLowerCase();
  if (!ALLOWED_METHODS.includes(method)) {
    return NextResponse.json({ error: `payment_method must be one of: ${ALLOWED_METHODS.join(', ')}` }, { status: 400 });
  }

  // School role can only record for their own school
  const effectiveSchoolId = caller.role === 'admin'
    ? (school_id || caller.school_id)
    : caller.school_id;

  if (!effectiveSchoolId) {
    return NextResponse.json({ error: 'school_id required' }, { status: 400 });
  }

  const db = createAdminClient();
  const now = new Date().toISOString();
  const txRef = `MANUAL-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;

  const { data, error } = await db
    .from('payment_transactions')
    .insert({
      school_id: effectiveSchoolId,
      portal_user_id: portal_user_id || null,
      invoice_id: invoice_id || null,
      amount: Number(amount),
      currency: String(currency).toUpperCase(),
      payment_method: method,
      payment_status: 'completed',
      transaction_reference: reference?.trim() || txRef,
      paid_at: now,
      created_at: now,
      updated_at: now,
      payment_gateway_response: {
        manual: true,
        recorded_by: caller.id,
        recorded_at: now,
        notes: notes?.trim() || null,
      },
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // If linked to an invoice, mark it paid
  if (invoice_id) {
    await db
      .from('invoices')
      .update({ status: 'paid', updated_at: now })
      .eq('id', invoice_id)
      .in('status', ['sent', 'overdue', 'partially_paid']); // allow paying sent or overdue invoices
  }

  return NextResponse.json({ data }, { status: 201 });
}
