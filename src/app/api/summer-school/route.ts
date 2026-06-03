import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/config/env';
import { validateSummerSchoolPayload } from '@/lib/form-helpers';
import { getSummerSchoolAdminClient } from '@/lib/summer-school/admin';
import { getSummerTotalTuition, getSummerTuitionAmount } from '@/lib/summer-school/pricing';
import { checkCustomRateLimit, getClientIp } from '@/proxies/rateLimit.proxy';
import { RateLimitError } from '@/lib/errors';

async function notifyAdminOps(payload: {
  studentName: string;
  parentEmail: string;
  amount: number;
  method: string;
  reference: string;
}) {
  const adminTo = env.ADMIN_OPS_EMAIL?.trim();
  if (!adminTo || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(adminTo)) return;

  try {
    const { notificationsService } = await import('@/services/notifications.service');
    const { buildRillcodTransactionalEmailHtml } = await import('@/lib/email/rillcod-transactional-email');
    const html = buildRillcodTransactionalEmailHtml({
      eyebrow: 'Operations',
      title: 'New Summer School registration',
      bodyHtml: `<p style="margin:0 0 10px;">A new Summer School 2026 registration was submitted and needs attention.</p>`,
      summaryRows: [
        { label: 'Student', value: payload.studentName },
        { label: 'Parent email', value: payload.parentEmail },
        { label: 'Amount', value: `₦${payload.amount.toLocaleString()}` },
        { label: 'Method', value: payload.method },
        { label: 'Reference', value: payload.reference },
      ],
      footerNote: 'Internal ops notice — review in Dashboard → Approvals.',
    });
    await notificationsService.sendExternalEmail({
      to: adminTo,
      subject: `Summer School registration — ${payload.studentName}`,
      fromName: 'Rillcod Technologies',
      fromEmail: 'support@rillcod.com',
      html,
    });
  } catch (err) {
    console.error('Summer school admin ops email failed:', err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      student_name,
      parent_name,
      parent_phone,
      parent_email,
      student_phone,
      school,
      current_class,
      age,
      gender,
      preferred_mode,
      hear_about_us,
      additional_info,
      payment_method = 'paystack',
      payment_plan = 'full',
      payment_reference,
    } = body;

    if (!student_name || !parent_name || !parent_phone) {
      return NextResponse.json(
        { error: 'Student name, parent name, and parent phone are required' },
        { status: 400 }
      );
    }

    const validationError = validateSummerSchoolPayload({
      student_name,
      parent_name,
      parent_phone,
      parent_email,
      student_phone,
      age,
      preferred_mode,
      payment_method,
      payment_plan,
      payment_reference,
    });
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const emailNorm = parent_email!.trim().toLowerCase();

    try {
      await checkCustomRateLimit({ key: emailNorm, max: 3, window: 300 });
    } catch (err) {
      if (err instanceof RateLimitError) {
        return NextResponse.json(
          { error: 'Too many registration attempts. Please wait before trying again.' },
          { status: 429 }
        );
      }
      throw err;
    }

    const ip = getClientIp(req);
    if (ip !== '127.0.0.1') {
      try {
        await checkCustomRateLimit({ key: `ss-reg:${ip}`, max: 10, window: 600 });
      } catch (err) {
        if (err instanceof RateLimitError) {
          return NextResponse.json({ error: 'Too many requests from this network.' }, { status: 429 });
        }
      }
    }

    const supabase = getSummerSchoolAdminClient();
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: recentDup } = await supabase
      .from('prospective_students')
      .select('id')
      .eq('parent_email', emailNorm)
      .ilike('course_interest', '%Summer School%')
      .in('status', ['unpaid', 'pending_verification', 'partially_paid'])
      .gte('created_at', twentyFourHoursAgo)
      .maybeSingle();

    if (recentDup) {
      return NextResponse.json(
        { error: 'A registration for this email is already in progress. Check your email or contact support.' },
        { status: 409 }
      );
    }

    const amount = getSummerTuitionAmount(preferred_mode, payment_plan);
    const totalTuition = getSummerTotalTuition(preferred_mode);
    const courseInterest = `${current_class ? current_class + ' ' : ''}Summer School 2026`;
    const initialStatus = payment_method === 'paystack' ? 'unpaid' : 'pending_verification';

    const studentPhoneStr = student_phone ? `[Student Phone: ${student_phone}]` : '';
    const notesStr = `${studentPhoneStr} ${additional_info || ''}`.trim();

    const { data: prospect, error: prospectErr } = await supabase
      .from('prospective_students')
      .insert({
        full_name: student_name,
        email: emailNorm,
        parent_name,
        parent_phone,
        parent_email: emailNorm,
        grade: current_class || null,
        school_id: null,
        school_name: school || 'Direct / Summer School',
        age: age || null,
        gender: gender || null,
        course_interest: courseInterest,
        preferred_schedule: preferred_mode || null,
        hear_about_us: hear_about_us || null,
        notes: notesStr || null,
        status: initialStatus,
        is_active: false,
        is_deleted: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (prospectErr || !prospect) {
      console.error('Summer school registration db error:', prospectErr);
      return NextResponse.json(
        { error: prospectErr?.message || 'Failed to save registration details' },
        { status: 500 }
      );
    }

    const gatewayMeta = {
      prospect_id: prospect.id,
      student_name,
      parent_email: emailNorm,
      payment_type: 'summer_school',
      payment_plan,
      preferred_mode,
      total_tuition: totalTuition,
      amount_charged: amount,
      balance_due: payment_plan === 'installment' ? totalTuition - amount : 0,
    };

    if (payment_method === 'bank_transfer') {
      const reference = payment_reference!.trim();

      await supabase.from('payment_transactions').insert([{
        portal_user_id: null,
        school_id: null,
        course_id: null,
        amount,
        currency: 'NGN',
        payment_method: 'bank_transfer',
        payment_status: 'pending',
        transaction_reference: reference.startsWith('http') ? `RCPT-${Date.now()}` : reference,
        payment_gateway_response: {
          ...gatewayMeta,
          receipt_url: reference.startsWith('http') ? reference : null,
          transfer_reference: reference.startsWith('http') ? null : reference,
          notes: additional_info || null,
        },
        created_at: new Date().toISOString(),
      }]);

      void notifyAdminOps({
        studentName: student_name,
        parentEmail: emailNorm,
        amount,
        method: 'Bank transfer (pending verification)',
        reference: reference.slice(0, 80),
      });

      return NextResponse.json({
        success: true,
        reference,
        paymentMethod: 'bank_transfer',
        message: 'Registration submitted successfully. Please wait while our team verifies your bank transfer reference.',
      });
    }

    if (!env.PAYSTACK_SECRET_KEY) {
      return NextResponse.json(
        { error: 'Payment gateway is not configured. Please contact support.' },
        { status: 500 }
      );
    }

    const reference = `SUM-REG-${Date.now()}-${prospect.id.substring(0, 6)}`;
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.rillcod.com';

    const { data: tx } = await supabase
      .from('payment_transactions')
      .insert([{
        portal_user_id: null,
        school_id: null,
        course_id: null,
        amount,
        currency: 'NGN',
        payment_method: 'paystack',
        payment_status: 'pending',
        transaction_reference: reference,
        payment_gateway_response: gatewayMeta,
        created_at: new Date().toISOString(),
      }])
      .select('id')
      .single();

    const paystackRes = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: emailNorm,
        amount: amount * 100,
        reference,
        callback_url: `${baseUrl}/summer-school?payment=success&reference=${encodeURIComponent(reference)}&name=${encodeURIComponent(student_name)}&plan=${payment_plan}&method=paystack`,
        metadata: {
          ...gatewayMeta,
          transaction_id: tx?.id,
        },
      }),
    });

    const paystackData = await paystackRes.json();

    if (!paystackData.status) {
      console.error('Paystack initialization failed:', paystackData);
      await supabase.from('prospective_students').delete().eq('id', prospect.id);
      if (tx?.id) {
        await supabase.from('payment_transactions').delete().eq('id', tx.id);
      }
      return NextResponse.json(
        { error: paystackData.message || 'Payment gateway failed to initialize' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      paymentUrl: paystackData.data.authorization_url,
      reference,
      paymentMethod: 'paystack',
    });

  } catch (err: unknown) {
    console.error('Summer school API error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Something went wrong' },
      { status: 500 }
    );
  }
}
