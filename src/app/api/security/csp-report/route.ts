import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { RateLimitError } from '@/lib/errors';
import { checkCustomRateLimit, getClientIp } from '@/proxies/rateLimit.proxy';
import { parseCspObservation } from '@/lib/security/csp-report';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    await checkCustomRateLimit({
      key: `csp-report:${getClientIp(req)}`,
      max: 60,
      window: 60,
    });
  } catch (error) {
    if (!(error instanceof RateLimitError)) console.warn('[csp-report] rate check failed', error);
    return new NextResponse(null, { status: 204 });
  }

  const length = Number(req.headers.get('content-length') || 0);
  if (length > 32_768) return new NextResponse(null, { status: 204 });
  const payload = await req.json().catch(() => null);
  const observation = parseCspObservation(payload);
  if (!observation) return new NextResponse(null, { status: 204 });

  try {
    const db = createAdminClient() as any;
    const { error } = await db.from('security_observations').insert({
      kind: 'csp',
      ...observation,
      observed_at: new Date().toISOString(),
    });
    if (error) throw error;
  } catch (error) {
    // Rolling deploy: reporting must never break the page whose policy is being observed.
    console.warn('[csp-report] observation was not persisted', error);
  }
  return new NextResponse(null, { status: 204 });
}
