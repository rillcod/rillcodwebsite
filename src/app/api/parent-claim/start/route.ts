import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendWhatsApp } from '@/lib/whatsapp/send';
import { notificationsService } from '@/services/notifications.service';
import { resolveAndGuardChild } from '@/lib/parent-claim/complete';
import { validateParentSuppliedRecordGaps } from '@/lib/parent-claim/record-enrichment';
import { generateOtp, hashOtp, otpExpiry, OTP_TTL_MINUTES } from '@/lib/parent-claim/otp';
import { checkCustomRateLimit, getClientIp } from '@/proxies/rateLimit.proxy';
import { RateLimitError } from '@/lib/errors';
import { SMTP_FROM_EMAIL } from '@/config/brand';

export const dynamic = 'force-dynamic';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// POST /api/parent-claim/start
// Body: { code, fullName, email, phone, relationship? }
// Step 1 of the OTP gate: resolve the child from the student number, store claim context,
// and send a 6-digit code to email (and WhatsApp when Meta API is approved). No account yet.
export async function POST(request: Request) {
  try {
    await checkCustomRateLimit({ key: `parent-start:${getClientIp(request as any)}`, max: 8, window: 60 });
  } catch (err) {
    if (err instanceof RateLimitError) {
      return NextResponse.json({ error: 'Too many attempts. Please wait a moment and try again.' }, { status: 429 });
    }
  }

  const body = await request.json().catch(() => ({}));
  const code = String(body.code ?? '').trim().toUpperCase();
  const fullName = String(body.fullName ?? '').trim();
  const email = String(body.email ?? '').trim().toLowerCase();
  const phone = String(body.phone ?? '').trim() || null;
  const relationship = String(body.relationship ?? '').trim() || null;
  const childName = String(body.childName ?? '').trim();
  const childGender = String(body.childGender ?? '').trim() || null;
  const childAgeRaw = String(body.childAge ?? '').trim();
  const childAge = childAgeRaw ? parseInt(childAgeRaw, 10) : null;
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

  // PRIVACY: never disclose the child's real name before OTP verification — email copy uses
  // "your child". The real name is returned only after /verify succeeds and linking completes.
  const scannedChildName = 'your child';

  // Anti-abuse: don't let the endpoint be used to email-bomb an address — cap codes
  // sent to the same email in a short window (in addition to the per-IP rate limit).
  const cutoff = new Date(Date.now() - 45_000).toISOString();
  const { count: recent } = await (admin as any)
    .from('parent_claim_otps')
    .select('id', { count: 'exact', head: true })
    .eq('email', email)
    .gte('created_at', cutoff);
  if ((recent ?? 0) >= 2) {
    return NextResponse.json({ error: 'A code was just sent. Please check your inbox/WhatsApp and wait a moment before requesting another.' }, { status: 429 });
  }

  const otp = generateOtp();
  // parent_claim_otps is created by migration but not yet in the generated types.
  const { data: claim, error: insErr } = await (admin as any)
    .from('parent_claim_otps')
    .insert({
      student_id: guard.studentId, full_name: fullName, email, phone, relationship,
      child_name: childName || null, child_gender: childGender,
      child_age: Number.isFinite(childAge) ? childAge : null,
      child_dob: childDob || null,
      whatsapp_opt_in: whatsappOptIn,
      code_hash: hashOtp(otp), expires_at: otpExpiry(),
    })
    .select('id')
    .single();
  if (insErr || !claim) {
    return NextResponse.json({ error: 'Could not start verification. Please try again.' }, { status: 500 });
  }

  // Housekeeping (drop expired codes) — best-effort, non-blocking.
  (admin as any).from('parent_claim_otps').delete().lt('expires_at', new Date().toISOString()).then(() => {}).catch(() => {});

  const message =
    `Rillcod: Your verification code is ${otp}. It expires in ${OTP_TTL_MINUTES} minutes.`;

  const whatsappSent = await sendWhatsApp(phone, message);
  let emailSent = false;
  try {
    await notificationsService.sendExternalEmail({
      to: email,
      subject: 'Your Rillcod verification code',
      html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#111;line-height:1.6">
        <p>Hello ${fullName},</p>
        <p>Your code to view <strong>${scannedChildName}</strong>'s results and link your parent account is:</p>
        <p style="font-size:28px;font-weight:800;letter-spacing:6px;margin:16px 0">${otp}</p>
        <p style="color:#666;font-size:13px">It expires in ${OTP_TTL_MINUTES} minutes. If you didn't request it, ignore this email.</p>
      </div>`,
      fromName: 'Rillcod Technologies', fromEmail: SMTP_FROM_EMAIL,
    });
    emailSent = true;
  } catch (e) {
    console.error('[parent-claim/start] email failed:', e);
  }

  // Audit: code sent — with human-readable note showing who initiated and via which channel.
  const sentChannels = [emailSent && 'email', whatsappSent && 'WhatsApp'].filter(Boolean).join(' + ') || 'none';
  (admin as any).from('parent_claim_audit')
    .insert({
      student_id: guard.studentId,
      email,
      phone,
      action: 'code_sent',
      ip: getClientIp(request as any),
      note: `Parent claim started — ${fullName} (${relationship ?? 'Guardian'}) — code sent via ${sentChannels}`,
    })
    .then(() => {}).catch(() => {});

  if (!whatsappSent && !emailSent) {
    return NextResponse.json({ error: 'Could not send the code to your email. Check your address and try again.' }, { status: 502 });
  }

  return NextResponse.json({
    claimId: claim.id,
    childName: scannedChildName,
    sentVia: { email: emailSent, whatsapp: whatsappSent },
    primaryChannel: emailSent ? 'email' : 'whatsapp',
  });
}
