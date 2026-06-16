import { createClient as createAdminClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { getSummerBalanceDue, getSummerTotalTuition } from '@/lib/summer-school/pricing';
import { Database } from '@/types/supabase';

const supabaseAdmin = createAdminClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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
      .select('id, name, full_name, student_email, parent_email, parent_name, school_id, school_name, enrollment_type')
      .eq('id', studentId)
      .single();

    if (studErr || !student) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    }

    if (student.enrollment_type !== 'summer_school') {
      return NextResponse.json({
        error: 'Tuition balance reminders are only supported for Summer School students.'
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

    // 5. Calculate amount paid across completed transactions
    const { data: txs } = await supabaseAdmin
      .from('payment_transactions')
      .select('amount, payment_status, payment_gateway_response')
      .in('payment_status', ['completed', 'success', 'paid']);

    let amountPaid = 0;
    if (txs) {
      for (const tx of txs) {
        const gw = (tx.payment_gateway_response ?? {}) as unknown as SummerGatewayResponse;
        if (gw.prospect_id === prospect.id) {
          amountPaid += Number(tx.amount) || 0;
        }
      }
    }

    // 6. Sibling discount status
    let hasSibling = false;
    const { count: studentCount } = await supabaseAdmin
      .from('students')
      .select('id', { count: 'exact', head: true })
      .eq('parent_email', parentEmail);
    const { count: prospectiveCount } = await supabaseAdmin
      .from('prospective_students')
      .select('id', { count: 'exact', head: true })
      .eq('parent_email', parentEmail);
    hasSibling = !!((studentCount || 0) + (prospectiveCount || 0) > 1);

    // 7. Calculate tuition and balance due
    const preferredMode = prospect.preferred_schedule || 'Online';
    const total = getSummerTotalTuition(preferredMode, hasSibling);
    const balanceDue = getSummerBalanceDue(preferredMode, amountPaid, hasSibling);

    if (balanceDue <= 0) {
      return NextResponse.json({
        error: `Tuition for ${student.full_name || student.name} has already been fully paid (Amount paid: ₦${amountPaid.toLocaleString()}).`
      }, { status: 400 });
    }

    // 8. Build balance link and send email
    const { notificationsService } = await import('@/services/notifications.service');
    const { buildRillcodTransactionalEmailHtml } = await import('@/lib/email/rillcod-transactional-email');

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.rillcod.com';
    const balanceLink = `${baseUrl}/summer-school/pay-balance?email=${encodeURIComponent(parentEmail)}`;

    const bodyHtml = `
      <p style="margin:0 0 12px;font-size:14px;color:#ffffff;line-height:1.6;">Dear ${student.parent_name || 'Parent/Guardian'},</p>
      <p style="margin:0 0 16px;font-size:14px;color:#a1a1aa;line-height:1.6;">This is a friendly reminder that there is an outstanding tuition balance of <strong>₦${balanceDue.toLocaleString()}</strong> for <strong>${student.full_name || student.name}</strong>'s enrolment in the Rillcod AI Summer School 2026.</p>
      
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
      
      <p style="margin:20px 0 0;font-size:12px;color:#71717a;line-height:1.5;">If you have any questions or have recently completed the bank transfer, please reply to this email or share your reference with our support team at <a href="mailto:support@rillcod.com" style="color:#7c3aed;">support@rillcod.com</a>.</p>
    `;

    const html = buildRillcodTransactionalEmailHtml({
      eyebrow: 'Tuition Invoice',
      title: 'Outstanding Tuition Balance Reminder',
      bodyHtml,
      summaryRows: [
        { label: 'Student', value: student.full_name || student.name },
        { label: 'Programme', value: 'AI Summer School 2026' },
        { label: 'Balance Due', value: `₦${balanceDue.toLocaleString()}` }
      ],
      footerNote: 'Rillcod Technologies Limited • Accounts & Finance'
    });

    await notificationsService.sendExternalEmail({
      to: parentEmail,
      subject: `Outstanding Balance Reminder: AI Summer School 2026`,
      html,
      fromName: 'Rillcod Technologies',
      fromEmail: 'support@rillcod.com'
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
