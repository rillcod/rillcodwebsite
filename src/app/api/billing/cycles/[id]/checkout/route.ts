import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { env } from '@/config/env';
import { paystackInitializeMinorUnits } from '@/lib/payments/paystack-amounts';

async function getCaller() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const db = createAdminClient();
  const { data } = await db.from('portal_users').select('id, email, role, school_id, full_name').eq('id', user.id).single();
  return data as { id: string; email: string; role: string; school_id: string | null; full_name: string | null } | null;
}

function calculatePaystackTotal(target: number): number {
  const targetWithBuffer = target + 50;
  const rate = 0.016;
  const divisor = 1 - rate;
  let total = 0;
  if (targetWithBuffer < 2500 * divisor) {
    total = targetWithBuffer / divisor;
  } else if (targetWithBuffer < 125000) {
    total = (targetWithBuffer + 100) / divisor;
  } else {
    total = targetWithBuffer + 2000;
  }
  return Math.ceil(total);
}

export async function POST(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const caller = await getCaller();
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['school', 'admin'].includes(caller.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (!env.PAYSTACK_SECRET_KEY) {
    return NextResponse.json({ error: 'Paystack not configured' }, { status: 500 });
  }

  const { id } = await context.params;
  const db = createAdminClient();

  const { data: cycle, error: cycleErr } = await db
    .from('billing_cycles')
    .select('id, amount_due, currency, status, owner_school_id, school_id, invoice_id, term_label')
    .eq('id', id)
    .single();

  if (cycleErr || !cycle) return NextResponse.json({ error: 'Billing cycle not found' }, { status: 404 });
  if (!['due', 'past_due'].includes(cycle.status)) {
    return NextResponse.json({ error: 'Only due or past-due cycles can be paid' }, { status: 400 });
  }

  // Scope check: school can only pay their own cycles
  if (caller.role === 'school') {
    const schoolId = caller.school_id;
    if (!schoolId || (cycle.school_id !== schoolId && cycle.owner_school_id !== schoolId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  const amount = Number(cycle.amount_due ?? 0);
  if (amount <= 0) return NextResponse.json({ error: 'Invalid cycle amount' }, { status: 400 });

  const currency = (cycle.currency || 'NGN').toUpperCase();
  let amountMinor: number;
  let payCurrency: 'NGN' | 'USD';
  try {
    const minor = paystackInitializeMinorUnits(amount, currency, calculatePaystackTotal);
    amountMinor = minor.amountMinor;
    payCurrency = minor.currency;
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Invalid currency' }, { status: 400 });
  }

  const reference = `BCY-${Date.now()}-${caller.id.substring(0, 5)}`;
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  const initBody: Record<string, unknown> = {
    email: caller.email || 'user@rillcod.com',
    amount: amountMinor,
    reference,
    callback_url: `${baseUrl}/dashboard/finance?tab=billing_cycles&payment=success&ref=${reference}`,
    metadata: {
      userId: caller.id,
      payment_type: 'billing_cycle',
      billingCycleId: id,
      billing_cycle_id: id,
      invoiceId: cycle.invoice_id || null,
      invoice_id: cycle.invoice_id || null,
      termLabel: cycle.term_label || '',
      term_label: cycle.term_label || '',
      originalAmount: amount,
      currency: payCurrency,
    },
  };
  if (payCurrency !== 'NGN') initBody.currency = payCurrency;

  const resp = await fetch('https://api.paystack.co/transaction/initialize', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(initBody),
  });

  const psk = await resp.json();
  if (!psk.status) {
    return NextResponse.json({ error: psk.message || 'Paystack error' }, { status: 502 });
  }

  // Record pending transaction
  const totalAmount = payCurrency === 'NGN' ? calculatePaystackTotal(amount) : Math.round(amount * 100) / 100;
  await db.from('payment_transactions').insert([{
    school_id: cycle.school_id || cycle.owner_school_id || null,
    portal_user_id: caller.id,
    invoice_id: cycle.invoice_id || null,
    amount: totalAmount,
    currency: payCurrency,
    payment_method: 'paystack',
    payment_status: 'pending',
    transaction_reference: reference,
    external_transaction_id: psk.data.reference,
    payment_gateway_response: {
      payment_type: 'billing_cycle',
      billing_cycle_id: id,
      invoice_id: cycle.invoice_id || null,
      term_label: cycle.term_label || '',
      initiated_by_role: caller.role,
    },
    created_at: new Date().toISOString(),
  }]);

  return NextResponse.json({ success: true, url: psk.data.authorization_url, reference });
}
