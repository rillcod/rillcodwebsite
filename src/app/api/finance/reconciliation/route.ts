/**
 * GET /api/finance/reconciliation
 *
 * Admin-only audit endpoint backed by the `finance_ledger` view
 * (added in migration 20260422000000). Returns a row-per-transaction
 * join of payment_transactions ↔ invoices ↔ receipts enriched with
 * the stream label, so an admin can trivially eyeball
 *
 *   * missing receipts for completed payments
 *   * pending bank-transfer proofs
 *   * refunds without reason
 *   * stream mis-classifications
 *
 * Query params:
 *   stream   — 'school' | 'individual' (optional)
 *   status   — payment_status filter (optional)
 *   from, to — ISO dates (optional)
 *   limit    — default 200, max 1000
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';
import { splitSchoolAmount, DEFAULT_COMMISSION_RATE } from '@/lib/finance/streams';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function GET(request: NextRequest) {
  const supabase = await createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('portal_users')
    .select('role')
    .eq('id', user.id)
    .single();
  if (!profile || profile.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — admin only' }, { status: 403 });
  }

  const admin = adminClient();
  const { searchParams } = new URL(request.url);
  const stream = searchParams.get('stream');
  const status = searchParams.get('status');
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const limit = Math.min(parseInt(searchParams.get('limit') || '200', 10) || 200, 1000);

  let q = (admin as any)
    .from('finance_ledger')
    .select('*')
    .order('transacted_at', { ascending: false })
    .limit(limit);

  if (stream === 'school' || stream === 'individual') q = q.eq('stream', stream);
  if (status) q = q.eq('status', status);
  if (from) q = q.gte('transacted_at', from);
  if (to) q = q.lte('transacted_at', to);

  const { data, error: err } = await q;
  if (err) return NextResponse.json({ error: err.message }, { status: 500 });

  const rows = (data ?? []) as any[];

  // Health signals — computed server-side so the UI is stupid-simple.
  let totalPaid = 0;
  let totalSchool = 0;
  let totalIndividual = 0;
  let missingReceipts = 0;
  let pending = 0;
  let refunded = 0;
  let commissionRetained = 0;

  rows.forEach((r) => {
    const amt = Number(r.amount || 0);
    const isCompleted = (r.status || '').toLowerCase() === 'completed' || (r.status || '').toLowerCase() === 'paid';
    if (isCompleted) {
      totalPaid += amt;
      if (!r.receipt_id) missingReceipts += 1;
      if (r.stream === 'school') {
        totalSchool += amt;
        commissionRetained += splitSchoolAmount(amt, DEFAULT_COMMISSION_RATE).rillcodRetain;
      }
      if (r.stream === 'individual') totalIndividual += amt;
    }
    if ((r.status || '').toLowerCase() === 'pending' || (r.status || '').toLowerCase() === 'processing') pending += 1;
    if ((r.status || '').toLowerCase() === 'refunded') refunded += 1;
  });

  return NextResponse.json({
    data: rows,
    summary: {
      count: rows.length,
      totalPaid,
      totalSchool,
      totalIndividual,
      commissionRetained,
      missingReceipts,
      pending,
      refunded,
    },
  });
}

// DELETE /api/finance/reconciliation?id=<transaction_id>
// Admin only — hard-deletes a payment_transaction row to resolve contradicting ledger entries.
export async function DELETE(request: NextRequest) {
  const supabase = await createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('portal_users')
    .select('role')
    .eq('id', user.id)
    .single();
  if (!profile || profile.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — admin only' }, { status: 403 });
  }

  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const admin = adminClient();
  const { error: delErr } = await admin
    .from('payment_transactions')
    .delete()
    .eq('id', id);

  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
