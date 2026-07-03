import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { resolveStudentFromCode } from '@/lib/parent-claim/resolve';
import { provisionParentAndLinkChild, autoLinkSiblings } from '@/lib/parent-claim/provision';
import { ensureResultIntakeForm } from '@/lib/parent-claim/intake-form';
import { looseNameMatch } from '@/lib/parent-claim/name-match';
import { deliverParentLogin } from '@/lib/parents/deliver-login';
import { reconcileLeadWithCrm } from '@/lib/crm/reconcile-lead';
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
  const childName = String(body.childName ?? '').trim();

  if (!code) return NextResponse.json({ error: 'Missing code' }, { status: 400 });
  if (!fullName) return NextResponse.json({ error: 'Your full name is required' }, { status: 400 });
  if (!EMAIL_RE.test(email)) return NextResponse.json({ error: 'A valid email address is required' }, { status: 400 });
  if (!phone || phone.replace(/\D/g, '').length < 10) {
    return NextResponse.json({ error: 'A valid phone number is required' }, { status: 400 });
  }

  const admin = createAdminClient();

  const studentId = await resolveStudentFromCode(admin, code);
  if (!studentId) return NextResponse.json({ error: 'No student record matches this code.' }, { status: 404 });

  // Light sanity check: a DIRECT parent (Father/Mother) should roughly match the
  // child's name (lenient — first OR last name, small typos allowed, since kids' names
  // are often mis-spelled). A GUARDIAN just confirms their role and proceeds — no gate.
  const isDirectParent = ['father', 'mother'].includes((relationship ?? '').toLowerCase());
  if (isDirectParent && childName) {
    const { data: childRow } = await admin
      .from('portal_users').select('full_name').eq('id', studentId).maybeSingle();
    if (!looseNameMatch(childName, childRow?.full_name ?? '')) {
      return NextResponse.json(
        { error: 'That name doesn’t match this card. Please check the child’s name — or select “Guardian” if you’re not the parent.' },
        { status: 400 },
      );
    }
  }

  // ── Auto-provision the parent + link the scanned child ──────────────────────
  const prov = await provisionParentAndLinkChild(admin, { email, phone, fullName, relationship, studentId });
  if (!prov.ok || !prov.parentId) {
    return NextResponse.json({ error: prov.error ?? 'Could not link your account.' }, { status: prov.status ?? 500 });
  }

  // ── Auto-link siblings on file at the same school (with full parent info) ───
  const siblingNames = await autoLinkSiblings(admin, {
    parentId: prov.parentId, email, phone, fullName, relationship, schoolName: prov.schoolName ?? null, studentId,
  });

  // ── Record it the consent-form way + mine the parent into the CRM ───────────
  if (prov.schoolId) {
    try {
      const formId = await ensureResultIntakeForm(admin, prov.schoolId);
      if (formId) {
        // De-dup: one intake lead per child on this form (re-scans don't pile up).
        const { data: dupe } = await admin
          .from('form_leads').select('id')
          .eq('form_id', formId).eq('matched_student_id', studentId).maybeSingle();
        if (!dupe) {
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
          });
        }
        // Mine the parent into the CRM contact book + prospect + pipeline (same as consent).
        await reconcileLeadWithCrm(admin, {
          parentName: fullName, parentEmail: email, parentWhatsapp: phone ?? '',
          childName: prov.childName ?? '', childAge: '', childClass: '',
          programCategory: '', currentSchool: prov.schoolName ?? null,
          matchedSchoolId: prov.schoolId, schoolId: prov.schoolId,
          schoolName: prov.schoolName ?? 'Rillcod Technologies',
          formId, formTitle: 'Result Checker Intake',
        });
      }
    } catch (e) {
      console.error('[parent-claim/intake] CRM capture failed:', e);
    }
  }

  // ── Deliver the parent login on both channels (new accounts only) ───────────
  if (prov.accountCreated && prov.generatedPassword) {
    await deliverParentLogin({ email, phone, fullName, password: prov.generatedPassword, schoolName: prov.schoolName });
  }

  return NextResponse.json({
    success: true,
    childName: prov.childName,
    accountCreated: !!prov.accountCreated,
    siblingsLinked: siblingNames.length,
    siblingNames,
  });
}
