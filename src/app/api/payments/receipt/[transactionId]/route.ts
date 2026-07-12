import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { issueReceiptForTransaction } from '@/lib/finance/issue';
import { getParentLinkScope } from '@/lib/parents/links';
import { getTeacherSchoolIds } from '@/lib/auth-utils';

/**
 * POST /api/payments/receipt/[transactionId]
 * Generates (or returns cached) a PDF receipt for a completed payment (NF-10).
 * Returns the PDF as an attachment or a redirect to the stored URL.
 */
export async function POST(
  _req: NextRequest,
  context: { params: Promise<{ transactionId: string }> },
) {
  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { transactionId } = await context.params;
  const db = createAdminClient();

  // Fetch transaction with school + portal_user
  const { data: tx } = await db
    .from('payment_transactions')
    .select('id, payment_status, school_id, portal_user_id, receipt_url')
    .eq('id', transactionId)
    .single();

  if (!tx) return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
  if (tx.payment_status !== 'completed') {
    return NextResponse.json({ error: 'Receipt only available for completed payments' }, { status: 400 });
  }

  // NF-10.5 — verify the requester belongs to the transaction's school or is the portal_user
  const { data: profile } = await db
    .from('portal_users')
    .select('role, school_id, email')
    .eq('id', user.id)
    .single();

  const isOwner = tx.portal_user_id === user.id;
  const schoolIds = profile?.role === 'teacher' || profile?.role === 'school'
    ? await getTeacherSchoolIds(user.id, profile.school_id)
    : [];
  const isSameSchool = !!tx.school_id && schoolIds.includes(tx.school_id);
  const isAdmin = profile?.role === 'admin';
  let isLinkedParent = false;
  if (profile?.role === 'parent' && tx.portal_user_id) {
    const { studentUserIds } = await getParentLinkScope(db as any, { id: user.id, email: profile.email || undefined });
    isLinkedParent = studentUserIds.includes(tx.portal_user_id);
  }

  if (!isOwner && !isSameSchool && !isAdmin && !isLinkedParent) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Allow ?force=1 to re-issue after a template or data correction.
  const force = new URL(_req.url).searchParams.get('force') === '1';

  if ((tx as any).receipt_url && !force) {
    return NextResponse.json({ url: (tx as any).receipt_url, cached: true });
  }

  try {
    const res = await issueReceiptForTransaction(transactionId);
    return NextResponse.json({
      url: res.url,
      stream: res.stream,
      receipt_number: res.receiptNumber,
      cached: false,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to generate receipt' }, { status: 500 });
  }
}
