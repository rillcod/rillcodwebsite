import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/config/env';
import { validateSummerSchoolPayload } from '@/lib/form-helpers';
import { getSummerSchoolAdminClient } from '@/lib/summer-school/admin';
import { getSummerTotalTuition, getSummerTuitionAmount } from '@/lib/summer-school/pricing';
import {
  getSpecialProgramById,
  getSpecialProgramBySlug,
  getFeaturedSpecialProgram,
} from '@/lib/special-programs/queries';
import {
  getSpecialTotalTuition,
  getSpecialTuitionAmount,
  isRegistrationOpen,
  specialProgramPublicPath,
  type SpecialProgramPage,
} from '@/lib/special-programs/types';
import { checkCustomRateLimit, getClientIp } from '@/proxies/rateLimit.proxy';
import { RateLimitError } from '@/lib/errors';
import { createPendingPayment, removePendingPayment } from '@/lib/payments/pending-transaction';
import { SMTP_FROM_EMAIL } from '@/config/brand';
import { SPECIAL_PAYMENT_TYPE } from '@/lib/registration/enrollment-types';

import { sendRegistrationPaymentEmail } from '@/lib/registration/payment-link-email';
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
      fromEmail: SMTP_FROM_EMAIL,
      html,
    });
  } catch (err) {
    console.error('Summer school admin ops email failed:', err);
  }
}

/**
 * Acknowledge the registration to the PARENT who registered. Previously only the
 * admin ops inbox was notified, so the parent never heard that their child's
 * application was received and is pending verification.
 */
