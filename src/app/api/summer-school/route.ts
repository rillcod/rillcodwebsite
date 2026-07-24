import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/config/env';
import { validateSummerSchoolPayload } from '@/lib/form-helpers';
import { sendNativeEnrolmentAcknowledgement } from '@/lib/registration/native-enrolment-email';
import { getSummerSchoolAdminClient } from '@/lib/summer-school/admin';
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

import { sendRegistrationPaymentEmail } from '@/lib/registration/payment-link-email';
import { parseBankTransferReference } from '@/lib/summer-school/receipt-upload';
import {
  buildProspectNotesString,
  buildSpecialProgramGatewayMeta,
  bankTransferProofMatches,
  classifyRegistrationDuplicate,
  filterSameProgramRegistrations,
  mergeProspectRegistrationRows,
  parentPhoneTail,
  resolveProgramTuitionContext,
  resolveRegistrationCharge,
} from '@/lib/summer-school/registration-intake';
import { notifySpecialProgramAdminOps } from '@/lib/summer-school/admin-ops-notify';

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
      transfer_amount,
      parent_consent,
      whatsapp_consent,
      special_program_id,
      special_program_slug,
      is_app_enrolment,
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

    let parsedBankTransfer: ReturnType<typeof parseBankTransferReference> | null = null;
    if (payment_method === 'bank_transfer') {
      parsedBankTransfer = parseBankTransferReference(payment_reference);
      if (!parsedBankTransfer.ok) {
        return NextResponse.json({ error: parsedBankTransfer.error }, { status: 400 });
      }
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
    const phoneTail = parentPhoneTail(parent_phone);

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

    const childRegs = filterSameProgramRegistrations(
      mergeProspectRegistrationRows(byEmail ?? [], byPhone),
      specialPage,
    );

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

    const duplicate = classifyRegistrationDuplicate(childRegs, enrolledChild?.id ?? null, studentNameTrimmed);
    if (duplicate.kind === 'block_settled') {
      return NextResponse.json(
        { error: `${duplicate.studentName} is already registered for this seasonal programme. Please log in, or contact support if you need help — no need to register again.` },
        { status: 409 }
      );
    }
    if (duplicate.kind === 'block_balance') {
      return NextResponse.json(
        { error: `${duplicate.studentName} is already registered with an outstanding balance. Please use the “Pay Balance” option or contact support — no need to register again.` },
        { status: 409 }
      );
    }

    const reusable = duplicate.kind === 'reuse' ? duplicate.row : null;

    const tuition = resolveProgramTuitionContext(specialPage, preferred_mode, payment_plan);
    const chargeResult = resolveRegistrationCharge({
      paymentMethod: payment_method,
      paymentPlan: payment_plan,
      tuition,
      transferAmount: transfer_amount,
    });
    if (!chargeResult.ok) {
      return NextResponse.json({ error: chargeResult.error }, { status: 400 });
    }
    const { chargeAmount, balanceDue, effectivePaymentPlan, totalTuition } = chargeResult.charge;

    const courseInterest = `${current_class ? current_class + ' ' : ''}${programLabel}`;
    const initialStatus = payment_method === 'paystack' ? 'unpaid' : 'pending_verification';

    const notesStr = buildProspectNotesString({
      studentPhone: student_phone,
      additionalInfo: additional_info,
      whatsappConsent: whatsapp_consent,
      isAppEnrolment: is_app_enrolment,
      specialPageId: specialPage?.id,
      programTitle,
    });

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

    try {
      const { captureDroppedFromProspect } = await import('@/lib/crm/intake-capture');
      await captureDroppedFromProspect(supabase as any, { id: prospect.id, ...prospectPayload });
    } catch (crmSyncErr) {
      console.error('Contact book sync (non-fatal):', crmSyncErr);
    }

    const gatewayMeta = buildSpecialProgramGatewayMeta({
      prospectId: prospect.id,
      studentName: student_name,
      parentName: parent_name,
      parentEmail: emailNorm,
      preferredMode: preferred_mode,
      programTitle,
      specialPage,
      charge: { chargeAmount, balanceDue, effectivePaymentPlan, totalTuition },
    });

    const { error: supersedeError } = await supabase
      .from('payment_transactions')
      .update({ payment_status: 'failed', updated_at: new Date().toISOString() })
      .eq('payment_status', 'pending')
      .contains('payment_gateway_response', { prospect_id: prospect.id });
    if (supersedeError) {
      console.error('Failed to retire earlier special-programme payment links:', supersedeError);
    }

    if (payment_method === 'bank_transfer') {
      if (!parsedBankTransfer?.ok) {
        return NextResponse.json({ error: 'Bank transfer reference is required' }, { status: 400 });
      }
      const parsedRef = parsedBankTransfer;

      const { data: recentPending } = await supabase
        .from('payment_transactions')
        .select('id, transaction_reference, payment_gateway_response, created_at, payment_status')
        .contains('payment_gateway_response', { prospect_id: prospect.id })
        .eq('payment_status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const recentMeta = (recentPending?.payment_gateway_response || {}) as Record<string, unknown>;
      const recentAgeMs = recentPending?.created_at
        ? Date.now() - new Date(recentPending.created_at).getTime()
        : Number.POSITIVE_INFINITY;
      const sameProof = bankTransferProofMatches(recentMeta, {
        receiptUrl: parsedRef.receiptUrl,
        transferReference: parsedRef.transferReference,
        chargeAmount,
      });
      if (recentPending && recentAgeMs < 5 * 60 * 1000 && sameProof) {
        const emailDelivery = await sendRegistrationPaymentEmail({
          supabase,
          subjectId: prospect.id,
          reference: recentPending.transaction_reference || `RCPT-${prospect.id.slice(0, 6)}`,
          parentEmail: emailNorm,
          parentName: parent_name,
          studentName: student_name,
          programmeTitle: programTitle,
          amount: chargeAmount,
          totalTuition,
          balanceDue,
          paymentMethod: 'bank_transfer',
          receiptUrl: parsedRef.receiptUrl,
          transferReference: parsedRef.transferReference,
        });
        return NextResponse.json({
          success: true,
          reference: recentPending.transaction_reference,
          paymentMethod: 'bank_transfer',
          receiptUploaded: Boolean(parsedRef.receiptUrl),
          paymentEmailSent: emailDelivery.delivered,
          paymentEmailError: emailDelivery.error ?? null,
          amountPaid: chargeAmount,
          totalTuition,
          balanceDue,
          effectivePlan: effectivePaymentPlan,
          message: 'Registration already submitted. Our team is verifying your payment.',
          idempotent: true,
        });
      }

      const txReference = parsedRef.receiptUrl
        ? `RCPT-${Date.now()}-${prospect.id.substring(0, 6)}`
        : parsedRef.transferReference!;

      const pending = await createPendingPayment(supabase as any, {
        amount: chargeAmount,
        currency: 'NGN',
        method: 'bank_transfer',
        reference: txReference,
        subject: { type: 'prospect', id: prospect.id },
        metadata: {
          ...gatewayMeta,
          receipt_url: parsedRef.receiptUrl,
          transfer_reference: parsedRef.transferReference,
          notes: additional_info || null,
        },
      });
      if (!pending.ok) {
        if (!reusable) {
          await supabase.from('prospective_students').delete().eq('id', prospect.id);
        } else {
          await supabase
            .from('prospective_students')
            .update({ status: 'unpaid', updated_at: new Date().toISOString() })
            .eq('id', prospect.id);
        }
        return NextResponse.json({ error: pending.error.message }, { status: pending.error.code === 'conflict' ? 409 : 500 });
      }

      void notifySpecialProgramAdminOps({
        studentName: student_name,
        parentEmail: emailNorm,
        amount: chargeAmount,
        method: 'Bank transfer (pending verification)',
        reference: txReference,
        programmeTitle: programTitle,
        receiptUrl: parsedRef.receiptUrl,
        transferReference: parsedRef.transferReference,
        totalTuition,
        balanceDue,
      });

      const emailDelivery = await sendRegistrationPaymentEmail({
        supabase,
        subjectId: prospect.id,
        reference: txReference,
        parentEmail: emailNorm,
        parentName: parent_name,
        studentName: student_name,
        programmeTitle: programTitle,
        amount: chargeAmount,
        totalTuition,
        balanceDue,
        paymentMethod: 'bank_transfer',
        receiptUrl: parsedRef.receiptUrl,
        transferReference: parsedRef.transferReference,
      });

      return NextResponse.json({
        success: true,
        reference: txReference,
        paymentMethod: 'bank_transfer',
        receiptUploaded: Boolean(parsedRef.receiptUrl),
        paymentEmailSent: emailDelivery.delivered,
        paymentEmailError: emailDelivery.error ?? null,
        amountPaid: chargeAmount,
        totalTuition,
        balanceDue,
        effectivePlan: effectivePaymentPlan,
        message: parsedRef.receiptUrl
          ? 'Registration submitted with receipt. Our team will verify your payment shortly.'
          : 'Registration submitted. Our team will verify your bank transfer reference shortly.',
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

    if (is_app_enrolment) {
      const pending = await createPendingPayment(supabase as any, {
        amount: chargeAmount,
        currency: 'NGN',
        method: 'other',
        reference,
        subject: { type: 'prospect', id: prospect.id },
        metadata: {
          ...gatewayMeta,
          is_app_enrolment: true,
        },
      });

      if (!pending.ok) {
        return NextResponse.json({ error: pending.error.message }, { status: pending.error.code === 'conflict' ? 409 : 500 });
      }

      const emailDelivery = await sendNativeEnrolmentAcknowledgement({
        supabase,
        subjectId: prospect.id,
        reference,
        parentEmail: emailNorm,
        parentName: parent_name,
        studentName: student_name,
        programmeTitle: programTitle,
      });

      return NextResponse.json({
        success: true,
        reference,
        paymentMethod: 'other',
        paymentEmailSent: emailDelivery.delivered,
        paymentEmailError: emailDelivery.error ?? null,
      });
    }

    const pending = await createPendingPayment(supabase as any, {
      amount: chargeAmount,
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
        amount: chargeAmount * 100,
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
    const emailDelivery = await sendRegistrationPaymentEmail({
      supabase,
      subjectId: prospect.id,
      reference,
      parentEmail: emailNorm,
      parentName: parent_name,
      studentName: student_name,
      programmeTitle: programTitle,
      amount: chargeAmount,
      paymentUrl: authorizationUrl,
      paymentMethod: 'paystack',
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
