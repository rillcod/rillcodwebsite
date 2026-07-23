import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { resolveAndGuardChild } from '@/lib/parent-claim/complete';
import { createViewGrantToken, viewGrantCookieOptions } from '@/lib/parent-claim/view-grant';
import { checkCustomRateLimit, getClientIp } from '@/proxies/rateLimit.proxy';
import { RateLimitError } from '@/lib/errors';

export const dynamic = 'force-dynamic';

async function studentHasPublishedReports(admin: ReturnType<typeof createAdminClient>, studentUserId: string) {
  const { count, error } = await admin
    .from('student_progress_reports')
    .select('id', { count: 'exact', head: true })
    .eq('student_id', studentUserId)
    .eq('is_published', true);
  return !error && (count ?? 0) > 0;
}

/** POST /api/parent-claim/quick-view — parent self-service: RC number + child name only. */
export async function POST(request: Request) {
  try {
    await checkCustomRateLimit({ key: `parent-quick-view:${getClientIp(request as any)}`, max: 12, window: 60 });
  } catch (err) {
    if (err instanceof RateLimitError) {
      return NextResponse.json({ error: 'Too many attempts. Please wait a moment.' }, { status: 429 });
    }
  }

  const body = await request.json().catch(() => ({}));
  const code = String(body.code ?? '').trim();
  const childName = String(body.childName ?? '').trim();
  if (!code) return NextResponse.json({ error: 'Missing student number' }, { status: 400 });

  const admin = createAdminClient();
  const guard = await resolveAndGuardChild(admin, code, { relationship: 'Guardian', childName });
  if (!guard.studentId) {
    return NextResponse.json({ error: guard.error || 'Could not verify this student number.' }, { status: guard.status ?? 400 });
  }

  const hasReport = await studentHasPublishedReports(admin, guard.studentId);
  if (!hasReport) {
    return NextResponse.json(
      { error: 'No published result for this student number yet. Ask your school when results will be ready.' },
      { status: 404 },
    );
  }

  const token = createViewGrantToken(guard.studentId);
  const response = NextResponse.json({ success: true, viewUnlocked: true });
  response.cookies.set(viewGrantCookieOptions(token));
  return response;
}
