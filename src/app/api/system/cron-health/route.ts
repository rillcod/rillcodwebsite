import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { extractCronSecret, isValidCronSecret } from '@/lib/server/cron-auth';
import {
  listCronOverdueBeyond2x,
  withRegisteredCronJobs,
} from '@/lib/operations/health-state';

export const dynamic = 'force-dynamic';

/**
 * Machine-readable cron liveness for uptime monitors and deploy smoke.
 *
 * Lives under /api/system (not /api/cron) so it is not mistaken for a scheduled
 * job in the cron registry. Returns 503 when any monitored job's last success
 * is older than 2× its registry interval (or never succeeded).
 *
 * Auth: same cron secret as /api/cron/* routes.
 */
async function handle(req: NextRequest) {
  const cronSecret = extractCronSecret(req);
  if (!isValidCronSecret(cronSecret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data, error } = await db.from('cron_job_health').select('*');
  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 },
    );
  }

  const rows = withRegisteredCronJobs(data ?? []);
  const scope = req.nextUrl.searchParams.get('scope');
  const overdue = listCronOverdueBeyond2x(
    rows,
    Date.now(),
    scope === 'external' ? { triggers: ['external'] } : undefined,
  );

  const body = {
    ok: overdue.length === 0,
    checked: rows.length,
    overdue,
    rule: 'last_success older than max(15m, 2× registry interval)',
  };

  return NextResponse.json(body, { status: overdue.length ? 503 : 200 });
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
