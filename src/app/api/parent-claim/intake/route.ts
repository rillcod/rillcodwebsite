import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { resolveAndGuardChild, completeParentClaim } from '@/lib/parent-claim/complete';
import { validateParentSuppliedRecordGaps } from '@/lib/parent-claim/record-enrichment';
import { checkCustomRateLimit, getClientIp } from '@/proxies/rateLimit.proxy';
import { RateLimitError } from '@/lib/errors';
import { recordParentClaimAudit } from '@/lib/parent-claim/audit';

export const dynamic = 'force-dynamic';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// POST /api/parent-claim/intake
// Frictionless (no OTP) self-service link — only when explicitly enabled server-side.
// Do not trust NEXT_PUBLIC_* alone; production should leave PARENT_CLAIM_ALLOW_SKIP_OTP unset.
export async function POST(request: Request) {
  if (process.env.PARENT_CLAIM_ALLOW_SKIP_OTP !== 'true') {
    return NextResponse.json(
      { error: 'Email verification is required. Use the code sent to your email.', otpRequired: true },
      { status: 403 },
    );
  }

  try {
    await checkCustomRateLimit({ key: `parent-intake:${getClientIp(request as any)}`, max: 8, window: 60 });
  } catch (err) {
    if (err instanceof RateLimitError) {
      return NextResponse.json({ error: 'Too many attempts. Please wait a moment and try again.' }, { status: 429 });
    }
    console.error('[parent-claim/intake] rate-limit check failed:', err);
    return NextResponse.json({ error: 'Verification is temporarily unavailable. Please try again.' }, { status: 503 });
  }

  const body = await request.json().catch(() => ({}));
  const code = String(body.code ?? '').trim().toUpperCase();
  const fullName = String(body.fullName ?? '').trim();
  const email = String(body.email ?? '').trim().toLowerCase();
  const phone = String(body.phone ?? '').trim() || null;
  const relationship = String(body.relationship ?? '').trim() || null;
  const childName = String(body.childName ?? '').trim();
  const childGender = String(body.childGender ?? '').trim() || null;
  const childAge = String(body.childAge ?? '').trim() || null;
  const childDob = String(body.childDob ?? '').trim() || null;
  const whatsappOptIn = body.whatsappOptIn === true || body.whatsappOptIn === 'true';

  if (!code) return NextResponse.json({ error: 'Missing code' }, { status: 400 });
  if (!fullName) return NextResponse.json({ error: 'Your full name is required' }, { status: 400 });
  if (!EMAIL_RE.test(email)) return NextResponse.json({ error: 'A valid email address is required' }, { status: 400 });
  if (!phone || phone.replace(/\D/g, '').length < 10) {
    return NextResponse.json({ error: 'A valid phone number is required' }, { status: 400 });
  }
  const { isValidParentRelationship, PARENT_RELATIONSHIP_REQUIRED_MSG } = await import('@/lib/parents/contact');
  if (!isValidParentRelationship(relationship)) {
    return NextResponse.json({ error: PARENT_RELATIONSHIP_REQUIRED_MSG }, { status: 400 });
  }

  const admin = createAdminClient();
  const guard = await resolveAndGuardChild(admin, code, { relationship, childName });
  if (!guard.studentId) return NextResponse.json({ error: guard.error }, { status: guard.status ?? 400 });

  const gapError = await validateParentSuppliedRecordGaps(admin, guard.studentId, {
    childGender, childAge, childDob,
  });
  if (gapError) return NextResponse.json({ error: gapError }, { status: 400 });

  const result = await completeParentClaim(admin, guard.studentId, {
    fullName, email, phone, relationship, childName, childGender, childAge, childDob, whatsappOptIn,
  });
  if (!result.ok) {
    await recordParentClaimAudit(admin, {
      studentId: guard.studentId,
      email,
      phone,
      action: 'completion_failed',
      note: `Approved direct claim did not complete: ${result.error}`,
      ip: getClientIp(request as any),
    });
    return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });
  }

  return NextResponse.json({
    success: true,
    childName: result.childName,
    accountCreated: !!result.accountCreated,
    siblingsLinked: result.siblingsLinked ?? 0,
    siblingNames: result.siblingNames ?? [],
    credentials: result.credentials ?? null,
    enrichment: result.enrichment ?? null,
  });
}
