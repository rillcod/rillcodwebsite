import { NextRequest, NextResponse } from 'next/server';
import { extractCronSecret, isValidCronSecret } from '@/lib/server/cron-auth';
import { backgroundWorkPending } from '@/lib/server/background-work';

export const dynamic = 'force-dynamic';

/** No database read and no scheduler. Only queried by the gateway before idle shutdown. */
export function GET(request: NextRequest) {
  if (!isValidCronSecret(extractCronSecret(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return NextResponse.json({ pending: backgroundWorkPending() }, {
    headers: { 'cache-control': 'no-store' },
  });
}
