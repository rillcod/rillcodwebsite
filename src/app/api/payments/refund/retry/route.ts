import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { env } from '@/config/env';
import { logAudit } from '@/lib/audit/log';
import { denyIfMissingCapability } from '@/lib/auth/capabilities';

export async function POST(request: Request) {
  try {
    const auth = await createClient();
    const { data: { user } } = await auth.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const db = createAdminClient();
    const { data: caller } = await db.from('portal_users').select('id, role').eq('id', user.id).maybeSingle();
    const denied = denyIfMissingCapability(caller?.role, 'manage_finance');
    if (!caller || denied) {
      return NextResponse.json(
        { error: denied?.error ?? 'You do not have permission to perform this action.' },
        { status: 403 },
      );
    }
    if (!env.PAYSTACK_SECRET_KEY) return NextResponse.json({ error: 'Paystack is not configured' }, { status: 503 });
    const body = await request.json().catch(() => ({}));
    const transactionId = String(body.transaction_id || '').trim();
    const accountNumber = String(body.account_number || '').replace(/\s/g, '');
    const bankId = Number(body.bank_id);
    if (!transactionId || !/^\d{10}$/.test(accountNumber) || !Number.isInteger(bankId) || bankId <= 0) return NextResponse.json({ error: 'transaction_id, a 10-digit account_number, and numeric bank_id are required' }, { status: 400 });
    const { data: transaction, error: lookupError } = await db.from('payment_transactions').select('id, currency, payment_gateway_response').eq('id', transactionId).maybeSingle();
    if (lookupError) return NextResponse.json({ error: lookupError.message }, { status: 500 });
    if (!transaction) return NextResponse.json({ error: 'Payment transaction not found' }, { status: 404 });
    const gateway = transaction.payment_gateway_response && typeof transaction.payment_gateway_response === 'object' && !Array.isArray(transaction.payment_gateway_response) ? transaction.payment_gateway_response as Record<string, any> : {};
    const refund = gateway.refund || {};
    if (refund.provider !== 'paystack' || !refund.id || !['needs-attention', 'needs_attention', 'failed'].includes(String(refund.status || '').toLowerCase())) return NextResponse.json({ error: 'This refund is not eligible for Paystack recovery' }, { status: 409 });
    const response = await fetch(`https://api.paystack.co/refund/retry_with_customer_details/${encodeURIComponent(String(refund.id))}`, { method: 'POST', headers: { Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ refund_account_details: { currency: String(transaction.currency || 'NGN').toUpperCase(), account_number: accountNumber, bank_id: bankId } }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload?.status) return NextResponse.json({ error: payload?.message || 'Paystack refund recovery failed' }, { status: 502 });
    const now = new Date().toISOString();
    const { error: updateError } = await db.from('payment_transactions').update({ updated_at: now, payment_gateway_response: { ...gateway, refund: { ...refund, status: payload?.data?.status || 'pending', recovery_requested_at: now, recovery_requested_by: caller.id, recovery_response: payload?.data || null } } }).eq('id', transaction.id);
    if (updateError) return NextResponse.json({ error: `Paystack accepted recovery but tracking failed: ${updateError.message}` }, { status: 500 });
    await logAudit(db as any, { action: 'paystack_refund_recovery_requested', actorId: caller.id, resourceType: 'payment_transaction', resourceId: transaction.id, newValues: { refund_id: refund.id, bank_id: bankId } });
    return NextResponse.json({ success: true, status: payload?.data?.status || 'pending', message: 'Refund recovery details sent to Paystack' });
  } catch (error: any) { return NextResponse.json({ error: error?.message || 'Refund recovery failed' }, { status: 500 }); }
}