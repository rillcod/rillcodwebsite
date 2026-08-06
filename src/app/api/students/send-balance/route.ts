import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { getSummerBalanceDueFromTotal, resolveLockedTuitionTotal } from '@/lib/summer-school/pricing';
import { Database } from '@/types/supabase';
import { SMTP_FROM_EMAIL, brandContact } from '@/config/brand';
import { isSpecialEnrollment, SPECIAL_BALANCE_PATH } from '@/lib/registration/enrollment-types';
import { registeredProgrammeName } from '@/lib/registration/programme-label';

const bodySchema = z.object({
  studentId: z.string().uuid('Invalid student ID format'),
});

interface SummerGatewayResponse {
  prospect_id?: string;
  student_name?: string;
  parent_email?: string;
  payment_type?: string;
  payment_plan?: string;
  preferred_mode?: string;
  total_tuition?: number;
  amount_charged?: number;
  balance_due?: number;
  balance_payment?: boolean;
}

type PaymentTransactionRow = Database['public']['Tables']['payment_transactions']['Row'];

export async function POST(req: NextRequest) {
  const supabaseAdmin = createAdminClient();
  try {
    // 1. Verify caller is admin or teacher
    const supabase = await createServerClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { data: caller } = await supabaseAdmin
      .from('portal_users')
      .select('role')
      .eq('id', user.id)
      .single();
    if (!caller || !['admin', 'teacher'].includes(caller.role)) {
      return NextResponse.json({ error: 'Admin or teacher access required' }, { status: 403 });
    }

    // 2. Parse payload
    let json: unknown;
    try {
      json = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON request body' }, { status: 400 });
    }

    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid parameters' }, { status: 400 });
    }
    const { studentId } = parsed.data;

    // 3. Fetch student record
    const { data: student, error: studErr } = await supabaseAdmin
      .from('students')
      .select('id, name, full_name, student_email, parent_email, parent_name, school_id, school_name, enrollment_type, course_interest, current_class')
      .eq('id', studentId)
      .single();

    if (studErr || !student) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    }

    if (!isSpecialEnrollment(student.enrollment_type)) {
      return NextResponse.json({
        error: 'Tuition balance reminders are only supported for special-programme students.'
      }, { status: 400 });
    }

    const parentEmail = (student.parent_email || '').trim().toLowerCase();
    if (!parentEmail) {
      return NextResponse.json({ error: 'Student has no parent email on record' }, { status: 400 });
    }

    // 4. Find Summer School prospect record
    const { data: prospect } = await supabaseAdmin
      .from('prospective_students')
      .select('id, full_name, parent_email, parent_name, preferred_schedule')
      .eq('parent_email', parentEmail)
      .eq('full_name', student.full_name || student.name)
      .eq('is_deleted', false)
      .ilike('course_interest', '%Summer School%')
      .maybeSingle();

    if (!prospect) {
      return NextResponse.json({
        error: 'No active prospective student registration found matching this email and name.'
      }, { status: 404 });
    }

    // 5. Calculate amount paid + lock original tuition quote from payment metadata
    const { data: matchedTxs } = await supabaseAdmin
      .from('payment_transactions')
      .select('amount, payment_gateway_response, created_at')
      .contains('payment_gateway_response', { prospect_id: prospect.id })
      .in('payment_status', ['completed', 'success', 'paid'])
      .order('created_at', { ascending: true });

    let amountPaid = 0;
    let lockedTotal: number | null = null;
    if (matchedTxs) {
      for (const tx of matchedTxs) {
        amountPaid += Number(tx.amount) || 0;
        if (lockedTotal == null) {
          const meta = (tx.payment_gateway_response || {}) as Record<string, unknown>;
          const t = Number(meta.total_tuition);
          if (Number.isFinite(t) && t > 0) lockedTotal = t;
        }
      }
    }

    // Also scan any earlier pending/completed row that stamped total_tuition
    if (lockedTotal == null) {
      const { data: anyTxs } = await supabaseAdmin
        .from('payment_transactions')
        .select('payment_gateway_response')
        .contains('payment_gateway_response', { prospect_id: prospect.id })
        .order('created_at', { ascending: true })
        .limit(20);
      for (const tx of anyTxs ?? []) {
        const meta = (tx.payment_gateway_response || {}) as Record<string, unknown>;
        const t = Number(meta.total_tuition);
        if (Number.isFinite(t) && t > 0) { lockedTotal = t; break; }
      }
    }

    // 6. Calculate tuition and balance due (Batch A online ₦60k stay locked)
    const preferredMode = prospect.preferred_schedule || 'Online';
    const total = resolveLockedTuitionTotal({
      preferredMode,
      amountPaid,
      lockedFromPayments: lockedTotal,
    });
    const balanceDue = getSummerBalanceDueFromTotal(total, amountPaid);

    if (balanceDue <= 0) {
      return NextResponse.json({
        error: `Tuition for ${student.full_name || student.name} has already been fully paid (Amount paid: ₦${amountPaid.toLocaleString()}).`
      }, { status: 400 });
    }

    // 8. Build balance link and send email
    const { notificationsService } = await import('@/services/notifications.service');
    const { buildRillcodTransactionalEmailHtml } = await import('@/lib/email/rillcod-transactional-email');

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.rillcod.com';
    const balanceLink = `${baseUrl}${SPECIAL_BALANCE_PATH}?email=${encodeURIComponent(parentEmail)}`;

    // Name the programme they owe on, not whichever cohort was live when this
    // template was written.
    const programmeLabel = registeredProgrammeName({
      courseInterest: (student as { course_interest?: string | null }).course_interest,
      className: (student as { current_class?: string | null }).current_class,
      fallback: 'Rillcod Technologies',
    });

    const bodyHtml = `
      <p style="margin:0 0 12px;font-size:14px;color:#ffffff;line-height:1.6;">Dear ${student.parent_name || 'Parent/Guardian'},</p>
      <p style="margin:0 0 16px;font-size:14px;color:#a1a1aa;line-height:1.6;">This is a friendly reminder that there is an outstanding tuition balance of <strong>₦${balanceDue.toLocaleString()}</strong> for <strong>${student.full_name || student.name}</strong>'s enrolment in ${programmeLabel}.</p>
      
      <div style="margin:20px 0;padding:15px;background-color:#141618;border:1px solid #2a2d33;border-radius:8px;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="font-size:13px;">
          <tr>
            <td style="color:#71717a;padding:4px 0;">Total Tuition</td>
            <td style="color:#ffffff;text-align:right;font-weight:bold;">₦${total.toLocaleString()}</td>
          </tr>
          <tr>
            <td style="color:#71717a;padding:4px 0;">Amount Paid</td>
            <td style="color:#10b981;text-align:right;font-weight:bold;">- ₦${amountPaid.toLocaleString()}</td>
          </tr>
          <tr style="border-top:1px solid #2a2d33;">
            <td style="color:#ffffff;padding:8px 0 0;font-weight:bold;">Outstanding Balance</td>
            <td style="color:#f59e0b;text-align:right;font-weight:bold;padding:8px 0 0;font-size:15px;">₦${balanceDue.toLocaleString()}</td>
          </tr>
        </table>
      </div>
      
      <p style="margin:25px 0;text-align:center;">
        <a href="${balanceLink}" target="_blank" style="display:inline-block;padding:12px 24px;background-color:#7c3aed;color:#ffffff;text-decoration:none;font-weight:bold;border-radius:6px;font-size:14px;text-transform:uppercase;letter-spacing:0.5px;">Pay Balance Online</a>
      </p>
      
      <p style="margin:20px 0 0;font-size:12px;color:#71717a;line-height:1.5;">If you have any questions or have recently completed the bank transfer, please reply to this email or share your reference with our support team at <a href="mailto:${brandContact.email}" style="color:#7c3aed;">${brandContact.email}</a>.</p>
    `;

    const html = buildRillcodTransactionalEmailHtml({
      eyebrow: 'Tuition Invoice',
      title: 'Outstanding Tuition Balance Reminder',
      bodyHtml,
      summaryRows: [
        { label: 'Student', value: student.full_name || student.name },
        { label: 'Programme', value: programmeLabel },
        { label: 'Balance Due', value: `₦${balanceDue.toLocaleString()}` }
      ],
      footerNote: 'Rillcod Technologies Limited • Accounts & Finance'
    });

    await notificationsService.sendExternalEmail({
      to: parentEmail,
      subject: `Outstanding Balance Reminder: ${programmeLabel}`,
      html,
      fromName: 'Rillcod Technologies',
      fromEmail: SMTP_FROM_EMAIL
    });

    return NextResponse.json({
      success: true,
      message: `Balance reminder successfully sent to ${parentEmail}.`,
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
