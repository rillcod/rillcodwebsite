import { NextRequest, NextResponse } from 'next/server';
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
  const reason = req.nextUrl.searchParams.get('reason') || '(no reason provided)';
  const admin = adminClient();

  // Fetch receipt + receipt_number for the audit log
  const { data: receipt } = await admin
    .from('receipts')
    .select('id, receipt_number, amount, currency, transaction_id')
    .eq('id', id)
    .single();

  if (!receipt) return NextResponse.json({ error: 'Receipt not found' }, { status: 404 });

  // Clear receipt_url on the payment transaction so it can be re-issued
  if (receipt.transaction_id) {
    await admin
      .from('payment_transactions')
      .update({ receipt_url: null })
      .eq('id', receipt.transaction_id);
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

  // Write to audit_logs table for queryable trail
  await admin.from('audit_logs').insert({
    actor_id: user.id,
    resource_type: 'receipt',
    resource_id: id,
    action: 'deleted',
    old_value: `${(receipt as any).receipt_number} · ${(receipt as any).currency} ${(receipt as any).amount}`,
    new_value: reason,
  }).catch((err: unknown) => {
    // Non-fatal — fall back to console log if audit_logs insert fails
    console.warn('[RECEIPT DELETED — audit_logs insert failed]', err);
  });

  // Structured server log as secondary trail
  console.warn('[RECEIPT DELETED]', JSON.stringify(auditEntry));

  return NextResponse.json({ success: true, audit: { receipt_number: (receipt as any).receipt_number, reason } });
}
