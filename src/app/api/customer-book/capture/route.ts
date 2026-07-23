import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { checkCustomRateLimit, getClientIp } from '@/proxies/rateLimit.proxy';
import { captureLeadToContactBook, canCaptureLead, type CaptureStage, type CaptureLeadInput } from '@/lib/crm/capture-lead';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

/** POST /api/customer-book/capture — progressive lead capture from public forms */
export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req as any);
    await checkCustomRateLimit({ key: `lead-capture:${ip}`, max: 30, window: 3600 });

    const body = await req.json().catch(() => ({} as Record<string, unknown>));

    const fullName = String(body.fullName || body.parentName || '').trim();
    const email = body.email ? String(body.email).trim().toLowerCase() : null;
    const phoneRaw = body.phone ? String(body.phone).trim() : null;
    const { normalizeCrmPhone } = await import('@/lib/crm/contact-book');
    const phone = phoneRaw ? normalizeCrmPhone(phoneRaw) : null;
    const captureStage = (body.captureStage as CaptureStage) || 'partial';
    const formType = (body.formType as CaptureLeadInput['formType']) || 'general';

    if (!canCaptureLead({ fullName, email, phone })) {
      return NextResponse.json(
        { error: 'Need a name plus email or phone to save this contact.' },
        { status: 400 },
      );
    }

    if (email) {
      await checkCustomRateLimit({ key: `lead-capture:${email}`, max: 12, window: 3600 });
    }

    const sb = adminClient();
    const bookId = await captureLeadToContactBook(sb, {
      fullName,
      email,
      phone,
      childName: body.childName ? String(body.childName) : body.studentName ? String(body.studentName) : null,
      schoolName: body.schoolName ? String(body.schoolName) : body.school ? String(body.school) : null,
      className: body.className ? String(body.className) : body.currentClass ? String(body.currentClass) : body.grade ? String(body.grade) : null,
      formType,
      captureStage,
      programSlug: body.programSlug ? String(body.programSlug) : null,
      programTitle: body.programTitle ? String(body.programTitle) : null,
      formId: body.formId ? String(body.formId) : null,
      formTitle: body.formTitle ? String(body.formTitle) : null,
      formSnapshot: typeof body.formSnapshot === 'object' && body.formSnapshot ? (body.formSnapshot as Record<string, unknown>) : {
        enrollment_type: body.enrollmentType,
        course_interest: body.courseInterest,
        preferred_schedule: body.preferredSchedule,
        hear_about_us: body.hearAboutUs,
        age: body.age,
        gender: body.gender,
        student_phone: body.studentPhone,
        payment_method: body.paymentMethod,
        payment_plan: body.paymentPlan,
      },
    });

    return NextResponse.json({ success: true, bookId, captured: !!bookId });
  } catch (e: any) {
    if (e?.name === 'RateLimitError') {
      return NextResponse.json({ error: 'Too many capture attempts. Try again later.' }, { status: 429 });
    }
    console.error('[customer-book/capture]', e);
    return NextResponse.json({ error: 'Capture failed' }, { status: 500 });
  }
}
