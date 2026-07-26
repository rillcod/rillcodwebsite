import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { resolveAndGuardChild, completeParentClaim } from '@/lib/parent-claim/complete';
import { validateParentSuppliedRecordGaps } from '@/lib/parent-claim/record-enrichment';
import { resolveVerifiedGoogleEmail } from '@/lib/auth/google-identity';
import { checkCustomRateLimit, getClientIp } from '@/proxies/rateLimit.proxy';
import { RateLimitError } from '@/lib/errors';

export const dynamic = 'force-dynamic';

// POST /api/parent-claim/google/complete
// Third proof-of-email path for the claim form, alongside OTP (/verify) and the
// server-gated frictionless path (/intake). Google replaces ONLY the email
// verification step — the child guard, record-gap validation and provisioning all
// run through completeParentClaim exactly as the OTP path does.
//
// The parent's email is read from the authenticated Google session and is NOT
// accepted from the request body: a browser that could name its own email here
// could verify ownership of one address and claim a child under another.
export async function POST(request: Request) {
  try {
    await checkCustomRateLimit({ key: `parent-google-claim:${getClientIp(request as any)}`, max: 10, window: 60 });
  } catch (err) {
    if (err instanceof RateLimitError) {
      return NextResponse.json({ error: 'Too many attempts. Please wait and try again.' }, { status: 429 });
    }
  }

  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  const verified = resolveVerifiedGoogleEmail(user as never);
  if (!verified.ok) {
    return NextResponse.json({ error: verified.error, googleRequired: true }, { status: verified.status });
  }
  const email = verified.email;

  const body = await request.json().catch(() => ({}));
  const code = String(body.code ?? '').trim().toUpperCase();
  // Google supplies a name, but only as a fallback — the parent may well be a
  // guardian whose Google display name is not the name they want on the record.
  const fullName = String(body.fullName ?? '').trim() || (verified.fullName ?? '');
  const phone = String(body.phone ?? '').trim() || null;
  const relationship = String(body.relationship ?? '').trim() || null;
  const childName = String(body.childName ?? '').trim();
  const childGender = String(body.childGender ?? '').trim() || null;
  const childAge = String(body.childAge ?? '').trim() || null;
  const childDob = String(body.childDob ?? '').trim() || null;
  const whatsappOptIn = body.whatsappOptIn === true || body.whatsappOptIn === 'true';

  // Google authenticates the email and nothing else. Every other field the record
  // needs is still required, exactly as on the OTP path.
  if (!code) return NextResponse.json({ error: 'Missing code' }, { status: 400 });
  if (!fullName) return NextResponse.json({ error: 'Your full name is required' }, { status: 400 });
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

  (admin as any).from('parent_claim_audit')
    .insert({
      student_id: guard.studentId, email, phone,
      action: 'otp_verified',
      note: `Email ownership proven via Google — parent: ${fullName} (${relationship ?? 'Guardian'}) — proceeding to link child account`,
      ip: getClientIp(request as any),
    })
    .then(() => {}).catch(() => {});

  const result = await completeParentClaim(admin, guard.studentId, {
    fullName, email, phone, relationship, childName, childGender, childAge, childDob, whatsappOptIn,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });

  return NextResponse.json({
    success: true,
    childName: result.childName,
    accountCreated: !!result.accountCreated,
    siblingsLinked: result.siblingsLinked ?? 0,
    siblingNames: result.siblingNames ?? [],
    credentials: result.credentials ?? null,
    enrichment: result.enrichment ?? null,
    verifiedEmail: email,
  });
}
