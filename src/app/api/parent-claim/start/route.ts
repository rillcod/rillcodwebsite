import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendWhatsApp } from '@/lib/whatsapp/send';
import { notificationsService } from '@/services/notifications.service';
import { generateOtp, hashOtp, otpExpiry, OTP_TTL_MINUTES } from '@/lib/parent-claim/otp';
import { checkCustomRateLimit, getClientIp } from '@/proxies/rateLimit.proxy';
import { RateLimitError } from '@/lib/errors';

export const dynamic = 'force-dynamic';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// POST /api/parent-claim/start
// Body: { code, fullName, email, phone }
// Resolves the child from a report OR ID-card verification code, then sends a 6-digit
// code to the parent's email + WhatsApp to prove they own both. Returns a claimId.
export async function POST(request: Request) {
  try {
    await checkCustomRateLimit({ key: `parent-claim-start:${getClientIp(request as any)}`, max: 8, window: 60 });
  } catch (err) {
    if (err instanceof RateLimitError) {
      return NextResponse.json({ error: 'Too many attempts. Please wait a moment and try again.' }, { status: 429 });
    }
  }

  const body = await request.json().catch(() => ({}));
  const code = String(body.code ?? '').trim().toUpperCase();
  const fullName = String(body.fullName ?? '').trim();
  const email = String(body.email ?? '').trim().toLowerCase();
  const phone = String(body.phone ?? '').trim();

  if (!code) return NextResponse.json({ error: 'Missing code' }, { status: 400 });
  if (!fullName) return NextResponse.json({ error: 'Your full name is required' }, { status: 400 });
  if (!EMAIL_RE.test(email)) return NextResponse.json({ error: 'A valid email address is required' }, { status: 400 });
  if (!phone || phone.replace(/\D/g, '').length < 10) {
    return NextResponse.json({ error: 'A valid phone number is required' }, { status: 400 });
  }

  const admin = createAdminClient();

  // Resolve the child (portal_users.id) from a report code, then an ID-card code.
  let studentId: string | null = null;
  const { data: rep } = await (admin as any)
    .from('student_progress_reports').select('student_id').eq('verification_code', code).maybeSingle();
  if (rep?.student_id) studentId = rep.student_id;
  if (!studentId) {
    const { data: cardRow } = await (admin as any)
      .from('identity_cards').select('holder_id, holder_type').eq('verification_code', code).maybeSingle();
    if (cardRow?.holder_id && cardRow.holder_type === 'student') studentId = cardRow.holder_id;
  }
  if (!studentId) return NextResponse.json({ error: 'No student record matches this code.' }, { status: 404 });

  const { data: student } = await (admin as any)
    .from('portal_users').select('full_name, school_name').eq('id', studentId).maybeSingle();
  const childName = student?.full_name || 'your child';

  const otp = generateOtp();
  const { data: claim, error: insErr } = await (admin as any)
    .from('parent_claim_otps')
    .insert({ student_id: studentId, full_name: fullName, email, phone, code_hash: hashOtp(otp), expires_at: otpExpiry() })
    .select('id')
    .single();
  if (insErr || !claim) {
    return NextResponse.json({ error: 'Could not start verification. Please try again.' }, { status: 500 });
  }

  const message =
    `Rillcod: your verification code is ${otp}. ` +
    `Enter it to view ${childName}'s results and link your parent account. ` +
    `It expires in ${OTP_TTL_MINUTES} minutes.`;

  // WhatsApp (best-effort) + email, sent independently.
  const whatsappSent = await sendWhatsApp(phone, message);
  let emailSent = false;
  try {
    await notificationsService.sendExternalEmail({
      to: email,
      subject: 'Your Rillcod verification code',
      html: `<div style="font-family:Arial,sans-serif;font-size:15px;color:#111;line-height:1.6">
        <p>Hello ${fullName},</p>
        <p>Your verification code to view <strong>${childName}</strong>'s results and link your parent account is:</p>
        <p style="font-size:28px;font-weight:800;letter-spacing:6px;margin:16px 0">${otp}</p>
        <p style="color:#666;font-size:13px">This code expires in ${OTP_TTL_MINUTES} minutes. If you didn't request it, you can ignore this email.</p>
        <p style="color:#666;font-size:13px">— Rillcod Technologies</p>
      </div>`,
      fromName: 'Rillcod Technologies',
      fromEmail: 'support@rillcod.com',
    });
    emailSent = true;
  } catch (e) {
    console.error('[parent-claim/start] email failed:', e);
  }

  if (!whatsappSent && !emailSent) {
    return NextResponse.json({ error: 'Could not send the code by email or WhatsApp. Check your details.' }, { status: 502 });
  }

  // Mask destinations for display; never echo the code.
  return NextResponse.json({
    claimId: claim.id,
    childName,
    sentVia: { email: emailSent, whatsapp: whatsappSent },
  });
}
