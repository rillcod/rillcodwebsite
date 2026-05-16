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
export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('portal_users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Only admin can delete receipts' }, { status: 403 });
  }

  const { id } = await context.params;
  const admin = adminClient();

  // Fetch first so we can clean up the linked transaction
  const { data: receipt } = await admin
    .from('receipts')
    .select('id, transaction_id')
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

  return NextResponse.json({ success: true });
}
