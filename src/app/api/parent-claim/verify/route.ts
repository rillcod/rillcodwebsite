import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { completeParentClaim } from '@/lib/parent-claim/complete';
import { hashOtp, OTP_MAX_ATTEMPTS } from '@/lib/parent-claim/otp';
import { checkCustomRateLimit, getClientIp } from '@/proxies/rateLimit.proxy';
import { RateLimitError } from '@/lib/errors';

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
  }

  const body = await request.json().catch(() => ({}));
  const claimId = String(body.claimId ?? '').trim();
  const otp = String(body.otp ?? '').trim();
  if (!claimId || !otp) return NextResponse.json({ error: 'Missing code' }, { status: 400 });

  const admin = createAdminClient();

  const { data: claim } = await (admin as any)
    .from('parent_claim_otps').select('*').eq('id', claimId).maybeSingle();
  if (!claim) return NextResponse.json({ error: 'Verification not found. Please start again.' }, { status: 404 });
  if (claim.verified) return NextResponse.json({ error: 'This code was already used. Please start again.' }, { status: 409 });
  if (new Date(claim.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: 'This code has expired. Please request a new one.' }, { status: 400 });
  }
  if ((claim.attempts ?? 0) >= OTP_MAX_ATTEMPTS) {
    return NextResponse.json({ error: 'Too many wrong attempts. Please request a new code.' }, { status: 429 });
  }
  if (hashOtp(otp) !== claim.code_hash) {
    await (admin as any).from('parent_claim_otps').update({ attempts: (claim.attempts ?? 0) + 1 }).eq('id', claimId);
    const left = OTP_MAX_ATTEMPTS - (claim.attempts ?? 0) - 1;
    return NextResponse.json({ error: `Incorrect code.${left > 0 ? ` ${left} attempt${left !== 1 ? 's' : ''} left.` : ''}` }, { status: 400 });
  }

  // Mark used first so a valid code can't be replayed if provisioning is slow.
  await (admin as any).from('parent_claim_otps').update({ verified: true }).eq('id', claimId);

  const result = await completeParentClaim(admin, claim.student_id, {
    fullName: claim.full_name, email: claim.email, phone: claim.phone,
    relationship: claim.relationship, childName: claim.child_name ?? undefined,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });

  return NextResponse.json({
    success: true,
    childName: result.childName,
    accountCreated: !!result.accountCreated,
    siblingsLinked: result.siblingsLinked ?? 0,
    siblingNames: result.siblingNames ?? [],
  });
}
