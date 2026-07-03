import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendWhatsApp } from '@/lib/whatsapp/send';
import { notificationsService } from '@/services/notifications.service';
import { resolveStudentFromCode } from '@/lib/parent-claim/resolve';
import { provisionParentAndLinkChild, autoLinkSiblings } from '@/lib/parent-claim/provision';
import { ensureResultIntakeForm } from '@/lib/parent-claim/intake-form';
import { checkCustomRateLimit, getClientIp } from '@/proxies/rateLimit.proxy';
import { RateLimitError } from '@/lib/errors';

export const dynamic = 'force-dynamic';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// POST /api/parent-claim/intake
// Body: { code, fullName, email, phone, relationship? }
// Self-service: from a result/ID-card scan, auto-creates/links a parent account to the
// scanned child (+ siblings on file), records it the consent-form way (per-school intake
// lead), and delivers the login by email + WhatsApp. No staff step, no OTP.
export async function POST(request: Request) {
  try {
    await checkCustomRateLimit({ key: `parent-intake:${getClientIp(request as any)}`, max: 8, window: 60 });
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

  if (!code) return NextResponse.json({ error: 'Missing code' }, { status: 400 });
  if (!fullName) return NextResponse.json({ error: 'Your full name is required' }, { status: 400 });
  if (!EMAIL_RE.test(email)) return NextResponse.json({ error: 'A valid email address is required' }, { status: 400 });
  if (!phone || phone.replace(/\D/g, '').length < 10) {
    return NextResponse.json({ error: 'A valid phone number is required' }, { status: 400 });
  }

  const admin = createAdminClient();

  const studentId = await resolveStudentFromCode(admin, code);
  if (!studentId) return NextResponse.json({ error: 'No student record matches this code.' }, { status: 404 });

  // ── Auto-provision the parent + link the scanned child ──────────────────────
  const prov = await provisionParentAndLinkChild(admin, { email, phone, fullName, relationship, studentId });
  if (!prov.ok || !prov.parentId) {
    return NextResponse.json({ error: prov.error ?? 'Could not link your account.' }, { status: prov.status ?? 500 });
  }

  // ── Auto-link siblings on file at the same school ───────────────────────────
  const siblingNames = await autoLinkSiblings(admin, {
    parentId: prov.parentId, email, phone, schoolName: prov.schoolName ?? null, studentId,
  });

  // ── Record it the consent-form way (per-school intake lead) — best-effort ───
  if (prov.schoolId) {
    try {
      const formId = await ensureResultIntakeForm(admin, prov.schoolId);
      if (formId) {
        await admin.from('form_leads').insert({
          form_id: formId,
          school_id: prov.schoolId,
          email,
          response_data: {
            parent_name: fullName, parent_email: email, parent_whatsapp: phone,
            relationship, child_name: prov.childName, source: 'result_checker', _auto_linked: true,
          },
          matched_student_id: studentId,
          matched_parent_id: prov.parentId,
          match_status: 'approved',
          match_confidence: 'high',
          match_notes: 'Auto-linked via result/ID-card scan (exact child).',
        } as any);
      }
    } catch (e) {
      console.error('[parent-claim/intake] lead record failed:', e);
    }
  }

  // ── Deliver the parent login on both channels (new accounts only) ───────────
  if (prov.accountCreated && prov.generatedPassword) {
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://academy.rillcod.com').replace(/\/$/, '');
    const loginUrl = `${appUrl}/login?type=parent&email=${encodeURIComponent(email)}`;
    const waMsg = `Rillcod parent account created for ${fullName}.\nLogin: ${email}\nPassword: ${prov.generatedPassword}\nSign in: ${loginUrl}`;
    if (phone) await sendWhatsApp(phone, waMsg);
    try {
      await notificationsService.sendExternalEmail({
        to: email, subject: 'Your Rillcod parent account',
        html: `<div style="font-family:Arial,sans-serif;font-size:15px;color:#111;line-height:1.6">
          <p>Hello ${fullName}, your Rillcod parent account is ready and linked to your child.</p>
          <p><strong>Email:</strong> ${email}<br/><strong>Password:</strong> ${prov.generatedPassword}</p>
          <p><a href="${loginUrl}">Sign in to your parent portal</a></p>
          <p style="color:#666;font-size:13px">You can change your password after signing in.</p>
        </div>`,
        fromName: 'Rillcod Technologies', fromEmail: 'support@rillcod.com',
      });
    } catch (e) { console.error('[parent-claim/intake] credentials email failed:', e); }
  }

  return NextResponse.json({
    success: true,
    childName: prov.childName,
    accountCreated: !!prov.accountCreated,
    siblingsLinked: siblingNames.length,
    siblingNames,
  });
}
