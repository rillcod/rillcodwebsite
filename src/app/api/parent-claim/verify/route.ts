import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { completeParentClaim } from '@/lib/parent-claim/complete';
import { hashOtp, OTP_MAX_ATTEMPTS } from '@/lib/parent-claim/otp';
import { checkCustomRateLimit, getClientIp } from '@/proxies/rateLimit.proxy';
import { RateLimitError } from '@/lib/errors';
import { recordParentClaimAudit } from '@/lib/parent-claim/audit';

export const dynamic = 'force-dynamic';

// POST /api/parent-claim/verify
// Body: { claimId, otp }
// Step 2 of the OTP gate: verify the code, then run the SAME auto-provision the
// frictionless path uses (account + link + siblings + CRM + login).
export async function POST(request: Request) {
  try {
    await checkCustomRateLimit({ key: `parent-verify:${getClientIp(request as any)}`, max: 15, window: 60 });
  } catch (err) {
    if (err instanceof RateLimitError) {
      return NextResponse.json({ error: 'Too many attempts. Please wait and try again.' }, { status: 429 });
    }
    console.error('[parent-claim/verify] rate-limit check failed:', err);
    return NextResponse.json({ error: 'Verification is temporarily unavailable. Please try again.' }, { status: 503 });
  }

  const body = await request.json().catch(() => ({}));
  const claimId = String(body.claimId ?? '').trim();
  const otp = String(body.otp ?? '').trim();
  if (!claimId || !otp) return NextResponse.json({ error: 'Missing code' }, { status: 400 });

  const admin = createAdminClient();

  const { data: claim, error: claimError } = await (admin as any)
    .from('parent_claim_otps').select('*').eq('id', claimId).maybeSingle();
  if (claimError) {
    console.error('[parent-claim/verify] failed to load verification:', claimError);
    return NextResponse.json({ error: 'Could not verify this code. Please try again.' }, { status: 500 });
  }
  if (!claim) return NextResponse.json({ error: 'Verification not found. Please start again.' }, { status: 404 });
  if (claim.verified) return NextResponse.json({ error: 'This code was already used. Please start again.' }, { status: 409 });
  if (new Date(claim.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: 'This code has expired. Please request a new one.' }, { status: 400 });
  }
  if ((claim.attempts ?? 0) >= OTP_MAX_ATTEMPTS) {
    return NextResponse.json({ error: 'Too many wrong attempts. Please request a new code.' }, { status: 429 });
  }
  if (hashOtp(otp) !== claim.code_hash) {
    const { error: attemptError } = await (admin as any)
      .from('parent_claim_otps')
      .update({ attempts: (claim.attempts ?? 0) + 1 })
      .eq('id', claimId);
    if (attemptError) console.error('[parent-claim/verify] failed to record OTP attempt:', attemptError);
    await recordParentClaimAudit(admin, {
        studentId: claim.student_id, email: claim.email, phone: claim.phone,
        action: 'otp_failed',
        note: `Wrong OTP entered — attempt ${(claim.attempts ?? 0) + 1} of ${OTP_MAX_ATTEMPTS} — parent: ${claim.full_name ?? claim.email}`,
        ip: getClientIp(request as any),
      });
    const left = OTP_MAX_ATTEMPTS - (claim.attempts ?? 0) - 1;
    return NextResponse.json({ error: `Incorrect code.${left > 0 ? ` ${left} attempt${left !== 1 ? 's' : ''} left.` : ''}` }, { status: 400 });
  }

  // Atomically reserve this valid OTP before provisioning. A second request cannot
  // race the first into duplicate side effects, while a crashed reservation becomes
  // retryable after two minutes instead of locking the parent out permanently.
  const staleReservation = new Date(Date.now() - 2 * 60_000).toISOString();
  const { data: reservation, error: reservationError } = await (admin as any)
    .from('parent_claim_otps')
    .update({ processing_at: new Date().toISOString() })
    .eq('id', claimId)
    .eq('verified', false)
    .or(`processing_at.is.null,processing_at.lt.${staleReservation}`)
    .select('id')
    .maybeSingle();
  if (reservationError) {
    console.error('[parent-claim/verify] failed to reserve OTP:', reservationError);
    return NextResponse.json({ error: 'Could not verify this code. Please try again.' }, { status: 500 });
  }
  if (!reservation) {
    return NextResponse.json({ error: 'This verification is already being completed. Please wait a moment and try again.' }, { status: 409 });
  }

  const result = await completeParentClaim(admin, claim.student_id, {
    fullName: claim.full_name, email: claim.email, phone: claim.phone,
    relationship: claim.relationship, childName: claim.child_name ?? undefined,
    childGender: claim.child_gender ?? undefined,
    childAge: claim.child_age ?? undefined,
    childDob: claim.child_dob ?? undefined,
    whatsappOptIn: !!claim.whatsapp_opt_in,
  });
  if (!result.ok) {
    const { error: releaseError } = await (admin as any)
      .from('parent_claim_otps')
      .update({ processing_at: null })
      .eq('id', claimId)
      .eq('verified', false);
    if (releaseError) console.error('[parent-claim/verify] failed to release OTP reservation:', releaseError);
    await recordParentClaimAudit(admin, {
      studentId: claim.student_id,
      email: claim.email,
      phone: claim.phone,
      action: 'completion_failed',
      note: `OTP accepted, but account linking did not complete: ${result.error}`,
      ip: getClientIp(request as any),
    });
    return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });
  }

  // Consume the OTP only after provisioning succeeds. A temporary downstream failure
  // must not permanently lock a parent out of an otherwise valid claim.
  const { error: consumeError } = await (admin as any)
    .from('parent_claim_otps')
    .update({ verified: true, processing_at: null })
    .eq('id', claimId)
    .eq('verified', false);
  if (consumeError) console.error('[parent-claim/verify] failed to mark OTP consumed:', consumeError);

  await recordParentClaimAudit(admin, {
    studentId: claim.student_id,
    parentId: result.parentId,
    email: claim.email,
    phone: claim.phone,
    action: 'otp_verified',
    note: `OTP verified — parent: ${claim.full_name ?? claim.email} (${claim.relationship ?? 'Guardian'}) — child account linked`,
    ip: getClientIp(request as any),
  });

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
