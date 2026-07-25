import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Retired: name-only quick-view issued a cookie that was never checked by the
 * reports route, so it could not unlock results. Parents must complete the
 * normal parent-claim flow on /result-check.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const code = String(body?.code ?? '').trim();
  const redirect = code
    ? `/result-check/${encodeURIComponent(code)}`
    : '/result-check';

  return NextResponse.json(
    {
      error: 'Quick view is no longer available. Complete parent setup on the result check page to unlock the report.',
      redirect,
    },
    { status: 410 },
  );
}
