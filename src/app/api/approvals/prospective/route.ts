import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { onboardSummerStudent, sendSummerCredentials } from '@/lib/summer-school/onboard';

export const dynamic = 'force-dynamic';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

type Caller = { role: string; id: string; school_id: string | null };

async function getCaller(): Promise<Caller | null> {
  const supabase = await createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  const { data: caller } = await adminClient()
    .from('portal_users').select('role, id, school_id').eq('id', user.id).single();
  if (!caller || !['admin', 'teacher', 'school'].includes(caller.role)) return null;
  return caller as Caller;
}

// POST /api/approvals/prospective
// Body: { id: string; action: 'approved' | 'rejected' }
// School boundary: non-admin callers can only action records from their own school.
export async function POST(request: NextRequest) {
  try {
    const caller = await getCaller();
    if (!caller) return NextResponse.json({ error: 'Staff access required' }, { status: 403 });

    const { id, action } = await request.json();
    if (!id || !['approved', 'rejected'].includes(action)) {
      return NextResponse.json({ error: 'id and valid action required' }, { status: 400 });
    }

    const admin = adminClient();

    // Fetch the prospective student to check existence and school boundary
    const { data: record } = await admin
      .from('prospective_students')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (!record) return NextResponse.json({ error: 'Prospective student not found' }, { status: 404 });

    // School boundary: non-admin may only action records from their own school
    if (caller.role !== 'admin' && record.school_id && record.school_id !== caller.school_id) {
      return NextResponse.json(
        { error: 'Access denied: this record belongs to a different school' },
        { status: 403 },
      );
    }

    if (action === 'rejected') {
      const { error } = await admin
        .from('prospective_students')
        .update({ is_deleted: true, is_active: false })
        .eq('id', id);

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true });
    }

    // ── Approval path ──
    if (record.status === 'unpaid') {
      return NextResponse.json(
        { error: 'Cannot approve: applicant has not completed online payment. Reject the record or ask them to finish checkout.' },
        { status: 400 },
      );
    }

    if (!record.parent_email && !record.email) {
      return NextResponse.json({ error: 'Applicant has no email to create an account' }, { status: 400 });
    }

    const isInstallmentPlan = (record.notes || '').includes('[Plan: installment]');

    // Shared onboarding — parent + student accounts, linking, enrolment, archive.
    const onboard = await onboardSummerStudent(admin, record as any, { approvedBy: caller.id });
    const authUserId = onboard.student.id;
    const resolvedSchoolName = onboard.schoolName;

    // Mark prospective student active
    const { error: prospectiveErr } = await admin
      .from('prospective_students')
      .update({
        is_active: true,
        status: isInstallmentPlan ? 'partially_paid' : 'paid',
      })
      .eq('id', id);

    if (prospectiveErr) {
      console.error('Failed to update prospective_students row status:', prospectiveErr);
    }

    // Sync to CRM Contact Book
    try {
      const { harnessProspectToContactBook } = await import('@/lib/crm/sync-prospect');
      await harnessProspectToContactBook(id, authUserId);
    } catch (syncErr) {
      console.error('Failed to sync approved summer student to CRM contact book:', syncErr);
    }

    // Send receipt email for the tuition payment
    try {
      const { data: txRecord } = await admin
        .from('payment_transactions')
        .select('amount, transaction_reference, payment_method, paid_at, created_at')
        .contains('payment_gateway_response', { prospect_id: id })
        .in('payment_status', ['completed', 'success'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (txRecord) {
        const { notificationsService } = await import('@/services/notifications.service');
        const { buildReceiptHTML } = await import('@/lib/finance/templates/html/receipt-html');
        const amt = Number(txRecord.amount) || 0;
        const docRef = txRecord.transaction_reference || `SUM-${id.slice(0, 8).toUpperCase()}`;
        const now = new Date();
        const dateStr = now.toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' });
        const paidStr = txRecord.paid_at || txRecord.created_at
          ? new Date(txRecord.paid_at || txRecord.created_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })
          : dateStr;
        const receiptHtml = buildReceiptHTML({
          docRef,
          dateStr,
          payDateStr: paidStr,
          payerLabel: record.parent_name || record.full_name,
          payerType: 'student',
          paymentMethod: txRecord.payment_method || 'online',
          receivedBy: 'Rillcod Technologies',
          items: [{ description: `Summer School 2026 Tuition — ${record.full_name}`, quantity: 1, unit_price: amt }],
          totalAmount: amt,
          payToAcc: null,
          notes: `Applicant: ${record.full_name}. School: ${resolvedSchoolName}. Reference: ${docRef}`,
        });
        await notificationsService.sendExternalEmail({
          to: (record.parent_email || record.email)!.trim().toLowerCase(),
          subject: `Payment Receipt — Summer School 2026 | Rillcod Technologies`,
          html: receiptHtml,
          fromName: 'Rillcod Technologies',
          fromEmail: 'support@rillcod.com',
        });
      }
    } catch (receiptMailErr) {
      console.error('Failed to send receipt email on prospective approval:', receiptMailErr);
    }

    // Send parent + student login credentials to the parent (email always;
    // WhatsApp if opted in). The parent receives BOTH logins so they can sign in.
    try {
      await sendSummerCredentials(onboard, record as any);
    } catch (mailErr) {
      console.error('Failed to send onboarding credentials on manual approval:', mailErr);
    }

    return NextResponse.json({
      success: true,
      credentials: {
        parent: onboard.parent ? { email: onboard.parent.email, password: onboard.parent.password } : null,
        student: { email: onboard.student.email, password: onboard.student.password },
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unexpected error' }, { status: 500 });
  }
}

