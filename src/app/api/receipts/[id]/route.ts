import { NextRequest, NextResponse } from 'next/server';
import { logAudit } from '@/lib/audit/log';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// DELETE /api/receipts/[id] — admin-only hard delete of a receipt record.
// Removes the receipts row and clears receipt_url on the linked transaction.
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

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Only admin can delete receipts' }, { status: 403 });
  }

  const { id } = await context.params;
  const reason = String(req.nextUrl.searchParams.get('reason') || '').trim();
  if (!reason) return NextResponse.json({ error: 'A deletion reason is required' }, { status: 400 });
  const admin = adminClient();

  // Fetch receipt + receipt_number for the audit log
  const { data: receipt, error: receiptError } = await admin
    .from('receipts')
    .select('id, receipt_number, amount, currency, transaction_id')
    .eq('id', id)
    .single();

  if (receiptError) return NextResponse.json({ error: receiptError.message }, { status: 500 });
  if (!receipt) return NextResponse.json({ error: 'Receipt not found' }, { status: 404 });

  // Clear receipt_url on the payment transaction so it can be re-issued
  if (receipt.transaction_id) {
    const { error: unlinkError } = await admin
      .from('payment_transactions')
      .update({ receipt_url: null })
      .eq('id', receipt.transaction_id);
    if (unlinkError) return NextResponse.json({ error: 'Receipt could not be unlinked from its transaction', detail: unlinkError.message }, { status: 500 });
  }

  const { error } = await admin.from('receipts').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const auditEntry = {
    receipt_id: id,
    receipt_number: (receipt as any).receipt_number,
    amount: (receipt as any).amount,
    currency: (receipt as any).currency,
    deleted_by_id: user.id,
    deleted_by_name: (profile as any)?.full_name ?? 'unknown',
    deleted_by_email: (profile as any)?.email ?? 'unknown',
    reason,
    deleted_at: new Date().toISOString(),
  };

  // Write to audit_logs table for queryable trail (standard helper)
  await logAudit(admin as any, {
    action: 'delete_receipt',
    actorId: user.id,
    resourceType: 'receipt',
    resourceId: id,
    oldValue: `${(receipt as any).receipt_number} · ${(receipt as any).currency} ${(receipt as any).amount}`,
    newValue: reason,
  });

  // Structured server log as secondary trail
  console.warn('[RECEIPT DELETED]', JSON.stringify(auditEntry));

  return NextResponse.json({ success: true, audit: { receipt_number: (receipt as any).receipt_number, reason }, effects: ['transaction_receipt_unlinked', 'receipt_deleted', 'audit_logged'] });
}
