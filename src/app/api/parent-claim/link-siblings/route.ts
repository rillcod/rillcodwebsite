import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { syncExplicitParentStudentLink } from '@/lib/parents/links';
import { checkCustomRateLimit, getClientIp } from '@/proxies/rateLimit.proxy';
import { RateLimitError } from '@/lib/errors';

export const dynamic = 'force-dynamic';

// POST /api/parent-claim/link-siblings
// Body: { claimId, studentRowIds: string[] }  (students.id values)
// Links the confirmed siblings to the just-verified parent. Only links students whose
// parent_email / parent_phone on file matches the verified claim — so a parent can
// never attach an unrelated child.
export async function POST(request: Request) {
  try {
    await checkCustomRateLimit({ key: `parent-claim-link:${getClientIp(request as any)}`, max: 15, window: 60 });
  } catch (err) {
    if (err instanceof RateLimitError) {
      return NextResponse.json({ error: 'Too many attempts. Please wait and try again.' }, { status: 429 });
    }
  }

  const body = await request.json().catch(() => ({}));
  const claimId = String(body.claimId ?? '').trim();
  const studentRowIds: string[] = Array.isArray(body.studentRowIds) ? body.studentRowIds.filter(Boolean) : [];
  if (!claimId || studentRowIds.length === 0) {
    return NextResponse.json({ error: 'Nothing to link' }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: claim } = await (admin as any)
    .from('parent_claim_otps').select('email, phone, verified').eq('id', claimId).maybeSingle();
  if (!claim || !claim.verified) {
    return NextResponse.json({ error: 'This session is not verified. Please verify again.' }, { status: 403 });
  }

  const { data: parent } = await (admin as any)
    .from('portal_users').select('id').eq('email', claim.email).eq('role', 'parent').maybeSingle();
  if (!parent?.id) return NextResponse.json({ error: 'Parent account not found.' }, { status: 404 });

  // Only accept students that genuinely carry this parent's contact on file.
  const { data: rows } = await (admin as any)
    .from('students')
    .select('id, parent_email, parent_phone')
    .in('id', studentRowIds);

  const email = String(claim.email).toLowerCase();
  const phone = claim.phone ? String(claim.phone) : null;
  let linked = 0;
  for (const s of (rows ?? []) as any[]) {
    const matches = (s.parent_email && String(s.parent_email).toLowerCase() === email)
      || (phone && s.parent_phone && String(s.parent_phone) === phone);
    if (!matches) continue;
    await (admin as any).from('students')
      .update({ parent_email: claim.email, parent_phone: claim.phone, updated_at: new Date().toISOString() })
      .eq('id', s.id);
    await syncExplicitParentStudentLink(admin as any, parent.id, s.id);
    linked++;
  }

  return NextResponse.json({ success: true, linked });
}
