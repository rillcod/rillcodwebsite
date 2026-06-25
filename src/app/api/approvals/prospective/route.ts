import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { onboardSummerStudent, sendSummerCredentials } from '@/lib/summer-school/onboard';
import { getSummerProspectStatusForPayment } from '@/lib/registration/payment-state';

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

    // Guard against cross-contamination: this route summer-onboards (stamps
    // enrollment_type='summer_school' + "Summer School 2026"). Refuse non-summer
    // prospects (e.g. consent-form enquiries) so they aren't mislabeled — they are
    // onboarded through the Consent Forms flow instead.
    if (!/summer/i.test(record.course_interest || '')) {
      return NextResponse.json(
        { error: 'This applicant is not a Summer School prospect. Onboard them from Dashboard → Consent Forms (their flow assigns the correct programme).' },
        { status: 400 },
      );
    }

    const isInstallmentPlan = /\[Plan:\s*(installment|instalment)\]/i.test(record.notes || '');

    // Approving IS the payment confirmation (admin verified the bank transfer), so
    // mark the pending tuition transaction(s) completed BEFORE onboarding. This lets
    // the finance sync create the paid invoice and the welcome email attach the
    // receipt PDF — keeping transaction ↔ invoice ↔ receipt in sync.
    try {
      await admin
        .from('payment_transactions')
        .update({ payment_status: 'completed', paid_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .contains('payment_gateway_response', { prospect_id: id })
        .neq('payment_status', 'completed');
    } catch (txErr) {
      console.error('[approve-prospective] failed to mark transaction completed:', txErr);
    }

    // Shared onboarding — parent + student accounts, linking, enrolment, archive.
    const onboard = await onboardSummerStudent(admin, record as any, { approvedBy: caller.id });
    const authUserId = onboard.student.id;

    // Mark prospective student active
    const { error: prospectiveErr } = await admin
      .from('prospective_students')
      .update({
        is_active: true,
        status: getSummerProspectStatusForPayment({
          paymentPlan: isInstallmentPlan ? 'installment' : 'full',
          balanceDue: isInstallmentPlan ? 1 : 0,
        }),
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

    // Single welcome email: both logins, next steps, and the receipt PDF attached
    // (no separate receipt email → avoids spam). WhatsApp too when opted in.
    // Only on first creation — a repeat approval reuses existing accounts (no
    // password reset), so re-sending would just spam with no fresh credentials.
    if (onboard.student.created || onboard.parent?.created) {
      try {
        await sendSummerCredentials(onboard, record as any);
      } catch (mailErr) {
        console.error('Failed to send onboarding credentials on manual approval:', mailErr);
      }
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

