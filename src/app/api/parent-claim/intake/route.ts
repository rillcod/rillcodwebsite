import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { resolveAndGuardChild, completeParentClaim } from '@/lib/parent-claim/complete';
import { checkCustomRateLimit, getClientIp } from '@/proxies/rateLimit.proxy';
import { RateLimitError } from '@/lib/errors';

export const dynamic = 'force-dynamic';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// POST /api/parent-claim/intake
// Frictionless (no OTP) self-service link — used when OTP is toggled off. Resolves the
// scanned child, runs the light name guard, then auto-provisions + links + records.
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
  const childGender = String(body.childGender ?? '').trim() || null;

  if (!code) return NextResponse.json({ error: 'Missing code' }, { status: 400 });
  if (!fullName) return NextResponse.json({ error: 'Your full name is required' }, { status: 400 });
  if (!EMAIL_RE.test(email)) return NextResponse.json({ error: 'A valid email address is required' }, { status: 400 });
  if (!phone || phone.replace(/\D/g, '').length < 10) {
    return NextResponse.json({ error: 'A valid phone number is required' }, { status: 400 });
  }

  const admin = createAdminClient();
  const guard = await resolveAndGuardChild(admin, code, { relationship, childName });
  if (!guard.studentId) return NextResponse.json({ error: guard.error }, { status: guard.status ?? 400 });

  const result = await completeParentClaim(admin, guard.studentId, { fullName, email, phone, relationship, childName, childGender });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });

  return NextResponse.json({
    success: true,
    childName: result.childName,
    accountCreated: !!result.accountCreated,
    siblingsLinked: result.siblingsLinked ?? 0,
    siblingNames: result.siblingNames ?? [],
    credentials: result.credentials ?? null,
    genderRecorded: !!result.genderRecorded,
  });
}
