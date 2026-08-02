import { NextRequest, NextResponse } from 'next/server';
import { logAudit } from '@/lib/audit/log';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { roleHasCapability } from '@/lib/auth/capabilities';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// DELETE /api/receipts/[id] — admin-only withdrawal of an issued receipt.
// Preserves the receipt as financial evidence and clears the live transaction link.
// Requires a ?reason= query param for audit trail.
export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('portal_users')
    .select('role, full_name, email')
    .eq('id', user.id)
    .single();

  if (!roleHasCapability(profile?.role, 'manage_finance')) {
    return NextResponse.json({ error: 'Only finance administrators can withdraw receipts' }, { status: 403 });
  }

  const { id } = await context.params;
  const reason = String(req.nextUrl.searchParams.get('reason') || '').trim();
  if (!reason) return NextResponse.json({ error: 'A withdrawal reason is required' }, { status: 400 });
  const admin = adminClient();

  const { data: receipt, error } = await (admin as any).rpc('withdraw_receipt_atomic', {
    p_receipt_id: id,
    p_actor_id: user.id,
    p_reason: reason,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: /not found/i.test(error.message) ? 404 : 500 });

  const auditEntry = {
    receipt_id: id,
    receipt_number: (receipt as any).receipt_number,
    amount: (receipt as any).amount,
    currency: (receipt as any).currency,
    withdrawn_by_id: user.id,
    withdrawn_by_name: (profile as any)?.full_name ?? 'unknown',
    withdrawn_by_email: (profile as any)?.email ?? 'unknown',
    reason,
    withdrawn_at: new Date().toISOString(),
  };

  // Write to audit_logs table for queryable trail (standard helper)
  await logAudit(admin as any, {
    action: 'receipt_withdrawn',
    actorId: user.id,
    resourceType: 'receipt',
    resourceId: id,
    oldValue: 'issued',
    newValue: 'withdrawn',
    newValues: {
      summary: `Withdrew receipt ${(receipt as any).receipt_number} · Reason: ${reason}`,
      receipt_number: (receipt as any).receipt_number,
      amount: (receipt as any).amount,
      currency: (receipt as any).currency,
      reason,
      evidence_preserved: true,
    },
  });

  // Structured server log as secondary trail
  console.warn('[RECEIPT WITHDRAWN]', JSON.stringify(auditEntry));

  return NextResponse.json({ success: true, action: 'withdrawn', audit: { receipt_number: (receipt as any).receipt_number, reason }, effects: ['transaction_receipt_unlinked', 'receipt_preserved', 'audit_logged'] });
}
