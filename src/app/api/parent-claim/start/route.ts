import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendWhatsApp } from '@/lib/whatsapp/send';
import { notificationsService } from '@/services/notifications.service';
import { resolveAndGuardChild } from '@/lib/parent-claim/complete';
import { generateOtp, hashOtp, otpExpiry, OTP_TTL_MINUTES } from '@/lib/parent-claim/otp';
import { checkCustomRateLimit, getClientIp } from '@/proxies/rateLimit.proxy';
import { RateLimitError } from '@/lib/errors';

export const dynamic = 'force-dynamic';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// POST /api/parent-claim/start
// Body: { code, fullName, email, phone, relationship?, childName? }
// Step 1 of the OTP gate: resolve + guard the child, store the claim context, and send a
// 6-digit code to the parent's email + WhatsApp. No account is created yet.
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

  const admin = createAdminClient();
  const guard = await resolveAndGuardChild(admin, code, { relationship, childName });
  if (!guard.studentId) return NextResponse.json({ error: guard.error }, { status: guard.status ?? 400 });

  const { data: student } = await admin
    .from('portal_users').select('full_name').eq('id', guard.studentId).maybeSingle();
  const scannedChildName = student?.full_name || 'your child';

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

  // Housekeeping (drop expired codes) + audit (code requested) — best-effort, non-blocking.
  (admin as any).from('parent_claim_otps').delete().lt('expires_at', new Date().toISOString()).then(() => {}).catch(() => {});
  (admin as any).from('parent_claim_audit')
    .insert({ student_id: guard.studentId, email, phone, action: 'code_sent', ip: getClientIp(request as any) })
    .then(() => {}).catch(() => {});

  const message =
    `Rillcod: your verification code is ${otp}. Enter it to view ${scannedChildName}'s results and link ` +
    `your parent account. It expires in ${OTP_TTL_MINUTES} minutes.`;

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
      fromName: 'Rillcod Technologies', fromEmail: 'support@rillcod.com',
    });
    emailSent = true;
  } catch (e) {
    console.error('[parent-claim/start] email failed:', e);
  }

  if (!whatsappSent && !emailSent) {
    return NextResponse.json({ error: 'Could not send the code by email or WhatsApp. Check your details.' }, { status: 502 });
  }

  return NextResponse.json({ claimId: claim.id, childName: scannedChildName, sentVia: { email: emailSent, whatsapp: whatsappSent } });
}
