import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { paymentsService } from '@/services/payments.service';
import { logAudit } from '@/lib/audit/log';
import { denyIfMissingCapability } from '@/lib/auth/capabilities';

export async function POST(request: Request) {
  try {
    const auth = await createClient();
    const { data: { user } } = await auth.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const admin = createAdminClient();
    const { data: caller } = await admin.from('portal_users').select('id, role').eq('id', user.id).maybeSingle();
    const denied = denyIfMissingCapability(caller?.role, 'manage_finance');
    if (!caller || denied) {
      return NextResponse.json(
        { error: denied?.error ?? 'You do not have permission to perform this action.' },
        { status: 403 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const transactionId = String(body.transaction_id || '').trim();
    const reason = String(body.reason || '').trim();
    if (!transactionId) return NextResponse.json({ error: 'transaction_id is required' }, { status: 400 });
    if (reason.length < 3) return NextResponse.json({ error: 'A refund reason is required' }, { status: 400 });

    const result = await paymentsService.processRefund(transactionId, reason, caller.id);
    await logAudit(admin as any, {
      action: result.status === 'refunded' ? 'payment_refunded' : 'payment_refund_requested',
      actorId: caller.id,
      resourceType: 'payment_transaction',
      resourceId: transactionId,
      newValues: { reason, status: result.status, result },
    });
    return NextResponse.json({ success: true, data: result });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Refund failed' }, { status: error?.statusCode || 500 });
  }
}
