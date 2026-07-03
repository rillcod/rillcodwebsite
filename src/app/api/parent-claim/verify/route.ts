import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendWhatsApp } from '@/lib/whatsapp/send';
import { notificationsService } from '@/services/notifications.service';
import { hashOtp, OTP_MAX_ATTEMPTS } from '@/lib/parent-claim/otp';
import { generateTempPassword } from '@/lib/utils/password';
import { syncExplicitParentStudentLink, resolveOrCreateStudentRowId } from '@/lib/parents/links';
import { checkCustomRateLimit, getClientIp } from '@/proxies/rateLimit.proxy';
import { RateLimitError } from '@/lib/errors';

export const dynamic = 'force-dynamic';

// POST /api/parent-claim/verify
// Body: { claimId, otp }
// Verifies the code, then creates/links a verified parent account, links the scanned
// child, and returns sibling candidates (same parent contact, same school) to link.
export async function POST(request: Request) {
  try {
    await checkCustomRateLimit({ key: `parent-claim-verify:${getClientIp(request as any)}`, max: 15, window: 60 });
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

  await (admin as any).from('parent_claim_otps').update({ verified: true }).eq('id', claimId);

  const email: string = claim.email;
  const phone: string | null = claim.phone ?? null;
  const fullName: string = claim.full_name;
  const studentId: string = claim.student_id; // portal_users.id of the scanned child

  // ── Find or create the (verified) parent account ────────────────────────────
  const { data: existing } = await (admin as any)
    .from('portal_users').select('id, role').eq('email', email).maybeSingle();
  if (existing && existing.role !== 'parent') {
    return NextResponse.json({ error: `This email is already registered as a ${existing.role} account.` }, { status: 409 });
  }

  let parentId: string;
  let generatedPassword: string | null = null;
  if (existing?.id) {
    parentId = existing.id;
    await (admin as any).from('portal_users')
      .update({ full_name: fullName, phone, is_active: true, updated_at: new Date().toISOString() })
      .eq('id', parentId);
  } else {
    generatedPassword = generateTempPassword();
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email, password: generatedPassword, email_confirm: true,
      user_metadata: { full_name: fullName, role: 'parent' },
    });
    if (createErr || !created?.user) {
      return NextResponse.json({ error: 'Could not create your parent account. Please try again.' }, { status: 500 });
    }
    parentId = created.user.id;
    await (admin as any).from('portal_users').upsert({
      id: parentId, email, full_name: fullName, phone, role: 'parent',
      is_active: true, updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });
  }

  // ── Link the scanned child ──────────────────────────────────────────────────
  const { data: childPU } = await (admin as any)
    .from('portal_users').select('full_name, school_id, school_name').eq('id', studentId).maybeSingle();
  const childRowId = await resolveOrCreateStudentRowId(admin as any, studentId);
  if (childRowId) {
    await (admin as any).from('students').update({
      parent_email: email, parent_name: fullName, parent_phone: phone, updated_at: new Date().toISOString(),
    }).eq('id', childRowId);
    await syncExplicitParentStudentLink(admin as any, parentId, childRowId);
  }

  // ── Discover sibling candidates: same parent contact on file, same school ─────
  // Separate typed filters (never string-interpolated into .or) then merge by id.
  const schoolName = childPU?.school_name ?? null;
  const cols = 'id, user_id, full_name, current_class, grade_level, school_name';
  const sibMap = new Map<string, any>();
  let q1 = (admin as any).from('students').select(cols).eq('parent_email', email);
  if (schoolName) q1 = q1.ilike('school_name', schoolName);
  const { data: byEmail } = await q1;
  for (const s of (byEmail ?? []) as any[]) sibMap.set(s.id, s);
  if (phone) {
    let q2 = (admin as any).from('students').select(cols).eq('parent_phone', phone);
    if (schoolName) q2 = q2.ilike('school_name', schoolName);
    const { data: byPhone } = await q2;
    for (const s of (byPhone ?? []) as any[]) sibMap.set(s.id, s);
  }
  // Exclude the scanned child and anything already linked to this parent.
  const { data: existingLinks } = await (admin as any)
    .from('parent_student_links').select('student_id').eq('parent_id', parentId);
  const linkedRowIds = new Set(((existingLinks ?? []) as any[]).map(l => l.student_id));
  const siblings = [...sibMap.values()]
    .filter(s => s.id !== childRowId && s.user_id !== studentId && !linkedRowIds.has(s.id))
    .map(s => ({ id: s.id, full_name: s.full_name, class: s.current_class || s.grade_level || null }));

  // ── Deliver the parent login on the verified channels (new accounts only) ────
  if (generatedPassword) {
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://academy.rillcod.com').replace(/\/$/, '');
    const loginUrl = `${appUrl}/login?type=parent&email=${encodeURIComponent(email)}`;
    const waMsg = `Rillcod parent account created for ${fullName}.\nLogin: ${email}\nPassword: ${generatedPassword}\nSign in: ${loginUrl}`;
    if (phone) await sendWhatsApp(phone, waMsg);
    try {
      await notificationsService.sendExternalEmail({
        to: email, subject: 'Your Rillcod parent account',
        html: `<div style="font-family:Arial,sans-serif;font-size:15px;color:#111;line-height:1.6">
          <p>Hello ${fullName}, your Rillcod parent account is ready.</p>
          <p><strong>Email:</strong> ${email}<br/><strong>Password:</strong> ${generatedPassword}</p>
          <p><a href="${loginUrl}">Sign in to your parent portal</a></p>
          <p style="color:#666;font-size:13px">You can change your password after signing in.</p>
        </div>`,
        fromName: 'Rillcod Technologies', fromEmail: 'support@rillcod.com',
      });
    } catch (e) { console.error('[parent-claim/verify] credentials email failed:', e); }
  }

  return NextResponse.json({
    success: true,
    parentId,
    childName: childPU?.full_name ?? null,
    accountCreated: !!generatedPassword,
    siblings,
  });
}
