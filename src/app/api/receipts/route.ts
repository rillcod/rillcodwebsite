import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { classifyReceiptStream } from '@/lib/finance/streams';
import { getParentLinkScope } from '@/lib/parents/links';
import { issueReceiptForTransaction } from '@/lib/finance/issue';
import { logAudit } from '@/lib/audit/log';
import { roleHasCapability } from '@/lib/auth/capabilities';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function requireCaller() {
  const supabase = await createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  const { data: profile } = await supabase
    .from('portal_users')
    .select('id, role, school_id, email')
    .eq('id', user.id)
    .single();
  if (!profile) return null;
  return profile;
}

// GET /api/receipts — role-aware receipt listing.
// admin → all receipts (optionally scoped by ?school_id=)
// school → receipts for the caller's school_id
// teacher → receipts for the caller's school_id (partner schools' teachers)
// student/parent → only receipts issued to themselves (via student_id)
export async function GET(request: NextRequest) {
  const caller = await requireCaller();
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = adminClient();
  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get('limit') || '50');

  let query = admin
    .from('receipts')
    .select('*, portal_users!receipts_student_id_fkey(full_name, email), schools!receipts_school_id_fkey(name)')
    .order('issued_at', { ascending: false })
    .limit(limit);

  if (caller.role === 'admin') {
    const schoolIdParam = searchParams.get('school_id');
    if (schoolIdParam) query = query.eq('school_id', schoolIdParam);
  } else if (caller.role === 'school') {
    if (!caller.school_id) return NextResponse.json({ data: [] });
    // A receipt for a family payment shows what Rillcod charged that family — the
    // margin over what the school is billed. School accounts see only their own
    // settlement receipts. (Verified: every school-stream receipt carries a
    // school_id, so this hides nothing a school legitimately needs.)
    query = query.eq('school_id', caller.school_id).eq('stream', 'school');
  } else if (caller.role === 'teacher') {
    return NextResponse.json({ data: [] });
  } else if (caller.role === 'parent') {
    const { studentUserIds } = await getParentLinkScope(
      admin as any,
      { id: caller.id, email: (caller as any).email || undefined },
    );
    if (studentUserIds.length === 0) return NextResponse.json({ data: [] });
    query = query.in('student_id', studentUserIds);
  } else {
    // student: only their own receipts
    query = query.eq('student_id', caller.id);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

// POST /api/receipts - canonical issue/reissue wrapper.
// Official receipts can only originate from a completed payment transaction.
export async function POST(request: NextRequest) {
  const caller = await requireCaller();
  if (!caller || !roleHasCapability(caller.role, 'manage_finance')) {
    return NextResponse.json({ success: false, error: 'Forbidden', code: 'forbidden' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const transactionId = String(body.transaction_id || '').trim();
  if (!transactionId) return NextResponse.json({ success: false, error: 'transaction_id is required', code: 'validation' }, { status: 400 });

  const admin = adminClient();
  const { data: transaction, error: transactionError } = await admin
    .from('payment_transactions')
    .select('id, payment_status, school_id')
    .eq('id', transactionId)
    .maybeSingle();
  if (transactionError) return NextResponse.json({ success: false, error: transactionError.message, code: 'db_error' }, { status: 500 });
  if (!transaction) return NextResponse.json({ success: false, error: 'Transaction not found', code: 'not_found' }, { status: 404 });

  const status = String(transaction.payment_status || '').toLowerCase();
  if (!['completed', 'success', 'paid'].includes(status)) {
    return NextResponse.json({ success: false, error: 'Receipt can only be issued for a completed payment', code: 'invalid_transition' }, { status: 409 });
  }
  try {
    const receipt = await issueReceiptForTransaction(transactionId);
    await logAudit(admin as any, {
      action: 'receipt_issued',
      actorId: caller.id,
      resourceType: 'receipt',
      resourceId: transactionId,
      tableName: 'payment_transactions',
      newValue: receipt.receiptNumber || receipt.url,
      newValues: {
        transaction_id: transactionId,
        receipt_number: receipt.receiptNumber,
        stream: receipt.stream,
        url: receipt.url,
      },
    });
    return NextResponse.json({ success: true, data: { transaction_id: transactionId, url: receipt.url, receipt_number: receipt.receiptNumber, stream: receipt.stream }, effects: ['receipt_issued', 'transaction_receipt_linked'] });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Receipt issuance failed';
    return NextResponse.json({ success: false, error: message, code: 'internal' }, { status: 500 });
  }
}