async function notifyParentPending(payload: {
  parentEmail: string;
  parentName: string;
  studentName: string;
  amount: number;
  method: 'bank_transfer' | 'paystack';
  reference: string;
  bankAccount?: { bank_name: string; account_number: string; account_name: string } | null;
  payUrl?: string;
  programmeTitle?: string;
}): Promise<boolean> {
  const to = payload.parentEmail?.trim().toLowerCase();
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(to)) return false;

  try {
    const { notificationsService } = await import('@/services/notifications.service');
    const { buildRillcodTransactionalEmailHtml } = await import('@/lib/email/rillcod-transactional-email');

    const amountStr = `₦${payload.amount.toLocaleString()}`;

    const programmeTitle = payload.programmeTitle || 'Rillcod special programme';

    // Prominent amount-due banner
    const amountBanner = `
      <div style="margin:0 0 18px;padding:16px 18px;background:#1c1e22;border:1px solid #2a2d33;border-radius:8px;text-align:center;">
        <p style="margin:0 0 4px;font-size:10px;color:#71717a;text-transform:uppercase;letter-spacing:1.5px;font-weight:800;">Amount to Pay</p>
        <p style="margin:0;font-size:26px;color:#10b981;font-weight:800;font-family:monospace,Arial;">${amountStr}</p>
      </div>`;

    // Bank-transfer details so the parent can complete payment.
    const bankBlock = payload.bankAccount
      ? `<div style="margin:0 0 18px;padding:15px 18px;background:#141618;border:1px solid #2a2d33;border-radius:8px;">
           <p style="margin:0 0 10px;font-size:10px;color:#f59e0b;text-transform:uppercase;letter-spacing:1.5px;font-weight:800;">Pay by Bank Transfer</p>
           <p style="margin:6px 0;font-size:14px;color:#fff;"><strong>Bank:</strong> ${payload.bankAccount.bank_name}</p>
           <p style="margin:6px 0;font-size:14px;color:#fff;font-family:monospace;"><strong>Account No:</strong> ${payload.bankAccount.account_number}</p>
           <p style="margin:6px 0;font-size:14px;color:#fff;"><strong>Account Name:</strong> ${payload.bankAccount.account_name}</p>
           <p style="margin:10px 0 0;font-size:11px;color:#71717a;">Use your child's name as the transfer narration. Reply to this email or send your receipt so we can verify quickly.</p>
         </div>`
      : '';

    // Online payment option.
    const payButton = payload.payUrl
      ? `<div style="margin:0 0 18px;text-align:center;">
           <a href="${payload.payUrl}" style="display:inline-block;padding:13px 28px;background:#7c3aed;color:#fff;font-size:14px;font-weight:800;text-decoration:none;border-radius:8px;">Pay Online Now →</a>
           <p style="margin:8px 0 0;font-size:11px;color:#71717a;">Prefer card / transfer via Paystack? Pay online and your child's account is created automatically.</p>
         </div>`
      : '';

    const body = `
      <p style="margin:0 0 10px;">Dear ${payload.parentName}, thank you for registering <strong>${payload.studentName}</strong> for <strong>${programmeTitle}</strong>.</p>
      <p style="margin:0 0 16px;">To <strong>secure your child's seat</strong>, please complete payment using either option below. As soon as your payment is confirmed we activate the account and email you the <strong>parent and student login details</strong>.</p>
      ${amountBanner}
      ${payButton}
      ${bankBlock}
      <p style="margin:0;font-size:12px;color:#71717a;">If you have already paid, no action is needed — our team is verifying and will confirm shortly.</p>`;

    const html = buildRillcodTransactionalEmailHtml({
      eyebrow: 'Admissions',
      title: 'Complete your payment to secure the seat',
      bodyHtml: body,
      summaryRows: [
        { label: 'Student', value: payload.studentName },
        { label: 'Programme', value: programmeTitle },
        { label: 'Amount due', value: amountStr },
        { label: 'Status', value: 'Awaiting payment confirmation' },
        { label: 'Reference', value: payload.reference },
      ],
      footerNote: 'rillcod technologies limited • summer school admissions',
    });

    await notificationsService.sendExternalEmail({
      to,
      subject: `Complete Your Registration — ${programmeTitle}`,
      fromName: 'Rillcod Technologies',
      fromEmail: SMTP_FROM_EMAIL,
      html,
    });
    return true;
  } catch (err) {
    console.error('Summer school parent acknowledgement email failed:', err);
  }
  return false;
}
async function sendTrackedParentPending(
  supabase: any,
  prospectId: string,
  payload: Parameters<typeof notifyParentPending>[0],
) {
  return sendRegistrationPaymentEmail({
    supabase,
    subjectId: prospectId,
    reference: payload.reference,
    parentEmail: payload.parentEmail,
    parentName: payload.parentName,
    studentName: payload.studentName,
    programmeTitle: payload.programmeTitle,
    amount: payload.amount,
    paymentUrl: payload.payUrl,
    paymentMethod: payload.method,
  });
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
      parent_consent,
      whatsapp_consent,
      special_program_id,
      special_program_slug,
    } = body;

    let specialPage: SpecialProgramPage | null = null;
    if (special_program_id) {
      specialPage = await getSpecialProgramById(String(special_program_id));
    } else if (special_program_slug) {
      specialPage = await getSpecialProgramBySlug(String(special_program_slug), { requirePublished: true });
    } else {
      specialPage = await getFeaturedSpecialProgram();
    }
    if ((special_program_id || special_program_slug) && (!specialPage || !specialPage.is_published)) {
      return NextResponse.json(
        { error: 'This special programme is not available for public registration.' },
        { status: 404 },
      );
    }


    if (specialPage && !isRegistrationOpen(specialPage)) {
      return NextResponse.json(
        { error: `Registration for ${specialPage.title} is closed.` },
        { status: 403 },
      );
    }

    const programTitle = specialPage?.title || 'AI Summer School 2026';
    const programLabel = specialPage?.title || 'Summer School 2026';

    if (!student_name || !parent_name || !parent_phone) {
      return NextResponse.json(
        { error: 'Learner name, contact name, and WhatsApp phone are required' },
        { status: 400 }
      );
    }

    // Consent: parent/guardian for minors, or the adult/individual learner themselves.
    if (parent_consent !== true) {
      return NextResponse.json(
        { error: 'Consent is required. Adults/individuals may consent for themselves; parents/guardians consent for minors.' },
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

    const ageNum = typeof age === 'number' ? age : parseInt(String(age ?? ''), 10);
    const pageAgeMin = specialPage?.content?.age_min ?? 8;
    const pageAgeMax = specialPage?.content?.age_max ?? 99;
    if (Number.isFinite(ageNum) && (ageNum < pageAgeMin || ageNum > pageAgeMax)) {
      return NextResponse.json(
        { error: `Age must be between ${pageAgeMin} and ${pageAgeMax} for this programme (kids, teens, adults & individuals welcome where allowed).` },
        { status: 400 }
      );
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
    const studentNameTrimmed = student_name.trim();

    // Duplicate guard — scoped to THIS child so a parent can still register siblings.
    // Matched by parent EMAIL *or* parent PHONE + child name, so a typo'd/changed email
    // (e.g. "ausiat1@gmail.coom" vs the real address) can't create a twin row.
    // Already paid/active → blocked; partially paid → "pay balance"; unpaid → reuse row + new Paystack link.
    const phoneDigits = (parent_phone || '').replace(/\D/g, '');
    const phoneTail = phoneDigits.length >= 10 ? phoneDigits.slice(-10) : '';

    const { data: byEmail } = await supabase
      .from('prospective_students')
      .select('id, status, created_at, course_interest, notes')
      .eq('parent_email', emailNorm)
      .ilike('full_name', studentNameTrimmed)
      .in('status', ['unpaid', 'pending_verification', 'partially_paid', 'paid', 'active'])
      .order('created_at', { ascending: false });

    let byPhone: any[] = [];
    if (phoneTail) {
      const { data } = await supabase
        .from('prospective_students')
        .select('id, status, created_at, parent_phone, course_interest, notes')
        .ilike('full_name', studentNameTrimmed)
        .ilike('parent_phone', `%${phoneTail}%`)
        .in('status', ['unpaid', 'pending_verification', 'partially_paid', 'paid', 'active']);
      byPhone = data ?? [];
    }

    const isSameSeasonalReg = (r: any) => {
      const interest = String(r.course_interest || '');
      const notes = String(r.notes || '');
      if (specialPage) {
        const samePage = notes.includes(`[SpecialPage: ${specialPage.id}]`);
        const sameTitle = interest.toLowerCase().includes(specialPage.title.toLowerCase());
        return samePage || sameTitle;
      }
      // Legacy summer records remain scoped to summer and never absorb a
      // registration tagged for a different dynamic special programme.
      return /summer/i.test(interest) && !/\[SpecialPage:/i.test(notes);
    };

    // Union by id, newest first — only seasonal/special rows for this child.
    const seenIds = new Set<string>();
    const childRegs = [...(byEmail ?? []), ...byPhone]
      .filter((r: any) => isSameSeasonalReg(r))
      .filter((r: any) => (seenIds.has(r.id) ? false : (seenIds.add(r.id), true)))
      .sort((a: any, b: any) => (b.created_at > a.created_at ? 1 : -1));

    const settled    = (childRegs ?? []).find((r: any) => ['paid', 'active'].includes(r.status));
    const owing      = (childRegs ?? []).find((r: any) => r.status === 'partially_paid');

    // Also catch a child who is already a live summer-school student even if the
    // prospect status drifted. For dynamic pages, only an enrolment in the exact
    // linked programme is a duplicate; another programme remains available.
    const { data: studentMatch } = await supabase
      .from('students')
      .select('id, user_id')
      .ilike('parent_email', emailNorm)
      .ilike('full_name', studentNameTrimmed)
      .eq('enrollment_type', 'special')
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    let enrolledChild: { id: string } | null = null;
    if (!specialPage) {
      enrolledChild = studentMatch ? { id: studentMatch.id } : null;
    } else if (studentMatch?.user_id && specialPage.program_id) {
      const { data: exactEnrollment } = await supabase
        .from('enrollments')
        .select('id')
        .eq('user_id', studentMatch.user_id)
        .eq('program_id', specialPage.program_id)
        .eq('role', 'student')
        .in('status', ['active', 'completed'])
        .limit(1)
        .maybeSingle();
      enrolledChild = exactEnrollment;
    }

    if (settled || enrolledChild) {
      return NextResponse.json(
        { error: `${studentNameTrimmed} is already registered for this seasonal programme. Please log in, or contact support if you need help — no need to register again.` },
        { status: 409 }
      );
    }
    if (owing) {
      return NextResponse.json(
        { error: `${studentNameTrimmed} is already registered with an outstanding balance. Please use the “Pay Balance” option or contact support — no need to register again.` },
        { status: 409 }
      );
    }

    // Reuse any unpaid/pending_verification row (abandoned Paystack) instead of a 24h lockout.
    const reusable = (childRegs ?? []).find((r: any) =>
      ['unpaid', 'pending_verification'].includes(r.status));

    const amount = specialPage
      ? getSpecialTuitionAmount(specialPage, preferred_mode, payment_plan)
      : getSummerTuitionAmount(preferred_mode, payment_plan);
    const totalTuition = specialPage
      ? getSpecialTotalTuition(specialPage, preferred_mode)
      : getSummerTotalTuition(preferred_mode);
    const courseInterest = `${current_class ? current_class + ' ' : ''}${programLabel}`;
    const initialStatus = payment_method === 'paystack' ? 'unpaid' : 'pending_verification';

    const studentPhoneStr = student_phone ? `[Student Phone: ${student_phone}]` : '';
    let notesStr = `${studentPhoneStr} ${additional_info || ''}`.trim();
    // Guarantee consent tokens are persisted server-side even if a client omits them.
    if (!/\[Parental Consent:/i.test(notesStr)) {
      notesStr = `${notesStr} [Parental Consent: Yes] [WhatsApp Opt-in: ${whatsapp_consent === true ? 'Yes' : 'No'}]`.trim();
    }
    if (specialPage && !/\[SpecialPage:/i.test(notesStr)) {
      notesStr = `${notesStr} [SpecialPage: ${specialPage.id}]`.trim();
    }
    if (!/\[Programme:/i.test(notesStr)) {
      const safeProgrammeTitle = programTitle.replace(/[\[\]]/g, '').trim();
      notesStr = `${notesStr} [Programme: ${safeProgrammeTitle}]`.trim();
    }

    const prospectPayload = {
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
      updated_at: new Date().toISOString(),
    };

    const { data: prospect, error: prospectErr } = reusable
      ? await supabase
          .from('prospective_students')
          .update(prospectPayload)
          .eq('id', reusable.id)
          .select('id')
          .single()
      : await supabase
          .from('prospective_students')
          .insert({ ...prospectPayload, created_at: new Date().toISOString() })
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
      parent_name,
      parent_email: emailNorm,
      payment_type: SPECIAL_PAYMENT_TYPE,
      payment_plan,
      preferred_mode,
      total_tuition: totalTuition,
      amount_charged: amount,
      balance_due: payment_plan === 'installment' ? totalTuition - amount : 0,
      special_program_page_id: specialPage?.id || null,
      special_program_slug: specialPage?.slug || null,
      program_title: programTitle,
    };

    if (payment_method === 'bank_transfer') {
      const reference = payment_reference!.trim();

      const pending = await createPendingPayment(supabase as any, {
        amount,
        currency: 'NGN',
        method: 'bank_transfer',
        reference: reference.startsWith('http') ? `RCPT-${Date.now()}` : reference,
        subject: { type: 'prospect', id: prospect.id },
        metadata: {
          ...gatewayMeta,
          receipt_url: reference.startsWith('http') ? reference : null,
          transfer_reference: reference.startsWith('http') ? null : reference,
          notes: additional_info || null,
        },
      });
      if (!pending.ok) {
        return NextResponse.json({ error: pending.error.message }, { status: pending.error.code === 'conflict' ? 409 : 500 });
      }

      void notifyAdminOps({
        studentName: student_name,
        parentEmail: emailNorm,
        amount,
        method: 'Bank transfer (pending verification)',
        reference: reference.slice(0, 80),
      });

      // Acknowledge to the PARENT and tell them exactly how to pay.
      const { data: payAccts } = await supabase
        .from('payment_accounts')
        .select('bank_name, account_number, account_name')
        .eq('is_active', true)
        .in('owner_type', ['rillcod', 'global'])
        .limit(1);
      const bankAccount = payAccts?.[0]
        ? { bank_name: payAccts[0].bank_name, account_number: payAccts[0].account_number, account_name: payAccts[0].account_name }
        : { bank_name: 'Providus Bank', account_number: '7901178957', account_name: 'Rillcod Ltd' };
      const publicPath = specialPage
        ? specialProgramPublicPath(specialPage.slug)
        : '/summer-school';
      const payUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://www.rillcod.com'}${publicPath}`;

      const emailDelivery = await sendTrackedParentPending(supabase, prospect.id, {
        parentEmail: emailNorm,
        parentName: parent_name,
        studentName: student_name,
        amount,
        method: 'bank_transfer',
        reference: reference.startsWith('http') ? 'Receipt uploaded' : reference.slice(0, 80),
        bankAccount,
        payUrl,
        programmeTitle: programTitle,
      });

      return NextResponse.json({
        success: true,
        reference,
        paymentMethod: 'bank_transfer',
        paymentEmailSent: emailDelivery.delivered,
        paymentEmailError: emailDelivery.error ?? null,
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

    const pending = await createPendingPayment(supabase as any, {
      amount,
      currency: 'NGN',
      method: 'paystack',
      reference,
      subject: { type: 'prospect', id: prospect.id },
      metadata: gatewayMeta,
    });
    if (!pending.ok) {
      return NextResponse.json({ error: pending.error.message }, { status: pending.error.code === 'conflict' ? 409 : 500 });
    }
    const tx = pending.data as { id: string };

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
        callback_url: `${baseUrl}${specialPage ? specialProgramPublicPath(specialPage.slug) : '/summer-school'}?payment=success&reference=${encodeURIComponent(reference)}&name=${encodeURIComponent(student_name)}&plan=${payment_plan}&method=paystack`,
        metadata: {
          ...gatewayMeta,
          transaction_id: tx?.id,
        },
      }),
    });

    const paystackData = await paystackRes.json();

    if (!paystackData.status) {
      console.error('Paystack initialization failed:', paystackData);
      // Keep prospect for retry (summer blueprint: never lose the registration row).
      if (tx?.id) {
        await removePendingPayment(supabase as any, tx.id);
      }
      return NextResponse.json(
        { error: paystackData.message || 'Payment gateway failed to initialize. Your details were saved — try again shortly.' },
        { status: 500 }
      );
    }

    const authorizationUrl = String(paystackData.data.authorization_url || '');
    await supabase
      .from('payment_transactions')
      .update({
        payment_gateway_response: {
          ...gatewayMeta,
          authorization_url: authorizationUrl,
          access_code: paystackData.data.access_code || null,
        },
      })
      .eq('id', tx.id);

    // Email is the payment handoff for Android and a safe backup for web users.
    // The app never renders this URL; the parent opens it from their inbox/browser.
    const emailDelivery = await sendTrackedParentPending(supabase, prospect.id, {
      parentEmail: emailNorm,
      parentName: parent_name,
      studentName: student_name,
      amount,
      method: 'paystack',
      reference,
      payUrl: authorizationUrl,
      programmeTitle: programTitle,
    });
    return NextResponse.json({
      success: true,
      paymentUrl: authorizationUrl,
      reference,
      paymentMethod: 'paystack',
      paymentEmailSent: emailDelivery.delivered,
      paymentEmailError: emailDelivery.error ?? null,
    });

  } catch (err: unknown) {
    console.error('Summer school API error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Something went wrong' },
      { status: 500 }
    );
  }
}
